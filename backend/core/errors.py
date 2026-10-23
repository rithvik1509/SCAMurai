"""Centralized error handling.

Every failure leaves the process through this module (or through middleware
that builds its response with :func:`build_error_response`), so client code can
depend on one envelope and one non-leaky message policy.
"""

from __future__ import annotations

import logging
import re
import uuid
from collections.abc import Mapping
from http import HTTPStatus
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.types import Scope

from backend.models.schemas import (
    APIErrorBody,
    APIErrorDetail,
    APIErrorResponse,
    ErrorCode,
)

logger = logging.getLogger("scamurai.errors")

_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9._-]{8,64}$")

_GENERIC_500_MESSAGE = "An unexpected error occurred."
_FALLBACK_4XX_MESSAGE = "Request failed."
_MAX_DETAILS = 50


class DependencyUnavailable(StarletteHTTPException):
    """A curated application explanation; never construct from raw provider errors."""

    def __init__(self, message: str):
        super().__init__(status_code=503, detail=message)

_CODE_BY_STATUS: dict[int, ErrorCode] = {
    400: ErrorCode.BAD_REQUEST,
    404: ErrorCode.NOT_FOUND,
    405: ErrorCode.METHOD_NOT_ALLOWED,
    413: ErrorCode.PAYLOAD_TOO_LARGE,
    415: ErrorCode.UNSUPPORTED_MEDIA_TYPE,
    422: ErrorCode.VALIDATION_ERROR,
    429: ErrorCode.RATE_LIMITED,
}


def safe_request_id(value: str | None) -> str | None:
    """Return ``value`` only when it is a bounded, log-safe request id."""
    if value is not None and _REQUEST_ID_RE.fullmatch(value):
        return value
    return None


def resolve_request_id(scope: Scope) -> str:
    """Read the request id from ASGI state, generating one if absent."""
    state = scope.get("state")
    if isinstance(state, dict):
        existing = state.get("request_id")
        if isinstance(existing, str):
            safe = safe_request_id(existing)
            if safe is not None:
                return safe
    return uuid.uuid4().hex


def get_request_id(request: Request) -> str:
    """Return the request id attached by ``RequestContextMiddleware``."""
    return resolve_request_id(request.scope)


def build_error_response(
    *,
    status_code: int,
    code: ErrorCode,
    message: str,
    request_id: str,
    details: list[APIErrorDetail] | None = None,
    headers: Mapping[str, str] | None = None,
) -> JSONResponse:
    """Build the single error envelope used by the whole API."""
    safe_message = message.strip()[:300] or _FALLBACK_4XX_MESSAGE
    payload = APIErrorResponse(
        error=APIErrorBody(
            code=code,
            message=safe_message,
            details=(details or [])[:_MAX_DETAILS],
        ),
        request_id=request_id,
    )
    return JSONResponse(
        status_code=status_code,
        content=payload.model_dump(mode="json"),
        headers=dict(headers) if headers else None,
    )


def _error_code_for(status_code: int) -> ErrorCode:
    if status_code >= 500:
        return ErrorCode.INTERNAL_ERROR
    return _CODE_BY_STATUS.get(status_code, ErrorCode.HTTP_ERROR)


def _http_message(status_code: int, detail: Any) -> str:
    if status_code >= 500:
        return _GENERIC_500_MESSAGE
    if isinstance(detail, str) and detail.strip():
        return detail
    try:
        return HTTPStatus(status_code).phrase
    except ValueError:
        return _FALLBACK_4XX_MESSAGE


def _field_from_loc(loc: tuple[Any, ...]) -> str:
    field = ".".join(str(part) for part in loc) if loc else "request"
    return field[:200] or "request"


async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Convert Pydantic/FastAPI validation failures into the error envelope.

    Pydantic's raw errors include the submitted ``input``. It is intentionally
    dropped: scam messages can contain personal or financial data.
    """
    details: list[APIErrorDetail] = []
    for error in exc.errors()[:_MAX_DETAILS]:
        details.append(
            APIErrorDetail(
                field=_field_from_loc(tuple(error.get("loc", ()))),
                reason=str(error.get("msg", "Invalid value."))[:500],
                type=str(error.get("type", "value_error"))[:100],
            )
        )
    return build_error_response(
        status_code=422,
        code=ErrorCode.VALIDATION_ERROR,
        message="Request validation failed.",
        request_id=get_request_id(request),
        details=details,
    )


async def http_exception_handler(
    request: Request, exc: StarletteHTTPException
) -> JSONResponse:
    """Return raised ``HTTPException``s in the shared envelope."""
    return build_error_response(
        status_code=exc.status_code,
        code=ErrorCode.SERVICE_UNAVAILABLE if isinstance(exc, DependencyUnavailable) else _error_code_for(exc.status_code),
        message=exc.detail if isinstance(exc, DependencyUnavailable) else _http_message(exc.status_code, exc.detail),
        request_id=get_request_id(request),
        headers=exc.headers,
    )


async def unhandled_exception_handler(
    request: Request, exc: Exception
) -> JSONResponse:
    """Last-resort handler: log internally, return nothing sensitive."""
    request_id = get_request_id(request)
    logger.error(
        "unhandled_exception path=%s request_id=%s",
        request.url.path,
        request_id,
        exc_info=exc,
    )
    return build_error_response(
        status_code=500,
        code=ErrorCode.INTERNAL_ERROR,
        message=_GENERIC_500_MESSAGE,
        request_id=request_id,
    )


def register_exception_handlers(app: FastAPI) -> None:
    """Install handlers for validation, HTTP, and unexpected errors."""
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)
