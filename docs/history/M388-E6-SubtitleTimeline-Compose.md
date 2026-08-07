# M388 Engine 6 — Subtitle Timeline Engine

Sixth of the Approved 11-engine Implementation Order
(`docs/history/M388.md`, Phase 2 Review, item 6). Resolves `MD-014`'s
generation half (no subtitle export/rendering capability beyond
`cozy-live.js`'s structural channel tracking).

---

## Phase 0 — Repository Verification

- Repository SHA-256 recomputed against the delivered baseline
  (`CozyOS-main-v3_02_08-M388-E5-Closed.zip`): matched `RELEASES.md`'s
  recorded value exactly
  (`4e0f3d6217f6c35acba10a815060bf051b5e27aa0d48d63b91815975f21f345d`).
  Package SHA-256 (`6272ea905c5f536214345ee7d7ccbaed8333259a660a6ce1a9b7370499828faf`)
  and ZIP integrity (`unzip -t`, 798 files) both reconfirmed this pass.
- `LATEST.md`, `HANDOFF.md`, `RELEASES.md`, Repair Queue, Milestone
  Waiting Queue, `docs/builder/rules/00-INDEX.md`, and
  `docs/history/M388.md` all read directly from the repository.
- Confirmed Engine 1–5 all Closed, consistent across all four tracking
  files. None reopened.
- `docs/history/M388.md`'s own Approved Implementation Order (item 6)
  re-read: "Subtitle Timeline Engine (new — resolves `MD-014`'s
  generation half; can start once steps 2–3 produce timed, translated
  segments)." Its earlier Section 2/3 findings re-read: `cozy-live.js`
  has real subtitle-*channel* structural tracking (routing metadata
  only); `ldce-caption-engine.js` produces real live caption *text* for
  local display; neither does cue-timeline generation or `.srt`/`.vtt`
  export.

## Phase 1 — Compose

### 1. Ownership Audit

| File | Finding |
|---|---|
| `modules/live/cozy-live.js` | `createSubtitleChannel()`/`removeSubtitleChannel()` (re-read this pass, lines ~1823–1871) create/remove pure routing-metadata records (`{ id, sessionId, roomId, languageChannelId, createdAt }`) attached to a language channel. No cue text, no timing, no export format anywhere in the file. Confirms `docs/history/M388.md`'s own finding: structural channel tracking only. |
| `core/modules/communication/ldce-caption-engine.js` | Real, but a different capability: composes `SpeechRecognitionAdapter`/`SpeechTranslationAdapter`/`LDCESessionEngine`/`CozyConversation` to produce live caption text for local, real-time display during a call. No cue-list data structure, no timestamps-as-cues, no `.srt`/`.vtt` export — it is a live-display pipeline, not a timeline/export capability. Browser-global pattern (`window.CozyOS.LDCECaptionEngine`), not an ES module — a structurally different file to begin with, not a candidate for reuse/extension here. |
| Repository-wide `grep -ril "\.srt\|toSRT\|subtitle.*timeline\|subtitle.*export\|subtitle.*cue\|\.vtt\b"` (code) | Two hits, both unrelated (`certification-dashboard.js`, `founder-story-engine.js` — generic word matches, confirmed by inspection, not subtitle code). **No cue-timeline or export capability exists anywhere in the repository.** |

**Conclusion:** confirmed genuine gap (`MD-014`'s generation half), not
a duplicate. No existing registry holds cue/timing data — same
situation Engine 5 found for its own output (no natural write-target),
not the situation Engines 2/4 found (`cozy-live.js`'s
`'CozyLanguage'` subsystem slot, `cozy-speech.js`'s `_speakers`
registry).

### 2. Dependency Graph

```
Engine 3 (Translation Pipeline)
   |  translate({ text }) -> { text } — real, per-segment, no timing
   v
[caller-supplied real segment timing, e.g. from a real ASR transcript
 or the original media's own cue points — this engine does not itself
 transcribe, translate, or infer timing]
   |
   v
Engine 6 (Subtitle Timeline)  <-- proposed new file, this Compose
   |  real, deterministic cue-list construction + overlap validation
   |  + .srt export from already-real { text, startMs, endMs } segments
   v
   +--> (future) Engine 11 (Video Interpreter Coordinator) — the only
        engine that would eventually attach cue output to
        cozy-live.js's real createSubtitleChannel() routing metadata,
        per Compose/Review's own decision below (item 3)
```

**Honesty boundary, same category as Engines 1/2/4/5's own
disclosures:** this engine does not perform speech recognition,
translation, or timing inference — it has no access to real audio and
no ASR/MT model of its own. It builds a real, deterministic subtitle
timeline and `.srt` export *only* from segment data the caller already
has (real text + real millisecond timestamps). Given no segments, or
segments missing text/timing, it returns an honest empty/`skipped`
result — it never invents placeholder cue text or a fabricated
timestamp.

### 3. Duplicate-Engine Scan

Covered in Ownership Audit above — no duplicate, no reserved name.
`core/bridge/engine-bridge-bootstrap.js`'s `REGISTRATIONS` array (9
entries, fresh count this pass) has no entry for `subtitle-timeline` or
`subtitle`.

