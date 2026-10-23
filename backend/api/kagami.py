"""KAGAMI API: matches frontend plural routes and guide singular aliases."""
import asyncio

from fastapi import APIRouter, HTTPException, Request

from backend.kagami.decode import decode_transaction
from backend.core.errors import DependencyUnavailable
from backend.kagami.rpc import RpcError
from backend.kagami.service import BusyError
from backend.kagami.simulate import preview_transaction
from backend.models.kagami import AllowanceRequest, Graph, Permission, TransactionInput, TransactionResult, WalletAnalysis, WalletRequest

router = APIRouter(prefix='/kagami', tags=['KAGAMI'])


@router.get('/capabilities')
async def capabilities(request: Request):
    return request.app.state.kagami.capabilities()


@router.post('/wallet/analyze', response_model=WalletAnalysis, include_in_schema=False)
@router.post('/wallets/analyze', response_model=WalletAnalysis)
async def analyze_wallet(payload: WalletRequest, request: Request):
    try:
        return await request.app.state.kagami.analyze(payload)
    except BusyError:
        raise HTTPException(429, 'Wallet investigation capacity reached. Retry shortly.', headers={'Retry-After': '5'}) from None
    except RpcError as exc:
        raise DependencyUnavailable(str(exc)) from None


@router.post('/wallets/check-allowance', response_model=WalletAnalysis)
async def check_allowance(payload: AllowanceRequest, request: Request):
    return await analyze_wallet(payload, request)


async def load_wallet(identifier: str, request: Request):
    wallet = await asyncio.to_thread(request.app.state.kagami.store.get, identifier)
    if wallet is None:
        raise HTTPException(404, 'Wallet investigation not found or expired.')
    return wallet


@router.get('/wallet/{identifier}', response_model=WalletAnalysis, include_in_schema=False)
@router.get('/wallets/{identifier}', response_model=WalletAnalysis)
async def get_wallet(identifier: str, request: Request):
    return await load_wallet(identifier, request)


@router.get('/wallets/{identifier}/authority', response_model=Graph)
async def authority(identifier: str, request: Request):
    wallet = await load_wallet(identifier, request)
    if wallet.graph is None:
        raise HTTPException(409, 'Authority graph is unavailable.')
    return wallet.graph


@router.get('/wallet/{identifier}/approvals', response_model=list[Permission], include_in_schema=False)
@router.get('/wallets/{identifier}/approvals', response_model=list[Permission])
async def approvals(identifier: str, request: Request):
    return [p for p in (await load_wallet(identifier, request)).permissions if p.type == 'erc20']


@router.get('/wallets/{identifier}/delegations', response_model=list[Permission])
async def delegations(identifier: str, request: Request):
    return [p for p in (await load_wallet(identifier, request)).permissions if p.type == 'delegation']


@router.post('/transaction/decode', response_model=TransactionResult, include_in_schema=False)
@router.post('/transactions/decode', response_model=TransactionResult)
async def decode(payload: TransactionInput):
    return decode_transaction(payload)


@router.post('/transaction/simulate', response_model=TransactionResult, include_in_schema=False)
@router.post('/transactions/preview', response_model=TransactionResult)
async def preview(payload: TransactionInput, request: Request):
    service = request.app.state.kagami
    if service.active >= service.rpc.settings.kagami_max_concurrency:
        raise HTTPException(429, 'Analysis capacity reached. Retry shortly.', headers={'Retry-After': '5'})
    service.active += 1
    try:
        async with asyncio.timeout(service.rpc.settings.kagami_timeout_seconds):
            return await preview_transaction(service.rpc, payload)
    except TimeoutError:
        raise DependencyUnavailable('Transaction preview timed out; no completed effects were returned.') from None
    except RpcError as exc:
        raise DependencyUnavailable(str(exc)) from None
    finally:
        service.active -= 1
