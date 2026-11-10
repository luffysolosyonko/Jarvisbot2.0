from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, date, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Query, Response
from sqlalchemy.orm import Session

from jarvis_api import schemas
from jarvis_api.deps import DB, AppSettings, CurrentUser, Limiter, RowId
from jarvis_api.errors import ApiError
from jarvis_api.models import Log, User
from jarvis_api.serializers import log_out, parse_out, recent_exercises, warnings_out
from jarvis_api.services.logs import (
    UserData,
    delete_log,
    edit_log,
    get_log,
    load_user_data,
    logs_between,
    parse_for_user,
    parse_logs,
    save_log,
)
from jarvis_api.services.users import local_now

router = APIRouter(tags=["logs"])

MAX_RANGE_DAYS = 366
# Dates outside these overflow date arithmetic (year 1, year 9999).
MIN_DAY, MAX_DAY = date(2000, 1, 1), date(2100, 12, 31)
NOTHING_PARSED = "Nothing to save: no sets or weigh-in found."


def logs_out(
    db: Session, user: User, logs: Sequence[Log], data: UserData | None = None
) -> list[schemas.LogOut]:
    """Logs with their unparsed lines (and fixes) recovered by re-parsing."""
    data = data or load_user_data(db, user)
    parsed = parse_logs(db, user, logs)
    recent = recent_exercises(data, 3)
    return [
        log_out(
            lg, data.canonical, warnings_out(parsed[lg.id], lg.raw_text, recent), data.weigh_flags
        )
        for lg in logs
    ]


@router.post("/parse")
def preview(
    body: schemas.LogIn, user: CurrentUser, db: DB, settings: AppSettings, limiter: Limiter
) -> schemas.ParseOut:
    """Parse without saving: the notebook's live preview."""
    limiter.enforce("parse", str(user.id), settings.rate_limit_parse_per_min, 60)
    now = datetime.now(UTC)
    day = local_now(user, now).date()
    parsed = parse_for_user(db, user, body.text, day, body.effective_mode, now)
    return parse_out(parsed, load_user_data(db, user), body.text, day)


@router.post("/logs", status_code=201)
def create_log(body: schemas.LogIn, user: CurrentUser, db: DB) -> schemas.SavedLogOut:
    """Save a log. Parsing is deterministic: this never calls the LLM."""
    result = save_log(db, user, body.text, datetime.now(UTC), body.effective_mode)
    if result is None:
        raise ApiError(422, "nothing_parsed", NOTHING_PARSED)
    data = load_user_data(db, user)
    warnings = warnings_out(result.parsed, body.text, recent_exercises(data, 3))
    out = log_out(result.log, data.canonical, warnings, data.weigh_flags)
    return schemas.SavedLogOut(**out.model_dump())


@router.patch("/logs/{log_id}")
def update_log(
    log_id: RowId, body: schemas.LogEditIn, user: CurrentUser, db: DB
) -> schemas.SavedLogOut:
    """Edit a log's text; it's re-parsed, along with later logs that day."""
    log = get_log(db, user, log_id)
    if log is None:
        raise ApiError(404, "not_found", "Log not found.")
    parsed = edit_log(db, user, log, body.text, body.mode, body.confirm_weight)
    if parsed is None:
        raise ApiError(422, "nothing_parsed", NOTHING_PARSED)
    data = load_user_data(db, user)
    warnings = warnings_out(parsed, body.text, recent_exercises(data, 3))
    out = log_out(log, data.canonical, warnings, data.weigh_flags)
    return schemas.SavedLogOut(**out.model_dump())


@router.post("/logs/{log_id}/confirm")
def confirm_weight(log_id: RowId, user: CurrentUser, db: DB) -> schemas.SavedLogOut:
    """Keep an outlying weigh-in as written ("Keep 176.4"): it counts in the stats again."""
    log = get_log(db, user, log_id)
    if log is None or log.weigh_in is None:
        raise ApiError(404, "not_found", "Weigh-in not found.")
    log.weight_confirmed = True
    db.commit()
    data = load_user_data(db, user)
    out = log_out(log, data.canonical, None, data.weigh_flags)
    return schemas.SavedLogOut(**out.model_dump())


@router.delete("/logs/{log_id}", status_code=204)
def remove_log(log_id: RowId, user: CurrentUser, db: DB) -> Response:
    log = get_log(db, user, log_id)
    if log is None:
        raise ApiError(404, "not_found", "Log not found.")
    delete_log(db, user, log)
    return Response(status_code=204)


@router.get("/logs")
def list_logs(
    user: CurrentUser,
    db: DB,
    from_: Annotated[date | None, Query(alias="from")] = None,
    to: date | None = None,
) -> schemas.LogsOut:
    """Logs in a date range (default: the last 14 days), newest first."""
    if any(d is not None and not MIN_DAY <= d <= MAX_DAY for d in (from_, to)):
        raise ApiError(422, "invalid_request", "Use dates between 2000 and 2100.")
    end = to or local_now(user, datetime.now(UTC)).date()
    start = from_ or end - timedelta(days=13)
    if start > end:
        raise ApiError(422, "invalid_request", "'from' must be on or before 'to'.")
    if (end - start).days >= MAX_RANGE_DAYS:
        raise ApiError(422, "invalid_request", f"Ask for at most {MAX_RANGE_DAYS} days.")
    return schemas.LogsOut(logs=logs_out(db, user, logs_between(db, user, start, end)))
