from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from .bytes import concatBytes
from .crc16x25 import crc16X25
from .constants import FLAG_FEC, FLAG_GZIP, MAGIC, VERSION
from .profile import profileFromFlags
from ..profiles import Profile


@dataclass
class FrameHeader:
    flags: int
    payloadLength: int
    profile: Profile
    gzipEnabled: bool
    fecEnabled: bool


@dataclass
class ParsedFrame:
    header: FrameHeader
    payloadWithFec: bytes
    crcExpected: int
    crcActual: int
    raw: bytes


def buildFrame(payloadWithFec: bytes, payloadLength: int, flags: int) -> bytes:
    header = bytearray(4 + 1 + 1 + 2)
    header[0:4] = MAGIC
    header[4] = VERSION
    header[5] = flags & 0xFF
    header[6] = (payloadLength >> 8) & 0xFF
    header[7] = payloadLength & 0xFF

    frame_no_crc = concatBytes(bytes(header), payloadWithFec)
    crc = crc16X25(frame_no_crc)
    crc_bytes = bytes([crc & 0xFF, (crc >> 8) & 0xFF])
    return concatBytes(frame_no_crc, crc_bytes)


def parseFrame(data: bytes) -> Optional[ParsedFrame]:
    if len(data) < 4 + 1 + 1 + 2 + 2:
        return None
    if not _has_magic(data):
        return None
    if data[4] != VERSION:
        return None

    flags = data[5]
    payloadLength = (data[6] << 8) | data[7]
    payloadWithFec = data[8:-2]

    crcExpected = (data[-1] << 8) | data[-2]
    crcActual = crc16X25(data[:-2])

    profile = profileFromFlags(flags)
    if not profile:
        return None

    return ParsedFrame(
        header=FrameHeader(
            flags=flags,
            payloadLength=payloadLength,
            profile=profile,
            gzipEnabled=(flags & FLAG_GZIP) != 0,
            fecEnabled=(flags & FLAG_FEC) != 0,
        ),
        payloadWithFec=payloadWithFec,
        crcExpected=crcExpected,
        crcActual=crcActual,
        raw=data,
    )


def _has_magic(data: bytes) -> bool:
    if len(data) < 4:
        return False
    return data[0:4] == MAGIC
