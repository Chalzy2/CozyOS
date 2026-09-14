# CozyOS — M373 Layer 3 Continuation Document

**Continuation Document ID:** CD-2026-08-05-M373
**Milestone:** M373 — Layer 3 Analysis Engine
**Status:** Complete — Statically Verified / Node-Level Runtime Verified, Browser Runtime Verification not yet performed.

---

## START HERE — first actions the next session must perform

1. Upload the latest repository (or confirm no changes since this milestone's ZIP) before writing any new code — Rule 0/00.
2. Read `docs/builder/reports/m373-layer3-certification.md` in full before touching `analysis-engine.js` again.
3. Read `docs/builder/knowledge/architecture-ambiguity-registry.md` AA-003 before starting any Tier C capability — it names the exact missing signal and recommended order per capability.
4. Re-run the Node-level runtime harness (reconstructable from the certification report §4, or re-derive: `vm.runInThisContext` `understanding-engine.js` → `layer2-graph-composer.js` → `analysis-engine.js` against real repo files, call `AnalysisEngine.analyze(files)`) before assuming this milestone's code still behaves as certified.
5. Do not open a Repair Layer (Layer 4) without a fresh Conflict/Ownership Review — `analysis-engine.js`'s own header and Decision 4 both establish it never repairs, and no repair-capable engine currently exists for Builder findings.

## 1. What changed this milestone

See certification report §2 for the full file table (same content, not duplicated here).

## 2. Ideas added

- The Tier A / Tier B / Tier C split itself, and the discipline that Tier A must derive 100% from Layer 2's already-composed graphs (zero new parsing), while Tier B is the only place new, narrowly-scoped raw-text regex extraction is authorized.
- `findingId` prefixing by findingType family (`DUP-`, `CYC-`, `VER-`, `EVT-`, `IFC-`, `LRG-`, `SEC-`, `LEAK-`) for at-a-glance triage without opening the record.
- The "Insufficient Signal" naming convention for AA-003, distinguishing an evidentiary gap from an architectural gap (AA-001/AA-002 pattern) — worth reusing for any future *-003-style record across other registries.

## 3. Remaining / blocked (Tier C — see AA-003 for full detail)

| Item | Registry record | Blocked on |
|---|---|---|
| Signature-level API inconsistencies | AA-003 | Extending `understanding-engine.js#analyzeCode()`'s method regex to capture parameter lists — cheapest, no new engine class needed |
| Deep architecture violations | AA-003 | A human-authored, codified architecture policy document — not a code gap |
| Deep plugin compatibility | AA-003 | Upstream on AA-002's Plugin Relationship Graph |
| Offline synchronization risk | AA-003 | Upstream on AA-002's Synchronization Flow Graph (shared call-graph engine) |
| Dead/unreachable code | AA-003 | A new control-flow/reachability engine — genuinely new build, conflicts with this codebase's non-execution analysis discipline unless done via static CFG only |
| Runtime performance bottlenecks | AA-003 | Real browser/device measurement — not a sandbox-solvable gap at all |
| Browser Runtime Verification of M373's own delivery | This document | Real browser (sandbox has neither) |

## 4. Resume state

**Resume file(s):** `core/modules/builder/analysis-engine.js` (to add a Tier C capability once its upstream signal exists) or `docs/builder/knowledge/architecture-ambiguity-registry.md` AA-003 (to pick the next capability and its extraction engine).
**Resume task:** Per AA-003's recommended order — build Signature-level API inconsistencies first (cheapest), then the two AA-002-blocked items once their graphs land, then the harder two.
**Reason still open:** Genuinely no signal exists yet for any of the six — an extraction-capability gap, not a supply gap.

---

**Full evidence trail:** `node --check` output, the Node-level runtime harness output (synthetic 2-file injected-defect run and 484-file real-repository run), reproducible from this session's tool history.
