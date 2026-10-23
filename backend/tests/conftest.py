"""Shared test fixtures.

The repository root is added to ``sys.path`` so ``backend`` imports work
regardless of the directory pytest is invoked from.
"""

from __future__ import annotations

import sys
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import Field

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.core.config import Settings  # noqa: E402
from backend.main import create_app  # noqa: E402
from backend.models.schemas import Environment, StrictRequestModel  # noqa: E402


class ProbeRequest(StrictRequestModel):
    """Request model for the synthetic validation route."""

    message: str = Field(min_length=1, max_length=64)


@pytest.fixture()
def settings(tmp_path) -> Settings:
    """Hermetic settings: known environment, one origin, a small body limit."""
    return Settings(
        environment=Environment.TEST,
        cors_allowed_origins=("http://localhost:3000",),
        max_request_bytes=4096,
        snapshot_db=str(tmp_path / 'snapshots.sqlite3'),
    )


@pytest.fixture()
def app(settings: Settings) -> FastAPI:
    return create_app(settings)


@pytest.fixture()
def client(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def probe_client(app: FastAPI) -> Iterator[TestClient]:
    """App plus synthetic routes used only to exercise shared error handling."""

    @app.post("/__probe__/validate", include_in_schema=False)
    async def probe_validate(payload: ProbeRequest) -> dict[str, str]:
        return {"received": payload.message}

    @app.get("/__probe__/explode", include_in_schema=False)
    async def probe_explode() -> dict[str, str]:
        raise RuntimeError("synthetic-failure-must-not-leak")

    with TestClient(app) as test_client:
        yield test_client
