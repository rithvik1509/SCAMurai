"""Frontend-compatible Pydantic schemas for YOKAI investigations."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Annotated, Literal

from pydantic import ConfigDict, Field, StringConstraints, field_validator, model_serializer

from backend.models.schemas import APIModel, StrictRequestModel

Text = Annotated[str, StringConstraints(max_length=12_000)]
EvidenceRefs = Annotated[list[str], Field(max_length=100)]


def to_camel(value: str) -> str:
    first, *rest = value.split("_")
    return first + "".join(part.title() for part in rest)


class YokaiModel(APIModel):
    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
        alias_generator=to_camel,
        populate_by_name=True,
    )


class ProfileId(StrEnum):
    DESKTOP = "desktop"
    MOBILE = "mobile"
    RETURNING = "returning"


class InvestigationStatus(StrEnum):
    QUEUED = "queued"
    INITIALIZING = "initializing"
    LOADING = "loading"
    COLLECTING = "collecting"
    COMPARING = "comparing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    UNSUPPORTED = "unsupported"


class EvidenceTone(StrEnum):
    NORMAL = "normal"
    DIFFERENCE = "difference"
    SENSITIVE = "sensitive"
    UNAVAILABLE = "unavailable"


class InvestigationSettings(StrictRequestModel):
    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
        strict=True,
        alias_generator=to_camel,
        populate_by_name=True,
    )

    timeout_seconds: int = Field(default=20, ge=5, le=45)
    capture_screenshots: bool = True
    include_network: bool = True


class InvestigationRequest(StrictRequestModel):
    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
        strict=True,
        alias_generator=to_camel,
        populate_by_name=True,
    )

    target_url: Annotated[str, StringConstraints(min_length=8, max_length=2048)]
    profiles: list[Annotated[ProfileId, Field(strict=False)]] = Field(
        min_length=2,
        max_length=3,
    )
    authorization_confirmed: bool
    settings: InvestigationSettings = Field(default_factory=InvestigationSettings)

    @field_validator("profiles")
    @classmethod
    def unique_profiles(cls, value: list[ProfileId]) -> list[ProfileId]:
        if len(set(value)) != len(value):
            raise ValueError("Profiles must be unique.")
        return value


class Viewport(YokaiModel):
    width: int = Field(ge=1, le=16_000)
    height: int = Field(ge=1, le=16_000)


class RedirectObservation(YokaiModel):
    source: Text = Field(alias="from")
    target: Text = Field(alias="to")
    status: int = Field(ge=300, le=399)


class FormObservation(YokaiModel):
    id: str
    label: Text
    action: Text
    method: Text
    fields: list[Text] = Field(max_length=100)
    sensitive: bool


class NetworkObservation(YokaiModel):
    id: str
    url: Text
    method: Text
    kind: Text


class PageStructure(YokaiModel):
    headings: list[Text] = Field(max_length=100)
    link_count: int = Field(ge=0)
    language: Text
    text_blocks: list[Text] = Field(default_factory=list, max_length=200)
    action_labels: list[Text] = Field(default_factory=list, max_length=100)


class ScreenshotReference(YokaiModel):
    url: Text
    kind: str = "capture"


class BrowserCapture(YokaiModel):
    id: str
    profile_id: ProfileId
    label: Text
    final_url: Text
    title: Text
    viewport: Viewport
    user_agent: Text
    cookie_state: Text
    availability: str
    notes: list[Text] = Field(max_length=50)
    screenshot: ScreenshotReference | None = None
    redirects: list[RedirectObservation] = Field(max_length=100)
    structure: PageStructure | None = None
    forms: list[FormObservation] = Field(max_length=200)
    network: list[NetworkObservation] = Field(max_length=1000)


class Finding(YokaiModel):
    id: str
    title: Text
    explanation: Text
    tone: EvidenceTone
    severity: Literal["informational", "low", "medium", "high"]
    confidence: Text
    evidence_ids: EvidenceRefs


class EvidenceNode(YokaiModel):
    id: str
    kind: str
    label: Text
    description: Text
    tone: EvidenceTone
    evidence_ids: EvidenceRefs
    profile_id: ProfileId | None = None
    position: dict[str, float]


class EvidenceEdge(YokaiModel):
    id: str
    source: str
    target: str
    label: Text
    tone: EvidenceTone
    evidence_ids: EvidenceRefs


class EvidenceGraph(YokaiModel):
    nodes: list[EvidenceNode] = Field(max_length=2000)
    edges: list[EvidenceEdge] = Field(max_length=5000)


class Counterfactual(YokaiModel):
    id: str
    title: Text
    baseline: Text
    changed_variable: Text
    observed_result: Text
    finding: Text
    conclusion: str
    evidence_ids: EvidenceRefs


class InvestigationResult(YokaiModel):
    captures: list[BrowserCapture] = Field(max_length=20)
    findings: list[Finding] = Field(max_length=200)
    risk_indicators: list[Text] = Field(max_length=100)
    limitations: list[Text] = Field(max_length=100)
    recommendations: list[Text] = Field(max_length=100)
    graph: EvidenceGraph
    counterfactuals: list[Counterfactual] = Field(max_length=100)


class InvestigationEvent(YokaiModel):
    status: InvestigationStatus
    at: datetime
    message: Text


class Investigation(YokaiModel):
    id: str
    demo: bool = False
    target_url: Text
    profiles: list[ProfileId]
    status: InvestigationStatus
    created_at: datetime
    updated_at: datetime
    events: list[InvestigationEvent] = Field(max_length=200)
    error: Text | None = None
    result: InvestigationResult | None = None

    @model_serializer(mode='wrap')
    def serialize(self, handler):
        payload = handler(self)
        # The frontend treats these as optional fields, rather than nullable ones.
        for key in ('error', 'result'):
            if payload.get(key) is None:
                payload.pop(key, None)
        return payload


class InvestigationCapabilities(YokaiModel):
    available: bool
    profiles: list[ProfileId]
    allowed_origins: list[str]
    authorization_policy: Text
    cancellation: bool = False
    public_targets: bool = False


class CancelRequest(StrictRequestModel):
    """Empty request object for the optional cancellation endpoint."""

    pass


class CounterfactualRequest(StrictRequestModel):
    """Request one supported profile-level counterfactual rerun."""

    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
        strict=True,
        alias_generator=to_camel,
        populate_by_name=True,
    )

    changed_variable: Literal["mobile_profile", "returning_visitor_cookie"]
