# M372 — Layer 2 Understanding Engine — Certification Report

**Repository Name:** CozyOS (main)
**Repository Version:** Not declared in a canonical version file — ZIP filename fallback: `CozyOS-main-M372-BuilderIntegration`
**Repository Commit/Tag:** Not Available
**Continuation Document ID:** CD-2026-08-05-M372
**Current Milestone:** M372 — Layer 2: Understanding Engine
**Repository Verification Level:** Repository Verified (uploaded ZIP inspected directly, not reasoned from a continuation document)

---

## 1. Conflict Review (held before Implementation, per Milestone Workflow Step 3)

The incoming instruction directed extending `understanding-engine.js` directly. This was checked against the already-closed `reports/layer2-compose-analysis-AA-001.md`, which had recommended a new composing module to preserve the file's existing responsibility boundary. The conflict was surfaced to the user before any code was written; the user's follow-up instruction ("Decision 1 — Preserve Architecture… Decision 2 — Extend Through Composition") resolved it explicitly: `understanding-engine.js` gains only the minimum new public interface Layer 2 needs; all cross-file reasoning lives in a new, separate file. Implementation proceeded only after this was confirmed.

A second conflict — "no placeholder code" vs. 8 of the 13 originally-specified graphs having no extractable signal anywhere in the verified workspace — was also surfaced and resolved by the user's Decision 3/4/5: build only the 5 graphs with real signal now; record the rest as a planning entry (AA-002), not as placeholder implementations.

## 2. Ownership Review

- `understanding-engine.js` remains the sole owner of per-file/per-input structural extraction. No responsibility moved out of it; three new additive fields (`exportedAs`, `dependsOnGlobals`, `eventsListened`) were added to its existing `analyzeCode()` output — the same class of fact (regex-extracted, per-file, non-executing) it already produced.
- `layer2-graph-composer.js` is a new file and a new owner: cross-file, repository-wide graph aggregation. It does not own, duplicate, or shadow any responsibility already owned by `understanding-engine.js`, `ownership-scanner.js`, or `observation-engine.js`.
- No duplicate engines, coordinators, or parsers were created. `OwnershipScanner.scanGlobalExport("Layer2GraphComposer")`-equivalent check: confirmed no prior export of that name exists anywhere in the inspected repository.

## 3. Dependency Review

- `layer2-graph-composer.js` hard-depends on `UnderstandingEngine.analyzeRepository()` (throws a clear, honest `available:false` result if absent — never fabricates per-file facts itself).
- Soft-depends on `OwnershipScanner.scan()` (Ownership Graph honestly reports unavailable if neither this nor a manifest is present).
- Soft-depends on a `BuilderObservation` manifest, if the caller supplies one, to avoid re-scanning ownership data BuilderObservation's own `observe()` already computed.
- `dashboard.html` load order: `ownership-scanner.js` → `understanding-engine.js` → `observation-engine.js` → `layer2-graph-composer.js` → `builder-orchestrator.js`. Verified by direct inspection of the one line added.

## 4. Integration Review

- One line added to `dashboard.html` (a `<script>` tag plus a 6-line explanatory HTML comment). No other line in `dashboard.html` was touched.
- `understanding-engine.js`: header updated (version bump + note), `ENGINE_VERSION` constant updated, `analyzeCode()` extended with 3 new fields, coordinator-registration description string updated to stay accurate. No existing field, method, or return shape removed or altered.
- `layer2-graph-composer.js`: new file, self-contained, follows the same IIFE / version-conflict-guard / `registerCoordinator`-with-retry pattern as every other Builder engine in this repository.

## 5. Runtime Review / Verification performed

| Level | Result |
|---|---|
| **Static (`node --check`)** | Pass — both `understanding-engine.js` and `layer2-graph-composer.js` |
| **Node-Level Runtime** | Pass — loaded both files (plus `ownership-scanner.js`, `observation-engine.js`) in a real Node `vm` context and exercised them against real repository files, not synthetic stubs: |
| | • `core/modules/builder/*.js` (17 files): 17 module nodes, 61 dependency edges (22 resolved / 39 unresolved-but-disclosed), 0 cycles, 230 API methods, 22 events |
| | • Full repository (483 `.js` files walked): 296 module nodes, 1,410 dependency edges (614 resolved / 796 unresolved-but-disclosed), **19 real circular-dependency chains detected** (e.g. `cozy-ai-mode.js` ↔ `builder-ai.js`), 3,960 API methods, 576 cross-referenced events, 291 ownership checks |
| | • Synthetic 2-file circular-dependency case, to confirm cycle detection actually fires (it did: `["a.js","b.js","a.js"]`) |
| | • `BuilderObservation.observe()` manifest-reuse path for the Ownership Graph — confirmed it reuses the manifest's existing collision data (288 checked) instead of re-scanning, as designed |
| | • Regression check: a direct post-change `analyzeCode()` call still returns all 7 pre-existing keys plus the 3 new ones; syntax-error/duplicate-engine counts from `observe()` are consistent with pre-existing, undisclosed-by-this-milestone baseline noise, not a new regression |
| **Browser Runtime** | **Not performed.** No browser is available in this sandbox. This is disclosed, not assumed passing. |

## 6. Verdict

**Statically Verified / Node-Level Runtime Verified — Awaiting Browser Runtime Verification.**

Not "Production Certified" — that requires real browser interaction, which this environment cannot perform. Nothing above should be read as claiming otherwise.

## 7. Known, disclosed limitations of the M372 delivery

- Dependency Graph edges are raw `window.CozyOS.<Name>` references, not confirmed hard/optional/required dependencies — that distinction has no source-level signal today.
- Two pre-existing, non-introduced regex false positives in `analyzeCode()`'s `class\s+([A-Za-z0-9_$]+)` matcher produced `className: "of"` and `className: "instances"` on 2 files repo-wide during the full-repository test run — inherited quirk, out of this milestone's scope (Change Scope Rule).
- 8 of the original 13 Layer 2 graph types are not implemented — see AA-002 for the full per-graph reason and recommended build order. Not fabricated; not attempted.
- `Layer2GraphComposer` was only wired into `dashboard.html`, not `core/modules/developer/developer-hub.html` (which loads only `understanding-engine.js` and none of the rest of the Builder pipeline) — an intentional, minimal-scope decision, not an oversight.
