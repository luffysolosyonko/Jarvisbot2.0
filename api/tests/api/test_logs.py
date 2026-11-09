from __future__ import annotations

from fastapi.testclient import TestClient

from .conftest import FakeClock, auth
from .test_auth_and_errors import assert_error

HEADLINE = "5x 155lb 2x1x1xf bench"


def rows(body: dict) -> list[tuple]:  # type: ignore[type-arg]
    return [
        (s["good_reps"], s["failed_reps"], s["weight_lb"], s["matched_exercise"])
        for s in body["sets"]
    ]


def test_preview_splits_the_headline_line_without_saving(client: TestClient) -> None:
    h = auth("alice")
    r = client.post("/api/v1/parse", headers=h, json={"text": HEADLINE})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["kind"] == "workout" and body["warnings"] == []
    assert rows(body) == [
        (5, 0, 155.0, "bench"),
        (2, 0, 155.0, "bench"),
        (1, 0, 155.0, "bench"),
        (1, 0, 155.0, "bench"),
        (0, 1, 155.0, "bench"),
    ]
    assert client.get("/api/v1/logs", headers=h).json()["logs"] == []


def test_preview_flags_and_warnings(client: TestClient) -> None:
    text = "8x ?70/80kg squat\n10x uw dips\nwhat is this 123\n8x bench"
    body = client.post("/api/v1/parse", headers=auth("alice"), json={"text": text}).json()
    squat, dips, bench = body["sets"]
    assert squat["estimated"] and squat["weight_lb"] == 165.3
    assert dips["bodyweight"] and dips["weight_lb"] is None
    assert bench["weight_lb"] is None
    assert [w["line"] for w in body["warnings"]] == [3, 4]


def test_save_and_list(client: TestClient) -> None:
    h = auth("alice")
    r = client.post("/api/v1/logs", headers=h, json={"text": HEADLINE})
    assert r.status_code == 201, r.text
    saved = r.json()
    assert saved["kind"] == "workout" and len(saved["sets"]) == 5 and saved["raw_text"] == HEADLINE

    w = client.post("/api/v1/logs", headers=h, json={"text": "171.6 gym scale"}).json()
    assert w["kind"] == "weight" and w["weigh_in"] == {"weight_lb": 171.6, "note": "gym scale"}

    logs = client.get("/api/v1/logs", headers=h).json()["logs"]
    assert [lg["id"] for lg in logs] == [w["id"], saved["id"]]  # newest first


def test_nothing_parsed_is_not_saved(client: TestClient) -> None:
    h = auth("alice")
    assert_error(
        client.post("/api/v1/logs", headers=h, json={"text": "???"}), 422, "nothing_parsed"
    )
    assert_error(client.post("/api/v1/logs", headers=h, json={"text": ""}), 422, "invalid_request")
    assert client.get("/api/v1/logs", headers=h).json()["logs"] == []


def test_same_day_context_carries_between_logs(client: TestClient) -> None:
    h = auth("alice")
    client.post("/api/v1/logs", headers=h, json={"text": "8x 165lb bench"})
    second = client.post("/api/v1/logs", headers=h, json={"text": "8x 170lb\n2"}).json()
    assert [s["exercise"] for s in second["sets"]] == ["bench", "bench"]
    preview = client.post("/api/v1/parse", headers=h, json={"text": "3"}).json()
    assert rows(preview) == [(8, 0, 170.0, "bench")]


def test_user_settings_change_parsing(client: TestClient) -> None:
    h = auth("alice")
    client.patch("/api/v1/me/settings", headers=h, json={"set_unit": "kg", "bar_lb": 35})
    body = client.post(
        "/api/v1/parse", headers=h, json={"text": "8x 60 bench\n10x bar bench"}
    ).json()
    assert [s["weight_lb"] for s in body["sets"]] == [132.3, 35.0]


def test_matched_exercise_uses_known_names_and_aliases(client: TestClient) -> None:
    h = auth("alice")
    client.post("/api/v1/logs", headers=h, json={"text": "8x 135lb incline bench"})
    client.post("/api/v1/aliases", headers=h, json={"short": "sldl", "full": "stiff leg deadlift"})
    body = client.post(
        "/api/v1/parse", headers=h, json={"text": "8x 115lb inc bench\n8x 135lb sldl"}
    ).json()
    assert [s["matched_exercise"] for s in body["sets"]] == ["incline bench", "stiff leg deadlift"]


def test_log_range_validation(client: TestClient) -> None:
    h = auth("alice")
    r = client.get("/api/v1/logs?from=2026-03-10&to=2026-03-01", headers=h)
    assert_error(r, 422, "invalid_request")
    r = client.get("/api/v1/logs?from=2024-01-01&to=2026-03-01", headers=h)
    assert_error(r, 422, "invalid_request")


def test_parse_is_rate_limited_per_user(client: TestClient, clock: FakeClock) -> None:
    for _ in range(60):
        assert (
            client.post(
                "/api/v1/parse", headers=auth("alice"), json={"text": "8x 1lb a"}
            ).status_code
            == 200
        )
    r = client.post("/api/v1/parse", headers=auth("alice"), json={"text": "8x 1lb a"})
    assert_error(r, 429, "rate_limited")
    assert int(r.headers["Retry-After"]) >= 1
    # other users have their own budget, and the window slides
    assert (
        client.post("/api/v1/parse", headers=auth("bob"), json={"text": "8x 1lb a"}).status_code
        == 200
    )
    clock.t += 61
    assert (
        client.post("/api/v1/parse", headers=auth("alice"), json={"text": "8x 1lb a"}).status_code
        == 200
    )


def test_aliases_crud(client: TestClient) -> None:
    h = auth("alice")
    r = client.post("/api/v1/aliases", headers=h, json={"short": "OA", "full": "one arm"})
    assert r.status_code == 201 and r.json()["short"] == "oa"
    assert_error(
        client.post("/api/v1/aliases", headers=h, json={"short": "oa", "full": "other"}),
        409,
        "conflict",
    )
    assert_error(
        client.post("/api/v1/aliases", headers=h, json={"short": "a;b", "full": "x"}),
        422,
        "invalid_request",
    )
    alias_id = r.json()["id"]
    assert [a["short"] for a in client.get("/api/v1/aliases", headers=h).json()["aliases"]] == [
        "oa"
    ]
    assert client.delete(f"/api/v1/aliases/{alias_id}", headers=h).status_code == 204
    assert_error(client.delete(f"/api/v1/aliases/{alias_id}", headers=h), 404, "not_found")
