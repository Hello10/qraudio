export function applyFade(samples: Float32Array, sampleRate: number, fadeMs: number): void {
  const fadeSamples = Math.max(0, Math.round((fadeMs / 1000) * sampleRate));
  if (fadeSamples === 0 || fadeSamples * 2 > samples.length) {
    return;
  }
  for (let i = 0; i < fadeSamples; i += 1) {
    const t = i / fadeSamples;
    const gain = 0.5 * (1 - Math.cos(Math.PI * t));
    samples[i] *= gain;
    samples[samples.length - 1 - i] *= gain;
  }
}
