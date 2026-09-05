# CP14 Checkpoint: Kiswahili Speech Recognition

**Built from:** `CozyOS-CP13-Kiswahili-Hearing-Foundation-Checkpoint.zip`

## Objective

CP13 wired the Listen button to real Hearing/SpeechRecognition
infrastructure. CP14's job was to improve and verify the
speech-recognition layer itself: make Kiswahili the first-priority
recognition language, distinguish interim from final results, report
confidence and timing honestly, and classify real error/recovery cases
distinctly — all without translation, TTS, or any new engine. No
translation, TTS, or voice-cloning work was done here; that remains out
of scope per the spec.

## Baseline

CP13 — Kiswahili Living Hearing Foundation (184/184 tests, real
Node `vm` full-chain verification, no Browser-Runtime verification).
CP13's architecture, state machine, and files are unchanged in
structure; every change below is additive or a targeted fix.

## Real gap found before writing any code

`core/modules/speech/adapters/speech-language-adapter.js` (validates a
requested language against CozySpeech's real registry and resolves its
BCP-47 tag) has existed since Milestone 148, but — confirmed by grep,
not assumed — had **no `<script>` tag on `index.html` or
`dashboard.html`**. CP13 had already disclosed this as a known gap.
Concretely, this meant `speech-recognition-adapter.js`'s `start()` was
falling back to using the raw language string (`"sw"`) completely
unvalidated: an unregistered/misspelled language code would have been
handed straight to the browser's `SpeechRecognition` constructor
instead of failing closed.

## What was built

**`index.html` / `dashboard.html`** (edited) — added the missing
`<script src="core/modules/speech/adapters/speech-language-adapter.js">`
tag on both pages, loaded after `cozy-speech.js` (its dependency) and
before `speech-recognition-adapter.js` (its consumer). Real chain now:
`cozy-speech.js → speech-language-adapter.js → speech-recognition-adapter.js`.

**`core/modules/speech/adapters/speech-recognition-adapter.js`** (edited, additive):
- Confidence: a missing numeric confidence from the provider now
  reports `confidence: "unavailable"` (was `null`). Never a fabricated
  percentage, in either case — this only makes "not supplied" explicit
  instead of ambiguous with a falsy `null`.
- Unregistered-language failures now also fire a real `onError` event
  (`error: "language-not-supported"`), not only a return value, so
  callers using the normal error-recovery event path see it too.
- Added `#stopWasRequested` tracking: `stop()`/`cancel()` set it before
  asking the real recognizer to stop; the real `onend` handler now
  reports `wasExpectedStop: true/false` — `true` only when this
  adapter's own `stop()`/`cancel()` caused it, `false` when the
  provider ended the session on its own (network drop, timeout,
  provider-side stop). **No auto-restart logic was added** — that is
  the exact class of change that risks an infinite restart loop, and
  the spec explicitly asks to prevent that, not add a new source of it.
- Added `getLastTimings()`: real `Date.now()` measurements only —
  `startRequestedAt`, `recognitionStartedAt`, `firstInterimAt`,
  `firstFinalAt`. Each field stays `null` until its real corresponding
  event actually fires. No claimed/guessed millisecond figure exists
  anywhere in this file.

**`core/modules/hearing/living-hearing-session.js`** (edited, additive):
- `classifyProblem()` extended with `language-not-registered`,
  `recognition-service-not-allowed`, `network-interruption`,
  `no-speech-detected`, `provider-start-failure`, `aborted` — each a
  distinct bucket for a distinct real reason string, on top of CP13's
  existing `permission-denied` / `hardware-unavailable` /
  `already-listening`. Anything not matched still stays `unknown`
  rather than being guessed into one of these.
- `getLastTimings()` added: delegates to the adapter's own
  `getLastTimings()` and adds this session's own real
  `micAcquiredAt` (set only once `CozyHearing.startListening()`
  actually succeeds). Returns whatever the adapter provides without
  fabricating fields if an older adapter build lacks
  `getLastTimings()`.
- The internal `onStop` forwarder now passes the real event detail
  through to the caller's `onStop` callback (it previously discarded
  it), so `wasExpectedStop` actually reaches a consumer.

**No new files, no new engines.** Nothing above creates a second
`SpeechRecognitionAdapter`, `Hearing` engine, `AudioEngine`, or
language registry — confirmed by grep before editing, per CP14's own
"No Duplicate Engines" rule.

## Raw vs. normalized transcript boundary

**Raw transcript: implemented.** The provider's `transcript` string
reaches `onResult`/`onPartialResult`/`onFinalResult` byte-for-byte,
verified by a dedicated test with deliberately messy whitespace/casing
input.
**Normalized transcript: not yet implemented.** No normalization
engine exists anywhere in this codebase — confirmed by grep before
this checkpoint, same as CP13's own disclosure about
`speech-language-adapter.js`. CP14 does not invent one; a test
explicitly asserts no `normalizedTranscript` field exists, so this
boundary is documented rather than pretended.

## Test results (all run this session)

