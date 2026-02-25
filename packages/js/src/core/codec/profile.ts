import { ProfileName } from "../profiles.js";
import type { Profile } from "../profiles.js";
import {
  PROFILE_CHIME,
  PROFILE_CHORD,
  PROFILE_CLASSIC,
  PROFILE_MASK,
  PROFILE_SMOOTH,
  PROFILE_SHIFT,
} from "./constants.js";

export interface ProfileSettings {
  modulation: "afsk" | "gfsk" | "mfsk";
  baud: number;
  markFreq: number;
  spaceFreq: number;
  preambleMs: number;
  fadeMs: number;
  leadInToneMs: number;
  leadInGapMs: number;
  tailToneMs: number;
  tailGapMs: number;
  bt?: number;
  spanSymbols?: number;
  tones?: number[];
  bitsPerSymbol?: number;
}

export function getProfileSettings(profile: Profile): ProfileSettings {
  switch (profile) {
    case ProfileName.AFSK_BELL:
      return {
        modulation: "afsk",
        baud: 1200,
        markFreq: 1200,
        spaceFreq: 2200,
        preambleMs: 500,
        fadeMs: 10,
        leadInToneMs: 150,
        leadInGapMs: 0,
        tailToneMs: 150,
        tailGapMs: 0,
      };
    case ProfileName.AFSK_FIFTH:
      return {
        modulation: "afsk",
        baud: 1200,
        markFreq: 880,
        spaceFreq: 1320,
        preambleMs: 250,
        fadeMs: 20,
        leadInToneMs: 150,
        leadInGapMs: 0,
        tailToneMs: 150,
        tailGapMs: 0,
      };
    case ProfileName.GFSK_FIFTH:
      return {
        modulation: "gfsk",
        baud: 1200,
        markFreq: 880,
        spaceFreq: 1320,
        preambleMs: 250,
        fadeMs: 20,
        leadInToneMs: 150,
        leadInGapMs: 0,
        tailToneMs: 150,
        tailGapMs: 0,
        bt: 1.0,
        spanSymbols: 4,
      };
    case ProfileName.MFSK:
      return {
        modulation: "mfsk",
        baud: 600,
        markFreq: 900,
        spaceFreq: 1200,
        tones: [600, 900, 1200, 1500],
        bitsPerSymbol: 2,
        preambleMs: 300,
        fadeMs: 20,
        leadInToneMs: 150,
        leadInGapMs: 0,
        tailToneMs: 150,
        tailGapMs: 0,
      };
    default:
      return {
        modulation: "afsk",
        baud: 1200,
        markFreq: 1200,
        spaceFreq: 2200,
        preambleMs: 500,
        fadeMs: 10,
        leadInToneMs: 0,
        leadInGapMs: 0,
        tailToneMs: 0,
        tailGapMs: 0,
      };
  }
}

export function profileFlag(profile: Profile): number {
  if (profile === ProfileName.AFSK_BELL) return PROFILE_CLASSIC;
  if (profile === ProfileName.MFSK) return PROFILE_CHORD;
  if (profile === ProfileName.AFSK_FIFTH) return PROFILE_CHIME;
  if (profile === ProfileName.GFSK_FIFTH) return PROFILE_SMOOTH;
  return PROFILE_CLASSIC;
}

export function profileFromFlags(flags: number): Profile | null {
  const value = (flags & PROFILE_MASK) >> PROFILE_SHIFT;
  if (value === 0) return ProfileName.AFSK_BELL;
  if (value === 1) return ProfileName.MFSK;
  if (value === 2) return ProfileName.AFSK_FIFTH;
  if (value === 3) return ProfileName.GFSK_FIFTH;
  return null;
}
