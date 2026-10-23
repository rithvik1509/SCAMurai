# KAGAMI frontend handoff

KAGAMI is implemented at `/dashboard/kagami`, with `?module=authority`, `?module=approvals`, and `?module=futureview`. Previous calldata tools remain at `/dashboard/kagami/inspect`. The shared SCAMurai shell and light workspace palette are preserved, with cyan KAGAMI accents. No backend files, RPC services, databases, or transaction execution were added.

## Current integration status

The local OpenAPI inspected during this implementation publishes system health, text analysis, and KAGE investigation endpoints. It publishes **no KAGAMI endpoints**. The endpoints below are provisional proposals for the backend developer, not an implemented backend contract.

`NEXT_PUBLIC_API_URL` is the API origin. `NEXT_PUBLIC_KAGAMI_API_ENABLED` defaults to false. Enable it only once the contract is supported. `NEXT_PUBLIC_KAGAMI_API_PATH` defaults to `/api/v1/kagami`. All endpoint construction is centralized in `lib/kagami/api.ts`.

`NEXT_PUBLIC_DEMO_MODE=true` starts in explicitly labeled demo mode. With the existing app configured for live mode, the user can explicitly select **Explore demo fixtures**. A failed live request never produces a fixture. Demo addresses cannot be replaced with arbitrary addresses and attributed fictional permissions. Demo fixtures are not queried on chain, and explorer links are suppressed for them.

## Proposed endpoints

| Method | Path below the configured base | Response                                |
| ------ | ------------------------------ | --------------------------------------- |
| GET    | `/capabilities`                | `KagamiCapabilities`                    |
| POST   | `/wallets/analyze`             | `WalletAnalysis`                        |
| GET    | `/wallets/:id`                 | `WalletAnalysis` status snapshot        |
| GET    | `/wallets/:id/authority`       | `AuthorityGraph`                        |
| GET    | `/wallets/:id/approvals`       | `Permission[]`, ERC-20 records only     |
| GET    | `/wallets/:id/delegations`     | `Permission[]`, delegation records only |
| POST   | `/transactions/decode`         | `TransactionResult`                     |
| POST   | `/transactions/preview`        | `TransactionResult`                     |

Wallet POST body: `{ "wallet": "0x…40 hex characters…", "network": "ethereum" }`.

Transaction POST body: `{ "network": "ethereum", "sender": "0x…", "target": "0x…", "calldata": "0x…complete hex bytes…", "valueWei": "0", "claimedPurpose": "optional user text" }`.

Capabilities shape:

```json
{
  "available": true,
  "networks": [
    {
      "id": "ethereum",
      "walletAnalysis": true,
      "decode": true,
      "preview": true
    }
  ],
  "limitations": ["Explain network and discovery coverage here."]
}
```

Network IDs currently modeled by the frontend are `ethereum`, `sepolia`, and `arbitrum`; capabilities determine which operations are enabled. The demo supports Ethereum and Sepolia illustrations only. Network options must never imply a successful live connection.

## Canonical models and validation

- `lib/kagami/types.ts`: request and response interfaces, exact string formatting, supported explorer mapping, direct-model summary.
- `lib/kagami/schemas.ts`: runtime Zod validation.
- `lib/kagami/mocks.ts`: complete fictional response examples.
- `lib/kagami/api.ts`: typed client, context validation, request timeouts, and explicit errors.

Wallet analysis returns `id`, `demo`, `wallet`, `network`, `status`, `checkedAt`, `permissions`, `graph` (nullable), `evidence`, `coverage`, `findings`, and `limitations`. Status is `pending`, `completed`, `partial`, `unsupported`, or `failed`. Dates are ISO strings. Coverage independently distinguishes complete, partial, and unavailable returned approval/delegation evidence; it is not a guarantee that all wallet authority was discovered.

Permissions identify their owner, spender or delegated implementation, token contract where applicable, type, exact allowance, active state, severity, timestamp, and supporting evidence IDs. Return a token symbol only when metadata is verified; otherwise return null and the UI displays its contract address. ERC-20 allowance raw values are canonical decimal **strings** bounded by uint256. Native transaction values are also wei strings. Never serialize amounts as JSON numbers. The UI uses string slicing for exact decimal display and does not compare fiat values across tokens.

