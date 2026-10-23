"""Regression tests for static URL analysis and combined scoring.

No test contacts a URL. The no-network test additionally fails the process if
socket or urllib entry points are reached during an API request.
"""

from __future__ import annotations

import socket
import urllib.request
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from backend.core.config import Settings
from backend.main import create_app
from backend.models.schemas import Environment
from backend.services.risk_engine import risk_level_for_score
from backend.services.url_analyzer import MAX_URLS, extract_urls

ANALYZE_URL = "/api/v1/analyze"
RESPONSE_KEYS = {
    "scan_id",
    "type",
    "language",
    "status",
    "analyzed_at",
    "risk_score",
    "risk_level",
    "category",
    "summary",
    "signals",
    "recommended_actions",
    "limitations",
    "scoring",
}


@pytest.fixture()
def large_client() -> Iterator[TestClient]:
    settings = Settings(
        environment=Environment.TEST,
        cors_allowed_origins=("http://localhost:3000",),
        max_request_bytes=40_000,
    )
    with TestClient(create_app(settings)) as test_client:
        yield test_client


def _post(client: TestClient, text: str, language: str = "en"):
    return client.post(
        ANALYZE_URL,
        json={"type": "text", "content": text, "language": language},
    )


def _assert_scoring_is_consistent(payload: dict) -> None:
    scoring = payload["scoring"]
    points = [item["points"] for item in scoring["contributions"]]

    assert points == sorted(points, reverse=True)
    assert scoring["raw_total"] == sum(points)
    assert scoring["applied_total"] == payload["risk_score"]
    assert payload["risk_score"] == min(100, scoring["raw_total"])
    assert scoring["capped"] is (scoring["raw_total"] > 100)
    assert [item["code"] for item in scoring["contributions"]] == [
        signal["code"] for signal in payload["signals"]
    ]
    assert payload["risk_level"] == risk_level_for_score(
        payload["risk_score"]
    ).value


def _assert_evidence_is_literal(payload: dict, content: str) -> None:
    for signal in payload["signals"]:
        assert signal["evidence"]
        for excerpt in signal["evidence"]:
            assert excerpt in content
            assert 1 <= len(excerpt) <= 500


def test_benign_message_with_normal_link_has_no_signals(
    client: TestClient,
) -> None:
    content = "The schedule is posted at https://example.com/news/article today."

    payload = _post(client, content).json()

    assert payload["risk_score"] == 0
    assert payload["risk_level"] == "low"
    assert payload["category"] == "none"
    assert payload["signals"] == []
    assert any(
        "1 link was inspected statically" in note
        for note in payload["limitations"]["notes"]
    )
    assert any(
        "No URL was opened, resolved, crawled, or fetched" in note
        for note in payload["limitations"]["notes"]
    )


def test_urgency_with_a_benign_link_reports_only_urgency(
    client: TestClient,
) -> None:
    payload = _post(
        client,
        "URGENT: Act now, details are at https://example.com/news.",
    ).json()

    assert payload["risk_score"] == 12
    assert payload["risk_level"] == "low"
    assert payload["category"] == "urgency_pressure"
    assert {signal["code"] for signal in payload["signals"]} == {
        "urgency_pressure"
    }


