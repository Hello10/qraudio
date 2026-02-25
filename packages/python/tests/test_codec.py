import random

import pytest

from qraudio.codec.crc16x25 import crc16X25
from qraudio.codec.reedSolomonCodec import rsDecode, rsEncode


def text_bytes(text: str) -> bytes:
    return text.encode("utf-8")


def test_crc16_x25_check_value() -> None:
    data = text_bytes("123456789")
    assert crc16X25(data) == 0x906E


def test_reed_solomon_corrects_errors() -> None:
    payload = bytes([i & 0xFF for i in range(120)])
    encoded = rsEncode(payload)
    corrupted = bytearray(encoded)

    for i in range(10):
        corrupted[i] ^= 0xFF

    decoded = rsDecode(bytes(corrupted), len(payload))
    assert decoded == payload


def test_reed_solomon_corrects_random_errors() -> None:
    payload = bytes([(i * 13 + 7) & 0xFF for i in range(200)])
    encoded = rsEncode(payload)
    corrupted = bytearray(encoded)

    rng = random.Random(0)
    error_positions = set()
    while len(error_positions) < 8:
        error_positions.add(rng.randrange(len(corrupted)))
    for pos in error_positions:
        corrupted[pos] ^= 0xFF

    decoded = rsDecode(bytes(corrupted), len(payload))
    assert decoded == payload


def test_reed_solomon_fails_on_too_many_errors() -> None:
    payload = bytes([(i * 7) & 0xFF for i in range(120)])
    encoded = rsEncode(payload)
    corrupted = bytearray(encoded)

    for i in range(24):
        corrupted[i] ^= 0xFF

    with pytest.raises(Exception):
        rsDecode(bytes(corrupted), len(payload))
