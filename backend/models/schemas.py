"""Shared Pydantic v2 schemas for the SCAMurai API.

These models are the common vocabulary for every analysis endpoint. They
deliberately contain no risk *score*: risk is expressed as a rule-derived
level plus evidence-backed signals and explicit limitations.

Two base classes exist because validation needs differ:

* :class:`APIModel` — permissive about Python types, strict about unknown
  fields. Used for responses.
* :class:`StrictRequestModel` — additionally rejects type coercion, so a
  request cannot smuggle ``"123"`` where an integer is expected or ``1``
  where a string is expected. Used for future request bodies.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

ShortText = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=200),
]
DescriptionText = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=2000),
]
EvidenceText = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=500),
]
SignalCode = Annotated[
    str,
    StringConstraints(strip_whitespace=True, pattern=r"^[a-z][a-z0-9_]{1,63}$"),
]
MessageContent = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=5000),
]
LanguageTag = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=2,
        max_length=35,
        pattern=r"^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$",
    ),
]
ScanId = Annotated[
    str,
    StringConstraints(strip_whitespace=True, pattern=r"^scan_[0-9a-f]{32}$"),
]


class APIModel(BaseModel):
    """Base model for API payloads: unknown fields are always rejected."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class StrictRequestModel(APIModel):
    """Base model for request bodies: no type coercion and no extra fields."""

    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
        strict=True,
    )


class Environment(str, Enum):
    """Deployment environment, used only for diagnostics and CORS defaults."""

    DEVELOPMENT = "development"
    TEST = "test"
    PRODUCTION = "production"


class ServiceStatus(str, Enum):
    """Coarse health of the API process."""

    OK = "ok"
    DEGRADED = "degraded"


class AnalysisStatus(str, Enum):
    """How complete a future analysis result is."""

    COMPLETED = "completed"
    PARTIAL = "partial"


class Severity(str, Enum):
    """How strongly a single signal should draw the user's attention."""

    INFO = "info"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class RiskLevel(str, Enum):
    """Aggregate, rule-derived risk indicator.

    ``unknown`` is a first-class value: absent or ambiguous evidence must not
    be converted into a numeric or arbitrary risk score. A high level is a
    reason to pause and verify, never proof of fraud or theft.
    """

    UNKNOWN = "unknown"
    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"
    CRITICAL = "critical"


class ScamCategory(str, Enum):
    """Dominant indicator family reported for an analysis.

    Categories describe the *message pattern* that produced the strongest
    evidence. They are not accusations against a sender, and ``none`` means no
    documented indicator matched.
    """

    NONE = "none"
    URGENCY_PRESSURE = "urgency_pressure"
    BANK_KYC_IMPERSONATION = "bank_kyc_impersonation"
    OTP_THEFT = "otp_theft"
    GOVERNMENT_IMPERSONATION = "government_impersonation"
    CRYPTO_REWARD = "crypto_reward"
    PAYMENT_DEMAND = "payment_demand"
    INVESTMENT_SCHEME = "investment_scheme"
    SUSPICIOUS_URL = "suspicious_url"


class EvidenceSource(str, Enum):
    """Where the facts behind a signal came from.

    Sources are kept explicit so decoded blockchain facts can never be
    silently replaced by model output.
    """

    MESSAGE_TEXT = "message_text"
    URL_STATIC = "url_static"
    DECODED_CALLDATA = "decoded_calldata"
    TRUSTED_METADATA = "trusted_metadata"
    USER_CONTEXT = "user_context"
    MODEL_OUTPUT = "model_output"


class RuleProvenance(APIModel):
    """Where a deterministic signal came from.

    ``rule_id`` matches a documented rule. ``rule_set`` and ``version`` let a
    client tell when the rule baseline changed. Signals produced by other
    sources (for example decoded calldata) may omit provenance.
    """

    rule_id: SignalCode
    rule_set: ShortText = Field(
        description="Name of the rule collection that produced the signal.",
    )
    version: ShortText = Field(
        description="Version of the rule collection, e.g. ``1.0.0``.",
    )


class Signal(APIModel):
    """One evidence-backed finding produced by a deterministic rule or decoder."""

    code: SignalCode = Field(
        description="Stable machine-readable identifier for the rule or check.",
    )
    title: ShortText = Field(description="Short human-readable label.")
    explanation: DescriptionText = Field(
        description="Why the evidence matters, without claiming proven fraud.",
    )
    severity: Severity
    source: EvidenceSource
    evidence: list[EvidenceText] = Field(
        default_factory=list,
        max_length=20,
        description=(
            "Concrete observations supporting the signal. For text rules these "
            "are exact excerpts of the submitted message."
        ),
    )
    rule: RuleProvenance | None = Field(
        default=None,
        description="Provenance of the rule, when the signal came from one.",
    )


