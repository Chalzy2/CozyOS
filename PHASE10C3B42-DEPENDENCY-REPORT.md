# PHASE 10C-3B4-2 — Dependency Report

## Implemented dependencies
None. No new production code was written this phase (Outcome B — see
implementation report). The existing provider-selection plumbing
(`LivingAI.think()` → `CognitiveCoordinator.run()` → `CozyThinking.think()`)
was already complete and required no additions.

## Available but unused dependencies
- **Playwright + a real Chrome for Testing 131.0.6778.204 binary** are
  present in this environment and were used to genuinely launch a
  headless browser and probe for the Prompt API (see Stage 3 of the
  implementation report). They remain "available but unused" for the
  actual goal (real model execution) because the browser they drive
  does not expose the Prompt API.

## Missing dependencies
1. **A Chrome/Chromium build that exposes `window.ai` / `self.ai` /
   `LanguageModel`.** Confirmed absent on two independently-tested
   builds across two sessions (Chromium 141 in Phase 10C-3B2; Chrome
   for Testing 131.0.6778.204 in Phase 10C-3B4-1 and again in this
   phase), with the relevant `--enable-features` flags passed at
   launch both times.
2. **Outbound network access**, needed even if the API were exposed, to
   download the on-device Gemini Nano model component. Confirmed
   blocked (HTTP 403) in this sandbox, independent of the browser
   result.

## Environment-only limitations
Both missing dependencies above are properties of this sandboxed
execution environment, not of the CozyOS codebase. The codebase's own
architecture (provider registry, adapter, honest-failure handling) is
already correct and requires no further work to support a real model
once one of the above becomes available — see Case B in the
implementation report, which shows a correctly-shaped Prompt API
implementation would already flow all the way through Living Engine
today.

## Real-model requirements
To reach Outcome A in a future phase, the runtime environment would
need to supply: (a) a Chrome/Chromium build with the Prompt API enabled
and a downloaded Gemini Nano model, or (b) unblocked network egress to
let such a build download the model on demand. Neither is a code change
inside this repository.

## Test-double disclosure
Every "provider" exercised by
`core/living/tests/phase10c3b42-living-provider-integration.test.js`
is an explicitly-labeled fake `window.ai.languageModel` object matching
the real Prompt API's shape (`availability()` / `create()` /
`session.prompt()`). It is never described here, or in the test file
itself, as a dependency providing real intelligence — it proves wiring
only.
