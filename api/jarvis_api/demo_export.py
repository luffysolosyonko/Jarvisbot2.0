"""Turn an exported training history (two tab-separated files) into notebook entries.

    workouts.tsv  date, time, exercise, reps, good_reps, failed_reps, weight_lb,
                  estimated (Y/N), bodyweight (Y/N), est_1rm_lb, message_id
    weighins.tsv  date, time, weight_lb, text as typed, message_id

No header row. Dates and times are local wall-clock time ("2026-03-02", "6:05 PM").
Rows that share a message id were typed as one entry. A blank weight means none was
written. The estimated 1RM and the weigh-in message id are not used.

Each entry is rewritten in the notebook's own shorthand, so it is stored and re-parsed
like anything typed by hand:

    10x 20lb lateral raise     a set
    12x ^                      the same exercise and weight again
    6xf pull ups               6 tried, the last failed
    5x3f 60kg squat            5 good reps and 3 failed
    8x uw dips                 bodyweight
    8x ?70lb incline           an estimated weight ("8x ? incline" when unknown)

Every entry is parsed here and compared with its rows: a row that would be stored
differently stops the load with the rows named, before anything is saved.
"""

from __future__ import annotations

import csv
import re
from collections.abc import Iterator, Sequence
from dataclasses import dataclass, field, replace
from datetime import datetime
from itertools import groupby
from pathlib import Path

from jarvis_core.parser import (
    KG_TO_LB,
    MAX_CHARS,
    MAX_LINES,
    LogKind,
    ParsedLog,
    ParsedSet,
    normalize_exercise,
    parse_log,
)

WORKOUTS_FILE = "workouts.tsv"
WEIGHINS_FILE = "weighins.tsv"
ALIASES_FILE = "aliases.tsv"  # optional
SET_TOLERANCE_LB = 0.05
WEIGH_IN_TOLERANCE_LB = 0.06
_EPS = 1e-9

TIME_RE = re.compile(r"^(\d{1,2}):(\d{2})\s*([AP])M$", re.I)
# Words an older export left inside some exercise names: sides, units and failure marks.
NAME_NOISE = {"l", "r", "bw", "uw", "f", "x", "xf", "lb", "lbs", "kg", "kgs"}


class DemoDataError(ValueError):
    """The export can't be loaded exactly as written."""


@dataclass(frozen=True)
class SetRow:
    """One line of workouts.tsv."""

    line: int  # 1-based line in the file
    at: datetime  # local, naive
    exercise: str  # inside an Entry: the name the set is stored under
    reps: int
    good_reps: int
    failed_reps: int
    weight_lb: float | None
    estimated: bool
    bodyweight: bool
    group: str  # rows with the same group were typed as one entry


@dataclass(frozen=True)
class Entry:
    """One notebook entry to save."""

    at: datetime  # local, naive
    text: str
    kind: LogKind | None = None  # None: detected from the text
    rows: tuple[SetRow, ...] = ()  # workout entries from an export: one row per set
    weight_lb: float | None = None  # weigh-in entries from an export


@dataclass(frozen=True)
class Export:
    entries: list[Entry]  # oldest first
    renamed: dict[str, str]  # exercise names that couldn't be kept -> the name used
    sets: int
    weigh_ins: int
    aliases: dict[str, str] = field(default_factory=dict)  # short name -> full name


def has_export(folder: Path) -> bool:
    return (folder / WORKOUTS_FILE).is_file() and (folder / WEIGHINS_FILE).is_file()


# ---------------------------------------------------------------------------
# Reading the files
# ---------------------------------------------------------------------------
def _records(path: Path, columns: int) -> Iterator[tuple[int, list[str]]]:
    with path.open(encoding="utf-8-sig", newline="") as f:
        for n, rec in enumerate(csv.reader(f, delimiter="\t", quoting=csv.QUOTE_NONE), start=1):
            if not any(cell.strip() for cell in rec):
                continue
            if len(rec) < columns:
                raise DemoDataError(f"{path.name} line {n}: expected {columns} columns")
            yield n, [cell.strip() for cell in rec]


def _when(day: str, clock: str, where: str) -> datetime:
    m = TIME_RE.match(clock)
    try:
        if not m or not 1 <= int(m.group(1)) <= 12:
            raise ValueError(clock)
        hour = int(m.group(1)) % 12 + (12 if m.group(3).upper() == "P" else 0)
        return datetime.fromisoformat(day).replace(hour=hour, minute=int(m.group(2)))
    except ValueError as exc:
        raise DemoDataError(f"{where}: bad date or time {day!r} {clock!r}") from exc


def _flag(value: str, where: str) -> bool:
    if value.upper() not in ("Y", "N"):
        raise DemoDataError(f"{where}: expected Y or N, got {value!r}")
    return value.upper() == "Y"


