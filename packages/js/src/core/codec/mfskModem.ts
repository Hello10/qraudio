import { applyFade } from "./envelope.js";

interface MfskOptions {
  sampleRate: number;
  baud: number;
  tones: number[];
  bitsPerSymbol: number;
  levelDb: number;
  fadeMs: number;
}

export function mfskBitsToSamples(bits: number[], options: MfskOptions): Float32Array {
  const { sampleRate, baud, tones, bitsPerSymbol, levelDb, fadeMs } = options;
  if (bitsPerSymbol <= 0) {
    throw new Error("bitsPerSymbol must be >= 1");
  }
  const requiredTones = 1 << bitsPerSymbol;
  if (tones.length < requiredTones) {
    throw new Error(`MFSK requires ${requiredTones} tones (got ${tones.length})`);
  }
  const symbolCount = Math.max(1, Math.ceil(bits.length / bitsPerSymbol));
  const samplesPerBit = sampleRate / baud;
  const samplesPerSymbol = samplesPerBit * bitsPerSymbol;
  const totalSamples = Math.ceil(symbolCount * samplesPerSymbol);
  const out = new Float32Array(totalSamples);
  const amplitude = Math.pow(10, levelDb / 20);

  let phase = 0;
  let sampleIndex = 0;
  let boundary = samplesPerSymbol;
  const symbolMask = (1 << bitsPerSymbol) - 1;

  for (let symbolIndex = 0; symbolIndex < symbolCount; symbolIndex += 1) {
    let symbol = 0;
    const bitOffset = symbolIndex * bitsPerSymbol;
    for (let i = 0; i < bitsPerSymbol; i += 1) {
      const bit = bits[bitOffset + i] ?? 0;
      symbol |= (bit & 1) << i;
    }
    symbol &= symbolMask;
    const freq = tones[symbol] ?? tones[0];
    const phaseStep = (2 * Math.PI * freq) / sampleRate;

    while (sampleIndex < boundary && sampleIndex < totalSamples) {
      phase += phaseStep;
      if (phase > Math.PI * 2) {
        phase -= Math.PI * 2;
      }
      out[sampleIndex] = Math.sin(phase) * amplitude;
      sampleIndex += 1;
    }
    boundary += samplesPerSymbol;
  }

  if (fadeMs > 0) {
    const fadeSamples = Math.round((fadeMs / 1000) * sampleRate);
    if (fadeSamples > 0) {
      const padded = new Float32Array(out.length + fadeSamples);
      padded.set(out, 0);
      applyFade(padded, sampleRate, fadeMs);
      return padded;
    }
  }

  applyFade(out, sampleRate, fadeMs);
  return out;
}

export function demodMfsk(
  samples: Float32Array,
  sampleRate: number,
  baud: number,
  offset: number,
  tones: number[],
  bitsPerSymbol: number
): number[] {
  if (bitsPerSymbol <= 0) {
    return [];
  }
  const requiredTones = 1 << bitsPerSymbol;
  if (tones.length < requiredTones) {
    return [];
  }
  const samplesPerBit = sampleRate / baud;
  const samplesPerSymbol = samplesPerBit * bitsPerSymbol;
  const bits: number[] = [];
  const toneCount = 1 << bitsPerSymbol;
  const usedTones = tones.slice(0, toneCount);

  let start = offset;
  let boundary = start + samplesPerSymbol;

  while (boundary <= samples.length) {
    const end = Math.floor(boundary);
    const len = end - start;
    if (len <= 1) {
      start = end;
      boundary += samplesPerSymbol;
      continue;
    }

    let bestIndex = 0;
    let bestEnergy = -Infinity;
    for (let i = 0; i < usedTones.length; i += 1) {
      const energy = goertzel(samples, start, len, usedTones[i], sampleRate);
      if (energy > bestEnergy) {
        bestEnergy = energy;
        bestIndex = i;
      }
    }

    for (let bit = 0; bit < bitsPerSymbol; bit += 1) {
      bits.push((bestIndex >> bit) & 1);
    }

    start = end;
    boundary += samplesPerSymbol;
  }

  return bits;
}

function goertzel(
  samples: Float32Array,
  start: number,
  length: number,
  freq: number,
  sampleRate: number
): number {
  const omega = (2 * Math.PI * freq) / sampleRate;
  const coeff = 2 * Math.cos(omega);
  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  const end = start + length;
  for (let i = start; i < end; i += 1) {
    s0 = samples[i] + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return s1 * s1 + s2 * s2 - coeff * s1 * s2;
}
