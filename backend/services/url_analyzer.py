"""Static URL inspection for messages and direct URL submissions.

This module never fetches, opens, resolves, pings, or crawls a URL. It only
parses text with :mod:`urllib.parse`, checks hostname and path structure, and
reports indicators. A finding here is a reason to verify a link independently,
never proof that the destination is malicious or that its owner is genuine.

Every evidence item is a literal substring of the submitted content. URL
excerpts are capped exactly like text excerpts, and one rule contributes at
most one signal per analysis.
"""

from __future__ import annotations

import ipaddress
import re
from collections.abc import Sequence
from dataclasses import dataclass
from urllib.parse import parse_qsl, unquote, urlsplit

from backend.models.schemas import (
    EvidenceSource,
    RuleProvenance,
    ScamCategory,
    Severity,
    Signal,
)
from backend.services.scam_detector import (
    Finding,
    clip_excerpt,
)

URL_RULE_SET = "url_static_rules"
URL_RULE_VERSION = "1.0.0"

#: A message with more unique links than this is truncated; the limitation
#: notes say so. The cap keeps one request bounded.
MAX_URLS = 10
MAX_EVIDENCE_PER_SIGNAL = 5

_TRAILING_PUNCTUATION = ".,;:!?)]}'\""
_SCHEME_URL_RE = re.compile(
    r"(?i)\b(?:https?://|www\.)[^\s<>\"'`]+",
)
_BARE_HOST_RE = re.compile(
    r"(?i)(?<![\w@.-])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+"
    r"[a-z]{2,24}(?::\d{1,5})?(?:/[^\s<>\"'`]*)?",
)
_DANGEROUS_SCHEME_RE = re.compile(
    r"(?i)\b(?:javascript|vbscript|data|file)\s*:[^\s<>\"']+",
)
_PERCENT_ESCAPE_RE = re.compile(r"%[0-9A-Fa-f]{2}")

_PATH_TERM_RE = re.compile(
    r"(?i)(?<![a-z0-9])("
    r"otp|one-time-password|verification-code|verify-account|"
    r"account-verification|kyc|aadhaar|aadhar|pan-card|"
    r"wallet-connect|connect-wallet|wallet|seed-phrase|mnemonic|"
    r"private-key|unlock|reactivate|claim|airdrop|reward|bonus|giveaway"
    r")(?![a-z0-9])",
)

#: URL-path themes and the text rules that already evidence the same theme.
_TEXT_CORROBORATION: dict[str, frozenset[str]] = {
    "credential": frozenset(
        {"otp_disclosure_request", "bank_account_threat"}
    ),
    "kyc": frozenset({"kyc_update_demand"}),
    "wallet": frozenset({"crypto_reward_claim", "seed_phrase_request"}),
    "account": frozenset({"bank_account_threat"}),
}

_PATH_TERM_THEMES: dict[str, str] = {
    "otp": "credential",
    "one-time-password": "credential",
    "verification-code": "credential",
    "verify-account": "credential",
    "account-verification": "credential",
    "kyc": "kyc",
    "aadhaar": "kyc",
    "aadhar": "kyc",
    "pan-card": "kyc",
    "wallet-connect": "wallet",
    "connect-wallet": "wallet",
    "wallet": "wallet",
    "seed-phrase": "wallet",
    "mnemonic": "wallet",
    "private-key": "wallet",
    "claim": "wallet",
    "airdrop": "wallet",
    "reward": "wallet",
    "bonus": "wallet",
    "giveaway": "wallet",
    "unlock": "account",
    "reactivate": "account",
}

_REDIRECT_PARAMS = frozenset(
    {
        "url",
        "redirect",
        "redirect_uri",
        "redirect_url",
        "next",
        "return",
        "return_url",
        "returnurl",
        "continue",
        "target",
        "dest",
        "destination",
    }
)

