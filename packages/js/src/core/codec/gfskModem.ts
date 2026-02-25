import { applyFade } from "./envelope.js";

interface GfskOptions {
  tones: number[];
  sampleRate: number;
  baud: number;
  markFreq: number;
  spaceFreq: number;
  levelDb: number;
  fadeMs: number;
  bt?: number;
  spanSymbols?: number;
}

export function gfskTonesToSamples(options: GfskOptions): Float32Array {
  const { tones, sampleRate, baud, markFreq, spaceFreq, levelDb, fadeMs } = options;
  const samplesPerBit = sampleRate / baud;
  const totalSamples = Math.ceil(tones.length * samplesPerBit);

  const nrz = new Float32Array(totalSamples);
  let sampleIndex = 0;
  let boundary = samplesPerBit;
  for (let bitIndex = 0; bitIndex < tones.length; bitIndex += 1) {
    const level = tones[bitIndex] === 1 ? 1 : -1;
    while (sampleIndex < boundary && sampleIndex < totalSamples) {
      nrz[sampleIndex] = level;
      sampleIndex += 1;
    }
    boundary += samplesPerBit;
  }

  const bt = options.bt ?? 1.0;
  const spanSymbols = options.spanSymbols ?? 4;
  const shaped = gaussianFilter(nrz, samplesPerBit, bt, spanSymbols);

  const amplitude = Math.pow(10, levelDb / 20);
  const centerFreq = (markFreq + spaceFreq) / 2;
  const deviation = (markFreq - spaceFreq) / 2;

  let out = new Float32Array(totalSamples);
  let phase = 0;
  for (let i = 0; i < totalSamples; i += 1) {
    const freq = centerFreq + deviation * shaped[i];
    phase += (2 * Math.PI * freq) / sampleRate;
    if (phase > Math.PI * 2) {
      phase -= Math.PI * 2;
    }
    out[i] = Math.sin(phase) * amplitude;
  }

  if (fadeMs > 0) {
    const fadeSamples = Math.round((fadeMs / 1000) * sampleRate);
    if (fadeSamples > 0) {
      const padded = new Float32Array(out.length + fadeSamples);
      padded.set(out, 0);
      applyFade(padded, sampleRate, fadeMs);
      out = padded;
      return out;
    }
  }

  return out;
}

interface DemodGfskOptions {
  samples: Float32Array;
  sampleRate: number;
  baud: number;
  offset: number;
  markFreq: number;
  spaceFreq: number;
}

export function demodGfsk(options: DemodGfskOptions): number[] {
  const { samples, sampleRate, baud, offset, markFreq, spaceFreq } = options;
  const samplesPerBit = sampleRate / baud;
  const tones: number[] = [];
  const centerFreq = (markFreq + spaceFreq) / 2;
  const sign = markFreq >= spaceFreq ? 1 : -1;
  const cutoff = Math.min(sampleRate / 4, baud * 2);
  const alpha = 1 - Math.exp((-2 * Math.PI * cutoff) / sampleRate);

  const angleStep = (2 * Math.PI * centerFreq) / sampleRate;
  const cosStep = Math.cos(angleStep);
  const sinStep = Math.sin(angleStep);
  let cos = Math.cos(angleStep * offset);
  let sin = Math.sin(angleStep * offset);

  let filtI = 0;
  let filtQ = 0;
  let prevI = 0;
  let prevQ = 0;
  let hasPrev = false;
  let sampleIndex = offset;
  let boundary = offset + samplesPerBit;
  let acc = 0;
  let count = 0;

  while (sampleIndex < samples.length) {
    const sample = samples[sampleIndex];
    const iVal = sample * cos;
    const qVal = -sample * sin;
    filtI += alpha * (iVal - filtI);
    filtQ += alpha * (qVal - filtQ);

    if (hasPrev) {
      const dot = filtI * prevI + filtQ * prevQ;
      const cross = filtI * prevQ - filtQ * prevI;
      const phaseDiff = Math.atan2(cross, dot);
      acc += phaseDiff;
      count += 1;
    } else {
      hasPrev = true;
    }

    prevI = filtI;
    prevQ = filtQ;

    const nextCos = cos * cosStep - sin * sinStep;
    const nextSin = sin * cosStep + cos * sinStep;
    cos = nextCos;
    sin = nextSin;

    sampleIndex += 1;
    if (sampleIndex >= boundary) {
      if (count === 0) {
        tones.push(1);
      } else {
        const avg = acc / count;
        tones.push(avg * sign >= 0 ? 1 : 0);
      }
      acc = 0;
      count = 0;
      boundary += samplesPerBit;
    }
  }

  return tones;
}

function gaussianFilter(
  samples: Float32Array,
  samplesPerBit: number,
  bt: number,
  spanSymbols: number
): Float32Array {
  if (bt <= 0) {
    return samples.slice();
  }
  const sigma = (samplesPerBit * Math.sqrt(Math.log(2))) / (2 * Math.PI * bt);
  const kernelLength = Math.max(3, Math.round(spanSymbols * samplesPerBit));
  const size = kernelLength % 2 === 0 ? kernelLength + 1 : kernelLength;
  const half = Math.floor(size / 2);
  const kernel = new Float32Array(size);
  let sum = 0;
  for (let i = 0; i < size; i += 1) {
    const x = i - half;
    const value = Math.exp(-0.5 * (x / sigma) ** 2);
    kernel[i] = value;
    sum += value;
  }
  for (let i = 0; i < size; i += 1) {
    kernel[i] /= sum;
  }

  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    let acc = 0;
    for (let k = 0; k < size; k += 1) {
      const idx = clampIndex(i + k - half, samples.length);
      acc += samples[idx] * kernel[k];
    }
    out[i] = acc;
  }
  return out;
}

function clampIndex(index: number, length: number): number {
  if (index < 0) return 0;
  if (index >= length) return length - 1;
  return index;
}
