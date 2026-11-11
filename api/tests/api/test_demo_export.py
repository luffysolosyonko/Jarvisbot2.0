"""Loading an exported history into the demo account. The export here is made up."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, date, datetime
from pathlib import Path

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from jarvis_api import seed
from jarvis_api.config import Settings
from jarvis_api.db import Base, make_engine, make_sessionmaker
from jarvis_api.demo_export import DemoDataError, has_export, load_export
from jarvis_api.models import Alias, Log, LoggedSet, WeighIn
from jarvis_api.seed import reset_demo
from jarvis_api.services.logs import rebuild
from jarvis_api.services.users import get_or_create_user
from jarvis_core.parser import MAX_LINES

from .conftest import DEMO_UID

TZ = "America/Chicago"

# date, time, exercise, reps, good, failed, weight_lb, estimated, bodyweight, e1rm, message
WORKOUTS = [
    ("2026-03-02", "6:05 PM", "bench", 8, 8, 0, "135", "N", "N", "171", "m1"),
    ("2026-03-02", "6:05 PM", "bench", 8, 8, 0, "135", "N", "N", "171", "m1"),
    ("2026-03-02", "6:05 PM", "bench", 6, 5, 1, "145", "N", "N", "", "m1"),
    ("2026-03-02", "6:05 PM", "pull ups", 7, 7, 0, "", "N", "Y", "", "m1"),
    ("2026-03-02", "6:05 PM", "curl", 10, 8, 2, "27.6", "N", "N", "", "m1"),
    ("2026-03-02", "6:40 PM", "incline", 8, 8, 0, "70", "Y", "N", "", "m2"),
    ("2026-03-02", "6:40 PM", "incline", 8, 8, 0, "", "Y", "N", "", "m2"),
    ("2026-03-02", "6:40 PM", "plank hold", 1, 1, 0, "", "N", "N", "", "m2"),
    ("2026-03-04", "12:10 AM", "squat", 5, 5, 0, "225", "N", "N", "", "m3"),
    ("2026-03-04", "12:10 AM", "l 40lb split squat", 8, 8, 0, "", "N", "N", "", "m3"),
]
# date, time, weight_lb, as typed, message
WEIGHINS = [
    ("2026-03-02", "7:01 AM", "180.4", "180.4", "w1"),
    ("2026-03-03", "7:10 AM", "180.8", "82kg", "w2"),
    ("2026-03-04", "7:05 AM", "181", "about 181ish", "w3"),
    ("2026-03-05", "12:30 PM", "179.6", "179.6 after lunch", "w4"),
]


Rows = Sequence[tuple[object, ...]]


def write_export(folder: Path, workouts: Rows = WORKOUTS, weighins: Rows = WEIGHINS) -> Path:
    folder.mkdir(parents=True, exist_ok=True)
    for name, rows in (("workouts.tsv", workouts), ("weighins.tsv", weighins)):
        text = "".join("\t".join(str(cell) for cell in row) + "\n" for row in rows)
        (folder / name).write_text(text, encoding="utf-8")
    return folder


def test_rows_become_entries_in_the_notebook_shorthand(tmp_path: Path) -> None:
    assert not has_export(tmp_path)
    export = load_export(write_export(tmp_path))
    assert has_export(tmp_path)
    assert [(e.at.isoformat(timespec="minutes"), e.kind, e.text) for e in export.entries] == [
        ("2026-03-02T07:01", "weight", "180.4"),
        (
            "2026-03-02T18:05",  # one message id = one entry
            "workout",
            "8x 135lbs bench\n8x ^\n6xf 145lbs bench\n7x uw pull ups\n8x2f 12.5kg curl",
        ),
        ("2026-03-02T18:40", "workout", "8x ?70lbs incline\n8x ? incline\n1x plank hold"),
        ("2026-03-03T07:10", "weight", "82kg"),  # as it was typed
        ("2026-03-04T00:10", "workout", "5x 225lbs squat\n8x split squat"),
        ("2026-03-04T07:05", "weight", "181lbs"),  # the typed text doesn't read as 181
        ("2026-03-05T12:30", "weight", "179.6 after lunch"),
    ]
    assert export.renamed == {"l 40lb split squat": "split squat"}
    assert (export.sets, export.weigh_ins) == (10, 4)


def stored_sets(db: Session) -> list[tuple[object, ...]]:
    return [
        (s.exercise, s.reps, s.good_reps, s.failed_reps, s.weight_lb, s.estimated, s.bodyweight)
        for s in db.scalars(
            select(LoggedSet).join(Log).order_by(Log.logged_at, Log.id, LoggedSet.idx)
        )
    ]


def test_seed_stores_every_row_as_written(db: Session, tmp_path: Path) -> None:
    export = load_export(write_export(tmp_path))
    assert reset_demo(db, DEMO_UID, TZ, export=export) == 7
    sets = stored_sets(db)
    assert sets == [
        ("bench", 8, 8, 0, 135.0, False, False),
        ("bench", 8, 8, 0, 135.0, False, False),
        ("bench", 6, 5, 1, 145.0, False, False),  # failed reps
        ("pull ups", 7, 7, 0, None, False, True),  # bodyweight
        ("curl", 8, 8, 2, 27.6, False, False),  # "8x2f": the count before the x is the good reps
        ("incline", 8, 8, 0, 70.0, True, False),  # estimated
        ("incline", 8, 8, 0, None, True, False),  # estimated, weight unknown
        ("plank hold", 1, 1, 0, None, False, False),  # blank weight
        ("squat", 5, 5, 0, 225.0, False, False),
        ("split squat", 8, 8, 0, None, False, False),
    ]

    logs = db.scalars(select(Log).order_by(Log.logged_at, Log.id)).all()
    # local wall-clock time in the demo user's zone
    assert logs[1].logged_at.replace(tzinfo=UTC) == datetime(2026, 3, 3, 0, 5, tzinfo=UTC)
    assert logs[1].local_date == date(2026, 3, 2) and logs[4].local_date == date(2026, 3, 4)
    weighins = db.scalars(select(WeighIn).join(Log).order_by(Log.logged_at)).all()
    assert [(w.weight_lb, w.typed_unit, w.note) for w in weighins] == [
        (180.4, "lb", None),
        (180.8, "kg", None),  # typed in kg
        (181.0, "lb", None),
        (179.6, "lb", "after lunch"),
    ]
    assert db.scalar(select(func.count()).select_from(Alias)) == 0  # an export keeps its names

    user = get_or_create_user(db, seed.Claims(uid=DEMO_UID))
    assert rebuild(db, user, only_outdated=False) == 7  # re-deriving from the text agrees
    assert stored_sets(db) == sets
    assert reset_demo(db, DEMO_UID, TZ, export=export) == 7  # replaces, doesn't duplicate
    assert stored_sets(db) == sets


def test_a_message_too_long_for_one_entry_is_split_between_exercises(tmp_path: Path) -> None:
    rows = [
        ("2026-03-02", "6:05 PM", f"lift {'abcdefg'[i]}", 5 + n, 5 + n, 0, "100", "N", "N", "", "m")
        for i in range(7)
        for n in range(10)
    ]
    export = load_export(write_export(tmp_path, rows, []))
    first, second = export.entries
    assert first.at == second.at and export.sets == 70
    assert len(first.text.splitlines()) == MAX_LINES and len(second.text.splitlines()) == 10
    assert second.text.startswith("5x 100lbs lift g\n6x ^")
    assert [r.exercise for r in second.rows] == ["lift g"] * 10


@pytest.mark.parametrize(
    ("row", "needle"),
    [
        (("2026-03-02", "6:05 PM", "bench", 9, 5, 2, "135", "N", "N", "", "m"), "line 1"),
        (("2026-03-02", "6:05 PM", "!!!", 8, 8, 0, "135", "N", "N", "", "m"), "'!!!'"),
        (("2026-03-02", "6:05 PM", "bench", 8, 8, 0, "9999", "N", "N", "", "m"), "line 1"),
        (("2026-03-02", "25:05 PM", "bench", 8, 8, 0, "135", "N", "N", "", "m"), "line 1"),
        (("2026-03-02", "6:05 PM", "bench", 8, 8, 0, "135", "N", "maybe", "", "m"), "line 1"),
        (("2026-03-02", "6:05 PM", "bench", 8, 8, 0), "11 columns"),
    ],
)
def test_a_row_that_cannot_be_stored_as_written_stops_the_load(
    tmp_path: Path, row: tuple[object, ...], needle: str
) -> None:
    with pytest.raises(DemoDataError, match=needle):
        load_export(write_export(tmp_path, [row]))


def test_a_weigh_in_outside_the_accepted_range_stops_the_load(tmp_path: Path) -> None:
    with pytest.raises(DemoDataError, match="line 1"):
        load_export(write_export(tmp_path, WORKOUTS, [("2026-03-02", "7:01 AM", "5000", "x", "w")]))


@pytest.fixture
def seed_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Session:
    """`python -m jarvis_api.seed` pointed at a throwaway database."""
    url = f"sqlite:///{(tmp_path / 'seed.db').as_posix()}"
    engine = make_engine(url)
    Base.metadata.create_all(engine)
    monkeypatch.setattr(
        seed,
        "Settings",
        lambda: Settings(
            _env_file=None,  # type: ignore[call-arg]
            database_url=url,
            demo_uid=DEMO_UID,
            demo_data_dir=str(tmp_path / "default"),
        ),
    )
    return make_sessionmaker(engine)()


def count(db: Session, model: type) -> int:
    db.expire_all()
    return db.scalar(select(func.count()).select_from(model)) or 0


def test_seed_command_loads_the_data_folder(
    seed_db: Session, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert seed.main(["--data", str(write_export(tmp_path / "export"))]) == 0
    out = capsys.readouterr().out
    assert "7 logs (10 sets, 4 weigh-ins)" in out
    assert "'l 40lb split squat' is stored as 'split squat'" in out
    assert (count(seed_db, LoggedSet), count(seed_db, WeighIn)) == (10, 4)

    # the folder from DEMO_DATA_DIR is used when --data isn't given
    write_export(tmp_path / "default", WORKOUTS[:2], WEIGHINS[:1])
    assert seed.main([]) == 0
    assert (count(seed_db, LoggedSet), count(seed_db, WeighIn)) == (2, 1)


def test_seed_command_makes_up_a_history_without_an_export(
    seed_db: Session, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    (tmp_path / "default").mkdir()  # an empty folder, like an empty Docker mount
    assert seed.main([]) == 0
    assert "made-up history" in capsys.readouterr().out
    assert count(seed_db, LoggedSet) > 300 and count(seed_db, Alias) == 1


def test_seed_command_changes_nothing_when_the_export_is_missing_or_wrong(
    seed_db: Session, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert seed.main(["--data", str(write_export(tmp_path / "export"))]) == 0
    assert seed.main(["--data", str(tmp_path / "nowhere")]) == 2
    bad = [*WORKOUTS, ("2026-03-05", "6:05 PM", "bench", 9, 5, 2, "135", "N", "N", "", "m9")]
    assert seed.main(["--data", str(write_export(tmp_path / "bad", bad))]) == 1
    err = capsys.readouterr().err
    assert "Nothing was changed" in err and "line 11" in err
    assert (count(seed_db, LoggedSet), count(seed_db, WeighIn)) == (10, 4)


def test_an_aliases_file_is_loaded_with_the_export(db: Session, tmp_path: Path) -> None:
    folder = write_export(tmp_path)
    assert load_export(folder).aliases == {}
    (folder / "aliases.tsv").write_text("Bench\tbench press\n", encoding="utf-8")
    export = load_export(folder)
    assert export.aliases == {"bench": "bench press"}
    reset_demo(db, DEMO_UID, TZ, export=export)
    assert [(a.short, a.full) for a in db.scalars(select(Alias))] == [("bench", "bench press")]
    (folder / "aliases.tsv").write_text("bench\t\n", encoding="utf-8")
    with pytest.raises(DemoDataError, match="both names"):
        load_export(folder)
