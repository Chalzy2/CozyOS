# CozyOS — M373 Layer 3 Analysis Engine — Certification Report

**Milestone:** M373 — Layer 3 Analysis Engine
**Baseline:** M372-Layer2 (verified ZIP)
**Status:** Statically Verified / Node-Level Runtime Verified. Browser Runtime Verification not performed (no browser in this sandbox — same disclosed limitation as M372).

---

## 1. Scope authorized (per M373 authorization, Decisions 1–6)

- **Decision 1:** No Registry Loader / parser / registry engine built. AA/MD/DC/DI/SF/PF/RG remain documentation artifacts.
- **Decision 2:** `AnalysisEngine` composes `window.CozyOS.CozyMemory`; findings persist under namespace `builder-analysis`; engine fully functions if CozyMemory is unavailable.
- **Decision 3 (Tiered Implementation):**
  - Tier A implemented — compose-only over `Layer2GraphComposer`'s existing verified signals.
  - Tier B implemented — minimal, deterministic, rule-based regex extraction over raw file text (security heuristics + static leak heuristics). No AI inference, no speculative findings.
  - Tier C not implemented — six capabilities logged as AA-003 ("Insufficient Signal", per the requested correction from "Missing Feature").
- **Decision 4:** `core/modules/builder/analysis-engine.js` created. Consumes Layer 1 + Layer 2. Analyzes only — never modifies production code, never repairs.
- **Decision 5:** Every finding carries findingId, findingType, severity, confidence, evidence, affectedModules, rootCause, recommendedRepair, compatibilityImpact, regressionRisk, suggestedRepairOrder. No finding emitted without supporting evidence.
- **Decision 6:** Validated below.

## 2. Files changed

| File | Change |
|---|---|
| `core/modules/builder/analysis-engine.js` | New, v1.0.0-ENTERPRISE. |
| `dashboard.html` | +4 lines (1 script tag + comment), 0 removed. |
| `docs/builder/knowledge/architecture-ambiguity-registry.md` | AA-003 appended. AA-001/AA-002 untouched. |
| `docs/builder/CHANGELOG.md` | M373 entry appended. |
| `docs/builder/knowledge/module-inventory.csv` / `.json` | `analysis-engine.js` row added. |
| `docs/builder/reports/m373-layer3-certification.md`, `m373-layer3-continuation.md` | New — this milestone's required artifacts. |

**Files NOT changed (Change Scope Rule):** `layer2-graph-composer.js`, `understanding-engine.js`, `observation-engine.js`, `ownership-scanner.js`, `builder-orchestrator.js`, every other Builder file, `BASELINE.md`.

## 3. Regression Audit

- **Syntax:** `node --check core/modules/builder/analysis-engine.js` — clean.
- **Dependency:** `analyze()` requires only `Layer2GraphComposer` (hard fail with an honest `{available:false, reason}` if absent, same pattern as Layer 2's own `UnderstandingEngine` guard); `CozyMemory` is optional and additive.
- **Duplicate:** No competing engine created — `analysis-engine.js` is the only Layer 3 file; it re-derives nothing Layer 1/2 already extract.
- **Wiring:** `dashboard.html` script tag added directly after `layer2-graph-composer.js`, before `builder-orchestrator.js`, matching the existing Layer 1→2→3 load order.
- **Validation:** see §4 below.

## 4. Node-level runtime verification

**Harness 1 — synthetic 2-file repository** with deliberately injected: duplicate `FooEngine` class across two files, a circular `a.js↔b.js` dependency, mismatched version headers (`1.0.0` vs `2.0.0`), an `eval(` call, an unsafe `.innerHTML =` assignment, and an unmatched `setInterval`.

Result: all six correctly detected — `duplicate-module-candidate`, `circular-dependency`, `version-compatibility-issue`, `security-heuristic:eval-call`, `security-heuristic:unsafe-innerhtml`, `static-leak-heuristic:unmatched-setinterval` — each with real evidence strings (file names, line numbers, cycle path, version strings). All 6 findings persisted to a mock `CozyMemory.saveMemory()` under `builder-analysis`.

**Harness 2 — full 484-file real repository** (this milestone's own ZIP, `vm.runInContext` against real `understanding-engine.js` → `layer2-graph-composer.js` → `analysis-engine.js`, no execution of any analyzed file's own code):

- Completed in ~456ms, zero thrown errors.
- 1,548 findings emitted and persisted: 1,412 Tier A (5 duplicate-module-candidate, 19 circular-dependency, 529 event-no-observed-consumer, 16 event-no-observed-producer, 796 broken-interface-candidate, 2 version-compatibility-issue, 45 large-complex-module), 136 Tier B (6 eval-call, 33 unsafe-innerhtml, 5 inline-event-handler, 4 function-constructor, 87 unmatched-addeventlistener, 1 unmatched-setinterval).
- These counts are raw findings, not triaged defects — per Decision 5/§7 below, every finding's own `confidence` and `recommendedRepair` fields disclose that human review is required before any is treated as confirmed. The high `broken-interface-candidate` and `event-no-observed-consumer` counts are expected at this stage: both graphs' own Layer 2 `verificationMethod` already discloses that references/events outside the analyzed file set will appear unresolved, not that they are actually broken.

## 5. Honest capability disclosure (Decision 3, Tier C)

`analysis-engine.js#listUnimplementedTier()` and AA-003 both name the same six deferred capabilities at runtime and in documentation: Dead/unreachable code, Deep architecture violations, Signature-level API inconsistencies, Runtime performance bottlenecks, Deep plugin compatibility, Offline synchronization risk. No finding of any of these types is fabricated anywhere in this milestone's code.

## 6. Walkthrough summary

- **Files examined:** `layer2-graph-composer.js` (full), `understanding-engine.js` (relevant sections — `analyzeCode()`, `analyzeRepository()`), `architecture-ambiguity-registry.md`, `security-finding-registry.md`, `performance-finding-registry.md`, `regression-registry.md`, `cozy-memory-engine.js` (`saveMemory()` signature), `dashboard.html` (script load order), `module-inventory.json`/`.csv`, `docs/builder/CHANGELOG.md`.
- **Paths traced:** Layer2GraphComposer's `moduleGraph`/`dependencyGraph`/`apiGraph`/`eventGraph` field shapes, traced end-to-end into each Tier A finding method to confirm every field consumed is a real, already-extracted signal (no re-parsing).
- **Defects found/fixed:** None found in Layer 1/2 during this pass (out of scope — Layer 3 analyzes, it does not audit Layer 1/2's own correctness). No repository defects were "fixed" by this milestone — Decision 4 forbids Layer 3 from repairing anything, and none was attempted.
- **Repository integrity:** Preserved. No duplicate engines introduced. No existing file's wiring, exports, or event order altered — the only existing-file edit is the 4-line additive `dashboard.html` script tag.
