import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const CLI_PATH = resolve(new URL("../dist/node/cli.js", import.meta.url).pathname);

function runCli(args, options = {}) {
  const { input } = options;
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [CLI_PATH, ...args], {
      stdio: [input ? "pipe" : "ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      resolvePromise({ code, stdout, stderr });
    });

    if (input) {
      child.stdin.write(input);
      child.stdin.end();
    }
  });
}

describe("qraudio CLI", () => {
  test("encode/decode/scan/prepend roundtrip", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "qraudio-"));
    const payloadPath = join(tempDir, "payload.json");
    const payload = { __type: "cli", url: "https://example.com", n: 7 };
    await writeFile(payloadPath, JSON.stringify(payload));

    const wavPath = join(tempDir, "payload.wav");
    const encodeResult = await runCli(["encode", "--file", payloadPath, "--out", wavPath]);
    expect(encodeResult.code).toBe(0);

    const decodeResult = await runCli(["decode", "--in", wavPath]);
    expect(decodeResult.code).toBe(0);
    const decodedJson = JSON.parse(decodeResult.stdout.trim());
    expect(decodedJson).toEqual(payload);

    const scanResult = await runCli(["scan", "--in", wavPath]);
    expect(scanResult.code).toBe(0);
    const scanPayloads = JSON.parse(scanResult.stdout.trim());
    expect(Array.isArray(scanPayloads)).toBe(true);
    expect(scanPayloads.length).toBeGreaterThan(0);

    const prependPayloadPath = join(tempDir, "payload2.json");
    const prependPayload = { __type: "cli", url: "https://example.com/2", n: 9 };
    await writeFile(prependPayloadPath, JSON.stringify(prependPayload));

    const prependWavPath = join(tempDir, "payload-prepended.wav");
    const prependResult = await runCli([
      "prepend",
      "--in",
      wavPath,
      "--file",
      prependPayloadPath,
      "--out",
      prependWavPath,
    ]);
    expect(prependResult.code).toBe(0);

    const scanPrepended = await runCli(["scan", "--in", prependWavPath]);
    expect(scanPrepended.code).toBe(0);
    const scanPrependedPayloads = JSON.parse(scanPrepended.stdout.trim());
    const found = scanPrependedPayloads.some(
      (p) => JSON.stringify(p) === JSON.stringify(prependPayload)
    );
    expect(found).toBe(true);

    const wavStat = await readFile(prependWavPath);
    expect(wavStat.length).toBeGreaterThan(0);
  });
});
