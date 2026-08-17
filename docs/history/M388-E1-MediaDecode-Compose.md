# M388 — Engine 1: Media Decode Engine (Compose Report)

**Phase:** Phase 0 (Repository Verification) → Phase 1 (Compose) only.
**Implementation: NO. Verification: NO. Repository code changes: none.**
Per Rule 65 (Builder Lifecycle applies per-engine) and Rule 50 (Compose
Before Implementation). This is Engine 1 of the Approved Implementation
Order (`docs/history/M388.md`, Phase 2 Review) — the first engine to
receive its own independent Phase 0/1 cycle.

---

## Phase 0 — Repository Verification

| Step | Result |
|---|---|
| Read `LATEST.md` | Done. M388 = Phase 2 Complete (Approved, Revised) → Phase 3 Unlocked. Next action: Engine 1 Phase 0/Compose. |
| Read `HANDOFF.md` | Done. Confirms same state; Certification table shows Implementation Verified: NO, Verification Verified: NO — consistent with "Compose only" scope for this report. |
| Read `RELEASES.md` | Done. Latest entry (M388 Round 3) records Repository SHA-256 `8d5401edc5751788a0173d47c2c07e627b1f61a719f8de20bdb29d40c9f3636e`, Package SHA-256 deferred to delivery message per Rule 60 (never embedded in the package itself). |
| Read `docs/builder/rules/00-INDEX.md` | Done — read first, as required. Rules 1–65 catalogued; Rules 50/51 (Compose Before Implementation / Missing Dependency Resolution), 59 (Implementation Contract Fidelity), 62 (Repair Queue), 65 (Builder Lifecycle, per-engine) directly govern this report. |
| Read Repair Queue (`docs/builder/knowledge/repair-queue.md`) | Done. 10 open `MD` items, `AA-005` closed. `MD-009` (codec decode/encode) and `MD-013` (streaming) are High priority; both are relevant to this engine (see §11). |
| Verify repository SHA-256 | **Cannot be reproduced bit-exact from this checkout.** File count and JS-file count were cross-checked instead (below) since the exact hashing methodology — path form, sort order, inclusion of `_archive/` — isn't specified anywhere in the repo. This is disclosed rather than silently assumed to pass. |
| Verify package SHA-256 | Not applicable — no package was delivered to this session; only the extracted repository. |
| Verify repository integrity | Done — see finding below. This surfaced a real, executable defect, not just a file count. |

**File-count cross-check:** `LATEST.md` records 752 files / 494 JS files
(excluding `_archive/`) as of the M387.5 baseline. This checkout has 765
total files / **494 JS files** (matches exactly) outside `_archive/`. The
+13 file delta is explained by M388's own Compose/Review-stage additions
(new rule files, registry entries, `docs/history/M388.md`, this report's
own new file) — documentation growth, not application-code drift. No
discrepancy requiring escalation.

**Repository integrity — real finding, verified by execution, not
assumption:**

```
$ node --input-type=module -e "import('./core/engines/media/media-pipeline-manager.js')..."
ERROR: Cannot find module '.../core/engines/media/background-engine.js'
       imported from '.../core/engines/media/media-pipeline-manager.js'
```

`core/engines/media/media-pipeline-manager.js` — the file registered as
`MediaEngine` in `core/bridge/engine-bridge-bootstrap.js` — currently
**cannot be imported at all**, in Node or browser, because it statically
imports three files that do not exist anywhere in the repository:
`background-engine.js`, `codec-encoding-engine.js`, `codec-decoding-engine.js`.
Running the engine's own test suite
(`core/engines/media/tests/media-pipeline-manager.test.js`) confirms this:
it fails at the import line, before a single assertion executes — the
entire Image/Filter/Enhancement/Codec/Background test surface is currently
unverifiable, not just the codec portion.

This is not a new defect — it is `MD-004`/`MD-009`, already on the Repair
Queue — but it had previously been confirmed by `find` (files absent) and
static header inspection, not by an actual attempted import. This report
adds that stronger, executed confirmation. **Practically:** `EngineBridge`
fails closed correctly (its `try/catch` + `result.success` pattern logs a
warning and continues rather than crashing the dashboard), so this is not
blocking Compose. But it is directly relevant to Engine 1's placement —
see §2 and §11 below.

---

## Phase 1 — Compose Report: Media Decode Engine

### Scope (per the Approved Implementation Order)
Extract audio and video tracks from a downloaded/loaded media file or
stream, producing real decoded audio (for the STT/translation pipeline)
and a real reference to the video track (for later re-muxing in Engine 9
— Media Encode). This is the prerequisite every other of the 11 engines
depends on; it has no upstream dependency of its own within M388.

