# CozyOS Dashboard — Prompt 3, Middle Checkpoint 1 (PROMPT3-MID-1)

Baseline: COS-DASHBOARD-PROMPT2-MID-5.zip
PROMPT 3 STATUS: IN PROGRESS

## STEP 1 — Application registry reconciliation (inspection + one verified fix)

### Inspection findings (source-verified, not assumed)

1. **Two real, live application registries exist, serving different purposes — not a simple duplicate to delete:**
   - `core/registry/cozy-registry.js` (`window.CozyOS.ServiceRegistry`) — the metadata catalog. ChurchOS, ShopOS, MPesaOS, WholesaleOS, QuarryOS all call `registerApplication()` here. `application-visibility.js` (the dashboard's real data source) reads exclusively from this registry.
   - `core/modules/module-registry.js` (`window.CozyOS.ModuleRegistry`) — actively consumed elsewhere (bootstrap.js, application-launcher.js, cozy-workspace.js, dashboard-data-provider.js, platform-discovery.js, module-loading-manager.js, usage-engine.js, audit-engine.js). Only registers `developer-hub`, `shopos`, `quarryos`/`quarry_manager_001`, `mpesaos`. Its own header comment claims ChurchOS/QuarryOS have "neither real coordinators nor real UI" — that line is now stale (QuarryOS registers for real via ServiceRegistry) but the registry itself is genuinely still in use, not dead code. **Not touched this session** — determining a safe consolidation/migration path is a larger, separate piece of work than this checkpoint's scope.

2. **Verified, concrete bug found and fixed:** `ApplicationVisibility.getRealLaunchPath(appId)` — the single function both the User Dashboard and Administrator Application Center call to decide whether an "Open" button is enabled — was a hardcoded 2-entry object literal (`{shopos, quarry_manager_001}`), with a comment claiming MpesaOS was "intentionally absent (honestly 'Development' status)". That claim did not match the repository:
   - `mpesaOS-engine.js` already registers a real `entryPoint: "applications/MpesaOS/index.html"` with ServiceRegistry.
   - `applications/MpesaOS/index.html` genuinely exists on disk.
   - So MpesaOS was silently un-launchable from the dashboard for a reason the code's own comment misdescribed as deliberate.

   This is exactly the `const apps = [...]` hardcoding anti-pattern the product brief explicitly forbids, sitting one layer below the dashboard UI itself (the UI code was already honest — it correctly disables "Open" and shows "Not yet launchable" whenever this function returns null; the dishonesty was in what fed it).

### Fix implemented

`getRealLaunchPath()` now reads the live `ServiceRegistry.getApplication(appId).entryPoint` field instead of a hardcoded map. Composes existing data — no new registry, no new field, no change to any application's registration call. Any application that self-registers a real `entryPoint` (present or future) becomes launchable with no dashboard file edit. ChurchOS and WholesaleOS correctly still return `null` — they have never set a real `entryPoint`, so "not yet launchable" remains true and honest for them.

### Files changed
- `core/platform/application-visibility.js` — `getRealLaunchPath()` rewritten; comment corrected.
- `core/platform/tests/application-visibility.test.js` — 3 new tests added (dynamic entryPoint read, honest null for no-entryPoint app, honest null for unregistered id). No existing test modified or weakened.

### SHA-256 (changed files, post-fix)
```
221ecb1ae6243cd78b07060bb6d02f769d827dbea1fa13df62c22dde50be12a0  core/platform/application-visibility.js
15cf3f8880168572a8d0740410b61644e26a057ac4070c6ef7cd5d04e1d81d98  core/platform/tests/application-visibility.test.js
```

### Tests
```
core/platform/tests/application-visibility.test.js  : 10/10 passed (7 baseline unchanged, 3 new)
core/shell/tests/dashboard-navigation-core.test.js  : 43/43 passed (full regression, unmodified)
```
Both suites re-run against the post-fix state; no test weakened to obtain a pass.

### Fresh extraction verification
Not yet performed in this environment (no zip built for this checkpoint until confirmed). Will `unzip -t`, extract clean, and re-run both suites before calling this checkpoint final.

## ORGANIZATIONS
multi-tenant support = not touched this session (no code change)
branding seam = confirmed absent in `organization-registry.js` (no logo/watermark/address/location fields) — inspected only, not built yet
organization isolation = not touched this session

## ROLES
platform admin = unchanged
ChurchOS roles = confirmed: ChurchOS has no hardcoded role list; roles are created via the generic `organization-registry.js`/`organization-role.js`, enforced by `IdentityEngine` — inspection only, no code change this session
application-scoped roles = not touched this session
cross-app isolation = not touched this session (43/43 existing dashboard-navigation-core tests re-confirm no regression, including the existing "application-specific role never becomes platform-admin authority" test)

## LANGUAGES
17 default = confirmed NOT resolved by the live `cozy-language-registry.js` resolver today (that resolver has 5 default + 6 extended = 11). A separate `cozy-language-pack-registry.js` genuinely has 17 default language-pack identities at a different layer. Reconciling these two real systems is scoped as its own future step — not attempted this session; no number was faked anywhere.
extended languages = unchanged
fallback = unchanged

## COZY AI
dashboard context = unchanged this session (Prompt 2's buildAIContext/explainSurface untouched; regression-confirmed via dashboard-navigation-core.test.js)
application awareness = unchanged
organization awareness = not yet built (no organization/application relationship exists to be aware of)
language awareness = unchanged
community awareness = unchanged

## SECURITY
authority boundaries = unchanged; regression tests confirm no admin-authority leak was introduced
tested attacks = none new this session (no new attack surface introduced by a read-only registry lookup change)

## TESTS
new = 3/3
regression = 50/50 (10 + 43, combined across both affected suites)
fresh extraction = NOT YET PERFORMED (pending checkpoint packaging confirmation)

## BROWSER/DEVICE
NOT VERIFIED — this is a Node-testable engine change only; no browser/device testing was performed or claimed.

## PROTECTED FILES
`core/modules/founder-story/*` — unchanged
`core/shell/cozy-login-gate.js` — unchanged

## KNOWN LIMITATIONS
- `module-registry.js` vs `cozy-registry.js` duplication is real and documented above but not consolidated — needs its own dedicated pass (many real consumers on both sides).
- ChurchOS/WholesaleOS remain genuinely not-launchable (correctly so) — no entryPoint exists for them; building that (real Setup Wizard / real HTML entry) is separate, larger work, not a registry-visibility fix.
- Organization branding seam (logo/watermark/address/location) does not exist yet — confirmed absent, not built.
- 17-language reconciliation not attempted — two real registries at different layers, not yet connected.
- ChurchOS role hierarchy intentionally NOT hardcoded per repository design (organization-defined roles) — correctly left alone, not a limitation to fix.

## NEXT BUILD MUST START WITH
Pick ONE of the following (do not combine in one session):
(a) `module-registry.js` / `cozy-registry.js` consolidation: map every real consumer of `ModuleRegistry` (bootstrap.js, application-launcher.js, cozy-workspace.js, dashboard-data-provider.js, platform-discovery.js, module-loading-manager.js, usage-engine.js, audit-engine.js) before proposing any change; or
(b) Organization branding metadata seam: smallest additive extension to `organization-registry.js` for name/logo/watermark/address/location, reusable across ChurchOS/MPesaOS/ShopOS/WholesaleOS, with tests; or
(c) 17-language / language-pack-registry reconciliation: map `cozy-language-registry.js` resolver against `cozy-language-pack-registry.js`'s 17 identities before writing any resolver code.
