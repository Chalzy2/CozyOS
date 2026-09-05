# RP-035 COS-LANG-PM-001 — Implementation Report
**SD-Backed Memory and Portable Language-Pack Storage**
Lifecycle: **COS-LANG-PM-001-IMPLEMENTED** (not TESTED, not CERTIFIED — see gates below)

## Baseline chain used

| Artifact | SHA-256 | Verified |
|---|---|---|
| `COS-RP035-WOS2-P8-CERTIFIED.zip` | `2316526cc612fd2bca874d7611b822906b22bbe144a62cabf3047a44176a5505` | 2× match, `unzip -t` clean, 981 files / 228 dirs |
| `RP035-Phase2-Part1-recovery.zip` | `544c600e414084c30ae356a8196c331260825b2908994ae2b92f1db53944cadb` | 2× match, `unzip -t` clean, 7 files |

Merged pristine baseline: **986 files** (981 + 7 − 2 overlaps: `HANDOFF.md`,
`cozy-language-pack-registry.js`). Snapshotted by per-file SHA-256 before any
new work began.

## What was read before writing any code (Rule 0 / Rule 29)

`HANDOFF.md`, `core/storage.js`, `core/modules/intelligence/language-packs/
cozy-language-pack-registry.js` (identities, states, `submitExpression`,
`listExpressions`), `cozy-language-pack-persistence.js`,
`cozy-language-knowledge-model.js`, `core/engines/files/
universal-file-engine.js`, `core/modules/intelligence/privacy/
cozy-intelligence-privacy.js` (`canExport`), and the existing test-file
conventions (`assert`-based, `node file.test.js` runnable, no framework).

## Files added (delta only — 986 → 994, 8 new files, 0 removed)

```
core/modules/intelligence/language-packs/storage/cozy-storage-provider.js
core/modules/intelligence/language-packs/storage/cozy-language-pack-format.js
core/modules/intelligence/language-packs/storage/cozy-language-pack-export-import.js
core/modules/intelligence/language-packs/storage/tests/cozy-storage-provider.test.js
core/modules/intelligence/language-packs/storage/tests/cozy-language-pack-format.test.js
core/modules/intelligence/language-packs/storage/tests/cozy-language-pack-export-import.test.js
tools/termux/cozy-pack.js
tools/termux/tests/cozy-pack.test.js
docs/architecture/ADR-COS-LANG-PM-001-Storage.md
docs/history/RP-035-COS-LANG-PM-001-Implementation-Report.md
docs/history/RP-035-COS-LANG-PM-001-Verification-Report.md
HANDOFF.md (modified — new entry prepended, no existing content removed)
```

No file inside the certified P8 baseline or the Phase 2 Part 1 delta was
altered except the explicit `HANDOFF.md` prepend.

## What is genuinely done

- **Storage capability abstraction** (`cozy-storage-provider.js`): four
  provider slots, each reporting one of `AVAILABLE / UNAVAILABLE /
  PERMISSION_REQUIRED / NOT_IMPLEMENTED / UNKNOWN` — never a guessed value.
  `SD_CARD_DIRECT` is permanently `UNAVAILABLE` from the browser/PWA; this
  was confirmed by reading `universal-file-engine.js`'s own runtime
  capability check, not assumed.
- **Manifest format + SHA-256 integrity** (`cozy-language-pack-format.js`):
  isomorphic (browser `crypto.subtle` / Node `crypto`), shared by both the
  in-app path and the Termux tool via the same file. Verified against
  Node's own `crypto` module as the reference implementation in tests, not
  a hand-typed "known vector."
- **Export/import** (`cozy-language-pack-export-import.js`): composes the
  real registry (read-only) and the real privacy engine. Fails closed on
  unclassified records.
- **Termux CLI** (`tools/termux/cozy-pack.js`): real `fs`/`crypto`
  operations, shells out to real `zip`/`unzip`/`df`. Full export → verify →
  import round trip executed successfully in this sandbox using real
  binaries, including a genuine tamper-detection case.

## Known limitations (not silently worked around)

1. **`privacyTier` gap.** `cozy-language-pack-registry.js`'s
   `submitExpression()` does not stamp a `privacyTier` on records today.
   Export therefore fails closed and excludes essentially all real registry
   data until a future RP-029/034 reconciliation milestone adds real
   classification. Confirmed by an executed test
   (`gatherExportableRecords excludes ALL records when none carry a
   privacyTier`), not a hypothetical.
2. **Physical SD test — `NOT_TESTED_ON_DEVICE`.** This session has no
   access to the user's actual Realme phone or SD card. The export → verify
   → import mechanism was fully executed against a real filesystem (temp
   directories standing in for the SD root) with real `zip`/`unzip`/
   `crypto`, but the literal "Phone A → SD → remove → Phone B → import"
   physical test described in the milestone (Part 21) has not been run on
   the actual device. `APPLICATION_SD_ACCESS = NOT_AVAILABLE` from the
   in-app context is confirmed; the Termux procedure that would perform the
   real operation is documented in `tools/termux/cozy-pack.js`'s header but
   not yet exercised on-device.
3. **ANDROID_NATIVE_BRIDGE** has no real implementation (none exists in the
   repository — confirmed by search) and reports `NOT_IMPLEMENTED`
   everywhere; this is a real absence, not a placeholder pretending to be a
   feature.
4. **ChurchOS / WholesaleOS regression** was not run this session — only
   the language-pack-adjacent suites were exercised. Flagged as `NOT
   TESTED` per the milestone's own classification scheme, not silently
   assumed passing.
5. Import's duplicate-vs-conflict merge logic
   (`skippedWeakerEvidence` path in `commitImport`) currently just retains
   the existing record rather than implementing full RP-035 Part 10/11
   version-lineage/rollback semantics — real versioning/rollback is a
   documented future milestone, not implemented here.

## Test results (all executed, not asserted)

| Suite | Result |
|---|---|
| `cozy-language-pack-format.test.js` (new) | 15/15 passed |
| `cozy-storage-provider.test.js` (new) | 10/10 passed |
| `cozy-language-pack-export-import.test.js` (new) | 9/9 passed |
| `tools/termux/tests/cozy-pack.test.js` (new) | 8/8 passed |
| `cozy-language-pack-registry.test.js` (Phase 1, regression) | pass (unchanged) |
| `cozy-language-pack-persistence.test.js` (Phase 2 Part 1, regression) | pass (unchanged) |
| `cozy-language-knowledge-model.test.js` (Phase 2 Part 1, regression) | pass (unchanged) |
| `cozy-admin-language-dashboard-ui-browser.test.js` | 1 passed / 12 failed — **PRE-EXISTING**, confirmed identical against the untouched baseline copy, not caused by this milestone |
| ChurchOS regression | **NOT TESTED** this session |
| WholesaleOS regression | **NOT TESTED** this session |

**42/42 new tests passed. Zero new regressions introduced** (the one
failing suite fails identically before and after this milestone's changes).

## What remains for COS-LANG-PM-001-TESTED

- Fresh-extraction test of the packaged delta ZIP (file count, `unzip -t`,
  running the new test suites from the extracted copy rather than the
  working tree).
- Run ChurchOS and WholesaleOS regression suites.

## What remains for COS-LANG-PM-001-CERTIFIED

- Whatever this repository's formal certification gate requires beyond
  TESTED (not independently re-derived here — the existing certification
  procedure should be followed, not assumed).
- Real on-device SD test (Realme phone + Termux), replacing the
  `NOT_TESTED_ON_DEVICE` status with an actual recorded result.
- Closing the `privacyTier` gap so export/import has real data to move.