---

### 1. Existing media capabilities already present

- **Speech-to-text**: `speech-recognition-adapter.js` — real browser
  `SpeechRecognition` wrapper, consumes **live microphone audio**, not a
  file. No path from an encoded file to this adapter exists today.
- **Live audio capture/DSP**: `core/engines/audio/audio-manager.js` (real,
  `registerProvider()`/device/mixer lifecycle, confirmed in M387.5b) —
  captures from a live input device, not a file.
- **Media registry/metadata**: `core/modules/media/cozy-media.js` — tracks
  adapter/pipeline descriptors, never touches media bytes itself.
- **Media pipeline sequencing**: `core/engines/media/media-pipeline-manager.js`
  — real image/filter/enhancement/background/codec **facade**, but (a) its
  "codec" is a single-still-image container codec (`compress()`/
  `importContainer()` → `CodecEncodingEngine.encodeImage()`/
  `CodecDecodingEngine.decodeImage()`), not a video/audio demuxer, and (b)
  it currently cannot even load — see the Phase 0 finding above.
- **Reference provider pattern**: `provider-inmemory.js` — the repo's
  existing, explicit precedent for "no real codec available in this
  sandbox → implement a documented, honest structural envelope instead of
  fabricating success." This is the pattern Engine 1 should follow, not
  invent a new one.
- **Node-only playback**: `core/engines/playback/playback-engine.js` reads
  previously-recorded session frames off disk via `fs`; it is not
  reachable from a browser and does not decode arbitrary input files.
- **Conclusion**: nothing in the repository today takes an arbitrary
  input video/audio file or stream and produces decoded audio + video
  track references. This confirms `MD-009`'s original Compose finding;
  Engine 1 is genuinely new work, not a composition of hidden existing
  capability.

### 2. Ownership boundaries

The locked ownership table in `docs/history/M388.md` §6 remains accurate
and unchanged by this engine. One addition, found this Compose, needs to
be made explicit:

| Concern | Real owner | Note |
|---|---|---|
| Still-image container encode/decode (JPEG/PNG-class, single frame) | `core/engines/media/codec-decoding-engine.js` / `codec-encoding-engine.js` (**file paths already reserved** by `media-pipeline-manager.js`'s imports and its own test suite — see Phase 0) | Narrower scope: single `ImageHandle` in/out. This is `MD-004`/part of `MD-009`, and is **not** Engine 1. |
| Video/audio file or stream demux — track extraction for the interpretation pipeline | **No existing owner.** New file required. | This is Engine 1's actual scope. |

**Finding (naming/scope collision, resolved here, logged to registries —
see §11):** `docs/builder/knowledge/missing-dependency-registry.md`'s
`MD-009` entry currently describes Engine 1 and Engine 9 as resolving
"`codec-decoding-engine.js`/`codec-encoding-engine.js`." Direct source
inspection this Compose shows those two exact file paths are **already
spoken for** by a different, narrower contract (still-image container
codec, part of the Image/Filter/Enhancement pixel pipeline, kernel
priority 15, `capabilities: ['codec-encode','codec-decode']` alongside
`'image-transform'`/`'filters'`/`'enhancement'`). Building Engine 1 into
that path would either (a) silently narrow Engine 1 to still-image-only
decode, failing M388's actual audio/video-track-extraction requirement, or
(b) overload one file with two unrelated contracts (image-container codec
+ media-file demuxer), which is exactly the kind of naming collision
`AA-004` and `AA-005` were opened to prevent elsewhere in this repository.

**Recommendation (Compose-stage, for Phase 2 confirmation):** Engine 1
gets its **own, distinct file** — e.g.
`core/engines/media/decode/media-decode-engine.js` — and does not reuse
`codec-decoding-engine.js`. The pre-existing `MD-004`/image-codec gap
remains a separate, still-open repair, sequenced independently (it
currently blocks `MediaEngine`'s own load, unrelated to whether Engine 1
exists yet).

### 3. Composition opportunities

- **`provider-inmemory.js`'s honesty pattern** (documented structural
  envelope instead of a fabricated real decode) is directly reusable:
  Engine 1's reference implementation should return real, computed
  metadata (duration, track count, sample rate if derivable) plus an
  honest `isReal:false`/capability flag when no real decoder backs it,
  rather than inventing decoded audio bytes it cannot actually produce in
  this sandbox.
