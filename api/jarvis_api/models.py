"""Database tables. Every row is scoped to a user, directly or through its log.

`logs.raw_text` is the source of truth: `sets` and `weigh_ins` are derived from it by
the parser and can be rebuilt when PARSER_VERSION changes. e1RM, volume and
projections are computed on read, never stored.
"""

from __future__ import annotations

from datetime import UTC, date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from jarvis_api.db import Base


def utcnow() -> datetime:
    return datetime.now(UTC)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    firebase_uid: Mapped[str] = mapped_column(String(128), unique=True)
    email: Mapped[str | None] = mapped_column(String(320))
    display_name: Mapped[str | None] = mapped_column(String(200))
    auth_provider: Mapped[str] = mapped_column(String(40), default="unknown")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    settings: Mapped[UserSettings] = relationship(
        back_populates="user", cascade="all, delete-orphan", lazy="joined"
    )


class UserSettings(Base):
    __tablename__ = "user_settings"
    __table_args__ = (CheckConstraint("set_unit in ('lb', 'kg')", name="set_unit_valid"),)

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    tz_name: Mapped[str] = mapped_column(String(64), default="UTC")
    set_unit: Mapped[str] = mapped_column(String(2), default="lb")
    bar_lb: Mapped[float] = mapped_column(Float, default=45.0)

    user: Mapped[User] = relationship(back_populates="settings")


class Log(Base):
    __tablename__ = "logs"
    __table_args__ = (
        CheckConstraint("kind in ('workout', 'weight')", name="kind_valid"),
        Index("ix_logs_user_date", "user_id", "local_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(10))
    raw_text: Mapped[str] = mapped_column(Text)
    logged_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    local_date: Mapped[date] = mapped_column(Date)
    parser_version: Mapped[int] = mapped_column(Integer)

    sets: Mapped[list[LoggedSet]] = relationship(
        back_populates="log", cascade="all, delete-orphan", order_by="LoggedSet.idx"
    )
    weigh_in: Mapped[WeighIn | None] = relationship(
        back_populates="log", cascade="all, delete-orphan"
    )


class LoggedSet(Base):
    __tablename__ = "sets"
    __table_args__ = (
        UniqueConstraint("log_id", "idx", name="uq_sets_log_idx"),
        Index("ix_sets_user", "user_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    log_id: Mapped[int] = mapped_column(ForeignKey("logs.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    idx: Mapped[int] = mapped_column(Integer)
    line: Mapped[int] = mapped_column(Integer, default=0)
    exercise: Mapped[str | None] = mapped_column(String(120))
    reps: Mapped[int] = mapped_column(Integer)
    good_reps: Mapped[int] = mapped_column(Integer)
    failed_reps: Mapped[int] = mapped_column(Integer, default=0)
    weight_lb: Mapped[float | None] = mapped_column(Float)
    weight_text: Mapped[str | None] = mapped_column(String(60))
    flag: Mapped[str | None] = mapped_column(String(8))
    estimated: Mapped[bool] = mapped_column(Boolean, default=False)
    bodyweight: Mapped[bool] = mapped_column(Boolean, default=False)
    per_hand: Mapped[bool] = mapped_column(Boolean, default=False)
    inferred: Mapped[bool] = mapped_column(Boolean, default=False)

    log: Mapped[Log] = relationship(back_populates="sets")


class WeighIn(Base):
    __tablename__ = "weigh_ins"
    __table_args__ = (Index("ix_weigh_ins_user", "user_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    log_id: Mapped[int] = mapped_column(ForeignKey("logs.id", ondelete="CASCADE"), unique=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    weight_lb: Mapped[float] = mapped_column(Float)
    note: Mapped[str | None] = mapped_column(String(200))

    log: Mapped[Log] = relationship(back_populates="weigh_in")


class Alias(Base):
    __tablename__ = "aliases"
    __table_args__ = (UniqueConstraint("user_id", "short", name="uq_aliases_user_short"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    short: Mapped[str] = mapped_column(String(40))
    full: Mapped[str] = mapped_column(String(120))


class AiUsage(Base):
    __tablename__ = "ai_usage"
    __table_args__ = (Index("ix_ai_usage_user_at", "user_id", "at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    model: Mapped[str] = mapped_column(String(80))
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    topics: Mapped[str] = mapped_column(String(80), default="")
