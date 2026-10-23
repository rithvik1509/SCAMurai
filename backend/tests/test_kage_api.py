"""API and live-browser integration tests for the YOKAI KAGE workflow."""

from __future__ import annotations

import socket
import threading
import time
from collections.abc import Iterator

import httpx
import pytest
import uvicorn
from unittest.mock import patch

from backend.core.config import Settings
from backend.kage.security_policy import TargetNotAllowed, TargetPolicy, redact_url
from backend.main import create_app
from backend.models.schemas import Environment


@pytest.fixture()
def live_yokai_server(tmp_path) -> Iterator[str]:
    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    listener.bind(("127.0.0.1", 0))
    listener.listen(128)
    host, port = listener.getsockname()
    origin = f"http://{host}:{port}"
    settings = Settings(
        environment=Environment.TEST,
        cors_allowed_origins=("http://localhost:3000",),
        yokai_allowed_origins=(origin,),
        yokai_max_concurrency=2,
        yokai_max_queue=8,
        yokai_job_ttl_seconds=120,
        snapshot_db=str(tmp_path / 'snapshots.sqlite3'),
        rate_limit_per_minute=1000,
    )
    app = create_app(settings)

    @app.get('/api/v1/kage/__yokai_fixture__/quality/{scenario}', include_in_schema=False)
    async def quality_fixture(scenario: str):
        from fastapi.responses import HTMLResponse, RedirectResponse
        base = '/api/v1/kage/__yokai_fixture__/quality/'
        if scenario == 'denied':
            return HTMLResponse('<title>Access denied</title><h1>Forbidden</h1>', status_code=403)
        if scenario == 'challenge':
            return HTMLResponse('<title>Verify you are human</title><h1>Browser challenge</h1>')
        if scenario == 'asset':
            return RedirectResponse(base + 'image', status_code=302)
        if scenario == 'image':
            from fastapi import Response
            return Response('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>', media_type='image/svg+xml')
        if scenario == 'content-only':
            return HTMLResponse('''<meta name="viewport" content="width=device-width,initial-scale=1">
                <h1>Research fixture</h1><p>Fictional security testing fixture. No real payments.</p>
                <script>setTimeout(() => { if(innerWidth < 600) document.body.insertAdjacentHTML('beforeend',
                  '<section><h2>Simulated Deposit Interface</h2><p>Deposit amount: 5000 demo credits</p><button>Continue (Nonfunctional Demo Action)</button></section>'); },2200)</script>''')
        if scenario == 'orphan':
            return HTMLResponse('<h1>Account</h1><label>Recovery phrase<input placeholder="seed phrase" value="NEVER-COLLECT-ME"></label>')
        if scenario == 'empty':
            return HTMLResponse('<title>Unhydrated</title><div id="root"></div>')
        return HTMLResponse('''<meta name="viewport" content="width=device-width,initial-scale=1"><title>Quality fixture</title><h1>Controlled test</h1>
            <form><input name="product"><input type="hidden" name="otp"></form>
            <img src="''' + base + '''asset">
            <script>setTimeout(() => {
              if (innerWidth < 600) document.body.insertAdjacentHTML('beforeend',
                '<form action="/api/v1/kage/__yokai_fixture__/quality/payment" method="post"><input name="card_number"><input name="cvv"></form>');
            }, 700)</script>''')
    server = uvicorn.Server(
        uvicorn.Config(
            app,
            host=host,
            port=port,
            log_level="critical",
            access_log=False,
        )
    )
    thread = threading.Thread(
        target=server.run,
        kwargs={"sockets": [listener]},
        name="yokai-test-server",
        daemon=True,
    )
    thread.start()
    deadline = time.monotonic() + 10
    while not server.started and time.monotonic() < deadline:
        time.sleep(0.025)
    if not server.started:
        server.should_exit = True
        thread.join(timeout=5)
        raise RuntimeError("YOKAI test FastAPI server did not start")
    try:
        yield origin
    finally:
        server.should_exit = True
        thread.join(timeout=10)
        listener.close()


def _payload(url: str, profiles: list[str]) -> dict:
    return {
        "targetUrl": url,
        "profiles": profiles,
        "authorizationConfirmed": True,
        "settings": {
            "timeoutSeconds": 15,
            "captureScreenshots": True,
            "includeNetwork": True,
        },
    }


def _start_and_wait(client: httpx.Client, target: str, profiles: list[str]) -> dict:
    response = client.post(
        "/api/v1/kage/investigations",
        json=_payload(target, profiles),
        timeout=10,
    )
    assert response.status_code == 202, response.text
    initial = response.json()
    assert initial["status"] == "queued"
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        snapshot = client.get(
            f"/api/v1/kage/investigations/{initial['id']}",
            timeout=10,
        ).json()
        if snapshot["status"] in {"completed", "failed", "cancelled", "unsupported"}:
            return snapshot
        time.sleep(0.1)
    raise AssertionError("YOKAI investigation did not finish before the test deadline")


