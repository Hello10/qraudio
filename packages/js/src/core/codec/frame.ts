import { concatBytes } from "./bytes.js";
import { crc16X25 } from "./crc16x25.js";
import { FLAG_FEC, FLAG_GZIP, MAGIC, VERSION } from "./constants.js";
import { profileFromFlags } from "./profile.js";
import type { Profile } from "../types.js";

export interface FrameHeader {
  flags: number;
  payloadLength: number;
  profile: Profile;
  gzipEnabled: boolean;
  fecEnabled: boolean;
}

export interface ParsedFrame {
  header: FrameHeader;
  payloadWithFec: Uint8Array;
  crcExpected: number;
  crcActual: number;
  raw: Uint8Array;
}

export function buildFrame(
  payloadWithFec: Uint8Array,
  payloadLength: number,
  flags: number
): Uint8Array {
  const header = new Uint8Array(4 + 1 + 1 + 2);
  header.set(MAGIC, 0);
  header[4] = VERSION;
  header[5] = flags;
  header[6] = (payloadLength >> 8) & 0xff;
  header[7] = payloadLength & 0xff;

  const frameNoCrc = concatBytes(header, payloadWithFec);
  const crc = crc16X25(frameNoCrc);
  const crcBytes = new Uint8Array([crc & 0xff, (crc >> 8) & 0xff]);
  return concatBytes(frameNoCrc, crcBytes);
}

export function parseFrame(bytes: Uint8Array): ParsedFrame | null {
  if (bytes.length < 4 + 1 + 1 + 2 + 2) {
    return null;
  }
  if (!hasMagic(bytes)) {
    return null;
  }
  if (bytes[4] !== VERSION) {
    return null;
  }

  const flags = bytes[5];
  const payloadLength = (bytes[6] << 8) | bytes[7];
  const payloadWithFec = bytes.slice(8, bytes.length - 2);

  const crcExpected = (bytes[bytes.length - 1] << 8) | bytes[bytes.length - 2];
  const crcActual = crc16X25(bytes.slice(0, bytes.length - 2));

  const profile = profileFromFlags(flags);
  if (!profile) {
    return null;
  }

  return {
    header: {
      flags,
      payloadLength,
      profile,
      gzipEnabled: (flags & FLAG_GZIP) !== 0,
      fecEnabled: (flags & FLAG_FEC) !== 0,
    },
    payloadWithFec,
    crcExpected,
    crcActual,
    raw: bytes,
  };
}

function hasMagic(bytes: Uint8Array): boolean {
  if (bytes.length < 4) {
    return false;
  }
  for (let i = 0; i < 4; i += 1) {
    if (bytes[i] !== MAGIC[i]) {
      return false;
    }
  }
  return true;
}
