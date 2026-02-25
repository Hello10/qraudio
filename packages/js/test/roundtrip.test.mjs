import { gunzipSync, gzipSync } from "node:zlib";
import { decode, encode, scan, PROFILE_NAMES } from "../dist/index.js";
import { decodeWav, encodeWav } from "../dist/node/index.js";

describe("qraudio roundtrip", () => {
  const payloads = [
    { __type: "link", url: "https://example.com", meta: { show: "QRA", ep: 1 } },
    { message: "hello", n: 42, nested: { ok: true } },
  ];

  const profiles = [...PROFILE_NAMES];

  for (const profile of profiles) {
    for (const payload of payloads) {
      test(`encode/decode (${profile})`, () => {
        const encoded = encode(payload, { profile });
        const decoded = decode(encoded.samples, { sampleRate: encoded.sampleRate, profile });
        expect(decoded.json).toEqual(payload);
      });

      test(`encode/decode gzip (${profile})`, () => {
        const encoded = encode(payload, {
          profile,
          gzip: true,
          gzipCompress: (data) => new Uint8Array(gzipSync(data)),
        });
        const decoded = decode(encoded.samples, {
          sampleRate: encoded.sampleRate,
          profile,
          gzipDecompress: (data) => new Uint8Array(gunzipSync(data)),
        });
        expect(decoded.json).toEqual(payload);
      });

      test(`scan (${profile})`, () => {
        const encoded = encode(payload, { profile });
        const silence = new Float32Array(Math.round(encoded.sampleRate * 0.2));
        const combined = new Float32Array(silence.length + encoded.samples.length + silence.length);
        combined.set(silence, 0);
        combined.set(encoded.samples, silence.length);
        combined.set(silence, silence.length + encoded.samples.length);

        const results = scan(combined, { sampleRate: encoded.sampleRate, profile });
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].json).toEqual(payload);
      });

      test(`encodeWav/decodeWav (${profile})`, () => {
        const wavResult = encodeWav(payload, { profile });
        const wavDecoded = decodeWav(wavResult.wav, { profile });
        expect(wavDecoded.json).toEqual(payload);
      });
    }
  }
});
