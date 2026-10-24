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
from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator, model_validator

from backend.models.schemas import Environment

BACKEND_DIR = Path(__file__).resolve().parents[1]
ENV_FILE = BACKEND_DIR / ".env"

# Local Next.js development origins. Production must set explicit origins.
DEFAULT_CORS_ORIGINS: tuple[str, ...] = (
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3002",
    "http://127.0.0.1:3002",
)

DEFAULT_MAX_REQUEST_BYTES = 64 * 1024
DEFAULT_YOKAI_ALLOWED_ORIGINS: tuple[str, ...] = ()

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
    yokai_allowed_origins: tuple[str, ...] = DEFAULT_YOKAI_ALLOWED_ORIGINS
    yokai_max_concurrency: int = Field(default=2, ge=1, le=4)
    yokai_max_queue: int = Field(default=12, ge=1, le=100)
    yokai_job_ttl_seconds: int = Field(default=900, ge=60, le=86_400)
    log_level: str = "INFO"
    rpc_urls: dict[str, SecretStr] = Field(default_factory=dict, repr=False)
    simulation_networks: tuple[str, ...] = ()
    approval_indexer_networks: tuple[str, ...] = ()
    approval_lookback_blocks: int = Field(default=1000, ge=1, le=10000)
    approval_chunk_blocks: int = Field(default=1000, ge=100, le=2000)
    approval_max_candidates: int = Field(default=50, ge=1, le=200)
    kagami_timeout_seconds: int = Field(default=30, ge=1, le=60)
    kagami_max_concurrency: int = Field(default=2, ge=1, le=8)
    rpc_timeout_seconds: float = Field(default=4.0, ge=0.1, le=15)
    snapshot_db: str = str(BACKEND_DIR / 'data' / 'snapshots.sqlite3')
    snapshot_ttl_seconds: int = Field(default=900, ge=1, le=86400)
    snapshot_max_records: int = Field(default=200, ge=1, le=1000)
    rate_limit_per_minute: int = Field(default=120, ge=1, le=10000)
    local_fixtures_enabled: bool = True
    yokai_public_targets_enabled: bool = False

    @model_validator(mode='after')
    def validate_chain_configuration(self):
        networks = {'ethereum', 'sepolia', 'arbitrum'}
        if set(self.rpc_urls) - networks or set(self.simulation_networks) - networks or set(self.approval_indexer_networks) - networks:
            raise ValueError('Unknown configured network.')
        if set(self.simulation_networks) - set(self.rpc_urls):
            raise ValueError('Simulation networks must have configured RPC URLs.')
        if set(self.approval_indexer_networks) - set(self.rpc_urls):
            raise ValueError('Approval indexer networks must have configured RPC URLs.')
        for secret in self.rpc_urls.values():
            parsed = urlsplit(secret.get_secret_value())
            if (not parsed.hostname or parsed.username or parsed.password or parsed.fragment
                or (parsed.scheme != 'https' and not (
                    self.environment != Environment.PRODUCTION and parsed.scheme == 'http'
                    and parsed.hostname in {'localhost', '127.0.0.1', '::1'}))):
                raise ValueError('RPC endpoints require HTTPS; development permits loopback HTTP.')
        if self.environment == Environment.PRODUCTION and self.local_fixtures_enabled:
            raise ValueError('Disable LOCAL_FIXTURES_ENABLED in production.')
        return self

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

    @field_validator("yokai_allowed_origins", mode="before")
    @classmethod
    def _parse_yokai_origin_list(cls, value: Any) -> Any:
        if isinstance(value, str):
            return tuple(part.strip() for part in value.split(",") if part.strip())
        return value

    @field_validator("yokai_allowed_origins")
    @classmethod
    def _validate_yokai_origins(cls, origins: tuple[str, ...]) -> tuple[str, ...]:
        normalized: list[str] = []
        for origin in origins:
            if origin == "*":
                raise ValueError("YOKAI target origins cannot use a wildcard.")
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
                    f"Invalid YOKAI origin {origin!r}; expected http(s)://host[:port]."
                )
            normalized.append(f"{parsed.scheme}://{parsed.netloc.lower()}")
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
            'rpc_urls': {network: os.environ[key] for network, key in (
                ('ethereum', 'ETHEREUM_RPC_URL'), ('sepolia', 'SEPOLIA_RPC_URL'),
                ('arbitrum', 'ARBITRUM_RPC_URL')) if os.getenv(key)},
            'simulation_networks': tuple(v.strip() for v in os.getenv('SIMULATION_NETWORKS', '').split(',') if v.strip()),
            'approval_indexer_networks': tuple(v.strip() for v in os.getenv('APPROVAL_INDEXER_NETWORKS', '').split(',') if v.strip()),
            'local_fixtures_enabled': os.getenv('LOCAL_FIXTURES_ENABLED', 'false' if os.getenv('APP_ENV') == 'production' else 'true'),
            'yokai_public_targets_enabled': os.getenv('YOKAI_PUBLIC_TARGETS_ENABLED', 'false'),
        }

        raw_origins = os.getenv("CORS_ALLOWED_ORIGINS")
        if raw_origins is not None:
            values["cors_allowed_origins"] = raw_origins

        raw_max_bytes = os.getenv("MAX_REQUEST_BYTES")
        if raw_max_bytes is not None:
            values["max_request_bytes"] = raw_max_bytes

        raw_yokai_origins = os.getenv("YOKAI_ALLOWED_ORIGINS")
        if raw_yokai_origins is not None:
            values["yokai_allowed_origins"] = raw_yokai_origins
        for env_name, setting_name in (
            ("YOKAI_MAX_CONCURRENCY", "yokai_max_concurrency"),
            ("YOKAI_MAX_QUEUE", "yokai_max_queue"),
            ("YOKAI_JOB_TTL_SECONDS", "yokai_job_ttl_seconds"),
            ('APPROVAL_LOOKBACK_BLOCKS', 'approval_lookback_blocks'),
            ('APPROVAL_CHUNK_BLOCKS', 'approval_chunk_blocks'),
            ('APPROVAL_MAX_CANDIDATES', 'approval_max_candidates'),
            ('KAGAMI_TIMEOUT_SECONDS', 'kagami_timeout_seconds'),
            ('KAGAMI_MAX_CONCURRENCY', 'kagami_max_concurrency'),
            ('RPC_TIMEOUT_SECONDS', 'rpc_timeout_seconds'),
            ('SNAPSHOT_DB', 'snapshot_db'),
            ('SNAPSHOT_TTL_SECONDS', 'snapshot_ttl_seconds'),
            ('SNAPSHOT_MAX_RECORDS', 'snapshot_max_records'),
            ('RATE_LIMIT_PER_MINUTE', 'rate_limit_per_minute'),
        ):
            raw_value = os.getenv(env_name)
            if raw_value is not None:
                values[setting_name] = raw_value

        return cls(**values)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the process-wide settings instance."""
    return Settings.from_env()
