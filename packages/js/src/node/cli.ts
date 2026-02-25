#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { encodeWavFile, decodeWavFile, scanWavFile, prependPayloadToWavFile } from "./fs.js";
import { decodeWav, scanWav } from "./wav.js";
import { DEFAULT_PROFILE, PROFILE_NAMES, isProfile } from "../core/profiles.js";
import type { Profile } from "../core/types.js";
import type { EncodeWavOptions } from "./wav.js";

const PROFILE_OPTIONS = PROFILE_NAMES.join("|");

const USAGE = `
qraudio <command> [options]

Commands:
  encode   Encode JSON into a WAV file
  decode   Decode a WAV file into JSON
  scan     Scan a WAV file and output all detections
  prepend  Prepend an encoded payload to an existing WAV file

Encode options:
  --json <string>       JSON string payload
  --file <path>         JSON file path (if omitted, --json is required)
  --stdin               Read JSON from stdin
  --out <path>          Output WAV file path (required)
  --profile <${PROFILE_OPTIONS}>  Modem profile (default ${DEFAULT_PROFILE})
  --sample-rate <hz>    Sample rate (default 48000)
  --wav-format <pcm16|float32>  WAV format (default pcm16)
  --gzip <on|off|auto>  Gzip mode (default auto)
  --fec <on|off>        Reed-Solomon FEC (default on)

Decode options:
  --in <path>           Input WAV file path (required)
  --out <path>          Write JSON to file (optional, otherwise stdout)
  --profile <${PROFILE_OPTIONS}>  Optional profile hint
  --compact             Output minified JSON

Scan options:
  --in <path>           Input WAV file path (required)
  --out <path>          Write results to file (optional, otherwise stdout)
  --profile <${PROFILE_OPTIONS}>  Optional profile hint
  --format <json|jsonl> Output format (default json)
  --compact             Output minified JSON

Prepend options:
  --in <path>           Input WAV file path (required)
  --out <path>          Output WAV file path (required)
  --json <string>       JSON string payload
  --file <path>         JSON file path (if omitted, --json is required)
  --stdin               Read JSON from stdin
  --pad <seconds>       Padding before/after payload (default 0.25)
  --pre-pad <seconds>   Padding before payload
  --post-pad <seconds>  Padding after payload
  --profile <${PROFILE_OPTIONS}>  Modem profile (default ${DEFAULT_PROFILE})
  --wav-format <pcm16|float32>  WAV format (default pcm16)
  --gzip <on|off|auto>  Gzip mode (default auto)
  --fec <on|off>        Reed-Solomon FEC (default on)
`;

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === "-h" || command === "--help") {
    console.log(USAGE.trim());
    return;
  }

  const args = parseArgs(rest);

  if (command === "encode") {
    const jsonText = await readJsonInput(args);
    const outPath = requiredArg(args, "out");
    const payload = JSON.parse(jsonText);

    const options: EncodeWavOptions = {
      profile: parseProfile(args.profile),
      sampleRate: parseNumber(args["sample-rate"]),
      wavFormat: parseWavFormat(args["wav-format"]),
      gzip: parseGzipMode(args.gzip),
      fec: parseBoolMode(args.fec),
    };

    await encodeWavFile(outPath, payload, options);
    console.log(`Wrote ${resolve(outPath)}`);
    return;
  }

  if (command === "decode") {
    const inPath = requiredArg(args, "in");
    const outPath = args.out;
    const result = await (inPath === "-"
      ? decodeFromBytes(await readStdinBytes(), args)
      : decodeWavFile(inPath, { profile: parseProfile(args.profile) }));
    const text = formatJson(result.json, args);
    if (outPath) {
      await writeFile(outPath, text);
      console.log(`Wrote ${resolve(outPath)}`);
    } else {
      console.log(text);
    }
    return;
  }

  if (command === "scan") {
    const inPath = requiredArg(args, "in");
    const outPath = args.out;
    const results = await (inPath === "-"
      ? scanFromBytes(await readStdinBytes(), args)
      : scanWavFile(inPath, { profile: parseProfile(args.profile) }));
    const format = parseFormat(args.format);
    const text = formatScanResults(results, format, args);
    if (outPath) {
      await writeFile(outPath, text);
      console.log(`Wrote ${resolve(outPath)}`);
    } else {
      console.log(text);
    }
    return;
  }

  if (command === "prepend") {
    const inPath = requiredArg(args, "in");
    const outPath = requiredArg(args, "out");
    const jsonText = await readJsonInput(args);
    const payload = JSON.parse(jsonText);

    const options = {
      profile: parseProfile(args.profile),
      wavFormat: parseWavFormat(args["wav-format"]),
      gzip: parseGzipMode(args.gzip),
      fec: parseBoolMode(args.fec),
      padSeconds: parseNumber(args.pad),
      prePadSeconds: parseNumber(args["pre-pad"]),
      postPadSeconds: parseNumber(args["post-pad"]),
    };

    await prependPayloadToWavFile(inPath, outPath, payload, options);
    console.log(`Wrote ${resolve(outPath)}`);
    return;
  }

  console.error(`Unknown command: ${command}`);
  console.log(USAGE.trim());
  process.exit(1);
}

