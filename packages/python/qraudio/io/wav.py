from __future__ import annotations

import struct
from typing import Literal, Optional, Union

from ..decode import decode, scan
from ..encode import encode
from ..profiles import Profile, normalizeProfile
from ..types import DecodeResult, EncodeResult, EncodeWavResult, PrependWavResult, ScanResult, WavData

WavFormat = Literal["pcm16", "float32"]


def encodeWav(
    payload: object,
    *,
    wav_format: WavFormat = "pcm16",
    **encode_options,
) -> EncodeWavResult:
    result = encode(payload, **encode_options)
    wav = encodeWavSamples(result.samples, result.sampleRate, wav_format)
    return EncodeWavResult(
        sampleRate=result.sampleRate,
        profile=result.profile,
        samples=result.samples,
        durationMs=result.durationMs,
        payloadBytes=result.payloadBytes,
        wav=wav,
    )


def decodeWav(
    wav_bytes: bytes,
    *,
    sample_rate: Optional[int] = None,
    profile: Optional[Union[Profile, str]] = None,
    **options,
) -> DecodeResult:
    data = decodeWavSamples(wav_bytes)
    resolved_profile = normalizeProfile(profile) if profile is not None else None
    return decode(
        data.samples,
        sample_rate=sample_rate or data.sampleRate,
        profile=resolved_profile,
        **options,
    )


def scanWav(
    wav_bytes: bytes,
    *,
    sample_rate: Optional[int] = None,
    profile: Optional[Union[Profile, str]] = None,
    **options,
) -> list[ScanResult]:
    data = decodeWavSamples(wav_bytes)
    resolved_profile = normalizeProfile(profile) if profile is not None else None
    return scan(
        data.samples,
        sample_rate=sample_rate or data.sampleRate,
        profile=resolved_profile,
        **options,
    )


def prependPayloadToWav(
    wav_bytes: bytes,
    payload: object,
    *,
    pad_seconds: float = 0.25,
    pre_pad_seconds: Optional[float] = None,
    post_pad_seconds: Optional[float] = None,
    wav_format: WavFormat = "pcm16",
    **encode_options,
) -> PrependWavResult:
    input_data = decodeWavSamples(wav_bytes)
    sample_rate = encode_options.get("sample_rate", input_data.sampleRate)
    if sample_rate != input_data.sampleRate:
        raise ValueError(
            f"Sample rate mismatch: input {input_data.sampleRate} Hz, requested {sample_rate} Hz. Resampling not supported."
        )

    payload_result = encode(payload, sample_rate=sample_rate, **encode_options)
    pre_pad = pad_seconds if pre_pad_seconds is None else pre_pad_seconds
    post_pad = pad_seconds if post_pad_seconds is None else post_pad_seconds

    pre_samples = secondsToSamples(sample_rate, pre_pad)
    post_samples = secondsToSamples(sample_rate, post_pad)

    combined = [0.0] * (
        pre_samples + len(payload_result.samples) + post_samples + len(input_data.samples)
    )
    combined[pre_samples : pre_samples + len(payload_result.samples)] = payload_result.samples
    offset = pre_samples + len(payload_result.samples) + post_samples
    combined[offset : offset + len(input_data.samples)] = input_data.samples

    wav_out = encodeWavSamples(combined, sample_rate, wav_format)
    return PrependWavResult(wav=wav_out, payload=payload_result, sampleRate=sample_rate)


