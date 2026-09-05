# Milestone 179 — Gate 2 — Implementation

## Files Created

- `core/engines/wakeword/wake-word-engine.js` (v1.0.0-ENTERPRISE) —
  new canonical owner of `window.CozyOS.WakeWordEngine`. Wake-phrase
  registration (`registerWakePhrase`/`unregisterWakePhrase`/
  `listWakePhrases`) and continuous detection (`start`/`stop`/
  `getStatus`) using the browser's `SpeechRecognition` /
  `webkitSpeechRecognition` API. Registers itself with the existing
  `CozySpeech.registerAdapter()` and `ServiceRegistry.registerCoordinator()`
  registries; emits `wakeword:started`, `wakeword:detected`,
  `wakeword:stopped`, `wakeword:error` on the existing
  `PlatformEventBus`.

## Files Modified

- `dashboard.html` — one script tag inserted after the existing
  Milestone 178 speech-adapter block (after
  `voice-security-bridge.js`, before `cozy-translate.js`):
  `<script src="core/engines/wakeword/wake-word-engine.js"></script>`,
  with an explanatory comment. No other line changed (diff-confirmed:
  a single 5-line insertion at one location).

## Files Archived

None.

## Ownership Changes

- `window.CozyOS.WakeWordEngine` — newly claimed, no prior owner
  (confirmed under Gate 1).

## Public API Changes

New public surface (all on `window.CozyOS.WakeWordEngine`):

- `getVersion()`
- `isSupported()`
- `registerWakePhrase({ phrase, onDetected? }) → phraseId`
- `unregisterWakePhrase(phraseId) → boolean`
- `listWakePhrases() → ReadonlyArray`
- `start() → { success, reason? }`
- `stop() → { success, reason? }`
- `getStatus() → { supported, listening, registeredPhraseCount, lastError }`
- `getIntegrationManifest()`

No existing public API on `cozy-speech.js`, `platform-event-bus.js`, or
`cozy-registry.js` was changed — all three were consumed read-only,
through calls already exposed to every adapter (`registerAdapter`,
`emit`, `registerCoordinator`).

No future plans or roadmap items are included here, per Gate 2 scope.
