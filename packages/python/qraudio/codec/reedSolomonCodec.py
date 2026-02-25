from __future__ import annotations

from typing import List, Optional

from .constants import RS_BLOCK_LEN, RS_DATA_LEN, RS_PARITY_LEN

GF_EXP = [0] * 512
GF_LOG = [0] * 256
GF_READY = False
RS_GENERATOR: Optional[list[int]] = None


def rsEncode(payload: bytes) -> bytes:
    _init_gf()
    gen = _get_rs_generator()
    blocks = (len(payload) + RS_DATA_LEN - 1) // RS_DATA_LEN
    out = bytearray(blocks * RS_BLOCK_LEN)
    out_offset = 0

    for b in range(blocks):
        start = b * RS_DATA_LEN
        chunk = payload[start : start + RS_DATA_LEN]
        data = bytearray(RS_DATA_LEN)
        data[0 : len(chunk)] = chunk
        parity = _rs_compute_parity(data, gen)
        out[out_offset : out_offset + RS_DATA_LEN] = data
        out_offset += RS_DATA_LEN
        out[out_offset : out_offset + RS_PARITY_LEN] = parity
        out_offset += RS_PARITY_LEN

    return bytes(out)


def rsDecode(encoded: bytes, decoded_length: int) -> bytes:
    _init_gf()
    if len(encoded) % RS_BLOCK_LEN != 0:
        raise ValueError("Invalid RS payload length")
    blocks = len(encoded) // RS_BLOCK_LEN
    out = bytearray(blocks * RS_DATA_LEN)
    out_offset = 0
    for b in range(blocks):
        start = b * RS_BLOCK_LEN
        block = encoded[start : start + RS_BLOCK_LEN]
        decoded = _rs_decode_block(block)
        out[out_offset : out_offset + RS_DATA_LEN] = decoded
        out_offset += RS_DATA_LEN
    return bytes(out[:decoded_length])


def _init_gf() -> None:
    global GF_READY
    if GF_READY:
        return
    x = 1
    for i in range(255):
        GF_EXP[i] = x
        GF_LOG[x] = i
        x <<= 1
        if x & 0x100:
            x ^= 0x11D
    for i in range(255, 512):
        GF_EXP[i] = GF_EXP[i - 255]
    GF_READY = True


def _gf_mul(a: int, b: int) -> int:
    if a == 0 or b == 0:
        return 0
    return GF_EXP[(GF_LOG[a] + GF_LOG[b]) % 255]


def _gf_div(a: int, b: int) -> int:
    if b == 0:
        raise ValueError("GF divide by zero")
    if a == 0:
        return 0
    return GF_EXP[(GF_LOG[a] + 255 - GF_LOG[b]) % 255]


def _gf_inverse(a: int) -> int:
    if a == 0:
        raise ValueError("GF inverse of zero")
    return GF_EXP[255 - GF_LOG[a]]


def _gf_pow(exp: int) -> int:
    power = exp % 255
    if power < 0:
        power += 255
    return GF_EXP[power]


def _poly_add(a: List[int], b: List[int]) -> List[int]:
    length = max(len(a), len(b))
    out = [0] * length
    for i in range(length):
        ai = len(a) - length + i
        bi = len(b) - length + i
        av = a[ai] if ai >= 0 else 0
        bv = b[bi] if bi >= 0 else 0
        out[i] = av ^ bv
    return out


def _poly_scale(p: List[int], x: int) -> List[int]:
    return [_gf_mul(c, x) for c in p]


def _poly_mul(a: List[int], b: List[int]) -> List[int]:
    out = [0] * (len(a) + len(b) - 1)
    for i in range(len(a)):
        for j in range(len(b)):
            out[i + j] ^= _gf_mul(a[i], b[j])
    return out


def _poly_eval(p: List[int], x: int) -> int:
    y = p[0]
    for i in range(1, len(p)):
        y = _gf_mul(y, x) ^ p[i]
    return y


def _get_rs_generator() -> List[int]:
    global RS_GENERATOR
    if RS_GENERATOR is not None:
        return RS_GENERATOR
    _init_gf()
    gen = [1]
    for i in range(RS_PARITY_LEN):
        gen = _poly_mul(gen, [1, GF_EXP[i]])
    RS_GENERATOR = gen
    return gen


