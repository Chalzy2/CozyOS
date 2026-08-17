# Cozy Builder — Subsystem Changelog
## M385 — Living AI Context Engine

New: core/security/living-ai-context-engine.js. Registered as window.CozyOS.LivingAIContextEngine - critical finding: window.CozyOS.LivingAI already exists (Assistant state machine), avoided collision by naming distinctly. Composes CozyAI (M369) for memory, no separate storage. Window Manager confirmed to have zero real events - not subscribed. 6/6 Node tests pass. Implementation Verified: NO (browser pending).

## M384 — Living Behavior Engine

New: core/security/living-behavior-engine.js. Real login-timing pattern learning only - Window Manager events and navigation patterns confirmed to have zero real signal, disclosed rather than fabricated. New behaviorProfiles store (additive). 5/5 Node tests pass. Implementation Verified: NO (browser pending).

## M383 — Living Trust Engine

New: core/security/living-trust-engine.js. Persisted, learning trust score - composes LSE.evaluateTrust() as one-time seed only (real overlap found and resolved, not duplicated), composes LivingRiskEngine's real risk-high/critical events for reduction. New IdentityStorage store (trustScores, additive). 7/7 Node tests pass. Implementation Verified: NO (browser pending).

## M382 — Living Risk Engine

New: core/security/living-risk-engine.js. Independent from LivingSecurityCoordinator; re-groups its own already-computed risk breakdown (Device/Identity/Recovery/Authentication categories) rather than recomputing, adds genuinely new Session and Environment categories. Event-driven only, 0 setInterval/setTimeout. 9/9 Node tests pass. Implementation Verified: NO (browser pending).

## M381 — Living Security Coordinator

New: core/security/living-security-coordinator.js. Composes 6 existing engines into trust/risk scoring + adaptive auth decision. Biometrics/location/behavioral anomaly explicitly not composed (disclosed). 6/6 Node tests pass, 0 syntax errors, no duplicate registration.

## M380 — Continuous Handoff Standard (finalized)

Added M380-improvement-report.md, M380-continuation-report.md. Handoff rewritten to full 14-section standard with real, post-save SHA-256 per artifact. No functional code changed.

## M380 — Regression Evidence Collection

No detection engine exists or was built (none warranted — logging/reporting only, per instruction). Structured RG-NNN entry template added to regression-registry.md, matching RP's own discipline. Full regression sweep against all M373/M373.1/M374 security properties: 4/4 pass, no change. Registry honestly remains empty. Gate stays closed (RP SUFFICIENT, RG NONE).

## M379 — Engineering Evidence Growth (RP-006)

Repaired stale header in `core/identity/developer-profile.js` (named archived CozyIdentity as live; corrected to IdentityEngine). Comment-only, verified, RP-006 filed, MD-003 closed. RP reached SUFFICIENT (6/6). RG still 0/6 — gate remains closed.

## M378 — Pattern Engine Compose Recheck

Not approved. RP: 5 (threshold 6). RG: 0. Fifth consecutive live confirmation. No code changed.


## M377 — Layer 6 Pattern Intelligence Engine (Compose First)

**Outcome: Compose complete, implementation deferred — insufficient live evidence.**

- No code created. `core/modules/builder/pattern-engine.js`
  (`window.CozyOS.BuilderPattern`) was not written this milestone.
- `window.CozyOS.BuilderEvidence.getPatternReadiness()` called live
  (Node `fetch()` shim reading real registry files on disk): 2 repair
  records, 0 regression records, `patternDetectionJustified: false` —
  identical to M376's own snapshot, confirming no evidence growth
  occurred between milestones. Fourth consecutive milestone
  (M374/M375/M376/M377) to independently reach this conclusion.
- Ownership review confirmed no existing Pattern Intelligence engine
  anywhere in the repository; one adjacent, non-duplicate system found
  (`UnderstandingEngine`'s human-approval-gated Enterprise Pattern
  Library) — complementary, never re-implemented.
- New: `docs/builder/compose/M377-compose-report.md`,
  `docs/builder/reports/M377-verification-report.md`,
  `docs/builder/improvements/M377-improvement-report.md`,
  `docs/builder/continuation/M377-continuation-report.md`,
  `docs/builder/handoffs/M377.md`.
