# Level 2 - Application-Specific Expandable Navigation - Checkpoint Report

## Short Audit findings
- No existing "per-application nested navigation items" registry exists
  anywhere (confirmed by search of module-registry.js/cozy-registry.js
  for sections/views/routes/navigationItems fields - none found).
- QuarryOS's own real getManifest().routes IS a genuine, existing
  self-declared list of internal actions, but it lives on the live
  module instance and would require pre-mounting the app just to read
  it - out of proportion for "expand a drawer row."
- The one real, existing, universally-applicable "constituent
  navigation" concept already present for every application, without
  inventing anything, is the canonical launcher's own real lifecycle:
  ApplicationLauncher.open(appId) / close(appId) / isOpen(appId) /
  listOpen() - all confirmed real, already-existing methods.

## Implementation
core/shell/user-dashboard.js's #renderDrawerApps() was extended so each
authorized application row is now a real expand/collapse toggle
(data-drawer-toggle-app, pure local hidden/aria-expanded state - zero
calls into ApplicationLauncher). Expanding reveals a small panel with
two real, existing actions:
- "Open" - the same window.CozyOS.ApplicationLauncher.open(appId) call
  Level 1 already used.
- "Close" - the real, existing ApplicationLauncher.close(appId), shown
  only when ApplicationLauncher.isOpen(appId) genuinely reports true;
  the panel re-renders after both actions so this reflects real,
  current state rather than a stale guess.

No new per-app navigation registry was created. No changes to
core/shell/cozy-workspace.js (confirmed byte-for-byte unchanged),
core/shell/application-launcher.js, IdentityEngine,
ApplicationVisibility, DashboardNavigationCore, or the verified startup
animation/audio sequence (launch-sequence.js/.css confirmed
byte-for-byte unchanged).

## Tests
| Suite | Result |
|---|---|
| user-dashboard-level1-drawer.test.js (11 existing Level 1 tests + 8 new Level 2 tests) | 19/19 pass |
| workspace-shell-platform-admin-handoff.test.js | 7/7 pass |
| identity-routing-real-composition.test.js | 5/5 pass |
| index-html-post-login-routing-wiring.test.js | 6/6 pass |
| launch-sequence-no-replay-after-login.test.js | 4/4 pass |

0 regressions - 41 individual subtests total, all passing.

## Minimum Level-2 verification - all confirmed
- Level-1 drawer still opens/closes (tests 2,3,16).
- Existing Level-1 behavior remains intact (tests 1,4-10 all still pass unmodified).
- Application-specific entries expand (test 13).
- Application-specific entries collapse (test 14).
- Expansion does not reload/recreate the active application (test 13
  asserts zero open()/close() calls from expand alone; test 15 confirms
  Level 1 drawer state is independent of Level 2 expand state).
- Correct authorized nested destinations appear (tests 17, 18).
- Unauthorized nested destinations are not exposed (test 19 - no row,
  no toggle, no Open/Close exist at all for an app not returned by the
  real authorization source).
- ApplicationLauncher.open()/close() remain the sole launch/close
  mechanism (tests 17, 18 - real calls captured with correct appId).
- Administrator Workspace remains unaffected (cozy-workspace.js
  SHA-256 confirmed identical before/after).
- Login/registration/dashboard-routing regression remains clean (7+5+6=18/18 pass).
- Startup animation/audio remains untouched (launch-sequence.js/.css
  SHA-256 confirmed identical before/after).

## Level 2 status: COMPLETE and verified
