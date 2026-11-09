"""Alembic environment. The database URL comes from app settings (DATABASE_URL)."""

from __future__ import annotations

from alembic import context
from sqlalchemy import engine_from_config, pool

from jarvis_api import models  # noqa: F401 - registers tables on Base.metadata
from jarvis_api.config import Settings
from jarvis_api.db import Base

config = context.config
url = config.get_main_option("sqlalchemy.url") or Settings().database_url
target_metadata = Base.metadata


def run_offline() -> None:
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_online() -> None:
    connectable = engine_from_config(
        {"sqlalchemy.url": url}, prefix="sqlalchemy.", poolclass=pool.NullPool
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=connection.dialect.name == "sqlite",
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_offline()
else:
    run_online()