- `LATEST.md` repointed to `M377.md`.

## M373 — Layer 3 Analysis Engine

**New (additive):**
- `core/modules/builder/analysis-engine.js` — `window.CozyOS.AnalysisEngine`,
  v1.0.0-ENTERPRISE. Consumes `Layer2GraphComposer.buildGraphs()` output
  (Tier A: duplicate-module candidates, circular dependencies, event
  routing problems, broken interface candidates, version compatibility
  issues, large/complex modules) plus a narrow, deterministic Tier B
  raw-file-text regex scan (security heuristics: `eval(`, `Function(`,
  unsafe `innerHTML`, inline event handlers, insecure storage patterns;
  static leak heuristics: unmatched `setInterval`/`addEventListener`).
  Analyzes only — never modifies or repairs source. Findings persist to
  `window.CozyOS.CozyMemory` under namespace `builder-analysis` when
  available (additive; engine fully functions without it).
- `docs/builder/knowledge/architecture-ambiguity-registry.md` — AA-003
  appended ("Insufficient Signal", not "Missing Feature" — an evidentiary
  gap, not absent functionality), naming the six Tier C capabilities
  deliberately not implemented and their recommended build order.

**Changed:**
- `dashboard.html` — +4 lines (1 script tag + comment), 0 removed.
- `docs/builder/knowledge/module-inventory.csv` / `.json` —
  `analysis-engine.js` row added.

**Governance (same session, revised):** Rule 54 (Continuous Development
Handoff) was drafted, then revised in place to a final 11-section
structure with automatic triggers and a `LATEST.md` pointer file. The
handoff itself was refiled as `docs/builder/handoffs/M373.md` (superseding
an interim `M373-Layer3.md` draft, removed) plus `docs/builder/handoffs/LATEST.md`.

**Governance (same session, further extended):** Rule 55 (Continuous
Improvement & Version Evolution) adopted. First Improvement Report filed
(`docs/builder/improvements/M373-improvement-report.md`, 3 recommendations:
IMP-001..003, none yet applied — recommendations only, per the rule).
First cumulative engineering-metrics baseline filed
(`docs/builder/metrics/M373-engineering-metrics.json`). First
lessons-learned record filed (`docs/builder/knowledge/lessons-learned.md`).

**Not changed (per Change Scope Rule):** `layer2-graph-composer.js`,
`understanding-engine.js`, `observation-engine.js`, every other Builder
file. No Registry Loader / parser was implemented — AA/MD/DC/DI/SF/PF/RG
remain documentation artifacts per Decision 1.

**Verification:** `node --check` clean. Node-level runtime harness run
twice: (1) a small synthetic 2-file repository with deliberately
injected duplicate class, circular dependency, version mismatch,
`eval(`, unsafe `innerHTML`, and unmatched `setInterval` — all six
correctly detected and persisted to a mock CozyMemory; (2) the full
484-file real repository — completed in ~0.46s with no errors, 1,548
findings emitted and persisted (1,412 Tier A, 136 Tier B). Browser
Runtime Verification not yet performed (no browser in this sandbox,
same disclosed limitation as M372).


This file tracks changes to Cozy Builder itself (its engines, storage layout,
and pipeline) — not to CozyOS application milestones in general. Each
observation pass's own per-milestone notes live under `observations/<M-id>/`.

## Unreleased — Builder Storage & Observation Engine milestone (post-M372)

**Storage layout (additive migration, verified byte-identical via diff):**
- Introduced permanent workspace `docs/builder/` — `architecture/`,
  `knowledge/`, `memory/`, `metrics/`, `observations/`, `reports/`, `rules/`,
  `versions/` — replacing the previous per-milestone-only
  `docs/builder-observation/` pattern.
- Migrated all M372 `docs/builder-observation/*` content into the new layout
  (copy, not move — `docs/builder-observation/` left in place pending
  explicit approval to remove it, per Rule 3).

**Code (new, additive):**
- Added `core/modules/builder/observation-engine.js` —
  `window.CozyOS.BuilderObservation` — the first real runtime
  implementation of Builder's Layer 1 (Observe). Composes
  `UnderstandingEngine.analyzeRepository()`/`analyzeCode()` and
  `OwnershipScanner.scan()`; optionally composes `CozyStorage` for
  cross-milestone manifest persistence. Registers with the Service
  Registry the same way `cozy-builder.js` does. See its header for full
  scope and honest limitations.
