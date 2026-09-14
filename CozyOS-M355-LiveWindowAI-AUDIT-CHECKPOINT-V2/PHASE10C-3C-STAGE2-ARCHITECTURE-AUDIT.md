# PHASE 10C-3C — STAGE 2 ARCHITECTURE AUDIT

Investigation only. No production files modified. No Gemini provider implemented.
All findings below are backed by commands actually run against the extracted
repository in this session (Node v22.22.2, no network access).

---

## START GATE

- Uploaded zip SHA-256: `c57c4a1e39ff25eade8197e94fb04d0f291a6afc74fc2477627b4634cd0c5614` — **matches** the value stated in the Phase 10C-3B6 prompt.
- Extracted cleanly to a fresh directory (819 `.js` files, 178 `*.test.js` files, 204 top-level files).

---

## 1–3. CozyThinking / CognitiveCoordinator / LivingAI trace

Real pipeline, read directly from source:

```
user input
  -> CognitiveCoordinator.run({ text, actorId, ... })
       -> CozyInterpretation.interpret()      [core/modules/... interpretation]
       -> CozyThinking.think()                [core/modules/thinking/cozy-thinking.js]
       -> CozyReasoning.reason()               (if present)
       -> CozyIntelligence.analyse()           (if present)
       -> CozyMemory.recall()/saveMemory()     (if present)
       -> PolicyDecisionEngine.evaluate()      (if present)
  -> result + diagnostics returned to caller
```

`CozyLivingAI` (`core/living/cozy-living-ai.js`) sits **above** this, not inside it. It does not
run its own cognition — it wraps an `AIProviderRegistry` where each entry implements
`think(text, options) -> {success, result|reason}`, and its default/only real provider
(`"reasoning-pipeline"`) simply calls `CognitiveCoordinator.run()`.

**Key finding — the phase doc's target path is not quite how the code is built.**
The Phase 10C-3B6 prompt specifies:
`LivingAI -> CognitiveCoordinator -> CozyThinking -> gemini-api provider`.
The actual code inverts part of that:

- `CozyThinking` explicitly documents (in its own header) that it **never owns the AI
  provider registry** — it owns reasoning strategies/sessions/decision-matrices only, and
  its "providers" are reasoning-strategy providers, not LLM backends.
- `CognitiveCoordinator` explicitly documents that it **never owns** intelligence/thinking
  itself — it only sequences existing engines.
- The actual, already-built extension point for a new LLM-class backend is
  `CozyLivingAI`'s `AIProviderRegistry`, specifically `registerProvider(name, provider)`.
  It **already has an empty, honestly-unconfigured slot named `"cloud-llm"`**
  (`core/living/cozy-living-ai.js`, constructor) built for exactly this purpose — it
  currently returns `{ success:false, reason:"cloud LLM provider is registered but not
  configured yet - no real backend is connected." }`.

**Conclusion:** a future Gemini provider belongs as a `think(text, options)` implementation
registered with `CozyLivingAI` (either replacing the `"cloud-llm"` slot's placeholder or
registering a new `"gemini-api"` name), not inside `CozyThinking` or `CognitiveCoordinator`.
Both of those can remain completely untouched.

## 4. Can Gemini fit without modifying protected core contracts?

| Question (from phase doc) | Answer |
|---|---|
| A. Without modifying LivingAI | **No** — LivingAI is the intended registration point; a one-line `registerProvider()` call (or a new bootstrap file that does so) is the minimal touch. No change to LivingAI's *existing* code/behavior is required, only an additive call. |
| B. Without modifying CognitiveCoordinator | **Yes** — not needed at all. |
| C. Can Gemini exist as another CozyThinking provider | **No, by design** — CozyThinking's own header disclaims AI-provider ownership. Registering there would violate the file's own documented ownership boundary. |
| D. Can existing security/backend infra safely hold the credential | **No backend exists yet that does this** (see §5). |
| E. Is a new backend boundary required | **Yes.** |

## 5. Secret / backend boundary audit

- `core/config.js` contains a hardcoded `apiKeys` object (`gemini`, `openai`, `claude`) with
  placeholder-looking string values, plus `flags.defaultAIProvider: "gemini"`. **This file is
  never actually loaded by any HTML page** (`grep` across all `*.html` found zero references
  to `core/config.js`, and `window.CozyOS.Config` is assigned nowhere in the repo) — it is
  orphaned/dead code today. It is still a real risk if it were ever wired up as-is: it's an
  ES module (`export default`), meaning if it were bundled into a browser-loaded script the
  key strings would ship to every client. **Do not use this file as the Gemini secret store.**
- Only one real HTTP server pattern exists in the repo:
  `server/live-relay/live-distribution-signaling-server.js` (Node's built-in `http`, own trust
  domain: live-stream session tokens) and a newer, narrower
  `server/auth/google-login-endpoint.js` (also plain Node `http`, no Express/Fastify). Its own
  header explicitly confirms it did a repo-wide search and found **no general-purpose server
  boundary** before it was written.
