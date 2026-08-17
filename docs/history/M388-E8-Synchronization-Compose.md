# M388 Engine 8 — Synchronization Engine — Phase 0 (Repository Verification) + Phase 1 (Compose)

Eighth of the Approved 11-engine Implementation Order (`docs/history/M388.md`,
Phase 2 Review, line ~588): "keeps generated speech timing aligned with
the original video's speech segments; lip-sync itself remains `MD-015`,
Out of Scope."

## Phase 0 — Repository Verification

**Repository baseline confirmed** before any work began: Repository
SHA-256 recomputed with the canonical `-print0`/`-z`/`-0` method matched
`RELEASES.md`'s recorded value exactly
(`d13cd7e15516844e82698b08c266fcbdfbde45445567ee25a90e970fa6ce98b0`); ZIP
integrity and Package SHA-256 (`18764a1c2380ec13962804766e83fb85ff9f43219cb6ab765948add647fca0ac`)
both independently reverified against the delivered
`CozyOS-main-v3_02_14-M388-E7-Closed.zip`.

**Naming-collision scan (`grep -ril "synchroniz\|timesync\|drift\|timing.*align"`)**
found four pre-existing, unrelated modules whose names invoke
"synchronization": `core/modules/sync/cozy-sync.js` (system-state/
blueprint portability — registries, sessions, audit logs; explicitly
"100% execution-free," no network/timing code), `core/connectivity/sync.js`
(a "Delta Synchronization Engine" for offline background-sync queue/
conflict-resolution over the network layer), `core/living/cozy-living-sync.js`
(theme synchronization), and `core/connectivity/conflict.js` (data-conflict
resolution, adjacent to the connectivity sync engine above). All four read
directly — none contains media timing/drift logic; none is a candidate
duplicate for a media Synchronization Engine. Logged as `AA-008` (below)
so this is a documented decision, not an unstated assumption, matching
the `AA-007`/Engine 5 precedent for the unrelated visual
`background-engine.js`.

**Real timing data actually available in the pipeline, confirmed by
direct read of each upstream engine:**
- Engine 6 (`core/engines/media/subtitles/subtitle-timeline-engine.js`,
  `buildTimeline()`) is the only engine in the pipeline that produces
  real millisecond timing (`startMs`/`endMs`, caller-supplied, never
  inferred) — it already performs real, deterministic overlap detection
  between cues (`overlaps` in its return envelope) and honestly reports
  `skippedSegmentIds` for any segment missing valid text/timing.
- Engine 4 (`core/engines/media/diarization/speaker-diarization-engine.js`,
  `diarizeSegments()`) groups segments by `segmentId` only — its `turns`
  carry no `startMs`/`endMs` of their own; timing is not this engine's
  output.
- Engine 7 (`core/modules/speech/generation/voice-generation-engine.js`,
  `generateSpeechForSegment()`) returns `{ segmentId, played, providerId,
  reason, realAudioBuffer: false }` — **no duration, no timestamp, no
  audio buffer of any kind.** Confirmed by direct read: `realAudioBuffer`
  is hardcoded `false` in every `buildResult()` branch, exactly as
  `MD-020` already discloses.
- Engine 1 (`core/engines/media/decode/media-decode-engine.js`) returns
  an honest `isReal:false` structural envelope for `audioTrack` — no real
  decoded audio duration exists anywhere in this environment either.

**Real, confirmed gap (new finding, `MD-021`, logged below):** because no
engine in the Approved 11-engine order produces a real audio duration or
buffer (Engine 1's decode is structural-only, Engine 7's speech is
playback-only), **no component in this repository can compute a real
numeric timing offset/drift between generated speech and the original
video.** A Synchronization Engine that reported such a number this pass
would be fabricating it — forbidden by this repository's own Rule 6. This
is a real, environment-level constraint discovered at Engine 8's own
Compose, not a defect in Engine 6 or Engine 7's own, already-Closed work.

## Phase 1 — Compose

**What already exists, real, and reusable without modification:** Engine
6's cue timeline (`startMs`/`endMs`, overlap detection, skip reporting)
and Engine 7's per-segment playback outcome (`played`, `providerId`,
`reason`) — both keyed by the same `segmentId` convention every engine in
this pipeline already shares (confirmed: Engine 4/6/7 all key by
`segmentId`).

