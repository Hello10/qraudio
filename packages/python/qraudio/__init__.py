from __future__ import annotations

from .profiles import ProfileName, PROFILE_NAMES, DEFAULT_PROFILE, isProfile, normalizeProfile
from .encode import encode
from .decode import decode, scan
from .io.wav import (
    encodeWav,
    decodeWav,
    scanWav,
    prependPayloadToWav,
    encodeWavSamples,
    decodeWavSamples,
)
from .io.fs import (
    encodeWavFile,
    decodeWavFile,
    scanWavFile,
    prependPayloadToWavFile,
)
from .types import (
    EncodeResult,
    DecodeResult,
    ScanResult,
    EncodeWavResult,
    PrependWavResult,
    WavData,
)

__all__ = [
    "ProfileName",
    "PROFILE_NAMES",
    "DEFAULT_PROFILE",
    "isProfile",
    "normalizeProfile",
    "encode",
    "decode",
    "scan",
    "encodeWav",
    "decodeWav",
    "scanWav",
    "prependPayloadToWav",
    "encodeWavSamples",
    "decodeWavSamples",
    "encodeWavFile",
    "decodeWavFile",
    "scanWavFile",
    "prependPayloadToWavFile",
    "EncodeResult",
    "DecodeResult",
    "ScanResult",
    "EncodeWavResult",
    "PrependWavResult",
    "WavData",
]
