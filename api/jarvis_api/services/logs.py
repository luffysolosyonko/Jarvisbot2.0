"""Saving logs, and turning stored rows back into analysis inputs.

Raw text is the source of truth. Sets and weigh-ins are derived by jarvis_core and
can be rebuilt from the logs at any time (see `rebuild`).
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

from sqlalchemy import and_, delete, or_, select
from sqlalchemy.orm import Session, selectinload

from jarvis_api.models import Alias, Log, LoggedSet, User, WeighIn
from jarvis_api.services.users import local_now
from jarvis_core import analysis
from jarvis_core.names import canonical_names
from jarvis_core.parser import PARSER_VERSION, DayContext, LogKind, ParsedLog, parse_log


def parse_for_user(
    db: Session,
    user: User,
    text: str,
    day: date,
    kind: LogKind | None = None,
    before: datetime | None = None,
) -> ParsedLog:
    """Parse with the user's settings and the context of earlier logs that day."""
    return parse_log(
        text,
        kind=kind,
        default_unit=user.settings.set_unit,
        context=day_context(db, user, day, before),
    )


def day_context(
    db: Session,
    user: User,
    day: date,
    before: datetime | None = None,
    before_id: int | None = None,
) -> DayContext | None:
    """Names and the last set carried over from the user's earlier workout logs on `day`.
    "Earlier" follows the (time, id) order logs are shown in: for a stored log pass its
    time and id; for a new one pass the time alone, and every log saved up to then counts,
    including one saved in the same instant."""
    q = select(Log).where(Log.user_id == user.id, Log.local_date == day, Log.kind == "workout")
    if before is not None and before_id is not None:
        q = q.where(or_(Log.logged_at < before, and_(Log.logged_at == before, Log.id < before_id)))
    elif before is not None:
        q = q.where(Log.logged_at <= before)
    ctx: DayContext | None = None
    for log in db.scalars(q.order_by(Log.logged_at, Log.id)):
        ctx = parse_log(
            log.raw_text,
            kind="workout",
            default_unit=user.settings.set_unit,
            context=ctx,
        ).context
    return ctx


def _store_parsed(log: Log, parsed: ParsedLog) -> None:
    log.kind = parsed.kind
    log.parser_version = PARSER_VERSION
    log.sets = [
        LoggedSet(
            user_id=log.user_id,
            idx=s.idx,
            line=s.line,
            exercise=s.exercise,
            reps=s.reps,
            good_reps=s.good_reps,
            failed_reps=s.failed_reps,
            weight_lb=s.weight_lb,
            weight_text=s.weight_text,
            flag=s.flag,
            estimated=s.estimated,
            bodyweight=s.bodyweight,
            per_hand=s.per_hand,
            inferred=s.inferred,
        )
        for s in parsed.sets
    ]
    w = parsed.weigh_in
    log.weigh_in = (
        WeighIn(
            user_id=log.user_id,
            weight_lb=w.weight_lb,
            note=w.note,
            typed=w.typed,
            typed_unit=w.typed_unit,
            unit_assumed=w.unit_assumed,
        )
        if w
        else None
    )


@dataclass(frozen=True)
class SaveResult:
    log: Log
    parsed: ParsedLog


def save_log(
    db: Session, user: User, text: str, now: datetime, kind: LogKind | None = None
) -> SaveResult | None:
    """Parse and store a log. Returns None (and stores nothing) if nothing parsed."""
    day = local_now(user, now).date()
    parsed = parse_for_user(db, user, text, day, kind, before=now)
    if not parsed.ok:
        return None
    if parsed.weigh_in and parsed.weigh_in.day_offset:
        day += timedelta(days=parsed.weigh_in.day_offset)
    log = Log(
        user_id=user.id,
        kind=parsed.kind,
        raw_text=text,
        logged_at=now,
        local_date=day,
        parser_version=PARSER_VERSION,
    )
    db.add(log)
    db.flush()
    _store_parsed(log, parsed)
    db.commit()
    db.refresh(log)
    return SaveResult(log, parsed)


def logs_between(db: Session, user: User, start: date, end: date) -> Sequence[Log]:
    return db.scalars(
        select(Log)
        .where(Log.user_id == user.id, Log.local_date >= start, Log.local_date <= end)
        .options(selectinload(Log.sets), selectinload(Log.weigh_in))
        .order_by(Log.logged_at.desc(), Log.id.desc())
    ).all()


def aliases_for(db: Session, user: User) -> dict[str, str]:
    return {a.short: a.full for a in db.scalars(select(Alias).where(Alias.user_id == user.id))}


@dataclass(frozen=True)
class UserData:
    sets: list[analysis.SetRow]  # prepared: canonical names, bodyweight loads
    weighins: list[analysis.WeightPoint]
    aliases: dict[str, str]
    name_counts: dict[str, int]  # raw normalized name -> sets (for matching new names)
    # canonical() answers, per name, for the life of this object (one request).
    _canon_memo: dict[str, str] = field(default_factory=dict, repr=False, compare=False)

    def canonical(self, name: str | None) -> str | None:
        if not name:
            return None
        if name not in self._canon_memo:  # the same answer every time: work it out once
            counts = dict(self.name_counts)
            counts[name] = counts.get(name, 0) + 1
            self._canon_memo[name] = canonical_names(counts, self.aliases)[name]
        return self._canon_memo[name]


