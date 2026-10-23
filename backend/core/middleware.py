"""ASGI middleware for request context, payload limits, and crash safety.

Ordering matters and is deliberate in :func:`backend.main.create_app`:

request id/logging (outermost) → ``CORS`` → body limit → unhandled errors →
FastAPI router. CORS therefore decorates error responses too, and every
response — including CORS preflight — carries ``X-Request-ID``.
"""

from __future__ import annotations

import logging
import time
import uuid

from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from backend.core.errors import (
    build_error_response,
    resolve_request_id,
    safe_request_id,
)
from backend.models.schemas import APIErrorDetail, ErrorCode

logger = logging.getLogger("scamurai.requests")


class RequestContextMiddleware:
    """Attach a safe request id and log request metadata without bodies."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        incoming = Headers(scope=scope).get("x-request-id", "")
        request_id = safe_request_id(incoming) or uuid.uuid4().hex

        state = scope.setdefault("state", {})
        if not isinstance(state, dict):
            state = {}
            scope["state"] = state
        state["request_id"] = request_id

        started_at = time.perf_counter()
        response_status: int | None = None

        async def send_with_request_id(message: Message) -> None:
            nonlocal response_status
            if message["type"] == "http.response.start":
                response_status = int(message["status"])
                MutableHeaders(scope=message)["X-Request-ID"] = request_id
            await send(message)

        try:
            await self.app(scope, receive, send_with_request_id)
        finally:
            duration_ms = (time.perf_counter() - started_at) * 1000.0
            logger.info(
                "request_completed method=%s path=%s status=%s duration_ms=%.1f request_id=%s",
                scope.get("method", "-"),
                scope.get("path", "-"),
                response_status if response_status is not None else "-",
                duration_ms,
                request_id,
            )


class BodySizeLimitMiddleware:
    """Reject request bodies above the configured limit with a 413 envelope.

    The body is buffered up to ``max_bytes`` (default 64 KiB) so both a
    truthful and a missing/incorrect ``Content-Length`` are handled. Buffering
    at this size is cheap and keeps later JSON validation simple.
    """

    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        if max_bytes <= 0:
            raise ValueError("max_bytes must be positive.")
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        declared_length = Headers(scope=scope).get("content-length")
        if declared_length is not None:
            try:
                if int(declared_length) > self.max_bytes:
                    await self._reject(scope, receive, send)
                    return
            except ValueError:
                # A malformed header is not trusted; fall through to counting.
                pass

        chunks: list[bytes] = []
        total = 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            if message["type"] != "http.request":
                continue
            body = message.get("body", b"")
            total += len(body)
            if total > self.max_bytes:
                await self._reject(scope, receive, send)
                return
            chunks.append(body)
            if not message.get("more_body", False):
                break

        buffered = b"".join(chunks)
        replayed = False

        async def replay() -> Message:
            nonlocal replayed
            if not replayed:
                replayed = True
                return {"type": "http.request", "body": buffered, "more_body": False}
            return await receive()

        await self.app(scope, replay, send)

    async def _reject(self, scope: Scope, receive: Receive, send: Send) -> None:
        request_id = resolve_request_id(scope)
        response = build_error_response(
            status_code=413,
            code=ErrorCode.PAYLOAD_TOO_LARGE,
            message="Request body exceeds the allowed size.",
            request_id=request_id,
            details=[
                APIErrorDetail(
                    field="request",
                    reason=(
                        "Body exceeds the configured limit of "
                        f"{self.max_bytes} bytes."
                    ),
                    type="too_large",
                )
            ],
            headers={"X-Request-ID": request_id},
        )
        await response(scope, receive, send)


class UnhandledExceptionMiddleware:
    """Turn unexpected exceptions into the shared 500 envelope.

    This sits inside CORS and the request-id middleware, so its response still
    carries CORS and ``X-Request-ID`` headers. Stack traces go to logs only.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        response_started = False

        async def tracking_send(message: Message) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, receive, tracking_send)
        except Exception:
            request_id = resolve_request_id(scope)
            logger.exception(
                "unhandled_exception path=%s request_id=%s",
                scope.get("path", "-"),
                request_id,
            )
            if response_started:
                # The response is already partially sent; re-raise rather than
                # corrupt the stream. The server will close the connection.
                raise
            response = build_error_response(
                status_code=500,
                code=ErrorCode.INTERNAL_ERROR,
                message="An unexpected error occurred.",
                request_id=request_id,
                headers={"X-Request-ID": request_id},
            )
            await response(scope, receive, send)


__all__ = [
    "BodySizeLimitMiddleware",
    "RequestContextMiddleware",
    "UnhandledExceptionMiddleware",
]
