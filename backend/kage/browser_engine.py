"""Playwright capture runner for allowlisted, authorized YOKAI targets."""

from __future__ import annotations

import asyncio
from urllib.parse import urlsplit

from playwright.async_api import Browser, BrowserContext, async_playwright
from playwright.async_api import TimeoutError as BrowserTimeout

from backend.kage.evidence_collector import collect_capture
from backend.kage.personas import Persona, persona_for
from backend.kage.security_policy import TargetPolicy, redact_url
from backend.models.yokai_schemas import (
    BrowserCapture,
    InvestigationRequest,
    NetworkObservation,
    RedirectObservation,
    ScreenshotReference,
)

MAX_NETWORK_ITEMS = 250


def navigation_failure_note(error: Exception) -> str:
    """Curated explanations without leaking raw browser URLs or credentials."""
    detail = str(error)
    if isinstance(error, BrowserTimeout):
        return 'Navigation timed out. Available page evidence may be incomplete.'
    if 'ERR_CERT' in detail or 'ERR_SSL' in detail:
        return 'The browser could not establish a trusted HTTPS connection. Certificate checks were not bypassed.'
    if 'ERR_NAME_NOT_RESOLVED' in detail:
        return 'The website hostname could not be resolved.'
    if 'ERR_BLOCKED_BY_CLIENT' in detail:
        return 'Navigation was blocked by the investigation network policy.'
    return 'The browser could not finish loading this page. The site may be unavailable or reject automated access.'


class BrowserInvestigationError(RuntimeError):
    """A browser investigation could not complete safely."""


async def _create_context(
    browser: Browser,
    persona: Persona,
    target_url: str,
) -> BrowserContext:
    context = await browser.new_context(
        viewport={"width": persona.width, "height": persona.height},
        locale=persona.locale,
        timezone_id=persona.timezone_id,
        color_scheme=persona.color_scheme,
        is_mobile=persona.is_mobile,
        has_touch=persona.has_touch,
        user_agent=persona.user_agent,
        permissions=[],
        accept_downloads=False,
        service_workers="block",
    )
    if persona.returning:
        await context.add_cookies(
            [
                {
                    "name": "yokai_returning_test",
                    "value": "1",
                    "url": target_url,
                    "sameSite": "Lax",
                }
            ]
        )
    return context


async def investigate_profiles(
    *,
    investigation_id: str,
    request: InvestigationRequest,
    target_url: str,
    policy: TargetPolicy,
    emit,
) -> tuple[list[BrowserCapture], dict[str, bytes], list[str]]:
    captures: list[BrowserCapture] = []
    screenshots: dict[str, bytes] = {}
    fingerprints: list[str] = []
    target_origin = _origin(target_url)
    timeout_ms = request.settings.timeout_seconds * 1000

    total_timeout = min(60, request.settings.timeout_seconds * len(request.profiles) + 5)
    async with asyncio.timeout(total_timeout):
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(headless=True)
            try:
                for profile_id in request.profiles:
                    persona = persona_for(profile_id)
                    await emit("loading", f"Loading authorized target as {persona.label}.")
                    capture, screenshot, fingerprint = await _capture_profile(
                        browser=browser,
                        persona=persona,
                        investigation_id=investigation_id,
                        target_url=target_url,
                        target_origin=target_origin,
                        timeout_ms=timeout_ms,
                        include_network=request.settings.include_network,
                        capture_screenshot=request.settings.capture_screenshots,
                        policy=policy,
                    )
                    captures.append(capture)
                    fingerprints.append(fingerprint)
                    if screenshot is not None:
                        screenshots[capture.id] = screenshot
            finally:
                await browser.close()

    return captures, screenshots, fingerprints


