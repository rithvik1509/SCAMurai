"""Deterministic scam-message analysis.

Every finding comes from a documented regular-expression rule. No LLM, network
call, random value, or learned model participates. Rules are intentionally
conservative about wording: a match is an *indicator* that warrants
verification, never proof that a message is fraudulent.

Evidence is always an exact excerpt of the submitted text. Matches whose
preceding clause (or matched text) contains a negation such as "never" or
"do not" are skipped, so an advisory like "never share your OTP" is not
reported as an OTP request. A small educational-context guard does the same
for awareness text such as "scammers often ask you to share your OTP".

URL spans may be excluded from text matching so that a URL path such as
``/kyc-update`` cannot masquerade as a message-text finding; URL structure is
handled separately by :mod:`backend.services.url_analyzer`.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass, field

from backend.models.schemas import (
    EvidenceSource,
    RuleProvenance,
    ScamCategory,
    Severity,
    Signal,
)

RULE_SET = "scam_text_rules"
RULE_VERSION = "1.0.0"

#: Exact-excerpt cap. Longer matches are cut at a word boundary, which keeps
#: the stored evidence a literal substring of the submitted message.
MAX_EVIDENCE_CHARS = 300
MAX_EVIDENCE_PER_SIGNAL = 5

_CLAUSE_SPLIT = re.compile(r"[.!?\n,]")
_NEGATION = re.compile(
    r"\b(?:never|not|no|don['\u2019]?t|doesn['\u2019]?t|does not|do not|"
    r"did not|avoid|without|cannot|can['\u2019]?t|won['\u2019]?t|need not)\b",
    re.IGNORECASE,
)

#: Text that describes a scam rather than performing one. This guard is
#: deliberately narrow: it looks only at the clause immediately before the
#: match, so a genuine demand in a later sentence is still reported.
_EDUCATIONAL = re.compile(
    r"\b(?:scammers?|fraudsters?|phishing|advisory|awareness|educational|"
    r"tutorial)\b",
    re.IGNORECASE,
)
_HYPOTHETICAL = re.compile(
    r"\b(?:if|when)\b[^.!?\n]{0,60}\b(?:someone|anyone|a scammer|"
    r"scammers|fraudsters?|they)\b[^.!?\n]{0,40}\b(?:ask|asks|asked|"
    r"tell|tells|told|request|requests|try|tries|attempt|attempts)\b",
    re.IGNORECASE,
)
#: Common benign first-person phrasing for payment rules.
_FIRST_PERSON_PAYMENT = re.compile(
    r"\b(?:i|we)\s+(?:will|shall|would|can|could|may|might|"
    r"am going to|are going to|have|had)\b[^.\n]{0,20}?\b"
    r"(?:pay|paid|send|sent|transfer|transferred|remit|remitted|"
    r"deposit|deposited)\b",
    re.IGNORECASE,
)
_REPAYMENT = re.compile(
    r"\b(?:pay|send|transfer)\s+me\s+back\b|\b(?:money|amount)\s+"
    r"(?:i|we)\s+(?:lent|owe)\b",
    re.IGNORECASE,
)

_FLAGS = re.IGNORECASE


def _compile(*patterns: str) -> tuple[re.Pattern[str], ...]:
    return tuple(re.compile(pattern, _FLAGS) for pattern in patterns)


@dataclass(frozen=True)
class ScamRule:
    """One documented indicator rule."""

    code: str
    category: ScamCategory
    title: str
    explanation: str
    severity: Severity
    points: int
    patterns: tuple[re.Pattern[str], ...]
    skip_if_negated: bool = True
    skip_if_educational: bool = True
    ignore_if: tuple[re.Pattern[str], ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class Finding:
    """A signal plus the rule weight needed by the risk engine.

    Text and URL analysis share this shape so scoring stays source-agnostic.
    """

    signal: Signal
    category: ScamCategory
    points: int


#: Backwards-compatible name used by the text-analysis modules and tests.
TextFinding = Finding


# Rule points are fixed per rule and are documented in
# ``backend/docs/api-contract.md``. Severity describes how strongly a single
# finding should draw attention; points feed the capped 0-100 sum.
RULES: tuple[ScamRule, ...] = (
    ScamRule(
        code="urgency_pressure",
        category=ScamCategory.URGENCY_PRESSURE,
        title="Urgency or deadline pressure",
        explanation=(
            "The message pushes for immediate action or a short deadline. "
            "Legitimate organizations normally allow time to verify an "
            "unexpected request through independent channels."
        ),
        severity=Severity.MEDIUM,
        points=12,
        patterns=_compile(
            r"\b(?:urgent(?:ly)?|immediately|right away|at once|act now|"
            r"act fast|hurry(?: up)?|last chance|final (?:warning|notice)|"
            r"time is running out)\b",
            r"\bwithin (?:the next )?\d{1,2}\s*(?:minutes?|hours?)\b",
            r"\b(?:before|by) (?:midnight|today|tonight|tomorrow)\b",
            r"\b(?:limited time|only \d{1,2} (?:hours?|minutes?) left|"
            r"offer ends|expires? (?:today|tonight))\b",
        ),
    ),
    ScamRule(
        code="bank_account_threat",
        category=ScamCategory.BANK_KYC_IMPERSONATION,
        title="Threat that a bank account will be blocked",
        explanation=(
            "The message says an account or card will be blocked, frozen, or "
            "closed. This is a common pressure tactic. Banks do not resolve "
            "account problems through unsolicited messages that demand "
            "immediate action."
        ),
        severity=Severity.HIGH,
        points=22,
        patterns=_compile(
            r"\b(?:account|card|net\s?banking)\b[^.\n]{0,60}?\b"
            r"(?:will be|has been|have been|is being|is|are|was|were|"
            r"would be|may be|can be)\s+"
            r"(?:blocked|suspended|frozen|deactivated|closed|terminated|"
            r"locked|restricted)\b",
            r"\b(?:block|suspend|freeze|deactivate|close|terminate|lock|"
            r"restrict)\s+(?:your|the)\s+(?:bank\s+)?(?:account|card)\b",
            r"\b(?:account|card)\s+"
            r"(?:block|suspension|closure|freeze|deactivation|lock)\b",
        ),
        ignore_if=_compile(
            r"\b(?:at|as per|per|by)\s+your\s+request\b",
            r"\bas requested\b",
        ),
    ),
    ScamRule(
        code="kyc_update_demand",
        category=ScamCategory.BANK_KYC_IMPERSONATION,
        title="KYC update or verification demand",
        explanation=(
            "The message asks for KYC, PAN, or Aadhaar verification, often "
            "with a threat that service will stop. Verify KYC status only "
            "inside an official banking app or at a branch; never through a "
            "link or contact supplied in an unexpected message."
        ),
        severity=Severity.HIGH,
        points=20,
        patterns=_compile(
            r"\b(?:kyc|know your customer)\b[^.\n]{0,80}?\b"
            r"(?:update|updation|verify|verification|complete|completion|"
            r"pending|expire|expired|suspend|block|link|linked|re-?kyc|"
            r"re-?do|submit)\b",
            r"\b(?:update|verify|complete|submit|link|re-?do|share|send|"
            r"provide)\b[^.\n]{0,60}?\b(?:kyc|know your customer)\b",
            r"\b(?:pan|aadhaar|aadhar)\b[^.\n]{0,60}?\b"
            r"(?:link|linked|update|verify|block|deactivate|suspend|"
            r"submit|share|send|provide)\b",
            r"\b(?:update|verify|link|submit|share|send|provide)\b"
            r"[^.\n]{0,60}?\b(?:pan(?:\s+card)?|aadhaar|aadhar)\b",
        ),
    ),
    ScamRule(
        code="otp_disclosure_request",
        category=ScamCategory.OTP_THEFT,
        title="One-time password (OTP) disclosure request",
        explanation=(
            "The message asks you to share, send, or read out an OTP or "
            "verification code. These codes authorize transactions and "
            "account changes. No legitimate bank or service needs you to "
            "disclose one."
        ),
        severity=Severity.CRITICAL,
        points=32,
        patterns=_compile(
            r"\b(?:otp|one[ -]?time (?:password|code|pin)|verification code|"
            r"security code|authentication code|2fa code|login code|"
            r"(?:6|six)[ -]?digit(?: verification)? code|"
            r"code (?:sent|delivered|received) (?:to|on) your "
            r"(?:phone|mobile))\b"
            r"[^.\n]{0,80}?\b(?:share|send|tell|forward|read|provide|give|"
            r"quote|disclose|confirm|reply with|text me|whatsapp|email me)\b",
            r"\b(?:share|send|tell|forward|read out|read|provide|give|quote|"
            r"disclose|reply with|text me|whatsapp|email me)\b"
            r"[^.\n]{0,80}?\b(?:otp|one[ -]?time (?:password|code|pin)|"
            r"verification code|security code|authentication code|2fa code|"
            r"login code|(?:6|six)[ -]?digit(?: verification)? code|"
            r"code (?:sent|delivered|received) (?:to|on) your "
            r"(?:phone|mobile))\b",
        ),
    ),
    ScamRule(
        code="government_agency_impersonation",
        category=ScamCategory.GOVERNMENT_IMPERSONATION,
        title="Government or law-enforcement impersonation",
        explanation=(
            "The message claims to come from a government agency or law "
            "enforcement and pairs that claim with a case, penalty, or "
            "demand. Agencies do not collect penalties through gift cards, "
            "crypto, or unsolicited messages."
        ),
        severity=Severity.HIGH,
        points=22,
        patterns=_compile(
            r"\bthis is (?:the )?(?:police|cbi|fbi|income tax (?:department|"
            r"dept)|cyber ?crime(?: cell)?|customs(?: department)?|"
            r"enforcement directorate|trai|sebi)\b",
            r"\b(?:i am|this is)\b[^.\n]{0,40}?\b(?:officer|inspector|"
            r"agent|official)\b[^.\n]{0,40}?\b(?:cbi|fbi|police|income tax|"
            r"customs|enforcement directorate)\b",
            r"\b(?:income tax (?:department|dept|office)|irs|"
            r"internal revenue service|cbi|fbi|cyber ?crime(?: cell| branch|"
            r" department)?|crime branch|police (?:department|station|officer|"
            r"headquarters)|customs (?:department|officer)|"
            r"enforcement directorate|government of india|"
            r"social security administration|passport office|trai|sebi)\b"
            r"[^.\n]{0,80}?\b(?:case|notice|warrant|arrest|fine|penalty|"
            r"verify|suspend|block|pay|legal action|fir|complaint|officer|"
            r"investigation)\b",
            r"\b(?:case|notice|warrant|arrest|fine|penalty|legal action|fir|"
            r"investigation|complaint)\b[^.\n]{0,80}?\b(?:income tax|irs|cbi|"
            r"fbi|cyber ?crime|police|customs|enforcement directorate|"
            r"government of india|social security administration|"
            r"passport office|trai|sebi)\b",
        ),
    ),
    ScamRule(
        code="legal_action_threat",
        category=ScamCategory.GOVERNMENT_IMPERSONATION,
        title="Threat of arrest or legal action",
        explanation=(
            "The message threatens arrest, prosecution, or legal action. "
            "Such threats are used to stop people from checking a claim. "
            "Verify any legal notice with the court or agency through an "
            "official channel."
        ),
        severity=Severity.HIGH,
        points=18,
        patterns=_compile(
            r"\b(?:arrest warrant|non-?bailable warrant|legal action|"
            r"court (?:case|notice|summons)|"
            r"fir (?:has been|is|was)?\s*(?:filed|registered)|"
            r"case (?:has been|is|was)?\s*registered|"
            r"you (?:will|may) be (?:arrested|prosecuted|deported|jailed)|"
            r"you are under arrest|"
            r"face (?:legal action|imprisonment))\b",
            r"\b(?:arrest|prosecute|deport)\b[^.\n]{0,40}?\b"
            r"(?:you|your)\b",
            r"\bwe (?:will|shall|are going to)\b[^.\n]{0,30}?\b"
            r"(?:file|register|lodge)\b[^.\n]{0,20}?\b(?:case|fir|"
            r"complaint)\b",
            r"\b(?:complaint|case|fir)\b[^.\n]{0,20}?\b(?:has been|is|was)"
            r"\s+(?:filed|registered)\b[^.\n]{0,30}?\b(?:against|on) you\b",
        ),
    ),
    ScamRule(
        code="crypto_reward_claim",
        category=ScamCategory.CRYPTO_REWARD,
        title="Unsolicited crypto reward or giveaway",
        explanation=(
            "The message offers free crypto, a reward, or an airdrop and "
            "often asks you to connect a wallet. Unexpected crypto rewards "
            "are a common way to obtain wallet approvals or signatures."
        ),
        severity=Severity.HIGH,
        points=24,
        patterns=_compile(
            r"\b(?:free|claim|bonus|reward|airdrop|giveaway|gift|won|win)\b"
            r"[^.\n]{0,60}?\b(?:btc|bitcoin|eth|ethereum|usdt|usdc|"
            r"crypto(?:currency)?|tokens?|wallet|coins?)\b",
            r"\b(?:btc|bitcoin|eth|ethereum|usdt|usdc|crypto(?:currency)?|"
            r"tokens?|coins?)\b[^.\n]{0,60}?\b(?:airdrop|giveaway|free|reward|"
            r"bonus|claim)\b",
            r"\b(?:connect|link|sync|validate)\s+(?:your\s+)?"
            r"(?:crypto\s+)?wallet\b",
            r"\b(?:double|triple)\s+your\s+"
            r"(?:btc|bitcoin|eth|ethereum|crypto|coins?)\b",
        ),
    ),
    ScamRule(
        code="seed_phrase_request",
        category=ScamCategory.CRYPTO_REWARD,
        title="Recovery phrase or private key request",
        explanation=(
            "The message asks for a seed phrase, recovery phrase, or private "
            "key. Anyone who obtains it can take full control of the wallet. "
            "No legitimate support agent needs this information."
        ),
        severity=Severity.CRITICAL,
        points=40,
        patterns=_compile(
            r"\b(?:seed|recovery|secret|mnemonic)\s+phrase\b"
            r"[^.\n]{0,60}?\b(?:share|send|tell|provide|give|enter|type|"
            r"verify|validate|confirm|restore)\b",
            r"\b(?:share|send|tell|provide|give|enter|type|verify|validate|"
            r"confirm|restore)\b[^.\n]{0,60}?\b(?:seed|recovery|secret|"
            r"mnemonic)\s+phrase\b",
            r"\bprivate\s+key\b[^.\n]{0,60}?\b(?:share|send|provide|give|"
            r"enter|type|verify|confirm)\b",
            r"\b(?:share|send|provide|give|enter|type|verify|confirm)\b"
            r"[^.\n]{0,60}?\bprivate\s+key\b",
        ),
    ),
    ScamRule(
        code="payment_demand",
        category=ScamCategory.PAYMENT_DEMAND,
        title="Upfront payment or money transfer demand",
        explanation=(
            "The message asks for a payment, transfer, or fee before "
            "something is released or resolved. Treat unexpected payment "
            "demands as unverified, especially when a fee must be paid to "
            "receive money or goods."
        ),
        severity=Severity.HIGH,
        points=20,
        patterns=_compile(
            r"\b(?:please|kindly|you (?:must|need to|have to|are required "
            r"to)|you should)\s+(?:pay|send|transfer|remit|deposit)\b"
            r"[^.\n]{0,30}?\b(?:fee|fees|amount|money|funds|payment|"
            r"charges?|penalty|fine|deposit|gift\s?cards?|bitcoin|btc|"
            r"usdt|crypto)\b",
            r"\b(?:please|kindly|you (?:must|need to|have to|are required "
            r"to)|you should)\s+(?:pay|send|transfer|remit|deposit)\b"
            r"[^.\n]{0,20}?(?:₹|rs\.?|inr|\$|usd)\s?"
            r"\d[\d,]*(?:\.\d{1,2})?",
            r"\b(?:pay|send|transfer|remit|deposit)\s+(?:"
            r"the (?:fee|fees|amount|money|penalty|fine|charge|charges|"
            r"deposit)|this (?:fee|amount|payment)|a (?:fee|payment|"
            r"deposit))\b",
            r"\b(?:send|transfer)\s+money\b",
            r"\b(?:send|transfer|pay)\s+(?:me|us)\b[^.\n]{0,15}"
            r"(?:₹|rs\.?|inr|\$|usd)\s?\d[\d,]*(?:\.\d{1,2})?",
            r"\b(?:processing|registration|service|verification|release|"
            r"clearance|customs|administrative|handling)\s+fees?\b",
            r"\b(?:advance|upfront|security)\s+"
            r"(?:payment|deposit|fee)\b",
            r"\b(?:make|complete)\s+(?:the\s+)?payment\b",
            r"\b(?:pay|send|transfer|deposit)\b[^.\n]{0,25}?"
            r"(?:₹|rs\.?|inr|\$|usd)\s?\d[\d,]*(?:\.\d{1,2})?",
            r"\b(?:gift\s?cards?|western union|moneygram)\b"
            r"[^.\n]{0,40}?\b(?:pay|send|transfer|code|voucher)\b",
            r"\b(?:pay|send|transfer)\b[^.\n]{0,30}?\b(?:gift\s?cards?|"
            r"western union|moneygram|bitcoin|btc|usdt|crypto)\b",
            r"\b(?:scan (?:this|the) qr|payment link|upi id)\b",
        ),
        ignore_if=(_FIRST_PERSON_PAYMENT, _REPAYMENT),
    ),
    ScamRule(
        code="guaranteed_returns",
        category=ScamCategory.INVESTMENT_SCHEME,
        title="Guaranteed or risk-free return claim",
        explanation=(
            "The message promises guaranteed, assured, or risk-free returns. "
            "Investment returns cannot be guaranteed, and such promises are "
            "a classic feature of fraudulent schemes."
        ),
        severity=Severity.HIGH,
        points=26,
        patterns=_compile(
            r"\b(?:guaranteed?|assured|promised|fixed)\b[^.\n]{0,30}?\b"
            r"(?:returns?|profits?|income|gains?)\b",
            r"\b(?:returns?|profits?|income|gains?)\b[^.\n]{0,30}?\b"
            r"(?:guaranteed?|assured)\b",
            r"\b(?:risk[ -]?free|no risk|zero risk)\b[^.\n]{0,40}?\b"
            r"(?:investment|returns?|profit|trading|scheme|plan)\b",
            r"\b(?:investment|returns?|profit|trading|scheme|plan)\b"
            r"[^.\n]{0,40}?\b(?:risk[ -]?free|no risk|zero risk)\b",
            r"\b(?:double|triple)\s+your\s+"
            r"(?:money|investment|capital)\b",
            r"\b100\s*%\s*(?:returns?|profits?|guaranteed)\b",
            r"\bfixed\s+(?:daily|monthly|weekly)?\s*"
            r"(?:returns?|profits?)\b",
        ),
    ),
    ScamRule(
        code="unrealistic_return_rate",
        category=ScamCategory.INVESTMENT_SCHEME,
        title="Unrealistic return rate",
        explanation=(
            "The message advertises an unusually high percentage return or a "
            "large daily payout. Returns of this size are not plausible for "
            "a safe, regulated investment and are used to lure deposits."
        ),
        severity=Severity.HIGH,
        points=22,
        patterns=_compile(
            r"\b\d{2,4}\s*%\s*(?:returns?|profits?|monthly|daily|weekly|"
            r"per (?:day|month|week)|guaranteed|assured)\b",
            r"\b\d{2,4}\s*%\s*(?:in|within)\s+\d{1,2}\s*"
            r"(?:days?|weeks?|months?)\b",
            r"\b(?:earn|make|get)\s+(?:rs\.?|₹|inr|\$|usd)?\s?"
            r"\d[\d,]*\s*(?:per|a|every|each)\s*(?:day|week|month)\b"
            r"[^.\n]{0,40}?\b(?:guaranteed|assured|risk[ -]?free|"
            r"investment|trading|returns?|profits?)\b",
        ),
    ),
)


def clip_excerpt(text: str) -> str:
    """Return a literal substring capped at ``MAX_EVIDENCE_CHARS``."""
    if len(text) <= MAX_EVIDENCE_CHARS:
        return text
    cut = text[:MAX_EVIDENCE_CHARS]
    boundary = cut.rfind(" ")
    if boundary > 40:
        cut = cut[:boundary]
    return cut.rstrip()


#: Backwards-compatible private alias.
_clip_excerpt = clip_excerpt


def _is_negated(content: str, match_start: int, excerpt: str) -> bool:
    """Detect a nearby negation so advisories are not reported as requests."""
    window = content[max(0, match_start - 40) : match_start]
    clause = _CLAUSE_SPLIT.split(window)[-1]
    return bool(_NEGATION.search(clause) or _NEGATION.search(excerpt))


def _is_educational(content: str, match_start: int) -> bool:
    """Recognise a clause that describes a scam rather than performing one."""
    window = content[max(0, match_start - 90) : match_start]
    clause = _CLAUSE_SPLIT.split(window)[-1]
    return bool(_EDUCATIONAL.search(clause) or _HYPOTHETICAL.search(window))


def _is_ignored(
    content: str,
    match_start: int,
    match_end: int,
    excerpt: str,
    ignore_if: Sequence[re.Pattern[str]],
) -> bool:
    """Apply a rule's documented benign-context exclusions."""
    if not ignore_if:
        return False
    surrounding = (
        content[max(0, match_start - 60) : match_start]
        + " "
        + excerpt
        + " "
        + content[match_end : match_end + 60]
    )
    return any(pattern.search(surrounding) for pattern in ignore_if)


