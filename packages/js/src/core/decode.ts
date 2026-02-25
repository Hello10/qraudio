import { demodAfsk } from "./codec/afskModem.js";
import { concatBytes } from "./codec/bytes.js";
import { crc16X25 } from "./codec/crc16x25.js";
import { DEFAULT_SAMPLE_RATE } from "./codec/defaults.js";
import { parseFrame } from "./codec/frame.js";
import { extractFrames } from "./codec/hdlcFraming.js";
import { decodeJson } from "./codec/jsonCodec.js";
import { demodMfsk } from "./codec/mfskModem.js";
import { nrziDecode } from "./codec/nrziCodec.js";
import { getProfileSettings } from "./codec/profile.js";
import { rsDecode, rsEncode } from "./codec/reedSolomonCodec.js";
import { PROFILE_NAMES } from "./profiles.js";
import type { DecodeOptions, DecodeResult, Profile, ScanOptions, ScanResult } from "./types.js";

export function decode(samples: Float32Array, options: DecodeOptions = {}): DecodeResult {
  const results = scan(samples, { ...options, minConfidence: 0.9 });
  if (results.length === 0) {
    throw new Error("No valid frame found");
  }
  return results[0];
}

export function scan(samples: Float32Array, options: ScanOptions = {}): ScanResult[] {
  const sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const profiles: Profile[] = options.profile ? [options.profile] : [...PROFILE_NAMES];
  const minConfidence = options.minConfidence ?? 0.8;

  const results: ScanResult[] = [];
  const seenKeys = new Set<string>();

  for (const profile of profiles) {
    const settings = getProfileSettings(profile);
    const baud = settings.baud;
    const markFreq = settings.markFreq;
    const spaceFreq = settings.spaceFreq;
    const samplesPerBit = sampleRate / baud;
    const bitsPerSymbol = settings.bitsPerSymbol ?? 1;
    const samplesPerSymbol = samplesPerBit * bitsPerSymbol;
    const offsetStep = Math.max(1, Math.round(samplesPerSymbol / 8));

    for (let offset = 0; offset < samplesPerSymbol; offset += offsetStep) {
      const dataBits =
        settings.modulation === "mfsk"
          ? demodMfsk({
            samples,
            sampleRate,
            baud,
            offset: Math.floor(offset),
            tones: settings.tones ?? [markFreq, spaceFreq],
            bitsPerSymbol,
          })
          : nrziDecode(
            demodAfsk({
              samples,
              sampleRate,
              baud,
              offset: Math.floor(offset),
              markFreq,
              spaceFreq,
            })
          );

      const frames = extractFrames(dataBits);

      for (const frame of frames) {
        let parsed:
          | {
            json: unknown;
            profile: Profile;
          }
          | null = null;
        try {
          parsed = decodeFrame(frame.bytes, options.gzipDecompress);
        } catch {
          continue;
        }
        if (!parsed || parsed.profile !== profile) {
          continue;
        }
        const startSample = Math.round(offset + frame.startBit * samplesPerBit);
        const endSample = Math.round(offset + frame.endBit * samplesPerBit);
        const confidence = 1.0;

        if (confidence < minConfidence) {
          continue;
        }

        const key = `${profile}:${Math.round(startSample / Math.max(1, samplesPerBit / 2))}`;
        if (seenKeys.has(key)) {
          continue;
        }
        seenKeys.add(key);
        results.push({
          json: parsed.json,
          profile: parsed.profile,
          startSample,
          endSample,
          confidence,
        });
      }
    }
  }

  results.sort((a, b) => a.startSample - b.startSample);
  return results;
}

function decodeFrame(
  bytes: Uint8Array,
  gzipDecompress?: (data: Uint8Array) => Uint8Array
): { json: unknown; profile: Profile } | null {
  const parsed = parseFrame(bytes);
  if (!parsed) {
    return null;
  }

  const { header, payloadWithFec, crcExpected, crcActual, raw } = parsed;
  let payload: Uint8Array;
  let crcOk = crcExpected === crcActual;

  if (header.fecEnabled) {
    try {
      payload = rsDecode(payloadWithFec, header.payloadLength);
    } catch {
      return null;
    }
    if (!crcOk) {
      const correctedPayloadWithFec = rsEncode(payload);
      const correctedFrame = concatBytes(raw.slice(0, 8), correctedPayloadWithFec);
      const correctedCrc = crc16X25(correctedFrame);
      crcOk = correctedCrc === crcExpected;
    }
  } else {
    if (!crcOk) {
      return null;
    }
    payload = payloadWithFec;
  }

  if (!crcOk) {
    return null;
  }

  if (payload.length < header.payloadLength) {
    return null;
  }
  payload = payload.slice(0, header.payloadLength);

  if (header.gzipEnabled) {
    if (!gzipDecompress) {
      throw new Error("gzipDecompress must be provided to decode gzip payloads");
    }
    payload = gzipDecompress(payload);
  }

  const json = decodeJson(payload);
  return { json, profile: header.profile };
}
