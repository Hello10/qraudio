import { DEFAULT_PROFILE, encode, scan } from "../dist/index.js";

function lcg(seed = 123456789) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function addWhiteNoise(samples, snrDb, seed = 42) {
  const rand = lcg(seed);
  let signalEnergy = 0;
  for (let i = 0; i < samples.length; i += 1) {
    signalEnergy += samples[i] * samples[i];
  }
  const signalRms = Math.sqrt(signalEnergy / samples.length);
  const noiseRms = signalRms / Math.pow(10, snrDb / 20);

  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    const noise = (rand() * 2 - 1) * noiseRms;
    out[i] = samples[i] + noise;
  }
  return out;
}

describe("robustness", () => {
  test("scan works with moderate noise", () => {
    const payload = { __type: "noise", value: 1 };
    const encoded = encode(payload, { profile: DEFAULT_PROFILE });
    const noisy = addWhiteNoise(encoded.samples, 15);

    const silence = new Float32Array(Math.round(encoded.sampleRate * 0.2));
    const combined = new Float32Array(silence.length + noisy.length + silence.length);
    combined.set(silence, 0);
    combined.set(noisy, silence.length);
    combined.set(silence, silence.length + noisy.length);

    const results = scan(combined, { sampleRate: encoded.sampleRate, profile: DEFAULT_PROFILE });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].json).toEqual(payload);
  });
});
