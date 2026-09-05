# Merge Note — 10C2B (full) + 10C3A (delta) → COS-REPO-MERGED-PHASE10C3A

## Inputs
- `COS-REPO-MERGED-PHASE10C2B.zip` — full repository baseline (1580 entries, 1317 files)
  - Independently computed SHA-256: `5df2a4da54599a7db90eb3b682b704d9cb00f34caa3e1849a29d7664cfdc0ea3`
  - `unzip -t`: no errors detected
  - Confirmed FULL (not delta) by presence of `core/`, `applications/`, `docs/`,
    `server/`, `language-packs/`, `harness/`, `tools/`, and all files required for
    the Phase 10C-3B architecture audit
- `COS-RP0XX-PHASE10C3A-CHECKPOINT.zip` — delta checkpoint (14 entries)
  - Independently computed SHA-256: `db1c782916e6ab5ba58df473db047ffb8e4c5144cb9f852a668474a081a032b4`
  - `unzip -t`: no errors detected
  - This matches the SHA-256 the Phase 10C-3A implementation report itself declares,
    and that report in turn independently verified `COS-REPO-MERGED-PHASE10C2B.zip`
    against the same hash used above — the two checkpoints corroborate each other.

## Merge logic
1. Started from the full 10C2B tree (1317 files).
2. Overlaid the 4 code/test files from the 10C3A delta:
   - `core/modules/cognitive/cognitive-coordinator.js` (modified)
   - `core/modules/intelligence/providers/on-device-conversational-provider.js` (modified)
   - `core/modules/intelligence/providers/on-device-cognitive-adapter.js` (new)
   - `core/modules/cognitive/tests/phase10c3a-real-provider-integration.test.js` (new)
3. Result: 1319 files (2 net new).

## Verification performed this session
- All 4 overlaid files byte-verified against the delta's own
  `PHASE10C3A-SHA256-MANIFEST.txt` — all 4 match exactly (see command output this
  session; independent `sha256sum -c`, not trusted from the report alone).
- All 10 files the 10C3A report declares as protected (untouched) — `cozy-thinking.js`,
  `cozy-reasoning.js`, `cozy-interpretation.js`, `cozy-ai.js`, `builder-orchestrator.js`,
  `cozy-living-ai.js`, `ai-bootstrap.js`, `capability-governance-diagnosis.js`,
  `cozy-language-pack-registry.js`, `cozy-language-registry.js` — byte-verified against
  `PHASE10C3A-PROTECTED-FILE-HASHES.txt`. All 10 match exactly; none were altered by
  the overlay.
- Baseline test gate re-executed directly against the merged tree with `node <file>.test.js`:
  - `phase10b-shared-cognitive-integration.test.js` → **16/16 passing**
  - `phase10c2b-async-provider-boundary.test.js` → **22/22 passing**
  - `phase10c3a-real-provider-integration.test.js` → **11/11 passing**
  - `on-device-conversational-provider.test.js` → **8/8 passing**
- Broader regression sweep: every other `*.test.js` file in the repository (170 files)
  was also executed directly. 145 fully pass (3,430 individual tests). 18 files have
  real failures (163 individual failures) and 7 files fail to load at all. All 25 of
  these were spot-checked against the **untouched 10C2B baseline** (before this delta
  was applied) and reproduce identically there — confirmed pre-existing, unrelated to
  the 10C3A delta or this merge. Full breakdown in `PHASE10C3A-CHECKPOINT-TEST-RESULTS.md`.

## Reports relocated into the repository (new permanent artifact rule)
The following, previously delivered only inside the delta ZIP, now live at repo root
alongside the existing `PHASE10A-*` / `PHASE10B-*` files, matching that established
naming convention:
- `PHASE10C3A-IMPLEMENTATION-REPORT.md` (renamed from `IMPLEMENTATION-REPORT-PHASE10C3A.md`
  to match the repo's `PHASE<N>-IMPLEMENTATION-REPORT.md` pattern; content unchanged)
- `PHASE10C3A-DEPENDENCY-REPORT.md`
- `PHASE10C3A-PROTECTED-FILE-HASHES.txt`
- `PHASE10C3A-SHA256-MANIFEST.txt`

New reports produced this session:
- `MERGE-NOTE-PHASE10C3A-CHECKPOINT.md` (this file)
- `PHASE10C3A-CHECKPOINT-TEST-RESULTS.md` (full regression sweep results + pre-existing-defect findings)
- `PHASE10C3A-CHECKPOINT-SHA256-MANIFEST.txt` (full-tree manifest, not just changed files)

## Known pre-existing defects surfaced during the regression sweep (not caused by this merge)
See `PHASE10C3A-CHECKPOINT-TEST-RESULTS.md` for full detail. Summary:
- `camera-manager.test.js` exists as two identical copies (root of `core/engines/camera/`
  and `core/engines/camera/tests/`) — both broken by a doubled relative import path.
  Duplicate-file finding, relevant to the repository's own No-Duplicate-Systems rule.
- `scene-manager.test.js` — same doubled-import-path bug.
- `playback-engine.test.js` — dangling import to a non-existent `recording-engine.js`.
  Independently corroborated by `engine-bridge.test.js`'s own passing assertion, which
  documents this exact defect as "DISCOVERED DEFECT."
- `media-pipeline-manager.test.js` / `media-integration.test.js` — both fail on the same
  missing `core/engines/media/background-engine.js`.
- `ourcozy-live.test.js` — requires `core/modules/live/ourcozy-live.js`, which does not
  exist anywhere in the repository (likely orphaned after a rename/consolidation).
- `audio-manager.test.js` (15/15 fail) — `AudioManager` is missing `getCapabilities()`,
  `getPermissionState()`, `getHealth()`, `createListeningSession()`, `selectDevice()`,
  `registerInputAdapter()` relative to what its own test expects.
- `document-understanding.test.js` (22/22 fail) and `duplicate-detection.test.js` (24/24 fail).
- 10 `*-dashboard-browser.test.js` / `*-browser.test.js` files time out waiting for a
  rendered page in this environment's headless Chromium — flagged as
  `NOT EXECUTABLE IN CURRENT ENVIRONMENT`, not a code-level finding.

None of these touch Phase 10C-2B/10C-3A/10C-3B's subsystems (cognitive coordinator,
thinking/reasoning/interpretation, on-device provider). They are pre-existing and
out of this checkpoint's scope, logged here rather than silently fixed or ignored,
per this project's own no-silent-fix discipline.

## Next phase in sequence
**Phase 10C-3B — Real Provider Runtime Integration & End-to-End Verification**,
starting from this checkpoint's full repository ZIP (see below for hash).
