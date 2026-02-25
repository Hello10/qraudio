from __future__ import annotations

import math

from .envelope import applyFade


def toneToSamples(
    *,
    freq: float,
    sample_rate: float,
    duration_ms: float,
    level_db: float,
    fade_ms: float,
) -> list[float]:
    sample_count = max(1, round((duration_ms / 1000.0) * sample_rate))
    amplitude = 10 ** (level_db / 20.0)
    phase_step = (2 * math.pi * freq) / sample_rate
    phase = 0.0
    out: list[float] = [0.0] * sample_count
    for i in range(sample_count):
        phase += phase_step
        if phase > math.pi * 2:
            phase -= math.pi * 2
        out[i] = math.sin(phase) * amplitude
    applyFade(out, sample_rate, fade_ms)
    return out