def load_user_data(db: Session, user: User) -> UserData:
    rows = db.execute(
        select(LoggedSet, Log.local_date)
        .join(Log, LoggedSet.log_id == Log.id)
        .where(LoggedSet.user_id == user.id, Log.user_id == user.id)
        .order_by(Log.local_date, Log.logged_at, Log.id, LoggedSet.idx)
    ).all()
    raw = [
        analysis.SetRow(
            day=d,
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
            log_id=s.log_id,
            idx=s.idx,
        )
        for s, d in rows
    ]
    rows_w = db.execute(
        select(WeighIn, Log.local_date)
        .join(Log, WeighIn.log_id == Log.id)
        .where(WeighIn.user_id == user.id, Log.user_id == user.id)
        .order_by(Log.local_date, Log.logged_at, Log.id)
    ).all()
    weights = [analysis.WeightPoint(d, w.weight_lb, w.note) for w, d in rows_w]
    aliases = aliases_for(db, user)
    counts: dict[str, int] = {}
    for s in raw:
        if s.exercise:
            counts[s.exercise] = counts.get(s.exercise, 0) + 1
    return UserData(analysis.prepare(raw, weights, aliases), weights, aliases, counts)


def rebuild(db: Session, user: User, only_outdated: bool = True) -> int:
    """Re-derive sets and weigh-ins from raw text, day by day in order so same-day
    context carries over. Returns the number of logs re-parsed."""
    q = select(Log).where(Log.user_id == user.id)
    if only_outdated:
        days = db.scalars(
            select(Log.local_date)
            .where(Log.user_id == user.id, Log.parser_version < PARSER_VERSION)
            .distinct()
        ).all()
        if not days:
            return 0
        q = q.where(Log.local_date.in_(days))
    count = 0
    ctx: DayContext | None = None
    day: date | None = None
    for log in db.scalars(q.order_by(Log.local_date, Log.logged_at, Log.id)):
        if log.local_date != day:
            ctx, day = None, log.local_date
        ctx = _reparse(db, user, log, ctx)
        count += 1
    db.commit()
    return count


def _kind(log: Log) -> LogKind:
    return "weight" if log.kind == "weight" else "workout"


def _parse_stored(user: User, log: Log, ctx: DayContext | None) -> ParsedLog:
    kind = _kind(log)
    return parse_log(
        log.raw_text,
        kind=kind,
        default_unit=user.settings.set_unit,
        context=ctx if kind == "workout" else None,
    )


def _reparse(db: Session, user: User, log: Log, ctx: DayContext | None) -> DayContext | None:
    """Re-derive one log's rows from its text. Returns the context for the next log."""
    parsed = _parse_stored(user, log, ctx)
    db.execute(delete(LoggedSet).where(LoggedSet.log_id == log.id))
    db.execute(delete(WeighIn).where(WeighIn.log_id == log.id))
    db.expire(log, ["sets", "weigh_in"])
    _store_parsed(log, parsed)
    return parsed.context if _kind(log) == "workout" else ctx


def reparse_day(db: Session, user: User, day: date) -> None:
    """Re-parse every log on `day` in order, so names carried between logs stay right
    after one of them is edited or deleted."""
    ctx: DayContext | None = None
    q = select(Log).where(Log.user_id == user.id, Log.local_date == day)
    for log in db.scalars(q.order_by(Log.logged_at, Log.id)):
        ctx = _reparse(db, user, log, ctx)


def get_log(db: Session, user: User, log_id: int) -> Log | None:
    return db.scalar(select(Log).where(Log.id == log_id, Log.user_id == user.id))


def edit_log(
    db: Session,
    user: User,
    log: Log,
    text: str,
    kind: LogKind | None = None,
) -> ParsedLog | None:
    """Replace a log's text and re-parse it (the bot re-parsed edited messages).
    Returns None, changing nothing, if the new text doesn't parse."""
    kind = kind or _kind(log)
    ctx = (
        day_context(db, user, log.local_date, before=log.logged_at, before_id=log.id)
        if kind == "workout"
        else None
    )
    parsed = parse_log(
        text,
        kind=kind,
        default_unit=user.settings.set_unit,
        context=ctx,
    )
    if not parsed.ok:
        return None
    log.raw_text = text
    log.kind = kind
    db.flush()
    reparse_day(db, user, log.local_date)
    db.commit()
    db.refresh(log)
    return parsed


def delete_log(db: Session, user: User, log: Log) -> None:
    day = log.local_date
    db.delete(log)
    db.flush()
    reparse_day(db, user, day)
    db.commit()


def parse_logs(db: Session, user: User, logs: Sequence[Log]) -> dict[int, ParsedLog]:
    """Re-parse stored logs (with same-day context) to recover their warnings."""
    by_day: dict[date, list[Log]] = {}
    for log in logs:
        by_day.setdefault(log.local_date, []).append(log)
    out: dict[int, ParsedLog] = {}
    for day, day_logs in by_day.items():
        day_logs.sort(key=lambda lg: (lg.logged_at, lg.id))
        ctx = day_context(db, user, day, before=day_logs[0].logged_at, before_id=day_logs[0].id)
        for log in day_logs:
            parsed = _parse_stored(user, log, ctx)
            if _kind(log) == "workout":
                ctx = parsed.context
            out[log.id] = parsed
    return out
