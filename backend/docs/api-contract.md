# SCAMurai API contract

**Version:** 0.1.0 (text and static link analysis)
**Base URL (local):** `http://127.0.0.1:8000`
**Content type:** `application/json`

This document reflects what is implemented **today**. `GET /health` and
`POST /api/v1/analyze` are live; the latter combines message-text rules with
static link inspection. The crypto, intent, and rescue endpoints are reserved;
see [Reserved endpoints](#reserved-endpoints).

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
- Text and link analysis are deterministic: the same input always produces
  the same score, category, signals, evidence, and ordering. Only `scan_id`
  and `analyzed_at` differ between identical requests.
- Links are inspected **statically only**. No URL is opened, fetched,
  resolved, pinged, crawled, or looked up in a reputation service.

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
(`scam_text_rules` v1.0.0) and inspects any links it contains with a static
link baseline (`url_static_rules` v1.0.0). Both sources feed one signal list
and one risk score. Each signal quotes exact excerpts of the submitted text.
The endpoint makes no network request, uses no LLM or database, stores nothing,
and does not echo the whole message back.

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
| `content` | string | 1–5000 characters after trimming; whitespace-only is rejected. A message, a single link, or text containing several links are all accepted. |
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
      "This analysis inspects only the submitted text and any links inside it. It does not verify the sender, fetch links, inspect attachments, or confirm that any organization named in the message is genuine.",
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
| `signals` | `Signal[]` | Text and link findings, ordered by descending points, then fixed precedence |
| `recommended_actions` | `RecommendedAction[]` | Ordered by ascending priority, deduplicated, ≤ 10 |
| `limitations` | `AnalysisLimitations` | Always present |
| `scoring` | `ScoringBreakdown` | Shows the arithmetic behind `risk_score` |

---

## Text detection rules

Rules are regular-expression checks with three conservative guards:

- **Negation.** If "never", "do not", "avoid", or "without" appears in the
  clause before a match or inside the excerpt, the rule is skipped. "Never
  share your OTP" is therefore not an OTP request.
- **Educational context.** A match preceded by "scammers", "fraudsters",
  "phishing", "how to", "guide", or a hypothetical such as "if someone asks
  you to…" is treated as describing a scam, not performing one.
- **Benign context.** A small number of rules ignore documented phrasing such
  as "at your request" or "I will pay…" so ordinary conversation is not
  reported as a demand.

Text matching excludes URL spans, so a path such as `/kyc-update` is handled
by link analysis rather than being counted again as message text.

Each rule contributes **at most one signal** per request, regardless of how
many times it matches.

| Rule id | Category | Severity | Points | Detects |
|---|---|---|---|---|
| `urgency_pressure` | `urgency_pressure` | medium | 12 | Urgency words, short deadlines, "last chance", "expires today" |
| `bank_account_threat` | `bank_kyc_impersonation` | high | 22 | Account/card blocked, suspended, frozen, locked, restricted, closed |
| `kyc_update_demand` | `bank_kyc_impersonation` | high | 20 | KYC/PAN/Aadhaar update, verification, linking, disclosure, expiry |
| `otp_disclosure_request` | `otp_theft` | critical | 32 | OTP/verification code paired with share, send, tell, forward, read, disclose (including a "Share it" follow-up sentence) |
| `government_agency_impersonation` | `government_impersonation` | high | 22 | Agency claim (income tax, CBI, police, customs, …) or claimed officer, paired with a case, notice, arrest, penalty, or demand |
| `legal_action_threat` | `government_impersonation` | high | 18 | Arrest warrant, legal action, prosecution, court notice, registered case, filed FIR/complaint |
| `crypto_reward_claim` | `crypto_reward` | high | 24 | Free crypto/reward/airdrop/NFT, connect wallet, double your crypto |
| `seed_phrase_request` | `crypto_reward` | critical | 40 | Seed/recovery phrase or private key paired with a disclosure request |
| `payment_demand` | `payment_demand` | high | 20 | Upfront/processing fee, money transfer, gift card purchase, crypto/UPI payment, payment link, QR |
| `guaranteed_returns` | `investment_scheme` | high | 26 | Guaranteed, assured, fixed, or risk-free returns; double your money |
| `unrealistic_return_rate` | `investment_scheme` | high | 22 | Percentage returns (1–4 digits), "X% in N days", guaranteed daily/weekly earnings |

Evidence rules:

- Every `evidence` item is a **literal substring** of the submitted `content`.
- An excerpt is at most 300 characters; over-long matches are cut at a word
  boundary, never rewritten or paraphrased.
- A signal carries at most 5 excerpts.
- `rule.rule_id` equals the signal `code`; `rule.rule_set` is
  `scam_text_rules`; `rule.version` is `1.0.0`.

---

## Static link analysis

The endpoint extracts links from `content` and inspects their structure only.
Supported forms are:

- absolute `http://` and `https://` URLs;
- `www.` hostnames;
- bare hostnames with a 2–24 letter alphabetic TLD, optional port and path,
  for example `example.com/login`; an IP host normally arrives with a
  scheme, for example `http://192.168.1.10:8080/admin`;
- `javascript:`, `vbscript:`, `data:`, and `file:` schemes for the dangerous
  scheme check.

Email addresses (`user@example.com`) are not extracted as links. Overlapping
matches are merged, duplicates are collapsed, and at most **10 unique links**
are analysed per request. Additional links are not inspected, and a limitation
note says so. Text evidence continues to be evaluated across the whole
message.

| Rule id | Severity | Points | Detects |
|---|---|---|---|
| `url_dangerous_scheme` | high | 20 | `javascript:`, `vbscript:`, `data:`, or `file:` link schemes |
| `url_at_userinfo` | high | 20 | An `@` in the authority, where the text before `@` is user information rather than the host |
| `url_ip_host` | high | 18 | IPv4/IPv6 address used as the host |
| `url_punycode_host` | high | 18 | Any hostname label beginning with `xn--` |
| `url_misleading_host` | high | 16 | Brand-like label in a subdomain; or a security-related subdomain label that is hyphenated, sits under a suspicious TLD, or appears in a five-plus-label host |
| `url_sensitive_path` | medium | 14 (or 0 when corroborated) | OTP, one-time-password, verification-code, verify-account, KYC, Aadhaar, PAN, wallet, seed, mnemonic, private-key, unlock, reactivate, claim, airdrop, reward, bonus, or giveaway in the path/query |
| `url_malformed` | medium | 10 | Missing host, invalid port, invalid numeric IPv4, or single-label non-local host |
| `url_obfuscated` | medium | 10 | Six or more percent-escapes, `%00`, or double-encoded `%25xx` |
| `url_embedded_redirect` | medium | 10 | A redirect-style query parameter containing a different absolute URL |
| `url_insecure_scheme` | low | 6 | Explicit `http://` rather than `https://` |
| `url_unusually_long` | low | 6 | Raw link longer than 200 characters |

Link evidence is the raw extracted link, clipped to 300 characters. Each URL
rule contributes at most one signal, with at most 5 links as evidence. Link
signals use `source: "url_static"`, category `suspicious_url`, and provenance
`rule_set: "url_static_rules"`, `version: "1.0.0"`.

### Combining text and link findings

Text rules do not inspect URL spans. When **every** credential, KYC, wallet,
or account theme in a link path is already evidenced by a related text rule,
the link signal is still reported for transparency but contributes **0**
points. A different theme in the same path keeps its points because it is a
distinct indicator. This is the only cross-source discount and prevents the
same theme from being counted twice. `scoring.contributions` includes that
0-point entry.

A link indicator is not proof that a link is malicious. The API does not claim
to verify a domain's ownership, reputation, destination, or legitimacy, and it
does not claim that one suspicious trait means fraud.

### Link-only example

Request:

```json
{
  "type": "text",
  "content": "https://paypal.com.security-check.xyz/otp",
  "language": "en"
}
```

Response excerpt (omitting `scan_id`, `analyzed_at`, advice, and limitations):

```json
{
  "type": "text",
  "language": "en",
  "status": "completed",
  "risk_score": 30,
  "risk_level": "moderate",
  "category": "suspicious_url",
  "signals": [
    {
      "code": "url_misleading_host",
      "title": "Link has a misleading hostname structure",
      "explanation": "A brand-like or security-related label appears in a subdomain, or the host is unusually deep. Subdomains are easy to create and do not establish who owns or operates the destination. Ownership was not verified.",
      "severity": "high",
      "source": "url_static",
      "evidence": ["https://paypal.com.security-check.xyz/otp"],
      "rule": {
        "rule_id": "url_misleading_host",
        "rule_set": "url_static_rules",
        "version": "1.0.0"
      }
    },
    {
      "code": "url_sensitive_path",
      "title": "Link path contains credential or reward terms",
      "explanation": "The URL path or query mentions OTP, KYC, identity, wallet, or reward terms. Legitimate services also use such paths, so this is a review indicator, not proof. The page behind the link was not opened.",
      "severity": "medium",
      "source": "url_static",
      "evidence": ["https://paypal.com.security-check.xyz/otp"],
      "rule": {
        "rule_id": "url_sensitive_path",
        "rule_set": "url_static_rules",
        "version": "1.0.0"
      }
    }
  ],
  "scoring": {
    "method": "weighted_rule_sum",
    "raw_total": 30,
    "applied_total": 30,
    "capped": false,
    "contributions": [
      {"code": "url_misleading_host", "category": "suspicious_url", "points": 16},
      {"code": "url_sensitive_path", "category": "suspicious_url", "points": 14}
    ]
  }
}
```

---

## Risk scoring

```
raw_total = sum(points of each matched text or link rule)   # each rule once
risk_score = min(100, raw_total)
```

`scoring.raw_total` is the uncapped sum, `scoring.applied_total` equals
`risk_score`, and `scoring.capped` is true only when the cap changed the
total. `scoring.contributions` lists every matched rule and its points in the
same order as `signals`. A corroborating `url_sensitive_path` appears with
`points: 0`.

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
urgency_pressure > suspicious_url
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
subtag (`en`, `en-IN`, …). For other declared languages the text and link
rules still run, but `status` is `partial` and `limitations.notes` says
coverage may be incomplete because the baseline is English-first.

Every response includes the first two notes below; the remaining notes appear
when their condition applies:

- the analysis sees only the submitted text and links inside it: the sender
  is not verified, links are not fetched, attachments are not inspected, and
  named organizations are not confirmed;
- the score is an indicator derived from a fixed rule list, not a probability;
- when links are present, the count inspected is reported, together with the
  statement that no URL was opened, resolved, crawled, or fetched and that no
  ownership or reputation check was made;
- when more than 10 unique links are present, only the first 10 were analysed;
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
| `ScamCategory` | `none`, `urgency_pressure`, `bank_kyc_impersonation`, `otp_theft`, `government_impersonation`, `crypto_reward`, `payment_demand`, `investment_scheme`, `suspicious_url` | Message-pattern or link-structure family |
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
| `contributions` | `ScoreContribution[]` | ≤ 50, each `points` 0–100; 0 marks a corroborating link-path finding |

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
    "This analysis inspects only the submitted text and any links inside it. It does not verify the sender, fetch links, inspect attachments, or confirm that any organization named in the message is genuine.",
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
- **No outbound calls.** Link analysis parses text only. It never fetches,
  opens, resolves, pings, or crawls a user-submitted URL, performs no DNS
  lookup, and makes no reputation lookup. Adding any outbound call requires a
  separate, bounded design with configured timeouts.
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
