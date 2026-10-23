"""Planned endpoint: ``POST /api/v1/rescue``.

Post-incident guidance will be implemented later. Any guidance must remain
non-executing: the backend never signs, broadcasts, or moves funds, and never
asks for private keys, seed phrases, or OTPs.
"""

from fastapi import APIRouter

router = APIRouter()