@pytest.mark.parametrize(
    ("content", "codes", "score", "level"),
    [
        (
            "Open http://192.168.1.10/login now.",
            {"url_ip_host", "url_insecure_scheme"},
            24,
            "moderate",
        ),
        (
            "Open http://[::1]/login now.",
            {"url_ip_host", "url_insecure_scheme"},
            24,
            "moderate",
        ),
        (
            "Verify at http://paypal.com@evil.xyz/verify-account.",
            {"url_at_userinfo", "url_sensitive_path", "url_insecure_scheme"},
            40,
            "high",
        ),
        (
            "https://xn--pypal-4ve.com/login",
            {"url_punycode_host"},
            18,
            "moderate",
        ),
        (
            "https://paypal.com.security-check.xyz/otp",
            {"url_misleading_host", "url_sensitive_path"},
            30,
            "moderate",
        ),
        (
            "https://example.com/kyc-update",
            {"url_sensitive_path"},
            14,
            "low",
        ),
        (
            "https://example.com/%6b%79%63-%75%70%64%61%74%65",
            {"url_sensitive_path", "url_obfuscated"},
            24,
            "moderate",
        ),
        (
            "http:///login",
            {"url_malformed"},
            10,
            "low",
        ),
        (
            "http://999.999.999.999/login",
            {"url_malformed", "url_insecure_scheme"},
            16,
            "moderate",
        ),
        (
            "Open javascript:alert(1) now.",
            {"url_dangerous_scheme"},
            20,
            "moderate",
        ),
    ],
)
def test_structural_url_patterns_are_detected(
    client: TestClient,
    content: str,
    codes: set[str],
    score: int,
    level: str,
) -> None:
    response = _post(client, content)

    assert response.status_code == 200
    payload = response.json()
    assert set(payload) == RESPONSE_KEYS
    assert payload["risk_score"] == score
    assert payload["risk_level"] == level
    assert payload["category"] == "suspicious_url"
    assert {signal["code"] for signal in payload["signals"]} == codes
    _assert_scoring_is_consistent(payload)
    _assert_evidence_is_literal(payload, content)

    for signal in payload["signals"]:
        assert signal["source"] == "url_static"
        assert signal["rule"]["rule_id"] == signal["code"]
        assert signal["rule"]["rule_set"] == "url_static_rules"
        assert signal["rule"]["version"] == "1.0.0"


def test_protocol_relative_redirect_is_detected(client: TestClient) -> None:
    content = "https://example.com/a?next=//evil.xyz"

    payload = _post(client, content).json()

    assert payload["risk_score"] == 10
    assert {signal["code"] for signal in payload["signals"]} == {
        "url_embedded_redirect"
    }


def test_double_encoding_is_flagged_but_plain_percent_is_not(
    client: TestClient,
) -> None:
    plain = _post(client, "https://example.com/a?off=25%25").json()
    assert plain["signals"] == []

    encoded = _post(client, "https://example.com/a?x=%2541").json()
    assert encoded["risk_score"] == 10
    assert {signal["code"] for signal in encoded["signals"]} == {
        "url_obfuscated"
    }


def test_url_submitted_by_itself_is_supported(client: TestClient) -> None:
    payload = _post(client, "https://example.com/kyc-update").json()

    assert payload["type"] == "text"
    assert payload["risk_score"] == 14
    assert payload["category"] == "suspicious_url"
    assert len(payload["signals"]) == 1


def test_multiple_urls_contribute_once_per_rule(client: TestClient) -> None:
    content = (
        "Mirrors: http://1.1.1.1/a http://2.2.2.2/b http://3.3.3.3/c"
    )

    payload = _post(client, content).json()

    assert payload["risk_score"] == 24
    assert {signal["code"] for signal in payload["signals"]} == {
        "url_ip_host",
        "url_insecure_scheme",
    }
    ip_signal = next(
        signal
        for signal in payload["signals"]
        if signal["code"] == "url_ip_host"
    )
    assert len(ip_signal["evidence"]) == 3
    _assert_scoring_is_consistent(payload)
    _assert_evidence_is_literal(payload, content)


def test_link_count_is_bounded_and_reported(large_client: TestClient) -> None:
    content = " ".join(f"http://10.0.0.{index}/path" for index in range(1, 13))

    payload = _post(large_client, content).json()

    assert payload["risk_score"] == 24
    assert any(
        "Only the first 10 unique links" in note
        for note in payload["limitations"]["notes"]
    )
    ip_signal = next(
        signal
        for signal in payload["signals"]
        if signal["code"] == "url_ip_host"
    )
    assert len(ip_signal["evidence"]) == 5
    assert len(extract_urls(content)) > MAX_URLS


def test_distinct_link_theme_still_scores(client: TestClient) -> None:
    content = "Complete KYC at https://example.com/otp"

    payload = _post(client, content).json()

    assert payload["risk_score"] == 34
    contributions = {
        item["code"]: item["points"]
        for item in payload["scoring"]["contributions"]
    }
    assert contributions["kyc_update_demand"] == 20
    assert contributions["url_sensitive_path"] == 14
    _assert_scoring_is_consistent(payload)


