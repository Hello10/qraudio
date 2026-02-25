import "./style.css";
import { StreamScanner, createStreamScannerNode, normalizeProfile } from "qraudio/web";
import type { StreamScannerNodeHandle } from "qraudio/web";

const connectButton = document.getElementById("connect") as HTMLButtonElement;
const disconnectButton = document.getElementById("disconnect") as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLSpanElement;
const logEl = document.getElementById("log") as HTMLPreElement;
const detectionsEl = document.getElementById("detections") as HTMLPreElement;
const monitorInput = document.getElementById("monitor") as HTMLInputElement;
const workletStatusEl = document.getElementById("worklet-status") as HTMLSpanElement;
const modeInputs = Array.from(
  document.querySelectorAll<HTMLInputElement>('input[name="mode"]')
);

const wsUrl = "ws://localhost:5174";
const SCAN_INTERVAL_MS = 200;
const WORKLET_CHUNK_SIZE = 8192;
const MAX_BUFFER_MS = 15000;

let socket: WebSocket | null = null;
let scanner: StreamScanner | null = null;
let meta: { sampleRate: number; profile: string } | null = null;
let mode: "main" | "worklet" = getSelectedMode();
let audioContext: AudioContext | null = null;
let workletHandle: StreamScannerNodeHandle | null = null;
let workletOutput: GainNode | null = null;
let workletPlayhead = 0;

function setStatus(text: string, tone: "ok" | "warn") {
  statusEl.textContent = text;
  statusEl.style.background = tone === "ok" ? "#9dd4a9" : "#f1c06c";
}

function log(message: string) {
  logEl.textContent = `${message}\n${logEl.textContent}`;
}

function addDetection(payload: unknown) {
  const timestamp = new Date().toLocaleTimeString();
  const entry = `[${timestamp}] ${JSON.stringify(payload, null, 2)}`;
  detectionsEl.textContent = `${entry}\n\n${detectionsEl.textContent}`;
}

function setWorkletStatus(text: string, tone: "ok" | "warn" | "idle") {
  workletStatusEl.textContent = text;
  workletStatusEl.style.background =
    tone === "ok" ? "#9dd4a9" : tone === "warn" ? "#f1c06c" : "#ded8c8";
}

function getSelectedMode(): "main" | "worklet" {
  const selected = modeInputs.find((input) => input.checked);
  return selected?.value === "worklet" ? "worklet" : "main";
}

function setModeDisabled(disabled: boolean) {
  for (const input of modeInputs) {
    input.disabled = disabled;
  }
}

function resetPipeline() {
  scanner = null;
  if (workletHandle) {
    workletHandle.disconnect();
    workletHandle = null;
  }
  if (workletOutput) {
    workletOutput.disconnect();
    workletOutput = null;
  }
  if (audioContext) {
    void audioContext.close();
    audioContext = null;
  }
  workletPlayhead = 0;
  setWorkletStatus("Worklet: off", "idle");
}

function setupMainScanner(newMeta: { sampleRate: number; profile: string }) {
  const profile = normalizeProfile(newMeta.profile);
  scanner = new StreamScanner({
    sampleRate: newMeta.sampleRate,
    profile,
    scanIntervalMs: SCAN_INTERVAL_MS,
    maxBufferMs: MAX_BUFFER_MS,
  });
}