#: Brands frequently used as a subdomain lure. Matching a brand in a
#: non-registrable label is an indicator only; ownership is never verified.
_BRANDS = frozenset(
    {
        "paypal",
        "apple",
        "amazon",
        "microsoft",
        "google",
        "facebook",
        "instagram",
        "whatsapp",
        "netflix",
        "sbi",
        "hdfc",
        "icici",
        "axis",
        "kotak",
        "rbi",
        "irs",
        "hmrc",
        "dhl",
        "fedex",
        "ups",
        "usps",
        "chase",
        "wellsfargo",
        "bankofamerica",
        "binance",
        "coinbase",
        "metamask",
        "trustwallet",
        "ledger",
        "visa",
        "mastercard",
        "stripe",
        "upi",
        "gpay",
        "phonepe",
        "paytm",
        "flipkart",
        "myntra",
        "irctc",
        "aadhaar",
        "uidai",
        "epfo",
    }
)

_SENSITIVE_SUBDOMAIN_TERMS = frozenset(
    {
        "secure",
        "security",
        "verify",
        "verification",
        "login",
        "signin",
        "auth",
        "account",
        "update",
        "kyc",
        "otp",
        "wallet",
        "support",
        "payment",
        "billing",
        "unlock",
        "reactivate",
        "confirm",
    }
)

_SUSPICIOUS_TLDS = frozenset(
    {
        "xyz",
        "top",
        "club",
        "site",
        "online",
        "live",
        "click",
        "link",
        "vip",
        "icu",
        "work",
        "support",
        "help",
        "finance",
        "money",
        "crypto",
        "exchange",
        "wallet",
        "bank",
        "secure",
        "verify",
        "payment",
        "loans",
        "buzz",
        "cyou",
        "rest",
        "gq",
        "tk",
        "ml",
        "cf",
        "ga",
        "cc",
        "tv",
        "zip",
        "mov",
    }
)

#: Common multi-label public suffixes, used only to decide which labels are
#: subdomains. This is intentionally a small list, not a public-suffix claim.
_SECOND_LEVEL_SUFFIXES = frozenset(
    {
        "co.uk",
        "org.uk",
        "ac.uk",
        "gov.uk",
        "co.in",
        "net.in",
        "org.in",
        "gen.in",
        "firm.in",
        "ind.in",
        "co.jp",
        "co.nz",
        "com.au",
        "net.au",
        "org.au",
        "com.br",
        "com.mx",
        "co.za",
        "com.sg",
        "com.hk",
        "com.my",
        "co.id",
        "co.kr",
        "com.tw",
        "com.cn",
        "com.tr",
        "com.ar",
        "com.co",
    }
)

_LOCAL_HOSTS = frozenset({"localhost"})
_BRAND_PART_RE = re.compile(r"[a-z0-9]+")


@dataclass(frozen=True)
class URLToken:
    """One URL-like token and the exact span it occupies in the content."""

    raw: str
    start: int
    end: int


@dataclass(frozen=True)
class URLAnalysis:
    """URL findings plus the facts used to write accurate limitations."""

    findings: list[Finding]
    inspected_count: int
    truncated: bool


@dataclass(frozen=True)
class URLRule:
    """Documented static URL rule metadata."""

    code: str
    title: str
    explanation: str
    severity: Severity
    points: int