function parseArgs(argv: string[]): Record<string, string | undefined> {
  const args: Record<string, string | undefined> = {};
  let i = 0;
  while (i < argv.length) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      i += 1;
      continue;
    }
    const key = token.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      args[key] = "true";
      i += 1;
    } else {
      args[key] = value;
      i += 2;
    }
  }
  return args;
}

function requiredArg(args: Record<string, string | undefined>, name: string): string {
  const value = args[name];
  if (!value) {
    console.error(`Missing --${name}`);
    console.log(USAGE.trim());
    process.exit(1);
  }
  return value;
}

async function readJsonInput(args: Record<string, string | undefined>): Promise<string> {
  if (args.stdin || args.json === "-" || args.file === "-") {
    const bytes = await readStdinBytes();
    return Buffer.from(bytes).toString("utf-8");
  }
  if (args.json) {
    return args.json;
  }
  if (args.file) {
    return readFile(args.file, "utf-8");
  }
  console.error("Missing --json or --file");
  console.log(USAGE.trim());
  process.exit(1);
}

function parseNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseProfile(value: string | undefined): Profile | undefined {
  if (!value) return undefined;
  return isProfile(value) ? value : undefined;
}

function parseWavFormat(value: string | undefined): "pcm16" | "float32" | undefined {
  if (value === "pcm16" || value === "float32") return value;
  return undefined;
}

function parseGzipMode(value: string | undefined): "auto" | boolean | undefined {
  if (!value) return undefined;
  if (value === "auto") return "auto";
  if (value === "on" || value === "true") return true;
  if (value === "off" || value === "false") return false;
  return undefined;
}

function parseBoolMode(value: string | undefined): boolean | undefined {
  if (!value) return undefined;
  if (value === "on" || value === "true") return true;
  if (value === "off" || value === "false") return false;
  return undefined;
}

async function readStdinBytes(): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return new Uint8Array(Buffer.concat(chunks));
}

function formatJson(value: unknown, args: Record<string, string | undefined>): string {
  const compact = args.compact === "true" || args.compact === "1" || args.compact === "compact";
  return JSON.stringify(value, null, compact ? 0 : 2);
}

function parseFormat(value: string | undefined): "json" | "jsonl" {
  if (value === "jsonl") return "jsonl";
  return "json";
}

function formatScanResults(
  results: Awaited<ReturnType<typeof scanWavFile>>,
  format: "json" | "jsonl",
  args: Record<string, string | undefined>
): string {
  if (format === "jsonl") {
    return results.map((r) => JSON.stringify(r.json)).join("\n");
  }
  const payloads = results.map((r) => r.json);
  return formatJson(payloads, args);
}

async function decodeFromBytes(
  wavBytes: Uint8Array,
  args: Record<string, string | undefined>
): Promise<{ json: unknown }> {
  return decodeWav(wavBytes, { profile: parseProfile(args.profile) });
}

async function scanFromBytes(
  wavBytes: Uint8Array,
  args: Record<string, string | undefined>
): Promise<Awaited<ReturnType<typeof scanWavFile>>> {
  return scanWav(wavBytes, { profile: parseProfile(args.profile) });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
