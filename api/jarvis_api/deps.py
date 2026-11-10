from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from jarvis_api.config import Settings
from jarvis_api.db import get_db
from jarvis_api.errors import ApiError
from jarvis_api.firebase import AuthError, TokenVerifier
from jarvis_api.models import User
from jarvis_api.ratelimit import RateLimiter
from jarvis_api.services.users import get_or_create_user

DB = Annotated[Session, Depends(get_db)]


def get_settings_dep(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


def get_limiter(request: Request) -> RateLimiter:
    limiter: RateLimiter = request.app.state.limiter
    return limiter


AppSettings = Annotated[Settings, Depends(get_settings_dep)]
Limiter = Annotated[RateLimiter, Depends(get_limiter)]


def current_user(request: Request, db: DB) -> User:
    """Verify the Firebase ID token and return the caller, creating them on first use."""
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise ApiError(401, "unauthenticated", "Sign in to continue.")
    verifier: TokenVerifier = request.app.state.verifier
    try:
        claims = verifier.verify(token.strip())
    except AuthError as exc:
        raise ApiError(401, "unauthenticated", "Your session has expired. Sign in again.") from exc
    # Email/password accounts must confirm their address first (the link Firebase
    # emails at sign-up), so a script can't create accounts and start using the API.
    if claims.provider == "password" and not claims.email_verified:
        raise ApiError(
            403, "email_unverified", "Verify your email first: open the link we sent you."
        )
    return get_or_create_user(db, claims)


CurrentUser = Annotated[User, Depends(current_user)]
