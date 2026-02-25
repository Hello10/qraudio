import asyncio
import json
import os
import random
import string
import sys
from array import array
from datetime import datetime
from typing import Any

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "python"))
sys.path.insert(0, ROOT)

from qraudio import ProfileName, encode, normalizeProfile  # noqa: E402

try:
    from faker import Faker  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    Faker = None

PORT = int(os.environ.get("QRAUDIO_PORT", "5174"))
SAMPLE_RATE = 48000
PROFILE = normalizeProfile(os.environ.get("QRAUDIO_PROFILE"), ProfileName.GFSK_FIFTH)
CHUNK_SAMPLES = 960  # 20 ms at 48k
SILENCE_MS = 500
GAP_MS = 1000
RANDOM_PAYLOADS = os.environ.get("QRAUDIO_RANDOM", "1") != "0"
MIN_PAYLOAD_BYTES = int(os.environ.get("QRAUDIO_PAYLOAD_MIN", "160"))
MAX_PAYLOAD_BYTES = int(os.environ.get("QRAUDIO_PAYLOAD_MAX", "800"))
SEED = os.environ.get("QRAUDIO_SEED")

faker = None
if Faker is not None:
    faker = Faker()

if SEED:
    try:
        seed_value = int(SEED)
        random.seed(seed_value)
        if faker is not None:
            faker.seed_instance(seed_value)
    except ValueError:
        pass

MESSAGES = [
    {"__type": "broadcast", "url": "https://example.com/alpha", "tag": "alpha"},
    {"__type": "broadcast", "url": "https://example.com/beta", "tag": "beta"},
    {"__type": "broadcast", "url": "https://example.com/gamma", "tag": "gamma"},
    {"__type": "broadcast", "url": "https://example.com/delta", "tag": "delta"},
]
sequence_id = 0


def byte_length(value: Any) -> int:
    text = json.dumps(value, separators=(",", ":"), ensure_ascii=False)
    return len(text.encode("utf-8"))


def random_word() -> str:
    if faker is not None:
        return faker.word()
    return "".join(random.choices(string.ascii_lowercase, k=6))


def random_adjective() -> str:
    if faker is not None:
        return faker.word()
    return "".join(random.choices(string.ascii_lowercase, k=8))


def build_fixed_payload(sequence: int) -> dict[str, Any]:
    base = MESSAGES[sequence % len(MESSAGES)]
    payload = {
        **base,
        "meta": {
            "show": "QRA",
            "createdAt": datetime.utcnow().isoformat() + "Z",
            "sequence": sequence,
            "bytes": 0,
        },
    }
    payload["meta"]["bytes"] = byte_length(payload)
    return payload


def build_random_payload(sequence: int) -> dict[str, Any]:
    base = {
        "__type": "broadcast",
        "url": f"https://example.com/{random_word()}",
        "tag": random_adjective(),
    }
    meta_base = {
        "show": "QRA",
        "createdAt": datetime.utcnow().isoformat() + "Z",
        "sequence": sequence,
    }

    target_bytes = random.randint(MIN_PAYLOAD_BYTES, MAX_PAYLOAD_BYTES)
    filler = ""
    payload = {
        **base,
        "blob": filler,
        "meta": {**meta_base, "bytes": 0, "targetBytes": target_bytes},
    }

    size = byte_length(payload)
    if size < target_bytes:
        filler = "".join(random.choices(string.ascii_letters + string.digits, k=target_bytes - size))
        payload = {
            **base,
            "blob": filler,
            "meta": {**meta_base, "bytes": 0, "targetBytes": target_bytes},
        }
        size = byte_length(payload)
        if size < target_bytes:
            filler += "x" * (target_bytes - size)
            payload = {
                **base,
                "blob": filler,
                "meta": {**meta_base, "bytes": 0, "targetBytes": target_bytes},
            }
            size = byte_length(payload)

    payload["meta"]["bytes"] = size
    return payload


def build_sequence() -> tuple[dict[str, Any], list[float]]:
    global sequence_id
    payload = build_random_payload(sequence_id) if RANDOM_PAYLOADS else build_fixed_payload(sequence_id)
    sequence_id += 1

    result = encode(payload=payload, sample_rate=SAMPLE_RATE, profile=PROFILE, gzip=False)

    leading_silence_samples = round((SILENCE_MS / 1000.0) * SAMPLE_RATE)
    trailing_silence_samples = round(((SILENCE_MS + GAP_MS) / 1000.0) * SAMPLE_RATE)
    leading = [0.0] * leading_silence_samples
    trailing = [0.0] * trailing_silence_samples

    combined = leading + result.samples + trailing
    return payload, combined


def float32_bytes(samples: list[float]) -> bytes:
    data = array("f", samples)
    if sys.byteorder != "little":
        data.byteswap()
    return data.tobytes()


async def handle_connection(websocket):
    payload, samples = build_sequence()
    cursor = 0

    await websocket.send(
        json.dumps(
            {
                "type": "meta",
                "sampleRate": SAMPLE_RATE,
                "profile": PROFILE.value,
                "chunkSamples": CHUNK_SAMPLES,
            }
        )
    )

    interval = CHUNK_SAMPLES / SAMPLE_RATE
    while True:
        end = min(cursor + CHUNK_SAMPLES, len(samples))
        chunk = samples[cursor:end]
        await websocket.send(float32_bytes(chunk))
        cursor = end
        if cursor >= len(samples):
            cursor = 0
            payload, samples = build_sequence()
        await asyncio.sleep(interval)


async def main() -> None:
    try:
        import websockets  # type: ignore
    except Exception as exc:
        raise RuntimeError(
            "websockets is required. Run via ./run_server.sh python or `uv run --with websockets --with faker python server/index.py`."
        ) from exc

    if RANDOM_PAYLOADS:
        print(f"QRAudio payloads: random ({MIN_PAYLOAD_BYTES}-{MAX_PAYLOAD_BYTES} bytes target)")
    else:
        print("QRAudio payloads: fixed rotation")

    async with websockets.serve(handle_connection, "127.0.0.1", PORT):
        print(f"QRAudio demo server (python) listening on ws://localhost:{PORT}")
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
