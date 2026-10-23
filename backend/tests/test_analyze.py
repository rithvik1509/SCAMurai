"""Tests for ``POST /api/v1/analyze``.

The expected scores are exact on purpose: weights and thresholds are part of
the documented contract, so changing a rule weight should require updating the
documentation and these tests together.
"""

from __future__ import annotations

import re
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from backend.core.config import Settings
from backend.main import create_app
from backend.models.schemas import Environment, TextAnalysisRequest
from backend.services.risk_engine import assess_findings, risk_level_for_score
from backend.services.scam_detector import detect_findings

SCAN_ID_RE = re.compile(r"^scan_[0-9a-f]{32}$")
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

BANK_OTP_MESSAGE = (
    "URGENT: Dear customer, your SBI account will be blocked in 24 hours. "
    "Your KYC has expired. Share the OTP sent to your phone with our officer "
    "immediately to reactivate your account."
)

CAP_MESSAGE = (
    "URGENT: Your account will be blocked. Update KYC immediately. Share the "
    "OTP. Income Tax Department has issued an arrest warrant. Pay a processing "
    "fee of ₹999. Claim your free BTC airdrop. Connect your wallet. Send your "
    "seed phrase. Guaranteed 300% returns monthly with zero risk."
)

CAPPED_RAW_TOTAL = 12 + 22 + 20 + 32 + 22 + 18 + 24 + 40 + 20 + 26 + 22

# (name, message, expected signal codes, exact score, level, category)
SUSPICIOUS_CASES = [
    (
        "urgency",
        "URGENT: Act now, this offer expires today.",
        {"urgency_pressure"},
        12,
        "low",
        "urgency_pressure",
    ),
    (
        "bank-combined",
        BANK_OTP_MESSAGE,
        {
            "urgency_pressure",
            "bank_account_threat",
            "kyc_update_demand",
            "otp_disclosure_request",
        },
        86,
        "critical",
        "otp_theft",
    ),
    (
        "bank-kyc",
        "Dear customer, your account has been suspended. Complete your KYC "
        "verification now.",
        {"bank_account_threat", "kyc_update_demand"},
        42,
        "high",
        "bank_kyc_impersonation",
    ),
    (
        "otp",
        "Please send me the OTP you just received so I can verify your identity.",
        {"otp_disclosure_request"},
        32,
        "moderate",
        "otp_theft",
    ),
    (
        "government",
        "This is the Income Tax Department. An arrest warrant has been issued "
        "against you. Pay the penalty immediately.",
        {
            "urgency_pressure",
            "government_agency_impersonation",
            "legal_action_threat",
            "payment_demand",
        },
        72,
        "critical",
        "government_impersonation",
    ),
    (
        "crypto-reward",
        "Congratulations! You won a free BTC reward. Connect your wallet to "
        "claim your airdrop.",
        {"crypto_reward_claim"},
        24,
        "moderate",
        "crypto_reward",
    ),
    (
        "payment-demand",
        "Your parcel is held at customs. Pay a processing fee of ₹499 to "
        "release it.",
        {"payment_demand"},
        20,
        "moderate",
        "payment_demand",
    ),
    (
        "investment",
        "Guaranteed 300% returns monthly with zero risk. Double your money in "
        "30 days.",
        {"guaranteed_returns", "unrealistic_return_rate"},
        48,
        "high",
        "investment_scheme",
    ),
]

BENIGN_MESSAGES = [
    "Hi, are we still meeting for lunch at 1 pm tomorrow?",
    "Your Amazon order has shipped and should arrive on Tuesday. Track it in "
    "the app.",
    "The project review has moved to room 4 at 3 pm.",
    "Never share your OTP or PIN with anyone. Our bank will never ask for it.",
    "The OTP is confidential, never share it.",
    "I will pay you back the money tomorrow.",
]


