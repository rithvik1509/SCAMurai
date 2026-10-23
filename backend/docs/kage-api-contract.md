# KAGE YŌKAI API Contract

**Version:** 0.1.0 (controlled browser comparison MVP)  
**Base URL:** `http://127.0.0.1:8000`  
**Content type:** `application/json`

YŌKAI is the website investigation engine under KAGE. It runs real isolated Chromium contexts for explicitly authorized targets, collects structural evidence, then compares browser observations. Different behavior is not proof of maliciousness.

## Security Scope

- Only absolute HTTP/HTTPS URLs without embedded credentials are accepted.
- External target origins must exactly match `YOKAI_ALLOWED_ORIGINS`. It is empty by default, so no public target is enabled until an operator configures it.
- The built-in local demonstration target is restricted to `http://localhost:8000` or `http://127.0.0.1:8000` under `/api/v1/kage/__yokai_fixture__/`.
- Each browser request is intercepted and checked against the authorized target origin. Off-origin requests are blocked and represented without query values.
- DNS names are resolved and non-public resolved addresses are rejected before navigation and rechecked for browser requests. This application-level defense does not eliminate DNS rebinding or time-of-check/time-of-use risks; deployments must enforce network-level egress restrictions.
- Playwright browser contexts are not a hardened malware sandbox. Public website scanning requires container or VM isolation, nonprivileged workers, no host secrets, and network controls.
- Fresh contexts are used per profile. Camera, microphone, geolocation, downloads, and service workers are unavailable. Forms are inspected only; no values are entered and no forms are submitted.
- Query values and URL fragments are redacted in evidence. Do not submit URLs containing secrets.
- Jobs and screenshot bytes live in bounded process memory and expire after `YOKAI_JOB_TTL_SECONDS` (default 900 seconds). They are lost on process restart and are not a durable production job system.
- Maximum worker concurrency defaults to 2; maximum pending queue depth defaults to 12. Both are configurable with validated bounds.

## `GET /api/v1/kage/capabilities`

Returns the profiles and exact origins that the service permits.

```json
{
  "available": true,
  "profiles": ["desktop", "mobile", "returning"],
  "allowedOrigins": ["http://localhost:8000", "http://127.0.0.1:8000"],
  "authorizationPolicy": "Only explicitly configured YOKAI_ALLOWED_ORIGINS and the built-in development fixture path are permitted.",
  "cancellation": false
}
```

The built-in fixture origins are listed for development; only the fixture path prefix is reachable on them. External origins are reported only when configured.

## `GET /api/v1/kage/health`

Reports `available`, `engine`, `browserInstalled`, `workerAcceptingJobs`, configured external origins, and an optional reason. This checks for the local Chromium executable and a running manager; it does not promise that a target is authorized.

## `POST /api/v1/kage/investigations`

Queues a bounded investigation and immediately returns HTTP `202`.

```json
{
  "targetUrl": "http://127.0.0.1:8000/api/v1/kage/__yokai_fixture__/payment",
  "profiles": ["desktop", "mobile"],
  "authorizationConfirmed": true,
  "settings": {
    "timeoutSeconds": 20,
    "captureScreenshots": true,
    "includeNetwork": true
  }
}
```

Profiles must contain 2 or 3 unique values from `desktop`, `mobile`, and `returning`. Timeout is 5–45 seconds. `authorizationConfirmed` must be true. The desktop profile is 1440×900. Mobile is 390×844 with a fixed Android user-agent, touch, and mobile emulation; these are a grouped intervention, not an isolated viewport test. Returning uses the desktop profile with one controlled YOKAI cookie.

Response envelope fields use camelCase to match the SCAMurai frontend. The initial status is `queued`; poll the status endpoint every 1–2 seconds. Do not submit again when a poll fails.

### Status

`queued`, `initializing`, `loading`, `collecting`, `comparing`, then `completed` or `failed`. `cancelled` and `unsupported` are reserved terminal states. Status events are actual worker lifecycle observations, not fabricated percentages.

## `GET /api/v1/kage/investigations/{id}`

Returns the latest job snapshot. Completed snapshots include `result`. Unknown or expired IDs return the shared JSON error envelope with HTTP `404`.

A completed investigation result contains:

- `captures`: one `BrowserCapture` per selected profile, each with stable capture/evidence ID, profile configuration, final URL, title, availability, screenshot reference, redirect chain, headings/link count/language, structural form metadata, and optional network request metadata.
- `findings`: deterministic differences with `id`, `title`, explanation, frontend tone, explicit severity (`informational`, `low`, `medium`, `high`), confidence text, and capture evidence IDs.
- `riskIndicators`, `limitations`, and `recommendations`.
- `graph`: evidence-backed profile, URL, form, and network nodes and edges. Every referenced evidence ID and edge endpoint corresponds to an included capture/node.
- `counterfactuals`: desktop/mobile results are described as correlation because the emulation changes multiple browser properties; desktop/returning compares the controlled cookie change; other profile pairs are inconclusive.

Screenshot bytes are captured as PNG in memory and exposed at the `screenshot.url` on the same API origin. The service returns only structural form data; it never reads entered form values.

## Evidence and Error Examples

A sensitive form difference is reported as a finding, not a verdict:

```json
{
  "id": "forms-mobile",
  "title": "Sensitive form structure differs by profile",
  "explanation": "A form with credential or payment-related fields appears in one capture but not the other, or has a different destination. YOKAI did not fill or submit it. This is security-sensitive evidence to review, not a finding of fraud.",
  "tone": "sensitive",
  "severity": "high",
  "confidence": "High confidence in the observed form structure difference; legitimacy is not established.",
  "evidenceIds": ["capture-desktop", "capture-mobile"]
}
```

All errors use the existing API envelope. Common status codes:

- `403`: authorization was not confirmed, target origin is not allowlisted, or target resolves to a blocked network.
- `404`: investigation or screenshot is missing or expired.
- `409`: evidence is not ready, or cancellation is unsupported.
- `413`: configured global request body limit exceeded.
- `422`: strict request schema validation failed. Submitted values are not echoed.
- `429`: bounded investigation queue is full.
- `503`: worker is shutting down.

## Evidence Endpoints

- `GET /api/v1/kage/investigations/{id}/evidence` returns `BrowserCapture[]`.
- `GET /api/v1/kage/investigations/{id}/comparison` returns `InvestigationResult`.
- `GET /api/v1/kage/investigations/{id}/screenshots/{capture_id}.png` returns a private, inert PNG.
- `POST /api/v1/kage/investigations/{id}/cancel` returns `409`; cancellation is currently not enabled and `capabilities.cancellation` is false.
- `POST /api/v1/kage/investigations/{id}/counterfactual` accepts `{"changedVariable":"mobile_profile"}` or `{"changedVariable":"returning_visitor_cookie"}` after a completed investigation with a desktop baseline. It returns a newly queued `Investigation`; the baseline is repeated in a fresh context and only the named supported profile intervention changes.

## Controlled Local Fixtures

These are synthetic pages served by FastAPI in development/test environments. They do not collect data and are not available when `APP_ENV=production`.

- `/api/v1/kage/__yokai_fixture__/responsive`: responsive layout with no sensitive form.
- `/api/v1/kage/__yokai_fixture__/payment`: a synthetic card/security-code form shown only in a mobile viewport. The form is never submitted.
- `/api/v1/kage/__yokai_fixture__/redirect`: a controlled HTTP 302 to different local desktop/mobile landing pages.
- The `returning` profile exposes a synthetic test login form only when the controlled cookie is present; no credentials are entered.

## Configuration and Run

Install requirements and the browser executable:

```powershell
.venv\Scripts\python -m pip install -r backend/requirements.txt
.venv\Scripts\python -m playwright install chromium
```

Enable an external authorized origin only when needed:

```env
YOKAI_ALLOWED_ORIGINS=https://your-owned-demo.example
YOKAI_MAX_CONCURRENCY=2
YOKAI_MAX_QUEUE=12
YOKAI_JOB_TTL_SECONDS=900
```

Start from the backend project root with `uvicorn backend.main:app --reload --port 8000`. Local fixtures work without adding the loopback origins to `YOKAI_ALLOWED_ORIGINS`.
# Current integration notes

This inherited contract describes the original browser engine. For this separate
backend, use port **8001** and [INTEGRATION.md](INTEGRATION.md). Cancellation is
implemented; local fixtures can be disabled and are disabled in production.
Incomplete captures produce inconclusive counterfactuals; request destinations
are also compared. The running OpenAPI is authoritative.

