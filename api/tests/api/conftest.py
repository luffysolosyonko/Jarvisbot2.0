from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlalchemy.orm import Session

from jarvis_api.config import Settings
from jarvis_api.db import Base, make_engine, make_sessionmaker
from jarvis_api.firebase import AuthError, Claims
from jarvis_api.main import create_app
from jarvis_api.ratelimit import RateLimiter

DEMO_UID = "demo-uid-for-tests"


class FakeVerifier:
    """'token-<uid>' is a valid ID token for <uid>; anything else is rejected."""

    def verify(self, token: str) -> Claims:
        if not token.startswith("token-"):
            raise AuthError("bad token")
        uid = token.removeprefix("token-")
        provider = "custom" if uid == DEMO_UID else "password"
        return Claims(uid=uid, email=f"{uid}@example.com", provider=provider)


class FakeClock:
    def __init__(self) -> None:
        self.t = 1000.0

    def __call__(self) -> float:
        return self.t


def auth(uid: str) -> dict[str, str]:
    return {"Authorization": f"Bearer token-{uid}"}


@pytest.fixture
def engine() -> Iterator[Engine]:
    eng = make_engine("sqlite://")
    Base.metadata.create_all(eng)
    yield eng
    eng.dispose()


@pytest.fixture
def db(engine: Engine) -> Iterator[Session]:
    with make_sessionmaker(engine)() as session:
        yield session


@pytest.fixture
def settings() -> Settings:
    return Settings(
        _env_file=None,  # type: ignore[call-arg]
        database_url="sqlite://",
        demo_uid=DEMO_UID,
        anthropic_api_key="",
    )


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()


@pytest.fixture
def app(settings: Settings, engine: Engine, clock: FakeClock) -> FastAPI:
    return create_app(
        settings,
        engine=engine,
        verifier=FakeVerifier(),
        limiter=RateLimiter(clock),
    )


@pytest.fixture
def client(app: FastAPI) -> TestClient:
    return TestClient(app)