URL_RULES: tuple[URLRule, ...] = (
    URLRule(
        code="url_dangerous_scheme",
        title="Executable or local-resource link scheme",
        explanation=(
            "The message contains a javascript, vbscript, data, or file "
            "scheme. These are not ordinary web links and can execute content "
            "or open local resources. This check never runs the link."
        ),
        severity=Severity.HIGH,
        points=20,
    ),
    URLRule(
        code="url_at_userinfo",
        title="Link uses an @ user-information trick",
        explanation=(
            "The part before @ is user information, not the destination host. "
            "Browsers connect to the host after the last @, so a link made to "
            "look like a trusted name can lead elsewhere. This check does not "
            "contact either name."
        ),
        severity=Severity.HIGH,
        points=20,
    ),
    URLRule(
        code="url_ip_host",
        title="Link uses a raw IP address as its host",
        explanation=(
            "The host is an IP address rather than a domain name. This hides "
            "the name behind the address and is unusual for consumer services. "
            "The address was not contacted or resolved."
        ),
        severity=Severity.HIGH,
        points=18,
    ),
    URLRule(
        code="url_punycode_host",
        title="Link uses a punycode hostname",
        explanation=(
            "A hostname label starts with xn--, the encoding used for "
            "internationalised names. Punycode can represent characters that "
            "look like a familiar brand. This check does not decode the "
            "intended name or verify ownership."
        ),
        severity=Severity.HIGH,
        points=18,
    ),
    URLRule(
        code="url_misleading_host",
        title="Link has a misleading hostname structure",
        explanation=(
            "A brand-like or security-related label appears in a subdomain, or "
            "the host is unusually deep. Subdomains are easy to create and do "
            "not establish who owns or operates the destination. Ownership "
            "was not verified."
        ),
        severity=Severity.HIGH,
        points=16,
    ),
    URLRule(
        code="url_sensitive_path",
        title="Link path contains credential or reward terms",
        explanation=(
            "The URL path or query mentions OTP, KYC, identity, wallet, or "
            "reward terms. Legitimate services also use such paths, so this is "
            "a review indicator, not proof. The page behind the link was not "
            "opened."
        ),
        severity=Severity.MEDIUM,
        points=14,
    ),
    URLRule(
        code="url_malformed",
        title="Malformed or non-public link",
        explanation=(
            "The link is missing a usable host, has an invalid port or address, "
            "or points at a single-label host. It may be mistyped, deliberately "
            "obfuscated, or simply unusable. Nothing was contacted."
        ),
        severity=Severity.MEDIUM,
        points=10,
    ),
    URLRule(
        code="url_obfuscated",
        title="Heavily encoded link",
        explanation=(
            "The link contains many percent-escapes or encoded bytes. Encoding "
            "is normal in moderation, but heavy encoding can hide the real path "
            "or query. The link was decoded for inspection only and was not "
            "opened."
        ),
        severity=Severity.MEDIUM,
        points=10,
    ),
    URLRule(
        code="url_embedded_redirect",
        title="Link carries another web address in a redirect parameter",
        explanation=(
            "A query parameter normally used for redirects contains a different "
            "web address. This can send a visitor somewhere other than the "
            "visible host. The embedded address was not contacted."
        ),
        severity=Severity.MEDIUM,
        points=10,
    ),
    URLRule(
        code="url_insecure_scheme",
        title="Unencrypted HTTP link",
        explanation=(
            "The link uses http rather than https. Many sites redirect to "
            "https, so this alone does not make a link fraudulent, but "
            "credentials or payment details should not be entered over an "
            "unencrypted connection."
        ),
        severity=Severity.LOW,
        points=6,
    ),
    URLRule(
        code="url_unusually_long",
        title="Unusually long link",
        explanation=(
            "The link is long enough to obscure its host or destination. Long "
            "links are also used legitimately for tracking, so this is only a "
            "review indicator."
        ),
        severity=Severity.LOW,
        points=6,
    ),
)

_RULES_BY_CODE = {rule.code: rule for rule in URL_RULES}


def _trim(raw: str) -> str:
    """Remove sentence punctuation, keeping a literal substring.

    A closing parenthesis is kept when it balances an opening one, so a URL
    path such as ``/lookup(name)`` is not silently truncated.
    """
    while raw and raw[-1] in _TRAILING_PUNCTUATION:
        if raw[-1] == ")" and raw.count("(") >= raw.count(")"):
            break
        raw = raw[:-1]
    return raw


def extract_urls(content: str) -> list[URLToken]:
    """Extract http(s), ``www.``, and common bare-host tokens.

    Overlapping matches are merged so ``https://example.com`` is not also
    reported as the bare host ``example.com``. Returned spans cover the exact
    text so text rules can exclude link content.
    """
    candidates: list[URLToken] = []
    for pattern in (_SCHEME_URL_RE, _BARE_HOST_RE):
        for match in pattern.finditer(content):
            raw = _trim(match.group(0))
            if len(raw) < 4:
                continue
            candidates.append(
                URLToken(raw=raw, start=match.start(), end=match.start() + len(raw))
            )

    candidates.sort(key=lambda token: (token.start, -(token.end - token.start)))
    tokens: list[URLToken] = []
    for token in candidates:
        if tokens and token.start < tokens[-1].end:
            continue
        tokens.append(token)
    return tokens


