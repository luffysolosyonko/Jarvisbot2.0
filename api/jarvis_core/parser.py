"""Turn gym shorthand into structured sets and weigh-ins.

Set lines (one per line; weights are stored in lb, kg is converted):

    8x 160lb bench            8 reps at 160 lb
    12x1f 25kg rear delt fly  12 good reps + 1 failed
    2xf 200lb bench           2 tried, the last failed -> 1 good + 1 failed
    8x ?70/80kg bench         estimated: midpoint of a range, or a "?"
    12x 60 or 50kg bench      estimated: unsure which, midpoint
    10x uw dips               bodyweight only
    8x bar bench              the empty bar (45 lb)
    25x 15kg each hand shrug  per-hand weight
    30x ^                     same exercise (and weight) as the set above
    2                         a bare number repeats the previous set
    bench                     a name-only header labels the unnamed sets below it
    2x1x1x1xf 85kg bench      several sets on one line; each f is one failed attempt
    5x 155lb 2x1x1xf bench    a chain after the first set, all at its weight

Weigh-ins: "182.4", "83.9kg", "182 4" (a missed decimal point), "w 180lb gym scale".
Without a unit, a number under 100 is read as kg and 100+ as lb.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field, replace
from typing import Literal

PARSER_VERSION = 4
"""Bump when parsing rules change; a rebuild job re-parses every stored log."""

KG_TO_LB = 2.20462
MAX_LINES = 60
MAX_CHARS = 2000
# Heavier than any real set (a loaded leg press sled included): a typo, not a lift.
MAX_SET_LB = 1500.0
MAX_NAME_CHARS = 120  # an exercise name, as stored
MAX_WEIGHT_TEXT_CHARS = 60  # the weight as written, as stored

NUM = r"(\d+(?:\.\d+)?)"
URL_RE = re.compile(r"https?://[^\s<>]+")
YESTERDAY_RE = re.compile(r"\byesterday\b", re.I)

LogKind = Literal["workout", "weight"]


# ---------------------------------------------------------------------------
# Set lines
# ---------------------------------------------------------------------------
@dataclass
class SetLine:
    """One set as written, before names are resolved across lines."""

    kind: Literal["set", "header", "repeat"]
    line: int = 0  # 1-based source line
    reps: int = 0  # the number before "x", as written
    weight_lb: float | None = None  # None = unknown or bodyweight
    weight_text: str | None = None  # as written: "160lb", "20-25lb", "bar", "?", "uw"
    exercise: str | None = None  # None = not named, "^" = same as the set above
    flag: str | None = None  # failure suffix as written: "1f", "5f", "f"
    failed_reps: int = 0
    good_reps: int = 0
    per_hand: bool = False
    bodyweight: bool = False
    estimated: bool = False
    extra: list[tuple[int, int, int, str | None]] = field(default_factory=list)


# "8x 160lb", "12x1f 25kg rear delt fly", "7xf dips", "30x ^"
SET_HEAD_RE = re.compile(r"^\s*(\d{1,3})\s*x\s*(\d*f\b)?\s*(.*)$", re.I)
# "160lb", "25kg", "70/80kg", "20-25lb", "70/80kg?"
WEIGHT_PART_RE = re.compile(rf"^{NUM}(?:\s*[-/]\s*{NUM})?\s*(kgs?|lbs?)?(?![\w.])\s*(\?)?", re.I)
TRAILING_WEIGHT_RE = re.compile(
    rf"\b{NUM}(?:\s*[-/]\s*{NUM})?\s*(kgs?|lbs?)(?![\w.])\s*(\?)?", re.I
)
PAREN_RE = re.compile(r"\([^)]*\)")
# "2x1x1x1x1xf 85kg bench": no spaces inside the chain; 3+ parts, or starting with f.
MULTI_SET_RE = re.compile(r"^\s*((?:\d{1,3}|f)(?:x(?:\d{1,3}|f))+)(?=\s|$)\s*(.*)$", re.I)
STRAY_REPS_RE = re.compile(r"\b\d{1,3}x\b", re.I)
ALT_WEIGHT_RE = re.compile(r"\bor\s+\d+(?:\.\d+)?\s*(?:kgs?|lbs?)\b", re.I)
REPEAT_RE = re.compile(r"^\s*\d{1,2}\s*$")
PER_HAND_RE = re.compile(r"\b(?:each hand|per hand|each side|per side|each arm|each)\b", re.I)
BODYWEIGHT_RE = re.compile(r"^(?:uw|bw|bodyweight|body weight|unweighted)\b", re.I)
BAR_RE = re.compile(r"^(?:empty\s+)?bar\b(?!bell)", re.I)
# A chain right after the first set's weight: "5x 155lb 2x1x1xf bench", "5x 15x bar bench".
EMBEDDED_CHAIN_RE = re.compile(r"^((?:\d{1,3}|f)(?:x(?:\d{1,3}|f))*x?)(?=\s|$)", re.I)
# "60 or 50kg": unsure which; the unit can be on either number
ALT_START_RE = re.compile(rf"^{NUM}\s*(kgs?|lbs?)?\s+or\s+{NUM}\s*(kgs?|lbs?)?(?![\w.])", re.I)

ABBREVIATIONS = {
    "db": "dumbbell",
    "dbs": "dumbbell",
    "bb": "barbell",
    "kb": "kettlebell",
    "ohp": "overhead press",
    "rdl": "romanian deadlift",
    "rdls": "romanian deadlift",
}
LEADING_FILLER = {"of", "on", "for", "with", "a", "the"}


def normalize_exercise(text: str) -> str:
    """Lowercase, strip punctuation, expand common abbreviations ("db" -> dumbbell)."""
    t = re.sub(r"[^a-z0-9 ]+", " ", (text or "").lower())
    words = [ABBREVIATIONS.get(w, w) for w in t.split()]
    while words and words[0] in LEADING_FILLER:
        words.pop(0)
    return " ".join(words)


def _to_lb(val: float, unit: str) -> float:
    return round(val * KG_TO_LB, 1) if unit.lower().startswith("kg") else round(val, 1)


def _set_weight(s: SetLine, m: re.Match[str], unit: str) -> None:
    """A range (70/80kg, 20-25lb) is an estimate: use the midpoint."""
    lo, hi = float(m.group(1)), m.group(2)
    if hi is not None:
        s.estimated = True
        val = (lo + float(hi)) / 2
    else:
        val = lo
    if m.group(4):  # trailing "?"
        s.estimated = True
    s.weight_lb = _to_lb(val, unit)
    s.weight_text = ("?" if s.weight_text == "?" else "") + m.group(0).strip()


def _chain_sets(parts: list[str]) -> list[tuple[int, int, int, str | None]] | None:
    """['2','1','f'] -> [(reps, good, failed, flag), ...]; 'f' = one failed attempt."""
    out: list[tuple[int, int, int, str | None]] = []
    for p in parts:
        if p == "f":
            out.append((1, 0, 1, "f"))
        elif p.isdigit() and 1 <= int(p) <= 200:
            out.append((int(p), int(p), 0, None))
        else:
            return None
    return out


def _weight_and_name(s: SetLine, rest: str, default_unit: str, bar_lb: float) -> str:
    """Pull the weight (bar / uw / 160lb / 70/80kg / 60 or 50kg) off the front of `rest`."""
    if alt := ALT_START_RE.match(rest):
        unit = alt.group(2) or alt.group(4) or default_unit
        lo, hi = float(alt.group(1)), float(alt.group(3))
        s.weight_lb = _to_lb((lo + hi) / 2, unit)
        s.weight_text = alt.group(0).strip()
        s.estimated = True
        return rest[alt.end() :].strip()
    if bw := BODYWEIGHT_RE.match(rest):
        s.bodyweight = True
        s.weight_text = bw.group(0).lower()
        return rest[bw.end() :].strip()
    if bar := BAR_RE.match(rest):
        s.weight_lb = bar_lb
        s.weight_text = "bar"
        return rest[bar.end() :].strip()
    if w := WEIGHT_PART_RE.match(rest):
        _set_weight(s, w, w.group(3) or default_unit)
        return rest[w.end() :].strip()
    return rest


def parse_set_line(line: str, default_unit: str = "lb", bar_lb: float = 45.0) -> SetLine | None:
    m = SET_HEAD_RE.match(line or "")
    if not m:
        return None
    reps = int(m.group(1))
    if not 1 <= reps <= 200:
        return None
    # "12x1f" = 12 good + 1 failed; "8x5f" = 8 good + 5 failed;
    # "2xf" (no number) = 2 tried, the last failed -> 1 good + 1 failed.
    flag = (m.group(2) or "").lower() or None
    if flag and flag[:-1]:
        good, fails = reps, int(flag[:-1])
    elif flag:
        good, fails = reps - 1, 1
    else:
        good, fails = reps, 0
    s = SetLine("set", reps=reps, flag=flag, failed_reps=fails, good_reps=good)
    rest = PAREN_RE.sub(" ", m.group(3)).strip()

    if rest.startswith("^"):
        s.exercise = "^"
        return s

    if rest.startswith("?"):  # "? 70/80kg" or just "?" (no idea)
        s.estimated = True
        s.weight_text = "?"
        rest = rest[1:].strip()

    rest = _weight_and_name(s, rest, default_unit, bar_lb)

    c = EMBEDDED_CHAIN_RE.match(rest)
    if c and ("x" in c.group(1).lower() or c.group(1).lower() == "f"):
        sets = _chain_sets([p for p in c.group(1).lower().split("x") if p])
        if sets:
            s.extra = sets
            rest = rest[c.end() :].strip()
            if s.weight_lb is None and not s.bodyweight:  # "5x 15x bar bench"
                rest = _weight_and_name(s, rest, default_unit, bar_lb)

    if s.weight_lb is None and not s.bodyweight:
        # weight after the name: "8x barbell row 60kg" (unit required here)
        w = TRAILING_WEIGHT_RE.search(rest)
        if w:
            _set_weight(s, w, w.group(3))
            rest = rest[: w.start()] + " " + rest[w.end() :]

    if PER_HAND_RE.search(rest):
        s.per_hand = True
        rest = PER_HAND_RE.sub(" ", rest)
    if ALT_WEIGHT_RE.search(rest):  # an "or 50kg" later in the line
        s.estimated = True
        rest = ALT_WEIGHT_RE.sub(" ", rest)
    rest = STRAY_REPS_RE.sub(" ", rest)
    # Capped to what the database stores, so the preview and the saved set agree.
    s.exercise = normalize_exercise(rest)[:MAX_NAME_CHARS].strip() or None
    if s.weight_text:
        s.weight_text = s.weight_text[:MAX_WEIGHT_TEXT_CHARS]
    if s.weight_lb is not None and s.weight_lb > MAX_SET_LB:
        return None
    return s


def expand(s: SetLine) -> list[SetLine]:
    """The set itself, plus any sets chained after it at the same weight."""
    out = [replace(s, extra=[])]
    for reps, good, fails, flag in s.extra:
        out.append(replace(s, reps=reps, good_reps=good, failed_reps=fails, flag=flag, extra=[]))
    return out


def parse_multi_set_line(
    line: str, default_unit: str = "lb", bar_lb: float = 45.0
) -> list[SetLine] | None:
    """'2x1x1x1x1xf 85kg bench' -> five sets (2, 1, 1, 1, 1 reps) and one failed
    attempt, all at 85 kg. Each 'f' is one rep tried and failed (0 good, 1 failed)."""
    m = MULTI_SET_RE.match(line or "")
    if not m:
        return None
    parts = m.group(1).lower().split("x")
    if len(parts) < 3 and parts[0] != "f":
        return None  # "2xf", "8x5" keep their single-set meaning
    template = parse_set_line(f"1x {m.group(2)}", default_unit, bar_lb)
    sets = _chain_sets(parts)
    if not sets or template is None:
        return None
    return [
        replace(template, reps=reps, good_reps=good, failed_reps=fails, flag=flag, extra=[])
        for reps, good, fails, flag in sets
    ]


def _is_header(line: str) -> bool:
    return (
        not re.search(r"\d", line)
        and len(line) <= 40
        and bool(re.search(r"[a-zA-Z]", line))
        and bool(normalize_exercise(line))
    )


def parse_workout_lines(
    text: str, default_unit: str = "lb", bar_lb: float = 45.0
) -> tuple[list[SetLine], list[int]]:
    """Every set line, plus name-only header lines. Also returns the 1-based numbers
    of non-empty lines that weren't understood."""
    out: list[SetLine] = []
    unknown: list[int] = []
    for n, raw in enumerate((text or "").splitlines(), start=1):
        line = raw.strip()
        if not line:
            continue
        if URL_RE.search(line):
            unknown.append(n)
            continue
        multi = parse_multi_set_line(line, default_unit, bar_lb)
        if multi:
            out.extend(replace(s, line=n) for s in multi)
            continue
        s = parse_set_line(line, default_unit, bar_lb)
        if s:
            out.extend(replace(x, line=n) for x in expand(s))
        elif REPEAT_RE.match(line):
            out.append(SetLine("repeat", line=n))
        elif _is_header(line):
            out.append(SetLine("header", line=n, exercise=normalize_exercise(line)))
        else:
            unknown.append(n)
    return out, unknown


