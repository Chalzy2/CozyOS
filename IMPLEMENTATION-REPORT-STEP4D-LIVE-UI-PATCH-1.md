# Implementation Report — COS-STEP4D-LIVE-UI-PATCH-1
Cumulative on COS-STEP4D-LIVE-ENTRY-PATCH-1.zip
Parent SHA-256: b18397b236a83a6215277117c27383a15e76e9e53bcd1e56615c2a568ad14e38

## Path to this patch
1. Checked cozy-living-live-surface-dashboard.html's Go Live button per the
   original "First Check": it is owned end-to-end by CozyLiveSession (a separate
   local widget/session concept). Repurposing it would break every other feature
   on that page or require a prohibited redesign. RULE-86 STOP. See
   AUDIT-CHECKPOINT-STEP4D-LIVE-UI-1.md.
2. Directed to find the smallest legitimate ChurchOS surface instead (Option A).
   None exists: no host/admin ChurchOS UI is shipped anywhere in the repository
   (living-worship-player.js is viewer-only; worship-mode-coordinator.js's
   startWorshipMode() has zero callers and targets an unrelated system; explicitly
   forbidden to revive). See AUDIT-CHECKPOINT-STEP4D-LIVE-UI-2.md.
3. Directed to complete the work: spec + build a new, minimal, standalone surface.

## IMPLEMENTED
- PRODUCTION-SPEC-live-host-console.md — Rule 31 spec for the new surface.
- core/shell/live/ui/cozy-live-host-console-controller.js — pure controller logic
  (goLive() wiring only), dependency-injectable, mirrors live-entry-point.js's own
  test pattern.
- core/shell/live/ui/cozy-live-host-console.html — thin page wiring the controller
  to real CozyOS.Session / LiveEntryPoint. Does not touch CozyLiveSession or
  cozy-living-live-surface-dashboard.html in any way.
- core/shell/live/tests/live-host-console-controller.test.js — 9 tests covering
  requirements A-H from the original prompt plus one extra (LiveEntryPoint
  unavailable).

## Scope decisions made explicit
- transportMode is a fixed, explicit "mesh-only" literal (not a default — passed
  explicitly every call). No relay config UI exists yet; adding one is new
  transport logic and out of scope. See spec doc.
- UI never reads/passes a uid; goLive() is the only place identity is read.
- No session-discovery / Join Live UI added (unchanged missing dependency).

## VERIFIED
- Parent SHA-256 matches upload.
- Whole-tree diff against the parent extraction: purely additive — exactly 4 new
  files (PRODUCTION-SPEC-live-host-console.md, the controller, the HTML page, the
  test file). Zero existing files modified.
- Protected files (core/shell/cozy-login-gate.js, core/modules/founder-story/*)
  confirmed byte-identical to parent.
- Focused new tests: 9/9 pass (live-host-console-controller.test.js).
- Directly relevant existing regression, all green, zero failures:
  - core/shell/live/tests/live-entry-point.test.js — 15/15
  - core/shell/live/tests/live-relay-composition-bridge.test.js — 18/18
  - core/shell/live/tests/cozy-live-session.test.js — 1/1 (untouched, still passes)
  - core/modules/communication/test/ldce-roster-reporter.test.js — 13/13
  - server/live-relay/test/*.js (14 files) — all green
  - core/modules/media/test/*.js (device manager, participation controller,
    transport selector, publisher, playback receiver) — all green

## NOT VERIFIED
- Browser harness (cozy-living-live-surface-dashboard-browser.test.js) — not run;
  not directly relevant (that surface was not touched by this patch), and
  Playwright/Chromium are not resolvable in this sandbox.
- A full whole-repository test run was attempted and is NOT clean, but every
  failure/timeout observed is in files this patch never touched (confirmed via the
  whole-tree diff above) — e.g. WholesaleOS, duplicate-detection,
  document-understanding, camera/audio/playback engines, media-pipeline-manager,
  scene-manager, engine-bridge, some ChurchOS fanout/orchestrator suites, and a
  pre-existing RP-030 registry count mismatch (17 vs 13) in media-intelligence
  tests. These predate this patch and are not attributable to it; they were not
  re-run to exhaustion or investigated further, per RULE-86 low-budget scope (only
  directly relevant regression was chased down).

## MISSING DEPENDENCIES
- Production live-session discovery / source-of-sessionId for Join Live (unchanged
  from Patch #1).
- Relay-mode host console config UI (relayHttpUrl/relayWsUrl/deviceManager) — not
  built; mesh-only is this page's only supported mode for now.

## LIMITATIONS
New host console has no session-type/title input form; goLive() is called with
only identity + fixed transportMode. A richer host-details form is a follow-up UI
decision, not a blocker.

## NEXT BUILD MUST START WITH
Either: (a) a relay-mode config UI spec if relay hosting is needed, or (b) a
session-discovery design for Join Live — both remain open, independent
dependencies, unchanged from Patch #1.
