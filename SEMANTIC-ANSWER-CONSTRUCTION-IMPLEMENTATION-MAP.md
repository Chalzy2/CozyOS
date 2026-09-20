# CozyAI Semantic Answer Construction — Implementation Map

**Status: audit only — no production code changed yet.** Written per the
spec's own "FIRST: ...produce a concise implementation map before
editing" instruction. Everything below was confirmed by direct
inspection of the real repository, not assumed. File:line citations are
exact as of this audit.

---

## 1. The current answer pipeline, as it really is today

```
#send() (cozy-living-assistant.js:564)
  ├─ LivingAI.think() (unchanged side effects: state/sounds/CognitiveCoordinator diagnostics)
  ├─ CozyAnswerEngine.answer() (cozy-answer-engine.js:191)
  │    ├─ CozyIdentityFAQRouter.resolve()   [identity/origin/vision — tried first]
  │    └─ CozyAI.getContext() (cozy-ai.js)
  │         ├─ CozyKnowledge (fact getters, pre-written .answer strings)
  │         ├─ CozyMemory.searchAllNamespaces()
  │         └─ ChurchWorshipSession / OrganizationSupport (live-session, support contexts)
  ├─ CozyAdvisor.advise()   [meta dev-advice wrapper; UNKNOWN_REQUEST = pass-through]
  └─ FALLBACK, if the above produced nothing / non-VERIFIED:
       resolveConversationalReply(result.result)  ← rule-based-conversational-provider.js,
       via LivingAI.think()'s OWN separate reply path (Kiswahili lives almost entirely here)
```

