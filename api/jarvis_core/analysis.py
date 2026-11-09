"""Rollups, stats, projections and lift forecasts. Pure functions over plain data.

All weights are in lb. Derived values (e1RM, volume, projections) are computed on
read from stored sets and weigh-ins, never stored.
"""

from __future__ import annotations

import math
import statistics
from bisect import bisect_right
from collections import defaultdict
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, replace
from datetime import date, timedelta
from typing import Literal

from jarvis_core.names import canonical_names
from jarvis_core.parser import ParsedSet

REP_TARGETS = (1, 3, 5, 8, 10, 12)
WARMUP_RATIO = 0.6


# ---------------------------------------------------------------------------
# Inputs
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class SetRow:
    day: date
    exercise: str | None
    reps: int
    good_reps: int
    failed_reps: int
    weight_lb: float | None
    estimated: bool = False
    bodyweight: bool = False
    per_hand: bool = False
    weight_text: str | None = None
    flag: str | None = None
    log_id: int = 0
    idx: int = 0


def rows_from_parsed(sets: Iterable[ParsedSet], day: date, log_id: int = 0) -> list[SetRow]:
    return [
        SetRow(
            day=day,
            exercise=s.exercise,
            reps=s.reps,
            good_reps=s.good_reps,
            failed_reps=s.failed_reps,
            weight_lb=s.weight_lb,
            estimated=s.estimated,
            bodyweight=s.bodyweight,
            per_hand=s.per_hand,
            weight_text=s.weight_text,
            flag=s.flag,
            log_id=log_id,
            idx=s.idx,
        )
        for s in sets
    ]


@dataclass(frozen=True)
class WeightPoint:
    day: date
    weight_lb: float
    note: str | None = None


# ---------------------------------------------------------------------------
# Preparing sets
# ---------------------------------------------------------------------------
def canonicalize(sets: Sequence[SetRow], aliases: Mapping[str, str] | None = None) -> list[SetRow]:
    """Unify exercise names through aliases and learned abbreviations."""
    counts: dict[str, int] = defaultdict(int)
    for s in sets:
        if s.exercise:
            counts[s.exercise] += 1
    mapping = canonical_names(counts, aliases)
    return [
        replace(s, exercise=mapping.get(s.exercise, s.exercise)) if s.exercise else s for s in sets
    ]


def daily_weights(weighins: Iterable[WeightPoint]) -> list[WeightPoint]:
    """One weigh-in per day (the last one logged that day), sorted by day."""
    by_day: dict[date, float] = {}
    for w in weighins:
        by_day[w.day] = w.weight_lb
    return [WeightPoint(d, by_day[d]) for d in sorted(by_day)]


def fill_bodyweight(sets: Sequence[SetRow], weighins: Sequence[WeightPoint]) -> list[SetRow]:
    """A bodyweight set ('10x uw dips') lifts your latest weigh-in on or before that day."""
    w = daily_weights(weighins)
    days = [p.day for p in w]
    out = []
    for s in sets:
        if s.bodyweight and s.weight_lb is None and days:
            i = bisect_right(days, s.day) - 1
            if i >= 0:
                s = replace(s, weight_lb=w[i].weight_lb)
        out.append(s)
    return out


def prepare(
    sets: Sequence[SetRow],
    weighins: Sequence[WeightPoint] = (),
    aliases: Mapping[str, str] | None = None,
) -> list[SetRow]:
    """Canonical names and bodyweight loads: the form every analysis below expects."""
    return fill_bodyweight(canonicalize(sets, aliases), weighins)


# ---------------------------------------------------------------------------
# Per-set math
# ---------------------------------------------------------------------------
def epley(weight_lb: float | None, good_reps: int) -> float | None:
    """1RM = weight x (1 + good reps / 30). Failed reps don't count; a set with no
    good reps gets no estimate. Reps are capped at 30."""
    if weight_lb is None or weight_lb <= 0 or good_reps <= 0:
        return None
    return weight_lb * (1 + min(good_reps, 30) / 30)


def set_volume(s: SetRow) -> float:
    """Good reps x load; a per-hand weight counts twice."""
    if s.weight_lb is None:
        return 0.0
    return s.good_reps * s.weight_lb * (2 if s.per_hand else 1)


