"""Deterministic presentation helpers for scam analysis.

These helpers turn findings into plain-language advice. They never execute
anything, never ask for credentials, and never upgrade a risk indicator into a
claim that fraud occurred. The rule baseline is English-first; analysis in
other languages is reported as partial rather than silently trusted.
"""

from __future__ import annotations

from collections.abc import Sequence

from backend.models.schemas import (
    AnalysisLimitations,
    AnalysisStatus,
    RecommendedAction,
    RiskLevel,
    ScamCategory,
)
from backend.services.scam_detector import TextFinding

SUPPORTED_LANGUAGE_PRIMARIES = frozenset({"en"})
MAX_ACTIONS = 8
SHORT_MESSAGE_CHARS = 40

_BASELINE_VERIFY = (
    "Verify the sender independently before acting.",
    "Use a phone number, app, or website you locate yourself. Do not rely on "
    "contact details supplied in the message.",
)


def analysis_status_for_language(language: str) -> AnalysisStatus:
    """English messages are fully covered by the current rule baseline."""
    primary = language.split("-", 1)[0].lower()
    if primary in SUPPORTED_LANGUAGE_PRIMARIES:
        return AnalysisStatus.COMPLETED
    return AnalysisStatus.PARTIAL


def build_limitations(
    language: str,
    content: str,
    findings: Sequence[TextFinding],
    url_count: int = 0,
    urls_truncated: bool = False,
) -> AnalysisLimitations:
    """Return the caveats that apply to this specific analysis."""
    notes: list[str] = [
        (
            "This analysis inspects only the submitted text and any links "
            "inside it. It does not verify the sender, fetch links, inspect "
            "attachments, or confirm that any organization named in the "
            "message is genuine."
        ),
        (
            "The risk score reflects matches against a fixed rule list. It is "
            "not a probability and cannot prove that a message is fraudulent "
            "or that it is safe."
        ),
    ]

    if analysis_status_for_language(language) is AnalysisStatus.PARTIAL:
        notes.append(
            f"The rule baseline is written for English; coverage for "
            f"language '{language}' may be incomplete."
        )

    if url_count:
        noun = "link was" if url_count == 1 else "links were"
        notes.append(
            f"{url_count} {noun} inspected statically from the submitted text. "
            "No URL was opened, resolved, crawled, or fetched, and no domain "
            "ownership or reputation was checked."
        )

    if urls_truncated:
        notes.append(
            "Only the first 10 unique links were analysed; additional links "
            "were not inspected."
        )

    if len(content) < SHORT_MESSAGE_CHARS:
        notes.append(
            "Very short messages provide limited context, so some indicators "
            "may be missed."
        )

    if not findings:
        notes.append(
            "No documented indicator matched. This does not guarantee that "
            "the message is legitimate."
        )

    return AnalysisLimitations(notes=notes)


def build_summary(
    findings: Sequence[TextFinding],
    score: int,
    level: RiskLevel,
    category: ScamCategory,
) -> str:
    """Produce a deterministic, non-accusatory summary."""
    if not findings:
        return (
            "No documented scam indicators were detected in this message. "
            "This does not guarantee that the message is safe; verify any "
            "unexpected request through official channels."
        )

    strongest = max(findings, key=lambda finding: finding.points)
    count = len(findings)
    noun = "indicator" if count == 1 else "indicators"
    return (
        f"{count} scam {noun} detected. The strongest is "
        f"\"{strongest.signal.title}\" ({strongest.signal.severity.value}). "
        f"Risk score {score}/100 ({level.value}); dominant category "
        f"'{category.value}'. Indicators are not proof of fraud, so verify "
        "independently before acting."
    )


