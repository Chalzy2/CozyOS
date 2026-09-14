# COS-MEDIA-DEDUPE-001 — Implementation Report

**Status: IMPLEMENTED (v1.0.1 — naming/composition reconciliation). NOT TESTED. NOT CERTIFIED.**

This milestone is a targeted patch on top of the prior IMPLEMENTED build. It
does not attempt certification and does not claim TESTED status. Two things
changed:

1. **Audit vocabulary corrected.** The engine previously used its own
   decision/reason names (`EXACT_DUPLICATE_CANDIDATE`,
   `NEAR_DUPLICATE_CANDIDATE`, `MOVED_TO_TRASH`, `IDENTICAL_SHA256`,
   `HUMAN_CONFIRMED`, etc). These are now the agreed canonical vocabulary
   throughout both engines — see "Canonical Vocabulary" below.
2. **Two new states added:** `PROTECTED_MEDIA` (owner/user-important media,
   an explicit signal, never inferred — always blocks cleanup regardless of
   confirmation or policy) and `CLEANUP_CANDIDATE` (a distinct, auditable
   checkpoint recorded before a `TRASHED` action, not folded into it).

Nothing about the confirmation-gate *behavior* changed: permanent deletion
still always requires `confirmedBy`, is still always blocked unless the item
is already in trash, and there is still no automatic-delete path anywhere in
`cozy-media-cleanup.js`. This patch only corrects and extends naming.

## Canonical Vocabulary (locked)

**States:** `DETECTED_DUPLICATE`, `PROTECTED_MEDIA`, `CLEANUP_CANDIDATE`,
`TRASHED`, `RESTORED`, `PERMANENTLY_DELETED`
(plus non-duplicate outcomes `NEW_CANONICAL`, `ERROR`, and block-outcomes
`TRASH_BLOCKED`, `RESTORE_BLOCKED`, `DELETE_BLOCKED`, which are not part of
the agreed 6 but are needed to honestly report a refused action.)

**Reasons:** `EXACT_SHA256_MATCH`, `NEAR_DUPLICATE_DHASH_CANDIDATE`,
`USER_CONFIRMED_DELETE` are used exactly where specified:

```
EXACT_SHA256_MATCH             -> DETECTED_DUPLICATE
NEAR_DUPLICATE_DHASH_CANDIDATE -> DETECTED_DUPLICATE
OWNER_MARKED_PROTECTED         -> PROTECTED_MEDIA
(evaluateCandidate allowed)    -> CLEANUP_CANDIDATE
USER_CONFIRMED_DELETE          -> TRASHED
OWNER_RESTORE                  -> RESTORED
USER_CONFIRMED_DELETE          -> PERMANENTLY_DELETED
```

`confirmedBy` is now its own audit field on `TRASHED` and
`PERMANENTLY_DELETED` records (previously interpolated into the reason
string as `CONFIRMED_BY:<name>` — moved out so `reason` stays a fixed enum
value and the confirming identity is independently queryable).

## Gate 2 — Files Delivered (unchanged set, two files modified)

| File | Change |
|---|---|
| `core/modules/media/dedup/cozy-media-deduplication.js` | Vocabulary patch + `PROTECTED_MEDIA` branch. |
| `core/modules/media/dedup/cozy-media-cleanup.js` | Vocabulary patch + `CLEANUP_CANDIDATE` audit step + `PROTECTED_MEDIA` hard block. |
| `core/modules/media/dedup/test/cozy-media-deduplication.test.js` | 18 real, executed tests (16 original, renamed, + 2 new for `PROTECTED_MEDIA`). |
| `core/modules/media/dedup/test/cozy-media-cleanup.test.js` | 14 real, executed tests (12 original, renamed, + 2 new for `CLEANUP_CANDIDATE` ordering and `PROTECTED_MEDIA` block). |
| `tools/termux/cozy-media-pack.js` | Unchanged this milestone. |
| `tools/termux/tests/cozy-media-pack.test.js` | Unchanged this milestone. |

## Real Test Results — this milestone

- **Detection engine — 18/18 passed** (`node core/modules/media/dedup/test/cozy-media-deduplication.test.js`).
- **Cleanup engine — 14/14 passed** (`node core/modules/media/dedup/test/cozy-media-cleanup.test.js`).

## Explicitly NOT run / NOT claimed this milestone

- **Termux/SD suite.** `tools/termux/cozy-media-pack.js` requires
  `./cozy-pack.js`, which belongs to `COS-LANG-PM-001-IMPLEMENTED`, not to
  this package. It is genuinely absent from the P8-CERTIFIED baseline this
  milestone was built against. Per direction: **do not copy `cozy-pack.js`
  into this milestone to make the test pass.** The Termux suite remains
  unexecuted here — not stubbed, not faked, not reported as passing.
- **ChurchOS regression, WholesaleOS regression, existing RP-035/language
  regression.** Not run — neither application nor the LANG-PM-001 package
  is present in the supplied baseline.
- **Physical Realme phone + SD card run.** `NOT_TESTED_ON_DEVICE`.
- **Real browser Canvas image decoding.** Still only exercised via the
  injected synthetic decoder, as in the prior milestone.

## Required composition order for the next Builder

```
P8-CERTIFIED
      |
      v
Phase 1
      |
      v
Phase 2 Part 1
      |
      v
COS-LANG-PM-001
      |
      v
Media Dedup/Cleanup  (this package, composing against the real cozy-pack.js)
```

Once COS-LANG-PM-001 is layered in as a real dependency (not copied), the
next Builder runs the Termux/SD suite against that real composition, then
the ChurchOS/WholesaleOS/language regressions, then the physical device
gate. Only after all of those pass does this become TESTED, and only after
that, CERTIFIED.

## Chain

```
IMPLEMENTED (v1.0.0) -> NAMING PATCH (v1.0.1, this milestone) -> TESTED -> CERTIFIED
```

Vocabulary and behavior are now aligned. TESTED and CERTIFIED remain
unclaimed pending the gates listed above.