@pytest.mark.asyncio
async def test_yokai_target_policy_blocks_unsafe_hosts_and_redacts_query_values() -> None:
    policy = TargetPolicy(
        allowed_origins=frozenset({"https://owned.example", "http://127.0.0.1:8000"})
    )
    assert policy.normalize_target("https://owned.example/path?token=private#fragment") == (
        "https://owned.example/path?token=private"
    )
    assert redact_url("https://owned.example/path?token=private&email=hidden#frag") == (
        "https://owned.example/path?param1=[redacted]&param2=[redacted]"
    )
    with pytest.raises(TargetNotAllowed):
        policy.normalize_target("file:///etc/passwd")
    with pytest.raises(TargetNotAllowed):
        policy.normalize_target("https://user:pass@owned.example/")
    with pytest.raises(TargetNotAllowed):
        policy.normalize_target("http://127.0.0.1:8000/private")
    with patch("backend.kage.security_policy._resolve_host", return_value={"10.0.0.8"}):
        private_policy = TargetPolicy(
            allowed_origins=frozenset({"https://private.example"})
        )
        assert not await private_policy.permits_request(
            "https://private.example/",
            "https://private.example",
        )


def test_yokai_routes_require_authorization_and_allowlisted_origins() -> None:
    app = create_app(
        Settings(
            environment=Environment.TEST,
            cors_allowed_origins=("http://localhost:3000",),
        )
    )
    from fastapi.testclient import TestClient

    with TestClient(app) as client:
        capabilities = client.get("/api/v1/kage/capabilities").json()
        assert capabilities["available"] is True
        assert capabilities["profiles"] == ["desktop", "mobile", "returning"]
        health = client.get("/api/v1/kage/health").json()
        assert health["available"] is True
        assert health["engine"] == "playwright-chromium"
        assert "/api/v1/analyze" in client.get("/openapi.json").json()["paths"]

        target = "http://127.0.0.1:8000/api/v1/kage/__yokai_fixture__/responsive"
        body = _payload(target, ["desktop", "mobile"])
        body["authorizationConfirmed"] = False
        assert client.post("/api/v1/kage/investigations", json=body).status_code == 403
        body["authorizationConfirmed"] = True
        body["targetUrl"] = "http://127.0.0.1:8000/private"
        assert client.post("/api/v1/kage/investigations", json=body).status_code == 403
        body["targetUrl"] = "https://unapproved.example/"
        assert client.post("/api/v1/kage/investigations", json=body).status_code == 403
        body["targetUrl"] = "file:///etc/passwd"
        assert client.post("/api/v1/kage/investigations", json=body).status_code == 403


def test_real_browser_comparison_collects_evidence_and_differences(
    live_yokai_server: str,
) -> None:
    with httpx.Client(base_url=live_yokai_server) as client:
        capabilities = client.get("/api/v1/kage/capabilities").json()
        assert capabilities["available"] is True
        assert live_yokai_server in capabilities["allowedOrigins"]

        payment = _start_and_wait(
            client,
            f"{live_yokai_server}/api/v1/kage/__yokai_fixture__/payment",
            ["desktop", "mobile"],
        )
        assert payment["status"] == "completed", payment.get("error")
        result = payment["result"]
        captures = {capture["profileId"]: capture for capture in result["captures"]}
        assert captures["desktop"]["availability"] == "complete"
        assert captures["mobile"]["availability"] == "complete"
        assert captures["desktop"]["forms"] == []
        assert captures["mobile"]["forms"][0]["sensitive"] is True
        assert any(finding["tone"] == "sensitive" for finding in result["findings"])
        assert any(finding["severity"] == "high" for finding in result["findings"])
        assert result["counterfactuals"][0]["conclusion"] == "correlation"
        capture_id = captures["mobile"]["id"]
        image_url = captures["mobile"]["screenshot"]["url"]
        image = client.get(image_url)
        assert image.status_code == 200
        assert image.headers["content-type"].startswith("image/png")
        assert image.content.startswith(b"\x89PNG\r\n\x1a\n")
        assert capture_id in image_url
        assert all(
            edge["source"] in {node["id"] for node in result["graph"]["nodes"]}
            and edge["target"] in {node["id"] for node in result["graph"]["nodes"]}
            for edge in result["graph"]["edges"]
        )

        responsive = _start_and_wait(
            client,
            f"{live_yokai_server}/api/v1/kage/__yokai_fixture__/responsive",
            ["desktop", "mobile"],
        )
        assert responsive["status"] == "completed", responsive.get("error")
        assert not any(
            finding["tone"] == "sensitive"
            for finding in responsive["result"]["findings"]
        )

        redirect = _start_and_wait(
            client,
            f"{live_yokai_server}/api/v1/kage/__yokai_fixture__/redirect",
            ["desktop", "mobile"],
        )
        assert redirect["status"] == "completed", redirect.get("error")
        assert all(capture["redirects"] for capture in redirect["result"]["captures"])
        assert any("redirect" in finding["id"] for finding in redirect["result"]["findings"])

        returning = _start_and_wait(
            client,
            f"{live_yokai_server}/api/v1/kage/__yokai_fixture__/responsive",
            ["desktop", "returning"],
        )
        assert returning["status"] == "completed", returning.get("error")
        returning_capture = next(
            capture
            for capture in returning["result"]["captures"]
            if capture["profileId"] == "returning"
        )
        assert returning_capture["forms"]
        assert returning["result"]["counterfactuals"][0]["conclusion"] == "controlled"

        experiment = client.post(
            f"/api/v1/kage/investigations/{returning['id']}/counterfactual",
            json={"changedVariable": "returning_visitor_cookie"},
            timeout=10,
        )
        assert experiment.status_code == 202, experiment.text
        assert experiment.json()["status"] == "queued"
        assert "returning_visitor_cookie" in experiment.json()["events"][-1]["message"]


