"""Import a Jarvis 1.0 (Discord bot) SQLite export into one account.

The bot archived every Discord message (raw text and time) and marked which ones
logged sets or a body weight. Raw text is the source of truth here too, so each of
those messages is re-read with this app's parser and saved at its original time, in
time order (so "^" and unnamed sets resolve as they did). Messages at a time the
account already has an entry for are skipped, so importing twice adds nothing. The
bot's exercise shortcuts (its `aliases` table) become this account's aliases.

The upload is untrusted: it must be a SQLite file with the bot's `messages` table,
it's opened read-only and immutable, and the work is capped.
"""

from __future__ import annotations

import os
import sqlite3
import tempfile
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from jarvis_api.errors import ApiError
from jarvis_api.models import Alias, Log, User
from jarvis_api.services.logs import save_log
from jarvis_core.parser import MAX_CHARS, MAX_LINES

SQLITE_MAGIC = b"SQLite format 3\x00"
MAX_MESSAGES = 50_000


@dataclass(frozen=True)
class ImportResult:
    imported: int  # entries saved
    duplicates: int  # messages at a time that already had an entry
    unreadable: int  # messages that didn't parse as sets or a weigh-in
    aliases_added: int


def _bad(message: str) -> ApiError:
    return ApiError(422, "invalid_import", message)


def _when(raw: object) -> datetime | None:
    if not isinstance(raw, str) or not raw.strip():
        return None
    try:
        at = datetime.fromisoformat(raw.strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    return at if at.tzinfo else at.replace(tzinfo=UTC)  # the bot stored UTC


def _second(at: datetime) -> datetime:
    if at.tzinfo is None:  # SQLite (tests) hands back UTC times without a zone
        at = at.replace(tzinfo=UTC)
    return at.astimezone(UTC).replace(microsecond=0)


def _tables(conn: sqlite3.Connection) -> set[str]:
    return {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}


def _chunks(text: str) -> list[str]:
    """A message longer than one log allows is saved as several logs, in order."""
    lines = text[: MAX_CHARS * 20].split("\n")
    return ["\n".join(lines[i : i + MAX_LINES]) for i in range(0, len(lines), MAX_LINES)]


Mode = Literal["workout", "weight"]


def read_export(path: str) -> tuple[list[tuple[datetime, Mode, str]], list[tuple[str, str]]]:
    """(time, mode, text) for each message that logged sets or a weight, oldest first;
    and the bot's (short, full) aliases."""
    try:
        conn = sqlite3.connect(f"file:{path}?mode=ro&immutable=1", uri=True)
    except sqlite3.Error as exc:
        raise _bad("That file isn't a Jarvis 1.0 database.") from exc
    try:
        tables = _tables(conn)
        if "messages" not in tables:
            raise _bad("That database has no Jarvis 1.0 messages in it.")
        workout: set[int] = set()
        weight: set[int] = set()
        if "sets" in tables:
            workout = {
                r[0]
                for r in conn.execute("SELECT DISTINCT message_id FROM sets WHERE kind = 'set'")
            }
        if "entries" in tables:
            weight = {
                r[0]
                for r in conn.execute("SELECT message_id FROM entries WHERE weight IS NOT NULL")
            }
        wanted = workout | weight
        rows: list[tuple[datetime, Mode, str]] = []
        for mid, content, created in conn.execute(
            "SELECT id, content, created_at FROM messages ORDER BY created_at, id LIMIT ?",
            (MAX_MESSAGES * 4,),
        ):
            if mid not in wanted or not isinstance(content, str) or not content.strip():
                continue
            at = _when(created)
            if at is None:
                continue
            rows.append((at, "workout" if mid in workout else "weight", content.strip()))
            if len(rows) >= MAX_MESSAGES:
                break
        aliases: list[tuple[str, str]] = []
        if "aliases" in tables:
            for short, full in conn.execute("SELECT short, full FROM aliases"):
                if (
                    isinstance(short, str)
                    and isinstance(full, str)
                    and short.strip()
                    and full.strip()
                ):
                    aliases.append((short.strip().lower()[:40], full.strip().lower()[:120]))
        return sorted(rows, key=lambda r: r[0]), aliases
    except sqlite3.DatabaseError as exc:
        raise _bad("That file isn't a readable Jarvis 1.0 database.") from exc
    finally:
        conn.close()


def import_jarvis1(db: Session, user: User, data: bytes) -> ImportResult:
    if not data.startswith(SQLITE_MAGIC):
        raise _bad("That file isn't a SQLite database. Export it from Jarvis 1.0 (jarvis.db).")
    fd, path = tempfile.mkstemp(suffix=".db")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        messages, aliases = read_export(path)
    finally:
        os.remove(path)

    added = 0
    have = set(db.scalars(select(Alias.short).where(Alias.user_id == user.id)))
    for short, full in aliases:
        if short not in have and short != full:
            db.add(Alias(user_id=user.id, short=short, full=full))
            have.add(short)
            added += 1
    db.commit()

    seen = {_second(t) for t in db.scalars(select(Log.logged_at).where(Log.user_id == user.id))}
    imported = duplicates = unreadable = 0
    for at, mode, text in messages:
        key = _second(at)
        if key in seen:
            duplicates += 1
            continue
        seen.add(key)
        saved_any = False
        for i, chunk in enumerate(_chunks(text)):
            when = at + timedelta(seconds=i)  # a long message's parts, a second apart
            if save_log(db, user, chunk, when, mode) is not None:
                saved_any = True
        if saved_any:
            imported += 1
        else:
            unreadable += 1
    return ImportResult(imported, duplicates, unreadable, added)
