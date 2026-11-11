from __future__ import annotations

from datetime import date, timedelta
from types import SimpleNamespace

from jarvis_core.ai import (
    MAX_CONTEXT_CHARS,
    build_context,
    question_topics,
    usage_from,
    user_message,
)

from .helpers import prepared

DAY = date(2026, 3, 16)


def _data() -> tuple[list, list]:  # type: ignore[type-arg]
    set_logs = []
    for i in range(6):
        d = DAY - timedelta(days=3 * i)
        set_logs.append((d, f"8x {160 - 5 * i}lb bench\n12x1f 25kg rear delt fly"))
    weight_logs = [(DAY - timedelta(days=i), f"{176 - 0.1 * i:.1f}") for i in range(14)]
    weight_logs.append((DAY - timedelta(days=20), "177.2 different scale"))
    return prepared(set_logs, weight_logs)


def test_topics() -> None:
    assert question_topics("is my bench going up?", ["bench", "rear delt fly"]) == (
        {"workouts"},
        ["bench"],
    )
    names = ["bench press", "squat", "bicep curls", "row"]
    assert question_topics("when was the last time i benched", names) == (
        {"workouts"},
        ["bench press"],
    )
    assert question_topics("have I been squatting less?", names)[1] == ["squat"]
    assert question_topics("how is my curl going", names)[1] == ["bicep curls"]
    assert question_topics("did I sleep enough?", names)[1] == []
    assert question_topics("whats my weight trend")[0] == {"weight"}
    assert question_topics("how am I doing overall?")[0] == set()
    assert question_topics("did weight gain hurt my squat?", ["squat"])[0] == {
        "weight",
        "workouts",
    }


def test_named_exercise_gets_only_its_sets() -> None:
    sets, weights = _data()
    ctx, topics = build_context("is my bench going up?", sets, weights, DAY)
    assert topics == {"workouts"}
    assert "every logged set of bench" in ctx
    assert "rear delt fly,12" not in ctx  # other exercises' rows aren't sent
    assert "bench e1RM trend" in ctx
    assert "Weigh-in notes" not in ctx


def test_weight_question_gets_weigh_ins_not_sets() -> None:
    sets, weights = _data()
    ctx, topics = build_context(
        "did the different scale read higher? whats my weight trend", sets, weights, DAY
    )
    assert topics == {"weight"}
    assert "different scale" in ctx and "## Weight trend" in ctx
    assert "## Sets" not in ctx and "volume_lb" not in ctx


def test_general_question_gets_compact_overview() -> None:
    sets, weights = _data()
    ctx, topics = build_context("how am I doing overall?", sets, weights, DAY)
    assert topics == set()
    assert "Daily totals" in ctx and "Exercises (total sets" in ctx
    assert "## Sets" not in ctx
    assert "overview" in ctx


def test_no_data_and_truncation() -> None:
    ctx, _ = build_context("how am I doing?", [], [], DAY)
    assert ctx == "No training data logged yet."
    many = [(DAY - timedelta(days=i), f"8x {100 + i}lb bench\n" * 8) for i in range(110)]
    sets, weights = prepared(many)
    ctx, _ = build_context("show every bench set", sets, weights, DAY)
    assert len(ctx) <= MAX_CONTEXT_CHARS + 20


def test_user_message_wraps_data() -> None:
    msg = user_message("q?", "ctx")
    assert msg.startswith("<data>\nctx\n</data>") and msg.endswith("Question: q?")


def test_usage_from() -> None:
    u = usage_from(
        SimpleNamespace(
            input_tokens=1200,
            output_tokens=150,
            cache_creation_input_tokens=None,
            cache_read_input_tokens=100,
        )
    )
    assert (u.input_tokens, u.output_tokens, u.total) == (1300, 150, 1450)
    assert usage_from({"input_tokens": 5, "output_tokens": 2}).total == 7
    assert usage_from(None).total == 0
    assert usage_from(object()).total == 0  # missing fields never crash
