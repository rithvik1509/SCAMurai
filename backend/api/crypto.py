"""Planned endpoint: ``POST /api/v1/crypto/analyze``.

Decoded calldata analysis will live here. Decoding must rely on
``eth-abi``/``eth-utils`` facts and must not infer token symbols, decimals, or
address identity without a trusted source. No decoder logic is implemented in
this foundation step.
"""

from fastapi import APIRouter

router = APIRouter()
