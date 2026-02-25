import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

import { StreamScanner, normalizeProfile } from "../dist/web/index.js";

const EXAMPLE_DIR = fileURLToPath(new URL("../../example", import.meta.url));

function getFreePort() {
  return new Promise((resolve) => {
    const server = createServer();
    server.on("error", (error) => {
      resolve({ port: null, error });
    });
    server.listen({ port: 0, host: "127.0.0.1" }, () => {
      const { port } = server.address();
      server.close(() => resolve({ port, error: null }));
    });
  });
}

function waitForServer(child, port) {
  return new Promise((resolve, reject) => {
    const rl = createInterface({ input: child.stdout });
    const timeout = setTimeout(() => {
      rl.close();
      reject(new Error("Server did not start in time"));
    }, 5000);

    const cleanup = () => {
      clearTimeout(timeout);
      rl.close();
    };

    rl.on("line", (line) => {
      if (line.includes(`ws://localhost:${port}`)) {
        cleanup();
        resolve();
      }
    });

    child.on("error", (err) => {
      cleanup();
      reject(err);
    });
    child.on("exit", (code) => {
      cleanup();
      reject(new Error(`Server exited early (code ${code})`));
    });
  });
}

function toArrayBuffer(data) {
  if (data instanceof ArrayBuffer) {
    return data;
  }
  if (ArrayBuffer.isView(data)) {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  }
  return null;
}

describe("ws demo", () => {
  test("streams and decodes payloads", async () => {
    const { port, error } = await getFreePort();
    if (!port) {
      if (error?.code === "EPERM") {
        return;
      }
      throw error ?? new Error("Unable to allocate a port for ws demo test");
    }
    const child = spawn("pnpm", ["exec", "tsx", "server/index.ts"], {
      cwd: EXAMPLE_DIR,
      env: {
        ...process.env,
        QRAUDIO_PORT: String(port),
        QRAUDIO_RANDOM: "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let socket;
    try {
      await waitForServer(child, port);

      socket = new WebSocket(`ws://localhost:${port}`);
      socket.binaryType = "arraybuffer";

      const payload = await new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("Timed out waiting for detection")),
          7000
        );
        let scanner = null;

        const cleanup = () => {
          clearTimeout(timeout);
        };

        socket.addEventListener("message", async (event) => {
          if (typeof event.data === "string") {
            try {
              const meta = JSON.parse(event.data);
              if (meta && typeof meta.sampleRate === "number") {
                const profile = normalizeProfile(meta.profile);
                scanner = new StreamScanner({
                  sampleRate: meta.sampleRate,
                  profile,
                });
              }
            } catch (err) {
              cleanup();
              reject(err);
            }
            return;
          }

          if (!scanner) {
            return;
          }

          const buffer = toArrayBuffer(event.data);
          if (!buffer) {
            return;
          }
          const chunk = new Float32Array(buffer);
          const results = scanner.push(chunk);
          if (results.length > 0) {
            cleanup();
            resolve(results[0].json);
          }
        });

        socket.addEventListener("error", (err) => {
          cleanup();
          reject(err);
        });
        socket.addEventListener("close", () => {
          cleanup();
          reject(new Error("Socket closed before detection"));
        });
      });

      expect(payload).toMatchObject({
        __type: "broadcast",
        meta: { show: "QRA" },
      });
      expect(typeof payload.url).toBe("string");
      expect(payload.url.startsWith("https://example.com/")).toBe(true);
    } finally {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
      if (child && !child.killed) {
        child.kill();
        await once(child, "exit").catch(() => undefined);
      }
    }
  }, 15000);
});
