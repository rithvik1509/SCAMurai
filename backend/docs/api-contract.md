# SCAMurai API contract

**Version:** 0.1.0 (text analysis)
**Base URL (local):** `http://127.0.0.1:8000`
**Content type:** `application/json`

This document reflects what is implemented **today**. `GET /health` and
`POST /api/v1/analyze` are live. The crypto, intent, and rescue endpoints are
reserved; see [Reserved endpoints](#reserved-endpoints).

---

## Conventions

- API responses are JSON, including application errors. One exception: a
  CORS preflight from a disallowed origin is rejected by middleware with a
  plain `400` before routing (and still carries `X-Request-ID`).
- Every response carries `X-Request-ID`. Clients may send their own value in
  `X-Request-ID`; it is accepted only when it matches
  `^[A-Za-z0-9._-]{8,64}$`. Otherwise the server generates a new id.
- The server never claims that fraud or theft is proven, and no endpoint
  returns a random or pseudo-probabilistic risk score.
- Limitation notes are part of an analysis response, not optional decoration.
- Text analysis is deterministic: the same input always produces the same
  score, category, signals, evidence, and ordering. Only `scan_id` and
  `analyzed_at` differ between identical requests.

---

## `GET /health`

Liveness probe. Performs no external calls and exposes no configuration
secrets.

### Response `200 OK`

```json
{
  "service": "scamurai-backend",
  "status": "ok",
  "version": "0.1.0",
  "environment": "development",
  "timestamp": "2026-10-23T06:30:00.123456Z"
}
```

| Field | Type | Notes |
|---|---|---|
| `service` | string | Stable service identifier |
| `status` | `ServiceStatus` | `ok` (or `degraded` in future checks) |
| `version` | string | Application version |
| `environment` | `Environment` | `development`, `test`, `production` |
| `timestamp` | RFC 3339 datetime | UTC, timezone-aware |

Headers:

```
Content-Type: application/json
X-Request-ID: 3f2a1c9d8b7e4a6c9f0d2e5a1b3c4d6e
```

---

## `POST /api/v1/analyze`

Analyses a plain-text message with a fixed, deterministic rule baseline
(`scam_text_rules` v1.0.0). Each signal quotes exact excerpts of the submitted
text. The endpoint makes no network request, uses no LLM or database, stores
nothing, and does not echo the whole message back.

### Request

```json
{
  "type": "text",
  "content": "URGENT: Dear customer, your SBI account will be blocked in 24 hours. Your KYC has expired. Share the OTP sent to your phone with our officer immediately to reactivate your account.",
  "language": "en"
}
```

| Field | Type | Rules |
|---|---|---|
| `type` | string | Must be exactly `"text"`. Other input kinds are not implemented. |
| `content` | string | 1–5000 characters after trimming; whitespace-only is rejected. |
| `language` | string | BCP 47-style tag: 2–3 letter primary subtag plus optional `-` subtags, e.g. `en`, `en-IN`, `hi`. Normalized to lower case. |

Validation is strict: unknown fields are rejected and values are not coerced
(`"123"` is not accepted for an integer, `123` is not accepted for a string).
The overall HTTP body is still bounded by `MAX_REQUEST_BYTES` (default 64 KiB);
an oversized body receives `413 payload_too_large` before routing.

### Response `200 OK`

```json
{
  "scan_id": "scan_a7fc71e2bedf4410983b1012a2911344",
  "type": "text",
  "language": "en",
  "status": "completed",
  "analyzed_at": "2026-10-23T08:29:29.762056Z",
  "risk_score": 86,
  "risk_level": "critical",
  "category": "otp_theft",
  "summary": "4 scam indicators detected. The strongest is \"One-time password (OTP) disclosure request\" (critical). Risk score 86/100 (critical); dominant category 'otp_theft'. Indicators are not proof of fraud, so verify independently before acting.",
  "signals": [
    {
      "code": "otp_disclosure_request",
      "title": "One-time password (OTP) disclosure request",
      "explanation": "The message asks you to share, send, or read out an OTP or verification code. These codes authorize transactions and account changes. No legitimate bank or service needs you to disclose one.",
      "severity": "critical",
      "source": "message_text",
      "evidence": ["Share the OTP"],
      "rule": {
        "rule_id": "otp_disclosure_request",
        "rule_set": "scam_text_rules",
        "version": "1.0.0"
      }
    },
    {
      "code": "bank_account_threat",
      "title": "Threat that a bank account will be blocked",
      "explanation": "The message says an account or card will be blocked, frozen, or closed. This is a common pressure tactic. Banks do not resolve account problems through unsolicited messages that demand immediate action.",
      "severity": "high",
      "source": "message_text",
      "evidence": ["account will be blocked"],
      "rule": {
        "rule_id": "bank_account_threat",
        "rule_set": "scam_text_rules",
        "version": "1.0.0"
      }
    },
    {
      "code": "kyc_update_demand",
      "title": "KYC update or verification demand",
      "explanation": "The message asks for KYC, PAN, or Aadhaar verification, often with a threat that service will stop. Verify KYC status only inside an official banking app or at a branch; never through a link or contact supplied in an unexpected message.",
      "severity": "high",
      "source": "message_text",
      "evidence": ["KYC has expired"],
      "rule": {
        "rule_id": "kyc_update_demand",
        "rule_set": "scam_text_rules",
        "version": "1.0.0"
      }
    },
    {
      "code": "urgency_pressure",
      "title": "Urgency or deadline pressure",
      "explanation": "The message pushes for immediate action or a short deadline. Legitimate organizations normally allow time to verify an unexpected request through independent channels.",
      "severity": "medium",
      "source": "message_text",
      "evidence": ["URGENT", "immediately"],
      "rule": {
        "rule_id": "urgency_pressure",
        "rule_set": "scam_text_rules",
        "version": "1.0.0"
      }
    }
  ],
  "recommended_actions": [
    {
      "priority": 1,
      "action": "Do not share the code, password, or recovery phrase.",
      "rationale": "These values can authorize transactions or hand over a wallet. A legitimate organization will not ask you to disclose them."
    },
    {
      "priority": 2,
      "action": "If you already shared it, contact your bank or wallet provider immediately using an official number.",
      "rationale": "Fast reporting gives the provider a chance to block access or revoke approvals."
    },
    {
      "priority": 3,
      "action": "Verify the sender independently before acting.",
      "rationale": "Use a phone number, app, or website you locate yourself. Do not rely on contact details supplied in the message."
    }
  ],
  "limitations": {
    "notes": [
      "This analysis inspects the message text only. It does not verify the sender, fetch links, inspect attachments, or confirm that any organization named in the message is genuine.",
      "The risk score reflects matches against a fixed rule list. It is not a probability and cannot prove that a message is fraudulent or that it is safe."
    ]
  },
  "scoring": {
    "method": "weighted_rule_sum",
    "raw_total": 86,
    "applied_total": 86,
    "capped": false,
    "contributions": [
      {
        "code": "otp_disclosure_request",
        "category": "otp_theft",
        "points": 32
      },
      {
        "code": "bank_account_threat",
        "category": "bank_kyc_impersonation",
        "points": 22
      },
      {
        "code": "kyc_update_demand",
        "category": "bank_kyc_impersonation",
        "points": 20
      },
      {
        "code": "urgency_pressure",
        "category": "urgency_pressure",
        "points": 12
      }
    ]
  }
}
```

The example above is abbreviated in `recommended_actions` for readability;
the real response may contain more ordered actions. All other fields are
shown exactly as returned.

### Response fields

| Field | Type | Notes |
|---|---|---|
| `scan_id` | string | `^scan_[0-9a-f]{32}$`; unique per request, not stored |
| `type` | string | Always `"text"` |
| `language` | string | Normalized request language |
| `status` | `AnalysisStatus` | `completed`, or `partial` for a language outside the English-first rule baseline |
| `analyzed_at` | RFC 3339 datetime | UTC, timezone-aware |
| `risk_score` | integer | 0–100; capped sum of rule weights |
| `risk_level` | `RiskLevel` | `low`, `moderate`, `high`, `critical` for this endpoint |
| `category` | `ScamCategory` | Category of the highest-weight finding, or `none` |
| `summary` | string | Deterministic, non-accusatory summary |
| `signals` | `Signal[]` | Ordered by descending points, then fixed precedence |
| `recommended_actions` | `RecommendedAction[]` | Ordered by ascending priority, deduplicated, ≤ 10 |
| `limitations` | `AnalysisLimitations` | Always present |
| `scoring` | `ScoringBreakdown` | Shows the arithmetic behind `risk_score` |

---

## Detection rules

Rules are regular-expression checks with a negation guard. If a negation such
as "never", "do not", "avoid", or "without" appears in the clause before a
match or inside the matched excerpt, the rule is skipped. This prevents an
advisory like "Never share your OTP" from being reported as an OTP request.

Each rule contributes **at most one signal** per request, regardless of how
many times it matches.

| Rule id | Category | Severity | Points | Detects |
|---|---|---|---|---|
| `urgency_pressure` | `urgency_pressure` | medium | 12 | Urgency words, short deadlines, "last chance", "expires today" |
| `bank_account_threat` | `bank_kyc_impersonation` | high | 22 | Account/card "will be blocked", suspended, frozen, closed |
| `kyc_update_demand` | `bank_kyc_impersonation` | high | 20 | KYC/PAN/Aadhaar update, verification, linking, expiry |
| `otp_disclosure_request` | `otp_theft` | critical | 32 | OTP/verification code paired with share, send, tell, forward, read, disclose |
| `government_agency_impersonation` | `government_impersonation` | high | 22 | Agency claim (income tax, CBI, police, customs, …) paired with a case, notice, arrest, penalty, or demand |
| `legal_action_threat` | `government_impersonation` | high | 18 | Arrest warrant, legal action, prosecution, court notice, registered case |
| `crypto_reward_claim` | `crypto_reward` | high | 24 | Free crypto/reward/airdrop, connect wallet, double your crypto |
| `seed_phrase_request` | `crypto_reward` | critical | 40 | Seed/recovery phrase or private key paired with a disclosure request |
| `payment_demand` | `payment_demand` | high | 20 | Upfront/processing fee, money transfer, gift card, crypto/UPI payment, payment link, QR |
| `guaranteed_returns` | `investment_scheme` | high | 26 | Guaranteed, assured, fixed, or risk-free returns; double your money |
| `unrealistic_return_rate` | `investment_scheme` | high | 22 | High percentage returns, "X% in N days", large daily payouts |

Evidence rules:

- Every `evidence` item is a **literal substring** of the submitted `content`.
- An excerpt is at most 300 characters; over-long matches are cut at a word
  boundary, never rewritten or paraphrased.
- A signal carries at most 5 excerpts.
- `rule.rule_id` equals the signal `code`; `rule.rule_set` is
  `scam_text_rules`; `rule.version` is `1.0.0`.

---

## Risk scoring

```
raw_total = sum(points of each matched rule)      # each rule at most once
risk_score = min(100, raw_total)
```

`scoring.raw_total` is the uncapped sum, `scoring.applied_total` equals
`risk_score`, and `scoring.capped` is true only when the cap changed the
total. `scoring.contributions` lists every matched rule and its points in the
same order as `signals`.

| `risk_score` range | `risk_level` |
|---|---|
| 0–14 | `low` |
| 15–39 | `moderate` |
| 40–69 | `high` |
| 70–100 | `critical` |

The dominant `category` is the category of the highest-point finding. Ties are
resolved by this fixed order, earlier first:

```
otp_theft > crypto_reward > bank_kyc_impersonation >
government_impersonation > payment_demand > investment_scheme >
urgency_pressure
```

If no rule matches, `risk_score` is `0`, `risk_level` is `low`, `category` is
`none`, and `signals` is empty. The `unknown` risk level remains reserved for
future analyses that have no usable evidence at all; it is not emitted by this
endpoint.

The score is a rule-derived indicator, **not** a probability. A high score
means "pause and verify", not "fraud is proven". Conversely, a low score does
not certify a message as legitimate, which is stated in `limitations`.

---

## Analysis status and limitations

`status` is `completed` when the declared language has an English primary
subtag (`en`, `en-IN`, …). For other declared languages the rules still run,
but `status` is `partial` and `limitations.notes` says coverage may be
incomplete because the baseline is English-first.

Every response includes the first two notes below; the remaining notes appear
when their condition applies:

- analysis is text-only: the sender is not verified, links are not fetched,
  attachments are not inspected, and named organizations are not confirmed;
- the score is an indicator derived from a fixed rule list, not a probability;
- for short messages, limited context may hide indicators;
- when no rule matches, that does **not** guarantee the message is legitimate.

---

## Error envelope

Every application `4xx`/`5xx` response uses this shape.

```json
{
  "error": {
    "code": "validation_error",
    "message": "Request validation failed.",
    "details": [
      {
        "field": "body.content",
        "reason": "String should have at least 1 character",
        "type": "string_too_short"
      }
    ]
  },
  "request_id": "3f2a1c9d8b7e4a6c9f0d2e5a1b3c4d6e"
}
```

| Field | Type | Notes |
|---|---|---|
| `error.code` | `ErrorCode` | Stable, machine-readable |
| `error.message` | string | Safe for display; never contains internals |
| `error.details` | `APIErrorDetail[]` | May be empty; never echoes submitted values |
| `request_id` | string | Same value as the `X-Request-ID` header |

### Error codes

| HTTP | `code` | When |
|---|---|---|
| 400 | `bad_request` | Malformed application request (disallowed CORS preflight is plain text) |
| 404 | `not_found` | Unknown path |
| 405 | `method_not_allowed` | Wrong method for an existing path |
| 413 | `payload_too_large` | Body exceeds `MAX_REQUEST_BYTES` |
| 415 | `unsupported_media_type` | Unsupported content type |
| 422 | `validation_error` | Schema/type validation failed (including malformed JSON) |
| 429 | `rate_limited` | Reserved; no rate limiting is implemented yet |
| 500 | `internal_error` | Unexpected server failure (no details exposed) |
| other | `http_error` | Fallback for other raised HTTP errors |

`4xx` error messages may use the raised HTTP reason phrase. All `5xx` messages
are generic: `"An unexpected error occurred."`. Stack traces and exception
text are logged server-side only.

### Validation details

`field` uses Pydantic locations joined with dots (`body.content`,
`query.page`). `reason` is the Pydantic message, `type` is the Pydantic error
type (`missing`, `extra_forbidden`, `string_too_long`, …). The submitted input
is deliberately excluded because messages can contain sensitive text.

---

## Shared enums

| Enum | Values | Meaning |
|---|---|---|
| `Environment` | `development`, `test`, `production` | Deployment context |
| `ServiceStatus` | `ok`, `degraded` | Process health |
| `AnalysisStatus` | `completed`, `partial` | How complete an analysis is |
| `Severity` | `info`, `low`, `medium`, `high`, `critical` | Strength of one signal |
| `RiskLevel` | `unknown`, `low`, `moderate`, `high`, `critical` | Rule-derived aggregate indicator; `unknown` means evidence is insufficient |
| `ScamCategory` | `none`, `urgency_pressure`, `bank_kyc_impersonation`, `otp_theft`, `government_impersonation`, `crypto_reward`, `payment_demand`, `investment_scheme` | Message-pattern family |
| `EvidenceSource` | `message_text`, `url_static`, `decoded_calldata`, `trusted_metadata`, `user_context`, `model_output` | Provenance of facts |

`RiskLevel` describes **indicators**, not proof. An unlimited approval, for
example, is a risk indicator that warrants verification.

---

## Shared schemas

### `RuleProvenance`

```json
{
  "rule_id": "otp_disclosure_request",
  "rule_set": "scam_text_rules",
  "version": "1.0.0"
}
```

| Field | Type | Constraints |
|---|---|---|
| `rule_id` | string | `^[a-z][a-z0-9_]{1,63}$` |
| `rule_set` | string | 1–200 chars |
| `version` | string | 1–200 chars |

### `Signal`

One evidence-backed finding. A signal is not proof of fraud.

```json
{
  "code": "otp_disclosure_request",
  "title": "One-time password (OTP) disclosure request",
  "explanation": "The message asks you to share, send, or read out an OTP or verification code. These codes authorize transactions and account changes. No legitimate bank or service needs you to disclose one.",
  "severity": "critical",
  "source": "message_text",
  "evidence": ["Share the OTP"],
  "rule": {
    "rule_id": "otp_disclosure_request",
    "rule_set": "scam_text_rules",
    "version": "1.0.0"
  }
}
```

| Field | Type | Constraints |
|---|---|---|
| `code` | string | `^[a-z][a-z0-9_]{1,63}$` |
| `title` | string | 1–200 chars |
| `explanation` | string | 1–2000 chars |
| `severity` | `Severity` | — |
| `source` | `EvidenceSource` | — |
| `evidence` | string[] | ≤ 20 items, each 1–500 chars |
| `rule` | `RuleProvenance \| null` | Present for baseline rules; may be null for future decoded/model signals |

### `ScoringBreakdown`

```json
{
  "method": "weighted_rule_sum",
  "raw_total": 86,
  "applied_total": 86,
  "capped": false,
  "contributions": [
    {
      "code": "otp_disclosure_request",
      "category": "otp_theft",
      "points": 32
    }
  ]
}
```

| Field | Type | Constraints |
|---|---|---|
| `method` | string | Always `weighted_rule_sum` |
| `raw_total` | integer | ≥ 0 |
| `applied_total` | integer | 0–100 |
| `capped` | boolean | True when `raw_total > 100` |
| `contributions` | `ScoreContribution[]` | ≤ 50, each `points` 1–100 |

### `RecommendedAction`

```json
{
  "priority": 1,
  "action": "Do not share the code, password, or recovery phrase.",
  "rationale": "These values can authorize transactions or hand over a wallet. A legitimate organization will not ask you to disclose them."
}
```

`priority` is 1–20; lower numbers should be read first. Actions are
non-executing and never ask for private keys, seed phrases, or OTPs.

### `AnalysisLimitations`

```json
{
  "notes": [
    "This analysis inspects the message text only. It does not verify the sender, fetch links, inspect attachments, or confirm that any organization named in the message is genuine.",
    "The risk score reflects matches against a fixed rule list. It is not a probability and cannot prove that a message is fraudulent or that it is safe."
  ]
}
```

`notes` is capped at 20 entries, each 1–2000 characters. Missing metadata,
unverified URLs, and undecoded calldata must be reported here.

### Validation strictness

- **Request** bodies use `StrictRequestModel`: unknown fields rejected, no
  type coercion, strings trimmed.
- **Response** models use `APIModel`: unknown fields rejected.
- The backend does no coercion of submitted messages into transaction facts.

---

## Request limits, CORS, and privacy

- **Body size:** `MAX_REQUEST_BYTES` (default `65536`, allowed 1024–10485760).
  Oversized bodies get `413 payload_too_large` before routing.
- **CORS:** origins come from `CORS_ALLOWED_ORIGINS` (comma-separated). A
  wildcard is rejected at startup. Credentials are enabled only for those
  explicit origins. Allowed methods: `GET`, `POST`, `OPTIONS`. Exposed header:
  `X-Request-ID`.
- **No outbound calls.** Text analysis never fetches user-submitted URLs and
  makes no reputation lookup. Adding any outbound call requires a separate,
  bounded design with configured timeouts.
- **No storage.** The submitted message is not persisted and is not written to
  logs; request logs contain only method, path, status, duration, and request
  id.
- **No LLM.** The baseline is entirely deterministic and works offline. Any
  future AI explanation must be validated against decoded facts and may not
  replace rule evidence.

---

## Reserved endpoints

These paths are part of the product scope but are **not implemented**. No
routes are registered, so requests currently receive `404 not_found`. Their
contracts will be documented when implemented.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/v1/crypto/analyze` | Decode a financial/blockchain instruction |
| `POST` | `/api/v1/intent/compare` | Promise vs. Action comparison |
| `POST` | `/api/v1/rescue` | Post-incident, non-executing guidance |

Non-negotiable constraints for those endpoints:

- Deterministic rules are the baseline; the API must work without an LLM.
- AI output, if enabled, is validated and may not invent or override decoded
  facts; fallback to rules is required.
- Token symbols, decimals, and address identities are never inferred without a
  trusted source.
- The API never signs, broadcasts, or executes transactions and never accepts
  private keys, seed phrases, or OTPs.
