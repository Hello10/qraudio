import { readFile, writeFile } from "node:fs/promises";
import type { DecodeOptions, DecodeResult, EncodeOptions, EncodeResult, ScanOptions, ScanResult } from "../core/index.js";
import { decodeWavSamples, encodeWavSamples, encodeWav, decodeWav, scanWav, prependPayloadToWav } from "./wav.js";
import type { WavFormat, WavData, EncodeWavOptions, EncodeWavResult, PrependWavOptions, PrependWavResult, DecodeWavOptions, ScanWavOptions, EncodeWavSamplesOptions, DecodeWavSamplesOptions } from "./wav.js";

export interface ReadWavFileOptions { path: string; }
export interface WriteWavFileOptions { path: string; wav: Uint8Array; }
export interface EncodeWavFileOptions extends Omit<EncodeWavOptions, "json"> { path: string; json: unknown; }
export interface DecodeWavFileOptions extends Omit<DecodeWavOptions, "wav"> { path: string; }
export interface ScanWavFileOptions extends Omit<ScanWavOptions, "wav"> { path: string; }
export interface PrependWavFileOptions extends Omit<PrependWavOptions, "wav"> { inputPath: string; outputPath: string; }

export async function readWavFile(options: ReadWavFileOptions): Promise<WavData> {
  const data = await readFile(options.path);
  return decodeWavSamples({ wav: data });
}

export async function writeWavFile(options: WriteWavFileOptions): Promise<void> {
  await writeFile(options.path, options.wav);
}

export async function encodeWavFile(options: EncodeWavFileOptions): Promise<EncodeWavResult> {
  const { path, ...rest } = options;
  const result = encodeWav(rest);
  await writeFile(path, result.wav);
  return result;
}

export async function decodeWavFile(options: DecodeWavFileOptions): Promise<DecodeResult> {
  const { path, ...rest } = options;
  const data = await readFile(path);
  return decodeWav({ ...rest, wav: data });
}

export async function scanWavFile(options: ScanWavFileOptions): Promise<ScanResult[]> {
  const { path, ...rest } = options;
  const data = await readFile(path);
  return scanWav({ ...rest, wav: data });
}

export async function prependPayloadToWavFile(options: PrependWavFileOptions): Promise<PrependWavResult> {
  const { inputPath, outputPath, ...rest } = options;
  const data = await readFile(inputPath);
  const result = prependPayloadToWav({ ...rest, wav: data });
  await writeFile(outputPath, result.wav);
  return result;
}

export { decodeWavSamples, encodeWavSamples, decodeWav, encodeWav, scanWav, prependPayloadToWav };
export type {
  WavFormat,
  WavData,
  EncodeWavOptions,
  EncodeWavResult,
  PrependWavOptions,
  PrependWavResult,
  DecodeWavOptions,
  ScanWavOptions,
  EncodeWavSamplesOptions,
  DecodeWavSamplesOptions,
  EncodeOptions,
  EncodeResult,
  DecodeOptions,
  DecodeResult,
  ScanOptions,
  ScanResult,
};
