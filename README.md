# qraudio

Encode JSON payloads into short audio snippets and decode them back — across speakers, microphones, and broadcast pipelines.

qraudio uses AFSK/GFSK/MFSK modulation with HDLC framing, CRC-16 integrity checking, Reed-Solomon FEC, and optional gzip compression. Payloads survive real-world audio paths and can be detected in a continuous audio stream.

---

## Packages

| Package | Description |
|---|---|
| [`packages/js`](packages/js/README.md) | TypeScript/JavaScript implementation — universal core, Node.js WAV helpers, browser AudioBuffer + AudioWorklet integration, and a CLI |
| [`packages/python`](packages/python/README.md) | Python implementation — core encode/decode/scan, WAV helpers, file I/O, and a CLI |
| [`packages/example`](packages/example/README.md) | Vite + WebSocket demo app |

Both implementations are cross-compatible: audio encoded by one can be decoded by the other.

---

## Quick start

**JavaScript / TypeScript**

```ts
import { encode, decode, scan } from "qraudio";

const result = encode({ json: { url: "https://example.com" } });
// result.samples → Float32Array of audio at 48 kHz

const decoded = decode({ samples: result.samples });
// decoded.json → { url: "https://example.com" }
```

Node.js WAV helpers:
```ts
import { encodeWavFile, decodeWavFile } from "qraudio/node";

await encodeWavFile({ path: "out.wav", json: { track: 1 } });
const { json } = await decodeWavFile({ path: "out.wav" });
```

Browser / real-time scanning:
```ts
import { createStreamScannerNode } from "qraudio/web";

const handle = await createStreamScannerNode({
  context: audioContext,
  onDetection: (result) => console.log(result.json),
});
microphoneSource.connect(handle.node);
```

**Python**

```python
from qraudio import encode, decode, scan

result = encode(payload={"url": "https://example.com"})
# result.samples → list[float] at 48 kHz

decoded = decode(samples=result.samples)
# decoded.json → {"url": "https://example.com"}
```

WAV helpers:
```python
from qraudio import encodeWavFile, decodeWavFile

encodeWavFile(out_path="out.wav", payload={"track": 1})
result = decodeWavFile(path="out.wav")
```

---

## CLI

Both packages install a `qraudio` command with the same four subcommands:

```bash
qraudio encode --file payload.json --out out.wav
qraudio decode --in out.wav
qraudio scan   --in recording.wav
qraudio prepend --in music.wav --out tagged.wav --file payload.json
```

Stdin/stdout are supported — omit `--in` / `--out` to pipe:

```bash
echo '{"x":1}' | qraudio encode --out out.wav   # JS: also --json '{"x":1}'
cat out.wav | qraudio decode
```

See the per-package READMEs for full flag references.

---

## Profiles

All encode/decode functions accept an optional `profile` parameter:

| Profile | Modulation | Default? |
|---|---|---|
| `afsk-bell` | AFSK | ✓ |
| `afsk-fifth` | AFSK | |
| `gfsk-fifth` | GFSK | |
| `mfsk` | MFSK | |

---

## Spec

Protocol details in [`spec/PROTOCOL.md`](spec/PROTOCOL.md).

---

## Development

```bash
# JS (requires pnpm + Node)
pnpm install
pnpm build
pnpm test

# Python (requires uv)
cd packages/python
uv sync
pytest
```
