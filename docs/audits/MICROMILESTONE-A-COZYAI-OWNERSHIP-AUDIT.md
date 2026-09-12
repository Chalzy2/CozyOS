# Micro-Milestone A — CozyAI Ownership + Dependency Audit
Audit-only. No production files modified. Input: CozyOS-SessionGateFoundation-CHECKPOINT.zip

## Capability ownership table

| Capability | Real owner (file) | Status | Loaded? | Direct deps | Callers/consumers | Tests | Browser-tested | Other authority? | Dead/recovery candidate |
|---|---|---|---|---|---|---|---|---|---|
| AI core | `core/ai.js` (`window.CozyOS.AI`, v1.4.2) | Live | Yes (root AI engine) | Storage gateway, telemetry queue | All AI sub-engines via `initializeSubEngine()` | None found this pass | Not verified this session | — | — |
| AI integration | `core/ai/cozy-ai-integration.js` (v1.5.1) | Live | Yes, binds via `initializeSubEngine` | `core/ai.js` | Event bus consumers (logout, plugin, engine health, etc.) | None found | Not verified | — | — |
| AI language registry | Two distinct, non-overlapping registries: `core/ai/cozy-ai-language.js` (v6.0.0, native-language knowledge/dictionary + pack registry) and `core/modules/intelligence/language/cozy-language-registry.js` (RP-027, language-*selection* registry) | Both live | Yes | Storage/CozyStorage | Conversational provider, AI intent responses | `rp-028-luo-availability.test.js` passing | Not verified | Confirmed **not** a conflict — self-declared repo-wide search before RP-027 file was written; different domains (content dictionary vs. selection) | — |
| AI memory | Two candidate owners: `core/modules/memory/cozy-memory-engine.js` (real `CozyMemory`, actively called by `cozy-ai.js`'s learn/remember/search) vs. `core/ai/cozy-ai-memory.js` (`CozyAIBusinessMemory`) | `cozy-memory-engine.js` live/current; `cozy-ai-memory.js` **degraded** | `cozy-ai-memory.js` self-declares reconstructed header/constructor with `INFERRED` placeholders, unknown taxonomy/thresholds/TTL | — | `cozy-ai.js` calls `CozyMemory` (the engine file), not the business-memory file | None found for either | Not verified | **Conflict/overlap flagged** — two "AI memory" files exist; `cozy-ai-memory.js` appears superseded/legacy | Yes — `core/ai/cozy-ai-memory.js` is a RECOVERY CANDIDATE (real logic from "§9 MEMORY STATISTICS" onward is intact and may be worth salvaging), not a live authority |
| AI context | `core/context/cozy-context-engine.js` (v1.0.0-ENTERPRISE) | Live | Yes, shell-owned platform engine | Context pack self-registration (`registerContextPack()`) | Shared Shell (`cozy-shell.html`) | None found | Not verified | — | — |
| AI knowledge | `core/modules/intelligence/knowledge/cozy-knowledge-registry.js` (RP-027) | Live | Additive, reads other modules' public APIs only | DeveloperIdentity, ProviderManager, ServiceRegistry (read-only, call-time) | Conversational provider | `cozy-knowledge-registry.test.js` present | Not verified | No conflict — self-declared standalone | — |
| AI learning | `core/modules/learning/universal-learning-pipeline.js` (M322) | Live | Yes, composes existing engines only | SpeechRecognitionAdapter, CozyMemory, LivingLanguageVerification, OCREngine | Not fully traced this pass | None found | Not verified | No new authority created — explicitly composition-only | OCREngine dependency is itself "a documented stub with no executable pipeline yet" per this file's own header — pre-existing, disclosed gap |
| AI OCR | **Two unreconciled authorities:** `core/modules/ocr/cozy-ocr.js` (CozyOCR v1.1.0-ENTERPRISE, real Tesseract.js-backed recognition) and `core/modules/ocrstudio/*` (separate OCR Studio subsystem — `Ocr-register.js`/OCRRegistry v1.0.0-PRODUCTION plus ~19 other modules; per prior session, 8 of 20 frozen) | Both live, neither deprecated | Yes | Tesseract.js (CozyOCR); internal registry chain (OCR Studio) | Not cross-referenced this pass | None found for either in this pass | Not verified | **Genuine ownership conflict** — pre-existing, not created by this audit. Flagged for scope decision; NOT resolved here per Milestone A's no-implementation rule | — |
| AI voice/STT | `core/modules/speech/cozy-speech.js` (CozySpeech kernel, v2.2.0-ENTERPRISE) | Live, coordinator-only (delegates STT/TTS/etc. to adapters) | Yes | Adapter ecosystem under `core/modules/speech/adapters/` (mostly unwired except translation pair) | dashboard.html (translation adapters only) | Not re-run this pass | Not verified | **Known, already-documented conflict** with the separately briefed Milestone 178 "Cozy Voice Engine" — Gate 1 outcome was halt-pending-user-scope-decision in a prior session; still unresolved, not re-adjudicated here | — |
| AI translation | `core/modules/translate/cozy-translate.js` (v2.2.0-ENTERPRISE-FROZEN, pure topology/metadata coordinator, 0% text manipulation) + `core/engines/media/translation/translation-pipeline-engine.js` (M388 Engine 3, composes `cozy-translate` + speech-translation adapters to fill `cozy-live.js`'s reserved `CozyTranslate` slot) | Both live | Yes | Chain: cozy-translate → speech-translation-adapter → speech-translation-provider | `translation-pipeline-engine.test.js` present | Not verified | No conflict — complementary layers (coordinator vs. slot-filling composition), confirmed by each file's own ownership section | — |
| AI advisory | `core/living/cozy-living-advisor.js` | Live | Yes, composes `CognitiveCoordinator.run()` only | CognitiveCoordinator, (reads, never owns) PolicyDecisionEngine/CozyReasoning | Not traced further this pass | None found | Not verified | No conflict — explicitly audited against PolicyDecisionEngine/CozyReasoning before being written; different concerns | — |
| AI certification/verification | `core/modules/certification/cozy-certification.js` (`window.CozyOS.Certification`, real coordinator) + `certification-dashboard.js` (UI orchestration only, delegates all verdicts) | Live | Yes | — | Developer Hub, dashboard UI | Not re-run this pass | Not verified | No conflict — dashboard explicitly never computes its own verdicts | — |
| AI Developer/Builder integration | `core/modules/developer/cozy-developer.js` (CozyDeveloperHub, pure orchestration) + `developer-hub.js` (UI) + `core/modules/builder/*` (question-engine, requirement-analyzer, understanding-engine, generation-flow, capability-knowledge-acquisition, unified-capability-contract — the Builder subsystem) | Live | Yes | CozyBuilder, UnderstandingEngine, CozyOCR, CozyCertification, CozyBugFixer, WorkspaceShell, ServiceRegistry, CozyAIMode | Shared Shell / Developer Hub UI | `capability-repair-planner.test.js` present | Not verified | No conflict — explicitly zero-independent-logic per its own header | — |

## Dependency trace (existing authority → dependency → consumer → tests)
- `core/ai.js` → sub-engines register via `initializeSubEngine()` → integration/language/memory/platform files → no dedicated test suite located this pass.
- `cozy-ai.js` (Universal AI Service facade, M369) → `CognitiveCoordinator.run()`, `cozy-memory-engine.js` (`CozyMemory`), `SpeechTranslationAdapter` → all pre-existing, unmodified per this file's own header (not independently re-verified this pass).
- OCR: no live code path currently bridges `cozy-ocr.js` and the `ocrstudio/` subsystem — they are parallel, not chained.
- Voice: `cozy-speech.js` → adapter ecosystem (mostly unwired) → only the translation adapter pair reaches `dashboard.html`.

## Existing authorities confirmed (no duplicate created)
AI core, AI integration, AI context, AI knowledge, AI learning, AI translation (both layers), AI advisory, AI certification, AI Developer/Builder — each carries a self-declared ownership section confirming no duplicate was created when it was written.

## Genuine conflicts found (pre-existing, not introduced by this audit)
1. **AI OCR** — `cozy-ocr.js` vs. `ocrstudio/` subsystem: two unreconciled owners for the same capability domain.
2. **AI voice/STT** — `cozy-speech.js` vs. the briefed Milestone 178 Voice Engine: already flagged in a prior session, still awaiting a user scope decision.
3. **AI memory** — `cozy-memory-engine.js` (real, in active use) vs. `cozy-ai-memory.js` (degraded/reconstructed, `INFERRED` placeholders, not called by `cozy-ai.js`): likely legacy/superseded, not confirmed dead.

No new authority was created, no dead file was revived, and no responsibility was moved between existing authorities in the course of this audit.

## Dead / recovery candidates
- `core/ai/cozy-ai-memory.js` — real logic survives from "§9 MEMORY STATISTICS" onward; header/constructor were reconstructed only for syntax validity in an earlier session. Recovery candidate, not a live authority.
- `core/modules/learning/universal-learning-pipeline.js`'s OCR dependency — the OCR engine it composes is "a documented stub with no executable pipeline yet" per that file's own header (pre-existing, disclosed gap, not new).

## First genuinely incomplete dependency
The **AI OCR** ownership conflict (`cozy-ocr.js` vs. `ocrstudio/`) is the first item on this list that blocks further OCR-adjacent AI work until a scope decision is made — mirroring the already-open Voice Engine conflict.

## Tests actually run
```
node --test server/ai/test/gemini-backend-endpoint.test.js \
  server/ai/test/gemini-runtime-harness-server.test.js \
  core/modules/intelligence/knowledge/teach/tests/cozy-teach-cozyai-routing-core.test.js \
  core/modules/intelligence/language/tests/rp-028-luo-availability.test.js
```
Result: **4 suites, 40 subtests, 0 failed.**

## Full-tree diff against the input checkpoint
**ZERO production files changed.** The only addition made by this milestone is this audit document itself, under `docs/audits/`.

## Certification level achieved
Audit-only — no code certification applies. Ownership map verified for the 13 requested AI capability areas.
