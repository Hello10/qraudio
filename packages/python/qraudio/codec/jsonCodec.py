from __future__ import annotations

import json


def encodeJson(value: object) -> bytes:
    text = json.dumps(value, separators=(",", ":"), ensure_ascii=False)
    return text.encode("utf-8")


def decodeJson(data: bytes) -> object:
    text = data.decode("utf-8", errors="strict")
    return json.loads(text)
