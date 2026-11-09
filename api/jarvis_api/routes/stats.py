"""Dashboard, exercises and forecasts. Everything is computed on read."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Path, Query

from jarvis_api import schemas
from jarvis_api.deps import DB, CurrentUser
from jarvis_api.errors import ApiError
from jarvis_api.serializers import (
    exercise_out,
    forecast_out,
    points,
    projection_out,
    set_ref,
    window_out,
)
from jarvis_api.services.logs import load_user_data
from jarvis_api.services.users import local_now
from jarvis_core import analysis
from jarvis_core.parser import normalize_exercise

router = APIRouter(tags=["stats"])

Days = Annotated[int, Query(ge=7, le=365)]
AheadDays = Annotated[int, Query(ge=1, le=365)]
ExerciseName = Annotated[str, Path(min_length=1, max_length=120)]


@router.get("/dashboard")
def dashboard(user: CurrentUser, db: DB, days: Days = 90) -> schemas.DashboardOut:
    data = load_user_data(db, user)
    today = local_now(user, datetime.now(UTC)).date()
    todays = [s for s in data.sets if s.day == today]
    weights = [w for w in analysis.daily_weights(data.weighins) if w.day > today - timedelta(days)]
    weight_today = next((w.weight_lb for w in weights if w.day == today), None)
    avg = analysis.moving_average(data.weighins)
    proj = analysis.weight_projection(data.weighins)
    lifts = analysis.top_lifts(data.sets)
    return schemas.DashboardOut(
        today=schemas.TodayOut(
            date=today,
            sets=len(todays),
            volume_lb=sum(analysis.set_volume(s) for s in todays),
            exercises=list(dict.fromkeys(s.exercise for s in todays if s.exercise)),
            weight_lb=weight_today,
        ),
        week=window_out(analysis.window_summary(data.sets, today)),
        previous_week=window_out(analysis.window_summary(data.sets, today - timedelta(days=7))),
        weekly=[window_out(w) for w in analysis.weekly_series(data.sets, today, weeks=8)],
        weight=schemas.WeightOut(
            points=points([(w.day, w.weight_lb) for w in weights]),
            average_7d=points(
                [(w.day, w.weight_lb) for w in avg if w.day > today - timedelta(days)]
            ),
            projection=projection_out(proj) if proj else None,
            flagged=points(
                [(w.day, w.weight_lb) for w in data.flagged if w.day > today - timedelta(days)]
            ),
        ),
        top_lifts=[
            schemas.TopLiftOut(
                exercise=e.exercise,
                sessions=e.sessions,
                latest_e1rm=e.latest_e1rm,
                best_e1rm=e.best_e1rm,
                e1rm_change=e.e1rm_change,
            )
            for e in lifts
        ],
    )


@router.get("/exercises")
def exercises(user: CurrentUser, db: DB) -> schemas.ExercisesOut:
    data = load_user_data(db, user)
    return schemas.ExercisesOut(
        exercises=[exercise_out(e) for e in analysis.exercise_summaries(data.sets)]
    )


def _resolve_name(name: str, known: set[str], canonical: str | None) -> str:
    n = normalize_exercise(name)
    if n in known:
        return n
    if canonical and canonical in known:
        return canonical
    raise ApiError(404, "not_found", "No sets logged for that exercise.")


@router.get("/exercises/{name}")
def exercise(
    name: ExerciseName, user: CurrentUser, db: DB, days: AheadDays = 28
) -> schemas.ExerciseDetailOut:
    data = load_user_data(db, user)
    known = {s.exercise for s in data.sets if s.exercise}
    resolved = _resolve_name(name, known, data.canonical(normalize_exercise(name)))
    detail = analysis.exercise_detail(data.sets, resolved)
    if detail is None:  # pragma: no cover - _resolve_name guarantees sets exist
        raise ApiError(404, "not_found", "No sets logged for that exercise.")
    forecast = analysis.lift_forecast(data.sets, resolved, days_ahead=days)
    return schemas.ExerciseDetailOut(
        summary=exercise_out(detail.summary),
        sessions=points(detail.sessions),
        best_set=set_ref(detail.best_set),
        heaviest_set=set_ref(detail.heaviest_set),
        last_session=[r for s in detail.last_session if (r := set_ref(s))],
        rep_targets=[schemas.RepTargetOut(reps=n, weight_lb=w) for n, w in detail.rep_targets],
        forecast=forecast_out(forecast) if forecast else None,
    )


@router.get("/exercises/{name}/forecast")
def exercise_forecast(
    name: ExerciseName,
    user: CurrentUser,
    db: DB,
    target: Annotated[float | None, Query(gt=0, le=2000, description="Target e1RM in lb")] = None,
    days: AheadDays = 28,
) -> schemas.ForecastOut:
    data = load_user_data(db, user)
    known = {s.exercise for s in data.sets if s.exercise}
    resolved = _resolve_name(name, known, data.canonical(normalize_exercise(name)))
    f = analysis.lift_forecast(data.sets, resolved, days_ahead=days, target_lb=target)
    if f is None:
        raise ApiError(
            422,
            "not_enough_data",
            "A forecast needs at least 4 sessions over 2 or more weeks in the last 90 days.",
        )
    return forecast_out(f)


@router.get("/weight/forecast")
def weight_forecast(user: CurrentUser, db: DB, days: AheadDays = 28) -> schemas.WeightForecastOut:
    data = load_user_data(db, user)
    p = analysis.weight_projection(data.weighins, days_ahead=days)
    return schemas.WeightForecastOut(
        projection=projection_out(p) if p else None,
        weigh_ins=len(analysis.daily_weights(data.weighins)),
    )
