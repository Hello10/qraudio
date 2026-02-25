from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from ..profiles import Profile, ProfileName
from .constants import (
    PROFILE_CHIME,
    PROFILE_CHORD,
    PROFILE_CLASSIC,
    PROFILE_MASK,
    PROFILE_SHIFT,
    PROFILE_SMOOTH,
)


@dataclass
class ProfileSettings:
    modulation: str
    baud: float
    markFreq: float
    spaceFreq: float
    preambleMs: float
    fadeMs: float
    leadInToneMs: float
    leadInGapMs: float
    tailToneMs: float
    tailGapMs: float
    bt: Optional[float] = None
    spanSymbols: Optional[int] = None
    tones: Optional[list[float]] = None
    bitsPerSymbol: Optional[int] = None


def getProfileSettings(profile: Profile) -> ProfileSettings:
    if profile == ProfileName.AFSK_BELL:
        return ProfileSettings(
            modulation="afsk",
            baud=1200,
            markFreq=1200,
            spaceFreq=2200,
            preambleMs=500,
            fadeMs=10,
            leadInToneMs=150,
            leadInGapMs=0,
            tailToneMs=150,
            tailGapMs=0,
        )
    if profile == ProfileName.AFSK_FIFTH:
        return ProfileSettings(
            modulation="afsk",
            baud=1200,
            markFreq=880,
            spaceFreq=1320,
            preambleMs=250,
            fadeMs=20,
            leadInToneMs=150,
            leadInGapMs=0,
            tailToneMs=150,
            tailGapMs=0,
        )
    if profile == ProfileName.GFSK_FIFTH:
        return ProfileSettings(
            modulation="gfsk",
            baud=1200,
            markFreq=880,
            spaceFreq=1320,
            preambleMs=250,
            fadeMs=20,
            leadInToneMs=150,
            leadInGapMs=0,
            tailToneMs=150,
            tailGapMs=0,
            bt=1.0,
            spanSymbols=4,
        )
    if profile == ProfileName.MFSK:
        return ProfileSettings(
            modulation="mfsk",
            baud=600,
            markFreq=900,
            spaceFreq=1200,
            tones=[600, 900, 1200, 1500],
            bitsPerSymbol=2,
            preambleMs=300,
            fadeMs=20,
            leadInToneMs=150,
            leadInGapMs=0,
            tailToneMs=150,
            tailGapMs=0,
        )

    return ProfileSettings(
        modulation="afsk",
        baud=1200,
        markFreq=1200,
        spaceFreq=2200,
        preambleMs=500,
        fadeMs=10,
        leadInToneMs=150,
        leadInGapMs=0,
        tailToneMs=150,
        tailGapMs=0,
    )


def profileFlag(profile: Profile) -> int:
    if profile == ProfileName.AFSK_BELL:
        return PROFILE_CLASSIC
    if profile == ProfileName.MFSK:
        return PROFILE_CHORD
    if profile == ProfileName.AFSK_FIFTH:
        return PROFILE_CHIME
    if profile == ProfileName.GFSK_FIFTH:
        return PROFILE_SMOOTH
    return PROFILE_CLASSIC


def profileFromFlags(flags: int) -> Optional[Profile]:
    value = (flags & PROFILE_MASK) >> PROFILE_SHIFT
    if value == 0:
        return ProfileName.AFSK_BELL
    if value == 1:
        return ProfileName.MFSK
    if value == 2:
        return ProfileName.AFSK_FIFTH
    if value == 3:
        return ProfileName.GFSK_FIFTH
    return None
