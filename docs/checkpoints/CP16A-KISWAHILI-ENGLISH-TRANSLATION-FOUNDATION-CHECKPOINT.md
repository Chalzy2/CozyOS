# CP16A Checkpoint: Kiswahili → English Translation Foundation (Multi-Path Architecture)

**Checkpoint name:** CozyOS-CP16A-Kiswahili-English-Translation-Foundation-Checkpoint
**Created:** 2026-08-29
**Built from:** `CozyOS-CP15-Kiswahili-Hearing-To-Learning-Checkpoint.zip`, the latest verified checkpoint

This checkpoint folds in an architectural correction received mid-implementation
("NLLB is a tool, not the knowledge base") **before** finalizing, rather than
shipping a narrower foundation and correcting it in a separate checkpoint.

## Real audit performed before writing any code

Confirmed, by reading the actual files, not assumed:

- **`core/modules/translate/cozy-translate.js`** is a large session/stream/
  channel/glossary/terminology orchestration **kernel** — it has no
  `translate()` method of its own. It is not the right composition
  target for "turn this sourceText into translatedText" and was left
  completely untouched.
- **`core/modules/speech/adapters/speech-translation-provider.js`** — a
  real, already-generic multi-provider registry (`register`/`get`/
  `list`/`translate(text, opts, preferredProviderName)`), fail-closed,
  never fabricates a translation when no provider is registered.
  Existed, unmodified, not previously loaded on any page.
- **`core/modules/speech/adapters/speech-translation-provider-nllb.js`**
  — a complete, real NLLB-200-600M-INT8 provider with a real local
  HTTP bridge, truthful health-checking, and fail-closed behavior.
  Already supports many language pairs (`sw, en, fr, ar, so, ru, zh,
  ha, yo, luo, ki, kam, zu, am, ln, ig, hi`), not just sw→en.
- **`core/living/cozy-language-verification.js`** (`LivingLanguageVerification`)
  already implements the exact "verified learned vocabulary" concept
  the architectural correction asked for: `getRecommendedTranslation(termId)`
  returns a real, explicitly-approved meaning; `getConfidence()` computes
  a real 0-4 confidence tier (No observations → Single Source → Local
  Agreement → Regional Agreement/Community Verified → Expert Verified);
  `recordDialectVariant()`/`listDialectVariants()` already preserve
  regional/Sheng-style variants rather than normalizing them away.
- **`VoiceManager`** already treats `"charles"` (Owner Voice) as its
  real, unconditional per-context default with no override — exactly
  the voice hierarchy CP16A required, with zero new voice-selection
  code needed.

## The architectural correction, folded in

The original plan called `SpeechTranslationProviders.translate()`
directly for every segment — meaning NLLB (the only provider actually
registered) was the sole path. Mid-implementation, an explicit
correction arrived: **NLLB must be one tool among several, never the
sole translation brain.**

**`translateSegment()` now consults a real routing decision
(`routeTranslation()`) first:**

1. Checks `LivingLanguageVerification.getRecommendedTranslation(sourceText)`
   — a real, already-existing, explicitly-approved community/expert
   knowledge lookup. If a real recommendation exists, it is used
   directly, with its own real confidence — **NLLB is never called.**
2. Falls through to the provider registry (NLLB today, potentially
   others tomorrow, all through the same generic registry) only when
   no verified match exists.
3. Honestly reports `{route: 'none', reason}` when neither path can
   answer — never fabricates a translation.

**Proven, not asserted:** a new test constructs a fake verified
recommendation and confirms the provider registry's `translate()` is
called **zero times** — the routing decision genuinely short-circuits
NLLB rather than calling it and discarding the result.

No second language-knowledge store, no second translation engine, no
second voice mechanism was created to achieve this — every piece
already existed and only needed composing in the right order.

## What was built

**`core/modules/translate/translation-segment-core.js`** (new, pure) —
the structured `TranslationSegment` output contract (Section 20):
`segmentId`, `sourceLanguage`, `targetLanguage`, `sourceText`,
`translatedText`, `context`, `confidence`, `timestamp`, `sourceTiming`,
`pauseMetadata`, `deliveryMetadata`, `voiceId`. Pause duration is
computed **only** from two real caller-supplied timestamps — never
estimated from text length or punctuation. `getLipsyncStatus()` always
honestly reports `"Lipsync: pending real provider/runtime support"` —
no phoneme/viseme engine exists anywhere in this repository, and none
is fabricated here.

