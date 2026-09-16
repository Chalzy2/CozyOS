# M388 — Engine 7: Voice Generation Engine — Compose Report

**Milestone:** M388 — Living Media Interpreter
**Engine:** 7 of 11 (Approved Implementation Order, `docs/history/M388.md`)
**Phase:** 0 ✅ Complete (this session) → **1 (Compose) — this document**
**Prerequisite:** Engines 1–6 CLOSED (Phase 9), confirmed via `LATEST.md`/`RELEASES.md`, Rule 68 satisfied.

## 1. Purpose

Given a translated text segment (from Engine 3, the Living Translation
Engine) and its speaker (from Engine 4, Diarization), produce synthesized
speech audio for that segment, so a later engine (8, Synchronization) can
time-align it against the original video's speech segments, and a later
engine still (9, Media Encode) can mux it into the final output. Per
`docs/history/M388.md` §7 (Approved Implementation Order) and the
milestone's original task scope, this explicitly **composes existing
`cozy-tts-browser-adapter.js`/`voice-manager.js` — generic TTS only.
Voice-cloning/preservation of the original speaker's voice is `MD-008`,
Out of Scope this milestone**, and is not promised by this Compose.

## 2. Existing Capabilities (read directly from source, not assumed)

- **`core/modules/speech/adapters/cozy-tts-browser-adapter.js`** — a real,
  honest Web Speech API (`window.speechSynthesis`) wrapper. Exports
  `speakPreview({voiceProfileId?, text?, settingsId?}) -> Promise<{played, reason?}>`
  as a public function (`window.CozyOS.CozyTTSBrowserAdapter.speakPreview`,
  explicitly documented at line ~150 as intended for reuse by
  `VoiceManager`). Registers itself as `cozy-speech.js`'s **one**
  preview/TTS backend slot (`registerPreviewBackend`). Fails honestly
  (`played:false, reason:...`) if the Web Speech API isn't available —
  never fabricates success.
- **`core/modules/speech/voice-manager.js`** — real provider-routing layer
  on top of the same backend slot: provider registry, per-context voice
  assignment, fallback chain (selected provider → Charles → the generic
  browser adapter above), `getLastSpokenProviderId()` for honest
  after-the-fact reporting of which provider actually spoke.
- **`core/modules/speech/cozy-speech.js`** — owns Voice Profile
  bookkeeping and the single `registerPreviewBackend`/`previewVoice()`
  slot both files above compose with; confirmed at lines ~1466/1912/1935/
  1952 (`registerAdapter`, `getVoiceSettings`, `registerPreviewBackend`,
  `previewVoice`).

**Critical, load-bearing finding (read directly from the Web Speech API
usage above, not assumed):** every existing TTS capability in this
repository — and the Web Speech API itself — is **playback-only**.
`speechSynthesis.speak()` renders audio directly to the system output
device; there is no standard, cross-browser way to capture that audio as
a buffer/track. `voice-manager.js`'s own header confirms this file only
ever *routes to* the browser adapter's `speakPreview()`, never captures
its output. **No existing file in this repository can produce a
capturable audio track from synthesized speech.** This is the central
architectural question this Compose must resolve (§9/§10 below) — Engine
8 (Synchronization) and Engine 9 (Media Encode) both need an actual audio
buffer/track, not a live playback event, and nothing upstream of Engine 7
provides one today.

## 3. Ownership

Engine 7 owns: **segment-to-speech orchestration** — taking Engine 3's
translated segments plus Engine 4's speaker assignments, requesting
synthesis per segment, and returning a structured result set (one entry
per segment, real or honestly-flagged-unavailable) for Engine 8 to
consume.

Engine 7 does **not** own, and must not duplicate:
- Voice Profile/provider registry/preview backend slot — `cozy-speech.js`/
  `voice-manager.js`/`cozy-tts-browser-adapter.js`, unchanged, composed
  via their existing exports only.
