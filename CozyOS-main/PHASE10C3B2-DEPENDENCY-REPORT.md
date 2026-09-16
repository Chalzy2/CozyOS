# Phase 10C-3B2 — Dependency Report

## Exact environmental dependency blocking real execution

To obtain genuine (non-test-double) provider execution evidence, a future
run needs **all** of the following simultaneously — this pass confirmed
each is independently missing here:

1. **A branded Google Chrome binary** (not open-source Chromium). The
   Prompt API (`self.LanguageModel`, `window.ai.languageModel`) and the
   "Optimization Guide On-Device Model" component are shipped through
   Google's branded build and closed component-update pipeline. This
   sandbox only has Playwright's bundled open-source Chromium
   (headless_shell and full builds, both v141.0.7390.37) — confirmed by
   direct launch and inspection, not by assumption. Neither exposes
   `LanguageModel`/`window.ai`.
2. **Chrome version + flags**: Chrome 138+ desktop, with
   `chrome://flags/#optimization-guide-on-device-model` and
   `chrome://flags/#prompt-api-for-gemini-nano` (or their
   `--enable-features=...` command-line equivalents) enabled. Flags alone
   were tried against the available Chromium binaries here and made no
   difference, because the API isn't compiled in at all — but flags remain
   a real prerequisite once a branded build is available.
3. **Sufficient local resources for the on-device model**: Chrome's
   on-device model requires several GB of free disk space and a
   compatible GPU/OS profile before `availability()` will ever report
   `"available"` rather than `"downloadable"`/`"unavailable"`. Not
   evaluated further here since prerequisite #1 already blocks progress.
4. **Outbound network access to Google's component-update service**
   (e.g. `componentupdater.googleapis.com`) for first-run model download.
   Confirmed blocked in this sandbox: `HTTP 403`.
5. **A real, interactive or scripted first-use trigger** for the model
   component to actually download (it is not bundled with Chrome; it is
   fetched lazily). Unreachable until #1 and #4 are both resolved.

## What would NOT resolve this

- Installing a different Node package. The Prompt API is not an npm
  package; it is a browser-native, Chrome-only surface.
- Writing a better test-double. Test-doubles (already used extensively in
  this repo, see `on-device-conversational-provider.test.js` and
  `phase10c3a-real-provider-integration.test.js`) prove wiring
  correctness; they cannot and must not be reported as real execution.
- Adjusting Chromium launch flags on the Playwright-bundled binary — this
  was directly tried (see `PHASE10C3B2-RUNTIME-EVIDENCE.md`, probes 2 and
  3) and made no difference, because the feature is absent from the
  open-source build, not merely gated behind a flag.

## What WOULD resolve this

Run the exact same trace (`core/modules/cognitive/tests/
phase10c3b2-runtime-trace.test.js`'s structural pattern, adapted to a real
`page.evaluate()` call instead of a Node `require()`) inside:
- a machine with genuine, branded Google Chrome 138+,
- the two flags above enabled,
- outbound network access to Google's component-update service,
- enough local disk/GPU headroom for the on-device model, and
- one real, live browser session that calls
  `LanguageModel.availability()` and confirms `"available"` (not
  `"downloadable"`) before invoking `create()`/`prompt()`.

No repository code change is required to reach that state — the
production wiring (`on-device-conversational-provider.js`,
`on-device-cognitive-adapter.js`, `CozyThinking`, `CognitiveCoordinator`,
`CozyAI`) already resolves the real API dynamically at call time and
requires no modification once such an environment exists.
