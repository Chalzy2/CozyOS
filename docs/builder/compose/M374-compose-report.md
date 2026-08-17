# M374 — Layer 4 Learning Engine — Compose Analysis Report

**Filed:** M374, retroactively formalized as a permanent artifact per Rule 57 extension (this report was produced during the M374 session; this file makes it durable rather than chat-only).

**Rule Check:** ✅ Repository Version Review · ✅ Workspace Classification · ✅ Existing Owner Search · ✅ Dependency Review · ✅ Conflict Review · ✅ Composition Analysis · ✅ Gap Analysis · ✅ Implementation (completed same session — see sequencing note at the end)

---

## 1. Purpose

Determine whether a Learning Engine already exists within CozyOS, or whether Layer 4 should compose existing systems, before introducing any new engine or storage.

## 2. Existing Ownership Review

| Component | Owner found? | Partial? | Superseded? | Archived? | Missing? |
|---|---|---|---|---|---|
| Learning Engine | — | — | — | — | ✅ |
| Knowledge Engine | — | — | — | — | ✅ |
| Pattern Engine | — | — | — | — | ✅ |
| Repair History | — | — | — | — | ✅ — `lessons-learned.md` stated explicitly: *"None yet — no Builder repair layer exists as of M373"* |
| Lessons Learned | ✅ `docs/builder/knowledge/lessons-learned.md` | — | — | — | — |
| Version History | ✅ `docs/builder/versions/06-version-history.md` | — | — | — | — |
| Engineering Metrics | ✅ `docs/builder/metrics/M372-health-metrics.json`, `M373-engineering-metrics.json` | — | — | — | — |
| Builder Memory | ✅ `docs/builder/memory/07-builder-memory.json` | Module-level nodes only, no repair-outcome nodes | — | — | — |
| CozyMemory integration | ✅ `core/modules/memory/cozy-memory-engine.js`, `cozy-memory-lifecycle.js` | Not wired to Builder artifacts | — | — | — |

## 3. Composition Review

| Source | Available | Reusable | Extension required | Missing |
|---|---|---|---|---|
| Observation Engine | ✅ | ✅ | — | — |
| Understanding Engine | ✅ | ✅ | — | — |
| Analysis Engine | ✅ | ✅ | — | — |
| CozyMemory | ✅ | Not directly — separate domain (user/business memory, not engineering memory) | — | — |
| CozyStorage | ✅ | Available as future persistence layer if needed | — | — |
| Builder Registries (AA/MD/DC/SF/PF/RG) | ✅ | ✅ — new RP code follows same schema family | — | — |
| Builder Metrics | ✅ | ✅ | — | — |
| Builder CHANGELOG | ✅ | ✅ | — | — |
| Handoff documents | ✅ | ✅ — `LATEST.md` pointer pattern reused verbatim | — | — |
| Lessons Learned | ✅ | ✅ — extend existing empty section | — | — |
| Improvement Reports | ✅ `improvements/M373-improvement-report.md` | ✅ | — | — |

## 4. Dependency Review

| Dependency | Status | Action |
|---|---|---|
| Registry naming/schema conventions | Available | Compose |
| Handoff mechanism | Available | Compose |
| `lessons-learned.md` | Available (empty target section) | Extend |
| `security-finding-registry.md` | Available (open records) | Extend |
| Repair History store | Missing | Create |
| Pattern Library | Missing | Postpone — insufficient signal (2 records) |
| Knowledge Graph automation | Missing | Postpone — insufficient signal |
| Version Intelligence | Missing | Postpone — insufficient signal |

## 5. Conflict Review

| Risk | Found? | Decision | Evidence |
|---|---|---|---|
| Duplicate storage | No | Create (only the missing piece) | `regression-registry.md` scope (broken-that-used-to-work) is distinct from repair-history scope (broken-that-got-fixed) |
| Duplicate memory | No | Reuse `07-builder-memory.json` fields, no parallel graph | Direct read |
| Duplicate analysis | No | N/A — Layer 4 records outcomes, doesn't re-analyze | — |
| Duplicate registries | No | Extend two, create one sibling (RP) | Naming convention confirmed via `docs/builder/knowledge/*-registry.md` |
| Duplicate version tracking | No | N/A this pass | — |
| Duplicate metrics | No | N/A this pass | — |
| Duplicate reporting | No | Extend `lessons-learned.md`, not a new file | Empty target section confirmed present |

