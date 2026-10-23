# SCAMurai — Landing, authentication, and dual-mode workspace plan

## Product structure

SCAMurai is the parent product. KAGE and KAGAMI are its two working environments, with one account, one navigation system, and shared reporting and recovery conventions.

- **KAGE — Scam Intelligence Mode:** suspicious messages, phishing URLs, fake KYC requests, payment requests, and social engineering.
- **KAGAMI — Transaction Truth Mode:** transaction calldata, supported ERC-20 approvals, spender permissions, and Promise vs. Action.
- **Rescue Mode:** shared recovery guidance, reachable from both modes and publicly without authentication.

IntentShield becomes the Promise vs. Action capability inside KAGAMI. It is not a third mode or a competing product name.

## Primary journey

```text
Public landing /
  → Enter SCAMurai
  → Login /login
  → Workspace dashboard /dashboard
       → KAGE /dashboard/kage
            → Choose Message or Website URL
            → Submit a check
            → KAGE report /dashboard/kage/results
       → KAGAMI /dashboard/kagami
            → Inspect a transaction or compare Promise vs. Action
            → Submit a check
            → KAGAMI report /dashboard/kagami/results
       → Rescue /rescue
```

Authenticated visitors can open the dashboard directly. Visiting `/` still shows the landing page, with a “Go to dashboard” CTA in place of login. A direct link into a protected mode goes through login and returns to that same internal destination.

## 1. Public landing page

Keep the approved cinematic identity: graphite, lime, large typography, the procedural 3D inspection core, and scroll-driven reveals.

Change its role from a mixed landing/workspace into an introduction to the product:

1. Navigation: brand, How it works, Protection modes, Rescue, Log in / Enter workspace.
2. Hero: the existing 3D experience with one clear entry CTA.
3. Scroll explanation: the difference between a persuasive promise and the action requested.
4. Two mode previews: KAGE and KAGAMI, each with a plain-language use case and its own visual identity.
5. Brief explanation of the evidence-based report and what its limitations mean.
6. Closing entry CTA and a visible emergency-help link.

Remove the working scanner form, transaction fields, risk reports, and tool controls from the landing page. Mode preview CTAs go to login with the corresponding mode as the return destination. Keep login and the dashboard out of the landing page's long scroll narrative.

## 2. Login and access

### Login presentation

A focused, responsive screen: restrained brand artwork alongside the authentication form. Use the same base palette, but keep the animated landing scene out of the form area. Show inline validation, submitting, failure, and retry states.

### Authentication boundary

The repository currently has no authentication contract or connected identity provider. UI work must not invent a working credential system.

- Create a central auth adapter with session loading, sign-in, sign-out, and session-expiry handling.
- In the frontend demonstration, offer **Enter demo workspace**. Display “Demo session” throughout the workspace. This is navigation state, not secure authentication.
- Do not collect or store passwords for a demo session. Do not implement a localStorage password database, fake verification email, or fake password recovery.
- Real sign-in, registration, and recovery controls become functional through the agreed FastAPI auth contract or a deliberately selected auth provider.
- Prefer a server-verified, HttpOnly cookie session for the existing FastAPI architecture, subject to the backend developer's agreed contract. Configure credentials and CORS accordingly.
- Client route guards provide UX; the backend must independently authorize every protected API request. A client flag is never the security boundary.
- On 401/session expiry, route to login with a validated internal return path. Retain non-sensitive input in memory where practical; never retain credentials or seed phrases.
- Accept only allowlisted internal return destinations to prevent open redirects.

Rescue remains public. No authentication is required to view emergency guidance or official reporting channels.

## 3. Main dashboard

The dashboard is the workspace's home and the primary place to choose a mode. Do not add an extra, mandatory mode-picker screen before it.

### Desktop arrangement

