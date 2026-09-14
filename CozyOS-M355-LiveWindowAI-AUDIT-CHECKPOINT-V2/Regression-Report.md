# M387.5 — Regression Report

Per the repository's own Regression Rules, every discovered issue below
includes Cause, Evidence, Fix (or explicit non-fix), and Regression
verification. This report also carries the certification-field reasoning
requested for this round.

## Regression Registry Note

This repository's `docs/builder/knowledge/regression-registry.md` is defined
as tracking cases where something that **previously worked** broke because of
a change. Findings 1–5 below are closer to "M387.5 uncovered and fixed
pre-existing defects" than "something regressed" in that strict sense — the
5 fixes themselves introduced 0 new failures (confirmed by re-running the
identical harness after each). Findings 6–9 are the same: real, pre-existing,
simply unreachable until Findings 3/5 stopped aborting execution earlier.
None of the 9 findings meet the registry's own definition of a regression
(nothing that worked started failing because of this pass's changes), so no
`RG-NNN` entry is opened here. This is stated explicitly rather than silently
skipped, so the next Builder can confirm or challenge that reading rather
than wondering why RG is still empty after a pass that found 9 issues.

## Per-Finding Regression Verification

### Finding 1 — `developer-hub.css` doubled path
- **Cause:** `@import url("../../core/ui/cozy-tokens.css")` from a file at
  `core/modules/developer/`, where 2 `../` already reaches `core/`.
- **Evidence:** CDP initiator trace, Round 1: all 5 broken CSS requests
  attributed to this exact file.
- **Fix:** removed the extra `core/` from all 5 `@import` lines.
- **Regression verification:** Round 2 and Round 3 both show 0 requests to
  any `core/core/...` path, and 0 "Theme ... rejected" warnings on
  `dashboard.html`. No new CSS-loading errors appeared anywhere.

### Finding 2 — `SESSION_STATE` collision
- **Cause:** identical bare top-level `const SESSION_STATE` in
  `cozy-speech.js` and `cozy-vision.js`, both loaded as classic scripts,
  neither IIFE-wrapped.
- **Evidence:** `SyntaxError: Identifier 'SESSION_STATE' has already been
  declared` in Round 1.
- **Fix:** wrapped both files' entire bodies in `(function () { ... })();`.
- **Regression verification:** Round 2 and 3 show 0 "already been declared"
  errors. Confirmed both engines still register their public globals
  (`window.CozyOS` enumeration includes the same entries as before the fix).

### Finding 3 — `pluginManager.js` semver rejection
- **Cause:** `SEMVER_RE = /^\d+\.\d+\.\d+$/` rejected the real semver
  pre-release suffix used by 17 plugin files (`X.Y.Z-ENTERPRISE`).
- **Evidence:** 17 repeated `[PluginManager] Invalid manifest.version` errors
  in Round 1.
- **Fix:** widened the regex to `/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/`, and
  updated `_compareVersions()` to strip the `-suffix` before splitting on
  `.` and calling `Number()` on each part.
- **Why the second change was necessary:** the strict regex's own comment
  (`[R-2] Strict semver — prevents NaN bypass in _compareVersions`) shows it
  existed specifically to stop `Number("0-ENTERPRISE")` (`NaN`) from breaking
  version comparisons. Widening the regex alone, without fixing
  `_compareVersions()`, would have silently reintroduced that exact bug under
  a new trigger.
- **Regression verification:** Round 2 and 3 show 0 "Invalid manifest.version"
  errors. This fix is also the direct cause of Finding 6 becoming visible —
  documented as a discovery, not hidden as a side effect.

### Finding 4 — `CozyPaymentProviderEngine` dependency wiring
- **Cause:** only 1 of the 6 required internal modules
  (`window.CozyOS.__PaymentProviderInternals.*`) was loaded in
  `dashboard.html`, and that 1 was actually the wrong file
  (`core/shell/provider-manager.js` instead of
  `core/modules/payment-provider/provider-manager.js`).
- **Evidence:** the engine's own guard-clause error in Round 1: `"Required
  internal modules are not loaded. Load provider-registry.js,
  provider-manager.js, health-monitor.js, routing-engine.js,
  failover-engine.js, and capability-engine.js before this file."`
- **Fix:** added the correct 6 script tags before the engine's own tag.
  Confirmed by reading all 6 files that none depend on each other, so this
  is a safe, order-independent addition.
- **Regression verification:** Round 2 and 3 show 0 "Required internal
  modules are not loaded" errors. `core/shell/provider-manager.js` (the
  pre-existing, unrelated tag) was left untouched and still loads.

### Finding 5 — `core/dashboard.js` ES import + `permissions.js` cascade
- **Cause:** `core/dashboard.js` has a real `import`/`export default` but no
  `type="module"` on its script tag.
- **Evidence:** `Uncaught SyntaxError: Cannot use import statement outside a
  module` in Round 1, aborting the entire file.
- **Fix:** added `type="module"`.
- **Regression check that caught a second issue:** after this fix, Round 2
  showed a *new* error: `ReferenceError: module is not defined`. Investigated
  immediately rather than assumed benign — traced to a dead
  `window.CozyOS.Permissions = module.exports.default;` line at the bottom of
  `core/permissions.js`, referencing a Node-only global that doesn't exist in
  a browser ES module. Confirmed (by grep) zero real consumers of
  `window.CozyOS.Permissions` anywhere in the repo, so removed the 2 dead
  lines.
- **Regression verification:** Round 3 shows 0 "Cannot use import statement"
  errors and 0 "module is not defined" errors.

