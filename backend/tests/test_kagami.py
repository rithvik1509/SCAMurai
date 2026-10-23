"""Hermetic RPC integration tests: no paid provider, wallet or real transaction."""
from __future__ import annotations

import asyncio
import json
import sqlite3
import time

import httpx
import pytest
from eth_abi import encode
from fastapi.testclient import TestClient
from pydantic import ValidationError

from backend.core.config import Settings
from backend.kagami.allowance import APPROVAL_TOPIC, address_topic
from backend.kagami.rpc import RpcError
from backend.main import create_app
from backend.models.kagami import MAX_UINT256, TransactionInput, WalletAnalysis

WALLET = '0x' + '11' * 20
TOKEN = '0x' + '22' * 20
ZERO_TOKEN = '0x' + '33' * 20
SPENDER = '0x' + '44' * 20
DELEGATE = '0x' + '55' * 20
PREFIX = '/api/v1/kagami'


def word(amount):
    return '0x' + int(amount).to_bytes(32, 'big').hex()


def transaction(**changes):
    return dict(network='sepolia', sender=WALLET, target=TOKEN,
                calldata='0x095ea7b3' + encode(['address', 'uint256'], [SPENDER, MAX_UINT256]).hex(),
                valueWei='0', claimedPurpose='Review an approval', **changes)


class Provider:
    def __init__(self):
        self.calls = []
        self.chain_id = 11155111
        self.discovery_error = False
        self.allowance_error = False
        self.code = '0xef0100' + DELEGATE[2:]
        self.simulation_status = '0x1'
        self.simulation_return = word(1)
        self.simulation_unknown = False
        self.simulation_bad = False
        self.simulation_after = MAX_UINT256
        self.malformed_code = False

    def __call__(self, request):
        body = json.loads(request.content)
        self.calls.append(body)
        method, params = body['method'], body['params']
        error = None
        if method == 'eth_chainId':
            result = hex(self.chain_id)
        elif method == 'eth_blockNumber':
            result = '0x3e8'
        elif method == 'eth_getBlockByNumber':
            result = {'number': '0x3e8', 'hash': '0x' + 'aa' * 32}
        elif method == 'eth_getCode':
            result = self.code
        elif method == 'eth_getLogs':
            assert params[0]['topics'] == [APPROVAL_TOPIC, address_topic(WALLET)]
            result = [{'address': token, 'topics': [APPROVAL_TOPIC, address_topic(WALLET), address_topic(SPENDER)],
                       'data': word(1250), 'blockNumber': '0x3e7', 'transactionHash': '0x' + 'bb' * 32,
                       'removed': False} for token in (TOKEN, ZERO_TOKEN)]
            if self.discovery_error:
                error = {'code': -32000, 'message': 'sensitive provider response'}
        elif method == 'eth_call':
            call = params[0]
            assert params[1] == '0x3e8'
            if call['data'].startswith('0xdd62ed3e'):
                result = word(MAX_UINT256 if call['to'].lower() == TOKEN.lower() else 0)
                if self.allowance_error:
                    error = {'code': -32000, 'message': 'secret provider detail'}
            elif call['data'] == '0x95d89b41':
                result = '0x' + encode(['string'], ['TEST']).hex()
            elif call['data'] == '0x313ce567':
                result = word(18)
            else:
                raise AssertionError(call)
        elif method == 'eth_simulateV1':
            assert params[1] == '0x3e8'
            assert params[0]['validation'] is False
            calls = params[0]['blockStateCalls'][0]['calls']
            assert len(calls) == 3 and calls[0] == calls[2]
            assert calls[1]['input'].startswith('0x095ea7b3')
            result = [{'calls': [{'status': '0x1', 'returnData': word(1250)},
                                  {'status': self.simulation_status, 'returnData': self.simulation_return},
                                  {'status': '0x1', 'returnData': word(self.simulation_after)}]}]
            if self.simulation_unknown:
                error = {'code': -32601, 'message': 'not available'}
            if self.simulation_bad:
                result = [{'calls': [{'status': True}]}]
        else:
            raise AssertionError(f'Unexpected RPC method: {method}')
        data = {'jsonrpc': '2.0', 'id': body['id']}
        data.update({'error': error} if error else {'result': result})
        return httpx.Response(200, json=data)


@pytest.fixture
def api(tmp_path):
    provider = Provider()
    settings = Settings(environment='test', rpc_urls={'sepolia': 'https://rpc.example/secret-token'},
                        simulation_networks=('sepolia',), snapshot_db=str(tmp_path / 'wallets.sqlite3'))
    app = create_app(settings, rpc_transport=httpx.MockTransport(provider))
    with TestClient(app) as client:
        yield client, provider, app