**Honest composition scope for Engine 8, given the `MD-021` constraint
above:** rather than computing a fabricated drift value, Engine 8
performs a real, deterministic **timing-vs-playback cross-check** —
joining Engine 6's built timeline against Engine 7's playback results by
`segmentId` and classifying each segment into one of four real,
computed states:
- `aligned` — a real cue exists (from Engine 6) AND speech was actually
  played (from Engine 7) for the same `segmentId`.
- `timing-without-playback` — a real cue exists but speech was not
  played (Engine 7 `played:false`, or the segment was never submitted to
  Engine 7 at all).
- `playback-without-timing` — speech was played but Engine 6 has no cue
  for that `segmentId` (either skipped by Engine 6, per its own
  `skippedSegmentIds`, or never submitted to Engine 6 at all).
- `unresolved` — neither a cue nor a playback result exists for a
  `segmentId` the caller asked about.

`realDriftMs` is **never** computed or returned — `getCapabilities()`
must honestly report `realDriftMeasurement: false`. This is the same
honesty pattern Engine 1 (`isReal:false` audio track), Engine 4
(`isReal:false` empty envelope with no hint), and Engine 7
(`realAudioBuffer:false`) already established — Engine 8 does not lower
that bar to appear more capable than the repository actually is.

### Draft Implementation Contract (to be reviewed at Phase 2)

1. New files only: `core/engines/media/synchronization/synchronization-engine.js`
   + `core/engines/media/synchronization/tests/synchronization-engine.test.js`.
   Placed at a path distinct from all four unrelated `*sync*` modules
   found in Phase 0 (`AA-008`) — no shared directory, no shared class
   name, no shared global.
