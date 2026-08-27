# STEP 4D-B — Transport Reconciliation Audit

Milestone: STEP4D-B (Patch #3 continuation, Patch #1 of the reconciliation sub-chain)
Parent state: COS-STEP4D-B-PATCH-2.zip
SHA-256 of parent: da805b0c075212f15013a60f18afaefef490f757b577c5dc43080caf145ad51d

## SCOPE

Architecture-discovery only. **No production code was modified in this
patch.** This document is the only new artifact.

## QUESTION AUDITED

"Determine whether CozyLiveDistributionTransport and the
CozyLiveMediaTransportSelector stack are separate layers, duplicates,
or intended to converge."

## METHOD

Direct source inspection (no inference from filenames/comments alone):

- core/shell/live/cozy-live-distribution-transport.js
- core/shell/live/providers/cozy-live-remote-relay-transport-provider.js
- core/modules/ChurchOS/live-language-fanout-router.js
- core/modules/ChurchOS/live-church-language-orchestrator.js
- core/modules/media/cozy-live-participation-controller.js
- core/modules/media/cozy-live-media-publisher.js
- core/modules/media/cozy-live-audio-segment-publisher.js
- core/modules/media/cozy-live-audio-segment-shape.js
- core/shell/live/providers/cozy-live-media-transport-selector.js
- server/live-relay/session-authority.js
- server/live-relay/live-distribution-signaling-server.js

## CAPABILITY COMPARISON (evidence-based)

| Capability | CozyLiveDistributionTransport (Stack A) | Selector/Publisher/Receiver stack (Stack C) |
|---|---|---|
| Raw microphone/camera | No | Yes — MediaStream to CozyLiveMediaPublisher / CozyLiveAudioSegmentPublisher |
| MediaStream | No | Yes |
| MediaRecorder chunks | No | Yes — `"audio-chunk"` wire shape, base64, <=150KB/chunk |
| Segment objects | Yes — `{segmentId, sourceLanguage, sourceText, captureAt}` | Yes, different `kind` (`"audio-chunk"`) |
| Captions/Translation/TTS | Yes, via LiveChurchLanguageOrchestrator | No |
| Fan-out | Yes, provider-delegated | Yes, LOCAL_CHUNKED_RELAY mode only |
| Viewer playback | N/A (feeds TTS pipeline, not raw audio) | Yes — CozyLivePlaybackReceiver |
| Speaker authorization | No | Yes — SessionAuthority (SPEAKING_ALLOWED/MUTED/REMOVED) |
| Session identity | Via LDCESessionEngine roster reads | Via sessionId/userId + signed session tokens |
| Reconnect | Heartbeat/staleness detection only | Yes — exponential backoff in RemoteRelayTransportProvider |
| WebRTC | No | Yes — MESH_WEBRTC_SIGNALING (peer mesh, not SFU) |
| SFU | No | No — REAL_RTP_SFU unimplemented everywhere in repo |

## KEY FINDING

Both stacks' remote-capable client path terminate at the SAME server:
`server/live-relay/live-distribution-signaling-server.js`.

- Stack A registers a `RemoteRelayTransportProvider` instance into
  `CozyLiveDistributionTransport` (multi-provider wrapper; needed for
  ChurchOS's viewer roster/heartbeat/provider-swap concerns).
- Stack C hands a `RemoteRelayTransportProvider` instance directly to
  `CozyLiveParticipationController` as `opts.transportProvider`
  (no wrapper needed — the controller already gets identity/authorization
  from SessionAuthority + signed session tokens).

The server itself is payload-agnostic: it fans out whatever `segment`
object it receives, distinguished only by `segment.kind` (text vs.
`"audio-chunk"`).

## DECISION: OUTCOME A — genuinely separate layers, shared relay backbone

Not a duplication. Not one superseding the other. No evidence either
stack was built to replace the other.

```
Participant raw AV (mic/camera)
        v
CozyLiveParticipationController -> TransportSelector -> Publisher
        v (audio-chunk / WebRTC segment, via RemoteRelayTransportProvider)
live-distribution-signaling-server.js  <- same server, same fan-out engine
        ^ (text/caption/translation segment, via RemoteRelayTransportProvider)
CozyLiveDistributionTransport <- ChurchOS's live-language-fanout-router.js
        ^
Speech recognition -> LiveChurchLanguageOrchestrator (translation/TTS)
```

## GOLDEN-TEST CAPABILITY MAPPING (mapping only — not a completion claim)

| Requirement | Component | Status |
|---|---|---|
| Speaker authorization | SessionAuthority | Exists server-side; no production caller yet |
| Microphone capture | CozyAudioDeviceManager + CozyLiveParticipationController | Exists; no production caller |
| Media distribution | Stack C via live-distribution-signaling-server.js | Exists; no production caller |
| Translation / Kiswahili / TTS | LiveChurchLanguageOrchestrator + church-live-translation-interaction.js | Production-wired, but fed by text transcript input, not by Stack C audio |
| Viewer-specific fan-out | live-language-fanout-router.js + CozyLiveDistributionTransport | Production-wired |
| Worldwide church discovery | (none found) | Missing, out of scope |

The specific narrow gap for the golden test is that nothing currently
feeds Stack C's captured/relayed audio into the speech-recognition step
that produces `sourceText` for the orchestrator. This is a narrow,
well-defined gap, not a transport architecture conflict.

## IMPLEMENTED
None. Audit/documentation only.

## VERIFIED
- Patch #2 parent state intact and unmodified.
- All capability claims above traced to source line references during
  this session (not inferred from filenames or comments alone).

## NOT VERIFIED
- No new tests were run (no code changed).
- Golden acceptance test remains unverified end-to-end.

## KNOWN LIMITATIONS
- No production composition root yet exists for
  CozyLiveParticipationController.
- Speech-recognition-to-Stack-C-audio bridge does not exist yet.
- REAL_RTP_SFU remains unimplemented (by design, out of scope).
- Worldwide church/session discovery remains unimplemented (out of
  scope, explicitly deferred).

## MISSING DEPENDENCIES
1. Production participation composition root (owner not yet selected —
   LDCESessionEngine is the leading, not-yet-approved candidate).
2. Bridge from captured/relayed Stack C audio to speech recognition
   input for LiveChurchLanguageOrchestrator.

## NEXT BUILD MUST START WITH
Phase 5 of the reconciliation plan: evaluate LDCESessionEngine as
composition-root owner against its disqualifying tests (God-object
risk, duplicate SessionAuthority, duplicate CozyLiveDistributionTransport,
correct lifecycle ownership) before writing any composition code.

## PROTECTED FILE AUDIT
- core/modules/founder-story/* — unchanged (not touched this slice)
- core/shell/cozy-login-gate.js — unchanged (not touched this slice)
