"""Firebase Admin: ID token verification, and the demo account's email login.

Both are behind small protocols so tests can swap in fakes without network calls.
"""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass
from typing import Any, Protocol

log = logging.getLogger("jarvis.auth")


class AuthError(Exception):
    """The token is missing, malformed, expired or revoked."""


@dataclass(frozen=True)
class Claims:
    uid: str
    email: str | None = None
    name: str | None = None
    provider: str = "unknown"  # "password", "google.com", "custom"
    email_verified: bool = False


class TokenVerifier(Protocol):
    def verify(self, token: str) -> Claims: ...


class AccountAdmin(Protocol):
    def delete_user(self, uid: str) -> None: ...


class FirebaseAuth:
    """Real implementation. The Admin SDK app is created on first use.

    Verifying ID tokens only needs the project ID (Google's public keys are fetched
    and cached by the SDK). Changing a user (the demo login) needs a service account: a key
    file locally, or the Cloud Run identity in production.
    """

    def __init__(self, project_id: str, credentials_path: str = "") -> None:
        self._project_id = project_id
        self._credentials_path = credentials_path
        self._app: Any = None
        self._lock = threading.Lock()

    def _get_app(self) -> Any:
        with self._lock:
            if self._app is None:
                import firebase_admin
                from firebase_admin import credentials

                cred = (
                    credentials.Certificate(self._credentials_path)
                    if self._credentials_path
                    else None
                )
                options = {"projectId": self._project_id} if self._project_id else None
                self._app = firebase_admin.initialize_app(cred, options, name="jarvis")
            return self._app

    def verify(self, token: str) -> Claims:
        from firebase_admin import auth

        try:
            decoded: dict[str, Any] = auth.verify_id_token(token, app=self._get_app())
        except (ValueError, auth.InvalidIdTokenError, auth.ExpiredIdTokenError) as exc:
            raise AuthError(str(exc)) from exc
        except auth.CertificateFetchError as exc:  # Google's keys unreachable
            log.warning("could not fetch Firebase certificates: %s", exc)
            raise AuthError("could not verify token") from exc
        firebase = decoded.get("firebase") or {}
        return Claims(
            uid=str(decoded["uid"]),
            email=decoded.get("email"),
            name=decoded.get("name"),
            provider=str(firebase.get("sign_in_provider", "unknown")),
            email_verified=bool(decoded.get("email_verified", False)),
        )

    def delete_user(self, uid: str) -> None:
        """Remove the sign-in itself (already gone is fine)."""
        from firebase_admin import auth

        try:
            auth.delete_user(uid, app=self._get_app())
        except auth.UserNotFoundError:
            return

    def set_email_login(self, uid: str, email: str, password: str) -> bool:
        """Give the user `uid` this email and password, creating the user if needed.

        Returns True if the user was created. The UID never changes, so the account's
        data (keyed by UID) stays attached.
        """
        from firebase_admin import auth

        app = self._get_app()
        try:
            auth.get_user(uid, app=app)
        except auth.UserNotFoundError:
            auth.create_user(uid=uid, email=email, password=password, email_verified=True, app=app)
            return True
        auth.update_user(uid, email=email, password=password, email_verified=True, app=app)
        return False
