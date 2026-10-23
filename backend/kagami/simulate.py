"""Unsigned eth_simulateV1 approval preview with before/after state reads.

No overrides, signing, broadcasting, state writes or real approval changes.
"""
from backend.kagami.allowance import allowance_data, uint_word
from eth_abi import encode
from backend.kagami.decode import decode_transaction
from backend.kagami.rpc import CHAIN_IDS, Rpc, RpcError, hex_bytes
from backend.models.kagami import Effect, Evidence, TransactionInput


async def preview_transaction(rpc: Rpc, request: TransactionInput):
    result = decode_transaction(request)
    result.effects = []
    if request.network not in rpc.settings.simulation_networks:
        result.status = 'unsupported'
        result.limitations.append('eth_simulateV1 preview is not configured for this network.')
        return result
    if result.function_name not in {'approve', 'transfer', 'transferFrom'} or result.status != 'successful':
        result.status = 'unsupported'
        result.limitations.append('Preview supports canonical ERC-20 approve, transfer and transferFrom calldata only.')
        return result
    result.status = 'inconclusive'
    result.limitations = [text for text in result.limitations if not text.startswith('Static calldata decoding only:')]
    result.limitations.extend([
        'Simulation is hypothetical at a recorded parent block; future state, ordering and gas may change the outcome.',
        'eth_simulateV1 ran with validation=false: EVM behavior is simulated, but transaction admission, fees and signatures are not validated.',
        'Only the selected target-token state is measured. Native fees, unrelated tokens and internal permissions are not inspected.',
    ])
    block, block_hash = await rpc.block(request.network)
    approval = result.function_name == 'approve'
    if approval:
        addresses = [result.parameters[0].value]
        inputs = [allowance_data(request.sender, addresses[0])]
    else:
        owner = request.sender if result.function_name == 'transfer' else result.parameters[0].value
        recipient = result.parameters[0].value if result.function_name == 'transfer' else result.parameters[1].value
        addresses = list(dict.fromkeys([owner.lower(), recipient.lower()]))
        inputs = ['0x70a08231' + encode(['address'], [address]).hex() for address in addresses]
    reads = [{'from': request.sender, 'to': request.target, 'input': data, 'gas': hex(100000), 'value': '0x0'} for data in inputs]
    unsigned = {'from': request.sender, 'to': request.target, 'input': request.calldata,
                'value': hex(int(request.value_wei)), 'gas': hex(500000)}
    try:
        simulation = await rpc.call(request.network, 'eth_simulateV1', [{
            'blockStateCalls': [{'calls': [*reads, unsigned, *reads]}],
            'validation': False, 'traceTransfers': False, 'returnFullTransactions': False,
        }, hex(block)])
    except RpcError as exc:
        if exc.code == -32601:
            result.status = 'unsupported'
            result.limitations.append('The configured RPC provider does not support eth_simulateV1.')
            return result
        raise
    if (not isinstance(simulation, list) or len(simulation) != 1 or not isinstance(simulation[0], dict)
        or not isinstance(simulation[0].get('calls'), list) or len(simulation[0]['calls']) != len(reads) * 2 + 1):
        raise RpcError('Simulation provider returned an unsupported response.')
    calls = simulation[0]['calls']
    before, execution, after = calls[:len(reads)], calls[len(reads)], calls[len(reads) + 1:]
    if any(not isinstance(call, dict) or call.get('status') not in ('0x0', '0x1') for call in calls):
        raise RpcError('Simulation provider returned invalid call statuses.')
    result.evidence.append(Evidence(id='simulation', label='Unsigned ERC-20 simulation', source='service',
                                   reference=f'eth_simulateV1; network={request.network}; chain_id={CHAIN_IDS[request.network]}; parent block={block}; parent hash={block_hash}; target={request.target}; execution status={execution["status"]}'))
    if execution['status'] == '0x0':
        result.status = 'reverted'
        result.actual_action = 'The unsigned token call failed in the simulated execution.'
        return result
    # EVM success alone is not ERC-20 success: a token can return false.
    returned = hex_bytes(execution.get('returnData'))
    if returned not in {b'', (1).to_bytes(32, 'big')}:
        result.limitations.append('The target did not return a canonical ERC-20 success value; no permission effect is asserted.')
        return result
    if any(call['status'] != '0x1' for call in [*before, *after]):
        result.limitations.append('Before/after state reads failed; no state change was inferred from input or events.')
        return result
    for index, address in enumerate(addresses):
        raw_before = uint_word(hex_bytes(before[index].get('returnData')))
        raw_after = uint_word(hex_bytes(after[index].get('returnData')))
        evidence_id = 'allowance-state' if approval else f'balance-state-{index}'
        result.evidence.append(Evidence(id=evidence_id, label='Simulated allowance state reads' if approval else 'Simulated token balance reads', source='service',
                                       reference=f'In the same simulated block: target={request.target}; address={address}; {"allowance" if approval else "balance"} {raw_before} -> {raw_after}; raw uint256 units'))
        result.effects.append(Effect(id=f'state-effect-{index}', kind='approval' if approval else 'balance',
                                     label=f'Simulated {"allowance for spender" if approval else "token balance for"} {address} (raw units)', asset=request.target,
                                     before=str(raw_before), after=str(raw_after), direction='permission' if approval else 'incoming' if raw_after > raw_before else 'outgoing' if raw_after < raw_before else 'none',
                                     evidence_ids=['simulation', evidence_id]))
    result.status = 'successful'
    result.actual_action = 'Unsigned simulation returned successfully; measured target-token state is shown in raw units.'
    return result
