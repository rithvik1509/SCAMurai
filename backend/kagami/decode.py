"""Strict, offline ABI decoding. Selector recognition does not audit a contract."""
from eth_abi import decode, encode

from backend.models.kagami import Evidence, Parameter, TransactionInput, TransactionResult, now

SELECTORS = {
    '095ea7b3': ('approve', ['address', 'uint256'], ['spender', 'amountRaw']),
    'a9059cbb': ('transfer', ['address', 'uint256'], ['recipient', 'amountRaw']),
    '23b872dd': ('transferFrom', ['address', 'address', 'uint256'], ['owner', 'recipient', 'amountRaw']),
}


def decode_transaction(request: TransactionInput) -> TransactionResult:
    result = TransactionResult(
        network=request.network, sender=request.sender, target=request.target,
        status='unsupported', checked_at=now(), expected_action=request.claimed_purpose or None,
        limitations=[
            'Static calldata decoding only: no execution, balance change or allowance change is established by decoding.',
            'Function selectors can collide; this interpretation assumes the target implements the indicated ERC-20 ABI.',
            'Claimed purpose is user-supplied text. No automatic intent or fraud conclusion is inferred.',
        ],
    )
    signature = SELECTORS.get(request.calldata[2:10].lower())
    if signature is None:
        result.limitations.append('Unknown selector; no function or effect was invented.')
        return result
    name, types, names = signature
    payload = bytes.fromhex(request.calldata[10:])
    try:
        # Reject trailing bytes, noncanonical address padding, incomplete words.
        if len(payload) != 32 * len(types):
            raise ValueError()
        values = decode(types, payload, strict=True)
        if encode(types, values) != payload:
            raise ValueError()
    except Exception:
        result.limitations.append('Known selector with malformed or noncanonical ABI arguments.')
        return result
    result.status = 'successful'
    result.function_name = name
    result.parameters = [Parameter(name=label, value=str(value)) for label, value in zip(names, values)]
    result.actual_action = f'Decoded ERC-20 {name} request; target behavior is unverified.'
    result.evidence = [Evidence(id='calldata', label='Submitted unsigned calldata', source='service',
                                reference=f'ABI selector=0x{request.calldata[2:10].lower()}; target={request.target}; network={request.network}; decoded parameters only')]
    return result
