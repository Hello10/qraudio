import { WebSocketServer } from "ws";
import { encode, ProfileName, normalizeProfile } from "qraudio";
import { faker } from "@faker-js/faker";

const PORT = Number.parseInt(process.env.QRAUDIO_PORT ?? "", 10) || 5174;
const SAMPLE_RATE = 48000;
const PROFILE = normalizeProfile(process.env.QRAUDIO_PROFILE, ProfileName.GFSK_FIFTH);
const CHUNK_SAMPLES = 960; // 20 ms at 48k
const SILENCE_MS = 500;
const GAP_MS = 1000;
const RANDOM_PAYLOADS = (process.env.QRAUDIO_RANDOM ?? "1") !== "0";
const MIN_PAYLOAD_BYTES = Number.parseInt(process.env.QRAUDIO_PAYLOAD_MIN ?? "", 10) || 160;
const MAX_PAYLOAD_BYTES = Number.parseInt(process.env.QRAUDIO_PAYLOAD_MAX ?? "", 10) || 800;
const RANDOM_SEED = Number.parseInt(process.env.QRAUDIO_SEED ?? "", 10);
const MESSAGES = [
  { __type: "broadcast", url: "https://example.com/alpha", tag: "alpha" },
  { __type: "broadcast", url: "https://example.com/beta", tag: "beta" },
  { __type: "broadcast", url: "https://example.com/gamma", tag: "gamma" },
  { __type: "broadcast", url: "https://example.com/delta", tag: "delta" },
];
let sequenceId = 0;

if (!Number.isNaN(RANDOM_SEED)) {
  faker.seed(RANDOM_SEED);
}

if (RANDOM_PAYLOADS) {
  console.log(
    `QRAudio payloads: random (${MIN_PAYLOAD_BYTES}-${MAX_PAYLOAD_BYTES} bytes target)`
  );
} else {
  console.log("QRAudio payloads: fixed rotation");
}

function buildSequence() {
  const { payload } = RANDOM_PAYLOADS ? buildRandomPayload(sequenceId) : buildFixedPayload(sequenceId);
  sequenceId += 1;

  const result = encode(payload, {
    sampleRate: SAMPLE_RATE,
    profile: PROFILE,
    gzip: false,
  });

  const leadingSilenceSamples = Math.round((SILENCE_MS / 1000) * SAMPLE_RATE);
  const trailingSilenceSamples = Math.round(((SILENCE_MS + GAP_MS) / 1000) * SAMPLE_RATE);
  const leadingSilence = new Float32Array(leadingSilenceSamples);
  const trailingSilence = new Float32Array(trailingSilenceSamples);

  const combined = new Float32Array(
    leadingSilence.length + result.samples.length + trailingSilence.length
  );
  combined.set(leadingSilence, 0);
  combined.set(result.samples, leadingSilence.length);
  combined.set(trailingSilence, leadingSilence.length + result.samples.length);

  return { payload, samples: combined };
}

function buildFixedPayload(sequence) {
  const base = MESSAGES[sequence % MESSAGES.length];
  const payload = {
    ...base,
    meta: {
      show: "QRA",
      createdAt: new Date().toISOString(),
      sequence,
      bytes: 0,
    },
  };
  payload.meta.bytes = byteLength(payload);
  return { payload };
}

function buildRandomPayload(sequence) {
  const base = {
    __type: "broadcast",
    url: `https://example.com/${faker.word.sample()}`,
    tag: faker.word.adjective(),
  };
  const metaBase = {
    show: "QRA",
    createdAt: new Date().toISOString(),
    sequence,
  };

  const targetBytes = randomInt(MIN_PAYLOAD_BYTES, MAX_PAYLOAD_BYTES);
  let filler = "";
  let payload = {
    ...base,
    blob: filler,
    meta: { ...metaBase, bytes: 0, targetBytes },
  };

  let size = byteLength(payload);
  if (size < targetBytes) {
    filler = faker.string.alphanumeric(targetBytes - size);
    payload = {
      ...base,
      blob: filler,
      meta: { ...metaBase, bytes: 0, targetBytes },
    };
    size = byteLength(payload);
    if (size < targetBytes) {
      filler += "x".repeat(targetBytes - size);
      payload = {
        ...base,
        blob: filler,
        meta: { ...metaBase, bytes: 0, targetBytes },
      };
      size = byteLength(payload);
    }
  }

  payload.meta.bytes = size;
  return { payload };
}

function randomInt(min, max) {
  if (max <= min) {
    return min;
  }
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function byteLength(value) {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws) => {
  let { samples } = buildSequence();
  let cursor = 0;

  ws.send(
    JSON.stringify({
      type: "meta",
      sampleRate: SAMPLE_RATE,
      profile: PROFILE,
      chunkSamples: CHUNK_SAMPLES,
    })
  );

  const interval = setInterval(() => {
    if (ws.readyState !== ws.OPEN) {
      return;
    }

    const end = Math.min(cursor + CHUNK_SAMPLES, samples.length);
    const chunk = samples.subarray(cursor, end);
    ws.send(Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength));
    cursor = end;

    if (cursor >= samples.length) {
      cursor = 0;
      ({ samples } = buildSequence());
    }
  }, Math.round((CHUNK_SAMPLES / SAMPLE_RATE) * 1000));

  ws.on("close", () => {
    clearInterval(interval);
  });
});

console.log(`QRAudio demo server listening on ws://localhost:${PORT}`);
