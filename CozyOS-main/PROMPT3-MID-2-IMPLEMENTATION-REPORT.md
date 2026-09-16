# CozyOS Dashboard — Prompt 3, Middle Checkpoint 2 (PROMPT3-MID-2)
## Application Registry Reconciliation — Consumer Map

Baseline: COS-DASHBOARD-PROMPT3-MID-1.zip
PROMPT 3 STATUS: IN PROGRESS (mapping/decision deliverable — no production code changed this checkpoint)

## MISSION RESULT

Repository-wide search (not limited to the dashboard) confirms: **both registries are real, live, and currently load-bearing for different responsibilities.** Neither is dead code. Neither should be deleted or merged this milestone.

## REGISTRY CONSUMER MAP

```
core/registry/cozy-registry.js  (window.CozyOS.ServiceRegistry)
    registerApplication() / getApplication() / listApplications() /
    hasApplication() / unregisterApplication()
        ↓
    PRODUCTION callers (apps self-announcing at load time):
        ChurchOS      (core/plugins/churchOS-core.js)
        ShopOS        (core/plugins/shopOS-core.js)
        MpesaOS       (core/plugins/mpesaOS-engine.js)
        WholesaleOS   (core/plugins/wholesaleOS-core.js)
        QuarryOS      (core/modules/QuarryOS/quarry-index.js)
        + internal platform apps (media intelligence, authenticator,
          live-session, live-camera-capture, live-connectivity)
        ↓
    PRODUCTION readers:
        core/platform/application-visibility.js
            → listVisibleApplications() (dashboard truth)
            → getRealLaunchPath() (MID-1 fix — reads entryPoint)
        core/shell/cozy-workspace.js (Admin Application Center listing)
        core/platform/platform-operations.js → unregisterApplication()
          (admin app-removal lifecycle)
        core/registry/certification-registry-bridge.js,
        core/platform/manifest-registry.js (cross-reference only)

core/modules/module-registry.js  (window.CozyOS.ModuleRegistry)
    register() / validate() / get() / resolve() / has() / remove() / list()
        ↓
    PRODUCTION entries (only 4, self-admittedly incomplete):
        developer-hub, shopos, quarryos, quarry_manager_001, mpesaos
        (ChurchOS/WholesaleOS: no entry — confirmed, matches their real
         lack of an Admin-Workspace in-page-mount capability)
        ↓
    PRODUCTION readers (Administrator/Developer Workspace side ONLY):
        core/shell/application-launcher.js
            → open()'s fragment-fetch-and-mount fallback (Mode 2),
              called ONLY from core/shell/cozy-workspace.js — never
              from core/shell/user-dashboard.js (confirmed: zero
              references to ApplicationLauncher in user-dashboard.js)
        core/platform/platform-operations.js
            → unloadModule() / reRegisterModule() / reloadModule() /
              validateModuleManifest() / refreshModuleMetadata() —
              the admin "module lifecycle" (hot reload/unload/validate)
              toolset; a genuinely distinct operation set from the
              "application:*" methods in the same file, which target
              ServiceRegistry instead
        core/shell/platform-discovery.js, core/platform/audit-engine.js
            → reconciliation/diagnostics reads (list())
        core/modules/builder/ownership-scanner.js → get()
        core/shell/dashboard-data-provider.js
            → getApplicationCards(), loaded only by dashboard.html
              (the Administration Workspace — confirmed via
              user-dashboard.js's own comment identifying dashboard.html
              as the Admin Workspace target)
        core/living/living-runtime.js → exposes .modules passthrough
```

## ANSWERS TO THE REQUIRED QUESTIONS

**A. Is `cozy-registry.js` responsible for:** application registration (yes — `registerApplication()`), application metadata (yes), entry points (yes — `entryPoint` field, used by MID-1's `getRealLaunchPath()`), service/coordinator registration (yes, separately — `registerCoordinator()`), runtime discovery (yes, this is what `application-visibility.js` calls), launchability determination (indirectly — supplies the data, doesn't decide access).

