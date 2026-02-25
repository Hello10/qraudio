# qraudio · Python

Encode JSON payloads into audio and decode them back.

The library serializes arbitrary Python objects into an audio signal using AFSK/GFSK/MFSK modulation with HDLC framing, Reed-Solomon FEC, and optional gzip compression. Payloads survive real-world audio paths: recording to WAV, playing over a speaker, or streaming through a microphone.

Requires Python ≥ 3.9. No runtime dependencies — stdlib only.

---

## Installation

```bash
pip install qraudio
```

---

## Profiles

A **profile** controls the modem settings (baud rate, frequencies, modulation). All functions accept an optional `profile` parameter.

| Profile | Modulation | Notes |
|---|---|---|
| `afsk-bell` | AFSK | Default; broadest compatibility |
| `afsk-fifth` | AFSK | Higher baud, shorter audio |
| `gfsk-fifth` | GFSK | Smoother spectrum |
| `mfsk` | MFSK | Multi-tone; most robust over voice channels |

```python
from qraudio import ProfileName

ProfileName.AFSK_BELL   # "afsk-bell"
ProfileName.AFSK_FIFTH  # "afsk-fifth"
ProfileName.GFSK_FIFTH  # "gfsk-fifth"
ProfileName.MFSK        # "mfsk"
```

---

## Core API

### `encode(payload, **options) -> EncodeResult`

Encodes any JSON-serializable Python object into a `list[float]` of mono audio samples.

```python
from qraudio import encode

result = encode({"hello": "world"})
# result.samples      → list[float]
# result.sample_rate  → 48000
# result.duration_ms  → ~800
# result.profile      → ProfileName.AFSK_BELL
```

**Keyword arguments**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `profile` | `ProfileName \| str` | `"afsk-bell"` | Modem profile |
| `sample_rate` | `int` | `48000` | Output sample rate (Hz) |
| `fec` | `bool` | `True` | Reed-Solomon forward error correction |
| `gzip` | `bool \| "auto"` | `"auto"` | Compress payload; `"auto"` only applies if it saves ≥ 8 bytes / 8% |
| `gzip_compress` | `Callable[[bytes], bytes]` | `gzip.compress` | Override compress function |
| `gzip_min_savings_bytes` | `int` | `8` | Auto-gzip byte savings threshold |
| `gzip_min_savings_pct` | `float` | `0.08` | Auto-gzip percentage savings threshold |
| `level_db` | `float` | profile default | Output level in dBFS |
| `preamble_ms` | `float` | profile default | Flag preamble duration |
| `fade_ms` | `float` | profile default | Amplitude fade in/out |
| `lead_in` | `bool` | profile default | Prepend two-tone chime before payload |
| `lead_in_tone_ms` / `lead_in_gap_ms` | `float` | profile default | Lead-in chime timing |
| `tail_out` | `bool` | profile default | Append two-tone chime after payload |
| `tail_tone_ms` / `tail_gap_ms` | `float` | profile default | Tail chime timing |

---

### `decode(samples, **options) -> DecodeResult`

Finds and decodes the first high-confidence payload in a `list[float]`.  
Raises `ValueError` if nothing is found.

```python
from qraudio import decode

result = decode(samples)
# result.json         → decoded Python value
# result.profile      → ProfileName.AFSK_BELL
# result.start_sample / end_sample → position in sample list
# result.confidence   → 0.0–1.0
```

---

### `scan(samples, **options) -> list[ScanResult]`

Like `decode`, but returns **all** payloads found in the audio, sorted by position. Returns an empty list when nothing is detected.

```python
from qraudio import scan

hits = scan(samples)
for hit in hits:
    print(hit.json, hit.start_sample)
```

**Keyword arguments for `decode` / `scan`**

| Parameter | Type | Description |
|---|---|---|
| `profile` | `ProfileName \| str` | Narrow search to one profile (faster) |
| `sample_rate` | `int` | Sample rate of the input (default `48000`) |
| `gzip_decompress` | `Callable[[bytes], bytes]` | Override decompress function (default `gzip.decompress`) |
| `min_confidence` | `float` | Minimum confidence threshold for `scan` (default `0.8`) |

---

## WAV helpers (in-memory)

Gzip is handled automatically using `gzip` from the standard library.

```python
from qraudio import encodeWav, decodeWav, scanWav, prependPayloadToWav

# Encode JSON → WAV bytes
result = encodeWav({"track": 1})        # EncodeWavResult
wav_bytes: bytes = result.wav

# Decode WAV bytes → JSON
result = decodeWav(wav_bytes)
print(result.json)

# Find all payloads in WAV bytes
hits = scanWav(wav_bytes)

# Prepend encoded payload before existing audio
result = prependPayloadToWav(existing_wav_bytes, {"track": 1})
```

`prependPayloadToWav` accepts `pad_seconds`, `pre_pad_seconds`, and `post_pad_seconds` to add silence around the encoded payload (default `0.25` s).

All WAV helpers forward extra keyword arguments to `encode` / `decode`.

### Low-level WAV encoding

```python
from qraudio import encodeWavSamples, decodeWavSamples

# list[float] → WAV bytes  (fmt: "pcm16" | "float32")
wav = encodeWavSamples(samples, sample_rate=48000, fmt="pcm16")

# WAV bytes → WavData(sampleRate, channels, format, samples)
data = decodeWavSamples(wav)
```

---

## File I/O helpers

```python
from qraudio import encodeWavFile, decodeWavFile, scanWavFile, prependPayloadToWavFile

encodeWavFile("output.wav", {"hello": "world"})
result = decodeWavFile("output.wav")
hits   = scanWavFile("output.wav")
prependPayloadToWavFile("music.wav", "tagged.wav", {"track": 1})
```

Paths can be `str` or `pathlib.Path`.

---

## CLI

The package installs a `qraudio` command.

```
qraudio <command> [options]

Commands:
  encode   Encode JSON payload to a WAV file
  decode   Decode a WAV file to JSON
  scan     Scan a WAV file for all payloads
  prepend  Prepend an encoded payload to an existing WAV file
```

**Encode**

```bash
qraudio encode --file payload.json --out out.wav
qraudio encode --file payload.json --out out.wav --profile mfsk --gzip
echo '{"x":1}' | qraudio encode --out out.wav
```

**Decode**

```bash
qraudio decode --in out.wav
cat out.wav | qraudio decode
```

**Scan**

```bash
qraudio scan --in recording.wav
cat recording.wav | qraudio scan
```

**Prepend**

```bash
qraudio prepend --in music.wav --out tagged.wav --file payload.json --pad-seconds 0.5
```

Common flags: `--profile <afsk-bell|afsk-fifth|gfsk-fifth|mfsk>`, `--format <pcm16|float32>`, `--gzip`, `--no-fec`.  
`--in` / `--out` accept `-` or may be omitted to read/write stdin/stdout.

---

## Development

```bash
# Install dev dependencies (uv recommended)
uv sync

# Run tests
pytest

# Run a single test file
pytest tests/test_codec.py
```