def rep_targets(e1rm: float) -> list[tuple[int, float]]:
    """What you could likely lift for 1, 3, 5, 8, 10 and 12 reps (inverse Epley)."""
    return [(n, e1rm if n == 1 else e1rm / (1 + n / 30)) for n in REP_TARGETS]


# ---------------------------------------------------------------------------
# Rollups
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class DayRollup:
    day: date
    weight_lb: float | None
    sets: int
    good_reps: int
    failed_reps: int
    volume_lb: float

    @property
    def trained(self) -> bool:
        return self.sets > 0


def daily_rollup(
    sets: Sequence[SetRow], weighins: Sequence[WeightPoint], start: date, end: date
) -> list[DayRollup]:
    """One row per calendar day from start to end. Weight is None when not logged."""
    weights = {p.day: p.weight_lb for p in daily_weights(weighins)}
    by_day: dict[date, list[SetRow]] = defaultdict(list)
    for s in sets:
        by_day[s.day].append(s)
    out = []
    d = start
    while d <= end:
        rows = by_day.get(d, [])
        out.append(
            DayRollup(
                day=d,
                weight_lb=weights.get(d),
                sets=len(rows),
                good_reps=sum(s.good_reps for s in rows),
                failed_reps=sum(s.failed_reps for s in rows),
                volume_lb=sum(set_volume(s) for s in rows),
            )
        )
        d += timedelta(days=1)
    return out


@dataclass(frozen=True)
class ExerciseVolume:
    exercise: str
    sets: int
    good_reps: int
    volume_lb: float


@dataclass(frozen=True)
class WindowSummary:
    start: date
    end: date
    sessions: int
    sets: int
    good_reps: int
    failed_reps: int
    volume_lb: float
    by_exercise: list[ExerciseVolume]


def window_summary(sets: Sequence[SetRow], end: date, days: int = 7) -> WindowSummary:
    """Sets, reps and volume for the `days` days ending on `end` (inclusive)."""
    start = end - timedelta(days=days - 1)
    rows = [s for s in sets if start <= s.day <= end]
    per: dict[str, list[SetRow]] = defaultdict(list)
    for s in rows:
        per[s.exercise or "unnamed"].append(s)
    by_ex = sorted(
        (
            ExerciseVolume(name, len(g), sum(s.good_reps for s in g), sum(set_volume(s) for s in g))
            for name, g in per.items()
        ),
        key=lambda e: (-e.sets, e.exercise),
    )
    return WindowSummary(
        start=start,
        end=end,
        sessions=len({s.day for s in rows}),
        sets=len(rows),
        good_reps=sum(s.good_reps for s in rows),
        failed_reps=sum(s.failed_reps for s in rows),
        volume_lb=sum(set_volume(s) for s in rows),
        by_exercise=by_ex,
    )


def weekly_series(sets: Sequence[SetRow], end: date, weeks: int = 8) -> list[WindowSummary]:
    """Rolling 7-day windows ending on `end`, oldest first."""
    return [window_summary(sets, end - timedelta(days=7 * k), 7) for k in reversed(range(weeks))]


def moving_average(
    weighins: Sequence[WeightPoint], window_days: int = 7, min_points: int = 3
) -> list[WeightPoint]:
    """Trailing average of the weigh-ins in the last `window_days` days, at each weigh-in
    day. Days with fewer than `min_points` weigh-ins in the window are skipped."""
    w = daily_weights(weighins)
    out = []
    for i, p in enumerate(w):
        lo = p.day - timedelta(days=window_days - 1)
        vals = [q.weight_lb for q in w[: i + 1] if q.day >= lo]
        if len(vals) >= min_points:
            out.append(WeightPoint(p.day, sum(vals) / len(vals)))
    return out


# ---------------------------------------------------------------------------
# Projection (shared by body weight and lifts)
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class Projection:
    """A straight-line fit with a ~95% prediction range at `target_day`."""

    origin: date
    intercept: float
    slope_per_day: float
    first_day: date
    last_day: date
    now: float  # fitted value at last_day
    target_day: date
    pred: float
    low: float
    high: float
    points: int
    span_days: int

    @property
    def slope_per_week(self) -> float:
        return self.slope_per_day * 7

    def at(self, day: date) -> float:
        return self.intercept + self.slope_per_day * (day - self.origin).days


