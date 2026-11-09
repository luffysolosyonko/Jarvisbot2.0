from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Query

from jarvis_api import schemas
from jarvis_api.deps import DB, AppSettings, CurrentUser, Limiter
from jarvis_api.errors import ApiError
from jarvis_api.serializers import log_out, parse_out
from jarvis_api.services.logs import load_user_data, logs_between, parse_for_user, save_log
from jarvis_api.services.users import local_now

router = APIRouter(tags=["logs"])

MAX_RANGE_DAYS = 366


@router.post("/parse")
def preview(
    body: schemas.LogIn, user: CurrentUser, db: DB, settings: AppSettings, limiter: Limiter
) -> schemas.ParseOut:
    """Parse without saving: the live preview on the Log screen."""
    limiter.enforce("parse", str(user.id), settings.rate_limit_parse_per_min, 60)
    now = datetime.now(UTC)
    parsed = parse_for_user(db, user, body.text, local_now(user, now).date(), body.kind, now)
    data = load_user_data(db, user)
    return parse_out(parsed, data.canonical)


@router.post("/logs", status_code=201)
def create_log(body: schemas.LogIn, user: CurrentUser, db: DB) -> schemas.SavedLogOut:
    result = save_log(db, user, body.text, datetime.now(UTC), body.kind)
    if result is None:
        raise ApiError(422, "nothing_parsed", "Nothing to save: no sets or weigh-in found.")
    data = load_user_data(db, user)
    out = log_out(result.log, data.canonical)
    return schemas.SavedLogOut(
        **out.model_dump(),
        warnings=[
            schemas.WarningOut(line=w.line, message=w.message) for w in result.parsed.warnings
        ],
    )


@router.get("/logs")
def list_logs(
    user: CurrentUser,
    db: DB,
    from_: Annotated[date | None, Query(alias="from")] = None,
    to: date | None = None,
) -> schemas.LogsOut:
    end = to or local_now(user, datetime.now(UTC)).date()
    start = from_ or end - timedelta(days=13)
    if start > end:
        raise ApiError(422, "invalid_request", "'from' must be on or before 'to'.")
    if (end - start).days >= MAX_RANGE_DAYS:
        raise ApiError(422, "invalid_request", f"Ask for at most {MAX_RANGE_DAYS} days.")
    data = load_user_data(db, user)
    return schemas.LogsOut(
        logs=[log_out(lg, data.canonical) for lg in logs_between(db, user, start, end)]
    )
