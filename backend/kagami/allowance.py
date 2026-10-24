"""Discover bounded Approval candidates and verify state at a recorded block."""
from __future__ import annotations
import asyncio
import time

from eth_abi import decode, encode
from eth_utils import keccak, to_checksum_address

from backend.kagami.rpc import Rpc, RpcError, hex_bytes, quantity
from backend.models.kagami import Evidence, MAX_UINT256, Permission, now

APPROVAL_TOPIC = '0x' + keccak(text='Approval(address,address,uint256)').hex()


def address_topic(address: str) -> str:
    return '0x' + address[2:].lower().zfill(64)


def allowance_data(owner: str, spender: str) -> str:
    return '0xdd62ed3e' + encode(['address', 'address'], [owner, spender]).hex()


def uint_word(value: bytes) -> int:
    if len(value) != 32:
        raise RpcError('Token returned invalid uint256 data.')
    return int.from_bytes(value, 'big')


async def token_metadata(rpc: Rpc, network: str, token: str, block: int) -> tuple[str | None, int | None]:
    symbol, decimals = None, None
    try:
        raw = await rpc.contract_call(network, token, '0x95d89b41', block)
        if len(raw) == 32:
            candidate = raw.rstrip(b'\0').decode('utf-8')
        else:
            candidate = decode(['string'], raw)[0]
        if candidate and len(candidate) <= 64 and not any(ord(c) < 32 or ord(c) == 127 for c in candidate):
            symbol = candidate
    except Exception:
        # Metadata is optional and is never used to establish an allowance.
        pass
    try:
        value = uint_word(await rpc.contract_call(network, token, '0x313ce567', block))
        if value <= 255:
            decimals = value
    except RpcError:
        pass
    return symbol, decimals


async def inspect_allowances(rpc: Rpc, network: str, wallet: str, block: int):
    settings = rpc.settings
    started = time.monotonic()
    start = max(0, block - settings.approval_lookback_blocks + 1)
    candidates: dict[tuple[str, str], str] = {}
    limitations = [
        f'Approval discovery searched blocks {start}–{block} only. Older approvals and nonstandard permissions may be missing.',
        'Permit2, NFT operators, off-chain permits and smart-wallet internal permissions are not covered.',
    ]
    evidence = [Evidence(id='discovery', label='Bounded Approval-event discovery', source='chain',
                         reference=f'{network}: eth_getLogs Approval(owner={wallet}) blocks {start}-{block}')]
    discovery_ok = True
    use_indexer = network in settings.approval_indexer_networks
    if use_indexer:
        start = 0
        limitations[0] = f'Historical approval candidates came from a bounded Blockscout indexer query through block {block}; indexing, truncation and candidate limits may omit permissions.'
        evidence[0] = Evidence(id='discovery', label='Indexed Approval-event candidates', source='service',
                               reference=f'Blockscout {network}: owner={wallet}; blocks 0-{block}; maximum 1000 returned events; current allowances independently verified by RPC.')
    ranges = [(0, block)] if use_indexer else [(low, min(block, low + settings.approval_chunk_blocks - 1))
                                               for low in range(start, block + 1, settings.approval_chunk_blocks)]
    for low, high in ranges:
        try:
            if use_indexer and low == 0:
                from backend.kagami.indexer import indexed_approvals
                logs = await indexed_approvals(rpc, network, wallet, block)
            else:
                logs = await rpc.call(network, 'eth_getLogs', [{
                    'fromBlock': hex(low), 'toBlock': hex(high),
                    'topics': [APPROVAL_TOPIC, address_topic(wallet)],
                }])
            if not isinstance(logs, list) or len(logs) > 4000:
                raise RpcError()
            for log in logs:
                if not isinstance(log, dict):
                    raise RpcError()
                if log.get('removed') is True:
                    continue
                topics = log.get('topics')
                if isinstance(topics, list):
                    topics = [topic for topic in topics if topic is not None]
                if not isinstance(topics, list) or len(topics) != 3:
                    # ERC721 Approval has a fourth indexed tokenId; it is not an ERC20 allowance.
                    continue
                if str(topics[0]).lower() != APPROVAL_TOPIC.lower() or str(topics[1]).lower() != address_topic(wallet):
                    raise RpcError()
                spender_raw = hex_bytes(topics[2], 32)
                if any(spender_raw[:12]):
                    raise RpcError()
                hex_bytes(log.get('data'), 32)
                if not low <= quantity(log.get('blockNumber')) <= high:
                    raise RpcError()
                token = to_checksum_address(hex_bytes(log.get('address'), 20))
                spender = to_checksum_address(spender_raw[12:])
                tx_hash = '0x' + hex_bytes(log.get('transactionHash'), 32).hex()
                candidates[(token, spender)] = tx_hash
                if len(candidates) >= settings.approval_max_candidates:
                    limitations.append('Candidate limit reached; additional approvals were not inspected.')
                    discovery_ok = False
                    break
        except (RpcError, ValueError, TypeError):
            limitations.append(f'Approval discovery was incomplete for blocks {low}–{high}.')
            discovery_ok = False
            if use_indexer and low == 0:
                recent = max(1, block - settings.approval_lookback_blocks + 1)
                ranges.extend((n, min(block, n + settings.approval_chunk_blocks - 1))
                              for n in range(recent, block + 1, settings.approval_chunk_blocks))
                limitations.append('Historical discovery failed after retrying. Recent Approval events were checked directly; older permissions may be missing.')
                evidence[0].reference += f' Historical query was incomplete; fallback eth_getLogs checked blocks {recent}-{block}.'
        if len(candidates) >= settings.approval_max_candidates:
            break

    permissions = []
    semaphore = asyncio.Semaphore(4)
    async def verify(index, token, spender, transaction_hash):
        async with semaphore:
            return index, await verify_allowance(rpc, network, wallet, token, spender, block, index,
                                                f'discovery transaction={transaction_hash}')
    tasks = [asyncio.create_task(verify(index, token, spender, tx))
             for index, ((token, spender), tx) in enumerate(candidates.items())]
    if tasks:
        try:
            done, pending = await asyncio.wait(tasks, timeout=max(1, settings.kagami_timeout_seconds - (time.monotonic() - started) - 6))
        finally:
            unfinished = [task for task in tasks if not task.done()]
            for task in unfinished:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
        if pending:
            limitations.append('Verification time budget reached; unchecked candidates were omitted.')
        verified = []
        for task in done:
            try:
                verified.append(task.result())
            except RpcError:
                limitations.append('A candidate allowance could not be verified; no permission was inferred from its historical event.')
        for index, (permission, item) in sorted(verified, key=lambda value: value[0]):
            permissions.append(permission)
            evidence.append(item)
    coverage = 'unavailable' if (not discovery_ok and not candidates) or (candidates and not permissions) else 'partial'
    return permissions, evidence, limitations, coverage