- Wired into `dashboard.html`'s existing Builder script block, load-ordered
  after its two hard dependencies (`understanding-engine.js`,
  `ownership-scanner.js`).

**Not implemented this pass (disclosed, not silently dropped):**
- Dependency/architecture mermaid-graph generation, event-catalog
  generation, and API-catalog generation remain document-only artifacts
  produced by a human/LLM reading the repository — not runtime code. The
  per-file `eventsEmitted`/`publicMethods` data `ObservationEngine` already
  surfaces via `UnderstandingEngine` is real input a future pass could
  aggregate into those documents automatically; that aggregation itself is
  not built yet.
- Architecture/Security/Performance/Maintainability scoring — no rubric
  exists; `BuilderObservation` deliberately never invents these numbers.
- Writing manifests directly into `docs/builder/` from the browser —
  browser JS cannot write into this repository. `exportManifestMarkdown()`
  produces text for a human to save there, matching how `CozyBuilder`'s
  generated files are already reviewed/saved by a human rather than
  auto-written.

See `reports/builder-implementation-M372.md` for the full gap analysis and
validation record behind this entry.

## Unreleased — Anti-Duplication audit

- Added `knowledge/duplicate-consolidation-registry.md`: records both
  pre-existing confirmed duplicates (`CozyQuarryManager`,
  `InternalEventBus`) with evidence-based authoritative/superseded
  determinations and consolidation recommendations. Nothing removed —
  recommendations only, per Rule 3.
- New finding surfaced during this audit (not previously named in
  `BASELINE.md`): `core/modules/identity/cozy-identity.js` (2571 lines)
  appears to be an entirely orphaned file — no HTML entrypoint in this
  repository loads it, corroborated by three other files' own comments.

## Unreleased — cozy-identity.js archive decision

- Full investigation completed: `reports/cozy-identity-investigation.md`
  (~70 methods across 16 capability groups classified: superseded, dead/
  unreachable, already-implemented-elsewhere, or genuinely unique).
- **Decision: Archive.** Not integrated, not deleted. Recorded in
  `knowledge/duplicate-consolidation-registry.md` §2.
- Prepared, not yet applied (pending the real source file):
  `knowledge/cozy-identity-archive-banner.js` — the exact header banner
  to prepend to `core/modules/identity/cozy-identity.js`. No line of
  the file's existing ~2,571 lines is to change; this is an additive
  header only (Rule 24 — corrections extend, they do not reopen settled
  design).
- Outstanding, separate: `core/identity/developer-profile.js`'s stale
  header claim that CozyIdentity is the active identity subsystem needs
  correction. Not yet done — requires that file's current text.
- Groups, Privacy/Consent, and Access-Level ranking are logged as
  genuinely unique concepts worth a future, separately-scoped design
  review — not queued for implementation by this decision.

## Unreleased — Builder Governance Rules 49–50 adopted

- Added `rules/02-architecture-rules.md` §4 (Section 4 — Cozy Builder
  Governance Rules): **Rule 49 (Verified Workspace Integrity)** and
  **Rule 50 (Compose Before Implementation)**. Additive only — no
  existing rule text (Sections 1–3, File-Hygiene rules) changed.
- These formalize behavior already applied this pass to two blocked
  dependencies: `core/modules/identity/cozy-identity.js` /
  `core/identity/developer-profile.js` (Rule 49 — recorded, blocked, not
  fabricated) and `core/modules/builder/understanding-engine.js` (Rule
  50 — implementation withheld pending inspection of the likely
  authoritative owner already wired at `dashboard.html:1010`).
- Apply to every Builder layer and every future engineering decision in
  CozyOS, per the rules' own stated scope.

## Unreleased — Rule 51 (Missing Dependency Resolution) adopted

- Added `rules/02-architecture-rules.md` §4 Rule 51. Additive only —
  Rules 49–50 and all prior sections unchanged.