def test_capabilities_and_no_provider_decode(tmp_path):
    with TestClient(create_app(Settings(snapshot_db=str(tmp_path / 'wallets.sqlite3')))) as client:
        caps = client.get(PREFIX + '/capabilities').json()
        assert caps['available']
        assert all(n['decode'] and not n['preview'] and not n['walletAnalysis'] for n in caps['networks'])
        assert client.post(PREFIX + '/wallets/analyze', json={'wallet': WALLET, 'network': 'sepolia'}).status_code == 503
        response = client.post(PREFIX + '/transactions/decode', json=transaction())
        assert response.status_code == 200
        result = response.json()
        assert result['status'] == 'successful' and result['functionName'] == 'approve'
        assert result['parameters'][1]['value'] == str(MAX_UINT256)
        assert result['effects'] == [] and result['mismatches'] == [] and 'error' not in result
        assert client.post(PREFIX + '/transactions/preview', json=transaction()).json()['status'] == 'unsupported'


def test_verified_allowance_zero_delegation_graph_and_snapshot(api):
    client, provider, app = api
    response = client.post(PREFIX + '/wallets/analyze', json={'wallet': WALLET, 'network': 'sepolia'})
    assert response.status_code == 200, response.text
    data = response.json()
    assert data['demo'] is False and data['status'] == 'partial'
    assert data['coverage'] == {'approvals': 'partial', 'delegations': 'complete'}
    active, zero, delegation = data['permissions']
    assert active['allowanceRaw'] == str(MAX_UINT256) and active['allowanceKind'] == 'unlimited'
    assert active['active'] and active['symbol'] == 'TEST' and active['decimals'] == 18
    assert zero['allowanceRaw'] == '0' and not zero['active'] and zero['severity'] == 'none'
    assert delegation['type'] == 'delegation' and delegation['spender'].lower() == DELEGATE
    assert delegation['token'] is None and delegation['allowanceRaw'] is None
    evidence = {e['id'] for e in data['evidence']}
    nodes = {n['id'] for n in data['graph']['nodes']}
    permissions = {p['id'] for p in data['permissions']}
    for edge in data['graph']['edges']:
        assert edge['source'] in nodes and edge['target'] in nodes
        assert edge['permissionId'] in permissions and set(edge['evidenceIds']) <= evidence
        assert edge['permissionId'] != zero['id']
    assert 'block=1000' in data['evidence'][0]['reference']
    assert client.get(PREFIX + '/wallets/' + data['id']).json() == data
    assert len(client.get(PREFIX + '/wallets/' + data['id'] + '/approvals').json()) == 2
    assert len(client.get(PREFIX + '/wallets/' + data['id'] + '/delegations').json()) == 1
    assert client.get(PREFIX + '/wallets/' + data['id'] + '/authority').json() == data['graph']
    assert all(c['method'] not in {'eth_sendTransaction', 'eth_sendRawTransaction'} for c in provider.calls)


def test_discovery_failure_does_not_invent_allowances(api):
    client, provider, _ = api
    provider.discovery_error = True
    data = client.post(PREFIX + '/wallet/analyze', json={'wallet': WALLET, 'network': 'sepolia'}).json()
    assert data['status'] == 'partial' and data['coverage']['approvals'] == 'unavailable'
    assert all(p['type'] == 'delegation' for p in data['permissions'])
    assert 'sensitive provider response' not in json.dumps(data)


def test_historical_event_does_not_replace_failed_allowance_verification(api):
    client, provider, _ = api
    provider.allowance_error = True
    data = client.post(PREFIX + '/wallets/analyze', json={'wallet': WALLET, 'network': 'sepolia'}).json()
    assert all(p['type'] != 'erc20' for p in data['permissions'])
    assert any('could not be verified' in line for line in data['limitations'])


@pytest.mark.parametrize('code,coverage', [('0x', 'complete'), ('0xef0100', 'partial'), ('0x60016001', 'partial'), ('0xef0100' + '00' * 20, 'partial')])
def test_only_exact_nonzero_designation_becomes_authority(api, code, coverage):
    client, provider, _ = api
    provider.code = code
    data = client.post(PREFIX + '/wallets/analyze', json={'wallet': WALLET, 'network': 'sepolia'}).json()
    assert data['coverage']['delegations'] == coverage
    assert all(p['type'] != 'delegation' for p in data['permissions'])


def test_wrong_chain_rejected_and_provider_secrets_not_leaked(api):
    client, provider, _ = api
    provider.chain_id = 1
    result = client.post(PREFIX + '/wallets/analyze', json={'wallet': WALLET, 'network': 'sepolia'})
    assert result.status_code == 503
    assert 'wrong chain' in result.text and 'secret-token' not in result.text


