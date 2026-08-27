# Cozy Builder — Missing Dependency Registry (MD)

Per Rule 51: a missing-dependency record is opened when a required file
isn't present in the verified workspace. Not automatically an
implementation task — see Rule 51's own search-and-classify sequence.
Closes when the real file is supplied, regardless of what happens next
(reuse/repair/extend, or in rare cases a Builder-Generated stub if
truly nothing authoritative exists anywhere).

**Precondition (Rule 53 registry gate):** before opening a new `MD-NNN`
entry, the current workspace must be classified as one of Rule 53's
four types. A Builder Patch / Documentation / Feature ZIP not
containing a file is evidence the file is absent from *that* smaller
workspace only — never evidence it's missing from CozyOS as a whole.
If no Main Production ZIP has been supplied or checked this session,
the entry must say so explicitly rather than imply production-wide
absence. (MD-001's history is the reason this precondition exists —
see its own entry below.)

---

## MD-001 — `core/modules/builder/understanding-engine.js`

**Status:** Closed — file confirmed present and loaded in the verified Main Production ZIP (`core/modules/builder/understanding-engine.js`, 700 lines, `node --check` clean)

**Why it was previously classified "existing, not loaded":** the file was absent from the smaller Builder-side ZIPs used in earlier sessions; only the full `CozyOS-M372-BuilderObservation-Complete.zip` (Main Production ZIP) actually contains it. Referenced by `dashboard.html:1010` (now confirmed accurate); composed as a required live dependency by `observation-engine.js`; has a real inventory record in Builder Knowledge (v1.0.0-ENTERPRISE) — all three now confirmed against the real source, not just cited evidence.

**Resolution:** file supplied via the Main Production ZIP; no repair needed — reused as-is per Rule 51.

**Related record:** `knowledge/architecture-ambiguity-registry.md` AA-001 — closed in the same pass; see `reports/layer2-compose-analysis-AA-001.md` for the full comparison.

---

## MD-002 — `core/modules/identity/cozy-identity.js`

**Status:** Open

**Why it's classified "existing (superseded), not loaded":** named live replacement owners already confirmed in the workspace (`IdentityEngine`, `AuthCoordinator`, `TrustedDeviceManager`, `SessionService`) per `reports/cozy-identity-investigation.md`.

**Resolution branch per Rule 51:** archive banner application only (decision already made — see `reports/cozy-identity-archive-certification.md`); not a reuse/extend candidate, since it's already determined to be superseded. Builder-Generated branch does not apply.

---

## MD-003 — `core/identity/developer-profile.js`

**Status:** Closed (M379, RP-006)

**Why it's classified "existing, not loaded":** confirmed live and loaded in the real system via a grep hit cited in `reports/cozy-identity-investigation.md` §3.

**Resolution:** Header corrected — repaired directly, logged as RP-006. See also `knowledge/documentation-integrity-registry.md` DI-001.

---

## MD-004 — `core/engines/media/background-engine.js`, `codec-encoding-engine.js`, `codec-decoding-engine.js`

**Status:** Open — intentional, documented missing dependency (M387.5 Finding 8)

**Workspace classification (Rule 53 registry gate):** the workspace this session is the real Main Production ZIP (`CozyOS-main-v2_25_15-M387-CERTIFIED.zip`, verified 752 files excluding `_archive/`, 494 JS files) — not a smaller Builder Patch/Documentation/Feature ZIP. Absence confirmed against the actual production tree, not a subset workspace.

**Evidence:** `core/engines/media/media-pipeline-manager.js` (lines 41, 44, 45) imports `./background-engine.js`, `./codec-encoding-engine.js`, and `./codec-decoding-engine.js` from its own directory. A repository-wide `find . -iname "background-engine.js" -o -iname "codec-encoding-engine.js" -o -iname "codec-decoding-engine.js"` returns nothing — confirmed absent from the entire verified workspace, not merely unloaded. Real-browser verification (M387.5, Round 1–3) confirms the resulting effect: `core/bridge/engine-bridge-bootstrap.js` dynamically imports `media-pipeline-manager.js` for the `"media"` capability, which then fails to resolve its own 3 imports, producing `net::ERR_ABORTED` on each and `[EngineBridge] "media" unavailable: Failed to fetch dynamically imported module`.

**Search performed per Rule 51 before classifying as missing (not merely unloaded):** grepped the full repository (all `.js` files) for `background-engine`, `codec-encoding-engine`, and `codec-decoding-engine` under any similar-but-not-identical name or path — no authoritative implementation exists anywhere in the workspace, checked-in or archived. `EngineBridge` itself already fails this closed (catches the rejected dynamic import, logs a clear warning, continues booting the rest of the dashboard) — the failure mode is not itself a defect, only the missing capability is.

