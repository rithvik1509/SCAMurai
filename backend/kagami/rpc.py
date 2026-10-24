"""Bounded, fixed-endpoint, strictly read-only Ethereum JSON-RPC transport."""
from __future__ import annotations

import itertools
import json
import re

import httpx

from backend.core.config import Settings

CHAIN_IDS = {'ethereum': 1, 'sepolia': 11155111, 'arbitrum': 42161}
READ_METHODS = frozenset({'eth_chainId', 'eth_blockNumber', 'eth_getBlockByNumber',
                          'eth_getCode', 'eth_getLogs', 'eth_call', 'eth_simulateV1'})


class RpcError(RuntimeError):
    def __init__(self, message: str = 'Blockchain provider unavailable or returned invalid data.', *, code: int | None = None):
        super().__init__(message)
        self.code = code


def quantity(value) -> int:
    if not isinstance(value, str) or not re.fullmatch(r'0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)', value) or len(value) > 66:
        raise RpcError()
    return int(value, 16)


def hex_bytes(value, length: int | None = None) -> bytes:
    if not isinstance(value, str) or not re.fullmatch(r'0x(?:[0-9a-fA-F]{2})*', value) or len(value) > 200000:
        raise RpcError()
    result = bytes.fromhex(value[2:])
    if length is not None and len(result) != length:
        raise RpcError()
    return result


class Rpc:
    def __init__(self, settings: Settings, client: httpx.AsyncClient):
        self.settings = settings
        self.client = client
        self.ids = itertools.count(1)

    async def call(self, network: str, method: str, params: list):
        if method not in READ_METHODS:
            raise ValueError('RPC method is outside the read-only allowlist.')
        secret = self.settings.rpc_urls.get(network)
        if secret is None:
            raise RpcError('No RPC provider configured for this network.')
        request_id = next(self.ids)
        try:
            async with self.client.stream('POST', secret.get_secret_value(), json={
                'jsonrpc': '2.0', 'id': request_id, 'method': method, 'params': params,
            }, timeout=self.settings.rpc_timeout_seconds) as response:
                response.raise_for_status()
                chunks = bytearray()
                async for chunk in response.aiter_bytes():
                    chunks.extend(chunk)
                    if len(chunks) > 4 * 1024 * 1024:
                        raise RpcError('Blockchain response exceeded the size limit.')
            payload = json.loads(chunks)
            if not isinstance(payload, dict) or payload.get('id') != request_id or payload.get('jsonrpc') != '2.0':
                raise RpcError()
            if 'error' in payload:
                code = payload['error'].get('code') if isinstance(payload['error'], dict) else None
                raise RpcError(code=code if type(code) is int else None)
            if 'result' not in payload:
                raise RpcError()
            return payload['result']
        except httpx.TimeoutException:
            raise RpcError('The blockchain connection timed out. Please retry shortly.') from None
        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code
            if status == 429:
                raise RpcError('The blockchain provider is busy. Please retry shortly.') from None
            if status in (401, 403):
                raise RpcError('The blockchain provider refused this server connection. The service operator must check its provider access.') from None
            raise RpcError(f'The blockchain provider returned HTTP {status}. Please retry shortly.') from None
        except (httpx.HTTPError, ValueError, TypeError, OverflowError):
            # Never propagate provider URLs, credentials, raw errors or response bodies.
            raise RpcError() from None

    async def block(self, network: str) -> tuple[int, str]:
        chain_id = quantity(await self.call(network, 'eth_chainId', []))
        if chain_id != CHAIN_IDS[network]:
            raise RpcError('Configured RPC returned the wrong chain ID.')
        number = quantity(await self.call(network, 'eth_blockNumber', []))
        block = await self.call(network, 'eth_getBlockByNumber', [hex(number), False])
        if not isinstance(block, dict) or quantity(block.get('number')) != number:
            raise RpcError()
        hex_bytes(block.get('hash'), 32)
        return number, block['hash']

    async def contract_call(self, network: str, token: str, data: str, block: int) -> bytes:
        return hex_bytes(await self.call(network, 'eth_call', [{'to': token, 'data': data}, hex(block)]))
