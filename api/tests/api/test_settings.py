"""Settings: the weigh-in check threshold, data counts, export, import, deleting an account."""

from __future__ import annotations

import csv
import io
import sqlite3
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import Engine, func, select
from sqlalchemy.orm import Session

from jarvis_api.models import Alias, Log, User

from .conftest import DEMO_UID, FakeAccounts, auth
from .test_auth_and_errors import assert_error


def log(client: TestClient, user: str, text: str, mode: str = "workout") -> dict:
    r = client.post("/api/v1/logs", headers=auth(user), json={"text": text, "mode": mode})
    assert r.status_code == 201, r.text
    return r.json()


def test_weigh_in_check_threshold_is_a_setting_used_by_the_check(client: TestClient) -> None:
    h = auth("alice")
    assert client.get("/api/v1/me", headers=h).json()["settings"]["outlier_pct"] == 5
    for w in ["180", "180.4", "179.8"]:
        log(client, "alice", w, "weight")
    # 190 is ~5.6% over 180: flagged at the default 5%...
    flagged = log(client, "alice", "190", "weight")["weigh_in"]["flagged"]
    assert flagged is True
    # ...but not once the check allows 10%.
    r = client.patch("/api/v1/me/settings", headers=h, json={"outlier_pct": 10})
    assert r.json()["settings"]["outlier_pct"] == 10
    logs = client.get("/api/v1/logs", headers=h).json()["logs"]
    assert not any(lg["weigh_in"] and lg["weigh_in"]["flagged"] for lg in logs)
    for bad in (0, 16):
        assert_error(
            client.patch("/api/v1/me/settings", headers=h, json={"outlier_pct": bad}),
            422,
            "invalid_request",
        )


def test_data_counts_and_one_csv_of_everything(client: TestClient) -> None:
    log(client, "alice", "8x 135lb bench\n5x 155lb bench")
    log(client, "alice", "181.2 morning", "weight")
    log(client, "bob", "8x 95lb curl")
    h = auth("alice")
    assert client.get("/api/v1/me/data", headers=h).json() == {"sets": 2, "weigh_ins": 1}
    r = client.get("/api/v1/export/all.csv", headers=h)
    assert r.status_code == 200 and "jarvis-entries.csv" in r.headers["content-disposition"]
    rows = list(csv.DictReader(io.StringIO(r.text)))
    assert [row["kind"] for row in rows] == ["workout", "workout", "weight"]
    assert rows[0]["exercise"] == "bench" and float(rows[1]["weight_lb"]) == 155
    assert float(rows[2]["weight_lb"]) == 181.2 and rows[2]["note"] == "morning"
    assert all("curl" not in row["as_written"] for row in rows)  # only alice's


def make_export(path: Path) -> bytes:
    """A small database in the Jarvis 1.0 bot's schema."""
    conn = sqlite3.connect(path)
    conn.executescript(
        """
        CREATE TABLE messages (id INTEGER PRIMARY KEY, channel_name TEXT, content TEXT, created_at TEXT);
        CREATE TABLE sets (message_id INTEGER, idx INTEGER, date TEXT, kind TEXT, exercise TEXT);
        CREATE TABLE entries (message_id INTEGER PRIMARY KEY, date TEXT, weight REAL);
        CREATE TABLE aliases (short TEXT PRIMARY KEY, full TEXT NOT NULL);
        """
    )
    conn.executemany(
        "INSERT INTO messages VALUES (?, ?, ?, ?)",
        [
            (1, "workout", "8x 135lb bench\n8x ^", "2026-07-08T18:15:00+00:00"),
            (2, "weight", "158.8", "2026-07-08T06:40:00+00:00"),
            (3, "general", "hello everyone", "2026-07-08T07:00:00+00:00"),  # not a log
            (4, "workout", "10x 50lb oa row", "2026-07-09T18:20:00+00:00"),
        ],
    )
    conn.executemany(
        "INSERT INTO sets VALUES (?, ?, ?, ?, ?)",
        [
            (1, 0, "2026-07-08", "set", "bench"),
            (1, 1, "2026-07-08", "set", "^"),
            (4, 0, "2026-07-09", "set", "oa row"),
        ],
    )
    conn.execute("INSERT INTO entries VALUES (2, '2026-07-08', 158.8)")
    conn.execute("INSERT INTO aliases VALUES ('oa', 'one arm')")
    conn.commit()
    conn.close()
    return path.read_bytes()


