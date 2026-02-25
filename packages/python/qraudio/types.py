from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from .profiles import Profile


@dataclass
class EncodeResult:
    sampleRate: int
    profile: Profile
    samples: list[float]
    durationMs: float
    payloadBytes: int


@dataclass
class DecodeResult:
    json: Any
    profile: Profile
    startSample: int
    endSample: int
    confidence: float


ScanResult = DecodeResult


@dataclass
class WavData:
    sampleRate: int
    channels: int
    format: Literal["pcm16", "float32"]
    samples: list[float]


@dataclass
class EncodeWavResult(EncodeResult):
    wav: bytes


@dataclass
class PrependWavResult:
    wav: bytes
    payload: EncodeResult
    sampleRate: int
