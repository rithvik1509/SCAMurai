"""Strict target and browser-request policy for YOKAI.

Application checks reduce risk but do not replace network-level egress controls.
"""

from __future__ import annotations

import asyncio
import ipaddress
import socket
from dataclasses import dataclass
from urllib.parse import urlsplit, urlunsplit

LOCAL_FIXTURE_PREFIX = "/api/v1/kage/__yokai_fixture__/"
LOCAL_FIXTURE_ORIGINS = frozenset(
    {"http://127.0.0.1:8000", "http://localhost:8000", "http://127.0.0.1:8001", "http://localhost:8001"}
)


class TargetNotAllowed(ValueError):
    """The target is outside the explicitly authorized investigation scope."""


@dataclass(frozen=True)
class TargetPolicy:
    allowed_origins: frozenset[str]
    allow_local_fixtures: bool = True
    allow_public_targets: bool = False

    def normalize_target(self, value: str) -> str:
        """Validate an HTTP(S) URL and return its canonical form."""
        try:
            parsed = urlsplit(value)
            port = parsed.port
        except ValueError as exc:
            raise TargetNotAllowed("Target URL is malformed.") from exc

        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            raise TargetNotAllowed("Only absolute HTTP or HTTPS targets are allowed.")
        if parsed.username is not None or parsed.password is not None:
            raise TargetNotAllowed("Target URLs cannot contain credentials.")

        host = parsed.hostname.lower().rstrip(".")
        default_port = 443 if parsed.scheme == "https" else 80
        origin = f"{parsed.scheme}://{host}"
        effective_port = port or default_port
        if effective_port != default_port:
            origin = f"{origin}:{effective_port}"

        loopback_host = host in {"localhost", "127.0.0.1", "::1"}
        local_fixture = (
            self.allow_local_fixtures
            and parsed.path.startswith(LOCAL_FIXTURE_PREFIX)
            and (
                origin in LOCAL_FIXTURE_ORIGINS
                or (loopback_host and origin in self.allowed_origins)
            )
        )
        if parsed.path.startswith(LOCAL_FIXTURE_PREFIX) and not self.allow_local_fixtures:
            raise TargetNotAllowed('Controlled fixtures are disabled.')
        if origin not in self.allowed_origins and not local_fixture and not self.allow_public_targets:
            raise TargetNotAllowed(
                "Target origin is not on the YOKAI authorization allowlist."
            )

        if loopback_host:
            if not local_fixture:
                raise TargetNotAllowed(
                    "Local network targets are allowed only for controlled YOKAI fixtures."
                )
        else:
            if self.allow_public_targets and effective_port not in {80, 443} and origin not in self.allowed_origins:
                raise TargetNotAllowed('Public website testing supports standard HTTP and HTTPS ports only.')
            try:
                address = ipaddress.ip_address(host)
            except ValueError:
                address = None
            if address is not None and not address.is_global:
                raise TargetNotAllowed("Private and special-use IP targets are blocked.")

        return urlunsplit(
            (parsed.scheme, parsed.netloc, parsed.path or "/", parsed.query, "")
        )

    async def permits_request(self, value: str, target_origin: str) -> bool:
        """Validate each browser request before it is allowed onto the network."""
        try:
            normalized = self.normalize_target(value)
            parts = urlsplit(normalized)
            target = urlsplit(target_origin)
            origin = _origin(parts)
            if origin != target_origin and not self.allow_public_targets:
                return False
            if (parts.scheme != target.scheme and not self.allow_public_targets) or parts.hostname is None:
                return False

            if (
                parts.path.startswith(LOCAL_FIXTURE_PREFIX)
                and origin in self.allowed_origins | LOCAL_FIXTURE_ORIGINS
                and (parts.hostname or "").lower() in {"localhost", "127.0.0.1", "::1"}
            ):
                return parts.path.startswith(LOCAL_FIXTURE_PREFIX)

            addresses = await asyncio.wait_for(asyncio.to_thread(_resolve_host, parts.hostname), timeout=5)
            return bool(addresses) and all(
                ipaddress.ip_address(address).is_global for address in addresses
            )
        except (TargetNotAllowed, OSError, ValueError, TimeoutError):
            return False


def _origin(parts) -> str:
    host = (parts.hostname or "").lower().rstrip(".")
    scheme = parts.scheme.lower()
    try:
        port = parts.port
    except ValueError:
        return ""
    default_port = 443 if scheme == "https" else 80
    return f"{scheme}://{host}" + (f":{port}" if port and port != default_port else "")


def _resolve_host(host: str) -> set[str]:
    try:
        return {str(ipaddress.ip_address(host))}
    except ValueError:
        records = socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)
        return {record[4][0] for record in records}


def redact_url(value: str) -> str:
    """Remove query values and fragments before URLs enter reports or logs."""
    try:
        parts = urlsplit(value)
    except ValueError:
        return "[invalid-url]"
    query_count = sum(bool(part) for part in parts.query.split("&"))
    redacted_query = "&".join(
        f"param{index}=[redacted]" for index in range(1, query_count + 1)
    )
    # Redirect evidence can contain user information even though targets cannot.
    safe_host = parts.netloc.rsplit('@', 1)[-1]
    return urlunsplit((parts.scheme, safe_host, parts.path, redacted_query, ""))
