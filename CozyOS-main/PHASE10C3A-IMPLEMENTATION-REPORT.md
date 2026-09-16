# Phase 10C-3A — Real Provider Adapter & Registration
## Implementation Report

## Start-gate verification (performed before any modification)

- Checkpoint archive: `COS-REPO-MERGED-PHASE10C2B.zip`
- Independently computed SHA-256: `5df2a4da54599a7db90eb3b682b704d9cb00f34caa3e1849a29d7664cfdc0ea3`
- `unzip -t`: no errors detected.
- Clean extraction: performed to a fresh directory.
- `phase10b-shared-cognitive-integration.test.js`: **16/16 passing**.
- `phase10c2b-async-provider-boundary.test.js`: **22/22 passing**.
- The four Phase 10C2B async-boundary files were byte-verified against
  `PHASE10C2B-MERGE-SHA256-MANIFEST.txt` (all five entries, including the
  test file, matched exactly):
  - `core/modules/cognitive/cognitive-coordinator.js`
  - `core/modules/thinking/cozy-thinking.js`
  - `core/modules/reasoning/cozy-reasoning.js`
  - `core/modules/interpretation/cozy-interpretation.js`
  - `core/modules/cognitive/tests/phase10c2b-async-provider-boundary.test.js`

## Audit of the real provider seam

- **`core/modules/intelligence/providers/on-device-conversational-provider.js`**
  (RP-025-A) — a real, live-feature-detected provider composing the
  browser's own Prompt API (`self.LanguageModel` / `window.ai.languageModel`)
  when present. Registers into `window.CozyOS.LivingAI`'s existing
  `"on-device"` provider slot. Never bundles a model, never fabricates
  availability, never calls `setActiveProvider()`.
- **`core/living/cozy-living-ai.js`** (`window.CozyOS.LivingAI`) — a
  *separate, parallel* provider registry (`think(text, options)` contract)
  from CozyThinking/CozyReasoning/CozyInterpretation's registries. Its
  default active provider, `"reasoning-pipeline"`, composes
  `CognitiveCoordinator.run()`. The `"on-device"` provider, even once
  filled with a real implementation, is invoked **only** if explicitly
  made active — and even then, it never touches CognitiveCoordinator at
  all; it answers directly.
- **`CognitiveCoordinator`** — composes `CozyInterpretation.interpret()`
  → `CozyThinking.think()` → `CozyReasoning.reason()` → ... Each stage
  has its **own**, separate provider registry (`registerProvider(descriptor, fn)`)
  with a structured, evidence-in/structured-out contract — not the
  simple `think(text) -> {success, result}` shape LivingAI's registry uses.
- **`ai-bootstrap.js`** registers the only providers CozyThinking/
  CozyReasoning/CozyInterpretation have ever had: `"living-planner-baseline"`,
  `"living-reasoning-baseline"`, `"living-nlu-baseline"` — simple, real,
  synchronous, rule/keyword-based logic. **No file in the repository ever
  registered an asynchronous, genuinely-model-backed provider with any of
  the three cognitive engines.** This is the confirmed gap.

## Finding

The real, existing asynchronous provider
(`on-device-conversational-provider.js`) and the now-async cognitive
provider contracts (Phase 10C2B) were never connected. They are two
real, independently-working seams with no adapter between them:

1. LivingAI's registry (text → text, "on-device" slot: real, unused by
   default).
2. CozyThinking's registry (evidence → structured, async-capable since
   10C2B: real, but only ever held synchronous rule-based providers).

## Smallest real change implemented

**Two modified files, two new files. No existing default behavior changed.**

1. `on-device-conversational-provider.js` (modified, additive only) —
   exports the exact same real provider object it already builds as
   `window.CozyOS.OnDeviceConversationalProvider`, so it can be composed
   elsewhere without being re-implemented or forked. No detection logic,
   no session logic, no think() logic was touched or duplicated.

2. `on-device-cognitive-adapter.js` (new) — registers that same real
   object into CozyThinking's existing provider registry under id
   `"on-device-conversational"`. Its `fn()`:
   - builds a real prompt only from the real `evidence` array it was
     called with;
   - calls the real `onDevice.think(text, {})`;
   - on genuine success, maps the model's real free-form text into
     `explanation` and `reasoningSteps` **only** — `confidence`,
     `alternatives`, `risks`, `opportunities` are left honestly
     `null`/`[]`, never fabricated, because the on-device model does not
     produce them;
   - on any real failure (no browser API, model not installed, empty
     reply, thrown error), throws — CozyThinking's own pre-existing
     try/catch (unmodified) is the single place failure is reported,
     exactly as it already does for every other provider.
   - **never calls `setDefaultProvider()`** — this provider is
     explicit-selection-only. `ai-bootstrap.js`'s `"living-planner-baseline"`
     remains the default in every scenario, proven in test 9.

