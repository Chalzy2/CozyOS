# CozyOS Universal Voice — Application Integration Matrix

Companion to `VOICE-APPLICATION-INTEGRATION-AUDIT.md`. This document turns that audit's classifications into a controlled, phased implementation plan. Per the governing directive: no code changes until both documents exist; then implement in bounded phases, testing and running full regression after each.

## Guiding constraint (repeated because it governs every row below)

Every remediation below routes through the **existing, single** chain:

```
Application text -> CozyAI/answer engine (where applicable) -> resolved text -> VoiceManager -> selected voice
```

No row below creates a per-application VoiceAI, a second TTS path, or a duplicate conversation brain. Where an application has no CozyAI-mediated text today (Live Session, Live/Connectivity, Live Camera Capture, Media Intelligence), the fix is to route its existing, already-real status/response text through `cozy-living-assistant.js`'s existing `#speak()` — never to give that application its own `speak()` call.

## Matrix

| Application | Current classification | Target classification | Required change | Scope/risk |
|---|---|---|---|---|
| ChurchOS | A | A (unchanged) | None required | — |
| ShopOS | A (shallow) | A (unchanged) | None required for voice-reachability; deepening its intent coverage is a separate, non-voice workstream (out of scope here) | — |
| WholesaleOS | A (shallow) | A (unchanged) | None required | — |
| PharmacyOS | A (shallow) | A (unchanged) | None required. Sensitive-domain note: its permission-gated actions already refuse before producing text; nothing sensitive currently reaches the generic FAQ text it does produce | — |
| InterestOS | A (shallow) | A (unchanged) | None required for voice-reachability | — |
| MpesaOS (registered app) | A | A (unchanged) | None required for the real, registered app | — |
| MpesaOS (orphaned `mpesaExecutionCore`/PluginManager path) | Orphaned, unreachable | Orphaned, unreachable (no change) | **Do not wire this up.** If a future pass ever connects `core/plugins/mpesaOS.js`'s query handler to the Living Assistant, it MUST route its output through the same `#send()`/`#speak()` chain, never build its own response/voice path. Documented here as a standing constraint, not an active task. | — |
| QuarryOS | A (shallow) | A (unchanged) | None required | — |
| **Authenticator** | D (correct — never speaks the sensitive surface) | D (unchanged) + a new structural guardrail | **Add an explicit content-safety check at the voice boundary** (`cozy-living-assistant.js#speak()`, immediately before calling `VoiceManager`): reject/strip text matching OTP-code-shaped patterns (the same disclosed pattern `OtpProvider` generates) and any text sourced from an authentication/recovery-secret context, before it can ever reach `speakProgressive()`/`speak()`. This is a **safety net**, not a fix to an active bug — today no caller produces such text. Building it now closes the structural gap the audit flagged (§3) rather than waiting for a future regression to introduce one silently. | Small, additive, defensive-only change to one function. High priority per the governing directive's explicit Authenticator requirement. |
| **Live Session** | B | A | Route its existing, real session-lifecycle status text (start/stop/participant join/leave, connection state) through the shared chain: when a status event fires, call the same `cozy-living-assistant.js` speak path with `context` metadata identifying the source, rather than building a session-specific announcer. Only status/accessibility text — never live participant audio/video content itself. | Medium — requires a real integration point in `cozy-live-session.js`, not just a wrapper. Scope to status/connection-state messages only, matching the directive's own "Verify session status, participation, notifications, live events, connection state" ask. |
| **Live / Connectivity** | B | A | Same pattern as Live Session: route `getCapabilityStatus()` transitions and pairing/connection outcomes through the shared voice chain as accessibility-relevant status text. | Medium — same integration shape as Live Session; the two can share one small "status announcer" helper that both call, as long as that helper itself has no independent TTS logic and only ever calls into the existing `#speak()`/`VoiceManager` path. |
| **Live Camera Capture** | B | A (accessibility-scoped) | Route capture-status/error messages (e.g. "recording started," "camera unavailable") through the shared chain for accessibility. Explicitly **do not** route any description of captured image/video content — this app has no image-understanding capability today and must not fabricate one via voice. | Small — status-only, mirrors the directive's own "camera-related status and accessibility messages... without exposing sensitive image/video information unnecessarily." |
| **Media Intelligence** | B | A | `answerMediaQuestion()` already produces real, disclosed, non-fabricated text. Wire its result into the shared chain when a user asks a media-intelligence-shaped question through the Live Window (i.e., let `cozy-answer-engine.js`/the rule-based provider call it as an evidence source, the same pattern already used for `CozyKnowledge`), rather than leaving it reachable only from its own standalone dashboard. Also investigate the missing `entryPoint` in its `registerApplication()` call — if it genuinely cannot be launched from the main Apps surface, that is a separate, non-voice bug worth flagging to the architect, not something this pass silently papers over. | Medium — this is the one row that adds a new *evidence source* to the existing answer chain (composition, not a new engine), consistent with how `CozyKnowledge` is already composed. |

## Phased execution order

1. **Authenticator content-safety guardrail** — smallest, highest-priority, zero dependency on anything else in this matrix.
2. **Live Camera Capture status routing** — smallest of the three "Live" B-rows, good template to validate the shared "status announcer" pattern before reusing it twice more.
3. **Live Session status routing** — reuses the pattern from step 2.
4. **Live / Connectivity status routing** — reuses the pattern from step 2/3.
5. **Media Intelligence evidence-source wiring** — the one row requiring answer-chain composition, done last once the simpler status-routing pattern is proven.

Each step: implement -> `node --check` -> targeted unit test -> full `core/living` regression -> real-browser verification where applicable -> commit -> push, exactly as done for Phases 1-3 of the core voice work. No step proceeds until the previous one is committed and verified.

## Explicitly out of scope for this matrix

- Deepening ShopOS/WholesaleOS/QuarryOS/MpesaOS/PharmacyOS conversational intent coverage beyond generic app-launch/FAQ text — real work, but not a voice-integration gap (their existing text already reaches voice; they just don't have much of it yet).
- Wiring the orphaned `core/ai/*Handler.js` files or the orphaned MpesaOS `PluginManager` path to anything — they should remain unreachable, not be "integrated."
- HospitalOS/SchoolOS — not real applications; nothing to integrate.