def test_cross_source_theme_is_not_double_counted(client: TestClient) -> None:
    content = "Complete KYC at https://sbi-kyc.xyz/kyc"

    payload = _post(client, content).json()

    assert payload["risk_score"] == 20
    assert payload["risk_level"] == "moderate"
    assert payload["category"] == "bank_kyc_impersonation"
    assert {signal["code"] for signal in payload["signals"]} == {
        "kyc_update_demand",
        "url_sensitive_path",
    }

    url_signal = next(
        signal
        for signal in payload["signals"]
        if signal["code"] == "url_sensitive_path"
    )
    assert "No additional points were added" in url_signal["explanation"]

    contributions = {
        item["code"]: item["points"]
        for item in payload["scoring"]["contributions"]
    }
    assert contributions["kyc_update_demand"] == 20
    assert contributions["url_sensitive_path"] == 0
    assert payload["scoring"]["raw_total"] == 20
    _assert_scoring_is_consistent(payload)
    _assert_evidence_is_literal(payload, content)


@pytest.mark.parametrize(
    "content",
    [
        "100% safe drinking water for your family.",
        "Your fixed deposit offers fixed interest every quarter.",
        "Your account was closed at your request. Thank you for banking.",
        "If someone asks you to share your OTP, do not do it.",
        "Scammers often ask you to share your OTP to steal money.",
        "Never share your OTP or PIN with anyone. Our bank will never ask.",
        "Please pay me back the money tomorrow.",
        "I will transfer the amount tomorrow.",
        "Your 12-word phrase is the key to your wallet.",
        "How to link Aadhaar to PAN online.",
        "If you are asked to share your OTP, hang up.",
        "A guide: scammers may ask you to share your OTP.",
    ],
)
def test_benign_or_educational_text_is_not_flagged(
    client: TestClient, content: str
) -> None:
    payload = _post(client, content).json()

    assert payload["risk_score"] == 0
    assert payload["signals"] == []
    assert payload["category"] == "none"


@pytest.mark.parametrize(
    ("content", "codes", "score"),
    [
        (
            "Update your Aadhaar at the bank.",
            {"kyc_update_demand"},
            20,
        ),
        (
            "I am a CBI officer. Call this number.",
            {"government_agency_impersonation"},
            22,
        ),
        (
            "We will file a case against you.",
            {"legal_action_threat"},
            18,
        ),
        (
            "You have won 1 ETH.",
            {"crypto_reward_claim"},
            24,
        ),
        (
            "Profit assured with zero risk.",
            {"guaranteed_returns"},
            26,
        ),
        (
            "Your account is locked. Reactivate now.",
            {"bank_account_threat"},
            22,
        ),
        (
            "Your account is temporarily suspended.",
            {"bank_account_threat"},
            22,
        ),
        (
            "The OTP is 123456. Share it with our agent.",
            {"otp_disclosure_request"},
            32,
        ),
    ],
)
def test_additional_text_gaps_are_detected(
    client: TestClient,
    content: str,
    codes: set[str],
    score: int,
) -> None:
    payload = _post(client, content).json()

    assert payload["risk_score"] == score
    assert {signal["code"] for signal in payload["signals"]} == codes
    _assert_scoring_is_consistent(payload)
    _assert_evidence_is_literal(payload, content)


def test_url_analysis_never_opens_a_network_connection(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fail(*args: object, **kwargs: object) -> None:
        raise AssertionError("URL analysis attempted network access")

    monkeypatch.setattr(socket, "getaddrinfo", fail)
    monkeypatch.setattr(socket, "create_connection", fail)
    monkeypatch.setattr(urllib.request, "urlopen", fail)

    content = (
        "Check http://192.168.1.10/login and "
        "https://paypal.com.security-check.xyz/verify-account and "
        "https://xn--pypal-4ve.com/otp."
    )
    response = _post(client, content)

    assert response.status_code == 200
    payload = response.json()
    assert payload["signals"]
    assert payload["risk_score"] > 0


def test_email_address_is_not_extracted_as_a_url() -> None:
    content = "Write to user@example.com, not to a link."

    assert extract_urls(content) == []


def test_url_spans_cover_exact_source_text() -> None:
    content = "Visit https://example.com/a and http://192.168.1.1/b."

    tokens = extract_urls(content)

    assert [token.raw for token in tokens] == [
        "https://example.com/a",
        "http://192.168.1.1/b",
    ]
    for token in tokens:
        assert content[token.start : token.end] == token.raw


def test_openapi_description_documents_static_url_rules(
    client: TestClient,
) -> None:
    operation = client.get("/openapi.json").json()["paths"][ANALYZE_URL]["post"]

    assert "url_static_rules" in operation["description"]
    assert "never opened" in operation["description"]
