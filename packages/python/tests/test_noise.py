import math

from qraudio import DEFAULT_PROFILE, encode, scan


def lcg(seed: int = 123456789):
    state = seed & 0xFFFFFFFF

    def rand() -> float:
        nonlocal state
        state = (1664525 * state + 1013904223) & 0xFFFFFFFF
        return state / 0xFFFFFFFF

    return rand


def add_white_noise(samples: list[float], snr_db: float, seed: int = 42) -> list[float]:
    rand = lcg(seed)
    signal_energy = 0.0
    for sample in samples:
        signal_energy += sample * sample
    signal_rms = math.sqrt(signal_energy / len(samples))
    noise_rms = signal_rms / (10 ** (snr_db / 20))

    out: list[float] = []
    for sample in samples:
        noise = (rand() * 2 - 1) * noise_rms
        out.append(sample + noise)
    return out


def test_scan_with_moderate_noise() -> None:
    payload = {"__type": "noise", "value": 1}
    encoded = encode(payload, profile=DEFAULT_PROFILE)
    noisy = add_white_noise(encoded.samples, 15)

    silence = [0.0] * round(encoded.sampleRate * 0.2)
    combined = silence + noisy + silence

    results = scan(combined, sample_rate=encoded.sampleRate, profile=DEFAULT_PROFILE)
    assert len(results) > 0
    assert results[0].json == payload
