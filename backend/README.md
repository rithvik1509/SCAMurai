# SCAMurai (SATARK) — Backend

FastAPI service for evidence-based financial scam awareness. The API explains
what a message promises, what action it requests, and what a decoded financial
instruction authorizes. It presents risk indicators and evidence, never a claim
that fraud or theft is proven.

> **Current scope:** `GET /health` and deterministic text plus static link
> analysis at `POST /api/v1/analyze` are implemented, along with configuration,
> CORS, request-size limits, centralized error handling, shared schemas, and
> tests. Links are parsed but never opened, resolved, or fetched. The crypto,
> intent, and rescue endpoints are **not implemented yet** — see
> [Scope](#scope).

## Requirements

- Python **3.11+** (3.12 or 3.13 recommended for the widest wheel coverage)
- pip and `venv`

## Setup

Run from the repository root.

```bash
python -m venv .venv

# Windows (Git Bash / PowerShell)
.venv/Scripts/python -m pip install -r backend/requirements.txt

# macOS / Linux
.venv/bin/python -m pip install -r backend/requirements.txt
```

Create local configuration (optional — safe defaults exist):

```bash
cp backend/.env.example backend/.env
```

`backend/.env` is git-ignored. Do not commit real secrets.

## Run

```bash
# Windows
.venv/Scripts/python -m uvicorn backend.main:app --reload --port 8000

# macOS / Linux
.venv/bin/python -m uvicorn backend.main:app --reload --port 8000
```

- API: <http://127.0.0.1:8000>
- Health: <http://127.0.0.1:8000/health>
- OpenAPI UI: <http://127.0.0.1:8000/docs>
- OpenAPI JSON: <http://127.0.0.1:8000/openapi.json>

Uvicorn is intentionally started as a module (`backend.main:app`) so the same
entry point works from any working directory inside the repository. There is
exactly one app factory (`create_app`) and one module-level app instance.

### Analyse a message

```bash
curl -s http://127.0.0.1:8000/api/v1/analyze \
  -H 'Content-Type: application/json' \
  -d '{
    "type": "text",
    "content": "URGENT: Your account will be blocked. Share the OTP now.",
    "language": "en"
  }'
```

Links in the message are inspected statically as part of the same request:

```bash
curl -s http://127.0.0.1:8000/api/v1/analyze \
  -H 'Content-Type: application/json' \
  -d '{
    "type": "text",
    "content": "URGENT: Complete KYC at http://192.168.1.10/kyc-update",
    "language": "en"
  }'
```

The response includes a `scan_id`, a 0-100 `risk_score` with its arithmetic,
`signals` quoting exact excerpts, recommended actions, and limitations. Text
and link findings are combined into one score; a link-path finding that only
corroborates a text finding contributes `0` instead of counting twice. The
rule baseline is deterministic and makes no network, DNS, LLM, or database
call. See [docs/api-contract.md](docs/api-contract.md) for the full contract.

## Test

```bash
# Windows
.venv/Scripts/python -m pytest

# macOS / Linux
.venv/bin/python -m pytest
```

`pytest.ini` at the repository root sets the test path, import path, and
`pytest-asyncio` mode.

## Configuration

All settings are environment variables, optionally loaded from
`backend/.env` (which never overrides already-exported variables). Invalid
values fail fast at startup with a validation error.

| Variable | Default | Notes |
|---|---|---|
| `APP_ENV` | `development` | `development`, `test`, or `production` |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | Comma-separated explicit origins; `*` is rejected |
| `MAX_REQUEST_BYTES` | `65536` | Accepted range 1024–10485760 bytes |
| `LOG_LEVEL` | `INFO` | `DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL` |

### Production CORS

Set only the exact frontend origins, for example:

```bash
APP_ENV=production
CORS_ALLOWED_ORIGINS=https://app.scamurai.example
```

Credentials are enabled only in combination with explicit origins. Wildcards,
paths, query strings, fragments, and URLs containing credentials are rejected
at startup. If the frontend and API are served from the same origin, set
`CORS_ALLOWED_ORIGINS` to that single origin.

## Layout

```
backend/
  main.py                    # create_app(), /health, middleware/CORS wiring
  api/                       # route modules (analyze implemented; others reserved)
  core/
    config.py                # validated env settings
    errors.py                # error envelope + exception handlers
    middleware.py            # request id/logging, body limit, crash safety
  models/schemas.py          # shared Pydantic v2 schemas
  services/
    scam_detector.py         # text rule baseline + exact-excerpt evidence
    url_analyzer.py          # static link extraction/structure; no fetching
    risk_engine.py           # capped 0-100 scoring and risk levels
    advice_engine.py         # summary, limitations, recommended actions
    (other modules reserved for later endpoints)
  tests/                     # pytest suite
  docs/api-contract.md       # current HTTP contract
  .env.example
  requirements.txt
```

## Security and privacy decisions

- **No secrets in code.** Configuration is environment-based; `backend/.env`
  is ignored by git. `GET /health` never exposes configuration values.
- **CORS is explicit.** No wildcard origins, and credentials are only sent to
  allowlisted origins.
- **Bounded input.** Every HTTP request body is capped by
  `MAX_REQUEST_BYTES`; oversized bodies receive a `413` envelope before
  routing. Buffering is limited to that cap.
- **Centralized errors.** Application 4xx and 5xx responses share one
  envelope with a `request_id`. Validation responses omit the submitted
  `input`, and unexpected exceptions never expose stack traces, exception
  text, or secrets. (A disallowed CORS preflight is answered by middleware
  with a plain 400 before routing.)
- **Minimal logging.** Requests log method, path, status, duration, and request
  id only — never message bodies or query strings.
- **No outbound calls.** The service makes no network requests, never fetches,
  resolves, pings, or crawls user-submitted URLs, and stores no submitted
  content. Link analysis is purely lexical (URL parsing and hostname/path
  checks). Text and link analysis are fully deterministic.
- **No signing or execution.** The backend never signs, broadcasts, or executes
  transactions and never collects private keys, seed phrases, or OTPs.

## Scope

Implemented:

- `GET /health`
- `POST /api/v1/analyze` — deterministic text analysis for urgency, bank/KYC,
  OTP, government, crypto-reward, payment-demand, and guaranteed-return
  indicators, plus static link analysis for IP hosts, `@` user-information
  tricks, punycode, misleading subdomains, sensitive paths, malformed or
  encoded links, embedded redirects, and dangerous schemes; with
  exact-excerpt evidence, rule provenance, capped 0-100 scoring, recommended
  actions, and limitations
- request-size limits, CORS, request ids, centralized error handling
- shared schemas, settings validation, tests, API contract documentation

Reserved for later steps (currently **not registered**, so requests return
`404`):

- `POST /api/v1/crypto/analyze`
- `POST /api/v1/intent/compare`
- `POST /api/v1/rescue`

No URL fetching, DNS resolution, domain-reputation lookup, calldata decoding,
intent comparison, or rescue guidance exists yet. LLM integration is optional
and absent by design; the deterministic baseline works without one.

See [docs/api-contract.md](docs/api-contract.md) for request/response details.
