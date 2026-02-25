from __future__ import annotations


def nrziEncode(bits: list[int]) -> list[int]:
    out: list[int] = []
    level = 1
    for bit in bits:
        if bit == 0:
            level ^= 1
        out.append(level)
    return out


def nrziDecode(tones: list[int]) -> list[int]:
    if not tones:
        return []
    out: list[int] = []
    prev = tones[0]
    for tone in tones:
        out.append(1 if tone == prev else 0)
        prev = tone
    return out
