import { StreamScanner } from "./streamScanner.js";
import type { ScanResult } from "../core/index.js";
import type { StreamScannerOptions } from "./streamScanner.js";

export interface StreamScannerNodeOptions extends StreamScannerOptions {
  workletUrl?: string | URL;
  chunkSize?: number;
  scanInWorklet?: boolean;
  onDetection?: (result: ScanResult) => void;
  onChunk?: (chunk: Float32Array) => void;
}

export interface StreamScannerNodeHandle {
  node: AudioWorkletNode;
  scanner?: StreamScanner;
  disconnect: () => void;
}

export async function createStreamScannerNode(
  context: BaseAudioContext,
  options: StreamScannerNodeOptions = {}
): Promise<StreamScannerNodeHandle> {
  const workletUrl = options.workletUrl ?? getStreamCaptureWorkletUrl();
  const url = workletUrl instanceof URL ? workletUrl.href : workletUrl;
  await context.audioWorklet.addModule(url);

  const node = new AudioWorkletNode(context, "qraudio-stream-capture", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    processorOptions: {
      chunkSize: options.chunkSize ?? 2048,
    },
  });

  const scanInWorklet = options.scanInWorklet ?? true;
  const scanner = scanInWorklet
    ? new StreamScanner({
        ...options,
        sampleRate: options.sampleRate ?? context.sampleRate,
      })
    : undefined;

  node.port.onmessage = (event) => {
    const chunk = event.data as Float32Array;
    options.onChunk?.(chunk);
    if (scanner) {
      const results = scanner.push(chunk);
      for (const result of results) {
        options.onDetection?.(result);
      }
    }
  };

  const disconnect = () => {
    node.port.onmessage = null;
    node.disconnect();
  };

  return { node, scanner, disconnect };
}

export function getStreamCaptureWorkletUrl(): URL {
  return new URL("./worklet/streamCaptureWorklet.js", import.meta.url);
}
