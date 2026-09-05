# STEP 4D-B / PHASE 5 — LDCESessionEngine Composition-Root Audit

Parent: COS-STEP4D-B-PATCH-1.zip (Transport Reconciliation)
Parent SHA-256: 787da8190d18097718cc61c13248dd3679998088c12ea97c91d781fb821a7480
Grandparent: COS-STEP4D-B-PATCH-2.zip
Grandparent SHA-256: da805b0c075212f15013a60f18afaefef490f757b577c5dc43080caf145ad51d

PRODUCTION CODE CHANGED: 0
AUDIT-ONLY PATCH

## SCOPE
Determine whether LDCESessionEngine can safely serve as the production
composition root for CozyLiveParticipationController without becoming
a God object, duplicating SessionAuthority, or duplicating existing
transport ownership. No production code was modified.

## METHOD
Full method-level inspection of
core/modules/communication/ldce-session-engine.js, cross-referenced
against every real production caller (core/modules/ChurchOS/*.js).

## A. SESSION OWNERSHIP (confirmed by method inspection)

| Responsibility | Owned? | Evidence |
|---|---|---|
| Session creation/destruction | Yes | createSession() -> CozyConversation.createConversation(); endSession()/cancelSession() |
| Participant membership | Yes | joinSession(), leaveSession(), listParticipants(), getParticipant() |
| Participant identity | Yes, via IdentityEngine | grantResourcePermission()/checkResourcePermission(), ACL key `ldce-call:<sessionId>` |
| Participant language | Yes | setParticipantLanguage(), validated against CozyTranslate.getSupportedTargetLanguages() |
| Host/moderator/participant roles | Yes | ROLES, ROLE_RANK, setParticipantRole(), #actorRank() |
| Reconnect state | No | Not present anywhere in this file |
| Session authorization | Partial | Role-based join/action gating only, not speaking authorization |
| "Speaking" state | Yes, but a SEPARATE mechanism | setParticipantState({speaking}), forceMuteParticipant() -- a boolean flag + moderator override unrelated to SessionAuthority's state machine |

## B. IDENTITY FLOW

IdentityEngine -> LDCESessionEngine (ACL check via
checkResourcePermission/grantResourcePermission) -> participant/session
state. Confirmed single identity store; no duplication found.

## C. TRANSPORT OWNERSHIP (critical finding)

| Transport | Touched by LDCESessionEngine? | Detail |
|---|---|---|
| CozyLiveDistributionTransport | No | Zero references |
| SessionAuthority | No | Zero references |
| RemoteRelayTransportProvider | No | Zero references |
| CozyLiveMediaTransportSelector | No | Zero references |
| LiveHotspotEngine | Yes | initiateSignaling()/joinSignaling()/completeSignaling() -- real WebRTC signaling, but via Firestore documents, NOT the live-relay signaling server |

getMeshPairs() generates all pairwise combinations of joined
participants -- an N^2 mesh appropriate for LDCE's actual
SESSION_TYPES: ["phone-call", "meeting", "classroom", "consultation",
"custom"]. There is no broadcast/live-worship session type. This does
not scale to one-speaker/many-viewer live worship.

## D. LIFECYCLE CORRECTNESS

create -> join -> (role/language changes) -> leave -> end all exist and
are real (backed by CozyConversation's own state machine). There is NO
"participant becomes speaker -> MediaStream starts" transition anywhere
in this file -- `speaking` is a display-state boolean only, never gated
by device capture or SessionAuthority.

## E. GOD-OBJECT TEST

CURRENT RESPONSIBILITIES: session/roster/identity/language/role
lifecycle; its own lightweight mesh-call signaling (Firestore-based).

NEW RESPONSIBILITIES REQUIRED for a media composition root: construct/
own SessionAuthority tokens, TransportSelector, RemoteRelayTransport
Provider, ParticipationController, mic/device lifecycle.

OVERLAP: real and dangerous. LDCE already has its own `speaking` flag
+ forceMuteParticipant() (competing with SessionAuthority's
SPEAKING_ALLOWED/MUTED) and its own WebRTC signaling path (competing
with MESH_WEBRTC_SIGNALING).

RISK: High if naively wired -- would create two independent "who's
allowed to speak" truths and two independent WebRTC signaling paths.

RECOMMENDATION: LDCE may supply identity/roster/language read-only; it
must not absorb speaking-authorization or transport-construction
responsibility.

## PHASE 3 — OWNERSHIP TABLE

| Component | Current owner | Session scoped? | Media scoped? | Should remain? |
|---|---|---|---|---|
| SessionAuthority | server/live-relay | Yes | No (auth only) | Yes -- sole speaking authority |
| LDCESessionEngine | core/modules/communication | Yes | No (own mesh-call signaling only) | Yes -- sole roster/identity/language anchor |
| CozyLiveDistributionTransport | core/shell/live | Yes | Segment/text only | Yes -- sole segment/caption distribution |
| CozyLiveMediaTransportSelector | core/shell/live/providers | No (mode-selection only) | Yes | Yes -- sole mode-selection boundary |
| CozyLiveParticipationController | core/modules/media | Yes | Yes | Yes -- sole mic/capture/speaking-state client |
| RemoteRelayTransportProvider | core/shell/live/providers | Yes | Yes | Yes -- shared client, two wiring sites (already reconciled in Patch #1) |
| LiveHotspotEngine | core/engines/collaboration | No | Yes (LDCE mesh calls only) | Yes, but NOT the same signaling path as MESH_WEBRTC_SIGNALING |

Confirmed: SessionAuthority must not be duplicated inside LDCE.
CozyLiveDistributionTransport, CozyLiveMediaTransportSelector,
CozyLiveParticipationController all check out as designed -- no drift
found from their prior documented ownership.

## PHASE 4 — GOLDEN PATH MAPPING

| Stage | Status |
|---|---|
| Authorized speaker | PARTIALLY EXISTS -- SessionAuthority exists, no production caller |
| Microphone capture | PARTIALLY EXISTS -- CozyLiveParticipationController exists, no production caller |
| Media transport | PARTIALLY EXISTS -- Selector/Publisher exist, no production caller |
| Kiswahili interpretation/TTS/translation reuse | EXISTS -- LiveChurchLanguageOrchestrator, production-wired |
| Viewer-specific language / device playback | EXISTS -- live-language-fanout-router.js |
| Moderation | EXISTS (ChurchOS moderation) but reads LDCE, not SessionAuthority |
| Network state/reconnect | PARTIALLY EXISTS -- RemoteRelayTransportProvider has it; LDCE does not |
| Session discovery (worldwide) | MISSING |
| Original-language passthrough | EXISTS -- orchestrator |

## PHASE 5 — DECISION GATE: OPTION A (narrowly scoped)

DECISION:
LDCESessionEngine MAY serve as the session/identity/roster/language
anchor for the composition root. It MUST NOT become the media/speaking
composition root itself.

BOUNDARIES:
A new, small composition wrapper (not yet built) reads sessionId,
participant identity, and language from LDCESessionEngine's EXISTING
getSession()/getParticipant()/listParticipants() -- read-only, no new
methods added to LDCESessionEngine -- and uses that to construct
SessionAuthority-backed tokens, CozyLiveMediaTransportSelector, and
CozyLiveParticipationController.

DO NOT MOVE:
- Speaking authorization logic into LDCESessionEngine.
- Transport/selector construction into LDCESessionEngine.
- Mic/device capture into LDCESessionEngine.

DO NOT DUPLICATE:
- LDCESessionEngine's own setParticipantState({speaking})/
  forceMuteParticipant() must NOT be treated as, or merged with,
  SessionAuthority's SPEAKING_ALLOWED/MUTED/REMOVED. They remain two
  separate systems for two separate products (LDCE calls vs. live
  worship participation).
- LDCESessionEngine's Firestore/LiveHotspotEngine signaling must NOT
  be conflated with MESH_WEBRTC_SIGNALING's live-relay-server
  signaling.

NEXT IMPLEMENTATION:
Design the smallest new composition wrapper (working name: "Live
Participation Composition Root") that:
  1. Reads session/participant identity from LDCESessionEngine.
  2. Obtains a signed session token from SessionAuthority for that
     participant.
  3. Constructs RemoteRelayTransportProvider + TransportSelector +
     ParticipationController using that identity/token.
This wrapper is new code, not an LDCE modification.

## IMPLEMENTED
None.

## VERIFIED
- Baseline (COS-STEP4D-B-PATCH-1.zip) SHA-256, unzip -t, and file
  count (1112) all confirmed before this audit began.
- Every claim above traced to an actual source line: method list of
  ldce-session-engine.js, its SESSION_TYPES/ROLES constants,
  getMeshPairs() implementation, and ChurchOS's actual read-only LDCE
  call sites (getSession/getParticipant only, no createSession calls
  found in ChurchOS).

## NOT VERIFIED
No tests run in this patch -- no production code changed.

## KNOWN LIMITATIONS
- LDCESessionEngine has its own competing speaking-flag/signaling
  machinery (Firestore-based) that must stay walled off from the
  live-relay-based participation stack.
- No reconnect state exists in LDCESessionEngine.
- No broadcast-scale session type exists in LDCESessionEngine
  (SESSION_TYPES has no "live-worship"/"broadcast" entry).

## MISSING DEPENDENCIES
1. The Live Participation Composition Root wrapper itself -- still not
   built, now precisely scoped (reads LDCE identity/roster only;
   constructs SessionAuthority token + TransportSelector +
   ParticipationController; never touches LDCE's own speaking/
   signaling machinery).
2. Bridge from captured/relayed audio to speech-recognition input for
   LiveChurchLanguageOrchestrator (carried over from Patch #1, still
   unresolved).

## DEPENDENCY STATUS TABLE

| Dependency | Status |
|---|---|
| Transport reconciliation | Verified complete (Patch #1) |
| LDCESessionEngine composition-root evaluation | Verified complete (this patch) -- Option A, narrowly scoped |
| Live Participation Composition Root wrapper | Missing -- design only, not implemented |
| Audio -> speech-recognition bridge | Missing |
| REAL_RTP_SFU | External/Missing (by design) |
| Worldwide church discovery | Missing (out of scope) |

## NEXT BUILD MUST START WITH
Implement the Live Participation Composition Root wrapper exactly as
scoped in the DECISION above -- new code, reading LDCESessionEngine
read-only, never modifying it, never touching its speaking/signaling
machinery.

## PROTECTED FILE AUDIT
- core/modules/founder-story/* -- unchanged (not touched this slice)
- core/shell/cozy-login-gate.js -- unchanged (not touched this slice)
