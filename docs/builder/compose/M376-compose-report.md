# M376 — Builder Pattern Readiness & Evidence Engine — Compose Analysis Report

```
Compose ID: M376
Repository: CozyOS (verified against CozyOS-M375-output.zip)
Milestone: Layer 5 — Builder Evidence Engine (evidence measurement, not
           pattern inference)
Status: APPROVED (self-approved under Composition-First implementation
        mode explicitly requested for this milestone; see §9)
Implementation Ready: YES

Create:
- core/modules/builder/evidence-engine.js

Modify:
- dashboard.html   (add one <script> tag loading evidence-engine.js,
                     after learning-engine.js and before
                     builder-orchestrator.js — verified exact insertion
                     point below, not assumed)

Reuse:
- BuilderLearning (window.CozyOS.BuilderLearning) — read-only, via
  getLearningStatus()/getLayerStatus()/getKnowledgeSummary()
- Layers 1-3 (BuilderObservation, UnderstandingEngine, AnalysisEngine)
  — read-only, via their existing diagnostics APIs, reused indirectly
  through BuilderLearning wherever possible rather than re-composed
- Knowledge Registries (RP/RG/SF/PF/DC/MD/AA/DI) — read as documents
  this milestone (new capability — see §6), counts extracted, full
  text never re-stored
- Handoff chain (docs/builder/handoffs/*.md) — read as documents, used
  for getMilestoneHistory()
- CozyMemory — read-only, via BuilderLearning's existing composition,
  not re-composed directly

Do Not Build:
- Pattern Engine (recurring repair/architecture pattern detection)
- Recommendation Engine
- Confidence Engine (beyond the fixed evidence-level vocabulary
  specified for this milestone: NONE/LOW/PARTIAL/SUFFICIENT/HIGH/VERIFIED)

Reason:
This milestone's own objective is to measure evidence, not act on it.
Building any of the above now would repeat the exact "structure
invented ahead of evidence" mistake M374/M375 already declined to make.
The Evidence Engine's job is to make that future decision possible, not
to make it.

Risk:
LOW — read-only measurement, one new file, one new script tag, no
existing behavior touched, no storage duplicated. The only new
capability (parsing markdown registries) is scoped to counting section
headers only — see §6 for exactly what is and isn't parsed.

Next Milestone:
M377 (Pattern Engine) — gated on this milestone's own
getPatternReadiness() output, not on a calendar or a guess.
```

**Filed:** M376, Phase 1 only (Repository Verification / Compose
Analysis), performed before any code was written, per Rule 59
(Implementation Contract Fidelity).

**Preceded by:** Phase 0 Repository Verification (this session) —
confirmed repository state against the M375 handoff and LATEST.md
pointer before any composition decision below was made.

---

## 1. Purpose

Determine what a Builder Evidence Engine should actually compose and
measure, given (a) M375's real, completed scope (BuilderLearning as a
read-only status aggregator that explicitly punted on registry
parsing), and (b) the real current contents of the 8 knowledge
registries and the handoff chain — before writing any new file. Answer
the brief's central question honestly: **do we now have enough
verified evidence to learn a repeatable engineering pattern?**

## 2. Phase 0 — Repository Verification (performed before this report)