async def _capture_profile(
    *,
    browser: Browser,
    persona: Persona,
    investigation_id: str,
    target_url: str,
    target_origin: str,
    timeout_ms: int,
    include_network: bool,
    capture_screenshot: bool,
    policy: TargetPolicy,
) -> tuple[BrowserCapture, bytes | None, str]:
    context = await _create_context(browser, persona, target_url)
    page = await context.new_page()
    page.set_default_timeout(min(timeout_ms, 10_000))
    capture_id = f"capture-{persona.id.value}"
    redirects: list[RedirectObservation] = []
    network: list[NetworkObservation] = []
    notes: list[str] = []
    availability = "complete"

    async def guard_request(route) -> None:
        current_request = route.request
        # Do not allow a page's JavaScript to submit forms or send mutation requests.
        allowed = current_request.method in {'GET', 'HEAD', 'OPTIONS'} and await policy.permits_request(current_request.url, target_origin)
        if not allowed:
            if len(notes) < 40:
                notes.append("An off-origin, unsafe, or mutation request was blocked.")
            if include_network and len(network) < MAX_NETWORK_ITEMS:
                parsed = urlsplit(current_request.url)
                host = parsed.hostname or "unknown-host"
                network.append(
                    NetworkObservation(
                        id=f"blocked-{len(network) + 1:03d}",
                        url=f"{parsed.scheme}://{host}/[blocked]",
                        method=current_request.method[:12],
                        kind=f"Blocked {current_request.resource_type} request",
                    )
                )
            await route.abort("blockedbyclient")
            return
        if include_network and len(network) < MAX_NETWORK_ITEMS:
            network.append(
                NetworkObservation(
                    id=f"request-{len(network) + 1:03d}",
                    url=redact_url(current_request.url),
                    method=current_request.method[:12],
                    kind=current_request.resource_type[:80],
                )
            )
        await route.continue_()

    def record_redirect(response) -> None:
        if response.status >= 400 and response.request.resource_type in {'script', 'document'} and len(notes) < 40:
            notes.append(f'HTTP {response.status} for {response.request.resource_type}: {redact_url(response.url)}. Dependent content may be missing.')
        if (300 <= response.status < 400 and response.request.is_navigation_request()
            and response.frame == page.main_frame):
            location = response.headers.get("location")
            if not location:
                return
            source_url = response.url
            destination = response.request.url
            try:
                from urllib.parse import urljoin

                destination = urljoin(source_url, location)
            except ValueError:
                return
            if len(redirects) < 100:
                redirects.append(
                    RedirectObservation(
                        **{
                            "from": redact_url(source_url),
                            "to": redact_url(destination),
                            "status": response.status,
                        }
                    )
                )

    await context.route("**/*", guard_request)
    async def block_socket(websocket):
        await websocket.close(code=1008, reason='YOKAI does not permit WebSocket connections.')

    await context.route_web_socket('**/*', block_socket)
    page.on("response", record_redirect)
    def record_failure(failed_request):
        if failed_request.resource_type in {'script', 'document'} and len(notes) < 40:
            notes.append(f'A {failed_request.resource_type} request failed: {redact_url(failed_request.url)}. Dependent content may be missing.')
    page.on('requestfailed', record_failure)
    screenshot: bytes | None = None
    fingerprint = ""
    try:
        response = await page.goto(
            target_url,
            wait_until="domcontentloaded",
            timeout=timeout_ms,
        )
        if response is None:
            notes.append("The main document did not provide an HTTP response.")
            availability = "partial"
        else:
            notes.append(f"Main document HTTP status: {response.status}.")
            if response.status >= 400:
                availability = 'partial'
                notes.append('The server returned an HTTP error or access restriction. This page cannot establish normal website behavior.')
            # Give client-rendered pages time to mount; never wait indefinitely for analytics.
            try:
                await page.wait_for_load_state('load', timeout=min(timeout_ms, 4000))
            except BrowserTimeout:
                notes.append('Some page resources did not finish loading within the observation window.')
            # Sample across a minimum window, rather than treating network-idle
            # as hydrated: SPAs can render conditional content after timers.
            observation_ms = min(6000, max(2500, timeout_ms // 5))
            previous = None
            changed = False
            for _ in range(observation_ms // 500):
                await page.wait_for_timeout(500)
                current = await page.evaluate("() => (document.body?.innerText || '').slice(0,80000)")
                changed = previous is not None and previous != current
                previous = current
            if changed:
                notes.append('Visible content was still changing at the end of the observation window. Later behavior may differ.')
            notes.append(f'Client-rendered content sampled over {observation_ms / 1000:g} seconds after document load. No buttons were clicked; later, scrolling-only, iframe, and interaction-only behavior may be missed.')
            if persona.returning:
                notes.append('Returning state uses a controlled test cookie only. This does not reproduce an actual visitor history or authenticated session.')
            title = (await page.title()).lower()
            if any(marker in title for marker in ('just a moment', 'verify you are human', 'attention required', 'captcha')):
                availability = 'partial'
                notes.append('The page title suggests an access challenge. Challenge content is not reliable evidence of normal site behavior.')
        if capture_screenshot and page.url:
            try:
                screenshot = await page.screenshot(
                    type="png", full_page=False, animations="disabled",
                    timeout=min(timeout_ms, 10_000),
                )
            except Exception:
                notes.append('Screenshot capture failed. Structural evidence was still collected; no image was fabricated.')
                screenshot = None
            if screenshot is not None and len(screenshot) > 4 * 1024 * 1024:
                notes.append("Screenshot exceeded the 4 MiB artifact limit and was omitted.")
                screenshot = None
        capture, fingerprint = await collect_capture(
            page=page,
            profile=persona,
            capture_id=capture_id,
            initial_url=target_url,
            redirects=redirects,
            network=network,
            notes=notes,
            availability=availability,
        )
    except Exception as exc:
        notes.append(navigation_failure_note(exc))
        availability = 'partial' if page.url.startswith(('http://', 'https://')) else 'unavailable'
        capture, fingerprint = await collect_capture(
            page=page,
            profile=persona,
            capture_id=capture_id,
            initial_url=target_url,
            redirects=redirects,
            network=network,
            notes=notes,
            availability=availability,
        )
        screenshot = None
    finally:
        await context.close()

    if screenshot is not None:
        capture.screenshot = ScreenshotReference(
            url=f"/api/v1/kage/investigations/{investigation_id}/screenshots/{capture_id}.png",
            kind="capture",
        )
    return capture, screenshot, fingerprint


def _origin(value: str) -> str:
    parsed = urlsplit(value)
    host = parsed.hostname or ""
    port = parsed.port
    default_port = 443 if parsed.scheme == "https" else 80
    return f"{parsed.scheme}://{host}" + (f":{port}" if port and port != default_port else "")
