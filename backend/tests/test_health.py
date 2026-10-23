"""Tests for GET /health."""

from __future__ import annotations

import re
from datetime import datetime

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9._-]{8,64}$")


def test_health_returns_stable_shape(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")

    payload = response.json()
    assert set(payload) == {
        "service",
        "status",
        "version",
        "environment",
        "timestamp",
    }
    assert payload["service"] == "scamurai-backend"
    assert payload["status"] == "ok"
    assert payload["version"] == "0.1.0"
    assert payload["environment"] == "test"

    timestamp = datetime.fromisoformat(payload["timestamp"])
    assert timestamp.tzinfo is not None


def test_health_always_returns_a_request_id(client: TestClient) -> None:
    response = client.get("/health")

    request_id = response.headers.get("x-request-id")
    assert request_id is not None
    assert REQUEST_ID_RE.fullmatch(request_id)


def test_health_echoes_safe_client_request_id(client: TestClient) -> None:
    response = client.get(
        "/health",
        headers={"X-Request-ID": "test-request-123"},
    )

    assert response.headers["x-request-id"] == "test-request-123"


def test_health_replaces_unsafe_request_id(client: TestClient) -> None:
    unsafe = "<script>alert(1)</script>"
    response = client.get("/health", headers={"X-Request-ID": unsafe})

    request_id = response.headers["x-request-id"]
    assert request_id != unsafe
    assert REQUEST_ID_RE.fullmatch(request_id)


@pytest.mark.asyncio
async def test_health_over_async_http(app: FastAPI) -> None:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport,
        base_url="http://testserver",
    ) as async_client:
        response = await async_client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