def project(
    points: Sequence[tuple[date, float]],
    days_ahead: int = 28,
    lookback: int = 90,
    min_points: int = 3,
    min_span_days: int = 0,
) -> Projection | None:
    """Least-squares line through the points of the last `lookback` days."""
    if not points:
        return None
    pts = sorted(points)
    last = pts[-1][0]
    recent = [(d, v) for d, v in pts if d >= last - timedelta(days=lookback)]
    if len(recent) < min_points:
        return None
    origin = recent[0][0]
    span = (last - origin).days
    if span < max(min_span_days, 1):
        return None
    xs = [float((d - origin).days) for d, _ in recent]
    ys = [v for _, v in recent]
    n = len(xs)
    xbar, ybar = sum(xs) / n, sum(ys) / n
    sxx = sum((x - xbar) ** 2 for x in xs) or 1.0
    slope = sum((x - xbar) * (y - ybar) for x, y in zip(xs, ys, strict=True)) / sxx
    intercept = ybar - slope * xbar
    ssr = sum((y - (intercept + slope * x)) ** 2 for x, y in zip(xs, ys, strict=True))
    s = math.sqrt(ssr / max(n - 2, 1))
    x0 = xs[-1] + days_ahead
    pred = intercept + slope * x0
    se = s * math.sqrt(1 + 1 / n + (x0 - xbar) ** 2 / sxx)
    return Projection(
        origin=origin,
        intercept=intercept,
        slope_per_day=slope,
        first_day=origin,
        last_day=last,
        now=intercept + slope * xs[-1],
        target_day=last + timedelta(days=days_ahead),
        pred=pred,
        low=pred - 1.96 * se,
        high=pred + 1.96 * se,
        points=n,
        span_days=span + 1,
    )


MIN_WEIGH_INS = 10


def weight_projection(
    weighins: Sequence[WeightPoint], days_ahead: int = 28, lookback: int = 60
) -> Projection | None:
    """Body-weight trend. Needs 10+ weigh-ins overall and 3+ in the lookback."""
    w = daily_weights(weighins)
    if len(w) < MIN_WEIGH_INS:
        return None
    return project([(p.day, p.weight_lb) for p in w], days_ahead, lookback, min_points=3)


# ---------------------------------------------------------------------------
# Lifts
# ---------------------------------------------------------------------------
def drop_warmup_days(sessions: list[tuple[date, float]]) -> list[tuple[date, float]]:
    """A session whose best is under 60% of the usual (e.g. only the empty bar that day)
    is a warm-up or technique day, not a strength test, so it's left out."""
    if len(sessions) < 3:
        return sessions
    med = statistics.median(v for _, v in sessions)
    return [(d, v) for d, v in sessions if v >= WARMUP_RATIO * med]


def lift_sessions(sets: Sequence[SetRow], exercise: str) -> list[tuple[date, float]]:
    """Best estimated 1RM per session for one exercise, oldest first. Uses sets of 1-12
    good reps, where Epley is most accurate; falls back to all weighted sets if the
    exercise is only ever done for higher reps. Warm-up-only days are dropped."""
    rows = [
        (s, e)
        for s in sets
        if s.exercise == exercise and (e := epley(s.weight_lb, s.good_reps)) is not None
    ]
    accurate = [(s, e) for s, e in rows if 1 <= s.good_reps <= 12]
    rows = accurate or rows
    best: dict[date, float] = {}
    for s, e in rows:
        best[s.day] = max(best.get(s.day, 0.0), e)
    return drop_warmup_days(sorted(best.items()))


Reach = date | Literal["already", "flat"] | None


@dataclass(frozen=True)
class LiftForecast:
    exercise: str
    projection: Projection
    best: float
    target_lb: float | None
    reach: Reach

    @property
    def optimistic(self) -> bool:
        """Far-out projections overstate gains, which usually slow down."""
        p = self.projection
        far_target = isinstance(self.reach, date) and (self.reach - p.last_day).days > 180
        return (p.target_day - p.last_day).days > 120 or far_target


MIN_LIFT_SESSIONS = 4
MIN_LIFT_SPAN_DAYS = 14


