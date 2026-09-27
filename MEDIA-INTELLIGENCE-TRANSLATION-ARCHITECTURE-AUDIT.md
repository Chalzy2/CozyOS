# Media Intelligence Translation Architecture — Audit

**Status:** Audit only, per the explicit governing instruction: "reuse the existing CozyOS language/translation architecture and document any genuine gaps before adding new components." No new translation engine, no new provider registry, no new TTS system was created. This document synthesizes a prior, unmodified, still-accurate audit (`docs/builder/knowledge/NLLB-TRACE-PROVIDER-NEUTRAL-DISCOVERY.md`, cited throughout as "the NLLB trace") with new findings specific to Media Intelligence's own schema and to the live-multi-language-session requirement.

## 1. The core architectural question — is English a mandatory bridge?

**No. Confirmed by reading the real dispatch code, not assumed.**

- `core/modules/speech/adapters/speech-translation-provider.js` (`SpeechTranslationProviders.translate(text, {sourceLanguage, targetLanguage}, preferredProviderName)`) picks **one** registered provider and calls its `translate()` **once**, with the real source and target language passed straight through. There is no intermediate-language step, no second call, no English default anywhere in this file.
- `core/modules/speech/adapters/speech-translation-provider-nllb.js` (`nllb-bridge`): a thin HTTP client for a local NLLB-200-600M-INT8 model bridge. NLLB is inherently a many-to-many multilingual model — `COZY_TO_NLLB` (the real Python-side mapping, `language-packs/shared/NLLB-200-600M-INT8/nllb_http_bridge.py:112`) maps all 17 canonical CozyOS language codes to their own NLLB codes 1:1, and the bridge's `/translate` endpoint takes `source_lang`/`target_lang` directly — e.g. `ki` (Kikuyu) → `luo` (Luo) is one direct model call, never routed through `eng_Latn`.
- `core/modules/speech/adapters/speech-translation-provider-gemini.js` (`gemini-translate`): builds one prompt — *"Translate the following {sourceName} text into {targetName}."* — naming both real languages directly. No English-naming step, no two-hop prompt chain.
- `core/modules/ChurchOS/live-church-language-orchestrator.js` — the real, already-built **multi-language live session** mechanism (see §5) — calls `adapter.translateText(txSessionId, sourceText, { sourceLanguage, targetLanguage: viewerLanguage })` **once per viewer, per segment**, always with the segment's own real source language and that viewer's own real target language. Never `sourceLanguage: "en"` inserted as a hidden hop.

**Conclusion:** the "SOURCE LANGUAGE → TARGET LANGUAGE, never SOURCE → English → TARGET" rule the directive states is not something to build — it is already how every real provider and the one real orchestrator in this codebase work today. The one honestly-disclosed exception is Gemini's own internal model behavior (§4).

## 2. The canonical language set (Tier 1) and its exact overlap with translation coverage

`core/modules/intelligence/language-packs/cozy-language-pack-registry.js`'s `DEFAULT_IDENTITIES` (17 entries) is the sole Tier-1 identity authority (re-confirmed by reading it directly): `en, sw, fr, ar, so, ru, zh, ha, yo, luo, ki, kam, zu, am, ln, ig, hi`.

Both real translation providers' `SUPPORTED_LANGUAGES` lists are **character-for-character identical** to this 17-language set (re-confirmed by reading both files directly, not merely citing the prior audit). This is a genuinely good sign: translation coverage is not a subset with gaps hiding inside the canonical 17 — it is the full canonical 17, on both providers.

## 2a. Kalenjin — a genuine, total, disclosed gap

