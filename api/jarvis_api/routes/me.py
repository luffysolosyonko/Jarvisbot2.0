from __future__ import annotations

from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter

from jarvis_api import schemas
from jarvis_api.deps import DB, AppSettings, CurrentUser
from jarvis_api.errors import ApiError
from jarvis_api.models import User

router = APIRouter(tags=["me"])


def me_out(user: User, demo_uid: str) -> schemas.MeOut:
    s = user.settings
    unit: Literal["lb", "kg"] = "kg" if s.set_unit == "kg" else "lb"
    return schemas.MeOut(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        auth_provider=user.auth_provider,
        is_demo=bool(demo_uid) and user.firebase_uid == demo_uid,
        created_at=user.created_at,
        settings=schemas.SettingsOut(tz_name=s.tz_name, set_unit=unit, bar_lb=s.bar_lb),
    )


@router.get("/me")
def get_me(user: CurrentUser, settings: AppSettings) -> schemas.MeOut:
    return me_out(user, settings.demo_uid)


@router.patch("/me/settings")
def patch_settings(
    body: schemas.SettingsPatch, user: CurrentUser, db: DB, settings: AppSettings
) -> schemas.MeOut:
    s = user.settings
    if body.display_name is not None:
        user.display_name = " ".join(body.display_name.split()) or None
    if body.tz_name is not None:
        try:
            ZoneInfo(body.tz_name)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ApiError(422, "invalid_request", "Unknown time zone.") from exc
        s.tz_name = body.tz_name
    if body.set_unit is not None:
        s.set_unit = body.set_unit
    if body.bar_lb is not None:
        s.bar_lb = body.bar_lb
    db.commit()
    return me_out(user, settings.demo_uid)
