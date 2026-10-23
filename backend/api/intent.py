"""Planned endpoint: ``POST /api/v1/intent/compare``.

The Promise vs. Action Engine comparison endpoint is not implemented in this
foundation step. Later logic will compare promised outcomes, requested
actions, and what a decoded instruction authorizes.
"""

from fastapi import APIRouter

router = APIRouter()