**Resolution branch per Rule 51:** none of Reuse / Repair / Extend apply (nothing to reuse — no authoritative implementation found anywhere). Refactoring doesn't apply (nothing to refactor). A **Builder-Generated stub** is the remaining branch, but is deliberately **not created this pass**: writing 3 real codec/background media engines is implementation-scale new-feature work, explicitly out of scope for a browser-verification pass under the "Do Not Build" constraint (M387.5's compose report: "Do not add new engines"). Documenting this as an intentional, acknowledged gap — not fixing it — is the correct action for this pass.

**Recommendation for next Builder:** if `"media"` capability is required by a near-term milestone, scope a real compose pass for these 3 files specifically (not a verification pass); until then, `EngineBridge`'s existing fail-closed handling for `"media"` is the correct, honest behavior and needs no further change.

---

## MD-005 — `core/engines/audio/provider-browser.js`

**Status:** Open — intentional, documented missing dependency (M387.5b, discovered while closing AA-004)

**Workspace classification (Rule 53 registry gate):** same Main Production ZIP workspace as MD-004 above (see that entry) — not a smaller Builder Patch/Documentation/Feature ZIP.

**Evidence:** `core/bridge/engine-bridge-bootstrap.js`'s `wireBrowserAudioProvider()` imports `../engines/audio/provider-browser.js`; a repository-wide `find` and `grep` confirm the file doesn't exist anywhere. **Why this was only just discovered:** before AA-004's fix, `window.CozyOS.AudioManager`'s registration always failed at the `ServiceAdapter.expose()` conflict guard (colliding with `AudioEngine`), so `wireBrowserAudioProvider()` — gated on that registration's success — was never actually reached in any of M387.5's Rounds 1–8. Fixing AA-004 correctly let this code path run for the first time, which is what surfaced this separate, real, pre-existing gap. Real-browser verification (M387.5b) confirms the effect: `net::ERR_ABORTED` on the import, and `[EngineBridge] Real browser audio provider unavailable: ...` — logged and handled gracefully (Rule 6 fail-closed convention already built into `wireBrowserAudioProvider()` itself), not a crash.

**Search performed per Rule 51:** grepped the whole repository for `provider-browser` under any similar name — no authoritative implementation exists. Notably, the equivalent file doesn't exist for Camera either (`core/engines/camera/` has only `provider-inmemory.js`, no `provider-browser.js`) — this is a real, symmetric gap across both engines, not an audio-specific oversight, which supports treating it as legitimately unbuilt rather than lost/misplaced.

**Resolution branch per Rule 51:** none of Reuse/Repair/Extend apply (nothing to reuse). A Builder-Generated stub is the remaining branch, but is **deliberately not created this pass**: a real `getUserMedia`-backed provider (device enumeration, connect/disconnect, health checks, matching `audio-manager.js`'s documented provider interface) is real feature-scale implementation work, out of scope for a governance/verification-focused repair (AA-004's own scope was explicitly "remove the duplicate ownership," not "build the provider that consumes the now-correctly-named engine").

**Recommendation for next Builder:** if real browser microphone capture via `AudioManager` is required by a near-term milestone, scope a dedicated compose pass for this file (and its Camera-side equivalent, `core/engines/camera/provider-browser.js`, which has the identical gap) — until then, `wireBrowserAudioProvider()`'s existing fail-closed handling is correct and needs no further change.


---

## MD-007 through MD-015 — M388 Compose-Stage Findings (Living Media Interpreter)

**Status:** 🟡 Composed (8 of 9) — found during M388's Compose report.
`MD-009` updated to 🔵 Implementing this pass — Engine 1 (decode half)
implemented and verified (`core/engines/media/decode/media-decode-engine.js`,
23/23 real tests); Engine 9 (encode half) not started, so `MD-009`
remains open overall. Phase 2 Review (`docs/history/M388.md`) sequenced
`MD-009`–`MD-014` into the Approved Implementation Order; `MD-007`/`MD-008`
remain structurally excluded from M388 entirely (see note below). No code
changed for the other 8 entries this pass.

Full evidence, ownership-map cross-reference, and duplicate-engine-scan
reasoning for every entry below: `docs/history/M388.md`. Summary only here,
per this registry's convention.

