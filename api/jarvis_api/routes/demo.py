"""'Try the demo': a Firebase custom token for the one demo account.

The UID comes only from server config (DEMO_UID), never from the request. The token
carries no extra claims. Unauthenticated, so it is rate limited per IP.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Request

from jarvis_api import schemas
from jarvis_api.deps import AppSettings, Limiter, client_ip
from jarvis_api.errors import ApiError
from jarvis_api.firebase import DemoTokenMinter

router = APIRouter(tags=["demo"])
log = logging.getLogger("jarvis.demo")

DAY_S = 24 * 60 * 60


@router.post("/demo/token")
def demo_token(request: Request, settings: AppSettings, limiter: Limiter) -> schemas.DemoTokenOut:
    if not settings.demo_uid:
        raise ApiError(503, "demo_unavailable", "The demo isn't set up on this server.")
    ip = client_ip(request, settings)
    limiter.enforce("demo-min", ip, settings.demo_token_per_min, 60)
    limiter.enforce("demo-day", ip, settings.demo_token_per_day, DAY_S)
    minter: DemoTokenMinter = request.app.state.minter
    try:
        token = minter.mint(settings.demo_uid)
    except Exception as exc:  # missing or invalid service account
        log.warning("demo token mint failed: %s", type(exc).__name__)
        raise ApiError(503, "demo_unavailable", "The demo isn't available right now.") from exc
    return schemas.DemoTokenOut(token=token)