| Item | Finding |
|---|---|
| Repository version / baseline | `CozyOS-M375-output.zip`, matches the stated baseline |
| Current milestone | M375, status Completed, per `docs/builder/handoffs/LATEST.md` → `M375.md` |
| Existing Builder modules | 24 files under `core/modules/builder/` confirmed present (Layers 1-4 + orchestrator, generation-flow, deployment/*, etc.) |
| Existing globals | `window.CozyOS.BuilderObservation`, `.UnderstandingEngine`, `.AnalysisEngine`, `.BuilderLearning` confirmed present in their respective files; no `BuilderEvidence` global anywhere (repo-wide grep, zero matches) |
| Existing registries | 8 confirmed present under `docs/builder/knowledge/*.md` — real counts extracted in §5 below, not assumed from the M375 compose report's numbers, which were RP-only and now 4 months stale in milestone terms |
| Existing metrics | `docs/builder/metrics/M372-health-metrics.json`, `M373-engineering-metrics.json` — no M374/M375/M376 metrics file exists |
| Existing repair history | `repair-history-registry.md` — 2 entries (RP-001, RP-002), unchanged since M374 |
| Existing learning engine | `core/modules/builder/learning-engine.js` (`window.CozyOS.BuilderLearning`, v1.0.0-ENTERPRISE) — read in full this session |
| `core/modules/builder/evidence-engine.js` (this milestone's target path) | Confirmed absent — filesystem check |
| `window.CozyOS.BuilderEvidence` (this milestone's target global) | Confirmed absent — repo-wide grep, zero matches |

## 3. Ownership Search (Phase 1 of the brief)

| Component | Owner found? | Notes |
|---|---|---|
| Pattern readiness | ❌ Missing | No `getPatternReadiness`-equivalent beyond `BuilderLearning.getPatternReadiness()`, which is a fixed, hard-coded honesty statement from M375, not a live measurement. Genuinely missing: a *live* recomputation against current registry counts. |
| Evidence engine | ❌ Missing | Confirmed via grep and filesystem check |
| Recommendation engine | ❌ Missing (and out of scope this milestone — see Do Not Build) | |
| Confidence engine | ❌ Missing (and out of scope beyond a fixed evidence-level vocabulary) | |
| Pattern registry | ❌ Missing | No file resembling a pattern registry exists; only the 8 knowledge registries (which are finding/defect registries, not pattern registries) |
| Engineering evidence | Partial | The 8 knowledge registries constitute the raw evidence; no engine currently aggregates their counts |
| Repair evidence | ✅ `docs/builder/knowledge/repair-history-registry.md` | Real, 2 entries |
| Knowledge scoring | ❌ Missing | No existing engine assigns an evidence-level label (NONE/LOW/.../VERIFIED) to anything |
| Builder evidence | ❌ Missing | This milestone's actual gap |

**Conclusion:** everything the brief asks for is genuinely missing.
Nothing here duplicates an existing owner. Proceed to Create, not Reuse.

## 4. Composition Review (Phase 2 of the brief)

| Layer / component | Reusable as-is | Notes |
|---|---|---|
| Layer 1 Observation | ✅ (indirectly, via BuilderLearning) | `BuilderLearning.getLayerStatus().layer1Observation` already surfaces this; re-composing it directly here would duplicate what M375 already built |
| Layer 2 Understanding | ✅ (indirectly, via BuilderLearning) | Same reasoning |
| Layer 3 Analysis | ✅ (indirectly, via BuilderLearning) | Same reasoning |
| Layer 4 BuilderLearning | ✅ direct | This *is* the composition target — Evidence Engine sits on top of it, per the brief's own Layer numbering (5 follows 4) |
| CozyMemory | ✅ (indirectly, via BuilderLearning) | Not re-composed directly; BuilderLearning already reports its namespace list |
| Knowledge Registries (8) | New capability this milestone | M375 explicitly declined to parse these (`available: false`, pointer-only). The brief for M376 explicitly requires real counts ("How many repairs exist?", etc.), which cannot be answered honestly without reading them. This is the one genuinely new composition surface — scoped narrowly, see §6. |
| Handoff chain | New capability this milestone | Same reasoning — `getMilestoneHistory()` requires listing them |
| Builder Metrics | Read as documents, same scope as registries | No M374-M376 metrics file exists — reported honestly as absent, not fabricated |

**No reparsing, no duplicate storage:** confirmed — the registry/handoff
reading added this milestone counts section headers and file
existence only (see §6); it does not re-implement anything
Observation/Understanding/Analysis already do for source code files,
and stores no new copy of registry content — every read is on-demand,
nothing is cached beyond the lifetime of a single method call.

## 5. Evidence Review (Phase 3 of the brief) — real counts, extracted this session

| Registry | File | Entries found | Method |
|---|---|---|---|
| RP — Repair History | `repair-history-registry.md` | **2** (RP-001, RP-002) | `## RP-NNN` heading count |
| RG — Regression | `regression-registry.md` | **0** | Same; file's own text confirms "Standing, empty as of this pass" |
| SF — Security Finding | `security-finding-registry.md` | **4** (SF-001–004), **all 4 Closed** | `## SF-NNN` heading count + Status line |
| PF — Performance Finding | `performance-finding-registry.md` | **1** (PF-001), **Open** | `## PF-NNN` heading count + Status line |
| DC — Duplicate Consolidation | `duplicate-consolidation-registry.md` | **3** (DC-001–003) | `## DC-NNN` heading count |
| MD — Missing Dependency | `missing-dependency-registry.md` | **3** (MD-001–003) | `## MD-NNN` heading count |
| AA — Architecture Ambiguity | `architecture-ambiguity-registry.md` | **3** (AA-001–003) | `## AA-NNN` heading count |
| DI — Documentation Integrity | `documentation-integrity-registry.md` | **3** (DI-001–003) | `## DI-NNN` heading count |

| Question from the brief | Answer, with source |
|---|---|
| How many repairs exist? | 2 (RP-001, RP-002) |
| How many regressions? | 0 (RG empty) |
| How many duplicated fixes? | Not separately tracked — DC (duplicate *code*, 3 entries) is a different concept from a duplicated *fix*; no registry tracks "fixed twice." Reported as `notTracked`, not estimated. |
| How many repeated findings? | Not separately tracked as a category — closest real data is SF's 4 findings, all traced to only 2 root causes (RP-001 covers SF-001; RP-002 covers SF-002/003/004) — i.e. finding-to-root-cause ratio of 4:2, reported as raw fact, not interpreted as a "pattern" |
| How many repeated architectures? | Not tracked — AA (Architecture Ambiguity, 3 entries) records open design questions, not repeated architecture instances. Reported as `notTracked`. |
| How many completed milestones? | 3 handoff files exist (M373, M374, M375) confirming completion; version history (`06-version-history.md`) evidences ~17 earlier milestones by name but without handoff-level completion records — reported as two distinct numbers, not merged |
| How many verified implementations? | 2 (RP-001, RP-002 — both have recorded `node --check` PASS + runtime smoke test PASS) |
| How many failed implementations? | 0 recorded — no registry tracks a failed/abandoned implementation attempt as its own category |
| How many improvements repeated? | Not tracked — 2 improvement reports exist (M373, M375; M374 has none), too few and too structurally different to count "repetition" |

**Everything above is backed directly by repository evidence read this
session — file paths and heading counts, not inference.**

## 6. What Is (and Isn't) Parsed — scope boundary for the one new capability

This milestone adds the *only* new reading capability since M375: a
narrow, deterministic count of `## <PREFIX>-NNN` section headings and
their immediately-following `**Status:**` line (when present) in each
of the 8 registry files, plus a file-existence check for each handoff
file named in `LATEST.md`'s chain. It does **not**:

- Parse or extract full entry bodies (root cause, repair steps, etc.)
- Compute or infer relationships between entries
- Follow cross-references between registries (e.g. SF → RP)
- Parse `module-inventory.json`/`.csv`, health-metrics JSON, or
  Builder Memory JSON — those remain `available: false` pointer-only,
  identical to M375's own scope decision, because the brief's Phase 3
  questions don't require them and adding more surface than the brief
  asks for is exactly the over-reach the Composition-First rule exists
  to prevent
- Fetch anything over the network — all reads are same-origin
  relative-path `fetch()` calls the browser runtime already permits
  for same-repository files, guarded with `available: false` fallback
  identical in shape to BuilderLearning's existing pattern if `fetch`
  is unavailable or the file 404s

## 7. Gap Analysis (Phase 4 of the brief)

| Question | Answer |
|---|---|
| What Builder can now know | Real counts for RP, RG, SF, PF, DC, MD, AA, DI; real handoff-file existence; real pass-through of BuilderLearning's Layer 1-4 status |
| What Builder still cannot know | Whether any of these counts constitute a *pattern* — that requires cross-entry semantic comparison, explicitly out of scope (Pattern Engine, deferred to M377) |
| What still lacks evidence | Regression evidence (0 records — cannot assess regression-repair patterns at all); "repeated finding"/"repeated architecture" as first-class tracked categories don't exist yet, so those two brief questions are answered as `notTracked`, not estimated |
| What still requires human review | Whether M377's Pattern Engine should be built at all — this milestone's own `getPatternReadiness()` will make that determination automatically from live counts, but a human still approves the M377 compose report, per Rule 59 |

**Never invented, never estimated:** every field in §5 above is either
a direct count or explicitly marked `notTracked` — no field was
approximated or interpolated to fill a category the registries don't
actually support.

## 8. Compose Decision Table

| Component | Decision | Reason |
|---|---|---|
| M375 BuilderLearning (existing) | Reuse, untouched | Rule 58 — settled file, not reopened |
| Layers 1-3 | Compose indirectly via BuilderLearning | Avoids re-implementing M375's own composition |
| Knowledge Registries (8) | Compose (new, narrow read: heading + status counts only) | Genuinely required by the brief's Phase 3 questions; scoped per §6 |
| Handoff chain | Compose (new, narrow read: existence + count only) | Required for `getMilestoneHistory()` |
| Metrics / module-inventory / Builder Memory JSON | Do not parse this milestone | Not required by the brief's explicit questions; same discipline as M375 |
| Pattern/Recommendation/Confidence engines | Do not build | Milestone's own objective is measurement, not inference (see brief) |
| New global | Create — `window.CozyOS.BuilderEvidence` | Genuinely missing |
| New file | Create — `core/modules/builder/evidence-engine.js` | Genuinely missing |

## 9. Composition-First Implementation Mode — self-approval note

The M376 brief specifies `Implementation Mode: Composition First` and
lists Compose Before Implementation as a required rule, matching
exactly the process M374/M375 already used (file the compose report,
then implement in the same delivery once the compose analysis itself
contains no unresolved conflicts or postponed ownership questions).
Unlike M375 — which surfaced a real Gate 1 naming conflict requiring
external resolution before proceeding — this session's Phase 0-4
review above found zero conflicts, zero missing-but-required
ownership, and zero contradictions with any settled milestone. Per
Rule 59 §3, a pause is required only when a contradiction is found;
none was. Implementation therefore proceeds within this same delivery,
with this report filed first and unmodified afterward, exactly as
Rule 59 requires. This note itself is the "handoff to a future
account" fallback: if a different account needs to verify this
decision, the full evidence trail is §2-§7 above, not merely this
paragraph's assertion.

## 10. Evidence Index

Files directly read this session before any decision above:

- `docs/builder/handoffs/LATEST.md`, `M375.md` (full read)
- `docs/builder/compose/M375-compose-report.md` (full read)
- `core/modules/builder/learning-engine.js` (full read)
- `docs/builder/knowledge/repair-history-registry.md` (full read)
- `docs/builder/knowledge/regression-registry.md` (full read)
- `docs/builder/knowledge/security-finding-registry.md` (full read)
- `docs/builder/knowledge/performance-finding-registry.md` (full read)
- `docs/builder/knowledge/duplicate-consolidation-registry.md` (heading scan + partial read)
- `docs/builder/knowledge/missing-dependency-registry.md`, `architecture-ambiguity-registry.md`, `documentation-integrity-registry.md` (heading counts)
- `docs/builder/versions/06-version-history.md` (full read)
- `docs/builder/improvements/` directory listing (M373, M375 present; M374 absent — noted, not fabricated)
- `docs/builder/metrics/` directory listing + `M372-health-metrics.json` (partial read)
- `docs/builder/memory/07-builder-memory.json` (existence + line count only)
- `dashboard.html` lines 995-1045 (script load order, exact insertion point for the new tag)
- Repository-wide grep for `BuilderEvidence` (zero matches — confirms genuine gap)
- Filesystem check for `core/modules/builder/evidence-engine.js` (confirmed absent)

## 11. Implementation Readiness Checklist

- [x] Repository verified against stated baseline (Phase 0)
- [x] Ownership search performed — all target components confirmed missing
- [x] Composition reviewed — BuilderLearning is the correct composition
      root, not Layers 1-3 directly
- [x] Registry counts extracted live, not assumed from M375's stale numbers
- [x] Gap analysis complete — every brief question answered or marked
      `notTracked`, none invented
- [x] Scope boundary for the one new capability (registry/handoff
      reading) explicitly written down (§6), so a future session can
      verify this milestone didn't quietly build a full parser
- [x] No conflict with any settled milestone found — self-approval
      note filed (§9) per Rule 59 §3
- [x] Implementation Ready: YES — proceeding to Phase 5 (Create) in
      this same delivery