def test_import_jarvis1_database_once_with_aliases(
    client: TestClient, db: Session, tmp_path: Path
) -> None:
    data = make_export(tmp_path / "jarvis.db")
    h = auth("alice") | {"Content-Type": "application/octet-stream"}
    r = client.post("/api/v1/import/jarvis1", headers=h, content=data)
    assert r.status_code == 200, r.text
    assert r.json() == {"imported": 3, "duplicates": 0, "unreadable": 0, "aliases_added": 1}
    logs = client.get("/api/v1/logs?from=2026-07-01&to=2026-07-31", headers=auth("alice")).json()[
        "logs"
    ]
    assert len(logs) == 3
    bench = next(lg for lg in logs if "bench" in lg["raw_text"])
    assert [s["weight_lb"] for s in bench["sets"]] == [135, 135]  # "^" resolved
    row = next(lg for lg in logs if "row" in lg["raw_text"])
    assert row["sets"][0]["matched_exercise"] == "one arm row"  # the bot's alias applies
    weigh = next(lg for lg in logs if lg["kind"] == "weight")
    assert weigh["logged_at"].startswith("2026-07-08T06:40")

    again = client.post("/api/v1/import/jarvis1", headers=h, content=data).json()
    assert again == {"imported": 0, "duplicates": 3, "unreadable": 0, "aliases_added": 0}


def test_import_refuses_files_that_are_not_a_jarvis1_database(
    client: TestClient, tmp_path: Path
) -> None:
    h = auth("alice") | {"Content-Type": "application/octet-stream"}
    assert_error(
        client.post("/api/v1/import/jarvis1", headers=h, content=b"date,weight\n"),
        422,
        "invalid_import",
    )
    other = tmp_path / "other.db"
    conn = sqlite3.connect(other)
    conn.execute("CREATE TABLE notes (x TEXT)")
    conn.commit()
    conn.close()
    assert_error(
        client.post("/api/v1/import/jarvis1", headers=h, content=other.read_bytes()),
        422,
        "invalid_import",
    )


def test_delete_account_needs_DELETE_and_removes_everything(
    client: TestClient, db: Session, accounts: FakeAccounts
) -> None:
    log(client, "alice", "8x 135lb bench")
    log(client, "alice", "181.2", "weight")
    client.post("/api/v1/aliases", headers=auth("alice"), json={"short": "inc", "full": "incline"})
    log(client, "bob", "8x 95lb curl")
    h = auth("alice")
    assert_error(
        client.request("DELETE", "/api/v1/me", headers=h, json={"confirm": "delete"}),
        422,
        "invalid_request",
    )
    assert (
        client.request("DELETE", "/api/v1/me", headers=h, json={"confirm": "DELETE"}).status_code
        == 204
    )
    assert accounts.deleted == ["alice"]
    alice = db.scalar(select(User).where(User.firebase_uid == "alice"))
    assert alice is None
    assert db.scalar(select(func.count()).select_from(Alias)) == 0
    assert db.scalar(select(func.count()).select_from(Log)) == 1  # bob's stays


def test_the_demo_account_cannot_be_deleted(client: TestClient, accounts: FakeAccounts) -> None:
    r = client.request("DELETE", "/api/v1/me", headers=auth(DEMO_UID), json={"confirm": "DELETE"})
    assert_error(r, 403, "demo_account")
    assert accounts.deleted == []


def test_big_import_uploads_are_allowed_but_json_bodies_stay_small(
    client: TestClient, engine: Engine
) -> None:
    h = auth("alice")
    big = b"x" * 40_000
    assert_error(
        client.post("/api/v1/logs", headers=h | {"Content-Type": "application/json"}, content=big),
        413,
        "payload_too_large",
    )
    r = client.post(
        "/api/v1/import/jarvis1",
        headers=h | {"Content-Type": "application/octet-stream"},
        content=big,
    )
    assert_error(r, 422, "invalid_import")  # read, then refused for what it is
