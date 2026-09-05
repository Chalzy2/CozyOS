# Phase 10A — Dependency Report

## Real, confirmed dependencies of capability-governance-diagnosis.js (unchanged from Phase 8)
- core/modules/builder/capability-repair-planner.js (Phase 5) — buildPlan()
- core/modules/builder/capability-knowledge-acquisition.js (Phase 7) —
  classifyDependencyDomain(), DEPENDENCY_DOMAIN, getAcquisitionRequest(),
  listAcquisitionRequests()

## New Phase 10A internal reuse (no new external dependency added)
- Confidence taxonomy values (`manifest` / `best-effort` / `unverified`)
  reused verbatim from the real, existing convention already produced by
  capability-repair-planner.js's blocker entries and consumed identically
  by capability-self-diagnosis.js's own `classifyEvidenceStrength()`. No
  new taxonomy module was created; the mapping is duplicated inline as a
  4-line pure function (`describeConfidence()`) since
  `classifyEvidenceStrength()` itself is not exported by
  capability-self-diagnosis.js's public API.

## Missing dependency (pre-existing, disclosed, unrelated to this phase's scope)
- CozyInterpretation / CozyThinking / CozyReasoning have only simple,
  honest, rule/keyword-based baseline providers (registered by
  `core/modules/intelligence/ai-bootstrap.js`, M366.9) — not a genuine
  LLM or deep-reasoning backend. This was true before Phase 10A and
  remains true after it. `capability-governance-diagnosis.js` does not
  depend on this stack at all, so it did not block any Phase 10A work.

## No new provider fabricated
Phase 10A registered no new provider anywhere. `OPERATION_SEMANTICS`
is a static data dictionary, not a provider.
