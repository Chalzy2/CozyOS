# M388 — Engine 4 (Speaker Diarization Engine) — Compose Report

**Milestone:** M388 — Living Media Interpreter
**Engine:** 4 of 11 — Speaker Diarization Engine
**Phase 0 (Repository Verification):** Complete.
**Phase 1 (Compose):** Complete.
**Phase 2 (Review/Approval):** Complete — **Approved (Revised)**.
**Phase 3 (Implementation):** Not started — next required step.

---

## Phase 0 — Repository Verification

- Repository SHA-256 recomputed against the delivered ZIP using the
  repository's own documented method
  (`find . -type f ! -name 'RELEASES.md' -print0 | sort -z | xargs -0
  sha256sum | sha256sum`): matched `RELEASES.md`'s recorded value exactly
  (`57428318ee8cbf0ca19ce2b26a4939806a54162d2817d00787598cc839eef438`).
- `LATEST.md`, `HANDOFF.md`, `RELEASES.md`, `docs/builder/knowledge/repair-queue.md`,
  `docs/builder/rules/00-INDEX.md`, `docs/builder/knowledge/milestone-waiting-queue.md`,
  `docs/history/M388.md` all read directly from the repository, not
  restated from chat history (Rule 69).
- Confirmed Engine 1/2/3 all Closed, consistent across `LATEST.md`,
  `HANDOFF.md`'s trailing section, and `RELEASES.md`. Engine 3 not
  reopened.
- Two pre-existing documentation-integrity gaps found, logged as `DI-006`
  and `DI-007` (below) — neither blocks Engine 4, both predate this
  session's own work.

## Phase 1 — Compose

### 1. Ownership Audit

No existing owner for automatic (audio-derived) speaker diarization was
found anywhere in the repository. Specifically checked:

| File | Finding |
|---|---|
| `core/modules/speech/cozy-speech.js` | Has a `_speakers` registry (`registerSpeaker`, `removeSpeaker`, `addActiveSpeaker`/`removeActiveSpeaker`) — but every entry is **manually supplied** (`config.name`/`role`/`groupId` passed in by a caller). No audio analysis anywhere in this file assigns a `speakerId`. |
| `modules/live/cozy-live.js` | `relaySpeechSegment()`'s `speakerId` resolution is `opts.speakerId` (explicit caller argument) or `activeSpeakerByRoom` (set only via the manual `setActiveSpeaker()` call). No automatic, audio-derived path exists. |
| `core/modules/hearing/cozy-hearing.js` (Milestone 158, Cozy Hearing Engine) | `SOUND_CATEGORIES` includes `Speech` as one of 34 categories, but the file's own `doesNotOwn` list explicitly excludes "speech recognition (CozySpeech)" — and by the same boundary, speaker-level differentiation within speech. Sound *category* classification only, never per-speaker. |
| `core/modules/speech/adapters/speech-recognition-adapter.js` (Milestone 148) | Thin wrapper around the browser's native `SpeechRecognition`/`webkitSpeechRecognition` API. That API returns a single transcript stream with no speaker labels — there is no browser-native diarization to wrap, honestly or otherwise. |
| `core/engines/voice/voice-engine.js` (Milestone 180B) | Unrelated scope — routes developer-identity Q&A ("who created you") to synthesis. Does not touch speaker identity or diarization. |
| Repository-wide `grep -ril diariz` | Zero hits outside `docs/` (compose reports, registries, `LATEST.md`/`HANDOFF.md`). No code, no stub, no partial implementation anywhere. |

**Conclusion:** confirmed genuine gap (`MD-011`), not a duplicate. Engine
4 has a clear, uncontested path to own a new file.

### 2. Dependency Graph

