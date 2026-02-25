import { tonesToSamples } from "./codec/afskModem.js";
import { DEFAULT_LEVEL_DB, DEFAULT_SAMPLE_RATE } from "./codec/defaults.js";
import { buildFrame } from "./codec/frame.js";
import { buildBitstream } from "./codec/hdlcFraming.js";
import { encodeJson } from "./codec/jsonCodec.js";
import { nrziEncode } from "./codec/nrziCodec.js";
import { FLAG_FEC, FLAG_GZIP } from "./codec/constants.js";
import { getProfileSettings, profileFlag } from "./codec/profile.js";
import { rsEncode } from "./codec/reedSolomonCodec.js";
import { toneToSamples } from "./codec/tone.js";
import { gfskTonesToSamples } from "./codec/gfskModem.js";
import { mfskBitsToSamples } from "./codec/mfskModem.js";
import { DEFAULT_PROFILE } from "./profiles.js";
import type { EncodeOptions, EncodeResult } from "./types.js";

export function encode(json: unknown, options: EncodeOptions = {}): EncodeResult {
  const sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const profile = options.profile ?? DEFAULT_PROFILE;
  const profileSettings = getProfileSettings(profile);
  const baud = profileSettings.baud;
  const markFreq = profileSettings.markFreq;
  const spaceFreq = profileSettings.spaceFreq;

  const jsonBytes = encodeJson(json);
  const gzipMode = options.gzip ?? "auto";
  const gzipMinSavingsBytes = options.gzipMinSavingsBytes ?? 8;
  const gzipMinSavingsPct = options.gzipMinSavingsPct ?? 0.08;

  let payload = jsonBytes;
  let usedGzip = false;
  if (gzipMode && options.gzipCompress) {
    const compressed = options.gzipCompress(jsonBytes);
    const savingsBytes = jsonBytes.length - compressed.length;
    const savingsPct = jsonBytes.length === 0 ? 0 : savingsBytes / jsonBytes.length;
    const shouldUse =
      gzipMode === true ||
      (gzipMode === "auto" &&
        (savingsBytes >= gzipMinSavingsBytes || savingsPct >= gzipMinSavingsPct));
    if (shouldUse) {
      payload = compressed;
      usedGzip = true;
    }
  } else if (gzipMode === true && !options.gzipCompress) {
    throw new Error("gzipCompress must be provided when gzip is enabled");
  }

  const fec = options.fec ?? true;
  const payloadWithFec = fec ? rsEncode(payload) : payload;

  const flags = (usedGzip ? FLAG_GZIP : 0) | (fec ? FLAG_FEC : 0) | profileFlag(profile);

  const frame = buildFrame(payloadWithFec, payload.length, flags);
  const preambleMs = options.preambleMs ?? profileSettings.preambleMs;
  const fadeMs = options.fadeMs ?? profileSettings.fadeMs;
  const bitstream = buildBitstream(frame, preambleMs, baud);
  const encodedBits =
    profileSettings.modulation === "mfsk" ? bitstream : nrziEncode(bitstream);

  let samples =
    profileSettings.modulation === "gfsk"
      ? gfskTonesToSamples(encodedBits, {
          sampleRate,
          baud,
          markFreq,
          spaceFreq,
          levelDb: options.levelDb ?? DEFAULT_LEVEL_DB,
          fadeMs,
          bt: profileSettings.bt,
          spanSymbols: profileSettings.spanSymbols,
        })
      : profileSettings.modulation === "mfsk"
        ? mfskBitsToSamples(encodedBits, {
            sampleRate,
            baud,
            tones: profileSettings.tones ?? [markFreq, spaceFreq],
            bitsPerSymbol: profileSettings.bitsPerSymbol ?? 1,
            levelDb: options.levelDb ?? DEFAULT_LEVEL_DB,
            fadeMs,
          })
      : tonesToSamples(encodedBits, {
          sampleRate,
          baud,
          markFreq,
          spaceFreq,
          levelDb: options.levelDb ?? DEFAULT_LEVEL_DB,
          fadeMs,
        });

  const leadInEnabled =
    options.leadIn ??
    (profileSettings.leadInToneMs > 0 || profileSettings.leadInGapMs > 0);
  const leadInToneMs = options.leadInToneMs ?? profileSettings.leadInToneMs;
  const leadInGapMs = options.leadInGapMs ?? profileSettings.leadInGapMs;
  if (leadInEnabled && leadInToneMs > 0) {
    const leadIn = buildChime({
      sampleRate,
      levelDb: options.levelDb ?? DEFAULT_LEVEL_DB,
      fadeMs,
      toneMs: leadInToneMs,
      gapMs: leadInGapMs,
      firstFreq: markFreq,
      secondFreq: spaceFreq,
    });
    samples = concatFloat32([leadIn, samples]);
  }

  const tailOutEnabled =
    options.tailOut ??
    (profileSettings.tailToneMs > 0 || profileSettings.tailGapMs > 0);
  const tailToneMs = options.tailToneMs ?? profileSettings.tailToneMs;
  const tailGapMs = options.tailGapMs ?? profileSettings.tailGapMs;
  if (tailOutEnabled && tailToneMs > 0) {
    const tail = buildChime({
      sampleRate,
      levelDb: options.levelDb ?? DEFAULT_LEVEL_DB,
      fadeMs,
      toneMs: tailToneMs,
      gapMs: tailGapMs,
      firstFreq: spaceFreq,
      secondFreq: markFreq,
    });
    samples = concatFloat32([samples, tail]);
  }

  return {
    sampleRate,
    profile,
    samples,
    durationMs: (samples.length / sampleRate) * 1000,
    payloadBytes: payload.length,
  };
}

function buildChime(options: {
  sampleRate: number;
  levelDb: number;
  fadeMs: number;
  toneMs: number;
  gapMs: number;
  firstFreq: number;
  secondFreq: number;
}): Float32Array {
  const toneOptions = {
    sampleRate: options.sampleRate,
    durationMs: options.toneMs,
    levelDb: options.levelDb,
    fadeMs: options.fadeMs,
  };
  const first = toneToSamples(options.firstFreq, toneOptions);
  const gap =
    options.gapMs > 0
      ? new Float32Array(Math.max(1, Math.round((options.gapMs / 1000) * options.sampleRate)))
      : new Float32Array(0);
  const second = toneToSamples(options.secondFreq, toneOptions);
  return concatFloat32([first, gap, second]);
}

function concatFloat32(chunks: Float32Array[]): Float32Array {
  let length = 0;
  for (const chunk of chunks) {
    length += chunk.length;
  }
  const out = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}
