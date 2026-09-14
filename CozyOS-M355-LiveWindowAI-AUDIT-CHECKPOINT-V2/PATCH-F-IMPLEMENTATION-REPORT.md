# STEP 4D / LIVE UI — PART F — IMPLEMENTATION REPORT

## BASELINE LABEL NOTE
The supplied baseline archive filename is `COS-STEP4D-LIVE-UI-PATCH-5-AUDIT.zip`,
while the prior prompt labels the same SHA-256 as
`COS-STEP4D-LIVE-UI-PATCH-4-AUDIT.zip`. SHA-256
(`352bdd632c118abb42070c67133f6d8b9013bb859c12fb40823b4688a2fcae73`) and
content (matches the Part E audit checkpoint's own findings, independently
re-confirmed by direct source inspection this session) were used as the
authoritative baseline identity, per Charles's explicit instruction. The
filename/label mismatch is disclosed here and was not otherwise
investigated or corrected, per the explicit efficiency instruction for
this session.

BASELINE: COS-STEP4D-LIVE-UI-PATCH-5-AUDIT.zip (SHA-256 above)
PARENT PATCH: COS-STEP4D-LIVE-UI-PATCH-3.zip

## PRODUCT DECISION
OPTION A — LDCE-native media. Stage-1 bound: one authenticated host,
one authenticated viewer. No SFU, no worldwide discovery, no relay
video, no multi-viewer scaling — none of these are claimed anywhere in
this patch.

## IMPLEMENTED
- **NEW** `core/shell/live/ldce-live-media-coordinator.js` — the small
  orchestration coordinator Part F Section 3 authorized. Composes
  `LDCESessionEngine` (getSession/getParticipant/on('participant-joined')/
  listenForOffer) and `LDCEMediaSessionEngine` (attachLocalMedia/
  connectToPeer/acceptPeerConnection/on('remote-track')/cleanupSession/
  disconnectFromPeer) only. Exposes `startHostMedia`, `stopHostMedia`,
  `joinAsViewerMedia`, `leaveViewerMedia`.
- **MODIFIED (additive)** `core/shell/live/ui/cozy-live-host-console-controller.js`
  — added `handleStartMedia`/`handleStopMedia`. `handleGoLive` is
  byte-for-byte unchanged in behavior; only new exports were added to
  the returned object.
- **MODIFIED (additive)** `core/shell/live/ui/cozy-live-join-console-controller.js`
  — added `handleJoinMedia`/`handleLeaveMedia`. `join` is unchanged.
- **MODIFIED** `core/shell/live/ui/cozy-live-host-console.html` — added a
  hidden-until-live media panel: local preview `<video>`, an explicit
  "Start Camera & Mic" button (never auto-triggered by Go Live), and a
  Stop Media button. Loads the two new script tags
  (`ldce-media-session-engine.js`, `ldce-live-media-coordinator.js`).
- **MODIFIED** `core/shell/live/ui/cozy-live-join-console.html` — added a
  hidden-until-joined media panel: remote `<video>`, connecting/
  connected/failure status text, and a Leave button. Same two new
  script tags added. The viewer's own camera/microphone are never
  requested by this page.

## HOST → VIEWER FLOW (as actually wired)
1. Host clicks Go Live → `LiveEntryPoint.goLive()` (unchanged) creates
   the LDCE session; host is already its `hostId`.
2. Host clicks "Start Camera & Mic" → `handleStartMedia()` →
   `LiveMediaCoordinator.startHostMedia()` → confirms the caller really
   is `session.hostId`, then calls `LDCEMediaSessionEngine.attachLocalMedia()`
   (real `getUserMedia()` consent prompt; a denial/failure is returned
   honestly, camera never silently started). On success it subscribes
   to `LDCESessionEngine`'s real `"participant-joined"` event, scoped to
   this `sessionId`.
3. Viewer clicks Join Live → `LiveEntryPoint.joinLive()` (unchanged)
   calls `LDCESessionEngine.joinSession()`, which fires
   `"participant-joined"` for real.
4. The host's coordinator instance sees that event, records the viewer
   as the one accepted viewer (Stage-1 bound), and calls
   `LDCESessionEngine.listenForOffer(sessionId, viewerId, hostId, ...)`.
5. The join console then calls `handleJoinMedia()` →
   `LiveMediaCoordinator.joinAsViewerMedia()` → confirms the caller is a
   real joined participant, resolves `hostId` from
   `LDCESessionEngine.getSession()`, and calls
   `LDCEMediaSessionEngine.connectToPeer(sessionId, viewerId, hostId)`
   — a real, receive-capable peer connection (the viewer's own local
   capture is never attached, so no tracks are published). This
   composes `LDCESessionEngine.initiateSignaling()` +
   `completeSignaling()` internally (both pre-existing, unchanged).