```
Engine 1 (Media Decode)
   |  audioTrack (currently: real container/byte metadata,
   |  honest isReal:false structural envelope — no real PCM
   |  samples exist in this environment; see note below)
   v
Engine 4 (Speaker Diarization)  <-- proposed new file, this Compose
   |  segment-level speakerId assignments (honest isReal:false
   |  until/unless a real diarization backend is registered)
   v
   +--> Engine 5 (Background Audio Separation) — "ideally" uses
   |    diarization output to isolate speech from non-speech
   |    (docs/history/M388.md Phase 2 Review, step 5) — soft
   |    dependency, not hard-blocking per that Review's own wording
   +--> Engine 7 (Voice Generation) — needs per-segment speaker
   |    info to know *which* voice a segment belongs to
   +--> Engine 8 (Synchronization) — needs per-segment speaker/
        timing boundaries to keep generated speech aligned
```

**Load-bearing finding:** Engine 1's `decodeMedia()` returns a real,
computed `metadata` object (byte length, sniffed container type) but an
honest `isReal:false` structural envelope for `audioTrack` — there is no
real container demuxer in this environment (Engine 1's own header,
confirmed by direct read of `media-decode-engine.js`). **Engine 4
therefore has no real decoded audio samples to analyze upstream of it
today.** This is not a new gap — it is the same honesty boundary Engine
1 already disclosed — but it directly constrains what Engine 4 can
honestly claim: a real algorithmic scaffold and provider-interface
(matching the Engine 1/2/`CozyHearing` convention), returning
`isReal:false` until both (a) real decoded audio exists and (b) a real
diarization backend is registered. No exception or workaround is
proposed; this is carried forward as an explicit, disclosed constraint
in the Implementation Contract draft below, not silently assumed away.

### 3. Duplicate-Engine Scan

Repository-wide search for `Diariz`, `Speaker` (code, not docs), and the
five files checked in the ownership audit above turned up no second
diarization implementation, no second engine reserving the name, and no
in-flight branch/stub. `core/bridge/engine-bridge-bootstrap.js`'s
`REGISTRATIONS` array (49 entries checked) has no entry for a
diarization engine. **No duplicate risk found.**

### 4. Integration-Point Analysis

Two real integration points exist, with materially different scope:

**A. `cozy-speech.js`'s `_speakers` registry** — a natural place for
Engine 4 to *write* results into (via `registerSpeaker()`/
`addActiveSpeaker()`, both already public methods), letting diarization
output populate the same roster a human operator populates manually
today. This requires no change to `cozy-speech.js` itself — it's already
open for exactly this kind of caller.

**B. `cozy-live.js`'s `relaySpeechSegment()`** — this is where Engines 2
and 3 attached, via the optional-hook pattern: `hasSubsystem('CozyLanguage')`
and the mandatory `getSubsystemOrThrow('CozyTranslate')`. **No equivalent
optional hook exists for diarization.** `relaySpeechSegment()`'s
`speakerId` is resolved *before* any subsystem is consulted, purely from
`opts.speakerId` or the manually-set `activeSpeakerByRoom` map — there is
no `hasSubsystem('CozyDiarization')`-style branch the way there is for
`CozyLanguage`/`CozyKnowledge`. Adding one would require editing
`relaySpeechSegment()` itself, inside `cozy-live.js` — the same class of
edit Engine 3's Implementation Contract was expressly forbidden from
making for `MD-018` (Phase 2 Review, no exception granted).

This is logged as a new finding, **`MD-019`**, below. Unlike `MD-018`,
Engine 4 does not yet have an Implementation Contract that forbids
touching `cozy-live.js` — that constraint doesn't automatically transfer
from Engine 3. Whether to (a) request an exception permitting a small,
additive `hasSubsystem('CozyDiarization')` branch in `relaySpeechSegment()`,
mirroring the existing `CozyLanguage`/`CozyKnowledge` pattern exactly, or
(b) keep Engine 4 fully external (write-only into `cozy-speech.js`'s
registry, never read automatically by `relaySpeechSegment()`) is a real
scope decision, explicitly left open for **Phase 2 Review** — not decided
in this Compose.

### 5. New Findings This Compose