- `google-account-provider.js` (client-side) explicitly discloses: *"No real OAuth round-trip
  is implemented — this environment has no server to hold a client secret."* Same conclusion
  applies to Gemini.
- Exactly one file in the whole repo reads `process.env` (`live-distribution-signaling-server.js`),
  and not for AI credentials.

**Conclusion:** there is no existing secure secret boundary for a cloud AI credential. A new,
small Node `http`-based endpoint (following `google-login-endpoint.js`'s existing pattern —
no new framework dependency) would be the smallest real addition: browser calls that local
endpoint, the endpoint holds the Gemini key server-side (env var, never in a committed file),
and forwards to the Gemini API. This is Outcome-B territory: a genuine, disclosed dependency,
not a gap to silently paper over.

## 6. Test infrastructure audit

- **No root `package.json`.** The only `package.json` in the repo (`tools/cozyai-bridge/package.json`)
  has a stub `"test"` script that just exits with an error — unrelated to the 178 `*.test.js` files.
- **No jest/mocha config anywhere.**
- However, every `*.test.js` file I inspected is a **self-contained Node script** using only
  built-ins (`assert`, `fs`, `path`) with a header comment stating `Run with: node <path>`.
  These are genuinely executable without any missing tooling.

I actually ran all 178 `*.test.js` files with `node <file>` (10s timeout each, no network):

| Result | Count |
|---|---|
| Exit 0 (all assertions in file passed) | 137 files |
| Exit 1 (a real assertion failed) | 12 files |
| Exit 124 (timed out at 10s — did not finish) | 27 files (mostly `*-browser.test.js` files that appear to expect a real browser/DOM environment or longer-running async waits, e.g. WholesaleOS, ChurchOS live-language, media/knowledge dashboard "browser" tests) |
| Duplicate filename collision noted | `core/engines/camera/camera-manager.test.js` vs `core/engines/camera/tests/camera-manager.test.js` — both ran |

Aggregate: **137 of 178 files pass cleanly right now; 12 fail; 27 need more than 10s or a
browser-like environment I don't have here** — none of that is a judgment about whether the
underlying features work, only about what I could actually reproduce in this exact sandbox
in the time available.

### Claimed-vs-reproducible matrix

The Phase 10C-3B6 prompt asked me to verify these 11 baseline counts: 16/16, 22/22, 11/11,
5/5, 8/8, 12/12, 7/7, 12/12, 10/10, 49/49, 17/17. I searched my actual run output
(`grep "<N> passed, 0 failed"`) for each:

| Claimed | Found a file with exactly this all-passing count? | Classification |
|---|---|---|
| 16/16 | Yes (1 file) | EXECUTABLE_BUT_NOT_PREVIOUSLY_VERIFIED → now EXECUTED_NOW |
| 22/22 | Yes (4 files) | EXECUTED_NOW |
| 11/11 | Yes (2 files) | EXECUTED_NOW |
| 5/5 | Yes (1 file) | EXECUTED_NOW |
| 8/8 | Yes (4 files) | EXECUTED_NOW |
| 12/12 | Yes (4 files) | EXECUTED_NOW |
| 7/7 | Yes (2 files) | EXECUTED_NOW |
| 10/10 | Yes (4 files) | EXECUTED_NOW |
| 49/49 | Yes (1 file) | EXECUTED_NOW |
| **17/17** | **No — zero files in the entire 178-file run produced "17 passed, 0 failed", and the literal string "17/17" does not appear anywhere in my output** | **UNKNOWN / NOT REPRODUCED** |

Important caveat: because several files share the same pass count (e.g. four different files
each print "22 passed, 0 failed"), I can't prove these are *the specific* suites the earlier
phase docs meant — only that counts matching most of the claimed numbers do genuinely exist
and do genuinely pass when run today. **17/17 is the one number I could not find any match
for at all**, including among the 27 timed-out files (none of their partial output before
timeout showed "17" either). This should be tracked down before it's cited again as a
verified baseline.

None of the previously-existing `TEST-RESULTS-*.txt` / `MANIFEST-*.txt` / `BYTE-DIFF-*.txt`
files in the repo were used as evidence for the table above — only my own fresh `node`
execution was.

## 7. Dependency map for a future Gemini integration

**A. Repository dependencies:** none beyond what's already present — no new npm packages
needed for a minimal server-side `https` call to the Gemini API (Node's built-in `https`
module is enough, matching the existing `google-login-endpoint.js` no-framework style).

**B. Runtime dependencies:** Node.js (already present on the dev machine and on the target
Android device — v24.17.0 per phase doc); a process that can hold an environment variable.

**C. Network dependencies:** outbound HTTPS to `generativelanguage.googleapis.com` (or
whatever current Gemini API host Google documents) from the *server* process, not the browser.
Not available in this sandbox (network disabled here).

**D. Credentials/secrets:** one Gemini API key, held server-side only (env var or a secret
store outside the repo), never in `core/config.js`, never in client JS, never committed.

**E. Device dependencies:** none specific to Gemini cloud calls — any device that can reach
the CozyOS backend over HTTP can use it. (Different from Chrome on-device AI — see Track B below.)

