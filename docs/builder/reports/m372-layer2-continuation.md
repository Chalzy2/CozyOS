# CozyOS — M372 Layer 2 Continuation Document

**Continuation Document ID:** CD-2026-08-05-M372
**Milestone:** M372 — Layer 2 Understanding Engine (Module/Dependency/API/Event/Ownership graphs)
**Status:** Complete — Statically Verified / Node-Level Runtime Verified, Browser Runtime Verification not yet performed (no browser in this sandbox)

---

## START HERE — first five actions the next session must perform

1. Upload the latest repository (or confirm no changes since this milestone's ZIP) before writing any new code — Rule 0/00.
2. Read `docs/builder/reports/m372-layer2-certification.md` in full before touching Layer 2 files again.
3. Read `docs/builder/knowledge/architecture-ambiguity-registry.md` AA-002 before starting any of the 8 remaining graph types — it names the exact missing signal and recommended order per graph.
4. Re-run the Node-level runtime harness (reconstructable from the certification report's §5, or re-derive: `vm.runInThisContext` the three builder files against real repo files, call `Layer2GraphComposer.buildGraphs()`) before assuming anything in this milestone still behaves as certified — no browser runtime check has ever been performed on this code.
5. If starting Startup Flow (AA-002's #1 recommended next graph): read `understanding-engine.js`'s own header note on `htmlEntrypoints` and `observation-engine.js`'s existing `orphanCandidates` logic first — both already parse `<script src>` references and should be composed, not re-implemented.

---

## 1. What changed this milestone

| File | Change |
|---|---|
| `core/modules/builder/understanding-engine.js` | v1.0.0 → v1.1.0-ENTERPRISE. Additive only: `analyzeCode()` gained `exportedAs`, `dependsOnGlobals`, `eventsListened`. |
| `core/modules/builder/layer2-graph-composer.js` | New file, v1.0.0-ENTERPRISE. Builds Module/Dependency/API/Event/Ownership graphs from the fields above plus `OwnershipScanner`. |
| `dashboard.html` | +8 lines (1 script tag + comment), 0 removed. |
| `docs/builder/knowledge/architecture-ambiguity-registry.md` | AA-002 appended. AA-001 untouched (already closed). |
| `docs/builder/CHANGELOG.md` | M372 entry appended. |
| `docs/builder/knowledge/module-inventory.csv` / `.json` | `understanding-engine.js` version bumped; `layer2-graph-composer.js` row added. |
| `docs/builder/reports/m372-layer2-certification.md`, `m372-layer2-continuation.md` | New — this milestone's required artifacts. |

## 2. Files NOT changed (deliberately, per Change Scope Rule)

`ownership-scanner.js`, `observation-engine.js`, `builder-orchestrator.js`, every other Builder file, `BASELINE.md` (a different milestone's artifact), `core/modules/developer/developer-hub.html`.

## 3. Ideas added

- `understanding-engine.js`'s three new fields, and the design reasoning for why they belong there (per-file structural facts) rather than in the composer (cross-file reasoning) — see the file's own header.
- The `window.CozyOS.<Name>` reference pattern, confirmed (via full-repo grep, not assumption) as this codebase's real internal-dependency idiom, since `require()`/`import` returned zero matches for internal wiring repo-wide.
- AA-002 and its 6-step recommended build order for the 8 remaining graphs.

## 4. Remaining / blocked

| Item | Registry record | Blocked on |
|---|---|---|
| Startup Flow Graph | AA-002 | New HTML-entrypoint script-order parser (not yet built) |
| Plugin Relationship Graph | AA-002 | New plugin-registration-pattern extractor |
| Service Relationship Graph | AA-002 | A live-runtime snapshot method on `ServiceRegistry` itself (outside this milestone's file scope) |
| Data Flow / Authentication Flow / Synchronization Flow Graphs | AA-002 | A shared call-graph engine (build once, reuse three times) |
| UI Hierarchy Graph | AA-002 | A markup-structure parser |
| Architecture Graph | AA-002 | Likely stays a human-reviewed synthesis rather than a direct extraction target |
| Browser Runtime Verification of M372's own delivery | This document, §5 above | Real browser (sandbox has neither) |
| Regex false-positive `className` matches (`"of"`, `"instances"`) | Noted in certification report §7 | Pre-existing, not this milestone's scope — would need its own Conflict/Ownership Review before touching `analyzeCode()`'s class-name regex |

## 5. Resume state

**Resume file(s):** `core/modules/builder/layer2-graph-composer.js` (to add a new graph type) or `docs/builder/knowledge/architecture-ambiguity-registry.md` AA-002 (to pick the next graph and its extraction engine).
**Resume task:** Build the next AA-002 graph's missing extraction engine first (composing it into `understanding-engine.js` or `observation-engine.js` if it's per-file, or a new sibling file if it's cross-file — same Conflict Review discipline this milestone used), then add the corresponding `buildXGraph()` method to `layer2-graph-composer.js`.
**Reason still open:** Genuinely no signal exists yet for any of the 8 — not a supply gap like MD-001/AA-001 were, an extraction-capability gap.

---

**Full evidence trail:** `node --check` output, the Node-level runtime harness output (17-file and 483-file repository runs, synthetic cycle test, manifest-reuse test), and a diff against the pre-M372 repository for every file listed in §1, all reproducible from this session's tool history.