# ---------------------------------------------------------------------------
# Resolving names across lines (and across earlier logs the same day)
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class ParsedSet:
    """A fully resolved set, ready to store."""

    idx: int
    line: int
    exercise: str | None  # normalized name; None if never named
    reps: int
    good_reps: int
    failed_reps: int
    weight_lb: float | None  # None for bodyweight sets (load filled in on read)
    weight_text: str | None
    estimated: bool
    bodyweight: bool
    per_hand: bool
    flag: str | None = None
    inferred: bool = False  # name or load came from an earlier line


@dataclass(frozen=True)
class DayContext:
    """What a new log inherits from earlier logs on the same day."""

    current: str | None = None  # last exercise named
    current_weighted: bool = False  # did that name come from a weighted set?
    prev: ParsedSet | None = None  # last resolved set


WarningCode = Literal[
    "not_understood",
    "no_exercise",
    "no_weight",
    "nothing_to_repeat",
    "no_caret_source",
    "too_many_lines",
    "no_sets",
    "no_weigh_in",
]


@dataclass(frozen=True)
class ParseWarning:
    line: int
    message: str
    code: WarningCode = "not_understood"  # machine-readable, for suggested fixes


def resolve_sets(
    lines: list[SetLine], ctx: DayContext | None = None
) -> tuple[list[ParsedSet], DayContext, list[ParseWarning]]:
    """'^' copies the set above (exercise and, if none written, weight); an unnamed set
    takes the last exercise named earlier that day; a bare number repeats the previous
    set. An unnamed bodyweight set right after weighted sets keeps no name ("10x uw"
    after bench is not bench)."""
    ctx = ctx or DayContext()
    current, current_weighted, prev = ctx.current, ctx.current_weighted, ctx.prev
    out: list[ParsedSet] = []
    warnings: list[ParseWarning] = []

    for s in lines:
        if s.kind == "header":
            current, current_weighted = s.exercise, False
            continue
        if s.kind == "repeat":
            if prev:
                rec = replace(prev, idx=len(out), line=s.line, inferred=True)
                out.append(rec)
            else:
                warnings.append(
                    ParseWarning(s.line, "Nothing above to repeat.", "nothing_to_repeat")
                )
            continue

        weight, weight_text = s.weight_lb, s.weight_text
        per_hand, estimated, bodyweight = s.per_hand, s.estimated, s.bodyweight
        exercise = s.exercise
        inferred = False
        if exercise == "^":
            inferred = True
            exercise = prev.exercise if prev else None
            if prev is None:
                warnings.append(
                    ParseWarning(s.line, "No set above for ^ to copy.", "no_caret_source")
                )
            if weight is None and prev and weight_text is None and not bodyweight:
                weight, weight_text = prev.weight_lb, prev.weight_text
                per_hand, estimated, bodyweight = prev.per_hand, prev.estimated, prev.bodyweight
        elif not exercise:
            if not (bodyweight and current_weighted):
                exercise, inferred = current, current is not None
        else:
            current, current_weighted = exercise, not bodyweight

        if not exercise:
            warnings.append(ParseWarning(s.line, "No exercise name.", "no_exercise"))
        if weight is None and not bodyweight and weight_text != "?":
            warnings.append(
                ParseWarning(s.line, "No weight; add one like 135lb, 60kg, bar or uw.", "no_weight")
            )

        rec = ParsedSet(
            idx=len(out),
            line=s.line,
            exercise=exercise,
            reps=s.reps,
            good_reps=max(s.good_reps, 0),
            failed_reps=s.failed_reps,
            weight_lb=weight,
            weight_text=weight_text,
            estimated=estimated,
            bodyweight=bodyweight,
            per_hand=per_hand,
            flag=s.flag,
            inferred=inferred,
        )
        out.append(rec)
        prev = rec

    return out, DayContext(current, current_weighted, prev), warnings


