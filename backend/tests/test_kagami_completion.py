"""Indexer, direct verification and multi-call simulation completion checks."""
import json

import httpx
import pytest
from eth_abi import encode
from fastapi.testclient import TestClient

from backend.core.config import Settings
from backend.main import create_app
from backend.tests.test_kagami import Provider, WALLET, TOKEN, SPENDER, PREFIX, word, transaction
from backend.kagami.allowance import APPROVAL_TOPIC, address_topic


def client_for(tmp_path, provider, indexer=False):
    return TestClient(create_app(Settings(
        environment='test', rpc_urls={'sepolia': 'https://rpc.example'}, simulation_networks=('sepolia',),
        approval_indexer_networks=('sepolia',) if indexer else (), snapshot_db=str(tmp_path / 'wallets.sqlite3'),
    ), rpc_transport=httpx.MockTransport(provider)))


def test_direct_allowance_needs_no_discovery_and_builds_verified_graph(tmp_path):
    provider = Provider()
    provider.discovery_error = True
    with client_for(tmp_path, provider) as client:
        response = client.post(PREFIX + '/wallets/check-allowance', json={
            'wallet': WALLET, 'network': 'sepolia', 'token': TOKEN, 'spender': SPENDER})
        assert response.status_code == 200, response.text
        report = response.json()
        assert report['demo'] is False and report['permissions'][0]['active']
        assert report['graph']['edges'] and report['coverage']['approvals'] == 'partial'
        assert not any(c['method'] == 'eth_getLogs' for c in provider.calls)
        assert any('Only the requested' in text for text in report['limitations'])
        assert client.get(PREFIX + '/wallets/' + report['id']).json() == report
        bad = client.post(PREFIX + '/wallets/check-allowance', json={
            'wallet': WALLET, 'network': 'sepolia', 'token': 'bad', 'spender': SPENDER})
        assert bad.status_code == 422


@pytest.mark.parametrize('case', ['valid', 'wrong-owner', 'future-block', 'empty', 'error'])
def test_indexer_candidates_are_validated_and_verified(tmp_path, case):
    rpc = Provider()
    def handler(request):
        if request.method == 'GET':
            assert request.url.host == 'eth-sepolia.blockscout.com'
            assert request.url.params['toBlock'] == '1000'
            logs = [{'address': TOKEN, 'topics': [APPROVAL_TOPIC, address_topic(WALLET), address_topic(SPENDER), None],
                     'data': word(10), 'blockNumber': '0x3e8', 'transactionHash': '0x' + 'bb' * 32}]
            if case == 'wrong-owner': logs[0]['topics'][1] = address_topic(SPENDER)
            if case == 'future-block': logs[0]['blockNumber'] = '0xffff'
            if case == 'empty': return httpx.Response(200, json={'status': '0', 'message': 'No logs found', 'result': []})
            if case == 'error': return httpx.Response(429, text='not public')
            return httpx.Response(200, json={'status': '1', 'result': logs})
        return rpc(request)
    with client_for(tmp_path, handler, indexer=True) as client:
        response = client.post(PREFIX + '/wallets/analyze', json={'wallet': WALLET, 'network': 'sepolia'})
        assert response.status_code == 200, response.text
        report = response.json()
        allowances = [p for p in report['permissions'] if p['type'] == 'erc20']
        assert len(allowances) == (1 if case == 'valid' else 0 if case == 'empty' else 2)
        assert any(c['method'] == 'eth_getLogs' for c in rpc.calls) == (case not in ('valid', 'empty'))
        if case == 'valid':
            assert allowances[0]['allowanceRaw'] != '10'  # event amount never substitutes for state
            assert any(e['source'] == 'service' and 'Blockscout' in e['reference'] for e in report['evidence'])


@pytest.mark.parametrize('method', ['transfer', 'transferFrom'])
def test_transfer_previews_report_measured_balance_changes(tmp_path, method):
    provider = Provider()
    def handler(request):
        body = json.loads(request.content)
        if body['method'] == 'eth_simulateV1':
            calls = body['params'][0]['blockStateCalls'][0]['calls']
            assert len(calls) == 5 and calls[0] == calls[3] and calls[1] == calls[4]
            return httpx.Response(200, json={'jsonrpc': '2.0', 'id': body['id'], 'result': [{'calls': [
                {'status': '0x1', 'returnData': word(100)}, {'status': '0x1', 'returnData': word(10)},
                {'status': '0x1', 'returnData': word(1)},
                {'status': '0x1', 'returnData': word(95)}, {'status': '0x1', 'returnData': word(14)},
            ]}]})
        return provider(request)
    calldata = ('0xa9059cbb' + encode(['address', 'uint256'], [SPENDER, 5]).hex() if method == 'transfer' else
                '0x23b872dd' + encode(['address', 'address', 'uint256'], [WALLET, SPENDER, 5]).hex())
    payload = transaction()
    payload['calldata'] = calldata
    with client_for(tmp_path, handler) as client:
        response = client.post(PREFIX + '/transactions/preview', json=payload)
        assert response.status_code == 200, response.text
        result = response.json()
        assert result['status'] == 'successful'
        assert result['effects'][0]['before'] == '100' and result['effects'][0]['after'] == '95'
        assert result['effects'][1]['after'] == '14'  # measured value, not requested 5
        assert result['effects'][0]['direction'] == 'outgoing' and result['effects'][1]['direction'] == 'incoming'


def test_transient_indexer_failure_retries_before_recent_fallback(tmp_path):
    rpc = Provider()
    history_calls = []
    def handler(request):
        if request.method == 'GET':
            history_calls.append(request)
            if len(history_calls) == 1:
                raise httpx.ReadTimeout('temporary history timeout', request=request)
            return httpx.Response(200,json={'status':'1','result':[{
                'address':TOKEN,'topics':[APPROVAL_TOPIC,address_topic(WALLET),address_topic(SPENDER),None],
                'data':word(3),'blockNumber':'0x3e8','transactionHash':'0x'+'ab'*32}]})
        return rpc(request)
    with client_for(tmp_path,handler,indexer=True) as client:
        response=client.post(PREFIX+'/wallets/analyze',json={'wallet':WALLET,'network':'sepolia'})
        assert response.status_code == 200
        assert len(history_calls) == 2
        assert len(response.json()['permissions']) == 2 # one allowance and one code delegation
        assert not any(c['method']=='eth_getLogs' for c in rpc.calls)
        assert response.json()['permissions'][0]['allowanceRaw'] == str(2**256-1)


def test_slow_optional_metadata_does_not_erase_verified_allowance(tmp_path):
    import asyncio
    rpc=Provider()
    async def handler(request):
        body=json.loads(request.content)
        if body['method']=='eth_call' and body['params'][0]['data']=='0x95d89b41':
            await asyncio.sleep(3)
        return rpc(request)
    with client_for(tmp_path,handler) as client:
        response=client.post(PREFIX+'/wallets/check-allowance',json={
            'wallet':WALLET,'network':'sepolia','token':TOKEN,'spender':SPENDER})
        assert response.status_code == 200
        permission=response.json()['permissions'][0]
        assert permission['active'] and permission['allowanceKind']=='unlimited'
        assert permission['symbol'] is None and permission['decimals'] is None
        assert permission['allowanceRaw']==str(2**256-1)
