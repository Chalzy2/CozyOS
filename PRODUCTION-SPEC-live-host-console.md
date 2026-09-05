# Production Specification — Live Host Console (STEP 4D, Patch #2)
Rule 31 — minimal spec, before implementation

## Problem
No shipped surface anywhere in the repository can create a real, production LDCE
live session (checkpoints #1 and #2 confirmed this). Hosts have no way to go live.

## Owner
New, standalone file. Does not touch `CozyLiveSession` or
`cozy-living-live-surface-dashboard.html` (Option A from checkpoint #1 — those remain
a separate, untouched local-widget concept).

## Scope (deliberately minimal)
A single-purpose page + controller whose only job is:
1. Read the real signed-in user via `window.CozyOS.Session.current()`.
2. Call `LiveEntryPoint.goLive()`.
3. Show success (sessionId) or an honest failure reason.

## Files
- `core/shell/live/ui/cozy-live-host-console-controller.js` — pure, testable logic
  (no DOM dependency beyond injected elements/root), mirrors `live-entry-point.js`'s
  own testing pattern (dependency injection via `opts._root` etc.).
- `core/shell/live/ui/cozy-live-host-console.html` — thin page that wires the
  controller to real `document`/`window`.
- `core/shell/live/tests/live-host-console-controller.test.js` — tests A–H from the
  original patch prompt.

## Explicit scope decisions
- **transportMode is hardcoded to `"mesh-only"`.** This page has no relay
  configuration UI (`relayHttpUrl`/`relayWsUrl`/`deviceManager`), and inventing one is
  new transport logic the original prompt prohibited. `"mesh-only"` is passed
  explicitly (not defaulted — `LiveEntryPoint` has no default and requires this be
  literal) so relay support can be added later as its own explicit spec once relay
  config exists in a UI.
- No `sessionType`/`title` input fields are added — `LiveEntryPoint.goLive()` is
  called with only what the controller has (uid via `_root`, `transportMode`); a
  richer host-details form is a follow-up UI decision, not a blocker for the seam
  itself existing.
- Session discovery (Join Live) remains explicitly out of scope, unchanged from
  Patch #1.

## Non-goals (unchanged from Patch #1 constraints)
No new authentication, no new transport logic, no speaking-permission grant, no
LDCESessionEngine modification, no CozyLiveSession modification, no
`startWorshipMode()` revival.
