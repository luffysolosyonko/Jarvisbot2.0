from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from jarvis_api import firebase as fb
from jarvis_api.firebase import AuthError, FirebaseAuth

from .conftest import auth


def assert_error(resp: Any, status: int, code: str) -> None:
    assert resp.status_code == status, resp.text
    body = resp.json()
    assert set(body) == {"error"} and body["error"]["code"] == code
    assert isinstance(body["error"]["message"], str) and body["error"]["message"]


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"Authorization": "token-alice"},
        {"Authorization": "Bearer "},
        {"Authorization": "Bearer nope"},
    ],
)
def test_every_route_requires_a_valid_token(client: TestClient, headers: dict[str, str]) -> None:
    for method, path in [
        ("GET", "/api/v1/me"),
        ("PATCH", "/api/v1/me/settings"),
        ("POST", "/api/v1/parse"),
        ("POST", "/api/v1/logs"),
        ("GET", "/api/v1/logs"),
        ("GET", "/api/v1/dashboard"),
        ("GET", "/api/v1/exercises"),
        ("GET", "/api/v1/exercises/bench"),
        ("GET", "/api/v1/exercises/bench/forecast"),
        ("GET", "/api/v1/weight/forecast"),
        ("GET", "/api/v1/aliases"),
        ("POST", "/api/v1/aliases"),
        ("DELETE", "/api/v1/aliases/1"),
    ]:
        resp = client.request(method, path, headers=headers, json={})
        assert_error(resp, 401, "unauthenticated")


def test_first_call_creates_the_user_once(client: TestClient) -> None:
    first = client.get("/api/v1/me", headers=auth("alice")).json()
    second = client.get("/api/v1/me", headers=auth("alice")).json()
    assert first["id"] == second["id"]
    assert first["email"] == "alice@example.com" and first["auth_provider"] == "password"
    assert first["settings"] == {"tz_name": "UTC", "set_unit": "lb", "bar_lb": 45.0}
    assert first["is_demo"] is False


def test_settings_patch(client: TestClient) -> None:
    h = auth("alice")
    r = client.patch(
        "/api/v1/me/settings",
        headers=h,
        json={"tz_name": "America/Chicago", "set_unit": "kg", "bar_lb": 35},
    )
    assert r.status_code == 200 and r.json()["settings"]["set_unit"] == "kg"
    assert_error(
        client.patch("/api/v1/me/settings", headers=h, json={"tz_name": "Mars/Base"}),
        422,
        "invalid_request",
    )
    assert_error(
        client.patch("/api/v1/me/settings", headers=h, json={"set_unit": "stone"}),
        422,
        "invalid_request",
    )
    assert_error(
        client.patch("/api/v1/me/settings", headers=h, json={"admin": True}),
        422,
        "invalid_request",
    )


def test_consistent_json_errors(client: TestClient) -> None:
    assert_error(client.get("/api/v1/nope", headers=auth("alice")), 404, "not_found")
    big = "x" * 40_000
    resp = client.post("/api/v1/logs", headers=auth("alice"), json={"text": big})
    assert_error(resp, 413, "payload_too_large")
    resp = client.post("/api/v1/logs", headers=auth("alice"), json={"text": "x" * 2001})
    assert_error(resp, 422, "invalid_request")
    assert resp.json()["error"]["details"][0]["field"] == "text"


def test_healthz_is_public(client: TestClient) -> None:
    assert client.get("/healthz").json() == {"status": "ok"}


# --- the real Firebase wrapper, with the SDK calls stubbed ------------------
def test_firebase_verify_maps_claims_and_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    from firebase_admin import auth as fa

    fa_auth = FirebaseAuth("demo-project")
    monkeypatch.setattr(fa_auth, "_get_app", lambda: object())

    def ok(token: str, app: object) -> dict[str, Any]:
        return {
            "uid": "u1",
            "email": "u1@example.com",
            "firebase": {"sign_in_provider": "google.com"},
        }

    monkeypatch.setattr(fa, "verify_id_token", ok)
    claims = fa_auth.verify("t")
    assert (claims.uid, claims.provider) == ("u1", "google.com")

    def bad(token: str, app: object) -> dict[str, Any]:
        raise fa.InvalidIdTokenError("bad", cause=None)

    monkeypatch.setattr(fa, "verify_id_token", bad)
    with pytest.raises(AuthError):
        fa_auth.verify("t")

    def malformed(token: str, app: object) -> dict[str, Any]:
        raise ValueError("not a jwt")

    monkeypatch.setattr(fa, "verify_id_token", malformed)
    with pytest.raises(AuthError):
        fa_auth.verify("t")
    assert fb.Claims("x").provider == "unknown"
