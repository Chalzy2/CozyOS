# Universal Language Detection & Propagation Seam — Design Proposal

**Status: DESIGN ONLY. No code modified. Nothing staged, committed, or pushed.**
**Awaiting explicit implementation authorization.**

---

## 1. Current architecture (as it actually is today, traced not assumed)

Three independent components each decide "what language is this," and none of them talks to the others:

1. **`rule-based-conversational-provider.js`'s `detectLanguageHeuristic()`** (~70-word closed Kiswahili marker list, plus a `-je`-suffix rule) → feeds `resolveLanguage({requested, manual, country})`.
2. **`cozy-language-registry.js`'s `resolveLanguage()`** — `const preferred = manual || requested || suggestFromCountry(country) || "en";` (line 235) — **a third, independent fallback-to-`"en"`**, on top of the two detectors. Result becomes `cozy-living-assistant.js`'s `this.#currentLanguage`.
3. **`cozy-ai-semantic-intent.js`'s `detectLanguages()`** (a *separate* ~45-word list) — only consulted by `SemanticAnswerPlanner.planAnswer()` when #1/#2's result (`requestedLanguage`) is falsy. Silently defaults to `"en"` on zero matches (its own comment: `// honest default, matches existing repo-wide convention`).

**The representation is not the problem.** `SemanticAnswerPlanContract`'s `plan.language` field already exists, is required, and is independent of how it gets populated. **Once populated correctly, `response-validator.js:96-105` already has a real, `BLOCKING`-severity `LANGUAGE_MISMATCH` check** (`candidate.language === plan.language` + `registry.isAvailable()`) that the SA-4→SA-5→SA-6 pipeline genuinely enforces.

But two things sit entirely outside that enforced pipeline:
- `cozy-answer-engine.js:646-652` (`ctxResults.length === 0` branch) returns a **hard-coded English string**, never reading the `language`/`effLang` value already in its own scope.
- `cozy-answer-engine.js:124` (`renderResultContent()`) has **no language parameter in its function signature at all** — language isn't ignored there, it's architecturally absent.
- `cozy-ai.js`'s `CONTEXT_STORY_ROUTES`/`CONTEXT_KNOWLEDGE_ROUTES` (239-309) are 100% English-keyed, so Kiswahili input routinely produces `ctxResults.length === 0` in the first place, funneling into the first bullet above.

## 2. Exact failure chain (from real reproduction, `KISWAHILI-FIRST-READINESS-REPORT.md` §2.1/§2.10)

```
"Nina duka."
  → detectLanguageHeuristic(): "duka" not on its list → null
  → resolveLanguage({requested: null, manual: null, country: null}) → "en" (line 235)
  → this.#currentLanguage = "en"  ← WRONG, but not yet catastrophic (still just a guess)
  → answerEngine.answer(text, {language: "en", ...})
  → CozyAI.getContext(): English-keyed routes find nothing for "duka" → ctxResults = []
  → cozy-answer-engine.js:648 → hard-coded English string, unconditionally
```
Three independent points of failure stacked; fixing only the last one (the hard-coded string) would still misroute "duka"-class sentences into the wrong construction path even if it eventually spoke Kiswahili there — the actual detection has to be fixed too, or every future novel Kiswahili sentence repeats this exact chain with a new missing word.

---

## 3. Proposed universal language contract

A new, SA-1-pattern contract — same discipline as `VerifiedEvidenceContract`/`SemanticAnswerPlanContract` (schema-versioned, `validate()`, `create()`, frozen, no behavior of its own) — call it **`cozy.language-identity.v1`**, owned by a new file `core/modules/intelligence/language/language-identity-contract.js`:

```js
{
  schemaVersion: "cozy.language-identity.v1",
  languageId: "sw" | "en" | ... | "UNKNOWN",   // never silently "en" when truly unknown
  dialectRegion: null | "sw-KE" | ...,           // optional, never invented
  modality: "text" | "voice" | "image-ocr",
  source: "EXPLICIT_USER_SELECTION"              // manual setting/"speak to me in Kiswahili"
        | "CONVERSATION_CARRYOVER"                // this session's own prior turn
        | "MARKER_MATCH"                          // curated word list hit (existing mechanism, kept)
        | "MORPHOLOGICAL_MATCH"                    // NEW — shape/affix heuristic
        | "STATISTICAL_MATCH"                      // NEW — n-gram profile
        | "COUNTRY_SUGGESTION"                     // existing suggestFromCountry(), lowest-priority real signal
        | "UNRESOLVED",                            // nothing matched — languageId MUST be "UNKNOWN" here
  confidence: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN",  // same vocabulary VerifiedEvidenceContract already uses
  detectedLanguages: ["sw"] | ["sw","en"] | [],   // ALL signals found, for mixed-language disclosure
  mixedLanguage: boolean,
  conflict: null | { explicitSaid: "sw", detectedSaid: "en" },  // disclosed, never silently resolved away
}
```

**Authority rule, made explicit and enforced in exactly one function:**
```
EXPLICIT_USER_SELECTION
  > CONVERSATION_CARRYOVER (only when the current turn's own signal is UNRESOLVED — never overrides a confident current-turn detection)
  > MARKER_MATCH (HIGH confidence — curated, unambiguous words)
  > MORPHOLOGICAL_MATCH (MEDIUM confidence)
  > STATISTICAL_MATCH (LOW–MEDIUM confidence, only if it clears a real threshold)
  > COUNTRY_SUGGESTION (existing, kept as last real signal — advisory only, per its own existing header)
  > UNRESOLVED → languageId: "UNKNOWN", never "en"
```
There must be exactly **one function** that produces this object per turn. No second implementation of this precedence is allowed to exist anywhere else — this directly closes "three independent places each guess and disagree."

