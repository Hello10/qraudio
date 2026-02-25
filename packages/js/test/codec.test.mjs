import { crc16X25 } from "../dist/core/codec/crc16x25.js";
import { rsDecode, rsEncode } from "../dist/core/codec/reedSolomonCodec.js";

function textBytes(text) {
  return new TextEncoder().encode(text);
}

describe("codec primitives", () => {
  test("crc16/x25 check value", () => {
    const data = textBytes("123456789");
    expect(crc16X25(data)).toBe(0x906e);
  });

  test("reed-solomon corrects errors", () => {
    const payload = new Uint8Array(120);
    for (let i = 0; i < payload.length; i += 1) {
      payload[i] = i & 0xff;
    }
    const encoded = rsEncode(payload);
    const corrupted = Uint8Array.from(encoded);

    for (let i = 0; i < 10; i += 1) {
      corrupted[i] ^= 0xff;
    }

    const decoded = rsDecode(corrupted, payload.length);
    expect(decoded).toEqual(payload);
  });

  test("reed-solomon corrects random errors", () => {
    const payload = new Uint8Array(200);
    for (let i = 0; i < payload.length; i += 1) {
      payload[i] = (i * 13 + 7) & 0xff;
    }
    const encoded = rsEncode(payload);
    const corrupted = Uint8Array.from(encoded);

    const errorPositions = new Set();
    while (errorPositions.size < 8) {
      errorPositions.add(Math.floor(Math.random() * corrupted.length));
    }
    for (const pos of errorPositions) {
      corrupted[pos] ^= 0xff;
    }

    const decoded = rsDecode(corrupted, payload.length);
    expect(decoded).toEqual(payload);
  });

  test("reed-solomon fails on too many errors", () => {
    const payload = new Uint8Array(120);
    for (let i = 0; i < payload.length; i += 1) {
      payload[i] = (i * 7) & 0xff;
    }
    const encoded = rsEncode(payload);
    const corrupted = Uint8Array.from(encoded);

    for (let i = 0; i < 24; i += 1) {
      corrupted[i] ^= 0xff;
    }

    expect(() => rsDecode(corrupted, payload.length)).toThrow();
  });
});