def _overlaps(
    start: int,
    end: int,
    spans: Sequence[tuple[int, int]],
) -> bool:
    return any(start < span_end and end > span_start for span_start, span_end in spans)


def _collect_evidence(
    rule: ScamRule,
    content: str,
    excluded_spans: Sequence[tuple[int, int]] = (),
) -> list[str]:
    excerpts: list[str] = []
    seen: set[str] = set()

    for pattern in rule.patterns:
        for match in pattern.finditer(content):
            if excluded_spans and _overlaps(
                match.start(), match.end(), excluded_spans
            ):
                continue
            excerpt = clip_excerpt(match.group(0).strip())
            if len(excerpt) < 3:
                continue
            if rule.skip_if_negated and _is_negated(
                content, match.start(), excerpt
            ):
                continue
            if rule.skip_if_educational and _is_educational(
                content, match.start()
            ):
                continue
            if _is_ignored(
                content,
                match.start(),
                match.end(),
                excerpt,
                rule.ignore_if,
            ):
                continue
            key = excerpt.casefold()
            if key in seen:
                continue
            seen.add(key)
            excerpts.append(excerpt)
            if len(excerpts) >= MAX_EVIDENCE_PER_SIGNAL:
                return excerpts

    return excerpts


def detect_findings(
    content: str,
    excluded_spans: Sequence[tuple[int, int]] = (),
) -> list[Finding]:
    """Apply every rule to ``content`` and return evidence-backed findings.

    Each rule contributes at most one finding, no matter how many of its
    patterns or occurrences match. The result order is rule declaration order,
    which keeps responses deterministic; the risk engine re-sorts for display.
    Matches overlapping ``excluded_spans`` (for example URLs) are skipped.
    """
    findings: list[Finding] = []

    for rule in RULES:
        evidence = _collect_evidence(rule, content, excluded_spans)
        if not evidence:
            continue

        signal = Signal(
            code=rule.code,
            title=rule.title,
            explanation=rule.explanation,
            severity=rule.severity,
            source=EvidenceSource.MESSAGE_TEXT,
            evidence=evidence,
            rule=RuleProvenance(
                rule_id=rule.code,
                rule_set=RULE_SET,
                version=RULE_VERSION,
            ),
        )
        findings.append(
            Finding(signal=signal, category=rule.category, points=rule.points)
        )

    return findings


__all__ = [
    "Finding",
    "MAX_EVIDENCE_CHARS",
    "MAX_EVIDENCE_PER_SIGNAL",
    "RULE_SET",
    "RULE_VERSION",
    "RULES",
    "ScamRule",
    "TextFinding",
    "clip_excerpt",
    "detect_findings",
]
