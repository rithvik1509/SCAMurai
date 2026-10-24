# SCAMurai backend

Independent FastAPI backend in `D:\SCAMurai\backend`. The existing
`SCAMurai-backend` folder and frontend are untouched. Python **3.11+**;
tested locally with Python 3.14. One API process owns the bounded browser queue.

## Start on Windows

From `D:\SCAMurai`:

```powershell
.\backend\setup.ps1
.\backend\start.ps1
```

Setup creates an isolated environment, installs pinned dependencies and Chromium,
and copies `.env.example` only if `.env` is absent. Dependencies are already
installed in `backend/.venv` in this workspace.

- API: http://127.0.0.1:8001
- Interactive OpenAPI: http://127.0.0.1:8001/docs
- Liveness: http://127.0.0.1:8001/health
- Browser readiness: http://127.0.0.1:8001/api/v1/kage/health

Port **8001** keeps the old API on 8000 separate. `start.ps1 -Reload` enables
development reload. `start.ps1 -Port 8002` changes the port; add its exact origin
to `YOKAI_ALLOWED_ORIGINS` for controlled fixtures on that port. The launcher
binds loopback and disables Uvicorn access logs to avoid recording query values.

Linux/macOS:

```sh
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.lock
backend/.venv/bin/python -m playwright install --with-deps chromium
cp backend/.env.example backend/.env
backend/.venv/bin/python -m uvicorn backend.main:app --port 8001 --no-access-log
```

## Implemented features

**KAGE / YŌKAI:** isolated desktop, mobile and returning-cookie contexts; DOM,
forms, redirects, requests, screenshots; deterministic comparisons and graphs;
controlled reruns; cancellation; bounded queue and artifact TTL. External targets
need authorization and an exact origin allowlist. Mutation requests, off-origin
requests, service workers and WebSockets are blocked. Forms are never filled.

**KAGAMI / KUROKAGI:** address/checksum validation; fixed configured RPC providers;
chain ID verification; bounded Approval-event discovery; current ERC-20 allowance
reads at a recorded block; optional symbol/decimal metadata; exact EIP-7702 code
designation detection; evidence-linked authority graphs. Zero allowances remain
visible but have no active graph edges. SQLite snapshots have a TTL and record cap.

**Approval Timebomb:** verified active/zero/unlimited allowances using exact
uint256 decimal strings. Only the maximum uint256 is labeled unlimited.
Nonzero permissions warrant review; spender reputation is not invented. Discovery
is always partial because recent logs cannot enumerate all historical grants.

**Wallet FutureView:** strict offline ABI decoding for ERC-20 `approve`, `transfer`
and `transferFrom`. Unknown/malformed payloads return unsupported. Preview supports
all three operations through an explicitly enabled `eth_simulateV1` RPC. It measures
allowance or sender/owner and recipient token balances before and after the unsigned call
in one hypothetical block. Reported amounts
come from those reads, never from the requested amount. Reverts, false return
values, unavailable methods and invalid responses produce no completed effects.
The RPC transport has no signing or broadcast methods. The frontend includes an
unsigned ERC-20 calldata builder using exact raw integers.

**Gateway:** explicit CORS, strict schemas, 64 KiB body limit, per-peer rate limit,
expensive-work concurrency limits, deadlines, request IDs, redacted errors and
OpenAPI. Existing text/static-link analysis is preserved for API compatibility.

YŌKAI observation quality: captures wait for bounded page loading and an
additional 1.2-second client-rendering interval. HTTP errors and likely access
challenges are marked partial, producing inconclusive comparisons rather than
clean findings. Only main-frame navigation redirects enter the redirect chain;
asset redirects remain network observations. A screenshot failure does not
discard DOM evidence. Form comparisons use visible controls and explain exact
profile-specific methods, actions and fields. Review priority/confidence and
capture coverage are shown in the UI and copied reports. These remain bounded,
non-interactive observations, not a full site audit or a safety verdict.

## Live blockchain configuration

Edit `backend/.env` using `.env.example`. Empty provider URLs disable that
network's wallet analysis; failed requests never fall back to mock findings.

```dotenv
SEPOLIA_RPC_URL=https://your-provider.example/your-key
# Only if the configured provider supports eth_simulateV1:
SIMULATION_NETWORKS=sepolia
```

Ethereum, Sepolia and Arbitrum have fixed chain IDs, verified for each analysis.
Provider method-not-found returns unsupported. No credentials are included, and
none are required for offline decoding or controlled YŌKAI fixtures. The local
Ethereum, Sepolia and Arbitrum connections have been verified against PublicNode.
Ethereum simulation is enabled locally after a successful live check. Ethereum
and Sepolia can use bounded historical Approval queries through Blockscout with
`APPROVAL_INDEXER_NETWORKS=ethereum,sepolia`; each candidate is independently
verified at the pinned RPC block. Public-provider availability and incomplete
indexing still limit coverage. The default 12-second
KAGAMI deadline fits the frontend's 15-second request timeout.

