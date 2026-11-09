from __future__ import annotations

from datetime import date, timedelta

import pytest

from jarvis_core.analysis import (
    SetRow,
    WeightPoint,
    daily_rollup,
    epley,
    exercise_detail,
    exercise_summaries,
    lift_forecast,
    lift_sessions,
    moving_average,
    project,
    rep_targets,
    top_lifts,
    weekly_series,
    weight_projection,
    window_summary,
)

from .helpers import prepared

MON = date(2026, 3, 2)


def test_epley() -> None:
    assert epley(100, 1) == pytest.approx(100 * (1 + 1 / 30))
    assert epley(100, 10) == pytest.approx(133.33, abs=0.01)
    assert epley(100, 0) is None  # all reps failed
    assert epley(None, 5) is None
    assert epley(100, 50) == epley(100, 30)  # capped


def test_rep_targets_invert_epley() -> None:
    targets = dict(rep_targets(200))
    assert list(targets) == [1, 3, 5, 8, 10, 12]
    assert targets[1] == 200
    assert targets[10] == pytest.approx(150)
    assert epley(targets[5], 5) == pytest.approx(200)


def test_failure_estimate_and_bodyweight() -> None:
    d1, d2 = MON, MON + timedelta(days=1)
    sets, _ = prepared(
        [
            (d1, "12x1f 25kg rear delt fly"),
            (d1, "8x5f 25kg rear delt fly"),
            (d1, "2xf 200lb bench"),
            (d1, "1xf 225lb bench"),
            (d1, "8x ?70/80kg bench"),
            (d1, "10x uw dips"),
            (d1, "8x ^"),
            (d2, "8x bar bench"),
            (d2, "12x 135lb bench"),
            (d2, "2"),
            (d2, "3"),
        ],
        weight_logs=[(d1 - timedelta(days=3), "175lb"), (d1, "174lb")],
    )
    dips = [s for s in sets if s.exercise == "dips"]
    assert [s.weight_lb for s in dips] == [174, 174]  # latest weigh-in on or before the day

    detail = exercise_detail(sets, "bench")
    assert detail is not None
    assert detail.summary.failed_reps == 2 and detail.summary.good_reps == 53
    assert detail.best_set is not None and detail.best_set.estimated  # the 70/80kg guess
    assert detail.heaviest_set is not None and detail.heaviest_set.weight_lb == 225
    assert [s.weight_lb for s in detail.last_session] == [45, 135, 135, 135]
    assert [n for n, _ in detail.rep_targets] == [1, 3, 5, 8, 10, 12]

    fly = exercise_detail(sets, "rear delt fly")
    assert fly and fly.best_set_e1rm == pytest.approx(55.1 * (1 + 12 / 30))
    assert exercise_detail(sets, "deadlift") is None


def _progressing_bench(weeks: int = 10) -> list[tuple[date, str]]:
    """+5 lb on the top set each week, two sessions a week, plus a 15-rep back-off set."""
    logs = []
    for wk in range(weeks):
        for dd in (0, 3):
            w = 135 + 5 * wk
            logs.append((MON + timedelta(days=7 * wk + dd), f"8x {w}lb bench\n15x 45lb bench"))
    logs.append((MON, "10x 30lb curl"))
    return logs


def test_lift_sessions_use_1_to_12_rep_sets() -> None:
    sets, _ = prepared(_progressing_bench())
    sess = lift_sessions(sets, "bench")
    assert len(sess) == 20
    assert sess[0][1] == pytest.approx(135 * (1 + 8 / 30))  # not the 15-rep set


def test_lift_forecast() -> None:
    sets, _ = prepared(_progressing_bench())
    f = lift_forecast(sets, "bench", days_ahead=28, target_lb=260)
    assert f is not None
    p = f.projection
    assert p.slope_per_week == pytest.approx(5 * (1 + 8 / 30), abs=0.6)
    assert p.pred == pytest.approx(p.now + 4 * p.slope_per_week, abs=0.5)
    assert p.low < p.pred < p.high
    assert isinstance(f.reach, date) and f.reach > p.last_day
    assert not f.optimistic

    assert lift_forecast(sets, "bench", target_lb=150).reach == "already"  # type: ignore[union-attr]
    assert lift_forecast(sets, "bench").reach is None  # type: ignore[union-attr]
    assert lift_forecast(sets, "curl") is None  # one session
    assert lift_forecast(sets, "deadlift") is None
    assert lift_forecast(sets, "bench", days_ahead=200).optimistic  # type: ignore[union-attr]


