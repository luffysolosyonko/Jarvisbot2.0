"""Suggested fixes for parser warnings, so the app can offer one-click repairs.

Each fix replaces the warned line (1-based) with new text. Some need one value from
the user first (a weight, a name): those carry a `template` with `{}` where the value
goes. Some also switch the log's mode (a weigh-in typed in workout mode).
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass

from jarvis_core.parser import (
    LogKind,
    ParseWarning,
    WarningCode,
    parse_log,
    parse_weigh_in,
)

MAX_NAME_SUGGESTIONS = 3

NUM = r"\d+(?:\.\d+)?"
# "8 135 bench", "8 reps 135lb bench", "8 @ 60kg row"
REPS_WEIGHT_RE = re.compile(rf"^(\d+)\s*(?:reps?)?\s+@?\s*({NUM})\s*(lbs?|kgs?)?\s*(.*)$", re.I)
# "225 for 5 squat", "100kg x 8 row"
WEIGHT_FOR_REPS_RE = re.compile(rf"^({NUM})\s*(lbs?|kgs?)?\s+(?:for|x)\s+(\d+)\s*(.*)$", re.I)
# "bench 8x 135lb" -> "8x 135lb bench"
NAME_FIRST_RE = re.compile(r"^([A-Za-z][A-Za-z ]*?)\s+(\d+\s*x.*)$", re.I)
# head token of a set line ("8x", "2x1x1xf") and the rest
HEAD_RE = re.compile(r"^\s*(\S+)\s*(.*)$")
BARE_NUM_RE = re.compile(rf"({NUM})")


@dataclass(frozen=True)
class Fix:
    label: str
    line: int
    text: str | None = None  # replacement for the line ("" removes it)
    template: str | None = None  # replacement with "{}" for a value the user types
    placeholder: str | None = None  # hint for that value
    mode: LogKind | None = None  # switch the log to this mode too


def _join(*parts: str) -> str:
    return " ".join(p for p in parts if p).strip()


def _parses(text: str, mode: LogKind) -> bool:
    parsed = parse_log(text, kind=mode)
    return parsed.ok and not parsed.warnings


def suggest(
    warning: ParseWarning, lines: Sequence[str], mode: LogKind, recent: Sequence[str] = ()
) -> list[Fix]:
    """Fixes for one warning. `lines` is the log's text split into lines."""
    code: WarningCode = warning.code
    n = warning.line
    line = lines[n - 1].strip() if 0 < n <= len(lines) else ""
    remove = Fix("Remove this line", n, text="")

    if code == "no_weight":
        m = HEAD_RE.match(line)
        head, rest = (m.group(1), m.group(2)) if m else (line, "")
        return [
            Fix("Add weight in lb", n, template=_join(head, "{}lb", rest), placeholder="135"),
            Fix("Add weight in kg", n, template=_join(head, "{}kg", rest), placeholder="60"),
            Fix("Mark as estimate", n, template=_join(head, "?{}lb", rest), placeholder="135"),
            Fix("Bodyweight (uw)", n, text=_join(head, "uw", rest)),
            Fix("Empty bar", n, text=_join(head, "bar", rest)),
        ]

    if code == "no_exercise":
        named = [Fix(f"Add {name}", n, text=_join(line, name)) for name in recent]
        return [
            Fix("Set exercise name", n, template=_join(line, "{}"), placeholder="bench"),
            *named[:MAX_NAME_SUGGESTIONS],
        ]

    if code == "no_caret_source":
        return [
            Fix("Set exercise name", n, template=line.replace("^", "{}", 1), placeholder="bench"),
            remove,
        ]

    if code == "nothing_to_repeat":
        return [remove]

    if code == "not_understood":
        fixes: list[Fix] = []
        if mode == "workout" and parse_weigh_in(line):
            fixes.append(Fix("Log as a weigh-in", n, text=line, mode="weight"))
        m = REPS_WEIGHT_RE.match(line)
        if m:
            reps, weight, unit, rest = m.groups()
            if unit:
                fixes.append(
                    Fix(
                        f"Use {reps}x {weight}{unit}",
                        n,
                        text=_join(f"{reps}x", f"{weight}{unit}", rest),
                    )
                )
            else:
                for u in ("lb", "kg"):
                    fixes.append(
                        Fix(f"Add unit: {u}", n, text=_join(f"{reps}x", f"{weight}{u}", rest))
                    )
        m4 = WEIGHT_FOR_REPS_RE.match(line)
        if m4:
            weight, unit, reps, rest = m4.groups()
            units = [unit] if unit else ["lb", "kg"]
            for u in units:
                label = f"Use {reps}x {weight}{u}" if unit else f"Add unit: {u}"
                fixes.append(Fix(label, n, text=_join(f"{reps}x", f"{weight}{u}", rest)))
        m2 = NAME_FIRST_RE.match(line)
        if m2:
            fixed = _join(m2.group(2), m2.group(1))
            if _parses(fixed, "workout"):
                fixes.append(Fix("Move the name to the end", n, text=fixed))
        fixes.append(remove)
        return fixes

    if code == "no_weigh_in":
        fixes = []
        text = "\n".join(lines)
        if parse_log(text, kind="workout").sets:
            fixes.append(Fix("Log as a workout", n, text=line, mode="workout"))
        m3 = BARE_NUM_RE.search(text)
        if m3:
            num = m3.group(1)
            for u in ("lb", "kg"):
                candidate = f"{num}{u}"
                if parse_weigh_in(candidate):
                    fixes.append(Fix(f"Add unit: {u}", n, text=candidate))
        return fixes

    return []  # too_many_lines, no_sets: nothing to click
