# AUDIT CHECKPOINT — STEP 4D LIVE UI ENTRY (Patch Attempt #1)
RULE-86 HARD STOP — no implementation performed

## Parent
COS-STEP4D-LIVE-ENTRY-PATCH-1.zip
SHA-256 (verified against upload): b18397b236a83a6215277117c27383a15e76e9e53bcd1e56615c2a568ad14e38 ✓ MATCH

## First Check (as scoped): can the existing Go Live button be safely repurposed?
**NO.**

## Finding
`core/shell/live/ui/cozy-living-live-surface-dashboard.html`'s `.go-live-btn` handler
is wired end-to-end to `window.CozyOS.CozyLiveSession`
(`core/shell/live/cozy-live-session.js`) — a self-contained local orchestrator that:

- mints its own session ids (`freshId("live")`), unrelated to LDCESessionEngine
- owns the entire "Living Surface" state machine (LIVE / MINIMIZED / EXPANDED /
  FULLSCREEN / PAUSED_VIEW / STOPPING / STOPPED)
- owns video preview via `confirmCapture()` → `LiveVideoCapture`
- owns comments, live text, drag (`moveSurface`), resize (`resizeSurface`),
  rotate (`rotateSurface`), and app navigation (`navigateApp`)

Every other control already shipped on this page — `stop-btn`, `toggle-btn`,
`fullscreen-btn`, `rotate-btn`, `send-comment-btn`, plus pointer-driven drag/resize —
reads and writes state through `liveSession.getSession(currentSessionId)`, where
`currentSessionId` is a **CozyLiveSession** id, set only inside the existing
`go-live-btn` handler's own `liveSession.startSession()` call.

`LiveEntryPoint.goLive()` (this patch's new file) produces a completely different,
unrelated identifier — an LDCESessionEngine sessionId (a roster/language/relay
concern) — and never touches CozyLiveSession's registry, surface state machine, or
video capture in any way.

## Why this is a hard stop, not a judgment call
Repurposing the button to call `LiveEntryPoint.goLive()` in place of
`CozyLiveSession.startSession()` would leave `currentSessionId` unset for
CozyLiveSession, silently breaking every other feature already on this page: video
preview, minimize/expand/fullscreen, drag, resize, rotate, comments, stop. The only
ways to avoid that are exactly what this patch's own rules prohibit:

1. Call both `CozyLiveSession.startSession()` and `LiveEntryPoint.goLive()` from the
   same click — violates "the production Go Live action must have one clear owner" /
   "do not silently leave the old demo Go Live path active alongside the new path."
2. Redesign `CozyLiveSession` to be driven by an externally supplied LDCE sessionId
   instead of minting its own — a new major design, not the smallest possible change,
   and edits a file this patch does not own or scope.

Both options are explicitly out of bounds. Per RULE-86: *"existing UI architecture
cannot support the integration without a new major design"* → STOP.

## IMPLEMENTED
(none)

## VERIFIED
- Parent SHA-256 matches the upload.
- `cozy-living-live-surface-dashboard.html` and `live-entry-point.js` read in full, as
  scoped ("do not perform a repository-wide architecture search").
- Confirmed via source: CozyLiveSession and LDCESessionEngine/LiveEntryPoint are two
  independent session concepts with independently minted ids and no shared state.

## NOT VERIFIED
- `LiveEntryPoint.goLive()`/`joinLive()` runtime behavior — not exercised, no code
  changed.

## MISSING DEPENDENCIES
- (carried over) Production live-session discovery / source-of-sessionId for Join Live.
- **New:** a product/architecture decision for how the Living Surface widget
  (CozyLiveSession — local floating video + comments) and the production LDCE session
  (LiveEntryPoint/LDCESessionEngine — roster, language, relay) are meant to relate.
  They currently appear to be two different products that happen to share one button
  label ("Go Live") by accident, not by design.

## LIMITATIONS
Only the one dashboard file named in the prompt was inspected. A repo-wide search for
other Go Live surfaces was explicitly out of scope for this check and was not
performed — there may be other UI entry points not covered by this finding.

## NEXT BUILD MUST START WITH
A scoping decision (not code): resolve whether CozyLiveSession's widget and
LiveEntryPoint's production session are meant to be the same on-screen "Go Live"
concept before any button is rewired. Two real options:

1. Leave CozyLiveSession's widget exactly as-is (still a labeled demo/local-preview
   surface) and add a **separate, clearly distinct** production control elsewhere
   that calls `LiveEntryPoint.goLive()` directly, with no CozyLiveSession involvement.
2. Formally hand CozyLiveSession's sessionId ownership to LDCE — a genuine redesign
   requiring its own Production Specification (Rule 31) and Repository Ownership
   Verification (Rule 48) before any implementation begins.

No third option was found within this patch's stated constraints.
