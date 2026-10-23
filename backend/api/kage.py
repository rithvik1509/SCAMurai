"""YOKAI investigation API mounted beneath the existing KAGE mode."""

from __future__ import annotations

from html import escape
from pathlib import Path
from urllib.parse import urlsplit

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import HTMLResponse, RedirectResponse
from playwright.async_api import async_playwright

from backend.kage.security_policy import TargetNotAllowed
from backend.core.errors import DependencyUnavailable
from backend.models.yokai_schemas import (
    BrowserCapture,
    CancelRequest,
    CounterfactualRequest,
    Investigation,
    InvestigationCapabilities,
    InvestigationRequest,
    InvestigationResult,
)

router = APIRouter(prefix="/kage", tags=["KAGE / YOKAI"])


@router.get(
    "/health",
    summary="YOKAI browser worker readiness",
)
async def health(request: Request) -> dict:
    async with async_playwright() as playwright:
        browser_path = Path(playwright.chromium.executable_path)
    ready = browser_path.is_file() and not request.app.state.yokai_manager.closed
    return {
        "available": ready,
        "engine": "playwright-chromium",
        "browserInstalled": browser_path.is_file(),
        "workerAcceptingJobs": not request.app.state.yokai_manager.closed,
        "allowedExternalOrigins": list(
            request.app.state.settings.yokai_allowed_origins
        ),
        "reason": None if ready else "Install Playwright Chromium or restart the worker.",
    }


@router.get(
    "/capabilities",
    response_model=InvestigationCapabilities,
    summary="YOKAI investigation capabilities",
)
async def capabilities(request: Request) -> dict:
    manager = request.app.state.yokai_manager
    result = manager.capabilities(request.app.state.settings.yokai_allowed_origins)
    result['available'] = (await health(request))['available']
    return result


@router.post(
    "/investigations",
    response_model=Investigation,
    status_code=202,
    summary="Queue an authorized multi-profile website investigation",
)
async def create_investigation(
    payload: InvestigationRequest,
    request: Request,
) -> Investigation:
    if not payload.authorization_confirmed:
        raise HTTPException(
            status_code=403,
            detail="Confirm that you own or are authorized to investigate this target.",
        )
    if not (await health(request))['available']:
        raise DependencyUnavailable('Playwright Chromium is not installed or the worker is unavailable.')
    policy = request.app.state.yokai_policy
    try:
        target_url = policy.normalize_target(payload.target_url)
    except TargetNotAllowed as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    origin = _origin(target_url)
    if not await policy.permits_request(target_url, origin):
        raise HTTPException(
            status_code=403,
            detail="The target resolved outside the permitted public network scope.",
        )
    try:
        return await request.app.state.yokai_manager.submit(payload, target_url)
    except OverflowError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get(
    "/investigations/{investigation_id}",
    response_model=Investigation,
    summary="Get investigation status and completed results",
)
async def get_investigation(investigation_id: str, request: Request) -> Investigation:
    investigation = request.app.state.yokai_manager.get(investigation_id)
    if investigation is None:
        raise HTTPException(status_code=404, detail="Investigation not found or expired.")
    return investigation


@router.get(
    "/investigations/{investigation_id}/evidence",
    response_model=list[BrowserCapture],
    summary="Get profile capture evidence",
)
async def get_evidence(investigation_id: str, request: Request) -> list[BrowserCapture]:
    investigation = request.app.state.yokai_manager.get(investigation_id)
    if investigation is None:
        raise HTTPException(status_code=404, detail="Investigation not found or expired.")
    if investigation.result is None:
        raise HTTPException(status_code=409, detail="Investigation evidence is not ready.")
    return investigation.result.captures


@router.get(
    "/investigations/{investigation_id}/differences",
    response_model=InvestigationResult,
    include_in_schema=False,
)
@router.get(
    "/investigations/{investigation_id}/comparison",
    response_model=InvestigationResult,
    summary="Get differential findings and evidence graph",
)
async def get_comparison(investigation_id: str, request: Request) -> InvestigationResult:
    investigation = request.app.state.yokai_manager.get(investigation_id)
    if investigation is None:
        raise HTTPException(status_code=404, detail="Investigation not found or expired.")
    if investigation.result is None:
        raise HTTPException(status_code=409, detail="Investigation comparison is not ready.")
    return investigation.result


@router.get(
    "/investigations/{investigation_id}/screenshots/{capture_id}.png",
    summary="Get a captured browser screenshot",
    responses={200: {"content": {"image/png": {}}}},
)
async def get_screenshot(
    investigation_id: str,
    capture_id: str,
    request: Request,
) -> Response:
    screenshots = request.app.state.yokai_manager.get_screenshots(investigation_id)
    if screenshots is None or capture_id not in screenshots:
        raise HTTPException(status_code=404, detail="Screenshot not found or expired.")
    return Response(
        content=screenshots[capture_id],
        media_type="image/png",
        headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
    )


