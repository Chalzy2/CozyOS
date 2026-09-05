# PHASE 10C-3B5 — STAGE 1: Dependency / Limitations Report

## Environment
- Execution container: fresh, this session. No state carried over from any
  prior phase's container (prior probe scripts hardcoded a path,
  `/home/claude/.npm-global/lib/node_modules/playwright`, from an earlier
  session — that exact path happened to still resolve here because this
  container's global npm prefix is the same, but this is NOT the same
  machine/session as when Phase 10C-3B2 ran).
- Playwright 1.56.0 is globally installed; a Chromium 141 build is
  pre-fetched at `/opt/pw-browsers/chromium-1194`. This allowed a REAL
  browser launch (confirmed by `browser.version()` returning
  `141.0.7390.37`), not a simulated one.
- Network egress in this container is allowlist-based and denies
  arbitrary hosts (HTTP 403, `x-deny-reason: host_not_allowed`). This is
  an environment limitation, not a repository defect.

## Hard external dependency identified
The Prompt API (`window.ai` / `LanguageModel`) is **not a repository
dependency at all** — it is a browser-supplied global, currently shipped
only behind Chrome's Prompt API origin trial / specific Chrome
Canary-or-later builds with on-device model components downloaded. It
cannot be `npm install`-ed, vendored, or polyfilled into a real
implementation; a polyfill would only ever be a test double, which Stage
1's rules explicitly forbid calling "real."

## What would need to be true for Outcome A/C instead of B
1. A browser build that actually ships the flag/API (e.g. a
   real Chrome Canary/Dev channel enrolled in the origin trial), AND
2. Network egress to Google's model-component CDN so the on-device model
   itself can download, AND
3. Sufficient local disk/compute for the on-device model.

None of these are repository-fixable. All three are container/host
environment properties. This confirms OUTCOME B per the implementation
report: no code gap, an environment gap.

## NOT VERIFIED / BLOCKED items
- Whether a *non-headless* real desktop Chrome/Chrome Canary on a
  developer's actual machine (outside this sandbox) would expose the API
  — NOT VERIFIED here; this container cannot represent that case.
- Whether Android WebView on a real device would expose it — NOT
  VERIFIED; no Android runtime exists in this repository or container.
