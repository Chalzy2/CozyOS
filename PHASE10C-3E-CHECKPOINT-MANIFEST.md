# PHASE 10C-3E — MID-MILESTONE CHECKPOINT MANIFEST

**Type:** Delta/patch checkpoint, relative to the verified Phase 10C-3D baseline
(`COS-REPO-MERGED-PHASE10C3D`). This archive is a **patch**, not a full repo snapshot —
it contains only files added or changed during Phase 10C-3E. Apply on top of the
10C-3D baseline; do not use in isolation.

**Created:** end of Phase 10C-3E, after the real-browser probe was executed and its
result recorded, and after a final, no-changes re-verification pass (see below). No
implementation changes were made while preparing this checkpoint.

---

## 1. Contents of this archive (13 files)

### Reports (2)
| File | Description |
|---|---|
| `PHASE10C-3E-IMPLEMENTATION-REPORT.md` | Final Phase 10C-3E report: files changed, implementation status, real-browser evidence, tests, limitations, next-build instructions. **Primary report for this checkpoint.** |
| `PHASE10C-3E-GEMINI-REAL-EXECUTION-REPORT.md` | Earlier interim report (Node-level real-execution attempt, prior to the full browser-bootstrap integration work). Kept for continuity/audit trail. |

### New production code (2)
| File | Description |
|---|---|
| `core/living/providers/gemini-cloud-provider-bootstrap.js` | Auto-registers `gemini-api` into LivingAI via the existing public `registerProvider()`. Never activates it. |
| `server/ai/gemini-runtime-harness-server.js` | Combined static-file + `/ai/gemini` dev/verification server (same-origin, real static files + real backend route). |

### Changed production code (3)
| File | Change |
|---|---|
| `core/living/providers/gemini-cloud-provider.js` | One-line UMD browser-branch fix: `Object.assign(root.CozyOS, factory())` replacing a broken direct assignment. Bug found and fixed this phase — see implementation report. No function-body logic changed. |
| `index.html` | +2 `<script>` tags (provider + bootstrap), inserted immediately after the existing `cozy-living-ai.js` tag. Additive only. |
| `dashboard.html` | Same 2 `<script>` tags, inserted immediately after its own `cozy-living-ai.js` tag. Additive only. |

### New tests (3)
| File | Tests |
|---|---|
| `core/living/tests/gemini-cloud-provider-bootstrap.test.js` | 10 tests — real script-load order, wrong-order handling, idempotency, HTML wiring order, no forced activation, no credential leakage. |
| `server/ai/test/gemini-runtime-harness-server.test.js` | 8 tests — real HTTP loopback: static serving, routing, 404/403, honest missing-key 503. |
| `tools/termux/tests/gemini-real-execution-probe.test.js` | 4 tests — probe honesty guarantees (carried over from earlier sub-phase). |

### Changed tests (1)
| File | Change |
|---|---|
| `core/living/tests/gemini-cloud-provider.test.js` | Added test 13 — regression test for the UMD browser-branch bug above. Tests 1–12 unchanged. |

### New tools (2)
| File | Description |
|---|---|
| `tools/termux/gemini-browser-runtime-probe.js` | **The real-browser probe.** Launches real Chromium via Playwright, loads the real served `index.html`, exercises the real LivingAI API from inside the real page. Executed this phase — see evidence below. |
| `tools/termux/gemini-real-execution-probe.js` | Node-level (non-browser) real-execution CLI, carried over from the earlier sub-phase; requires a real `GEMINI_API_KEY` + real network to reach live success. |

---

## 2. SHA-256 hashes (of the files exactly as staged in this archive)

