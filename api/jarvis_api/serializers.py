"""Map engine dataclasses and ORM rows to response models."""

from __future__ import annotations

from collections.abc import Callable
from datetime import date
from typing import Literal

from jarvis_api import schemas
from jarvis_api.models import Log, LoggedSet
from jarvis_core import analysis
from jarvis_core.parser import ParsedLog, ParsedSet

Canon = Callable[[str | None], str | None]


def set_out(s: ParsedSet | LoggedSet, canonical: Canon) -> schemas.SetOut:
    return schemas.SetOut(
        idx=s.idx,
        line=s.line,
        exercise=s.exercise,
        matched_exercise=canonical(s.exercise),
        reps=s.reps,
        good_reps=s.good_reps,
        failed_reps=s.failed_reps,
        weight_lb=s.weight_lb,
        weight_text=s.weight_text,
        estimated=s.estimated,
        bodyweight=s.bodyweight,
        per_hand=s.per_hand,
        inferred=s.inferred,
    )


def parse_out(p: ParsedLog, canonical: Canon) -> schemas.ParseOut:
    return schemas.ParseOut(
        kind=p.kind,
        sets=[set_out(s, canonical) for s in p.sets],
        weigh_in=schemas.WeighInOut(weight_lb=p.weigh_in.weight_lb, note=p.weigh_in.note)
        if p.weigh_in
        else None,
        warnings=[schemas.WarningOut(line=w.line, message=w.message) for w in p.warnings],
    )


def log_out(log: Log, canonical: Canon) -> schemas.LogOut:
    kind: Literal["workout", "weight"] = "weight" if log.kind == "weight" else "workout"
    return schemas.LogOut(
        id=log.id,
        kind=kind,
        raw_text=log.raw_text,
        logged_at=log.logged_at,
        local_date=log.local_date,
        sets=[set_out(s, canonical) for s in log.sets],
        weigh_in=schemas.WeighInOut(weight_lb=log.weigh_in.weight_lb, note=log.weigh_in.note)
        if log.weigh_in
        else None,
    )


def projection_out(p: analysis.Projection) -> schemas.ProjectionOut:
    return schemas.ProjectionOut(
        slope_per_week=p.slope_per_week,
        now=p.now,
        last_date=p.last_day,
        target_date=p.target_day,
        pred=p.pred,
        low=p.low,
        high=p.high,
        points=p.points,
        span_days=p.span_days,
        line=[
            schemas.Point(date=p.last_day, value=p.now),
            schemas.Point(date=p.target_day, value=p.pred),
        ],
    )


def window_out(w: analysis.WindowSummary) -> schemas.WindowOut:
    return schemas.WindowOut(
        start=w.start,
        end=w.end,
        sessions=w.sessions,
        sets=w.sets,
        good_reps=w.good_reps,
        failed_reps=w.failed_reps,
        volume_lb=w.volume_lb,
    )


def exercise_out(e: analysis.ExerciseSummary) -> schemas.ExerciseOut:
    return schemas.ExerciseOut(
        exercise=e.exercise,
        sets=e.sets,
        sessions=e.sessions,
        first_date=e.first_day,
        last_date=e.last_day,
        best_e1rm=e.best_e1rm,
        latest_e1rm=e.latest_e1rm,
        e1rm_change=e.e1rm_change,
        per_hand=e.per_hand,
    )


def set_ref(s: analysis.SetRow | None) -> schemas.SetRefOut | None:
    if s is None:
        return None
    return schemas.SetRefOut(
        date=s.day,
        reps=s.reps,
        good_reps=s.good_reps,
        failed_reps=s.failed_reps,
        weight_lb=s.weight_lb,
        estimated=s.estimated,
        bodyweight=s.bodyweight,
        per_hand=s.per_hand,
        e1rm=analysis.epley(s.weight_lb, s.good_reps),
    )


def points(pairs: list[tuple[date, float]]) -> list[schemas.Point]:
    return [schemas.Point(date=d, value=v) for d, v in pairs]


def forecast_out(f: analysis.LiftForecast) -> schemas.ForecastOut:
    reach_kind: Literal["date", "already", "flat"] | None
    reach_date: date | None = None
    if isinstance(f.reach, date):
        reach_kind, reach_date = "date", f.reach
    elif f.reach == "already":
        reach_kind = "already"
    elif f.reach == "flat":
        reach_kind = "flat"
    else:
        reach_kind = None
    return schemas.ForecastOut(
        exercise=f.exercise,
        best_e1rm=f.best,
        target_lb=f.target_lb,
        reach=reach_kind,
        reach_date=reach_date,
        optimistic=f.optimistic,
        projection=projection_out(f.projection),
    )