async def verify_allowance(rpc: Rpc, network: str, wallet: str, token: str, spender: str,
                           block: int, index: int = 0, provenance: str = 'User-supplied token/spender pair'):
    """A candidate or user input is never accepted without an actual state read."""
    amount = uint_word(await rpc.contract_call(network, token, allowance_data(wallet, spender), block))
    try:
        symbol, decimals = await asyncio.wait_for(token_metadata(rpc, network, token, block), timeout=2)
    except TimeoutError:
        # A slow name/decimals lookup must not discard a verified permission.
        symbol, decimals = None, None
    key = f'allowance-{index}'
    item = Evidence(id=key, label='Verified current ERC-20 allowance', source='chain',
                    reference=f'{network}: token={token}; allowance({wallet},{spender})={amount}; block={block}; {provenance}')
    unlimited = amount == MAX_UINT256
    permission = Permission(
        id=key, type='erc20', owner=wallet, spender=spender, token=token,
        symbol=symbol, decimals=decimals, allowance_raw=str(amount),
        allowance_kind='zero' if amount == 0 else 'unlimited' if unlimited else 'finite',
        active=amount > 0, model_removable=amount > 0,
        severity='none' if amount == 0 else 'review',
        title='Unlimited token allowance' if unlimited else 'Inactive token allowance' if amount == 0 else 'Active token allowance',
        explanation=(
            'The token returned the maximum uint256 allowance. This is broad spending authority, not proof that the spender is malicious.' if unlimited else
            'The current token allowance is zero. This token/spender pair has no active allowance at the verification block.' if amount == 0 else
            'The token returned a nonzero current allowance. The spender reputation and token implementation have not been audited.'),
        checked_at=now(), evidence_ids=[key, 'discovery'],
    )
    return permission, item

