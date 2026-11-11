from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect, select, text, update
from sqlalchemy.orm import Session

from jarvis_api.db import Base, make_engine
from jarvis_api.firebase import Claims
from jarvis_api.models import Log, LoggedSet
from jarvis_api.services.logs import rebuild, save_log
from jarvis_api.services.users import get_or_create_user
from jarvis_core.parser import PARSER_VERSION

API_DIR = Path(__file__).resolve().parents[2]


def test_migrations_match_models(tmp_path: Path) -> None:
    url = f"sqlite:///{(tmp_path / 'm.db').as_posix()}"
    cfg = Config(str(API_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(API_DIR / "migrations"))
    cfg.set_main_option("sqlalchemy.url", url)
    command.upgrade(cfg, "head")
    insp = inspect(make_engine(url))
    tables = set(insp.get_table_names()) - {"alembic_version"}
    assert tables == set(Base.metadata.tables)
    for name, table in Base.metadata.tables.items():
        assert {c["name"] for c in insp.get_columns(name)} == set(table.columns.keys()), name
    command.downgrade(cfg, "base")
    assert set(inspect(make_engine(url)).get_table_names()) <= {"alembic_version"}


def test_0006_deletes_hidden_answers_and_drops_both_columns(tmp_path: Path) -> None:
    url = f"sqlite:///{(tmp_path / 'm.db').as_posix()}"
    cfg = Config(str(API_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(API_DIR / "migrations"))
    cfg.set_main_option("sqlalchemy.url", url)
    command.upgrade(cfg, "0005")
    engine = make_engine(url)
    with engine.begin() as conn:
        conn.execute(
            text(
                "insert into users (id, firebase_uid, auth_provider, created_at) "
                "values (1, 'alice', 'password', '2026-11-01 00:00:00')"
            )
        )
        for i, hidden in enumerate((False, True, False), start=1):
            conn.execute(
                text(
                    "insert into ask_messages (id, user_id, asked_at, question, answer, "
                    "input_tokens, output_tokens, hidden) "
                    "values (:id, 1, '2026-11-01 00:00:00', 'q', 'a', 1, 1, :hidden)"
                ),
                {"id": i, "hidden": hidden},
            )
        conn.execute(
            text(
                "insert into logs (id, user_id, kind, raw_text, logged_at, local_date, "
                "parser_version, weight_confirmed) "
                "values (1, 1, 'weight', '80', '2026-11-01 00:00:00', '2026-11-01', 7, 1)"
            )
        )
    engine.dispose()

    command.upgrade(cfg, "head")
    engine = make_engine(url)
    insp = inspect(engine)
    assert "hidden" not in {c["name"] for c in insp.get_columns("ask_messages")}
    assert "weight_confirmed" not in {c["name"] for c in insp.get_columns("logs")}
    with engine.connect() as conn:
        assert conn.execute(text("select id from ask_messages order by id")).scalars().all() == [
            1,
            3,
        ]
        assert conn.execute(text("select raw_text from logs")).scalars().all() == ["80"]
    engine.dispose()

    command.downgrade(cfg, "0005")
    engine = make_engine(url)
    with engine.connect() as conn:
        assert conn.execute(text("select hidden from ask_messages")).scalars().all() == [0, 0]
        assert conn.execute(text("select weight_confirmed from logs")).scalars().all() == [0]
    engine.dispose()


def test_rebuild_rederives_rows_from_raw_text(db: Session) -> None:
    from datetime import UTC, datetime, timedelta

    user = get_or_create_user(db, Claims(uid="alice"))
    t0 = datetime(2026, 3, 2, 18, tzinfo=UTC)
    save_log(db, user, "bench\n8x 165lb", t0)
    save_log(db, user, "8x 170lb\n2", t0 + timedelta(minutes=20))
    save_log(db, user, "171.6", t0 + timedelta(minutes=30))

    def snapshot() -> list[tuple[object, ...]]:
        return [
            (s.log_id, s.idx, s.exercise, s.weight_lb, s.good_reps)
            for s in db.scalars(select(LoggedSet).order_by(LoggedSet.log_id, LoggedSet.idx))
        ]

    before = snapshot()
    assert [r[2] for r in before] == ["bench"] * 3

    assert rebuild(db, user) == 0  # nothing outdated
    db.execute(update(Log).values(parser_version=0))
    db.execute(LoggedSet.__table__.delete())
    db.commit()
    assert rebuild(db, user) == 3
    assert snapshot() == before
    assert {lg.parser_version for lg in db.scalars(select(Log))} == {PARSER_VERSION}
    assert db.scalars(select(Log).where(Log.kind == "weight")).one().weigh_in is not None
