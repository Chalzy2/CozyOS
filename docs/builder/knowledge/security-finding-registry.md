# Cozy Builder — Security Finding Registry (SF)

Migrated from the M372 observation pass (`observations/M372/00-observation-report.md`
§9) into structured records. All 4 below are pre-existing per the
workspace's own `BASELINE.md` — re-confirmed present via `node --check`
during the M372 pass, not newly introduced by any Builder pass.

---

## SF-001 — `modules/quarry/quarry-contants.js:341` — syntax error

**Status:** Closed (M373 session work, recorded M374). Root cause was duplicate content, not a typo. `node --check` PASS + runtime smoke test PASS. Full detail: `repair-history-registry.md` RP-001.

## SF-002 — `core/ai/cozy-ai-memory.js:13` — syntax error

**Status:** Closed via reconstruction (M373 session work, recorded M374). Was incomplete source (missing class/constructor), not a syntax typo — confirmed identical across all 12 available milestone snapshots, M173–M373. `node --check` PASS + runtime smoke test PASS on all public methods. Reconstruction confidence: Medium-High. Full detail: `repair-history-registry.md` RP-002.

## SF-003 — `core/connectivity/compression.js:83` — syntax error

**Status:** Closed via reconstruction (M373 session work, recorded M374). Same incomplete-source pattern as SF-002. `node --check` PASS + runtime smoke test PASS. Reconstruction confidence: Medium — `codecIdentifier` and `ESTIMATED_SAVINGS_RATIO` are inferred placeholders, not recovered values. Full detail: `repair-history-registry.md` RP-002.

## SF-004 — `core/connectivity/bandwidth.js:128` — syntax error

**Status:** Closed via reconstruction (M373 session work, recorded M374), **but flagged for engineering review** — `_immutableHeaderKeys` was reconstructed empty (no recoverable source anywhere), meaning no fields are currently protected from CRITICAL_LOW payload shedding. `node --check` PASS + runtime smoke test PASS, but this is the lowest-confidence reconstruction of the four SF records. Full detail: `repair-history-registry.md` RP-002.

---

**Resolution note (all 4):** Confirmed via the real Main Production ZIP, repaired, and runtime-verified this session — not merely reclassified. Two distinct root causes: SF-001 was duplicate content (mechanical, high confidence); SF-002–004 were incomplete source with no recoverable original anywhere in 12 milestone snapshots (structural reconstruction, partial confidence, SF-004 requires human review before production reliance).