6. The host side's pending `listenForOffer()` callback fires with the
   real offer code and calls
   `LDCEMediaSessionEngine.acceptPeerConnection(sessionId, hostId, viewerId, offerCode)`
   — composes `LDCESessionEngine.answerOffer()` (pre-existing,
   unchanged).
7. Once the real `RTCPeerConnection` completes, `LDCEMediaSessionEngine`
   emits `"remote-track"`; the viewer's coordinator subscription
   attaches `evt.streams[0]` to the join console's `<video>` element.

## ONE-VIEWER LIMIT
Enforced entirely inside the new coordinator's own per-session
bookkeeping (`_hostState`), never by modifying `LDCESessionEngine`'s
roster or capacity. A second `"participant-joined"` event for a
session that already has an accepted viewer is explicitly ignored;
`opts.onSecondViewerRejected` is invoked so the host UI can surface
"additional viewers are not supported in this stage." Covered by
test T.

## NOT VERIFIED
- Real browser execution (actual `getUserMedia()` prompt, actual
  `RTCPeerConnection` negotiation, actual video rendering) — **not
  performed**. No browser/display was available in this environment.
  All 20 new Part F tests and all pre-existing `core/shell/live/tests/`
  suites were run for real via `node --test` (Node's real assertion
  engine, dependency-injected fakes for the browser-only pieces:
  `getUserMedia`, `RTCPeerConnection`, Firestore), not simulated by
  this report.
- `core/shell/live/tests/cozy-living-live-surface-dashboard-browser.test.js`
  requires an actual browser (Playwright) and could not complete in
  this environment (timed out waiting for a browser context) — this is
  a pre-existing environment constraint, not something this patch
  introduced or attempted to fix.

## MISSING DEPENDENCIES
None for the Stage-1 scope. `LDCESessionEngine`, `LDCEMediaSessionEngine`,
`LiveEntryPoint`, and both console controllers already existed and were
composed as-is.

## LIMITATIONS (unchanged from Part F's own scope)
- Stage-1 supports one host + one viewer only.
- No SFU.
- No worldwide discovery (viewer still needs a directly-supplied
  sessionId, unchanged from Part B/C).
- No relay video (Patch #6 relay untouched — real, working audio-only
  mesh remains a separate path, not composed here).
- No TURN/STUN (inherited from `ldce-media-session-engine.js`'s own
  disclosed Stage 2 scope).

## BOUNDARY / OWNERSHIP CONFIRMATION
`core/shell/live/ldce-live-media-coordinator.js` never references
`SessionAuthority`, `LiveRelayCompositionBridge`,
`CozyLiveParticipationController`, `RemoteRelayTransportProvider`,
`CozyLiveSession`, or `LivingWorshipPlayer` — confirmed by real
executable tests (O-S), not comment inspection: each of those globals
was replaced with a Proxy that throws on any property access, and both
`startHostMedia()` and `joinAsViewerMedia()` were run to completion
against that trapped root without throwing.

## REGRESSION (real `node --test` runs, this session)
| Suite | Result |
|---|---|
| `ldce-live-media-coordinator.test.js` (NEW, Part F, A-T) | 20/20 pass |
| `live-entry-point.test.js` | 15/15 pass |
| `live-host-console-controller.test.js` | 9/9 pass |
| `live-join-console-controller.test.js` | 14/14 pass |
| `live-relay-composition-bridge.test.js` | 18/18 pass |
| `cozy-live-session.test.js` | 1/1 pass |
| `cozy-living-live-surface-dashboard-browser.test.js` | not completed — requires a real browser, unavailable in this environment (pre-existing constraint) |

**77/77 executable (non-browser) tests pass. Zero failures introduced.**

## VERIFICATION CLASSIFICATION (Rules 116/117)
- Static Verified ✅ — source inspection of every composed real API
  (`attachLocalMedia`, `connectToPeer`, `acceptPeerConnection`,
  `listenForOffer`, `getSession`, `getParticipant`,
  `"participant-joined"`).
- Runtime Verified ✅ — real Node execution of all 77 non-browser
  tests, including the new 20.
- Reasoned Confidence 🔍 — the end-to-end flow's real-browser behavior
  (actual camera prompt → actual peer negotiation → actual video
  frame render) follows directly from composing already-real,
  already-audited pieces the same way their own Gate 1/Gate 2
  verifications did, but was not itself observed in a browser this
  session.
- Unverified ⏳ — real-device/real-network behavior (NAT traversal,
  mobile browser `getUserMedia` prompts, actual Firestore round-trip
  timing).

## NEXT BUILD MUST START WITH
This patch (cumulative). No further Part F work is pending unless
Charles wants real-browser verification performed, or the second-
viewer UX (currently just a status message) expanded.
