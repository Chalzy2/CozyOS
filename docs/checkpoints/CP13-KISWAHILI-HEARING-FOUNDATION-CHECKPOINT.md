# CP13 Checkpoint: Kiswahili Living Hearing Foundation

**Built from:** `CozyOS-CP12-Multimodal-Learning-Interaction-Layer-Checkpoint.zip`

## Real gap found before writing any code

CP12's Listen button never actually reached CozyHearing/AudioEngine.
`universal-learning-pipeline.js#learnFromVoice()` called
`SpeechRecognitionAdapter` directly, and **neither `cozy-audio-engine.js`
nor `cozy-hearing.js` had a `<script>` tag on `index.html` or
`dashboard.html` at all** — confirmed by grep, not assumed. That's the
literal, root reason Hearing was never in the loop.

A second real bug was found in the same call site: `adapter.on(...)`
was called fresh on every Listen tap with nothing ever removing the
previous tap's listeners — a genuine, confirmed duplicate-callback
leak (2nd tap fires 2 callbacks, 3rd fires 3, ...). `off()` did not
exist anywhere on `SpeechRecognitionAdapter`.

## What was built

**`core/modules/hearing/living-hearing-session.js`** (new) —
composes CozyHearing (real mic permission/lifecycle via AudioEngine)
+ SpeechRecognitionAdapter (real recognition lifecycle). State
machine `IDLE → PERMISSION_PENDING → LISTENING → STOPPING → STOPPED`,
any step → `ERROR`. Registers its adapter listeners **exactly once,
ever** (`#ensureAdapterListeners`), which fixes the duplicate-callback
bug by construction rather than by remembering cleanup on each call.
`destroy()` uses the new `off()` for full teardown. Cleans up the
microphone via `CozyHearing.stopListening()` if recognition fails to
start after permission was already granted.

**`core/modules/speech/adapters/speech-recognition-adapter.js`**
(edited, additive) — added `off(eventName, handler)`; nothing else
changed.

**`core/modules/learning/universal-learning-pipeline.js`** (edited)
— `learnFromVoice()`'s external contract is unchanged; internally it
now delegates to `LivingHearingSession` instead of the adapter
directly. `captureVoiceForLearning()`/`learnFromCameraAndVoice()`
were also silently dropping `continuous`/`interimResults` before this
checkpoint (confirmed by reading the destructuring, not assumed) —
fixed so those flags actually reach the adapter.

**`core/shell/learning-panel-ui.js`** (edited, one line) — Listen/Scan+Listen
now request `{ languageCode: 'sw', continuous: true, interimResults: true }`
instead of `{}` (which defaulted to `en-US`, non-continuous, no
interim results).

**`index.html` / `dashboard.html`** (edited) — added the two missing
`<script>` tags (`cozy-audio-engine.js`, `cozy-hearing.js`) plus the
new `living-hearing-session.js`, in dependency order after
`speech-recognition-adapter.js`.

## KISWAHILI FLUENCY REQUIREMENT — Phase 1 scope note (Charles, this session)

Recognition and synthesis speed are explicitly separate concerns.
This checkpoint only touches **recognition**: Kiswahili (`sw`) is
real and already registered in `CozySpeech`'s language registry —
confirmed via `listLanguages()`, not invented — and is now the
Listen flow's default language, with `continuous`/`interimResults`
on so recognition doesn't wait for a full sentence before producing
results. **Speech synthesis/TTS/voice output is untouched and remains
explicitly out of scope for CP13**, per Charles's own note ("CP13:
fast continuous Kiswahili hearing first... later phases address
natural spoken output"). Nothing here claims fluent Kiswahili speech
output — that claim isn't available to make yet.

Disclosed, not fixed (pre-existing, outside this milestone's scope):
`speech-language-adapter.js` — which would validate `"sw"` against
the real registry and resolve a real `bcp47` tag — has no `<script>`
tag on either page either, so recognition currently falls back to
using the raw `"sw"` string as-is rather than a validated tag (still
correct and real, just unvalidated). The registry itself also has no
region-specific tag yet (`sw-KE` vs `sw-TZ`) — `"sw"` is the accurate
value the real registry actually has.

## No duplicate engines confirmed

Grepped for `LivingHearingSession`/`HearingSession` before writing —
no prior owner existed. `off()` is additive to the one real adapter,
not a second adapter.

## Real full-chain verification (Node `vm`, not `require`-mocked)

Loaded `platform-event-bus.js → speech-recognition-adapter.js →
cozy-audio-engine.js → cozy-hearing.js → living-hearing-session.js`
in a real `vm` context. Zero exceptions. Then ran a full real
success path with a fake `SpeechRecognition` constructor + fake
`getUserMedia`: mic permission acquired through
`AudioEngine → CozyHearing`, recognition started with
`languageCode:"sw", continuous:true, interimResults:true`, a final
transcript ("habari yako") returned end-to-end, state settled
`LISTENING → STOPPED` correctly on explicit `stop()`.

## Test results (all run this session)

| Suite | Result |
|---|---|
| `core/modules/hearing/test/living-hearing-session.test.js` (new — start, stop, permission denied, hardware unavailable, recognition unavailable, repeated start/stop, listener cleanup, no duplicate callbacks) | **14/14** |
| `core/modules/learning/test/universal-learning-pipeline-multimodal.test.js` (regression — updated to route through the real `LivingHearingSession` + a `CozyHearing` fake instead of the bypassed adapter path; also fixed a pre-existing mock gap this change exposed: `faithfulSpeechAdapterMock.start()` never returned a value) | **16/16** |
| `core/modules/learning/test/learning-interaction-core.test.js` (regression) | **19/19** |
| `core/modules/learning/test/learning-camera-adapter.test.js` (regression) | **21/21** |
| `core/shell/tests/learning-panel-ui.test.js` (regression) | **12/12** |
| `core/shell/tests/dashboard-navigation-core.test.js` (regression — 5-surface architecture untouched) | **43/43** |
| `core/shell/tests/admin-gate-core.test.js` (regression) | **33/33** |
| `core/shell/tests/post-login-routing-core.test.js` (regression) | **12/12** |
| `core/security/test/identity-engine.test.js` (regression) | **14/14** |

**Total: 184/184.** `node --check` clean on every changed/new file.

## Verification levels (Rules 116/117)

| Capability | Status |
|---|---|
| CozyHearing + AudioEngine actually loaded and reachable from Living Learn | **UNIT VERIFIED + Node `vm` full-chain runtime** |
| Real mic permission gates recognition start; permission-denied/hardware-unavailable/recognition-unavailable all fail closed with a classified reason | **UNIT VERIFIED** |
| No duplicate callbacks across repeated start/stop | **UNIT VERIFIED** (structural — single-ever registration, not just tested) |
| Proper microphone cleanup on stop and on a late recognition-start failure | **UNIT VERIFIED** |
| Kiswahili end-to-end (mic → real "sw" recognition → transcript) | **Node `vm` full-chain runtime, fake `SpeechRecognition`/`getUserMedia`** |
| Real browser microphone/SpeechRecognition runtime | **NOT PERFORMED** — no real browser or device used anywhere this session |
| Production Certified | **NOT CLAIMED** |

## Not yet implemented (honest, unchanged from CP12's own list plus this session's scope note)

Translation, OCR, voice output/TTS, learning persistence, prosody,
live church translation, Kiswahili speech *synthesis* fluency.
`speech-language-adapter.js` wiring (disclosed above, pre-existing).
