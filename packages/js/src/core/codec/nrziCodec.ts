export function nrziEncode(bits: number[]): number[] {
  const out: number[] = [];
  let level = 1;
  for (const bit of bits) {
    if (bit === 0) {
      level ^= 1;
    }
    out.push(level);
  }
  return out;
}

export function nrziDecode(tones: number[]): number[] {
  if (tones.length === 0) {
    return [];
  }
  const out: number[] = [];
  let prev = tones[0];
  for (const tone of tones) {
    out.push(tone === prev ? 1 : 0);
    prev = tone;
  }
  return out;
}
