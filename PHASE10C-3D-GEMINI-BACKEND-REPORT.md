# PHASE 10C-3D — GEMINI SECURITY/PROVIDER BOUNDARY

Built the minimum real backend foundation identified as missing by the Phase 10C-3C audit.
No protected core file was modified. Every test count below comes from an actual `node`
execution in this session — none were estimated or copied from prior phase docs.

---

## Architecture — before / after

**Before (per Phase 10C-3C audit):**
```
CozyLivingAI.AIProviderRegistry
  ├─ "reasoning-pipeline"  (real, default — composes CognitiveCoordinator)
  ├─ "cloud-llm"           (real slot, honestly UNCONFIGURED — no backend)
  ├─ "on-device"           (real slot, honestly UNCONFIGURED)
  ├─ "enterprise-byo"      (real slot, honestly UNCONFIGURED)
  └─ "research-multi"      (real slot, honestly UNCONFIGURED)

No backend exists that can hold a cloud-AI credential.
```

**After (this phase):**
```
CozyLivingAI.AIProviderRegistry
  ├─ "reasoning-pipeline"  (unchanged, still default)
  ├─ "cloud-llm"           (still honestly UNCONFIGURED — deliberately not touched, see below)
  ├─ "gemini-api"          (NEW — real client-side provider, registered via the
  │                          EXISTING, unmodified registerProvider() public method)
  ├─ "on-device" / "enterprise-byo" / "research-multi"  (unchanged, still unconfigured)

  gemini-api.think(text, options)
      -> fetch('/ai/gemini', {text, options})            [browser/client, no key]
          -> server/ai/gemini-backend-endpoint.js          [NEW — holds GEMINI_API_KEY]
              -> https://generativelanguage.googleapis.com/... [real upstream call shape]
          <- {success, isReal, text, model, correlationId, latencyMs}   [no key ever included]
      <- {success, result:{text, isReal, model, ...} | reason}
```

**Why `"gemini-api"` as a new id instead of overwriting `"cloud-llm"`:** registering under a
new, explicit id means loading this file changes nothing about `cozy-living-ai.js`'s existing
default behavior — `"cloud-llm"` stays exactly as unconfigured as it was, and a deployment
that wants Gemini to *be* the cloud-llm slot can make that one-line decision itself
(`livingAI.registerProvider('cloud-llm', provider)`) rather than having it decided silently
by this file.

## Files changed

### New files (production)
- `server/ai/gemini-backend-endpoint.js` — the secret-holding HTTP boundary.
- `core/living/providers/gemini-cloud-provider.js` — the client-side `think()`/`describe()`
  provider that calls the boundary above, plus a `registerGeminiCloudProvider()` helper that
  calls `CozyLivingAI.registerProvider()`.

### New files (tests)
- `server/ai/test/gemini-backend-endpoint.test.js` — 13 tests.
- `core/living/tests/gemini-cloud-provider.test.js` — 12 tests.

### Files NOT modified (verified by hash, see below)
- `core/modules/thinking/cozy-thinking.js`
- `core/modules/cognitive/cognitive-coordinator.js`
- `core/living/cozy-living-ai.js`
- `core/ai/cozy-ai-platform.js`
- `core/config.js` (left as-is — still dead/orphaned code, not wired up, not used as the
  secret source; flagged again in Limitations)
