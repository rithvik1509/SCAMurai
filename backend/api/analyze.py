"""``POST /api/v1/analyze`` — deterministic scam-message analysis.

The endpoint applies the rule baseline in
:mod:`backend.services.scam_detector`, inspects links statically with
:mod:`backend.services.url_analyzer`, scores the combined findings with
:mod:`backend.services.risk_engine`, and returns plain-language advice. It
makes no network request, uses no LLM or database, stores nothing, and does not
echo the submitted message back.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter

from backend.models.schemas import (
    APIErrorResponse,
    TextAnalysisRequest,
    TextAnalysisResponse,
)
from backend.services.advice_engine import (
    analysis_status_for_language,
    build_limitations,
    build_recommended_actions,
    build_summary,
)
from backend.services.risk_engine import assess_findings, order_findings
from backend.services.scam_detector import (
    RULE_SET,
    RULE_VERSION,
    detect_findings,
)
from backend.services.url_analyzer import (
    URL_RULE_SET,
    URL_RULE_VERSION,
    analyze_urls,
    extract_urls,
)

router = APIRouter(tags=["analysis"])

_DESCRIPTION = (
    "Analyses a plain-text message with a fixed, deterministic rule baseline "
    f"(`{RULE_SET}` v{RULE_VERSION}) and static link checks "
    f"(`{URL_RULE_SET}` v{URL_RULE_VERSION}). Every signal quotes exact "
    "excerpts of the submitted text and carries its rule provenance. Links "
    "are parsed but never opened, resolved, or fetched. The 0-100 risk score "
    "is the capped sum of documented rule weights; it is an indicator, not a "
    "probability or proof of fraud. No LLM, database, or message storage is "
    "involved."
)


@router.post(
    "/analyze",
    response_model=TextAnalysisResponse,
    summary="Analyse a text message for scam indicators",
    description=_DESCRIPTION,
    responses={
        413: {
            "model": APIErrorResponse,
            "description": "Request body exceeds MAX_REQUEST_BYTES.",
        },
        422: {
            "model": APIErrorResponse,
            "description": "Request body failed schema or type validation.",
        },
    },
)
async def analyze_text(payload: TextAnalysisRequest) -> TextAnalysisResponse:
    """Return evidence-backed findings and a transparent risk score."""
    tokens = extract_urls(payload.content)
    excluded_spans = [(token.start, token.end) for token in tokens]

    text_findings = detect_findings(
        payload.content,
        excluded_spans=excluded_spans,
    )
    url_analysis = analyze_urls(
        payload.content,
        tokens,
        text_findings=text_findings,
    )
    findings = order_findings([*text_findings, *url_analysis.findings])
    assessment = assess_findings(findings)
    status = analysis_status_for_language(payload.language)

    return TextAnalysisResponse(
        scan_id=f"scan_{uuid.uuid4().hex}",
        type=payload.type,
        language=payload.language,
        status=status,
        analyzed_at=datetime.now(timezone.utc),
        risk_score=assessment.score,
        risk_level=assessment.level,
        category=assessment.category,
        summary=build_summary(
            findings,
            assessment.score,
            assessment.level,
            assessment.category,
        ),
        signals=[finding.signal for finding in findings],
        recommended_actions=build_recommended_actions(
            findings,
            assessment.level,
        ),
        limitations=build_limitations(
            payload.language,
            payload.content,
            findings,
            url_count=url_analysis.inspected_count,
            urls_truncated=url_analysis.truncated,
        ),
        scoring=assessment.scoring,
    )
