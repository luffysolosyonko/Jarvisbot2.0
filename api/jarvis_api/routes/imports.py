"""Import a Jarvis 1.0 (Discord bot) database: POST the jarvis.db file as the body."""

from __future__ import annotations

from fastapi import APIRouter, Request

from jarvis_api import schemas
from jarvis_api.deps import DB, AppSettings, CurrentUser, Limiter
from jarvis_api.errors import ApiError
from jarvis_api.services.import_jarvis1 import import_jarvis1

router = APIRouter(tags=["import"])


@router.post("/import/jarvis1")
async def import_jarvis1_db(
    request: Request, user: CurrentUser, db: DB, settings: AppSettings, limiter: Limiter
) -> schemas.ImportOut:
    limiter.enforce("import", str(user.id), 3, 60)
    data = await request.body()
    if not data:
        raise ApiError(422, "invalid_import", "Choose your Jarvis 1.0 database file (jarvis.db).")
    if len(data) > settings.max_import_bytes:
        raise ApiError(413, "payload_too_large", "That file is too large to import.")
    r = import_jarvis1(db, user, data)
    return schemas.ImportOut(
        imported=r.imported,
        duplicates=r.duplicates,
        unreadable=r.unreadable,
        aliases_added=r.aliases_added,
    )
