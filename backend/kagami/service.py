"""Bounded wallet investigation orchestrator and capability reporting."""
import asyncio
import uuid

from backend.kagami.allowance import inspect_allowances, verify_allowance
from backend.kagami.delegation import inspect_delegation
from backend.kagami.graph import build_graph
from backend.kagami.rpc import CHAIN_IDS, Rpc, RpcError
from backend.kagami.store import SnapshotStore
from backend.models.kagami import AllowanceRequest, CoverageReport, Evidence, WalletAnalysis, WalletRequest, now


class BusyError(RuntimeError):
    pass


class KagamiService:
    def __init__(self, rpc: Rpc, store: SnapshotStore):
        self.rpc, self.store = rpc, store
        self.active = 0

    def capabilities(self):
        return {
            'available': True,
            'networks': [{'id': name, 'walletAnalysis': name in self.rpc.settings.rpc_urls,
                          'decode': True, 'preview': name in self.rpc.settings.simulation_networks} for name in CHAIN_IDS],
            'limitations': [
                'Wallet analysis requires a configured RPC endpoint on the selected network.',
                'Approval discovery uses bounded history queries where configured. A specific token/spender pair can also be verified directly. NFT operators and Permit2 are not supported.',
                'Preview supports ERC-20 approve, transfer and transferFrom and requires eth_simulateV1 support from the configured RPC.',
                'Capability flags describe configuration, not a guarantee of provider availability.',
            ],
        }

    async def analyze(self, request: WalletRequest | AllowanceRequest) -> WalletAnalysis:
        if request.network not in self.rpc.settings.rpc_urls:
            raise RpcError('No RPC provider configured for this network.')
        if self.active >= self.rpc.settings.kagami_max_concurrency:
            raise BusyError('Wallet investigation capacity reached. Retry shortly.')
        self.active += 1
        try:
            async with asyncio.timeout(self.rpc.settings.kagami_timeout_seconds):
                block, block_hash = await self.rpc.block(request.network)
                limits = ['Pinned block-number reads may be affected by a chain reorganization.',
                          'Findings describe observed permissions, not a safety guarantee. No transaction was signed or sent.']
                evidence = [Evidence(id='block', label='Verification chain state', source='chain',
                                     reference=f'{request.network}; chain_id={CHAIN_IDS[request.network]}; block={block}; hash={block_hash}')]
                if isinstance(request, AllowanceRequest):
                    permission, verified = await verify_allowance(self.rpc, request.network, request.wallet,
                                                                  request.token, request.spender, block)
                    permissions, approval_evidence, approval_limits, approvals = [permission], [
                        Evidence(id='discovery', label='User-selected allowance pair', source='service',
                                 reference=f'Token={request.token}; spender={request.spender}; supplied by user and verified on-chain.'), verified
                    ], ['Only the requested token/spender pair was verified; other token allowances were not discovered.'], 'partial'
                else:
                    permissions, approval_evidence, approval_limits, approvals = await inspect_allowances(
                        self.rpc, request.network, request.wallet, block)
                evidence.extend(approval_evidence)
                limits.extend(approval_limits)
                try:
                    delegation, code_evidence, code_limits, delegations = await inspect_delegation(
                        self.rpc, request.network, request.wallet, block)
                    permissions.extend(delegation)
                    evidence.extend(code_evidence)
                    limits.extend(code_limits)
                except RpcError:
                    delegations = 'unavailable'
                    limits.append('Account-code retrieval failed; delegation coverage is unavailable.')
                snapshot = WalletAnalysis(
                    id='wallet_' + uuid.uuid4().hex, wallet=request.wallet, network=request.network,
                    status='partial', checked_at=now(), permissions=permissions,
                    graph=build_graph(request.wallet, permissions), evidence=evidence,
                    coverage=CoverageReport(approvals=approvals, delegations=delegations),
                    limitations=limits,
                    findings=[f'{sum(p.active and p.type == "erc20" for p in permissions)} verified active token allowances in the inspected candidates.',
                              f'{sum(p.active and p.type == "delegation" for p in permissions)} supported account-code delegations observed.'],
                )
                await asyncio.to_thread(self.store.put, snapshot)
                return snapshot
        except TimeoutError:
            raise RpcError('Wallet investigation exceeded its time limit; no completed report was returned.') from None
        finally:
            self.active -= 1
