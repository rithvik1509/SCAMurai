"""SCAMurai (SATARK) FastAPI application entry point.

Run from the repository root::

    uvicorn backend.main:app --reload --port 8000

The API is deterministic-first. No LLM is required for the service to start or
answer requests, and no endpoint here claims that fraud or theft is proven.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api import analyze, crypto, intent, rescue
from backend.core.config import Settings, get_settings
from backend.core.errors import register_exception_handlers
from backend.core.middleware import (
    BodySizeLimitMiddleware,
    RequestContextMiddleware,
    UnhandledExceptionMiddleware,
)
from backend.models.schemas import HealthResponse, ServiceStatus

API_PREFIX = "/api/v1"

_DESCRIPTION = (
    "Evidence-based financial scam awareness API. Analyses explain the "
    "promises a message makes, the action it requests, and what a decoded "
    "instruction actually authorizes. Signals are risk indicators, not proof "
    "of fraud or theft."
)


def _configure_logging(level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, level, logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )


def create_app(settings: Settings | None = None) -> FastAPI:
    """Build the application.

    Accepting explicit settings keeps tests hermetic and lets deployments
    validate configuration before the process starts serving traffic.
    """
    resolved = settings or get_settings()
    _configure_logging(resolved.log_level)

    app = FastAPI(
        title=resolved.app_name,
        version=resolved.app_version,
        description=_DESCRIPTION,
        docs_url="/docs",
        redoc_url=None,
    )
    app.state.settings = resolved

    register_exception_handlers(app)

    # add_middleware prepends, so this order yields (outermost first):
    # request context -> CORS -> body limit -> unhandled errors -> router.
    # CORS stays outside error handling so even 4xx/5xx responses carry CORS
    # headers; the request id wraps everything, including preflight replies.
    app.add_middleware(UnhandledExceptionMiddleware)
    app.add_middleware(
        BodySizeLimitMiddleware,
        max_bytes=resolved.max_request_bytes,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(resolved.cors_allowed_origins),
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Accept", "Content-Type", "X-Request-ID"],
        expose_headers=["X-Request-ID"],
        max_age=600,
    )
    app.add_middleware(RequestContextMiddleware)

    @app.get(
        "/health",
        response_model=HealthResponse,
        tags=["system"],
        summary="Service health",
        description=(
            "Liveness probe with stable fields. It performs no external calls "
            "and exposes no configuration secrets."
        ),
    )
    async def health() -> HealthResponse:
        return HealthResponse(
            service=resolved.service_name,
            status=ServiceStatus.OK,
            version=resolved.app_version,
            environment=resolved.environment,
            timestamp=datetime.now(timezone.utc),
        )

    # Route modules are mounted now; their endpoints arrive in later steps.
    app.include_router(analyze.router, prefix=API_PREFIX)
    app.include_router(crypto.router, prefix=API_PREFIX)
    app.include_router(intent.router, prefix=API_PREFIX)
    app.include_router(rescue.router, prefix=API_PREFIX)

    return app


app = create_app()