If history is unavailable, use **Check a specific token allowance** in KAGAMI.
Supply the wallet, token contract and spender to verify that exact allowance
directly, without indexing. Its resulting graph/report covers only that pair.
No approval is created. Verification runs in bounded batches and returns
explicit partial coverage if its time/candidate budget is reached.

## Frontend connection

Apply `frontend.env.example` to `frontend/.env.local`, then restart Next.js.
Both APIs match its camelCase contracts. Guide-style singular routes are aliases.
See [docs/INTEGRATION.md](docs/INTEGRATION.md).

At implementation time, the frontend tracked source files were deleted in the
working directory. They were read from Git to verify API contracts but were not
restored, edited or reconfigured. This backend runs independently.

## Real local website investigation

Public website testing can be enabled with
`YOKAI_PUBLIC_TARGETS_ENABLED=true` in `backend/.env`, then restart the API.
The frontend receives `publicTargets: true` and accepts public HTTP(S) targets
without a per-domain allowlist. Public cross-origin assets and redirects are
permitted; private/special-use IPs, private DNS answers, embedded credentials,
mutation requests and WebSockets remain blocked. Nonstandard ports require an
explicit operator allowlist. Confirm permission before starting. This setting
is supported in production and does not provide hardened network isolation.
The deployment Dockerfile enables it by default. If Render already has
`YOKAI_PUBLIC_TARGETS_ENABLED=false` in its Environment settings, change that
value to `true` and redeploy; runtime variables override Docker defaults.
Public mode removes the per-domain allowlist, not private-network protection.

Controlled development pages:

```
http://127.0.0.1:8001/api/v1/kage/__yokai_fixture__/responsive
http://127.0.0.1:8001/api/v1/kage/__yokai_fixture__/payment
http://127.0.0.1:8001/api/v1/kage/__yokai_fixture__/redirect
```

POST this to `/api/v1/kage/investigations`, then poll the returned ID:

```json
{
  "targetUrl": "http://127.0.0.1:8001/api/v1/kage/__yokai_fixture__/payment",
  "profiles": ["desktop", "mobile"],
  "authorizationConfirmed": true,
  "settings": {"timeoutSeconds": 15, "captureScreenshots": true, "includeNetwork": true}
}
```

The pages are fictional, but evidence and screenshots come from real Chromium.
The returning profile sets a documented test cookie, not a real user's history.
Grouped mobile emulation is correlation, not a viewport-only causal experiment.

## Tests

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest -q
```

Coverage includes gateway/compatibility APIs; real Chromium comparisons and
screenshots; cancellation; allowances, zero states and delegations; graphs;
uint256 precision; calldata; simulation effects/failures; provider errors,
wrong chains, expiry, capacity and rate limits. RPC tests use deterministic
HTTP transport stubs and do not claim live-chain verification. Chromium tests
need browser installation and local socket/process access. The upstream
Starlette/httpx deprecation warning does not affect results.

## Deployment boundaries

This is a local/hackathon MVP with **no production authentication or tenant
isolation**. Frontend demo login is not API authentication. Keep the loopback
bind; add authentication, authorization and TLS before public deployment.
CORS is not authentication.

Playwright is not a hardened sandbox. Authorized external browsing requires
browser isolation and network-level egress controls; application DNS checks
cannot eliminate rebinding. Do not expose unrestricted public scanning.
Screenshots may contain page-rendered sensitive content and are not visually
redacted automatically. Use controlled targets and short retention.

Use one worker (`--workers 1`): browser jobs, cancellation and rate limits are
process-local. Browser artifacts disappear at restart; wallet snapshots expire
in SQLite. Production needs durable workers, authenticated ownership,
distributed limits and private artifact storage. Breakpoint analysis stays in
the frontend and changes no real permission. Permit2, NFT operators, arbitrary
ABI discovery, full asset simulation, monitoring and AI intent inference are
outside this implementation. Simulation cannot guarantee a future outcome.

The supplied Dockerfile is an untested deployment starting point; no network
isolation policy is included. Set `APP_ENV=production`,
`LOCAL_FIXTURES_ENABLED=false` and explicit production CORS origins.

## Layout

```
backend/
  main.py                  # app factory, lifespan, middleware, routes
  api/kage.py              # browser investigation, controlled fixtures
  api/kagami.py            # wallet, graph, approvals, decode, preview
  kage/                    # browser, evidence, personas, rules, policy, jobs
  kagami/                  # RPC, allowance, delegation, graph, simulation, SQLite
  core/                    # settings, rate limits, errors, middleware
  models/                  # Pydantic contracts
  services/                # preserved text/static-link compatibility analysis
  tests/                   # unit, API, RPC and Chromium tests
  docs/                    # integration guide and generated OpenAPI
  setup.ps1 / start.ps1     # installation and local API launcher
```

Implementation references: [ERC-20](https://eips.ethereum.org/EIPS/eip-20),
[EIP-7702](https://eips.ethereum.org/EIPS/eip-7702),
[Ethereum JSON-RPC](https://ethereum.org/developers/docs/apis/json-rpc/),
[Geth eth_simulateV1](https://geth.ethereum.org/docs/interacting-with-geth/rpc/ns-eth).