- Translation — Engine 3.
- Speaker identity — Engine 4.
- Timing/synchronization against the original video — Engine 8.
- Muxing the generated audio into a final container — Engine 9.
- Voice cloning / original-speaker-voice preservation — explicitly
  `MD-008`, Out of Scope, not this engine's job to work around.

## 4. Composition Opportunities

Engine 7 must call `VoiceManager`'s real routing (preferred, since it
already implements fallback + per-provider bookkeeping) or, if
`VoiceManager` is unavailable, fall back directly to
`CozyTTSBrowserAdapter.speakPreview()` — the same two-tier fallback
pattern `voice-manager.js` itself already uses internally, extended one
level. No new provider registry, no new preview-backend slot, no
reimplementation of Web Speech API calls.

## 5. Dependencies

- **Required existing:** `cozy-speech.js`, `voice-manager.js` (preferred),
  `cozy-tts-browser-adapter.js` (fallback) — all real, all unchanged.
  Engine 3's translated-segment output shape and Engine 4's
  speaker-assignment output shape (both already real, from CLOSED
  engines).
- **Required future:** Engine 8 (Synchronization) consumes Engine 7's
  output; Engine 9 (Media Encode) eventually needs the actual audio bytes
  Engine 7 cannot yet produce (see §9).
- **Required interfaces:** none new upstream; downstream, Engine 7's
  output contract (§7) is what Engine 8 will need to consume — recorded
  here so Engine 8's own future Compose isn't guessing at it.

## 6. Architecture / Data Flow

```
[Engine 3: translated segment + Engine 4: speakerId]
                    |
                    v
     Engine 7: generateSpeechForSegment(segment, options)
                    |
        +-----------+-----------+
        |                       |
   VoiceManager available   VoiceManager unavailable
        |                       |
        v                       v
  VoiceManager routing    CozyTTSBrowserAdapter.speakPreview()
   (provider + fallback)   (direct Web Speech API)
        |                       |
        +-----------+-----------+
                    v
      { segmentId, played, providerId, reason?, realAudioBuffer:false }
```

Every result explicitly reports `realAudioBuffer:false` — this is not a
placeholder value hidden for later, it is the honest, disclosed shape of
what this engine can produce today, given §2's finding.

## 7. Output Contract (per segment)

```js
{
  segmentId: string,
  played: boolean,          // true = the Web Speech API actually spoke this segment
  providerId: string|null,  // which provider actually spoke, per getLastSpokenProviderId()
  reason: string|null,      // present when played:false — never silent
  realAudioBuffer: false    // always false in this pass — see §9
}
```

## 8. Performance / Security / Privacy

- **Performance:** no target set — real measurement requires a browser
  runtime this session doesn't have (same disclosed gap as Engine 1's
  §8). Sequential per-segment synthesis is the only architecture
  available (Web Speech API has no batch mode); a long segment list will
  be slow in real use — flagged, not solved, this pass.
- **Security:** segment text passed to `SpeechSynthesisUtterance`
  verbatim by the existing adapter (already reviewed/shipped); Engine 7
  adds no new attack surface, only orchestration.
- **Privacy:** no data leaves the browser — Web Speech API synthesis is
  local in all major browsers' default configuration; Engine 7 doesn't
  change that.

## 9. Risks — the central open question

**Can Engine 7 produce anything Engine 8/9 can actually use, given §2's
finding?** Three real options, weighed honestly:

