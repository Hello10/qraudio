import { decode, encode, scan } from "../core/index.js";
import type { DecodeOptions, DecodeResult, EncodeOptions, EncodeResult, ScanOptions, ScanResult } from "../core/index.js";

export interface EncodeAudioBufferOptions extends EncodeOptions {
  context?: BaseAudioContext;
}

export function encodeAudioBuffer(
  json: unknown,
  options: EncodeAudioBufferOptions = {}
): { buffer: AudioBuffer; result: EncodeResult } {
  const context = options.context ?? getDefaultAudioContext();
  const sampleRate = options.sampleRate ?? context.sampleRate;
  const result = encode(json, { ...options, sampleRate });
  const buffer = context.createBuffer(1, result.samples.length, sampleRate);
  buffer.getChannelData(0).set(result.samples);
  return { buffer, result };
}

export function decodeAudioBuffer(
  buffer: AudioBuffer,
  options: DecodeOptions = {}
): DecodeResult {
  const samples = audioBufferToMono(buffer);
  return decode(samples, { ...options, sampleRate: options.sampleRate ?? buffer.sampleRate });
}

export function scanAudioBuffer(
  buffer: AudioBuffer,
  options: ScanOptions = {}
): ScanResult[] {
  const samples = audioBufferToMono(buffer);
  return scan(samples, { ...options, sampleRate: options.sampleRate ?? buffer.sampleRate });
}

export function audioBufferToMono(buffer: AudioBuffer): Float32Array {
  const channels = buffer.numberOfChannels;
  const length = buffer.length;
  if (channels === 1) {
    return buffer.getChannelData(0).slice();
  }

  const out = new Float32Array(length);
  for (let ch = 0; ch < channels; ch += 1) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i += 1) {
      out[i] += data[i];
    }
  }
  for (let i = 0; i < length; i += 1) {
    out[i] /= channels;
  }
  return out;
}

function getDefaultAudioContext(): BaseAudioContext {
  if (typeof AudioContext !== "undefined") {
    return new AudioContext();
  }
  if (typeof OfflineAudioContext !== "undefined") {
    return new OfflineAudioContext(1, 1, 48000);
  }
  throw new Error("No AudioContext available");
}
