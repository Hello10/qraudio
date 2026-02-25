from __future__ import annotations

import gzip as gzip_lib
from typing import Callable, Optional, Union

from .codec.afskModem import demodAfsk
from .codec.hdlcFraming import extractFrames
from .codec.jsonCodec import decodeJson
from .codec.nrziCodec import nrziDecode
from .codec.profile import getProfileSettings
from .codec.frame import parseFrame
from .codec.reedSolomonCodec import rsDecode, rsEncode
from .codec.mfskModem import demodMfsk
from .codec.bytes import concatBytes
from .codec.crc16x25 import crc16X25
from .codec.defaults import DEFAULT_SAMPLE_RATE
from .profiles import PROFILE_NAMES, Profile, normalizeProfile
from dataclasses import dataclass

from .types import DecodeResult, ScanResult


def decode(
    *,
    samples: list[float],
    sample_rate: Optional[int] = None,
    profile: Optional[Union[Profile, str]] = None,
    gzip_decompress: Optional[Callable[[bytes], bytes]] = None,
) -> DecodeResult:
    results = scan(
        samples=samples,
        sample_rate=sample_rate,
        profile=profile,
        min_confidence=0.9,
        gzip_decompress=gzip_decompress,
    )
    if not results:
        raise ValueError("No valid frame found")
    return results[0]


def scan(
    *,
    samples: list[float],
    sample_rate: Optional[int] = None,
    profile: Optional[Union[Profile, str]] = None,
    min_confidence: float = 0.8,
    gzip_decompress: Optional[Callable[[bytes], bytes]] = None,
) -> list[ScanResult]:

    resolved_sample_rate = sample_rate or DEFAULT_SAMPLE_RATE
    if profile is not None:
        profiles: list[Profile] = [normalizeProfile(profile)]
    else:
        profiles = list(PROFILE_NAMES)

    results: list[ScanResult] = []
    seen_keys: set[str] = set()

    for current_profile in profiles:
        settings = getProfileSettings(current_profile)
        baud = settings.baud
        samples_per_bit = resolved_sample_rate / baud
        bits_per_symbol = settings.bitsPerSymbol or 1
        samples_per_symbol = samples_per_bit * bits_per_symbol
        offset_step = max(1, round(samples_per_symbol / 8))

        offset = 0
        while offset < samples_per_symbol:
            if settings.modulation == "mfsk":
                data_bits = demodMfsk(
                    samples=samples,
                    sample_rate=resolved_sample_rate,
                    baud=baud,
                    offset=int(offset),
                    tones=settings.tones or [settings.markFreq, settings.spaceFreq],
                    bits_per_symbol=bits_per_symbol,
                )
            else:
                tone_bits = demodAfsk(
                    samples=samples,
                    sample_rate=resolved_sample_rate,
                    baud=baud,
                    offset=int(offset),
                    mark_freq=settings.markFreq,
                    space_freq=settings.spaceFreq,
                )
                data_bits = nrziDecode(tone_bits)


            frames = extractFrames(data_bits)
            for frame in frames:
                parsed = None
                try:
                    parsed = _decodeFrame(frame.bytes, gzip_decompress)
                except Exception:
                    parsed = None
                if not parsed or parsed.profile != current_profile:
                    continue
                start_sample = round(offset + frame.startBit * samples_per_bit)
                end_sample = round(offset + frame.endBit * samples_per_bit)
                confidence = 1.0
                if confidence < min_confidence:
                    continue
                key = f"{current_profile.value}:{round(start_sample / max(1, samples_per_bit / 2))}"
                if key in seen_keys:
                    continue
                seen_keys.add(key)
                results.append(
                    ScanResult(
                        json=parsed.json,
                        profile=parsed.profile,
                        startSample=start_sample,
                        endSample=end_sample,
                        confidence=confidence,
                    )
                )
            offset += offset_step

    results.sort(key=lambda r: r.startSample)
    return results


@dataclass
class _DecodedFrame:
    json: object
    profile: Profile


def _decodeFrame(
    data: bytes,
    gzip_decompress: Optional[Callable[[bytes], bytes]] = None,
) -> Optional[_DecodedFrame]:
    parsed = parseFrame(data)
    if not parsed:
        return None

    header = parsed.header
    payload_with_fec = parsed.payloadWithFec
    crc_expected = parsed.crcExpected
    crc_actual = parsed.crcActual
    raw = parsed.raw

    payload: bytes
    crc_ok = crc_expected == crc_actual

    if header.fecEnabled:
        try:
            payload = rsDecode(payload_with_fec, header.payloadLength)
        except Exception:
            return None
        if not crc_ok:
            corrected_payload_with_fec = rsEncode(payload)
            corrected_frame = concatBytes(raw[:8], corrected_payload_with_fec)
            corrected_crc = crc16X25(corrected_frame)
            crc_ok = corrected_crc == crc_expected
    else:
        if not crc_ok:
            return None
        payload = payload_with_fec

    if not crc_ok:
        return None

    if len(payload) < header.payloadLength:
        return None
    payload = payload[: header.payloadLength]

    if header.gzipEnabled:
        decompressor = gzip_decompress or gzip_lib.decompress
        payload = decompressor(payload)

    json_value = decodeJson(payload)
    return _DecodedFrame(json=json_value, profile=header.profile)