- Applied immediately to the three open blocked dependencies
  (`understanding-engine.js`, `cozy-identity.js`, `developer-profile.js`):
  each classified **existing but not loaded into this workspace**, based
  on in-workspace evidence (script tag, cited live replacement engines,
  a confirmed grep hit) — not **completely absent**. Per Rule 51's own
  Resolution section, this forecloses "design the missing capability"
  for all three; they remain blocked pending the real files, same as
  before, now with the classification recorded.
  This is broader than the `InternalEventBus` duplicate alone; flagged
  for the same investigate-and-decide treatment as the orphaned Kernel
  layer, not resolved in this pass.
- Self-audited `observation-engine.js` (added earlier this milestone)
  against all 16 duplicate-detection categories in the Anti-Duplication
  Directive — no duplicate introduced; detail in the registry above.

## Unreleased — Rule 51 refined to Builder Edition; new finding on understanding-engine.js

- `rules/02-architecture-rules.md` §4 Rule 51 text replaced in place with the
  fuller "Builder Edition" wording (broader search scope: Builder Memory,
  Builder Knowledge, prior versions, architectural specs, near-identical
  names checked by behavior not name; Builder-Generated fallback path
  added, temporary-ownership/merge-on-arrival process defined). Rules
  49–50 and all other sections unchanged.
