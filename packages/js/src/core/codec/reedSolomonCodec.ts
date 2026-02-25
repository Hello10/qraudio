import { RS_BLOCK_LEN, RS_DATA_LEN, RS_PARITY_LEN } from "./constants.js";

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
let GF_READY = false;
let RS_GENERATOR: number[] | null = null;

export function rsEncode(payload: Uint8Array): Uint8Array {
  initGf();
  const gen = getRsGenerator();
  const blocks = Math.ceil(payload.length / RS_DATA_LEN);
  const out = new Uint8Array(blocks * RS_BLOCK_LEN);
  let outOffset = 0;

  for (let b = 0; b < blocks; b += 1) {
    const start = b * RS_DATA_LEN;
    const chunk = payload.slice(start, start + RS_DATA_LEN);
    const data = new Uint8Array(RS_DATA_LEN);
    data.set(chunk);
    const parity = rsComputeParity(data, gen);
    out.set(data, outOffset);
    outOffset += RS_DATA_LEN;
    out.set(parity, outOffset);
    outOffset += RS_PARITY_LEN;
  }
  return out;
}

export function rsDecode(encoded: Uint8Array, decodedLength: number): Uint8Array {
  initGf();
  if (encoded.length % RS_BLOCK_LEN !== 0) {
    throw new Error("Invalid RS payload length");
  }
  const blocks = encoded.length / RS_BLOCK_LEN;
  const out = new Uint8Array(blocks * RS_DATA_LEN);
  let outOffset = 0;
  for (let b = 0; b < blocks; b += 1) {
    const start = b * RS_BLOCK_LEN;
    const block = encoded.slice(start, start + RS_BLOCK_LEN);
    const decoded = rsDecodeBlock(block);
    out.set(decoded, outOffset);
    outOffset += RS_DATA_LEN;
  }
  return out.slice(0, decodedLength);
}

function initGf(): void {
  if (GF_READY) {
    return;
  }
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) {
      x ^= 0x11d;
    }
  }
  for (let i = 255; i < 512; i += 1) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
  GF_READY = true;
}

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) {
    return 0;
  }
  return GF_EXP[(GF_LOG[a] + GF_LOG[b]) % 255];
}

function gfDiv(a: number, b: number): number {
  if (b === 0) {
    throw new Error("GF divide by zero");
  }
  if (a === 0) {
    return 0;
  }
  return GF_EXP[(GF_LOG[a] + 255 - GF_LOG[b]) % 255];
}

function gfInverse(a: number): number {
  if (a === 0) {
    throw new Error("GF inverse of zero");
  }
  return GF_EXP[255 - GF_LOG[a]];
}

function gfPow(exp: number): number {
  let power = exp % 255;
  if (power < 0) {
    power += 255;
  }
  return GF_EXP[power];
}

function polyAdd(a: number[], b: number[]): number[] {
  const len = Math.max(a.length, b.length);
  const out = new Array(len).fill(0);
  for (let i = 0; i < len; i += 1) {
    const ai = a.length - len + i;
    const bi = b.length - len + i;
    const av = ai >= 0 ? a[ai] : 0;
    const bv = bi >= 0 ? b[bi] : 0;
    out[i] = av ^ bv;
  }
  return out;
}

function polyScale(p: number[], x: number): number[] {
  return p.map((c) => gfMul(c, x));
}

function polyMul(a: number[], b: number[]): number[] {
  const out = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i += 1) {
    for (let j = 0; j < b.length; j += 1) {
      out[i + j] ^= gfMul(a[i], b[j]);
    }
  }
  return out;
}

function polyEval(p: number[], x: number): number {
  let y = p[0];
  for (let i = 1; i < p.length; i += 1) {
    y = gfMul(y, x) ^ p[i];
  }
  return y;
}

function polyDeriv(p: number[]): number[] {
  const out: number[] = [];
  const degree = p.length - 1;
  for (let i = 0; i < p.length - 1; i += 1) {
    const power = degree - i;
    if (power % 2 === 1) {
      out.push(p[i]);
    }
  }
  return out.length === 0 ? [0] : out;
}

function getRsGenerator(): number[] {
  if (RS_GENERATOR) {
    return RS_GENERATOR;
  }
  initGf();
  let gen = [1];
  for (let i = 0; i < RS_PARITY_LEN; i += 1) {
    gen = polyMul(gen, [1, GF_EXP[i]]);
  }
  RS_GENERATOR = gen;
  return gen;
}

function rsComputeParity(data: Uint8Array, gen: number[]): Uint8Array {
  const parity = new Uint8Array(RS_PARITY_LEN);
  for (let i = 0; i < data.length; i += 1) {
    const feedback = data[i] ^ parity[0];
    for (let j = 0; j < RS_PARITY_LEN - 1; j += 1) {
      parity[j] = parity[j + 1];
    }
    parity[RS_PARITY_LEN - 1] = 0;
    if (feedback !== 0) {
      for (let j = 0; j < RS_PARITY_LEN; j += 1) {
        parity[j] ^= gfMul(gen[j + 1], feedback);
      }
    }
  }
  return parity;
}

