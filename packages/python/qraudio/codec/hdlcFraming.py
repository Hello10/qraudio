from __future__ import annotations

from dataclasses import dataclass

FLAG_BITS = [0, 1, 1, 1, 1, 1, 1, 0]


@dataclass
class BitFrame:
    bytes: bytes
    startBit: int
    endBit: int


def buildBitstream(frame_bytes: bytes, preamble_ms: float, baud: float) -> list[int]:
    bits = _bytes_to_bits_lsb(frame_bytes)
    stuffed = _bit_stuff(bits)

    preamble_flags = max(1, round((preamble_ms / 1000.0) * baud / 8.0))
    out: list[int] = []
    for _ in range(preamble_flags):
        out.extend(FLAG_BITS)
    out.extend(FLAG_BITS)
    out.extend(stuffed)
    out.extend(FLAG_BITS)
    return out


def extractFrames(bits: list[int]) -> list[BitFrame]:
    flags = _find_flag_indices(bits)
    if len(flags) < 2:
        return []

    frames: list[BitFrame] = []
    for i in range(len(flags) - 1):
        start = flags[i] + 8
        end = flags[i + 1]
        if end <= start:
            continue
        raw_bits = bits[start:end]
        if len(raw_bits) < 16:
            continue
        data_bits = _bit_destuff(raw_bits)
        data_bytes = _bits_to_bytes_lsb(data_bits)
        if len(data_bytes) < 4 + 1 + 1 + 2 + 2:
            continue
        frames.append(BitFrame(bytes=data_bytes, startBit=start, endBit=end))
    return frames


def _bytes_to_bits_lsb(data: bytes) -> list[int]:
    bits: list[int] = []
    for byte in data:
        for i in range(8):
            bits.append((byte >> i) & 1)
    return bits


def _bits_to_bytes_lsb(bits: list[int]) -> bytes:
    byte_count = len(bits) // 8
    out = bytearray(byte_count)
    for i in range(byte_count):
        value = 0
        for bit in range(8):
            value |= (bits[i * 8 + bit] & 1) << bit
        out[i] = value
    return bytes(out)


def _bit_stuff(bits: list[int]) -> list[int]:
    out: list[int] = []
    ones = 0
    for bit in bits:
        out.append(bit)
        if bit == 1:
            ones += 1
            if ones == 5:
                out.append(0)
                ones = 0
        else:
            ones = 0
    return out


def _bit_destuff(bits: list[int]) -> list[int]:
    out: list[int] = []
    ones = 0
    for bit in bits:
        if bit == 1:
            ones += 1
            out.append(bit)
        else:
            if ones == 5:
                ones = 0
                continue
            ones = 0
            out.append(bit)
    return out


def _find_flag_indices(bits: list[int]) -> list[int]:
    indices: list[int] = []
    limit = len(bits) - 8
    i = 0
    while i <= limit:
        match = True
        for j in range(8):
            if bits[i + j] != FLAG_BITS[j]:
                match = False
                break
        if match:
            indices.append(i)
            i += 8
        else:
            i += 1
    return indices