def _rs_compute_parity(data: bytes, gen: List[int]) -> bytes:
    parity = bytearray(RS_PARITY_LEN)
    for value in data:
        feedback = value ^ parity[0]
        for j in range(RS_PARITY_LEN - 1):
            parity[j] = parity[j + 1]
        parity[RS_PARITY_LEN - 1] = 0
        if feedback != 0:
            for j in range(RS_PARITY_LEN):
                parity[j] ^= _gf_mul(gen[j + 1], feedback)
    return bytes(parity)


def _rs_decode_block(block: bytes) -> bytes:
    synd = _rs_calc_syndromes(block, RS_PARITY_LEN)
    has_error = any(v != 0 for v in synd)
    if not has_error:
        return block[:RS_DATA_LEN]

    err_loc = _rs_find_error_locator(synd, RS_PARITY_LEN)
    err_pos = _rs_find_errors(err_loc, len(block))
    if not err_pos:
        raise ValueError("RS decode failed: too many errors")
    if len(err_pos) > RS_PARITY_LEN // 2:
        raise ValueError("RS decode failed: too many errors")

    corrected = _rs_correct_errors(block, synd, err_pos)

    synd_after = _rs_calc_syndromes(corrected, RS_PARITY_LEN)
    if any(v != 0 for v in synd_after):
        raise ValueError("RS decode failed: could not correct")

    return corrected[:RS_DATA_LEN]


def _rs_calc_syndromes(msg: bytes, nsym: int) -> List[int]:
    synd = [0] * (nsym + 1)
    msg_array = list(msg)
    for i in range(nsym):
        synd[i + 1] = _poly_eval(msg_array, GF_EXP[i])
    return synd


def _rs_find_error_locator(synd: List[int], nsym: int) -> List[int]:
    err_loc = [1]
    old_loc = [1]
    for i in range(nsym):
        delta = synd[i + 1]
        for j in range(1, len(err_loc)):
            delta ^= _gf_mul(err_loc[-1 - j], synd[i + 1 - j])
        old_loc.append(0)
        if delta != 0:
            if len(old_loc) > len(err_loc):
                new_loc = _poly_scale(old_loc, delta)
                old_loc = _poly_scale(err_loc, _gf_inverse(delta))
                err_loc = new_loc
            err_loc = _poly_add(err_loc, _poly_scale(old_loc, delta))
    while len(err_loc) > 1 and err_loc[0] == 0:
        err_loc.pop(0)
    normalized = list(reversed(err_loc))
    while len(normalized) > 1 and normalized[0] == 0:
        normalized.pop(0)
    return normalized


def _rs_find_errors(err_loc: List[int], msg_len: int) -> Optional[List[int]]:
    err_pos: List[int] = []
    for i in range(msg_len):
        x = GF_EXP[i]
        if _poly_eval(err_loc, x) == 0:
            err_pos.append(msg_len - 1 - i)
    if len(err_pos) != len(err_loc) - 1:
        return None
    return err_pos


def _rs_correct_errors(msg: bytes, synd: List[int], err_pos: List[int]) -> bytes:
    msg_out = bytearray(msg)
    msg_len = len(msg)
    magnitudes = _solve_error_magnitudes(err_pos, synd, msg_len)
    for i, pos in enumerate(err_pos):
        msg_out[pos] ^= magnitudes[i]
    return bytes(msg_out)


def _solve_error_magnitudes(err_pos: List[int], synd: List[int], msg_len: int) -> List[int]:
    t = len(err_pos)
    A = [[0] * t for _ in range(t)]
    b = [0] * t

    for row in range(t):
        b[row] = synd[row + 1]
        for col in range(t):
            power = (msg_len - 1 - err_pos[col]) * row
            A[row][col] = 1 if row == 0 else _gf_pow(power)

    for col in range(t):
        pivot = col
        while pivot < t and A[pivot][col] == 0:
            pivot += 1
        if pivot == t:
            raise ValueError("RS decode failed: singular matrix")
        if pivot != col:
            A[pivot], A[col] = A[col], A[pivot]
            b[pivot], b[col] = b[col], b[pivot]

        inv = _gf_div(1, A[col][col])
        for j in range(col, t):
            A[col][j] = _gf_mul(A[col][j], inv)
        b[col] = _gf_mul(b[col], inv)

        for row in range(t):
            if row == col:
                continue
            factor = A[row][col]
            if factor == 0:
                continue
            for j in range(col, t):
                A[row][j] ^= _gf_mul(factor, A[col][j])
            b[row] ^= _gf_mul(factor, b[col])

    return b