## 6. Gap Analysis

- **Already Exists:** registry conventions, handoff mechanism, metrics, changelog, knowledge-graph shell, lessons-learned file
- **Partially Exists:** `07-builder-memory.json` (module nodes exist; repair-outcome nodes don't — extension candidate for a future pass, not actioned this milestone)
- **Missing:** Repair History store (only genuinely missing artifact). Pattern Library / Knowledge Graph automation / Confidence Engine / Version Intelligence are also missing but have no signal yet to build from.

## 7. Recommendation

Compose everything reusable; create exactly one new artifact (Repair History Registry, code RP); postpone everything with no signal. Building the Pattern/Confidence/Version-Intelligence layers now would be structure invented ahead of evidence — the failure mode this process exists to prevent.

---

## 8. Compose Decision Table

| Component | Decision | Reason | Confidence |
|---|---|---|---|
| Repair History | Create | No existing owner anywhere in repo | High |
| Regression Registry | Reuse (untouched) | Existing registry, distinct scope, no regressions occurred this session | High |
| Builder Memory (`07-builder-memory.json`) | Reuse (untouched) | Existing knowledge store; extension postponed — no repair-outcome node schema decided yet | Medium |
| Lessons Learned | Extend | Existing document, target section already present and empty | High |
| Security Finding Registry | Extend | Existing records (SF-001–004) directly applicable to close | High |
| Handoff mechanism | Reuse | Existing pointer pattern, no changes needed to the mechanism itself | High |
| Pattern Library | Postpone | Missing, but 2 repair records is not enough signal to build an extractor | High (in the postponement itself) |
| Knowledge Graph automation | Postpone | Missing, same insufficient-signal reason | High |
| Confidence Engine | Postpone | Missing, same insufficient-signal reason | High |
| Version Intelligence | Postpone | Missing, same insufficient-signal reason | High |

## 9. Compose Evidence Index

Files actually examined (direct read, this session) before any decision above was made:

- `docs/builder/knowledge/regression-registry.md`
- `docs/builder/knowledge/lessons-learned.md`
- `docs/builder/knowledge/missing-dependency-registry.md`
- `docs/builder/knowledge/security-finding-registry.md`
- `docs/builder/memory/07-builder-memory.json`
- `docs/builder/handoffs/LATEST.md`
- `docs/builder/handoffs/M373.md`
- Repository-wide file listing of `docs/builder/` (directory scan)
- `core/modules/memory/cozy-memory-engine.js`, `cozy-memory-lifecycle.js` (existence check only, not full read)

A future Builder session can re-read this exact list to verify the decisions above without repeating the search.

## 10. Implementation Readiness Checklist

- [x] Repository classified — Main Production ZIP, M373/M374
- [x] Ownership verified — §2 above
- [x] Dependencies verified — §4 above
- [x] Duplicate check complete — §5 above
- [x] Conflict review complete — §5 above
- [x] Signal review complete — Pattern/Knowledge Graph/Confidence/Version Intelligence explicitly deferred for insufficient signal
- [x] Gap analysis complete — §6 above
- [x] Risk assessed — Low (documentation-only change, no source files touched by this milestone's compose work)
- [x] Implementation contract approved — see M374 handoff, `docs/builder/handoffs/M374.md`

All items complete as of this filing.

---

## Sequencing note (accuracy, not retrofit)

This report reflects searches actually run during the M374 session, before implementation — it is not reconstructed after the fact to justify what was built. What changed is *procedural*, not evidentiary: the report was originally posted informally in-conversation and implementation happened in the same turn, rather than this file existing first as a standalone checkpoint with a pause for approval. This file now makes that same evidence and those same decisions durable and independently re-checkable, per the multi-account workflow below.

## Role attribution for this milestone

Under the Compose / Implementation / Verification / Handoff split proposed for future milestones, M374 was executed as a single combined pass (all four roles, one session) rather than separated across accounts. That's recorded here explicitly so a future session doesn't assume a separate Verification Builder independently re-ran the checks — the same session that wrote the code also ran `node --check` and the runtime smoke tests. Independent re-verification by a separate pass is still open work, not yet done.
