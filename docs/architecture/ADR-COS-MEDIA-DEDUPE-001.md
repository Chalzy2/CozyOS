# ADR — COS-MEDIA-DEDUPE-001: Media Deduplication (Detection / Cleanup Split)

**Status:** Implemented (this milestone), Node/static-tested, not yet certified.
**Date:** 2026-08-14

## Context

Repeated CozyOS-generated assets (the logo being today's visible example) were
accumulating uncontrolled copies on the device, and there was no engine
governing media identity before registration/export. Charles's locked rule
for this milestone: **CozyOS must never delete a file merely because an AI
thinks it is a duplicate.**

Two real files were read before writing any new code:
- `core/modules/media/cozy-media.js` (`CozyMedia`) — a pure registry/
  coordinator (createMedia/listMedia/archiveMedia/restoreMedia/deleteMedia,
  Devices/Sources/Destinations, merge-only export/import). No hashing, no
  file I/O — "coordinate, never execute," identical to the rest of the
  platform's engines. Correct compose target; not rewritten.
- `core/modules/duplicate-detection/duplicate-detection.js` — confirmed
  scoped strictly to `{ documentRecord, understanding }` text/document
  fingerprinting (Jaccard/word-shingle similarity). Not media-aware, not
  touched, not duplicated.

No existing perceptual-hash (aHash/dHash) implementation was found anywhere
in the repository — this part is genuinely new. A real SD/Termux precedent
already existed from `COS-LANG-PM-001-IMPLEMENTED`
(`tools/termux/cozy-pack.js`, `cozy-storage-provider.js`) and was extended,
not duplicated.

## Decision

1. **Detection and deletion are separate files**, per the locked rule and
   Charles's explicit architecture diagram:
   - `cozy-media-deduplication.js` — Detect → Hash → Compare → Classify →
     Candidate. Read-only against media bytes. Cannot delete, move, or
     archive anything; the module exposes no such function at all.
   - `cozy-media-cleanup.js` — Owner policy/confirmation → Recovery trash →
     Permanent deletion. The only file in this milestone that can move or
     remove anything, and every path through it is gated:
     - Exact duplicates (deterministic, byte-identical) may be trashed
       automatically **only if** the owner has explicitly set
       `autoCleanupEnabled: true` — off by default.
     - Near-duplicates (a similarity score, not certainty) **always**
       require an explicit human `confirmedBy` — no policy can bypass this.
     - Permanent deletion **always** requires `confirmedBy` and requires the
       item to already be in trash — no direct candidate → delete path
       exists anywhere in the code.
2. **Exact identity** is real `crypto.subtle.digest('SHA-256', …)` over the
   actual media bytes — the same honesty pattern already used by
   `duplicate-detection.js`'s `computeFingerprint()`: null on failure, never
   a fabricated hash.
3. **Near-duplicate identity** (aHash/dHash) is computed from real decoded
   pixel data via an injectable `ImageDecoder` adapter
   (`registerImageDecoder`) — the real decode (Canvas, in a browser) is
   supplied by the caller; this engine never assumes one exists. No decoder
   registered → perceptual hashes are honestly `null`, not fabricated.
   Thresholds (8/64 Hamming distance, both hashes) are explicit constants,
   and every near-duplicate candidate carries its raw distance plus the
   threshold used — never just a bare "duplicate: true".
4. **Classification is deterministic and signal-based** (`assetRole`,
   `generated`, `extractedFrom`, path conventions) — never AI/LLM pixel-
   content recognition. A generated asset (logo/icon/brand) is classified
   `GENERATED_TEMP` off its own declared role, not by recognizing "this
   looks like the logo" inside other photos — so two different user photos
   that both happen to contain the logo are correctly left uncompared to
   each other (their whole-image hashes differ).
5. **Canonical/reference decision** never arbitrates between two files both
   classified `USER_MEDIA` — it marks them `ambiguous`, per the locked rule.
6. **SD/Termux protection** (`tools/termux/cozy-media-pack.js`) requires
   `tools/termux/cozy-pack.js` (from COS-LANG-PM-001) directly via
   `require()` and reuses its real `checkPathCapability`/`getDiskSpace`/
   `sha256File` rather than reimplementing them. It enforces
   SCAN → HASH → DEDUPE → CLASSIFY → EXPORT and refuses to write the same
   exact byte content to the SD card twice under a different filename. The
   dedup index (`media/index/index.json`) is written under `--root`, i.e.
   physically on the SD card, so it travels with the CozyOS storage package
   across a phone change — not trapped in phone-local storage.
   Perceptual (near-duplicate) hashing is honestly reported as
   `IMAGE_DECODE_UNAVAILABLE` in this CLI — there is no image-decoding
   library in a bare Termux/Node environment, consistent with
   COS-LANG-PM-001's own "no third-party npm packages required" precedent.
   Near-duplicate detection for images is a browser-side capability only.

## Consequences

- **Known, disclosed gap:** this package was built and Node/static-tested
  against `COS-RP035-WOS2-P8-CERTIFIED.zip` (for `CozyMedia`'s real API) and
  `COS-LANG-PM-001-IMPLEMENTED.zip` (for the Termux pattern) as two separate
  inputs — no single merged "CozyOS-main" baseline containing both was
  supplied this session. `cozy-media-pack.js`'s `require('./cozy-pack.js')`
  will only resolve once LANG-PM-001 is actually merged into the real
  `tools/termux/` directory in the working repo. This is a real integration
  dependency, not a hidden one.
- **Not yet exercised:** real browser Canvas image decoding, and the
  physical Realme phone + SD card run. Both are required before this
  milestone can move past TESTED (Node/static) to CERTIFIED — see the
  Verification Report.
- Future work (explicitly out of scope here): an owner-facing UI for
  reviewing candidates/confirming trash actions; this milestone builds the
  engines and their contracts, not that UI.