def _parse(raw: str):
    candidate = raw if "://" in raw else f"//{raw}"
    return urlsplit(candidate)


def _is_ip(host: str) -> bool:
    try:
        ipaddress.ip_address(host)
    except ValueError:
        return False
    return True


def _malformed_ip_like(host: str) -> bool:
    labels = host.split(".")
    if len(labels) != 4 or not all(label.isdigit() for label in labels):
        return False
    return any(int(label) > 255 for label in labels)


def _brand_in_label(label: str, brand: str) -> bool:
    return brand in _BRAND_PART_RE.findall(label)


def _registrable_label_count(labels: Sequence[str]) -> int:
    if len(labels) >= 2:
        suffix = ".".join(labels[-2:])
        if suffix in _SECOND_LEVEL_SUFFIXES:
            return 3
    return 2


def _is_misleading_host(host: str) -> bool:
    labels = [label for label in host.split(".") if label]
    if len(labels) < 2:
        return False

    registrable_count = _registrable_label_count(labels)
    if len(labels) <= registrable_count:
        return False

    registrable = ".".join(labels[-registrable_count:])
    subdomains = labels[:-registrable_count]
    tld = labels[-1]

    for label in subdomains:
        if any(_brand_in_label(label, brand) for brand in _BRANDS):
            if not any(brand in registrable for brand in _BRANDS):
                return True

    for label in subdomains:
        parts = _BRAND_PART_RE.findall(label)
        if any(term in parts for term in _SENSITIVE_SUBDOMAIN_TERMS):
            if (
                len(labels) >= 4
                or "-" in label
                or tld in _SUSPICIOUS_TLDS
            ):
                return True

    return len(labels) >= 5


def _sensitive_path_terms(parts) -> list[tuple[str, str]]:
    try:
        decoded = unquote(f"{parts.path}?{parts.query}".rstrip("?"))
    except (UnicodeDecodeError, ValueError):
        decoded = parts.path
    terms: list[tuple[str, str]] = []
    seen: set[str] = set()
    for match in _PATH_TERM_RE.finditer(decoded):
        term = match.group(1).lower()
        if term in seen:
            continue
        seen.add(term)
        terms.append((term, _PATH_TERM_THEMES[term]))
    return terms


def _embedded_redirect(parts, host: str) -> bool:
    for key, value in parse_qsl(parts.query, keep_blank_values=True):
        if key.lower() not in _REDIRECT_PARAMS:
            continue
        candidate = unquote(value)
        if not candidate.lower().startswith(("http://", "https://", "//")):
            continue
        try:
            inner = _parse(candidate)
            inner_host = (inner.hostname or "").rstrip(".").lower()
        except ValueError:
            continue
        if inner_host and inner_host != host:
            return True
    return False


def _add_evidence(
    evidence: dict[str, list[str]],
    code: str,
    text: str,
) -> None:
    bucket = evidence.setdefault(code, [])
    if len(bucket) >= MAX_EVIDENCE_PER_SIGNAL:
        return
    excerpt = clip_excerpt(text)
    if not excerpt:
        return
    key = excerpt.casefold()
    if any(existing.casefold() == key for existing in bucket):
        return
    bucket.append(excerpt)


def _finding(
    code: str,
    evidence: list[str],
    points: int | None = None,
    explanation_suffix: str = "",
) -> Finding:
    rule = _RULES_BY_CODE[code]
    signal = Signal(
        code=rule.code,
        title=rule.title,
        explanation=f"{rule.explanation}{explanation_suffix}",
        severity=rule.severity,
        source=EvidenceSource.URL_STATIC,
        evidence=evidence,
        rule=RuleProvenance(
            rule_id=rule.code,
            rule_set=URL_RULE_SET,
            version=URL_RULE_VERSION,
        ),
    )
    return Finding(
        signal=signal,
        category=ScamCategory.SUSPICIOUS_URL,
        points=rule.points if points is None else points,
    )


