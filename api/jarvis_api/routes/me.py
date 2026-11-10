from __future__ import annotations

from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Request, Response
from sqlalchemy import func, select

from jarvis_api import schemas
from jarvis_api.deps import DB, AppSettings, CurrentUser
from jarvis_api.errors import ApiError
from jarvis_api.firebase import AccountAdmin
from jarvis_api.models import Log, LoggedSet, User, WeighIn

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
        settings=schemas.SettingsOut(tz_name=s.tz_name, set_unit=unit),
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
    db.commit()
    return me_out(user, settings.demo_uid)


@router.get("/me/data")
def data_summary(user: CurrentUser, db: DB) -> schemas.DataSummaryOut:
    """How much is stored: for the export caption."""
    sets = db.scalar(
        select(func.count()).select_from(LoggedSet).where(LoggedSet.user_id == user.id)
    )
    weigh_ins = db.scalar(
        select(func.count()).select_from(WeighIn).where(WeighIn.user_id == user.id)
    )
    return schemas.DataSummaryOut(sets=int(sets or 0), weigh_ins=int(weigh_ins or 0))


@router.delete("/me", status_code=204)
def delete_account(
    body: schemas.DeleteAccountIn,
    request: Request,
    user: CurrentUser,
    db: DB,
    settings: AppSettings,
) -> Response:
    """Delete the account: the sign-in first (so nothing is left half-deleted if that
    fails), then every row the account owns (logs, sets, weigh-ins, aliases, questions,
    usage, settings). The shared demo account can't be deleted."""
    if settings.demo_uid and user.firebase_uid == settings.demo_uid:
        raise ApiError(403, "demo_account", "The demo account can't be deleted.")
    accounts: AccountAdmin = request.app.state.accounts
    try:
        accounts.delete_user(user.firebase_uid)
    except Exception as exc:  # Firebase unreachable or misconfigured
        raise ApiError(
            502, "delete_failed", "Couldn't delete your sign-in right now. Nothing was deleted."
        ) from exc
    db.query(Log).filter(Log.user_id == user.id).delete()  # sets and weigh-ins cascade
    db.delete(user)  # settings, aliases, questions and usage cascade
    db.commit()
    return Response(status_code=204)
