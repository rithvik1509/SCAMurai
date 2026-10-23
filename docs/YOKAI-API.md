# KAGE YŌKAI frontend handoff

The currently inspected backend OpenAPI exposes /health and /api/v1/analyze only. YŌKAI is not integrated with a live investigation engine. No backend files were changed.

## Enablement

NEXT_PUBLIC_API_URL sets the service origin. NEXT_PUBLIC_YOKAI_API_ENABLED defaults to false. Set it to true only after implementing the contract below. NEXT_PUBLIC_DEMO_MODE=true uses labeled fictional fixtures. When the global app uses live analysis, the YŌKAI launcher also offers an explicit Explore demo examples button; this is a user choice, never an error fallback.

KAGE now opens YŌKAI directly at /dashboard/kage. Its message and URL scanners have been removed from public workspace routes and tool navigation. The former /dashboard/kage/yokai path redirects to the main KAGE page while preserving investigation IDs; legacy scanner reports redirect there too. The restored light workspace palette is preserved. KAGAMI is unchanged.

## Provisional routes

These paths are proposals, not claims about the current backend:

| Method | Default path                               | Response                             |
| ------ | ------------------------------------------ | ------------------------------------ |
| GET    | /api/v1/kage/capabilities                  | InvestigationCapabilities            |
| POST   | /api/v1/kage/investigations                | Investigation                        |
| GET    | /api/v1/kage/investigations/:id            | Investigation                        |
| GET    | /api/v1/kage/investigations/:id/evidence   | BrowserCapture[]                     |
| GET    | /api/v1/kage/investigations/:id/comparison | InvestigationResult without captures |
| POST   | /api/v1/kage/investigations/:id/cancel     | Investigation                        |

Configure the first two paths centrally with NEXT_PUBLIC_YOKAI_CAPABILITIES_PATH and NEXT_PUBLIC_YOKAI_INVESTIGATIONS_PATH. Remaining paths derive from the investigation path. If a completed snapshot contains result, evidence/comparison endpoints are not requested. Cancellation is only offered when capabilities.cancellation is true.

## Models

Canonical TypeScript definitions: lib/yokai/types.ts. Runtime validation: lib/yokai/api.ts. Complete response examples: lib/yokai/fixtures.ts. The UI never builds browser evidence by visiting a target.

POST body example:

```json
{
  "targetUrl": "https://authorized.example/page",
  "profiles": ["desktop", "mobile"],
  "authorizationConfirmed": true,
  "settings": {
    "timeoutSeconds": 30,
    "captureScreenshots": true,
    "includeNetwork": true
  }
}
```

Capabilities example:

```json
{
  "available": true,
  "profiles": ["desktop", "mobile", "returning"],
  "allowedOrigins": ["https://authorized.example"],
  "authorizationPolicy": "Only targets you own or have permission to investigate.",
  "cancellation": false
}
```

Investigation requires id, demo, targetUrl, profiles, status, createdAt, updatedAt, and events. Timestamps are ISO strings. Live responses require demo:false. Status is queued, initializing, loading, collecting, comparing, completed, failed, cancelled, or unsupported. Events are actual service observations with status, at, message. Errors can include a human-readable error string. Do not return synthetic progress percentages.

Results contain captures, findings, riskIndicators, limitations, recommendations, graph:{nodes,edges}, and counterfactuals. Empty arrays and unavailable/partial captures are meaningful. Each graph/finding/counterfactual evidenceIds array refers to capture IDs. Graph edges must reference existing node IDs. Unknown references and duplicate IDs are rejected. Explicit relationships must come from recorded observations; the frontend cannot verify their authenticity.

Capture screenshot is null or {url,kind:"capture"}. Live screenshots must be accessible without custom auth headers on the configured API origin, with suitable browser CORS/cookie policy. The frontend accepts only HTTP(S) screenshot URLs on that origin. Production should serve inert, validated image files and enforce access policy. Illustrations use kind:"illustration" and are clearly labeled. Forms are observations only: action, method, fields, sensitive. They are never submitted by the UI. Network entries describe observed destinations, not requests executed by this frontend.

Counterfactual conclusion is controlled, correlation, or inconclusive. Baseline, changedVariable, observedResult, finding, and supporting capture references are required. Distinguish viewport from user-agent/cookie changes; do not imply one variable was isolated if it was not.

## State and failures

Requests have a 15-second HTTP timeout; the browser-observation timeout in POST is independent. Status polling is every two seconds and stops on terminal status or request failure. Retry resumes status retrieval rather than automatically submitting another investigation. No network error creates a fixture. Browser cancellation is not implied by aborting a frontend fetch.

Results and up to eight history entries are held in sessionStorage. Signing out clears SCAMurai session data. This is tab-local demo authentication, not a production security boundary. Investigation URLs and observations should not contain secrets. For a production auth backend, enforce authorization and target allowlisting server-side; browser checks are only UX.

## Demonstrations

Three reserved .test fixtures cover responsive differences, mobile-only payment fields, and differing permitted redirects. No fixture URL is contacted. SVG screenshots are authored illustrations, labeled in both the asset and UI. Fixtures open directly as completed examples, without fabricated progress. Selecting desktop + mobile isolates viewport in the fixture; other pairs are marked inconclusive.

## Validation

Run npm run typecheck, npm run test:api, npm run test:yokai, and npm run build. There is no ESLint configuration in this project; formatting is checked with Prettier. Browser verification covers desktop/mobile comparison, graph, evidence dialog, report, session restore and existing KAGE tools. Live YŌKAI interoperability remains pending the backend contract.
