"""Recognize only the exact EIP-7702 0xef0100 || address designation."""
from eth_utils import to_checksum_address

from backend.kagami.rpc import Rpc, hex_bytes
from backend.models.kagami import Evidence, Permission, now


async def inspect_delegation(rpc: Rpc, network: str, wallet: str, block: int):
    code = hex_bytes(await rpc.call(network, 'eth_getCode', [wallet, hex(block)]))
    evidence = Evidence(id='account-code', label='Account code read', source='chain',
                        reference=f'{network}: eth_getCode({wallet}, block={block}); code=0x{code.hex()[:512]}; length={len(code)} bytes')
    limits = ['Delegation inspection covers the EIP-7702 code designation only; it does not audit delegated code or enumerate its internal permissions.']
    if len(code) == 23 and code[:3] == b'\xef\x01\x00':
        spender = to_checksum_address(code[3:])
        if int(spender, 16) == 0:
            limits.append('A zero-target delegation designation was observed; no executable authority edge is inferred.')
            return [], [evidence], limits, 'partial'
        permission = Permission(
            id='delegation', type='delegation', owner=wallet, spender=spender,
            allowance_kind='not-applicable', active=True, model_removable=True, severity='review',
            title='EIP-7702 code delegation',
            explanation='Account code designates this implementation for execution. This is account code delegation, not an ERC-20 allowance; implementation safety is unknown.',
            checked_at=now(), evidence_ids=[evidence.id],
        )
        return [permission], [evidence], limits, 'complete'
    if code:
        limits.append('Non-designation contract code was observed; smart-wallet internal authority is not analyzed.')
        return [], [evidence], limits, 'partial'
    return [], [evidence], limits, 'complete'
