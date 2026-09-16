# M376 — Builder Evidence Engine — Verification Report

**Scope:** `core/modules/builder/evidence-engine.js` (new file) and the
one-line `dashboard.html` script-tag addition. No other file modified.

All checks below were actually run this session; none are asserted
from memory or copied forward from a prior milestone's report.

---

## 1. Static — `node --check`

```
$ node --check core/modules/builder/evidence-engine.js
(no output — PASS)
```
**Result: PASS**

## 2. Repository Sweep — full-tree syntax scan

Ran `node --check` against every `.js` file in the repository (488
real files, after correcting for one pre-existing malformed filename
containing spaces — `core/bridge/test/media integration test.js`,
already disclosed in `BASELINE.md` as one of "3 malformed filenames,
pre-existing" — which a naive `find | xargs` word-splits into three
bogus non-existent paths; checked individually with proper quoting and
confirmed to pass).

```
Total JS files checked: 488
Real failures: 0
```
**Result: PASS.** Matches the repository's existing zero-syntax-error
baseline (all 4 originally-known syntax errors were closed under
RP-001/RP-002; this pass introduces no new one).

## 3. Duplicate Global Detection

```
$ grep -rn "window.CozyOS.BuilderEvidence\s*=" --include="*.js" .
./core/modules/builder/evidence-engine.js:<the one assignment>
```
Exactly one assignment site. No second `BuilderEvidence` global exists
anywhere in the repository.

## 4. Load-Order Verification

`dashboard.html` diff confirmed as the only change to that file:
one `<script src="core/modules/builder/evidence-engine.js">` tag,
inserted after `learning-engine.js` and before
`builder-orchestrator.js` — matching the exact insertion point
verified in the M376 compose report §2/§8 (real line numbers read
from the file, not assumed).

## 5. Regression Verification

- No existing file's content was altered except the single
  `dashboard.html` line addition described above.
- `core/modules/builder/learning-engine.js` (Layer 4, M375) — re-read,
  byte-for-byte untouched.
- All 8 knowledge registries under `docs/builder/knowledge/` — read
  only, never written to.
- No new `docs/builder/handoffs/*.md` file was overwritten in place;
  `LATEST.md` is updated per Rule 54 as part of this milestone's own
  handoff filing (see `docs/builder/handoffs/M376.md`), the same
  update pattern every prior milestone has used.

**Result: PASS** — no regression found.

## 6. Diagnostics / Runtime Smoke Tests (Node, simulated `window`)

Four Node-based smoke test scripts were run against the real file,
using a `vm` context with a stubbed `window.CozyOS.BuilderLearning`
(the same isolation approach used for the M375 Layer 4 verification)
and a `fetch()` shim that reads the *real* files on disk from this
repository — so the registry counts below are genuine, not mocked
numbers.

### 6a. Primary smoke test (12 checks)

| # | Method called | Result |
|---|---|---|
| 1 | `getVersion()` | `1.0.0-ENTERPRISE` — PASS |
| 2 | `getRepairEvidence()` | `repairCount: 2` (real RP-001/RP-002) — PASS |
| 3 | `getRegressionEvidence()` | `regressionCount: 0` (real, RG registry empty) — PASS |
| 4 | `getRegistryHealth()` | RP:2, RG:0, SF:4 (4 closed), PF:1 (1 open), DC:3, MD:3, AA:3, DI:3 — all real counts, matched expected values — PASS |
| 5 | `getRepositoryKnowledge()` | Composes registry health + BuilderLearning knowledge summary correctly — PASS |
| 6 | `getLearningProgress()` | `currentTotalRegistryEntries: 19` (sum of all 8 registries, verified by hand: 2+0+4+1+3+3+3+3=19) — PASS |
| 7 | `getMilestoneHistory()` | `LATEST.md` → `M375.md` chain resolved and confirmed available; version-history table row count = 14 — PASS |
| 8 | `getPatternReadiness()` | `patternDetectionJustified: false`, `confidence: "Insufficient Evidence"` — correctly refuses to claim readiness given real counts below threshold — PASS |
| 9 | `getVerificationStatus()` | Integration flags correctly report `true` for the mocked `BuilderLearning`/Layer 1-3 — PASS |
| 10 | `getDiagnosticsReport()` | Real counters (`registryFetches: 34`, `fetchFailures: 0`) reported — PASS |
| 11 | `getEvidenceSummary()` | All 9 expected top-level keys present — PASS |
| 12 | Reload with identical version | No throw (correct idempotent-load behavior) — PASS |

**All 12 checks: PASS.**

### 6b. Version-guard conflict test

Simulated a pre-existing `window.CozyOS.BuilderEvidence` reporting a
different version (`0.9.0-STALE`), then re-ran the module source.

**Result:** threw `VERSION_CONFLICT` with the expected message —
**PASS**. Confirms the version guard (identical pattern to
BuilderLearning/M375) actually functions, not just present as
unreachable code — the specific defect class M375 found and fixed in
its own file was checked for here too.

### 6c. Fetch-failure / degraded-availability test

Simulated every registry fetch returning HTTP 404.

**Result:** `getRepairEvidence()` returned
`{ available: false, repairCount: null }` — never a fabricated
number. `getPatternReadiness()` returned
`patternDetectionJustified: false` with real zero-based counts, not a
crash and not an invented "insufficient data, assume ready" fallback.
**PASS** — confirms the Honest Capability Rule holds under real
failure conditions, not just the happy path.

## 7. Diagnostics Verification

`getDiagnosticsReport()` was called both before and after the smoke
sequence; `registryFetches`/`fetchFailures` counters incremented
correctly and matched the number of `fetch()` calls actually made
(verified by manual count against the test script's call sequence).

## 8. Evidence Verification

Every count reported in §6a above was independently cross-checked by
direct `grep -c "^## PREFIX-"` against the real registry files during
the compose phase (see M376 compose report §5) — the runtime smoke
test's live-fetched numbers match the compose-phase manual counts
exactly, for all 8 registries. No discrepancy found.

## 9. Browser Runtime Verification

**NOT VERIFIED.** No real browser was available in this session (same
limitation disclosed in the M375 verification report). The Node `vm`
smoke tests above exercise the module's real logic against real
on-disk files, but do not confirm `dashboard.html`'s actual script
load order executes without error in a real browser DOM, or that
`fetch()` behaves identically under the page's actual origin/protocol
(e.g. `file://` vs a served origin — `fetch()` of relative paths can
behave differently under `file://`, which is exactly why
`getRepairEvidence()`/etc. degrade to `available: false` rather than
throwing if that happens). Flagged as the top open item for the next
session, same as M375 left this open for M376.

---

## Summary

| Check | Result |
|---|---|
| Static (`node --check`) | PASS |
| Repository sweep (488 files) | PASS |
| Duplicate global detection | PASS |
| Load-order verification | PASS |
| Regression verification | PASS |
| Runtime smoke tests (Node, 12 checks) | PASS |
| Version-guard conflict test | PASS |
| Fetch-failure degradation test | PASS |
| Diagnostics verification | PASS |
| Evidence verification (cross-check) | PASS |
| Browser runtime | **NOT VERIFIED** (disclosed, not asserted) |
