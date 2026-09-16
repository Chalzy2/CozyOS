# Milestone 178 — Gate 5 — Continuation

**Milestone:** 178 — CozySpeech Runtime Activation

**Baseline:** `CozyOS-main-v1_3_1-M177.zip`. No new ZIP required to
resume — this conversation's edits are the current state, packaged at
the end as `CozyOS-main-v1_3_1-M178.zip`.

## Completed

- **Gate 1A:** confirmed `window.CozyOS.CozySpeech`
  (`SPEECH_VERSION = "2.2.0-ENTERPRISE"`) as sole canonical speech
  engine. Inventoried 14 files under `core/modules/speech/adapters/`:
  2 already wired, 12 dormant. Confirmed the wired Translation adapter
  is not a valid reference for `CozySpeech.registerAdapter()` (it
  routes through `CozyTranslate` instead, per its own documented
  ownership correction). Confirmed Wake Word and CozyAI integration
  are genuine gaps.

- **Gate 2, Phase 1 + 2:** activated 7 of 12 dormant adapters
  (`VoiceCaptureAdapter`, `SpeechRecognitionAdapter`,
  `VoiceProcessorAdapter`, `SpeechLanguageAdapter`,
  `SpeechSessionAdapter`, `SpeechCommandAdapter`,
  `VoiceSettingsAdapter`) by adding script tags to `dashboard.html`.
  Verified repository/static/runtime clean. Found and held on one
  issue: `cozy-tts-browser-adapter.js` (Phase 3) was missing the
  duplicate-load guard present in all 11 siblings.

- **Gate 2B, Phase 3 (this conversation):**
  - **Gate 1 re-verification:** confirmed the missing guard, confirmed
    `register()`'s unconditional call site, confirmed no `adapterId`
    is supplied to `registerAdapter()`, confirmed
    `CozySpeech.registerAdapter()` still has no duplicate protection
    of its own. Re-verified the remaining 4 Phase 3 files
    (`speech-preview-adapter.js`, `speech-capability-adapter.js`,
    `voice-capability-stub.js`, `voice-security-bridge.js`): all 4
    already carry the standard duplicate guard, all paths exist, all
    dependencies resolve lazily.
  - **Change 1:** added the single missing guard line to
    `cozy-tts-browser-adapter.js` (`if (window.CozyOS.CozyTTSBrowserAdapter) return;`),
    matching the exact pattern used by all 11 siblings. Diff-confirmed
    this is the file's only change — no other line touched, no
    registration logic altered.
  - **Change 2:** activated all 5 remaining Phase 3 adapters
    (`cozy-tts-browser-adapter.js`, `speech-preview-adapter.js`,
    `speech-capability-adapter.js`, `voice-capability-stub.js`,
    `voice-security-bridge.js`) by adding 5 script tags to
    `dashboard.html`, in the specified order, after the Phase 2 tags.

## Gate 3 — Verification (all 12 adapters)

- **Repository Verified:** all 165 `<script src>` tags in
  `dashboard.html` resolve; zero duplicate `src` values anywhere in
  the file; diff against the M177 baseline confirms the only
  `dashboard.html` change is the 21-line script-tag insertion at one
  location.
- **Static Verified:** `node --check` passes with zero errors on
  `cozy-speech.js` and all 12 adapter files, including the modified
  `cozy-tts-browser-adapter.js`.