| Option | Real? | Trade-off |
|---|---|---|
| **A. Ship Engine 7 as playback-only** (this Compose's recommendation) | Yes — composes 100% real, already-shipped code | Engine 8/9 cannot receive an audio buffer from Engine 7 as designed. Downstream capability gap must be logged, not hidden. |
| B. Capture system audio via `getDisplayMedia({audio:true})` during playback | Technically real in supporting browsers | Captures *all* system audio, not just the utterance; requires an explicit user permission dialog per segment; unreliable across browsers; this session cannot verify it (no browser tool) — would be an **unverified** claim of "real capture," which Rule 6 forbids shipping as fact |
| C. Swap to a server-side/API TTS provider that returns real audio bytes | Would be genuinely real | Requires a paid third-party API + credentials this repository does not have configured — same category of gap as `MD-007`/`MD-008` (Out of Scope, no licensing this milestone) |

**Recommendation: Option A.** Building B without verification would mean
shipping an unverified capability claim; C is structurally out of scope
per the milestone's own existing `MD-007`/`MD-008` findings. Ship the
real, composable, already-shipped playback path, and log the buffer-
capture gap explicitly (new finding, §10) so Engine 8/9's own future
Compose reports don't discover this gap themselves without the earlier
disclosure.

## 10. Repair Queue Impact — new finding

**`MD-020`** (new): Engine 7 can produce real, verified *playback* of
synthesized speech (composing `VoiceManager`/`CozyTTSBrowserAdapter`), but
**no existing or newly-buildable-this-pass capability can capture that
speech as an audio buffer/track** for Engine 8 (Synchronization) or
Engine 9 (Media Encode) to consume. This is a real, load-bearing gap in
the Approved Implementation Order's own dependency chain (§9's Option A
vs. B/C). High priority — blocks Engine 9's actual output unless resolved
by a future milestone/Plan pass (most likely Option C, a licensed
server-side TTS integration, once that's back in scope).

## 11. Decision Table

| Decision | Chosen | Why |
|---|---|---|
| Compose vs. new provider registry | Compose `VoiceManager`/`CozyTTSBrowserAdapter` | Both real, already shipped, already fallback-aware |
| Buffer capture (§9) | Not attempted this pass (Option A only) | B unverifiable this session, C out of scope |
| Output contract | Explicit `realAudioBuffer:false` field | Same honesty pattern as Engine 1's `realDecode` flag — never hide the gap in a field name that looks like success |

## 12. Implementation Contract

1. New file: `core/modules/speech/generation/voice-generation-engine.js`
   — orchestration only. Calls `window.CozyOS.VoiceManager` if present,
   else `window.CozyOS.CozyTTSBrowserAdapter.speakPreview()`. Does not
   modify either.
2. `decodeMedia`-equivalent entry point: `generateSpeechForSegment(segment, options)`
   returning §7's contract, plus a batch helper
   `generateSpeechForSegments(segments, options)`.
3. Additive-only `EngineBridge` registration entry
   (`name: 'voice-generation'`), same pattern as Engine 1.
4. Tests: real, Node-executable orchestration/fallback-selection logic
   (mocking `VoiceManager`/`CozyTTSBrowserAdapter` the same way Engine 1's
   tests mocked `cozyMedia`) — the actual Web Speech API call itself is
   browser-only and **not** re-verified here (already shipped, already
   reviewed code); Engine 7's own tests verify only the new orchestration
   layer.
5. Must not modify `cozy-speech.js`, `voice-manager.js`, or
   `cozy-tts-browser-adapter.js`.
6. Must not attempt Option B or C from §9 this pass.

---

**Next step:** Phase 2 (Review/Approval) of this Compose Report.

---

## Phase 2 — Review / Approval (Engine 7)

Reviewed against: existing-capability claims (§2), ownership (§3), the
central playback-vs-capture finding (§9), and the Implementation Contract
(§12). No application code written or modified during this review (Rule
65/77).

### Independent re-verification (executed against the actual checkout)

| Compose claim | Re-verified how | Result |
|---|---|---|
| `speakPreview(config)` is a real, public export intended for reuse | Read `cozy-tts-browser-adapter.js` lines 78/140/164 directly | **Confirmed.** Defined, registered as the preview backend, and exported on the frozen `CozyTTSBrowserAdapter` object. |
| `VoiceManager` composes `CozyTTSBrowserAdapter.speakPreview()` as its fallback rather than reimplementing Web Speech API calls | Read `voice-manager.js` lines 51/299–317 directly | **Confirmed.** `getDependencies()` even lists `CozyTTSBrowserAdapter` explicitly; the fallback path calls `browserAdapter.speakPreview()` verbatim. |
| `getLastSpokenProviderId()` exists for honest after-the-fact reporting | Read `voice-manager.js` line 250 | **Confirmed.** |
| No existing or realistic browser capability can capture synthesized speech as a buffer/track (§2/§9's central finding) | Repo-wide search for `MediaStreamAudioDestinationNode`/`createMediaStreamDestination`/`getDisplayMedia` | **Confirmed as stated.** The only `getDisplayMedia` usage in the repository (`ldce-media-session-engine.js`, `cozy-connect.js`) is video-only screen-sharing, unrelated to audio capture from `speechSynthesis` — does not contradict or weaken §9's finding. |
| No name collision for `generateSpeechForSegment`/`VoiceGenerationEngine`/`voice-generation-engine` path or `EngineBridge` name | `grep` repo-wide, and read the full `REGISTRATIONS` array | **Confirmed.** Zero hits; `'voice-generation'` is free. |

No claim in the Compose report was found overstated or contradicted by actual source.

### Review against each item

**1. Ownership correct?** Yes — Engine 7 owns orchestration only; the three existing files it composes are read, not modified, confirmed by this review's own direct reads above, not just re-asserted from the Compose.

**2. §9's decision (Option A vs. B vs. C) sound?** Yes. Option B (`getDisplayMedia` audio capture) is real as an API but this session still has no browser tool to verify it — building it now would mean shipping an unverified "real capture" claim, which this repository's own Rule 6 forbids (same reasoning Engine 1's Phase 2 Review applied to `WebCodecs`). Option C is structurally out of scope per already-open `MD-007`/`MD-008`. Option A (playback-only, honestly labeled `realAudioBuffer:false`) is the only choice that ships something real without overclaiming.

**3. `MD-020` correctly scoped?** Yes — it's logged as a milestone-level gap blocking Engine 9, not framed as an Engine 7 defect, consistent with how `MD-016` was handled at Engine 1's own review.

**4. Implementation Contract (§12) sufficient?** Yes, with one addition: item 4's test plan (mock `VoiceManager`/`CozyTTSBrowserAdapter`, don't re-verify the underlying Web Speech API call) is confirmed the right scope — re-testing already-shipped, already-reviewed code would be redundant, not more rigorous.

### Verdict: **Approved**

Not Revised — every recommendation in the Compose Report (§4 composition choice, §9's Option A, §12's contract) holds up under independent re-verification with no gap found. `MD-020` stands as logged, no new finding this review.

**Phase 3 (Implementation) for Engine 7 is now unlocked** — to be done in a future session/phase per Rule 79 (this Review is itself the checkpoint; Phase 3 does not begin in this pass).

---

## Phase 3 — Implementation (executed)

Files created (additive only — nothing in the locked ownership table was
modified, confirmed by byte-for-byte hash comparison against the
pre-Phase-3 checkpoint for `cozy-speech.js`/`voice-manager.js`/
`cozy-tts-browser-adapter.js`):
- `core/modules/speech/generation/voice-generation-engine.js` — the
  engine facade: `generateSpeechForSegment(segment, deps)`,
  `generateSpeechForSegments(segments, deps)`, `getCapabilities()`,
  `getServiceManifest()`/`registerWithKernel(kernel)`, `on()`/`emit()`
  event bus. Composes `window.CozyOS.VoiceManager.speak()` (preferred) or
  `window.CozyOS.CozyTTSBrowserAdapter.speakPreview()` (fallback only if
  `VoiceManager` is unavailable) — same two-tier pattern `VoiceManager`
  itself already uses internally. Every result carries
  `realAudioBuffer:false`, honestly, per §2/§9/`MD-020`.
- `core/modules/speech/generation/tests/voice-generation-engine.test.js`
  — 13 real, executed `assert`-based tests, following Compose §12 item
  4's scope: mocks `VoiceManager`/`CozyTTSBrowserAdapter` (the underlying
  Web Speech API call is already-shipped, browser-only code, not
  re-verified here) and verifies only this engine's own new
  orchestration/fallback-selection/error-handling/batch logic.

One file modified, additively: `core/bridge/engine-bridge-bootstrap.js` —
one new `REGISTRATIONS` entry (`name: 'voice-generation'`, `globalName:
'VoiceGenerationEngine'`, `modulePath: '../modules/speech/generation/
voice-generation-engine.js'`, resolved and confirmed correct relative to
`core/bridge/`). No other entry touched.

**What was deliberately not built this pass:** Option B/C from Compose
§9 (system-audio capture or a licensed server-side TTS integration) — per
the Compose's own Implementation Contract item 6, and because Option B
still cannot be verified without a browser tool this session doesn't
have. `MD-020` remains open, unresolved by this Implementation, exactly
as disclosed at Compose/Review time — not a regression, the expected
outcome.

**Implementation self-check (not Phase 4 — Phase 4 is intentionally not
started this pass, per this session's explicit instruction to complete
only Phase 3):** before treating this Phase 3 work as done, the new
test file was run directly (`node core/modules/speech/generation/tests/
voice-generation-engine.test.js`) — 13/13 pass. All 6 prior engines' own
test suites (Engines 1–6, 129 tests total) were re-run unmodified to
confirm this addition introduced no regression — 129/129 still pass,
identical to their last-recorded counts. `cozy-speech.js`/
`voice-manager.js`/`cozy-tts-browser-adapter.js` were byte-for-byte
hash-compared against the pre-Phase-3 checkpoint and are unchanged. This
is ordinary due diligence on newly-written code, not a claim that the
formal Phase 4 (Verification) loop — including the still-outstanding
browser-runtime checks and `MD-020`'s buffer-capture question — has been
run or completed.

## Builder Lifecycle Status (Rule 65/68/79, this engine) — updated

```
Phase 0 — Repository Verification      ✅ Complete
Phase 1 — Compose                      ✅ Complete
Phase 2 — Review / Approval            ✅ Complete — Approved
Phase 3 — Implementation               ✅ Complete (self-checked by execution — see above; formal Phase 4 not started)
Phase 4 — Verification                 ⏳ NOT STARTED this pass, by explicit instruction — a future session's own phase, not folded into this one
Phase 5 — Registry Updates             ⏳ Deferred to that future Phase 4 pass
Phase 6 — Reports                      ✅ This document (Phase 3 section)
Phase 7 — Handoff                      ⏳ Deferred
Phase 8 — Package                      ⏳ Deferred
Phase 9 — Close                        ⏳ Deferred
```

**Next step:** per this session's explicit instruction (and Rule 79),
this checkpoint (documentation + hashes + ZIP + delivery) completes
Phase 3's own packaging. Phase 4 (Verification) begins in a future
session — this session stops after delivering this Phase 3 ZIP.

---

## Phase 4 — Verification (this pass)

Per Rule 69, this session resumed strictly from the repository's own
recorded state (verified: Repository SHA-256 recomputed with the
canonical `-print0`/`-z`/`-0` method matched `RELEASES.md`'s recorded
`2543557b859096af71ec33bc3de96548dce8e07879cd89291503af379d0143bc`
exactly). Per this session's explicit instruction, Phase 3 was not
reopened — verification only.

**Syntax:** `node --check` run against every file under `core/engines/`
and `core/modules/speech/` (all engines, not just Engine 7) — clean, zero
errors.

**New tests:** `core/modules/speech/generation/tests/voice-generation-engine.test.js`
executed directly — **13/13 real, executed tests pass**, including
fallback-selection logic (`VoiceManager` preferred, `CozyTTSBrowserAdapter`
used only if `VoiceManager` is absent), the fail-closed path when neither
is available (`'Neither VoiceManager nor CozyTTSBrowserAdapter is
available. Fail closed — no fabricated speech.'`), and the real
`SEGMENT_SPOKEN`/`SEGMENT_FAILED` event bus.

**Regression, all 6 prior engines re-run this pass, unmodified:**

| Engine | Test file | Result |
|---|---|---|
| 1 — Media Decode | `core/engines/media/decode/tests/media-decode-engine.test.js` | 23/23 pass |
| 2 — Language Detection | `core/engines/media/language/tests/language-detection-engine.test.js` | 31/31 pass |
| 3 — Translation Pipeline | `core/engines/media/translation/tests/translation-pipeline-engine.test.js` | 12/12 pass |
| 4 — Speaker Diarization | `core/engines/media/diarization/tests/speaker-diarization-engine.test.js` | 23/23 pass |
| 5 — Background Audio Separation | `core/engines/media/audio-separation/tests/background-audio-separation-engine.test.js` | 18/18 pass |
| 6 — Subtitle Timeline | `core/engines/media/subtitles/tests/subtitle-timeline-engine.test.js` | 22/22 pass |

129/129, byte-identical to the counts already on record for each engine
— zero interference from Engine 7. **142/142 total this pass** (129
regression + 13 new).

**Pre-existing, documented, unrelated failure — unchanged:**
`core/engines/media/tests/media-pipeline-manager.test.js` still fails at
the same line (`ERR_MODULE_NOT_FOUND` on the still-unbuilt
`core/engines/media/background-engine.js`, `MD-004`/`MD-009`) — confirmed
byte-identical stack trace to prior passes, not a new regression.

**Ownership re-confirmed:** `cozy-speech.js`, `voice-manager.js`, and
`cozy-tts-browser-adapter.js` — the three files Engine 7's Implementation
Contract item 5 forbids modifying — inspected directly this pass; no
edits found. `core/bridge/engine-bridge-bootstrap.js` carries exactly one
additive `voice-generation` entry, same pattern as Engines 1–6.

**No genuine implementation defect found.** Phase 3 was not reopened.

**Verdict: Phase 4 — PASSED.**

## Phase 5 — Registry Updates (this pass)

`MD-020` updated in `docs/builder/knowledge/repair-queue.md`: status
text revised to record Engine 7 Phase 4–9 complete/Closed this pass
(142/142 total tests, zero regressions); the underlying capability
question (no real audio-buffer capture from `speechSynthesis`) remains
correctly open/High, unresolved by Engine 7's own orchestration-only
scope, still blocking Engine 9. No other Repair Queue item touched by
this pass.

## Phase 6 — Reports (this pass)

This section. `LATEST.md`, `HANDOFF.md`,
`docs/builder/knowledge/milestone-waiting-queue.md`, and `RELEASES.md`
updated in the same pass (Rule 66) — not left as chat-only claims.

## Phase 7 — Handoff (this pass)

See `HANDOFF.md`'s Engine 7 certification block (added this pass) and
"Next Builder MUST" list — Engine 8 (Synchronization Engine) is unlocked
per Rule 68; its own Phase 0 is the correct next step for a future
session, not a continuation of this one (Rule 77).

## Phase 8 — Package (this pass)

Full repository ZIP built and verified this pass, per Rule 67/70/71.
Repository SHA-256 computed after all hashed files were finalized (Rule
70) and recorded only in `RELEASES.md` and this session's Rule 67
Delivery block. Package SHA-256 reported only in the Delivery block,
never written into any repository file.

## Phase 9 — Close (this pass)

## Builder Lifecycle Status (Rule 65/68/79, this engine) — FINAL

```
Phase 0 — Repository Verification      ✅ Complete
Phase 1 — Compose                      ✅ Complete
Phase 2 — Review / Approval            ✅ Complete — Approved
Phase 3 — Implementation               ✅ Complete
Phase 4 — Verification                 ✅ Complete this pass — PASSED, 142/142 tests, zero regressions
Phase 5 — Registry Updates             ✅ Complete this pass — MD-020 updated
Phase 6 — Reports                      ✅ Complete this pass — this document
Phase 7 — Handoff                      ✅ Complete this pass — HANDOFF.md updated
Phase 8 — Package                      ✅ Complete this pass — ZIP built & verified
Phase 9 — Close                        ✅ Complete this pass
```

**Engine 7 (Voice Generation Engine) is CLOSED.**

**Next step:** per Rule 68, Engine 8 (Synchronization Engine) is now
unlocked. Not started this pass, per this session's explicit scope (Rule
77/79) — its own Phase 0 is a future session's work.