Execution delegation is separate from token allowance. It has null token and allowance values and `allowanceKind: "not-applicable"`. Its presence is not treated as token ownership or proof of compromise. Zero allowances are inactive observations. Unlimited allowance is distinct from a malicious-spender finding.

Graph nodes identify wallet, permission, token, spender, or delegation observations. Edges explicitly refer to source/target IDs, permission IDs, and evidence IDs. Wallet validation rejects dangling relationships, duplicate IDs, mismatched permission owners, and missing evidence references. The UI never infers graph connections by matching address substrings. Separate graph/approval/delegation fetch functions are available for a future split API; assemble and validate the full wallet envelope before rendering a combined investigation.

Live envelopes require `demo: false`; evidence labeled `fixture` is rejected in a live envelope. Explorer links use a fixed network mapping and validated addresses or transaction hashes. Unknown explorer URLs are not accepted from service text.

## Breakpoint model

The only frontend model is **direct permission removal**. The service must explicitly set `active: true` and `modelRemovable: true`, and link graph edges to that permission ID. A simulated removal marks only those edges and associated nodes as modeled off. The summary counts distinct active permission IDs with returned graph relationships, not graph metadata edges, assets, balances, or an exposure score.

Restore and Reset clear only local UI selections. Zero allowances do not contribute active paths. Indirect calls, contract internals, alternate authorizations, ownership, balances, and asset safety are never inferred. The UI visibly states: “Simulation only. No real wallet permissions have been changed.”

## Transaction results

`TransactionResult` contains matching network/sender/target context, status, timestamp, decoded function/parameters, supplied effects, expected/actual actions, evidence-backed mismatches, evidence, and limitations. Status is `pending`, `successful`, `reverted`, `unsupported`, `failed`, or `inconclusive`. The UI shows no completed effects for pending, reverted, failed, or unsupported results. An inconclusive result can display supplied partial effects with the status and limitations visible.

Before/estimated-after effects are display strings supplied by the service, not balances computed by this frontend. A permission change is explicitly distinguished from asset movement. Missing balances, prices, or transfers remain unavailable. No signing or broadcast APIs exist in these components.

The demo recognizes only the exact authored ERC-20 approval payload. It does not decode arbitrary calldata or simulate chain state. A contradiction is supplied only for that exact example paired with the fixed purpose “Claim a token reward”; other purpose strings receive no invented mismatch. Unknown selectors produce an explicit unsupported fixture.

## Lifecycle and failures

HTTP requests have a 15-second timeout. Pending wallet snapshots poll every two seconds and stop on terminal status, context change, request failure, or unmount. Stop waiting aborts the frontend fetch; it does not claim to cancel backend work. Transaction pending results are displayed as pending; no job-polling endpoint is assumed for transactions.

Changing wallet, network, or demo/live mode aborts obsolete requests and clears results and breakpoint selections. Switching modules retains the selected wallet/network and local breakpoint state. Changing transaction input invalidates the prior preview immediately. Wallet responses are checked against the requested wallet/network; transaction responses are checked against sender/target/network.

The latest validated wallet snapshot is stored in tab-local `sessionStorage` under `scamurai-kagami-investigation`, with its recorded timestamp. Signing out clears all SCAMurai session keys. This app's demo login is not production authentication; enforce access and authorization on the backend when introducing real accounts or protected results.

## Verification

Run `npm run typecheck`, `npm run test:kagami`, and `npm run build`. Contract tests exercise uint256 precision, relationships, breakpoint counts, fixture-only decoding, unsupported input, malformed responses, context mismatches, request abort/timeout, and snapshots. Approval inventories paginate after 25 matching records; React Flow renders only visible graph elements. Browser checks cover graph selection/removal/reset, filters/details, module navigation, address/calldata validation, before/after display, unsupported networks, and 375px overflow.

Live KAGAMI interoperability remains pending the backend developer's actual endpoint contract and integration testing.