The directive names Kalenjin explicitly. **Kalenjin does not exist anywhere in this repository's language architecture** — not in the 17 canonical identities, not in either provider's `SUPPORTED_LANGUAGES`, not in the NLLB Python-side mapping, not in Tier 2's conversational registry (checked directly: no `kal`/`kln` code appears in `cozy-language-pack-registry.js`, `speech-translation-provider-nllb.js`, or `speech-translation-provider-gemini.js`). This is reported here as **UNSUPPORTED**, not silently omitted and not worked around by approximating it with a neighboring language. Adding it would require, at minimum, a new Tier-1 canonical identity entry and confirming NLLB's own upstream model actually has Kalenjin coverage (NLLB-200 is documented to cover many African languages, but this repository has no evidence — declared or runtime — either way) — real, non-trivial work, out of scope for this audit-only pass.

## 3. Direct-pair classification, honestly tested where testable in this environment

Per the directive's required distinction (DIRECT TRANSLATION VERIFIED / INTERMEDIATE-LANGUAGE FALLBACK / UNSUPPORTED / NOT TESTABLE):

| Provider | Architecture | Declared coverage | Runtime in THIS sandbox | Classification |
|---|---|---|---|---|
| `nllb-bridge` (local model bridge) | Direct many-to-many (single model call, no pivot) | 17/17 canonical languages, 1:1 mapped | **Blocked, directly re-confirmed this pass**: `python3 -c "import torch"` still fails (`ModuleNotFoundError`), no `.bin`/`.safetensors` model weight files exist under `language-packs/shared/NLLB-200-600M-INT8/` | **NOT TESTABLE IN CURRENT ENVIRONMENT** (architecture is DIRECT by design; live execution cannot be exercised here) |
| `gemini-translate` (cloud LLM) | Direct-prompt (both languages named explicitly in one prompt) | 17/17 canonical languages | Blocked — this sandbox's network policy has no egress to the Gemini backend (re-confirmed by the prior audit; not re-attempted this pass since the network boundary is a session-level configuration, not a code path this task can change) | **NOT TESTABLE IN CURRENT ENVIRONMENT** (architecture is DIRECT by design, but the underlying LLM's own internal token-level representation is not something CozyOS's code can verify is free of any latent English-centric bias — disclosed honestly, not claimed either way) |
| `browser-native` (Chrome on-device Translator API) | Direct (`Translator.create({sourceLanguage, targetLanguage})`) | Whatever the browser build itself supports — CozyOS does not declare a language list for this provider, by design (see `speech-translation-provider.js`'s own header) | **Actually tested this pass**, in the real headless Chromium build used by this repository's own E2E tests (`/opt/pw-browsers/chromium-1194`): `typeof self.Translator !== 'undefined'` → **false** | **REAL BROWSER VERIFIED: not present in this environment's browser build.** Genuinely offline/on-device on a Chrome build that ships it, but this repository's own test browser does not, so end-to-end direct-pair speech is not exercisable via this path here. |

No provider in this repository implements or has ever implemented an English-pivot two-hop translation. There is nothing to fix architecturally — the gap in this environment is **execution capability** (no PyTorch/model weights, no network egress, no Translator API in this Chromium build), not **design**.

## 4. Meaning preservation (names, places, numbers, dates, religious/cultural terms)

Traced honestly: **no code in either provider does any named-entity, number, date, or terminology post-processing.** Both are pass-through translation calls — the raw source text goes in, the raw translated text comes back, with zero CozyOS-side normalization step of any kind (confirmed by reading both files in full; neither contains a regex, dictionary, or NER step touching the translated text). This means:

- Whatever meaning-preservation exists is **entirely the underlying model's own behavior** (NLLB's or Gemini's), not something CozyOS adds or could currently verify independently.
- CozyOS has **no mechanism today** to catch or flag a translation that silently normalizes a cultural/religious term into an unrelated English equivalent — that would require a real, separate verification step (e.g. a terminology glossary cross-check) that does not exist anywhere in this codebase. **This is a genuine, disclosed gap**, not fabricated as solved.
- This is out of scope to build in this pass (the directive's own instruction to document gaps before adding components applies directly here) — flagged for a future, dedicated pass, not attempted speculatively now.

## 5. Multi-language live session — already built, not a gap

The directive's "a pastor speaks Kiswahili, five members each receive a different language, from one authoritative source" scenario **already exists** as real, working code: `core/modules/ChurchOS/live-church-language-orchestrator.js` (Milestone R040 Phase 1).

Traced directly (not merely cited):
- **One authoritative source per segment.** `routeSegment()` takes one `sourceText`/`sourceLanguage` per real ASR/caption segment (composes whatever already produced it — e.g. `LDCECaptionEngine`'s `caption-final` event — never re-transcribes).
- **Per-viewer routing, never a duplicate AI.** For each real participant in `LDCESessionEngine`, the file reads that viewer's own `language` field (real, per-participant, from `getParticipant()`/`listParticipants()`) and either passes the original text through untouched (`sourceLanguage === viewerLanguage` → `status: "bypassed"`, translation stage genuinely skipped, not invoked-and-discarded) or calls the **one shared** `SpeechTranslationAdapter.translateText(txSessionId, sourceText, { sourceLanguage, targetLanguage: viewerLanguage })` — the exact same adapter, same provider registry, same call shape, for every viewer. Five viewers in five different languages means five real, independent, direct-pair calls from the **same** source segment — never five separate conversations, never five separate AIs.
- **Voice stays separate from translation**, exactly as the directive requires: this file calls `LivingTTS.speak()` (which itself composes `VoiceManager`) only when `requestTTS` is true, and never creates or calls a second TTS path.
- **Honest capability reporting**, already distinguishing two of the four states the directive asks for: `getCapabilityReport()`'s `LANGUAGE_REGISTERED` (Tier-1 identity exists) vs. `TRANSLATION_AVAILABLE_NOW` (a provider is registered — explicitly documented in the file's own comment as *not* proof a specific pair has ever succeeded; real per-pair success is only known after `routeSegment()` actually runs).

**What this means for Media Intelligence:** the live multi-language fan-out mechanism the directive describes does not need to be built for Media Intelligence — it is a real, existing, reusable capability. If/when Media Intelligence content ever has live audio (a live-streamed testimony, a live sermon), routing it through N target languages is a composition of this existing orchestrator, not a new one.

## 6. Media Intelligence's own real gap: no transcript text exists to translate yet

This is a genuine finding from this pass, not present in the prior NLLB trace (which did not examine the media/research schema).

Traced directly: `core/modules/intelligence/media/cozy-remote-media-index.js`'s `createRecord()` stores `sourceType, sourceId, title, description, ownerAuthorization, searchableTerms` — **no transcript/caption text field of any kind.** `cozy-research-intelligence.js`'s research records and `cozy-media-evidence.js`'s evidence entries were also checked (per this session's earlier Media Intelligence trace, §5.4 of `VOICE-APPLICATION-INTEGRATION-AUDIT.md`) and carry structured metadata (`researchType`, `languageId`, `country`, `region`, `evidenceType`/`value`/`confidence`) — never a stored transcript body.

**Consequence:** today, there is no real source text anywhere in the Media Intelligence pipeline that a translation provider could be handed. `answerMediaQuestion()`/`discoverTestimonies()` (composed into the Live Window this session, see the Application Integration Matrix's Media Intelligence row) return **metadata about which records matched**, never the content of a testimony. Building "translate a testimony's actual content into a viewer's language" would require, first, a real transcript-storage capability that does not exist yet — a schema addition, not a translation-wiring task, and squarely out of scope for this audit-only pass. Reported here as the honest, concrete shape of "Media Intelligence → transcript → translation" not yet being buildable, rather than glossed over.

## 7. Child speech — a genuine, total, disclosed gap

Repository-wide search performed this pass (`grep -ri "child.?speech|childSpeech|child.?ASR"`) returned **zero matches** anywhere in this codebase. No STT/ASR adapter, no translation provider, and no speech-recognition file of any kind contains age-based branching, a child-speech model variant, or any documented testing against child speech characteristics (short/incomplete sentences, repeated words, pronunciation variation).

**Classification: UNSUPPORTED.** Every real ASR/translation path in this repository (`SpeechRecognitionAdapter`, `nllb-bridge`, `gemini-translate`, `browser-native`) is a single, undifferentiated pipeline applied identically regardless of speaker age. This is not a defect to silently patch — per the directive's own instruction, this is reported honestly rather than claimed as production-ready, and no child-speech-specific component was fabricated to appear otherwise. Building real child-speech support would require, at minimum, a provider that itself claims child-speech training data or tuning — none is present in this repository today, and none was assumed into existence for this report.

## 8. Offline-first classification (per the directive's required categories)

| Capability | Classification | Evidence |
|---|---|---|
| `nllb-bridge` | **Local model / companion service** — genuinely offline once running, requires a locally-running Python process + downloaded model weights | `speech-translation-provider-nllb.js` header: `type: "offline"`, `supportsOffline: true`; real HTTP calls only to `127.0.0.1:8177`, never a remote host |
| `gemini-translate` | **Internet-required** | `speech-translation-provider-gemini.js`'s own header: calls the same-origin `/ai/gemini` backend, which itself requires a live `GEMINI_API_KEY` and network egress |
| `browser-native` | **Browser/device-dependent** — offline/on-device when the browser build supports it, otherwise simply absent (never simulated) | Real-tested this pass: absent in this repository's own headless Chromium 1194 build |
| Basic keyword/metadata search (`discoverTestimonies`/`answerMediaQuestion`, unaffected by any of the above) | **Fully local/offline already** | Deterministic in-memory matching against `CozyResearchSearch`/`CozyResearchIntelligence` — no network call anywhere in either function (re-confirmed by reading both files in full) |

**Losing internet access does not remove any already-available local capability**: the deterministic Media Intelligence search/answer path never depended on either translation provider, and `nllb-bridge` itself is architecturally local (its only real dependency is a co-located process, not a remote host) — the directive's "loss of Internet must not destroy already available local language capabilities" principle is already satisfied by the existing design, not something this pass needed to add.

## 8a. Pre-existing, unrelated test/registry drift found while regression-testing this pass

While running the full regression for this phase, four pre-existing test files under `core/modules/intelligence/media/tests/` (`cozy-media-evidence.test.js`, `cozy-media-intelligence.test.js`, `cozy-research-intelligence.test.js`, `cozy-research-search.test.js`) were found failing — none were touched by this session (confirmed via `git log`: last change to any of them is the baseline-restore commit `4c1b9ee`). Root cause, traced directly: each asserts `DEFAULT_IDENTITIES.length === 13` against the real `cozy-language-pack-registry.js`, which today has **17** entries (§2 above). This is exactly the "historical 15-vs-17 language gap" the prior NLLB trace (§8 of that document) already flagged as a previously-encountered, never-fully-resolved instance of the same class of discrepancy — now independently reproduced with a precise count (`17 !== 13`) and the exact four files affected. Reported here, not silently fixed: correcting four test fixtures' hard-coded expectation is a real, separate, out-of-scope task from this Media Intelligence translation audit, and is not attempted in this pass.

## 9. What was and was not done this pass

**Done:** full trace of the real dispatch/provider/orchestrator code (not re-reading only the prior audit's prose); re-confirmed the prior audit's NLLB/Gemini blocked-runtime findings directly against this exact sandbox; one new real-browser test of the `browser-native` path; two new, previously-undocumented findings (§6 transcript gap, §7 child-speech gap); the Kalenjin gap re-confirmed against the real source files (not merely cited).

**Not done, and not fabricated as done:** no translation matrix of live, executed translations was run (NLLB and Gemini are both genuinely unexecutable in this sandbox — confirmed, not assumed; the browser-native path has no real provider in this browser build to execute against). No transcript-storage schema was added. No child-speech provider was added or simulated. No Kalenjin support was added. Every one of these is reported as a real, current gap rather than silently worked around.
