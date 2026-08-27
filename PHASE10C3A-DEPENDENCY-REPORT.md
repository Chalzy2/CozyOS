# Phase 10C-3A — Dependency Report

## New runtime dependency chain

`on-device-cognitive-adapter.js` requires, at real registration time:
- `window.CozyOS.CozyThinking` (must load first — from
  `core/modules/thinking/cozy-thinking.js`, unmodified).

`on-device-cognitive-adapter.js`'s `fn()` requires, at real *invocation*
time:
- `window.CozyOS.OnDeviceConversationalProvider` (must load first — from
  `core/modules/intelligence/providers/on-device-conversational-provider.js`,
  which now exports it as an additive change).

Recommended load order for any page that wants this real path available
(index.html / dashboard.html-style script sequencing):

```
core/modules/thinking/cozy-thinking.js
core/modules/reasoning/cozy-reasoning.js
core/modules/interpretation/cozy-interpretation.js
core/modules/cognitive/cognitive-coordinator.js
core/modules/intelligence/providers/on-device-conversational-provider.js
core/modules/intelligence/providers/on-device-cognitive-adapter.js
```

If `on-device-cognitive-adapter.js` loads before `cozy-thinking.js`, its
`registerWithThinking()` call honestly returns
`{ success: false, reason: "CozyThinking is not loaded." }` — it does
not retry or defer (unlike `ai-bootstrap.js`'s bounded retry loop),
because unlike ai-bootstrap's 3-engine bootstrap this is a single,
optional, explicit-selection-only registration with no external
consumer depending on it succeeding synchronously at page load. This
is a disclosed, deliberate simplicity choice, not an oversight — real,
separate follow-up work if a page ever needs guaranteed registration
regardless of script order.

If `on-device-conversational-provider.js` never loads at all,
`OnDeviceConversationalProvider` is simply absent, and every real
invocation attempt honestly fails with "not loaded" (proven by test 5
in `phase10c3a-real-provider-integration.test.js`) — never a fabricated
success.

## Genuine environmental dependency (disclosed, not blocking)

The underlying real capability — an actual on-device language model
reply — depends on the browser's Prompt API
(`self.LanguageModel` or `window.ai.languageModel`), which is currently
a Chrome/Chromium-only, origin-trial-or-stable feature requiring a
downloaded on-device model. This dependency is **inherited unchanged**
from `on-device-conversational-provider.js` (RP-025-A) — this phase adds
no new environmental dependency of its own. This Node.js execution
sandbox has no browser and cannot host that API; per this repository's
own established convention, tests stand in a structurally-real fake of
that one API surface rather than re-implementing or skipping the code
paths that consume it.

## No new dependency introduced on:

- CozyReasoning, CozyInterpretation (adapter registers only with
  CozyThinking)
- CozyMemory, PolicyDecisionEngine, CozyIntelligence
- ProviderManager (optional elsewhere in the repo; not touched by this
  adapter to keep the change minimal)
- Any governance, language-registry, or capability-diagnosis file
