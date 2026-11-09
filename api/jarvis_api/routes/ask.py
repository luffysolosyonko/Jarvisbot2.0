"""Ask Jarvis: a question about your own data -> a short answer plus tokens used.

Per-user daily token cap (lower for the demo account), per-user rate limit, a 15s
provider timeout, and every outcome is a clear JSON response.
"""

from __future__ import annotations

from datetime import UTC, datetime, time

from fastapi import APIRouter, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from jarvis_api import schemas
from jarvis_api.config import Settings
from jarvis_api.deps import DB, AppSettings, CurrentUser, Limiter
from jarvis_api.errors import ApiError
from jarvis_api.llm import LLMError, LLMProvider
from jarvis_api.models import AiUsage, User
from jarvis_api.services.logs import load_user_data
from jarvis_api.services.users import user_tz
from jarvis_core import ai
from jarvis_core.ai import Usage

router = APIRouter(tags=["ask"])

MAX_ANSWER_TOKENS = 4000

ERRORS: dict[str, tuple[int, str, str]] = {
    "timeout": (504, "ai_timeout", "Jarvis took too long to answer. Try again."),
    "rate_limited": (503, "ai_busy", "Jarvis is busy right now. Try again in a minute."),
    "unavailable": (502, "ai_unavailable", "Jarvis couldn't answer right now. Try again."),
    "misconfigured": (503, "ai_not_configured", "Ask Jarvis isn't set up on this server."),
    "refused": (
        422,
        "ai_refused",
        "Jarvis can't help with that one. Try asking about your training.",
    ),
}


def daily_cap(user: User, settings: Settings) -> int:
    is_demo = bool(settings.demo_uid) and user.firebase_uid == settings.demo_uid
    return settings.ask_demo_daily_token_cap if is_demo else settings.ask_daily_token_cap


def tokens_used_today(db: Session, user: User, now: datetime) -> int:
    tz = user_tz(user)
    start = datetime.combine(now.astimezone(tz).date(), time.min, tz).astimezone(UTC)
    total = db.scalar(
        select(func.coalesce(func.sum(AiUsage.input_tokens + AiUsage.output_tokens), 0)).where(
            AiUsage.user_id == user.id, AiUsage.at >= start
        )
    )
    return int(total or 0)


def record_usage(
    db: Session, user: User, model: str, usage: Usage, topics: set[str], now: datetime
) -> None:
    db.add(
        AiUsage(
            user_id=user.id,
            at=now,
            model=model,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            topics=",".join(sorted(topics)) or "overview",
        )
    )
    db.commit()


@router.post("/ask")
def ask(
    body: schemas.AskIn,
    request: Request,
    user: CurrentUser,
    db: DB,
    settings: AppSettings,
    limiter: Limiter,
) -> schemas.AskOut:
    provider: LLMProvider | None = request.app.state.llm
    if provider is None:
        raise ApiError(503, "ai_not_configured", "Ask Jarvis isn't set up on this server.")
    limiter.enforce("ask", str(user.id), settings.rate_limit_ask_per_min, 60)

    now = datetime.now(UTC)
    cap = daily_cap(user, settings)
    used = tokens_used_today(db, user, now)
    if used >= cap:
        raise ApiError(
            429,
            "daily_cap_reached",
            "You've used today's Ask Jarvis allowance. It resets at midnight.",
        )

    data = load_user_data(db, user)
    today = now.astimezone(user_tz(user)).date()
    context, topics = ai.build_context(body.question, data.sets, data.weighins, today)
    unit = user.settings.set_unit
    system = ai.ASK_SYSTEM.format(unit=unit)
    try:
        reply = provider.complete(
            system, ai.user_message(body.question, context), MAX_ANSWER_TOKENS
        )
    except LLMError as exc:
        if exc.usage.total:
            record_usage(db, user, provider.model, exc.usage, set(topics), now)
        status, code, message = ERRORS[exc.code]
        raise ApiError(status, code, message) from exc

    record_usage(db, user, reply.model, reply.usage, set(topics), now)
    return schemas.AskOut(
        answer=reply.text,
        input_tokens=reply.usage.input_tokens,
        output_tokens=reply.usage.output_tokens,
        tokens_used_today=used + reply.usage.total,
        daily_token_cap=cap,
        topics=sorted(topics),
    )
