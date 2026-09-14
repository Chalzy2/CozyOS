# M387.5 — Integration Report

Scope: how the 5 applied fixes interact with the rest of the M372–M387
Living Engine chain and the wider CozyOS shell, and what the still-open
findings mean for integration going forward. See `Browser-Verification-Report.md`
for the raw browser evidence and `docs/history/M387.5.md` for full
cause/evidence/fix detail per finding.

## Integration Points Touched

### Finding 1 — `developer-hub.css`
Purely a path correction inside one CSS file's own `@import` statements.
Doesn't touch any JS engine, any public API, or any registration order.
Integration effect: `dashboard.html`'s theme system (`CozyTheme`) now
actually receives the token file it depends on, so every theme profile
(`cozyos`, `developer`, `platform-admin`, `shopos`, `quarryos`, `mpesaos`,
`hospitalos`, `schoolos`, `churchos`, `high-contrast`) passes validation
instead of being rejected. This is the only finding that visibly changes
rendered output (theme tokens actually apply now) rather than just console
noise.

### Finding 2 — `SESSION_STATE` collision
Both `cozy-speech.js` and `cozy-vision.js` are now wrapped in an IIFE. This
brings them in line with the documented, near-universal convention ("IIFE
modules register onto a single `window.CozyOS` global namespace" —
`docs/builder/rules/02-architecture-rules.md`) rather than introducing a new
pattern. Confirmed both files' bottom-of-file registration logic
(`window.CozyOS.CozySpeech = ...`, `ServiceRegistry.registerCoordinator(...)`
for Vision) still runs and still exposes the same public surface — the fix
only changes where the internal `const`/`class` declarations live, not what
gets attached to `window`. No other file references `SESSION_STATE` directly
by that exact name from outside either file (confirmed by grep), so there's
no cross-file contract this fix could have broken.

### Finding 3 — `pluginManager.js` semver
This one has the widest blast radius of the 5, because `PluginManager` is a
shared kernel service every plugin registers through — 17 plugin files
across 4 product lines (ShopOS, MpesaOS, WholesaleOS, ChurchOS) all use the
same `X.Y.Z-ENTERPRISE` version convention that the strict regex was
rejecting. Loosening `SEMVER_RE` to accept a standard semver pre-release
suffix, plus fixing `_compareVersions()` to strip that suffix before
comparing, restores compatibility for all 17 without weakening the original
protection (`NaN`-safe comparison) that `SEMVER_RE` existed to provide. This
is the fix that, once applied, let execution reach the *next* validation
step in `register()` for those same 17 plugins — which is exactly how
Finding 6 was discovered. That's expected, healthy integration behavior: one
real gate opening should reveal whatever is behind it, not silently succeed.

### Finding 4 — `CozyPaymentProviderEngine` wiring
Confirmed (by reading all 6 files under `core/modules/payment-provider/`)
that `provider-registry.js`, `provider-manager.js`, `health-monitor.js`,
`routing-engine.js`, `failover-engine.js`, and `capability-engine.js` have no
dependencies on each other — each independently registers its piece onto
`window.CozyOS.__PaymentProviderInternals`. That means the order the 6 new
script tags were added in is not load-bearing; only that all 6 land before
`cozy-payment-provider-engine.js` itself, which they now do. Also confirmed
`core/shell/provider-manager.js` (the file that was already loaded, but is
unrelated to payments) is untouched and still loads for whatever it actually
serves — this fix adds the correct file rather than replacing the existing
one, so nothing that depended on the shell version is affected.

### Finding 5 — `core/dashboard.js` module fix + `permissions.js` cascade
This is the fix with the most indirect, "peel the onion" integration effect
of the 5. Marking `core/dashboard.js` `type="module"` is consistent with an
existing pattern already on the same page
(`core/bridge/engine-bridge-bootstrap.js` is already `type="module"`), so
`dashboard.html` already tolerates a mix of classic and module scripts.
Making the fix correctly forced the browser to actually parse
`core/dashboard.js`'s import target, `core/permissions.js`, as a real ES
module for the first time — which is how the dead `module.exports.default`
line in `permissions.js` was found. That line had **zero** real consumers
anywhere in the repository (confirmed by grep for `CozyOS.Permissions`), so
removing it doesn't change any other file's behavior. One thing worth
flagging for the next Builder: `permissions.js` imports from `audit.js`, and
`audit.js` imports `Permissions` back from `permissions.js` — a real
circular ES-module import. This didn't produce an error in Round 3, but it
wasn't exercised beyond page-load (neither file's exported functions were
actually called during this pass), so this circularity should be kept in
mind, not assumed benign, once interactive flows start calling into either
file.

## What This Round Deliberately Did Not Integrate

Findings 6–9 remain unresolved, so their downstream integration effects are
still live:

- **Finding 6** means every one of the 16 affected plugins (ShopOS, MpesaOS,
  WholesaleOS, ChurchOS) still fails to mount in the browser today, even
  though their manifests now pass validation. Any feature that depends on
  those plugins being registered and callable through `PluginManager` is
  still broken end-to-end, not just "logging an error" — the plugin simply
  never becomes available.
- **Finding 7** means `index.html`'s pre-login screen still renders without
  its intended theme tokens in every browser, not just this sandbox.
- **Finding 8** means `EngineBridge`'s "media" capability is still
  unavailable (it already fails closed, per its own design, so nothing
  crashes — but no code path that expects working media playback/encoding
  will get one).
- **Finding 9** means `EngineBridge`'s "playback" capability is likewise
  still unavailable for the same fail-closed reason.

None of these 4 open items block the Living Engine chain itself
(`LivingSecurityCoordinator` → `LivingDecisionEngine`) — confirmed unchanged
and fully present across all 3 verification rounds — but they do mean
several product-line plugins and two `EngineBridge` capabilities remain
non-functional in a real browser today.

## Recommendation

Treat Finding 6 as the priority for M387.5b: it's the one open item with
real, wide product impact (16 plugins across every industry vertical this
repo ships) rather than a single missing capability or a pre-login styling
gap.
