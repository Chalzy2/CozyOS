# PHASE 10C-3E — IMPLEMENTATION REPORT
## Real Gemini Runtime Integration

Continuation of Phase 10C-3D. No protected file was rebuilt or replaced. No ZIP was
created (per standing checkpoint rule). The real-browser probe required by this phase
has been executed — see "Real-browser evidence" below. This report is written after
that execution, not before it.

---

## Files changed

### New files (this phase)
| File | Purpose |
|---|---|
| `core/living/providers/gemini-cloud-provider-bootstrap.js` | Auto-registers `gemini-api` into LivingAI via the existing public `registerProvider()` on script load. Never activates it. |
| `core/living/tests/gemini-cloud-provider-bootstrap.test.js` | 10 structural tests: real script-load-order behavior, wrong-order failure handling, idempotency, HTML wiring order, no forced activation, no credential in bootstrap source. |
| `server/ai/gemini-runtime-harness-server.js` | Combined static-file + `/ai/gemini` dev/test server so a real browser can load the real `index.html`/`dashboard.html` and hit the backend same-origin. |
| `server/ai/test/gemini-runtime-harness-server.test.js` | 8 structural tests over real HTTP loopback: real static serving, real routing, 404/403 handling, honest missing-key 503. |
| `tools/termux/gemini-browser-runtime-probe.js` | The real-browser probe: launches real Chromium, loads the real served `index.html`, exercises the real LivingAI API from inside the real page. |

### Changed files (this phase)
| File | Change | Reason |
|---|---|---|
| `core/living/providers/gemini-cloud-provider.js` | One-line UMD-branch fix: `root.CozyOS.createGeminiCloudProvider = factory();` → `Object.assign(root.CozyOS, factory());` | **Real bug found this phase** (see below). No function bodies changed. |
| `core/living/tests/gemini-cloud-provider.test.js` | Added test 13 (regression test for the bug above) | Prevents this exact class of bug (browser-only, invisible to `require()`-based tests) from recurring silently. |
| `index.html` | Added 2 `<script>` tags (provider + bootstrap) right after the existing `cozy-living-ai.js` tag | Wires Gemini into the real public entry point. |
| `dashboard.html` | Added the same 2 `<script>` tags right after its own `cozy-living-ai.js` tag | Wires Gemini into the real authenticated app shell. |

### Files NOT touched (re-verified this phase, byte-identical)
`core/config.js`, `core/living/cozy-living-ai.js`, `core/modules/cognitive/cognitive-coordinator.js`,
`core/modules/thinking/cozy-thinking.js`, `core/ai/cozy-ai-platform.js`,
`server/auth/google-login-endpoint.js`, `server/ai/gemini-backend-endpoint.js`.

---

## A real bug found and fixed this phase

Before writing any new wiring, the actual non-Node (`<script>`-tag) branch of
`gemini-cloud-provider.js`'s UMD wrapper was executed for the first time (via `vm`, to
simulate exactly what a real browser does) rather than only trusting its `require()`
path, which is all Phase 10C-3D's own tests ever exercised. Result:

```
window.CozyOS keys: [ 'createGeminiCloudProvider' ]
typeof window.CozyOS.createGeminiCloudProvider: object   ← should be 'function'
```

In a real browser, `window.CozyOS.createGeminiCloudProvider` held the entire
`{createGeminiCloudProvider, registerGeminiCloudProvider}` object, not the function
itself — and `window.CozyOS.registerGeminiCloudProvider` **did not exist at all**. This
was invisible to every 10C-3D test because they all load the file via `require()`,
which takes the other UMD branch. Any real `<script>`-tag integration of Gemini would
have failed silently at the exact wiring step this phase was asked to build.

**Fix:** `Object.assign(root.CozyOS, factory())` in the browser branch only. No
function logic changed. Verified empirically before and after (see "Tests" below), and
a permanent regression test (test 13 in `gemini-cloud-provider.test.js`) was added so
this can't reappear undetected.

---

## Exact implementation status