**B. Is `module-registry.js` responsible for:** application registration (yes, but only 4-5 apps, and its own header's list of what's registered is stale/wrong), module metadata (yes — version, manifest paths), developer/admin modules (yes — this is its real, current role), boot modules (not directly), documentation (no), legacy compatibility (partially — see below), testing (no production testing role, but is exercised by `application-visibility.test.js`'s "no fabricated ChurchOS entry" regression test).

## OVERLAP — CONCRETE, VERIFIED

ShopOS, MpesaOS, and QuarryOS are registered in **both** registries independently, and the two copies have already drifted:

- **MpesaOS version mismatch:** ServiceRegistry has `version: "2.1.0"`; ModuleRegistry has `version: "1.0.0"` — stale, never updated when MpesaOS's real registration was bumped.
- **QuarryOS double-registered within ModuleRegistry itself**, under two different ids (`quarryos` and `quarry_manager_001`) — the second one matches QuarryOS's real ServiceRegistry id; the first appears to be an orphaned earlier attempt.

This drift is evidence *for* the risk the reconciliation mission asked about — not yet causing a user-visible bug (each consumer only reads its own registry), but a real correctness hazard if either registry's copy is trusted assuming the other agrees with it.

## DISTINCT RESPONSIBILITIES — WHY NEITHER CAN BE DELETED THIS MILESTONE

- **ServiceRegistry** = "does this application exist, and what's its real static entry point" — the End User Dashboard's entire Apps-tab truth (visibility + launchability) depends on it exclusively.
- **ModuleRegistry** = "is this module's manifest valid, and can the Administrator Workspace hot-install/reload/unload/in-page-mount it" — `platform-operations.js`'s real module-lifecycle admin tooling and `application-launcher.js`'s in-page mount path (Admin Workspace only) depend on it exclusively. `validate()`/`freeze()`/`remove()` have no ServiceRegistry equivalent at all.

Deleting either today would break real, currently-working functionality on its respective side (End User Dashboard vs. Administrator Workspace).

## APPLICATION REGISTRY FINDING (required format)

```
Canonical production registry:
    ServiceRegistry (cozy-registry.js) — for application existence,
    visibility, and static-entry-point launchability (End User Dashboard
    + Admin Application Center listing).

Legacy/secondary registry:
    ModuleRegistry (module-registry.js) — NOT legacy in the sense of
    "unused." Live, real, and exclusively serves Administrator/Developer
    Workspace module-lifecycle operations (validate/register/reload/
    unload) and in-page component mounting for apps opened from the
    Admin Workspace. Its own header's self-description ("The Single
    Source of Truth for CozyOS application discovery") IS misleading —
    that framing overstates its role and duplicates ServiceRegistry's
    actual job — but the file itself is not dead.

Consumers of canonical registry:
    ChurchOS, ShopOS, MpesaOS, WholesaleOS, QuarryOS (registration);
    application-visibility.js, cozy-workspace.js, platform-operations.js
    (reads)

Consumers of secondary registry:
    application-launcher.js (Admin-Workspace-only in-page mount),
    platform-operations.js (module lifecycle ops), platform-discovery.js,
    audit-engine.js, dashboard-data-provider.js (Admin dashboard.html
    only), ownership-scanner.js, living-runtime.js

Overlap:
    ShopOS/MpesaOS/QuarryOS registered in both, independently, with
    confirmed drift (MpesaOS version mismatch; QuarryOS double-entry
    within ModuleRegistry). ChurchOS/WholesaleOS correctly absent from
    ModuleRegistry (no Admin in-page-mount capability built for them).

Distinct responsibilities:
    ServiceRegistry = application existence/visibility/entry-point.
    ModuleRegistry = admin module manifest validation + lifecycle +
    in-page mount fallback. Real, separate, both load-bearing.

Migration required:
    NOT THIS MILESTONE. No user-facing bug currently results from the
    coexistence (each real consumer reads only its own registry; MID-1
    confirmed the End User Dashboard path is honest and correct).
    Recommended future work (separate milestone): (1) correct
    module-registry.js's misleading header claim, (2) decide whether
    the 3 double-registered apps should self-register into ModuleRegistry
    directly instead of via a hand-maintained duplicate list, to stop
    further drift.

Deletion safe:
    NO. Both have real, distinct, currently load-bearing production
    consumers on different sides of the platform (End User Dashboard vs.
    Administrator/Developer Workspace).

Reason:
    Verified by direct, repository-wide grep of every API-level call
    site (registerApplication/getApplication/listApplications vs.
    register/validate/get/resolve/remove/list), not by file-path
    mention alone — file-path-only search over-counts (many files just
    `<script src>` both files without calling either API).
```

## STEP 13/14 VERIFICATION — no dashboard files needed changes

Re-confirmed after mapping: `application-visibility.js`, `dashboard-navigation-core.js`, `user-dashboard.js`, `cozy-workspace.js` all already read from their architecturally-correct source (ServiceRegistry for the End User Dashboard path; ModuleRegistry for the Admin Workspace in-page-mount path). No change was architecturally required this checkpoint — MID-1 already fixed the one real defect (hardcoded launch-path list). AI context (`buildAIContext`) already sources application data through `application-visibility.js`, so it inherits the correct registry with no separate change needed.

## FILES CHANGED THIS CHECKPOINT

None (production or test). This checkpoint is a verified mapping/decision deliverable only, per the mission's own instruction not to consolidate or modify either registry without a demonstrated architectural requirement — none was found.

## TESTS

```
core/platform/tests/application-visibility.test.js  : 10/10 passed (unchanged from MID-1)
core/shell/tests/dashboard-navigation-core.test.js  : 43/43 passed (unchanged from MID-1)
```
Re-run to confirm no accidental drift during inspection; nothing modified, so results are identical to MID-1.

## PROTECTED FILES
`core/modules/founder-story/*` — unchanged (hashes verified, matches MID-1 state)
`core/shell/cozy-login-gate.js` — unchanged (hash verified, matches MID-1 state)

## KNOWN LIMITATIONS / UNRESOLVED REGISTRY QUESTIONS
- `module-registry.js`'s header comment still incorrectly claims to be "The Single Source of Truth for CozyOS application discovery" and still lists a stale "HONEST SCOPE" paragraph claiming ChurchOS/QuarryOS aren't registered anywhere — both are now false. Left unedited this checkpoint (a doc-only change, low risk, but explicitly out of scope per "do not modify these files merely for cosmetic consistency" — no functional requirement forced it).
- MpesaOS version drift (2.1.0 in ServiceRegistry vs 1.0.0 in ModuleRegistry) and QuarryOS's duplicate ModuleRegistry entry are both real and unresolved — flagged for a future dedicated cleanup, not fixed here (fixing would touch ModuleRegistry data that has admin-workspace-side consumers; needs its own regression pass).
- No migration/adapter was built — none was justified by evidence this checkpoint.

## NEXT BUILD MUST START WITH
Per the stop condition: registry reconciliation mapping is complete; branding and language reconciliation are next in the prompt's stated dependency order (branding, then language). Recommend starting with **Organization Registry / Branding Metadata** (name/logo/watermark/address/location — smallest additive extension to `core/organization/organization-registry.js`), since that seam is confirmed completely absent (not a mapping task — genuinely missing code) and unblocks per-application-per-organization branding described in the product model.
