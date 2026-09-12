# PHASE 10C-3B4-2 — Living Engine Provider Integration
## Implementation Report

### PHASE
10C-3B4-2 — Living Engine Provider Integration.

### BASELINE
`COS-REPO-MERGED-PHASE10C3B4-1.zip`, SHA-256
`fa890d937e905fbdef92c6e4d6526488ff4b1035a6380673d6ca6c55c9d1a550`
— independently recomputed and confirmed to match before any work began.

### START-GATE
- SHA-256 match: confirmed.
- `unzip -t`: no errors.
- Fresh extraction: performed into a new working directory, separate
  from the archive and from a second, untouched "pristine" copy kept
  for later diffing.
- Baseline suites run for real, before any modification:

  | Suite | Result |
  |---|---|
  | Phase 10B | 16/16 |
  | Phase 10C-2B | 22/22 |
  | Phase 10C-3A | 11/11 |
  | Phase 10C-3B2 | 5/5 |
  | on-device provider | 8/8 |
  | Phase 10C-3B3 | 12/12 |
  | Phase 10C-3B4-1 | 7/7 |

  All matched expected counts. **START GATE PASSED.**

### OBJECTIVE
Determine whether Living Engine can intentionally select the same real
provider used by the shared cognitive path (default preserved, explicit
selection working, invalid selection and provider failure both honest)
— and only then decide whether any production code change is actually
required.

### ARCHITECTURE AUDIT
- Repo-wide search confirmed exactly **one** `new CozyCognitiveCoordinator`
  construction site in the entire repository
  (`core/modules/cognitive/cognitive-coordinator.js:389`).
- `core/living/cozy-living-ai.js`'s only implemented provider
  (`reasoning-pipeline`) reads `window.CozyOS.CognitiveCoordinator` by
  direct property access and calls `.run({ text, ...options })` —
  meaning any field the caller puts in `options`, including
  `thinkingProviderId`, already reaches the coordinator unchanged.
- `CognitiveCoordinator.run({ ..., thinkingProviderId })` passes that
  value straight into `CozyThinking.think({ ..., providerId: thinkingProviderId })`
  (`cognitive-coordinator.js:129`) — the full name-mapping chain from
  Living Engine's public option to CozyThinking's internal parameter
  already exists.
- `CozyThinking.think()`'s provider-resolution line
  (`cozy-thinking.js:158`) is:
  `providerId ? this.#providers.get(providerId) : (default lookup)`.
  This means an explicit-but-invalid `providerId` is looked up directly
  and, if absent, produces `undefined` — the default is **never**
  consulted as a fallback when an explicit id was supplied. This is
  already the correct, honest behavior Case C requires.

### PROVIDER PATH
`LivingAI.think(text, options)` → `CognitiveCoordinator.run({text, ...options})`
→ `CozyThinking.think({..., providerId: thinkingProviderId})` →
(if `on-device-conversational`) → `on-device-cognitive-adapter.js` →
`on-device-conversational-provider.js` → browser Prompt API. Every link
in this chain was traced and confirmed with a **live, running probe
script** against the unmodified production code (not static reading
alone):

- **Case A (default):** `LivingAI.think('default case')` →
  `result.result.thinking.provider === 'living-planner-baseline'`. ✅
- **Case B (explicit on-device):** `LivingAI.think(text, {thinkingProviderId: 'on-device-conversational'})`
  with a test-double model present → output traceable to
  `TESTDOUBLE:P42-CASEB:...`, `provider === 'on-device-conversational'`. ✅
- **Case C (invalid provider id):** `LivingAI.think(text, {thinkingProviderId: 'totally-invalid-provider-xyz'})`
  → `{success:false, isReal:false, reason:"No thinking provider registered."}`,
  and critically `provider !== 'living-planner-baseline'` — confirming
  no silent fallback occurred. ✅
- **Case D (provider exception):** a test-double model whose `create()`
  throws → `{success:false, isReal:false, reason:"Provider threw: simulated model crash"}`. ✅

All four cases already worked correctly against the **unmodified**
Phase 10C-3B4-1 code. No gap was found.

### LIVING ENGINE PATH
`window.CozyOS.LivingAI` (`core/living/cozy-living-ai.js`) — confirmed
unchanged from Phase 10C-3B4-1's audit, and confirmed still the sole
Living Engine implementation in this repository.