- `server/auth/google-login-endpoint.js` (referenced only as a style precedent, not touched)
- No HTML file was edited — nothing wires either new file into `dashboard.html` yet (disclosed
  as out of scope below, matching this repo's existing convention of shipping engine
  capability ahead of UI wiring, e.g. `BASELINE.md`'s Founder Story Vault precedent).

## Secret flow (exact)

1. `GEMINI_API_KEY` is read **only** by `server/ai/gemini-backend-endpoint.js`, via
   `process.env.GEMINI_API_KEY` (the default `getApiKey()` — injectable for tests).
2. It is read fresh **per request** (not cached at module load), so rotating the env var
   without restarting the process takes effect on the next call.
3. It is placed into exactly one place: the outbound URL/header sent to Google's Gemini REST
   endpoint inside `callGemini()`.
4. It is never placed into: the HTTP response sent back to the client, any thrown `Error`
   message, the `onServerEvent` server-side log hook, or any file. Verified by tests #1, #8,
   #9, and #11 in `gemini-backend-endpoint.test.js` — including a specific test that plants a
   real key-shaped string, makes a real request, and asserts it does not appear anywhere in
   the raw HTTP response bytes.
5. `core/living/providers/gemini-cloud-provider.js` (the browser-side file) contains **zero**
   references to `process.env`, and no key-shaped literal — verified by a static source scan
   test (#10 in `gemini-cloud-provider.test.js`), not just by inspection.
6. Startup validation: `GeminiBackendServer`'s constructor calls `getApiKey()` immediately and
   **throws** if it's missing/empty, so a misconfigured deployment fails at boot instead of
   silently 503-ing on first use (test #11). A `validateOnStart:false` escape hatch exists
   only for the one test that intentionally exercises the per-request missing-key path
   (test #12) — never intended for production use.

## Provider registration flow (exact)

```js
const { registerGeminiCloudProvider } = require('./core/living/providers/gemini-cloud-provider.js');
registerGeminiCloudProvider(window.CozyOS.LivingAI, { backendUrl: '/ai/gemini' });
// -> internally calls the EXISTING window.CozyOS.LivingAI.registerProvider('gemini-api', provider)
```

Selection is then just the pre-existing, unmodified `CozyLivingAI` API:
```js
window.CozyOS.LivingAI.setActiveProvider('gemini-api');
await window.CozyOS.LivingAI.think('Hello. Tell me briefly what you can help me with.');
```
or, without changing the default, an explicit one-off:
```js
window.CozyOS.LivingAI.describeProvider('gemini-api'); // inspect before use
```

## Tests actually executed this session

```
$ node server/ai/test/gemini-backend-endpoint.test.js
13 passed, 0 failed

$ node core/living/tests/gemini-cloud-provider.test.js
12 passed, 0 failed   (see note below — first run was 11/12, see Investigation section)
```

Total new tests this phase: **25 passed, 0 failed**, both runs captured directly, not
paraphrased from memory.

Coverage against the phase-10C-3D checklist:

| Required test | Present | File |
|---|---|---|
| Missing API key | ✓ | backend #1, #12 |
| Malformed request | ✓ | backend #2, #3, #4 |
| Timeout | ✓ | backend #6 |
| Upstream failure | ✓ | backend #5 |
| Successful mocked provider response | ✓ | backend #7, #13; provider #5 |
| Secret redaction | ✓ | backend #8, #9 |
| API key never returned to client | ✓ | backend #8 (asserts raw response bytes) |
| Provider registration | ✓ | provider #3 |
| Provider selection | ✓ | provider #5, #12 |
| Registry integration | ✓ | provider #3, #4, #6 |

## An honest note on my own test-writing process (self-correction, not gaming)

My first run of `gemini-cloud-provider.test.js` was **11 passed, 1 failed** — test #11 used a
regex (`/isReal\s*:\s*true/`) that matched a doc-comment sentence ("Never fabricates
isReal:true") rather than actual code, a false positive in my own test, not a defect in the
provider. I fixed the test to strip comments before scanning and to assert what the code
*should* do (forward `data.isReal`), then re-ran it for real: 12/12. I'm disclosing the
before/after here explicitly per this phase's instruction not to manufacture test counts —
this is the one number that changed between runs, and here's exactly why.

## Investigation: the historical 17/17 claim (separate task, resolved)

Phase 10C-3C could not reproduce a "17/17" result anywhere in a 178-file, 10-second-per-file
run (27 files timed out at that limit). I traced the origin of the claim to
`PHASE10C3B5-STAGE1-IMPLEMENTATION-REPORT.md`, which attributes 17/17 to
`core/living/tests/living-tts.test.js`. That file was one of the 27 that timed out in
Stage-2's batch run.

I re-ran it individually with a 60-second timeout:
```
$ node core/living/tests/living-tts.test.js
# tests 17
# pass 17
# fail 0
EXIT:0
```
**Resolved as genuine — not fabricated.** It uses Node's built-in `node:test` runner
(TAP output), and the full suite takes ~50 seconds real wall-clock time — well over the 10s
batch timeout used in the Stage-2 sweep, which is why it looked unreproducible. No test file
was modified to produce this result. I did not re-verify the other 26 previously-timed-out
files individually this phase — that remains open (see Limitations).

## Live Gemini status: **UNVERIFIED**

No real request was made to the actual Gemini API in this phase. `GEMINI_API_KEY` is not set
in this sandbox, and this sandbox has outbound network access disabled entirely — confirmed,
not assumed. Every test in both new test files uses an injected fake `fetchImpl`; none of
them touch a real network socket. `isReal: true` appearing in a passing test means only "the
backend's own logic genuinely executed and genuinely called whatever `fetchImpl` it was
given" — it is not evidence of a real Gemini response, and no report in this repo should cite
it as such.

## Limitations & missing dependencies

- No network access in this sandbox: Track A (real Gemini call) cannot be exercised here at all.
- No `GEMINI_API_KEY`: even if network were available, there is no real credential in this
  environment to test with.
- No physical device access: Stage 7 (physical Android test from the original 10C-3B6 spec)
  remains completely untouched by this phase.
- Neither new file is wired into `dashboard.html` yet — deliberately, since doing so wasn't
  required to prove the boundary works and touching the shared HTML file wasn't asked for
  this phase. A future phase should add the two `<script>` tags and a call to
  `registerGeminiCloudProvider(window.CozyOS.LivingAI)` at boot.
- `core/config.js`'s orphaned placeholder API keys were left exactly as found — still dead
  code, still a latent risk if anyone ever wires it into a browser bundle without changes.
  Not touched or cleaned up this phase (out of scope; flagged again for visibility).
- Only `living-tts.test.js` was individually re-verified for the 17/17 investigation; the
  other 26 files that timed out in Stage-2's 10-second batch sweep were not re-run this phase
  and their real status remains genuinely unknown.
- The exact Gemini model id (`gemini-2.0-flash` default) and REST endpoint shape used in
  `callGemini()` are based on the publicly documented Gemini API request/response shape as of
  this repo's stated environment; they have not been exercised against the real API and
  should be re-verified against Google's current documentation before any live attempt.

## Protected-file SHA-256 (before this phase, from Stage 2 audit → after this phase, just re-hashed — identical)

```
core/config.js                                   847b7715cb1d9c8b9b58b8bf4d0e6ee3480a79197b85e32642a72a84b529aad6
core/living/cozy-living-ai.js                    bd6033adefc43c3b91295ff4f7ff242319b743cd38e657597832ff6cf9838bb6
core/modules/cognitive/cognitive-coordinator.js  5855511b405d50adf05987513faea23ac342c5ed156f5d0042fd5e7eaf5f532e
core/modules/thinking/cozy-thinking.js           34a4999b22f66fa38a84b9dbfcc9734d9199666e018edfd0e5d00c2a0e56322c
core/ai/cozy-ai-platform.js                      07a1bc97ca5eb8171fd15734f0c2fcb2a23d7a317a706f6d7ab8cb1d9bb9abce
server/auth/google-login-endpoint.js             266c8b374f5596c08b2a759e6a6868682ecc3cbd7fe14d9a56260d633bcc52d2
```
All six identical before and after — confirmed by re-running `sha256sum` after implementation,
not assumed.

## New-file SHA-256

```
server/ai/gemini-backend-endpoint.js             c07371a9f83df189654cf65eeb374c016e59bb911148834e763d7d4a2bf03348
server/ai/test/gemini-backend-endpoint.test.js   1bb678942e688ac963b9ce9507a9221268f7507571bdb6287626e9eb533dc767
core/living/providers/gemini-cloud-provider.js   c724efaae7db0efe79a23148089489de795ce26132a97d1d4b431fd153eab9b2
core/living/tests/gemini-cloud-provider.test.js  4bcaea9734bf15838746cb838fb73976632344271cc010fc1b1aac108a25c693
```

## Dependencies added

None. No new npm packages. Node's built-in `http`, `crypto`, `AbortController`, and global
`fetch` (Node 18+) only — matching this repo's existing no-framework server precedent.

## OUTCOME

**B — backend + provider structurally verified, live Gemini not yet verified.**

The secret boundary, provider adapter, and registry integration are real, genuinely tested
(25/25 passing, executed in this session), and leave every protected file byte-identical.
Live Gemini execution is explicitly, honestly UNVERIFIED — no key, no network, no claim of A.

## EXACT NEXT BUILD MUST START WITH

PHASE 10C-3E — obtain a real `GEMINI_API_KEY` and real network access in an environment that
has both (not this sandbox), start `GeminiBackendServer` for real, and make one real request
through the full chain (`gemini-cloud-provider.think()` → `/ai/gemini` → real Gemini API) to
either confirm Outcome A or surface a real, disclosed blocker. Do not wire this into
`dashboard.html` or attempt the physical Android device until that one real end-to-end call
has been proven outside this sandbox.
