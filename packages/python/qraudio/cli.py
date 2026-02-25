from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Optional

from . import PROFILE_NAMES, decodeWav, encodeWav, prependPayloadToWav, scanWav

PROFILE_CHOICES = [profile.value for profile in PROFILE_NAMES]


def _read_json(path: Optional[str]) -> object:
    if path:
        return json.loads(Path(path).read_text())
    data = sys.stdin.read()
    if not data:
        raise ValueError("No JSON input provided")
    return json.loads(data)


def _read_wav(path: Optional[str]) -> bytes:
    if path:
        return Path(path).read_bytes()
    data = sys.stdin.buffer.read()
    if not data:
        raise ValueError("No WAV input provided")
    return data


def _write_wav(wav: bytes, path: Optional[str]) -> None:
    if path:
        Path(path).write_bytes(wav)
        return
    sys.stdout.buffer.write(wav)


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(prog="qraudio")
    subparsers = parser.add_subparsers(dest="command", required=True)

    encode_parser = subparsers.add_parser("encode", help="Encode JSON payload to WAV")
    encode_parser.add_argument("--file", dest="payload_file", help="Path to JSON payload")
    encode_parser.add_argument("--out", dest="out_path", help="Path to output WAV file")
    encode_parser.add_argument("--profile", choices=PROFILE_CHOICES)
    encode_parser.add_argument("--format", dest="wav_format", choices=["pcm16", "float32"], default="pcm16")
    encode_parser.add_argument("--gzip", action="store_true")
    encode_parser.add_argument("--no-fec", action="store_true")

    decode_parser = subparsers.add_parser("decode", help="Decode WAV to JSON payload")
    decode_parser.add_argument("--in", dest="in_path", help="Path to input WAV file")
    decode_parser.add_argument("--profile", choices=PROFILE_CHOICES)

    scan_parser = subparsers.add_parser("scan", help="Scan WAV for payloads")
    scan_parser.add_argument("--in", dest="in_path", help="Path to input WAV file")
    scan_parser.add_argument("--profile", choices=PROFILE_CHOICES)

    prepend_parser = subparsers.add_parser("prepend", help="Prepend payload to an existing WAV")
    prepend_parser.add_argument("--in", dest="in_path", required=True, help="Path to input WAV file")
    prepend_parser.add_argument("--file", dest="payload_file", help="Path to JSON payload")
    prepend_parser.add_argument("--out", dest="out_path", help="Path to output WAV file")
    prepend_parser.add_argument("--profile", choices=PROFILE_CHOICES)
    prepend_parser.add_argument("--format", dest="wav_format", choices=["pcm16", "float32"], default="pcm16")
    prepend_parser.add_argument("--pad-seconds", type=float, default=0.25)
    prepend_parser.add_argument("--pre-pad-seconds", type=float)
    prepend_parser.add_argument("--post-pad-seconds", type=float)
    prepend_parser.add_argument("--gzip", action="store_true")
    prepend_parser.add_argument("--no-fec", action="store_true")

    args = parser.parse_args(argv)

    try:
        if args.command == "encode":
            payload = _read_json(args.payload_file)
            result = encodeWav(
                payload,
                profile=args.profile,
                wav_format=args.wav_format,
                gzip=args.gzip,
                fec=not args.no_fec,
            )
            _write_wav(result.wav, args.out_path)
            return 0

        if args.command == "decode":
            wav_bytes = _read_wav(args.in_path)
            decoded = decodeWav(wav_bytes, profile=args.profile)
            sys.stdout.write(json.dumps(decoded.json))
            return 0

        if args.command == "scan":
            wav_bytes = _read_wav(args.in_path)
            results = scanWav(wav_bytes, profile=args.profile)
            payloads = [result.json for result in results]
            sys.stdout.write(json.dumps(payloads))
            return 0

        if args.command == "prepend":
            wav_bytes = _read_wav(args.in_path)
            payload = _read_json(args.payload_file)
            result = prependPayloadToWav(
                wav_bytes,
                payload,
                profile=args.profile,
                wav_format=args.wav_format,
                pad_seconds=args.pad_seconds,
                pre_pad_seconds=args.pre_pad_seconds,
                post_pad_seconds=args.post_pad_seconds,
                gzip=args.gzip,
                fec=not args.no_fec,
            )
            _write_wav(result.wav, args.out_path)
            return 0

        raise ValueError(f"Unknown command {args.command}")
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
