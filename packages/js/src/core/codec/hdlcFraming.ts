const FLAG_BITS = [0, 1, 1, 1, 1, 1, 1, 0];

export interface BitFrame {
  bytes: Uint8Array;
  startBit: number;
  endBit: number;
}

export function buildBitstream(frameBytes: Uint8Array, preambleMs: number, baud: number): number[] {
  const bits = bytesToBitsLSB(frameBytes);
  const stuffed = bitStuff(bits);

  const preambleFlags = Math.max(1, Math.round((preambleMs / 1000) * baud / 8));
  const out: number[] = [];

  for (let i = 0; i < preambleFlags; i += 1) {
    out.push(...FLAG_BITS);
  }
  out.push(...FLAG_BITS);
  out.push(...stuffed);
  out.push(...FLAG_BITS);

  return out;
}

export function extractFrames(bits: number[]): BitFrame[] {
  const flags = findFlagIndices(bits);
  if (flags.length < 2) {
    return [];
  }

  const frames: BitFrame[] = [];
  for (let i = 0; i < flags.length - 1; i += 1) {
    const start = flags[i] + 8;
    const end = flags[i + 1];
    if (end <= start) {
      continue;
    }
    const rawBits = bits.slice(start, end);
    if (rawBits.length < 16) {
      continue;
    }
    const dataBits = bitDestuff(rawBits);
    const bytes = bitsToBytesLSB(dataBits);
    if (bytes.length < 4 + 1 + 1 + 2 + 2) {
      continue;
    }
    frames.push({ bytes, startBit: start, endBit: end });
  }
  return frames;
}

function bytesToBitsLSB(bytes: Uint8Array): number[] {
  const bits: number[] = [];
  for (const byte of bytes) {
    for (let i = 0; i < 8; i += 1) {
      bits.push((byte >> i) & 1);
    }
  }
  return bits;
}

function bitsToBytesLSB(bits: number[]): Uint8Array {
  const byteCount = Math.floor(bits.length / 8);
  const out = new Uint8Array(byteCount);
  for (let i = 0; i < byteCount; i += 1) {
    let value = 0;
    for (let bit = 0; bit < 8; bit += 1) {
      value |= (bits[i * 8 + bit] & 1) << bit;
    }
    out[i] = value;
  }
  return out;
}

function bitStuff(bits: number[]): number[] {
  const out: number[] = [];
  let ones = 0;
  for (const bit of bits) {
    out.push(bit);
    if (bit === 1) {
      ones += 1;
      if (ones === 5) {
        out.push(0);
        ones = 0;
      }
    } else {
      ones = 0;
    }
  }
  return out;
}

function bitDestuff(bits: number[]): number[] {
  const out: number[] = [];
  let ones = 0;
  for (let i = 0; i < bits.length; i += 1) {
    const bit = bits[i];
    if (bit === 1) {
      ones += 1;
      out.push(bit);
    } else {
      if (ones === 5) {
        ones = 0;
        continue;
      }
      ones = 0;
      out.push(bit);
    }
  }
  return out;
}

function findFlagIndices(bits: number[]): number[] {
  const indices: number[] = [];
  for (let i = 0; i <= bits.length - 8; i += 1) {
    let match = true;
    for (let j = 0; j < 8; j += 1) {
      if (bits[i + j] !== FLAG_BITS[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      indices.push(i);
      i += 7;
    }
  }
  return indices;
}