**F. Browser dependencies:** just `fetch()` to the local CozyOS backend endpoint — no special
browser AI API required, unlike Track B.

**G. Model/on-device dependencies:** none — this is the cloud track by definition.

## 8. Track A vs Track B — kept separate as instructed

- **Track A — Gemini API (cloud):** network + Gemini credential + a new small server
  endpoint + a `think()` provider registered into `CozyLivingAI`. Nothing to do with Chrome's
  on-device Prompt API.
- **Track B — Chrome/on-device AI:** physical Android + compatible Chrome channel + Prompt
  API feature availability + on-device model download + storage + GPU. Per the Phase 10C-3B4-2
  test file's own header, headless Chrome for Testing 131.0.6778.204 in that prior sandbox
  showed `window.ai`/`self.ai`/`LanguageModel` all `undefined`; I have no new evidence about
  the real physical Xiaomi device's Chrome 151 in this session (no device access here). These
  two tracks should not be conflated in any future report — proving Track A works says nothing
  about Track B, and vice versa.

## 9. Physical-device verification (preparation only)

I have no access to the physical Xiaomi 25078RA3EA in this sandbox and did not attempt to
simulate one. The device facts listed in the prompt (Android 16, ARM64, Chrome 151.0.7922.169,
Node v24.17.0, ~78GB/~11GB free, Mali GPU/Vulkan present, Chrome launching via Termux VIEW
intent) are taken as given from the prompt, not independently verified by me — I have no way
to check them from here. They prove, at most, that a browser can launch; they say nothing
about Prompt API availability (Track B) or about outbound network reachability from that
specific device (needed for Track A).

## Protected files (hashed, unchanged this session)

```
core/config.js                              847b7715cb1d9c8b9b58b8bf4d0e6ee3480a79197b85e32642a72a84b529aad6
core/living/cozy-living-ai.js               bd6033adefc43c3b91295ff4f7ff242319b743cd38e657597832ff6cf9838bb6
core/modules/cognitive/cognitive-coordinator.js  5855511b405d50adf05987513faea23ac342c5ed156f5d0042fd5e7eaf5f532e
core/modules/thinking/cozy-thinking.js      34a4999b22f66fa38a84b9dbfcc9734d9199666e018edfd0e5d00c2a0e56322c
core/ai/cozy-ai-platform.js                 07a1bc97ca5eb8171fd15734f0c2fcb2a23d7a317a706f6d7ab8cb1d9bb9abce
server/auth/google-login-endpoint.js        266c8b374f5596c08b2a759e6a6868682ecc3cbd7fe14d9a56260d633bcc52d2
```

No files in the repository were modified during this audit.

## Files that would need modification later (Stage 5, not done)

- New file: a small Node `http`/`https` server endpoint (sibling to `server/auth/google-login-endpoint.js`) that holds the Gemini key server-side and proxies requests.
- New file: a `gemini-api` provider module implementing `think(text, options)`, calling that endpoint via `fetch()`.
- One additive line/bootstrap call registering that provider with `CozyLivingAI.registerProvider(...)` — `cozy-living-ai.js` itself does not need its logic changed, only invoked.

## Files that must NOT be modified

- `core/modules/thinking/cozy-thinking.js` — explicitly out of scope per its own ownership header.
- `core/modules/cognitive/cognitive-coordinator.js` — explicitly out of scope per its own ownership header.
- `core/living/cozy-living-ai.js` — extend via its public `registerProvider()`, don't edit its internals.

## Limitations & missing dependencies

- No network access in this sandbox — Track A cannot be executed or even structurally
  smoke-tested against the real Gemini endpoint from here.
- No physical device access in this sandbox — Stage 7 cannot be attempted here at all.
- `core/config.js`'s placeholder API keys are dead code today but a latent risk if ever wired
  into a browser-loaded bundle without changes.
- 27 test files did not finish within 10 seconds in this environment; they need either a
  longer timeout or an actual browser/DOM context I don't have here — their real pass/fail
  status is genuinely unknown, not assumed.
- The 17/17 baseline count from the original phase doc could not be reproduced or located anywhere in this run.

## OUTCOME

**B — architecture confirmed but test infrastructure incomplete.**

The insertion point for a Gemini provider is real and identified (`CozyLivingAI`'s
`AIProviderRegistry`, `"cloud-llm"` slot or a new `"gemini-api"` entry), and no protected
core contract needs to change. But: (1) no backend boundary capable of holding a secret
exists yet — a small new server file is a genuine, disclosed requirement, not an
architecture gap to "fix" by inventing something bigger; and (2) the test suite is real and
mostly reproducible (137/178 clean passes just now) but has no unified runner, 27 files that
don't finish in a short timeout, and one previously-claimed count (17/17) I could not verify
at all.

## EXACT NEXT BUILD MUST START WITH

PHASE 10C-3D — build the minimal secret-holding backend endpoint (Node `http`, no new
framework, modeled on `server/auth/google-login-endpoint.js`) and verify it locally with a
placeholder/fake key before touching the Gemini API or the physical device.
