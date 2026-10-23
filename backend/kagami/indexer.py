"""Fixed Blockscout endpoints supply candidates; RPC verifies current state."""
import json

import httpx

from backend.kagami.rpc import Rpc, RpcError

INDEXERS = {
    'ethereum': 'https://eth.blockscout.com/api',
    'sepolia': 'https://eth-sepolia.blockscout.com/api',
    'arbitrum': 'https://arbitrum.blockscout.com/api',
}


async def indexed_approvals(rpc: Rpc, network: str, wallet: str, block: int) -> list:
    from backend.kagami.allowance import APPROVAL_TOPIC, address_topic
    try:
        async with rpc.client.stream('GET', INDEXERS[network], params={
            'module': 'logs', 'action': 'getLogs', 'fromBlock': '0', 'toBlock': str(block),
            'topic0': APPROVAL_TOPIC, 'topic1': address_topic(wallet), 'topic0_1_opr': 'and',
        }, timeout=min(4, rpc.settings.rpc_timeout_seconds)) as response:
            response.raise_for_status()
            body = bytearray()
            async for chunk in response.aiter_bytes():
                body.extend(chunk)
                if len(body) > 4 * 1024 * 1024:
                    raise RpcError('Approval indexer response exceeded the size limit.')
        payload = json.loads(body)
        if not isinstance(payload, dict):
            raise RpcError()
        if payload.get('status') == '0' and payload.get('result') == [] and payload.get('message') == 'No logs found':
            return []
        if payload.get('status') != '1' or not isinstance(payload.get('result'), list) or len(payload['result']) > 1000:
            raise RpcError()
        return payload['result']
    except (httpx.HTTPError, ValueError, TypeError):
        raise RpcError('Approval history indexer is unavailable.') from None