def _unique_tokens(tokens: Sequence[URLToken]) -> tuple[list[URLToken], bool]:
    unique: list[URLToken] = []
    seen: set[str] = set()
    truncated = False
    for token in tokens:
        try:
            parts = _parse(token.raw)
            key = (
                parts.scheme.lower(),
                (parts.hostname or "").lower(),
                parts.port if parts.port is not None else "",
                parts.path,
                parts.query,
            )
        except ValueError:
            key = token.raw.casefold()
        marker = repr(key)
        if marker in seen:
            continue
        seen.add(marker)
        if len(unique) >= MAX_URLS:
            truncated = True
            continue
        unique.append(token)
    return unique, truncated


def analyze_urls(
    content: str,
    tokens: Sequence[URLToken],
    text_findings: Sequence[Finding] = (),
) -> URLAnalysis:
    """Inspect extracted links without any network access.

    ``text_findings`` is used only to avoid awarding points twice for the same
    theme when a URL path corroborates a text finding. The URL signal remains
    visible; its contribution becomes ``0``.
    """
    selected, truncated = _unique_tokens(tokens)
    evidence: dict[str, list[str]] = {}
    path_themes: set[str] = set()
    inspected = 0

    for token in selected:
        inspected += 1
        raw = token.raw

        try:
            parts = _parse(raw)
            host = (parts.hostname or "").rstrip(".").lower()
            # Accessing .port validates it; the value itself is not needed.
            _ = parts.port
        except ValueError:
            _add_evidence(evidence, "url_malformed", raw)
            continue

        if not host:
            _add_evidence(evidence, "url_malformed", raw)
            continue

        netloc = parts.netloc
        if "@" in netloc:
            _add_evidence(evidence, "url_at_userinfo", raw)

        if _is_ip(host):
            _add_evidence(evidence, "url_ip_host", raw)
        elif _malformed_ip_like(host):
            _add_evidence(evidence, "url_malformed", raw)
        elif "." not in host and host not in _LOCAL_HOSTS:
            _add_evidence(evidence, "url_malformed", raw)

        if any(label.startswith("xn--") for label in host.split(".")):
            _add_evidence(evidence, "url_punycode_host", raw)

        if _is_misleading_host(host):
            _add_evidence(evidence, "url_misleading_host", raw)

        if raw.lower().startswith("http://"):
            _add_evidence(evidence, "url_insecure_scheme", raw)

        if len(raw) > 200:
            _add_evidence(evidence, "url_unusually_long", raw)

        escapes = len(_PERCENT_ESCAPE_RE.findall(raw))
        if escapes >= 6 or "%00" in raw.lower() or "%25" in raw.lower():
            _add_evidence(evidence, "url_obfuscated", raw)

        terms = _sensitive_path_terms(parts)
        if terms:
            _add_evidence(evidence, "url_sensitive_path", raw)
            path_themes.update(theme for _, theme in terms)

        if _embedded_redirect(parts, host):
            _add_evidence(evidence, "url_embedded_redirect", raw)

    for match in _DANGEROUS_SCHEME_RE.finditer(content):
        _add_evidence(evidence, "url_dangerous_scheme", match.group(0))
        inspected += 1

    text_codes = {finding.signal.code for finding in text_findings}
    corroborated = any(
        text_codes & _TEXT_CORROBORATION[theme] for theme in path_themes
    )

    findings: list[Finding] = []
    for rule in URL_RULES:
        items = evidence.get(rule.code)
        if not items:
            continue
        if rule.code == "url_sensitive_path" and corroborated:
            findings.append(
                _finding(
                    rule.code,
                    items,
                    points=0,
                    explanation_suffix=(
                        " No additional points were added because the same "
                        "theme is already evidenced in the message text."
                    ),
                )
            )
            continue
        findings.append(_finding(rule.code, items, points=rule.points))

    return URLAnalysis(
        findings=findings,
        inspected_count=inspected,
        truncated=truncated,
    )


__all__ = [
    "MAX_URLS",
    "URL_RULES",
    "URL_RULE_SET",
    "URL_RULE_VERSION",
    "URLAnalysis",
    "URLToken",
    "analyze_urls",
    "extract_urls",
]
