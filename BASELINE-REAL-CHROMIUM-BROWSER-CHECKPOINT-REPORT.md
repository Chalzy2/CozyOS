# Baseline Real Chromium Browser - Consolidation Checkpoint Report

## Audit accepted, no new infrastructure built
Confirmed: the canonical infrastructure already existed -
server/webauthn-rp/test/browser-launch.js (Chromium discovery) and
core/tests/browser/cozy-browser.js (withBrowser/openPage/makeRunner
harness, already delegating discovery to browser-launch.js). No new
launcher, discovery mechanism, or harness was created.

## Small genuine harness gap found and extended
openPage() did not accept a viewport option. The six Live tests each
needed real desktop AND real 390x844 mobile viewports per page.
Extended openPage(opts = {}) to forward opts to browser.newPage(opts) -
fully backward compatible (existing callers passing nothing behave
identically, confirmed by re-running the two pre-existing non-Live
consumers below). No second harness was created for this.

## Consolidation performed
All six Item 1-6 Live browser test files were refactored to use
withBrowser()/openPage()/makeRunner() instead of their own duplicated
startServer()/http.createServer()/playwright.chromium.launch()
boilerplate:
- video-assist-coexistence-browser.test.js (Item 1)
- live-expanded-workspace-browser.test.js (Item 2)
- live-fullscreen-browser.test.js (Item 3)
- live-minimized-floating-browser.test.js (Item 4)
- live-move-pin-browser.test.js (Item 5)
- live-chat-workspace-browser.test.js (Item 6)

Real defect found during consolidation: live-fullscreen-browser.test.js
originally used browser.newContext({viewport}) + a custom
--headless=new launch flag, believed necessary for
document.fullscreenElement to populate. After consolidating onto the
canonical harness's plain resolveLaunchOptions({headless:true}) launch
(no extra flag), all 12 fullscreen tests still passed for real,
including the genuine native-fullscreen-element check - confirming the
extra flag was not actually required in this environment, and no
harness extension was needed for fullscreen support.

Test semantics were fully preserved - identical test counts before and
after consolidation:
| File | Before | After |
|---|---|---|
| Item 1 | 9/9 | 9/9 |
| Item 2 | 11/11 | 11/11 |
| Item 3 | 12/12 | 12/12 |
| Item 4 | 7/7 | 7/7 |
| Item 5 | 11/11 | 11/11 |
| Item 6 | 11/11 | 11/11 |

No production Live functionality changed - core/shell/window-manager.js
and core/modules/ChurchOS/living-worship-player.js confirmed
byte-for-byte unchanged (SHA-256 identical to the Item 6 checkpoint).

## Verification
- All six consolidated tests confirmed to require('../../../tests/browser/cozy-browser')
  and contain zero remaining startServer/http.createServer/chromium.launch
  code (only harmless doc-comment mentions remain in two files' headers).
- cozy-browser.js confirmed to require browser-launch.js for discovery
  (unchanged, pre-existing require at file top).
- Real Chromium resolved through /opt/pw-browsers via
  PLAYWRIGHT_BROWSERS_PATH (confirmed present in the environment;
  discoverChromium() correctly falls through its own steps 1-3 to let
  Playwright's own resolution use it - re-confirmed, no code change
  needed here).
- Two already-proven non-Live browser tests re-run for cross-application
  evidence: admin-workspace-dependency-chain-browser.test.js (3/3 pass,
  BROWSER_TEST=PASS) and organization-membership-browser.test.js (9/9
  pass, BROWSER_TEST=PASS).
- Pre-existing living-worship-player-mini-pip-browser.test.js (14/14)
  and living-worship-player-tools-menu-browser.test.js (7/7) - the two
  earlier Live suites predating "Item 1-6", correctly out of this
  task's explicit consolidation scope - re-run and remain green.
- core/shell/tests/taskbar-browser.test.js (WindowManager/taskbar
  regression) - 12/12 pass.

Combined: 106 individual real-browser checks, 0 regressions.

## Second audit A - stale browser-blocking assumptions
Searched for "Chromium unavailable", "browser unavailable", "browser
testing blocked", "BLOCKED...Chromium" across the repository. Findings,
classified:
- Historical checkpoint/report markdown (own new Item 1-6 reports,
  docs/history/RP-035-WOS2-P5.md, docs/checkpoints/CP6.8-...): kept
  unchanged, historical evidence.
- core/modules/media/cozy-live-playback-receiver.js and its test: real,
  current, CORRECT documentation of browser AUTOPLAY policy blocking
  (AUTOPLAY_BLOCKED) - an unrelated concept (media autoplay, not test
  infrastructure); not stale, no change needed.
- tools/termux/taskbar-cdp-browser.test.js: an active, genuinely still-
  correct BLOCKED condition for its real target (Termux/Android devices
  without a system Chromium) - uses the same canonical
  browser-launch.js discovery; /opt/pw-browsers is specific to this dev
  sandbox and would not exist on a real Termux device, so this
  condition remains valid for its actual deployment target. No change
  needed.

Result: no stale/incorrect active logic or documentation found that
needed correcting.

## Second audit B - AI discoverability
Searched core/registry/cozy-registry.js and core/modules/module-registry.js
for any registration of cozy-browser.js, browser-launch.js, or a
"browser-verification" capability. Confirmed: none exists. This is an
infrastructure/test capability, not a user-facing application, and no
appropriate registration mechanism for this class of capability was
found to already exist. Documented as a genuine gap for a possible
future dependency - no new AI registry, engine, or knowledge system was
created, and no secrets were registered.

## Duplication note (found, correctly out of authorized scope)
A repository-wide grep for playwright.chromium.launch( found roughly a
dozen additional *-browser.test.js files outside the six Item 1-6 tests
(e.g. under core/modules/intelligence/, core/engines/video/,
core/shell/live/, core/connectivity/) that also appear to implement
their own inline Chromium launch rather than using cozy-browser.js.
These predate this project and were explicitly out of the authorized
scope for this task ("the six Item 1-6 Live browser tests") - reported
here honestly, not touched, and not consolidated in this pass.

## Files changed
- core/tests/browser/cozy-browser.js (small, additive openPage(opts) extension)
- core/modules/ChurchOS/test/video-assist-coexistence-browser.test.js
- core/modules/ChurchOS/test/live-expanded-workspace-browser.test.js
- core/modules/ChurchOS/test/live-fullscreen-browser.test.js
- core/modules/ChurchOS/test/live-minimized-floating-browser.test.js
- core/modules/ChurchOS/test/live-move-pin-browser.test.js
- core/modules/ChurchOS/test/live-chat-workspace-browser.test.js

No production Live/WindowManager files changed. All Item 1-6 historical
checkpoint ZIPs and reports preserved unmodified.

## Status: COMPLETE and verified
