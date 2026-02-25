import type { Profile } from "./profiles.js";
export type { Profile };

export interface EncodeOptions {
  json: unknown;
  sampleRate?: number;
  profile?: Profile;
  fec?: boolean;
  gzip?: boolean | "auto";
  gzipCompress?: (data: Uint8Array) => Uint8Array;
  gzipMinSavingsBytes?: number;
  gzipMinSavingsPct?: number;
  preambleMs?: number;
  fadeMs?: number;
  levelDb?: number;
  leadIn?: boolean;
  leadInToneMs?: number;
  leadInGapMs?: number;
  tailOut?: boolean;
  tailToneMs?: number;
  tailGapMs?: number;
}

export interface EncodeResult {
  sampleRate: number;
  profile: Profile;
  samples: Float32Array;
  durationMs: number;
  payloadBytes: number;
}

export interface DecodeOptions {
  samples: Float32Array;
  sampleRate?: number;
  profile?: Profile;
  gzipDecompress?: (data: Uint8Array) => Uint8Array;
}

export interface DecodeResult {
  json: unknown;
  profile: Profile;
  startSample: number;
  endSample: number;
  confidence: number;
}

export interface ScanOptions extends DecodeOptions {
  minConfidence?: number;
}

export interface ScanResult extends DecodeResult { }
