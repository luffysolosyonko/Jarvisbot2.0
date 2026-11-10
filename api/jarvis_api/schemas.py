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
    outlier_pct: int


class MeOut(BaseModel):
    id: int
    email: str | None
    display_name: str | None
    auth_provider: str
    is_demo: bool
    created_at: datetime
    settings: SettingsOut


class SettingsPatch(Strict):
    # The name shown on your notebook messages; blank clears it (the email is used).
    display_name: str | None = Field(default=None, max_length=60)
    tz_name: str | None = Field(default=None, max_length=64)
    set_unit: Literal["lb", "kg"] | None = None
    bar_lb: float | None = Field(default=None, ge=0, le=100)
    outlier_pct: int | None = Field(default=None, ge=1, le=15)


class DataSummaryOut(BaseModel):
    sets: int
    weigh_ins: int


class DeleteAccountIn(Strict):
    confirm: Literal["DELETE"]


class ImportOut(BaseModel):
    imported: int
    duplicates: int
    unreadable: int
    aliases_added: int


# --- parse / logs ----------------------------------------------------------
Mode = Literal["workout", "weight"]


class LogIn(Strict):
    text: str = Field(min_length=1, max_length=MAX_LOG_CHARS)
    # The notebook's mode, like the bot's #workout and #weight channels. `kind` is the
    # older name for the same field. Neither given: detected from the text.
    mode: Mode | None = None
    kind: Mode | None = None

    @property
    def effective_mode(self) -> Mode | None:
        return self.mode or self.kind


class LogEditIn(Strict):
    text: str = Field(min_length=1, max_length=MAX_LOG_CHARS)
    mode: Mode | None = None  # omitted: keep the log's mode
    confirm_weight: bool = False  # the edit settles an outlying weigh-in ("It was 80 lb")


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
    typed: float | None = None  # the number as written
    typed_unit: Literal["kg", "lb"] = "lb"
    unit_assumed: bool = False  # no unit was written
    flagged: bool = False  # far from the 7-day average and not confirmed: left out of stats
    avg_7d: float | None = None  # the average it was compared with
    confirmed: bool = False


class FixOut(BaseModel):
    """A one-click repair: replace `line` with `text`, or with `template` once the
    user fills in its `{}`. `mode` also switches the log's mode."""

    label: str
    line: int
    text: str | None = None
    template: str | None = None
    placeholder: str | None = None
    mode: Mode | None = None


class WarningOut(BaseModel):
    line: int
    message: str
    code: str = "not_understood"
    fixes: list[FixOut] = []


class ExerciseMatchOut(BaseModel):
    written: str  # as typed (normalized)
    matched: str  # the canonical name it's counted under
    is_new: bool  # no sets logged under `matched` yet


class ParseOut(BaseModel):
    kind: Literal["workout", "weight"]
    sets: list[SetOut]
    weigh_in: WeighInOut | None
    warnings: list[WarningOut]
    exercises: list[ExerciseMatchOut] = []


class LogOut(BaseModel):
    id: int
    kind: Literal["workout", "weight"]
    raw_text: str
    logged_at: datetime
    local_date: date
    sets: list[SetOut]
    weigh_in: WeighInOut | None
    warnings: list[WarningOut] = []  # lines that weren't logged, with fixes


class SavedLogOut(LogOut):
    pass


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
    flagged: list[Point] = []  # outlying weigh-ins awaiting confirmation (not in the stats)


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


# --- tools ---------------------------------------------------------------
class TodayLogsOut(BaseModel):
    date: date
    logs: list[LogOut]  # oldest first
    sets: int
    volume_lb: float
    exercises: list[str]
    weight_lb: float | None


class ExerciseVolumeOut(BaseModel):
    exercise: str
    sets: int
    good_reps: int
    volume_lb: float


class StatsOut(BaseModel):
    days: int
    start: date
    end: date
    gym_days: int
    gym_days_per_week: float
    sets: int
    good_reps: int
    failed_reps: int
    volume_lb: float
    weight_start_lb: float | None
    weight_end_lb: float | None
    weight_change_lb: float | None


class VolumeOut(BaseModel):
    days: int
    start: date
    end: date
    exercises: list[ExerciseVolumeOut]


class CalendarDayOut(BaseModel):
    date: date
    has_workout: bool
    has_weight: bool
    sets: int
    volume_lb: float
    weight_lb: float | None


class CalendarOut(BaseModel):
    month: str  # YYYY-MM
    days: list[CalendarDayOut]  # every day of the month
    workouts: int
    sets: int
    volume_lb: float
    weight_change_lb: float | None


class SearchOut(BaseModel):
    query: str
    logs: list[LogOut]  # newest first
    truncated: bool


class UsageOut(BaseModel):
    today: int
    week: int  # last 7 days
    month: int  # since the 1st
    questions_month: int
    daily_token_cap: int


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


class AliasMatchOut(BaseModel):
    written: str  # a name as typed (normalized)
    matched: str  # the exercise it's counted under
    sets: int


class AliasMatchesOut(BaseModel):
    matches: list[AliasMatchOut]


# --- ask -----------------------------------------------------------------
class AskIn(Strict):
    question: str = Field(min_length=3, max_length=500)


class AskOut(BaseModel):
    id: int
    asked_at: datetime
    question: str
    answer: str
    input_tokens: int
    output_tokens: int
    tokens_used_today: int
    daily_token_cap: int
    topics: list[str]


class AskMessageOut(BaseModel):
    id: int
    asked_at: datetime
    question: str
    answer: str
    input_tokens: int
    output_tokens: int


class AskHistoryOut(BaseModel):
    messages: list[AskMessageOut]  # oldest first


class ClearedOut(BaseModel):
    cleared: int
