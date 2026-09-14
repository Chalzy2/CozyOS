# AUDIT CHECKPOINT — STEP 4D LIVE UI — PATCH #5 (PART E)

BASELINE:
COS-STEP4D-LIVE-UI-PATCH-4-AUDIT.zip

BASELINE SHA-256:
d40bd0f9db6bed909d58c9e35c60b4b7cc6d6d2af18d9d8ed8aaae2933c67a27
(re-confirmed on this session's upload — unzip -t clean)

PARENT:
COS-STEP4D-LIVE-UI-PATCH-3.zip
SHA-256: 61e6a306519bbf9f3589850ec53784396bb91abfc5259e0e6ed1c17af3e70b32

## STATUS: BLOCKED / AUDIT-ONLY

## OBJECTIVE

Determine whether an existing, already-real production seam already
lets an LDCE viewer receive live media — via Option A (LDCE-native
media path) or Option B (Patch #6 relay path) — without inventing an
identifier mapping or silently switching transport.

## TARGETED INSPECTION PERFORMED (scoped, not a repository-wide audit)

### A. LDCE media capability

Found a genuine, real, already-shipped LDCE-native media module:
`core/modules/communication/ldce-media-session-engine.js` (Milestone
362 Stage 2). Its public API (confirmed by direct inspection,
`attachLocalMedia`, `connectToPeer`, `acceptPeerConnection`,
`getRemoteStreams(sessionId, peerUserId)`) is genuinely keyed by
LDCE's real `sessionId` — not `serviceId`/`captureId`. It composes
real, audited pieces:
- `LiveVideoCaptureEngine.startPreview()` — real `getUserMedia()`,
  captures both audio AND video in one `MediaStream` (confirmed in
  this file's own header, "verified at Gate 1").
- `LiveHotspotEngine` — real per-peer `RTCPeerConnection`s (mesh
  topology only; file header discloses "no SFU exists").
- `LDCESessionEngine.initiateSignaling()`/`answerOffer()`/
  `completeSignaling()` — a real, automatic (Firestore
  document-based, not manual copy/paste) offer/answer signaling
  exchange between exactly two participants at a time.

`LDCESessionEngine.getSession(sessionId).hostId` (line 193, 262)
confirms host identity IS resolvable from a `sessionId` alone — so
"who to connect to" is not itself a blocker.

**However — no production caller wires any of this together.**
Confirmed by direct inspection of every relevant call site:
- `cozy-live-host-console-controller.js` (`handleGoLive()`) calls
  only `LiveEntryPoint.goLive()`. It never calls
  `attachLocalMedia()`, `connectToPeer()`, `acceptPeerConnection()`,
  or `listenForOffer()`. A host going live today never starts camera
  capture and never listens for incoming peer-connection offers.
- `cozy-live-join-console-controller.js` (Part B/C, this patch's own
  established boundary) calls only `LiveEntryPoint.joinLive()`. It
  never calls any `ldce-media-session-engine.js` method either.
- No other production file in `core/shell/live/` or
  `core/modules/ChurchOS/` calls `attachLocalMedia`, `connectToPeer`,
  `acceptPeerConnection`, or `listenForOffer` (grep across the
  repository, scoped to this inspection's targeted files, found zero
  such call sites outside `ldce-media-session-engine.js`'s own
  self-referencing test file).

Making Option A actually deliver media to a viewer would require
building, from nothing, an entire two-sided orchestration layer that
does not exist today:
1. Deciding when/whether the host's camera starts (host console
   currently never captures media at all).
2. Deciding which side initiates `connectToPeer()` and which side
   must be listening via `listenForOffer()`/`acceptPeerConnection()`
   at the moment a viewer joins.
3. Handling N simultaneous viewers against Stage 2's own disclosed
   "mesh topology only... no SFU" limit (one real
   `RTCPeerConnection` per viewer, on the host's own browser tab).

None of these are "smallest adapter" work — each is its own
product/architecture decision this task's own Section 2 instructs
not to invent ("Do not redesign anything" / targeted inspection
only) and Section 10 lists as a hard stop ("the correct media
ownership cannot be determined").

### B. Relay capability (Patch #6 composition bridge)

Inspected `establishRelaySession()`'s actual return value (no
modification made): `{ success, transportProvider,
participationController, userId, role }` — a real
`CozyLiveParticipationController` + `RemoteRelayTransportProvider`
pair is genuinely returned, not fabricated.

Traced what that pair can actually deliver, per their own file
headers (confirmed by direct inspection, not assumed):
- `cozy-live-participation-controller.js` — "Live Participation —
  Speaking Authority ↔ Media Composition." Composes
  `CozyAudioDeviceManager` (microphone) + `RemoteRelayTransportProvider`.
  Explicitly gates real microphone capture behind server-confirmed
  `SPEAKING_ALLOWED` — this is a **publishing/speaking** authority
  layer, not viewer/reception.
- `cozy-live-remote-relay-transport-provider.js` — its own comment
  (line 420-424) states it "never creates or touches an
  RTCPeerConnection itself... the actual MediaStream/
  RTCPeerConnection composition lives in...
  `cozy-live-media-publisher.js`."
- `cozy-live-playback-receiver.js` — the actual viewer-side
  reception layer for this relay stack. Its own
  `getCapabilityReport()` (inspected directly, not paraphrased from
  a comment) returns, as real code, not documentation:
  `ONE_UPSTREAM_MANY_VIEWERS_AVAILABLE: false` and
  `INTERNET_SCALE_SFU_DEPLOYED: false`. It creates one
  `HTMLAudioElement` per remote peer — **audio only**, never video.
  Its own header states plainly: "the 'church → ONE upstream →
  CozyOS relay → MANY viewers' product requirement is NOT satisfied
  by this file... Reaching that requirement needs a real deployed
  SFU/media-relay component that does not exist anywhere in this
  repository."

**Conclusion: the relay path cannot provide viewer video at all,
under any wiring.** It is a real, working audio-only mesh
(one real peer connection per listener to the original publisher's
own browser), by its own in-code, non-fabricated disclosure. This is
not a wiring gap Part E could close with an adapter — it is a
capability that genuinely does not exist in this repository.

### C. Existing viewer consumption (living-worship-player.js)

Unchanged finding from Part D: `bindToService(serviceId)` is the
only public input boundary, and — confirmed newly relevant this
session — when it falls through to the `LiveHotspotEngine` branch,
the value it passes IS semantically a real `connectionId` (the exact
same value `ldce-media-session-engine.js`'s own `getRemoteStreams()`
resolves internally before calling
`hotspot.getRemoteStreams(connectionId)`). This means `serviceId`
here is not literally forbidden from ever holding a
`connectionId` — the class of a "string adapter" this task's
Section 4 forbids (`sessionId` masquerading as `serviceId`) does not
apply to a genuine, already-established `connectionId`. This is not
the blocker. The blocker is entirely upstream: no such `connectionId`
is ever produced in production because no caller performs the
Option A signaling handshake described above.

## DECISION

**OUTCOME C — Neither path can provide media today**, for two
independent, non-overlapping reasons:

- Option A (LDCE-native): the real capability exists
  (`ldce-media-session-engine.js`, video+audio capable), but no
  production orchestration connects a host's camera or a joining
  viewer's peer-connection request to it. Building that
  orchestration is a new architecture/product decision (who
  initiates, when, and how N-viewer mesh fan-out is handled against
  a disclosed "no SFU" limit) — not a "smallest adapter."
- Option B (relay): the real capability exists but is, by its own
  in-code disclosure, audio-only and explicitly NOT the one-to-many
  broadcast model a church-viewer use case needs
  (`INTERNET_SCALE_SFU_DEPLOYED: false`). No adapter of any size
  makes an audio-only reception layer deliver video.

Per Section 10 (Hard Stop Conditions): "relay cannot provide actual
viewer media" — true, confirmed by in-code disclosure — and "the
correct media ownership cannot be determined" for Option A — true,
since no existing code establishes who initiates the LDCE
peer-signaling handshake or how it should fan out to multiple
viewers. Both conditions independently require stopping here.

## IMPLEMENTED

None. Zero production files touched. Zero new files except this
audit report. No tests added, per this task's own instruction ("If
the correct outcome is STOP, do not write tests for a nonexistent
capability").

## VERIFIED

- Baseline SHA-256 re-confirmed on the actual Part D zip:
  d40bd0f9db6bed909d58c9e35c60b4b7cc6d6d2af18d9d8ed8aaae2933c67a27 —
  unzip -t clean.
- Whole-tree diff against the Part D working tree, confirmed via
  `diff -rq` before this report was added: zero differences. The
  inspection touched no file.
- No protected-file recheck was needed beyond confirming this
  (nothing was ever candidate-modified in this session).

## NOT VERIFIED

N/A — a negative finding (neither media path is production-ready for
a viewer today) is the deliverable, consistent with the Part-C-audit
and Part-D-audit checkpoints' own precedent.

## MISSING DEPENDENCIES

Two, either of which is a real, separate future product/architecture
decision — not this builder's call:

1. **For Option A:** a decision on host-side media-capture lifecycle
   (does going live start the camera automatically? does the host
   consent per-viewer?) and viewer-connection orchestration (who
   initiates `connectToPeer()`, and how does a mesh host handle N
   simultaneous viewer connections given the disclosed "no SFU"
   limit) — genuinely new architecture, not a wiring gap.
2. **For Option B:** a real deployed SFU/media-relay component,
   confirmed absent from this repository by `cozy-live-media-publisher.js`
   and `cozy-live-playback-receiver.js`'s own in-code capability
   disclosures. Without it, the relay path structurally cannot
   deliver video, and only ever delivers audio.

## LIMITATIONS

This check was scoped exactly as instructed: `joinLive()`'s actual
return shape (unchanged since Part D), the LDCE-native media module's
public API and its actual production callers (found: none for the
signaling/capture methods), and the relay path's actual media
capability as stated in its own code. No broader architecture audit
was performed.

## NEXT BUILD MUST START WITH

A real product decision (not code) on which media architecture the
church-viewer use case should target:

- **If Option A is chosen:** the product decision must specify host
  camera-consent/lifecycle behavior and a concrete multi-viewer
  connection strategy compatible with (or explicitly superseding)
  the disclosed mesh-only, no-SFU limit — then a future builder can
  implement the smallest real orchestration for that specific,
  decided design.
- **If Option B is chosen:** the product decision must authorize
  building (or integrating) a real SFU/media-relay component — a
  substantially larger undertaking than any "adapter," explicitly
  flagged as not yet existing anywhere in this repository by the
  code itself.

No further code should be written until that decision is made.

## RULE-86 STOP CONDITIONS OBSERVED

Triggered: "relay cannot provide actual viewer media" (Option B,
confirmed via in-code capability disclosure) AND "the correct media
ownership cannot be determined" (Option A, no existing orchestration
establishes host-capture lifecycle or viewer-connection initiation).
No adapter was built. No sessionId→serviceId/captureId/connectionId
mapping was fabricated. No silent mesh→relay transport switch was
made. `living-worship-player.js`, `LDCESessionEngine`,
`SessionAuthority`, and the Patch #6 composition bridge were not
modified.