@router.post(
    "/investigations/{investigation_id}/counterfactual",
    response_model=Investigation,
    status_code=202,
    summary="Queue a controlled counterfactual profile rerun",
)
async def counterfactual(
    investigation_id: str,
    payload: CounterfactualRequest,
    request: Request,
) -> Investigation:
    try:
        return await request.app.state.yokai_manager.submit_counterfactual(
            investigation_id,
            payload.changed_variable,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except OverflowError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc


@router.post(
    "/investigations/{investigation_id}/cancel",
    response_model=Investigation,
    summary="Cancel an investigation",
)
async def cancel_investigation(
    investigation_id: str,
    _payload: CancelRequest,
    request: Request,
) -> Investigation:
    try:
        return await request.app.state.yokai_manager.cancel(investigation_id)
    except KeyError:
        raise HTTPException(404, 'Investigation not found or expired.') from None


@router.get(
    "/__yokai_fixture__/{scenario}",
    response_class=HTMLResponse,
    include_in_schema=False,
)
async def controlled_fixture(scenario: str, request: Request) -> HTMLResponse:
    if not request.app.state.settings.local_fixtures_enabled:
        raise HTTPException(status_code=404, detail="Fixture not found.")
    if scenario not in {"responsive", "payment", "redirect"}:
        raise HTTPException(status_code=404, detail="Fixture not found.")
    if scenario == "redirect":
        mobile = "Android" in request.headers.get("user-agent", "")
        destination = (
            "/api/v1/kage/__yokai_fixture__/redirect/"
            f"{'mobile' if mobile else 'desktop'}"
        )
        return RedirectResponse(destination, status_code=302)
    payment_markup = (
        "<section class='payment'><h2>Payment verification</h2>"
        "<form action='/api/v1/kage/__yokai_fixture__/payment-review' method='post'>"
        "<label>Card number <input name='card_number' autocomplete='off'></label>"
        "<label>Security code <input name='security_code' autocomplete='off'></label>"
        "<button type='submit'>Continue</button></form></section>"
    ) if scenario == "payment" else ""
    returning_markup = (
        "<section><h2>Returning customer verification</h2>"
        "<form action='/api/v1/kage/__yokai_fixture__/account-review' method='post'>"
        "<label>Email <input type='email' name='email'></label>"
        "<label>Password <input type='password' name='password'></label>"
        "<button type='submit'>Sign in</button></form></section>"
    ) if request.cookies.get("yokai_returning_test") == "1" else ""
    html = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>YOKAI Controlled {escape(scenario.title())} Fixture</title>
<style>
body{{font:16px system-ui,sans-serif;margin:2rem auto;padding:1rem;max-width:58rem;color:#202820}}
nav{{display:flex;gap:1rem;flex-wrap:wrap}}.payment{{display:none;background:#fff2d4;padding:1rem}}
input{{display:block;margin:.3rem 0 1rem;padding:.6rem}}@media(max-width:600px){{.payment{{display:block}}}}
</style></head><body><header><h1>Fieldwork Supply</h1><nav><a href="/api/v1/kage/__yokai_fixture__/responsive">Catalog</a><a href="/api/v1/kage/__yokai_fixture__/payment">Checkout</a></nav></header>
<main><h2>Objects for everyday life</h2><p>Fictional controlled test page. No real payments or accounts exist.</p>
{payment_markup}
{returning_markup}
</main></body></html>"""
    return HTMLResponse(
        html,
        headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
    )


@router.get("/__yokai_fixture__/redirect/{profile}", response_class=HTMLResponse, include_in_schema=False)
async def controlled_redirect_landing(profile: str, request: Request) -> HTMLResponse:
    if not request.app.state.settings.local_fixtures_enabled:
        raise HTTPException(status_code=404, detail="Fixture not found.")
    if profile not in {"desktop", "mobile"}:
        raise HTTPException(status_code=404, detail="Fixture not found.")
    return HTMLResponse(
        f"<!doctype html><html lang='en'><title>Controlled {profile} offer</title>"
        f"<h1>Your {profile} offer</h1><p>Fictional YOKAI redirect fixture.</p></html>",
        headers={"Cache-Control": "no-store"},
    )


def _origin(value: str) -> str:
    parts = urlsplit(value)
    host = parts.hostname or ""
    port = parts.port
    default_port = 443 if parts.scheme == "https" else 80
    return f"{parts.scheme}://{host}" + (f":{port}" if port and port != default_port else "")
