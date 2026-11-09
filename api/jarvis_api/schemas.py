"""Request and response models. All weights are in lb; the app converts for display."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

MAX_LOG_CHARS = 2000


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


# --- me --------------------------------------------------------------------
class SettingsOut(BaseModel):
    tz_name: str
    set_unit: Literal["lb", "kg"]
    bar_lb: float


class MeOut(BaseModel):
    id: int
    email: str | None
    display_name: str | None
    auth_provider: str
    is_demo: bool
    created_at: datetime
    settings: SettingsOut


class SettingsPatch(Strict):
    tz_name: str | None = Field(default=None, max_length=64)
    set_unit: Literal["lb", "kg"] | None = None
    bar_lb: float | None = Field(default=None, ge=0, le=100)


# --- parse / logs ----------------------------------------------------------
class LogIn(Strict):
    text: str = Field(min_length=1, max_length=MAX_LOG_CHARS)
    kind: Literal["workout", "weight"] | None = None


class SetOut(BaseModel):
    idx: int
    line: int
    exercise: str | None  # as written (normalized)
    matched_exercise: str | None  # canonical name used in stats
    reps: int
    good_reps: int
    failed_reps: int
    weight_lb: float | None
    weight_text: str | None
    estimated: bool
    bodyweight: bool
    per_hand: bool
    inferred: bool


class WeighInOut(BaseModel):
    weight_lb: float
    note: str | None


class WarningOut(BaseModel):
    line: int
    message: str


class ParseOut(BaseModel):
    kind: Literal["workout", "weight"]
    sets: list[SetOut]
    weigh_in: WeighInOut | None
    warnings: list[WarningOut]


class LogOut(BaseModel):
    id: int
    kind: Literal["workout", "weight"]
    raw_text: str
    logged_at: datetime
    local_date: date
    sets: list[SetOut]
    weigh_in: WeighInOut | None


class SavedLogOut(LogOut):
    warnings: list[WarningOut]


class LogsOut(BaseModel):
    logs: list[LogOut]


# --- analytics -------------------------------------------------------------
class Point(BaseModel):
    date: date
    value: float


class ProjectionOut(BaseModel):
    slope_per_week: float
    now: float
    last_date: date
    target_date: date
    pred: float
    low: float
    high: float
    points: int
    span_days: int
    line: list[Point]  # two points: (last_date, now) -> (target_date, pred)


class TodayOut(BaseModel):
    date: date
    sets: int
    volume_lb: float
    exercises: list[str]
    weight_lb: float | None


class WindowOut(BaseModel):
    start: date
    end: date
    sessions: int
    sets: int
    good_reps: int
    failed_reps: int
    volume_lb: float


class TopLiftOut(BaseModel):
    exercise: str
    sessions: int
    latest_e1rm: float | None
    best_e1rm: float | None
    e1rm_change: float | None


class WeightOut(BaseModel):
    points: list[Point]
    average_7d: list[Point]
    projection: ProjectionOut | None


class DashboardOut(BaseModel):
    today: TodayOut
    week: WindowOut
    previous_week: WindowOut
    weekly: list[WindowOut]
    weight: WeightOut
    top_lifts: list[TopLiftOut]


class ExerciseOut(BaseModel):
    exercise: str
    sets: int
    sessions: int
    good_reps: int
    failed_reps: int
    first_date: date
    last_date: date
    best_e1rm: float | None
    latest_e1rm: float | None
    e1rm_change: float | None
    per_hand: bool


class ExercisesOut(BaseModel):
    exercises: list[ExerciseOut]


class SetRefOut(BaseModel):
    date: date
    reps: int
    good_reps: int
    failed_reps: int
    weight_lb: float | None
    estimated: bool
    bodyweight: bool
    per_hand: bool
    e1rm: float | None


class RepTargetOut(BaseModel):
    reps: int
    weight_lb: float


class ForecastOut(BaseModel):
    exercise: str
    best_e1rm: float
    target_lb: float | None
    reach: Literal["date", "already", "flat"] | None
    reach_date: date | None
    optimistic: bool
    projection: ProjectionOut


class ExerciseDetailOut(BaseModel):
    summary: ExerciseOut
    sessions: list[Point]  # best e1RM per session
    best_set: SetRefOut | None
    heaviest_set: SetRefOut | None
    last_session: list[SetRefOut]
    rep_targets: list[RepTargetOut]
    forecast: ForecastOut | None


class WeightForecastOut(BaseModel):
    projection: ProjectionOut | None
    weigh_ins: int


# --- aliases ---------------------------------------------------------------
class AliasIn(Strict):
    short: str = Field(min_length=1, max_length=40, pattern=r"^[A-Za-z0-9 ]+$")
    full: str = Field(min_length=1, max_length=120, pattern=r"^[A-Za-z0-9 ]+$")


class AliasOut(BaseModel):
    id: int
    short: str
    full: str


class AliasesOut(BaseModel):
    aliases: list[AliasOut]


# --- ask -----------------------------------------------------------------
class AskIn(Strict):
    question: str = Field(min_length=3, max_length=500)


class AskOut(BaseModel):
    answer: str
    input_tokens: int
    output_tokens: int
    tokens_used_today: int
    daily_token_cap: int
    topics: list[str]


# --- demo ------------------------------------------------------------------
class DemoTokenOut(BaseModel):
    token: str
