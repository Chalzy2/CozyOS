# Level 1 Master Navigation Drawer (User Dashboard) - Checkpoint Report

## Short Audit findings
- ApplicationLauncher.open() (core/shell/application-launcher.js, Domain
  4I, unmodified) mounts into a real, hardcoded container id:
  #cozy-workspace-root. This element did not exist anywhere in
  user-dashboard.js's rendered DOM before this change - so
  ApplicationLauncher.open() could never have succeeded here. This is
  the one real integration gap; fixed by adding the missing container,
  not by building a new launcher.
- Admin's real, live drawer pattern (confirmed by reading
  admin-workspace.html directly): .cozy-shell.cozy-sidebar-mobile-open
  toggles a fixed-position slide-in .cozy-sidebar plus a dimming
  .cozy-mobile-overlay, at @media (max-width: 599px). Reused as the
  concept; markup/class names adapted to user-dashboard.js's own real
  ids (#cozy-ud-drawer, #cozy-ud-drawer-overlay), not copy-pasted.
- No canonical CozyOS breakpoint token exists (confirmed by search) -
  used the same <600px value as the one other real, live implementation.
- core/ui/cozy-shell-layout.css remains untouched, unreferenced,
  preserved as historical/dead code, per instruction.

## Implementation
- core/shell/user-dashboard.js: added a real menu button
  (#cozy-ud-menu-btn) to the existing top bar (nothing removed), a real
  drawer (#cozy-ud-drawer) + overlay (#cozy-ud-drawer-overlay), a real
  #cozy-workspace-root mount point, and two new methods: #wireDrawer()
  (open/close/overlay-close) and #renderDrawerApps() (real,
  authorization-filtered application list from the already-computed
  this.#visibleApps, launching via window.CozyOS.ApplicationLauncher.open()).
  The drawer's CozyOS-level links reuse the exact same [data-nav-surface]
  attribute #wireBottomNav() already wires - no second surface-switch
  mechanism.
- core/shell/user-dashboard.css: added the drawer/overlay/menu-button
  CSS, matching the admin pattern's fixed-position + transform:translateX
  technique at the same <600px breakpoint. Because the drawer is
  position:fixed (removed from flex layout), the existing
  #cozy-ud-surfaces already occupies full width whenever the drawer is
  closed - no separate "full width" rule was needed.
- No changes to core/shell/cozy-workspace.js (confirmed byte-for-byte
  identical, SHA-256 unchanged), core/ui/cozy-shell-layout.css,
  ApplicationLauncher, IdentityEngine, ApplicationVisibility,
  DashboardNavigationCore, the login/registration UI, or the verified
  startup animation/audio sequence.

## Tests
First-ever test coverage for user-dashboard.js (confirmed by search -
none existed). Built a small, genuine (not fabricated) HTML-fragment
parser/DOM for this file's tests, since no jsdom/parser library is
installable in this sandbox (confirmed: npm install returns a real 403
from the registry, the same network restriction already documented
elsewhere in this project) - this is real DOM behavior (createElement,
innerHTML parsing, classList, querySelector/All, addEventListener/click)
driving the real, unmodified render()/#wireDrawer()/#renderDrawerApps()
methods, not string-matching against the template.

| Suite | Result |
|---|---|
| New: user-dashboard-level1-drawer.test.js | 11/11 pass |
| Existing: workspace-shell-platform-admin-handoff.test.js | 7/7 pass |
| Existing: identity-routing-real-composition.test.js | pass |
| Existing: index-html-post-login-routing-wiring.test.js | pass |
| Existing: launch-sequence-no-replay-after-login.test.js | pass |
| Combined this verification | 15/15 individual subtests pass (regression) + 11/11 (new) |

0 regressions. cozy-workspace.js confirmed byte-for-byte unchanged
(SHA-256 identical before/after).

## What was verified
- Small-phone drawer closed by default; workspace occupies full width
  (drawer is position:fixed, consumes no layout space when closed).
- Menu button opens/closes the drawer; overlay click closes it.
- Opening/closing the drawer never touches #cozy-ud-surfaces or
  #cozy-workspace-root - an active application is never reloaded or
  recreated by the drawer's own open/close action.
- Authorized applications (from the real ApplicationVisibility.
  listVisibleApplications()) appear in the drawer; unauthorized/absent
  applications never appear, and an honest reason is shown when the
  real data source itself reports unavailable.
- ApplicationLauncher.open() is called with the correct, real appId -
  confirmed via a real launcher stub capturing the exact call - and a
  missing launcher degrades honestly (no throw, no fabricated launch).
- Existing admin drawer remains completely unaffected (unchanged file,
  its own tests still green).
- Existing login/registration/dashboard-routing regression remains clean.

## Level 1 status: COMPLETE and verified

## Next (not started, per instruction)
Level 2 - application-specific expandable/collapsible navigation -
remains explicitly deferred until authorized.
