# qraudio · JS

Encode JSON payloads into audio and decode them back — in Node.js, the browser, or from the command line.

The library serializes arbitrary JSON into an audio signal using AFSK/GFSK/MFSK modulation with HDLC framing, Reed-Solomon FEC, and optional gzip compression. Payloads survive real-world audio paths: recording to WAV, playing over a speaker, or streaming through a microphone.

---

## Packages / entry points

| Entry point | Environment | Contents |
|---|---|---|
| `qraudio` | Universal | Core `encode` / `decode` / `scan` operating on `Float32Array` samples |
| `qraudio/node` | Node.js | Everything above + WAV read/write helpers, file I/O, Node-native gzip |
| `qraudio/web` | Browser | Everything above + `AudioBuffer` helpers, `StreamScanner`, AudioWorklet integration |

---

## Installation

```bash
npm install qraudio
```

---

## Profiles

A **profile** controls the modem settings (baud rate, frequencies, modulation). All functions accept an optional `profile` parameter.

| Profile name | Modulation | Notes |
|---|---|---|
| `afsk-bell` | AFSK | Default; broadest compatibility |
| `afsk-fifth` | AFSK | Higher baud, shorter audio |
| `gfsk-fifth` | GFSK | Smoother spectrum |
| `mfsk` | MFSK | Multi-tone; most robust over voice channels |

```ts
import { ProfileName } from "qraudio";

ProfileName.AFSK_BELL  // "afsk-bell"
ProfileName.AFSK_FIFTH // "afsk-fifth"
ProfileName.GFSK_FIFTH // "gfsk-fifth"
ProfileName.MFSK       // "mfsk"
```

---

## Core API (`qraudio`)

Works anywhere with no runtime dependencies.

### `encode(json, options?): EncodeResult`

Encodes a JSON value into a `Float32Array` of mono audio samples.

```ts
import { encode } from "qraudio";

const result = encode({ hello: "world" });
// result.samples   → Float32Array
// result.sampleRate → 48000
// result.durationMs → ~800
// result.profile   → "afsk-bell"
```

**`EncodeOptions`**

| Option | Type | Default | Description |
|---|---|---|---|
| `profile` | `Profile` | `"afsk-bell"` | Modem profile |
| `sampleRate` | `number` | `48000` | Output sample rate (Hz) |
| `fec` | `boolean` | `true` | Reed-Solomon forward error correction |
| `gzip` | `boolean \| "auto"` | `"auto"` | Compress payload; `"auto"` only applies if it saves ≥ 8 bytes / 8% |
| `gzipCompress` | `(data) => Uint8Array` | — | Required when `gzip` is enabled (inject your gzip impl) |
| `levelDb` | `number` | — | Output level in dBFS |
| `preambleMs` | `number` | profile default | Flag preamble duration |
| `fadeMs` | `number` | profile default | Amplitude fade in/out |
| `leadIn` | `boolean` | profile default | Prepend two-tone chime before payload |
| `leadInToneMs` / `leadInGapMs` | `number` | profile default | Lead-in chime timing |
| `tailOut` | `boolean` | profile default | Append two-tone chime after payload |
| `tailToneMs` / `tailGapMs` | `number` | profile default | Tail chime timing |

---

### `decode(samples, options?): DecodeResult`

Finds and decodes the first high-confidence payload in a `Float32Array`.  
Throws if nothing is found.

```ts
import { decode } from "qraudio";

const result = decode(samples);
// result.json      → decoded value
// result.profile   → "afsk-bell"
// result.startSample / endSample → position in sample array
// result.confidence → 0–1
```

---

### `scan(samples, options?): ScanResult[]`

Like `decode`, but returns **all** payloads found in the audio, sorted by position. Returns an empty array when nothing is detected.

```ts
import { scan } from "qraudio";

const hits = scan(samples);
for (const hit of hits) {
  console.log(hit.json, hit.startSample);
}
```

**`DecodeOptions` / `ScanOptions`**

| Option | Type | Description |
|---|---|---|
| `profile` | `Profile` | Narrow search to one profile (faster) |
| `sampleRate` | `number` | Sample rate of the input |
| `gzipDecompress` | `(data) => Uint8Array` | Required to decode any gzip-compressed payloads |
| `minConfidence` | `number` | Minimum confidence threshold for `scan` (default `0.8`) |

---

## Node.js API (`qraudio/node`)

Re-exports the core API plus WAV utilities.  
Gzip is wired up automatically using Node's built-in `zlib`.

### WAV helpers (sync, in-memory)

```ts
import { encodeWav, decodeWav, scanWav, prependPayloadToWav } from "qraudio/node";

// Encode JSON → WAV bytes
const { wav } = encodeWav({ track: 1 });       // Uint8Array

// Decode WAV bytes → JSON
const { json } = decodeWav(wavBytes);

// Find all payloads in WAV bytes
const results = scanWav(wavBytes);

// Prepend encoded payload before existing audio
const { wav: out } = prependPayloadToWav(existingWavBytes, { track: 1 });
```

