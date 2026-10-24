"""Public website investigation preserves private-network boundaries."""
from unittest.mock import patch, AsyncMock
from datetime import datetime, timezone

import pytest

from backend.core.config import Settings
from backend.kage.security_policy import TargetPolicy, TargetNotAllowed


def test_public_mode_accepts_other_websites_but_keeps_allowlist_default():
    public = TargetPolicy(frozenset(), allow_public_targets=True)
    assert public.normalize_target('https://example.com/page') == 'https://example.com/page'
    with pytest.raises(TargetNotAllowed):
        TargetPolicy(frozenset()).normalize_target('https://example.com/')


@pytest.mark.parametrize('target', [
    'http://127.0.0.1:8001/private', 'http://localhost/private', 'http://10.0.0.1/',
    'http://192.168.1.1/', 'http://169.254.169.254/latest/meta-data/',
    'http://[::1]/', 'http://[::ffff:127.0.0.1]/', 'http://0.0.0.0/',
    'file:///etc/passwd', 'https://user:pass@example.com/', 'https://example.com:8443/',
])
def test_public_mode_rejects_private_targets_and_invalid_urls(target):
    with pytest.raises(TargetNotAllowed):
        TargetPolicy(frozenset(), allow_public_targets=True).normalize_target(target)


@pytest.mark.asyncio
async def test_public_cross_origin_assets_and_redirects_require_public_dns():
    policy = TargetPolicy(frozenset(), allow_public_targets=True)
    with patch('backend.kage.security_policy._resolve_host', return_value={'93.184.216.34'}):
        assert await policy.permits_request('https://cdn.example/asset.css', 'https://example.com')
        assert await policy.permits_request('https://www.example.com/', 'http://example.com')
    for addresses in [{'10.0.0.2'}, {'93.184.216.34', '127.0.0.1'}, {'169.254.169.254'}, set()]:
        with patch('backend.kage.security_policy._resolve_host', return_value=addresses):
            assert not await policy.permits_request('https://rebind.example/', 'https://example.com')


def test_production_accepts_public_websites_without_allowlist_and_blocks_private_targets(tmp_path):
    from fastapi.testclient import TestClient
    from backend.main import create_app
    from backend.models.yokai_schemas import Investigation
    settings = Settings(environment='production', local_fixtures_enabled=False,
                        yokai_public_targets_enabled=True, snapshot_db=str(tmp_path / 'public.sqlite3'))
    app = create_app(settings)
    target = 'https://example.com/'
    now = datetime.now(timezone.utc)
    job = Investigation(id='public-target-test', target_url=target, profiles=['desktop', 'mobile'],
                        status='queued', created_at=now, updated_at=now, events=[])
    payload = {'targetUrl': target, 'profiles': ['desktop','mobile'], 'authorizationConfirmed': True}
    with TestClient(app) as client, patch('backend.api.kage.health', new=AsyncMock(return_value={'available':True})):
        capabilities = client.get('/api/v1/kage/capabilities').json()
        assert capabilities['publicTargets'] is True
        assert capabilities['allowedOrigins'] == []
        with patch.object(app.state.yokai_manager, 'submit', new=AsyncMock(return_value=job)) as submit:
            with patch('backend.kage.security_policy._resolve_host', return_value={'93.184.216.34'}):
                response = client.post('/api/v1/kage/investigations', json=payload)
            assert response.status_code == 202, response.text
            submit.assert_awaited_once()
            submit.reset_mock()
            for private in ['http://127.0.0.1/', 'http://10.0.0.1/', 'http://169.254.169.254/']:
                response = client.post('/api/v1/kage/investigations', json={**payload, 'targetUrl':private})
                assert response.status_code == 403, response.text
            response = client.post('/api/v1/kage/investigations', json={**payload, 'authorizationConfirmed': False})
            assert response.status_code == 403
            submit.assert_not_awaited()


def test_operator_can_still_disable_public_targets(monkeypatch):
    monkeypatch.setenv('APP_ENV', 'production')
    monkeypatch.setenv('LOCAL_FIXTURES_ENABLED', 'false')
    monkeypatch.setenv('YOKAI_PUBLIC_TARGETS_ENABLED', 'false')
    settings = Settings.from_env()
    assert settings.yokai_public_targets_enabled is False
