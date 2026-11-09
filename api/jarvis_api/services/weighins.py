"""Outlying weigh-ins: flag the ones far from the recent average until confirmed.

A weigh-in is flagged when it's more than 5% away from the average of the earlier,
unflagged weigh-ins in the 7 days before it, and the user hasn't confirmed it.
Flagged weigh-ins are left out of averages, trends, forecasts and bodyweight loads.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, datetime, timedelta

OUTLIER_SHARE = 0.05
WINDOW_DAYS = 7


@dataclass(frozen=True)
class WeighRow:
    log_id: int
    day: date
    at: datetime
    weight_lb: float
    confirmed: bool


@dataclass(frozen=True)
class WeighFlag:
    flagged: bool
    avg_7d: float | None  # the average it was compared with


def average_before(accepted: list[tuple[date, float]], day: date) -> float | None:
    """Mean of daily weights (the last per day) from the WINDOW_DAYS before and on `day`."""
    by_day: dict[date, float] = {}
    for d, w in accepted:
        if day - timedelta(days=WINDOW_DAYS) <= d <= day:
            by_day[d] = w
    return sum(by_day.values()) / len(by_day) if by_day else None


def is_outlier(weight_lb: float, avg: float | None) -> bool:
    return avg is not None and abs(weight_lb - avg) / avg > OUTLIER_SHARE


def flag_weighins(rows: Iterable[WeighRow]) -> dict[int, WeighFlag]:
    """Flags by log id, deciding in time order so a flagged reading never moves the average."""
    accepted: list[tuple[date, float]] = []
    out: dict[int, WeighFlag] = {}
    for r in sorted(rows, key=lambda r: (r.day, r.at, r.log_id)):
        avg = average_before(accepted, r.day)
        flagged = not r.confirmed and is_outlier(r.weight_lb, avg)
        out[r.log_id] = WeighFlag(flagged, None if avg is None else round(avg, 1))
        if not flagged:
            accepted.append((r.day, r.weight_lb))
    return out
