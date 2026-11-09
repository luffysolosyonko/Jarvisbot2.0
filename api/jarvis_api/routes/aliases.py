from __future__ import annotations

from fastapi import APIRouter, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from jarvis_api import schemas
from jarvis_api.deps import DB, CurrentUser
from jarvis_api.errors import ApiError
from jarvis_api.models import Alias
from jarvis_core.parser import normalize_exercise

router = APIRouter(tags=["aliases"])

MAX_ALIASES = 100


@router.get("/aliases")
def list_aliases(user: CurrentUser, db: DB) -> schemas.AliasesOut:
    rows = db.scalars(select(Alias).where(Alias.user_id == user.id).order_by(Alias.short))
    return schemas.AliasesOut(
        aliases=[schemas.AliasOut(id=a.id, short=a.short, full=a.full) for a in rows]
    )


@router.post("/aliases", status_code=201)
def create_alias(body: schemas.AliasIn, user: CurrentUser, db: DB) -> schemas.AliasOut:
    short, full = normalize_exercise(body.short), normalize_exercise(body.full)
    if not short or not full or short == full:
        raise ApiError(422, "invalid_request", "A shortcut needs a different full name.")
    count = len(db.scalars(select(Alias.id).where(Alias.user_id == user.id)).all())
    if count >= MAX_ALIASES:
        raise ApiError(422, "invalid_request", f"You can have up to {MAX_ALIASES} shortcuts.")
    alias = Alias(user_id=user.id, short=short, full=full)
    db.add(alias)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ApiError(409, "conflict", f"'{short}' is already a shortcut.") from exc
    return schemas.AliasOut(id=alias.id, short=alias.short, full=alias.full)


@router.delete("/aliases/{alias_id}", status_code=204)
def delete_alias(alias_id: int, user: CurrentUser, db: DB) -> Response:
    alias = db.scalar(select(Alias).where(Alias.id == alias_id, Alias.user_id == user.id))
    if alias is None:
        raise ApiError(404, "not_found", "Shortcut not found.")
    db.delete(alias)
    db.commit()
    return Response(status_code=204)
