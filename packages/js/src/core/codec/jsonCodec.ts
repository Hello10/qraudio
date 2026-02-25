export function encodeJson(json: unknown): Uint8Array {
  if (typeof TextEncoder === "undefined") {
    throw new Error("TextEncoder is not available in this environment");
  }
  const encoder = new TextEncoder();
  const text = JSON.stringify(json);
  return encoder.encode(text);
}

export function decodeJson(bytes: Uint8Array): unknown {
  if (typeof TextDecoder === "undefined") {
    throw new Error("TextDecoder is not available in this environment");
  }
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const text = decoder.decode(bytes);
  return JSON.parse(text);
}