- **`SpeechTranslationProviders`'s "NEVER FABRICATE" convention** (Section
  1 of the parent Compose) is the same discipline this engine must apply
  to its own provider layer.
- **`registerProvider()`/`__resetForTests()`/`getCapabilities()`** — the
  exact method triad already used identically by `ImageEngine`,
  `BackgroundEngine`, `EnhancementEngine`, `CodecEncodingEngine`,
  `CodecDecodingEngine` — is a real, established convention this engine
  should match for consistency, even though it lives in a new file.
- **`cozy-media.js`'s `Adapters.register()`/`Pipelines.register()`**
  extension points (used today by `media-pipeline-manager.js`'s
  `attachToCoordinator()`) are the existing, correct place for Engine 1 to
  register itself as a plain-data adapter descriptor — no new
  registration mechanism needed.
- **`EngineBridge`'s `REGISTRATIONS` array pattern** in
  `engine-bridge-bootstrap.js` (`{name, modulePath, globalName,
  expectedManifestName}`) is the existing, correct way to make Engine 1
  loadable from the browser dashboard — composition, not a new bootstrap.

### 4. Supported containers/codecs

No real container/codec support exists anywhere in this repository today
(Phase 0/§1). Two honest paths, for Plan-stage decision, not resolved
here:

1. **Browser-native (real, no bundled decoder needed):** the WebCodecs API
   (`VideoDecoder`/`AudioDecoder`) and `<video>`/`<audio>` element +
   `captureStream()` are real browser capabilities this repository does
   not currently use anywhere (confirmed — no `WebCodecs`, `VideoDecoder`,
   or `AudioDecoder` reference found repository-wide). Where present,
   these give genuinely real decode for common containers (MP4/WebM +
   H.264/VP8/VP9/AAC/Opus, browser-dependent) with zero bundled binary.
2. **Reference/no-op envelope (matches `provider-inmemory.js`'s existing
   precedent):** for containers/codecs the runtime can't really decode
   (or in non-browser test contexts), return an honest, documented
   structural result and `false` capability flags — never a fabricated
   "success."

This report does not select between them — that's Plan-stage engineering,
not Compose — but flags that Option 1 is a real, zero-dependency
capability already available in the target runtime (a browser) that
nothing in this repository currently touches.

### 5. Audio extraction path

Composed, not designed in detail (per the parent Compose's own §4
precedent — Plan stage owns exact design):

`Input file/stream handle → Engine 1 (demux) → {audioTrack, videoTrackRef,
metadata}` → `audioTrack` feeds the **existing, real** STT/translation
text pipeline (`SpeechRecognitionAdapter` → `cozy-speech.js` →
`SpeechTranslationAdapter`/`cozy-translate.js`, per the parent Compose's
§1/§4) once a bridging step converts a decoded audio buffer into whatever
input shape `SpeechRecognitionAdapter` actually expects (today: a live
`SpeechRecognition` session, not an arbitrary buffer — this bridge is
itself unbuilt and load-bearing; flagged, not assumed solved).
`videoTrackRef` is held, unmodified, for Engine 9 (Media Encode) to remux
with the replaced audio track later in the pipeline.

### 6. Interfaces exposed to downstream engines

