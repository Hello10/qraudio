import { gzipSync, gunzipSync } from "node:zlib";
import { encode, decode, scan } from "../core/index.js";
import type { DecodeOptions, DecodeResult, EncodeOptions, EncodeResult, ScanOptions, ScanResult } from "../core/index.js";

export type WavFormat = "pcm16" | "float32";

export interface WavData {
  sampleRate: number;
  channels: number;
  format: WavFormat;
  samples: Float32Array;
}

export interface EncodeWavOptions extends EncodeOptions {
  wavFormat?: WavFormat;
}

export interface DecodeWavOptions extends Omit<DecodeOptions, "samples"> {
  wav: Uint8Array;
}

export interface ScanWavOptions extends Omit<ScanOptions, "samples"> {
  wav: Uint8Array;
}

export interface EncodeWavResult extends EncodeResult {
  wav: Uint8Array;
}

export interface EncodeWavSamplesOptions {
  samples: Float32Array;
  sampleRate: number;
  format?: WavFormat;
}

export interface DecodeWavSamplesOptions {
  wav: Uint8Array;
}

export interface PrependWavOptions extends Omit<EncodeWavOptions, "json"> {
  wav: Uint8Array;
  json: unknown;
  padSeconds?: number;
  prePadSeconds?: number;
  postPadSeconds?: number;
}

export interface PrependWavResult {
  wav: Uint8Array;
  payload: EncodeResult;
  sampleRate: number;
}

export function encodeWav(options: EncodeWavOptions): EncodeWavResult {
  const wavFormat = options.wavFormat ?? "pcm16";
  const result = encode(withNodeGzip(options));
  const wav = encodeWavSamples({ samples: result.samples, sampleRate: result.sampleRate, format: wavFormat });
  return { ...result, wav };
}

export function decodeWav(options: DecodeWavOptions): DecodeResult {
  const { wav, ...rest } = options;
  const data = decodeWavSamples({ wav });
  return decode(withNodeGunzip({ ...rest, samples: data.samples, sampleRate: rest.sampleRate ?? data.sampleRate }));
}

export function scanWav(options: ScanWavOptions): ScanResult[] {
  const { wav, ...rest } = options;
  const data = decodeWavSamples({ wav });
  return scan(withNodeGunzip({ ...rest, samples: data.samples, sampleRate: rest.sampleRate ?? data.sampleRate }));
}

export function prependPayloadToWav(options: PrependWavOptions): PrependWavResult {
  const { wav, json, ...rest } = options;
  const input = decodeWavSamples({ wav });
  const sampleRate = rest.sampleRate ?? input.sampleRate;
  if (sampleRate !== input.sampleRate) {
    throw new Error(
      `Sample rate mismatch: input ${input.sampleRate} Hz, requested ${sampleRate} Hz. Resampling not supported.`
    );
  }

  const payload = encode(withNodeGzip({ ...rest, json, sampleRate }));
  const padSeconds = rest.padSeconds ?? 0.25;
  const prePadSeconds = rest.prePadSeconds ?? padSeconds;
  const postPadSeconds = rest.postPadSeconds ?? padSeconds;
  const prePadSamples = secondsToSamples(sampleRate, prePadSeconds);
  const postPadSamples = secondsToSamples(sampleRate, postPadSeconds);

  const combined = new Float32Array(
    prePadSamples + payload.samples.length + postPadSamples + input.samples.length
  );
  combined.set(payload.samples, prePadSamples);
  combined.set(input.samples, prePadSamples + payload.samples.length + postPadSamples);

  const wavFormat = rest.wavFormat ?? "pcm16";
  const wavOut = encodeWavSamples({ samples: combined, sampleRate, format: wavFormat });
  return { wav: wavOut, payload, sampleRate };
}