def read_workouts(path: Path) -> list[SetRow]:
    rows = []
    for n, rec in _records(path, 11):
        where = f"{path.name} line {n}"
        try:
            reps, good, failed = int(rec[3]), int(rec[4]), int(rec[5])
            weight = float(rec[6]) if rec[6] else None
        except ValueError as exc:
            raise DemoDataError(f"{where}: bad number") from exc
        rows.append(
            SetRow(
                line=n,
                at=_when(rec[0], rec[1], where),
                exercise=rec[2],
                reps=reps,
                good_reps=good,
                failed_reps=failed,
                weight_lb=weight,
                estimated=_flag(rec[7], where),
                bodyweight=_flag(rec[8], where),
                group=rec[10] or f"line {n}",
            )
        )
    return rows


# ---------------------------------------------------------------------------
# Rows -> shorthand
# ---------------------------------------------------------------------------
def _head(r: SetRow) -> str:
    """The reps part of a set line: "8x", "6xf" (the last of 6 failed), "5x3f"."""
    if r.failed_reps == 0 and r.reps == r.good_reps:
        return f"{r.reps}x"
    if r.failed_reps == 1 and r.reps == r.good_reps + 1:
        return f"{r.reps}xf"
    if r.failed_reps >= 1 and r.reps in (r.good_reps, r.good_reps + r.failed_reps):
        return f"{r.good_reps}x{r.failed_reps}f"
    raise DemoDataError(
        f"{WORKOUTS_FILE} line {r.line}: no shorthand for {r.reps} reps = "
        f"{r.good_reps} good + {r.failed_reps} failed"
    )


def _stored_reps(r: SetRow) -> int:
    """The number written before the x, which is what a set stores as its reps. In
    "5x3f" that is the good reps: both counts are kept, their total of 8 is not."""
    return r.good_reps if r.failed_reps > 1 else r.reps


def _written(lb: float) -> str:
    """Pounds ("135lb"), or kilograms when the weight is a whole or half kilogram."""
    kg = round(lb / KG_TO_LB * 2) / 2
    if lb != int(lb) and kg > 0 and round(kg * KG_TO_LB, 1) == lb:
        return f"{kg:g}kg"
    return f"{lb:g}lb"


def _weight(r: SetRow) -> str:
    text = "uw" if r.bodyweight else "" if r.weight_lb is None else _written(r.weight_lb)
    return ("?" if r.estimated else "") + text


def _line(r: SetRow) -> str:
    return " ".join(part for part in (_head(r), _weight(r), r.exercise) if part)


def _same_load(a: SetRow, b: SetRow) -> bool:
    return (a.weight_lb, a.estimated, a.bodyweight) == (b.weight_lb, b.estimated, b.bodyweight)


def _lines(block: Sequence[SetRow]) -> list[str]:
    """One exercise: the first set in full, then "^" while the weight stays the same."""
    return [
        f"{_head(r)} ^" if i and _same_load(r, block[i - 1]) else _line(r)
        for i, r in enumerate(block)
    ]


def _fits(lines: Sequence[str]) -> bool:
    return len(lines) <= MAX_LINES and len("\n".join(lines)) <= MAX_CHARS


def _pieces(block: list[SetRow]) -> list[list[SetRow]]:
    if len(block) == 1 or _fits(_lines(block)):
        return [block]
    half = len(block) // 2
    return _pieces(block[:half]) + _pieces(block[half:])


def _texts(rows: Sequence[SetRow]) -> list[tuple[str, list[SetRow]]]:
    """One typed message as entry texts: usually one; a message too long for a single
    entry is split between exercises."""
    out: list[tuple[str, list[SetRow]]] = []
    lines: list[str] = []
    taken: list[SetRow] = []
    for _, group in groupby(rows, key=lambda r: r.exercise):
        for piece in _pieces(list(group)):
            new = _lines(piece)
            if lines and not _fits(lines + new):
                out.append(("\n".join(lines), taken))
                lines, taken = [], []
            lines, taken = lines + new, taken + piece
    if lines:
        out.append(("\n".join(lines), taken))
    return out


# ---------------------------------------------------------------------------
# Checking what the parser makes of it
# ---------------------------------------------------------------------------
def _matches(s: ParsedSet, r: SetRow) -> bool:
    if (s.exercise, s.reps, s.good_reps, s.failed_reps) != (
        r.exercise,
        _stored_reps(r),
        r.good_reps,
        r.failed_reps,
    ):
        return False
    if (s.estimated, s.bodyweight) != (r.estimated, r.bodyweight):
        return False
    if r.bodyweight or r.weight_lb is None:
        return s.weight_lb is None
    return s.weight_lb is not None and abs(s.weight_lb - r.weight_lb) <= SET_TOLERANCE_LB + _EPS


def _describe(r: SetRow) -> str:
    return (
        f"line {r.line}: {r.exercise!r} reps={r.reps} good={r.good_reps} "
        f"failed={r.failed_reps} weight_lb={r.weight_lb} estimated={r.estimated} "
        f"bodyweight={r.bodyweight}"
    )


