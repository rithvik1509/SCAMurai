"""SCAMurai (SATARK) FastAPI application entry point.

Run from the repository root::

    uvicorn backend.main:app --reload --port 8000

The API is deterministic-first. No LLM is required for the service to start or
answer requests, and no endpoint here claims that fraud or theft is proven.
"""

from __future__ import annotations

import logging
import httpx
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api import analyze, crypto, intent, kage, rescue, kagami
from backend.core.rate_limit import RateLimitMiddleware
from backend.kagami.rpc import Rpc
from backend.kagami.service import KagamiService
from backend.kagami.store import SnapshotStore
from backend.core.config import Settings, get_settings
from backend.core.errors import register_exception_handlers
from backend.core.middleware import (
    BodySizeLimitMiddleware,
    RequestContextMiddleware,
    UnhandledExceptionMiddleware,
)
from backend.models.schemas import HealthResponse, ServiceStatus
from backend.kage.investigation_manager import InvestigationManager
from backend.kage.security_policy import TargetPolicy

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


def create_app(settings: Settings | None = None, *, rpc_transport=None) -> FastAPI:
    """Build the application.

    Accepting explicit settings keeps tests hermetic and lets deployments
    validate configuration before the process starts serving traffic.
    """
    resolved = settings or get_settings()
    _configure_logging(resolved.log_level)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        try:
            yield
        finally:
            await _app.state.yokai_manager.close()
            await _app.state.rpc_client.aclose()

    app = FastAPI(
        title=resolved.app_name,
        version=resolved.app_version,
        description=_DESCRIPTION,
        docs_url="/docs",
        redoc_url=None,
        lifespan=lifespan,
    )
    app.state.settings = resolved
    # Provider credentials must never appear in default HTTP client logs.
    logging.getLogger('httpx').setLevel(logging.WARNING)
    logging.getLogger('httpcore').setLevel(logging.WARNING)
    app.state.rpc_client = httpx.AsyncClient(follow_redirects=False, trust_env=False, transport=rpc_transport)
    app.state.kagami = KagamiService(
        Rpc(resolved, app.state.rpc_client),
        SnapshotStore(resolved.snapshot_db, resolved.snapshot_ttl_seconds, resolved.snapshot_max_records),
    )
    app.state.yokai_policy = TargetPolicy(
        allowed_origins=frozenset(resolved.yokai_allowed_origins),
        allow_local_fixtures=resolved.local_fixtures_enabled,
        allow_public_targets=resolved.yokai_public_targets_enabled,
    )
    app.state.yokai_manager = InvestigationManager(
        policy=app.state.yokai_policy,
        max_concurrency=resolved.yokai_max_concurrency,
        max_queue=resolved.yokai_max_queue,
        ttl_seconds=resolved.yokai_job_ttl_seconds,
    )

    register_exception_handlers(app)

    # add_middleware prepends, so this order yields (outermost first):
    # request context -> CORS -> body limit -> unhandled errors -> router.
    # CORS stays outside error handling so even 4xx/5xx responses carry CORS
    # headers; the request id wraps everything, including preflight replies.
    app.add_middleware(UnhandledExceptionMiddleware)
    app.add_middleware(RateLimitMiddleware, per_minute=resolved.rate_limit_per_minute)
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
    app.include_router(kage.router, prefix=API_PREFIX)
    app.include_router(kagami.router, prefix=API_PREFIX)
    app.include_router(crypto.router, prefix=API_PREFIX)
    app.include_router(intent.router, prefix=API_PREFIX)
    app.include_router(rescue.router, prefix=API_PREFIX)

    return app


app = create_app()
