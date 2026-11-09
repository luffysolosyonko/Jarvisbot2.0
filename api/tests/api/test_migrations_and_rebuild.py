from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect, select, update
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
