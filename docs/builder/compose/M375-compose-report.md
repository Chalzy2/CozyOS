# M375 — Builder Learning Engine Expansion — Compose Analysis Report

```
Compose ID: M375
Repository: CozyOS (verified against CozyOS-M374-output.zip)
Milestone: Layer 4 — Builder Learning Engine (aggregator, first pass)
Status: PENDING APPROVAL
Implementation Ready: YES

Create:
- core/modules/builder/learning-engine.js

Modify:
- dashboard.html   (add one <script> tag loading learning-engine.js,
                     mirroring the existing Layer 1-3 loading pattern
                     at lines ~1010-1031 — verified, not assumed)

Reuse:
- observation-engine.js (window.CozyOS.BuilderObservation)
- understanding-engine.js (window.CozyOS.UnderstandingEngine)
- analysis-engine.js (window.CozyOS.AnalysisEngine)
- CozyMemory (read-only)
- Registry System (RP/RG/SF/PF/DC/MD/AA/DI — read-only)
- LearningEngine (leaning/) — read its getLearningStatus() only,
  never merged into; distinct domain, distinct global name

Do Not Build:
- Pattern Engine
- Recommendation Engine
- Confidence Engine

Reason:
Insufficient signal — only 2 repair records exist (RP-001, RP-002).
Same conclusion M374 already reached; unchanged by anything found
in this session's Gate 1 review.

Risk:
LOW — read-only aggregation, one new file, one new script tag, no
existing behavior touched, no storage duplicated.

Next Milestone:
M376 (revisit Pattern/Recommendation/Confidence once repair-record
count gives real signal)
```

Side finding (not actioned under this milestone, per Rule 24): the
existing `leaning/learning-engine.js` is not loaded from any HTML entry
point in this repository — it appears to be orphaned from the runtime.
Flagged for a future milestone, not fixed here.


**Filed:** M375, Phase 1 only (Repository Verification / Compose Analysis).
No code has been written. Per the Charter, implementation is gated
behind explicit approval of this report.

**Preceded by:** a Gate 1 Conflict Review of the brief's "M374 — Layer 4
Implementation" request against the real repository, which found that
milestone M374 already exists, completed, with a different and
narrower scope than the brief described. That review's conclusion —
reuse M374 as-is, open a new milestone for the remaining work, adopt
Rule 58 (Milestone Integrity) — is treated here as ratified and is not
re-litigated.

---

## 1. Purpose

Determine what a Builder Learning Engine should actually compose,
given (a) M374's real, completed scope, (b) the existing
`core/modules/leaning/learning-engine.js` `LearningEngine` coordinator,
and (c) the real public APIs of Layers 1–3 — before writing any new
file.

## 2. Existing Ownership Review