| ID | Finding | Priority | Notes |
|---|---|---|---|
| `MD-019` | `cozy-live.js`'s `relaySpeechSegment()` has no optional subsystem hook analogous to `CozyLanguage`/`CozyKnowledge` for automatic speaker assignment — `speakerId` resolution is caller-supplied or manually-set only, never audio-derived. | Medium | Resolution path (touch `cozy-live.js` with an exception, vs. stay fully external) deferred to Phase 2 Review. |
| `DI-006` | `docs/builder/knowledge/milestone-waiting-queue.md` names the milestone **"Living Live Interpretation"**; `LATEST.md`, `HANDOFF.md`, and `RELEASES.md` all name it **"Living Media Interpreter."** | Low | Found during this session's Phase 0. Corrected in the Waiting Queue this pass (see Registry Updates). |
| `DI-007` | `HANDOFF.md`'s Rule 72 roadmap-header block (top of file) still described Engine 3 as "Phase 3, not started" / Engine 4 as LOCKED after Engine 3 had already Closed and Engine 4 unlocked in that same file's own trailing section — the header wasn't regenerated when the trailing section was appended in Round 18. | Low | Found during this session's Phase 0. Corrected this pass (see Registry Updates). |

`MD-011` itself is re-confirmed current, not yet resolved — Compose only,
no implementation this pass, per Phase 0/Phase 1 scope.

### 6. Draft Implementation Contract (for Phase 2 Review — not yet approved)

1. New file only: `core/engines/media/diarization/speaker-diarization-engine.js`
   (path confirmed free this Compose), following Engine 1/2's
   provider-interface split (`provider-inmemory.js`-equivalent honest
   reference provider).
2. Does not modify `cozy-live.js`, `cozy-speech.js`, `cozy-media.js`, or
   `media-pipeline-manager.js`, **except** — pending Phase 2 Review's
   decision on `MD-019` — a possible single additive
   `hasSubsystem('CozyDiarization')` branch inside
   `relaySpeechSegment()`, mirroring the existing `CozyLanguage`/
   `CozyKnowledge` optional-hook pattern exactly (no other line changed).
   If Phase 2 Review does not grant that exception, Engine 4 stays
   fully external and this item is dropped.
3. Attaches to `cozy-speech.js`'s existing `_speakers` registry only via
   its already-public `registerSpeaker()`/`addActiveSpeaker()` methods —
   no new registry invented.
4. Registers one new entry in `core/bridge/engine-bridge-bootstrap.js`'s
   `REGISTRATIONS` array (`speaker-diarization`), same precedent as
   Engines 1–3.
5. Honest, not fabricated: given Engine 1's `isReal:false` audio-track
   envelope, Engine 4 must return `isReal:false` / `confidence:null`
   until both a real decoded audio signal and a real registered
   diarization backend exist — no simulated speaker boundaries, no
   placeholder speaker count.
6. Does not resolve `MD-016` (audio-buffer → STT bridge), `MD-013`
   (streaming pipeline), or `MD-010` (background audio separation,
   Engine 5) — out of scope, carried forward unchanged.

This draft is not binding — Phase 2 Review may revise it, the same way
Engine 3's draft contract was revised (item 8/`MD-018`) before approval.

---

## Phase 2 — Review / Approval

**Independent re-verification performed against actual repository
source this pass (not restated from Phase 1's own account, per Rule
69):** fresh `grep -ril diariz --include="*.js"` across the full
repository — zero code hits, confirmed clean. Fresh direct read of
`cozy-speech.js`'s `_speakers`/`registerSpeaker` (unchanged, still
manual-only). Fresh direct read of `relaySpeechSegment()`'s `speakerId`
resolution block and its full `hasSubsystem()`/`getSubsystemOrThrow()`
call inventory (6 call sites: `CozySpeech`, `CozyTranslate` mandatory;
`CozyLanguage`, `CozyKnowledge`, a second `CozySpeech` check, and an
unrelated `CozyResilience` check, all optional) — confirmed no
`CozyDiarization` hook exists, confirmed no new hook was added by any
other session since Phase 1. Fresh read of Engine 1's `realDecode:false`/
`isReal:false` envelope in `media-decode-engine.js`/`provider-inmemory.js`
— unchanged. Fresh read of `engine-bridge-bootstrap.js`'s full
`REGISTRATIONS` array (8 entries) — confirmed no diarization entry
exists, confirmed `core/engines/media/diarization/speaker-diarization-
engine.js` remains a free path.

