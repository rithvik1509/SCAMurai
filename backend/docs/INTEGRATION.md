# Frontend API integration

Base URL: `http://localhost:8001`. All analysis requests are JSON POSTs;
retrieval is JSON GET except PNG screenshots. Addresses are normalized to EIP-55;
invalid mixed-case checksums return 422. Token amounts are decimal strings.

| Method | Path | Result |
|---|---|---|
| GET | `/health` | Liveness, no dependency calls |
| GET | `/api/v1/kage/health` | Browser readiness |
| GET | `/api/v1/kage/capabilities` | Profiles, origins, cancellation |
| POST | `/api/v1/kage/investigations` | 202 queued investigation |
| GET | `/api/v1/kage/investigations/{id}` | Status, events, result |
| GET | `/api/v1/kage/investigations/{id}/evidence` | Capture array |
| GET | `/api/v1/kage/investigations/{id}/comparison` | Findings and graph |
| POST | `/api/v1/kage/investigations/{id}/counterfactual` | 202 controlled rerun |
| POST | `/api/v1/kage/investigations/{id}/cancel` | Body `{}`; cancellation snapshot |
| GET | `/api/v1/kage/investigations/{id}/screenshots/{capture_id}.png` | Noncached PNG |
| GET | `/api/v1/kagami/capabilities` | Configuration flags, limitations |
| POST | `/api/v1/kagami/wallets/analyze` | Body `{wallet,network}`; wallet snapshot |
| POST | `/api/v1/kagami/wallets/check-allowance` | Body `{wallet,network,token,spender}`; direct verified allowance snapshot |
| GET | `/api/v1/kagami/wallets/{id}` | Persisted snapshot |
| GET | `/api/v1/kagami/wallets/{id}/authority` | Authority graph |
| GET | `/api/v1/kagami/wallets/{id}/approvals` | ERC-20 permission array |
| GET | `/api/v1/kagami/wallets/{id}/delegations` | Delegation permission array |
| POST | `/api/v1/kagami/transactions/decode` | ABI interpretation without effects |
| POST | `/api/v1/kagami/transactions/preview` | Supported unsigned simulation |

Aliases under KAGAMI: `/wallet/analyze`, `/wallet/{id}`,
`/wallet/{id}/approvals`, `/transaction/decode`, `/transaction/simulate`.
KAGE `/differences` aliases `/comparison`. Canonical routes appear in OpenAPI.

Transaction body: `{network,sender,target,calldata,valueWei,claimedPurpose}`.
Networks are `ethereum`, `sepolia`, `arbitrum`. Calldata must be complete hex
bytes with at least a selector; wei is a canonical decimal uint256 string.
Extra fields, RPC URLs, private keys and signing payloads are rejected.

`successful` on `/decode` means ABI decoding succeeded: effects remain empty.
Preview only reports measured allowance state (`approve`) or target-token balances
(`transfer`, `transferFrom`) from a supported unsigned simulation. Claimed purpose is retained as user text; mismatch inference is
not implemented. No upstream failure is replaced with demo data.

Wallet status is `partial`: recent Approval logs cannot establish complete
approval coverage. `coverage.delegations=complete` covers only the narrow
EIP-7702 code-format check. It does not mean all wallet authority is known.
When `APPROVAL_INDEXER_NETWORKS` enables a network, fixed Blockscout endpoints
provide bounded historical candidates; RPC allowance reads establish current state.
Otherwise bounded RPC logs are used. Both paths remain partial. A direct allowance
check bypasses history and reports only its user-selected pair.
Evidence references include verification block/hash without adding fields
rejected by the existing frontend schema.

KAGE statuses: queued, initializing, loading, collecting, comparing, completed,
failed, cancelled, unsupported. Each capture records its availability.
All-unavailable captures fail the job. Poll roughly every two seconds to stay
within the default 120 requests/minute. Completed jobs/artifacts expire after
15 minutes; wallet snapshots also have a 15-minute default TTL.

KAGE captures sample client-rendered text for 2.5–6 seconds after document load
(bounded by the selected timeout). Page structure includes up to 200 visible
`textBlocks` and 100 `actionLabels`. These are literal evidence, never instructions.
Inputs outside native forms are recorded with `method=UNKNOWN` and no inferred
submission destination. Input values are not collected. Empty rendered shells
are partial evidence. Script/document request failures appear in capture notes.
Financial/deposit content changes receive medium-priority review warnings even
without HTML forms; page disclosures are quoted as unverified context. Secret
input requests and exposed sensitive form routes can trigger warnings without
any cross-profile difference. No reputation service or malware verdict is implied.
Returning visitor mode still sets only YŌKAI's controlled cookie; arbitrary
site-specific localStorage flags, authentication, clicks, scrolling-only content,
iframes, and behavior after the bounded observation are outside this comparison.

Errors: 403 unauthorized target, 404 unknown/expired result, 409 result not
ready, 413 body over 64 KiB, 422 validation, 429 rate/capacity, 503 dependency
unavailable or timed out. Errors contain `request_id` plus
`{error:{code,message,details}}`; `X-Request-ID` is returned in headers.

Capabilities reflect configuration and installed browser binaries, not a
guarantee of provider health. Handle 503 and unsupported explicitly. Apply
`frontend.env.example`, restart Next.js, and retain the explicit demo switch.

See [openapi.json](openapi.json) for schemas, or the running `/docs`.
