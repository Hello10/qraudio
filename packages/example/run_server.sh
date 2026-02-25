#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ $# -lt 1 ]]; then
  echo "Usage: $(basename "$0") <node|python> [args...]" >&2
  exit 1
fi

BACKEND="$1"
shift

case "$BACKEND" in
  node|js)
    exec tsx "$ROOT_DIR/server/index.ts" "$@"
    ;;
  python|py)
    if ! command -v uv >/dev/null 2>&1; then
      echo "uv is required for the Python backend. Install it from https://docs.astral.sh/uv/." >&2
      exit 1
    fi
    exec uv run --with websockets --with faker python "$ROOT_DIR/server/index.py" "$@"
    ;;
  *)
    echo "Unknown backend: $BACKEND (expected node|python)" >&2
    exit 1
    ;;
esac
