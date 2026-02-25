# QRAudio Example

This demo streams encoded snippets over WebSocket and decodes them in the browser.

Run `pnpm dev` and then open `http://localhost:5173/` in your browser.

## Run with Node backend (default)

```bash
pnpm dev:node
```

## Run with Python backend

```bash
pnpm dev:py
```

`pnpm dev:py` uses `uv` under the hood to run the Python server with the needed deps.

## Backend runner

You can run just the backend with a shared script (args are forwarded):

```bash
./run_server.sh node
./run_server.sh python
```

## Config

The demo server (both Node and Python) supports:

- `QRAUDIO_PORT` (default 5174)
- `QRAUDIO_PROFILE` (default `gfsk-fifth`)
- `QRAUDIO_RANDOM` (default 1)
- `QRAUDIO_PAYLOAD_MIN` / `QRAUDIO_PAYLOAD_MAX`
- `QRAUDIO_SEED`