## Newly Surfaced, Confirmed, Left Open (not fixed this round)

### Finding 6 — `PluginManager.register()` handler-type mismatch
- **Cause:** `register(manifest, executionHandler)` requires
  `typeof executionHandler === "function"` (`[R-4]`); at least 16 plugin
  files call it with an object (the engine instance) instead.
- **Evidence:** 16× `[PluginManager] executionHandler must be a function,
  got 'object'.` in Round 2 and 3; confirmed against `register()`'s own
  source and one concrete call site (`core/plugins/shopOS-core.js:216`).
- **Fix:** none applied — real fix requires changing ~16 separate call
  sites, which is a distinct implementation decision, not a "smallest
  possible fix" for this round.
- **Regression verification:** N/A (not fixed). Confirmed this error is not
  new — it was unreachable in Round 1 only because Finding 3's version check
  threw first, for the exact same 16 plugins, before this line could run.

### Finding 7 — `index.html` missing theme-token links
- **Cause:** `index.html` never links `core/ui/cozy-tokens.css`,
  `core/shell/cozy-theme.css`, or `core/ui/cozy-components.css` — by any
  path, correct or not. Distinct root cause from Finding 1 (which was
  `dashboard.html`-only, via `developer-hub.css`'s `@import` chain).
- **Evidence:** the same class of `CozyTheme` "rejected — missing required
  tokens" warnings persisted on `index.html`, unchanged, in Round 2 and 3.
- **Fix:** none applied — multiple candidate token files exist
  (`core/ui/cozy-tokens.css`, `core/shell/cozy-tokens.css`,
  `core/shell/cozy-theme.css`), and picking one without confirming which is
  authoritative would risk the exact mistake Rule 51 (Missing Dependency
  Resolution) warns against.
- **Regression verification:** N/A (not fixed). Confirmed unchanged across
  all 3 rounds — not made worse or better by this pass's changes.

### Finding 8 — 3 missing media engine files
- **Cause:** `core/engines/media/media-pipeline-manager.js` imports
  `./background-engine.js`, `./codec-encoding-engine.js`, and
  `./codec-decoding-engine.js`; none of the three exist anywhere in the
  repository.
- **Evidence:** 3 failed dynamic-import requests (`net::ERR_ABORTED`) plus
  `[EngineBridge] "media" unavailable: Failed to fetch dynamically imported
  module`, in Round 2 and 3; confirmed absent by `find` across the whole
  repository.
- **Fix:** none applied. Per Rule 51, creating a Builder-owned stub requires
  first exhausting the search for an authoritative implementation, which is
  out of scope for a verification-focused pass.
- **Regression verification:** N/A (not fixed). Recommend opening `MD-004`.

### Finding 9 — `EngineBridge` "playback" adapter uses `"fs"`
- **Cause:** one `EngineBridge` adapter resolves the bare specifier `"fs"`
  (a Node.js built-in) at runtime.
- **Evidence:** `[EngineBridge] "playback" unavailable: Failed to resolve
  module specifier "fs". Relative references must start with either "/",
  "./", or "../".` in Round 2 and 3.
- **Fix:** none applied.
- **Regression verification:** N/A (not fixed). `EngineBridge` itself fails
  this closed already (logs, continues) rather than crashing — that
  fail-closed behavior is not itself a defect; the underlying adapter still
  is.

### Environment-Limited — Firebase CDN
- `https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js` fails (CORS /
  network) because this sandbox has no outbound internet access.
  `[Firebase.Bootstrap]` / `[FirebaseSessionBridge]` both fail closed and log
  clearly — consistent with the documented "no partial success reported as
  success" design. Per instruction, recorded as environment-limited, not a
  repository defect, pending reproduction in a real internet-connected
  browser.

## Certification (Contract-Consistent)

The Continuous Development Contract
(`docs/builder/rules/04-implementation-contract-rule.md`) only defines
`YES`/`NO` for certification fields — it does not currently define a
`PARTIAL` state. Rather than introduce an undefined value, the fields below
are recorded as `NO`, each with the specific reason spelled out, to stay
consistent with the contract as written.

**Recommendation:** formally extend the contract to add a `PARTIAL` state.
"5 of 9 confirmed findings fixed and re-verified, 4 real findings still open"
is a materially different, more informative outcome than "nothing was
verified" — plain `NO` doesn't currently distinguish the two, and future
Builders (and Charles) lose that distinction unless it's spelled out in
prose every time, as done here. Until the contract is formally changed, `NO`
+ explanation is the correct, rule-consistent choice, and that's what this
round uses.

- Implementation Verified: **NO** — Findings 1–5 fixed and individually
  re-verified with 0 regressions traceable to any of them; Findings 6–9 are
  confirmed, real, and still open. Per Rule 12, the chain is not
  "Implementation Verified: YES" while any confirmed defect remains.
- Verification Verified: **NO** — page-load/console/network verification is
  complete, in a real browser, for `index.html`/`login.html`/`dashboard.html`.
  Interactive auth-flow verification and mobile/Android verification have
  not been performed at all.
- Ready for Next Account: **YES** — with **M387.5b** (not M388) as the
  required next phase: resolve Findings 6–9, then complete interactive and
  mobile verification, then re-run this exact harness one more time before
  any certification field moves to YES.

## Verdict

No confirmed regression was introduced by this pass. 5 of 9 confirmed,
real defects are fixed and independently re-verified across two follow-up
browser rounds. 4 real defects remain open and are fully documented with
cause, evidence, and current status rather than left implicit. M388 should
not begin until M387.5b closes Findings 6–9 and completes the interactive
and mobile verification this round did not cover.
