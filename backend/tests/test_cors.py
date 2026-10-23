"""Tests for CORS behavior derived from settings."""

from __future__ import annotations

from fastapi.testclient import TestClient

ALLOWED_ORIGIN = "http://localhost:3000"


def test_allowed_origin_preflight_succeeds(client: TestClient) -> None:
    response = client.options(
        "/health",
        headers={
            "Origin": ALLOWED_ORIGIN,
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == ALLOWED_ORIGIN
    assert response.headers["access-control-allow-credentials"] == "true"
    assert "GET" in response.headers["access-control-allow-methods"]
    assert "x-request-id" in response.headers


def test_allowed_origin_on_simple_request(client: TestClient) -> None:
    response = client.get("/health", headers={"Origin": ALLOWED_ORIGIN})

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == ALLOWED_ORIGIN
    exposed = response.headers["access-control-expose-headers"].lower()
    assert "x-request-id" in exposed


def test_disallowed_origin_receives_no_cors_grant(client: TestClient) -> None:
    response = client.get(
        "/health",
        headers={"Origin": "https://evil.example"},
    )

    assert response.status_code == 200
    assert "access-control-allow-origin" not in response.headers


def test_wildcard_origin_is_never_returned(client: TestClient) -> None:
    response = client.get("/health", headers={"Origin": "https://evil.example"})

    assert response.headers.get("access-control-allow-origin") != "*"
