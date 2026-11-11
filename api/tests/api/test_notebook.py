"""The notebook endpoints: modes, fixes, edit/delete, the tools and the calendar."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi.testclient import TestClient
from sqlalchemy import Engine

from jarvis_api.config import Settings

from .conftest import auth
from .test_ask import FakeProvider, make_client
from .test_auth_and_errors import assert_error

API = "/api/v1"


def post(client: TestClient, uid: str, text: str, mode: str | None = None) -> dict:  # type: ignore[type-arg]
    body = {"text": text} | ({"mode": mode} if mode else {})
    r = client.post(f"{API}/logs", headers=auth(uid), json=body)
    assert r.status_code == 201, r.text
    return r.json()  # type: ignore[no-any-return]


def parse(client: TestClient, text: str, mode: str | None = None) -> dict:  # type: ignore[type-arg]
    body = {"text": text} | ({"mode": mode} if mode else {})
    r = client.post(f"{API}/parse", headers=auth("alice"), json=body)
    assert r.status_code == 200, r.text
    return r.json()  # type: ignore[no-any-return]


# --- modes -------------------------------------------------------------------
def test_weight_mode_ignores_set_lines(client: TestClient) -> None:
    body = parse(client, "8x 135lb bench", mode="weight")
    assert body["kind"] == "weight" and body["sets"] == [] and body["weigh_in"] is None
    assert body["warnings"][0]["code"] == "no_weigh_in"
    assert {"label": "Log as a workout", "mode": "workout"}.items() <= body["warnings"][0]["fixes"][
        0
    ].items()


def test_workout_mode_ignores_bare_weigh_ins_and_offers_to_switch(client: TestClient) -> None:
    body = parse(client, "83.9kg", mode="workout")
    assert body["kind"] == "workout" and body["weigh_in"] is None and body["sets"] == []
    fix = body["warnings"][0]["fixes"][0]
    assert fix["label"] == "Log as a weigh-in" and fix["mode"] == "weight"


def test_mode_is_saved_and_kind_still_works(client: TestClient) -> None:
    assert post(client, "alice", "83.9kg", mode="weight")["weigh_in"]["weight_lb"] == 185.0
    r = client.post(f"{API}/logs", headers=auth("alice"), json={"text": "182", "kind": "weight"})
    assert r.status_code == 201 and r.json()["kind"] == "weight"


# --- warnings and fixes --------------------------------------------------------
def test_missing_weight_offers_units_estimate_bodyweight_and_bar(client: TestClient) -> None:
    w = parse(client, "8x bench")["warnings"][0]
    assert w["code"] == "no_weight" and w["line"] == 1
    by_label = {f["label"]: f for f in w["fixes"]}
    assert by_label["Add weight in lbs"]["template"] == "8x {}lbs bench"
    assert by_label["Mark as estimate"]["template"] == "8x ?{}lbs bench"
    assert by_label["Bodyweight (uw)"]["text"] == "8x uw bench"
    assert by_label["Empty bar"]["text"] == "8x bar bench"


def test_missing_name_suggests_recent_exercises(client: TestClient) -> None:
    post(client, "alice", "5x 225lb squat")
    w = parse(client, "8x 135lb")["warnings"]
    # earlier sets today carry the name over, so ask on a fresh user instead
    assert w == [] or w[0]["code"] == "no_exercise"
    w2 = client.post(f"{API}/parse", headers=auth("bob"), json={"text": "8x 135lb"}).json()
    fixes = w2["warnings"][0]["fixes"]
    assert fixes[0]["label"] == "Set exercise name" and fixes[0]["template"] == "8x 135lb {}"


def test_unit_fixes_for_a_line_without_x(client: TestClient) -> None:
    w = parse(client, "8 135 bench")["warnings"][0]
    texts = {f["label"]: f["text"] for f in w["fixes"]}
    assert texts["Add unit: lbs"] == "8x 135lbs bench"
    assert texts["Add unit: kg"] == "8x 135kg bench"
    assert texts["Remove this line"] == ""
    assert parse(client, texts["Add unit: lbs"])["warnings"] == []


def test_weight_for_reps_line_is_rewritten(client: TestClient) -> None:
    w = parse(client, "8x 135lb bench\n225 for 5 squat", mode="workout")["warnings"][0]
    assert w["line"] == 2
    texts = {f["label"]: f["text"] for f in w["fixes"]}
    assert texts["Add unit: lbs"] == "5x 225lbs squat"


def test_name_first_line_can_be_reordered(client: TestClient) -> None:
    w = parse(client, "bench 8x 135lb", mode="workout")["warnings"][0]
    fix = next(f for f in w["fixes"] if f["label"] == "Move the name to the end")
    assert fix["text"] == "8x 135lb bench"


def test_preview_marks_new_exercises(client: TestClient) -> None:
    post(client, "alice", "5x 135lb bench press")
    ex = parse(client, "5x 140lb bp\n8x 50lb zercher squat")["exercises"]
    assert {e["written"]: (e["matched"], e["is_new"]) for e in ex} == {
        "bp": ("bench press", False),
        "zercher squat": ("zercher squat", True),
    }


def test_saved_logs_keep_their_unparsed_lines(client: TestClient) -> None:
    post(client, "alice", "8x 135lb bench\n8 reps ???")
    log = client.get(f"{API}/logs", headers=auth("alice")).json()["logs"][0]
    assert [(w["line"], w["code"]) for w in log["warnings"]] == [(2, "not_understood")]
    assert log["warnings"][0]["fixes"][-1]["label"] == "Remove this line"


# --- edit and delete -------------------------------------------------------------
def test_edit_reparses_and_carries_names_to_later_logs(client: TestClient) -> None:
    h = auth("alice")
    first = post(client, "alice", "5x 135lb bench")
    second = post(client, "alice", "8x 115lb")  # unnamed: inherits "bench"
    assert second["sets"][0]["exercise"] == "bench"

    r = client.patch(f"{API}/logs/{first['id']}", headers=h, json={"text": "5x 225lb squat"})
    assert r.status_code == 200, r.text
    assert r.json()["sets"][0]["weight_lb"] == 225.0 and r.json()["raw_text"] == "5x 225lb squat"
    logs = {lg["id"]: lg for lg in client.get(f"{API}/logs", headers=h).json()["logs"]}
    assert logs[second["id"]]["sets"][0]["exercise"] == "squat"


def test_edit_that_parses_to_nothing_is_rejected_and_changes_nothing(client: TestClient) -> None:
    log = post(client, "alice", "5x 135lb bench")
    r = client.patch(f"{API}/logs/{log['id']}", headers=auth("alice"), json={"text": "hello"})
    assert_error(r, 422, "nothing_parsed")
    assert client.get(f"{API}/logs", headers=auth("alice")).json()["logs"][0]["raw_text"] == (
        "5x 135lb bench"
    )


def test_edit_can_switch_mode(client: TestClient) -> None:
    log = post(client, "alice", "182.4", mode="weight")
    r = client.patch(
        f"{API}/logs/{log['id']}",
        headers=auth("alice"),
        json={"text": "8x uw dips", "mode": "workout"},
    )
    assert r.status_code == 200 and r.json()["kind"] == "workout" and r.json()["weigh_in"] is None


def test_delete_and_other_users_cannot_touch(client: TestClient) -> None:
    log = post(client, "alice", "5x 135lb bench")
    assert_error(client.delete(f"{API}/logs/{log['id']}", headers=auth("bob")), 404, "not_found")
    assert_error(
        client.patch(f"{API}/logs/{log['id']}", headers=auth("bob"), json={"text": "1x 1lb x"}),
        404,
        "not_found",
    )
    assert client.delete(f"{API}/logs/{log['id']}", headers=auth("alice")).status_code == 204
    assert client.get(f"{API}/logs", headers=auth("alice")).json()["logs"] == []


# --- tools ---------------------------------------------------------------------
def test_stats(client: TestClient) -> None:
    h = auth("alice")
    post(client, "alice", "5x 100lb bench\n5x 100lb bench\n10x 50lb row")
    post(client, "alice", "182.4", mode="weight")
    stats = client.get(f"{API}/stats?days=30", headers=h).json()
    assert stats["gym_days"] == 1 and stats["sets"] == 3 and stats["volume_lb"] == 1500.0
    assert stats["weight_end_lb"] == 182.4 and stats["weight_change_lb"] is None


def test_calendar_marks_days_and_validates_month(client: TestClient) -> None:
    h = auth("alice")
    post(client, "alice", "5x 100lb bench")
    post(client, "alice", "182.4", mode="weight")
    month = datetime.now(UTC).strftime("%Y-%m")
    cal = client.get(f"{API}/calendar?month={month}", headers=h).json()
    assert cal["month"] == month and cal["workouts"] == 1 and cal["sets"] == 1
    marked = [d for d in cal["days"] if d["has_workout"] or d["has_weight"]]
    assert len(marked) == 1 and marked[0]["has_workout"] and marked[0]["has_weight"]
    assert marked[0]["volume_lb"] == 500.0 and marked[0]["weight_lb"] == 182.4
    assert len(cal["days"]) >= 28

    empty = client.get(f"{API}/calendar?month=2020-02", headers=h).json()
    assert len(empty["days"]) == 29 and empty["workouts"] == 0
    assert_error(client.get(f"{API}/calendar?month=2020-13", headers=h), 422, "invalid_request")
    assert_error(client.get(f"{API}/calendar?month=feb", headers=h), 422, "invalid_request")


def test_calendar_is_per_user(client: TestClient) -> None:
    post(client, "alice", "5x 100lb bench")
    month = datetime.now(UTC).strftime("%Y-%m")
    cal = client.get(f"{API}/calendar?month={month}", headers=auth("bob")).json()
    assert cal["workouts"] == 0


def test_search_matches_text_and_exercise(client: TestClient) -> None:
    post(client, "alice", "5x 100lb bench press")
    post(client, "alice", "182.4 after dinner", mode="weight")
    post(client, "bob", "5x 100lb bench press")
    h = auth("alice")
    assert len(client.get(f"{API}/search?q=BENCH", headers=h).json()["logs"]) == 1
    assert len(client.get(f"{API}/search?q=dinner", headers=h).json()["logs"]) == 1
    assert client.get(f"{API}/search?q=squat", headers=h).json()["logs"] == []


def test_export_csv(client: TestClient) -> None:
    post(client, "alice", "5x 100lb bench")
    post(client, "alice", "182.4", mode="weight")
    h = auth("alice")
    r = client.get(f"{API}/export/all.csv", headers=h)
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    lines = r.text.strip().splitlines()
    assert lines[0].startswith("date,time,kind,exercise,reps")
    assert ",workout,bench,5,5,0,100.0," in lines[1]
    assert ",weight,,,,,182.4," in lines[2]


# --- logging never calls the LLM -------------------------------------------------
def test_logging_makes_zero_llm_calls(settings: Settings, engine: Engine) -> None:
    provider = FakeProvider()
    client = make_client(settings, engine, provider)
    h = auth("alice")
    client.post(f"{API}/parse", headers=h, json={"text": "5x 155lb 2x1x1xf bench"})
    log = client.post(f"{API}/logs", headers=h, json={"text": "5x 155lb bench", "mode": "workout"})
    client.post(f"{API}/logs", headers=h, json={"text": "83.9kg", "mode": "weight"})
    client.patch(f"{API}/logs/{log.json()['id']}", headers=h, json={"text": "5x 160lb bench"})
    client.get(f"{API}/logs", headers=h)
    client.get(f"{API}/stats", headers=h)
    client.delete(f"{API}/logs/{log.json()['id']}", headers=h)
    assert provider.calls == []

    client.post(f"{API}/ask", headers=h, json={"question": "Is my bench going up?"})
    assert len(provider.calls) == 1  # only Ask does


def test_usage_counts_ask_tokens(settings: Settings, engine: Engine) -> None:
    client = make_client(settings, engine, FakeProvider())
    h = auth("alice")
    assert client.get(f"{API}/usage", headers=h).json()["today"] == 0
    client.post(f"{API}/ask", headers=h, json={"question": "Is my bench going up?"})
    u = client.get(f"{API}/usage", headers=h).json()
    assert u["today"] == u["week"] == u["month"] == 1280 and u["questions_month"] == 1
    assert u["daily_token_cap"] == settings.ask_daily_token_cap


def test_alias_matches_list_names_counted_under_another(client: TestClient) -> None:
    post(client, "alice", "5x 135lb bench press\n5x 135lb bench press")
    post(client, "alice", "5x 140lb bp")
    h = auth("alice")
    matches = client.get(f"{API}/aliases/matches", headers=h).json()["matches"]
    assert matches == [{"written": "bp", "matched": "bench press", "sets": 1}]
    client.post(f"{API}/aliases", headers=h, json={"short": "sldl", "full": "stiff leg deadlift"})
    post(client, "alice", "8x 95lb sldl")
    written = {
        m["written"]: m["matched"]
        for m in client.get(f"{API}/aliases/matches", headers=h).json()["matches"]
    }
    assert written["sldl"] == "stiff leg deadlift"
    assert client.get(f"{API}/aliases/matches", headers=auth("bob")).json()["matches"] == []


def test_display_name_can_be_set_and_cleared(client: TestClient) -> None:
    h = auth("alice")
    r = client.patch(f"{API}/me/settings", headers=h, json={"display_name": "  Thomas   Lee "})
    assert r.status_code == 200 and r.json()["display_name"] == "Thomas Lee"
    assert client.get(f"{API}/me", headers=h).json()["display_name"] == "Thomas Lee"
    assert client.get(f"{API}/me", headers=auth("bob")).json()["display_name"] != "Thomas Lee"
    cleared = client.patch(f"{API}/me/settings", headers=h, json={"display_name": "   "}).json()
    assert cleared["display_name"] is None
    too_long = client.patch(f"{API}/me/settings", headers=h, json={"display_name": "x" * 61})
    assert_error(too_long, 422, "invalid_request")
