"""Public local-testing mode preserves private-network boundaries."""
from unittest.mock import patch

import pytest
from pydantic import ValidationError

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


def test_production_rejects_public_target_mode():
    with pytest.raises(ValidationError, match='local development'):
        Settings(environment='production', local_fixtures_enabled=False, yokai_public_targets_enabled=True)