### 4. Integration-Point Analysis

**A. `cozy-live.js`'s `createSubtitleChannel()`** — a real, existing
routing-metadata registry, but for a *channel*, not cue content; it has
no field or method to accept cue text/timestamps at all. Writing cue
data into it would require adding new fields/methods to a locked file —
out of scope for this engine (that integration, if ever done, belongs
to Engine 11's Coordinator role per `docs/history/M388.md`'s own
architecture: "1–10 above are its internal pipeline stages," i.e.
Engine 6 is a pipeline stage that Engine 11 orchestrates, not something
that reaches into `cozy-live.js` directly itself).

**B. `ldce-caption-engine.js`** — no integration point; different
capability (live local display vs. exportable timeline), different
file architecture (browser-global vs. ES module), no shared data shape.

**Conclusion:** same situation as Engine 5 — no existing repository
registry to attach output to. Engine 6 stays fully external and
standalone, output consumed only as a return value by its caller.

### 5. New Findings This Compose

None. No naming-collision risk found (unlike Engine 5's `AA-007`) — no
file reserves a `subtitle-timeline`-shaped name anywhere in the
repository.

### 6. Draft Implementation Contract (for Phase 2 Review)

1. New file(s) only, at
   `core/engines/media/subtitles/subtitle-timeline-engine.js` +
   `core/engines/media/subtitles/provider-srt-formatter.js` (or
   equivalent honest reference provider) — path confirmed free.
2. Does not modify `cozy-live.js`, `cozy-speech.js`, `cozy-media.js`,
   `media-pipeline-manager.js`, `audio-manager.js`, `cozy-hearing.js`,
   or `ldce-caption-engine.js` — no locked file touched.
3. No new registry write anywhere (per Integration-Point Analysis
   above, none exists) — output is a returned value only.
4. Registers one new entry in `engine-bridge-bootstrap.js`'s
   `REGISTRATIONS` array (`subtitle-timeline`).
5. Honest, not fabricated: real, deterministic cue-list construction
   and `.srt` export only from caller-supplied segments that already
   carry real text and real `startMs`/`endMs`. Segments missing text or
   valid timing are honestly skipped (documented in the result, not
   silently dropped and not fabricated). Overlapping cues (a real,
   computable condition — segment *i*'s `endMs` > segment *i+1*'s
   `startMs`) are flagged, never silently rendered as if clean.
6. Does not resolve `MD-014`'s wider scope beyond generation (e.g. any
   future burn-in/rendering-into-video capability), `MD-013`
   (streaming), or `MD-016` — out of scope, carried forward unchanged.

This draft is not binding — Phase 2 Review may revise it.

---

## Phase 2 — Review / Approval

**Independent re-verification performed against actual repository
source this pass:** fresh `grep -n "subtitle" modules/live/cozy-live.js`
reproduced the same real, structural-only `createSubtitleChannel()`/
`removeSubtitleChannel()` finding. Fresh read of
`ldce-caption-engine.js`'s header/class shape reproduced the same
live-display-only finding. Fresh repository-wide grep for
`.srt`/`toSRT`/subtitle-export patterns reproduced the same two
unrelated false-positive hits and no real implementation. Fresh count
of `engine-bridge-bootstrap.js`'s `REGISTRATIONS` array: 9 entries,
still no `subtitle-timeline` name.

**Verdict: Approved (not Revised).** All 6 Draft Contract items stand
unrevised into Implementation.

