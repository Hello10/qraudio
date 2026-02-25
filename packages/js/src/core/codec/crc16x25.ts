export function crc16X25(data: Uint8Array): number {
  let crc = 0xffff;
  for (const byte of data) {
    let x = byte;
    for (let i = 0; i < 8; i += 1) {
      const bit = (crc ^ x) & 0x01;
      crc >>= 1;
      if (bit !== 0) {
        crc ^= 0x8408;
      }
      x >>= 1;
    }
  }
  crc = ~crc & 0xffff;
  return crc;
}