**The core problem, confirmed exactly as the spec describes it:**
`CozyAnswerEngine` "has no language concept at all" (cozy-living-
assistant.js:760, the codebase's own words). It only ever returns
pre-written English strings pulled verbatim out of `CozyKnowledge`
facts (`renderResultContent()`, cozy-answer-engine.js:115) and joins
them with fixed connective phrases ("Additionally,", cozy-answer-
engine.js:323). Real non-English answering — Kiswahili in particular —
happens almost entirely in a **second, separate track**:
`rule-based-conversational-provider.js`'s own `resolveConversationalReply()`,
selected only as a *fallback* by `#send()`'s own preference logic
(cozy-living-assistant.js:748-781). This is precisely the "second
visible response track" §9 of the spec warns against, and precisely
why "generate English first, translate second" keeps recurring — there
is no shared semantic layer between the two tracks today.

---

## 2. What already exists, mapped to the spec's 5 contracts

| Spec contract | Closest existing piece | Gap |
|---|---|---|
| **A. Semantic Answer Plan** | `SemanticIntentEngine.analyze()` — `core/living/cozy-ai-semantic-intent.js:452` (Phase 6/6a, `window.CozyOS.SemanticIntentEngine`). Real `INTENTS` (`APP_BENEFITS, APP_CAPABILITIES, APP_COMPARISON, CAPABILITY_QUERY, EXPLANATION_REQUEST, UNKNOWN_INTENT`, …) and `GOAL_MAP` (`UNDERSTAND_USEFULNESS, UNDERSTAND_CAPABILITIES, MAKE_COMPARISON_DECISION, …`) exist and are schema-versioned (`"1.1.0-phase6a"`). **It is not called anywhere in the CozyAnswerEngine chain today** (confirmed absent by grep + cozy-answer-engine.js's own header disclaiming any NLU engine). `CozyAnswerEngine`'s own `responseMode`/`intent` (cozy-answer-engine.js:149-166) is a separate, cruder, partially-overlapping taxonomy (`FACT/EXPLANATION/WHY_REASONING/COMPARISON` × `APPLICATION/HUMAN_BENEFITS/IMPORTANCE/…`). | Neither taxonomy has the spec's exact goal vocabulary (`HUMAN_BENEFIT, CAPABILITY, IMPORTANCE, VALUE, PRACTICAL_WORK_CONTRIBUTION, DIFFERENTIATION, DEFINITION, LIST, HOW_TO, CLARIFICATION`). SA-3 must define a real `SemanticAnswerPlan` schema and a mapping FROM `SemanticIntentEngine`'s real goals INTO it — not reinvent intent detection. |
| **B. Verified Evidence** | `CozyKnowledge` getters already return `{evidence: "VERIFIED"\|"PARTIALLY_VERIFIED"\|"NOT_FOUND"\|"NOT_A_CAPABILITY", answer, source}` (cozy-knowledge-registry.js, many getters). `APPLICATION_HUMAN_PURPOSE_DATA` (cozy-knowledge-registry.js:430-1261) already carries per-app `humanBenefits/humanBenefitsSw/currentVerifiedCapabilities/whoBenefits/…`, **including pre-written Kiswahili siblings** (`resolvePurposeForLanguage()`, :1285, fails closed if a `sw` sibling is missing). `CozyMemory` results carry real `owner`/`visibility` metadata. | No `id`, `source{type,id,path}`, or `verification{status,confidence}` object shape exists — today's "evidence" is the getter's own ad hoc return shape. SA-2's evidence facade must WRAP these existing getters into the spec's `VerifiedEvidence` record, not replace them. `sensitivity` must default from `CozyMemory`'s real `visibility` field when the evidence came from there, and default to `"public"` for `CozyKnowledge` facts (which have no sensitivity field today — confirmed absent). |
| **C. Language Realization Request** | Nothing. `CozyLanguageRegistry.resolveLanguage()`/`isAvailable()` (cozy-language-registry.js:94-166) is the real "is this language usable" gate (5 `AVAILABLE` languages today: `en, sw, fr, ar, so`) and must be the source of the request's `language` field — but no request/response shape around it exists. | New (SA-4), thin. |
| **D. Candidate Sentence** | `cozy-language-templates.js` (fixed, verified template strings per intent+language) is the closest thing to "generation" that exists — confirmed by repo-wide search that **no structured-facts→sentence generator exists anywhere in this repo**. Kiswahili "generation" today is either (a) a pre-written `humanBenefitsSw` string read verbatim, or (b) NLLB machine translation via `speech-translation-adapter.js` → `speech-translation-provider-nllb.js` → the real Python bridge (`nllb_http_bridge.py`). | This is the single largest genuinely-new piece of work. SA-4's realizer should START by composing pre-written evidence (English or the real Kiswahili sibling when the claim's evidence already carries one) into natural sentences via template/rule composition — genuine "construct from meaning" NLG is explicitly a later, honestly-scoped capability (SA-8), not invented wholesale in SA-4. |
| **E. Response Validation Result** | Nothing dedicated. `CozyLanguageRegistry.isAvailable()` can back the `language` check; entity checks can reuse `SemanticIntentEngine`'s own entity resolution (`extractEntity()`, cozy-ai-semantic-intent.js:403) or the canonical `resolveApplicationByName()` (rule-based-conversational-provider.js:1326). | New (SA-5), but every individual check composes an existing authority — no new entity/grammar engine needed for v1; "grammar"/"naturalness" for a template-composed sentence is close to trivially PASS by construction, honestly disclosed as such rather than faked with a fabricated NLP grammar checker. |

---

## 3. CozyLearn / evidence-promotion boundary (relevant to §8's authorization requirement)

Two distinct, real systems — do not conflate, do not build a third:
- **`core/living/cozy-learn.js`** (`window.CozyOS.CozyLearn`) — unknown-word/typo learning. `STATUS: OBSERVED→CANDIDATE→USER_CONFIRMED/VALIDATED→TRUSTED` (`promoteCandidate()`, cozy-learn.js:242, hard-rejects unless already `USER_CONFIRMED`/`VALIDATED`).
- **RP-029 community pipeline** (`window.CozyOS.CozyKnowledgeCommunity`) — `REVIEW_STATES: CANDIDATE→UNDER_REVIEW→CONFIRMED/DISPUTED/REJECTED/UNRESOLVED`, separate `confidenceLabel()`, real quarantine lifecycle.

**Neither ever writes into `APPLICATION_HUMAN_PURPOSE_DATA` or produces a `CozyKnowledge` `"VERIFIED"` tag.** That table is static, human-committed data with no promotion pathway today. This matters for SA-2/SA-3: a `SemanticAnswerPlan`'s claims may reference `CozyLearn`/`CozyKnowledgeCommunity` evidence too (e.g. a user-taught synonym), but such evidence must carry `verification.status` reflecting its REAL state (`CURATED` at best, never `VERIFIED`) — the realizer/validator must be able to tell "static, human-authored, VERIFIED" apart from "community-reviewed, CONFIRMED but not platform-VERIFIED" apart from "user-taught, UNVERIFIED."

---

## 4. Authorization / evidence-sensitivity — two separate systems, confirmed

- **`CozyMemory`** (`core/modules/memory/cozy-memory-engine.js`) — client-side only, self-disclosed as having "no real role-based access control... the caller supplies an actorId it claims to be" (:54-60). Real visibility values: `"private"` (default), `"public"`, `"organisation"`. Gate: `#checkReadVisibility()` (:227-243).
- **`server/webauthn-rp/knowledge-registry.js`** — genuinely separate, server/DB-backed. `VISIBILITIES: PUBLIC, USER, ORGANIZATION, ADMIN, SYSTEM, SECRET` (:135). Real gate: `_checkVisibility()` (:196-208), including a real `OrganizationRegistry.isAuthorized()` check for `ORGANIZATION`-level records.

`CozyKnowledge`'s own facts (the majority of what CozyAnswerEngine answers from today) are **not gated by either system** — they have no sensitivity field at all (implicitly public/static data). SA-1's `VerifiedEvidence.sensitivity` field must therefore default honestly per source: `"public"` for `CozyKnowledge`-sourced claims (accurate — there is no narrower classification to lose), and the real `CozyMemory` `visibility` value (mapped 1:1, no re-derivation) for `CozyMemory`-sourced claims. The realizer must never receive evidence the caller (per SA-2's facade, reusing `CozyMemory`'s/`getContext()`'s existing checks — never reimplemented) isn't already authorized to see, per §8.

---

## 5. TTS — already language-aware, no changes needed for SA-7

`LivingTTS.speak({text, context, language, providerId, settingsId})`
(core/living/living-tts.js:164) → `VoiceManager.speak()`, with `language`
routed via a transient `CozySpeech.registerVoiceSettings()` record
(`withTransientLanguage()`, :134-147). `cozy-living-assistant.js`'s own
`#speak()` (:838) already passes `this.#currentLanguage` through. SA-7
only needs to ensure the final validated `CandidateSentence.language`
flows into this same, already-correct call — no TTS engine change.

---

## 6. Universal AI Contract (Phase 5) — an unused hook, not a blocker

`window.CozyOS.UniversalAIContract` (core/living/cozy-ai-universal-
contract.js) wraps `LivingAI.think()` in a versioned envelope
(`cozy.ai.request.v1`/`cozy.ai.response.v1`). Its `understanding.goal`
and `understanding.confidence` are explicit, disclosed
`NOT_IMPLEMENTED` placeholders (`understandingPlaceholder()`, :194-203)
— by the contract's own comment, this is exactly the gap
`SemanticIntentEngine` (Phase 6) was meant to fill, but no call site
wires them together yet. **Not required for SA-1 through SA-7** (the
new chain integrates at `#send()`/`CozyAnswerEngine` directly, per §9's
"one canonical answer path" — `UniversalAIContract` wraps a different,
legacy `LivingAI.think()` entry point that stays as the disclosed
fallback, unchanged). Worth revisiting in SA-8 to retire the duplicate
placeholder, not before.

---

## 7. Do-Not-Duplicate checklist (confirmed clear)

- Semantic intent detection → reuse `SemanticIntentEngine`, do not build a second one.
- Application/entity resolution → reuse `resolveApplicationByName()` (rule-based-conversational-provider.js:1326), do not build a second canonical resolver (`SemanticIntentEngine`'s own `extractEntity()` is explicitly entity-*spotting* only, by its own header comment — safe to also reuse for lightweight context carry-forward, not as the canonical source).
- Application human-purpose knowledge → reuse `CozyKnowledge.getApplicationHumanPurposeFact()`, never re-copy `APPLICATION_HUMAN_PURPOSE_DATA`.
- Language availability → reuse `CozyLanguageRegistry.isAvailable()`/`resolveLanguage()`, never a second registry. Language *packs* are a distinct, broader container (vocabulary/provenance) that does not itself gate availability — confirmed, not to be conflated.
- Translation → reuse the existing `SpeechTranslationAdapter` → NLLB path for cases where no natural-realization/template path applies yet (disclosed degrade, never silently presented as native generation — the spec's own §1 requirement).
- CozyLearn governance → reuse `cozy-learn.js`'s real promotion boundary; never let a `SemanticAnswerPlan` claim treat an unpromoted `CANDIDATE`/`OBSERVED` entry as `VERIFIED`.
- TTS → reuse `LivingTTS.speak()` unchanged.

---

## 8. Phase sequencing recommendation

SA-1 (contracts+fixtures, zero behavior change) and SA-2 (evidence
facade wrapping existing getters) are safe to build immediately and
independently. SA-3 (planning) can be built and unit-tested against
fixtures without touching `#send()` at all. SA-4 (realization) starts
narrow: compose already-VERIFIED evidence text (including the real,
pre-written Kiswahili siblings `APPLICATION_HUMAN_PURPOSE_DATA` already
has) into a natural sentence per goal — this alone fixes the "English
generated first, then translated" problem for every application-
human-purpose question, which is the majority of the motivating
examples in the spec, without requiring a general NLG engine yet. SA-5/
SA-6 close the validate/repair loop. SA-7 is the only phase that
touches `#send()`/`CozyAnswerEngine`'s live call sites, and only after
SA-1 through SA-6 are independently tested — consistent with the
spec's own "do not replace deterministic fallbacks until regression
evidence shows it's safe."

Per the spec's own explicit instruction: nothing in this document or
the phases that follow is deployed, committed, or pushed until
explicitly instructed.
