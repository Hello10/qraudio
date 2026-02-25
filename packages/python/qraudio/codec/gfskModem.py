from __future__ import annotations

import math
from typing import Optional

from .envelope import applyFade


def gfskTonesToSamples(
    *,
    tones: list[int],
    sample_rate: float,
    baud: float,
    mark_freq: float,
    space_freq: float,
    level_db: float,
    fade_ms: float,
    bt: Optional[float] = None,
    span_symbols: Optional[int] = None,
) -> list[float]:
    samples_per_bit = sample_rate / baud
    total_samples = math.ceil(len(tones) * samples_per_bit)

    nrz = [0.0] * total_samples
    sample_index = 0
    boundary = samples_per_bit
    for bit in tones:
        level = 1.0 if bit == 1 else -1.0
        while sample_index < boundary and sample_index < total_samples:
            nrz[sample_index] = level
            sample_index += 1
        boundary += samples_per_bit

    shaped = gaussianFilter(
        nrz,
        samples_per_bit,
        bt if bt is not None else 1.0,
        span_symbols if span_symbols is not None else 4,
    )

    amplitude = 10 ** (level_db / 20.0)
    center_freq = (mark_freq + space_freq) / 2.0
    deviation = (mark_freq - space_freq) / 2.0

    out = [0.0] * total_samples
    phase = 0.0
    for i in range(total_samples):
        freq = center_freq + deviation * shaped[i]
        phase += (2 * math.pi * freq) / sample_rate
        if phase > math.pi * 2:
            phase -= math.pi * 2
        out[i] = math.sin(phase) * amplitude

    if fade_ms > 0:
        fade_samples = round((fade_ms / 1000.0) * sample_rate)
        if fade_samples > 0:
            padded = out + [0.0] * fade_samples
            applyFade(padded, sample_rate, fade_ms)
            return padded

    return out


def gaussianFilter(
    samples: list[float],
    samples_per_bit: float,
    bt: float,
    span_symbols: int,
) -> list[float]:
    if bt <= 0:
        return samples[:]
    sigma = (samples_per_bit * math.sqrt(math.log(2))) / (2 * math.pi * bt)
    kernel_length = max(3, round(span_symbols * samples_per_bit))
    size = kernel_length + 1 if kernel_length % 2 == 0 else kernel_length
    half = size // 2
    kernel = [0.0] * size
    total = 0.0
    for i in range(size):
        x = i - half
        value = math.exp(-0.5 * (x / sigma) ** 2)
        kernel[i] = value
        total += value
    kernel = [value / total for value in kernel]

    out = [0.0] * len(samples)
    for i in range(len(samples)):
        acc = 0.0
        for k in range(size):
            idx = i + k - half
            if idx < 0:
                idx = 0
            elif idx >= len(samples):
                idx = len(samples) - 1
            acc += samples[idx] * kernel[k]
        out[i] = acc
    return out