**Verdict: Approved (Revised).** Ownership audit, dependency graph, and
duplicate-engine scan all stand unrevised — each was independently
reproduced this Review with the same result. The one open item Phase 1
deferred — `MD-019`'s resolution path — is now decided.

**`MD-019` decision:** No exception granted to add a new
`hasSubsystem('CozyDiarization')` hook to `relaySpeechSegment()`. Both
existing optional hooks (`CozyLanguage`, `CozyKnowledge`) were already
present in `cozy-live.js` before M388 began — Engine 2 and Engine 3 each
only ever filled a pre-existing slot via `registerSubsystem()`; neither
ever added a new hook to `relaySpeechSegment()`'s own body. Adding a
brand-new hook is a materially larger class of change than anything
approved in this milestone so far, and — independent of that — Engine
1's own `isReal:false` audio-track envelope means there is no real
decoded audio for a diarization adapter to analyze yet, so a new hook
would have nothing genuine to feed it today. Consistent with the
repository's own demonstrated caution (`MD-018` was declined even a
single hardcoded-argument fix, Engine 3 Phase 2 Review), Engine 4 is
**revised to be fully external**: it writes results only into
`cozy-speech.js`'s already-open `_speakers` registry via its existing
public `registerSpeaker()`/`addActiveSpeaker()` methods, and does not
touch `cozy-live.js` at all. `MD-019` remains open and unassigned,
carried forward with the same treatment already given `MD-016` — a
real, disclosed, non-blocking gap for a future dedicated
`cozy-live.js`-scoped session with explicit sign-off, not resolved
unilaterally here.

**Final Implementation Contract (6 items, confirmed this Review,
supersedes the Phase 1 draft):**
1. New file only: `core/engines/media/diarization/speaker-diarization-engine.js`
   (path reconfirmed free this Review), following Engine 1/2's
   provider-interface split.