---

## 4. Proposed detection architecture — layered, not either/or

**Recommendation: layered combination, morphological before statistical, both before "give up."**

| Layer | What | Why here |
|---|---|---|
| 1. Marker match (existing, kept) | The current curated word lists, reconciled into ONE shared list instead of two disagreeing ones | Cheapest, highest-precision signal that already exists and works; don't discard working code |
| 2. Morphological-shape heuristic (NEW, small) | Kiswahili's regular subject-prefix + tense-infix + verb-final-vowel pattern (`ni-/u-/a-/tu-/m-/wa-` + `-na-/-li-/-ta-` + stem + `-a`), plus the existing `-je` suffix rule generalized alongside noun-class prefix patterns (`m-/wa-`, `ki-/vi-`, `n-`) | Deterministic, explainable in one sentence per rule, zero data dependency, directly generalizes to "duka"-class novel words that merely aren't verbs/don't hit markers but sit in an otherwise clearly-Kiswahili sentence — actually, "duka" itself is a bare noun with no prefix, so morphology alone will NOT catch an isolated "Nina duka." on the noun's own shape; it catches it via the VERB "Nina" (ni- + -na- + stem "-a" pattern), which is already structurally regular. This is the concrete mechanism that generalizes past "duka" without needing "duka" on any list. |
| 3. Character-level statistical n-gram profile (NEW, small) | A closed, offline, deterministic character-trigram frequency profile per language, computed once from a corpus and shipped as static data (not fetched, not trained at runtime) | Catches what morphology misses (isolated nouns/loanwords in a short phrase, or genuinely unusual constructions); still fully deterministic and explainable ("this text's trigram profile is closer to Kiswahili's reference profile than English's, by margin X") |
| 4. UNRESOLVED | Return `UNKNOWN`, never guess | Never silently becomes `"en"` |

**Data requirements for layer 3 — explicitly, no external dependency:** the reference trigram profiles can be built entirely from content **already committed in this repository** — `cozy-knowledge-registry.js`'s own `humanBenefitsSw`/`realLifeProblemsSw`/`whoBenefitsSw`/`currentVerifiedCapabilitiesSw` fields across every application (a real, substantial, already-verified Kiswahili corpus, tens of paragraphs) for Kiswahili, and the equivalent English fields for English. This is computed **once, offline, at authoring time** (a small build-time script, not a runtime training step) and checked in as static frequency-table data (a few KB per language, comparable in size to the existing marker-word arrays). No network call, no ML model file, no external service.

**Size/performance:** trigram matching against a ~200-300 entry frequency table per language is O(text length), sub-millisecond, and adds no meaningful weight to a codebase that already ships several similarly-sized static tables (`METRIC_KEYWORDS`, `SW_LANGUAGE_MARKERS`, etc.).

**Explainability requirement satisfied:** every layer's result carries its own `source` value (§3) — a caller can always see *why* a language was resolved, never a black-box score alone.

**Compatibility with the existing registry:** the detector's output `languageId` is validated against `CozyLanguageRegistry.isAvailable()`/the registry's own `code` list before being trusted as "real" — the detector never invents a language code the registry doesn't know about.

