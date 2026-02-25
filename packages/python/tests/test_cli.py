import json
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
CLI = [sys.executable, "-m", "qraudio.cli"]


def run_cli(args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        CLI + args,
        cwd=PACKAGE_ROOT,
        check=False,
        capture_output=True,
        text=True,
    )


def test_cli_roundtrip() -> None:
    with TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        payload = {"__type": "cli", "url": "https://example.com", "n": 7}
        payload_path = tmp_path / "payload.json"
        payload_path.write_text(json.dumps(payload))

        wav_path = tmp_path / "payload.wav"
        encode_result = run_cli(["encode", "--file", str(payload_path), "--out", str(wav_path)])
        assert encode_result.returncode == 0

        decode_result = run_cli(["decode", "--in", str(wav_path)])
        assert decode_result.returncode == 0
        decoded_json = json.loads(decode_result.stdout.strip())
        assert decoded_json == payload

        scan_result = run_cli(["scan", "--in", str(wav_path)])
        assert scan_result.returncode == 0
        scan_payloads = json.loads(scan_result.stdout.strip())
        assert isinstance(scan_payloads, list)
        assert len(scan_payloads) > 0

        prepend_payload = {"__type": "cli", "url": "https://example.com/2", "n": 9}
        prepend_payload_path = tmp_path / "payload2.json"
        prepend_payload_path.write_text(json.dumps(prepend_payload))

        prepend_wav_path = tmp_path / "payload-prepended.wav"
        prepend_result = run_cli(
            [
                "prepend",
                "--in",
                str(wav_path),
                "--file",
                str(prepend_payload_path),
                "--out",
                str(prepend_wav_path),
            ]
        )
        assert prepend_result.returncode == 0

        scan_prepended = run_cli(["scan", "--in", str(prepend_wav_path)])
        assert scan_prepended.returncode == 0
        scan_prepended_payloads = json.loads(scan_prepended.stdout.strip())
        found = any(item == prepend_payload for item in scan_prepended_payloads)
        assert found

        assert prepend_wav_path.read_bytes()