**`core/modules/translate/translation-service.js`** (new) — the one
real coordination point: `resolveTranslationVoice()` (Owner Voice
hierarchy, reusing `VoiceManager` exactly), `routeTranslation()` (the
correction above), `ensureNllbProviderRegistered()` (idempotent, lazy),
`translateSegment()` (the full real pipeline). Confidence is always
either a real number the provider/verification engine actually
supplied, or the literal string `"unavailable"` — the real
`nllb-bridge` response has no confidence field at all, confirmed by
reading it, so it always reports `"unavailable"` for that path today.

**`core/modules/speech/voice-manager.js`** (edited) — added
`"translation"` to the existing `CONTEXTS` whitelist, mirroring the
exact precedent set by the Owner Voice onboarding rule's `"onboarding"`
context. One line, additive, no other change.

**`index.html`/`dashboard.html`** (edited) — four new `<script>` tags
each, bringing the previously-unloaded translation provider registry
and NLLB provider online, plus the two new coordination files.

## Real full-chain smoke test (before editing any HTML)

All nine dependency files (`platform-event-bus.js` through
`translation-service.js`) were loaded in the real declared order
inside a Node `vm` context, with `DOMContentLoaded` genuinely fired
(matching `charles-voice-provider.js`'s real self-registration
fallback path) — zero exceptions, and `TranslationService.resolveTranslationVoice()`
genuinely resolved to `{available:true, providerId:"charles",
isOwnerVoice:true}`.

## Files changed (exact scope, diffed by hash against CP15)

```
EDITED:
  core/modules/speech/voice-manager.js
  index.html
  dashboard.html

NEW:
  core/modules/translate/translation-segment-core.js
  core/modules/translate/translation-service.js
  core/modules/translate/test/translation-segment-core.test.js
  core/modules/translate/test/translation-service.test.js
```

```
$ md5sum core/modules/speech/voice-manager.js                          7d04740612a4a34e8b04a347db166098
$ md5sum core/modules/translate/translation-segment-core.js            bf2451f35e2a9da2d865b6e69fa82fd5
$ md5sum core/modules/translate/translation-service.js                 df5a8dc0c782ef3184130b109a84c0cd
$ md5sum core/modules/translate/test/translation-segment-core.test.js  f73b22d71b7ee4422bdeb335dfbdfb33
$ md5sum core/modules/translate/test/translation-service.test.js       45a1cfed4692924090ccb223ade3e143
$ md5sum index.html                                                    3446b0a5d5cb7efb9c9e44410bfcc354
$ md5sum dashboard.html                                                b51a69413a78259662006e9a63e920bb
```

## No duplicate engines (confirmed, not just claimed)

Searched every new/changed file for `window.CozyOS.{CozyTranslate,
SpeechTranslationProviders,SpeechTranslationNLLBProvider,VoiceManager,
LivingLanguageVerification} =`. The only matches: this checkpoint's own
test file's mock assignments (expected, test-only), and
`cozy-translate.js`'s own pre-existing, unmodified export line. No
second translation, voice, or verification engine exists anywhere in
this checkpoint.

## Confirmed byte-identical to CP15 (untouched)

`cozy-translate.js`, `speech-translation-provider.js`,
`speech-translation-provider-nllb.js`, `cozy-language-verification.js`,
`learning-panel-ui.js`, `universal-learning-pipeline.js`,
`living-hearing-session.js`, `speech-recognition-adapter.js`,
`dashboard-navigation-core.js` (the locked 5-surface architecture),
and every previously-verified auth/security file.

## Test results (all run this session)