**Dialect/region:** carried as a separate, optional `dialectRegion` field (§3) — detecting "sw" never blocks on or gets confused by not knowing "sw-KE" vs "sw-TZ"; region is an orthogonal signal (already partially present via `cozy-speech.js`'s `BCP47_OVERRIDES = { sw: "sw-KE" }` for STT) that can be attached without changing the base-language resolution at all.

---

## 5. Proposed propagation architecture

**One new function, one new owner, called once per turn, as early as possible:**

`core/modules/intelligence/language/cozy-language-identifier.js` exports `resolveLanguageIdentity({text, modality, explicitLanguage, conversationState, actorProfile})` → returns the §3 contract object. This module:
- Owns layers 1-4 of §4 internally (the reconciled marker list + morphological heuristic + statistical profile).
- Is the **only** caller of `CozyLanguageRegistry`'s existing `isAvailable()`/`suggestFromCountry()` for this purpose — the registry itself is otherwise unchanged in shape, only its `resolveLanguage()` stops being called ad hoc from multiple sites and instead becomes an internal detail this module composes.

**Call site (single point of entry):** `cozy-living-assistant.js`'s `#send()`, immediately before calling `ai.think()` — computing the identity ONCE per turn and threading the same object through everything downstream, rather than each consumer re-deriving its own guess:

```
#send(text)
  → identity = LanguageIdentifier.resolveLanguageIdentity({text, modality: "text", explicitLanguage: this.#manualLanguageOverride, conversationState: this.#conversationState})
  → this.#conversationState.languageIdentity = identity   // CARRYOVER for next turn
  → ai.think(text, {..., languageIdentity: identity})      // replaces ad hoc resolveLanguage() call inside the provider
  → answerEngine.answer(text, {..., languageIdentity: identity})  // replaces the bare `language` string
  → SemanticAnswerPlanner.planAnswer({..., languageIdentity: identity})  // replaces requestedLanguage/intentResult.language priority scramble
```

**Backward compatibility:** every existing function that currently accepts a bare `language: "sw"` string keeps accepting one — `languageIdentity` is threaded ADDITIVELY (an optional richer object), and each function derives its old bare-string behavior via `identity.languageId` when only that's needed, so nothing with an existing test suite has its call signature broken. `SemanticIntentEngine.analyze()`'s own `detectLanguages()` becomes a **fallback path only** — called internally *only* when no `languageIdentity` was supplied in `context`, preserving every existing caller (including its own extensive test suite) that never passes one.

**Clarification/follow-ups:** because `languageIdentity` is carried in `conversationState` (persisted turn-to-turn, same field cozy-living-assistant.js already persists `lastDiscussedApplication` in), a genuinely ambiguous follow-up ("Na hii je?") inherits the *prior resolved* language identity rather than re-guessing from three words alone — directly using the CONVERSATION_CARRYOVER tier of the authority rule in §3.

**New sessions:** carryover is explicitly session-scoped (matches the existing `#conversationState` field's own lifetime — reset on a fresh Live Window open, exactly like today). No persistence across browser sessions is proposed here — that would be a distinct, larger feature (a stored user language preference, which `identity-engine.js`'s Profile language fields already partially model per the earlier Phase 4 audit) and is out of this design's scope unless you want it folded in.

**STT/TTS propagation:** both already accept a `language`/`languageCode` config value (`speech-recognition-adapter.js:98`, `cozy-tts-browser-adapter.js:105`) — this design changes **only where that value comes from** (the same `identity.languageId`/`identity.dialectRegion` object, feeding the existing `BCP47_OVERRIDES` mechanism), never their real recognition/synthesis mechanics, which are correct today and untouched.

**Future languages:** adding Luo means adding its marker list + (optional) morphological pattern + a trigram profile to this ONE module's data tables, and marking it `AVAILABLE` in `cozy-language-registry.js` once `cozy-language-templates.js` has real verified templates for it (that registry already has Luo/Kikuyu/Kikamba/Zulu/Luganda/Igbo pre-registered as `NOT_READY` for exactly this reason — the extensibility point already exists and needs no new code, only data + templates).

---

## 6. UNKNOWN / conflict behavior — explicit rules

- **Never** convert `UNKNOWN` into `"en"` anywhere in this design. Every consumer of `languageIdentity` must handle `languageId === "UNKNOWN"` as a real, distinct case.
- **Conflict** (explicit says one thing, detected says another): explicit wins per the authority rule, but `identity.conflict` is populated and disclosed in diagnostics (never silently dropped) — this is real, useful signal for a future W10 learning pass (e.g., "the user always overrides detection to X" is itself a correction worth learning from, reusing the EXISTING `CozyLearn`/correction-learning machinery per the "no second learning system" rule — not something this design builds, only something it doesn't foreclose).
- **UNKNOWN construction behavior:** `tryConstructSemanticAnswer()`/the `getContext()` fallback must not silently pick English when `languageId === "UNKNOWN"`. Instead, reuse the EXISTING, already-real clarification mechanism (`goal: "CLARIFICATION"` path SA-3 already has) with a genuinely neutral, minimal, already-multilingual clarification prompt (a new `cozy-language-templates.js` key realized in whatever languages ARE registered `AVAILABLE`, concatenated or alternated — e.g., "Samahani, sielewi vizuri. / Sorry, I didn't catch that clearly." — reusing the realize() seam, not inventing a new one) rather than defaulting to any one language's honest-refusal string.
- **Mixed-language input:** `detectedLanguages` carries all real signals found; `languageId` (the single value everything else consumes) is the dominant one, chosen by a real, disclosed rule — not "first match wins" arbitrarily, but a weighted count: morphological/marker hits on native-language grammatical elements (verb prefixes, conjugated forms) count more than isolated content-word loanwords ("stock", "app"), matching the readiness report's own finding that `"Nataka app ya kusaidia biashara yangu, especially stock na sales."` should resolve to Kiswahili-dominant despite 3 English words, because "Nataka"/"kusaidia"/"biashara"/"yangu" are the grammatical backbone of the sentence.

---

## 7. Response-construction convergence plan

**Immediate (this design's actual deliverable when authorized):**
1. `cozy-answer-engine.js:648` — replace the hard-coded string with a `cozy-language-realize.js` template lookup (`"answer:no-verified-information"`, new key, en/sw templates authored), keyed on `identity.languageId`, with an explicit `UNKNOWN` branch per §6.
2. `cozy-answer-engine.js:124` (`renderResultContent()`) — add a `language`/`identity` parameter; move its hard-coded app-list sentence into the same `cozy-language-realize.js` seam (mirroring exactly how the Cluster 7 fix converted `semantic-answer:intro:*` from static strings to language-aware functions — same mechanism, same file, no new capability class).
3. `cozy-ai.js`'s `CONTEXT_STORY_ROUTES`/`CONTEXT_KNOWLEDGE_ROUTES` — extend with a parallel Kiswahili keyword array per route, same shape `cozy-business-data-intent.js`'s own `METRIC_KEYWORDS` already proves out in this exact repository (`{keywords: ["help"], sw: ["msaada","kusaidia","kunisaidia"], getter: ...}` or equivalent).

**Structural, longer-term (explicitly NOT this pass):** the `getContext()` path has no `response-validator.js` gate at all, unlike the SA-1..SA-6 pipeline. The durable fix is not "add a second validator for the old path" (a duplication) but to keep growing SA-3's `GOAL_FIELD_MAP`/evidence coverage so more question categories construct through the ALREADY-validated SA pipeline instead of the older path, shrinking the older path's surface area over time until convergence. This is a sequencing decision for future waves, stated here so it isn't lost, not something this pass implements.

**No hard-coded English fallback may bypass the language contract** once §7.1-7.3 land — every remaining string-returning branch in `cozy-answer-engine.js` would need the same audit-and-convert treatment; §7.1/7.2/7.3 close the two confirmed, reproduced leaks — a final grep-based sweep for any other bare string literal returned as `answer:` in that file is recommended as a verification step before declaring this wave done, not assumed complete from these three.

---

## 8. Native sentence construction — preserved, not replaced

Nothing in this design adds a new template-driven "intent → canned sentence" path. `cozy-language-realize.js`'s existing role — function-shaped templates that take real parameters (entity names, connector words, counts) and compose them into natural sentences, exactly as Cluster 7's entity-aware intro fix already demonstrates — is reused, not expanded in kind. The NEW template keys proposed in §7 (the "no verified information" and "these applications are" sentences) are the same class of thing already in that file: fixed **connective/fallback/safety** scaffolding, never the actual meaning-bearing content, which continues to come from real evidence (`plan.claims`) exactly as SA-4 already does today for every native-Kiswahili answer that already works.

---

## 9. Gemini / external dependency assessment

**No external dependency is required for this design.** Every layer in §4 is deterministic, offline, and buildable from data already committed in this repository. Gemini is not proposed anywhere in this design, is not CozyAI, and is not introduced as a second conversational engine.

**The one external dependency that exists in this whole area is unrelated to this design** and was already identified in the readiness report: real, installed Kiswahili STT/TTS voice packs on an end user's actual device (§5.1 of that report) — a verification-only concern (can real Kiswahili speech be recognized/synthesized with good quality on a real device), not a detection/propagation capability gap, and not something this design's code changes affect either way.

**If, in a future wave, a newly-added language (e.g. Luo) has zero existing Kiswahili-style committed corpus to build a statistical profile from**, the exact, narrow, documented need at that time would be: a small (a few paragraphs) sample of real, human-authored text in that language, sourced by you or a contributor, to compute its trigram profile — the same kind of content-authoring dependency `cozy-knowledge-registry.js` already has for every language's `humanBenefitsSw`-style fields, not a model or an API integration. This is flagged for completeness per your instruction, not because it blocks anything in this design.

---

## 10. Files that would need modification (when authorized — none modified now)

**New (2 files):**
- `core/modules/intelligence/language/language-identity-contract.js` — the §3 contract (SA-1 pattern: `validate()`/`create()`, frozen).
- `core/modules/intelligence/language/cozy-language-identifier.js` — the §4/§5 layered detector + `resolveLanguageIdentity()`, the one authoritative function.

**Modified (targeted, additive):**
- `core/modules/intelligence/providers/rule-based-conversational-provider.js` — `detectLanguageHeuristic()`/`resolveLanguage()`'s call sites delegate to the new identifier instead of maintaining an independent list; `this.#currentLanguage`-equivalent state becomes (or wraps) the identity object.
- `core/living/cozy-ai-semantic-intent.js` — `analyze()` accepts an optional pre-resolved `languageIdentity` in `context`; `detectLanguages()` becomes the fallback-only path, unchanged in its own internals, only demoted in priority.
- `core/living/cozy-living-assistant.js` — one new call to `resolveLanguageIdentity()` per turn in `#send()`; threads the result through the existing `ai.think()`/`answerEngine.answer()` calls alongside (not instead of) the existing `language` string param.
- `core/modules/intelligence/answer/cozy-answer-engine.js` — the three fixes in §7.1/§7.2/§7.3.
- `core/modules/intelligence/language/cozy-language-templates.js` — new template keys for the two previously-hard-coded strings + the UNKNOWN-language clarification prompt.
- `core/modules/intelligence/cozy-ai.js` — extend `CONTEXT_STORY_ROUTES`/`CONTEXT_KNOWLEDGE_ROUTES` with parallel Kiswahili keyword arrays.
- `core/modules/speech/cozy-speech.js` / adapters — read `identity.languageId`/`identity.dialectRegion` at their existing config-consumption points; no change to real recognition/synthesis logic.

**Must remain untouched (explicitly, per the preservation rules):**
- `semantic-answer-planner.js`, `language-realizer.js`, `response-validator.js`, `repair-loop.js` — the SA-1..SA-6 core; they already do the right thing once given a correct language, and the WAVE 6/7 sensitivity gate in `semantic-answer-planner.js` must not be touched by this work at all.
- `cozy-business-data-intent.js` — already correctly bilingual; not in scope.
- `cozy-language-registry.js`'s own public shape (`isAvailable()`, the language list, `AVAILABLE`/`NOT_READY` states) — reused as-is, not restructured.
- STT/TTS adapters' actual recognition/synthesis mechanics — only their language-config *source* changes, never their fail-closed, honest-reporting behavior.
- Every already-committed Kiswahili content field in `cozy-knowledge-registry.js` (including this session's own Wave 7b "wa kanisa" fix) — read from for the statistical profile, never edited by this work.

---

## 11. Focused tests required (when authorized)

- `language-identity-contract.test.js` — schema validation, same pattern as every other SA-1 contract test.
- `cozy-language-identifier.test.js` — layered detection: marker hits (HIGH), morphological-only hits on genuinely novel Kiswahili sentences NOT in any marker list (MEDIUM) — including your own named examples "Nina biashara.", "Nisaidie tafadhali.", and at least one sentence invented fresh for this test that appears nowhere else in the repository, to directly prove generalization rather than a patched case — statistical-only hits (LOW-MEDIUM), true UNKNOWN cases (e.g. a bare number, a single ambiguous loanword), explicit-override-wins-over-detection, conversation-carryover-wins-when-current-turn-is-UNRESOLVED, mixed-language dominance-weighting.
- Regression-style tests proving every EXISTING marker-based detection still resolves identically (no behavior change for already-working cases) — a direct byte-for-byte comparison against the current `detectLanguageHeuristic()`/`detectLanguages()` outputs for the full existing test matrix in both files' own test suites.
- `cozy-answer-engine.js` — new tests for the two converted fallback strings: EN, SW, and UNKNOWN language cases each producing a real, distinct, correct string, reusing the same `loadFullStack()` pattern as every other test file in this area this session already used.

## 12. Real-browser tests required

- Re-run every phrase in `KISWAHILI-FIRST-READINESS-REPORT.md` §7's probe log (29 turns) and confirm §2.1 ("Nina duka.") and the "Unaweza kunisaidia?" case now resolve in Kiswahili.
- New real-browser probes for sentences that appear **nowhere** in this session's history (to test genuine generalization, not memorized fixes) — e.g. a freshly-composed Kiswahili sentence about a topic never asked about yet.
- EN→SW→EN and SW→EN→SW continuity (already covered by the Wave 6/7 checkpoint's own suite) re-run to confirm no regression.
- A genuinely UNKNOWN-language probe (e.g. a short ambiguous string, or a real different-language sentence like French) to confirm it returns a real clarification, never silently English.
- Mixed-language dominance probe re-run (`"Nataka app ya kusaidia biashara yangu, especially stock na sales."`) to confirm single-language-dominant construction instead of the current two-language-stitched answer.

## 13. Regression strategy

Full sweep identical in shape to every prior checkpoint this session: the focused new suites above; the full SA-1..SA-6/answer/knowledge/language batch (currently 339/339); the cognitive-providers batch (41/41); the full real-browser Live Window suite set (currently 65/66, with the one pre-existing unrelated failure re-confirmed unaffected); `git diff --check`; before/after reproduction proof for every fix (stash the specific file, show the original failure re-occurs, restore, show it's fixed) — the same discipline already used for the Wave 6/7 checkpoint.

## 14. Preservation / no-duplication analysis

- **One CozyAI, one Live Window:** unchanged — no new engine, no new orchestrator.
- **No second language engine:** the new identifier module REPLACES two existing ad hoc detectors with one; net detector count goes from 2 (soon 3, counting the registry's own fallback) down to 1 authoritative function. This is consolidation, not addition.
- **No second learning system:** the `conflict` field (§6) is designed to be *consumable* by the existing `CozyLearn`/correction-learning machinery in a future wave, not to trigger a new one now.
- **No second knowledge database:** the statistical profile data is derived from, not duplicative of, the already-committed knowledge registry content.
- **`cozy-language-registry.js` itself is extended in usage, not restructured** — its `AVAILABLE`/`NOT_READY` states and existing language list are the natural home for every future language this design enables, exactly as its own header already anticipated (Luo/Kikuyu/Kikamba/Zulu/Luganda/Igbo are already pre-registered there, unused, waiting for real templates — not something this design invents).

---

## 15. 12-wave mapping

| Wave | What this design does for it |
|---|---|
| **W2 — Universal Semantic Foundation** | `plan.language` already exists as the authoritative slot (confirmed, §1); this design adds the ONE correct mechanism to populate it, closing the "representation is fine, population is broken" gap identified in the Q&A pass |
| **W3 — Native Multilingual Understanding** | The core of this design: replaces closed-vocabulary-only detection with a layered marker + morphological + statistical architecture capable of resolving genuinely novel Kiswahili, and returns real `UNKNOWN` instead of silently defaulting to English |
| **W4 — Remove Hidden English Intermediary** | §7's three fixes remove the only two confirmed, reproduced hard-coded-English response paths; the UNKNOWN-handling rule in §6 removes the English-default at the registry level too |
| **W5 — Universal Language-Aware Knowledge** | §7.3 extends `CONTEXT_STORY_ROUTES`/`CONTEXT_KNOWLEDGE_ROUTES` with real Kiswahili keyword coverage, closing the pre-existing "100% English-keyed retrieval" finding |
| **W7 — Response Construction & Validation** | Every construction path (SA pipeline AND the older `getContext()` chain) converges on consulting the SAME `languageIdentity`; §7's convergence plan is explicitly sequenced, not claimed finished in one pass |
| **W10 — Continuous Language Learning & Maturity** (later, not this pass) | The `conflict`/`detectedLanguages` diagnostic fields this design adds are the real, disclosed input a future learning pass would need to improve detection over time — without building a second learning system, reusing `CozyLearn`'s existing correction machinery |

**Not claimed:** W8 (application integration), W9 (architecture guardian — though this design directly reduces one of that document's own named duplication findings, "two independent, unreconciled language-verification ladders," by consolidating detectors), W11 (voice acceptance — unaffected by this design; still blocked on real-device testing per §9), W12 (full-system readiness — far out of this design's scope).

---

## 16. Implementation order (proposed, not started)

1. `language-identity-contract.js` (new, isolated, no consumers yet — safest first step, fully unit-testable alone).
2. `cozy-language-identifier.js` (new — layered detector; unit-tested standalone against the full existing marker-list test matrix PLUS the novel-sentence generalization tests, before anything calls it).
3. Wire `cozy-living-assistant.js` to call it once per turn, threading `languageIdentity` alongside (not replacing) the existing `language` string everywhere it's already passed — byte-for-byte-compatible for every existing caller.
4. Demote `rule-based-conversational-provider.js`'s and `cozy-ai-semantic-intent.js`'s own detectors to fallback-only, behind the new identity when supplied.
5. `cozy-answer-engine.js`'s three convergence fixes (§7.1-7.3), each individually reproduced-then-fixed per this session's established before/after discipline.
6. `cozy-ai.js` Kiswahili route extension.
7. Full regression + real-browser sweep (§12/§13).
8. Commit-gate report, same structure as the Wave 6/7 checkpoint, explicitly stating this is a W2/W3/W4/W5/W7 foundation repair performed *during* Wave 7, not a claim that Wave 3 or Wave 5 are complete.

---

## 17. EXTENSION — Continuous Learning Requirement

Added per explicit follow-up instruction. Still design-only; nothing below has been implemented.

### 17.1 The real, existing CML-6 architecture (traced, not assumed)

`core/modules/learning/continuous-learning-fabric.js`'s `observeEvent()` (lines 183-286) is the real, single, event-driven orchestrator this design must connect to — never replace. Mapping its **actual** behavior onto the 17-stage spec vocabulary you gave, confirmed by direct reading:

| Spec stage | Real today? | Where |
|---|---|---|
| OBSERVE | **Real** | `observeEvent()` entry, `buildObservation()` |
| NORMALIZE | **Real** | `normalize()`/`termFromObservation()` |
| IDENTIFY LANGUAGE | **MISSING** | `input.candidateLanguage` is a caller-supplied claim, never independently detected or verified by the fabric itself |
| DIALECT/REGION | **MISSING** | no field exists anywhere in this pipeline |
| CONTEXT | **Real, caller-supplied** | `input.contextLabel` → `EvidenceProfile.recordOccurrence()` |
| COMPARE KNOWLEDGE | **Real, conditional** | `LearningCorrelation.correlateObservation()` — only fires when a `conceptId` is already known or found via `LearningEvidenceSupplement.findMatchingAttachments()` |
| GAP | **Real** | `LearningGapDiscovery.discoverUnknownWordGap()` — fires exactly when COMPARE KNOWLEDGE did *not* succeed |
| EVIDENCE | **Real** | `EvidenceProfile.recordOccurrence()` — independent-contributor/context tracking |
| GROUP | **Real, inside EVIDENCE** | contributor/context grouping lives inside `EvidenceProfile`, not a separate named stage |
| CANDIDATE | **Real, out-of-band** | `advanceToCandidate()` → `ObservationLifecycle.toCandidate()` — a caller must invoke this separately; `observeEvent()` never auto-chains into it |
| CONFIDENCE | **Real** | `LearningPriority.computePriority()`, computed inline from repeated-contributor/context/conflict signals |
| VERIFY | **Real, out-of-band** | `advanceToValidated()`/`advanceToVerified()` → `ObservationLifecycle` — same caller-must-invoke discipline |
| GOVERN | **Real, structural** | the file's own documented invariant: *nothing* in `observeEvent()` can move a record to VERIFIED; that is exclusively `ObservationLifecycle`'s separate chain. This is enforced by omission (the function structurally cannot do it), not by a stage function |
| PERSIST | **Real** | via `CozyMemory`, threaded through every adapter above |
| UPDATE CAPABILITY | **MISSING** | confirmed absent — no mechanism updates a language's registered capability/maturity state as a direct consequence of learning |
| TEST | **Real, out-of-band** | `generateRegression()`/`verifyImprovement()` → `RegressionGenerator` — caller-invoked, not auto-chained |
| CONTINUE | **MISSING** | no explicit repeat/resume stage; the dedup window (`DEDUP_WINDOW_MS`) is a *different* mechanism (prevents duplicate spam), not a "keep observing" loop |

**This confirms your framing exactly: the infrastructure is not being reinvented, four real gaps in an otherwise-real 13-stage orchestrator need to be closed, and two of those four (IDENTIFY LANGUAGE, DIALECT/REGION) are precisely what §3-§6 of this design already builds.**

### 17.2 Closing IDENTIFY LANGUAGE / DIALECT-REGION — direct connection point

`observeEvent()`'s `input.candidateLanguage` becomes **caller-optional**: when omitted (or when the caller wants it independently checked, not merely trusted), `observeEvent()` calls the SAME `resolveLanguageIdentity()` from §5 of this design, using `input.text`/`input.term` as the input, and:
- stores the resulting `languageIdentity` object (§3's contract — `languageId`, `dialectRegion`, `source`, `confidence`) on the observation itself, alongside the existing `candidateLanguage` string (additive, not a replacement — `EvidenceProfile`/`ConflictDetection`/etc. keep working unmodified against the existing string field).
- when a caller-supplied `candidateLanguage` and the independently-detected `languageIdentity.languageId` **disagree**, this is itself recorded as a real signal (reusing `ConflictDetection`'s existing `OPEN`/`RESOLVED` status vocabulary — a language-identity disagreement is just another kind of conflict entry, not a new conflict system).

This is the literal, mechanical connection between the detection/propagation seam (§1-§16) and the learning fabric: **every real conversational turn that flows through `cozy-living-assistant.js`'s new per-turn `resolveLanguageIdentity()` call (§5) can optionally also be submitted as a CML-6 observation**, giving the learning fabric real, continuously-arriving language-identity evidence from ordinary use — without CozyAI's own conversational path depending on or waiting for the learning fabric in any way (learning is a side-observation, never a blocking dependency of answering).

### 17.3 UPDATE CAPABILITY — the missing stage, and its natural real home

`core/modules/learning/adapters/language-gap-registry.js` (already real, already CML-6, already concept-level) is the correct owner for this, not a new file. `checkConceptLanguageCoverage({conceptId, targetLanguages, actorId})` already does the hard part — real, honest, auto-closing OPEN `LANGUAGE_GAP` records per concept+language, backed by a fresh re-check of `lifecycleStatus === "VERIFIED"` (never a stale flag). **UPDATE CAPABILITY is the missing step that reacts to a gap closing**: when `checkConceptLanguageCoverage()` transitions a language's coverage for a concept from "gap open" to "verified," this should call into the EXISTING `cozy-language-registry.js`'s language-state model — but never silently flip Kiswahili's overall state from `NOT_READY`/`PARTIAL` to `AVAILABLE` on the strength of one concept. Concretely: a small, new, additive counter/threshold ("how many distinct concepts now have verified Kiswahili coverage, out of how many are tracked") feeding a real, disclosed, human-reviewable capability-maturity signal — not an automatic promotion. This is a genuinely new small piece of logic (not present anywhere today), but it is a **consumer** of `language-gap-registry.js`'s already-real data, not a new gap-tracking system.

### 17.4 CONTINUE — the missing stage

The spec's CONTINUE stage is the explicit acknowledgment that this is a loop, not a one-shot pipeline. Concretely: `LearningPriority.computePriority()` already computes a real priority score per gap/conflict (§17.1); CONTINUE is simply the disclosed policy that a still-open gap or still-unresolved conflict remains eligible for re-observation on the next real occurrence — which already happens naturally today (nothing currently closes a gap or expires a priority), but is not named or surfaced anywhere as an explicit "this keeps going" state. Proposed: a lightweight status field on the gap/conflict record itself (`observationCount`, `lastObservedAt`) — additive to the existing OPEN/RESOLVED vocabulary, not a new state machine — so "CozyAI keeps learning Kiswahili tomorrow" is a real, inspectable fact (how many times has this gap been seen, most recently when) rather than an implicit property of the system never crashing.

### 17.5 Learning sources — how each one enters, and why none is automatically authoritative

Every source you listed becomes **one more caller of the same `observeEvent()` entry point**, distinguished only by `input.kind` and `input.contributorId` — never a separate pipeline per source:

| Source | Real, existing entry point | Authority |
|---|---|---|
| Real user interactions (ordinary Kiswahili conversation) | NEW, additive: `cozy-living-assistant.js`'s per-turn `resolveLanguageIdentity()` call optionally also calls `observeEvent({kind: "CONVERSATIONAL_UTTERANCE", ...})` | Counts toward `EvidenceProfile`'s independent-contributor/repeated-evidence tracking — same as any other observation; a single conversation never promotes anything by itself |
| Authorized user teaching | Already real: `cozy-teach-flow.js` → `CozyLearn`'s OBSERVED→CANDIDATE→USER_CONFIRMED→TRUSTED chain | **Scoped to `USER`, never `GLOBAL`**, confirmed by that file's own header (line 37-38) — a taught fact stays private to the teacher unless separately, explicitly widened. This narrower, faster path is correct for a user's own private preference; it must **not** be the path Gemini or "verified language resources" use for anything intended as broadly-applicable Kiswahili capability — those go through the fuller, multi-contributor CML-6 lifecycle below, not this shortcut |
| **Gemini as an external language-reference source** | **NEW, additive adapter**, following the EXACT existing pattern `speech-translation-provider-gemini.js` already establishes (§17.6) | An `observeEvent({kind: "EXTERNAL_REFERENCE", contributorId: "gemini-reference-provider", ...})` call — one contributor among many, never privileged, never auto-advancing lifecycle stages itself |
| Verified human contributors | Already real: `EvidenceProfile`'s `independentContributors` tracking (multiple distinct real people submitting the same term/meaning) | This is the existing, correct authority mechanism — repeated, independent, human agreement, not any single source's say-so |
| Authorized application/domain knowledge | Already real: `LearningEvidenceSupplement`'s `findMatchingAttachments()` / the `CanonicalConceptRegistry` | Unchanged |
| Verified language resources (dictionaries, corpora) | **NEW, additive adapter**, same `EXTERNAL_REFERENCE` kind as Gemini, different `contributorId` | Same non-authoritative treatment as any other source |
| Repeated real-world observations | Already real: this is precisely what `EvidenceProfile`'s occurrence-counting and `LearningPriority`'s repetition signals already measure | Unchanged |

**"No source is automatically authoritative" is enforced structurally, not by policy alone**: `observeEvent()` itself is architecturally incapable of promoting anything to VERIFIED (§17.1's GOVERN row) — every source, Gemini included, can only ever contribute an OBSERVED-tier record. Promotion is exclusively `ObservationLifecycle`'s own separate, explicit, multi-step chain, unchanged by this design.

### 17.6 Gemini integration — the exact existing pattern, reused, not reinvented

`core/modules/speech/adapters/speech-translation-provider-gemini.js` is the template, already live in this codebase:
- Registers as **one provider** into an existing generic registry (there: `SpeechTranslationProviders`, alongside the NLLB provider) — never a standalone system.
- Never touches `GEMINI_API_KEY` directly; calls the existing `createGeminiCloudProvider().think()`, which itself only reaches the same-origin `/ai/gemini` server endpoint — the real secret stays server-side, unchanged.
- Fail-closed: a failed or unusable Gemini response throws a real error rather than fabricating a result; `isAvailable()` never assumed true.
- Coexists with, never replaces, other providers.

**Proposed, directly analogous, new file**: `core/modules/learning/adapters/learning-evidence-gemini-provider.js` (name illustrative, not fixed) — a `collectExternalReference({term, language, conceptContext})` function that:
1. Builds a real, disclosed prompt asking Gemini to state (not converse) what it knows about a specific Kiswahili term/concept, in a fixed, parseable shape (same "translation-instructing prompt" discipline the existing provider already uses).
2. Sends it through the same existing `createGeminiCloudProvider().think()` seam — no new network code, no new secret path.
3. On a real, honest, non-refusal response, submits the result into `observeEvent({kind: "EXTERNAL_REFERENCE", contributorId: "gemini-reference-provider", candidateLanguage: "sw", ...})` — **exactly the same entry point every other source uses**, gaining zero special treatment.
4. On failure/refusal/unavailability, returns honestly — never fabricates a Kiswahili fact to fill a gap.

**Gemini never becomes a conversational participant.** It is called only from this narrow, batch/background, gap-filling adapter — never from `cozy-living-assistant.js`'s live answer path, never from `cozy-answer-engine.js`, never wired to `SemanticAnswerPlanner`/`language-realizer.js` directly. The only way a Gemini-sourced fact can ever reach a real user-facing Kiswahili answer is by first passing through the full CML-6 lifecycle to `VERIFIED`, then through `LearningEvidenceSupplement` (§17.7) — the same path every other learning source already uses, already tested (task #36, `learning-evidence-supplement.js`, this repository's own real CML bridge).

### 17.7 Once verified: native use through the existing pipeline, not a new one

`core/modules/learning/adapters/learning-evidence-supplement.js` is **already** the real bridge: `collectLearnedEvidence({goal, entityValue, language, actorId})` reads only attachments backed by an observation with `lifecycleStatus === "VERIFIED"` (confirmed, line 89), converts them into real `VerifiedEvidence` records, and `SemanticAnswerPlanner.planAnswer()` **already** consults it as an optional supplementary source when primary `CozyKnowledge` evidence is empty (confirmed in `semantic-answer-planner.js`, the `LearningEvidenceSupplement`/`learnedSupplementUsed` branch traced earlier this session). This means: **the loop this design needs already exists end-to-end for every other learning source; Gemini and "verified language resources" simply become two more contributors feeding the same, already-wired VERIFIED→evidence→SA-3→SA-4→SA-5→SA-6→Live Window path.** No new consumption mechanism is proposed here at all — this section documents that the existing one already satisfies "once verified, use it natively through the same semantic engine," and nothing needs to be built to make that true; only the *input* side (§17.2-§17.6) has real gaps to close.

### 17.8 Conflicts stay visible — reusing the existing OPEN/RESOLVED vocabulary, never auto-resolved

`ConflictDetection.checkAndRecordConflict()` already has exactly the discipline you're asking for: a record starts `status: "OPEN"`, `resolution: null` (`conflict-detection.js:74`), and only a separate, explicit governance action ever sets `status: "RESOLVED"` (line 105) — a new, merely-repeated or higher-volume observation on one side of a disagreement does **not** itself flip the status. This existing behavior is preserved unmodified. The one addition this design proposes (§17.2) is a new *kind* of thing that can conflict — detected-vs-claimed language identity — using the identical existing status machine, not a parallel one.

### 17.9 Multilingual expansion — same mechanism, Luo/Kikuyu/Kamba/Kalenjin/Somali/Arabic/French next

Nothing in §17.1-§17.8 is Kiswahili-specific in mechanism — every function signature above takes `language`/`candidateLanguage` as a parameter, not a hardcoded value. Extending to Luo means: the same `observeEvent()` calls, the same `EvidenceProfile`/`ConflictDetection`/`LearningGapDiscovery`/`LearningPriority` adapters, the same `LanguageGapRegistry` concept-coverage tracking, the same `LearningEvidenceSupplement` consumption bridge, and the same Gemini/external-reference adapter (§17.6, already parameterized by `language` in its own call shape) — pointed at `"luo"` instead of `"sw"`. The `cozy-language-registry.js` entries for Luo/Kikuyu/Kikamba/Zulu/Luganda/Igbo already exist, pre-registered `NOT_READY`, waiting for exactly this: real, growing, verified concept coverage (§17.3's capability-maturity signal) eventually justifying promotion to `AVAILABLE` once `cozy-language-templates.js` has real verified templates — a human/governance decision, never automatic.

### 17.10 Files added/modified for this extension (when authorized — none touched now)

**New:**
- `core/modules/learning/adapters/learning-evidence-gemini-provider.js` — §17.6.
- (Possibly) a small capability-maturity counter module or an addition to `language-gap-registry.js` itself — §17.3 (implementation-time decision, not fixed here).

**Modified, additive only:**
- `continuous-learning-fabric.js`'s `observeEvent()` — accepts the optional `languageIdentity` (§17.2), still 100% backward compatible with every existing caller that only ever passed `candidateLanguage` as a bare string.
- `conflict-detection.js` — reused as-is; at most a new conflict *kind* label, not new logic.
- `language-gap-registry.js` — §17.3's UPDATE CAPABILITY consumer, additive.
- `cozy-living-assistant.js` — the same §5 per-turn call optionally also submits an observation (a few lines, opt-in via a flag, never blocking the answer path).

**Untouched:** `learning-evidence-supplement.js`, `SemanticAnswerPlanner`, `language-realizer.js`, `response-validator.js`, `repair-loop.js`, `cozy-teach-flow.js`'s own USER-scope safeguard, `ObservationLifecycle`'s governance chain, `CozyMemory`'s authorization model, `gemini-cloud-provider.js`/`gemini-backend-endpoint.js`'s existing secret boundary — every one of these is reused exactly as it exists today.

### 17.11 12-wave mapping for this extension

| Wave | Connection |
|---|---|
| **W10 — Continuous Language Learning & Maturity** | This entire section is W10's own scope: closing IDENTIFY LANGUAGE/DIALECT-REGION/UPDATE CAPABILITY/CONTINUE in the real CML-6 orchestrator, adding Gemini/verified-resources as two more non-authoritative sources, and defining a real (not automatic) capability-maturity signal |
| **W3 — Native Multilingual Understanding** | §17.2's connection is what lets ordinary Kiswahili conversation itself become a source of improving detection over time, not just a consumer of it |
| **W9 — Architecture Guardian** | §17.6-§17.8 are explicit, direct evidence *against* the risk this wave exists to catch — confirmed no second AI, no second learning database, no second conflict system, Gemini reachable only through the one existing, narrow, already-audited secret boundary |

Not claimed: this extension does not make W10 complete — it closes 4 named stage-gaps and adds one new, narrow external-source adapter; deeper maturity-ladder work (the 9-state ladder named in the earlier `MULTILINGUAL-INTELLIGENCE-AUDIT.md` §5) remains open and unaddressed here.

---

**Stopped here. No code modified. Awaiting explicit implementation authorization.**
