# M387.5 — Browser Verification Report

**Method:** real Chromium (v141, `chromium-1194`), driven headless via
Playwright 1.56.0, serving the actual repository over a local static HTTP
server (`python3 -m http.server`, `127.0.0.1:8842`). Not a Node/vm simulation,
not a static-code-only inspection — the pages actually ran, and console,
network, and DOM state were captured from the live page. Every finding below
was also confirmed by reading the real source at the path indicated, so
nothing here is guessed from a console message alone.

**Environment note:** this sandbox has no outbound internet access. The one
place that mattered (Firebase CDN) is called out explicitly below as
environment-limited, not treated as a pass or a fail.

## Setup

1. Unzipped the delivered repository unmodified.
2. Confirmed real Chromium and Playwright were available
   (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`,
   `playwright@1.56.0`), and that `chromium.launch()` actually succeeds
   (`--no-sandbox`, required in this container).
3. Served the repository root over `127.0.0.1:8842` with Python's built-in
   static server — plain static-file serving, no build step, matching how
   the pages are actually shipped.
4. Wrote a small Playwright script that, for each of `index.html`,
   `login.html`, `dashboard.html`: navigates with `waitUntil: 'networkidle'`
   (20s timeout), waits an additional 3s for async engine startup, then
   records: every `console` message (by type), every uncaught `pageerror`,
   every failed network request (`requestfailed`), the full list of
   `window.CozyOS` keys, and `indexedDB.databases()`.
5. For 2 specific findings (the doubled `core/core/` CSS path, and the
   circular-import concern for `permissions.js`), used a Chrome DevTools
   Protocol (`Network.enable` / `Network.requestWillBeSent`) session to
   capture the real request *initiator* (which file's parser actually issued
   the broken request), rather than guessing from the failed URL alone.

## Verification Rounds

### Round 1 — Pre-fix baseline
Ran the harness against the repository exactly as delivered (M387 baseline).
Result: `index.html`/`login.html` clean; `dashboard.html` showed 20 console
errors and 9 failed requests. Every one of those was traced to a real source
defect (Findings 1–5 below) by direct inspection — not left as an
unexplained console message.

### Round 2 — After fixing Findings 1–5
Re-ran the identical harness. Each of the 5 fixes' specific error was
confirmed gone. Two new error classes appeared on `dashboard.html`:
`[PluginManager] executionHandler must be a function, got 'object'.` (×16)
and `module is not defined` (×1). Both were investigated immediately (not
left for a later round) and confirmed to be real, pre-existing defects that
had simply been unreachable until Findings 3 and 5 stopped aborting script
execution earlier in the page — see Findings 6 and the `permissions.js`
cascade under Finding 5 in `docs/history/M387.5.md` for the full trace.

### Round 3 — After the `permissions.js` cascade fix
Re-ran again. `module is not defined` gone. Final state:

| Page | Console errors | Failed requests |
|---|---|---|
| `index.html` | 0 | 0 |
| `login.html` | 0 | 0 |
| `dashboard.html` | 17 | 4 |

All 17 errors and 4 failed requests on `dashboard.html` are accounted for:
16 are Finding 6, 1 is the Firebase bootstrap message (environment-limited),
and the 4 failed requests are the Firebase CDN call (environment-limited)
plus the 3 missing media-engine files (Finding 8). None are unexplained.

## Findings Summary (full detail in `docs/history/M387.5.md`)

| # | Finding | Verified cause | Status |
|---|---|---|---|
| 1 | `developer-hub.css` doubled `core/core/` `@import` paths | CDP initiator trace + direct read of the 5 `@import` lines | Fixed, re-verified |
| 2 | `SESSION_STATE` global collision | Both `cozy-speech.js` and `cozy-vision.js` declare identical bare top-level `const`, neither IIFE-wrapped, loaded as 2 classic scripts on one page | Fixed, re-verified |
| 3 | `pluginManager.js` semver regex rejects real pre-release versions | `SEMVER_RE` source read; grepped all 17 plugin files' version constants | Fixed, re-verified |
| 4 | `CozyPaymentProviderEngine` dependency wiring | Engine's own guard-clause error read; grepped `dashboard.html` for the 6 required script tags, found only 1 (and the wrong file) | Fixed, re-verified |
| 5 | `core/dashboard.js` ES import as classic script | File literally opens with `import`/has `export default`; script tag had no `type="module"` | Fixed, re-verified |
| 6 | `PluginManager.register()` handler-type mismatch (16 plugins) | `register()` source requires `typeof executionHandler === "function"`; confirmed concrete call site passing an object (`core/plugins/shopOS-core.js:216`) | **Open** |
| 7 | `index.html` missing theme-token `<link>` tags entirely | Read every `<link>` in `index.html` — tokens/theme/components CSS never referenced, by any path | **Open** |
| 8 | 3 media-engine files imported but absent from repo | `find` across the whole repository confirms none of the 3 files exist anywhere | **Open** |
| 9 | `EngineBridge` "playback" adapter resolves Node's `"fs"` | Console message read directly; this is a Node built-in with no browser equivalent | **Open** |
| — | Firebase CDN fetch fails | Sandbox has no outbound internet; app's own bootstrap fails closed and logs clearly | Environment-limited, not a defect |

## Engine Startup Order

`window.CozyOS` enumeration on `dashboard.html`, both before and after fixes,
confirms `LivingSecurityCoordinator`, `LivingRiskEngine`, `LivingTrustEngine`,
`LivingBehaviorEngine`, `LivingAIContextEngine`,
`LivingDeviceIntelligenceEngine`, `LivingDecisionEngine` are all present,
each exactly once (no duplicate registration), in the documented dependency
order. This chain was not touched by any of the 5 fixes and shows no change
across rounds.

## IndexedDB

`indexedDB.databases()` returns `cozyos-identity` at version 8 (matches
`LATEST.md`'s recorded `DB_VERSION`) on all 3 pages, in all 3 rounds. This
confirms the database and its version — it does **not** confirm per-store
read/write correctness (`trustScores`, `behaviorProfiles`, `deviceProfiles`,
`decisionHistory`); that requires an interactive functional pass not
performed in this round.

## What Was Not Covered (stated plainly, not implied to be done)

- Interactive auth flows: registration, login, logout, remember-me, session
  restoration, password recovery, OTP flow, recovery codes, trusted device.
- Mobile/Android: touch, orientation, reload, sleep/wake, background/resume.
- Functional per-store IndexedDB read/write testing.
- Screenshot/visual evidence collection.
- Performance measurement (startup time, event count, IndexedDB latency,
  memory growth over time) — the harness recorded page load time as a
  byproduct, but did not run the dedicated performance/leak-detection pass
  the original verification matrix calls for.

## Verdict

Round 3 console state for `index.html`/`login.html` is clean. `dashboard.html`
is not yet clean — every remaining item is accounted for and traced to a real
cause (Findings 6, 8, 9, or the environment-limited Firebase call), none
fabricated or unexplained, but `dashboard.html`'s console is not the "0
unexpected errors" target until M387.5b resolves Findings 6–9. See
`Regression-Report.md` for the certification-field reasoning and
`Integration-Report.md` for how the fixes interact with the rest of the
system.