| Suite | Result |
|---|---|
| `core/modules/translate/test/translation-segment-core.test.js` (new) | **16/16** |
| `core/modules/translate/test/translation-service.test.js` (new, incl. 8 routing-correction tests) | **24/24** |
| `core/modules/speech/adapters/test/speech-recognition-adapter.test.js` (regression) | **25/25** |
| `core/modules/speech/adapters/test/kiswahili-language-path.test.js` (regression) | **5/5** |
| `core/modules/speech/adapters/test/speech-translation-provider-nllb.test.js` (regression — the real, pre-existing NLLB provider's own mocked unit test) | **8/8** |
| `core/modules/hearing/test/living-hearing-session.test.js` (regression) | **29/29** |
| `core/modules/learning/test/multimodal-observation-core.test.js` (regression) | **16/16** |
| `core/modules/learning/test/learning-camera-adapter.test.js` (regression) | **21/21** |
| `core/modules/learning/test/universal-learning-pipeline-multimodal.test.js` (regression) | **21/21** |
| `core/modules/learning/test/learning-interaction-core.test.js` (regression) | **20/20** |
| `core/shell/tests/learning-panel-ui.test.js` (regression) | **23/23** |
| `core/shell/tests/dashboard-navigation-core.test.js` (regression — locked 5-surface architecture confirmed untouched) | **43/43** |
| `core/shell/tests/admin-gate-core.test.js` (regression) | **33/33** |
| `server/test/chalzydashboard-gate-integration.test.js` (regression) | **6/6** |
| `test/deployment/verify-production-routing-offline.test.js` (regression) | **21/21** |
| `core/shell/tests/post-login-routing-core.test.js` (regression) | **12/12** |
| `core/security/test/identity-engine.test.js` (regression) | **14/14** |
| `core/modules/identity/test/onboarding-voice-core.test.js` (regression) | **11/11** |
| `core/modules/identity/test/auth-coordinator.test.js` (regression) | **26/26** |
| `core/security/test/login-decision-engine.test.js` (regression) | **19/19** |

**Total: 393/393** across every suite run this session.

**Not attempted, disclosed honestly:** `speech-translation-provider-nllb.integration.test.js`
requires a genuinely running Python NLLB bridge with the real NLLB-200-600M
model loaded (PyTorch/transformers + model weights) — clearly outside
this sandbox's scope. Not run, not claimed as passing.

## Verification levels — stated plainly (Section 21's requirement)

| Capability | Status |
|---|---|
| `TranslationSegment` structured contract | **Unit Verified** |
| Routing decision (verified-vocabulary vs. provider vs. none) | **Unit Verified** |
| Owner Voice resolution, single-voice-per-call | **Unit Verified** |
| Real NLLB provider's own unit contract (registration, fail-closed, response mapping) | **Unit Verified** (pre-existing, re-confirmed) |
| Real JS provider → real HTTP bridge → real NLLB model | **NOT PERFORMED** (requires real Python/PyTorch runtime, not available in this sandbox) |
| Real browser voice/microphone runtime | **NOT PERFORMED** |
| Production Certified | **NOT CLAIMED** |

## Explicitly NOT claimed (Section 23's list, re-confirmed)

❌ native-quality translation, ❌ human-equivalent translation,
❌ perfect Kiswahili, ❌ zero-latency translation, ❌ voice cloning,
❌ exact pastor voice reproduction, ❌ perfect prosody,
❌ real-time lipsync, ❌ universal church translation. None of these
are implemented, tested, or described as working anywhere in this
checkpoint's code or documentation.

## What remains explicitly NOT implemented

- Segmented **live** (continuous, streaming) translation — this
  checkpoint translates one already-final transcript at a time; no
  streaming/segmentation-boundary logic was built (deferred to CP16C
  per the roadmap).
- Delivery timing beyond the honest pause-metadata pass-through — no
  prosody, emphasis, or rate control (CP16D).
- Continuous multilingual learning propagation (`learnedAt`/`verifiedAt`/
  `publishedAt`/`receivedAt`/`availableAt` timing measurement, regional
  Sheng-specific learning flows, cross-instance synchronization) — the
  underlying `LivingLanguageVerification` engine that would carry this
  already exists and is composed here for lookup, but no new
  measurement/synchronization work was built this checkpoint. Explicitly
  future work per the mandate's own Section 21/25.
- Church-context UI selection (a `context` field passes through
  end-to-end, but no selector UI exists).
- The NLLB integration test (real model) — infrastructure boundary,
  not fabricated.
