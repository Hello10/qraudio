from __future__ import annotations

from enum import Enum
from typing import Iterable


class ProfileName(str, Enum):
    AFSK_BELL = "afsk-bell"
    AFSK_FIFTH = "afsk-fifth"
    GFSK_FIFTH = "gfsk-fifth"
    MFSK = "mfsk"


Profile = ProfileName

PROFILE_NAMES: tuple[ProfileName, ...] = (
    ProfileName.AFSK_BELL,
    ProfileName.AFSK_FIFTH,
    ProfileName.GFSK_FIFTH,
    ProfileName.MFSK,
)

DEFAULT_PROFILE: Profile = ProfileName.AFSK_BELL

_PROFILE_SET = set(PROFILE_NAMES)


def isProfile(value: object) -> bool:
    if isinstance(value, ProfileName):
        return True
    if isinstance(value, str):
        return value in _PROFILE_SET
    return False


def normalizeProfile(value: object, fallback: Profile = DEFAULT_PROFILE) -> Profile:
    if isinstance(value, ProfileName):
        return value
    if isinstance(value, str) and value in _PROFILE_SET:
        return ProfileName(value)
    return fallback


def normalizeProfiles(values: Iterable[object]) -> list[Profile]:
    return [normalizeProfile(value) for value in values]