- Gemini is now wired into both real HTML entry points (`index.html`, `dashboard.html`)
  through the existing, unmodified `LivingAI.registerProvider()` public method — no new
  registration mechanism was invented.
- The secret boundary is unchanged and re-verified: `GEMINI_API_KEY` is still read only
  in `server/ai/gemini-backend-endpoint.js`, only from `process.env`, never present in
  any browser-loaded file (checked by source scan, see bootstrap test 10).
- The default reasoning-pipeline provider's own logic is untouched. Its *file* is
  byte-identical to 10C-3D.
- **Important, honestly-disclosed nuance found by the real browser probe:** by the time
  the full, real `index.html` finishes loading every script, the active provider is
  `rule-based-conversational`, not `reasoning-pipeline`. This is **not caused by this
  phase**. It is caused by a separate, pre-existing, already-disclosed feature —
  `core/modules/intelligence/providers/rule-based-conversational-provider.js` (RP-026 +
  RP-027), whose own file header states it "explicitly activates itself via the
  existing `LivingAI.setActiveProvider()` choke point as one disclosed, separate step."
  That script loads *after* the Gemini bootstrap in `index.html` (line 109 vs. line 96)
  and switches the active provider on its own, independent of anything in this phase.
  Confirmed by source inspection: `gemini-cloud-provider-bootstrap.js` never calls
  `setActiveProvider` anywhere (test 9, and the browser probe below shows registering
  `gemini-api` never changed whatever the active provider was at that moment). The
  isolated bootstrap tests (which load only `cozy-living-ai.js` + the Gemini files, none
  of the other providers) correctly show `reasoning-pipeline` preserved as the
  post-registration default in that narrower scope — that scope is exactly what this
  phase's own code is responsible for, and it behaves correctly there.

---

## Real-browser evidence

