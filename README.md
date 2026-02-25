# QRAudio

Encode, decode, and scan for short audio snippets that encode JSON payloads.

## Description

QRAudio encodes JSON into a short AFSK audio burst using Bell 202 tones (1200/2200 Hz) with HDLC-style framing (flags, bit-stuffing, NRZI), CRC-16 for integrity, and optional Reed–Solomon FEC. The payload is UTF-8 JSON (optionally gzip-compressed), packaged into a frame that can be detected in an audio stream, decoded back to bytes, error-checked, and parsed back into JSON. This design is resilient to typical broadcast/stream processing and is easy to detect in continuous audio.

## Packages 
- packages/js: JS/TS reference implementation
- packages/python: Python reference implementation (stubs for now)
- packages/example: Vite + WebSocket demo app

## Spec
- spec/PROTOCOL.md

## Usage (JS/TS)
```ts
import { decode, encode, scan } from "qraudio";
// Node-specific helpers:
// import { encodeWav, decodeWav } from "qraudio/node";
// Web-specific helpers:
// import { encodeAudioBuffer, decodeAudioBuffer, createStreamScannerNode } from "qraudio/web";
```

## Usage (Python)
```python
from qraudio import decode, encode, scan
```

## CLI
```bash
qraudio encode --json '{"url":"https://example.com"}' --out out.wav
qraudio decode --in out.wav
qraudio scan --in out.wav
qraudio prepend --in input.wav --json '{"url":"https://example.com"}' --out output.wav --pad 0.25
```

You can also pipe input/output:
```bash
cat payload.json | qraudio encode --stdin --out out.wav
cat out.wav | qraudio decode --in -
cat out.wav | qraudio scan --in - --format jsonl
```
