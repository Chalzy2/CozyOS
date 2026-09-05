# RP-035 — Language Intelligence — Phase 2, Part 1 Implementation Report

**Lifecycle stage reached: PHASE2-PART1-IMPLEMENTED** (pipeline proven
end-to-end in Node with a faked storage gateway; not browser-tested; not
CERTIFIED; 13 packs NOT populated — both deliberately out of scope per
Part 1's own stopping rule)

**Baseline:** `COS-RP035-WOS2-P8-CERTIFIED.zip`
SHA-256 `2316526cc612fd2bca874d7611b822906b22bbe144a62cabf3047a44176a5505`
— independently re-verified this session (hashed, `unzip -t` clean,
1208 files) before any work began.

**Layered on top of:** RP-035 Phase 1 (`PHASE1-IMPLEMENTED`), delivered as
`RP035-Phase1-deliverable.zip` in this same session lineage — its own
declared baseline hash matched, its own 2 new files + 2 tests (7+14=21
tests) re-verified passing against the real merged baseline before any
Phase 2 work began.

## Part 0 finding that shaped everything below

A full pre-audit (read, not assumed) found a real, already-wired teaching
pipeline already exists — RP-029-A/B/C + RP-030 + RP-031
(`cozy-teach-cozyai-routing-core.js` + `cozy-teach-cozyai-ui.js` +
`teach-cozyai-form.html`). It is safety-gated (mandatory content
classifier before any candidate is created), routes accepted
contributions into RP-030's canonical 13-language pack registry, and has
a live DOM form. RP-035 Phase 1's `cozy-language-knowledge-model.js`
`submitTeaching()` was a **second, weaker, undocumented entry point** —
it called `cozy-knowledge-community.js`'s `submitContribution()`
directly, bypassing the safety gate and never reaching the pack
registry at all. This was the central risk this Part 1 session closed.

Decision (confirmed by the person): RP-031 remains the **single**
teaching entry point. Phase 1's `TranslationRelationship` /
`CorrectionRecord` / `ConflictRecord` schemas become supporting schemas
underneath it, not a rival pipeline.

## What was actually built/changed this session

### 1. `core/modules/intelligence/language-packs/cozy-language-pack-registry.js` — **MODIFIED**

This is the first change to this file since RP-030 created it (Phase 1
and prior sessions only composed it, never edited it). The change is
narrow and additive-in-effect: nothing in the existing 32-test contract
changed, and all 32 pass unchanged.

Added:
- `bindExpressionStorage(adapter)` / `getExpressionStorageState()` —
  the same optional `{get,set,remove,list}` adapter shape
  `createStorageAdapter()` already used elsewhere in this file, now
  usable to write-through the previously pure-in-memory
  `expressionRecords` Map. Unbound by default (identical behavior to
  before this change).
- `persistExpressionBestEffort()` — internal, fire-and-forget write on
  every `CANDIDATE_CREATED` / `EVIDENCE_ADDED` outcome inside
  `submitExpression()`. `submitExpression()`'s own return contract is
  untouched (still fully synchronous) — persistence is a side effect
  layered on top, matching this file's own existing
  "queued/best-effort, never fabricate success" convention.
- `restoreExpressions(records)` — rehydrates `expressionRecords` /
  `matchIndex` / the `nextRecordId` counter from previously-persisted
  records. This is an explicit **replay**, not a new submission: it
  does not re-run the safety gate or ingestion, and does not
  double-count pack submitted/quarantined counters. Idempotent —
  records already in memory are skipped, never overwritten.
- `CONFIDENCE_FIELD_CLASSIFICATION` — a disclosure constant, not a new
  confidence system. Labels the per-field numeric confidence values
  `submitExpression()` already accepted from callers (unchanged from
  RP-030) as `CALLER_SUPPLIED_HEURISTIC_ESTIMATE`, explicitly distinct
  from the real, count-derived `evidenceBand()`. Nothing computes a new
  number; this only documents what already existed and forbids
  presenting it as a validated percentage.

Why this file had to change (rather than staying "locked"): no external
file can persist or restore private closure state
(`expressionRecords`/`matchIndex`) that the module itself never exposed
a write/restore hook for. `getExpression()`/`listExpressions()` are
read-only; `submitExpression()` always re-runs the full
safety-gate/ingestion/dedup pipeline, so it cannot be used to replay
already-accepted history without double-processing it. The gap was
disclosed in this file's own Phase-1-era comment ("A real storage
abstraction ... sits in front of this" — written before it was true).

### 2. `core/modules/intelligence/language-packs/cozy-language-pack-persistence.js` — **MODIFIED** (Phase 1's own file, safe to extend)

Added `initializePersistentExpressions(options)` — same
`ensureInitialized()` / `createRealBackend()` machinery Phase 1 already
built for pack identity/state, now pointed at the pre-existing
`dictionary` store (already reserved for `EXPRESSIONS` in Phase 1,
never a new store) and wired to the two new registry hooks above. Kept
fully separate from `initializePersistentRegistry()` so that function's
existing tested 7/7 contract is untouched.

### 3. `core/modules/intelligence/language-packs/cozy-language-knowledge-model.js` — **MODIFIED** (Phase 1's own file)

`submitTeaching()` no longer calls `CozyKnowledgeCommunity.submitContribution()`
directly. It now composes `CozyOS.CozyTeachCozyAIRouting.submitTeachingContribution()`
(RP-031) exclusively, and reports `CAPABILITY_UNAVAILABLE` — never a
fallback to the weaker path — if RP-031 is not loaded.

### 4. `core/modules/intelligence/language-packs/tests/cozy-language-knowledge-model.test.js` — **MODIFIED**

The two `submitTeaching` tests were rewritten for the new composition
target. The replacement test additionally asserts that a stray
`CozyKnowledgeCommunity.submitContribution` in the fake window is never
called (it throws if invoked) — proving the bypass is actually closed,
not just re-pointed by convention.

### 5. `core/modules/intelligence/language-packs/tests/cozy-rp035-phase2-teaching-pipeline.test.js` — **NEW**

The Part 1 stopping-rule proof, run against the real files (only
`core/storage.js`'s IndexedDB gateway is faked, same disclosed pattern
as Phase 1's persistence test) —

```
Human teaches (submitTeachingContribution)
  -> mandatory safety gate
  -> safety-gated draft submission (contribution-core)
  -> review/community pipeline
  -> RP-031 routes into the RP-035 canonical pack registry (submitExpression)
  -> Phase 2's new expression-persistence hook writes through to real storage
  -> SECOND, independent "app load" (fresh module instances) restores it
```

4/4 assertions pass:
1. A real, consented `sw` submission clears the safety gate, review, and
   reaches the registry as a genuine `expr-*` record under `languageId:
   "sw"`, `validationState: "CANDIDATE"`, `confidence.meaningConfidence:
   null` (no number invented).
2. A second, independent module load against the **same** underlying
   storage tables restores exactly that one record —
   `restoredFromStorage: 1` — and the record is genuinely present after
   reload. This is the literal proof the stopping rule asked for.
3. An unconsented submission never reaches the registry at all
   (`languagePackRouting` either absent or `NOT_ATTEMPTED`) — the safety
   gate is not bypassable through RP-031.
4. `cozy-language-knowledge-model.js`'s `submitTeaching()`, called
   through Phase 1's own API, produces the identical real pipeline
   result — confirming it is the same pipeline, not a second one.

## Test results (real, executed this session)

| Suite | Result |
|---|---|
| `cozy-language-pack-registry.test.js` (regression, now touched for the first time) | **32 passed, 0 failed** — identical to pre-change |
| `cozy-language-pack-persistence.test.js` (regression) | **7 passed, 0 failed** — identical to pre-change |
| `cozy-language-knowledge-model.test.js` (2 tests rewritten) | **14 passed, 0 failed** |
| `cozy-language-acquisition-pipeline.test.js` (regression) | **30 passed, 0 failed** |
| `cozy-african-language-intelligence.test.js` (regression) | **63 passed, 0 failed** |
| `cozy-rp035-optional-country-correction.test.js` (regression) | **24 passed, 0 failed** |
| **New:** `cozy-rp035-phase2-teaching-pipeline.test.js` | **4 passed, 0 failed** |
| **language-packs subsystem total** | **174/174** |

## Repository-wide sweep — partial, honestly reported

A full 92-file sweep was started but not completed within this session
(same documented time-budget constraint as Phase 1). What was observed
before the session ended:
- ChurchOS lineage (7 files spot-checked): clean (e.g.
  `church-live-moderation-controls.test.js` 31/31).
- WholesaleOS (5 files): **timeout** — pre-existing/environmental, same
  disclosed behavior as every prior WOS2 session in this repo's own
  history (see `HANDOFF.md`).
- A cluster of `*-browser.test.js` files across several subsystems
  (admin-language-dashboard, media, knowledge-review,
  knowledge-contribution, knowledge-quarantine-admin, teach-cozyai,
  camera-clarity, live-camera-capture, living-live-surface,
  live-connectivity): **timeout** under this session's short per-file
  budget — consistent with "browser" in their filename; not confirmed
  whether these hang for the same reason as WOS2 or a different one.
- `scene-manager.test.js`, `camera-manager.test.js` (two locations),
  `media-pipeline-manager.test.js`, `media-integration.test.js`:
  **fail with `ERR_MODULE_NOT_FOUND`** — these import paths look
  broken independent of anything touched this session (none of
  `core/engines/scene`, `core/engines/camera`, `core/engines/media`,
  `core/bridge` were read or modified this session), but this was
  **not verified against a fresh, untouched baseline extraction**
  before the session ended — flagged as unconfirmed, not claimed as
  pre-existing.
- `audio-manager.test.js`: **15 passed, 15 failed** —
  `AudioManager.registerInputAdapter is not a function` /
  `AudioManager.getCapabilities is not a function`. Same caveat: not
  yet confirmed pre-existing vs. session-caused.
- `engine-bridge.test.js`: 11 passed, 1 failed. Same caveat.

**None of the failing/timing-out files are anywhere in this session's
change list** (see "Files changed" below) — no import chain connects
`core/engines/*`, `core/bridge/*`, or the `*-browser.test.js` files to
`cozy-language-pack-registry.js`, `cozy-language-pack-persistence.js`,
or `cozy-language-knowledge-model.js`. This makes it very unlikely they
are caused by this session's work, but "very unlikely" is not the same
as verified — the next session should diff these specific files against
a fresh extraction of the `COS-RP035-WOS2-P8-CERTIFIED.zip` baseline
before relying on that assumption.

## Files changed (byte scope)

```
Modified:
  core/modules/intelligence/language-packs/cozy-language-pack-registry.js
  core/modules/intelligence/language-packs/cozy-language-pack-persistence.js
  core/modules/intelligence/language-packs/cozy-language-knowledge-model.js
  core/modules/intelligence/language-packs/tests/cozy-language-knowledge-model.test.js

Added:
  core/modules/intelligence/language-packs/tests/cozy-rp035-phase2-teaching-pipeline.test.js
  docs/history/RP-035-Phase2-Part1-Implementation-Report.md

Removed: (none)
```

No file outside `core/modules/intelligence/language-packs/` and
`docs/history/` was touched. RP-029/030/031 and every other composed
file remain byte-identical to the P8 baseline — this session only ever
composed their real public APIs, per the Part 0 audit's own governing
rule.

## Honest capability statements

- Persistence is still capability-gated, not guaranteed — identical
  discipline to Phase 1. `getExpressionStorageState()` /
  `initializePersistentExpressions()` only ever report `PERSISTENT`
  when a real gateway is present and actually succeeds; otherwise
  `IN_MEMORY_ONLY`, honestly.
- The Node test's storage gateway is a disclosed fake (no
  browser/IndexedDB in this environment) — same disclosed limitation as
  Phase 1. A real browser/IndexedDB integration test has still not been
  run.
- No confidence numbers were invented this session. The one place
  numeric confidence already existed (RP-030's caller-supplied
  per-field values) was labeled, not extended or duplicated.
- Corrections still never overwrite; conflicts still never
  auto-resolve — untouched Phase 1 behavior, re-verified by the
  unmodified subset of the 14 knowledge-model tests.

## Known limitations / explicitly deferred (per this session's own stopping rule)

- **13-pack population — not started, on purpose.** The stopping rule
  was "prove the pipeline for one real submission first." Only `sw`
  (plus one `en`-context example inside the same test) was used, and
  the code path exercised is not language-special-cased anywhere.
- **SD/USB/ZIP export-and-backup package
  (`CozyOS-Memory/manifest.json/...`) — not built.** This was requested
  as "the most important storage requirement" but explicitly placed
  after Part 1's own stopping rule ("first make the pipeline prove
  [...] Then we can use Kiswahili as the first real teaching pilot").
  Nothing in `core/storage.js` was read in enough depth this session to
  responsibly scope an export/backup manager — flagged as the
  recommended next specification step, not attempted.
- Repository-wide sweep incomplete (see above) — the engine-test
  failures found are very likely pre-existing and unrelated, but not
  yet confirmed against a fresh baseline diff.
- Real browser/IndexedDB integration test — still not run (documented
  Phase 1 limitation, unchanged).
- Permissions/RBAC enforcement for teach/review/approve/export actions —
  still not implemented (documented Phase 1 limitation, unchanged).
- No CERTIFIED claim is made. This report reaches
  `PHASE2-PART1-IMPLEMENTED` only.

## Recommended next step

1. Confirm the engine-test failures above are pre-existing (diff
   `core/engines/scene`, `core/engines/camera`, `core/engines/media`,
   `core/bridge` against a fresh `COS-RP035-WOS2-P8-CERTIFIED.zip`
   extraction) before doing anything else with them.
2. Kiswahili pilot: teach the real example sentences from the Phase 2
   brief through this now-proven pipeline (not hand-encoded), confirm
   each lands as `CANDIDATE` under `sw` with correct provenance, and
   observe (do not force) confidence/evidence-band movement as
   duplicate/independent submissions arrive.
3. Only after that: specify the SD/USB export-and-backup package as its
   own scoped piece of work, reading `core/storage.js` in full first.
4. Replicate the proven mechanism across the remaining 12 packs — no
   new per-language code, since nothing in this session's changes is
   `sw`-specific.