export function encodeWavSamples(options: EncodeWavSamplesOptions): Uint8Array {
  const { samples, sampleRate, format = "pcm16" } = options;
  const numChannels = 1;
  const bitsPerSample = format === "float32" ? 32 : 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const headerSize = 44;
  const buffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");

  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, format === "float32" ? 3 : 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  if (format === "float32") {
    let offset = headerSize;
    for (let i = 0; i < samples.length; i += 1) {
      view.setFloat32(offset, clamp(samples[i]), true);
      offset += 4;
    }
  } else {
    let offset = headerSize;
    for (let i = 0; i < samples.length; i += 1) {
      const value = Math.round(clamp(samples[i]) * 32767);
      view.setInt16(offset, value, true);
      offset += 2;
    }
  }

  return new Uint8Array(buffer);
}

export function decodeWavSamples(options: DecodeWavSamplesOptions): WavData {
  const { wav } = options;
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  if (readString(view, 0, 4) !== "RIFF" || readString(view, 8, 4) !== "WAVE") {
    throw new Error("Invalid WAV header");
  }

  let offset = 12;
  let format: number | null = null;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataOffset = 0;
  let dataSize = 0;

  while (offset + 8 <= view.byteLength) {
    const chunkId = readString(view, offset, 4);
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkDataOffset = offset + 8;

    if (chunkId === "fmt ") {
      format = view.getUint16(chunkDataOffset, true);
      channels = view.getUint16(chunkDataOffset + 2, true);
      sampleRate = view.getUint32(chunkDataOffset + 4, true);
      bitsPerSample = view.getUint16(chunkDataOffset + 14, true);
    } else if (chunkId === "data") {
      dataOffset = chunkDataOffset;
      dataSize = chunkSize;
    }

    offset = chunkDataOffset + chunkSize + (chunkSize % 2);
  }

  if (format === null || dataOffset === 0) {
    throw new Error("WAV missing fmt or data chunk");
  }
  if (channels < 1) {
    throw new Error("Invalid WAV channel count");
  }

  const bytesPerSample = bitsPerSample / 8;
  const totalFrames = Math.floor(dataSize / (bytesPerSample * channels));
  const samples = new Float32Array(totalFrames);

  if (format === 1 && bitsPerSample === 16) {
    let frameOffset = dataOffset;
    for (let i = 0; i < totalFrames; i += 1) {
      let sum = 0;
      for (let ch = 0; ch < channels; ch += 1) {
        sum += view.getInt16(frameOffset, true) / 32768;
        frameOffset += 2;
      }
      samples[i] = sum / channels;
    }
  } else if (format === 3 && bitsPerSample === 32) {
    let frameOffset = dataOffset;
    for (let i = 0; i < totalFrames; i += 1) {
      let sum = 0;
      for (let ch = 0; ch < channels; ch += 1) {
        sum += view.getFloat32(frameOffset, true);
        frameOffset += 4;
      }
      samples[i] = sum / channels;
    }
  } else {
    throw new Error(`Unsupported WAV format ${format} with ${bitsPerSample} bits`);
  }

  return {
    sampleRate,
    channels,
    format: format === 3 ? "float32" : "pcm16",
    samples,
  };
}

function clamp(value: number): number {
  if (value > 1) return 1;
  if (value < -1) return -1;
  return value;
}

function writeString(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

function readString(view: DataView, offset: number, length: number): string {
  let text = "";
  for (let i = 0; i < length; i += 1) {
    text += String.fromCharCode(view.getUint8(offset + i));
  }
  return text;
}

function withNodeGzip(options: EncodeWavOptions): EncodeWavOptions {
  if (options.gzipCompress) {
    return options;
  }
  return {
    ...options,
    gzipCompress: (data) => new Uint8Array(gzipSync(data)),
  };
}

function withNodeGunzip<T extends DecodeOptions | ScanOptions>(options: T): T {
  if (options.gzipDecompress) {
    return options;
  }
  return {
    ...options,
    gzipDecompress: (data) => new Uint8Array(gunzipSync(data)),
  };
}

function secondsToSamples(sampleRate: number, seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return 0;
  }
  return Math.round(seconds * sampleRate);
}