| Component | Owner found? | Notes |
|---|---|---|
| `window.CozyOS.LearningEngine` | ✅ `core/modules/leaning/learning-engine.js` | Real, narrower scope: orchestrates `UnderstandingEngine.submitCandidatePattern()` and reports `getLearningStatus()`. Owns no storage of its own. Directory name (`leaning/`) appears to be a typo of `learning/` — flagged, not corrected here (out of scope, no approval to rename). |
| `window.CozyOS.BuilderObservation` (Layer 1) | ✅ `core/modules/builder/observation-engine.js` | `getManifest`, `listManifests`, `compareManifests`, `exportManifestMarkdown`, `getDiagnosticsReport` |
| `window.CozyOS.UnderstandingEngine` (Layer 2) | ✅ `core/modules/builder/understanding-engine.js` | `listCandidatePatterns`, `getCandidatePattern`, `approveCandidatePattern`, `rejectCandidatePattern`, `analyzeRepository`, `detectRequirementGaps` |
| `window.CozyOS.AnalysisEngine` (Layer 3) | ✅ `core/modules/builder/analysis-engine.js` | `analyze()`, `listUnimplementedTier()`, `getDiagnosticsReport()`; findings persist to `CozyMemory` |
| `window.CozyOS.CozyMemory` | ✅ `core/modules/memory/cozy-memory-engine.js` | `saveMemory`/`readMemory`/`updateMemory`/`deleteMemory`/`listNamespaces` — real, namespaced |
| Registries (RP/RG/SF/PF/DC/MD/AA/DI) | ✅ `docs/builder/knowledge/*-registry.md` | Markdown registries, not JS APIs — read as documents |
| Builder Metrics | ✅ `docs/builder/metrics/M372-health-metrics.json`, `M373-engineering-metrics.json` | No M374/M375 metrics file yet |
| Handoffs | ✅ `docs/builder/handoffs/LATEST.md` → `M374.md` | Real pointer pattern, reusable verbatim |
| `core/modules/builder/builder-orchestrator.js` | ✅ | Prior art for "compose existing engines, never re-implement" — same discipline this milestone should follow |
| `core/modules/builder/learning-engine.js` (the brief's target path) | ❌ Missing | Confirmed via direct filesystem check — genuinely does not exist |
| `window.CozyOS.BuilderLearning` (the brief's target global) | ❌ Missing | Confirmed via repo-wide grep — zero references anywhere |

## 3. Composition Review

| Source | Reusable as-is | Notes |
|---|---|---|
| `LearningEngine` (`leaning/learning-engine.js`) | Partially | Different domain (code-gen candidate patterns), but its `getLearningStatus()` shape and version-guard pattern are directly reusable conventions |
| Layer 1 Observation | ✅ | Read manifests via `listManifests`/`getManifest`, never re-parse files |
| Layer 2 Understanding | ✅ | Read candidate patterns via `listCandidatePatterns`, never re-implement pattern storage |
| Layer 3 Analysis | ✅ | Read findings via `getDiagnosticsReport`, never re-run `analyze()` speculatively |
| CozyMemory | ✅ | Read-only composition for cross-referencing, per M374 compose report's own note that CozyMemory is "a separate domain" — not a place to write new engineering state |
| Registries (RP/RG/SF/PF/DC/MD/AA/DI) | ✅ | Read as documents; RP (`repair-history-registry.md`) now has 2 real entries from M374 |
| Builder Memory (`07-builder-memory.json`) | ✅ read / ⏸ write | Module-level nodes exist; repair-outcome nodes still don't (same gap M374 already identified — still unresolved, not this milestone's job to invent a schema for) |

## 4. Conflict Review

| Risk | Found? | Decision |
|---|---|---|
| Reopening M374 | Avoided | M374 stays immutable; this is M375 (Rule 58) |
| Duplicate `LearningEngine` global | Avoided | New engine must register under a distinctly-named global (e.g. `BuilderLearning`, not `LearningEngine`) and its header must explicitly cross-reference `leaning/learning-engine.js` so no future session confuses the two |
| Building deferred Pattern/Recommendation/Confidence logic anyway | Avoided | Nothing in this repository changes the signal count M374 already evaluated — still 2 repair records (RP-001, RP-002). Building a pattern detector on 2 data points is exactly the "structure invented ahead of evidence" the process exists to prevent. This remains **postponed**. |

## 5. Gap Analysis

- **Already exists, composable now:** Layers 1–3 read APIs, CozyMemory read API, all 8 registries, handoff mechanism, Builder Memory (read-only), the `LearningEngine` conventions to mirror (version guard, audit log, diagnostics report).
- **Genuinely missing:** a Builder-scoped learning coordinator (`BuilderLearning`) that aggregates the above into one status/report surface. This is the only real gap.
- **Still insufficient signal (do not build):** pattern detection, recommendation ranking, confidence scoring. Same conclusion as M374, unchanged by anything found this session.

## 6. Recommendation

Build a thin, read-only **aggregator** — `BuilderLearning` — that composes Layers 1–3, the registries, Builder Memory, Builder Metrics, and the handoff chain into a single `getLearningStatus()`/`getKnowledgeSummary()`-style report, exactly as the existing `LearningEngine` does for its own narrower domain. No new storage. No pattern/recommendation logic yet — expose a `getPatternReadiness()` method that honestly reports "2 of N records needed" rather than fabricating a recommendation, so the *next* milestone (once signal exists) has a real, evidenced trigger to build on instead of a guess.

## 7. Compose Decision Table

| Component | Decision | Reason |
|---|---|---|
| M374 (existing) | Reuse, untouched | Rule 58 |
| `LearningEngine` (`leaning/`) | Reuse via read of its `getLearningStatus()`, not merged into | Different domain; merging would be exactly the duplication the rules forbid |
| Layers 1–3 | Compose (read-only) | Real APIs confirmed above |
| CozyMemory | Compose (read-only) | Per M374's own note: not a write target for engineering state |
| Registries (8) | Compose (read-only) | Documents, read and summarized |
| Builder Memory | Compose (read-only) | Repair-outcome node schema still undecided — not this milestone's job |
| Pattern detection | Postpone | Same insufficient-signal reason as M374, still true |
| Recommendation engine | Postpone | Same reason |
| New global | Create — `window.CozyOS.BuilderLearning` | Genuinely missing; distinctly named from `LearningEngine` |
| New file | Create — `core/modules/builder/learning-engine.js` | Genuinely missing |

## 8. Evidence Index

Files directly read this session before any decision above:

- `core/modules/leaning/learning-engine.js` (full read)
- `core/modules/builder/observation-engine.js` (method signatures, grep)
- `core/modules/builder/understanding-engine.js` (method signatures, grep)
- `core/modules/builder/analysis-engine.js` (method signatures, grep)
- `core/modules/builder/builder-orchestrator.js` (header + composition pattern)
- `core/modules/memory/cozy-memory-engine.js` (method signatures, grep)
- `docs/builder/compose/M374-compose-report.md` (full read)
- `docs/builder/handoffs/M374.md`, `LATEST.md` (full read)
- `docs/builder/knowledge/repair-history-registry.md` (partial read)
- Repository-wide grep for `BuilderLearning` (zero matches — confirms genuine gap)
- Filesystem check for `core/modules/builder/learning-engine.js` (confirmed absent)

## 9. Implementation Readiness Checklist

- [x] M374 conflict resolved (reuse, not reopen)
- [x] Existing `LearningEngine` reviewed — distinct domain, no merge
- [x] Layer 1–3 real APIs confirmed
- [x] CozyMemory real API confirmed
- [x] Registries enumerated
- [x] Signal review — pattern/recommendation logic still not justified
- [x] Naming conflict avoidance decided — `BuilderLearning`, distinctly named and cross-referenced
- [ ] **Explicit approval to begin Phase 2 implementation — not yet given**

Per the Charter, Phase 2 does not begin until this is approved.
