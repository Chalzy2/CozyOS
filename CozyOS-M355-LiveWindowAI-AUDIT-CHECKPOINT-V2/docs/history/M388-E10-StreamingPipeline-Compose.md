# M388 Engine 10 — Streaming/Playback Pipeline Engine — Compose & Review

Per Rule 65 Phase 0/1/2, Rule 69, Rule 77 (Phase Focus).

## ⚠️ Rule 69 Naming Note — read first

This session's prompt named Engine 10 "Media Export/Delivery Engine"
and Engine 11 "Living AI Learning Engine." Neither matches the
repository's own real, twice-confirmed Approved Implementation Order
(`docs/history/M388.md`, § "Approved Implementation Order"):

> 10. **Streaming/Playback Pipeline** (new — resolves `MD-013`;
> live-stream case only, composes `cozy-live.js`'s existing
> room/channel/stream scaffolding for the multi-language-channel
> structure).
> 11. **Video Interpreter Coordinator** (new — orchestrates 1–10 ...).

Per Rule 69, the repository is authoritative. This Compose proceeds
against the real Engine 10 — **Streaming/Playback Pipeline Engine** —
not the prompt's description. Engine 11 remains, and will remain until
its own Compose says otherwise, the **Video Interpreter Coordinator**.

## Phase 0 — Repository Verification

- Repository SHA-256 reverified against `RELEASES.md` before this
  Compose began — exact match (see this session's own trailing note in
  `LATEST.md`).