@pytest.fixture()
def large_client() -> Iterator[TestClient]:
    """Client with a body limit big enough to test content-length validation."""
    settings = Settings(
        environment=Environment.TEST,
        cors_allowed_origins=("http://localhost:3000",),
        max_request_bytes=20_000,
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

    assert scoring["method"] == "weighted_rule_sum"
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


@pytest.mark.parametrize(
    ("name", "message", "expected_codes", "expected_score", "level", "category"),
    SUSPICIOUS_CASES,
    ids=[case[0] for case in SUSPICIOUS_CASES],
)
def test_suspicious_messages_are_detected(
    client: TestClient,
    name: str,
    message: str,
    expected_codes: set[str],
    expected_score: int,
    level: str,
    category: str,
) -> None:
    response = _post(client, message)

    assert response.status_code == 200
    payload = response.json()
    assert set(payload) == RESPONSE_KEYS
    assert payload["type"] == "text"
    assert payload["language"] == "en"
    assert payload["status"] == "completed"
    assert payload["risk_score"] == expected_score
    assert payload["risk_level"] == level
    assert payload["category"] == category
    assert SCAN_ID_RE.fullmatch(payload["scan_id"])

    codes = {signal["code"] for signal in payload["signals"]}
    assert expected_codes <= codes
    _assert_scoring_is_consistent(payload)

    for signal in payload["signals"]:
        assert signal["source"] == "message_text"
        assert signal["severity"] in {
            "info",
            "low",
            "medium",
            "high",
            "critical",
        }
        assert signal["rule"]["rule_id"] == signal["code"]
        assert signal["rule"]["rule_set"] == "scam_text_rules"
        assert signal["rule"]["version"] == "1.0.0"
        assert signal["explanation"]
        assert signal["evidence"]


@pytest.mark.parametrize(
    ("message", "expected_codes", "expected_score"),
    [
        (
            "Dear customer, your debit card is blocked. Update your KYC "
            "immediately.",
            {
                "bank_account_threat",
                "kyc_update_demand",
                "urgency_pressure",
            },
            54,
        ),
        (
            "Send me the 6-digit code you received.",
            {"otp_disclosure_request"},
            32,
        ),
        (
            "Don't delay, share the OTP you received.",
            {"otp_disclosure_request"},
            32,
        ),
    ],
)
def test_common_message_variants_are_detected(
    client: TestClient,
    message: str,
    expected_codes: set[str],
    expected_score: int,
) -> None:
    payload = _post(client, message).json()

    assert payload["risk_score"] == expected_score
    assert {signal["code"] for signal in payload["signals"]} == expected_codes
    for signal in payload["signals"]:
        for excerpt in signal["evidence"]:
            assert excerpt in message


@pytest.mark.parametrize("message", BENIGN_MESSAGES)
def test_benign_messages_produce_no_signals(
    client: TestClient, message: str
) -> None:
    response = _post(client, message)

    assert response.status_code == 200
    payload = response.json()
    assert payload["risk_score"] == 0
    assert payload["risk_level"] == "low"
    assert payload["category"] == "none"
    assert payload["status"] == "completed"
    assert payload["signals"] == []
    assert payload["scoring"] == {
        "method": "weighted_rule_sum",
        "raw_total": 0,
        "applied_total": 0,
        "capped": False,
        "contributions": [],
    }
    assert payload["summary"].startswith("No documented scam indicators")
    assert len(payload["recommended_actions"]) == 1
    assert payload["recommended_actions"][0]["priority"] == 1
    assert payload["limitations"]["notes"]


def test_evidence_is_an_exact_excerpt_of_the_submitted_text(
    client: TestClient,
) -> None:
    response = _post(client, BANK_OTP_MESSAGE)
    payload = response.json()

    otp_signal = next(
        signal
        for signal in payload["signals"]
        if signal["code"] == "otp_disclosure_request"
    )
    assert "Share the OTP" in otp_signal["evidence"]

    for signal in payload["signals"]:
        for excerpt in signal["evidence"]:
            assert excerpt in BANK_OTP_MESSAGE
            assert 1 <= len(excerpt) <= 500

    # The whole submitted message must not be echoed back.
    assert BANK_OTP_MESSAGE not in response.text


def test_scan_ids_are_unique_and_time_is_timezone_aware(
    client: TestClient,
) -> None:
    from datetime import datetime

    scan_ids = set()
    for _ in range(5):
        payload = _post(client, "URGENT: Act now, this offer expires today.").json()
        assert SCAN_ID_RE.fullmatch(payload["scan_id"])
        scan_ids.add(payload["scan_id"])
        analyzed_at = datetime.fromisoformat(payload["analyzed_at"])
        assert analyzed_at.tzinfo is not None

    assert len(scan_ids) == 5


def test_identical_input_produces_identical_analysis(client: TestClient) -> None:
    first = _post(client, BANK_OTP_MESSAGE).json()
    second = _post(client, BANK_OTP_MESSAGE).json()

    assert first["scan_id"] != second["scan_id"]
    comparable_keys = RESPONSE_KEYS - {"scan_id", "analyzed_at"}
    for key in comparable_keys:
        assert first[key] == second[key]


def test_score_is_capped_at_100_with_a_transparent_raw_total(
    client: TestClient,
) -> None:
    payload = _post(client, CAP_MESSAGE).json()

    assert payload["risk_score"] == 100
    assert payload["risk_level"] == "critical"
    assert payload["scoring"]["raw_total"] == CAPPED_RAW_TOTAL
    assert payload["scoring"]["raw_total"] > 100
    assert payload["scoring"]["applied_total"] == 100
    assert payload["scoring"]["capped"] is True
    assert sum(
        item["points"] for item in payload["scoring"]["contributions"]
    ) == CAPPED_RAW_TOTAL
    _assert_scoring_is_consistent(payload)


def test_language_is_normalized_and_unsupported_language_is_partial(
    client: TestClient,
) -> None:
    supported = _post(client, "Hi, see you at 3 pm.", language="EN-in").json()
    assert supported["language"] == "en-in"
    assert supported["status"] == "completed"

    partial = _post(
        client,
        "आपका खाता बंद हो जाएगा। तुरंत संपर्क करें।",
        language="hi",
    ).json()
    assert partial["status"] == "partial"
    assert any("language 'hi'" in note for note in partial["limitations"]["notes"])


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"type": "text", "content": "hello"},
        {"type": "text", "language": "en"},
        {"type": "url", "content": "https://example.com", "language": "en"},
        {"type": "text", "content": "", "language": "en"},
        {"type": "text", "content": "   ", "language": "en"},
        {"type": "text", "content": 123, "language": "en"},
        {"type": "text", "content": "hello", "language": "english!"},
        {"type": "text", "content": "hello", "language": 42},
        {
            "type": "text",
            "content": "hello",
            "language": "en",
            "extra": "not-allowed",
        },
    ],
)
def test_invalid_requests_return_the_validation_envelope(
    client: TestClient, payload: dict
) -> None:
    response = client.post(ANALYZE_URL, json=payload)

    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "validation_error"
    assert body["error"]["message"] == "Request validation failed."
    assert body["error"]["details"]
    assert body["request_id"] == response.headers["x-request-id"]
    assert "Traceback" not in response.text


