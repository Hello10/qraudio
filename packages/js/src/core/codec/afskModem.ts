import { applyFade } from "./envelope.js";

interface ToneOptions {
  sampleRate: number;
  baud: number;
  markFreq: number;
  spaceFreq: number;
  levelDb: number;
  fadeMs: number;
}

export function tonesToSamples(tones: number[], options: ToneOptions): Float32Array {
  const { sampleRate, baud, markFreq, spaceFreq, levelDb, fadeMs } = options;
  const samplesPerBit = sampleRate / baud;
  const totalSamples = Math.ceil(tones.length * samplesPerBit);
  const out = new Float32Array(totalSamples);
  const amplitude = Math.pow(10, levelDb / 20);

  let phase = 0;
  let sampleIndex = 0;
  let boundary = samplesPerBit;

  for (let bitIndex = 0; bitIndex < tones.length; bitIndex += 1) {
    const freq = tones[bitIndex] === 1 ? markFreq : spaceFreq;
    const phaseStep = (2 * Math.PI * freq) / sampleRate;
    while (sampleIndex < boundary && sampleIndex < totalSamples) {
      phase += phaseStep;
      if (phase > Math.PI * 2) {
        phase -= Math.PI * 2;
      }
      out[sampleIndex] = Math.sin(phase) * amplitude;
      sampleIndex += 1;
    }
    boundary += samplesPerBit;
  }

  applyFade(out, sampleRate, fadeMs);
  return out;
}

export function demodAfsk(
  samples: Float32Array,
  sampleRate: number,
  baud: number,
  offset: number,
  markFreq: number,
  spaceFreq: number
): number[] {
  const samplesPerBit = sampleRate / baud;
  const tones: number[] = [];

  let start = offset;
  let boundary = start + samplesPerBit;

  while (boundary <= samples.length) {
    const end = Math.floor(boundary);
    const len = end - start;
    if (len <= 1) {
      start = end;
      boundary += samplesPerBit;
      continue;
    }
    const markEnergy = goertzel(samples, start, len, markFreq, sampleRate);
    const spaceEnergy = goertzel(samples, start, len, spaceFreq, sampleRate);
    tones.push(markEnergy >= spaceEnergy ? 1 : 0);
    start = end;
    boundary += samplesPerBit;
  }

  return tones;
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