@pytest.mark.parametrize('patch', [
    {'wallet': '0x123'}, {'wallet': '0x52908400098527886E0f7030069857D2E4169EE7'},
    {'network': 'unknown'}, {'rpcUrl': 'http://127.0.0.1/'}, {'privateKey': 'never-accepted'},
])
def test_wallet_input_boundaries(api, patch):
    client, provider, _ = api
    data = {'wallet': WALLET, 'network': 'sepolia', **patch}
    assert client.post(PREFIX + '/wallets/analyze', json=data).status_code == 422
    assert not provider.calls


@pytest.mark.parametrize('field,value', [('valueWei', str(2**256)), ('valueWei', 42), ('valueWei', '01'), ('calldata', '0x123'), ('target', 'invalid'), ('calldata', '0x095ea7b3zz')])
def test_transaction_input_boundaries(api, field, value):
    client, provider, _ = api
    data = transaction()
    data[field] = value
    assert client.post(PREFIX + '/transactions/decode', json=data).status_code == 422
    assert not provider.calls


@pytest.mark.parametrize('calldata', ['0xdeadbeef', '0x095ea7b3', '0x095ea7b3' + '00' * 65])
def test_unknown_or_malformed_abi_unsupported(api, calldata):
    client, _, _ = api
    data = transaction()
    data['calldata'] = calldata
    result = client.post(PREFIX + '/transaction/decode', json=data).json()
    assert result['status'] == 'unsupported' and result['effects'] == [] and result['functionName'] is None


def test_preview_uses_measured_state_not_requested_amount(api):
    client, provider, _ = api
    provider.simulation_after = 987654321012345678909876543210
    result = client.post(PREFIX + '/transactions/preview', json=transaction())
    assert result.status_code == 200, result.text
    data = result.json()
    assert data['status'] == 'successful' and data['demo'] is False
    effect = data['effects'][0]
    assert effect['before'] == '1250' and effect['after'] == str(provider.simulation_after)
    assert set(effect['evidenceIds']) <= {e['id'] for e in data['evidence']}


@pytest.mark.parametrize('case,status', [('revert', 'reverted'), ('false', 'inconclusive'), ('unknown', 'unsupported'), ('bad', None)])
def test_preview_errors_never_show_completed_effects(api, case, status):
    client, provider, _ = api
    if case == 'revert':
        provider.simulation_status = '0x0'
    if case == 'false':
        provider.simulation_return = word(0)
    if case == 'unknown':
        provider.simulation_unknown = True
    if case == 'bad':
        provider.simulation_bad = True
    response = client.post(PREFIX + '/transaction/simulate', json=transaction())
    if status:
        assert response.status_code == 200
        assert response.json()['status'] == status and response.json()['effects'] == []
    else:
        assert response.status_code == 503


def test_snapshot_expiry_unknown_and_bounded_retention(api):
    client, _, app = api
    data = client.post(PREFIX + '/wallets/analyze', json={'wallet': WALLET, 'network': 'sepolia'}).json()
    with app.state.kagami.store.connect() as db:
        db.execute('UPDATE wallets SET created = 0')
    assert client.get(PREFIX + '/wallets/' + data['id']).status_code == 404
    assert client.get(PREFIX + '/wallets/missing/authority').status_code == 404


def test_capacity_and_rate_limits(api, tmp_path):
    client, _, app = api
    app.state.kagami.active = app.state.settings.kagami_max_concurrency
    assert client.post(PREFIX + '/wallets/analyze', json={'wallet': WALLET, 'network': 'sepolia'}).status_code == 429
    assert client.post(PREFIX + '/transactions/preview', json=transaction()).status_code == 429
    with TestClient(create_app(Settings(rate_limit_per_minute=1, snapshot_db=str(tmp_path / 'rate.sqlite3')))) as limited:
        assert limited.get(PREFIX + '/capabilities').status_code == 200
        response = limited.get(PREFIX + '/capabilities', headers={'Origin': 'http://localhost:3002'})
        assert response.status_code == 429 and response.headers['Retry-After']
        assert response.headers['Access-Control-Allow-Origin'] == 'http://localhost:3002'
        assert response.headers['X-Request-ID']


def test_configuration_rejects_arbitrary_networks_and_insecure_production():
    with pytest.raises(ValidationError):
        Settings(rpc_urls={'unknown': 'https://rpc.example'})
    with pytest.raises(ValidationError):
        Settings(environment='production', local_fixtures_enabled=False, rpc_urls={'sepolia': 'http://127.0.0.1:8545'})
    with pytest.raises(ValidationError):
        Settings(simulation_networks=('sepolia',))
    with pytest.raises(ValidationError):
        Settings(rpc_urls={'sepolia': 'https://user:secret@rpc.example'})


@pytest.mark.asyncio
async def test_rpc_transport_never_accepts_broadcast_method(api):
    _, _, app = api
    with pytest.raises(ValueError, match='read-only'):
        await app.state.kagami.rpc.call('sepolia', 'eth_sendRawTransaction', ['0x00'])
