# Micro-Milestone D — Voice / STT Authority Reconciliation Audit

**Type:** Audit only. No production files were changed in this pass.
**Baseline:** Checkpoint C — OCR Authority Reconciliation
**Baseline SHA-256:** `f0198994b35b4be942deeb30103fab4a0627672e561db211251f6e77b62d4030`
(Verified: the container's in-session copy of Checkpoint C was diffed
byte-for-byte against the delivered zip before this audit began, and
matched exactly — no upload was available this turn, so continuity was
established from the verified artifact already on disk rather than
re-uploading.)

This audit re-examines the conflict recorded in
`docs/audits/MICROMILESTONE-A-COZYAI-OWNERSHIP-AUDIT.md` (row 16): a
claimed, unresolved conflict between `cozy-speech.js` and "the separately
briefed Milestone 178 'Cozy Voice Engine.'" **The headline finding of this
audit is that this claimed conflict does not exist as described** — the
repository's own certified governance record (`docs/governance/
Migration-Log.md`, `docs/milestones/Milestone-180B-Continuation.md`)
already investigated and closed this exact question before
Micro-Milestone A was written, and Micro-Milestone A's summary of it was
stale/inaccurate. Details below.

---

## 1. Correcting the record: what Milestone 178 and the "Voice Engine" actually are

| Claim in Micro-Milestone A | What the repository's own governance record actually shows |
|---|---|
| "Milestone 178 'Cozy Voice Engine'" is a separately briefed, competing implementation | Milestone 178 is **"CozySpeech Runtime Activation"** (`Migration-Log.md`) — it activated 12 pre-existing dormant adapters under `core/modules/speech/adapters/` by adding script tags to `dashboard.html`, and fixed one missing duplicate-load guard on `cozy-tts-browser-adapter.js`. It did not create a competing engine; it wired up `cozy-speech.js`'s own adapter ecosystem. |
| Conflict is "still unresolved, awaiting a user scope decision" | Milestone 180B's own Gate 1 ("Ownership Review") already asked this exact question and answered it: *"'Voice Engine' as a distinct owner of 'voice session / speech routing / voice interaction' — **does not exist anywhere in this repository.** No file assigns `window.CozyOS.Voice` or `window.CozyOS.VoiceEngine`. This is a genuine new-capability gap..."* Milestone 180B then built `core/engines/voice/voice-engine.js` deliberately narrow — a developer-identity voice Q&A feature only — specifically so it would *not* compete with `cozy-speech.js`. |

Conclusion: there is one real coordinator (`cozy-speech.js`/CozySpeech) and
one later, narrowly-scoped consumer (`voice-engine.js`/VoiceEngine,
M180B) that composes it — not two competing owners. Micro-Milestone A's
"halt-pending-scope-decision" framing appears to be an artifact of an
even earlier, informal "briefing" that predated Milestone 180B's Gate 1
investigation, and was never corrected in the audit trail. This
milestone corrects it now.

## 2. All voice/speech/STT/TTS implementations found (full-repo search, not name-based)

### 2a. `core/modules/speech/cozy-speech.js` — CozySpeech (the coordinator)

| Dimension | Finding |
|---|---|
| Live/dead | **LIVE.** Loaded in `admin-workspace.html`, `dashboard.html`, `login.html`, `index.html`, `ldce-verification-harness.html`. |
| Role | Coordinator/registry only, by its own explicit header: *"CozySpeech is NOT: Speech recognition · Synthesis · Translation · Audio processing..."* It owns session/stream/source/device/language/adapter bookkeeping and one real hook: `previewVoice()`/`registerPreviewBackend()`/`hasRealPreviewBackend()` (the actual TTS call-through). |
| API | `registerAdapter()`, `registerPreviewBackend()`, `previewVoice()`, `hasRealPreviewBackend()`, `listLanguages()`, `registerVoiceSettings()`, plus the full session/device/topology/graph registries (V2). |
| STT capability | None itself — delegates entirely to `SpeechRecognitionAdapter`. |
| TTS capability | The real call-through hook only; actual synthesis is `CozyTTSBrowserAdapter`'s job. |
| Language support | `listLanguages()` includes `en, sw (Kiswahili), fr, ar, so (Somali), pt`, plus an extended African set: `mas (Maasai), orm (Oromo), amh (Amharic), lug (Luganda), nyn (Runyankole), kin (Kinyarwanda), run (Kirundi), zul (Zulu), xho (Xhosa), sot (Sotho), wol (Wolof), hau (Hausa), yor (Yoruba), ibo (Igbo)`. This is a **metadata registry only** — CozySpeech's own header states device/topology/health fields are "store-only, never interpreted." Whether a given language actually works end-to-end depends on the browser's SpeechRecognition/SpeechSynthesis engines (STT/TTS), not on this registry. |
| Auth/permission checks | None in this file. Session/device registration is bookkeeping only. |
| Existing tests | **None found** — no `cozy-speech.test.js` anywhere in the repository. |
| Application-specific vs Core | **Reusable Core** — confirmed by cross-application consumers (see §3). |

### 2b. `core/modules/speech/adapters/speech-recognition-adapter.js` — SpeechRecognitionAdapter (the real STT authority)

| Dimension | Finding |
|---|---|
| Live/dead | **LIVE**, loaded on every page listed above. |
| Milestone | 148 — Speech Recognition Provider Integration. |
| STT provider | The browser's native `SpeechRecognition` / `webkitSpeechRecognition` API — nothing else. `isReal()` honestly reports `false` if neither constructor exists; `start()` fails closed with an explicit "Not fabricated" reason. |
| API | `start(config)`, `stop()`, `cancel()`, `on(event, handler)` for `onStart/onStop/onSpeechStart/onSpeechEnd/onResult/onPartialResult/onFinalResult/onError`. Also emits every event onto the shared `PlatformEventBus` as `speech-recognition:<event>`. |
| Real callers/consumers | `cognitive-coordinator.js` (`startVoiceSession()`/`stopVoiceSession()`), `core/engines/voice/voice-engine.js` (subscribes to `speech-recognition:onFinalResult`), `core/engines/wakeword/wake-word-engine.js`, `core/modules/ChurchOS/church-worship-session.js` (live worship transcription/translation), `core/modules/learning/universal-learning-pipeline.js`, `core/modules/communication/ldce-caption-engine.js` (live captioning). This is a genuinely wide, cross-application consumer set. |
| Language support | Delegates language validation to `SpeechLanguageAdapter` (reuses CozySpeech's registry); actual recognition-language support is whatever the browser's SpeechRecognition engine supports for that BCP-47 code — Kiswahili (`sw`) and most of the African-language codes listed in §2a are **registered as metadata but not verified to actually recognize speech**, since that depends entirely on the host browser/OS, which this environment cannot test (no browser available). |
| Microphone/device permissions | This adapter itself never calls `getUserMedia` — the browser's native `SpeechRecognition` object requests microphone access itself (a browser-level permission prompt), outside CozyOS's control. Raw microphone *capture* (distinct from recognition) is a separate adapter, `VoiceCaptureAdapter`, which does call real `getUserMedia`. |
| Auth/authorization checks | **None.** The adapter's own header states plainly: *"Does NOT authenticate, verify identity, or change auth state."* Any code holding a reference to `window.CozyOS.SpeechRecognitionAdapter` can call `start()` directly — no CozyOS-level permission, consent, or organization check gates it. |
| Existing tests | **None found** — no dedicated test file. |
| Application-specific vs Core | **Reusable Core** — the single real STT authority, consumed by ChurchOS, the Cognitive Coordinator, Wake Word, Voice Engine, and the Learning Pipeline alike. |

### 2c. `core/modules/speech/adapters/cozy-tts-browser-adapter.js` — CozyTTSBrowserAdapter (the real TTS authority)

| Dimension | Finding |
|---|---|
| Live/dead | **LIVE**, loaded on every page listed in §2a. |
| Milestone | 149 — Text-to-Speech Provider Integration. Also the file Milestone 178 patched (added the one missing duplicate-load guard). |
| TTS provider | Browser `window.speechSynthesis`/`SpeechSynthesisUtterance` — the standard Web Speech API. Honestly does not register a preview backend if unavailable. |
| Real callers/consumers | Registers itself as CozySpeech's `previewVoice()` backend; also called directly by `VoiceManager` (fallback chain) and `living-voice-style-engine.js` (`speakPreview()`). |
| Language/voice support | Maps a requested `language` to an installed `SpeechSynthesisVoice` by BCP-47 prefix **only if the host OS/browser has that voice installed** — it does not ship or guarantee any voice itself. Whether Kiswahili or another African-language voice is available is entirely a function of the end-user's device, not this codebase. |
| Existing tests | None dedicated to this file; exercised indirectly by `core/living/tests/living-tts.test.js`. |
| Application-specific vs Core | Reusable Core (one of two real backends `VoiceManager` routes to). |

### 2d. `core/modules/speech/voice-manager.js` — VoiceManager

Real provider registry + fallback chain (requested provider → `CharlesVoiceProvider` → generic `CozyTTSBrowserAdapter`). Already registered as CozySpeech's preview backend. Loaded on every page in §2a. This is the layer `core/living/living-tts.js` and `voice-generation-engine.js` (§2h) both call through, rather than reaching for `CozyTTSBrowserAdapter` directly — confirmed a single real fallback chain, not a duplicate one.

### 2e. `core/modules/speech/providers/charles-voice-provider.js` and `stub-voice-providers.js`

`CharlesVoiceProvider` is a named voice persona provider, loaded on every page in §2a — a real registered provider `VoiceManager` can route to. `stub-voice-providers.js` (admin-workspace only) includes an explicit, honest `swahili-pack` entry: `status: "not_installed"`, `reason: "No Swahili voice pack has been installed on this device yet."` This is a disclosed stub, not a fabricated capability — confirms Kiswahili TTS is a named, anticipated, but not-yet-available capability.

### 2f. `core/engines/wakeword/wake-word-engine.js` — WakeWordEngine (Milestone 179)

| Dimension | Finding |
|---|---|
| Live/dead | **LIVE**, but only on `admin-workspace.html` — not on `dashboard.html`/`login.html`/`index.html`. |
| STT dependency | Browser `SpeechRecognition`/`webkitSpeechRecognition` directly (continuous mode), independent of `SpeechRecognitionAdapter`. |
| Real callers | `core/engines/audio/cozy-audio-engine.js`, `core/engines/search/search-engine.js`, `core/engines/voice/voice-engine.js`. |
| Scope | Wake-phrase registration/detection only, per its own header — unrelated to developer-identity content or general STT. |
| Known gaps (self-disclosed at M179) | No offline wake-word model (Web Speech API is cloud-backed in Chrome); no multilingual wake-phrase handling; CozyAI integration is a callback/event contract only, no live connection. |
| Overlap | None — genuinely distinct responsibility (phrase-spotting vs. general transcription), confirmed by its own scope statement and by not sharing a code path with `SpeechRecognitionAdapter`. |

### 2g. `core/engines/voice/voice-engine.js` — VoiceEngine (Milestone 180B)

Already covered in §1. Narrow scope: on a developer-identity question detected via `SpeechRecognitionAdapter`'s `onFinalResult` event, delegates to `window.CozyOS.DeveloperIdentity.query()` and hands the answer to `CozySpeech.previewVoice()`. **Only wired into `admin-workspace.html`** — not reachable from the end-user dashboard, login, or index pages. No external caller invokes it directly (purely event-driven); confirmed no other file references `window.CozyOS.VoiceEngine`.

### 2h. `core/modules/speech/generation/voice-generation-engine.js` — Voice Generation Engine (M388, Engine 7)

A **fourth, genuinely distinct system**: a Node-module (CommonJS/ESM style, not a browser global) that is Engine 7 of the "Living Media Interpreter" pipeline (video translation/dubbing). It composes `VoiceManager.speak()` (preferred) or `CozyTTSBrowserAdapter.speakPreview()` (fallback) — it does not reimplement synthesis. Confirmed live: required by `synchronization-engine.js`, `video-interpreter-coordinator.js`, and `engine-bridge-bootstrap.js`. Self-discloses a real limitation: the Web Speech API is playback-only, so `realAudioBuffer: false` is always honestly reported (tracked as gap MD-020, not hidden). Has its own test file, `voice-generation-engine.test.js`. This is a different problem domain (video-dubbing pipeline orchestration) from live conversational STT/TTS — not a competing authority.

### 2i. `core/security/voice-provider.js` — VoiceProvider (a different "voice" entirely)

Important disambiguation: this is **voice as a biometric authentication factor** (same pattern as `face-provider.js`/`fingerprint-provider.js`), not speech recognition. Its own header states it plainly: *"No real voice recognition is implemented. This file exposes a real provider interface only."* It does not compete with CozySpeech/SpeechRecognitionAdapter — different problem (identity verification) sharing only the English word "voice." `voice-security-bridge.js` (§2a's adapter list) is a read-only diagnostic bridge between the two, confirming they are deliberately kept separate.

### 2j. `core/living/living-tts.js`, `core/living-voice-style-engine.js`, `core/modules/communication/ldce-caption-engine.js`, `core/modules/ChurchOS/church-worship-session.js`

All four are **consumers**, not competing authorities. Each carries its own "ownership audit performed before this file was written" header explicitly citing CozySpeech/VoiceManager/SpeechRecognitionAdapter/CozyTTSBrowserAdapter as the real owners it composes. `living-voice-style-engine.js` (M344) is notable for an explicit identity-safety design constraint: it never records a spectral fingerprint or formant map, and never touches Scripture text.

## 3. Dependency Map

**Real, live STT/TTS chain (browser-facing pages):**
```
Microphone (browser-level permission prompt, not a CozyOS check)
  ↓
