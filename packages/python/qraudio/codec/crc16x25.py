from __future__ import annotations


def crc16X25(data: bytes) -> int:
    crc = 0xFFFF
    for byte in data:
        x = byte
        for _ in range(8):
            bit = (crc ^ x) & 0x01
            crc >>= 1
            if bit:
                crc ^= 0x8408
            x >>= 1
    crc = (~crc) & 0xFFFF
    return crc