def test_content_longer_than_schema_limit_is_rejected(
    large_client: TestClient,
) -> None:
    response = _post(large_client, "a" * 5001)

    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "validation_error"
    assert any(
        detail["field"] == "body.content" for detail in body["error"]["details"]
    )


def test_malformed_json_is_rejected_without_reflection(
    client: TestClient,
) -> None:
    response = client.post(
        ANALYZE_URL,
        content=b'{"type": "text", "content": ',
        headers={"Content-Type": "application/json"},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    assert "Traceback" not in response.text


def test_scoring_boundaries_are_exact() -> None:
    assert risk_level_for_score(0).value == "low"
    assert risk_level_for_score(14).value == "low"
    assert risk_level_for_score(15).value == "moderate"
    assert risk_level_for_score(39).value == "moderate"
    assert risk_level_for_score(40).value == "high"
    assert risk_level_for_score(69).value == "high"
    assert risk_level_for_score(70).value == "critical"
    assert risk_level_for_score(100).value == "critical"


@pytest.mark.parametrize("score", [-1, 101])
def test_out_of_range_scores_are_programming_errors(score: int) -> None:
    with pytest.raises(ValueError):
        risk_level_for_score(score)


@pytest.mark.parametrize("score", [True, "50", 50.0])
def test_non_integer_scores_are_programming_errors(score: object) -> None:
    with pytest.raises(TypeError):
        risk_level_for_score(score)  # type: ignore[arg-type]


def test_empty_findings_produce_a_low_zero_score() -> None:
    assessment = assess_findings([])

    assert assessment.score == 0
    assert assessment.level.value == "low"
    assert assessment.category.value == "none"
    assert assessment.scoring.raw_total == 0
    assert assessment.scoring.contributions == []
    assert assessment.scoring.capped is False


def test_detection_is_deterministic_and_every_excerpt_is_literal() -> None:
    first = detect_findings(BANK_OTP_MESSAGE)
    second = detect_findings(BANK_OTP_MESSAGE)

    first_shape = [
        (finding.signal.code, finding.signal.evidence, finding.points)
        for finding in first
    ]
    second_shape = [
        (finding.signal.code, finding.signal.evidence, finding.points)
        for finding in second
    ]
    assert first_shape == second_shape

    for finding in first:
        for excerpt in finding.signal.evidence:
            assert excerpt in BANK_OTP_MESSAGE
        assert finding.signal.rule is not None
        assert finding.signal.rule.version == "1.0.0"


def test_openapi_documents_the_implemented_endpoint(client: TestClient) -> None:
    spec = client.get("/openapi.json").json()
    operation = spec["paths"][ANALYZE_URL]["post"]

    assert operation["summary"] == "Analyse a text message for scam indicators"
    assert operation["requestBody"]["content"]["application/json"]["schema"][
        "$ref"
    ].endswith("/TextAnalysisRequest")

    request_schema = spec["components"]["schemas"]["TextAnalysisRequest"]
    assert set(request_schema["required"]) == {"type", "content", "language"}
    assert request_schema["additionalProperties"] is False
    assert request_schema["properties"]["type"]["const"] == "text"

    responses = operation["responses"]
    assert responses["200"]["content"]["application/json"]["schema"][
        "$ref"
    ].endswith("/TextAnalysisResponse")
    assert responses["422"]["content"]["application/json"]["schema"][
        "$ref"
    ].endswith("/APIErrorResponse")


def test_openapi_ui_is_served(client: TestClient) -> None:
    response = client.get("/docs")

    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "swagger" in response.text.lower()


def test_request_schema_rejects_extra_fields_and_type_coercion() -> None:
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        TextAnalysisRequest(
            type="text",
            content="hello",
            language="en",
            extra="nope",  # type: ignore[call-arg]
        )

    with pytest.raises(ValidationError):
        TextAnalysisRequest(
            type="text",
            content=123,  # type: ignore[arg-type]
            language="en",
        )