Executed `tools/termux/gemini-browser-runtime-probe.js` in this sandbox, using the real
Chromium binary confirmed present at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`
(version 141.0.7390.37), against the real, unmodified `index.html` served by the real
`gemini-runtime-harness-server.js`. Full captured output:

```json
{
  "phase": "10C-3E",
  "probeType": "real-browser-runtime",
  "environment": { "hasGeminiApiKeyInEnv": false, "harnessBaseUrl": "http://127.0.0.1:46633" },
  "checks": {
    "livingAIExists": true,
    "providerList": ["reasoning-pipeline","cloud-llm","on-device","enterprise-byo","research-multi","gemini-api","rule-based-conversational"],
    "geminiApiRegistered": true,
    "defaultActiveProviderBeforeSwitch": "rule-based-conversational",
    "defaultProviderIsReasoningPipeline": false,
    "describeGeminiApi": {
      "kind": "gemini-api (cloud)",
      "isLLM": true,
      "offline": false,
      "note": "Real HTTP call to a same-origin CozyOS backend endpoint that holds the Gemini credential server-side. This file never sees the credential."
    },
    "setActiveProviderResult": { "success": true },
    "activeProviderAfterSwitch": "gemini-api",
    "switchSucceeded": true
  },
  "thinkResult": { "success": false, "reason": "PROVIDER_NOT_CONFIGURED" },
  "serverSideEvents": [
    { "event": "REJECTED", "detail": { "correlationId": "77f412e9-3e04-412a-882a-87738cacdb92", "reason": "PROVIDER_NOT_CONFIGURED" } }
  ],
  "errors": [],
  "chromiumVersion": "141.0.7390.37",
  "chromiumExecutable": "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "thinkLatencyMsClientSide": 44,
  "consoleMessages": [
    "[log] [CozyTheme] Applied active theme profile: cozyos",
    "[error] Failed to load resource: the server responded with a status of 404 (Not Found)",
    "[error] Failed to load resource: the server responded with a status of 503 (Service Unavailable)"
  ]
}
```

**Reading this honestly, point by point (exactly what this phase asked to verify):**

1. `window.CozyOS.LivingAI` exists in the real browser DOM. ✅ Confirmed.
2. `gemini-api` is genuinely registered — present in `providerList`, and it got there
   through the real production bootstrap running as an actual `<script>` tag, not a
   test shortcut. ✅ Confirmed.
3. The default provider "remains reasoning-pipeline" — **not literally true** in the
   full page, for the pre-existing, unrelated reason explained above. This phase's own
   code does not cause or contribute to that change (confirmed by source + isolated
   tests). Reported honestly rather than asserted as passing.
4. `LivingAI.setActiveProvider("gemini-api")` — the existing, public, unmodified
   method — was called explicitly from inside the real page and succeeded, moving the
   active provider to `gemini-api` regardless of what it was before. ✅ Confirmed.
5. `LivingAI.think(...)` was called from inside the real browser. This triggered a real
   `fetch('/ai/gemini')` from the real browser to the real harness server (visible as
   the 503 console error above — that HTTP round trip genuinely happened over a real
   socket). The real, unmodified backend genuinely rejected it because this sandbox has
   no `GEMINI_API_KEY`, and reported that honestly as `PROVIDER_NOT_CONFIGURED`. ✅ The
   browser→backend routing is proven real; Gemini itself was never reached because the
   credential doesn't exist here.

The one console 404 is unrelated static-asset noise from the full `index.html` load
(an image/font not present under this harness's static root) and does not affect any of
the checks above.

**One important distinction, stated plainly:** this proves the *browser registration and
routing path* is real and correct end-to-end, up to the point where a real key would be
required. It does **not** prove a real Gemini API response, because this sandbox has
neither a key nor outbound network. Those are two different, separately-tracked claims,
and only the first one is being made here.

---

## Gemini network/API evidence (if available)

Not available in this sandbox — re-confirmed, unchanged from prior phases:
```
$ env | grep -i gemini            → (no output)
$ curl -s -D - https://generativelanguage.googleapis.com/...  → 403, x-deny-reason: host_not_allowed
$ curl -s -D - https://example.com                            → 403, x-deny-reason: host_not_allowed (unrelated control host, same block)
```
No claim of a live Gemini response is made anywhere in this report.

---

## Tests and results

```
node server/ai/test/gemini-backend-endpoint.test.js          → 13 passed, 0 failed  (10C-3D, unchanged)
node core/living/tests/gemini-cloud-provider.test.js         → 13 passed, 0 failed  (10C-3D's 12 + new regression test 13)
node core/living/tests/gemini-cloud-provider-bootstrap.test.js → 10 passed, 0 failed  (new, 10C-3E)
node server/ai/test/gemini-runtime-harness-server.test.js    →  8 passed, 0 failed  (new, 10C-3E)
node tools/termux/tests/gemini-real-execution-probe.test.js  →  4 passed, 0 failed  (10C-3E, prior sub-phase, re-verified)
```
**Total: 48 passed, 0 failed**, all re-run and captured directly in this session.

Plus the one real-browser probe run (not a pass/fail test — a recorded observation),
shown in full above.

---

## Protected/default-provider verification

SHA-256, re-verified this phase, identical to Phase 10C-3D:
```
core/config.js                                   847b7715cb1d9c8b9b58b8bf4d0e6ee3480a79197b85e32642a72a84b529aad6
core/living/cozy-living-ai.js                    bd6033adefc43c3b91295ff4f7ff242319b743cd38e657597832ff6cf9838bb6
core/modules/cognitive/cognitive-coordinator.js  5855511b405d50adf05987513faea23ac342c5ed156f5d0042fd5e7eaf5f532e
core/modules/thinking/cozy-thinking.js           34a4999b22f66fa38a84b9dbfcc9734d9199666e018edfd0e5d00c2a0e56322c
core/ai/cozy-ai-platform.js                      07a1bc97ca5eb8171fd15734f0c2fcb2a23d7a317a706f6d7ab8cb1d9bb9abce
server/auth/google-login-endpoint.js             266c8b374f5596c08b2a759e6a6868682ecc3cbd7fe14d9a56260d633bcc52d2
server/ai/gemini-backend-endpoint.js             c07371a9f83df189654cf65eeb374c016e59bb911148834e763d7d4a2bf03348
```

Changed file (bug fix, disclosed above):
```
core/living/providers/gemini-cloud-provider.js   891abf7d4cc670f4d6d6aae473fdf872b9f80d9e061cdf80e43b8a3e4ba2cb1e
```

New/changed files, this phase:
```
core/living/providers/gemini-cloud-provider-bootstrap.js       ddd41a30fdc4ee4553fd093b15f8c6e9d9e44d2952ea601fa6fafe4854ab74fb
core/living/tests/gemini-cloud-provider-bootstrap.test.js      cb21ad2bdfd18c326bd4d11ffdb9525e3d03cee908b3026516daf228d5c38d84
server/ai/gemini-runtime-harness-server.js                     2d86c9904494eee3eb8ade7424bf8ab1003f7727b4ea060a234e24e6d8bdaec0
server/ai/test/gemini-runtime-harness-server.test.js           aca82904e7e04712ff0e8918e2e6693d8b44f19f031c2e59c4637f77d7fb44df
tools/termux/gemini-browser-runtime-probe.js                   15aedb1e51d374564804069a1eb97bdbd0207016ec537704ac91798323bde4ed
core/living/tests/gemini-cloud-provider.test.js (test 13 added) 8e9c5d89fc8b49d982449f934ee6f7212a93aff6d1db68dbc2d133e6a6b94ebb
index.html (2 script tags added)                                79faab7d8e96ac8c106d94fe301f66fc7d691cc45dc05f0d7377004fca438971
dashboard.html (2 script tags added)                            500bef90aa1f5a4fa245ae3cf6891f030e8c91174c7caab34de7c7126086e5e8
```

**Default-provider verification (precise, not glossed over):** Gemini's own wiring
(`gemini-cloud-provider-bootstrap.js`) never calls `setActiveProvider` — confirmed by
source, by isolated structural tests, and by the real browser probe (registering
`gemini-api` never changed the active provider away from whatever it already was at
that point). The full-page active-provider value at rest (`rule-based-conversational`)
is the product of a separate, pre-existing, already-disclosed feature and is unaffected
by this phase.

---

## Limitations & missing dependencies

- No `GEMINI_API_KEY` and no outbound network in this sandbox (re-confirmed this
  phase) — a live Gemini response has still never been observed from this environment.
- `gemini-runtime-harness-server.js` is explicitly a dev/verification harness: no
  HTTPS, no auth, no rate limiting, no origin allowlist beyond what
  `gemini-backend-endpoint.js` itself already enforces. Not a deployment artifact.
- The browser probe's asset 404 (unrelated static file missing under the harness root)
  was not chased down — it doesn't touch any Gemini-related path and pre-dates this
  phase.
- Real Gemini REST response shape/model id (`gemini-2.0-flash`) is still unverified
  against Google's live API — same caveat carried from 10C-3D.
- `rule-based-conversational-provider.js` self-activating on load means that, in the
  full production page, a real end user's session would need an explicit
  `setActiveProvider('gemini-api')` call from real UI to actually use Gemini — this
  phase did not add any UI control for that (out of scope; this phase's mandate was
  registration + routing, not a provider-switcher UI).

---

## Exact NEXT BUILD MUST START WITH

PHASE 10C-3F — on the physical Android/Termux device, with real network and a real
`GEMINI_API_KEY` exported into the shell environment (never committed), run:

```
node tools/termux/gemini-browser-runtime-probe.js
```

(Requires `npx playwright install chromium` on that device first, unless a Chromium
binary is already resolvable — the script falls back to Playwright's default resolution
if the sandbox-specific path isn't present.)

Capture the exact printed JSON verbatim into that phase's report. Only if `thinkResult`
shows `"success": true` with `"isReal": true` and a real model id/latency does the
project get to claim a live, browser-driven Gemini response. If it fails, capture the
exact `reason` honestly. Do not add a provider-switcher UI, do not touch
`rule-based-conversational-provider.js`, and do not attempt any further phase until this
one real end-to-end browser call has been proven or its real failure reason captured
from that device.
