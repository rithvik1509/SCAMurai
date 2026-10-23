# SCAMurai frontend

Next.js App Router, React, TypeScript, Tailwind v4, shadcn-style owned button with Radix Slot, Lucide, and Motion. Fonts are served locally. The FastAPI backend supports live message and static URL analysis.

## Run

```powershell
cd D:\SCAMurai\frontend
npm install
npm run dev
```

Open http://localhost:3000. Production: `npm run build`, then `npm start`.

## API integration

Copy `.env.example` to `.env.local`. Demo mode defaults to enabled. Set `NEXT_PUBLIC_DEMO_MODE=false` and `NEXT_PUBLIC_API_URL` to the FastAPI origin to use live mode; restart/rebuild after changing public environment variables. Configure backend CORS for the frontend origin (the default allows `http://localhost:3000` and `http://127.0.0.1:3000`). Start the backend from the repository root with `uvicorn backend.main:app --reload --port 8000`.

`lib/api.ts` owns fetch, timeouts, errors, response validation, and the mapping to the frontend report model. Live routes:

- GET `/health`
- POST `/api/v1/analyze` — `{type: "text", content, language: "en"}`; message text and URLs are supported, with links inspected statically.

Crypto analysis, Promise vs. Action comparison, and rescue are not implemented by the backend yet; live mode reports that clearly. Unknown or malformed analysis responses fail visibly, and live failures never fall back to mock data.

## Workspace flow

The public landing page introduces the product and retains the 3D scroll experience. `/login` opens an explicitly labeled demo session, then `/dashboard` offers two modes in a light, frosted workspace inspired by the supplied reference.

- `/dashboard/kage`: message and website URL checks.
- `/dashboard/kagami`: transaction inspection and Promise vs. Action comparison.
- Each mode has its own `/results` page, latest report, and tool drafts.
- Tool search is available from New check or Ctrl/Cmd+K. Rescue remains public.
- Direct workspace links return to their requested destination after demo entry. Sign-out clears SCAMurai session data and drafts.

`lib/auth.tsx` exposes an adapter for future server-verified authentication. The current session is a frontend demonstration, not secure account authentication. No passwords are collected.

## Demo scenarios

- Dashboard → KAGE → Bank KYC scam → Explore demo analysis.
- KAGE → Everyday message → low-risk fixture with explicit caveats.
- Dashboard → KAGAMI → Promise vs. Action → Unlimited approval → sample comparison.
- Rescue mode → I transferred money → interactive recovery checklist and official reporting links.

In demo mode, arbitrary submitted text is **not analyzed**: a fixed labeled fixture is returned based on the mode (the exact everyday-message fixture selects the benign example). No probabilities or real analysis are implied. Results are held in sessionStorage for the scan-to-results flow, persist through reloads, and clear when the tab session closes. Avoid entering sensitive data. No analytics or cookie tracking is installed.

## Design reference

The supplied transparent logo is preserved at `public/brand/scamurai-logo.png` and shared by the header, footer, login, workspace sidebar, and browser icon. The landing entrance draws a katana, reveals the logo, then opens onto the page. It plays on every fresh landing-page load or refresh, supports Skip intro and Escape, restores focus and scrolling on exit, and bypasses the sequence for reduced motion. The landing loads behind the animation.

The supplied video informed a new inspection-focused identity: acid lime on warm graphite, oversized type, real metallic 3D, and a scroll-driven narrative. `components/experience/inspection-core.tsx` creates a procedural Three.js core and studio environment locally. Its rings rotate and separate with scroll progress. The model pauses off screen and in hidden tabs; pixel density is capped. A CSS fallback remains if WebGL is unavailable. No remote models, textures, or HDR assets are fetched.

The entire landing page is one continuous story in `components/experience/persistent-landing.tsx`. One full-screen 3D stage runs through all six chapters. Scroll moves the metallic core from the right into the center, unfolds its rings, and morphs a procedural line structure into a synthetic fingerprint hologram with a scanning light. Copy appears on both sides of the centered object. The biometric imagery is illustrative; no biometric data is collected. Chapter links and captions track the reading position. On phones the scene stays in a compact, safely framed panel above a single column of content. Mobile scroll progress follows the chapter below the panel, with larger touch targets and no forced screen-height gaps; touch-device landscape also uses this layout. Desktop composition and scroll progress are retained. Reduced-motion preference freezes the model while keeping all information and navigation available. Routes retain short entry transitions.

Indian reporting links and 1930 were checked against the Ministry of Home Affairs' official press release: https://www.pib.gov.in/PressReleasePage.aspx?PRID=2241344&lang=1&reg=1

## Checks

`npm run typecheck`, `npm run build`. Run the preview with `npm run dev -- --port 3001`, then `npm run test:ui` (uses locally installed Chrome). Set `TEST_BASE_URL` to test another port. `npm run test:api` tests live-mode validation and errors with a temporary local test server.

Browser checks in `tests/` cover navigation, validation, demo scan results, crypto comparison, recovery checklist, and responsive overflow. API checks verify malformed responses and network errors do not become demo results. Reference frames and verification screenshots are in `reference/`.

