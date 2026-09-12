# ADR — COS-LANG-PM-001: Portable Language-Pack Storage Provider

**Status:** Implemented (this milestone), not yet certified.
**Date:** 2026-08-14

## Context

CozyOS language-pack knowledge (RP-035) needed a path to portable, physical
storage — starting with the user's Realme Android phone + prepared SD card,
extensible later to USB/OTG and a future Cozy Storage Hub — without ever
claiming a capability the runtime doesn't actually have.

Two real engines already existed in the repository and were read before
writing any new code:
- `core/storage.js` — real IndexedDB gateway, browser-only, no portability.
- `core/engines/files/universal-file-engine.js` (M285) — a real File System
  Access API wrapper (`showDirectoryPicker`/`getFileHandle`/`createWritable`).
  Its own `capabilities()` call confirms at runtime whether the browser
  supports this API. On Android Chrome/WebView, it does not.

Neither engine can reach an arbitrary Android SD-card path from inside a
browser or PWA. No browser exposes that API. This is a platform ceiling, not
a missing permission.

## Decision

1. **`cozy-storage-provider.js`** defines a `StorageProvider` capability
   abstraction with four provider slots: `INTERNAL_INDEXEDDB` (wraps
   `core/storage.js`), `EXTERNAL_DIRECTORY` (wraps `UniversalFileEngine`),
   `SD_CARD_DIRECT` (always `UNAVAILABLE` from this app context — see
   below), and `ANDROID_NATIVE_BRIDGE` (only real if one is ever registered;
   none exists today, confirmed by repository search).
2. **`SD_CARD_DIRECT` is a deliberate, permanent `UNAVAILABLE` from inside
   the app.** The only real path to the SD card is a separate process with
   real OS-level filesystem access: the Termux CLI tool
   (`tools/termux/cozy-pack.js`), documented and tested independently. The
   two are never conflated.
3. **`cozy-language-pack-format.js`** is the single manifest/hash source of
   truth, shared verbatim (via `require`, not reimplementation) by the
   in-app export/import path and the Termux tool, so a pack built on one
   side verifies identically on the other.
4. **`cozy-language-pack-export-import.js`** composes the real RP-035
   registry (read-only) and the real RP-034 privacy engine. It fails closed:
   any record without a real `privacyTier` is excluded from export by
   default, not included. This surfaced a genuine gap — the registry does
   not yet stamp `privacyTier` onto submitted expressions — which is
   recorded as a known limitation rather than silently patched around here.

## Consequences

- Every layer degrades honestly: `PERMISSION_REQUIRED`, `UNAVAILABLE`,
  `NOT_IMPLEMENTED`, or `UNKNOWN` are real, distinct, machine-checkable
  states — never collapsed into a fabricated `AVAILABLE`.
- Adding USB/OTG or a future Storage Hub later means adding one more
  provider that implements the same interface. The pack format and
  export/import logic do not change.
- The `privacyTier` gap must be closed (a real RP-029/034 reconciliation
  item) before language-pack export can do anything useful in production —
  today it will honestly export nothing from real registry data.
