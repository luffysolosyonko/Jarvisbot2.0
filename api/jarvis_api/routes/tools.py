"""The bot's slash commands as endpoints: /today, /stats, /volume, /search, /usage,
/export, plus the History calendar. Each is a thin wrapper over jarvis_core.analysis.
(/lift and /estimate are GET /exercises/{name}; /predict is GET /weight/forecast and
GET /exercises/{name}/forecast.)"""

from __future__ import annotations

import csv
import io
import re
from calendar import monthrange
from datetime import UTC, date, datetime, time, timedelta
from typing import Annotated

from fastapi import APIRouter, Query, Response
from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from jarvis_api import schemas
from jarvis_api.deps import DB, AppSettings, CurrentUser
from jarvis_api.errors import ApiError
from jarvis_api.models import AiUsage, Log, LoggedSet
from jarvis_api.routes.ask import daily_cap
from jarvis_api.routes.logs import logs_out
from jarvis_api.services.logs import load_user_data, logs_between
from jarvis_api.services.users import local_now, user_tz
from jarvis_core import analysis

router = APIRouter(tags=["tools"])

Days = Annotated[int, Query(ge=1, le=365)]
MONTH_RE = re.compile(r"^(\d{4})-(0[1-9]|1[0-2])$")
SEARCH_LIMIT = 50


def _r(x: float, nd: int = 1) -> float:
    return round(x, nd)


@router.get("/today")
def today(user: CurrentUser, db: DB) -> schemas.TodayLogsOut:
    """Everything logged today, oldest first."""
    day = local_now(user, datetime.now(UTC)).date()
    data = load_user_data(db, user)
    logs = list(reversed(logs_between(db, user, day, day)))
    sets = [s for s in data.sets if s.day == day]
    weights = [w for w in analysis.daily_weights(data.weighins) if w.day == day]
    return schemas.TodayLogsOut(
        date=day,
        logs=logs_out(db, user, logs, data),
        sets=len(sets),
        volume_lb=_r(sum(analysis.set_volume(s) for s in sets)),
        exercises=list(dict.fromkeys(s.exercise for s in sets if s.exercise)),
        weight_lb=weights[0].weight_lb if weights else None,
    )


@router.get("/stats")
def stats(user: CurrentUser, db: DB, days: Days = 7) -> schemas.StatsOut:
    """Weight change, gym days per week, sets and volume over the last `days` days."""
    end = local_now(user, datetime.now(UTC)).date()
    data = load_user_data(db, user)
    w = analysis.window_summary(data.sets, end, days)
    weights = [p for p in analysis.daily_weights(data.weighins) if w.start <= p.day <= end]
    first = weights[0].weight_lb if weights else None
    last = weights[-1].weight_lb if weights else None
    change = (
        _r(last - first) if first is not None and last is not None and len(weights) > 1 else None
    )
    return schemas.StatsOut(
        days=days,
        start=w.start,
        end=end,
        gym_days=w.sessions,
        gym_days_per_week=_r(w.sessions / days * 7),
        sets=w.sets,
        good_reps=w.good_reps,
        failed_reps=w.failed_reps,
        volume_lb=_r(w.volume_lb),
        weight_start_lb=first,
        weight_end_lb=last,
        weight_change_lb=change,
    )


@router.get("/volume")
def volume(user: CurrentUser, db: DB, days: Days = 7) -> schemas.VolumeOut:
    """Sets, reps and load per exercise over the last `days` days."""
    end = local_now(user, datetime.now(UTC)).date()
    w = analysis.window_summary(load_user_data(db, user).sets, end, days)
    return schemas.VolumeOut(
        days=days,
        start=w.start,
        end=end,
        exercises=[
            schemas.ExerciseVolumeOut(
                exercise=e.exercise, sets=e.sets, good_reps=e.good_reps, volume_lb=_r(e.volume_lb)
            )
            for e in w.by_exercise
        ],
    )


@router.get("/calendar")
def calendar(
    user: CurrentUser, db: DB, month: Annotated[str, Query(description="YYYY-MM")]
) -> schemas.CalendarOut:
    """One row per day of the month: workout and weigh-in markers, sets, volume."""
    m = MONTH_RE.match(month)
    if not m:
        raise ApiError(422, "invalid_request", "Use a month like 2026-11.")
    year, mon = int(m.group(1)), int(m.group(2))
    start = date(year, mon, 1)
    end = date(year, mon, monthrange(year, mon)[1])
    data = load_user_data(db, user)
    rows = analysis.daily_rollup(data.sets, data.weighins, start, end)
    weights = [r.weight_lb for r in rows if r.weight_lb is not None]
    return schemas.CalendarOut(
        month=month,
        days=[
            schemas.CalendarDayOut(
                date=r.day,
                has_workout=r.trained,
                has_weight=r.weight_lb is not None,
                sets=r.sets,
                volume_lb=_r(r.volume_lb),
                weight_lb=r.weight_lb,
            )
            for r in rows
        ],
        workouts=sum(1 for r in rows if r.trained),
        sets=sum(r.sets for r in rows),
        volume_lb=_r(sum(r.volume_lb for r in rows)),
        weight_change_lb=_r(weights[-1] - weights[0]) if len(weights) > 1 else None,
    )


