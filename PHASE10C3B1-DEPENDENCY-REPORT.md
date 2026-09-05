# Phase 10C-3B1 — Dependency Report

## Missing / unverifiable dependency

**Real browser on-device language-model API (Prompt API).**
Neither shape (`self.LanguageModel`, `window.ai.languageModel`) is present
in this sandbox's Node.js runtime (confirmed directly — no `window`, no
`self`, no `LanguageModel` global). This is the sole missing dependency
blocking full end-to-end activation verification of the on-device
conversational path.

- Not installable this pass: no network access in this sandbox, so a real
  browser binary cannot be downloaded, and even a locally-present browser
  would still need the on-device model itself downloaded (multi-GB,
  requires network + user-initiated download flow in a real Chrome
  profile).
- A headless-browser fallback (Playwright) is present as an npm package
  but has no installed Chromium binary in this environment, so it could
  not be used either — checked and disclosed, not silently skipped.

## Dependencies that ARE satisfied and were verified real

- `window.CozyOS.LivingAI.registerProvider()` — existing extension point,
  confirmed present and composed correctly (not modified).
- `window.CozyOS.ProviderManager.register()` — existing, optional,
  confirmed composed correctly when present, skipped gracefully when
  absent (e.g. `index.html` today).
- `CozyThinking.registerProvider()` / `.findProvider()` — existing
  async-capable provider registry (made async-safe in Phase 10C-2B),
  confirmed the adapter uses it correctly without introducing a second
  registry.
- `CognitiveCoordinator.run({ thinkingProviderId })` — existing,
  additive, default-preserving parameter confirmed to pass through to
  `CozyThinking.think()` unchanged.

## Pre-existing defect disclosed (not a missing dependency, but relevant to runtime trust)

`CozyReasoning.validateConclusion()` calls an async `provider.fn(...)`
without `await`. Not exercised by the on-device provider (which only
registers with `CozyThinking`, not `CozyReasoning` — a disclosed,
deliberate boundary from Phase 10C-3A) and not exercised by
`CognitiveCoordinator.run()`'s real pipeline. No production call site
exists anywhere in the repository. Recorded here rather than silently
noted only in the implementation report, since it is a genuine dependency
on correct async handling that would silently misbehave (return `null`
instead of a real answer) if a future phase started calling
`validateConclusion()` with an async provider. Not fixed this pass —
out of scope for audit-only 10C-3B1.

## No other missing dependencies found

Every other real code path audited in Step 2 of the implementation report
composes existing, already-loaded, already-verified engines. No new
external service, package, or credential is required by any of the nine
audited files.
