from __future__ import annotations

import pytest

from jarvis_core.parser import (
    KG_TO_LB,
    PARSER_VERSION,
    DayContext,
    ParsedSet,
    detect_kind,
    looks_like_weigh_in,
    parse_log,
    parse_set_line,
    parse_weigh_in,
)


def sets(text: str, **kw: object) -> list[tuple[int, int, float | None, str | None]]:
    log = parse_log(text, kind="workout", **kw)  # type: ignore[arg-type]
    return [(s.good_reps, s.failed_reps, s.weight_lb, s.exercise) for s in log.sets]


def one(text: str, **kw: object) -> ParsedSet:
    log = parse_log(text, kind="workout", **kw)  # type: ignore[arg-type]
    assert len(log.sets) == 1, log.sets
    return log.sets[0]


def test_parser_version_is_a_positive_int() -> None:
    assert isinstance(PARSER_VERSION, int) and PARSER_VERSION >= 1


# --- single sets -----------------------------------------------------------
def test_plain_set() -> None:
    assert sets("8x 160lb bench") == [(8, 0, 160.0, "bench")]


def test_kg_is_converted_to_lb() -> None:
    s = one("12x 25kg rear delt fly")
    assert s.weight_lb == 55.1 and s.weight_text == "25kg"


def test_case_never_matters() -> None:
    assert one("8x 160lb Bench Press").exercise == "bench press"
    assert one("8X 160LB BENCH PRESS").exercise == "bench press"
    assert one("12x 25KG Rear Delt Fly").weight_lb == 55.1


@pytest.mark.parametrize(
    ("line", "good", "failed"),
    [
        ("12x1f 25kg rear delt fly", 12, 1),  # 12 good + 1 failed
        ("8x5f 25kg rear delt fly", 8, 5),  # 8 good + 5 failed
        ("2xf 200lb bench", 1, 1),  # 2 tried, the last failed
        ("1xf 225lb bench", 0, 1),  # 0 good
    ],
)
def test_failure_notation(line: str, good: int, failed: int) -> None:
    s = one(line)
    assert (s.good_reps, s.failed_reps) == (good, failed)


def test_range_is_estimated_midpoint() -> None:
    s = one("8x ?70/80kg bench")
    assert s.estimated and s.weight_lb == 165.3
    s = one("8x 20-25lb bicep curl")
    assert s.estimated and s.weight_lb == 22.5 and s.exercise == "bicep curl"


def test_unknown_weight_question_mark() -> None:
    s = one("20x ? Db traps")
    assert s.estimated and s.weight_lb is None and s.weight_text == "?"
    assert s.exercise == "dumbbell traps"


def test_either_or_weight_is_estimated_midpoint() -> None:
    s = one("12x 60 or 50kg bench press")
    assert s.exercise == "bench press" and s.estimated
    assert s.weight_lb == round(55 * KG_TO_LB, 1)


def test_bodyweight_bar_and_per_hand() -> None:
    s = one("10x uw dips")
    assert s.bodyweight and s.weight_lb is None and s.exercise == "dips"
    assert one("8x bar bench").weight_lb == 45
    assert one("8x bar bench", bar_lb=35).weight_lb == 35
    s = one("25x 15kg each hand plate shrugs")
    assert s.per_hand and s.weight_lb == 33.1 and s.exercise == "plate shrugs"


def test_default_unit_and_trailing_weight() -> None:
    assert one("8x 60 bench", default_unit="kg").weight_lb == 132.3
    assert one("8x 60 bench").weight_lb == 60
    s = one("8x barbell row 60kg")
    assert s.weight_lb == 132.3 and s.exercise == "barbell row"


def test_abbreviations_expand() -> None:
    assert one("5x 95lb ohp").exercise == "overhead press"
    assert one("10x 50lb db row").exercise == "dumbbell row"


def test_parenthetical_notes_are_ignored() -> None:
    assert one("8x 135lb bench (felt easy)").exercise == "bench"


