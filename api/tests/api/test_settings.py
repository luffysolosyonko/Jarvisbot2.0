"""Settings: data counts, export, deleting an account."""

from __future__ import annotations

import csv
import io

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from jarvis_api.models import Alias, Log, User

from .conftest import DEMO_UID, FakeAccounts, auth
from .test_auth_and_errors import assert_error


def log(client: TestClient, user: str, text: str, mode: str = "workout") -> dict:
    r = client.post("/api/v1/logs", headers=auth(user), json={"text": text, "mode": mode})
    assert r.status_code == 201, r.text
    return r.json()


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
