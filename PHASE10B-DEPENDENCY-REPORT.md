# Phase 10B — Dependency Report

No new dependency (library, provider, model, runtime, service) was required.
This phase added tests against already-real, already-loaded engines only:

| Dependency | Status | Used by |
|---|---|---|
| `core/modules/interpretation/cozy-interpretation.js` | Pre-existing, real | test stack load |
| `core/modules/thinking/cozy-thinking.js` | Pre-existing, real | test stack load |
| `core/modules/reasoning/cozy-reasoning.js` | Pre-existing, real | test stack load |
| `core/modules/intelligence/cozy-intelligence.js` | Pre-existing, real | test stack load |
| `core/modules/memory/cozy-memory-engine.js` | Pre-existing, real | test stack load |
| `core/modules/policy/policy-decision-engine.js` | Pre-existing, real | test stack load |
| `core/modules/cognitive/cognitive-coordinator.js` | Pre-existing, real | subject under test |
| `core/modules/intelligence/ai-bootstrap.js` | Pre-existing, real | provider-honesty test path (test 9) |
| `core/modules/intelligence/cozy-ai.js` | Pre-existing, real | subject under test |
| `core/modules/builder/builder-orchestrator.js` | Pre-existing, real | subject under test |
| `core/modules/builder/capability-governance-diagnosis.js` (Phase 10A version) | Pre-existing, real | Kiswahili proof case (test 13) |
| Full governance-diagnosis dependency chain (language registry, language-pack registry, file-registry, dependency-engine, unified-capability-contract, capability-dependency-graph, capability-self-diagnosis, capability-repair-planner, knowledge ingestion/community/review, language templates, live-hotspot-engine, knowledge safety-gate/review-hotspot-bridge/contribution-core, teach routing, capability-knowledge-acquisition) | Pre-existing, real | Kiswahili proof case load chain, identical to the Phase 8 test file's own `loadFullStack()` |

## MISSING DEPENDENCIES

None new. Pre-existing, already-disclosed limitations carried forward
unchanged from Phase 10A / the `cozy-ai.js` and `builder-orchestrator.js`
headers themselves:

- No deep/LLM-grade reasoning provider exists anywhere in this repository.
  `ai-bootstrap.js`'s baseline providers (`living-nlu-baseline`,
  `living-planner-baseline`, `living-reasoning-baseline`) are real but
  simple, keyword/rule-based, and honestly self-labeled as such.
- `builder-orchestrator.js` Phase 6 (Build/code generation) remains
  honestly not automated — no code-generation provider exists.
- Voice input, image input, and per-application routing through
  `CognitiveCoordinator` remain disclosed, separate follow-up work (stated
  in that file's own header, unchanged by this phase).

Nothing in Phase 10B's scope required installing or acquiring a new
dependency, so section 12's "stop and report" branch does not apply — the
"build/install if permitted" branch also does not apply, since nothing was
missing that this phase's objective needed.