# ---------------------------------------------------------------------------
# Weigh-ins
# ---------------------------------------------------------------------------
# First weight in the text: "83.9kg", "182lb", "182", "182 4" (= 182.4)
WEIGH_IN_RE = re.compile(
    rf"(?<![\w.]){NUM}\s*(kgs?|lbs?|pounds)?(?:[\s,]+(\d)(?![\w.]))?(?![\w.])", re.I
)
WEIGHT_WORDS_RE = re.compile(r"\b(?:weight|weighed|weigh|wt|bw|w)\b\s*[:=]?", re.I)
NOTE_PUNCT = " \t-–—,:;()[]"  # noqa: RUF001 - en/em dashes are intentional


@dataclass(frozen=True)
class WeighIn:
    weight_lb: float
    note: str | None = None
    day_offset: int = 0  # -1 when the text says "yesterday"
    typed: float | None = None  # the number as written ("80")
    typed_unit: Literal["kg", "lb"] = "lb"  # the unit it was read in
    unit_assumed: bool = False  # no unit was written; the <100 = kg rule chose it


def _note(text: str) -> str | None:
    """Leftover words become the note: 'different scale', 'after dinner'."""
    t = re.sub(r"\s+", " ", text).strip(NOTE_PUNCT)
    return t[:200] if re.search(r"[a-zA-Z]", t) else None


