"""Edge cases found by probing: absurd set weights, search wildcards, CSV formulas."""

from __future__ import annotations

import csv
import io

from fastapi.testclient import TestClient

from .conftest import auth
from .test_auth_and_errors import assert_error


def post(client: TestClient, text: str, mode: str = "workout"):  # type: ignore[no-untyped-def]
    return client.post("/api/v1/logs", headers=auth("alice"), json={"text": text, "mode": mode})


def test_a_set_heavier_than_1500_lb_is_a_typo_not_a_lift(client: TestClient) -> None:
    assert_error(post(client, "8x 99999lb bench"), 422, "nothing_parsed")
    assert_error(post(client, "5x 700kg leg press"), 422, "nothing_parsed")  # 1543 lb
    assert post(client, "5x 1500lb leg press").status_code == 201
    # The typo line is left out; the real set on the next line still saves.
    r = post(client, "8x 135lb bench\n8x 13500lb bench")
    assert r.status_code == 201 and [s["weight_lb"] for s in r.json()["sets"]] == [135]


def test_search_treats_percent_and_underscore_as_text(client: TestClient) -> None:
    post(client, "8x 135lb bench")
    post(client, "8x 50lb curl 100% effort")
    h = auth("alice")
    found = client.get("/api/v1/search", headers=h, params={"q": "%"}).json()["logs"]
    assert [lg["raw_text"] for lg in found] == ["8x 50lb curl 100% effort"]
    assert client.get("/api/v1/search", headers=h, params={"q": "_"}).json()["logs"] == []
    assert_error(
        client.get("/api/v1/search", headers=h, params={"q": "   "}), 422, "invalid_request"
    )


def test_exported_text_never_runs_as_a_spreadsheet_formula(client: TestClient) -> None:
    post(client, '181 =HYPERLINK("http://example.com")', "weight")
    post(client, "180.4 @SUM(1)", "weight")
    h = auth("alice")
    for path in ["/api/v1/export/all.csv", "/api/v1/export/weighins.csv"]:
        cells = [
            c for row in csv.reader(io.StringIO(client.get(path, headers=h).text)) for c in row
        ]
        assert not [c for c in cells if c[:1] in ("=", "+", "@")], path
        assert any(c.startswith("'=HYPERLINK") for c in cells), path


def test_long_names_and_weights_fit_the_database(client: TestClient) -> None:
    # Postgres refuses strings longer than the column (SQLite in tests doesn't),
    # so the parser caps them: exercise names 120, the weight as written 60.
    r = post(client, "8x 100lb " + "verylongexercisename" * 12)
    assert r.status_code == 201
    assert len(r.json()["sets"][0]["exercise"]) <= 120
    r = post(client, "8x 100." + "0" * 80 + "1lb bench")
    assert r.status_code == 201
    assert len(r.json()["sets"][0]["weight_text"]) <= 60


def test_an_unexpected_error_is_json_the_browser_can_read(client: TestClient) -> None:
    app = client.app

    @app.get("/api/v1/boom")  # type: ignore[attr-defined, untyped-decorator]
    def boom() -> None:
        raise RuntimeError("boom")

    r = client.get("/api/v1/boom", headers={"Origin": "http://localhost:5173"})
    assert r.status_code == 500 and r.json()["error"]["code"] == "internal"
    assert r.headers.get("access-control-allow-origin") == "http://localhost:5173"
