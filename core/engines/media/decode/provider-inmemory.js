/**
 * =============================================================================
 * CozyOS Media Decode Engine — Reference In-Memory Provider
 * File: core/engines/media/decode/provider-inmemory.js
 * =============================================================================
 *
 * NOT A REAL CONTAINER DEMUXER (Rule 6 — Honest Engineering).
 *
 * This runtime has no ffmpeg/libav/GPU decode access, and integrating a real
 * container demuxer (to feed WebCodecs' VideoDecoder/AudioDecoder, which only
 * ever decode elementary streams, never a container) is an explicit
 * Plan-stage decision this engine's Compose report deliberately left open
 * (see docs/history/M388-E1-MediaDecode-Compose.md §4) rather than
 * resolved here. Consistent with core/engines/media/provider-inmemory.js's
 * own precedent, this reference provider does two things honestly instead
 * of fabricating a decoded track:
 *
 *   1. Container detection is REAL, executed byte-level magic-number
 *      sniffing against the actual input bytes (ISO-BMFF `ftyp`, WebM/EBML,
 *      RIFF/WAVE, OggS, FLAC, MP3 ID3/frame-sync) — genuine computation,
 *      not a guess or a hardcoded value.
 *   2. Track/sample data is NOT fabricated: with no real demux backend
 *      wired in this environment, `decode()` returns an honest, documented
 *      structural envelope (`isReal:false`) for `audioTrack`/`videoTrackRef`
 *      instead of inventing decoded audio bytes or frame data it cannot
 *      actually produce. `durationSeconds`/`sampleRate`/`trackCount` are
 *      honestly `null` — never a fabricated number — because none of them
 *      are derivable without a real demuxer.
 *
 * A production deployment swaps this provider for a real demux/WebCodecs
 * adapter without changing MediaDecodeEngine's own interface (§6 of the
 * Compose report), the same swap pattern used by every other Media Engine
 * sub-engine's provider.
 * =============================================================================
 */

'use strict';

// Real, executed magic-number checks against actual input bytes.
const MAGIC_SIGNATURES = Object.freeze([
  {
    container: 'mp4',
    // ISO-BMFF: 4-byte size, then ASCII 'ftyp' at offset 4.
    test: (b) => b.length > 11 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70
  },
  {
    container: 'webm',
    // EBML header magic (also matches .mkv, which shares the container format).
    test: (b) => b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3
  },
  {
    container: 'wav',
    // RIFF....WAVE
    test: (b) =>
      b.length >= 12 &&
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x41 && b[10] === 0x56 && b[11] === 0x45
  },
  {
    container: 'ogg',
    // 'OggS'
    test: (b) => b.length >= 4 && b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53
  },
  {
    container: 'flac',
    // 'fLaC'
    test: (b) => b.length >= 4 && b[0] === 0x66 && b[1] === 0x4c && b[2] === 0x61 && b[3] === 0x43
  },
  {
    container: 'mp3',
    // ID3 tag header, or a raw MPEG frame sync (11 set bits).
    test: (b) =>
      b.length >= 3 &&
      ((b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0))
  }
]);

/** Real, executed detection — returns a container name or null (honest "unknown"). */
function detectContainer(bytes) {
  for (const sig of MAGIC_SIGNATURES) {
    if (sig.test(bytes)) return sig.container;
  }
  return null;
}

/** Real, live check of the actual runtime — not used for decoding yet (see file header). */
function webCodecsAvailable() {
  return typeof globalThis.VideoDecoder === 'function' && typeof globalThis.AudioDecoder === 'function';
}

function _envelope(extra) {
  return Object.freeze({
    isReal: false,
    envelope: 'structural-reference-not-real-codec',
    ...extra
  });
}

/**
 * @param {{bytes: Uint8Array, mimeType?: string, name?: string}} sourceHandle
 * @returns {{audioTrack: object|null, videoTrackRef: object|null, metadata: object}}
 */
function decode(sourceHandle) {
  if (!sourceHandle || !(sourceHandle.bytes instanceof Uint8Array)) {
    throw new TypeError('[MediaDecodeProvider] decode() requires sourceHandle.bytes to be a Uint8Array.');
  }
  const { bytes, mimeType = null, name = null } = sourceHandle;
  const container = detectContainer(bytes); // real, computed

  const metadata = Object.freeze({
    byteLength: bytes.length, // real
    container, // real detection result, or honest null if unrecognized
    mimeType,
    name,
    // None of these are derivable without a real demuxer in this
    // environment — honestly null, never a fabricated number.
    durationSeconds: null,
    sampleRate: null,
    trackCount: null
  });

  return {
    audioTrack: container ? _envelope({ kind: 'audio', container }) : null,
    videoTrackRef: container ? _envelope({ kind: 'video', container }) : null,
    metadata
  };
}

function createInMemoryDecodeProvider(type = 'reference') {
  return Object.freeze({
    type,
    decode,
    detectContainer,
    webCodecsAvailable
  });
}

export { createInMemoryDecodeProvider, detectContainer, webCodecsAvailable };