### REAL BROWSER RESULT
A real headless Chrome for Testing 131.0.6778.204 binary was launched
again via Playwright in this session (same binary as Phase 10C-3B4-1,
re-verified rather than assumed) with on-device-model feature flags
enabled. `window.ai`, `self.ai`, `window.LanguageModel`, and
`self.LanguageModel` were all genuinely `undefined`. A plain HTTPS
request returned HTTP 403 (network egress blocked). Both results match
Phase 10C-3B4-1 exactly.

### REAL MODEL RESULT
**NOT AVAILABLE.** No real model could be reached because no Chrome
build in this environment exposes the Prompt API, and network to
download one is blocked. This is an environmental limitation of the
sandbox, documented in `PHASE10C3B42-DEPENDENCY-REPORT.md`, not a
defect in the CozyOS codebase.

### TEST-DOUBLE RESULT
`core/living/tests/phase10c3b42-living-provider-integration.test.js`
(12 tests, explicitly labeled STRUCTURAL / TEST-DOUBLE ONLY where a
fake model is involved) — 12 passed, 0 failed. Proves wiring only; not
presented as real model output anywhere in the test file or this
report.

### KISWAHILI RESULT
A Kiswahili prompt routed through `LivingAI.think()` with the
test-double on-device provider produced an honest result, and the
serialized output contains no `"promoted":true` marker — no vocabulary
was fabricated or promoted. (Test 13 in the new suite.)

### IMPLEMENTED
Nothing in production code. One new permanent test file and this
phase's required documentation only.

### PRODUCTION FILES CHANGED
**NONE.** All ten protected files hashed identical before and after
(see `PHASE10C3B42-PROTECTED-FILE-HASHES.txt`). A `diff -rq` between
the Phase 10C-3B4-1 checkpoint and this phase's working copy showed
only two additions: the new test file and this phase's protected-hash
report at the time of that check — the remaining documentation files
were added afterward and are likewise pure additions, never edits to
existing files.

### TEST RESULTS
- New suite: `core/living/tests/phase10c3b42-living-provider-integration.test.js` — **12 passed, 0 failed.**
- Pre-existing `core/living/tests/` suites, re-run for completeness:
  `cozy-living-assistant-reply.test.js` — 10 passed, 0 failed;
  `cozy-living-compressor.test.js` — 49 passed, 0 failed;
  `living-tts.test.js` — 17 passed, 0 failed (Node's built-in test
  runner format).

### REGRESSION
All previously-required suites re-run after adding the new test file:

Phase 10B 16/16, Phase 10C-2B 22/22, Phase 10C-3A 11/11,
Phase 10C-3B2 5/5, on-device provider 8/8, Phase 10C-3B3 12/12,
Phase 10C-3B4-1 7/7, Phase 10C-3B4-2 12/12. Zero failures.

### PROTECTED FILES
See `PHASE10C3B42-PROTECTED-FILE-HASHES.txt` — ten files, all
byte-identical before/after.

### DUPLICATE-ENGINE CHECK
Repo-wide search for `new CozyCognitiveCoordinator` returns exactly one
match. `core/living/cozy-living-ai.js` was checked and contains no
`class *Thinking*` or `class *Reasoning*` definitions of its own
(Test 12 in the new suite enforces this as a permanent regression
guard).

### LIMITATIONS
Real Prompt API model execution cannot be verified in this sandbox at
all. This is unchanged from Phase 10C-3B4-1 and is not expected to
change without a different runtime environment.

### MISSING DEPENDENCIES
See `PHASE10C3B42-DEPENDENCY-REPORT.md`: (1) a Chrome/Chromium build
exposing the Prompt API, (2) unblocked outbound network for on-device
model download.

### OUTCOME
**OUTCOME B** — the architecture is correctly wired end-to-end (proven
live, not assumed), but real model execution is blocked purely by
environmental dependencies. Per the phase's Critical Stop Rule, no
production code was changed to "convert B into A" with test doubles.

### CHECKPOINT
`COS-REPO-MERGED-PHASE10C3B42.zip` — full repository, includes all
prior phases' source, tests, reports, and manifests plus this phase's
additions.

### SHA-256
See `PHASE10C3B42-SHA256-MANIFEST.txt` for the full-repository manifest
and the final chat message for the ZIP's own top-level hash.

### NEXT BUILD MUST START WITH
PHASE 10C-3B5