function rsDecodeBlock(block: Uint8Array): Uint8Array {
  const synd = rsCalcSyndromes(block, RS_PARITY_LEN);
  const hasError = synd.some((v) => v !== 0);
  if (!hasError) {
    return block.slice(0, RS_DATA_LEN);
  }

  const errLoc = rsFindErrorLocator(synd, RS_PARITY_LEN);
  const errPos = rsFindErrors(errLoc, block.length);
  if (!errPos || errPos.length === 0) {
    throw new Error("RS decode failed: too many errors");
  }
  if (errPos.length > RS_PARITY_LEN / 2) {
    throw new Error("RS decode failed: too many errors");
  }

  const corrected = rsCorrectErrors(block, synd, errPos);

  const syndAfter = rsCalcSyndromes(corrected, RS_PARITY_LEN);
  if (syndAfter.some((v) => v !== 0)) {
    throw new Error("RS decode failed: could not correct");
  }

  return corrected.slice(0, RS_DATA_LEN);
}

function rsCalcSyndromes(msg: Uint8Array, nsym: number): Uint8Array {
  const synd = new Uint8Array(nsym + 1);
  synd[0] = 0;
  const msgArray = Array.from(msg);
  for (let i = 0; i < nsym; i += 1) {
    synd[i + 1] = polyEval(msgArray, GF_EXP[i]);
  }
  return synd;
}

function rsFindErrorLocator(synd: Uint8Array, nsym: number): number[] {
  let errLoc = [1];
  let oldLoc = [1];
  for (let i = 0; i < nsym; i += 1) {
    let delta = synd[i + 1];
    for (let j = 1; j < errLoc.length; j += 1) {
      delta ^= gfMul(errLoc[errLoc.length - 1 - j], synd[i + 1 - j]);
    }
    oldLoc.push(0);
    if (delta !== 0) {
      if (oldLoc.length > errLoc.length) {
        const newLoc = polyScale(oldLoc, delta);
        oldLoc = polyScale(errLoc, gfInverse(delta));
        errLoc = newLoc;
      }
      errLoc = polyAdd(errLoc, polyScale(oldLoc, delta));
    }
  }
  while (errLoc.length > 1 && errLoc[0] === 0) {
    errLoc.shift();
  }
  const normalized = errLoc.slice().reverse();
  while (normalized.length > 1 && normalized[0] === 0) {
    normalized.shift();
  }
  return normalized;
}

function rsFindErrors(errLoc: number[], msgLen: number): number[] | null {
  const errPos: number[] = [];
  for (let i = 0; i < msgLen; i += 1) {
    const x = GF_EXP[i];
    if (polyEval(errLoc, x) === 0) {
      errPos.push(msgLen - 1 - i);
    }
  }
  if (errPos.length !== errLoc.length - 1) {
    return null;
  }
  return errPos;
}

function rsFindErrorEvaluator(synd: Uint8Array, errLoc: number[], nsym: number): number[] {
  const syndArray = Array.from(synd.slice(1)).reverse();
  const errLocReversed = errLoc.slice().reverse();
  const product = polyMul(errLocReversed, syndArray);
  return product.slice(product.length - nsym);
}

function rsCorrectErrors(msg: Uint8Array, synd: Uint8Array, errPos: number[]): Uint8Array {
  const msgOut = Uint8Array.from(msg);
  const msgLen = msg.length;
  const magnitudes = solveErrorMagnitudes(errPos, synd, msgLen);
  for (let i = 0; i < errPos.length; i += 1) {
    msgOut[errPos[i]] ^= magnitudes[i];
  }

  return msgOut;
}

function solveErrorMagnitudes(
  errPos: number[],
  synd: Uint8Array,
  msgLen: number
): number[] {
  // Solve the linear system implied by the syndromes to recover error magnitudes.
  // This avoids subtle evaluation/Forney conventions and works reliably for small t.
  const t = errPos.length;
  const A: number[][] = Array.from({ length: t }, () => new Array(t).fill(0));
  const b: number[] = new Array(t).fill(0);

  for (let row = 0; row < t; row += 1) {
    b[row] = synd[row + 1];
    for (let col = 0; col < t; col += 1) {
      const power = (msgLen - 1 - errPos[col]) * row;
      A[row][col] = row === 0 ? 1 : gfPow(power);
    }
  }

  for (let col = 0; col < t; col += 1) {
    let pivot = col;
    while (pivot < t && A[pivot][col] === 0) {
      pivot += 1;
    }
    if (pivot === t) {
      throw new Error("RS decode failed: singular matrix");
    }
    if (pivot !== col) {
      [A[pivot], A[col]] = [A[col], A[pivot]];
      [b[pivot], b[col]] = [b[col], b[pivot]];
    }

    const inv = gfDiv(1, A[col][col]);
    for (let j = col; j < t; j += 1) {
      A[col][j] = gfMul(A[col][j], inv);
    }
    b[col] = gfMul(b[col], inv);

    for (let row = 0; row < t; row += 1) {
      if (row === col) continue;
      const factor = A[row][col];
      if (factor === 0) continue;
      for (let j = col; j < t; j += 1) {
        A[row][j] ^= gfMul(factor, A[col][j]);
      }
      b[row] ^= gfMul(factor, b[col]);
    }
  }

  return b;
}
