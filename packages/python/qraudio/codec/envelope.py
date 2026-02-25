from __future__ import annotations

import math
from typing import MutableSequence


def applyFade(samples: MutableSequence[float], sample_rate: float, fade_ms: float) -> None:
    fade_samples = max(0, round((fade_ms / 1000.0) * sample_rate))
    if fade_samples == 0 or fade_samples * 2 > len(samples):
        return
    for i in range(fade_samples):
        t = i / fade_samples
        gain = 0.5 * (1 - math.cos(math.pi * t))
        samples[i] *= gain
        samples[len(samples) - 1 - i] *= gain
