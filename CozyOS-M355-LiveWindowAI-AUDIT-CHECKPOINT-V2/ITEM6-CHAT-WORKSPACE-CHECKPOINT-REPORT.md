# Item 6 - CozyOS Live Chat Workspace - Checkpoint Report

## Scope correction acknowledged
An intermediate instruction incorrectly described a WebSocket/
chat-engine/OrganizationRegistry architecture that does not exist
anywhere in this session's actual work. That was correctly declined
and confirmed back to the smaller, real, already-in-progress scope:
Live's Chat tool reusing the existing window.CozyOS.LivingAssistant
capability via its genuine toggle(). No WebSocket transport, no
chat-engine.js, no Storage Gateway extension, no OrganizationRegistry/
OrganizationMembership change, and no new AI registry were created.

## Audit finding
No peer-to-peer/participant chat backend exists anywhere in this
repository (confirmed absent - "chat" was honestly listed in
DISCLOSED_ABSENT_PANELS before this item). The one real, existing,
already-generic CozyOS chat surface is window.CozyOS.LivingAssistant
(its own real, already-mounted, WindowManager-backed panel).

## Real defect found and fixed (via real browser testing)
Chat was originally wired to call LivingAssistant.open() only on the
transition into a locally-tracked #openPanels Set entry. Since that
Set has no way to learn that the user closed the real Assistant window
directly (via its own separate close control), a second click on
"Chat" would then toggle the Set entry OFF instead of reopening the
window - the user could never get Chat back without a page reload.
Root-cause fix: "chat" no longer uses the local Set at all; every click
delegates directly to the real, existing LivingAssistant.toggle(),
which already correctly resets its own internal #expanded state via
its own onClose handler - this is the single, authoritative source of
truth for open/closed, eliminating the desync entirely. The honest
status card in Live's own Chat panel now reads live state via
LivingAssistant.getDiagnosticsReport().expanded rather than a second,
independently-tracked flag.

## Implementation
core/modules/ChurchOS/living-worship-player.js only:
- #togglePanel("chat") now delegates directly to
  window.CozyOS.LivingAssistant.toggle() (falling back to open() if
  toggle() is unavailable), bypassing the local #openPanels on/off
  tracking used by the other disclosure-card panels.
- #renderOpenPanels()'s chat card reads real, live state from
  LivingAssistant.getDiagnosticsReport().expanded.
- REAL_PANELS/DISCLOSED_ABSENT_PANELS updated so "chat" is honestly
  listed as real (moved out of DISCLOSED_ABSENT_PANELS).

No changes to core/shell/window-manager.js (confirmed byte-for-byte
unchanged, matching Item 5's checkpoint hash exactly), core/living/
cozy-living-assistant.js, or any organization/registry file.

## AI registration audit (per instruction - report only, no expansion)
Searched for window.CozyOS.LivingAssistant registration via
ServiceRegistry.registerApplication() (core/registry/cozy-registry.js)
and the static core/modules/module-registry.js. Confirmed: neither
registers LivingAssistant anywhere. The existing AI-visibility
mechanism (registerApplication(), used by QuarryOS, ShopOS,
Cozy-Authenticator, and others) has never been extended to cover the
Assistant panel itself. Per instruction, this is reported as an
existing registration gap for a separate future dependency task - not
expanded into a new AI architecture here.

## Real browser verification
core/modules/ChurchOS/test/live-chat-workspace-browser.test.js - 11/11
VERIFIED (one real defect found, fixed at root cause, then
re-verified):
- Chat genuinely opens the real Assistant workspace
- opening Chat never interrupts Live video/audio (same real
  MediaStream, not paused, exactly one video element)
- exactly one WindowManager root with both Live and Chat windows open
- closing Chat via its own real window control leaves Live playing
- reopening Chat after closing genuinely works (the exact defect this
  item fixed)
- the honest status card reflects real, live state, never a fabricated
  embedded chat UI
- MOBILE (390x844): Chat opens with no horizontal overflow, video
  remains visible and unpaused
- MOBILE (390x844): exactly one video element and one WindowManager
  root
- Chat interacts correctly with EXPANDED Live (maximize) -
  independently functional
- 3x repeated open/close cycles all work correctly, no drift, no
  duplicate windows
- zero real page errors

## Regression
| Suite | Result |
|---|---|
| living-worship-player-mini-pip-browser.test.js | 14/14 pass |
| living-worship-player-tools-menu-browser.test.js | 7/7 pass |
| video-assist-coexistence-browser.test.js (Item 1) | 9/9 pass |
| live-expanded-workspace-browser.test.js (Item 2) | 11/11 pass |
| live-fullscreen-browser.test.js (Item 3) | 12/12 pass |
| live-minimized-floating-browser.test.js (Item 4) | 7/7 pass |
| live-move-pin-browser.test.js (Item 5) | 11/11 pass |
| living-worship-player-tools-menu.test.js (Node) | 8/8 pass |
| taskbar-browser.test.js | 12/12 pass |

0 regressions across 79 pre-existing checks (updated total including
Item 5) + 11 new = 90 total.

## Item 6 status: COMPLETE and verified

## Completed Live sequence
Items 1-6 of the CozyOS Live workspace sequence are now all complete
and independently checkpointed:
1. Video Assist floating button
2. Expanded workspace
3. Fullscreen
4. Minimized/floating player
5. Move/pin
6. Chat workspace

## Next dependency reported (not started)
LivingAssistant is not currently discoverable via
ServiceRegistry.registerApplication() or module-registry.js - a real,
separate future dependency if AI-visibility of the Chat/Assistant
capability specifically is desired.