- `modules/live/cozy-live.js` already owns a real Session → Room →
  Stream → TranslationStream → AudioChannel/SubtitleChannel object
  model: `createStream`/`setStreamStatus` (`IDLE`/`LIVE`/`ENDED`)/
  `createTranslationStream`/`listStreams`/`listTranslationStreams`.
  `relaySpeechSegment(sessionId, roomId, sourceAudioRef, options)`
  already accepts an optional `streamId` and stamps it onto each
  recorded segment. This is real, but it is pure state bookkeeping —
  `syncTimestamp()`'s own docstring says explicitly: *"This module does
  not perform clock discipline itself — it only records and re-emits
  the checkpoint so CozyNetwork can propagate it."* No real WebRTC or
  other low-latency transport exists anywhere in this repository
  (confirmed by the same `MD-013` search already on record: *"no
  WebRTC/streaming-transcode infrastructure found"*).
- `core/engines/playback/playback-engine.js` (pre-existing, real,
  unrelated milestone) replays an **already-recorded** session read
  from Recording Engine's manifest/segment files — real wall-clock
  pacing, but strictly post-hoc playback of a finished capture, not a
  live low-latency relay. Its own docstring disclaims recording capture
  and video transformation as unowned; live-stream relay is not listed
  as owned either. **Not a duplicate of Engine 10** — different data
  source (finished recording vs. live `relaySpeechSegment()` calls),
  same disambiguation pattern as Engine 5's `AA-007` and Engine 9's
  `record-export-session-manager.js` note.
- `core/engines/media/` directory listing: no `streaming/` or
  `playback/` subdirectory exists — `core/engines/media/streaming/` is
  free.
- `core/bridge/engine-bridge-bootstrap.js`'s `REGISTRATIONS` array has
  no `'streaming-pipeline'` (or similarly named) entry.

## Phase 1 — Compose (proposed scope)

**Honest scope:** per `MD-013`'s own repair-queue text and Compose
§4/§9's established honesty pattern (Engine 1's `realDecode: false`,
Engine 9's `realEncode: false`), Engine 10 **cannot** honestly claim
real low-latency network transport — no WebRTC/streaming-transcode
backend exists in this environment, and building one is out of scope
for a composition-only engine. Instead, Engine 10 is a real,
deterministic **per-stream segment throughput/latency instrumentation
sidecar** over `cozy-live.js`'s existing Stream/TranslationStream
scaffolding — it composes `createStream`/`setStreamStatus`/
`relaySpeechSegment`'s real, already-recorded segment timestamps into
real per-stream metrics (segment count, computed latency from real
`segment.timestamp` vs. a real relay-observed time the caller supplies),
never fabricating an actual transport-level latency measurement it
didn't observe.

Public surface (this Compose's target for Phase 3):
- `beginStreamTracking(cozyLive, sessionId, roomId, streamId)` — real
  validation that the stream exists via `cozyLive.getStream()`.
- `recordSegmentRelay(streamId, segment, observedAtMs)` — takes a real
  segment object (as returned by `relaySpeechSegment()`, which has a
  real `segmentId`) and a real caller-supplied `observedAtMs`
  (`Date.now()` at the point the caller actually observed/delivered the
  segment), computes `latencyMs = observedAtMs - segment.timestamp`
  only when `segment.timestamp` is a real number — never invents a
  latency figure.
- `getStreamMetrics(streamId)` — `{segmentCount, averageLatencyMs,
  minLatencyMs, maxLatencyMs}`, all computed only from real recorded
  observations; `averageLatencyMs: null` (not `0` or a guess) when no
  segment has been recorded yet.
- `endStreamTracking(streamId)` — clears this engine's own tracking
  state for that stream (does not call `removeStream()` — lifecycle of
  the underlying Stream itself stays owned by `cozy-live.js`).
- `getCapabilities()` — honestly reports
  `realLowLatencyTransport: false` (no WebRTC/streaming backend exists),
  `supportsSegmentLatencyInstrumentation: true`.
- `getServiceManifest()` / `registerWithKernel()` — same pattern as
  Engines 1–9.
- Bridge registration in `engine-bridge-bootstrap.js`.

## Phase 2 — Review/Approval

**Approved.** Scope matches repository reality (Phase 0 findings above),
no duplicate ownership (`playback-engine.js` independently
disambiguated), no fabricated transport capability. Final Implementation
Contract:

1. New file only: `core/engines/media/streaming/streaming-pipeline-engine.js`.
2. `modules/live/cozy-live.js` and `core/engines/playback/playback-engine.js`
   remain untouched — composition only, via `cozy-live.js`'s existing
   public API (`getStream`/`listStreams`/etc., never its internals).
3. One additive `REGISTRATIONS` entry in `engine-bridge-bootstrap.js`.
4. Never fabricates a latency/throughput figure that wasn't computed
   from a real, caller-supplied observation — `getStreamMetrics()` must
   return `null` fields rather than `0` or an invented default when no
   real observation exists yet.
5. `getCapabilities().realLowLatencyTransport` must stay honestly
   `false` — this engine does not resolve `MD-013`'s core transport gap,
   only instruments the existing state model around it, same honesty
   boundary Engine 1/9 already drew for decode/encode.
6. Does not implement Engine 11 (Video Interpreter Coordinator) — Locked
   per Rule 68.
7. Fails closed, never throws on a stream that doesn't exist —
   `beginStreamTracking()` surfaces `cozy-live.js`'s own real
   `getStream()` error rather than swallowing or fabricating success.

**Status: Approved.** Phase 3 (Implementation) is unlocked — a future
session's own work, per Rule 68/77 (this pass stops at the Phase 2
checkpoint, same cadence as Engine 9's own Phase 2 pass).

## Phase 3 — Implementation (this pass)

Delivered exactly per the 7-item Final Implementation Contract above,
no revision:

1. New file only: `core/engines/media/streaming/streaming-pipeline-engine.js`
   (`beginStreamTracking()`, `recordSegmentRelay()`, `getStreamMetrics()`,
   `endStreamTracking()`, `getCapabilities()`, `getStatus()`,
   `attachToCoordinator()`, `getServiceManifest()`, `registerWithKernel()`).
2. `modules/live/cozy-live.js` and `core/engines/playback/playback-engine.js`
   confirmed byte-identical to the pristine checkout (ownership diff,
   `diff -q` against the delivered baseline ZIP) — composition only, via
   `cozy-live.js`'s existing public `getStream()`.
3. One additive `REGISTRATIONS` entry added to
   `core/bridge/engine-bridge-bootstrap.js` (`'streaming-pipeline'` /
   `StreamingPipelineEngine`) — module import/parse verified with a
   direct dynamic `import()` after the edit.
4. `getStreamMetrics()` returns `null` for `averageLatencyMs`/
   `minLatencyMs`/`maxLatencyMs` (never `0` or a guess) until at least
   one real latency observation exists; `recordSegmentRelay()` sets
   `latencyMs: null` (not a fabricated number) whenever the supplied
   segment lacks a real, finite `timestamp` — verified directly by
   test.
5. `getCapabilities().realLowLatencyTransport` is hardcoded `false` in
   every code path — no WebRTC/streaming backend exists in this
   repository; MD-013's core transport gap is not resolved by this
   engine, only instrumented around.
6. Engine 11 (Video Interpreter Coordinator) not touched — remains
   Locked per Rule 68.
7. `beginStreamTracking()` calls `cozyLive.getStream()` directly, with
   no `try/catch` around it — a nonexistent stream's real error
   (e.g. `cozy-live.js`'s own `NOT_FOUND` `CozyLiveError`) propagates to
   the caller unmodified, never swallowed or converted into a
   fabricated success. Verified directly by test (`assert.throws(...,
   FakeCozyLiveError)`).

**Testing (Phase 4 verification, run this pass):**
- 21/21 new, real, executed tests pass
  (`core/engines/media/streaming/tests/streaming-pipeline-engine.test.js`,
  run via `node core/engines/media/streaming/tests/streaming-pipeline-engine.test.js`).
- Full regression: all 9 prior engines' real test suites re-run
  unmodified this pass (media-decode 23, language-detection 31,
  translation-pipeline 12, speaker-diarization 23,
  background-audio-separation 18, subtitle-timeline 22,
  voice-generation 13, synchronization 21 + 3 integration, media-encode
  12 — 178 total) — all still pass, zero regressions. **199/199 total
  this pass.**
- Syntax/import resolution: `core/bridge/engine-bridge-bootstrap.js`
  re-verified via a direct dynamic `import()` after the additive edit —
  parses and resolves cleanly.
- Ownership diff against the delivered baseline ZIP: only
  `core/bridge/engine-bridge-bootstrap.js` (additive entry) modified,
  and `core/engines/media/streaming/` (new directory: implementation +
  test file) added. No other file touched.
- No defect found during verification — nothing to fix/re-verify this
  pass.

## Builder Lifecycle Status (Rule 65, this engine)

- Phase 0 (Repository Verification): Complete.
- Phase 1 (Compose): Complete.
- Phase 2 (Review/Approval): Complete — Approved.
- Phase 3 (Implementation): Complete.
- Phase 4 (Verification): Complete (see Testing above).
- Phase 5–9 (Close): **Complete, this pass.**

## Phase 0 — Repository Verification (this pass, Close round)

The ZIP delivered at the start of this round claimed Repository SHA-256
`1c9467750816deb4fe33b2573f63a78e80cfcb9e0995b213c160673fd44f1dba`.
Independent re-verification — extracting the actual delivered ZIP and
recomputing via this repository's own canonical method
(`find . -type f ! -name 'RELEASES.md' -print0 | sort -z | xargs -0
sha256sum | sha256sum`), re-confirmed under explicit `LC_ALL=C` to rule
out a locale/sort-order artifact — produced a different value,
`92adfd8ef288f18c2218d311f47ce014b9cfce558b2ad6e81f781451e038b2b2`,
reproducibly. ZIP integrity (`unzip -t`) and Package SHA-256 both
matched their claimed values exactly; only the Repository SHA-256 was
wrong. Per Rule 69 ("repository is authoritative"), the independently
verified hash was adopted as this round's real starting state rather
than the claimed one. Logged as `DI-009` in the Repair Queue — root
cause not determined this pass (no diff trail available against
whatever produced the claimed value); Engine 10's own Phase 3/4 work
(199/199 tests, ownership diff clean) is unaffected by this question,
since it was completed and verified in a prior round independent of
this round's own hash check.

Also backfilled this pass: `DI-008` (found and fixed during the Phase 3
round — `LATEST.md`'s stale top summary — but never actually given its
own Repair Queue row despite being referenced by id in three files).
Row added retroactively; no further action needed.

## Phase 4 — Verification (re-confirmed this pass, Close round)

All 10 real test suites re-run directly this round against the
now-authoritative repository state (not restated from the Phase 3/4
round's own account, per Rule 69): media-decode (23), language-detection
(31), translation-pipeline (12), speaker-diarization (23),
background-audio-separation (18), subtitle-timeline (22),
voice-generation (13), synchronization (21 unit + 3 integration),
media-encode (12), streaming-pipeline (21) — **199/199 pass**, matching
the Phase 3/4 round's own recorded result exactly. The one pre-existing
`media-pipeline-manager.test.js` failure (`MD-004`/`MD-009` — missing
`background-engine.js`) reproduced identically, confirmed not a new
regression. `streaming-pipeline` registration entry in
`core/bridge/engine-bridge-bootstrap.js` reconfirmed present.

## Phase 5 — Registry Updates

`docs/builder/knowledge/repair-queue.md`: `MD-013` updated to reflect
Engine 10 Closed (Phase 5–9 this round); `DI-008` backfilled; `DI-009`
(this round's hash-mismatch finding) added, both 🟢 Fixed. No other
finding status changes — Engine 10's own scope did not touch any other
open item. `docs/builder/knowledge/milestone-waiting-queue.md` updated:
Engine 10 marked Closed, Engine 11 remains the current/next Locked
engine, per Rule 68.

## Phase 6 — Reports

This section (Phase 0 re-verification finding, Phase 4 re-confirmation,
Phase 5 registry updates) constitutes this round's report, appended to
this same Compose document per this repository's own established
convention (Engines 1–9 each closed the same way, appending to their
own Compose report rather than opening a new file).

## Phase 7 — Handoff

`LATEST.md`, `HANDOFF.md`, and `RELEASES.md` all updated this round
(see each file's own trailing section / new Round entry) to record:
Engine 10 Closed, the `DI-009` hash-mismatch finding and its resolution,
and Engine 11 remaining Locked, next.

## Phase 8 — Package / Phase 9 — Close

Final Repository SHA-256 computed after all documentation above was
finalized (Rule 70's required sequencing) — recorded in `RELEASES.md`'s
own Round entry, not restated here to avoid a second authoritative copy.
Full repository ZIP built from that exact state, `unzip -t` verified
clean, independently re-extracted, and the hash recomputed from the
extraction confirmed to match the recorded final Repository SHA-256
exactly before this round is declared complete.

**Certification — Engine 10 / Streaming/Playback Pipeline Engine — CLOSED this pass**
- Repository Verified: **YES** — Phase 0 re-verification this round
  found and corrected a real hash discrepancy (`DI-009`); the corrected
  hash is confirmed reproducible.
- Compose Verified: YES.
- Review/Approval: YES — Approved, no revision required.
- Implementation Verified: **YES** — 21/21 real tests, all 7 contract
  items exact, ownership diff clean (unchanged from the Phase 3/4
  round).
- Verification Verified: **YES** — 199/199 re-confirmed this round,
  zero regressions.
- Handoff Verified: YES — `LATEST.md`/`HANDOFF.md`/`RELEASES.md`/Repair
  Queue/Milestone Waiting Queue all updated this round.
- Artifact SHA-256 Verified: YES — see this round's Rule 67 Delivery
  block.
- New findings this pass: `DI-009` (Repository SHA-256 mismatch, found
  and resolved this round); `DI-008` backfilled (a real finding from a
  prior round, missing its own Repair Queue row).
- Ready for Next Account: **YES** — Engine 10 is CLOSED. Begin Engine
  11 (Video Interpreter Coordinator) **Phase 0** per Rule 65. Do not
  reopen Engine 10.
