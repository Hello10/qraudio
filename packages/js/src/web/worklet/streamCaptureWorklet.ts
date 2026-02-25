/// <reference lib="webworker" />
/* eslint-disable no-undef */

declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: { processorOptions?: Record<string, unknown> });
  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean;
}

declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;

class StreamCaptureProcessor extends AudioWorkletProcessor {
  private readonly chunkSize: number;
  private buffer: Float32Array;
  private offset: number;

  constructor(options?: { processorOptions?: Record<string, unknown> }) {
    super();
    const processorOptions = options?.processorOptions ?? {};
    const requested = typeof processorOptions.chunkSize === "number" ? processorOptions.chunkSize : 2048;
    this.chunkSize = Math.max(128, Math.floor(requested));
    this.buffer = new Float32Array(this.chunkSize);
    this.offset = 0;
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0];
    if (!input || input.length === 0) {
      return true;
    }

    const channelData = input[0];
    if (!channelData) {
      return true;
    }

    const output = outputs[0];
    if (output && output.length > 0 && output[0]) {
      const outputChannel = output[0];
      const count = Math.min(outputChannel.length, channelData.length);
      for (let i = 0; i < count; i += 1) {
        outputChannel[i] = channelData[i];
      }
    }

    for (let i = 0; i < channelData.length; i += 1) {
      this.buffer[this.offset] = channelData[i];
      this.offset += 1;

      if (this.offset >= this.chunkSize) {
        this.port.postMessage(this.buffer);
        this.buffer = new Float32Array(this.chunkSize);
        this.offset = 0;
      }
    }

    return true;
  }
}

registerProcessor("qraudio-stream-capture", StreamCaptureProcessor);