# --- several sets per line -------------------------------------------------
def test_multi_set_chain() -> None:
    assert sets("2x1x1x1x1xf 85kg bench") == (
        [(2, 0, 187.4, "bench")] + [(1, 0, 187.4, "bench")] * 4 + [(0, 1, 187.4, "bench")]
    )
    assert sets("fx3xfx1xf 60kg bench") == [
        (0, 1, 132.3, "bench"),
        (3, 0, 132.3, "bench"),
        (0, 1, 132.3, "bench"),
        (1, 0, 132.3, "bench"),
        (0, 1, 132.3, "bench"),
    ]


def test_chain_after_first_set_rest_pause() -> None:
    # The headline example: one line, five sets, the last a failed attempt.
    assert sets("5x 155lb 2x1x1xf bench") == [
        (5, 0, 155.0, "bench"),
        (2, 0, 155.0, "bench"),
        (1, 0, 155.0, "bench"),
        (1, 0, 155.0, "bench"),
        (0, 1, 155.0, "bench"),
    ]
    assert sets("10x 135lb fx3xfx1xf bench")[0] == (10, 0, 135.0, "bench")
    assert sets("2x 185lb 1x bench") == [(2, 0, 185.0, "bench"), (1, 0, 185.0, "bench")]
    assert sets("5x 15x bar bench") == [(5, 0, 45.0, "bench"), (15, 0, 45.0, "bench")]


def test_two_part_chains_keep_single_set_meaning() -> None:
    assert sets("2xf 200lb bench") == [(1, 1, 200.0, "bench")]
    assert sets("8x5f 25kg rear delt fly") == [(8, 5, 55.1, "rear delt fly")]


# --- names across lines ----------------------------------------------------
def test_header_line_names_following_sets() -> None:
    log = parse_log("bench\n8x 160lb\n8x 155lb", kind="workout")
    assert [s.exercise for s in log.sets] == ["bench", "bench"]
    assert all(s.inferred for s in log.sets)


def test_caret_copies_exercise_and_weight() -> None:
    log = parse_log("25x 15kg each hand plate shrugs\n30x ^", kind="workout")
    last = log.sets[-1]
    assert last.exercise == "plate shrugs" and last.weight_lb == 33.1 and last.per_hand
    log = parse_log("10x uw dips\n8x ^", kind="workout")
    assert log.sets[-1].exercise == "dips" and log.sets[-1].bodyweight


def test_bare_number_repeats_previous_set() -> None:
    log = parse_log("12x 135lb bench\n2\n3", kind="workout")
    assert [(s.exercise, s.weight_lb, s.good_reps) for s in log.sets] == [("bench", 135, 12)] * 3
    assert [s.idx for s in log.sets] == [0, 1, 2]


def test_unnamed_bodyweight_set_after_weighted_is_not_that_exercise() -> None:
    log = parse_log("8x 165lb bench\n10x uw", kind="workout")
    assert log.sets[1].exercise is None
    assert any("No exercise name" in w.message for w in log.warnings)


def test_context_carries_across_logs_on_the_same_day() -> None:
    first = parse_log("8x 165lb bench", kind="workout")
    second = parse_log("8x 170lb\n2", kind="workout", context=first.context)
    assert [s.exercise for s in second.sets] == ["bench", "bench"]
    fresh = parse_log("8x 170lb", kind="workout", context=DayContext())
    assert fresh.sets[0].exercise is None


# --- warnings and detection ------------------------------------------------
def test_warnings_point_at_lines() -> None:
    log = parse_log("8x 135lb bench\nfelt great today!\n8x bench", kind="workout")
    by_line = {w.line: w.message for w in log.warnings}
    assert 2 not in by_line  # a short word-only line is a header, not an error
    assert "No weight" in by_line[3]
    log = parse_log("8x 135lb bench\nhttps://example.com/video", kind="workout")
    assert log.warnings[0].line == 2
    assert parse_log("^", kind="workout").warnings


def test_empty_and_garbage_input() -> None:
    assert not parse_log("", kind="workout").ok
    assert not parse_log("???", kind="workout").ok
    too_long = parse_log("8x 135lb bench\n" * 100, kind="workout")
    assert len(too_long.sets) == 60 and "first 60 lines" in too_long.warnings[-1].message


