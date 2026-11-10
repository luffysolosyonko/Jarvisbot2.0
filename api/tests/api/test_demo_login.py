"""The demo login: the demo UID gets an email and password; the UID never changes."""

from __future__ import annotations

from typing import Any

import pytest

from jarvis_api import demo_login
from jarvis_api.firebase import FirebaseAuth

from .conftest import DEMO_UID


class FakeAuthModule:
    def __init__(self, existing: bool) -> None:
        self.existing = existing
        self.calls: list[tuple[str, tuple[Any, ...], dict[str, Any]]] = []

        class UserNotFoundError(Exception):
            pass

        self.UserNotFoundError = UserNotFoundError

    def get_user(self, uid: str, app: Any) -> object:
        self.calls.append(("get", (uid,), {}))
        if not self.existing:
            raise self.UserNotFoundError(uid)
        return object()

    def create_user(self, **kwargs: Any) -> None:
        self.calls.append(("create", (), kwargs))

    def update_user(self, uid: str, **kwargs: Any) -> None:
        self.calls.append(("update", (uid,), kwargs))


@pytest.fixture
def fake_auth(monkeypatch: pytest.MonkeyPatch) -> Any:
    def make(existing: bool) -> tuple[FirebaseAuth, FakeAuthModule, object]:
        import firebase_admin

        fake = FakeAuthModule(existing)
        monkeypatch.setattr(firebase_admin, "auth", fake, raising=False)
        monkeypatch.setitem(__import__("sys").modules, "firebase_admin.auth", fake)
        fa = FirebaseAuth("demo-project")
        app_obj = object()
        monkeypatch.setattr(fa, "_get_app", lambda: app_obj)
        return fa, fake, app_obj

    return make


def test_updates_the_existing_demo_user_in_place(fake_auth: Any) -> None:
    fa, fake, app_obj = fake_auth(existing=True)
    assert fa.set_email_login(DEMO_UID, "demo@example.com", "pw-123456") is False
    assert fake.calls[-1] == (
        "update",
        (DEMO_UID,),
        {
            "email": "demo@example.com",
            "password": "pw-123456",
            "email_verified": True,
            "app": app_obj,
        },
    )


def test_creates_the_demo_user_with_the_fixed_uid(fake_auth: Any) -> None:
    fa, fake, app_obj = fake_auth(existing=False)
    assert fa.set_email_login(DEMO_UID, "demo@example.com", "pw-123456") is True
    assert fake.calls[-1] == (
        "create",
        (),
        {
            "uid": DEMO_UID,
            "email": "demo@example.com",
            "password": "pw-123456",
            "email_verified": True,
            "app": app_obj,
        },
    )


def test_generated_passwords_are_long_and_random() -> None:
    a, b = demo_login.generate_password(), demo_login.generate_password()
    assert len(a) == 16 and a.isalnum() and a != b


def test_the_demo_token_endpoint_is_gone(client: Any) -> None:
    assert client.post("/api/v1/demo/token").status_code == 404