**Final Implementation Contract (6 items, confirmed this Review):**
1. New files only, at `core/engines/media/subtitles/subtitle-timeline-engine.js`
   + `core/engines/media/subtitles/provider-srt-formatter.js` — path
   reconfirmed free this Review.
2. Does **not** modify `cozy-live.js`, `cozy-speech.js`,
   `cozy-media.js`, `media-pipeline-manager.js`, `audio-manager.js`,
   `cozy-hearing.js`, or `ldce-caption-engine.js`.
3. No registry write anywhere — none exists to write into; output is a
   returned value only, consumed by a future caller (e.g. Engine 11).
4. Registers one new entry (`subtitle-timeline`) in
   `engine-bridge-bootstrap.js`'s `REGISTRATIONS` array.
5. Honest, not fabricated: real cue-list construction + `.srt` export
   only from segments the caller supplies with real text and real
   timing; segments missing either are honestly skipped and reported,
   never fabricated; overlapping cues are flagged, never silently
   accepted.
6. Does not resolve `MD-014` beyond its generation half, `MD-013`, or
   `MD-016`.

No application code, no implementation this pass's Phase 0–2 — Phase 3
begins as its own, separate focus, per Rule 77.

---

## Phase 3 — Implementation

Built exactly per the Final Implementation Contract (6 items, Phase 2
Review, above) — no item revised, no locked file touched.

**New files only:**
- `core/engines/media/subtitles/subtitle-timeline-engine.js` — core
  engine (provider registry, `buildTimeline()`, `exportSrt()`,
  `getCapabilities()`, `getServiceManifest()`, `registerWithKernel()`),
  following Engines 1/2/4/5's provider-interface split exactly.
- `core/engines/media/subtitles/provider-srt-formatter.js` — honest
  reference provider: real, deterministic cue-list construction (sort,
  sequential numbering, real overlap detection) and real `.srt`
  timestamp/text formatting, only from segments already carrying real
  text and real timing; honestly skips (and reports) anything else
  (contract item 5).
- `core/engines/media/subtitles/tests/subtitle-timeline-engine.test.js`
  — 22 real, executed tests.

**Confirmed by direct diff against this session's own Engine-5-closed
baseline ZIP:** the only modified existing file in the entire
repository is `core/bridge/engine-bridge-bootstrap.js`; the only new
content is the `core/engines/media/subtitles/` directory and this
history file. `cozy-live.js`, `cozy-speech.js`, `cozy-media.js`,
`media-pipeline-manager.js`, `audio-manager.js`, `cozy-hearing.js`, and
`ldce-caption-engine.js` are all byte-identical to baseline — contract
item 2 held exactly, no exception taken.

**`core/bridge/engine-bridge-bootstrap.js`** gained one new
`REGISTRATIONS` entry (`subtitle-timeline` →
`window.CozyOS.SubtitleTimelineEngine`), same precedent as Engines 1–5.
No other line of that file changed.

**No registry write anywhere (contract item 3):** confirmed —
`cozy-live.js`'s `createSubtitleChannel()` has no field for cue
content, so there is nothing to write into; this engine's output is a
returned value only.

**Honest, not fabricated (contract item 5):** `buildTimeline()` skips
and reports any segment missing real text or valid timing
(`skippedSegmentIds`) rather than inventing placeholder text or a
guessed timestamp; overlapping cues are detected and reported
(`overlaps`) rather than silently rendered as clean. `getCapabilities()`
reports `realTranscriptionOrTiming:false` — no unearned claim, matching
every sibling engine's own `realX:false` precedent.

**Does not resolve (contract item 6, unchanged):** `MD-014` beyond its
generation half (e.g. future burn-in/rendering-into-video), `MD-013`
(streaming pipeline), or `MD-016`.

## Phase 4 — Verification

`node --check` clean on all four new/modified files.

**22/22 real, executed tests pass**
(`core/engines/media/subtitles/tests/subtitle-timeline-engine.test.js`),
covering: real SRT timestamp math; honest empty/skip envelopes (zero
segments, missing text, invalid timing); real cue ordering and
sequential numbering; real overlap detection (both a detected case and
a clean-sequential case); a mixed valid/invalid segment batch; real
`.srt` text export matched byte-for-byte against an expected string;
frozen envelopes and `TIMELINE_BUILT` event emission;
capability/manifest/kernel-registration honesty checks; and custom-
provider registration.