```
PHASE10C-3E-GEMINI-REAL-EXECUTION-REPORT.md                            01d44c9d9bb0032898046ced0ab530db8e6396b17e61811b54f8ff6cd3b67407
PHASE10C-3E-IMPLEMENTATION-REPORT.md                                   b4d1b83a69ce80e6210b5db072fd34ea0aacc2d3a83c7486fedb7a7a98ea40bd
core/living/providers/gemini-cloud-provider-bootstrap.js               ddd41a30fdc4ee4553fd093b15f8c6e9d9e44d2952ea601fa6fafe4854ab74fb
core/living/providers/gemini-cloud-provider.js                         891abf7d4cc670f4d6d6aae473fdf872b9f80d9e061cdf80e43b8a3e4ba2cb1e
core/living/tests/gemini-cloud-provider-bootstrap.test.js              cb21ad2bdfd18c326bd4d11ffdb9525e3d03cee908b3026516daf228d5c38d84
core/living/tests/gemini-cloud-provider.test.js                        8e9c5d89fc8b49d982449f934ee6f7212a93aff6d1db68dbc2d133e6a6b94ebb
dashboard.html                                                         500bef90aa1f5a4fa245ae3cf6891f030e8c91174c7caab34de7c7126086e5e8
index.html                                                             79faab7d8e96ac8c106d94fe301f66fc7d691cc45dc05f0d7377004fca438971
server/ai/gemini-runtime-harness-server.js                             2d86c9904494eee3eb8ade7424bf8ab1003f7727b4ea060a234e24e6d8bdaec0
server/ai/test/gemini-runtime-harness-server.test.js                   aca82904e7e04712ff0e8918e2e6693d8b44f19f031c2e59c4637f77d7fb44df
tools/termux/gemini-browser-runtime-probe.js                           15aedb1e51d374564804069a1eb97bdbd0207016ec537704ac91798323bde4ed
tools/termux/gemini-real-execution-probe.js                            cbfbc12a6d446216d9130a4880cc3acd10978a120e7a1bba30dc23f1a3df7c83
tools/termux/tests/gemini-real-execution-probe.test.js                 2ed9346c68be30851c406612e0ea3b270de0f33b3694e629faa0e81122c05c76
```

These 13 hashes were independently recomputed at ZIP-build time and matched exactly
against the values already recorded in `PHASE10C-3E-IMPLEMENTATION-REPORT.md` — no
drift between what the report claims and what this archive contains.

### Protected files — NOT included in this patch (unchanged from 10C-3D, re-verified at checkpoint time)
```
core/config.js                                   847b7715cb1d9c8b9b58b8bf4d0e6ee3480a79197b85e32642a72a84b529aad6
core/living/cozy-living-ai.js                    bd6033adefc43c3b91295ff4f7ff242319b743cd38e657597832ff6cf9838bb6
core/modules/cognitive/cognitive-coordinator.js  5855511b405d50adf05987513faea23ac342c5ed156f5d0042fd5e7eaf5f532e
core/modules/thinking/cozy-thinking.js           34a4999b22f66fa38a84b9dbfcc9734d9199666e018edfd0e5d00c2a0e56322c
core/ai/cozy-ai-platform.js                      07a1bc97ca5eb8171fd15734f0c2fcb2a23d7a317a706f6d7ab8cb1d9bb9abce
server/auth/google-login-endpoint.js             266c8b374f5596c08b2a759e6a6868682ecc3cbd7fe14d9a56260d633bcc52d2
server/ai/gemini-backend-endpoint.js             c07371a9f83df189654cf65eeb374c016e59bb911148834e763d7d4a2bf03348
```
Not shipped in this patch because they are byte-identical to the 10C-3D baseline —
nothing to overwrite. Included here only as a checksum reference for whoever applies
this patch, so the baseline can be re-verified before/after applying it.

---

## 3. Test evidence — 48/48, re-run at checkpoint time (no code changes since)

