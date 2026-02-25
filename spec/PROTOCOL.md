# QRA Audio Payload Protocol v1

This protocol encodes a JSON payload into a short audio snippet that can be embedded in a broadcast or stream and later decoded.

## Overview
- Modulation: AFSK (Bell 202-style), plus GFSK/MFSK profile variants
- Line coding: NRZI (AFSK/GFSK profiles); raw bits for MFSK
- Framing: HDLC flags with bit-stuffing
- Error handling: CRC-16-CCITT (AX.25/X.25) plus optional Reed-Solomon
- Payload: UTF-8 JSON, optional gzip

## Profiles
- afsk-bell: AFSK, 1200 baud, mark 1200 Hz, space 2200 Hz, with lead/tail chime
- afsk-fifth: AFSK, 1200 baud, mark 880 Hz, space 1320 Hz, with lead/tail chime
- gfsk-fifth: GFSK, 1200 baud, mark 880 Hz, space 1320 Hz, with lead/tail chime
- mfsk: MFSK (4 tones), 600 baud, tones 600/900/1200/1500 Hz, with lead/tail chime

## Audio recommendations
- Default sample rate: 48000 Hz (support 44100 Hz)
- Sine-wave tones, continuous phase FSK
- Output level: about -12 dBFS
- Fade in/out: 10-20 ms raised cosine

## Framing
- Preamble: repeat HDLC flag 0x7E for about 0.5 s
- Start flag: 0x7E
- Frame bytes: bit-stuffed NRZI
- End flag: 0x7E

## Bit order and NRZI mapping
- Bits are transmitted least-significant-bit first per byte (AX.25 style).
- NRZI mapping: data bit 1 = no transition, data bit 0 = transition.

## Frame bytes
All fields below are inside the HDLC frame.

- Magic: 4 bytes ASCII "QRA1"
- Version: 1 byte (0x01)
- Flags: 1 byte
  - bit0: gzip payload
  - bit1: RS FEC enabled
  - bit2-3: profile (00 afsk-bell, 01 mfsk, 10 afsk-fifth, 11 gfsk-fifth)
- Length: 2 bytes, big-endian, payload length before RS
- Payload: JSON UTF-8 bytes, optionally gzip
- RS parity: optional, RS(255,223) over payload bytes in 223-byte blocks
- FCS: CRC-16-CCITT (AX.25/X.25)
  - init 0xFFFF, reflect in/out, xorout 0xFFFF
  - append low byte then high byte

## Reed-Solomon
- RS(255,223) corrects up to 16 byte errors per 255-byte block
- Payload is padded to 223-byte blocks before RS parity is added
- Decoder trims to the Length field after RS decoding

## Compression
- Encoder may gzip payload if it reduces size
- Recommended rule: enable gzip only if size shrinks by at least 8 bytes or 8 percent

## JSON convention
- Payload is arbitrary JSON
- Optional conventional key: "__type" to indicate payload type

## Detection and scanning
- Band-pass around profile tone ranges (e.g., 600-2600 Hz)
- Detect strong tone energy, then search for repeated HDLC flags
- Decode bits to bytes, verify FCS, then parse payload
