import math

from qraudio import DEFAULT_PROFILE, encodeWavSamples, prependPayloadToWav, scanWav


def make_tone(sample_rate: int, seconds: float, freq: float = 440) -> list[float]:
    length = round(sample_rate * seconds)
    step = (2 * math.pi * freq) / sample_rate
    phase = 0.0
    samples: list[float] = []
    for _ in range(length):
        samples.append(math.sin(phase) * 0.2)
        phase += step
    return samples


def test_prepend_payload_with_padding() -> None:
    sample_rate = 48000
    base_samples = make_tone(sample_rate, 1.0)
    base_wav = encodeWavSamples(base_samples, sample_rate, "pcm16")

    payload = {"__type": "test", "value": 123}
    result = prependPayloadToWav(
        base_wav,
        payload,
        pad_seconds=0.25,
        profile=DEFAULT_PROFILE,
    )

    detections = scanWav(result.wav, profile=DEFAULT_PROFILE)
    assert len(detections) > 0
    assert detections[0].json == payload