async function setupWorkletScanner(newMeta: { sampleRate: number; profile: string }) {
  setWorkletStatus("Worklet: loading", "warn");
  if (!audioContext) {
    audioContext = new AudioContext({ sampleRate: newMeta.sampleRate });
  }
  if (audioContext.sampleRate !== newMeta.sampleRate) {
    log(
      `AudioContext sampleRate ${audioContext.sampleRate} Hz does not match stream ${newMeta.sampleRate} Hz.`
    );
  }
  await audioContext.resume();
  if (workletHandle) {
    workletHandle.disconnect();
    workletHandle = null;
  }
  workletHandle = await createStreamScannerNode(audioContext, {
    sampleRate: audioContext.sampleRate,
    profile: normalizeProfile(newMeta.profile),
    scanIntervalMs: SCAN_INTERVAL_MS,
    maxBufferMs: MAX_BUFFER_MS,
    chunkSize: WORKLET_CHUNK_SIZE,
    scanInWorklet: false,
  });
  workletOutput = audioContext.createGain();
  workletOutput.gain.value = monitorInput.checked ? 1 : 0;
  workletHandle.node.connect(workletOutput);
  workletOutput.connect(audioContext.destination);
  workletPlayhead = audioContext.currentTime;
  setWorkletStatus("Worklet: ready", "ok");
}

function enqueueWorkletChunk(chunk: Float32Array) {
  if (!audioContext || !workletHandle) {
    return;
  }
  const buffer = audioContext.createBuffer(1, chunk.length, audioContext.sampleRate);
  buffer.getChannelData(0).set(chunk);

  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(workletHandle.node);

  const startTime = Math.max(audioContext.currentTime, workletPlayhead);
  source.start(startTime);
  workletPlayhead = startTime + buffer.duration;

  source.onended = () => source.disconnect();
}

function updateMonitorGain() {
  if (workletOutput) {
    workletOutput.gain.value = monitorInput.checked ? 1 : 0;
  }
  if (mode !== "worklet") {
    monitorInput.checked = false;
    monitorInput.disabled = true;
  } else {
    monitorInput.disabled = false;
  }
}

for (const input of modeInputs) {
  input.addEventListener("change", () => {
    mode = getSelectedMode();
    log(`Scanner mode: ${mode === "worklet" ? "AudioWorklet" : "Main thread"}`);
    if (mode === "worklet") {
      setWorkletStatus("Worklet: idle", "warn");
    } else {
      setWorkletStatus("Worklet: off", "idle");
    }
    updateMonitorGain();
  });
}

monitorInput.addEventListener("change", () => {
  updateMonitorGain();
});

connectButton.addEventListener("click", () => {
  if (socket) {
    return;
  }

  mode = getSelectedMode();
  setModeDisabled(true);
  log("Connecting...");
  socket = new WebSocket(wsUrl);
  socket.binaryType = "arraybuffer";

  socket.addEventListener("open", () => {
    setStatus("Connected", "ok");
    connectButton.disabled = true;
    disconnectButton.disabled = false;
    log("WebSocket connected");
  });

  socket.addEventListener("close", () => {
    setStatus("Disconnected", "warn");
    connectButton.disabled = false;
    disconnectButton.disabled = true;
    log("WebSocket closed");
    socket = null;
    resetPipeline();
    setModeDisabled(false);
  });

  socket.addEventListener("message", async (event) => {
    if (typeof event.data === "string") {
      try {
        meta = JSON.parse(event.data);
        if (meta && typeof meta.sampleRate === "number") {
          setupMainScanner(meta);
          if (mode === "worklet") {
            await setupWorkletScanner(meta);
          } else {
            setWorkletStatus("Worklet: off", "idle");
          }
        }
        log(`Meta: ${event.data}`);
      } catch {
        log(`Text: ${event.data}`);
      }
      return;
    }

    const buffer = event.data instanceof ArrayBuffer ? event.data : await event.data.arrayBuffer();
    const chunk = new Float32Array(buffer);

    if (!scanner) {
      log("Waiting for stream metadata...");
      return;
    }

    const workletActive = mode === "worklet";
    if (workletActive) {
      if (!workletHandle) {
        log("Waiting for AudioWorklet setup...");
      } else {
        enqueueWorkletChunk(chunk);
      }
    }

    const results = scanner.push(chunk);
    for (const result of results) {
      addDetection(result.json);
    }
  });

  socket.addEventListener("error", () => {
    log("WebSocket error");
  });
});

disconnectButton.addEventListener("click", () => {
  if (socket) {
    socket.close();
  }
});