| ID | Finding | Priority | M388 Phase 2 disposition |
|---|---|---|---|
| MD-007 | No bundled/always-available machine translation engine — real MT depends entirely on an optional, experimental Chrome API (`self.Translator`) | High | **Out of Scope for M388 entirely** — the original task lists "Licensing of translation/voice models" as Out of Scope; not just deferred, structurally excluded |
| MD-008 | No voice-cloning/neural TTS capability anywhere in the repository (`charles-voice-provider.js`'s own header already discloses this) | High | **Out of Scope for M388 entirely**, same reason as `MD-007` |
| MD-009 | No video/audio-file/stream demux (decode) or mux (encode) capability — related to but **distinct from** `MD-004`'s `codec-encoding-engine.js`/`codec-decoding-engine.js` (confirmed by Engine 1 Compose, `AA-006`: those two reserved file paths are a narrower, already-defined still-image container codec, part of `media-pipeline-manager.js`'s Image/Filter/Enhancement pixel pipeline — not a media-file demuxer). `MD-009` now refers specifically to the media-file/stream track-extraction capability, sequenced as new, separate files. `MD-004`'s still-image codec gap remains open on its own, and independently confirmed still-broken this Compose (`media-pipeline-manager.js` fails a real, executed dynamic import today) | High | Sequenced as Engines 1 (decode) and 9 (encode) — the required first step. Recommended new path per `docs/history/M388-E1-MediaDecode-Compose.md`: `core/engines/media/decode/media-decode-engine.js` (Engine 1), analogous new path for Engine 9 |
| MD-010 | No background/ambient audio separation (preserve music/SFX while replacing speech) | Medium | Sequenced as Engine 5 |
| MD-011 | No speaker diarization capability | Medium | Sequenced as Engine 4 |
| MD-012 | No automatic language-detection capability (explicitly disclosed absent in `speech-translation-adapter.js`'s own header; independently confirmed absent in `core/modules/ChurchOS/church-worship-session.js`'s own honest-gaps disclosure) | Medium | Sequenced as Engine 2 — Phase 0/Compose/Phase 2 Review complete (Approved, unrevised), see `docs/history/M388-E2-LanguageDetection-Compose.md`; Implementation is the unlocked next step |
| MD-013 | No streaming/real-time low-latency transcode pipeline (explicitly disclosed absent) | High | Sequenced as Engine 10 |
| MD-014 | No subtitle export/rendering capability (`.srt`, burn-in) beyond `cozy-live.js`'s structural channel tracking | Low | Sequenced as Engine 6 |
| MD-015 | Lip-sync capability confirmed absent repository-wide | Low (explicitly Out of Scope this Compose) | Remains Out of Scope, unsequenced |

**Resolution branch per Rule 51 (all 9):** none of Reuse/Repair/Extend
apply — confirmed via the full repository inventory in `docs/history/M388.md`
Section 1. Builder-Generated stubs are **not created this pass** — every
one is real, feature-scale implementation work, and this milestone is
Compose-only by explicit instruction. Sizing and sequencing is a Plan-stage
decision, not resolved here.

---

## MD-016 — Engine 1 Phase 2 Review Finding (audio-buffer → STT bridge has no owner)

**Status:** 🟡 Composed. Found during Engine 1 (Media Decode Engine)'s
Phase 2 Review, not during its Compose — the Compose report (§5) already
flagged the bridge between decoded audio and `SpeechRecognitionAdapter`'s
live-session-only input model as unbuilt and load-bearing, but did not
check whether any *other* engine in the Approved 11-engine Implementation
Order (`docs/history/M388.md`) owns it. This review checked and confirmed:
none do.

**Evidence:** `speech-recognition-adapter.js` wraps only a live
`SpeechRecognition`/`webkitSpeechRecognition` browser session; it exposes
no buffer-input method, and fails closed (`isReal:false`) when the browser
API is absent. Every one of the 11 engines in the Approved Implementation
Order assumes decoded audio reaches this existing STT pipeline somehow, but
no engine's approved contract actually builds that connection.

**Why this doesn't block Engine 1's approval:** Engine 1's own Compose
Report correctly excludes this bridge from its scope (§5, §12 — building it
would be scope creep past Rule 59's implementation contract). This is a
milestone-sequencing gap, not a defect in Engine 1's design.

**Resolution branch per Rule 51:** not yet determined — needs a Plan-stage
decision on which engine (most naturally Engine 1 itself, as an explicit
follow-on to its own decode output, or a dedicated small bridging step)
owns this before the milestone's pipeline can run end-to-end. Not created
this pass.

**Recommendation for next Builder:** resolve before, or during, Engine 1's
own Phase 3 Implementation — at minimum, Engine 1's Phase 4 Verification
should not claim a working end-to-end decode-to-transcript path without
either this bridge existing or the gap being explicitly re-disclosed as
still open.