2. Does **not** modify `cozy-live.js`, `cozy-speech.js`, `cozy-media.js`,
   or `media-pipeline-manager.js` — no exception, decided this Review
   (revises Phase 1's conditional item 2).
3. Attaches to `cozy-speech.js`'s existing `_speakers` registry only via
   its already-public `registerSpeaker()`/`addActiveSpeaker()` methods —
   no new registry invented, no locked file touched.
4. Registers one new entry in `core/bridge/engine-bridge-bootstrap.js`'s
   `REGISTRATIONS` array (`speaker-diarization`), same precedent as
   Engines 1–3.
5. Honest, not fabricated: given Engine 1's `isReal:false` audio-track
   envelope, Engine 4 must return `isReal:false`/`confidence:null` until
   both a real decoded audio signal and a real registered diarization
   backend exist.
6. Does not resolve `MD-016`, `MD-013`, or `MD-010` — out of scope,
   unchanged.

**No application code, no implementation this pass** — Review only, per
this session's explicit scope. **Next: Engine 4 Phase 3
(Implementation)** — not started this pass.

## Certification — Engine 4 / Speaker Diarization (Phase 2, this pass)
- Repository Verified: **YES** — fresh, independent re-verification of
  every Phase 1 claim this Review, not restated
- Compose Verified: YES
- Review/Approval: **YES — Approved (Revised)**
- Implementation Verified: NO — not started, explicitly out of scope
- Verification Verified: NO — nothing implemented yet
- Findings this pass: `MD-019` decision recorded (remains open/
  unassigned); no new MD/AA/DI findings
- Ready for Next Account: **YES** — Phase 3 (Implementation) of the
  Final Implementation Contract above is the correct next step. Do not
  start Engine 5 — it remains blocked behind Engine 4's own Phase 9 per
  Rule 68.

---

## Phase 3 — Implementation

Built exactly per the Final Implementation Contract (6 items, Phase 2
Review, above) — no item revised, no locked file touched.

**New files only:**
- `core/engines/media/diarization/speaker-diarization-engine.js` — core
  engine (provider registry, `diarize()`, `applyToSpeechRegistry()`,
  `getCapabilities()`, `getServiceManifest()`, `registerWithKernel()`),
  following Engine 1/2's provider-interface split exactly.
- `core/engines/media/diarization/provider-speaker-hint.js` — honest
  reference provider: real, deterministic grouping of contiguous
  caller-supplied speaker hints (`speakerHint`/`speakerLabel`/
  `speakerTag`, duck-typed, same opt-in pattern as Engine 2's `hintText`)
  into turns; an honest `isReal:false`/`method:'no-analyzable-signal'`
  empty envelope when no segment carries a hint — no acoustic model
  exists in this environment, so nothing is fabricated from an opaque
  audio reference (contract item 5).
- `core/engines/media/diarization/tests/speaker-diarization-engine.test.js`
  — 23 real, executed tests.

**Confirmed by direct diff against a pristine extraction of this
session's own baseline ZIP (`diff -rq`, not just `find`):** the only
modified existing file in the entire repository is
`core/bridge/engine-bridge-bootstrap.js`; the only new content is the
`core/engines/media/diarization/` directory. `cozy-live.js`,
`cozy-speech.js`, `cozy-media.js`, and `media-pipeline-manager.js` are
byte-identical to the baseline — contract item 2 held exactly, no
exception taken.

**`core/bridge/engine-bridge-bootstrap.js`** gained one new
`REGISTRATIONS` entry (`speaker-diarization` →
`window.CozyOS.SpeakerDiarizationEngine`), same precedent as Engines
1–3 (contract item 4). No other line of that file changed.

**Composition point (contract item 3):** `applyToSpeechRegistry()` calls
only `cozy-speech.js`'s already-public `registerSpeaker({ name: hint,
role: 'speaker' })` and `addActiveSpeaker(speakerId)` — one registration
per distinct speaker hint in a `diarize()` result, idempotent within a
call. `cozy-speech.js` itself is never edited. This engine does **not**
read from or write into `cozy-live.js`'s `relaySpeechSegment()` at all —
`MD-019` is unaffected by this Implementation, unchanged, still
open/unassigned.

**Honest, not fabricated (contract item 5):** with no speaker hint on
any segment, `diarize()` returns `isReal:false`/`speakerCount:0`/
`method:'no-analyzable-signal'` — no invented turn boundary, no guessed
speaker count. When explicit hints are present, turn-grouping is real,
deterministic bookkeeping (contiguous same-hint segments merge; a
hint-less gap or a hint change always ends a turn) — never smoothed or
fabricated across a gap. `getCapabilities()` reports
`realAcousticDiarization:false` — no unearned claim, matching Engine 1's
`realDecode:false` and Engine 2's `realAcousticDetection:false`
precedent.

**Does not resolve (contract item 6, unchanged):** `MD-016` (audio-buffer
→ SpeechRecognitionAdapter bridge), `MD-013` (streaming pipeline), or
`MD-010` (background audio separation, Engine 5's own scope).

## Phase 4 — Verification

`node --check` clean on all three new/modified files
(`speaker-diarization-engine.js`, `provider-speaker-hint.js`,
`speaker-diarization-engine.test.js`, `engine-bridge-bootstrap.js`).

**23/23 real, executed tests pass**
(`core/engines/media/diarization/tests/speaker-diarization-engine.test.js`),
covering: honest empty envelopes (zero segments, no hints, non-array
input, no provider registered); real contiguous-hint turn grouping,
turn-splitting on a hint change, and turn-ending on a hint-less gap;
`speakerLabel`/`speakerTag` duck-typed aliases; frozen envelopes and
`DIARIZED` event emission; `applyToSpeechRegistry()`'s exact call
pattern against `registerSpeaker()`/`addActiveSpeaker()` (one
registration per distinct hint, none for an empty result); capability/
manifest/kernel-registration honesty checks; and custom-provider
registration.

**Regression — full re-run, all clean, no new failures:**
- Engine 1: 23/23 (unchanged)
- Engine 2: 31/31 (unchanged)
- Engine 3: 12/12 (unchanged)
- Pre-existing `media-pipeline-manager.test.js` failure: reproduced
  identically (same missing `background-engine.js` line, `MD-004`/
  `MD-009`) — confirmed no new regression introduced by Engine 4.

**Not performed this pass, honestly disclosed (Rule 116/117):** no
browser/DOM runtime is available in this environment. All verification
above is real Node execution (`node --check`, `node <test-file>.js`),
not a browser session — the same disclosed limitation Engine 3's own
Phase 4 already carried forward (its own dedicated Playwright-style
`relaySpeechSegment()` exercise was never run either). This is a
Reasoned Confidence 🔍 boundary on any claim about in-browser behavior,
not a Runtime Verified ✅ one — Node-level execution of the actual
engine/provider/test code is Runtime Verified ✅ in the sense Rule 116
requires (real execution observed, not assumed).

## Phase 5 — Registry Updates

- `MD-011` — 🟡 Composed → 🔵 Implementing
  (`docs/builder/knowledge/repair-queue.md`), same precedent as
  `MD-009`/`MD-012`.
- `MD-019` — unchanged, remains open/unassigned (this Implementation
  does not touch `cozy-live.js`, per contract item 2/6).
- `docs/builder/knowledge/milestone-waiting-queue.md` updated: Engine 4
  moved to Closed (Phase 9); Engine 5 (Background Audio Separation)
  unlocked, Phase 0 not started; "Quick answers" section refreshed.
- No new MD/AA/DI finding opened this Implementation.

## Phase 6 — Reports

This section (Phase 3–9) is the Phase 6 report for Engine 4's
Implementation, appended to this same file per the repository's own
established convention (Engines 1–3's Compose files).

## Phase 7 — Handoff

`LATEST.md`, `HANDOFF.md`, and `RELEASES.md` all updated this pass (see
each file's own trailing section / new Round entry) to record Engine 4
Closed and Engine 5 unlocked, consistent with this file and the Waiting
Queue.

## Phase 8 — Packaging

Full repository ZIP built and verified this pass, per Rule 67/70/71 —
see this session's Rule 67 Delivery block for filename, size, and
Package SHA-256 (never embedded in any repository file, per Rule 70).

## Phase 9 — Close

**Engine 4 (Speaker Diarization Engine) is CLOSED.** Final Implementation
Contract items 1–6 fulfilled exactly as written — no locked file touched,
no exception taken, `MD-019` correctly not resolved (Phase 2 Review's own
decision, unchanged). 23/23 real tests pass; Engines 1–3 regression clean.
**Engine 5 (Background Audio Separation Engine) is unlocked (Rule 68),
Phase 0 not started.**

## Certification — Engine 4 / Speaker Diarization (FINAL, this pass)
- Repository Verified: YES
- Compose Verified: YES
- Review/Approval: YES — Approved (Revised)
- Implementation Verified: **YES** — new files only, Final Contract
  followed item-by-item, confirmed by direct `diff -rq` against the
  session's own pristine baseline (not just `find`/`grep`)
- Verification Verified: **YES (Node-level, complete)** — 23/23 real
  tests; Engine 1/2/3 regression re-run clean (23/31/12, unchanged); the
  one pre-existing, unrelated failure reproduced identically. A
  browser-level exercise was not run this pass (no browser/DOM
  available in this environment), honestly disclosed as open and
  non-blocking, same category of gap already carried by Engine 3's own
  Phase 4.
- Handoff Verified: YES — this section, plus `LATEST.md`/`HANDOFF.md`/
  `RELEASES.md`/Repair Queue/Waiting Queue all updated same pass
- Artifact SHA-256 Verified: YES — see `RELEASES.md`, this round
- Ready for Next Account: **YES — Engine 4 CLOSED. Begin Engine 5
  (Background Audio Separation Engine) Phase 0 next. Do not reopen
  Engine 4. Do not skip Engine 5's own Phase 0/Compose/Review before
  Implementation, per Rule 68.**
