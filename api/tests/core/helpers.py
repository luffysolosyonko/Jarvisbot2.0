"""Build analysis inputs from shorthand, the same way the API does. Made-up data only."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import date

from jarvis_core.analysis import SetRow, WeightPoint, prepare, rows_from_parsed
from jarvis_core.parser import DayContext, parse_log, parse_weigh_in


def sets_from_logs(logs: Sequence[tuple[date, str]], **kw: object) -> list[SetRow]:
    """Parse workout logs in order, carrying names across logs on the same day."""
    rows: list[SetRow] = []
    ctx: DayContext | None = None
    day: date | None = None
    for log_id, (d, text) in enumerate(logs, start=1):
        if d != day:
            ctx, day = None, d
        parsed = parse_log(text, kind="workout", context=ctx, **kw)  # type: ignore[arg-type]
        ctx = parsed.context
        rows += rows_from_parsed(parsed.sets, d, log_id)
    return rows


def weights_from_logs(logs: Sequence[tuple[date, str]]) -> list[WeightPoint]:
    out = []
    for d, text in logs:
        w = parse_weigh_in(text)
        assert w is not None, text
        out.append(WeightPoint(d, w.weight_lb, w.note))
    return out


def prepared(
    set_logs: Sequence[tuple[date, str]],
    weight_logs: Sequence[tuple[date, str]] = (),
    aliases: dict[str, str] | None = None,
) -> tuple[list[SetRow], list[WeightPoint]]:
    weights = weights_from_logs(weight_logs)
    return prepare(sets_from_logs(set_logs), weights, aliases), weights