- **Runtime Verified** (Node `vm` harness running the real,
  unmodified — except for Change 1 — repository files, in
  `dashboard.html`'s actual order):
  - All 12 files load without exception.
  - Without `window.speechSynthesis` present (the "capability
    unavailable" case): `listAdapters()` returns exactly 10 real
    entries — the 7 from Phase 1/2 plus `SpeechPreviewAdapter`,
    `SpeechCapabilityAdapter`, `VoiceCapabilityStub`.
    `CozyTTSBrowserAdapter` correctly does **not** appear —
    `register()` honestly declines rather than fabricating a
    registration, exactly as designed. `VoiceSecurityBridge` correctly
    never appears — by design it never calls
    `CozySpeech.registerAdapter()` (read-only `PlatformEventBus`/
    `AuthFactorRegistry` bridge). `getHealth()` →
    `registeredAdapters: 10`; `getCapabilities().registeredLanguages`
    → 43, unchanged.
  - **With a stubbed `window.speechSynthesis` present** (simulating a
    real browser): `CozyTTSBrowserAdapter.isAvailable()` → `true`;
    `hasRealPreviewBackend()` → `true`; `listAdapters()` now includes
    `CozyTTSBrowserAdapter`; `previewVoice({text:"test"})` resolved
    `{ available: true, played: true }` — confirmed end-to-end.
  - **Duplicate-guard test (the actual fix under test):** loaded
    `cozy-tts-browser-adapter.js` a second time, both without and with
    `speechSynthesis` present. Adapter count was identical before and
    after in both cases (`held: true`) — confirming Change 1 closes
    the gap Gate 2 flagged. Prior to Change 1, this same test would
    have produced a second registry entry.
  - Browser TTS feature detection confirmed working in both the
    absent- and present-API cases (`isAvailable()` returns `false`/
    `true` correctly, no exception either way).
  - Core `CozySpeech` regression surface unchanged: `getVersion()` →
    `2.2.0-ENTERPRISE`, `listLanguages().length` → 43,
    `SpeechTranslationAdapter` still present and unaffected.
- **Browser Runtime Verified:** **NOT PERFORMED** — no browser
  available in this environment. Recorded honestly, not silently
  omitted.
- **Regression, confirmed by construction:** `cozy-speech.js`,
  `core/registry/cozy-registry.js` (`ServiceRegistry`), and
  `core/shell/platform-event-bus.js` (`PlatformEventBus`) are all
  byte-identical (`md5sum`) to the M177 baseline — no edits to
  `CozySpeech`, the adapter framework, `ServiceRegistry`, or
  `PlatformEventBus`, as required. All 11 previously-clean adapter
  files remain byte-identical; only `cozy-tts-browser-adapter.js`
  changed, by exactly the one guard line.

## Gate 4 — Known limitations

- **Wake Word** — does not exist anywhere in the repository. Genuine
  capability gap, not addressed by this milestone.
- **CozyAI integration** — placeholder enum strings only in
  `cozy-speech.js` (`KNOWN_INTEGRATIONS.COZY_AI`), no callable
  integration layer in either direction. Genuine capability gap, not
  addressed by this milestone.

No speculative limitations added beyond these two, per Gate 4 scope.

## Gate 5 — Continuation state

- **Canonical owner:** `window.CozyOS.CozySpeech`
  (`SPEECH_VERSION = "2.2.0-ENTERPRISE"`, unchanged).
- **Activated adapters:** all 12 —
  `VoiceCaptureAdapter`, `SpeechRecognitionAdapter`,
  `VoiceProcessorAdapter`, `SpeechLanguageAdapter`,
  `SpeechSessionAdapter`, `SpeechCommandAdapter`,
  `VoiceSettingsAdapter`, `CozyTTSBrowserAdapter`,
  `SpeechPreviewAdapter`, `SpeechCapabilityAdapter`,
  `VoiceCapabilityStub`, `VoiceSecurityBridge` — plus the
  already-wired `SpeechTranslationAdapter`/`SpeechTranslationProviders`
  (14 files total in the adapters directory, all now loaded).
- **Remaining capability gaps:** Wake Word; CozyAI connector.

## Certification

**Milestone 178 — CERTIFIED.** All Gate 3 checks passed, no
regressions, no ownership conflicts, no broken dashboard paths,
diagnostics verified, runtime verified. Browser Runtime Verified
explicitly recorded as Not Performed.

**Resume File:** `CozyOS-main-v1_3_1-M178.zip` (packaged from this
conversation's state) becomes the official continuation baseline.

**Resume Task:** Milestone 179 — Wake Word Engine (new capability, no
existing owner). Milestone 180 — CozyAI Voice Integration. Milestone
181 — Speech Adapter Framework Hardening (duplicate protection,
priorities, lifecycle hooks, validation, richer diagnostics) — per the
roadmap you specified.

**Reason for stopping here:** Milestone scope complete and certified;
clean handoff point.