def set_problems(parsed: ParsedLog, rows: Sequence[SetRow]) -> list[str]:
    """The rows that `parsed` would not store exactly; empty when all of them match."""
    unread = any(w.code in ("not_understood", "too_many_lines") for w in parsed.warnings)
    if unread or len(parsed.sets) != len(rows):
        return [_describe(r) for r in rows]
    return [_describe(r) for s, r in zip(parsed.sets, rows, strict=True) if not _matches(s, r)]


def _parse(text: str, kind: LogKind) -> ParsedLog:
    return parse_log(text, kind=kind, default_unit="lb")


def _stored_as(rows: Sequence[SetRow], name: str) -> bool:
    """Is each of these rows, written on its own under `name`, stored as it is?"""
    named = [replace(r, exercise=name) for r in rows]
    return not any(set_problems(_parse(_line(r), "workout"), [r]) for r in named)


def _clean_name(name: str) -> str:
    """The closest name the notebook can store: no numbers, sides, units or failure
    marks, and no word twice in a row."""
    kept: list[str] = []
    for word in normalize_exercise(name).split():
        if any(c.isdigit() for c in word) or word in NAME_NOISE:
            continue
        if not kept or kept[-1] != word:
            kept.append(word)
    return " ".join(kept)


def _names(rows: Sequence[SetRow]) -> dict[str, str]:
    """The name to write for each exercise: its own whenever every one of its rows is
    stored under it, otherwise a cleaned-up one."""
    names = {r.exercise: r.exercise for r in rows}
    for raw in names:
        mine = [r for r in rows if r.exercise == raw]
        if _stored_as(mine, raw):
            continue
        names[raw] = _clean_name(raw)
        if not names[raw] or not _stored_as(mine, names[raw]):
            raise DemoDataError(
                f"{WORKOUTS_FILE}: no storable name for {raw!r}:\n"
                + "\n".join(_describe(r) for r in mine)
            )
    return names


def workout_entries(rows: Sequence[SetRow]) -> tuple[list[Entry], dict[str, str]]:
    names = _names(rows)
    groups: dict[str, list[SetRow]] = {}
    for r in rows:
        groups.setdefault(r.group, []).append(replace(r, exercise=names[r.exercise]))
    entries: list[Entry] = []
    problems: list[str] = []
    for group in groups.values():
        for text, taken in _texts(group):
            problems += set_problems(_parse(text, "workout"), taken)
            entries.append(Entry(group[0].at, text, "workout", tuple(taken)))
    if problems:
        raise DemoDataError(
            f"{WORKOUTS_FILE}: these rows would not be stored as written:\n" + "\n".join(problems)
        )
    return entries, {raw: name for raw, name in names.items() if raw != name}


def weigh_in_ok(parsed: ParsedLog, weight_lb: float) -> bool:
    w = parsed.weigh_in
    return (
        w is not None
        and w.day_offset == 0
        and abs(w.weight_lb - weight_lb) <= WEIGH_IN_TOLERANCE_LB + _EPS
    )


def weigh_in_entries(path: Path) -> list[Entry]:
    entries = []
    for n, rec in _records(path, 4):
        where = f"{path.name} line {n}"
        try:
            weight = float(rec[2])
        except ValueError as exc:
            raise DemoDataError(f"{where}: bad weight {rec[2]!r}") from exc
        # As it was typed when that reads as the same weight; otherwise the weight itself.
        for text in (rec[3], f"{weight:g}lb"):
            if text and weigh_in_ok(_parse(text, "weight"), weight):
                entries.append(Entry(_when(rec[0], rec[1], where), text, "weight", (), weight))
                break
        else:
            raise DemoDataError(f"{where}: {weight} lb can't be stored as a weigh-in")
    return entries


def read_aliases(path: Path) -> dict[str, str]:
    """The optional aliases file: one "short<TAB>full" pair per line ("bench", "bench press")."""
    if not path.is_file():
        return {}
    out: dict[str, str] = {}
    for n, rec in _records(path, 2):
        short, full = rec[0].strip().lower(), rec[1].strip().lower()
        if not short or not full:
            raise DemoDataError(f"{path.name} line {n}: both names are needed")
        out[short] = full
    return out


def load_export(folder: Path) -> Export:
    """Every entry in the export, oldest first, already checked against the parser."""
    workouts, renamed = workout_entries(read_workouts(folder / WORKOUTS_FILE))
    weigh_ins = weigh_in_entries(folder / WEIGHINS_FILE)
    entries = sorted(workouts + weigh_ins, key=lambda e: e.at)  # stable: file order on ties
    aliases = read_aliases(folder / ALIASES_FILE)
    return Export(entries, renamed, sum(len(e.rows) for e in workouts), len(weigh_ins), aliases)