def encodeWavSamples(samples: list[float], sample_rate: int, fmt: WavFormat = "pcm16") -> bytes:
    num_channels = 1
    bits_per_sample = 32 if fmt == "float32" else 16
    bytes_per_sample = bits_per_sample // 8
    block_align = num_channels * bytes_per_sample
    byte_rate = sample_rate * block_align
    data_size = len(samples) * bytes_per_sample
    header_size = 44

    buffer = bytearray(header_size + data_size)
    buffer[0:4] = b"RIFF"
    struct.pack_into("<I", buffer, 4, 36 + data_size)
    buffer[8:12] = b"WAVE"

    buffer[12:16] = b"fmt "
    struct.pack_into("<I", buffer, 16, 16)
    struct.pack_into("<H", buffer, 20, 3 if fmt == "float32" else 1)
    struct.pack_into("<H", buffer, 22, num_channels)
    struct.pack_into("<I", buffer, 24, sample_rate)
    struct.pack_into("<I", buffer, 28, byte_rate)
    struct.pack_into("<H", buffer, 32, block_align)
    struct.pack_into("<H", buffer, 34, bits_per_sample)

    buffer[36:40] = b"data"
    struct.pack_into("<I", buffer, 40, data_size)

    offset = header_size
    if fmt == "float32":
        for sample in samples:
            struct.pack_into("<f", buffer, offset, clamp(sample))
            offset += 4
    else:
        for sample in samples:
            value = int(round(clamp(sample) * 32767))
            struct.pack_into("<h", buffer, offset, value)
            offset += 2

    return bytes(buffer)


def decodeWavSamples(wav_bytes: bytes) -> WavData:
    if len(wav_bytes) < 12:
        raise ValueError("Invalid WAV header")
    if wav_bytes[0:4] != b"RIFF" or wav_bytes[8:12] != b"WAVE":
        raise ValueError("Invalid WAV header")

    offset = 12
    fmt_tag = None
    channels = 0
    sample_rate = 0
    bits_per_sample = 0
    data_offset = 0
    data_size = 0

    while offset + 8 <= len(wav_bytes):
        chunk_id = wav_bytes[offset : offset + 4]
        chunk_size = struct.unpack_from("<I", wav_bytes, offset + 4)[0]
        chunk_data_offset = offset + 8

        if chunk_id == b"fmt ":
            fmt_tag = struct.unpack_from("<H", wav_bytes, chunk_data_offset)[0]
            channels = struct.unpack_from("<H", wav_bytes, chunk_data_offset + 2)[0]
            sample_rate = struct.unpack_from("<I", wav_bytes, chunk_data_offset + 4)[0]
            bits_per_sample = struct.unpack_from("<H", wav_bytes, chunk_data_offset + 14)[0]
        elif chunk_id == b"data":
            data_offset = chunk_data_offset
            data_size = chunk_size

        offset = chunk_data_offset + chunk_size + (chunk_size % 2)

    if fmt_tag is None or data_offset == 0:
        raise ValueError("WAV missing fmt or data chunk")
    if channels < 1:
        raise ValueError("Invalid WAV channel count")

    bytes_per_sample = bits_per_sample // 8
    total_frames = data_size // (bytes_per_sample * channels)
    samples: list[float] = []

    if fmt_tag == 1 and bits_per_sample == 16:
        frame_offset = data_offset
        for _ in range(total_frames):
            total = 0.0
            for _ in range(channels):
                value = struct.unpack_from("<h", wav_bytes, frame_offset)[0]
                total += value / 32768.0
                frame_offset += 2
            samples.append(total / channels)
        fmt = "pcm16"
    elif fmt_tag == 3 and bits_per_sample == 32:
        frame_offset = data_offset
        for _ in range(total_frames):
            total = 0.0
            for _ in range(channels):
                value = struct.unpack_from("<f", wav_bytes, frame_offset)[0]
                total += value
                frame_offset += 4
            samples.append(total / channels)
        fmt = "float32"
    else:
        raise ValueError(f"Unsupported WAV format {fmt_tag} with {bits_per_sample} bits")

    return WavData(sampleRate=sample_rate, channels=channels, format=fmt, samples=samples)


def secondsToSamples(sample_rate: int, seconds: float) -> int:
    return max(1, round(seconds * sample_rate))


def clamp(value: float) -> float:
    if value > 1.0:
        return 1.0
    if value < -1.0:
        return -1.0
    return value
