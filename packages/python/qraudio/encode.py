from __future__ import annotations

import gzip as gzip_lib
from typing import Callable, Optional, Union

from .codec.afskModem import tonesToSamples
from .codec.gfskModem import gfskTonesToSamples
from .codec.mfskModem import mfskBitsToSamples
from .codec.hdlcFraming import buildBitstream
from .codec.jsonCodec import encodeJson
from .codec.nrziCodec import nrziEncode
from .codec.profile import getProfileSettings, profileFlag
from .codec.frame import buildFrame
from .codec.reedSolomonCodec import rsEncode
from .codec.tone import toneToSamples
from .codec.constants import FLAG_FEC, FLAG_GZIP
from .codec.defaults import DEFAULT_LEVEL_DB, DEFAULT_SAMPLE_RATE
from .profiles import DEFAULT_PROFILE, Profile, normalizeProfile
from .types import EncodeResult


def encode(
    payload: object,
    *,
    sample_rate: Optional[int] = None,
    profile: Optional[Union[Profile, str]] = None,
    fec: bool = True,
    gzip: Union[bool, str] = "auto",
    gzip_compress: Optional[Callable[[bytes], bytes]] = None,
    gzip_min_savings_bytes: int = 8,
    gzip_min_savings_pct: float = 0.08,
    preamble_ms: Optional[float] = None,
    fade_ms: Optional[float] = None,
    level_db: Optional[float] = None,
    lead_in: Optional[bool] = None,
    lead_in_tone_ms: Optional[float] = None,
    lead_in_gap_ms: Optional[float] = None,
    tail_out: Optional[bool] = None,
    tail_tone_ms: Optional[float] = None,
    tail_gap_ms: Optional[float] = None,
) -> EncodeResult:
    resolved_sample_rate = sample_rate or DEFAULT_SAMPLE_RATE
    resolved_profile = normalizeProfile(profile, DEFAULT_PROFILE)
    settings = getProfileSettings(resolved_profile)

    json_bytes = encodeJson(payload)
    gzip_mode_value: Union[bool, str] = gzip
    compress_fn = gzip_compress or gzip_lib.compress

    encoded_payload = json_bytes
    used_gzip = False
    if gzip_mode_value:
        compressed = compress_fn(json_bytes)
        savings_bytes = len(json_bytes) - len(compressed)
        savings_pct = (savings_bytes / len(json_bytes)) if json_bytes else 0.0
        should_use = False
        if gzip_mode_value is True:
            should_use = True
        elif gzip_mode_value == "auto":
            should_use = savings_bytes >= gzip_min_savings_bytes or savings_pct >= gzip_min_savings_pct
        if should_use:
            encoded_payload = compressed
            used_gzip = True

    payload_with_fec = rsEncode(encoded_payload) if fec else encoded_payload

    flags = (FLAG_GZIP if used_gzip else 0) | (FLAG_FEC if fec else 0) | profileFlag(
        resolved_profile
    )

    frame = buildFrame(payload_with_fec, len(encoded_payload), flags)
    resolved_preamble_ms = preamble_ms if preamble_ms is not None else settings.preambleMs
    resolved_fade_ms = fade_ms if fade_ms is not None else settings.fadeMs
    bitstream = buildBitstream(frame, resolved_preamble_ms, settings.baud)
    encoded_bits = bitstream if settings.modulation == "mfsk" else nrziEncode(bitstream)

    db_level = level_db if level_db is not None else DEFAULT_LEVEL_DB

    if settings.modulation == "gfsk":
        samples = gfskTonesToSamples(
            tones=encoded_bits,
            sample_rate=resolved_sample_rate,
            baud=settings.baud,
            mark_freq=settings.markFreq,
            space_freq=settings.spaceFreq,
            level_db=db_level,
            fade_ms=resolved_fade_ms,
            bt=settings.bt,
            span_symbols=settings.spanSymbols,
        )
    elif settings.modulation == "mfsk":
        samples = mfskBitsToSamples(
            bits=encoded_bits,
            sample_rate=resolved_sample_rate,
            baud=settings.baud,
            tones=settings.tones or [settings.markFreq, settings.spaceFreq],
            bits_per_symbol=settings.bitsPerSymbol or 1,
            level_db=db_level,
            fade_ms=resolved_fade_ms,
        )
    else:
        samples = tonesToSamples(
            tones=encoded_bits,
            sample_rate=resolved_sample_rate,
            baud=settings.baud,
            mark_freq=settings.markFreq,
            space_freq=settings.spaceFreq,
            level_db=db_level,
            fade_ms=resolved_fade_ms,
        )

    lead_in_enabled = lead_in
    if lead_in_enabled is None:
        lead_in_enabled = settings.leadInToneMs > 0 or settings.leadInGapMs > 0
    if lead_in_enabled:
        lead_tone_ms = lead_in_tone_ms if lead_in_tone_ms is not None else settings.leadInToneMs
        lead_gap_ms = lead_in_gap_ms if lead_in_gap_ms is not None else settings.leadInGapMs
        if lead_tone_ms > 0:
            lead_samples = buildChime(
                sample_rate=resolved_sample_rate,
                level_db=db_level,
                fade_ms=resolved_fade_ms,
                tone_ms=lead_tone_ms,
                gap_ms=lead_gap_ms,
                first_freq=settings.markFreq,
                second_freq=settings.spaceFreq,
            )
            samples = concatSamples([lead_samples, samples])

    tail_out_enabled = tail_out
    if tail_out_enabled is None:
        tail_out_enabled = settings.tailToneMs > 0 or settings.tailGapMs > 0
    if tail_out_enabled:
        tail_tone = tail_tone_ms if tail_tone_ms is not None else settings.tailToneMs
        tail_gap = tail_gap_ms if tail_gap_ms is not None else settings.tailGapMs
        if tail_tone > 0:
            tail_samples = buildChime(
                sample_rate=resolved_sample_rate,
                level_db=db_level,
                fade_ms=resolved_fade_ms,
                tone_ms=tail_tone,
                gap_ms=tail_gap,
                first_freq=settings.spaceFreq,
                second_freq=settings.markFreq,
            )
            samples = concatSamples([samples, tail_samples])

    duration_ms = (len(samples) / resolved_sample_rate) * 1000.0

    return EncodeResult(
        sampleRate=resolved_sample_rate,
        profile=resolved_profile,
        samples=samples,
        durationMs=duration_ms,
        payloadBytes=len(encoded_payload),
    )

def buildChime(
    *,
    sample_rate: float,
    level_db: float,
    fade_ms: float,
    tone_ms: float,
    gap_ms: float,
    first_freq: float,
    second_freq: float,
) -> list[float]:
    first = toneToSamples(
        freq=first_freq,
        sample_rate=sample_rate,
        duration_ms=tone_ms,
        level_db=level_db,
        fade_ms=fade_ms,
    )
    gap_samples = [0.0] * max(1, round((gap_ms / 1000.0) * sample_rate)) if gap_ms > 0 else []
    second = toneToSamples(
        freq=second_freq,
        sample_rate=sample_rate,
        duration_ms=tone_ms,
        level_db=level_db,
        fade_ms=fade_ms,
    )
    return concatSamples([first, gap_samples, second])


def concatSamples(chunks: list[list[float]]) -> list[float]:
    out: list[float] = []
    for chunk in chunks:
        out.extend(chunk)
    return out
