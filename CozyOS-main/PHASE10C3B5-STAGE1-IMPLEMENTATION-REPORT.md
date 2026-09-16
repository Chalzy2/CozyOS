# PHASE 10C-3B5 — STAGE 1: Start Gate + Runtime Discovery
## Implementation Report (discovery only — no production files touched)

### STEP 1 — Baseline verification
- Uploaded ZIP `COS-REPO-MERGED-PHASE10C3B42.zip` SHA-256 computed independently:
  `1e499f6cc3f7bec870ae74533f30142d0f3e99a3a4898589a4aadc2eeb85babc`
  — matches the stated baseline hash exactly.
- `unzip -t` reported no errors detected in compressed data.
- Extracted into a fresh directory (`/home/claude/work/extracted`), 1358 files.
- Baseline: VERIFIED.

### STEP 2 — Regression gates (actually executed, this session, this container)
| Suite | File | Result |
|---|---|---|
| Phase 10B | core/modules/cognitive/tests/phase10b-shared-cognitive-integration.test.js | 16/16 |
| Phase 10C-2B | core/modules/cognitive/tests/phase10c2b-async-provider-boundary.test.js | 22/22 |
| Phase 10C-3A | core/modules/cognitive/tests/phase10c3a-real-provider-integration.test.js | 11/11 |
| Phase 10C-3B2 | core/modules/cognitive/tests/phase10c3b2-runtime-trace.test.js | 5/5 |
| On-device provider | core/modules/intelligence/providers/tests/on-device-conversational-provider.test.js | 8/8 |
| Phase 10C-3B3 | core/modules/cognitive/tests/phase10c3b3-builder-provider-selection.test.js | 12/12 |
| Phase 10C-3B4-1 | core/modules/cognitive/tests/phase10c3b4-1-living-engine-browser-provider-audit.test.js | 7/7 |
| Phase 10C-3B4-2 | core/living/tests/phase10c3b42-living-provider-integration.test.js | 12/12 |
| Living suite A | core/living/tests/cozy-living-assistant-reply.test.js | 10/10 |
| Living suite B | core/living/tests/cozy-living-compressor.test.js | 49/49 |
| Living suite C | core/living/tests/living-tts.test.js | 17/17 |

All ran with plain `node <file>.test.js` (self-contained, no external test
framework). All counts match what prior phase documentation claimed. This
is a real, reproducible re-run in a fresh container — not a copy of old
numbers.

### STEP 3 — Search for a real runtime
Searched the full extracted tree for browser launchers / bootstrap chains.
Findings:
- `playwright` is used only inside `evidence/phase10c3b2-runtime-probe/*`
  (prior probe scripts) and `harness/run-harness.js` (a **fake-device**
  media/WebRTC harness explicitly labeled "FAKE-DEVICE BROWSER
  VERIFICATION HARNESS" in its own header — it launches a real Chromium
  but with `--use-fake-device-for-media-stream`, and is unrelated to the
  Prompt API question).
- No Electron, no Android project, no native app shell anywhere in the
  tree (`find . -iname "*.apk" -o -iname "electron*"` → no results).
- Deployment surface is a static PWA: `index.html`, `dashboard.html`,
  `login.html`, `PWA/manifest.json`, `sw.js` (service worker, currently
  focused on cache-versioning/precache fixes for GitHub Pages project-page
  deployment — no AI bootstrap logic in it).
- No `window.ai` / `self.ai` / `LanguageModel` bootstrap code exists
  anywhere in production files. The only occurrences of those strings are
  in the probe scripts and in `core/modules/intelligence/providers/`
  (the on-device provider, which already fails soft/honestly when the
  global is absent — confirmed by its own passing test: "does not throw
  when ProviderManager is absent from the page").

### STEP 4 — Actual deployment target
**A — normal browser/PWA** (GitHub Pages style static hosting). Confirmed
by `sw.js` comments referencing GitHub Pages project-page path resolution,
and the absence of any Electron/Android/custom-runtime scaffolding.

Real bootstrap chain, traced file-by-file:
```
index.html
  → cozyos.js                          (Workspace bootstrap)
  → core/living/cozy-living-ai.js      (window.CozyOS.LivingAI)
  → window.CozyOS.CognitiveCoordinator (singleton, run())
  → CozyThinking provider registry
  → on-device-conversational provider  (core/modules/intelligence/providers/)
  → expects self.ai / window.ai / LanguageModel  ← NOT PRESENT in any
    browser tested (see Step 5)
```
This matches the chain already documented in Phase 10C-3B4-1's audit
(re-verified, not re-invented, this pass — see that suite's 7/7 above).

### STEP 5 — Real browser capability test
A real Chromium was launched via Playwright (already vendored in this
container at `/opt/pw-browsers/chromium-1194`), **not** a fake `window`
object.

```
Browser: HeadlessChrome/141.0.7390.37 (Playwright-managed Chromium)
typeof window.ai            → "undefined"
typeof self.ai              → "undefined"
typeof LanguageModel        → "undefined"
typeof self.LanguageModel   → "undefined"
typeof window.LanguageModel → "undefined"
```
Repeated with `--enable-features=PromptAPIForGeminiNano,OptimizationGuideOnDeviceModel`
(the same flag combination used in the prior phase's probe scripts):
same result — all `undefined`.

```
REAL PROMPT API: UNAVAILABLE
BROWSER: HeadlessChrome/141.0.7390.37 (Playwright Chromium build 1194)
MODEL: unavailable (API surface itself absent, so no model check possible)
NETWORK: BLOCKED — egress proxy returns HTTP 403,
         x-deny-reason: host_not_allowed
         ("Host not in allowlist: example.com. Add this host to your
         network egress settings to allow access.")
ERROR: no exception — the properties are simply absent (`undefined`),
       consistent with a Chromium build where the Prompt API origin
       trial / flag is not compiled in or not enabled for this channel.
```

### STEP 6 — Is this a real production gap?
**OUTCOME B.** The architecture is already correct (Step 4's chain is
real and wired; the on-device provider already handles absence of the
global gracefully rather than faking it). The remaining blocker is
external to the repository: no browser available in this container (or,
by extension, most current shipping browsers) exposes `window.ai` /
`LanguageModel` outside of specific Chrome channels enrolled in Google's
Prompt API origin trial, and this container's network egress is
allowlist-only, so even an enrolled origin trial could not reach Google's
model-download infrastructure from here.

Nothing in Stage 1 justifies a code change. No production file was
opened for writing in this stage.

### PRODUCTION FILES CHANGED
NONE.
