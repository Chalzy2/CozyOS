# CozyOS Universal Native Multilingual Intelligence — Architecture Gap Audit

**Baseline:** `99cf0653e676211fa2105bba070cabc3acab0f75` ("Complete Phase 5 Application Control Plane") — clean, committed, pushed.
**Method:** Six parallel, read-only discovery passes across the full repository, each required to cite exact `file:line` evidence and classify every finding as `EXISTS-MATCHES-SPEC / EXISTS-PARTIAL / EXISTS-BUT-UNREACHABLE / DUPLICATED / MISSING`. No code was changed to produce this document.
**Status:** AUDIT ONLY. No implementation has begun. This is the required first step before any Universal Native Multilingual Intelligence work starts, per the explicit instruction: audit before implementation.

---

## 1. What already exists and genuinely works

These are real, reachable, correct today. Nothing here should be rebuilt.

| Capability | Where | Evidence |
|---|---|---|
| Cross-turn pronoun / omitted-subject resolution | `core/living/cozy-ai-semantic-intent.js:412-443` | Live-wired via `rule-based-conversational-provider.js:2129-2141`; `cozy-living-assistant.js:299,674-682` carries `conversationState` turn-to-turn |
| Clarification questions on competing intent | `cozy-ai-semantic-intent.js:396-408,635` | Consumed at `rule-based-conversational-provider.js:2143-2144` |
| Native (non-translated) intent classification for **en/sw** | `rule-based-conversational-provider.js` `INTENT_RULES`; `cozyos-identity-faq-router.js:85-265` `TRIGGERS` | Real per-language regex/phrase matching, not translate-then-match |
| Native-first language realization (never English-generated-then-translated when target evidence exists) | `core/modules/intelligence/language/cozy-language-realize.js`; SA-4 `language-realizer.js:19,24,46,201` | |
| Honest refusal over fabrication when language evidence is missing | `semantic-answer-planner.js:400-418,547-549` → `LANGUAGE_GAP` | |
| Multi-contributor validation gates | `cozy-language-acquisition-pipeline.js` `VALIDATION_TIERS` (137-163); enforced in `observation-lifecycle.js:134-137,179-183` | Real independent-contributor counting, not single-observation promotion |
| Ambiguity/utility thresholds before interrupting the user | `active-learning.js:58-64,76-77,103` | |
| Region-based confidence banding + anti-duplicate-submission | `core/living/cozy-language-verification.js:84,108-132` | |
| Action Truth at the handler level | `cozy-workflow-runtime.js:224-230,428,434,440` | Only `call_ai` ships a handler; everything else fails closed; honest `unavailable`/`no_handler_registered`/`failed` states |
| Correct "same AI" integration pattern | InterestOS `interestos.html:289,1072-1115` (tested: `interestOS-ask-cozyai-browser.test.js:63`); ChurchOS `living-worship-player.js:461-466,502-512` | The template every other app should copy |
| Fail-closed STT/TTS | `speech-recognition-adapter.js:86-117` (never substitutes a language); `cozy-tts-browser-adapter.js:59-64,109-119` (never fabricates a voice) | |
| Unified Live Text + Live Audio + Live Image | All three genuinely reach the same `#send()` → cognitive pipeline (`cozy-living-assistant.js:958-960,1016-1022`) | Tested: `cozy-living-assistant-live-window-e2e.test.js:163` |
| No genuine second conversational AI | Exhaustive inventory (20 candidate entities) found zero live rival chatbots — only dead code, non-conversational utilities, or dev-tool assistance | See §4 |
| No nested/duplicate repository copies | Verified clean via `find` | |
| Real, correct capability/access-state reasoning (just unreached from Live Window — see §3) | `dashboard-navigation-core.js:197-380` `buildAIContext()`/`explainSurface()` | |

---

## 2. What is partially implemented