- Compact workspace navigation: Dashboard, KAGE, KAGAMI, Rescue.
- Header: current location, demo/live service status, account menu, sign out.
- Welcome area: “What would you like to check?” with a short explanation of the two modes.
- Two large, visually distinct mode entry panels. KAGE is lime-led; KAGAMI is cyan-led. Both show example situations and a clear CTA.
- Quick tools below the mode panels: Message check, Website URL check, Transaction inspection, Promise vs. Action, Recovery checklist.
- Optional current-tab activity: actual checks performed in this demo session, if implemented. Show a useful empty state before the first check. Do not generate fake history, threat counts, prevented losses, protection status, or success percentages.

Quick tools deep-link directly to the appropriate mode and selected tool. They do not create duplicate scanners on the dashboard.

### Mobile arrangement

- Compact top bar and accessible navigation drawer.
- KAGE and KAGAMI panels stack vertically, with readable labels and large entry targets.
- Quick tools become a short, scannable list.
- Avoid a compressed desktop sidebar, unnecessary carousels, and horizontal overflow.

## 4. KAGE workspace

**Route:** `/dashboard/kage`

**Identity:** KAGE — Scam Intelligence Mode. Lime for primary interactions; amber and red reserved for meaningful risk states.

**Primary tools:**

- Message analysis: pasted WhatsApp/SMS/email text, character count, paste, clear, validation, and submission.
- Website URL analysis: complete HTTP/HTTPS URL validation and URL-specific input.
- Labeled examples: fake KYC, payment/UPI scam message, everyday conversation.

Payment/UPI examples are message-analysis contexts. Do not imply UPI account verification, payment-network access, WhatsApp inbox access, or a separate detector that does not exist.

**Results:** `/dashboard/kage/results`

Risk assessment, category, actual evidence spans, threat signals, recommended actions, analysis limitations, copy summary, new check, and Rescue Mode. The mode title and breadcrumb remain visible. A new-check action returns to KAGE with the relevant input mode selected.

## 5. KAGAMI workspace

**Route:** `/dashboard/kagami`

**Identity:** KAGAMI — Transaction Truth Mode. Cyan-led interactions on the shared graphite base. Lime can identify the claimed promise; risk colors retain the same meaning across both modes.

**Primary tools:**

- Transaction inspection: calldata, supported network, optional token contract, validation, and approval/permission details.
- Promise vs. Action: the user's claimed outcome plus transaction data, routed through the intent-comparison endpoint.
- Labeled unlimited-approval example for the hackathon demonstration.

Use an explicit tool switch so transaction inspection and intent comparison call their corresponding API methods. Wallet connection is not necessary for the current pasted-calldata workflow. Do not add wallet connection, live balances, arbitrary contract analysis, or signature actions without an implemented integration.

**Results:** `/dashboard/kagami/results`

Make Promise vs. Action the main visual. Follow it with allowance, spender, contract, supported interpretation, recommendations, and limitations. Distinguish limited, very large, and unlimited approval without treating unlimited approval as proof of fraud.

## 6. Workspace navigation and state

- One shared workspace shell; mode accents are scoped to the selected mode, including its report.
- Keep a visible Dashboard breadcrumb and a KAGE/KAGAMI switcher. Users can switch modes without logging in again.
- Preserve separate non-sensitive drafts for each mode during client navigation. Do not silently reuse a KAGE message as KAGAMI calldata.
- Store reports separately by mode so switching modes cannot show the other mode's latest result.
- Initially support the latest report per mode. Do not advertise persistent report history until backend storage exists.
- Direct access to an empty report route shows “Run a check first” with the correct mode CTA.
- Session expiry, loading, unavailable API, unsupported response, empty results, and errors have explicit states.
- Signing out clears demo workspace state and session-held reports/drafts. Browser Back must not reveal the protected workspace again.
- Preserve the strict distinction between demo session, demo analysis, and live service availability. Authentication never implies that scam analysis is live.

## 7. Route and component organization

Next.js route groups separate layouts without changing public URLs:

```text
app/
  layout.tsx                         # Fonts, tokens, shared providers
  (marketing)/
    layout.tsx                       # Public navigation and footer
    page.tsx                         # /
  (auth)/
    layout.tsx                       # Focused authentication shell
    login/page.tsx                   # /login
  (workspace)/
    dashboard/
      layout.tsx                     # Auth boundary and workspace shell
      page.tsx                       # /dashboard
      kage/
        page.tsx
        results/page.tsx
      kagami/
        page.tsx
        results/page.tsx
  rescue/page.tsx                    # Public emergency guidance
  scan/page.tsx                      # Legacy navigation redirect
  intentshield/page.tsx               # Legacy navigation redirect
  results/page.tsx                    # Latest report resolver / dashboard fallback

components/
  marketing/                         # 3D narrative and mode previews
  auth/                              # Session boundary and login UI
  workspace/                         # Shell, mode entries, switcher, tool links
  kage/                              # Message/URL workspace
  kagami/                            # Transaction/intent workspace
  results/                           # Shared report primitives
  rescue/
  ui/

lib/
  auth/                              # Contract, adapter, demo session
  workspace/                         # Mode drafts and report state
  api.ts                             # Existing analysis integration
  types.ts
  mock-data.ts
  config.ts
```

Legacy links must retain a sensible destination:

| Existing URL | New destination |
| --- | --- |
| `/scan` | `/dashboard/kage` via login when required |
| `/intentshield` | `/dashboard/kagami` via login when required |
| `/results` | Appropriate latest mode report, otherwise dashboard |
| `/rescue` | Remains public and accessible from both shells |

Do not apply the marketing navbar/footer or its full-screen animations around the dashboard.

## 8. Motion and visual behavior

- Landing: keep the 3D scroll story and its cinematic pacing; introduce both modes clearly.
- Login: a short, controlled entry transition; focus moves to the form predictably.
- Dashboard: stagger the two mode entries and quick tools once on entry. Give mode previews distinct artwork and subtle pointer depth.
- Mode entry: a brief transition using the destination accent, followed immediately by usable controls.
- Workspace: animate tabs, expand evidence, and show real request activity. Avoid scroll pinning or rotating form surfaces inside the working tools.
- Risk warnings appear immediately. Motion never postpones safety information.
- Reduced motion disables pinning, continuous rotation, perspective movement, and large spatial transitions.

## 9. Implementation order

1. Split marketing, login, and workspace layouts; establish routes and session adapter.
2. Remove functional tools from the landing page; route public CTAs through login.
3. Build the main dashboard, mode entry panels, workspace navigation, and mobile drawer.
4. Move message and URL workflows into KAGE; move transaction and intent comparison into KAGAMI.
5. Create mode-specific report routes and separate state; preserve shared report components and Rescue Mode.
6. Add legacy redirects, deep-link return handling, session expiry, and sign-out cleanup.
7. Apply mode accents and transitions; verify the complete journey at desktop, tablet, and mobile sizes.

## 10. Acceptance checks

- A new visitor sees the landing page, without operational scanner fields.
- The main entry CTA opens login; successful demo or real session entry opens the dashboard.
- KAGE and KAGAMI each open their own correctly themed tool workspace.
- Quick tools select the correct tool inside the correct mode.
- Logged-out direct links return to the intended mode after sign-in; invalid external return URLs are rejected.
- Switching modes preserves the correct drafts and displays the correct report.
- Reports never mix demo and live findings or hide analysis limitations.
- Rescue remains available before and after login.
- Sign-out clears workspace state and blocks protected routes, including browser Back navigation.
- No fake identity verification, password recovery, scan history, or live security claims.
- Keyboard navigation, visible focus, reduced motion, mobile navigation, and long addresses work.
- TypeScript, production build, and end-to-end landing → login → dashboard → both modes → results → sign-out checks pass.

## Current delivery boundary

This document is the implementation plan. The existing working UI is unchanged. Real authentication remains dependent on an agreed backend/provider contract; a clearly labeled demo session can support the full frontend walkthrough independently.