def test_detect_kind() -> None:
    assert detect_kind("8x 135lb bench") == "workout"
    assert detect_kind("171.6") == "weight"
    assert detect_kind("77.5kg morning") == "weight"
    assert detect_kind("bench") == "workout"
    log = parse_log("171.6")
    assert log.kind == "weight" and log.weigh_in and log.weigh_in.weight_lb == 171.6


def test_parse_set_line_rejects_non_sets() -> None:
    assert parse_set_line("hello") is None
    assert parse_set_line("0x 135lb bench") is None
    assert parse_set_line("999x 135lb bench") is None


# --- weigh-ins -------------------------------------------------------------
@pytest.mark.parametrize(
    ("text", "lb"),
    [
        ("171.6", 171.6),
        ("171lb 6", 171.6),  # missed decimal point
        ("171 6", 171.6),
        ("77.5kg", 170.9),
        ("79", 174.2),  # no unit, under 100: kg
        ("w 72kg", 158.7),
        ("weight: 165 lbs", 165.0),
    ],
)
def test_weigh_ins(text: str, lb: float) -> None:
    w = parse_weigh_in(text)
    assert w is not None and w.weight_lb == lb


def test_weigh_in_note_and_yesterday() -> None:
    w = parse_weigh_in("171.6 different scale")
    assert w and w.note == "different scale"
    w = parse_weigh_in("yesterday 170.2")
    assert w and w.day_offset == -1 and w.weight_lb == 170.2 and w.note is None


@pytest.mark.parametrize("text", ["8x 20-25lb bicep curl", "hello", "1200lb", "0.5lb"])
def test_not_weigh_ins(text: str) -> None:
    assert parse_weigh_in(text) is None


@pytest.mark.parametrize(
    ("text", "lb"),
    [("1lb", 1.0), ("1000lb", 1000.0), ("900lb", 900.0), ("12", 26.5), ("400kg", 881.8)],
)
def test_weigh_in_range_is_1_to_1000_lb(text: str, lb: float) -> None:
    w = parse_weigh_in(text)
    assert w is not None and w.weight_lb == lb


@pytest.mark.parametrize("text", ["12", "8", "900lb"])
def test_mode_guess_only_counts_plausible_body_weights(text: str) -> None:
    assert not looks_like_weigh_in(text)
    assert looks_like_weigh_in("182.4")


def test_bare_reps_repeat_the_set_above_at_its_weight() -> None:
    assert sets("8x 135lb bench\n8x\n6x") == [
        (8, 0, 135.0, "bench"),
        (8, 0, 135.0, "bench"),
        (6, 0, 135.0, "bench"),
    ]
    assert sets("8x 135lb bench\n5x2f") == [(8, 0, 135.0, "bench"), (5, 2, 135.0, "bench")]
    assert sets("8x uw dips\n10x") == [(8, 0, None, "dips"), (10, 0, None, "dips")]
    # A name line in between starts a new exercise: no weight is carried over.
    assert sets("8x 135lb bench\nsquat\n5x") == [(8, 0, 135.0, "bench"), (5, 0, None, "squat")]
    # From an earlier log that day too.
    earlier = parse_log("8x 135lb bench", kind="workout").context
    assert sets("8x", context=earlier) == [(8, 0, 135.0, "bench")]
    # Nothing above: not a set.
    log = parse_log("8x", kind="workout")
    assert log.sets == [] and [w.code for w in log.warnings] == ["nothing_to_repeat"]


@pytest.mark.parametrize("text", ["8x -5lb bench", "8x 135lb bench -5", "-3x 135lb bench"])
def test_negative_numbers_are_not_sets(text: str) -> None:
    assert sets(text) == []


def test_negative_numbers_are_not_weigh_ins_but_ranges_and_bullets_are_fine() -> None:
    assert parse_weigh_in("-180") is None
    assert parse_weigh_in("180 -2") is None
    w = parse_weigh_in("- 180")
    assert w is not None and w.weight_lb == 180
    assert sets("5x 20-25lb curl") == [(5, 0, 22.5, "curl")]