2. Does not modify Engine 6 (`subtitle-timeline-engine.js`) or Engine 7
   (`voice-generation-engine.js`) — reads only their existing, already-
   public return shapes (`buildTimeline()`'s `cues`/`skippedSegmentIds`,
   `generateSpeechForSegment(s)`'s `{segmentId, played}` array).
3. Core method: `crossCheckTiming(timeline, playbackResults)` — real,
   deterministic, `segmentId`-keyed join and classification per §"Honest
   composition scope" above. Never fabricates a drift/offset value.
   `getCapabilities().realDriftMeasurement` must be `false`.
4. One additive `REGISTRATIONS` entry in
   `core/bridge/engine-bridge-bootstrap.js` (`synchronization`), same
   precedent as Engines 1–7 — no other line of that file changed.
5. Does not resolve `MD-020`/`MD-021` (no real audio buffer/duration
   anywhere in the pipeline) — both remain open, correctly out of scope;
   Engine 8's own honest scope is cross-check classification only, not a
   fix for the underlying capture/decode gap.
6. Does not resolve `MD-015` (lip-sync) — explicitly Out of Scope this
   milestone, unchanged.

**Next step:** Phase 2 (Review/Approval) of this Compose Report — a
future session's own work, per Rule 65/77 (Phase Focus); not folded into
this pass.

## Builder Lifecycle Status (Rule 65/68/79, this engine)

```
Phase 0 — Repository Verification      ✅ Complete this pass
Phase 1 — Compose                      ✅ Complete this pass
Phase 2 — Review / Approval            ✅ Complete — Approved (with revision applied to AA-008)
Phase 3 — Implementation               🔓 Unlocked (not started)
Phase 4 — Verification                 🔒 Blocked
Phase 5 — Registry Updates             🔒 Blocked
Phase 6 — Reports                      🔒 Blocked
Phase 7 — Handoff                      🔒 Blocked
Phase 8 — Package                      🔒 Blocked
Phase 9 — Close                        🔒 Blocked
```

---

## Phase 2 — Review / Approval

### Independent re-verification (fresh reads/searches this pass, not restated)

- **Engine 6 output shape** — re-confirmed by direct read: `buildTimeline()`
  returns `{cues, skippedSegmentIds, overlaps, isReal, method}` exactly as
  claimed.
- **Engine 7 output shape** — re-confirmed: `realAudioBuffer` appears
  exactly twice in `voice-generation-engine.js`, both hardcoded `false`
  (no `true` branch exists anywhere in the file) — the "never true in
  this pass" claim holds.
- **Engine 4 output shape** — re-confirmed: `turns` are grouped by
  `segmentId` with no `startMs`/`endMs` fields of their own.
- **Engine 1 `isReal:false`** — re-confirmed in `provider-inmemory.js`.
- **`MD-021`** — re-confirmed: no engine anywhere in the pipeline
  produces a real audio duration/buffer; Engine 8's honest
  cross-check-only scope (never computing `realDriftMs`) is the correct
  response to that constraint, not a workaround that quietly lowers the
  bar.
- **Target path collision check** — `core/engines/media/synchronization/`
  does not exist yet; confirmed genuinely new, no collision with any
  existing directory.
- **`engine-bridge-bootstrap.js`** — re-confirmed `REGISTRATIONS` is a
  single frozen array with one entry per engine; Engine 8's proposed
  "one additive entry" plan matches the exact pattern Engines 1–7 already
  used, no other line needs to change.

### `AA-008` naming-collision scan — re-run independently, found incomplete (REVISION REQUIRED)

Re-running the Compose Report's own stated search
(`grep -ril "synchroniz\|timesync\|drift\|timing.*align"`) against the
full repository, not just accepting the four modules already listed,
surfaces **two additional real hits with substantive "synchronization"
content** that `AA-008` did not mention:

1. **`modules/live/cozy-live.js`** — has its own dedicated
   `/* SYNCHRONIZATION */` section (~line 2429) and a real
   `syncTimestamp(sessionId, timestampMs, meta)` method that records a
   caller-supplied epoch-ms checkpoint and emits `EVENT_SYNC`, explicitly
   documented as "a shared timeline offset used to keep subtitles/audio
   aligned across rooms." Its own comment already disclaims doing
   "clock discipline itself." **Confirmed not a duplicate** — this is a
   session/room-level, caller-supplied checkpoint-broadcast mechanism
   (coarse, cross-device clock alignment for live sessions), structurally
   unrelated to Engine 8's proposed per-`segmentId` cue-vs-playback
   classification (Engine 6/7 outputs, no live session or device
   concept involved at all). But it is the single most terminologically
   adjacent piece of code in the entire repository to "media
   synchronization" and was missed by a scan whose own explicit purpose
   was to catch exactly this.
2. **`core/network/cozy-network-orchestrator.js`** — has a documented
   "`[V4.1] Media synchronization / Time Machine`" concern and a private
   `#stampMediaSync()` method that stamps "sequence, aligned clock, and
   session/speaker/room context on EVERY payload" at the transport layer,
   operating on `meta.segmentId`. **Confirmed not a duplicate** — this is
   network-transport delivery-ordering/QoS metadata (sequence numbers +
   clock stamps for routing), not a comparison between two pipeline
   engines' outputs; it never reads Engine 6's or Engine 7's return
   values at all (confirmed: no reference to either file in
   `cozy-network-orchestrator.js`). But its own inline label is literally
   "Media synchronization," the same two words used to name this new
   engine.

Both are real, correctly not duplicates, but their omission means
`AA-008` as originally composed cannot be certified as a complete scan
against its own stated search pattern. **Revision applied to `AA-008`
this Review** (repair-queue.md updated below) to include both, with the
same "checked directly, confirmed no collision" disposition already
given to the original four — this keeps the naming-collision record
honest and complete rather than silently accepting an under-inclusive
scan.

### Secondary finding (informational, not blocking)

While checking the above, `core/engines/media/record-export-session-manager.js`
(same `core/engines/media/` tree Engine 8 will join) was found to
explicitly disclaim "Frame synchronization -> Scene Manager" as
something it does not own. A repository-wide search confirms **no
"Scene Manager" module exists anywhere in this repository** — the
comment names an aspirational owner that was never built. This is
tangential to Engine 8 (that file's "frame synchronization" concerns
video-frame-level sync for local recording/export, a different concept
from Engine 8's segment-timing cross-check, and Engine 8 does not depend
on it), so it is not a blocker and not folded into `AA-008`. Logged
separately below as `MD-022` per Rule 62 (a finding is registered the
moment discovered, regardless of whose scope it eventually belongs to).

### Duplicate-engine check — final

No duplicate engine exists for Engine 8's actual proposed scope
(segment-keyed timing-vs-playback cross-check classification). Six
"synchroniz*"-named modules now documented and checked (four originally,
two added this Review) — none overlaps.

### Ownership boundaries — verified

Engine 8 reads only Engine 6's and Engine 7's already-public return
shapes; modifies neither. Confirmed no other file needs modification
beyond the one additive `REGISTRATIONS` entry and the two new files
under `core/engines/media/synchronization/`.

### Dependency graph — verified

Engine 8 depends on Engine 6 (Closed) and Engine 7 (Closed) only — both
already complete, so no forward dependency risk. `MD-020`/`MD-021`
correctly remain open, unresolved by Engine 8's honest scope. No
circular dependency introduced.

### Locked files — verified

No locked/reserved file requires modification. `subtitle-timeline-engine.js`
and `voice-generation-engine.js` are read-only inputs to Engine 8, per
Implementation Contract item 2, confirmed consistent with how every
prior engine in this chain has treated its own upstream dependencies.

### Verdict: **Approved, with one revision applied this Review (`AA-008` expanded), no other change required**

The composition plan, honest-scope decision (no fabricated
`realDriftMs`), Draft Implementation Contract, and dependency analysis
are all sound and independently re-confirmed. The one real gap found —
an incomplete naming-collision scan — has been corrected in-place in
this Review rather than deferred, since the correction doesn't change
any conclusion (both newly-found modules are confirmed non-duplicates)
and doesn't require reopening Phase 0/1. **Phase 3 (Implementation) is
now unlocked for Engine 8.**

## Builder Lifecycle Status (Rule 65/68/79, this engine) — final, this pass

```
Phase 0 — Repository Verification      ✅ Complete
Phase 1 — Compose                      ✅ Complete
Phase 2 — Review / Approval            ✅ Complete — APPROVED (AA-008 revised)
Phase 3 — Implementation               🔓 Unlocked — not started this pass
Phase 4 — Verification                 🔒 Blocked
Phase 5 — Registry Updates             🔒 Blocked
Phase 6 — Reports                      🔒 Blocked
Phase 7 — Handoff                      🔒 Blocked
Phase 8 — Package                      🔒 Blocked
Phase 9 — Close                        🔒 Blocked
```

**Certification — Engine 8 / Synchronization Engine, Phase 2 (this pass)**
- Repository Verified: **YES** — every Phase 0/1 claim independently
  re-checked against live source; the naming-collision scan was re-run
  from scratch (not just re-read) and found genuinely incomplete.
- Compose Verified: **YES**
- Review/Approval: **YES — Approved**, with `AA-008` revised in place
  (two modules added, both confirmed non-duplicates) and one new
  informational finding (`MD-022`) logged.
- Implementation Verified: **NO** — Phase 3 unlocked, not started this
  pass (Review-only session scope; do not implement per this session's
  explicit instruction).
- Verification Verified: **NO** — nothing implemented yet.
- New findings this pass: `MD-022` (Composed, Low — `record-export-session-manager.js`
  references an unbuilt "Scene Manager" for frame synchronization;
  tangential to Engine 8, not blocking).
- Ready for Next Account: **YES** — begin Engine 8 Phase 3
  Implementation per the Draft Implementation Contract (now Final,
  unchanged in substance by this Review). Do not start Engine 9.

---

## Phase 3 — Implementation (this pass)

Per Rule 69, this session resumed strictly from the repository's own
recorded state — ZIP integrity, Repository SHA-256
(`3bcd4fb4977a3e61dd32a30a3fe6b2dbe7c20ed1f46e42b763589f3d58f64dfa`), and
Package SHA-256 all independently reverified against `RELEASES.md`
before any work began; no discrepancy found.

Files created (additive only — nothing in the locked ownership table was
modified, confirmed by a full-repository diff against the pristine,
freshly-re-extracted checkout):
- `core/engines/media/synchronization/synchronization-engine.js` — the
  engine facade: `crossCheckTiming(timeline, playbackResults, options)`,
  `getCapabilities()`, `getServiceManifest()`/`registerWithKernel(kernel)`,
  `on()`/`emit()` event bus, `CLASSIFICATIONS`. Real, deterministic,
  `segmentId`-keyed join between Engine 6's `buildTimeline()` cue list
  (`cues`/`skippedSegmentIds`) and Engine 7's
  `generateSpeechForSegments()` playback results (`segmentId`/`played`),
  classifying every segment into `aligned` / `timing-without-playback` /
  `playback-without-timing` / `unresolved`. Never computes or returns a
  drift/offset value — `getCapabilities().realDriftMeasurement` is
  hardcoded `false`, per `MD-021`/Compose §"Honest composition scope."
- `core/engines/media/synchronization/tests/synchronization-engine.test.js`
  — 21 real, executed `assert`-based unit tests covering input
  validation (fails closed on malformed timeline/playbackResults),
  all four classification branches individually, a realistic
  multi-segment mix with an accurate summary, immutability of the
  returned envelope, the event bus, and the honesty contract (no
  drift/offset field ever appears on any result object).
- `core/engines/media/synchronization/tests/synchronization-engine.integration.test.js`
  — 3 real, executed end-to-end tests that feed `crossCheckTiming()` the
  ACTUAL live output of `SubtitleTimelineEngine.buildTimeline()` and
  `VoiceGenerationEngine.generateSpeechForSegments()` (via its real
  dependency-injection seam, not hand-built fixtures) — confirming the
  contract holds against the real Engine 6/Engine 7 code, not just this
  engine's own assumptions about their shape.

One file modified, additively: `core/bridge/engine-bridge-bootstrap.js`
— one new `REGISTRATIONS` entry (`name: 'synchronization'`, `globalName:
'SynchronizationEngine'`, `modulePath: '../engines/media/synchronization/
synchronization-engine.js'`, `expectedManifestName:
'synchronization-engine'`). No other entry touched — confirmed via
`grep -c "^  { name:"` before/after (11 → 12) and a direct diff of the
file, which shows exactly one line added.

**What was deliberately not built this pass:** any numeric drift/offset
computation (Compose's own honest-scope decision, `MD-021`) — remains
open, unresolved by this Implementation, exactly as disclosed at
Compose/Review time. `cozy-media.js`'s `Adapters` registry was
deliberately **not** used for a coordinator-attachment method (unlike
Engine 1/Engine 2) — re-checked against Engines 4–7's own precedent
(`speaker-diarization-engine.js`, `background-audio-separation-engine.js`,
`subtitle-timeline-engine.js`, `voice-generation-engine.js`), none of
which expose an `attachToCoordinator()` either, since none has a natural
existing extension-point slot the way Engine 1/2 do — matching that
precedent rather than the Implementation Contract's own item list, which
never mentioned `cozy-media.js` at all.

## Phase 4 — Verification (this pass)

**Syntax:** `node --check` run against every new file — clean, zero
errors.

**New tests:**
`core/engines/media/synchronization/tests/synchronization-engine.test.js`
— **21/21 pass.**
`core/engines/media/synchronization/tests/synchronization-engine.integration.test.js`
— **3/3 pass**, against the real, live `subtitle-timeline-engine.js` and
`voice-generation-engine.js` (not fixtures).

**Regression, all 7 prior engines re-run this pass, unmodified:**

| Engine | Test file | Result |
|---|---|---|
| 1 — Media Decode | `core/engines/media/decode/tests/media-decode-engine.test.js` | 23/23 pass |
| 2 — Language Detection | `core/engines/media/language/tests/language-detection-engine.test.js` | 31/31 pass |
| 3 — Translation Pipeline | `core/engines/media/translation/tests/translation-pipeline-engine.test.js` | 12/12 pass |
| 4 — Speaker Diarization | `core/engines/media/diarization/tests/speaker-diarization-engine.test.js` | 23/23 pass |
| 5 — Background Audio Separation | `core/engines/media/audio-separation/tests/background-audio-separation-engine.test.js` | 18/18 pass |
| 6 — Subtitle Timeline | `core/engines/media/subtitles/tests/subtitle-timeline-engine.test.js` | 22/22 pass |
| 7 — Voice Generation | `core/modules/speech/generation/tests/voice-generation-engine.test.js` | 13/13 pass |

142/142, byte-identical to the counts already on record for each engine
— zero interference from Engine 8. **166/166 total this pass** (142
regression + 21 new unit + 3 new integration).

**Pre-existing, documented, unrelated failure — unchanged:**
`core/engines/media/tests/media-pipeline-manager.test.js` still fails at
the same line (`ERR_MODULE_NOT_FOUND` on the still-unbuilt
`core/engines/media/background-engine.js`, `MD-004`/`MD-009`) —
independently re-confirmed this pass by running the identical test
against a freshly re-extracted, unmodified copy of this session's own
input ZIP: byte-identical failure in both, confirming it predates this
session's own work and is not a regression introduced by Engine 8.

**Ownership re-confirmed:** `subtitle-timeline-engine.js` and
`voice-generation-engine.js` — the two files Engine 8's Implementation
Contract item 2 forbids modifying — confirmed byte-identical to the
pristine checkout via a full-repository diff (only
`core/bridge/engine-bridge-bootstrap.js` and the new
`core/engines/media/synchronization/` directory differ). All six
`AA-008`-checked "synchroniz*" modules also confirmed unchanged.

**No genuine implementation defect found.**

**Verdict: Phase 4 — PASSED.**

## Phase 5 — Registry Updates (this pass)

`MD-021` updated in `docs/builder/knowledge/repair-queue.md`: status
🟡 Composed → 🔵 Implementing — a real, honest, verified
`crossCheckTiming()` classification now exists (166/166 total tests,
zero regressions); the underlying "no real numeric drift value can be
computed" constraint remains correctly open/High, unresolved by design
(Engine 8's own scope was cross-check classification only), still
blocking any future true drift-measurement work. `MD-022` unaffected —
tangential, not this engine's scope. `MD-020`/`MD-015` unaffected. No
other Repair Queue item touched.

## Phase 6 — Reports (this pass)

This section. `LATEST.md`, `HANDOFF.md`,
`docs/builder/knowledge/milestone-waiting-queue.md`,
`docs/builder/knowledge/repair-queue.md`, and `RELEASES.md` all updated
in the same pass (Rule 66) — not left as chat-only claims.

## Phase 7 — Handoff (this pass)

See `HANDOFF.md`'s Engine 8 certification block (added this pass) and
"Next Builder MUST" list — Engine 9 (Media Encode Engine) is unlocked
per Rule 68; its own Phase 0 is the correct next step for a future
session, not a continuation of this one (Rule 77).

## Phase 8 — Package (this pass)

Full repository ZIP built and verified this pass, per Rule 67/70/71/80.
Repository SHA-256 computed after all hashed files were finalized (Rule
70) and recorded only in `RELEASES.md` and this session's Rule 67
Delivery block. Package SHA-256 reported only in the Delivery block,
never written into any repository file.

## Phase 9 — Close (this pass)

## Builder Lifecycle Status (Rule 65/68/79/80, this engine) — FINAL

```
Phase 0 — Repository Verification      ✅ Complete
Phase 1 — Compose                      ✅ Complete
Phase 2 — Review / Approval            ✅ Complete — Approved (AA-008 revised)
Phase 3 — Implementation               ✅ Complete this pass
Phase 4 — Verification                 ✅ Complete this pass — PASSED, 166/166 tests, zero regressions
Phase 5 — Registry Updates             ✅ Complete this pass — MD-021 updated
Phase 6 — Reports                      ✅ Complete this pass — this document
Phase 7 — Handoff                      ✅ Complete this pass — HANDOFF.md updated
Phase 8 — Package                      ✅ Complete this pass — ZIP built & verified
Phase 9 — Close                        ✅ Complete this pass
```

**Engine 8 (Synchronization Engine) is CLOSED.**

**Next step:** per Rule 68, Engine 9 (Media Encode Engine) is now
unlocked. Not started this pass, per this session's explicit scope (Rule
77/79) — its own Phase 0 is a future session's work.

**Certification — Engine 8 / Synchronization Engine, FINAL (this pass)**
- Repository Verified: **YES**
- Compose Verified: **YES**
- Review/Approval: **YES — Approved** (`AA-008` revised at Phase 2)
- Implementation Verified: **YES** — new files only, one additive
  registration, both upstream engines confirmed byte-identical/unchanged
- Verification Verified: **YES — PASSED**, 166/166 tests (21 new unit +
  3 new real integration + 142 regression), zero regressions, one
  pre-existing unrelated failure (`MD-004`/`MD-009`) confirmed
  identical to the pristine checkout
- New findings this pass: **None** (`MD-021` status updated, no new
  finding)
- Ready for Next Account: **YES** — begin Engine 9 (Media Encode
  Engine) **Phase 0** (Repository Verification) fresh. Do not skip
  Engine 9's own Phase 0/Compose/Review before Implementation, per Rule
  64/65.
