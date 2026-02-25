import { readFile, writeFile } from "node:fs/promises";
import type { DecodeOptions, DecodeResult, EncodeOptions, EncodeResult, ScanOptions, ScanResult } from "../core/index.js";
import { decodeWavSamples, encodeWavSamples, encodeWav, decodeWav, scanWav, prependPayloadToWav } from "./wav.js";
import type { WavFormat, WavData, EncodeWavOptions, EncodeWavResult, PrependWavOptions, PrependWavResult } from "./wav.js";

export async function readWavFile(path: string): Promise<WavData> {
  const data = await readFile(path);
  return decodeWavSamples(data);
}

export async function writeWavFile(path: string, wav: Uint8Array): Promise<void> {
  await writeFile(path, wav);
}

export async function encodeWavFile(
  path: string,
  json: unknown,
  options: EncodeWavOptions = {}
): Promise<EncodeWavResult> {
  const result = encodeWav(json, options);
  await writeFile(path, result.wav);
  return result;
}

export async function decodeWavFile(
  path: string,
  options: DecodeOptions = {}
): Promise<DecodeResult> {
  const data = await readFile(path);
  return decodeWav(data, options);
}

export async function scanWavFile(
  path: string,
  options: ScanOptions = {}
): Promise<ScanResult[]> {
  const data = await readFile(path);
  return scanWav(data, options);
}

export async function prependPayloadToWavFile(
  inputPath: string,
  outputPath: string,
  json: unknown,
  options: PrependWavOptions = {}
): Promise<PrependWavResult> {
  const data = await readFile(inputPath);
  const result = prependPayloadToWav(data, json, options);
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
  EncodeOptions,
  EncodeResult,
  DecodeOptions,
  DecodeResult,
  ScanOptions,
  ScanResult,
};
