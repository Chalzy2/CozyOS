# Domain 4C — Gemini Node-Native Translation Adapter — Checkpoint Report

## 1. Quick Reader
Read `server/ai/gemini-backend-endpoint.js` (real Node HTTP handler,
`callGemini()` sends raw `{contents:[{parts:[{text}]}]}` to Gemini's
`generateContent` REST endpoint — a generic text-completion call, no
translation-specific structure), `core/living/providers/gemini-cloud-provider.js`
(`createGeminiCloudProvider({backendUrl, fetchImpl}).think(text, options)`
— the real, existing client-side call to that backend, secret-safe,
already tested), `PHASE10C-3D-GEMINI-BACKEND-REPORT.md` (independently
confirms: no live execution possible in a dev sandbox — no key, no
network), and `core/modules/speech/adapters/speech-translation-provider-nllb.js`
(the exact provider-contract shape to mirror: `{name, type, translate(text,{sourceLanguage,targetLanguage})}`).

## 2. Quick Scanner
Confirmed: no existing Gemini-backed translation implementation exists
anywhere (searched for callers of `gemini-backend-endpoint`/`gemini-cloud-provider`
beyond `LivingAI`'s general "cloud-llm" chat slot — none touch
translation). `SpeechTranslationProviders.translate(text, opts, preferredProviderName)`
already supports selecting a specific provider by name — unused by
`TranslationService.translateSegment()` until this change.

## 3. Existing Gemini capability
`callGemini()`/`think()` accept **arbitrary text only** — no source/target
language parameters, no translation instruction. It is a raw completion
call. Translation-specific behavior must come entirely from the prompt
the caller constructs — confirming the smallest real gap is a prompt-
building + response-extraction adapter, not a missing backend capability.

## 4. First real dependency
No provider adapter existed to make `SpeechTranslationProviders` (and
therefore `TranslationService.translateSegment()`) capable of routing a
translation request through the existing Gemini backend. This is a
missing adapter (category A: existing implementation, not connected),
exactly as anticipated.

## 5. Implementation
- **New file**: `core/modules/speech/adapters/speech-translation-provider-gemini.js`
  — registers a `"gemini-translate"` provider into the existing
  `SpeechTranslationProviders` registry (same registry NLLB uses, not a
  new one), reusing `window.CozyOS.createGeminiCloudProvider()`
  unmodified. Builds a real, disclosed translation-instructing prompt;
  extracts translated text honestly; fails closed (throws) on backend
  failure, empty completion, or a Gemini-refusal-shaped response —
  never fabricates a translation. Never touches `GEMINI_API_KEY` or
  `process.env` in any executable code path (only in doc-comment prose
  explaining that fact — confirmed by a code-pattern-specific test, not
  a naive string search).
- **Modified**: `core/modules/translate/translation-service.js`
  — added an optional `preferredProviderName` parameter to
  `translateSegment()`, passed straight through to
  `SpeechTranslationProviders.translate()`'s own existing (unused until
  now) parameter of the same name. Purely additive — every existing
  caller that doesn't pass this argument gets byte-identical behavior
  (NLLB remains first-registered/default), confirmed by full regression.
- **No changes** to `speech-translation-provider-nllb.js`,
  `speech-translation-provider.js`'s registry logic, `cozy-translate.js`,
  or any Domain 4A/4B file.

## 6. Test results
| Suite | Result |
|---|---|
| New: `speech-translation-provider-gemini.test.js` | 9/9 pass |
| Existing: `translation-service.test.js` (regression for the additive param) | 30/30 pass |
| Existing: `translation-service-domain4c-real-path.test.js` | 9/9 pass |
| Existing: `translation-segment-core.test.js` | 16/16 pass |
| Existing: `speech-translation-provider-nllb.test.js` | 8/8 pass |
| Existing: `kiswahili-language-path.test.js` | 5/5 pass |
| Existing: `gemini-cloud-provider.test.js` + bootstrap | pass |
| Existing: `gemini-backend-endpoint.test.js` | pass |
| **Combined this verification** | **80/80 pass** |
| Domain 4A dependency-linked suite (re-confirmed) | 28/28 pass (combined with 4B below) |
| Domain 4B dependency-linked suite (re-confirmed) | included above |

**0 regressions.**

## 7. Live verification status: **NOT-RUN**
No real Gemini call was attempted or claimed. `process.env.GEMINI_API_KEY`
is confirmed unset in this environment (asserted directly in test 9).
All 9 new adapter tests use an injected `fetchImpl` — the same
discipline `gemini-cloud-provider.test.js` already established — proving
the adapter's own prompt-construction/extraction/fail-closed logic,
never claiming this as live execution.

## 8. Kiswahili translation status
Full path demonstrated end-to-end with a realistic simulated completion
(`translateSegment({sourceLanguage:'sw', targetLanguage:'en', preferredProviderName:'gemini-translate', ...})`
→ real prompt sent → real extraction → real segment built). This proves
the **code path is complete and correct**; the **actual translated
content is only genuinely verified once a real key + network exist** —
consistent with the NOT-RUN label above, not claimed as VERIFIED.

## 9. NLLB status (unchanged, explicitly preserved)
```
NLLB:
  IMPLEMENTED
  CODE PATH VERIFIED
  CURRENT NODE-ONLY PRODUCTION DEPLOYMENT INCOMPATIBLE WITH REQUIRED PYTHON/MODEL RUNTIME
```
Not deleted, not marked obsolete, not disturbed — confirmed coexisting
with the new Gemini provider in the same registry (test 8).

## 10. Security status
- `GEMINI_API_KEY` never accessed in any executable code path in the new
  adapter (confirmed by a code-pattern-specific test, distinguishing
  real access from doc-comment prose).
- No key-shaped value appears in any adapter result or error.
- Domain 4B's English/Kiswahili security-boundary regression remains
  green (re-run, 28/28 pass) — translation continues to only transform
  caller-supplied text, never fetch a secret.

## 11. Checkpoint
Repository files changed — checkpoint created.