def test_delayed_form_visible_fields_and_main_navigation_redirects(live_yokai_server):
    with httpx.Client(base_url=live_yokai_server) as client:
        job = _start_and_wait(client, live_yokai_server + '/api/v1/kage/__yokai_fixture__/quality/delayed', ['desktop', 'mobile'])
        assert job['status'] == 'completed', job
        desktop, mobile = job['result']['captures']
        assert desktop['availability'] == mobile['availability'] == 'complete'
        assert len(desktop['forms']) == 1 and not desktop['forms'][0]['sensitive']
        assert len(mobile['forms']) == 2
        assert not any('otp' in field for form in mobile['forms'] for field in form['fields'])
        assert desktop['redirects'] == mobile['redirects'] == []
        finding = next(f for f in job['result']['findings'] if f['id'] == 'forms-mobile')
        assert 'Mobile only: POST' in finding['explanation']
        assert 'card_number' in finding['explanation'] and 'cvv' in finding['explanation']
        assert finding['severity'] == 'high' and finding['confidence']


@pytest.mark.parametrize('scenario', ['denied', 'challenge'])
def test_error_and_challenge_pages_are_inconclusive(live_yokai_server, scenario):
    with httpx.Client(base_url=live_yokai_server) as client:
        job = _start_and_wait(client, live_yokai_server + '/api/v1/kage/__yokai_fixture__/quality/' + scenario, ['desktop', 'mobile'])
        result = job['result']
        assert all(c['availability'] == 'partial' for c in result['captures'])
        assert result['counterfactuals'][0]['conclusion'] == 'inconclusive'
        assert any(f['id'] == 'insufficient-captures' for f in result['findings'])
        assert not any(f['id'] == 'no-material-difference' for f in result['findings'])


def test_screenshot_failure_preserves_structural_evidence(live_yokai_server):
    with patch('playwright.async_api.Page.screenshot', side_effect=RuntimeError('synthetic screenshot error')):
        with httpx.Client(base_url=live_yokai_server) as client:
            job = _start_and_wait(client, live_yokai_server + '/api/v1/kage/__yokai_fixture__/payment', ['desktop', 'mobile'])
    assert job['status'] == 'completed'
    desktop, mobile = job['result']['captures']
    assert mobile['forms'] and mobile['structure']
    assert desktop['screenshot'] is None and mobile['screenshot'] is None
    assert all(any('Screenshot capture failed' in n for n in c['notes']) for c in [desktop, mobile])


@pytest.mark.parametrize('scenario', ['content-only', 'orphan', 'empty'])
def test_rendered_content_warnings_without_native_forms(live_yokai_server, scenario):
    import json
    with httpx.Client(base_url=live_yokai_server) as client:
        job = _start_and_wait(client, live_yokai_server + '/api/v1/kage/__yokai_fixture__/quality/' + scenario, ['desktop', 'mobile'])
    assert job['status'] == 'completed', job
    result = job['result']
    if scenario == 'content-only':
        assert all(not c['forms'] for c in result['captures'])
        finding = next(f for f in result['findings'] if f['id'] == 'content-mobile')
        assert finding['severity'] == 'medium'
        assert 'Simulated Deposit Interface' in finding['explanation']
        assert 'No real payments' in finding['explanation']
        assert 'Continue (Nonfunctional Demo Action)' in result['captures'][1]['structure']['actionLabels']
    elif scenario == 'orphan':
        assert all(c['forms'][0]['method'] == 'UNKNOWN' for c in result['captures'])
        assert any(f['id'] == 'secret-request' and len(f['evidenceIds']) == 2 for f in result['findings'])
        assert 'NEVER-COLLECT-ME' not in json.dumps(result)
    else:
        assert all(c['availability'] == 'partial' for c in result['captures'])
        assert any(f['id'] == 'insufficient-captures' for f in result['findings'])
