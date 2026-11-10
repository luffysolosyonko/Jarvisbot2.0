from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from jarvis_api.firebase import Claims
from jarvis_api.models import User, UserSettings


def get_or_create_user(db: Session, claims: Claims) -> User:
    user = db.scalar(select(User).where(User.firebase_uid == claims.uid))
    if user:
        # Keep the email and sign-in method current (an account can gain an email
        # login, like the demo did); the display name is the user's own to change.
        if claims.email and (user.email != claims.email or user.auth_provider != claims.provider):
            user.email, user.auth_provider = claims.email, claims.provider
            db.commit()
        return user
    user = User(
        firebase_uid=claims.uid,
        email=claims.email,
        display_name=claims.name,
        auth_provider=claims.provider,
    )
    user.settings = UserSettings()
    db.add(user)
    try:
        db.commit()
    except IntegrityError:  # two first requests raced; the other one won
        db.rollback()
        existing = db.scalar(select(User).where(User.firebase_uid == claims.uid))
        if existing is None:
            raise
        return existing
    return user


def user_tz(user: User) -> ZoneInfo:
    try:
        return ZoneInfo(user.settings.tz_name)
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo("UTC")


def local_now(user: User, now: datetime) -> datetime:
    return now.astimezone(user_tz(user))
