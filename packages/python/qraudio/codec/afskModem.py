from __future__ import annotations

import math

from .envelope import applyFade


def tonesToSamples(
    tones: list[int],
    *,
    sample_rate: float,
    baud: float,
    mark_freq: float,
    space_freq: float,
    level_db: float,
    fade_ms: float,
) -> list[float]:
    samples_per_bit = sample_rate / baud
    total_samples = math.ceil(len(tones) * samples_per_bit)
    out: list[float] = [0.0] * total_samples
    amplitude = 10 ** (level_db / 20.0)

    phase = 0.0
    sample_index = 0
    boundary = samples_per_bit

    for tone in tones:
        freq = mark_freq if tone == 1 else space_freq
        phase_step = (2 * math.pi * freq) / sample_rate
        while sample_index < boundary and sample_index < total_samples:
            phase += phase_step
            if phase > math.pi * 2:
                phase -= math.pi * 2
            out[sample_index] = math.sin(phase) * amplitude
            sample_index += 1
        boundary += samples_per_bit

    applyFade(out, sample_rate, fade_ms)
    return out


def demodAfsk(
    samples: list[float],
    sample_rate: float,
    baud: float,
    offset: int,
    mark_freq: float,
    space_freq: float,
) -> list[int]:
    samples_per_bit = sample_rate / baud
    tones: list[int] = []

    start = offset
    boundary = start + samples_per_bit

    while boundary <= len(samples):
        end = math.floor(boundary)
        length = end - start
        if length <= 1:
            start = end
            boundary += samples_per_bit
            continue
        mark_energy = goertzel(samples, start, length, mark_freq, sample_rate)
        space_energy = goertzel(samples, start, length, space_freq, sample_rate)
        tones.append(1 if mark_energy >= space_energy else 0)
        start = end
        boundary += samples_per_bit

    return tones


def goertzel(
    samples: list[float],
    start: int,
    length: int,
    freq: float,
    sample_rate: float,
) -> float:
    omega = (2 * math.pi * freq) / sample_rate
    coeff = 2 * math.cos(omega)
    s0 = 0.0
    s1 = 0.0
    s2 = 0.0
    end = start + length
    for i in range(start, end):
        s0 = samples[i] + coeff * s1 - s2
        s2 = s1
        s1 = s0
    return s1 * s1 + s2 * s2 - coeff * s1 * s2