| Suite | Result |
|---|---|
| `core/modules/speech/adapters/test/speech-recognition-adapter.test.js` (new — config/sw pass-through, language validation incl. fail-closed on unregistered language, interim vs final, confidence present/unavailable, multiple segments, empty result, lifecycle, expected stop (`stop()`/`cancel()`), unexpected stop (provider-side `onend`), no-auto-restart proof, distinct error codes for `service-not-allowed`/`network`/`no-speech`/provider `start()` rejection, raw-transcript boundary, real timing measurements, full Kiswahili fixture round-trip) | **25/25** |
| `core/modules/speech/adapters/test/kiswahili-language-path.test.js` (new — loads the REAL `cozy-speech.js` registry and REAL `speech-language-adapter.js`, not fakes, proving `"sw"`/`"Kiswahili"` is a genuine registry entry, `resolve("sw")` succeeds against it, an unregistered language fails closed, and `continuous`/`interimResults`/the resolved language reach a fake recognition instance unmodified through the real chain) | **5/5** |
| `core/modules/hearing/test/living-hearing-session.test.js` (CP13's original 14 + CP14 additions: extended failure classification incl. all-six-classes-are-distinct proof, `getLastTimings()` incl. missing-adapter-method case, `onStop` detail forwarding, interim-never-reaches-final proof, raw-transcript boundary, continuous/interimResults pass-through) | **29/29** |

## Regression (all run this session)

| Suite | Result |
|---|---|
| `core/modules/learning/test/universal-learning-pipeline-multimodal.test.js` | **16/16** |
| `core/modules/learning/test/learning-interaction-core.test.js` | **19/19** |
| `core/modules/learning/test/learning-camera-adapter.test.js` | **21/21** |
| `core/shell/tests/learning-panel-ui.test.js` | **12/12** |
| `core/shell/tests/dashboard-navigation-core.test.js` (5-surface navigation architecture untouched) | **pass, 0 fail** |
| `core/shell/tests/admin-gate-core.test.js` | **33/33** |
| `core/shell/tests/post-login-routing-core.test.js` | **12/12** |
| `core/security/test/identity-engine.test.js` | **14/14** |
| `core/modules/intelligence/language/tests/cozy-language-registry.test.js` | **pass, 0 fail** |
| `core/modules/intelligence/language-packs/tests/cozy-language-pack-registry.test.js` | **pass, 0 fail** |

**Total new/updated CP14-relevant tests: 59/59. Zero regressions across every suite above.**
`node --check` clean on every changed/new `.js` file. Both edited HTML
files verified script-tag-balanced (73→74 `<script>` tags each, the
one real addition, no stray/unbalanced tags) after this checkpoint's
edits.

## Real findings this session

1. `speech-language-adapter.js` had no `<script>` tag on either entry
   point (disclosed by CP13, fixed here) — Kiswahili language
   validation was not actually running in the browser despite the
   adapter file existing and being correct.
2. Missing confidence was reported as `null`, which a consumer could
   misread as "0 / low confidence" rather than "not supplied." Now
   explicit `"unavailable"`.
3. `onend` firing on its own (unexpected stop) was indistinguishable
   from a caller's own `stop()` — both produced an identical `onStop`
   event with no detail. Now carries a real `wasExpectedStop` flag.
4. `living-hearing-session.js`'s internal `onStop` forwarder discarded
   the adapter's event detail entirely (called the callback with zero
   arguments) — fixed so `wasExpectedStop` actually reaches a caller.
5. An unregistered-language failure only reached a caller through
   `start()`'s return value, not through the `onError` event path that
   the rest of the error-recovery flow relies on — fixed.

## Browser/device verification

**Browser Runtime Kiswahili Verification: NOT PERFORMED.** No real
browser or physical device microphone was used anywhere in this
session. Everything above is UNIT VERIFIED (mocked `SpeechRecognition`)
except `kiswahili-language-path.test.js`, which additionally uses the
REAL `cozy-speech.js` registry and REAL `speech-language-adapter.js` —
still not a claim of real-world recognition accuracy. The Kiswahili
sentences in `fixtures/kiswahili-sentences.js` are controlled test
input fed to a fake recognizer; they prove the integration correctly
carries representative Kiswahili text (greetings, church language,
questions, numbers, names, punctuation, repeated words, pauses)
through the interim→final pipeline unmodified. They are **not** a
measurement of what any real Kiswahili speech-recognition provider
would actually transcribe from real audio, and are not presented as
one anywhere in this checkpoint.

## Remaining work (honest, genuine)

- Real browser/device Kiswahili microphone test — not performed, no
  such environment available this session.
- Normalized transcript — not implemented (no engine exists to wire
  to); documented as a boundary rather than invented.
- Auto-restart-on-unexpected-stop is intentionally NOT implemented —
  `wasExpectedStop` is now real and available for a future milestone
  to build a restart policy on top of, with explicit loop prevention,
  rather than CP14 adding restart behavior itself.
- Translation (Kiswahili → English/French/Arabic/other), voice output/
  TTS, prosody, voice cloning, live church translation — all remain
  exactly as unimplemented as before, per CP14's own scope boundary.

## Next milestone

CP15 — Hearing → Learning integration (Recognition → Learning).
