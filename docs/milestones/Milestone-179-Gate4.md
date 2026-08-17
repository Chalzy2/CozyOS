# Milestone 179 — Gate 4 — Known Limitations

Only verified limitations. No speculation.

- **No bundled offline wake-word model.** Detection relies entirely on
  the browser's built-in `SpeechRecognition` API. There is no on-device
  ML wake-word model (e.g. a Porcupine/DeepSpeech-style keyword spotter)
  anywhere in this repository. In Chrome, `SpeechRecognition` sends
  audio to a cloud recognition service — this is not a true offline
  capability, which conflicts with CozyOS's stated offline-first mission
  (`docs/` project history) for this specific feature. Flagged honestly,
  not silently.
- **Browser support is inconsistent.** `SpeechRecognition` /
  `webkitSpeechRecognition` is unavailable or behaves differently across
  browsers (notably absent in some Firefox builds). `isSupported()`
  reports this correctly and `start()` fails closed with a reason string
  rather than throwing, but there is no fallback engine for unsupported
  browsers in this milestone.
- **Browser Runtime Verified: NOT PERFORMED.** No browser is available
  in this environment (see Gate 3). Real permission-prompt behavior,
  continuous-session timeout/restart timing, and actual detection
  accuracy against live audio are unverified beyond the mocked Node
  harness.
- **CozyAI integration is a contract, not a connection.** The engine
  exposes `wakeword:detected` (PlatformEventBus) and per-phrase
  `onDetected` callbacks that CozyAI could subscribe to, but no such
  subscription exists yet anywhere in the repository — this matches the
  genuine CozyAI integration gap already recorded in Milestone 178 Gate
  4 and is not resolved by this milestone.
- **No wake-phrase language/locale handling.** `registerWakePhrase()`
  does not set `recognition.lang`; it uses the browser's default
  recognition locale. Multilingual wake-phrase matching (relevant given
  CozySpeech's 43 registered languages) is not addressed here.
