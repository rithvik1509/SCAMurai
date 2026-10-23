"""Tests for centralized error behavior."""

from __future__ import annotations

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


def _error(response):  # type: ignore[no-untyped-def]
    return response.json()["error"]


def test_unknown_route_returns_error_envelope(client: TestClient) -> None:
    response = client.get("/does-not-exist")

    assert response.status_code == 404
    body = response.json()
    assert body["error"]["code"] == "not_found"
    assert body["error"]["details"] == []
    assert body["request_id"] == response.headers["x-request-id"]


def test_wrong_method_returns_error_envelope(client: TestClient) -> None:
    response = client.post("/health")

    assert response.status_code == 405
    assert _error(response)["code"] == "method_not_allowed"
    assert response.headers.get("allow") == "GET"


def test_validation_errors_are_consistent_and_do_not_echo_input(
    probe_client: TestClient,
) -> None:
    response = probe_client.post(
        "/__probe__/validate",
        json={"unexpected": "SENSITIVE-VALUE"},
    )

    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "validation_error"
    assert body["error"]["message"] == "Request validation failed."
    assert body["error"]["details"], "validation details must be present"
    assert body["error"]["details"][0]["field"].startswith("body")
    assert body["request_id"] == response.headers["x-request-id"]

    # Submitted values and internals must never be reflected back.
    assert "SENSITIVE-VALUE" not in response.text
    assert "Traceback" not in response.text


def test_extra_fields_are_rejected(probe_client: TestClient) -> None:
    response = probe_client.post(
        "/__probe__/validate",
        json={"message": "hello", "extra": "nope"},
    )

    assert response.status_code == 422
    details = _error(response)["details"]
    assert any(detail["type"] == "extra_forbidden" for detail in details)


def test_strict_types_are_enforced(probe_client: TestClient) -> None:
    response = probe_client.post("/__probe__/validate", json={"message": 123})

    assert response.status_code == 422
    assert _error(response)["code"] == "validation_error"


def test_oversized_body_is_rejected_before_routing(client: TestClient) -> None:
    response = client.post(
        "/api/v1/analyze",
        content=b"x" * 5000,
        headers={"Content-Type": "application/json"},
    )

    assert response.status_code == 413
    body = response.json()
    assert body["error"]["code"] == "payload_too_large"
    assert body["request_id"] == response.headers["x-request-id"]


def test_body_at_limit_is_not_rejected_by_the_limiter(client: TestClient) -> None:
    # 4096 bytes is the fixture limit. A 422 proves the limiter let the request
    # reach routing and JSON validation instead of returning a 413.
    response = client.post(
        "/api/v1/analyze",
        content=b"x" * 4096,
        headers={"Content-Type": "application/json"},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


@pytest.mark.asyncio
async def test_oversized_stream_without_content_length_is_rejected(
    app: FastAPI,
) -> None:
    async def streamed_body():
        for _ in range(5):
            yield b"x" * 1000

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport,
        base_url="http://testserver",
    ) as async_client:
        response = await async_client.post(
            "/api/v1/analyze",
            content=streamed_body(),
            headers={"Content-Type": "application/json"},
        )

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "payload_too_large"


def test_unhandled_errors_do_not_leak_internals(
    probe_client: TestClient,
) -> None:
    response = probe_client.get("/__probe__/explode")

    assert response.status_code == 500
    body = response.json()
    assert body["error"]["code"] == "internal_error"
    assert body["error"]["message"] == "An unexpected error occurred."
    assert body["request_id"] == response.headers["x-request-id"]

    assert "synthetic-failure-must-not-leak" not in response.text
    assert "Traceback" not in response.text
    assert "RuntimeError" not in response.text