**One real failure caught and fixed in this phase's verify-fix-reverify
loop (Rule 77):** the test `buildTimeline() mixes valid and invalid
segments correctly` called `.sort()` directly on the engine's own
(correctly) frozen `skippedSegmentIds` array, throwing `TypeError:
Cannot assign to read only property`. This was a bug in the test's own
assertion (`result.skippedSegmentIds.sort()` mutates in place), not in
the engine — fixed by copying the array first
(`[...result.skippedSegmentIds].sort()`). Re-verified: 22/22 pass.
This is the same category of fix Rule 77 describes as "completion of
the current engine, not new implementation" — no engine file was
touched to fix this.

**Regression — full re-run, all clean, no new failures:**
- Engine 1: 23/23, Engine 2: 31/31, Engine 3: 12/12, Engine 4: 23/23,
  Engine 5: 18/18 — all unchanged.
- Pre-existing `media-pipeline-manager.test.js` failure: reproduced
  identically (same missing `background-engine.js` line, `MD-004`/
  `MD-009`) — confirmed no new regression.

**Not performed this pass, honestly disclosed (Rule 116/117):** no
browser/DOM runtime is available in this environment. All verification
above is real Node execution, not a browser session — same disclosed,
non-blocking limitation already carried by Engines 3/4/5.

## Phase 5 — Registry Updates

- `MD-014` — 🟡 Composed → 🔵 Implementing
  (`docs/builder/knowledge/repair-queue.md`), same precedent as
  `MD-009`/`MD-010`/`MD-011`/`MD-012`.
- `docs/builder/knowledge/milestone-waiting-queue.md` updated: Engine 6
  moved to Closed (Phase 9); Engine 7 (Voice Generation) unlocked, Phase
  0 not started; "Quick answers" section refreshed.
- No new finding opened this Implementation (Compose found none, unlike
  Engine 5's `AA-007`).

## Phase 6 — Reports

This section (Phase 3–9) is the Phase 6 report for Engine 6's
Implementation, appended to this same file per the repository's own
established convention.

## Phase 7 — Handoff

`LATEST.md` and `HANDOFF.md` updated this pass to record Engine 6
Closed and Engine 7 unlocked, consistent with this file and the Waiting
Queue.

## Phase 8 — Packaging

Full repository ZIP built and verified this pass, per Rule 67/70/71/77
— see this session's Rule 67 Delivery block for filename, size, and
Package SHA-256 (never embedded in any repository file, per Rule 70).

## Phase 9 — Close

**Engine 6 (Subtitle Timeline Engine) is CLOSED.** Final Implementation
Contract items 1–6 fulfilled exactly as written — no locked file
touched. 22/22 real tests pass (after one real test-bug fix-and-
reverify cycle); Engines 1–5 regression clean. **Engine 7 (Voice
Generation Engine) is unlocked (Rule 68), Phase 0 not started.**

## Certification — Engine 6 / Subtitle Timeline (FINAL, this pass)
- Repository Verified: YES
- Compose Verified: YES
- Review/Approval: YES — Approved (not Revised)
- Implementation Verified: **YES** — new files only, Final Contract
  followed item-by-item, confirmed by direct `diff -rq` against this
  session's own Engine-5-closed baseline
- Verification Verified: **YES (Node-level, complete)** — 22/22 real
  tests after one real fix-and-reverify cycle (test-file bug, not an
  engine defect); Engine 1–5 regression re-run clean (23/31/12/23/18,
  unchanged); the one pre-existing, unrelated failure reproduced
  identically. A browser-level exercise was not run this pass (no
  browser/DOM available), honestly disclosed as open and non-blocking.
- Handoff Verified: YES — this section, plus `LATEST.md`/`HANDOFF.md`/
  `RELEASES.md`/Repair Queue/Waiting Queue all updated same pass
- Artifact SHA-256 Verified: YES — see `RELEASES.md`, this round
- Ready for Next Account: **YES — Engine 6 CLOSED. Begin Engine 7
  (Voice Generation Engine) Phase 0 next. Do not reopen Engine 6. Do
  not skip Engine 7's own Phase 0/Compose/Review before Implementation,
  per Rule 68/77.**