SpeechRecognitionAdapter (window.SpeechRecognition / webkitSpeechRecognition)
  ↓ emits speech-recognition:onFinalResult (PlatformEventBus) + direct callback
consumers: CognitiveCoordinator.startVoiceSession(), WakeWordEngine,
VoiceEngine (developer-identity Q&A, admin-workspace only),
ChurchOS church-worship-session.js (live transcription/translation),
UniversalLearningPipeline, LDCE caption engine
  ↓ (language handling via SpeechLanguageAdapter, reusing CozySpeech's registry)
AI/consumer response (e.g. CognitiveCoordinator.run())
  ↓
CozySpeech.previewVoice() → VoiceManager (provider fallback chain)
  ↓
CozyTTSBrowserAdapter (window.speechSynthesis) or CharlesVoiceProvider
  ↓
Spoken output (only if the host OS/browser has a matching installed voice)
```

**Separate, non-conflicting chain (video-dubbing pipeline, Node-side, M388):**
```
Translated text segment (Engine 3) + speaker (Engine 4)
  ↓
voice-generation-engine.js (Engine 7)
  ↓
VoiceManager.speak() (preferred) or CozyTTSBrowserAdapter.speakPreview() (fallback)
  ↓
Synchronization Engine (Engine 8) — realAudioBuffer always false (disclosed gap MD-020)
```

**Reusable Core vs. application-specific:**
- Reusable Core: `cozy-speech.js`, `SpeechRecognitionAdapter`, `CozyTTSBrowserAdapter`, `VoiceManager`, `SpeechLanguageAdapter`/`SpeechSessionAdapter`/other adapters, `WakeWordEngine`.
- Application-specific: `church-worship-session.js` (ChurchOS), `voice-engine.js` (developer-identity feature, admin-only), `living-voice-style-engine.js`/`living-tts.js` (Living experience layer), `voice-generation-engine.js` (M388 video-dubbing pipeline only).

## 4. Security

- **No CozyOS-level authorization, consent, or organization-isolation check exists** before microphone capture or speech recognition starts, in either `SpeechRecognitionAdapter.start()` or `VoiceCaptureAdapter.start()` — both rely entirely on the browser's own native permission prompt. This is a genuine, pre-existing gap, not introduced or fixed here.
- `VoiceProvider` (voice-as-auth-factor) is a separate, unrelated system and does not gate STT/TTS usage — confirmed no code path routes recognition or synthesis through it.
- `voice-security-bridge.js` exists specifically to correlate microphone activity with auth events for diagnostics, but is explicitly read-only and owns no enforcement.
- Fail-closed behavior: confirmed present at the capability level (both `SpeechRecognitionAdapter.isReal()` and `CozyTTSBrowserAdapter` honestly report unavailable rather than fabricating a result when the underlying browser API is missing) — but this is a capability-availability check, not an authorization check. Nothing prevents an available browser API from being used by unauthorized code.
- No organization-isolation logic was found anywhere in the speech/voice chain — sessions are tracked by `sessionId` for bookkeeping, not scoped or fenced by organization.

## 5. Dead Code

**None found.** Unlike the OCR audit (Micro-Milestone C), every voice/speech/STT/TTS file discovered in this pass is either genuinely live (loaded by at least one HTML page or required by at least one live Node module) or is a real, disclosed stub (`stub-voice-providers.js`'s Swahili pack entry — not dead code, an honest "not yet installed" placeholder that IS loaded and IS queried).

## 6. Existing Tests Run This Pass

No dedicated test file exists for `cozy-speech.js`, `SpeechRecognitionAdapter`, `WakeWordEngine`, or `voice-engine.js` (confirmed by repository-wide search). `core/living/tests/living-tts.test.js` and `core/modules/speech/generation/tests/voice-generation-engine.test.js` exist and cover their respective composing files, not the core STT/TTS adapters directly. Per this milestone's audit-only scope, no new test was written (nothing to verify without new wiring, which is out of scope), and the existing tests above were not re-run because no production file changed for them to regress against.

## 7. Summary / Certification

- **Real STT authority:** `SpeechRecognitionAdapter` (browser `SpeechRecognition`/`webkitSpeechRecognition`), Core, live, widely consumed.
- **Real TTS authority:** `CozyTTSBrowserAdapter` (browser `speechSynthesis`) routed through `VoiceManager`, Core, live, widely consumed.
- **Coordinator, not an execution engine:** `cozy-speech.js`/CozySpeech — bookkeeping and the one real preview-backend hook only.
- **The claimed "cozy-speech.js vs. Milestone 178 Voice Engine" conflict does not exist.** It was already investigated and closed by Milestone 180B's own Gate 1 before Micro-Milestone A was written; Micro-Milestone A's summary was stale. `voice-engine.js` (M180B) is a narrow, complementary consumer, not a competing owner.
- **A genuinely distinct fourth system** exists and is fine as-is: `voice-generation-engine.js` (M388 video-dubbing pipeline, Node-side), which composes the same TTS chain rather than duplicating it.
- **A genuinely distinct, unrelated "voice" system** also exists and is fine as-is: `voice-provider.js` (biometric voice authentication factor — no real recognition implemented, by design).
- **No dead code found** in this domain.
- **Real, disclosed gaps, left unchanged:** no CozyOS-level authorization/consent/org-isolation gate on microphone/recognition start; Kiswahili/African-language support is registered as metadata but unverified for actual STT/TTS execution (browser/OS-dependent, untestable in this environment); WakeWordEngine and VoiceEngine are wired only into `admin-workspace.html`, not the end-user-facing pages.
- No production files were modified. This document is the only intentional addition in this milestone.
