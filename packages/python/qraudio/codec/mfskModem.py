from __future__ import annotations

import math

from .envelope import applyFade


def mfskBitsToSamples(
    *,
    bits: list[int],
    sample_rate: float,
    baud: float,
    tones: list[float],
    bits_per_symbol: int,
    level_db: float,
    fade_ms: float,
) -> list[float]:
    if bits_per_symbol <= 0:
        raise ValueError("bits_per_symbol must be >= 1")
    required_tones = 1 << bits_per_symbol
    if len(tones) < required_tones:
        raise ValueError(f"MFSK requires {required_tones} tones (got {len(tones)})")

    symbol_count = max(1, math.ceil(len(bits) / bits_per_symbol))
    samples_per_bit = sample_rate / baud
    samples_per_symbol = samples_per_bit * bits_per_symbol
    total_samples = math.ceil(symbol_count * samples_per_symbol)
    out: list[float] = [0.0] * total_samples
    amplitude = 10 ** (level_db / 20.0)

    phase = 0.0
    sample_index = 0
    boundary = samples_per_symbol
    symbol_mask = (1 << bits_per_symbol) - 1

    for symbol_index in range(symbol_count):
        symbol = 0
        bit_offset = symbol_index * bits_per_symbol
        for i in range(bits_per_symbol):
            bit = bits[bit_offset + i] if bit_offset + i < len(bits) else 0
            symbol |= (bit & 1) << i
        symbol &= symbol_mask
        freq = tones[symbol] if symbol < len(tones) else tones[0]
        phase_step = (2 * math.pi * freq) / sample_rate

        while sample_index < boundary and sample_index < total_samples:
            phase += phase_step
            if phase > math.pi * 2:
                phase -= math.pi * 2
            out[sample_index] = math.sin(phase) * amplitude
            sample_index += 1
        boundary += samples_per_symbol

    if fade_ms > 0:
        fade_samples = round((fade_ms / 1000.0) * sample_rate)
        if fade_samples > 0:
            padded = out + [0.0] * fade_samples
            applyFade(padded, sample_rate, fade_ms)
            return padded

    applyFade(out, sample_rate, fade_ms)
    return out


def demodMfsk(
    *,
    samples: list[float],
    sample_rate: float,
    baud: float,
    offset: int,
    tones: list[float],
    bits_per_symbol: int,
) -> list[int]:
    if bits_per_symbol <= 0:
        return []
    required_tones = 1 << bits_per_symbol
    if len(tones) < required_tones:
        return []

    samples_per_bit = sample_rate / baud
    samples_per_symbol = samples_per_bit * bits_per_symbol
    bits: list[int] = []

    start = offset
    boundary = start + samples_per_symbol

    while boundary <= len(samples):
        end = math.floor(boundary)
        length = end - start
        if length <= 1:
            start = end
            boundary += samples_per_symbol
            continue

        best_index = 0
        best_energy = -1.0
        for idx in range(required_tones):
            energy = goertzel(samples=samples, start=start, length=length, freq=tones[idx], sample_rate=sample_rate)
            if energy > best_energy:
                best_energy = energy
                best_index = idx

        for bit in range(bits_per_symbol):
            bits.append((best_index >> bit) & 1)

        start = end
        boundary += samples_per_symbol

    return bits


def goertzel(
    *,
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
