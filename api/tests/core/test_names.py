from __future__ import annotations

from datetime import date

from jarvis_core.analysis import exercise_summaries
from jarvis_core.names import apply_aliases, canonical_names, expands_to, match_exercise

from .helpers import prepared


def test_learned_abbreviations() -> None:
    counts = {
        "one arm lat pulldown": 6,
        "oa lat pulldown": 3,
        "lat pulldown": 10,
        "incline bench": 8,
        "inc bench": 2,
        "bicep curls": 5,
        "bicep curl": 4,
        "rear delt fly": 9,
        "rdf": 2,
    }
    m = canonical_names(counts)
    assert m["oa lat pulldown"] == "one arm lat pulldown"  # initials
    assert m["lat pulldown"] == "lat pulldown"  # not swallowed by the one-arm version
    assert m["inc bench"] == "incline bench"  # start of a word
    assert m["bicep curl"] == "bicep curls"  # plural merged
    assert m["rdf"] == "rear delt fly"  # all initials
    assert m["one arm lat pulldown"] == "one arm lat pulldown"


def test_prefix_is_short_only() -> None:
    assert expands_to(["press"], ["pressdown"]) is None  # a different exercise
    assert expands_to(["bench"], ["bench"]) is False
    assert expands_to(["bench"], ["bench", "press"]) is None  # never adds words


def test_user_aliases() -> None:
    m = canonical_names(
        {"sldl": 3, "stiff leg deadlift": 5, "oa row": 2},
        {"sldl": "stiff leg deadlift", "OA": "one arm"},
    )
    assert m["sldl"] == "stiff leg deadlift" and m["oa row"] == "one arm row"
    assert apply_aliases("oa db row", {"oa db": "one arm dumbbell"}) == "one arm dumbbell row"


def test_match_exercise_uses_known_names() -> None:
    assert match_exercise("inc bench", {"incline bench": 12}) == "incline bench"
    assert match_exercise("squat", {"incline bench": 12}) == "squat"


def test_end_to_end_abbreviated_set_reported_under_full_name() -> None:
    sets, _ = prepared(
        [
            (date(2026, 3, 2), "10x 50lb One Arm Lat Pulldown"),
            (date(2026, 3, 3), "10x 55lb OA lat pulldown"),
        ]
    )
    assert {s.exercise for s in sets} == {"one arm lat pulldown"}
    [summary] = exercise_summaries(sets)
    assert summary.sets == 2 and summary.sessions == 2