`prependPayloadToWav` accepts `padSeconds`, `prePadSeconds`, and `postPadSeconds` options to add silence around the encoded payload.

### File I/O helpers (async)

```ts
import {
  encodeWavFile,
  decodeWavFile,
  scanWavFile,
  prependPayloadToWavFile,
  readWavFile,
  writeWavFile,
} from "qraudio/node";

await encodeWavFile("output.wav", { hello: "world" });
const { json } = await decodeWavFile("output.wav");
const hits = await scanWavFile("output.wav");
await prependPayloadToWavFile("music.wav", "tagged.wav", { track: 1 });
```

### Low-level WAV encoding

```ts
import { encodeWavSamples, decodeWavSamples } from "qraudio/node";

// Float32Array → WAV Uint8Array  (format: "pcm16" | "float32")
const wav = encodeWavSamples(samples, 48000, "pcm16");

// WAV Uint8Array → { sampleRate, channels, format, samples }
const { samples, sampleRate } = decodeWavSamples(wav);
```

---

## CLI (`qraudio`)

The Node entry point also installs a `qraudio` binary.

```
qraudio <command> [options]

Commands:
  encode   Encode JSON into a WAV file
  decode   Decode a WAV file into JSON
  scan     Scan a WAV file and output all detections
  prepend  Prepend an encoded payload to an existing WAV file
```

**Encode**

```bash
qraudio encode --json '{"hello":"world"}' --out out.wav
qraudio encode --file payload.json --out out.wav --profile mfsk --fec on
echo '{"x":1}' | qraudio encode --stdin --out out.wav
```

**Decode**

```bash
qraudio decode --in out.wav
qraudio decode --in out.wav --out result.json --compact
cat out.wav | qraudio decode --in -
```

**Scan**

```bash
qraudio scan --in recording.wav
qraudio scan --in recording.wav --format jsonl
```

**Prepend**

```bash
qraudio prepend --in music.wav --out tagged.wav --json '{"track":1}' --pad 0.5
```

Common flags: `--profile <afsk-bell|afsk-fifth|gfsk-fifth|mfsk>`, `--sample-rate <hz>`, `--wav-format <pcm16|float32>`, `--gzip <on|off|auto>`, `--fec <on|off>`.

---

## Browser API (`qraudio/web`)

Re-exports the core API plus Web Audio helpers.

### `AudioBuffer` helpers

```ts
import { encodeAudioBuffer, decodeAudioBuffer, scanAudioBuffer } from "qraudio/web";

const ctx = new AudioContext();

// Encode JSON → AudioBuffer (ready to schedule with ctx.createBufferSource())
const { buffer, result } = encodeAudioBuffer({ hello: "world" }, { context: ctx });

// Decode an AudioBuffer
const { json } = decodeAudioBuffer(buffer);

// Scan an AudioBuffer for all payloads
const hits = scanAudioBuffer(buffer);
```

> **Note:** Browser `AudioContext` does not have native gzip. Pass `gzipDecompress` (e.g. using `DecompressionStream`) if you need to decode gzip-compressed payloads.

---

### `StreamScanner` — real-time microphone scanning

`StreamScanner` maintains a rolling audio buffer and scans it incrementally as chunks arrive.

```ts
import { StreamScanner } from "qraudio/web";

const scanner = new StreamScanner({ sampleRate: 48000 });

// Feed chunks from ScriptProcessorNode / AudioWorkletNode / MediaRecorder, etc.
const results = scanner.push(float32Chunk);
for (const r of results) {
  console.log("Detected:", r.json);
}

scanner.reset(); // clear buffer
```

**`StreamScannerOptions`**

| Option | Default | Description |
|---|---|---|
| `sampleRate` | — | Required |
| `maxBufferMs` | 8000 / 20000† | Max audio history to retain |
| `minBufferMs` | 1200 / 4000† | Min buffered audio before scanning begins |
| `scanIntervalMs` | `0` (every chunk) | Throttle scan frequency |
| `dedupeMs` | `500` | Suppress duplicate detections within this window |

† Larger values used for the `mfsk` profile.

---

### AudioWorklet integration

For low-latency microphone capture, connect the built-in worklet processor:

```ts
import { createStreamScannerNode, getStreamCaptureWorkletUrl } from "qraudio/web";

const ctx = new AudioContext();

// Microphone → scanner
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
const source = ctx.createMediaStreamSource(stream);

const handle = await createStreamScannerNode(ctx, {
  onDetection: (result) => console.log("Got:", result.json),
});

source.connect(handle.node);

// Later:
handle.disconnect();
```

The worklet module URL is exported as `getStreamCaptureWorkletUrl()` and can be referenced in your bundler config.

---

## Development

```bash
npm run build       # compile TypeScript
npm run dev         # watch mode
npm test            # unit tests (Jest)
npm run test:integration
npm run lint        # Biome lint
npm run fix         # Biome lint + format (auto-fix)
```