class AnalysisLimitations(APIModel):
    """Explicit caveats that must accompany an analysis response.

    Limitations are part of the API contract, not an optional nicety: missing
    metadata, unverified URLs, or undecoded call data all belong here.
    """

    notes: list[DescriptionText] = Field(
        default_factory=list,
        max_length=20,
        description="Known gaps in the evidence available to the analysis.",
    )


class TextAnalysisRequest(StrictRequestModel):
    """Request body for ``POST /api/v1/analyze``.

    Only plain text is analysed in this version. ``language`` is a BCP 47-style
    tag (``en``, ``en-IN``, ``hi``); the rule baseline is English-first.
    """

    type: Literal["text"] = Field(
        description="Input kind. Only ``text`` is supported.",
    )
    content: MessageContent = Field(
        description="Message text to analyse, 1-5000 characters.",
    )
    language: LanguageTag = Field(
        description="Language tag of the message, e.g. ``en`` or ``en-IN``.",
    )

    @field_validator("language")
    @classmethod
    def _normalize_language(cls, value: str) -> str:
        return value.lower()


class ScoreContribution(APIModel):
    """Points one signal contributed before the total was capped.

    A URL-path finding that merely corroborates a text finding contributes
    ``0`` so the same theme is not counted twice across sources.
    """

    code: SignalCode
    category: ScamCategory
    points: int = Field(ge=0, le=100)


class ScoringBreakdown(APIModel):
    """Transparent arithmetic behind ``risk_score``.

    ``raw_total`` is the sum of per-rule points; ``applied_total`` is that sum
    capped at 100. ``capped`` is true only when the cap changed the total.
    """

    method: Literal["weighted_rule_sum"] = Field(
        description="Stable name of the scoring method.",
    )
    raw_total: int = Field(ge=0)
    applied_total: int = Field(ge=0, le=100)
    capped: bool
    contributions: list[ScoreContribution] = Field(
        default_factory=list,
        max_length=50,
    )


class RecommendedAction(APIModel):
    """One ordered, non-executing action for the recipient."""

    priority: int = Field(
        ge=1,
        le=20,
        description="Lower numbers should be read first.",
    )
    action: ShortText
    rationale: DescriptionText


class TextAnalysisResponse(APIModel):
    """Response body for ``POST /api/v1/analyze``.

    The submitted message itself is not echoed back. ``scan_id`` identifies
    this analysis run only; nothing is stored server-side.
    """

    scan_id: ScanId
    type: Literal["text"]
    language: LanguageTag
    status: AnalysisStatus
    analyzed_at: datetime
    risk_score: int = Field(ge=0, le=100)
    risk_level: RiskLevel
    category: ScamCategory
    summary: DescriptionText
    signals: list[Signal] = Field(default_factory=list, max_length=50)
    recommended_actions: list[RecommendedAction] = Field(
        default_factory=list,
        max_length=10,
    )
    limitations: AnalysisLimitations
    scoring: ScoringBreakdown


class HealthResponse(APIModel):
    """Stable payload for ``GET /health``."""

    service: ShortText
    status: ServiceStatus
    version: ShortText
    environment: Environment
    timestamp: datetime


class ErrorCode(str, Enum):
    """Stable machine-readable error codes for the error envelope."""

    BAD_REQUEST = "bad_request"
    VALIDATION_ERROR = "validation_error"
    NOT_FOUND = "not_found"
    METHOD_NOT_ALLOWED = "method_not_allowed"
    PAYLOAD_TOO_LARGE = "payload_too_large"
    UNSUPPORTED_MEDIA_TYPE = "unsupported_media_type"
    RATE_LIMITED = "rate_limited"
    INTERNAL_ERROR = "internal_error"
    HTTP_ERROR = "http_error"


class APIErrorDetail(APIModel):
    """One field-level or request-level error detail.

    Never carries the submitted value: request bodies may contain sensitive
    text and must not be reflected back in errors.
    """

    field: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=1, max_length=200),
    ] = Field(description="Location such as ``body.message`` or ``request``.")
    reason: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=1, max_length=500),
    ]
    type: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=1, max_length=100),
    ] = Field(description="Pydantic error type, e.g. ``missing``.")


class APIErrorBody(APIModel):
    """Inner error object shared by every failure response."""

    code: ErrorCode
    message: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=1, max_length=300),
    ]
    details: list[APIErrorDetail] = Field(
        default_factory=list,
        max_length=50,
    )


class APIErrorResponse(APIModel):
    """Single envelope returned for every 4xx/5xx API response."""

    error: APIErrorBody
    request_id: Annotated[
        str,
        StringConstraints(min_length=8, max_length=64),
    ]