- Running the refined search surfaced a real record: `understanding-engine.js`
  has a confirmed entry in `knowledge/module-inventory.json`/`.csv`
  (v1.0.0-ENTERPRISE, layer "Core / Code Generation — Requirement
  Understanding"). This confirms an authoritative implementation exists,
  so no Builder-Generated stub was created.
- **Flagged for a human decision, not resolved:** that recorded purpose
  (turning new input into code-generation requirements) doesn't obviously
  match `observation-engine.js`'s use of the same global for structural
  analysis of *existing* CozyOS code, or the Layer 2 spec's own scope
  (reverse-engineering existing architecture). Could be one engine
  serving both, or a path/documentation mismatch — needs the real file
  to resolve, not guessed here.
- `cozy-identity.js` / `developer-profile.js`: unchanged — both have
  named, confirmed-live replacement owners already in the workspace, so
  neither triggers the Builder-Generated branch either.

## Unreleased — Rule 52 (Architecture Ambiguity Classification) adopted; AA-001 opened

- Added `rules/02-architecture-rules.md` §4 Rule 52. Additive — Rules
  49–51 unchanged except Rule 51's evidence column trimmed to the
  missing-dependency status alone (the ambiguity content moved out,
  per Rule 52, into its own registry).
- New file: `knowledge/architecture-ambiguity-registry.md` — a
  registry distinct from `knowledge/duplicate-consolidation-registry.md`,
  for cases where in-workspace sources disagree about what a module
  does, independent of whether the module's file is available.
- **AA-001 opened:** `core/modules/builder/understanding-engine.js`.
  Three conflicting descriptions recorded verbatim (Builder Knowledge
  inventory vs. `observation-engine.js`'s composition use vs. the
  submitted Layer 2 spec). Four possible explanations listed; none
  treated as fact. Resolution requires inspecting the real source and
  comparing its actual API against each description — not an
  implementation task, and not blocking any other work.

## Unreleased — Rule 52 given full 7-step lifecycle; Builder Registry Family established

- Rule 52 expanded in `rules/02-architecture-rules.md` to the full
  lifecycle: ID → Evidence → Possible Explanations → Risk Assessment →
  Evidence Needed to Resolve → Implementation Lock → Closure Criteria.
- Added **Section 5 — Builder Registry Family**, formally defining 7
  registries (AA, MD, DC, DI, SF, PF, RG), their files, and current
  status.
- `knowledge/architecture-ambiguity-registry.md` — AA-001 rewritten
  with all 7 lifecycle fields (was previously informal).
- New: `knowledge/missing-dependency-registry.md` — MD-001/002/003
  opened for the three dependencies already tracked in prose across
  earlier passes (`understanding-engine.js`, `cozy-identity.js`,
  `developer-profile.js`); no new facts, existing tracking formalized.
- New: `knowledge/documentation-integrity-registry.md` — DI-001 opened
  for the `developer-profile.js` stale header finding, migrated out of
  `reports/cozy-identity-investigation.md` §3 into its own record.
- New: `knowledge/security-finding-registry.md` — SF-001..004, the 4
  pre-existing syntax errors from the M372 report §9, migrated into
  structured records.
- New: `knowledge/performance-finding-registry.md` — PF-001, the
  layout-triggering CSS transition from the M372 report §10.
- New: `knowledge/regression-registry.md` — standing, empty; no
  regression found in any pass to date.
- `knowledge/duplicate-consolidation-registry.md` — retrofitted with
  DC-001/002/003 IDs for consistency with the other registries; no
  content changed.
- Nothing implemented, nothing resolved — this pass is entirely
  structural/organizational, per Rules 49–52.

## Unreleased — Production integration into verified workspace

- Integrated this session's CozyBuilder-side deliverable into the full
  CozyOS production workspace (`CozyOS-M372-BuilderObservation-Complete`
  baseline). Additive only, per Rule 3 / Rule 15:
  - Added the complete `docs/builder/` tree (all 18 files) verified
    above, unchanged.
  - Left `docs/builder-observation/` untouched — confirmed byte-identical
    to the pre-integration baseline via `diff -rq`.
  - Added `core/modules/builder/observation-engine.js` — verified via
    `node --check` (pass), grep for `window.CozyOS.BuilderObservation`
    against the target workspace (no prior collision), and confirmation
    that both hard dependencies (`ownership-scanner.js`,
    `understanding-engine.js`) already exist in the target workspace at
    the required load position.
  - Applied the one `dashboard.html` script-tag insertion, byte-verified
    against the pre-diffed source; no other line of `dashboard.html`
    changed.
  - No other production file touched.
- Opened `DI-002` (session-handoff.md under-discloses this session's own
  code payload) and `DI-003` (CHANGELOG cites a non-existent
  `reports/builder-implementation-M372.md`) in
  `knowledge/documentation-integrity-registry.md`. Both are
  documentation-integrity findings, not runtime defects, and were
  explicitly scoped as non-blocking for this integration per direction
  received — recorded, not resolved, this pass.
- Certification: **PASS WITH DOCUMENTATION FINDINGS** — see
  `reports/production-integration-M372-certification.md`.

## Unreleased — Rule 53 (ZIP Classification Protocol) adopted

- Added `rules/02-architecture-rules.md` §4 Rule 53. Additive — Rules
  49–52 unchanged.
- Formalizes four ZIP categories Builder must classify any upload into
  before doing any work: **Main Production ZIP** (Authoritative — the
  only type eligible for a new production version/certification),
  **Builder Patch ZIP**, **Builder Documentation ZIP**, and
  **Feature/Module ZIP**. Only the first may ever receive a new
  milestone number (e.g. M373) or a production-release certification;
  the other three are learned from, analyzed, and turned into reports
  or patch files, then held until a real Main Production ZIP is
  available to merge into.
- Adopted retroactively-consistent with this pass's own conduct: the
  full-repository ZIP was worked on directly and produced a new
  integrated production ZIP; the Builder-only deliverable ZIP was
  correctly merged in as a patch and never itself treated as a
  milestone. Rule 53 makes that distinction an explicit, checkable
  first step for every future upload rather than an implicit judgment
  call.

## Unreleased — Layer 2 spec Compose Analysis; AA-001 and MD-001 closed

- Registered the submitted "Cozy Builder – Layer 2: Understanding Engine"
  specification as evidence in `knowledge/architecture-ambiguity-registry.md`
  AA-001, per Rule 52.
- **Headline finding:** the real `core/modules/builder/understanding-engine.js`
  was verified present and loaded in the Main Production ZIP the entire
  time — 700 lines, `node --check` clean, wired in `dashboard.html`
  exactly where MD-001 already assumed. It had only ever been absent
  from the smaller Builder-side ZIPs used in earlier sessions, which is
  why it was repeatedly logged as missing.
- Performed a full Rule 50 Compose Analysis comparing the Layer 2 spec
  against the real, verified architecture — full report at
  `reports/layer2-compose-analysis-AA-001.md`: existing capabilities,
  missing capabilities, a suggested (not implemented) extension path,
  integration points, and a no-duplication check.
- **AA-001 closed** — Explanation 1 confirmed (one shared generic
  parse/structure primitive serving two consumers); the Layer 2 spec
  reclassified as a target-state specification for a system that does
  not exist yet anywhere in this workspace, not a fourth conflicting
  description of `understanding-engine.js` itself.
- **MD-001 closed** — file confirmed supplied via the Main Production
  ZIP.
- No code implemented this pass. The suggested extension path is a
  proposal for a future, separately-scoped milestone only.

## Unreleased — Rule 53 extended with the registry-gate clause

- `rules/02-architecture-rules.md` §4 Rule 53 (ZIP Classification
  Protocol) extended in place — not duplicated — with a registry-gate
  clause: a Missing Dependency (`MD-NNN`) entry may only be opened
  after the current workspace has been classified per Rule 53's four
  types, and a Builder-only package's absence of a file is never, by
  itself, evidence that file is missing from CozyOS — only from that
  smaller workspace. If no Main Production ZIP is available to check
  against, the record must say so explicitly.
- Added the same precondition to
  `knowledge/missing-dependency-registry.md`'s preamble.
- Adopted in direct response to MD-001/AA-001's own history: both were
  opened against a Builder-only package that never contained
  `understanding-engine.js`, read as production-wide absence rather
  than workspace-local absence — the file was in the Main Production
  ZIP the entire time (`reports/layer2-compose-analysis-AA-001.md`).
  This clause exists specifically so that mistake cannot recur.

## M372 — Layer 2: Understanding Engine (Module/Dependency/API/Event/Ownership graphs)

- **Conflict Review held before implementation:** the incoming instruction to "extend understanding-engine.js" was checked against the already-closed `reports/layer2-compose-analysis-AA-001.md`, which recommended a new composing module instead. Resolved as: understanding-engine.js gets only the minimum new per-file fields Layer 2 needs; all cross-file graph logic lives in a new, separate file. Confirmed by the user before any code was written.
- **`core/modules/builder/understanding-engine.js` v1.0.0 → v1.1.0-ENTERPRISE (additive only).** `analyzeCode()`/`analyzeRepository()` gained three new per-file fields — `exportedAs`, `dependsOnGlobals`, `eventsListened` — same regex-only, non-executing extraction discipline as every existing field. Every pre-existing field, method signature, and return shape is unchanged (re-verified: a direct `analyzeCode()` call after the change still returns all seven original keys plus the three new ones).
- **New file: `core/modules/builder/layer2-graph-composer.js` (v1.0.0-ENTERPRISE).** Composes UnderstandingEngine + OwnershipScanner + (optionally) a BuilderObservation manifest into: Module Graph, Dependency Graph (with real cycle detection), API Graph (verified scope only), Event Graph (producer/consumer cross-reference), Ownership Graph. Re-parses nothing UnderstandingEngine already extracts.
- **`dashboard.html`** — one line added: `layer2-graph-composer.js` loaded after `observation-engine.js` (its optional dependency) and after `understanding-engine.js` (its hard dependency). No other line changed.
- **AA-002 opened** (see `knowledge/architecture-ambiguity-registry.md`) — the 8 Layer 2 graphs with no extractable signal in the current workspace today (Data Flow, UI Hierarchy, Startup Flow, Authentication Flow, Synchronization Flow, Plugin Relationship, Service Relationship, Architecture Graph), each with its missing signal and a recommended build order. Not fabricated; not attempted this milestone.
- **Verification performed:** `node --check` on both changed/new files; Node-level runtime test of `analyzeRepository()` + `buildGraphs()` against the real `core/modules/builder/*.js` files (17 files) and against the full repository (483 `.js` files: 296 module nodes, 1,410 dependency edges — 614 resolved / 796 unresolved-but-disclosed, 19 real circular-dependency chains detected, 576 events cross-referenced, 291 ownership checks); a synthetic two-file circular-dependency case to confirm cycle detection actually fires; a manifest-reuse path test via `BuilderObservation.observe()` confirming the Ownership Graph correctly reuses existing collision data instead of re-scanning. No browser runtime test performed this milestone (sandbox has no browser) — status is **Statically Verified / Node-Level Runtime Verified — Awaiting Browser Runtime Verification**, not Production Certified.
- **Known inherited quirk, not introduced by M372:** `analyzeCode()`'s existing `class\s+([A-Za-z0-9_$]+)` regex occasionally matches non-class-declaration text (e.g. two files repo-wide produced `className: "of"` / `"instances"` — false positives from the pre-existing regex, not from the new v1.1.0 fields). Logged here for visibility; not in this milestone's scope to fix (Rule 3/Change Scope Rule).