def build_recommended_actions(
    findings: Sequence[TextFinding],
    level: RiskLevel,
) -> list[RecommendedAction]:
    """Build ordered, non-executing actions for the recipient.

    Priorities put credential protection and money safety before general
    verification, and the list is deduplicated and capped.
    """
    if not findings:
        return [
            RecommendedAction(
                priority=1,
                action="No action is required based on the indicators checked.",
                rationale=(
                    "No documented rule matched this message. Unexpected "
                    "requests should still be verified through official "
                    "channels."
                ),
            )
        ]

    ordered: list[tuple[int, RecommendedAction]] = []
    seen: set[str] = set()

    def add(priority: int, action: str, rationale: str) -> None:
        key = action.casefold()
        if key in seen:
            return
        seen.add(key)
        ordered.append(
            (
                priority,
                RecommendedAction(
                    priority=priority,
                    action=action,
                    rationale=rationale,
                ),
            )
        )

    codes = {finding.signal.code for finding in findings}
    categories = {finding.category for finding in findings}

    if codes & {"otp_disclosure_request", "seed_phrase_request"}:
        add(
            1,
            "Do not share the code, password, or recovery phrase.",
            "These values can authorize transactions or hand over a wallet. "
            "A legitimate organization will not ask you to disclose them.",
        )
        add(
            2,
            (
                "If you already shared it, contact your bank or wallet "
                "provider immediately using an official number."
            ),
            "Fast reporting gives the provider a chance to block access or "
            "revoke approvals.",
        )

    if ScamCategory.PAYMENT_DEMAND in categories:
        add(
            1,
            "Do not pay any fee, send money, or buy gift cards.",
            "The payment is requested before anything is released or "
            "resolved, which is a common way to lose money.",
        )

    add(3, _BASELINE_VERIFY[0], _BASELINE_VERIFY[1])

    if ScamCategory.BANK_KYC_IMPERSONATION in categories:
        add(
            2,
            (
                "Do not use links or phone numbers from this message. Open "
                "your bank's official app or call the number on your card."
            ),
            "A bank's real status page is reachable without following an "
            "unexpected message.",
        )

    if ScamCategory.GOVERNMENT_IMPERSONATION in categories:
        add(
            2,
            (
                "Contact the named agency through its official website or a "
                "local office; do not respond to the message."
            ),
            "Government agencies can confirm whether a notice or case is "
            "real, and they do not collect penalties through gift cards or "
            "crypto.",
        )

    if ScamCategory.CRYPTO_REWARD in categories:
        add(
            2,
            (
                "Do not connect your wallet, sign transactions, or approve "
                "anything from this message."
            ),
            "Wallet connections and signatures can grant spending rights "
            "even when the message promises a reward.",
        )

    if ScamCategory.SUSPICIOUS_URL in categories:
        add(
            2,
            (
                "Do not open the link by clicking it. Reach the organization "
                "through its official app, a bookmark, or an address you type "
                "yourself."
            ),
            "A link's visible text and structure can differ from its actual "
            "destination, and this analysis did not open it.",
        )

    if ScamCategory.INVESTMENT_SCHEME in categories:
        add(
            2,
            (
                "Check the person and scheme on the relevant regulator's "
                "public register before sending money."
            ),
            "A registration check is independent evidence; guaranteed or "
            "unusually high returns are not.",
        )

    if ScamCategory.URGENCY_PRESSURE in categories:
        add(
            3,
            (
                "Slow down and verify before the stated deadline; a genuine "
                "organization will allow time to confirm."
            ),
            "Artificial deadlines are used to prevent independent checking.",
        )

    if level in {RiskLevel.HIGH, RiskLevel.CRITICAL}:
        add(
            4,
            (
                "Stop interacting, preserve screenshots, and report the "
                "message to the platform or the relevant authority."
            ),
            "Preserved evidence helps your bank, the platform, and law "
            "enforcement act on the report.",
        )

    ordered.sort(key=lambda item: item[0])
    return [action for _, action in ordered[:MAX_ACTIONS]]


__all__ = [
    "MAX_ACTIONS",
    "SUPPORTED_LANGUAGE_PRIMARIES",
    "analysis_status_for_language",
    "build_limitations",
    "build_recommended_actions",
    "build_summary",
]
