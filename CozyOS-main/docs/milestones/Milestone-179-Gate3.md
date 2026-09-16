# Milestone 179 — Gate 3 — Verification

## Repository Verified

- `grep -o 'src="[^"]*"' dashboard.html | sort | uniq -c` — zero
  duplicate `src` values anywhere in the file after the insertion.
- Every `src="..."` path in `dashboard.html`, including the new one,
  resolves to a real file on disk.
- `diff -rq` against the M178 baseline: the only changes are
  `dashboard.html` (one 5-line insertion, diff-confirmed line-by-line
  above), the new `core/engines/wakeword/` directory, and the three new
  `docs/milestones/Milestone-179-*.md` files. Nothing else in the
  repository differs.
- `md5sum` confirms `core/modules/speech/cozy-speech.js`,
  `core/shell/platform-event-bus.js`, and `core/registry/cozy-registry.js`
  are byte-identical to the M178 baseline — no edits to any dependency,
  as required by Gate 1's Conflict Review.

## Static Verified

- `node --check core/engines/wakeword/wake-word-engine.js` — passes with
  zero errors.

## Runtime Verified

Node `vm` harness, two isolated sandboxes:

**Sandbox 1 — no `SpeechRecognition` in the environment (simulating a
browser without Web Speech API support):**
- `isSupported()` → `false`.
- `start()` → `{ success: false, reason: "SpeechRecognition not
  available in this environment." }` — fails honestly, no fabricated
  success.
- `CozySpeech.registerAdapter()` still called at load time with
  `{ name: "WakeWordEngine", type: "wakeword", offline: false, ... }` —
  registration itself does not depend on browser support, matching the
  pattern used by `VoiceCaptureAdapter`.
- `ServiceRegistry.registerCoordinator()` called with
  `name: "WakeWordEngine"`.

**Sandbox 2 — stubbed `SpeechRecognition` (simulating a supporting
browser):**
- `isSupported()` → `true`.
- `registerWakePhrase({ phrase: "hey cozy", onDetected })` returns a
  `phraseId`; `listWakePhrases()` reflects it.
- `start()` → `{ success: true }`; `getStatus().listening` → `true`.
- Fired a non-matching transcript ("good morning everyone") — no
  detection, `onDetected` not called.
- Fired a matching transcript ("hey cozy turn on the lights") — exactly
  one detection: `onDetected` callback invoked once, and
  `wakeword:detected` emitted on `PlatformEventBus` with the correct
  `phraseId`/`phrase`/`transcript`.
- `stop()` → `{ success: true }`; `getStatus().listening` → `false`
  afterward.
- **Duplicate-load guard test:** re-executed the module source against
  the same context a second time — `window.CozyOS.WakeWordEngine`
  remained the identical object reference (`if
  (window.CozyOS.WakeWordEngine) return;` at the top of the IIFE holds).
- `start()` with zero registered phrases (after `unregisterWakePhrase`)
  → `{ success: false, reason: "No wake phrases registered..." }` —
  fails honestly rather than starting an empty listener.

## Browser Runtime Verified

**NOT PERFORMED** — no browser available in this environment. Recorded
honestly, not silently omitted. In particular, real
`SpeechRecognition`/`webkitSpeechRecognition` browser behavior
(permission prompts, network dependency in Chrome's implementation,
`onend` firing after real silence timeouts, actual restart timing) is
unverified beyond the mocked harness above.

## Regression

- `core/modules/speech/cozy-speech.js`, `core/registry/cozy-registry.js`,
  `core/shell/platform-event-bus.js` — byte-identical to M178 baseline
  (see Repository Verified above). No regression surface introduced.
- All 12 existing speech adapters and the 2 previously-wired adapters —
  untouched (not in the diff).
