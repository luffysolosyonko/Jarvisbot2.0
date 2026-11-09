"""Reset the demo account and fill it with 12 weeks of made-up training history.

    python -m jarvis_api.seed            # uses DEMO_UID and DATABASE_URL
    python -m jarvis_api.seed --tz America/New_York

Everything here is invented: a four-day upper/lower split with steady progression,
a deload week, a couple of failed reps, rest-pause sets, and morning weigh-ins 4-5
times a week drifting slowly down. Logs are written in the same shorthand a real
user would type and go through the normal parse-and-save path.
"""

from __future__ import annotations

import argparse
import random
import sys
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import delete
from sqlalchemy.orm import Session

from jarvis_api.config import Settings
from jarvis_api.db import make_engine, make_sessionmaker
from jarvis_api.firebase import Claims
from jarvis_api.models import AiUsage, Alias, AskMessage, Log
from jarvis_api.services.logs import save_log
from jarvis_api.services.users import get_or_create_user

WEEKS = 12
DELOAD_WEEK = 8  # 0-based: the 9th week is lighter
DEMO_ALIASES = {"lat raise": "lateral raise"}


@dataclass(frozen=True)
class Entry:
    at: datetime  # local, naive
    text: str


def _w(x: float) -> str:
    """135.0 -> '135', 147.5 -> '147.5'"""
    return f"{x:g}"


def _round(x: float, step: float = 2.5) -> float:
    return round(x / step) * step


def _week_load(start: float, per_week: float, week: int, every: int = 1) -> float:
    steps = (week if week < DELOAD_WEEK else week - 1) // every
    load = start + per_week * steps
    return _round(load * 0.8 if week == DELOAD_WEEK else load)


def _upper_a(week: int, rng: random.Random) -> list[str]:
    bench = _week_load(120, 2.5, week)
    row = _week_load(105, 2.5, week)
    curl = 25 if week < 6 else 30
    if week == 5:  # a grinder: last set one rep short
        bench_block = f"bench\n6x {_w(bench)}lb\n6x {_w(bench)}lb\n5x1f {_w(bench)}lb"
    elif rng.random() < 0.5:
        bench_block = f"6x {_w(bench)}lb bench\n2\n3"
    else:
        bench_block = f"bench\n6x {_w(bench)}lb\n6x {_w(bench)}lb\n6x {_w(bench)}lb"
    return [
        f"{bench_block}\n10x {_w(_round(bench * 0.7))}lb bench",
        f"8x {_w(row)}lb bb row\n8x ^\n8x ^\n"
        f"10x {curl}lb each hand db curl\n10x ^\n12x 50lb tricep pushdown\n12x ^",
    ]


def _lower_a(week: int, rng: random.Random) -> list[str]:
    squat = _week_load(165, 5, week)
    rdl = _week_load(135, 5, week, every=2)
    pulldown = _week_load(100, 2.5, week, every=2)
    last = "4x1f" if week == 10 else "5x"
    return [
        f"squat\n5x {_w(squat)}lb\n5x {_w(squat)}lb\n{last} {_w(squat)}lb",
        f"8x {_w(rdl)}lb rdl\n8x ^\n8x ^\n12x {_w(pulldown)}lb lat pulldown\n2",
    ]


def _upper_b(week: int, rng: random.Random) -> list[str]:
    ohp = _week_load(75, 2.5, week, every=2)
    inc = 40 if week < 4 else 45 if week < 9 else 50
    if week == 10:  # rest-pause on the last set
        ohp_block = f"6x {_w(ohp)}lb ohp\n6x ^\n5x {_w(ohp)}lb 2x1xf ohp"
    else:
        ohp_block = f"6x {_w(ohp)}lb ohp\n2\n3"
    pullups = rng.choice(["8x uw pull ups\n7x ^\n6x ^", "8x uw pull ups\n8x ^\n6x ^"])
    return [
        ohp_block,
        f"10x {inc}lb each hand incline db bench\n10x ^\n{pullups}\n"
        f"15x 7kg each hand lat raise\n15x ^",
    ]