```
node server/ai/test/gemini-backend-endpoint.test.js           → 13 passed, 0 failed
node core/living/tests/gemini-cloud-provider.test.js          → 13 passed, 0 failed
node core/living/tests/gemini-cloud-provider-bootstrap.test.js → 10 passed, 0 failed
node server/ai/test/gemini-runtime-harness-server.test.js     →  8 passed, 0 failed
node tools/termux/tests/gemini-real-execution-probe.test.js   →  4 passed, 0 failed
-----------------------------------------------------------------------------
TOTAL                                                          → 48 passed, 0 failed
```

---

## 4. Browser verification evidence

Executed `tools/termux/gemini-browser-runtime-probe.js` against real Chromium
(version 141.0.7390.37, binary at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`),
loading the real, unmodified `index.html` via the real
`gemini-runtime-harness-server.js`. Verified in the real browser DOM/runtime:

| Check | Result |
|---|---|
| `window.CozyOS.LivingAI` exists | ✅ true |
| `gemini-api` registered via the real production bootstrap | ✅ true (present in `listProviders()`) |
| `LivingAI.setActiveProvider("gemini-api")` (existing public API) | ✅ `{success:true}`, active provider became `gemini-api` |
| `LivingAI.think(...)` issues a real `fetch('/ai/gemini')` from the real browser | ✅ confirmed (503 visible in real console network log) |
| Live Gemini API response | ❌ Not reached — this sandbox has no `GEMINI_API_KEY` / no outbound network. Honestly reported as `PROVIDER_NOT_CONFIGURED`, not faked. |

One disclosed nuance, not glossed over: the default active provider *at rest*, after
the full page finishes loading every script, is `rule-based-conversational`, not
`reasoning-pipeline` — caused by a separate, pre-existing, already-disclosed feature
(RP-026/027) that self-activates independently of anything in this phase. Confirmed
this phase's own bootstrap never calls `setActiveProvider` (source inspection + tests
+ the browser probe itself, which shows registering `gemini-api` never altered
whatever was already active). Full detail in `PHASE10C-3E-IMPLEMENTATION-REPORT.md`.

Full raw JSON output of the probe run is reproduced verbatim in
`PHASE10C-3E-IMPLEMENTATION-REPORT.md` under "Real-browser evidence."

---

## 5. Limitations & missing dependencies

- No `GEMINI_API_KEY` and no outbound network in this sandbox (egress allowlist blocks
  all hosts, not just Gemini's — confirmed by probing an unrelated control host too).
  A genuine live Gemini API response has still never been observed from this
  environment.
- `gemini-runtime-harness-server.js` is a dev/verification harness only: no HTTPS, no
  auth, no rate limiting beyond what the real backend already enforces. Not a
  deployment artifact.
- No UI control exists yet for an end user to switch to `gemini-api` themselves — this
  phase's mandate was registration + routing, not a provider-switcher UI.
- `rule-based-conversational-provider.js`'s self-activation (pre-existing, unrelated)
  means Gemini is registered but not the default active provider in a real user
  session — that is by design for this phase, not a defect.

---

## 6. EXACT NEXT BUILD MUST START WITH

**PHASE 10C-3F** — on the physical Android/Termux device, with real network and a real
`GEMINI_API_KEY` exported into the shell environment (never committed):

```
npx playwright install chromium   # if no chromium binary is already resolvable
export GEMINI_API_KEY="<a real key>"
node tools/termux/gemini-browser-runtime-probe.js
```

Capture the exact printed JSON verbatim into that phase's report. Only if `thinkResult`
shows `"success": true` with `"isReal": true` and a real model id/latency does the
project get to claim a live, browser-driven Gemini response. If it fails, capture the
exact `reason` honestly and treat that as the new, real dependency boundary. Do not add
a provider-switcher UI, do not touch `rule-based-conversational-provider.js`, and do not
attempt any further phase until this one real end-to-end browser call has been proven
or its real failure reason captured from that device.

---

*No implementation changes were made after this checkpoint's test/hash verification
pass. This manifest and its hash table were generated directly from the same files
included in this archive — see verification step in the accompanying checkpoint
creation log.*
