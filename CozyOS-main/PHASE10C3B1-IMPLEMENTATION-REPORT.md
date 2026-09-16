# Phase 10C-3B1 — Implementation Report

**Scope:** Real Provider Runtime Audit & Controlled Activation Decision.
Audit + controlled-activation only, as scoped. No end-to-end provider
integration attempted (that is 10C-3B2).

## Baseline

`COS-REPO-MERGED-PHASE10C3A.zip`
SHA-256: `cfd1cba2b65197a44981c916f5828f0efb3a2069cb098c8273a36f52f84f2c67`
— independently verified (see Step 1 below), confirmed to match.

## Step 1 — Start gate (all independently re-executed, fresh extraction)

| Gate | Result |
|---|---|
| SHA-256 of baseline ZIP | **MATCH** |
| `unzip -t` | **No errors detected** |
| Fresh extraction | **OK** — extracted to a clean directory, not the working tree |
| Phase 10B (`phase10b-shared-cognitive-integration.test.js`) | **16/16 PASS** |
| Phase 10C-2B (`phase10c2b-async-provider-boundary.test.js`) | **22/22 PASS** |
| Phase 10C-3A (`phase10c3a-real-provider-integration.test.js`) | **11/11 PASS** |
| On-device provider suite (`on-device-conversational-provider.test.js`) | **8/8 PASS** |

All four required gates pass with the exact expected counts. No gate failed;
Step 1 raised no stop condition.

## Step 2 — Real runtime path audit

Read in full: `cognitive-coordinator.js`, `cozy-thinking.js`,
`cozy-reasoning.js`, `cozy-interpretation.js`,
`on-device-conversational-provider.js`, `on-device-cognitive-adapter.js`,
`cozy-ai.js`, `cozy-intelligence.js`, `builder-orchestrator.js`.

Findings (from actual code, not documentation claims):

- **Registration point:** `on-device-conversational-provider.js` registers
  the real provider object into `window.CozyOS.LivingAI` (via
  `registerProvider("on-device", ...)`) and, when present,
  `window.CozyOS.ProviderManager` (health/visibility only). It also exports
  the same live object as `window.CozyOS.OnDeviceConversationalProvider`.
- **Adapter -> CognitiveCoordinator path:** `on-device-cognitive-adapter.js`
  composes that same exported object (no re-implementation) and registers
  it into `CozyThinking`'s provider registry under id
  `"on-device-conversational"`, via `CozyThinking.registerProvider()`.
- **Active or inactive:** **Inactive by design.** Registration never calls
  `setDefaultProvider()`/`setActiveProvider()`. A caller must explicitly
  pass `providerId: "on-device-conversational"` to `CozyThinking.think()`,
  or `thinkingProviderId: "on-device-conversational"` to
  `CognitiveCoordinator.run()`. Confirmed by code (adapter never calls
  either activation method) and by gate test 9 of the 10C-3A suite, which
  proves `CognitiveCoordinator.run()` with no `thinkingProviderId` still
  uses the pre-existing default.
- **Owning registry:** `CozyThinking`'s own `#providers` Map is the sole
  registry the adapter touches. `LivingAI`'s registry (a separate, parallel
  system) is untouched by the adapter and was already populated directly by
  the provider file itself — two real registries exist for two real,
  disclosed reasons (LivingAI's `think(text)` chat path, and
  CognitiveCoordinator's structured pipeline path), not a duplicate
  implementation of the same thing.
- **Real Promise:** `on-device-conversational-provider.js`'s `think()` is
  `async`; `on-device-cognitive-adapter.js`'s `fn()` is `async`;
  `CozyThinking.think()` is `async` and does `await provider.fn(...)`.
  Confirmed by direct reading, not inferred from naming.
- **Async boundaries — one real gap found, outside the activation path:**
  `CozyReasoning.validateConclusion()` (line 222 of `cozy-reasoning.js`) is
  a **synchronous** method that calls `provider.fn(...)` **without
  `await`**. If a real async provider is registered, `raw` is an unresolved
  Promise; `raw.valid`/`raw.confidence` are then `undefined`, silently
  degrading to `valid: null, confidence: null` inside a `success: true,
  isReal: true` result rather than throwing or reporting the mismatch. This
  is a pre-existing defect (present before this phase started; confirmed
  it is not called anywhere in production code — `grep` found zero
  production call sites), not caused or touched by the on-device provider
  work, and not exercised by any of the four required gates or by
  `CognitiveCoordinator.run()`'s real pipeline (which calls `reason()`,
  not `validateConclusion()`). Disclosed here as a genuine finding;
  intentionally not fixed this pass per the "no large production changes
  in 10C-3B1" instruction — flagged as a candidate for a future, separate,
  scoped repair.
  `cozy-thinking.think()` and `cozy-interpretation.interpret()` were also
  checked line-by-line; both correctly `await` their single provider call
  site with no other unawaited async calls found.
