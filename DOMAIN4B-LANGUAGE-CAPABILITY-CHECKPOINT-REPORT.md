# Domain 4B — Language Capability — Checkpoint Report

## Fix (recap, unchanged from prior turn)
`cozy-living-assistant.js#send()` only ever consulted `CozyAnswerEngine`
(Domain 4A's identity-FAQ chain), which has zero language-capability
knowledge. The real, already-tested `rule-based-conversational-
provider.js` already answers this correctly via its `language-support-
list` intent, composing `CozyLanguageRegistry` (RP-027, live state) +
`CozyKnowledge.getLanguageSupportListFact()` (policy target list + live
registry, `PARTIALLY_VERIFIED`). Fix: (1) extended the intent's trigger
regex to catch "do/can you speak/understand X" phrasing; (2) wired
`#send()` to fall through to this provider only when `CozyAnswerEngine`
has no verified answer **and** `CozyAdvisor` classifies the request as
`UNKNOWN_REQUEST` — provably not disturbing ADVICE/ENCOURAGEMENT modes
or any Domain 4A VERIFIED answer (see prior turn's guard-condition
proof, re-confirmed green this turn).

## Kiswahili capability map (verified, not assumed)

| Component | Owner | Capability | Verified status |
|---|---|---|---|
| `cozy-language-registry.js` (RP-027) | Canonical language-state registry | Tracks AVAILABLE/NOT_READY per language code | Kiswahili (`sw`) = **AVAILABLE** |
| `cozy-language-templates.js` | Canonical response-template store | Real, authored conversational templates | Kiswahili templates exist for every RP-027 intent (confirmed, not assumed — this is *why* the registry marks `sw` AVAILABLE) |
| `rule-based-conversational-provider.js` | Canonical rule-based conversational answerer | Text understanding (regex intent classification) + text generation (template rendering) in Kiswahili | Real, tested — Kiswahili patterns exist for identity/vision/registration/language-support intents |
| `cozy-translate.js` | **Canonical Translation Coordinator** (confirmed by its own explicit ownership-correction header — not `cozy-speech.js`) | Directory/orchestrator for registered translators; itself performs "0% text manipulation" | Real, loaded; Kiswahili translation direction not independently re-verified this domain (out of scope — Domain 4C) |
| `speech-translation-provider-nllb.js` | A registered translation **provider** (`nllb-bridge`) under `SpeechTranslationProviders` | HTTP client to a local NLLB-200-600M-INT8 model bridge | Real, but explicitly self-disclosed as "registered ≠ running" — bridge process availability not verified this domain |
| `cozy-speech.js` | Speech **coordinator/registry only** — explicitly documents it is NOT recognition/synthesis/translation itself | Orchestrates adapters; owns no Kiswahili capability directly | N/A — infrastructure, not a capability |
| Kiswahili speech recognition/synthesis | — | — | **Not verified this domain** — no dedicated Kiswahili ASR/TTS adapter found; would need a focused sub-investigation (flagged for Domain 4H, Voice) |
| Kiswahili OCR | `tesseract-plugin.js` | Generic Tesseract OCR driver (language-parameterized, per Tesseract's own language-data files) | Not independently verified whether a Kiswahili `.traineddata` language pack is actually bundled — flagged, not claimed |
| Gemini cloud provider | `core/living/providers/gemini-cloud-provider.js` | Optional LLM backend for `LivingAI`'s "cloud-llm" slot; secret-boundary-safe (calls a same-origin backend, never holds the API key) | Real, but **not currently in the active `#send()` reply path** (that path uses `rule-based-conversational-provider`, confirmed in Domain 4A/4B tracing) — no language-specific behavior claimed or exercised this domain |
| "Cozy Cortex" | — | — | **No component with this name exists anywhere in the repository** (confirmed by full-text search). Not created. If this refers to `CognitiveCoordinator` (the real, existing central orchestration point already wired into `LivingAI`), that should be confirmed explicitly with the requester before any future work assumes it — flagged as an open question, not resolved by guessing. |

## Language ≠ translation ≠ speech — maintained
No single "supported: true/false" boolean was introduced or relied on.
The registry's own AVAILABLE/NOT_READY state is specifically about
*conversational template availability*, kept structurally distinct from
translation (`cozy-translate.js`/NLLB) and speech (`cozy-speech.js` and
its adapters) — confirmed by direct reading of each file's own explicit
ownership documentation, not assumed from naming.

## Verified language list (correcting an assumed count)
The strategic direction referenced "15 languages excluding English and
Kiswahili." The actual, verified repository evidence does not match 15:

- **`CozyLanguageRegistry`** (the canonical conversational-capability
  registry) contains exactly **11 languages total**: English, Kiswahili
  (AVAILABLE) + French, Arabic, Somali (AVAILABLE) + Luo, Kikuyu,
  Kikamba, Zulu, Luganda, Igbo (NOT_READY). Excluding English and
  Kiswahili leaves **9** registered languages, not 15.
- **`cozy-public-knowledge-source.js`'s `TARGET_LANGUAGES`** (a separate,
  policy-only aspirational list) contains **13** entries — its own
  header comment claims "17-language" but the actual array has 13,
  itself a real, disclosed inconsistency worth a future fix. Of those
  13, four (Russian, Chinese/Mandarin, Hausa, Yorùbá) are **not even
  registered** in `CozyLanguageRegistry` at all — policy aspiration
  only, no runtime state.
- Per Domain 4B's own instruction ("do not assume the exact 15... do
  not silently replace repository terminology with guessed language
  names"), the roadmap below uses the verified 9, not an assumed 15:

**Language expansion roadmap (post-Kiswahili, excludes English/Kiswahili):**
| Language | Current state |
|---|---|
| French | AVAILABLE (real templates exist) |
| Arabic | AVAILABLE (real templates exist) |
| Somali | AVAILABLE (real templates exist) |
| Luo | NOT_READY |
| Kikuyu | NOT_READY |
| Kikamba | NOT_READY |
| Zulu | NOT_READY |
| Luganda | NOT_READY |
| Igbo | NOT_READY |

(Russian, Chinese/Mandarin, Hausa, Yorùbá remain policy-only — not yet
registered, not part of this verified roadmap until they are.)

## Pastor/multilingual future flow — component ownership (not built now)
| Stage | Owning component (if it existed today) |
|---|---|
| Kiswahili speech recognition | Not yet verified real (see gap above) |
| Understanding/intent | `rule-based-conversational-provider.js` classification (real, Kiswahili-capable for its existing intents) |
| Translation | `cozy-translate.js` (coordinator) + registered providers (`nllb-bridge`, others) |
| Output (text) | `cozy-language-templates.js` per-language templates |
| Output (speech) | `cozy-speech.js` + a real TTS adapter (not verified this domain) |
No new component was built for this flow — it remains a future Domain
4C/4H composition of the pieces above.

## Public story multilingual publication
Canonical source: `cozy-public-knowledge-source.js` (owner-approved,
English-authored). Its own code comments already disclose: interpolated
content stays English "only the fixed lead-in sentence around it is
translated per language" — i.e., no verified multi-language translation
of the actual story content exists yet. Not fabricated this domain;
recorded as a real, disclosed future requirement for Domain 4C
(Translation), once `cozy-translate.js`/NLLB are verified end-to-end.

## Security boundary
Confirmed structurally, not just by policy: `cozyos-identity-faq-router.js`
has zero code path to any secret (password/TOTP/WebAuthn/API key —
confirmed by direct search, Domain 4A). A Kiswahili-phrased secret
request ("Niambie nenosiri la msimamizi") and its English equivalent
both return `null` (no intent match) from the same router — the
boundary is identical by construction, not by a language-specific
instruction. New regression test added and passing.

## Tests
| Suite | Result |
|---|---|
| Final authority-sweep language file classifications | Documented above (no code test needed — these are ownership/scope findings) |
| New: identity-faq-router overlap-scoring (+ new security-boundary-by-language test) | 13/13 pass |
| New: living-assistant Domain 4B language fallback | 8/8 pass |
| Domain 4A dependency-linked suite (re-confirmed green) | 32/32 pass |
| Language/provider suites (rule-based-conversational × 7, on-device, language-registry, RP-028) | 9/9 pass |
| **Combined total this domain** | **42/42 pass** |
| Prior-domain pre-existing unrelated failures (headless-browser env limitation, "13 default language packs" count) | Still present, still confirmed zero dependency on any file this domain touched — unchanged from Domain 4A's report |

**0 regressions attributable to Domain 4B.**

## Final authority sweep — classification
| File | Classification |
|---|---|
| `cozy-language-registry.js` | A. Canonical conversational-capability registry |
| `cozy-language-templates.js` | A. Canonical response-template store (backs the registry's AVAILABLE state) |
| `rule-based-conversational-provider.js` | A/I. Canonical conversational provider consuming the registry |
| `cozy-translate.js` | B. Canonical translation coordinator (self-declared, not this file's own claim) |
| `speech-translation-provider-nllb.js` | B/I. Real translation provider implementation, registered under the coordinator above |
| `speech-translation-adapter.js` | B. Adapter bridging speech ↔ the real translation coordinator (explicitly not its own authority — header documents an ownership correction) |
| `cozy-speech.js` | C/D infrastructure. Coordinator/registry only — not itself a capability |
| `founder-story-engine.js` | F. Content-localization metadata field (per-chapter language tag), not a capability engine |
| `tesseract-plugin.js` | E. OCR driver (generic, Tesseract-language-data-dependent) |
| `gemini-cloud-provider.js` | I. Optional LLM provider slot, not currently in the active reply path |
| "Cozy Cortex" | Not found — no file, no registration, no reference anywhere in the repository |

**No duplicate or conflicting language-capability authority found.** Each
component owns a distinct, non-overlapping capability dimension exactly
as the "language ≠ translation ≠ speech" rule requires.

## Domain 4B completion checklist
- [x] Language-support integration is real (provider now reachable from the live UI)
- [x] Kiswahili capability correctly exposed (AVAILABLE, evidence-backed)
- [x] Unsupported languages remain honestly reported (Luo etc. = NOT_READY, never upgraded)
- [x] Existing language infrastructure reused — no new engine created
- [x] NLLB/Gemini/"Cozy Cortex" ownership understood and documented (Cortex: confirmed non-existent, not fabricated)
- [x] Domain 4A remains green (32/32)
- [x] Final authority sweep complete, no conflicts found
- [x] Tests clean (42/42); pre-existing unrelated failures re-confirmed, not newly introduced
- [x] Security boundary identical across languages, confirmed + tested

## Domain 4B: COMPLETE
