from __future__ import annotations

from pathlib import Path
from typing import Optional, Union

from .wav import (
    decodeWav,
    encodeWav,
    prependPayloadToWav,
    scanWav,
    WavFormat,
)
from ..profiles import Profile
from ..types import DecodeResult, EncodeWavResult, PrependWavResult, ScanResult


def encodeWavFile(
    out_path: Union[str, Path],
    payload: object,
    *,
    wav_format: WavFormat = "pcm16",
    **options,
) -> EncodeWavResult:
    result = encodeWav(payload, wav_format=wav_format, **options)
    Path(out_path).write_bytes(result.wav)
    return result


def decodeWavFile(
    path: Union[str, Path],
    *,
    profile: Optional[Union[Profile, str]] = None,
    **options,
) -> DecodeResult:
    data = Path(path).read_bytes()
    return decodeWav(data, profile=profile, **options)


def scanWavFile(
    path: Union[str, Path],
    *,
    profile: Optional[Union[Profile, str]] = None,
    **options,
) -> list[ScanResult]:
    data = Path(path).read_bytes()
    return scanWav(data, profile=profile, **options)


def prependPayloadToWavFile(
    in_path: Union[str, Path],
    out_path: Union[str, Path],
    payload: object,
    *,
    wav_format: WavFormat = "pcm16",
    **options,
) -> PrependWavResult:
    data = Path(in_path).read_bytes()
    result = prependPayloadToWav(data, payload, wav_format=wav_format, **options)
    Path(out_path).write_bytes(result.wav)
    return result