@router.get("/search")
def search(
    user: CurrentUser, db: DB, q: Annotated[str, Query(min_length=1, max_length=80)]
) -> schemas.SearchOut:
    """Logs whose text or exercise names contain `q`, newest first."""
    term = f"%{q.strip().lower()}%"
    named = select(LoggedSet.log_id).where(
        LoggedSet.user_id == user.id, func.lower(LoggedSet.exercise).like(term)
    )
    found = db.scalars(
        select(Log)
        .where(Log.user_id == user.id, or_(func.lower(Log.raw_text).like(term), Log.id.in_(named)))
        .options(selectinload(Log.sets), selectinload(Log.weigh_in))
        .order_by(Log.logged_at.desc(), Log.id.desc())
        .limit(SEARCH_LIMIT + 1)
    ).all()
    return schemas.SearchOut(
        query=q,
        logs=logs_out(db, user, found[:SEARCH_LIMIT]),
        truncated=len(found) > SEARCH_LIMIT,
    )


@router.get("/usage")
def usage(user: CurrentUser, db: DB, settings: AppSettings) -> schemas.UsageOut:
    """Claude tokens used today, in the last 7 days and this month."""
    tz = user_tz(user)
    local_today = datetime.now(UTC).astimezone(tz).date()

    def since(d: date) -> datetime:
        return datetime.combine(d, time.min, tz).astimezone(UTC)

    def tokens(start: datetime) -> int:
        total = db.scalar(
            select(func.coalesce(func.sum(AiUsage.input_tokens + AiUsage.output_tokens), 0)).where(
                AiUsage.user_id == user.id, AiUsage.at >= start
            )
        )
        return int(total or 0)

    month_start = since(local_today.replace(day=1))
    questions = db.scalar(
        select(func.count(AiUsage.id)).where(AiUsage.user_id == user.id, AiUsage.at >= month_start)
    )
    return schemas.UsageOut(
        today=tokens(since(local_today)),
        week=tokens(since(local_today - timedelta(days=6))),
        month=tokens(month_start),
        questions_month=int(questions or 0),
        daily_token_cap=daily_cap(user, settings),
    )


def _csv(name: str, header: list[str], rows: list[list[object]]) -> Response:
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\n")
    writer.writerow(header)
    writer.writerows(rows)
    return Response(
        buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


@router.get("/export/sets.csv", response_class=Response)
def export_sets(user: CurrentUser, db: DB) -> Response:
    """Every set as CSV (weights in lb; bodyweight sets use that day's weigh-in)."""
    data = load_user_data(db, user)
    rows: list[list[object]] = [
        [
            s.day.isoformat(),
            s.exercise or "",
            s.reps,
            s.good_reps,
            s.failed_reps,
            "" if s.weight_lb is None else _r(s.weight_lb),
            int(s.estimated),
            int(s.bodyweight),
            int(s.per_hand),
            s.weight_text or "",
        ]
        for s in data.sets
    ]
    header = ["date", "exercise", "reps", "good_reps", "failed_reps", "weight_lb"]
    header += ["estimated", "bodyweight", "per_hand", "weight_as_written"]
    return _csv("jarvis-sets.csv", header, rows)


@router.get("/export/all.csv", response_class=Response)
def export_all(user: CurrentUser, db: DB) -> Response:
    """Every entry as one CSV: a row per set and per weigh-in, oldest first, with the
    time it was logged and the text as written (weights in lb)."""
    tz = user_tz(user)
    logs = db.scalars(
        select(Log)
        .where(Log.user_id == user.id)
        .options(selectinload(Log.sets), selectinload(Log.weigh_in))
        .order_by(Log.logged_at, Log.id)
    ).all()
    rows: list[list[object]] = []
    for lg in logs:
        when = lg.logged_at.astimezone(tz)
        base = [lg.local_date.isoformat(), when.strftime("%H:%M"), lg.kind]
        if lg.weigh_in is not None:
            w = lg.weigh_in
            rows.append(
                [*base, "", "", "", "", _r(w.weight_lb), "", "", "", w.note or "", lg.raw_text]
            )
        for s in lg.sets:
            rows.append(
                [
                    *base,
                    s.exercise or "",
                    s.reps,
                    s.good_reps,
                    s.failed_reps,
                    "" if s.weight_lb is None else _r(s.weight_lb),
                    int(s.estimated),
                    int(s.bodyweight),
                    int(s.per_hand),
                    "",
                    lg.raw_text,
                ]
            )
    header = ["date", "time", "kind", "exercise", "reps", "good_reps", "failed_reps"]
    header += ["weight_lb", "estimated", "bodyweight", "per_hand", "note", "as_written"]
    return _csv("jarvis-entries.csv", header, rows)


@router.get("/export/weighins.csv", response_class=Response)
def export_weighins(user: CurrentUser, db: DB) -> Response:
    data = load_user_data(db, user)
    rows: list[list[object]] = [
        [w.day.isoformat(), w.weight_lb, w.note or ""] for w in data.weighins
    ]
    return _csv("jarvis-weigh-ins.csv", ["date", "weight_lb", "note"], rows)