# What Weight mode accepts, in lb.
WEIGH_IN_MIN_LB = 1.0
WEIGH_IN_MAX_LB = 1000.0
# Guessing whether text with no mode is a weigh-in (instead of set shorthand like "8"
# or "8 135") only counts weights a person plausibly is.
PLAUSIBLE_MIN_LB = 60.0
PLAUSIBLE_MAX_LB = 600.0


def looks_like_weigh_in(text: str) -> bool:
    """A weigh-in in the plausible body-weight range: used to guess the mode."""
    w = parse_weigh_in(text)
    return w is not None and PLAUSIBLE_MIN_LB <= w.weight_lb <= PLAUSIBLE_MAX_LB


def parse_weigh_in(text: str) -> WeighIn | None:
    """Without a unit, under 100 is kg and 100+ is lb. A single digit after a space is
    a missed decimal point ("182 4" -> 182.4). Other words are kept as a note.
    Accepts 1 to 1000 lb."""
    text = URL_RE.sub(" ", text or "")
    if any(SET_HEAD_RE.match(line) for line in text.splitlines()):
        return None  # "8x 25lb curl" is not a weigh-in
    day_offset = 0
    if YESTERDAY_RE.search(text):
        day_offset = -1
        text = YESTERDAY_RE.sub(" ", text)
    m = WEIGH_IN_RE.search(text)
    if not m:
        return None
    val = float(m.group(1))
    if m.group(3) is not None and "." not in m.group(1):
        val = float(f"{m.group(1)}.{m.group(3)}")
    u = (m.group(2) or "").lower()
    is_kg = u.startswith("kg") if u else val < 100
    lb = val * KG_TO_LB if is_kg else val
    if not WEIGH_IN_MIN_LB <= lb <= WEIGH_IN_MAX_LB:
        return None
    rest = text[: m.start()] + " " + text[m.end() :]
    return WeighIn(
        round(lb, 1),
        _note(WEIGHT_WORDS_RE.sub(" ", rest)),
        day_offset,
        typed=val,
        typed_unit="kg" if is_kg else "lb",
        unit_assumed=not u,
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class ParsedLog:
    kind: LogKind
    sets: list[ParsedSet]
    weigh_in: WeighIn | None
    warnings: list[ParseWarning]
    context: DayContext  # pass to the next log on the same day

    @property
    def ok(self) -> bool:
        return bool(self.sets) or self.weigh_in is not None


def detect_kind(text: str, default_unit: str = "lb", bar_lb: float = 45.0) -> LogKind:
    """Workout if any line is a set; otherwise weight if it reads as a weigh-in."""
    lines, _ = parse_workout_lines(text, default_unit, bar_lb)
    if any(s.kind == "set" for s in lines):
        return "workout"
    return "weight" if looks_like_weigh_in(text) else "workout"


def parse_log(
    text: str,
    *,
    kind: LogKind | None = None,
    default_unit: str = "lb",
    bar_lb: float = 45.0,
    context: DayContext | None = None,
) -> ParsedLog:
    """Parse one log. `kind` is detected when not given. `context` carries names and the
    last set from earlier workout logs on the same day."""
    text = (text or "")[:MAX_CHARS]
    kind = kind or detect_kind(text, default_unit, bar_lb)
    if kind == "weight":
        w = parse_weigh_in(text)
        warns = (
            []
            if w
            else [ParseWarning(1, "No body weight found, e.g. 182.4 or 83kg.", "no_weigh_in")]
        )
        return ParsedLog("weight", [], w, warns, context or DayContext())

    lines, unknown = parse_workout_lines(text, default_unit, bar_lb)
    warnings = [ParseWarning(n, "Not understood.") for n in unknown]
    if sum(1 for _ in text.splitlines()) > MAX_LINES:
        warnings.append(
            ParseWarning(
                MAX_LINES + 1, f"Only the first {MAX_LINES} lines are read.", "too_many_lines"
            )
        )
        lines = [s for s in lines if s.line <= MAX_LINES]
    sets, ctx, more = resolve_sets(lines, context)
    warnings = sorted(warnings + more, key=lambda w: w.line)
    if not sets and not warnings:
        warnings.append(ParseWarning(1, "No sets found, e.g. 8x 135lb bench.", "no_sets"))
    return ParsedLog("workout", sets, None, warnings, ctx)
