import gzip

from qraudio import PROFILE_NAMES, decode, decodeWav, encode, encodeWav, scan


def test_roundtrip() -> None:
    payloads = [
        {"__type": "link", "url": "https://example.com", "meta": {"show": "QRA", "ep": 1}},
        {"message": "hello", "n": 42, "nested": {"ok": True}},
    ]

    for profile in PROFILE_NAMES:
        for payload in payloads:
            encoded = encode(payload, profile=profile)
            decoded = decode(
                encoded.samples,
                sample_rate=encoded.sampleRate,
                profile=profile,
            )
            assert decoded.json == payload

            encoded_gzip = encode(
                payload,
                profile=profile,
                gzip=True,
                gzip_compress=gzip.compress,
            )
            decoded_gzip = decode(
                encoded_gzip.samples,
                sample_rate=encoded_gzip.sampleRate,
                profile=profile,
                gzip_decompress=gzip.decompress,
            )
            assert decoded_gzip.json == payload

            silence = [0.0] * round(encoded.sampleRate * 0.2)
            combined = silence + encoded.samples + silence
            results = scan(
                combined,
                sample_rate=encoded.sampleRate,
                profile=profile,
            )
            assert len(results) > 0
            assert results[0].json == payload

            wav_result = encodeWav(payload, profile=profile)
            wav_decoded = decodeWav(wav_result.wav, profile=profile)
            assert wav_decoded.json == payload
