import { applyFade } from "./envelope.js";

export interface ToneSampleOptions {
  sampleRate: number;
  durationMs: number;
  levelDb: number;
  fadeMs: number;
}

export function toneToSamples(freq: number, options: ToneSampleOptions): Float32Array {
  const { sampleRate, durationMs, levelDb, fadeMs } = options;
  const sampleCount = Math.max(1, Math.round((durationMs / 1000) * sampleRate));
  const out = new Float32Array(sampleCount);
  const amplitude = Math.pow(10, levelDb / 20);
  const phaseStep = (2 * Math.PI * freq) / sampleRate;
  let phase = 0;
  for (let i = 0; i < sampleCount; i += 1) {
    phase += phaseStep;
    if (phase > Math.PI * 2) {
      phase -= Math.PI * 2;
    }
    out[i] = Math.sin(phase) * amplitude;
  }
  applyFade(out, sampleRate, fadeMs);
  return out;
}
