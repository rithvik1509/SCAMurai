"""Environment-driven application settings.

All values come from environment variables (optionally loaded from an ignored
``backend/.env`` file). Nothing secret belongs in source control, and no
production defaults are baked in beyond local-development values.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from dotenv import load_dotenv
from pydantic import BaseModel, ConfigDict, Field, field_validator

from backend.models.schemas import Environment

BACKEND_DIR = Path(__file__).resolve().parents[1]
ENV_FILE = BACKEND_DIR / ".env"

# Local Next.js development origins. Production must set explicit origins.
DEFAULT_CORS_ORIGINS: tuple[str, ...] = (
    "http://localhost:3000",
    "http://127.0.0.1:3000",
)

DEFAULT_MAX_REQUEST_BYTES = 64 * 1024

LOG_LEVELS = frozenset({"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"})


class Settings(BaseModel):
    """Validated runtime configuration.

    Unknown fields are rejected so a typo in the env mapping fails loudly at
    startup instead of being silently ignored.
    """

    model_config = ConfigDict(extra="forbid", frozen=True)

    app_name: str = "SCAMurai API"
    service_name: str = "scamurai-backend"
    app_version: str = "0.1.0"
    environment: Environment = Environment.DEVELOPMENT
    cors_allowed_origins: tuple[str, ...] = DEFAULT_CORS_ORIGINS
    max_request_bytes: int = Field(
        default=DEFAULT_MAX_REQUEST_BYTES,
        ge=1024,
        le=10 * 1024 * 1024,
    )
    log_level: str = "INFO"

    @field_validator("cors_allowed_origins", mode="before")
    @classmethod
    def _parse_origin_list(cls, value: Any) -> Any:
        if isinstance(value, str):
            return tuple(part.strip() for part in value.split(",") if part.strip())
        return value

    @field_validator("cors_allowed_origins")
    @classmethod
    def _validate_origins(cls, origins: tuple[str, ...]) -> tuple[str, ...]:
        normalized: list[str] = []
        for origin in origins:
            if origin == "*":
                raise ValueError(
                    "Wildcard CORS origins are not allowed; list explicit origins."
                )
            parsed = urlsplit(origin)
            if (
                parsed.scheme not in {"http", "https"}
                or not parsed.netloc
                or parsed.username is not None
                or parsed.password is not None
                or parsed.path not in {"", "/"}
                or parsed.query
                or parsed.fragment
            ):
                raise ValueError(
                    f"Invalid CORS origin {origin!r}; expected http(s)://host[:port]."
                )
            normalized.append(f"{parsed.scheme}://{parsed.netloc}")
        # Preserve order while dropping accidental duplicates.
        return tuple(dict.fromkeys(normalized))

    @field_validator("log_level")
    @classmethod
    def _validate_log_level(cls, value: str) -> str:
        level = value.strip().upper()
        if level not in LOG_LEVELS:
            allowed = ", ".join(sorted(LOG_LEVELS))
            raise ValueError(f"LOG_LEVEL must be one of: {allowed}.")
        return level

    @classmethod
    def from_env(cls) -> "Settings":
        """Build settings from the process environment plus ``backend/.env``.

        ``backend/.env`` is optional and never overrides already-exported
        variables, which keeps container/CI configuration authoritative.
        """
        load_dotenv(dotenv_path=ENV_FILE, override=False)

        values: dict[str, Any] = {
            "environment": os.getenv("APP_ENV", Environment.DEVELOPMENT.value),
            "log_level": os.getenv("LOG_LEVEL", "INFO"),
        }

        raw_origins = os.getenv("CORS_ALLOWED_ORIGINS")
        if raw_origins is not None:
            values["cors_allowed_origins"] = raw_origins

        raw_max_bytes = os.getenv("MAX_REQUEST_BYTES")
        if raw_max_bytes is not None:
            values["max_request_bytes"] = raw_max_bytes

        return cls(**values)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the process-wide settings instance."""
    return Settings.from_env()