3. `cognitive-coordinator.js` (modified, additive only) — `run()` gained
   one new, optional parameter, `thinkingProviderId` (default `null`),
   passed straight through to `CozyThinking.think()`'s own existing
   `providerId` parameter. Passing nothing reproduces the exact prior
   call (`providerId: null` triggers the exact same default-provider
   fallback CozyThinking already had). This is the only way to let a
   genuine result from an explicitly-selected provider reach
   CognitiveCoordinator's returned `result.thinking` /
   `diagnostics.stages.thinking` without duplicating orchestration logic
   or reaching into CozyThinking's internals from outside.

## Deliberately out of scope (disclosed, not silently skipped)

- **CozyReasoning / CozyInterpretation** were not given an on-device
  adapter this phase. A single free-form conversational reply has no
  honest mapping into CozyReasoning's contradiction/assumption contract
  or CozyInterpretation's evidence-classification contract without
  inventing structure the model did not produce. Real, separate,
  disclosed follow-up work if ever required.
- **LivingAI's `"on-device"` slot activation** (`setActiveProvider('on-device')`)
  remains untouched — still nobody's decision to make automatically, per
  RP-025-A's own documented design.
- Rule 82, RP-030-CONTENT, vocabulary state, promotion logic, and all
  governance files were not modified. Verified below.

## Proof (executable tests — `phase10c3a-real-provider-integration.test.js`, 11/11 passing)

| # | Proves |
|---|---|
| 1–2 | The real provider is registered; registration never overrides the existing default provider |
| 3–4 | The real provider is selected (`providerId`); the real async call executes; its actual, distinguishable result reaches `CognitiveCoordinator.run()`'s returned result and diagnostics |
| 5–7 | Provider failure is reported honestly in three real failure modes (adapter dependency missing, browser API absent, model throws mid-call) — no false-green in any case |
| 8 | No Promise/object confusion — resolved real strings only, `confidence` honestly `null`, never fabricated |
| 9 | Regression: default-provider selection is completely unchanged with the adapter loaded |
| 10 | CozyAI and CozyBuilder still converge on the exact same `CognitiveCoordinator` singleton |
| 11 | The Kiswahili `language:sw:vocabulary` blocker remains honestly reported, governance path untouched |

Environmental note (not OUTCOME B): this Node.js sandbox has no browser
and cannot host the genuine Chrome-only Prompt API. Following this
repository's own established, pre-existing testing convention (see
`on-device-conversational-provider.test.js`, unmodified by this phase),
the browser API surface (`window.ai.languageModel`) is stood in with a
fake object exposing the real `availability()/create()/session.prompt()`
shape. Every production file exercised is the real, unmodified-except-
as-declared file — only the one browser-only API surface is a stand-in,
which is why this proceeded as OUTCOME A (implemented) rather than
OUTCOME B (blocked). In an actual Chrome browser with the Prompt API
enabled, the identical code path calls the genuine model with no
adapter-level change required.

## Regression suites run after implementation

- `phase10b-shared-cognitive-integration.test.js` — 16/16 (unchanged)
- `phase10c2b-async-provider-boundary.test.js` — 22/22 (unchanged)
- `on-device-conversational-provider.test.js` — 8/8 (unchanged)
- `cozy-living-assistant-reply.test.js` — 10/10 (unchanged)
- `capability-repair-planner.test.js` — 20/20 (unchanged)
- `capability-governance-diagnosis.test.js` — 37/37 (unchanged)
- `capability-governance-diagnosis-phase10a.test.js` — 24/24 (unchanged)
- `capability-self-diagnosis.test.js` — 20/20 (unchanged)
- `capability-knowledge-acquisition.test.js` — 30/30 (unchanged)
- `capability-dependency-graph.test.js` — 19/19 (unchanged)
- `phase10c3a-real-provider-integration.test.js` (new) — 11/11

All suites referencing any touched file (`cognitive-coordinator.js`,
`cozy-thinking.js`, `on-device-conversational-provider.js`,
`cozy-ai.js`, `builder-orchestrator.js`) were identified by keyword
search across the repository's `*.test.js` files and run; all pass
identically to their pre-change baseline.
