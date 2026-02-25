import { scan } from "../core/index.js";
import { ProfileName } from "../core/profiles.js";
import type { ScanOptions, ScanResult } from "../core/index.js";

export interface StreamScannerOptions extends Omit<ScanOptions, "samples"> {
  maxBufferMs?: number;
  minBufferMs?: number;
  dedupeMs?: number;
  scanIntervalMs?: number;
}

export class StreamScanner {
  private buffer: Float32Array;
  private bufferOffset: number;
  private lastEmitEndSample: number;
  private sampleRate: number;
  private options: StreamScannerOptions;
  private samplesSinceScan: number;

  constructor(options: StreamScannerOptions = {}) {
    this.options = options;
    this.sampleRate = options.sampleRate ?? 0;
    this.buffer = new Float32Array(0);
    this.bufferOffset = 0;
    this.lastEmitEndSample = -Infinity;
    this.samplesSinceScan = 0;
  }

  setSampleRate(sampleRate: number): void {
    this.sampleRate = sampleRate;
    this.reset();
  }

  updateOptions(options: Partial<Omit<StreamScannerOptions, "samples">>): void {
    this.options = { ...this.options, ...options };
    if (options.sampleRate) {
      this.sampleRate = options.sampleRate;
    }
  }

  reset(): void {
    this.buffer = new Float32Array(0);
    this.bufferOffset = 0;
    this.lastEmitEndSample = -Infinity;
    this.samplesSinceScan = 0;
  }

  push(chunk: Float32Array): ScanResult[] {
    if (!this.sampleRate) {
      throw new Error("StreamScanner requires a sampleRate");
    }

    if (chunk.length === 0) {
      return [];
    }

    this.buffer = appendFloat32(this.buffer, chunk);
    this.samplesSinceScan += chunk.length;
    this.trimBuffer();

    const minBufferSamples = msToSamples(
      this.sampleRate,
      this.options.minBufferMs ?? defaultMinBufferMs(this.options.profile)
    );
    if (this.buffer.length < minBufferSamples) {
      return [];
    }

    const scanIntervalMs = this.options.scanIntervalMs ?? 0;
    if (scanIntervalMs > 0) {
      const scanIntervalSamples = msToSamples(this.sampleRate, scanIntervalMs);
      if (this.samplesSinceScan < scanIntervalSamples) {
        return [];
      }
      this.samplesSinceScan = 0;
    }

    const results = scan({
      samples: this.buffer,
      sampleRate: this.sampleRate,
      profile: this.options.profile,
      minConfidence: this.options.minConfidence,
      gzipDecompress: this.options.gzipDecompress,
    });

    const dedupeSamples = msToSamples(this.sampleRate, this.options.dedupeMs ?? 500);
    const out: ScanResult[] = [];

    for (const result of results) {
      const absStart = this.bufferOffset + result.startSample;
      if (absStart <= this.lastEmitEndSample + dedupeSamples) {
        continue;
      }
      this.lastEmitEndSample = this.bufferOffset + result.endSample;
      out.push({
        ...result,
        startSample: absStart,
        endSample: this.bufferOffset + result.endSample,
      });
    }

    return out;
  }

  private trimBuffer(): void {
    const maxBufferSamples = msToSamples(
      this.sampleRate,
      this.options.maxBufferMs ?? defaultMaxBufferMs(this.options.profile)
    );
    if (this.buffer.length <= maxBufferSamples) {
      return;
    }
    const drop = this.buffer.length - maxBufferSamples;
    this.buffer = this.buffer.slice(drop);
    this.bufferOffset += drop;
  }
}

function appendFloat32(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function msToSamples(sampleRate: number, ms: number): number {
  return Math.max(1, Math.round((ms / 1000) * sampleRate));
}

function defaultMinBufferMs(profile?: ScanOptions["profile"]): number {
  return profile === ProfileName.MFSK ? 4000 : 1200;
}

function defaultMaxBufferMs(profile?: ScanOptions["profile"]): number {
  return profile === ProfileName.MFSK ? 20000 : 8000;
}
