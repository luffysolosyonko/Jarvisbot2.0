"""Dashboard, exercises and forecasts over the made-up demo history."""

from __future__ import annotations

from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from jarvis_api.models import LoggedSet, WeighIn
from jarvis_api.seed import WEEKS, build_history, reset_demo

from .conftest import DEMO_UID, auth
from .test_auth_and_errors import assert_error

TZ = "America/Chicago"


@pytest.fixture
def seeded(db: Session) -> date:
    today = datetime.now(ZoneInfo(TZ)).date()
    reset_demo(db, DEMO_UID, TZ, today)
    return today


def test_history_shape() -> None:
    today = date(2026, 6, 10)
    entries = build_history(today)
    weigh = [
        e
        for e in entries
        if (e.text[0].isdigit() and "x" not in e.text.split()[0]) or e.text.startswith("w ")
    ]
    weeks = WEEKS + 1
    assert 4 * WEEKS <= len(weigh) <= 5.5 * weeks  # 4-5 a week
    assert weigh[-1].at.date() == today
    workouts = [e for e in entries if e not in weigh]
    assert max(e.at.date() for e in workouts) < today
    text = "\n".join(e.text for e in workouts)
    for needle in ("bench", "squat", "deadlift", "ohp", "bb row", "1f", "2x1xf", "^", "each hand"):
        assert needle in text, needle
    assert build_history(today) == entries  # deterministic


def test_seed_is_repeatable_and_realistic(client: TestClient, db: Session, seeded: date) -> None:
    n_sets = db.scalar(select(func.count()).select_from(LoggedSet))
    reset_demo(db, DEMO_UID, TZ, seeded)  # a second reset replaces, not duplicates
    assert db.scalar(select(func.count()).select_from(LoggedSet)) == n_sets
    assert db.scalar(select(func.sum(LoggedSet.failed_reps))) >= 3
    assert db.scalar(select(func.count()).select_from(WeighIn)) >= 4 * WEEKS

    me = client.get("/api/v1/me", headers=auth(DEMO_UID)).json()
    assert me["is_demo"] and me["settings"]["tz_name"] == TZ
    names = {
        e["exercise"]
        for e in client.get("/api/v1/exercises", headers=auth(DEMO_UID)).json()["exercises"]
    }
    assert {"bench", "squat", "deadlift", "overhead press", "barbell row", "lateral raise"} <= names
    assert "lat raise" not in names  # merged by the demo alias


def test_dashboard(client: TestClient, seeded: date) -> None:
    d = client.get("/api/v1/dashboard", headers=auth(DEMO_UID)).json()
    assert d["today"]["date"] == seeded.isoformat()
    assert d["today"]["weight_lb"] is not None and d["today"]["sets"] == 0
    assert len(d["weekly"]) == 8 and d["week"]["sets"] > 0
    deload = min(d["weekly"], key=lambda w: w["volume_lb"])
    assert deload["volume_lb"] < max(w["volume_lb"] for w in d["weekly"]) * 0.9
    w = d["weight"]
    assert len(w["points"]) >= 40 and len(w["average_7d"]) >= 30
    proj = w["projection"]
    assert -1.0 < proj["slope_per_week"] < 0  # trending slightly down
    assert proj["low"] < proj["pred"] < proj["high"] and len(proj["line"]) == 2
    tops = [t["exercise"] for t in d["top_lifts"]]
    assert "bench" in tops and all(t["e1rm_change"] > 0 for t in d["top_lifts"])


def test_exercise_detail_and_forecast(client: TestClient, seeded: date) -> None:
    h = auth(DEMO_UID)
    r = client.get("/api/v1/exercises/Bench", headers=h)  # case-insensitive
    assert r.status_code == 200, r.text
    bench = r.json()
    assert len(bench["sessions"]) >= 8
    assert [t["reps"] for t in bench["rep_targets"]] == [1, 3, 5, 8, 10, 12]
    assert bench["best_set"]["e1rm"] >= bench["sessions"][0]["value"]
    assert bench["forecast"]["projection"]["slope_per_week"] > 0
    assert bench["last_session"]

    f = client.get("/api/v1/exercises/bench/forecast?target=225&days=28", headers=h).json()
    assert f["reach"] == "date" and f["reach_date"] > seeded.isoformat()
    f = client.get("/api/v1/exercises/bench/forecast?target=100", headers=h).json()
    assert f["reach"] == "already" and f["reach_date"] is None
    assert_error(
        client.get("/api/v1/exercises/bench/forecast?target=-5", headers=h), 422, "invalid_request"
    )
    assert_error(client.get("/api/v1/exercises/curling/forecast", headers=h), 404, "not_found")

    wf = client.get("/api/v1/weight/forecast?days=14", headers=h).json()
    assert wf["weigh_ins"] >= 40 and wf["projection"]["slope_per_week"] < 0


def test_logging_the_headline_line_updates_the_bench_forecast(
    client: TestClient, seeded: date
) -> None:
    """The reviewer path: log a rest-pause bench set, see the forecast move."""
    h = auth(DEMO_UID)
    before = client.get("/api/v1/exercises/bench/forecast?target=225", headers=h).json()
    saved = client.post("/api/v1/logs", headers=h, json={"text": "5x 155lb 2x1x1xf bench"})
    assert saved.status_code == 201 and len(saved.json()["sets"]) == 5
    after = client.get("/api/v1/exercises/bench/forecast?target=225", headers=h).json()
    assert after["projection"]["last_date"] == seeded.isoformat()
    assert after["projection"]["points"] == before["projection"]["points"] + 1
    assert after["projection"]["pred"] != before["projection"]["pred"]
    assert after["best_e1rm"] >= before["best_e1rm"]  # 155x5 is a new best for the demo
    dash = client.get("/api/v1/dashboard", headers=h).json()
    assert dash["today"]["sets"] == 5 and dash["today"]["exercises"] == ["bench"]


def test_not_enough_data_for_a_forecast(client: TestClient) -> None:
    h = auth("alice")
    client.post("/api/v1/logs", headers=h, json={"text": "8x 135lb bench"})
    assert_error(client.get("/api/v1/exercises/bench/forecast", headers=h), 422, "not_enough_data")
    detail = client.get("/api/v1/exercises/bench", headers=h).json()
    assert detail["forecast"] is None and len(detail["sessions"]) == 1
    assert client.get("/api/v1/weight/forecast", headers=h).json()["projection"] is None


def test_timezone_sets_local_date(client: TestClient) -> None:
    h = auth("alice")
    client.patch("/api/v1/me/settings", headers=h, json={"tz_name": "Pacific/Kiritimati"})
    log = client.post("/api/v1/logs", headers=h, json={"text": "171.6"}).json()
    expected = datetime.now(UTC).astimezone(ZoneInfo("Pacific/Kiritimati")).date()
    assert log["local_date"] == expected.isoformat()
