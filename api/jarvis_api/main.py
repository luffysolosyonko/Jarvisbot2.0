from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import Engine

from jarvis_api import errors
from jarvis_api.config import Settings, get_settings
from jarvis_api.db import make_engine, make_sessionmaker
from jarvis_api.firebase import AccountAdmin, FirebaseAuth, TokenVerifier
from jarvis_api.llm import LLMProvider, make_provider
from jarvis_api.ratelimit import RateLimiter
from jarvis_api.routes import aliases, ask, logs, me, stats, tools

API_PREFIX = "/api/v1"
_FROM_SETTINGS: object = object()  # build the LLM provider from settings


def create_app(
    settings: Settings | None = None,
    *,
    engine: Engine | None = None,
    verifier: TokenVerifier | None = None,
    accounts: AccountAdmin | None = None,
    limiter: RateLimiter | None = None,
    llm: LLMProvider | object | None = _FROM_SETTINGS,
) -> FastAPI:
    settings = settings or get_settings()
    logging.basicConfig(level=settings.log_level.upper())

    app = FastAPI(
        title="Jarvis API",
        version="0.1.0",
        docs_url="/docs" if settings.env != "production" else None,
        redoc_url=None,
    )
    engine = engine or make_engine(settings.database_url)
    firebase = FirebaseAuth(settings.firebase_project_id, settings.google_application_credentials)
    app.state.settings = settings
    app.state.engine = engine
    app.state.sessionmaker = make_sessionmaker(engine)
    app.state.verifier = verifier or firebase
    app.state.accounts = accounts or firebase
    app.state.limiter = limiter or RateLimiter()
    app.state.llm = make_provider(settings) if llm is _FROM_SETTINGS else llm

    errors.install(app)

    @app.middleware("http")
    async def limit_body(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        length = request.headers.get("content-length")
        if length and length.isdigit() and int(length) > settings.max_body_bytes:
            return JSONResponse(
                errors.error_body("payload_too_large", "The request is too large."), 413
            )
        return await call_next(request)

    if settings.cors_origin_list:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origin_list,
            allow_methods=["GET", "POST", "PATCH", "DELETE"],
            allow_headers=["Authorization", "Content-Type"],
        )

    @app.get("/healthz", tags=["ops"])
    def healthz() -> dict[str, str]:
        """Liveness probe. Unauthenticated by design."""
        return {"status": "ok"}

    for module in (me, logs, stats, tools, aliases, ask):
        app.include_router(module.router, prefix=API_PREFIX)
    return app


def __getattr__(name: str) -> FastAPI:
    """`uvicorn jarvis_api.main:app` builds the app on first access, not at import."""
    if name == "app":
        application = create_app()
        globals()["app"] = application
        return application
    raise AttributeError(name)
