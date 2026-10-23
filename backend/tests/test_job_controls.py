"""Cancellation, target-policy and provider transport boundaries."""
import asyncio
import json
from unittest.mock import patch

import httpx
import pytest
from fastapi.testclient import TestClient

from backend.core.config import Settings
from backend.kage.investigation_manager import InvestigationManager
from backend.kage.security_policy import TargetNotAllowed, TargetPolicy
from backend.kagami.rpc import Rpc, RpcError
from backend.main import create_app
from backend.models.yokai_schemas import InvestigationRequest, Investigation
from datetime import datetime, timezone
from backend.models.yokai_schemas import BrowserCapture, PageStructure, Viewport, NetworkObservation
from backend.kage.differential_engine import compare_captures


@pytest.mark.asyncio
async def test_cancel_running_and_queued_jobs_leaves_worker_usable():
    manager = InvestigationManager(policy=TargetPolicy(frozenset()), max_concurrency=1,
                                   max_queue=2, ttl_seconds=60)
    entered = asyncio.Event()
    stopped = asyncio.Event()

    async def browser(**kwargs):
        entered.set()
        try:
            await asyncio.Event().wait()
        finally:
            stopped.set()

    request = InvestigationRequest(targetUrl='https://owned.example/', profiles=['desktop', 'mobile'], authorizationConfirmed=True)
    with patch('backend.kage.investigation_manager.investigate_profiles', browser):
        running = await manager.submit(request, request.target_url)
        await asyncio.wait_for(entered.wait(), 2)
        queued = await manager.submit(request, request.target_url)
        assert (await manager.cancel(queued.id)).status.value == 'cancelled'
        assert (await manager.cancel(running.id)).status.value == 'cancelled'
        assert stopped.is_set()
        await asyncio.wait_for(manager.queue.join(), 2)
        assert not manager.workers[0].done()
        next_job = await manager.submit(request, request.target_url)
        assert next_job.status.value == 'queued'
        await manager.cancel(next_job.id)
    await manager.close()


def test_production_disables_fixtures_and_default_loopback_targets(tmp_path):
    settings = Settings(environment='production', local_fixtures_enabled=False,
                        snapshot_db=str(tmp_path / 'wallets.sqlite3'))
    with TestClient(create_app(settings)) as client:
        assert client.get('/api/v1/kage/__yokai_fixture__/payment').status_code == 404
        assert client.get('/api/v1/kage/__yokai_fixture__/redirect/mobile').status_code == 404
        assert client.get('/api/v1/kage/capabilities').json()['allowedOrigins'] == []
        with pytest.raises(TargetNotAllowed):
            client.app.state.yokai_policy.normalize_target('http://127.0.0.1:8001/api/v1/kage/__yokai_fixture__/payment')


@pytest.mark.parametrize('failure', ['http', 'id', 'result', 'json', 'oversize'])
@pytest.mark.asyncio
async def test_provider_transport_errors_do_not_expose_credentials(failure):
    def handler(request):
        body = json.loads(request.content)
        if failure == 'http':
            return httpx.Response(401, text='SECRET_KEY=do-not-leak')
        if failure == 'id':
            return httpx.Response(200, json={'jsonrpc': '2.0', 'id': 99999, 'result': '0x1'})
        if failure == 'result':
            return httpx.Response(200, json={'jsonrpc': '2.0', 'id': body['id']})
        if failure == 'json':
            return httpx.Response(200, text='SECRET_KEY=do-not-leak')
        return httpx.Response(200, content=b'x' * (4 * 1024 * 1024 + 1))

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        rpc = Rpc(Settings(rpc_urls={'sepolia': 'https://rpc.example/SECRET_KEY'}), client)
        with pytest.raises(RpcError) as caught:
            await rpc.call('sepolia', 'eth_chainId', [])
        assert 'SECRET_KEY' not in str(caught.value) and 'do-not-leak' not in str(caught.value)


