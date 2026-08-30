# Milestone 179 — Gate 1 — Repository Verification

**Scope:** Wake Word Engine — a genuine capability gap explicitly recorded
in `Milestone-178-Continuation.md` ("Wake Word — does not exist anywhere
in the repository") and named as the Milestone 179 resume task.

## Ownership Review

- `grep -ril "wake.?word|wakeword"` across the entire repository returns
  **zero** code matches. Only prose mentions exist, in
  `docs/governance/Migration-Log.md` and
  `docs/milestones/Milestone-178-Continuation.md`, describing the gap —
  no implementation.
- `window.CozyOS.WakeWordEngine` (and any `WakeWord*` name) is unclaimed.
- `CozySpeech.KNOWN_INTEGRATIONS` and `CozySpeech.listIntegrations()`
  (`core/modules/speech/cozy-speech.js`) do not list a wake-word kernel —
  confirming CozySpeech does not already own this responsibility, reserved
  or otherwise.
- `core/registry/cozy-registry.js` `FORBIDDEN_KEYS` is
  `{"__proto__", "constructor", "prototype"}` — no collision with
  `WakeWordEngine`.
- **Conclusion: no existing owner, no reserved name, no conflict.**

## Dependency Review

- `CozySpeech.registerAdapter()` / `registerSource()` (existing, at
  `core/modules/speech/cozy-speech.js`) — the pattern every existing
  speech adapter (`voice-capture-adapter.js`, etc.) uses to register
  itself with the coordinator without creating a parallel registry. The
  Wake Word Engine will follow the same pattern rather than modifying
  `cozy-speech.js` itself — `listIntegrations()` is explicitly documented
  as a **closed** registry ("cannot be added or removed at runtime by
  applications... added only through official CozyOS releases, not
  application code"), so it is not touched.
- `window.CozyOS.PlatformEventBus` (`core/shell/platform-event-bus.js`) —
  existing event emitter used by adapters for non-fatal, best-effort
  events (`emit(name, detail)`).
- `window.CozyOS.ServiceRegistry.registerCoordinator()`
  (`core/registry/cozy-registry.js`) — existing dashboard-visibility
  registry used by every adapter for discoverability.
- Browser API dependency: `window.SpeechRecognition` /
  `window.webkitSpeechRecognition` — real Web Speech API, continuous
  recognition mode, used to match spoken audio against registered wake
  phrases. No new third-party or vendor dependency introduced.
- **CozyAI integration:** confirmed genuine gap per Milestone 178 Gate 4
  (`KNOWN_INTEGRATIONS.COZY_AI` is a placeholder enum string only, no
  callable integration layer in either direction). The Wake Word Engine
  will expose a callback-based trigger contract that CozyAI (or any
  consumer) can subscribe to — it will not fabricate a live CozyAI
  connection that does not exist.

## Runtime Review

- No existing runtime object at `window.CozyOS.WakeWordEngine` to
  conflict with.
- `core/modules/speech/cozy-speech.js`, `core/shell/platform-event-bus.js`,
  and `core/registry/cozy-registry.js` load before the adapters section of
  `dashboard.html` (line 724 onward) — a new script tag added after the
  existing speech adapter block (after line 752) will have all three
  dependencies available at load time, matching every existing adapter.

## Conflict Review

- No ownership conflicts found.
- No forbidden-key collisions.
- No modification required to `cozy-speech.js`, `platform-event-bus.js`,
  or `cozy-registry.js` — all three are consumed read-only, through their
  existing public APIs, exactly as the existing adapters do.

## Outcome

**A — Repository verified, no blockers. Proceed to Gate 2.**
