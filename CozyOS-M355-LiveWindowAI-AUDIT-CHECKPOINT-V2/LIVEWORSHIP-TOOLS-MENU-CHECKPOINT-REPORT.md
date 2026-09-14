# Live Worship Tools Menu Reorganization - Checkpoint Report

## Scope note (architectural correction acknowledged)
This turn implements only the smallest, concretely-specified UI piece:
the top-left collapsible "Live Worship Tools" menu (opens downward,
collapsible). No new registry, engine, or domain coupling was
introduced - all reused infrastructure (WindowManager, PlatformEventBus,
the existing prefs-persistence pattern) is already domain-agnostic. The
pre-existing file/ID naming (living-worship-player.js,
#cozy-worship-player-*) predates this task and was not renamed - a full
"CozyOS Live" generalization (renaming, a general Video Assist floating
button, multi-domain tool sets, cross-language live translation) is
explicitly out of scope per instruction and remains future work.

## Small Audit
- Canonical Live Worship owner confirmed: core/modules/ChurchOS/
  living-worship-player.js (LivingWorshipPlayer + LiveViewController
  classes).
- Real window/floating infrastructure confirmed: core/shell/
  window-manager.js (generic create/minimize/restore/maximize/
  toggleFullscreen/close/setBounds/getBounds), already composed by the
  player for its docked/mini modes.
- Real PiP already wired via document.pictureInPictureEnabled.
- Real panels already exist for Translation/Scripture/Timeline/Branches
  (REAL_PANELS); Lyrics/Notes/Prayer/Chat are honestly disclosed as
  having no real backend yet (DISCLOSED_ABSENT_PANELS) - preserved
  exactly as-is, not fabricated.
- The bottom-row button strip (REAL_PANELS + DISCLOSED_ABSENT_PANELS)
  was the concrete target for reorganization into the requested
  top-left collapsible menu.

## Implementation
- core/modules/ChurchOS/living-worship-player.js: replaced the
  permanent #cozy-worship-player-panels button row with a collapsible
  #cozy-worship-player-tools toggle + #cozy-worship-player-tools-menu
  container holding the exact same, unchanged panel-toggle buttons.
  Added #toggleToolsMenu() (pure presentation toggle, reuses the
  existing loadPrefs()/savePrefs() persistence pattern under a new
  toolsMenuOpen key). #togglePanel()/#renderOpenPanels() and the
  Theater/Float/PiP header buttons are completely untouched.
- core/living/cozy-living.css: added positioning/collapse CSS for the
  new toggle/menu (absolute-positioned, opens downward, collapses via
  [hidden]), and added the new container to the existing mini-mode
  hide rule.
- No changes to core/shell/window-manager.js, core/shell/
  cozy-workspace.js, core/shell/user-dashboard.js, or
  core/shell/launch-sequence.js (all confirmed byte-for-byte
  unchanged via SHA-256).

## Real browser verification (correction to earlier BLOCKED findings)
A real Chromium binary was found at /opt/pw-browsers (discovered via
`find / -iname "chromium*"`), distinct from the default
~/.cache/ms-playwright path `npx playwright install` uses (which
remains genuinely blocked by network egress, as established earlier in
this project). Playwright's chromium.launch() successfully resolves
the browser from this alternate path. This corrects earlier
conclusions in this project that browser/UI verification was
unconditionally BLOCKED - it is not, for this environment as currently
configured. A new real browser test suite was written and run
successfully:

core/modules/ChurchOS/test/living-worship-player-tools-menu-browser.test.js
  7 passed, 0 failed - genuine bounding-box verification that the menu
  opens DOWNWARD (real computed position below the toggle), collapses
  correctly, all 8 panel buttons are present and clickable, panel
  content genuinely renders, Theater/Float/PiP remain unaffected, and
  zero page errors occurred.

The pre-existing sibling suite was re-run and remains green:
core/modules/ChurchOS/test/living-worship-player-mini-pip-browser.test.js
  14 passed, 0 failed (unaffected by this change).

## Node-level tests (real component, DOM stub)
core/modules/ChurchOS/test/living-worship-player-tools-menu.test.js
  8/8 pass - real end-to-end open flow (icon tap -> panel -> "Open Live
  View"), toggle open/collapse, preference persistence across a real
  remount, all panel buttons preserved, panel-toggle click still
  renders real content, Theater/Float/PiP unaffected, and a source
  check confirming no second window-manager or duplicate player was
  created.

Two real defects were found and fixed in the TEST HARNESS during this
work (not in production code): a missing window.addEventListener stub,
and an initial misunderstanding that the LiveViewController's icon tap
alone opens the full player - it only expands a small menu; the real
"Open Live View" action, a second real click, is what calls onOpen().

## Test summary
| Suite | Result |
|---|---|
| living-worship-player-tools-menu-browser.test.js (real Chromium) | 7/7 pass |
| living-worship-player-mini-pip-browser.test.js (real Chromium, pre-existing) | 14/14 pass |
| living-worship-player-tools-menu.test.js (Node, real component) | 8/8 pass |

0 regressions across 29 total checks.

## Status: COMPLETE and verified