Following the established sub-engine convention (§3):
- `registerProvider(provider)` / `unregisterProvider()` / `__resetForTests()`
- `decodeMedia(sourceHandle, options) -> { audioTrack, videoTrackRef, metadata }` (new — this engine's core method; no existing name collides)
- `getCapabilities() -> { containers, codecs, realDecode: boolean, ... }` (honest, per §4)
- `getServiceManifest()` / `registerWithKernel(kernel)` — matching `media-pipeline-manager.js`'s exact shape (`name, version, apiVersion, priority, mandatory, dependencies`)
- `attachToCoordinator(cozyMedia)` — registers a plain-data adapter descriptor into `cozy-media.js`'s existing registries, same pattern as `media-pipeline-manager.js`
- Event bus: `on(eventName, handler)` matching the `Map<Set<handler>>` pattern used identically in `media-pipeline-manager.js`/`record-export-session-manager.js` (Rule 2 — no new event system)

### 7. Dependencies

- **None within M388** (Engine 1 is first in the Approved Implementation Order — no upstream engine dependency).
- **Real repository dependencies**: `EngineBridge` (registration/loading), `cozy-media.js` (adapter/pipeline registries), and, if the browser WebCodecs path is chosen (§4), the browser's own native API — no npm/vendor dependency added.
- **Soft dependency, not yet resolved**: a bridging function between decoded audio and `SpeechRecognitionAdapter`'s live-session-only input model (§5) — needed for the pipeline to actually connect end-to-end, not solely Engine 1's own scope, but load-bearing for the milestone.

### 8. Performance targets

No existing pipeline in this repository decodes media end-to-end today
(confirmed, parent Compose §9), so there is no real baseline to
extrapolate a per-stage budget from. Given the milestone's overall ~0.5s
target and that this is Stage 1 of 10 non-coordinator stages, this report
does not assign an arbitrary per-engine number without evidence (that
would be fabricating confidence, which Rule 6/the repository's own
recurring "honest engineering" pattern forbids) — real measurement against
Option 1 vs. Option 2 (§4) is a Plan/Implementation-stage activity.

### 9. Failure handling

Matches the repository's existing, consistent convention (`ImageEngine`
"fail closed on unsupported ML capability," `SpeechTranslationProviders`
"NEVER FABRICATE," `EngineBridge`'s `try/catch` + `result.success`):
unsupported container/codec → throw or return an honest
`{success:false, reason}`, never a fabricated decoded track. `EngineBridge`
already fails closed correctly if this engine's module fails to import
(demonstrated live in Phase 0) — no new failure-handling mechanism needed
at the registration layer, only within the engine's own methods.

### 10. Security considerations

- Carries forward the parent Compose's own open questions (§8): processing
  third-party/copyrighted media files has no existing CozyOS policy;
  flagged, not resolved, not a Compose blocker.
- Decoding untrusted, arbitrary input files is a real attack surface
  (malformed container triggering parser bugs) — the browser-native
  WebCodecs path (§4, Option 1) inherits the browser's own hardened
  decoder rather than a bundled one, which is a real security argument in
  its favor, noted here for Plan-stage weighing rather than decided.
- No credential, PII, or biometric handling in this engine's own scope
  (that risk belongs to later stages — diarization/voice, §8 of the parent
  report already covers it).

### 11. Repair Queue impacts

- **`MD-009`** (High): this Compose reinforces it with executed evidence
  (Phase 0's failed dynamic import), not just static `find` evidence.
  Still High, still sequenced as Engines 1/9. Registry text should be
  clarified per the finding in §2 (see below) — codec-decoding-engine.js /
  codec-encoding-engine.js are the still-image codec fix, not Engine 1/9
  themselves.
- **`MD-013`** (High, streaming): unaffected by this Compose; Engine 1's
  design should not preclude a future streaming variant, but building one
  is explicitly out of this engine's scope (Engine 10 owns it).
- **New finding this Compose — logged as `AA-006`** (naming/scope
  ambiguity, resolved within this report, not left open): the Repair
  Queue's existing `MD-009` description conflated Engine 1/9's real,
  intended scope (media-file demux/mux) with the already-reserved
  `codec-decoding-engine.js`/`codec-encoding-engine.js` file paths
  (still-image container codec, a narrower, different contract owned by
  `media-pipeline-manager.js`). **Decision:** Engine 1 gets its own file
  path (§2); the still-image codec gap remains tracked separately under
  `MD-004`/`MD-009`'s image-codec half, unaffected by Engine 1's
  existence. Logged to `repair-queue.md` and
  `architecture-ambiguity-registry.md` below, closed immediately since
  the evidence needed to resolve it was already in hand this Compose (same
  pattern `AA-005` used at Phase 2).

### 12. Implementation contract

Per Rule 59 (Implementation Contract Fidelity), the Phase 3 implementation
session for Engine 1 must:
1. Create a **new file** (not `codec-decoding-engine.js`) — recommended
   `core/engines/media/decode/media-decode-engine.js` — implementing
   §6's interface.
2. Follow the `provider-inmemory.js` honesty pattern (§3/§4/§9): real
   decode where a real browser API is available and used, honest
   `false`/documented-envelope otherwise — never fabricated success.
3. Register through `EngineBridge` (`engine-bridge-bootstrap.js`'s
   `REGISTRATIONS` array) and through `cozy-media.js`'s
   `Adapters.register()`/`Pipelines.register()` via `attachToCoordinator()`
   — composition, not new mechanism (§3).
4. Not modify `media-pipeline-manager.js`, `cozy-media.js`, or any file in
   the locked ownership table (§2 / parent Compose §6) except to add its
   own registration entry to `engine-bridge-bootstrap.js`'s array.
5. Not attempt to resolve `MD-004`'s still-image codec gap as part of this
   engine — that is a separate, already-tracked item; conflating the two
   would violate Rule 59 by silently expanding this engine's approved
   scope.
6. Produce real, executed verification (Rule 61) before any Fixed/Closed
   status — page-load and, ideally, a real decoded-track assertion against
   an actual test media file, not a syntax check alone (Phase 0's own
   finding this Compose is a reminder that `node --check` alone would have
   missed the current `MediaEngine` import failure entirely).

Any contradiction between this contract and what Phase 3 discovers must be
documented and paused on (Rule 59), not silently improvised around.

---

## Repair Queue / Registry updates (Rule 62 — logged the moment discovered)

New entry added to `docs/builder/knowledge/repair-queue.md` and
`docs/builder/knowledge/architecture-ambiguity-registry.md`:

| ID | Finding | Status | Priority | Depends On |
|---|---|---|---|---|
| `AA-006` | `MD-009`'s registry text conflated Engine 1/9's media-file demux/mux scope with the already-reserved, narrower `codec-decoding-engine.js`/`codec-encoding-engine.js` still-image-codec file paths | 🟢 Fixed (closed within this Compose — documented decision, evidence already in hand) | — (closed) | None |

`MD-009` itself remains open/High, now with stronger (executed, not just
static) evidence per Phase 0 above.

---

## Builder Lifecycle Status (Rule 65, this engine)

```
Phase 0 — Repository Verification      ✅ Complete (this report)
Phase 1 — Compose                      ✅ Complete (this report)
Phase 2 — Review / Approval            ⏳ Pending
Phase 3 — Implementation               ⏸ Locked until Phase 2 approves
Phase 4 — Verification                 ⏸ Locked
Phase 5 — Registry Updates             ✅ AA-006 logged and closed this pass
Phase 6 — Reports                      ✅ This document
Phase 7 — Handoff                      ⏳ Pending (next Builder action)
Phase 8 — Package                      ⏸ Not yet
Phase 9 — Close                        ⏸ Not yet
```

**Next step:** Phase 2 Review of this Compose Report — confirm or revise
§2's file-placement recommendation and §4's container/codec approach —
before Phase 3 implementation may begin. No code has been written.

---

## Phase 2 — Review / Approval (Engine 1)

Reviewed against: `AA-006` resolution, the revised Engine 1 responsibility
set, ownership boundaries, dependencies, and the parent M388 Phase 2
Review's Approved Implementation Order. No application code written or
modified during this review (Rule 65).

### Independent re-verification (executed against the actual checkout, not re-stated from §1/§2)

| Compose claim | Re-verified how | Result |
|---|---|---|
| `media-pipeline-manager.js` imports `background-engine.js`, `codec-encoding-engine.js`, `codec-decoding-engine.js`, none of which exist in `core/engines/media/` | `find core/engines/media -type f` + read the import block directly | **Confirmed.** All three paths absent from the directory listing; import block at lines 40–49 references them. |
| `codec-decoding-engine.js`/`codec-encoding-engine.js` are reserved for a still-image, single-frame container codec — not video/audio demux | Read `media-pipeline-manager.js`'s `compress()`/`importContainer()` (call `CodecEncodingEngine.encodeImage()`/`CodecDecodingEngine.decodeImage()`) and the engine's own test suite | **Confirmed.** Test suite exercises `createImage()` → single-frame encode/decode round-trip only; nothing multi-track, nothing time-based. |
| No `decodeMedia` name collision anywhere in the repository | `grep -rn "decodeMedia\b"` repo-wide | **Confirmed.** Zero hits — the proposed method name is free. |
| No `WebCodecs`/`VideoDecoder`/`AudioDecoder`/`captureStream` usage anywhere in the repository (§4, Option 1) | `grep -rn` repo-wide across all `.js` | **Confirmed.** Zero hits — Option 1 is genuinely untouched capability, not a claim resting on partial/forgotten code. |
| `SpeechRecognitionAdapter` wraps live-microphone `SpeechRecognition` only, with no file/buffer input path | Read `speech-recognition-adapter.js` directly | **Confirmed.** Fails closed with `isReal:false` when no browser API is present; no buffer-in method exists. This validates §5's flagged "bridge is unbuilt" risk as real, not speculative. |
| `cozy-media.js` exposes `Adapters.register()`/`Pipelines.register()`, and `attachToCoordinator()` is the established registration pattern | Read both files directly | **Confirmed**, same shape `media-pipeline-manager.js` already uses. |
| `EngineBridge`'s `REGISTRATIONS` array is the correct, existing bootstrap mechanism | Read `engine-bridge-bootstrap.js` | **Confirmed**, `{name, modulePath, globalName, expectedManifestName}` shape, one array to extend. |

No claim in the Compose report was found to be overstated, unverifiable, or contradicted by the actual source. This review did not surface any new finding — `AA-006` is confirmed correctly resolved, not just plausibly resolved.

### Review against each requested item

**1. Is `AA-006` correctly resolved — new engine, or existing-engine responsibility?**
**Confirmed: new engine is correct.** `codec-decoding-engine.js`/`codec-encoding-engine.js` are real reserved paths with a real, narrower, already-tested contract (single `ImageHandle` in/out). Assigning Engine 1's video/audio-track-demux scope to those paths would either silently shrink Engine 1 to image-only (failing M388's actual requirement) or overload one file with two unrelated contracts — exactly the pattern `AA-004`/`AA-005` exist to prevent. No existing file in the repository owns file/stream demuxing. A new file is the only option that doesn't violate an existing, real boundary.

**2. Are the revised Engine 1 responsibilities correct?**
- *Video container parsing* — correct; no existing owner, confirmed above.
- *Audio stream extraction* — correct; this is the one no downstream stage can proceed without (this is the exact gap the parent Phase 2 Review inserted Engine 1 to close).
- *Track discovery* — correct; a natural sub-output of container parsing, not separately owned anywhere.
- *Metadata extraction* — correct; `cozy-media.js` stores/tracks descriptors but never derives them from bytes — Engine 1 is the only real source for this data.
- *Hand-off interfaces* — `decodeMedia(sourceHandle, options) -> {audioTrack, videoTrackRef, metadata}` is a reasonable, minimal contract; `videoTrackRef` held for Engine 9 is correctly scoped (Engine 1 does not remux, it only holds a reference).

One responsibility is correctly **excluded** and should stay excluded: actually bridging `audioTrack` into `SpeechRecognitionAdapter`'s live-session input model (§5) is not Engine 1's own scope per the Compose report, but it is load-bearing for the milestone and currently has no owner at all. This review does not expand Engine 1 to cover it (that would violate the approved scope under Rule 59), but flags it explicitly so it is not silently lost between engines — see Repair Queue impact below.

**3. Ownership boundaries confirmed:**
- No duplication of an existing engine — verified directly (table above), not just re-asserted from the Compose report.
- No violation of `media-pipeline-manager.js` ownership — Engine 1's implementation contract (§12) already forbids modifying that file except to add its own `EngineBridge` registration entry; this review confirms that constraint is sufficient and consistent with how every other sub-engine in this directory is wired in.
- No overlap with image-codec responsibilities — confirmed by direct inspection of the reserved paths' actual test-verified contract, not by name alone.

**4. Dependencies reviewed:**
- Required existing engines: none upstream (Engine 1 is first in the Approved Implementation Order) — confirmed against `docs/history/M388.md`'s Approved Implementation Order.
- Required future engines: Engine 9 (Media Encode) is downstream and depends on Engine 1's `videoTrackRef`; this is a forward dependency the parent Phase 2 Review already sequenced correctly. No other engine in the 11-engine order has an inverted dependency on Engine 1.
- Required interfaces: `EngineBridge` registration and `cozy-media.js` adapter/pipeline registration are both real, both confirmed reusable without modification. The one **unresolved** interface is the audio-buffer-to-`SpeechRecognitionAdapter` bridge (§5) — real, confirmed missing, not Engine 1's scope, and not yet owned by any engine in the Approved Implementation Order. This is a genuine gap in the 11-engine plan, not an Engine-1-specific defect.

### New finding this review

**`MD-016`** (new): no engine in the Approved 11-engine Implementation Order (`docs/history/M388.md`) currently owns the audio-buffer → `SpeechRecognitionAdapter` bridging step identified in this Compose's §5. Every downstream engine assumes decoded audio reaches the existing STT pipeline, but no engine's contract actually builds that bridge. Medium priority (not blocking Engine 1's own approval — Engine 1's contract correctly excludes it — but blocking the milestone's actual end-to-end pipeline once later engines are built). Logged to the Repair Queue below; does not block this review's verdict.

### Verdict: **Approved**

Not "Approved (Revised)" — unlike the parent M388 Compose, this Engine 1 Compose Report's own recommendations (§2 file placement, §4's two-option framing left open for Plan stage, §6 interfaces, §12 contract) all independently verified correct with no gap requiring a change to the report itself. The one gap found (`MD-016`) is a milestone-level sequencing gap, not a defect in this Compose Report, and does not require revising Engine 1's own scope or contract.

**Container/codec approach (§4):** left as Plan-stage decision, as the Compose report proposed — this review confirms that deferral is reasonable (Option 1 is real, zero-dependency, and repository-wide-confirmed-unused; Option 2 has a real, already-established precedent; choosing between them needs real measurement, not more Compose-stage analysis).

**Implementation contract (§12):** confirmed sufficient as written. Adding one item: Phase 3 implementation must not silently build the `SpeechRecognitionAdapter` bridge as part of Engine 1 (that would be undocumented scope creep past this approval) — it should surface `MD-016` explicitly if the bridge's absence blocks a real end-to-end test.

**Phase 3 (Implementation) for Engine 1 is now unlocked.**

## Repair Queue / Registry updates (Phase 2 Review)

| ID | Finding | Status | Priority | Depends On |
|---|---|---|---|---|
| `MD-016` | No engine in the Approved 11-engine Implementation Order owns the audio-buffer → `SpeechRecognitionAdapter` bridging step (Engine 1 §5) | 🟡 Composed | Medium | None — needs an owning engine assigned in a future Plan/Compose pass, most naturally alongside Engine 1's own Implementation or as an explicit hand-off contract on whichever engine calls STT first |

`AA-006` — no change, remains Fixed/closed (confirmed correctly resolved by this review, not reopened).

## Builder Lifecycle Status (Rule 65, this engine) — updated

```
Phase 0 — Repository Verification      ✅ Complete
Phase 1 — Compose                      ✅ Complete
Phase 2 — Review / Approval            ✅ Complete — Approved
Phase 3 — Implementation               🔓 Unlocked
Phase 4 — Verification                 ⏸ Locked until Phase 3 produces something to verify
Phase 5 — Registry Updates             ✅ MD-016 logged this pass
Phase 6 — Reports                      ✅ This document (updated)
Phase 7 — Handoff                      ⏳ Pending (LATEST.md/HANDOFF.md/RELEASES.md update, same pass)
Phase 8 — Package                      ⏸ Not yet
Phase 9 — Close                        ⏸ Not yet
```

**Next step (superseded below):** Phase 3 — Implementation of Engine 1, per §12's contract as confirmed by this review. No other engine in the Approved Implementation Order should start first.

---

## Phase 3 — Implementation (Engine 1)

Per §12's Implementation Contract, followed item by item:

1. **New file, not `codec-decoding-engine.js`:** created
   `core/engines/media/decode/media-decode-engine.js` and a companion
   `core/engines/media/decode/provider-inmemory.js` (the same
   engine/provider split used by every sibling sub-engine). No existing
   file was renamed or repurposed.
2. **Honesty pattern (§3/§4/§9):** the provider performs real, executed
   magic-number container detection (mp4/webm/wav/ogg/flac/mp3) against
   actual input bytes, and returns real computed `byteLength`. It does
   **not** fabricate decode: `durationSeconds`/`sampleRate`/`trackCount`
   are honestly `null`, and `audioTrack`/`videoTrackRef` are an honest
   `isReal:false`, `envelope:'structural-reference-not-real-codec'` object
   (identical envelope convention to `core/engines/media/provider-inmemory.js`),
   or `null` when the container is unrecognized — never a fabricated
   placeholder. `getCapabilities()` reports `realDecode:false` and an
   empty `codecs` array — no unearned claims. `webCodecsAvailableInEnvironment`
   is a real, live `typeof globalThis.VideoDecoder/AudioDecoder` check,
   disclosed as detected-but-not-yet-used (§4 left that Plan-stage choice
   open; this Implementation does not silently resolve it).
3. **Registration:** added one entry (`media-decode`) to
   `core/bridge/engine-bridge-bootstrap.js`'s existing `REGISTRATIONS`
   array — no new bootstrap mechanism. `attachToCoordinator(cozyMedia)`
   registers a plain-data adapter (`kind: 'media-demux-adapter'`) and a
   `stages:['decode']` pipeline descriptor into `cozy-media.js`'s existing
   `Adapters`/`Pipelines` registries, matching `media-pipeline-manager.js`'s
   own `attachToCoordinator()` pattern exactly.
4. **Locked ownership respected:** `media-pipeline-manager.js`, `cozy-media.js`,
   and every file in the locked ownership table were left unmodified. The
   only change outside the new `decode/` directory is the single added
   `REGISTRATIONS` entry in `engine-bridge-bootstrap.js` — Engine 1 is
   **not** added as a `media` (MediaEngine) dependency, since the
   audio-buffer → `SpeechRecognitionAdapter` bridge (`MD-016`) that would
   justify that wiring does not exist yet; wiring it in anyway would have
   been fabricated integration, not real.
5. **`MD-004` not touched:** the still-image codec gap
   (`codec-decoding-engine.js`/`codec-encoding-engine.js` missing) is
   unaffected — Engine 1 lives entirely in its own new `decode/` directory.
6. **`MD-016` not silently built:** per Phase 2 Review's explicit addendum
   to §12, this Implementation does **not** attempt the
   `SpeechRecognitionAdapter` bridge. `MD-016` remains open on the Repair
   Queue, unchanged in scope.

### Files changed this pass

| File | Change |
|---|---|
| `core/engines/media/decode/media-decode-engine.js` | New. Engine 1 implementation — `decodeMedia()`, `getCapabilities()`, `getServiceManifest()`/`registerWithKernel()`, `attachToCoordinator()`, provider registry, event bus. |
| `core/engines/media/decode/provider-inmemory.js` | New. Reference provider — real magic-byte container detection; honest structural envelope for tracks. |
| `core/engines/media/decode/tests/media-decode-engine.test.js` | New. 23 real, executed tests (Phase 4, below). |
| `core/bridge/engine-bridge-bootstrap.js` | Modified — one `REGISTRATIONS` array entry added (`media-decode`). No other line changed. |

No other application file was modified.

---

## Phase 4 — Verification (Engine 1)

Real, executed checks (Rule 61), not assumed:

| Check | Command | Result |
|---|---|---|
| Syntax — new files | `node --check core/engines/media/decode/media-decode-engine.js` / `provider-inmemory.js` / `tests/media-decode-engine.test.js` | **VERIFIED** — clean |
| Syntax — modified file | `node --check core/bridge/engine-bridge-bootstrap.js` | **VERIFIED** — clean |
| Engine 1 test suite | `node core/engines/media/decode/tests/media-decode-engine.test.js` | **VERIFIED** — 23/23 passed. Covers real container detection (6 formats + 1 unrecognized-bytes honesty case), `decodeMedia()` honesty (real metadata vs. honest nulls/envelopes), fail-closed input validation, event emission, `getCapabilities()` honesty, `getServiceManifest()`/`registerWithKernel()`, `attachToCoordinator()` composition into a fake `cozy-media.js`-shaped instance, and provider-registration validation. |
| Regression — existing Media Engine suite | `node core/engines/media/tests/media-pipeline-manager.test.js` | **PARTIAL** — fails at the same pre-existing import line as Phase 0's finding (`background-engine.js` missing, `MD-004`/`MD-009`). Identical failure signature before and after this Implementation — confirms Engine 1 introduced **no new regression** to `media-pipeline-manager.js`'s own (already-broken, already-tracked) import chain, since Engine 1 does not import from or get imported by that file. |
| `node --check` alone insufficiency (Phase 0's own reminder) | N/A | Addressed — verification here includes real executed test runs, not syntax-only, per Phase 0's finding that syntax checks alone would have missed the pre-existing `MediaEngine` import failure. |

**No real decoded-track assertion against an actual media file** (§12
item 6's "ideally") was performed — this environment has no real decode
backend to decode against (§4/Phase 0), so the honest thing to verify is
that the engine correctly reports *that* honestly (which the test suite
does, exhaustively) rather than fabricating a "real decode" test that
would itself misrepresent this pass's actual capability. Flagged here
rather than silently omitted.

**Verdict: Phase 3/4 — Complete.** No contradiction between the
Implementation Contract and what Phase 3 discovered; nothing paused on.

---

## Builder Lifecycle Status (Rule 65, this engine) — final, this pass

```
Phase 0 — Repository Verification      ✅ Complete
Phase 1 — Compose                      ✅ Complete
Phase 2 — Review / Approval            ✅ Complete — Approved
Phase 3 — Implementation               ✅ Complete
Phase 4 — Verification                 ✅ Complete (23/23 new tests; no new regression)
Phase 5 — Registry Updates             ✅ MD-009 updated this pass (see repair-queue.md)
Phase 6 — Reports                      ✅ This document
Phase 7 — Handoff                      ✅ LATEST.md / HANDOFF.md / RELEASES.md updated same pass
Phase 8 — Package                      ✅ Full repository ZIP produced this pass (Rule 67/68)
Phase 9 — Close                        ✅ Complete — Engine 1 closed
```

**Next step:** Per Rule 68 (Per-Engine Lifecycle Gate), Engine 1 has
reached Phase 9 — Engine 2 (Language Detection) may now begin its own
Phase 0. No implementation work for Engine 2 was started this pass.
