# Universal Language & Semantic Intelligence — Architecture Audit

**Status:** Audit only, per the explicit governing instruction: "Before implementing new components, finish the audit and show exactly which existing CozyOS capabilities can already provide each layer... Do not claim any language, accent, offline model, or provider capability unless the repository and tests actually prove it." No new production component was created in this pass. This document extends `MEDIA-INTELLIGENCE-TRANSLATION-ARCHITECTURE-AUDIT.md` (translation-provider layer only) up to the full "Universal Language & Meaning Intelligence" scope: semantic understanding, church-domain terminology, accent/speech variation, natural-language generation, and provenance-governed community knowledge.

**Method:** every claim below cites a real file this pass actually opened and read — not the prior session's summary, not inference from a filename. Where no real component was found, that is stated as a gap, not a proposal to build immediately.

## Section-by-section mapping: what already exists

### §1 Provider-agnostic language intelligence

**Exists, real, already provider-agnostic** (traced in `MEDIA-INTELLIGENCE-TRANSLATION-ARCHITECTURE-AUDIT.md` §1): `window.CozyOS.SpeechTranslationProviders` (`core/modules/speech/adapters/speech-translation-provider.js`) is already a real registry accepting any number of providers under one contract (`{name, type, translate(text, {sourceLanguage, targetLanguage})}`), with `nllb-bridge`, `gemini-translate`, and a real (though absent-in-this-build) `browser-native` provider all coexisting today.

**Genuine gap**: `translate()`'s provider selection is `preferredProviderName ? get(name) : Array.from(_providers.values())[0]` — literally "the first one registered," with **no** scoring by domain, offline/online, confidence, quality, latency, or privacy. The directive's list of selection criteria does not exist as a real mechanism anywhere in this registry today. This is the one part of §1 genuinely not built — reported here, not fabricated as present.

**Also not built**: cross-provider verification/fallback ("use them for cross-checking... but do not blindly send every sentence to every provider"). `SpeechTranslationProviders.translate()` calls exactly one provider once; there is no second call, no comparison, no fallback-on-low-confidence logic anywhere in this file.

### §2 Meaning before translation (intent/entities/context)

**Exists, real, substantial.** This is not a gap — it is one of the most built-out parts of this repository:

- `window.CozyOS.SemanticIntentEngine` (`core/living/cozy-ai-semantic-intent.js`) — real intent/goal/entity/ambiguity/confidence extraction, confirmed by reading `semantic-answer-planner.js`'s own header (SA-3): its `analyze()` output (goal from a real internal `GOAL_MAP`, entities, ambiguity with `clarificationRequired`) is the **primary** goal-resolution authority for the entire Semantic Answer Construction pipeline (§7 below).
- `CognitiveCoordinator` (composing Memory/Policy/Interpretation/Thinking/Reasoning — cited throughout this repository's own `cozy-answer-engine.js` as `cognitiveContext`, built and passed through on every real turn from `cozy-living-assistant.js`) is the real per-turn cognitive result already threaded into the answer chain.
- Conversation-turn classification ("is this a question, command, explanation..." — §2's last bullet) — **not found as a dedicated classifier**; `CozyAnswerEngine`'s own `responseMode` (`FACT`/`EXPLANATION`/`WHY_REASONING`/`COMPARISON`/`INSUFFICIENT_EVIDENCE`) is the closest real analogue, but it labels the *answer*, not the *incoming utterance's speech-act type*. Testimony/prayer/greeting/announcement classification specifically for Media Intelligence's own domain does not exist. **Gap, not fabricated as solved.**

### §3 Church domain intelligence / terminology

**Partially exists, one real gap confirmed directly.**

- `church-intelligence-provider.js` (M367) is real, but its actual scope (confirmed by reading it) is **session/worship orchestration** — sermon timeline, service stage, branch sync, scripture lookup, live-translation orchestration hookup (`ChurchWorshipSession.addListenerLanguage()`) — **not** a terminology/vocabulary glossary. It has zero methods resembling a term lookup for "ibada"/"mahubiri"/"mahudhurio," etc.
- **No dedicated ChurchOS terminology/vocabulary component exists anywhere in this repository** (confirmed: no file matches "terminology," "glossary," or "vocabulary" under `core/modules/ChurchOS/`). This is a genuine, total gap for §3's specific ask.
- **The right existing vehicle for community-contributed terminology already exists**: `CozyLearn`'s real, already-shipped schema extension (this engagement's own earlier Phase 3 work — `claim`/`category`/`provenance`/`conflictsWith` fields, governed by the real Rule 82 promotion gate) is structurally exactly what §3/§14 ask for: provenance-tracked, non-silently-overwriting community knowledge. **It has never been used for church terminology specifically** — no `category: "church-terminology"` records exist, no ChurchOS caller writes to `CozyLearn` today. Reusing it for this purpose is a real, small, additive next step, not a new store — but it is not done yet.

### §4 Accent and speech variation

**Real ASR exists (`SpeechRecognitionAdapter`); accent-specific handling does not.**

Traced directly: `core/modules/speech/adapters/speech-recognition-adapter.js`'s own default `bcp47` language code (`config.languageCode || "en-US"`) is a plain BCP-47 tag — the browser's own `SpeechRecognition` API (which this adapter wraps, per this session's own earlier Kiswahili-first-ASR-default work) has no CozyOS-side accent dimension at all. There is no code anywhere that separates "this is Kenyan-accented English" from "this is a different language" — the directive's own required separation (accent ≠ language identity) is **not implemented**; whatever accent robustness exists is entirely whatever the underlying browser/OS speech engine itself does, invisible to and unverifiable by this repository's own code. **Reported as UNSUPPORTED at the CozyOS layer, not silently assumed to work.**

### §5 Pure, natural Kiswahili generation / morphology

**A real, substantial, previously-unused-for-this-purpose engine exists.**

- `cozy-kiswahili-structural-analysis.js` — confirmed real (cited and precisely described, not merely guessed at, by `cozy-deep-morphology-reference.js`'s own header) with a genuine 8-step decomposition pipeline: `extract_subject_prefix → detect_negation_marker → extract_tense_aspect → extract_object_marker → isolate_verbal_root → identify_derivational_extensions → resolve_final_vowel → map_semantic_family`.
- `cozy-deep-morphology-reference.js` is itself honest about its own limits: it is a **reference-data table only** (advanced tense/clause markers for counterfactual/conditional/temporal constructions) — it does not parse anything, and explicitly names wiring itself into the structural-analysis engine as a real, not-yet-done next step ("left as the explicit next continuation step below, not silently done here").
- **This morphology engine is not currently in the Language Realizer's (SA-4) path** — SA-4's own header (quoted in §6/§7 below) discloses its `GENERATION_MODE` is `"COMPOSED"` (join pre-written evidence text), explicitly not `"MODEL_GENERATED"`. The morphology decomposer exists, is real, and is not yet the thing constructing live Kiswahili sentences for novel questions.

### §6/§7 Semantic fluency levels / fresh sentence construction

**The most important finding of this audit: a real, in-progress, explicitly-scoped pipeline for exactly this already exists, mid-build, in this exact repository.**

`core/modules/intelligence/semantic-answer/` — the "Semantic Answer Construction" pipeline (SA-1 through SA-7, all previously completed in this engagement's own history; SA-8 "Language expansion" and SA-9 "Full regression/certification" are tracked as **pending**, not done):

| Stage | Real file | What it actually does (read directly, not assumed) |
|---|---|---|
| SA-1 | `contracts/*.js` (6 files) | Typed schemas (`cozy.verified-evidence.v1`, `cozy.semantic-answer-plan.v1`, `cozy.language-realization-request.v1`, `cozy.candidate-sentence.v1`, `cozy.response-validation-result.v1`, `cozy.cognitive-decision.v1`) — frozen enums, no numeric confidence scores (HIGH/MEDIUM/LOW/UNKNOWN only, matching this repo's own existing convention) |
| SA-2 | `evidence/verified-evidence-adapter.js` + `source-adapters/*.js` | Wraps real, existing authorities (CozyKnowledge, CozyMemory) as `VerifiedEvidence` records — never a second knowledge store |
| SA-3 | `planning/semantic-answer-planner.js` | Converts a question into a **plan** (goal + entity + claims, each grounded in a real evidence id) using `SemanticIntentEngine.analyze()` as the primary goal authority. Explicitly, by its own header: **"PLANNING ONLY, NOT GENERATION"** — never emits response text. |
| SA-4 | `realization/language-realizer.js` | Turns a plan into a `CandidateSentence`. **`GENERATION_MODE: "COMPOSED"`** — joins already-real, already-committed evidence text (e.g. a human-authored `humanBenefitsSw` string) with a template intro sentence (via the Phase-4 `CozyLanguageRealize` seam, §7 below) — explicitly, by its own header, **not** `"MODEL_GENERATED"`, which it names as **SA-8 scope, not built here**. |
| SA-5 | `validation/response-validator.js` | Validates a candidate against SA-1's contract before it can reach the user |
| SA-6 | `repair/repair-loop.js` | A real repair step when validation fails |
| SA-7 | (Live Window integration, per the task history) | Wires the above into the real Live Window path |

**Direct answer to §6/§7's ask**: the directive's "construct a new sentence from semantic intent... rather than search exact phrase → fail" is **not yet built** — SA-4's own header states the opposite is deliberately true today (`COMPOSED`, from pre-written evidence strings, never generated fresh from morphology + intent). This is not a hidden gap this audit discovered; it is a gap the repository's own prior work already named and scheduled as **SA-8**, still pending. The directive's requirement and this repository's own next planned milestone are the same thing.

**Semantic fluency levels 1-7 (§6)**: no dedicated 7-level scoring rubric exists anywhere. SA-5's `response-validator.js` performs real, contract-shaped validation (evidence grounding, language match, structural soundness) — a genuine quality gate, but not organized as the directive's specific lexical→grammatical→semantic→contextual→cultural→conversational→intent ladder. Reported as a gap in *organization*, not in *substance* — several of those seven concerns are covered piecemeal by SA-5, just not named or measured as seven distinct levels.

### §8 Conversational language construction (context across turns)

**Real, existing.** `cozy-living-assistant.js`'s `#getOrCreateConversationId()` plus `CozyMemory`'s recall (threaded through `CozyAI.getContext()`, per `cozy-answer-engine.js`'s own header) already carries conversation state across turns; the `entityHint` mechanism (this engagement's own earlier work, cited in `cozy-answer-engine.js`'s "UNIVERSAL QUESTION UNDERSTANDING REPAIR" comment) already exists specifically to resolve a bare pronoun/topic-less follow-up against the previously-discussed application. Whether it correctly resolves *"Na mahudhurio je?"* after a ChurchOS discussion specifically was not re-tested in this pass (out of scope for this audit-only pass) — the mechanism for it is real and already-composed, not a gap to build from scratch.

### §9/§12 Reasoning-before-translation / one source, many targets

**Already fully audited in `MEDIA-INTELLIGENCE-TRANSLATION-ARCHITECTURE-AUDIT.md` §5.** `core/modules/ChurchOS/live-church-language-orchestrator.js` already implements exactly the "one pastor, N members, N different target languages, one authoritative source segment, never duplicated AI" scenario — re-cited here because §9/§12 of this new directive restate that exact scenario. Not re-audited a second time in this document; see that file's §5 for the full trace.

### §10/§11 Universal language graph / source preservation

**§10 (any-to-any, no English pivot)**: already confirmed in the translation audit §1 — no provider in this repository pivots through English. **§11 (source preservation)**: **partially real, one concrete gap found.** `LDCESessionEngine`'s own `#logToTranscript()` preserves a real transcript for LIVE SESSIONS (confirmed this engagement's own Live Session voice-bridge work). For **Media Intelligence** specifically, the gap already identified in the translation audit (§6 there) stands: `cozy-remote-media-index.js`'s `createRecord()` stores no transcript field at all — there is no original text to preserve or regenerate a translation from, for indexed testimony/media content. Live sessions have source preservation; indexed media content does not yet.

### §13 Offline-first classification

Already fully covered in `MEDIA-INTELLIGENCE-TRANSLATION-ARCHITECTURE-AUDIT.md` §8, using the same categories (fully local/offline, local companion service, browser/device, optional/required internet). Not repeated here.

### §14 CozyLearn / community knowledge provenance

**The mechanism already exists; it has just never been pointed at church terminology specifically.** As found in §3 above: `CozyLearn`'s real schema (from this engagement's earlier Phase 3 work) already has `claim`/`category`/`provenance`/`conflictsWith`, gated by the real Rule 82 promotion mechanism (a contribution starts un-trusted and must be promoted, never silently becoming universal truth — confirmed by this engagement's own prior P4-2 work extending that exact gate). This satisfies §14's provenance/approval-status/version requirements structurally. **Gap**: nothing currently writes a `category: "church-terminology"` (or `pronunciation`/`abbreviation`/`title` sub-category) record into it — the storage and governance exist; the ChurchOS-side caller does not yet.

### §15 Voice/translation separation

**Already correct, already audited.** `MEDIA-INTELLIGENCE-TRANSLATION-ARCHITECTURE-AUDIT.md` §1 and §5 both confirm: no translation provider creates its own TTS, and `live-church-language-orchestrator.js` calls `LivingTTS.speak()` (composing the one real `VoiceManager`) only after translation is complete — never before, never a second speak path. The bilingual-voice requirement ("every selectable voice must support English and Kiswahili where the actual provider supports both") is the Universal Voice Catalog's own concern (`core/modules/speech/voice-catalog.js`, built earlier in this engagement's Universal Voice phase) — not re-audited here.

### §16 Quality and fallback hierarchy

**Not built as a real, ordered hierarchy anywhere.** `SpeechTranslationProviders.translate()` picks one provider (first-registered or explicitly named) and either succeeds or reports `isReal:false` — there is no local-knowledge-first → local-model → companion-model → online-provider → secondary-verification → honest-clarification chain anywhere in this codebase. This is the same gap as §1's missing provider-selection scoring, restated at the response-quality level. **Genuine, disclosed gap**, matching §16's own explicit "never fabricate... never claim... never silently change meaning" requirements, which the CURRENT fail-closed behavior of every real provider already satisfies individually — what's missing is the ORCHESTRATION across providers, not honesty within any one of them.

### §17 Testing

Existing, real test coverage directly relevant to several of the required categories was confirmed this pass (not re-derived): `core/modules/intelligence/semantic-answer/` has its own fixture-driven test suites for SA-1 through SA-7 (per the engagement's own history); `speech-translation-provider-nllb.test.js`/`.integration.test.js` exist for the translation-provider layer; `cozy-answer-engine-comparison-intent.test.js` and this pass's own new `cozy-answer-engine-media-intelligence.test.js` cover cross-language equivalence patterns for specific intents. A dedicated, repository-wide "translation/semantic matrix" test suite spanning all 17 canonical languages × the directive's required categories (novel questions, code-switching, church domain, accents, cross-language consistency) does **not** exist as one coherent suite — building one is real, substantial work belonging to a dedicated future pass, not fabricated as already covered.

### §18 One architecture, not competing brains

**Confirmed true of everything traced in both audit documents.** Every real component found — `SpeechTranslationProviders`, `SemanticIntentEngine`, the Semantic Answer Construction pipeline, `CozyLearn`, `live-church-language-orchestrator.js`, `VoiceManager`/`LivingAssistant` — is a single, non-duplicated authority for its own concern, composed by callers rather than reimplemented. No second "Kiswahili brain" or "Church brain" was found anywhere. The directive's own architectural rule is already the reality of this codebase's existing design, not a correction this pass needed to make.

## Proposed schemas (documentation only — not implemented this pass)

Per the explicit instruction to "define translation request and response schemas" and "add concrete implementation interfaces" as part of finishing the audit, the following are **proposals**, written in the exact real convention SA-1's contracts already use (`cozy.<name>.v1`, frozen enums, HIGH/MEDIUM/LOW/UNKNOWN confidence, never a numeric score) — not new files, not new running code. Building them for real is future work, gated on this audit being reviewed.

```
cozy.universal-translation-request.v1
{
  schemaVersion: "cozy.universal-translation-request.v1",
  sourceText: string,               // required, non-empty
  sourceLanguage: string,           // one of the 17 canonical CozyLanguagePacks codes, or "auto" (real detection is a separate, unbuilt capability — see gap list)
  targetLanguage: string,           // one of the 17 canonical codes
  domain: "general" | "church" | "media-intelligence" | ...,  // extensible, drives which terminology/knowledge sources are consulted
  intentHint: SemanticAnswerPlan | null,   // SA-3's real plan, when one already exists for this text — avoids re-deriving intent
  requireDirectPair: boolean,       // when true, refuse a provider that would use an undisclosed intermediate language
  offlineOnly: boolean,
  preferredProviders: string[] | null,  // ordered preference; never a mandate that ignores real availability
}

cozy.universal-translation-response.v1
{
  schemaVersion: "cozy.universal-translation-response.v1",
  translatedText: string | null,    // null only when isReal is false
  isReal: boolean,
  sourceLanguage: string,
  targetLanguage: string,
  providerName: string | null,
  pathType: "DIRECT" | "INTERMEDIATE_LANGUAGE_FALLBACK" | "UNSUPPORTED" | "NOT_TESTABLE",
  intermediateLanguage: string | null,   // populated only when pathType is INTERMEDIATE_LANGUAGE_FALLBACK; must never be silently absent when a pivot genuinely occurred
  confidence: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN",
  offlineCapable: boolean,
  sourcePreserved: { transcriptId: string } | null,  // links back to an unmodified original, per §11
  reason: string | null,            // required, human-readable, whenever isReal is false or pathType is not DIRECT
}
```

These deliberately mirror `speech-translation-provider.js`'s real, current `translate(text, {sourceLanguage, targetLanguage})` contract as a strict superset (existing callers would not break) rather than a replacement — consistent with the directive's own "reuse existing infrastructure" instruction.

## Measurable acceptance criteria (proposed, not yet gated on any implementation)

1. **No English pivot without disclosure**: for every real translation call in this repository, `pathType` (per the schema above) is never silently `INTERMEDIATE_LANGUAGE_FALLBACK` — a passing test must assert `intermediateLanguage !== null` whenever that path type is reported.
2. **Direct-pair coverage matches canonical registry**: for the two real providers, `SUPPORTED_LANGUAGES.length === CozyLanguagePacks.DEFAULT_IDENTITIES.length` stays true (currently 17 === 17, verified this pass) — a regression test should assert this equality so a future edit to either list is caught immediately.
3. **Provenance non-regression**: a `CozyLearn` church-terminology record's `approvalStatus` must never be readable as `"APPROVED"` before a real Rule-82-equivalent promotion call succeeds — mirroring the existing Tier-2 gate's own tested behavior.
4. **Composed vs. generated is always disclosed**: any future SA-8 "MODEL_GENERATED" candidate sentence must carry a `GENERATION_MODE` field distinguishing it from SA-4's current `"COMPOSED"` mode, so a caller (or a test) can always tell which kind of sentence it received.
5. **No fabricated language support**: a capability-status call for any language/provider pair must be traceable to a real, cited test or real, cited source file — this audit itself is held to that standard throughout.

## What was and was not done this pass

**Done**: read every file cited above directly (not from memory of a prior summary); confirmed the SA-1..SA-7 pipeline's real, current `COMPOSED` (not generative) behavior directly from its own source; confirmed the absence of a ChurchOS terminology component via direct search; confirmed `CozyLearn`'s schema is real and reusable but unused for this purpose; proposed schemas and acceptance criteria as documentation only.

**Not done, and not fabricated as done**: no provider-selection scoring engine was built; no church-terminology store was created; no accent-classification layer was built; no SA-8 model-generation capability was built; no cross-provider verification/fallback chain was built; no new test suite spanning the full language matrix was written. Every one of these remains a real, named, disclosed gap for a future, dedicated implementation pass — consistent with the explicit instruction governing this document.
