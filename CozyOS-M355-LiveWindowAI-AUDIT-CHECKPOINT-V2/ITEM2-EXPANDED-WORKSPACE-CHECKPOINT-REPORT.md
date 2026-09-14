# Item 2 - Expanded CozyOS Live Workspace - Checkpoint Report

## Small Audit finding
core/shell/window-manager.js already provides a real, generic, fully
domain-agnostic EXPANDED capability: WindowManager.maximize(id) - sets
width/height to fill the viewport, toggles a real .cozy-window-maximized
class, and is architecturally distinct from toggleFullscreen()'s
separate, real document.requestFullscreen() call (confirmed by reading
both methods). The real window chrome WindowManager.create() emits
already includes a real Maximize button (data-win-action="maximize")
whenever maximizable:true is passed, and living-worship-player.js's
#mountWindow() already passes maximizable:true. EXPANDED for CozyOS
Live was therefore already wired before this item - no new state
machine, window manager, or video player was required.

## Real defects found and fixed (via real browser testing, not assumed)
1. Default window sizing (WindowManager.create()): a fixed 480px
   default width combined with a positive x cascade offset could
   position a newly-created window's own title bar (and its real
   minimize/maximize/close controls) entirely outside a narrow mobile
   viewport - genuinely unreachable, confirmed by a real Playwright
   "element is outside of the viewport" timeout on a 390px viewport.
   Fixed by clamping the default width/height/position to the real,
   current window.innerWidth/innerHeight - a general WindowManager
   improvement benefiting every CozyOS window, not Live-specific.
2. Maximized sizing off-by-2px: width:100vw/height:100vh renders 2px
   larger than the real viewport once .cozy-window's existing 1px
   border is added outside it (content-box sizing), genuinely
   overflowing a 390px mobile viewport by 2px - confirmed by a real
   bounding-box measurement (392px). Fixed narrowly inside
   #applyState()'s maximized branch only (calc(100vw - 2px)), after an
   initial global box-sizing:border-box attempt was found (via the
   pre-existing Tools Menu browser test) to shift internal flex layout
   by 2px elsewhere - reverted that broader change in favor of this
   precise, local fix with zero side effects, confirmed by re-running
   every affected suite green.

## Implementation
core/shell/window-manager.js: the two fixes above only. No changes to
core/modules/ChurchOS/living-worship-player.js or core/living/
cozy-living.css (both confirmed byte-for-byte unchanged, matching
Item 1's checkpoint hashes exactly) - EXPANDED required zero new
Live-specific code, only two general WindowManager correctness fixes.

## Real browser verification
New: core/modules/ChurchOS/test/live-expanded-workspace-browser.test.js
- 11/11 pass, covering all 15 requested checks (several verified
  together where the same real interaction proves multiple points):
  compact state, expand action, genuinely-expanded state (not native
  fullscreen), restore/compact, video/playback/audio state retained
  (same real MediaStream instance throughout, never paused by
  expanding), Tools menu remains functional while expanded, Video
  Assist remains reachable, mobile viewport (390x844, no horizontal
  overflow), desktop viewport, no duplicate video element or
  WindowManager root after repeated expand/restore cycles, and
  existing Theater/Float/PiP tools remain functional afterward.

## Regression
| Suite | Result |
|---|---|
| living-worship-player-mini-pip-browser.test.js (real Chromium) | 14/14 pass |
| living-worship-player-tools-menu-browser.test.js (real Chromium) | 7/7 pass |
| video-assist-coexistence-browser.test.js (real Chromium, Item 1) | 9/9 pass |
| living-worship-player-tools-menu.test.js (Node, real component) | 8/8 pass |
| taskbar-browser.test.js (real Chromium, includes a dedicated maximize() test) | 12/12 pass |

0 regressions across 50 total checks (11 new + 39 pre-existing).

## Item 2 status: COMPLETE and verified

## Continuation
Proceeding immediately to Item 3 - Fullscreen, per instruction, since
no architectural/security/dependency blocker was found.
