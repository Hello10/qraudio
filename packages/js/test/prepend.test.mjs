import { DEFAULT_PROFILE } from "../dist/index.js";
import { encodeWavSamples, prependPayloadToWav, scanWav } from "../dist/node/index.js";

function makeTone(sampleRate, seconds, freq = 440) {
  const length = Math.round(sampleRate * seconds);
  const samples = new Float32Array(length);
  const step = (2 * Math.PI * freq) / sampleRate;
  let phase = 0;
  for (let i = 0; i < length; i += 1) {
    samples[i] = Math.sin(phase) * 0.2;
    phase += step;
  }
  return samples;
}

describe("prepend payload", () => {
  test("prepends payload with padding", () => {
    const sampleRate = 48000;
    const baseSamples = makeTone(sampleRate, 1.0);
    const baseWav = encodeWavSamples(baseSamples, sampleRate, "pcm16");

    const payload = { __type: "test", value: 123 };
    const result = prependPayloadToWav(baseWav, payload, {
      padSeconds: 0.25,
      profile: DEFAULT_PROFILE,
    });

    const detections = scanWav(result.wav, { profile: DEFAULT_PROFILE });
    expect(detections.length).toBeGreaterThan(0);
    expect(detections[0].json).toEqual(payload);
  });
});