def test_declining_lift_has_no_target_date() -> None:
    logs = [(MON + timedelta(days=4 * i), f"5x {200 - 2 * i}lb squat") for i in range(8)]
    sets, _ = prepared(logs)
    f = lift_forecast(sets, "squat", target_lb=250)
    assert f is not None and f.projection.slope_per_week < 0 and f.reach == "flat"


def test_warmup_only_day_left_out_of_trend() -> None:
    d = [MON, MON + timedelta(days=3), MON + timedelta(days=7)]
    sets, _ = prepared(
        [(d[0], "5x 155lb 2x1x1x1x1xf bench"), (d[1], "1x 45lb bench"), (d[2], "1x 205lb bench")]
    )
    assert len([s for s in sets if s.day == d[0]]) == 7
    assert [day for day, _ in lift_sessions(sets, "bench")] == [d[0], d[2]]


def _weigh_ins(n: int = 40, per_week: float = -0.5) -> list[WeightPoint]:
    noise = [0.4, -0.3, 0.1, -0.5, 0.3, 0.0, -0.2]  # deterministic, made up
    return [
        WeightPoint(MON + timedelta(days=i), 180 + per_week / 7 * i + noise[i % 7])
        for i in range(n)
    ]


def test_weight_projection() -> None:
    p = weight_projection(_weigh_ins(), days_ahead=28)
    assert p is not None
    assert p.slope_per_week == pytest.approx(-0.5, abs=0.15)
    assert p.low < p.pred < p.high
    assert p.target_day == p.last_day + timedelta(days=28)
    assert p.at(p.last_day) == pytest.approx(p.now)
    assert weight_projection(_weigh_ins(9)) is None  # needs 10+


def test_project_needs_points_and_span() -> None:
    assert project([]) is None
    assert project([(MON, 1.0), (MON, 2.0), (MON, 3.0)]) is None  # no span
    assert project([(MON + timedelta(days=i), float(i)) for i in range(3)]) is not None


def test_moving_average() -> None:
    w = [WeightPoint(MON + timedelta(days=i), v) for i, v in enumerate([180, 181, 182, 183])]
    avg = moving_average(w, window_days=7, min_points=3)
    assert [p.day for p in avg] == [MON + timedelta(days=2), MON + timedelta(days=3)]
    assert avg[-1].weight_lb == pytest.approx(181.5)
    # the last weigh-in of a day wins
    same_day = [WeightPoint(MON, 180), WeightPoint(MON, 179)]
    assert moving_average(same_day, min_points=1)[0].weight_lb == 179


def test_rollups_and_volume() -> None:
    sets = [
        SetRow(MON, "bench", 8, 8, 0, 100),
        SetRow(MON, "bench", 8, 6, 2, 100),
        SetRow(MON, "curl", 10, 10, 0, 20, per_hand=True),
        SetRow(MON + timedelta(days=2), "squat", 5, 5, 0, 200),
        SetRow(MON - timedelta(days=10), "squat", 5, 5, 0, 180),
    ]
    week = window_summary(sets, MON + timedelta(days=6))
    assert week.sessions == 2 and week.sets == 4 and week.failed_reps == 2
    assert week.volume_lb == 800 + 600 + 400 + 1000  # per-hand counts twice
    assert week.by_exercise[0].exercise == "bench"

    days = daily_rollup(sets, [WeightPoint(MON, 178)], MON, MON + timedelta(days=2))
    assert [d.sets for d in days] == [3, 0, 1]
    assert days[0].weight_lb == 178 and days[1].weight_lb is None and not days[1].trained

    series = weekly_series(sets, MON + timedelta(days=6), weeks=3)
    # windows end on MON+6, MON-1, MON-8; the squat 10 days back is in the oldest
    assert [w.sets for w in series] == [1, 0, 4]


def test_exercise_summaries_and_change() -> None:
    sets, _ = prepared(_progressing_bench())
    summaries = exercise_summaries(sets)
    assert summaries[0].exercise == "bench"
    bench = summaries[0]
    assert bench.sessions == 20 and bench.e1rm_change is not None and bench.e1rm_change > 0
    curl = next(s for s in summaries if s.exercise == "curl")
    assert curl.e1rm_change is None


def test_top_lifts_skip_bodyweight_and_one_offs() -> None:
    logs = [(MON + timedelta(days=d), "8x 100lb row\n10x uw pull ups") for d in (0, 3, 7)]
    logs.append((MON, "5x 300lb deadlift"))
    sets, _ = prepared(logs, weight_logs=[(MON, "180lb")])
    assert [e.exercise for e in top_lifts(sets)] == ["row"]
