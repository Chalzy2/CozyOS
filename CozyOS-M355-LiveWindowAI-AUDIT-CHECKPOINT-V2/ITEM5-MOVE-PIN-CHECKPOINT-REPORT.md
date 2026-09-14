# Item 5 - Move/Pin Floating Player - Checkpoint Report

## Audit finding
MOVE for the floating player already existed and was already
extensively covered by the pre-existing 14-test suite (real Pointer
Events drag, boundary clamping, localStorage persistence).

PIN, as WindowManager already defined it, was a real, generic,
persisted VISUAL toggle only (a gold-glow .cozy-window-pinned
indicator) with NO spatial effect - genuinely different from the
task's "pin to a preferred corner" semantic. Move and Pin were
therefore conflated in the pre-existing implementation. Additionally,
living-worship-player.js's wm.create() call never passed pinnable:true,
so the pin button never even appeared for the Live window.

## Existing capability discovered
window-manager.js's #togglePin()/pinnable option and
#clampToViewport() (the exact same boundary math drag already uses).

## Implementation
- core/shell/window-manager.js: #togglePin() now performs a real,
  generic corner-snap (nearest of the 4 corners, computed from the
  window's current center, clamped via the existing #clampToViewport())
  ONLY when pinning is turned ON and the window is not maximized. This
  gives Pin a genuine, distinct spatial meaning from Move, while the
  existing visual indicator and persistence are completely unchanged.
  Benefits every CozyOS window that opts into pinnable:true, not
  Live-specific.
- core/modules/ChurchOS/living-worship-player.js: added pinnable:true
  to the existing wm.create() call (previously omitted).

## Real defect found and fixed (via real browser testing)
Closing the real Live window via WindowManager's own X button never
reset LivingWorshipPlayer's #root/#windowHandle - so #mountWindow()'s
existing "already have a root" fast path silently no-op'd on the next
real open, meaning a user who closed Live via the X button could never
reopen it. This was a genuine, pre-existing production defect never
exercised by any prior test (all prior suites tested minimize/restore
cycles, never a full close-then-reopen cycle). Fixed at the root cause:
onClose now also resets this.#root = null; this.#windowHandle = null,
letting the next open genuinely rebuild the window exactly as the first
open does.

## Real browser verification
core/modules/ChurchOS/test/live-move-pin-browser.test.js - 11/11
VERIFIED (one real defect found and fixed mid-development, then
re-verified clean):

Desktop:
- VERIFIED: real pointer drag genuinely changes position
- VERIFIED: dragging far past the edge clamps within the viewport
- VERIFIED: video/MediaStream continues playing during drag, same
  instance, no duplicate WindowManager root
- VERIFIED: Pin button is now visible (previously absent)
- VERIFIED: Pin genuinely snaps to the nearest real corner - a real
  spatial effect, confirmed distinct from a mere visual toggle
- VERIFIED: the existing .cozy-window-pinned visual indicator still
  applies, unchanged
- VERIFIED: pinned position persists across a real close/reopen cycle
- VERIFIED: Pin does not interfere with maximize/fullscreen - each
  remains independently functional

Mobile (390x844):
- VERIFIED: floating player is reachable and genuinely movable via
  real pointer drag, stays within the viewport, no horizontal overflow
- VERIFIED: Pin genuinely snaps to a corner within the real mobile
  viewport, no overflow, no duplicate elements

Zero real page errors.

## Regression
| Suite | Result |
|---|---|
| living-worship-player-mini-pip-browser.test.js | 14/14 pass |
| living-worship-player-tools-menu-browser.test.js | 7/7 pass |
| video-assist-coexistence-browser.test.js (Item 1) | 9/9 pass |
| live-expanded-workspace-browser.test.js (Item 2) | 11/11 pass |
| live-fullscreen-browser.test.js (Item 3) | 12/12 pass |
| live-minimized-floating-browser.test.js (Item 4) | 7/7 pass |
| living-worship-player-tools-menu.test.js (Node) | 8/8 pass |
| taskbar-browser.test.js | 12/12 pass |

0 regressions across 68 pre-existing checks + 11 new = 79 total.

## Item 5 status: COMPLETE and verified

## Continuation
Proceeding to Item 6 - Chat Workspace, per instruction, since no
architectural/security/dependency blocker was found.
