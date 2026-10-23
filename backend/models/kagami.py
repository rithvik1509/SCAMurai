"""Camel-case contracts matching the existing KAGAMI frontend."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Literal

from eth_utils import is_checksum_address, to_checksum_address
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, AfterValidator, model_serializer

Network = Literal['ethereum', 'sepolia', 'arbitrum']
Coverage = Literal['complete', 'partial', 'unavailable']
MAX_UINT256 = 2**256 - 1


def now() -> datetime:
    return datetime.now(timezone.utc)


def checked_address(value: str) -> str:
    body = value[2:]
    if body != body.lower() and body != body.upper() and not is_checksum_address(value):
        raise ValueError('Mixed-case address has an invalid EIP-55 checksum.')
    return to_checksum_address(value)


def checked_uint(value: str) -> str:
    if int(value) > MAX_UINT256:
        raise ValueError('Value exceeds uint256.')
    return value


Address = Annotated[str, StringConstraints(pattern=r'^0x[0-9a-fA-F]{40}$'), AfterValidator(checked_address)]
Uint256 = Annotated[str, StringConstraints(pattern=r'^(0|[1-9][0-9]*)$', max_length=78), AfterValidator(checked_uint)]


def camel(value: str) -> str:
    first, *rest = value.split('_')
    return first + ''.join(item.title() for item in rest)


class Model(BaseModel):
    model_config = ConfigDict(extra='forbid', alias_generator=camel, populate_by_name=True, strict=True)

    @model_serializer(mode='wrap')
    def serialize(self, handler):
        result = handler(self)
        if result.get('error', 'absent') is None:
            result.pop('error')
        return result


class WalletRequest(Model):
    wallet: Address
    network: Network


class AllowanceRequest(WalletRequest):
    token: Address
    spender: Address


class TransactionInput(Model):
    network: Network
    sender: Address
    target: Address
    calldata: Annotated[str, StringConstraints(pattern=r'^0x(?:[0-9a-fA-F]{2}){4,}$', max_length=200000)]
    value_wei: Uint256 = '0'
    claimed_purpose: str = Field(default='', max_length=4000)


class Evidence(Model):
    id: str
    label: str
    source: Literal['chain', 'service']
    reference: str


class Permission(Model):
    id: str
    type: Literal['erc20', 'delegation']
    owner: Address
    spender: Address
    token: Address | None = None
    symbol: str | None = None
    decimals: int | None = Field(default=None, ge=0, le=255)
    allowance_raw: Uint256 | None = None
    allowance_kind: Literal['finite', 'unlimited', 'zero', 'not-applicable']
    active: bool
    model_removable: bool
    severity: Literal['none', 'review', 'high', 'unknown']
    title: str
    explanation: str
    checked_at: datetime
    evidence_ids: list[str]


class Node(Model):
    id: str
    kind: Literal['wallet', 'permission', 'token', 'spender', 'delegation']
    label: str
    address: Address | None = None
    permission_id: str | None = None
    position: dict[str, float]


class Edge(Model):
    id: str
    source: str
    target: str
    label: str
    permission_id: str
    evidence_ids: list[str]


class Graph(Model):
    nodes: list[Node]
    edges: list[Edge]


class CoverageReport(Model):
    approvals: Coverage
    delegations: Coverage


class WalletAnalysis(Model):
    id: str
    demo: bool = False
    wallet: Address
    network: Network
    status: Literal['pending', 'completed', 'partial', 'unsupported', 'failed']
    checked_at: datetime
    permissions: list[Permission] = Field(default_factory=list)
    graph: Graph | None = None
    evidence: list[Evidence] = Field(default_factory=list)
    coverage: CoverageReport
    limitations: list[str]
    findings: list[str] = Field(default_factory=list)
    error: str | None = None


class Parameter(Model):
    name: str
    value: str


class Effect(Model):
    id: str
    kind: Literal['approval', 'balance', 'transfer', 'other']
    label: str
    asset: str
    before: str | None
    after: str | None
    direction: Literal['incoming', 'outgoing', 'permission', 'none']
    evidence_ids: list[str]


class Mismatch(Model):
    finding: str
    evidence_ids: list[str]


class TransactionResult(Model):
    demo: bool = False
    network: Network
    sender: Address
    target: Address
    status: Literal['pending', 'successful', 'reverted', 'unsupported', 'failed', 'inconclusive']
    checked_at: datetime
    function_name: str | None = None
    parameters: list[Parameter] = Field(default_factory=list)
    effects: list[Effect] = Field(default_factory=list)
    expected_action: str | None = None
    actual_action: str | None = None
    mismatches: list[Mismatch] = Field(default_factory=list)
    evidence: list[Evidence] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    error: str | None = None