def _lower_b(week: int, rng: random.Random) -> list[str]:
    dead = _week_load(205, 5, week)
    squat = _round(_week_load(165, 5, week) * 0.8)
    return [
        f"5x {_w(dead)}lb deadlift\n5x {_w(_round(dead * 0.85))}lb deadlift",
        f"8x {_w(squat)}lb squat\n8x ^\n10x {_w(_week_load(105, 2.5, week))}lb bb row\n10x ^",
    ]


# weekday (Mon=0) -> session builder
PROGRAM = {0: _upper_a, 1: _lower_a, 3: _upper_b, 5: _lower_b}


def build_history(today: date, seed: int = 20260302) -> list[Entry]:
    """Every log to create, oldest first, in local time. Workouts end yesterday;
    there's a weigh-in this morning so the dashboard has something for today."""
    rng = random.Random(seed)  # noqa: S311 - not security sensitive
    end = today - timedelta(days=1)
    start = end - timedelta(days=7 * WEEKS - 1)
    start -= timedelta(days=start.weekday())  # begin on a Monday
    out: list[Entry] = []

    weight = 183.6
    day = start
    skip: set[int] = set()
    while day <= today:
        week = (day - start).days // 7
        if day.weekday() == 0:  # 4-5 weigh-ins a week: skip 2 or 3 random days
            skip = set(rng.sample(range(7), k=rng.choice((2, 3))))
        weight += -0.28 / 7 + rng.gauss(0, 0.05)
        if day.weekday() not in skip or day == today:
            reading = weight + rng.gauss(0, 0.45)
            stamp = datetime.combine(day, time(7, rng.randrange(0, 60)))
            if day == start + timedelta(days=17):
                text = f"{reading + 0.9:.1f} different scale"
            elif rng.random() < 0.06:
                text = f"{reading / 2.20462:.1f}kg"
            elif rng.random() < 0.15:
                text = f"w {reading:.1f}"
            else:
                text = f"{reading:.1f}"
            out.append(Entry(stamp, text))

        build = PROGRAM.get(day.weekday())
        skipped = rng.random() < 0.07 and week not in (DELOAD_WEEK, WEEKS - 1)
        if build and day <= end and not skipped:
            first = datetime.combine(day, time(17, 30)) + timedelta(minutes=rng.randrange(0, 60))
            for i, text in enumerate(build(week, rng)):
                out.append(Entry(first + timedelta(minutes=35 * i), text))
        day += timedelta(days=1)
    return out


def reset_demo(db: Session, uid: str, tz_name: str, today: date | None = None) -> int:
    """Wipe the demo user's data and recreate it. Returns the number of logs saved."""
    tz = ZoneInfo(tz_name)
    user = get_or_create_user(db, Claims(uid=uid, name="Demo athlete", provider="custom"))
    if user.firebase_uid != uid:  # pragma: no cover - defensive
        raise RuntimeError("refusing to seed a non-demo user")
    db.execute(delete(Log).where(Log.user_id == user.id))
    db.execute(delete(Alias).where(Alias.user_id == user.id))
    db.execute(delete(AiUsage).where(AiUsage.user_id == user.id))
    db.execute(delete(AskMessage).where(AskMessage.user_id == user.id))
    user.settings.tz_name, user.settings.set_unit, user.settings.bar_lb = tz_name, "lb", 45.0
    db.add_all(Alias(user_id=user.id, short=s, full=f) for s, f in DEMO_ALIASES.items())
    db.commit()

    today = today or datetime.now(tz).date()
    saved = 0
    for e in build_history(today):
        now = e.at.replace(tzinfo=tz).astimezone(UTC)
        if save_log(db, user, e.text, now) is None:  # pragma: no cover - seed is all valid
            raise RuntimeError(f"seed text didn't parse: {e.text!r}")
        saved += 1
    return saved


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--tz", default="America/Chicago", help="demo user's time zone")
    args = parser.parse_args(argv)
    settings = Settings()
    if not settings.demo_uid:
        print("DEMO_UID is not set; nothing to seed.", file=sys.stderr)
        return 2
    engine = make_engine(settings.database_url)
    with make_sessionmaker(engine)() as db:
        n = reset_demo(db, settings.demo_uid, args.tz)
    print(f"Demo account reset: {n} logs.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