| Area | Real coverage | Gap |
|---|---|---|
| Universal semantic representation | 3 competing shapes (`cozy-ai-semantic-intent.js:678-706`; SA-1 `semantic-answer-plan-contract.js`; SA-3B's flattened result) share ~6 of 15 spec fields | `dialect`, `register`, `situation`, `constraints`, `time`, `requiredCapabilities`, plural `entities`/`relationships` absent from all three |
| Native-language reasoning | True for **en/sw only** | fr/ar/so answered via English-generate-then-machine-translate (`cozyos-identity-faq-router.js:512-524,567-577`); `CozyAI.getContext()`'s `CONTEXT_*_ROUTES` keyword tables (`cozy-ai.js:240-309`) are **100% English-keyed**, so even Kiswahili questions that miss the sw trigger list silently fail retrieval |
| Response-mode selection | 3 disjoint vocabularies covering 5 of the spec's 18 modes combined (`cozy-answer-engine.js` FACT/EXPLANATION/…; SA plan's `ANSWER_MODE`; `cozy-advisor.js`'s ADVICE/…) | Advisor's vocabulary is "last writer" and silently overwrites the other two before the UI ever sees them |
| Discourse/pragmatics | Pronoun + omitted-subject real | Conversational repair ("I meant X not Y"), indirect requests/questions, politeness/register all missing |
| Code-switching | sw/en marker detection real and tolerant (`cozy-ai-semantic-intent.js:299-308`) | Sheng: zero implementation; a second detector (`analyzeConversationSegments`) never inspects text and has no production caller |
| Evidence-state vocabulary | `VERIFIED`/`UNKNOWN` exist under matching names across 2-3 parallel enums | `INFERRED` and `PLANNED` are genuinely absent as evidence states anywhere in the repo |
| CML-6 lifecycle (17-stage spec) | 9 stages real and orchestrated in `observeEvent()` (`continuous-learning-fabric.js:183-286`) | `IDENTIFY LANGUAGE`, `DIALECT/REGION`, `UPDATE CAPABILITY`, `CONTINUE` have no counterpart at all; `CANDIDATE/VERIFY/GOVERN/TEST` exist only as out-of-band delegates a caller must invoke separately |
| Knowledge provenance | Language-pack registry record is 7/8 spec fields (`cozy-language-pack-registry.js:499-514`) | Missing `context`; `EvidenceProfile` lacks dialect/region+verification+strength; the fullest record (`knowledge-provenance-engine.js`) is unreachable from the real pages |
| "One observation ≠ truth" | Enforced on language-pack/active-learning paths | **Violated** on the live `cozy-teach-flow.js:216-227` path — a single same-turn self-confirmation promotes a `CozyLearn` candidate straight to `TRUSTED` (scoped to `USER`, not `GLOBAL` — a real but partial mitigation) |
| Memory governance fields | Ownership + privacy real and enforced (`cozy-memory-engine.js:227-243,275-278`) | Retention exists but lives in a disconnected side-table (`cozy-memory-lifecycle.js`) the real read path never consults — recorded, never enforced; correction/user-control only incidental |
| Connectivity awareness | Real 6-state gradation exists (`cozy-living-offline.js:36,77-99`) | Zero cognitive consumers — `CognitiveCoordinator`/Live Window never branch on it; only ChurchOS translation has any connectivity-aware reasoning |
| Application capability intelligence | `dashboard-navigation-core.js` implements verified-capabilities/access-state/explainable-match well | No Goal input, no Required-Capabilities derivation, and **invisible to the Live Window entirely** (see §3) |
| Multimodal (Rule 40) | Text/audio-path-A/image unified | Live Video never reaches the cognitive core; a second audio path (`LivingHearingSession`) bypasses it entirely — intelligence *does* split by modality today |
| Per-app Live Window doors | 2 of 7 apps correct (InterestOS, ChurchOS worship player) | 5 apps (ShopOS, WholesaleOS, PharmacyOS, ChurchOS's main page, and QuarryOS/MpesaOS's dead hooks) have no real entry point |

---

## 3. What is built but unreachable

| Item | File | Why it doesn't matter today |
|---|---|---|
| `LanguageFluencyDiagnostic` | `core/modules/learning/language-fluency-diagnostic.js` | Zero production callers anywhere |
| `CognitiveCoordinator`'s own semantic/reasoning output | `cognitive-coordinator.js:173-186` | Computed every turn, then **discarded** — `cozy-living-assistant.js:129-136` reads only `.text/.reply/.answer`, never `.pipeline`/`.interpretation`/`.semanticAnswer` |
| `KnowledgeProvenanceEngine` (the richest provenance record that exists) | `core/modules/knowledge/knowledge-provenance-engine.js` | Script-loaded only on `admin-workspace.html`, not `index.html`/`dashboard.html` |
| `dashboard-navigation-core.js`'s `buildAIContext()`/`explainSurface()` | — | Called only by the dashboard's own AI-surface UI and tests; zero references from `cozy-living-assistant.js`/`cozy-ai.js`/`cozy-answer-engine.js` |
| Tool registry | `core/ai/cozy-ai-platform.js:331-346` | `registerTool()` has zero call sites — permanently empty at runtime |
| Connectivity/offline state | `cozy-living-offline.js` | No cognitive consumer (see §2) |
| Legacy `window.CozyOS.AI` (`CozyAIEngine`) | `core/ai.js` | Loaded **only** on `admin-workspace.html:1736` — not on the real user pages at all. Its `ask()` method has never existed (confirmed: full method list has no `ask`); 3 separate defensive callers (`quarry-linker.js:193`, `mpesaos.js:281`, `cozy-workflow-runtime.js:225`) guard against a global that isn't even loaded where they run |
| QuarryOS inline mini-chat | `core/modules/QuarryOS/quarry-linker.js:64-65,191-219` | The `chat-box`/`chat-input` DOM elements it targets **do not exist** in the real `quarry.html` — double-dead |
| MpesaOS `#tryCozyAIAssistant()` | `core/modules/MpesaOS/mpesaos.js:280-290` | Permanently-false guard, sets a tooltip at most |
| Second code-switch detector | `analyzeConversationSegments()`, `cozy-african-language-intelligence.js:380-392` | Test-only caller; never inspects raw text at all (routes on caller-supplied metadata) |

---

## 4. What is duplicated

| Duplication | Detail |
|---|---|
| 3 universal-semantic-representation shapes | None is authoritative; see §2 |
| 3 response-mode vocabularies | See §2 — Advisor's silently wins |
| `SemanticAnswerPlanner.planAnswer()` invoked twice per turn | Once inside `CognitiveCoordinator` (output discarded — see §3), once inside `CozyAnswerEngine.tryConstructSemanticAnswer()` (output used). Confirmed redundant, not harmful, but wasted work and a maintenance trap |
| Two independent, unreconciled language-verification ladders | `CozyLanguageAcquisitionPipeline.VALIDATION_TIERS` (contributor-count) vs `LivingLanguageVerification` L1-L4 (region-count, `cozy-language-verification.js:108-132`) — both real, both live, never composed together |
| **8 independent, incompatible visibility/boundary vocabularies** | `cozy-memory-engine.js` (private/public/organisation), `cozy-identity.js` `VISIBILITY_LEVELS`, server `knowledge-registry.js` `VISIBILITIES` (6-value), ChurchOS prayer `VISIBILITY_LEVELS`, `cozy-knowledge-ingestion.js` `VISIBILITY_STATES`, `verified-evidence-contract.js` `SENSITIVITY` (explicitly self-described as a "disclosed superset" bridging two others), `cozy-intelligence-privacy.js` `PRIVACY_TIERS`, founder-story `VISIBILITY_LABELS`. **None of these is the spec's 5-term boundary set** — that vocabulary literally does not exist in code anywhere (2 test-comment mentions only) |
| Two copies of the QuarryOS advisor engine | `modules/quarry/index.js` and `core/modules/QuarryOS/quarry-index.js`; the older copy fabricates a hardcoded `"KSh 142,300"` profit figure — a genuine Action-Truth-adjacent violation |
| An orphan second conversational surface | `applications/CozyAIFAQ/` — calls the real `CozyAI.ask()` (not a second brain) but renders its own standalone chat UI, unregistered anywhere else in the app |
| `language-fluency-diagnostic.js`'s dimension list re-derives fields already owned by `getLanguageCapabilities()` | 10 of its 16 "dimensions" are compile-time-constant `"UNKNOWN"` placeholders that add no information beyond what `cozy-language-pack-registry.js:210-308` already defines |
| 5 overlapping maturity/evidence-tier vocabularies | `PACK_STATES`, `EVIDENCE_BANDS`, `VALIDATION_TIERS`, `cozy-language-registry.js`'s 3-state, `cozy-language-knowledge-model.js`'s review states — `EVIDENCE_BANDS` and `VALIDATION_TIERS` are near-identical contributor-count bands |

---

## 5. What is genuinely missing

- A real verb morphology / tense / aspect / mood / agreement / sentence-construction engine. Language handling is **100% template/lookup-based**; the repo's own code explicitly disclaims this ("a real morphological analyzer is out of scope for this phase" — `cozy-ai-semantic-intent.js:427-438`).
- Word senses, synonyms, antonyms, negation beyond a closed en/sw word list, discourse tracking, register — no dimension exists for any of these.
- Idiom/proverb/figurative-language handling as semantic units — effectively nothing (one demo seed string; aspirational UI copy only).
- Sheng — zero implementation anywhere.
- The spec's 9-state language maturity ladder (`REGISTERED…VERIFIED ADVANCED`) — none of the 5 existing tier vocabularies matches it.
- A real **CAPABILITY GRAPH** (`USER GOAL → REQUIRED CAPABILITY → COZY CAPABILITY → APPLICATION → TOOL → AUTHORIZATION → DATA → ACTION`) — nothing models this end-to-end; only disconnected fragments exist.
- Gap-cause classification (transcription error / proper name / joke / one-off / code-switching / real gap) — the **vocabulary** exists (a 26-value `LANGUAGE_GAP_TYPE` enum, `ConflictDetection.INTERPRETATIONS`) but nothing ever computes it; real gap creation is uniform threshold-based only.
- The spec's `PUBLIC/SESSION-RESTRICTED/ROLE-RESTRICTED/USER-PRIVATE/SYSTEM-INTERNAL` vocabulary itself, as a real, enforced, first-class primitive.
- Any output-side filter preventing internal implementation detail from leaking into user-facing answers. **4 confirmed live leak paths** (internal module names in error strings reaching `#speak()`; raw exception text; literal filenames in advice text).
- Rule 34's human-interpretation boundary — no guard exists in either direction. Not a live violation today (no inference code exists), but nothing would stop one, and `modules/wellbeing.js` already stores uncontextualized personality assertions about named individuals.
- A Rule 48 "architecture guardian" — a repo-wide deterministic invariant suite. Confirmed absent; only narrow per-feature structural guards exist (like the CML-6 one repaired this session). `package.json` declares no test runner/aggregate gate at all.
- Live Video ever reaching the cognitive/reasoning pipeline.
- Real Live Window integration for 5 of 7 business applications.

---

## 6. What must be preserved (explicit — nothing below should be deleted, only extended/reconciled)

Per Rules 42/44/55 (`DO NOT REMOVE CAPABILITY TO ADD CAPABILITY`):

1. All 3 semantic-representation shapes' unique real fields, until genuinely reconciled into one — not deleted first.
2. The real, working en/sw native intent-classification and template-realization paths — the **only** genuinely native (non-MT) language coverage that exists today. Fixing fr/ar/so must not regress this.
3. `CozyLearn`'s real teach-flow UX — the one point of genuine, explicit user consent the whole learning system depends on.
4. CML-6's 9 real, correctly-orchestrated lifecycle stages.
5. `LivingLanguageVerification`'s L1-L4 region-based ladder — real, tested, independently useful; reconcile with `VALIDATION_TIERS`, don't delete either.
6. `dashboard-navigation-core.js`'s `buildAIContext()`/`explainSurface()` — a correct, tested pattern that only needs to be *reached*, not rebuilt.
7. The Action Truth discipline already correctly implemented at the per-step handler level in `cozy-workflow-runtime.js`.
8. `CozyMemory`'s real owner/visibility enforcement and versioning.
9. The real, fail-closed STT/TTS adapters.
10. InterestOS's and ChurchOS's correct "same AI" integration pattern — the template, not a rewrite target.
11. `cozy-living-offline.js`'s real 6-state connectivity detection — needs a cognitive consumer, not a replacement.
12. `KnowledgeProvenanceEngine`'s rich record shape — the best one that exists; extend its reach.
13. The entire Phase 5 Application Control Plane checkpoint (commit `99cf065` and everything before it).

---

## 7. What can be extended (the real seams a Multilingual Intelligence phase should build on top of)

| Spec requirement | Extend this real, existing seam | Not this |
|---|---|---|
| Universal language realization (Rule 38) | `core/modules/intelligence/language/cozy-language-realize.js` — already correctly used by SA-4 | A new realization engine |
| Cognitive coordination actually mattering | `CognitiveCoordinator` — already runs every turn, already has a `semanticAnswer` stage; wire its real output into the reply instead of discarding it | A second coordinator |
| Language fluency dimensions | `getLanguageCapabilities()` in `cozy-language-pack-registry.js:210-308` — where all 16 real dimensions already live | `language-fluency-diagnostic.js` (a re-bucketing layer with no data of its own) |
| Governed learning lifecycle (Rule 27) | `ContinuousLearningFabric.observeEvent()` — add `IDENTIFY LANGUAGE`/`DIALECT-REGION`/`UPDATE CAPABILITY`/`CONTINUE` stages here | A second learning orchestrator |
| Reconciling the 3 learning engines | `ObservationLifecycle` — already the real composition point between CML-6, CozyLearn, and the acquisition pipeline; fold `LivingLanguageVerification` in here too | A fourth engine |
| Security/privacy boundary (Rule 22) | `verified-evidence-contract.js`'s `SENSITIVITY` enum — already explicitly a disclosed superset bridging 2 of the 8 duplicate vocabularies; the natural home for the spec's real 5-term boundary | A 9th independent vocabulary |
| Capability graph (Rules 18/37) | `dashboard-navigation-core.js`'s `buildAIContext()` — add a goal parameter + required-capability derivation | A new capability system |
| Tool-use reasoning (Rule 19) | `cozy-ai-platform.js`'s real, empty tool registry — populate it | A new tool concept |
| Knowledge exposure boundary (Rule 21) | `response-validator.js` — the one real output-side gate that exists; the natural home for an internal-detail filter | A new validation layer |

---

## 8. Proposed implementation phases (NOT authorized — for review only)

This ordering follows Rule 41 (Reuse → Extend → Reconcile → Create New Only When Genuinely Necessary) and puts the highest-leverage, lowest-risk fixes first.

**Wave 1 — Make the real cognitive core actually govern the answer.**
Wire `CognitiveCoordinator`'s existing `semanticAnswer` output into the reply path instead of discarding it; eliminate the redundant double-call to `SemanticAnswerPlanner`. This alone closes the single biggest structural gap ("cognitive coordination stage is a diagnostics sink") without adding new systems.

**Wave 2 — Unify the universal semantic representation.**
Reconcile the 3 competing shapes into one, extended with the missing spec fields (`dialect`, `register`, `situation`, `constraints`, `time`, `requiredCapabilities`, plural `entities`/`relationships`). Extend, don't replace — every existing consumer of any of the 3 shapes keeps working.

**Wave 3 — Fix the English-keyed retrieval layer.**
`CozyAI.getContext()`'s `CONTEXT_*_ROUTES` tables are the real "hidden English intermediary." Extend them with native-language trigger sets (starting with the already-native-reasoning sw path) rather than routing through MT.

**Wave 4 — Reconcile the two learning/verification ladders and close the CozyLearn single-observation gap.**
Fold `LivingLanguageVerification` into `ObservationLifecycle`'s composition; require the same independent-evidence discipline CML-6 already enforces elsewhere on the `cozy-teach-flow.js` promotion path.

**Wave 5 — Build the real capability graph and reach it from the Live Window.**
Extend `dashboard-navigation-core.js`'s `buildAIContext()` with goal/required-capability derivation; wire it into `cozy-answer-engine.js` so app-related answers stop being English-keyword-matched and start being goal-matched (also closes the un-authorization-filtered app-list-dump finding).

**Wave 6 — Security/privacy boundary unification.**
Extend `verified-evidence-contract.js`'s `SENSITIVITY` enum toward the spec's 5-term vocabulary; add the real output-side knowledge-exposure filter to `response-validator.js`, closing the 4 confirmed leak paths.

**Wave 7 — Language maturity gates.**
Design the spec's 9-state ladder as a real computed function over `getLanguageCapabilities()`'s existing dimensions (extending, not replacing, `PACK_STATES`/`EVIDENCE_BANDS`/`VALIDATION_TIERS`).

**Wave 8 — Deep fluency dimensions (morphology, discourse repair, idioms/code-switching/Sheng).**
The largest genuinely-new-capability wave; sequence last since it has no existing seam to extend and is highest-risk/highest-effort.

**Wave 9 — Multimodal unification.**
Route Live Video and the second audio path (`LivingHearingSession`) through the same cognitive core the text/audio-A/image paths already share.

**Wave 10 — Per-application Live Window doors.**
Wire the remaining 5 apps to the same real pattern InterestOS/ChurchOS already prove correct; delete (after the 18-point proof process) the confirmed-dead QuarryOS/MpesaOS hooks and the orphan `CozyAIFAQ` surface only once their absence is verified harmless.

**Wave 11 — Rule 48 Architecture Guardian.**
Build the repo-wide deterministic invariant suite last, once the waves above have stabilized what it needs to check — but its absence should be flagged immediately as a standing risk for every wave above it.

**Wave 12 — Full regression, production-reality testing, and commit gate**, per the same discipline already proven across every prior Phase 5 milestone in this repository.

---

*Audit performed via 6 parallel read-only discovery agents against baseline `99cf065`. No files were modified to produce this document. Awaiting explicit authorization before any implementation wave begins.*
