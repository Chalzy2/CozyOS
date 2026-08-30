# Merge Note — 10B + 10C1 + 10C2 + 10C2B → COS-REPO-MERGED-PHASE10C2B

## Inputs
- COS-REPO-MERGED-PHASE10B.zip — base tree (full repository)
- COS-REPO-PHASE10C1-CHECKPOINT.zip — audit only, no code changes (report-only checkpoint)
- COS-REPO-PHASE10C2-CHECKPOINT.zip — added a diagnostic test proving a bug; later retired
- COS-REPO-PHASE10C2B-CHECKPOINT.zip — the actual fix + permanent regression suite

## Merge logic (derived from the checkpoints' own reports, not assumed)
1. Started from the full 10B tree.
2. Phase 10C1 contributed no file changes (it's a read-only provider-capability audit).
3. Phase 10C2's diagnostic test (`phase10c2-diagnostic-sync-only-contract.test.js`) was
   **not** carried into the final tree. Per PHASE10C2B-IMPLEMENTATION-REPORT.md, that test
   was explicitly built as evidence of the pre-fix bug; once the bug was fixed, 4 of its
   5 assertions fail by design, and it is explicitly superseded and retired.
4. Phase 10C2B overlaid onto the base:
   - `core/modules/cognitive/cognitive-coordinator.js` (now awaits its 3 internal stage calls)
   - `core/modules/reasoning/cozy-reasoning.js`
   - `core/modules/thinking/cozy-thinking.js`
   - `core/modules/interpretation/cozy-interpretation.js`
   - new file: `core/modules/cognitive/tests/phase10c2b-async-provider-boundary.test.js` (22 tests)

## Verification performed this session
- Overlaid file hashes checked byte-for-byte against `PHASE10C2B-SHA256-MANIFEST.txt` — all 5 match exactly.
- `core/modules/intelligence/cozy-ai.js` and `core/modules/builder/builder-orchestrator.js` hashes
  checked against `PHASE10C2B-PROTECTED-FILE-HASHES.txt` and against the 10B originals — unchanged, confirming
  10C2B touched nothing outside its declared 4-file + 1-new-test scope.
- Re-ran both cognitive test suites directly against the merged tree with `node <file>.test.js`:
  - `phase10b-shared-cognitive-integration.test.js` → 16/16 passing
  - `phase10c2b-async-provider-boundary.test.js` → 22/22 passing

## Open naming question
The four source checkpoints are labeled Phase 10B / 10C1 / 10C2 / 10C2B, and the prior merged
baseline followed the pattern `COS-REPO-MERGED-PHASE10B.zip`. This output is named
`COS-REPO-MERGED-PHASE10C2B.zip` to match that convention. The request referred to this as
"Phase 8C" — if that's an intentional label from your own tracking system, let me know and I'll
rename the archive; nothing in the uploaded checkpoints refers to a "Phase 8C".

## Per the 10C2B report, the next phase in this project's own sequence is:
**Phase 10C-3 — Real Provider Integration**
