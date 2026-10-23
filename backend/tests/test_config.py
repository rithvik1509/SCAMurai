"""Tests for environment configuration validation."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from backend.core.config import Settings
from backend.models.schemas import Environment


def test_defaults_are_local_development_safe() -> None:
    settings = Settings()

    assert settings.environment is Environment.DEVELOPMENT
    assert "http://localhost:3000" in settings.cors_allowed_origins
    assert "*" not in settings.cors_allowed_origins
    assert settings.max_request_bytes == 64 * 1024


def test_origin_string_is_split_and_normalized() -> None:
    settings = Settings(
        cors_allowed_origins="https://app.example.com/, http://localhost:3000"
    )

    assert settings.cors_allowed_origins == (
        "https://app.example.com",
        "http://localhost:3000",
    )


def test_duplicate_origins_are_collapsed() -> None:
    settings = Settings(
        cors_allowed_origins=("https://app.example.com", "https://app.example.com/")
    )

    assert settings.cors_allowed_origins == ("https://app.example.com",)


@pytest.mark.parametrize(
    "origin",
    [
        "*",
        "ftp://example.com",
        "https://example.com/path",
        "https://user:pass@example.com",
        "example.com",
    ],
)
def test_invalid_origins_are_rejected(origin: str) -> None:
    with pytest.raises(ValidationError):
        Settings(cors_allowed_origins=(origin,))


def test_wildcard_inside_csv_is_rejected() -> None:
    with pytest.raises(ValidationError):
        Settings(cors_allowed_origins="https://app.example.com,*")


@pytest.mark.parametrize("limit", [0, 100, 20 * 1024 * 1024])
def test_request_size_bounds_are_enforced(limit: int) -> None:
    with pytest.raises(ValidationError):
        Settings(max_request_bytes=limit)


def test_invalid_log_level_is_rejected() -> None:
    with pytest.raises(ValidationError):
        Settings(log_level="LOUD")


def test_unknown_settings_fields_are_rejected() -> None:
    with pytest.raises(ValidationError):
        Settings(unexpected_setting="value")  # type: ignore[call-arg]
