"""Fixed browser profiles; no user-controlled launch arguments are accepted."""

from __future__ import annotations

from dataclasses import dataclass

from backend.models.yokai_schemas import ProfileId


@dataclass(frozen=True)
class Persona:
    id: ProfileId
    label: str
    width: int
    height: int
    locale: str = "en-US"
    timezone_id: str = "UTC"
    color_scheme: str = "light"
    is_mobile: bool = False
    has_touch: bool = False
    returning: bool = False
    user_agent: str | None = None


PERSONAS: dict[ProfileId, Persona] = {
    ProfileId.DESKTOP: Persona(
        ProfileId.DESKTOP, "Desktop", 1440, 900
    ),
    ProfileId.MOBILE: Persona(
        ProfileId.MOBILE,
        "Mobile",
        390,
        844,
        is_mobile=True,
        has_touch=True,
        user_agent=(
            "Mozilla/5.0 (Linux; Android 14; Pixel 7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/131.0.0.0 Mobile Safari/537.36"
        ),
    ),
    ProfileId.RETURNING: Persona(
        ProfileId.RETURNING,
        "Returning visitor",
        1440,
        900,
        returning=True,
    ),
}


def persona_for(profile_id: ProfileId) -> Persona:
    return PERSONAS[profile_id]