- **Honest failures:** Every failure path returns `{success:false, isReal:
  false, reason: <real message>}` (or throws, which `CozyThinking`'s
  existing `try/catch` converts to the same honest shape). No fabricated
  success anywhere in the audited files.
- **Confidence:** Never fabricated. The adapter explicitly sets
  `confidence: null` (the model returns only free text, no numeric
  confidence) rather than inventing a number. `CozyThinking.think()` only
  accepts `raw.confidence` when `typeof raw.confidence === "number"`,
  otherwise `null`.
- **CozyAI / CozyBuilder convergence:** Both `cozy-ai.js`'s `ask()` and
  `builder-orchestrator.js`'s analysis phase call
  `window.CozyOS.CognitiveCoordinator.run(...)` — the same singleton
  instance (`grep` for `CognitiveCoordinator = new` / `class ...
  CognitiveCoordinator` across the repo returns exactly one
  instantiation site, in `cognitive-coordinator.js` itself; the only other
  match, in `cozy-living-assistant.js`, is a reference to the same
  `window.CozyOS.CognitiveCoordinator` global, not a second instance).
- **Duplicate intelligence path:** None found. One `CognitiveCoordinator`
  instance, one `OnDeviceConversationalProvider` export site, one
  `on-device-conversational` registration in `CozyThinking`.

## Step 3 — Browser/runtime reality check

- This sandbox's `node` (v22.22.2) has no `window`/`self` global and no
  `LanguageModel` global — confirmed directly (`typeof window ===
  "undefined"`, `typeof self === "undefined"`). The real browser Prompt
  API cannot be exercised here; this is a genuine environment limitation,
  not a code defect.
- Static/Node verification performed instead, using the repository's own,
  pre-existing test-double convention (a fake `global.window` stub whose
  shape mirrors the real `LivingAI`/`ProviderManager` public API, exactly
  as `on-device-conversational-provider.test.js` already does) — this is
  how the required gate 8/8 suite above was executed, and it is the
  convention this audit reused rather than inventing a new one.
- A real headless-browser path (Playwright, package present) was checked:
  no Chromium binary is installed in this sandbox and network access is
  disabled, so a real `LanguageModel`/`window.ai` check against an actual
  browser engine — even a stubbed/flagged one — could not be performed
  here regardless. This is disclosed as a hard environment limitation, not
  glossed over.
- **Distinction maintained throughout:** everything above the line is
  static/Node-level verification of the real code paths and their honest
  failure handling. Nothing here constitutes proof that a real, live
  browser with the Prompt API enabled and a model installed would return
  `READY` — that was not fabricated or assumed.

## Step 4 — Controlled activation decision

**OUTCOME B — Runtime dependency still blocks activation.**

The code itself is real, correctly wired, explicit-opt-in-only, and fails
closed honestly in every checked path. Nothing found in Step 2 blocks
merging or leaving this code in the repository as-is. But "activation" in
the sense of a verified, working on-device model call cannot be confirmed
in any environment reachable this pass: Node.js has no browser Prompt API,
and no real (even headless) browser with the API enabled and a model
installed was reachable (no network, no installed browser binary). Full
end-to-end activation verification remains blocked on a real browser
environment — disclosed dependency, not a code-level defect.

## Files modified

**None.** All nine audited production files hash-match their Phase 10C-3A
checkpoint values exactly (see `PHASE10C3B1-PROTECTED-FILE-HASHES.txt`),
confirming zero production drift. No production modification was required
this phase — the on-device provider path was already correctly built,
registered, and left inactive by design in the 10C-3A baseline; this
phase's job was to independently verify that claim against the real code,
which it did.

## Tests actually executed (all via `node <file>.test.js`, real process, no mocked results)

- `core/modules/cognitive/tests/phase10b-shared-cognitive-integration.test.js` — 16/16
- `core/modules/cognitive/tests/phase10c2b-async-provider-boundary.test.js` — 22/22
- `core/modules/cognitive/tests/phase10c3a-real-provider-integration.test.js` — 11/11
- `core/modules/intelligence/providers/tests/on-device-conversational-provider.test.js` — 8/8

## NEXT BUILD MUST START WITH: PHASE 10C-3B2