@pytest.mark.asyncio
async def test_provider_timeout_returns_bounded_api_error(tmp_path):
    async def slow(request):
        await asyncio.sleep(5)
        return httpx.Response(200, json={})
    settings = Settings(rpc_urls={'sepolia': 'https://rpc.example'}, kagami_timeout_seconds=1,
                        snapshot_db=str(tmp_path / 'wallets.sqlite3'))
    app = create_app(settings, rpc_transport=httpx.MockTransport(slow))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://testserver') as client:
        response = await client.post('/api/v1/kagami/wallets/analyze', json={'wallet': '0x' + '11' * 20, 'network': 'sepolia'})
        assert response.status_code == 503
        assert response.json()['error']['code'] == 'service_unavailable'
        assert 'time limit' in response.json()['error']['message']
        assert app.state.kagami.active == 0
    await app.state.rpc_client.aclose()


def capture(profile, availability='complete'):
    return BrowserCapture(id=f'capture-{profile}', profile_id=profile, label=profile,
                          final_url='https://owned.example/', title='Controlled page',
                          viewport=Viewport(width=1000, height=800), user_agent='test', cookie_state='fresh',
                          availability=availability, notes=[], redirects=[], forms=[], network=[],
                          structure=PageStructure(headings=['Welcome'], link_count=0, language='en'))


def test_partial_capture_is_inconclusive_instead_of_controlled():
    result = compare_captures([capture('desktop'), capture('returning', 'partial')], ['a', 'b'], 'https://owned.example/')
    assert result.counterfactuals[0].conclusion == 'inconclusive'
    assert any(f.id == 'insufficient-captures' for f in result.findings)
    assert not any(f.id == 'no-material-difference' for f in result.findings)


def test_network_difference_is_evidence_not_fraud_claim():
    desktop, mobile = capture('desktop'), capture('mobile')
    mobile.network = [NetworkObservation(id='request1', url='https://owned.example/mobile.css', method='GET', kind='stylesheet')]
    result = compare_captures([desktop, mobile], ['a', 'a'], 'https://owned.example/')
    network = next(f for f in result.findings if f.id == 'network-mobile')
    assert network.severity == 'informational' and network.evidence_ids == [desktop.id, mobile.id]


def test_pending_investigation_omits_nullable_optional_fields():
    instant = datetime.now(timezone.utc)
    job = Investigation(id='inv-test', target_url='https://owned.example/', profiles=['desktop', 'mobile'],
                        status='queued', created_at=instant, updated_at=instant, events=[])
    payload = job.model_dump(mode='json', by_alias=True)
    assert 'error' not in payload and 'result' not in payload
    job.error = 'Browser failed.'
    assert job.model_dump(mode='json', by_alias=True)['error'] == 'Browser failed.'


def test_identical_content_still_warns_about_secrets_and_unsafe_submission():
    from backend.models.yokai_schemas import FormObservation
    desktop, mobile = capture('desktop'), capture('mobile')
    for item in (desktop, mobile):
        item.forms = [FormObservation(id='login', label='Login', action='http://owned.example/collect',
            method='GET', fields=['password: Password', 'text: Seed phrase'], sensitive=True)]
    result = compare_captures([desktop, mobile], ['same', 'same'], desktop.final_url)
    assert {f.id for f in result.findings} == {'secret-request', 'unsafe-sensitive-form'}
    assert all(len(f.evidence_ids) == 2 for f in result.findings)


def test_newsletter_and_educational_secret_mention_are_not_high_risk():
    from backend.models.yokai_schemas import FormObservation
    desktop, mobile = capture('desktop'), capture('mobile')
    for item in (desktop, mobile):
        item.structure.text_blocks = ['Never share your seed phrase.', 'Subscribe to our newsletter', 'There are no guaranteed returns.']
        item.forms = [FormObservation(id='newsletter', label='Newsletter', action='https://owned.example/subscribe',
            method='POST', fields=['email: Email address', 'text: Postal code'], sensitive=True)]
    result = compare_captures([desktop, mobile], ['same', 'same'], desktop.final_url)
    assert not any(f.tone == 'sensitive' for f in result.findings)