def lift_forecast(
    sets: Sequence[SetRow],
    exercise: str,
    days_ahead: int = 28,
    target_lb: float | None = None,
    lookback: int = 90,
) -> LiftForecast | None:
    """Where an exercise's e1RM is heading. Needs 4+ sessions over 2+ weeks in the last
    90 days. `reach` is the projected date to hit `target_lb`, 'already' if the fit or
    best is at or above it, or 'flat' if the trend isn't going up."""
    sessions = lift_sessions(sets, exercise)
    p = project(sessions, days_ahead, lookback, MIN_LIFT_SESSIONS, MIN_LIFT_SPAN_DAYS)
    if p is None:
        return None
    best = max(v for _, v in sessions)
    reach: Reach = None
    if target_lb is not None:
        if p.now >= target_lb or best >= target_lb:
            reach = "already"
        elif p.slope_per_day > 0:
            x_target = (target_lb - p.intercept) / p.slope_per_day
            days = x_target - (p.last_day - p.origin).days
            reach = p.last_day + timedelta(days=math.ceil(days))
        else:
            reach = "flat"
    return LiftForecast(exercise, p, best, target_lb, reach)


@dataclass(frozen=True)
class ExerciseSummary:
    exercise: str
    sets: int
    sessions: int
    first_day: date
    last_day: date
    good_reps: int
    failed_reps: int
    best_e1rm: float | None
    latest_e1rm: float | None  # best e1RM in the most recent session with one
    e1rm_change: float | None  # mean of last k sessions minus mean of first k (k <= 3)
    per_hand: bool


def _trend_change(sessions: list[tuple[date, float]]) -> float | None:
    if len(sessions) < 2:
        return None
    k = min(3, len(sessions) // 2)
    first = sum(v for _, v in sessions[:k]) / k
    last = sum(v for _, v in sessions[-k:]) / k
    return last - first


def exercise_summaries(sets: Sequence[SetRow]) -> list[ExerciseSummary]:
    """Every named exercise, most sets first."""
    per: dict[str, list[SetRow]] = defaultdict(list)
    for s in sets:
        if s.exercise:
            per[s.exercise].append(s)
    out = []
    for name, rows in per.items():
        e1rms = [e for s in rows if (e := epley(s.weight_lb, s.good_reps)) is not None]
        sessions = lift_sessions(rows, name)
        out.append(
            ExerciseSummary(
                exercise=name,
                sets=len(rows),
                sessions=len({s.day for s in rows}),
                first_day=min(s.day for s in rows),
                last_day=max(s.day for s in rows),
                good_reps=sum(s.good_reps for s in rows),
                failed_reps=sum(s.failed_reps for s in rows),
                best_e1rm=max(e1rms) if e1rms else None,
                latest_e1rm=sessions[-1][1] if sessions else None,
                e1rm_change=_trend_change(sessions),
                per_hand=any(s.per_hand for s in rows),
            )
        )
    return sorted(out, key=lambda e: (-e.sets, e.exercise))


@dataclass(frozen=True)
class ExerciseDetail:
    summary: ExerciseSummary
    best_set: SetRow | None  # highest e1RM
    best_set_e1rm: float | None
    heaviest_set: SetRow | None  # heaviest load (non-bodyweight preferred)
    last_session: list[SetRow]
    sessions: list[tuple[date, float]]
    rep_targets: list[tuple[int, float]]  # from the latest session's e1RM


def exercise_detail(sets: Sequence[SetRow], exercise: str) -> ExerciseDetail | None:
    rows = [s for s in sets if s.exercise == exercise]
    if not rows:
        return None
    summary = next(e for e in exercise_summaries(rows) if e.exercise == exercise)
    scored = [(s, e) for s in rows if (e := epley(s.weight_lb, s.good_reps)) is not None]
    best_set, best_e = max(scored, key=lambda t: t[1]) if scored else (None, None)
    weighted = [s for s in rows if s.weight_lb is not None]
    pool = [s for s in weighted if not s.bodyweight] or weighted
    heaviest = max(pool, key=lambda s: (s.weight_lb or 0.0, s.good_reps)) if pool else None
    last_day = summary.last_day
    last = sorted((s for s in rows if s.day == last_day), key=lambda s: (s.log_id, s.idx))
    sessions = lift_sessions(rows, exercise)
    targets = rep_targets(sessions[-1][1]) if sessions else []
    return ExerciseDetail(summary, best_set, best_e, heaviest, last, sessions, targets)
