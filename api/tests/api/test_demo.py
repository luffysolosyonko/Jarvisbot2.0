"""'Try the demo' token: fixed UID from config, no claims, rate limited per IP."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from jarvis_api.config import Settings
from jarvis_api.firebase import FirebaseAuth
from jarvis_api.main import create_app
from jarvis_api.ratelimit import RateLimiter

from .conftest import DEMO_UID, FakeClock, FakeMinter
from .test_auth_and_errors import assert_error


def test_issues_a_token_for_the_demo_uid(client: TestClient, minter: FakeMinter) -> None:
    r = client.post("/api/v1/demo/token")
    assert r.status_code == 200 and r.json() == {"token": f"custom-token-for-{DEMO_UID}"}
    assert minter.minted == [DEMO_UID]


@pytest.mark.parametrize(
    "kwargs",
    [
        {"json": {"uid": "victim"}},
        {"params": {"uid": "victim"}},
        {"json": {"uid": "victim", "claims": {"admin": True}}},
        {"headers": {"X-Demo-Uid": "victim"}},
        {"content": "uid=victim", "headers": {"Content-Type": "application/x-www-form-urlencoded"}},
    ],
)
def test_never_issues_a_token_for_any_other_uid(
    client: TestClient, minter: FakeMinter, kwargs: dict[str, Any]
) -> None:
    r = client.post("/api/v1/demo/token", **kwargs)
    assert r.status_code == 200
    assert minter.minted == [DEMO_UID]
    assert "victim" not in r.text


def test_disabled_without_demo_uid(engine: Any, minter: FakeMinter) -> None:
    app = create_app(
        Settings(_env_file=None, database_url="sqlite://", demo_uid=""),  # type: ignore[call-arg]
        engine=engine,
        minter=minter,
    )
    assert_error(TestClient(app).post("/api/v1/demo/token"), 503, "demo_unavailable")
    assert minter.minted == []


def test_mint_failure_is_a_clean_503(settings: Settings, engine: Any) -> None:
    class Broken:
        def mint(self, uid: str) -> str:
            raise RuntimeError("no service account")

    app = create_app(settings, engine=engine, minter=Broken())
    r = TestClient(app).post("/api/v1/demo/token")
    assert_error(r, 503, "demo_unavailable")
    assert "service account" not in r.text


def test_rate_limited_per_ip_per_minute(client: TestClient, clock: FakeClock) -> None:
    for _ in range(5):
        assert client.post("/api/v1/demo/token").status_code == 200
    r = client.post("/api/v1/demo/token")
    assert_error(r, 429, "rate_limited")
    assert 1 <= int(r.headers["Retry-After"]) <= 60
    clock.t += 61
    assert client.post("/api/v1/demo/token").status_code == 200


def test_rate_limited_per_ip_per_day(client: TestClient, clock: FakeClock) -> None:
    for i in range(50):
        if i and i % 5 == 0:
            clock.t += 61  # stay under the per-minute limit
        assert client.post("/api/v1/demo/token").status_code == 200, i
    clock.t += 61
    assert_error(client.post("/api/v1/demo/token"), 429, "rate_limited")
    clock.t += 24 * 60 * 60
    assert client.post("/api/v1/demo/token").status_code == 200


def test_proxy_header_only_trusted_when_configured(
    settings: Settings, engine: Any, minter: FakeMinter
) -> None:
    def client_for(trust: bool) -> TestClient:
        s = settings.model_copy(update={"trust_proxy_headers": trust})
        return TestClient(
            create_app(s, engine=engine, minter=minter, limiter=RateLimiter(FakeClock()))
        )

    untrusted = client_for(False)
    for i in range(5):
        untrusted.post("/api/v1/demo/token", headers={"X-Forwarded-For": f"10.0.0.{i}"})
    # spoofed X-Forwarded-For doesn't buy a fresh budget
    assert (
        untrusted.post("/api/v1/demo/token", headers={"X-Forwarded-For": "10.0.0.99"}).status_code
        == 429
    )

    trusted = client_for(True)
    for i in range(6):
        r = trusted.post("/api/v1/demo/token", headers={"X-Forwarded-For": f"10.0.0.{i}, 1.2.3.4"})
        assert r.status_code == 200


def test_firebase_mint_adds_no_claims(monkeypatch: pytest.MonkeyPatch) -> None:
    from firebase_admin import auth as fa

    calls: list[tuple[tuple[Any, ...], dict[str, Any]]] = []

    def fake_create(*args: Any, **kwargs: Any) -> bytes:
        calls.append((args, kwargs))
        return b"signed"

    fa_auth = FirebaseAuth("demo-project")
    app_obj = object()
    monkeypatch.setattr(fa_auth, "_get_app", lambda: app_obj)
    monkeypatch.setattr(fa, "create_custom_token", fake_create)
    assert fa_auth.mint(DEMO_UID) == "signed"
    assert calls == [((DEMO_UID,), {"app": app_obj})]  # no developer_claims
