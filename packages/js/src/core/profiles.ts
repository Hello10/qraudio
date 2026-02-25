export enum ProfileName {
  AFSK_BELL = "afsk-bell",
  AFSK_FIFTH = "afsk-fifth",
  GFSK_FIFTH = "gfsk-fifth",
  MFSK = "mfsk",
}

export type Profile = ProfileName;

export const PROFILE_NAMES: readonly ProfileName[] = Object.freeze([
  ProfileName.AFSK_BELL,
  ProfileName.AFSK_FIFTH,
  ProfileName.GFSK_FIFTH,
  ProfileName.MFSK,
]);

export const DEFAULT_PROFILE: Profile = ProfileName.AFSK_BELL;

const PROFILE_SET = new Set(PROFILE_NAMES);

export function isProfile(value: unknown): value is Profile {
  return typeof value === "string" && PROFILE_SET.has(value as Profile);
}

export function normalizeProfile(value: unknown, fallback: Profile = DEFAULT_PROFILE): Profile {
  return isProfile(value) ? value : fallback;
}
