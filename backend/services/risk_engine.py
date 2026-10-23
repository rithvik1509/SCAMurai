"""Transparent aggregation of findings into a 0-100 risk indicator.

The arithmetic is intentionally simple and fully exposed in every response:

1. Each rule contributes its fixed point weight at most once.
2. Contributions are summed (``raw_total``).
3. The sum is capped at 100 to produce ``risk_score``.
4. Fixed thresholds map the score to a :class:`RiskLevel`.

The score is a rule-derived indicator, not a probability and not a claim that
fraud occurred. No random value, model output, or language-model judgement is
involved.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from backend.models.schemas import (
    RiskLevel,
    ScamCategory,
    ScoreContribution,
    ScoringBreakdown,
)
from backend.services.scam_detector import TextFinding

SCORE_METHOD = "weighted_rule_sum"
MAX_RISK_SCORE = 100

#: ``score >= threshold`` selects the level. Lower bounds are inclusive.
RISK_LEVEL_THRESHOLDS: tuple[tuple[int, RiskLevel], ...] = (
    (70, RiskLevel.CRITICAL),
    (40, RiskLevel.HIGH),
    (15, RiskLevel.MODERATE),
    (0, RiskLevel.LOW),
)

#: Tie-break order when two findings have equal weight. The strongest finding
#: determines the reported category; ties resolve to the earlier entry here.
CATEGORY_PRECEDENCE: tuple[ScamCategory, ...] = (
    ScamCategory.OTP_THEFT,
    ScamCategory.CRYPTO_REWARD,
    ScamCategory.BANK_KYC_IMPERSONATION,
    ScamCategory.GOVERNMENT_IMPERSONATION,
    ScamCategory.PAYMENT_DEMAND,
    ScamCategory.INVESTMENT_SCHEME,
    ScamCategory.URGENCY_PRESSURE,
    ScamCategory.SUSPICIOUS_URL,
)

_CATEGORY_INDEX = {
    category: index for index, category in enumerate(CATEGORY_PRECEDENCE)
}


@dataclass(frozen=True)
class RiskAssessment:
    """Deterministic score, level, dominant category, and visible arithmetic."""

    score: int
    level: RiskLevel
    category: ScamCategory
    scoring: ScoringBreakdown


def risk_level_for_score(score: int) -> RiskLevel:
    """Map a 0-100 score to a fixed risk level.

    A malformed score is a programming error, not a client input problem, so
    it raises instead of silently clamping.
    """
    if not isinstance(score, int) or isinstance(score, bool):
        raise TypeError("risk score must be an integer")
    if not 0 <= score <= MAX_RISK_SCORE:
        raise ValueError("risk score must be between 0 and 100")

    for threshold, level in RISK_LEVEL_THRESHOLDS:
        if score >= threshold:
            return level
    return RiskLevel.LOW


def order_findings(findings: Sequence[TextFinding]) -> list[TextFinding]:
    """Return findings in stable display order.

    Descending point weight first, then the fixed category precedence, then
    the rule id. Identical input therefore always produces identical ordering.
    """
    return sorted(
        findings,
        key=lambda finding: (
            -finding.points,
            _CATEGORY_INDEX[finding.category],
            finding.signal.code,
        ),
    )


def assess_findings(findings: Sequence[TextFinding]) -> RiskAssessment:
    """Score findings and select the dominant category."""
    ordered = order_findings(findings)

    raw_total = sum(finding.points for finding in ordered)
    applied_total = min(MAX_RISK_SCORE, raw_total)
    category = ordered[0].category if ordered else ScamCategory.NONE

    contributions = [
        ScoreContribution(
            code=finding.signal.code,
            category=finding.category,
            points=finding.points,
        )
        for finding in ordered
    ]

    scoring = ScoringBreakdown(
        method=SCORE_METHOD,
        raw_total=raw_total,
        applied_total=applied_total,
        capped=raw_total > MAX_RISK_SCORE,
        contributions=contributions,
    )

    return RiskAssessment(
        score=applied_total,
        level=risk_level_for_score(applied_total),
        category=category,
        scoring=scoring,
    )


__all__ = [
    "CATEGORY_PRECEDENCE",
    "MAX_RISK_SCORE",
    "RISK_LEVEL_THRESHOLDS",
    "RiskAssessment",
    "SCORE_METHOD",
    "assess_findings",
    "order_findings",
    "risk_level_for_score",
]
