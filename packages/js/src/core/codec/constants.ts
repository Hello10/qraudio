export const MAGIC = new Uint8Array([0x51, 0x52, 0x41, 0x31]); // "QRA1"
export const VERSION = 0x01;

export const FLAG_GZIP = 1 << 0;
export const FLAG_FEC = 1 << 1;
export const PROFILE_SHIFT = 2;
export const PROFILE_MASK = 0b11 << PROFILE_SHIFT;
export const PROFILE_CLASSIC = 0 << PROFILE_SHIFT;
export const PROFILE_CHORD = 1 << PROFILE_SHIFT;
export const PROFILE_CHIME = 2 << PROFILE_SHIFT;
export const PROFILE_SMOOTH = 3 << PROFILE_SHIFT;

export const RS_DATA_LEN = 223;
export const RS_PARITY_LEN = 32;
export const RS_BLOCK_LEN = RS_DATA_LEN + RS_PARITY_LEN;
