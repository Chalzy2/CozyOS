# Phase 10C-3B1 — Runtime Audit

Detailed backing for the findings summarized in
`PHASE10C3B1-IMPLEMENTATION-REPORT.md`. Every claim below was checked
against the actual file content of the fresh extraction, not assumed.

## 1. Where the on-device provider is registered

`core/modules/intelligence/providers/on-device-conversational-provider.js`,
IIFE bottom section:
- `registerWithLivingAI()` -> `window.CozyOS.LivingAI.registerProvider("on-device", onDeviceProvider)`
- `registerWithProviderManager()` -> `window.CozyOS.ProviderManager.register({...})` (optional, skips silently if absent)
- Exports `window.CozyOS.OnDeviceConversationalProvider = onDeviceProvider`

`core/modules/intelligence/providers/on-device-cognitive-adapter.js`:
- `registerWithThinking()` -> `window.CozyOS.CozyThinking.registerProvider({id: "on-device-conversational", ...}, fn)`

## 2. Active or inactive

**Inactive by default.** Verified two ways:
- Static: neither file calls `setActiveProvider()` (LivingAI) or
  `setDefaultProvider()` (CozyThinking). `CozyThinking.registerProvider()`
  only auto-sets `#defaultProviderId` when none exists yet — and
  `ai-bootstrap.js`'s `"living-planner-baseline"` is already registered
  first in the real load order, so the on-device provider never becomes
  default even via that fallback.
- Dynamic (via the required gate suite): Phase 10C-3A test 9 —
  *"With no providerId specified, CognitiveCoordinator.run() still uses
  the pre-existing default provider (living-planner-baseline) even with
  the adapter loaded"* — passed, independently re-executed, 11/11 in that
  suite.

## 3. Which registry owns it

Two real, separate registries hold it, for two disclosed reasons:
- `LivingAI`'s provider map (`"on-device"` slot) — feeds `LivingAI.think()`,
  the conversational-chat surface.
- `CozyThinking`'s `#providers` Map (`"on-device-conversational"` id) —
  feeds the structured cognitive pipeline via `CognitiveCoordinator.run()`.

Both wrap the *same* underlying object/closure
(`window.CozyOS.OnDeviceConversationalProvider`, including its
`cachedSession` state) — confirmed by reading the adapter's `fn()`, which
calls `onDevice.think(text, {})` on that exact export rather than
re-implementing detection/session logic.

## 4. How the adapter connects it to CognitiveCoordinator

`CognitiveCoordinator.run({ thinkingProviderId })` (additive parameter,
default `null`) passes `thinkingProviderId` straight through as
`providerId` in its call to `CozyThinking.think({ evidence,
interpretationsUsed, providerId: thinkingProviderId })`. `CozyThinking`
then looks up that `providerId` in its own registry
(`this.#providers.get(providerId)`), finds the adapter's registration, and
awaits its `fn()`. No new orchestration logic was added to
`CognitiveCoordinator` for this — it composes the pre-existing,
already-async-safe `CozyThinking.think()` unchanged.

## 5. Real Promise / async boundaries

| Function | async? | Awaited by caller? |
|---|---|---|
| `on-device-conversational-provider.js :: think()` | Yes | Yes — by `getStatus()` internally and by the adapter |
| `on-device-cognitive-adapter.js :: fn()` | Yes | Yes — by `CozyThinking.think()`'s `await provider.fn(...)` |
| `cozy-thinking.js :: think()` | Yes | Yes — by `CognitiveCoordinator.run()` |
| `cozy-reasoning.js :: reason()` | Yes | Yes — by `CognitiveCoordinator.run()` |
| `cozy-interpretation.js :: interpret()` | Yes | Yes — by `CognitiveCoordinator.run()` |
| `cozy-reasoning.js :: validateConclusion()` | **No** (sync method) | Calls `provider.fn(...)` **without `await`** — real gap, disclosed above; not on the audited activation path |

## 6. Honest failures

Confirmed by reading every `catch` block and every early-return `reason`
string in the nine files: no fabricated success anywhere. Representative
examples: `on-device-conversational-provider.js`'s `think()` returns
`{success:false, reason: status.reason, state: status.state}` when not
`READY`; `on-device-cognitive-adapter.js`'s `fn()` throws real `Error`
objects with the genuine failure reason, which `CozyThinking.think()`'s
existing `try/catch` converts into `{success:false, isReal:false, reason:
"Provider threw: <real message>"}`.

## 7. Confidence — provider-derived, never fabricated

`on-device-cognitive-adapter.js` explicitly sets `confidence: null` (the
model only returns free text). `CozyThinking.think()` only accepts a
provider's confidence when `typeof raw.confidence === "number"`,
otherwise stores `null`. No numeric confidence is invented anywhere on
this path.

## 8. CozyAI / CozyBuilder convergence

`cozy-ai.js :: ask()` → `window.CozyOS.CognitiveCoordinator.run(...)`.
`builder-orchestrator.js`'s Analysis phase → same
`window.CozyOS.CognitiveCoordinator.run(...)`. `grep` for the
instantiation pattern (`CognitiveCoordinator = new` / `class ...
CognitiveCoordinator`) across the whole repository returns exactly one
real instantiation (`cognitive-coordinator.js`); the only other match is a
reference to that same global in `cozy-living-assistant.js`.

## 9. Duplicate intelligence path check

`grep` for `OnDeviceConversationalProvider\s*=` (the export assignment)
across the repository returns exactly one file:
`on-device-conversational-provider.js` itself. No second implementation,
no forked detection/session logic found anywhere.

## Step 3 detail — browser reality check

```
$ node -e "console.log(typeof self, typeof window)"
undefined undefined
```

No `LanguageModel`/`window.ai` shape is reachable in this Node sandbox.
The repository's own test-double convention (fake `global.window` with a
`registerProvider`/`register` shape matching the real `LivingAI`/
`ProviderManager` public API — see
`on-device-conversational-provider.test.js`) was reused, not
reinvented, to exercise the real code's branches statically. This is
explicitly **not** equivalent to real browser execution and is not
represented as such anywhere in this audit. A real headless-browser check
was considered (Playwright package is present) but no Chromium binary is
installed in this sandbox and network access is disabled, so it could not
be performed.
