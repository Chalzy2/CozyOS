# Milestone Waiting Queue

Per Rule 75 (`docs/builder/rules/20-milestone-waiting-queue-rule.md`).
Permanent, single source of truth for cross-milestone state. Updated in
the same session as any Phase 0 start, engine close, phase completion,
pause, resume, or milestone close (Rule 75, "Maintenance").

**Seeding note (Rule 69 — honesty on scope):** this file is adopted
starting M388. Milestones prior to M387 (M144–M386) are real, Closed
history — recorded in detail in their own `docs/history/MNNN.md` files
and in `RELEASES.md` — but this pass does not re-derive a full
per-engine field set for each of them from scratch; doing so from
memory rather than a fresh repository read would risk exactly the kind
of fabrication Rule 69 forbids. They are listed below at Status =
Closed with a pointer to their authoritative record, not with invented
per-engine detail. M387.5 and M388 below are fully populated from this
session's own direct verification.

---

## M388 — "Living Media Interpreter" (Media/Speech Engine Chain)

**Status:** CLOSED (this pass) — all 11 engines Closed, M388's Approved
Implementation Order complete.

**Naming correction (`DI-006`, this pass):** this file previously named
the milestone "Living Live Interpretation," inconsistent with `LATEST.md`/
`HANDOFF.md`/`RELEASES.md`, which all say "Living Media Interpreter."
Corrected here to match the other three files.

**Current Engine:** Engine 11 — Video Interpreter Coordinator (Phase 0-4 complete, Phase 5-9 this pass — **CLOSED**)
**Current Phase:** Engine 11 **Phase 0 (Repository Verification) through
Phase 4 (Verification) all independently re-confirmed this pass** (fresh
ZIP integrity, Package SHA-256, Repository SHA-256, 10/10 Engine 11
tests, 196/196 Engine 1–10 regression, ownership/locked-file diff — all
matched exactly; one real documentation-only defect, `DI-011`, found and
fixed at Phase 4). **Phase 5 through Phase 9 completed this pass.** Full
report: `docs/history/M388-E11-VideoInterpreterCoordinator-Compose.md`.

**Repository SHA-256 discrepancy found and resolved this pass (`DI-009`):**
the ZIP delivered at the start of this Close round claimed a Repository
SHA-256 that did not match the hash independently recomputed from its
own actual contents (same canonical method, reproducible, not a locale
artifact). Per Rule 69, the independently verified hash was adopted as
this round's real starting state. Full detail:
`docs/builder/knowledge/repair-queue.md` (`DI-009`) and
`docs/history/M388-E10-StreamingPipeline-Compose.md` (Phase 0 section,
this round).

**Completed Engines:**
1. Media Decode Engine — Closed (Phase 9)
2. Language Detection Engine — Closed (Phase 9)
3. Living Translation Engine (Translation Pipeline) — Closed (Phase 9)
4. Speaker Diarization Engine — Closed (Phase 9)
5. Background Audio Separation Engine — Closed (Phase 9)
6. Subtitle Timeline Engine — Closed (Phase 9)
7. Voice Generation Engine — Closed (Phase 9)
8. Synchronization Engine — Closed (Phase 9)
9. Media Encode Engine — Closed (Phase 9) (`docs/history/M388-E9-MediaEncode-Compose.md`). `buildEncodePlan()` composes Engine 1/7/8's real outputs into a structural mux plan (`realEncode: false`, honest). 12/12 real tests pass; 178/178 total this round including regression.
10. Streaming/Playback Pipeline Engine — Closed (Phase 9). Full report: `docs/history/M388-E10-StreamingPipeline-Compose.md`. New file `core/engines/media/streaming/streaming-pipeline-engine.js`, one additive `REGISTRATIONS` entry, composes only via `cozy-live.js`'s existing public API. `modules/live/cozy-live.js` and `core/engines/playback/playback-engine.js` confirmed byte-identical to the pristine checkout. 21/21 real tests pass; 199/199 total including regression.
11. Video Interpreter Coordinator — **Closed (Phase 9) this pass.** Full report: `docs/history/M388-E11-VideoInterpreterCoordinator-Compose.md`. `core/engines/media/coordinator/video-interpreter-coordinator.js` composes Engines 1–10's own real public APIs into a single real, sequenced 8-stage pipeline (Decode → Language → Translation → Diarization → Audio-Separation → Subtitles → Voice-Generation → Synchronization → Encode → Streaming, cascading an honest skip whenever a required upstream stage was itself skipped or failed closed — never fabricating a downstream result over a missing upstream one). One additive `REGISTRATIONS` entry, no locked file touched (confirmed via file-list diff against the original delivered ZIP). 10/10 real tests pass; 196/196 Engine 1–10 regression tests re-run fresh and pass (one pre-existing, unrelated `media-pipeline-manager.test.js` failure reconfirmed, not fixed — `MD-004`/`MD-009`). Two real findings surfaced and resolved within this engine's own scope during Phase 2/3 (`MD-023`: `translateSegment()`'s required adapter argument, handled as an optional param with an honest skip; `MD-024`: Engine 9's `buildEncodePlan()` cannot run when Engine 8 was skipped, coordinator corrected to cascade the skip). `DI-010` (Phase 0/1: `MD-022`'s claim that no "Scene Manager" module exists was inaccurate — `scene-manager.js` does exist, tangential to this engine) and `DI-011` (Phase 4: two stale status lines in `LATEST.md`/`HANDOFF.md`) both found and fixed this milestone. **M388 — Living Media Interpreter is now COMPLETE. All 11 engines Closed.**

**Remaining Engines:** None. M388's Approved 11-engine Implementation
Order is fully Closed.

**Next Engine action:** None within M388 — the milestone is complete.
**Next Milestone:** Living AI Learning — its own Phase 0 (Repository
Verification), Phase 1 (Compose), and Phase 2 (Review/Approval) are the
correct next steps for a future session, searching the entire
repository for existing capabilities before proposing new engines, per
Rule 65. Not begun this pass.
**Current Stable ZIP:** `CozyOS-main-v3_02_28-M388-E11-Closed.zip` (this
session's Rule 67 Delivery block) — supersedes
`CozyOS-main-v3_02_27-M388-E11-Phase4-Verification.zip`.

**Repository SHA-256:** see `RELEASES.md` (Rule 60/70 — authoritative
location; this file is itself hash-included, so no live value is stated
here).

**Package SHA-256:** to be reported only in this session's Rule 67
Delivery block (never embedded in a repository file, per Rule 60/67).

---

## M387.5 — Real-Browser Verification (M372–M387 Living Engine Chain)

**Status:** CLOSED

**Current Engine:** n/a — single-milestone verification pass, no
per-engine structure.
**Current Phase:** Phase 9 (Close) — Complete.

**Completed Engines:** n/a (not a multi-engine milestone).
**Remaining Engines:** None.
**Next Engine:** n/a — unblocked M388's own Phase 0 per Rule 64.

**Current Stable ZIP:** the ZIP delivered at M387.5's own close (per its
Rule 67 Delivery block at the time — not restated here to avoid
duplicating a value whose authoritative copy lives in that session's own
delivery record).

**Repository SHA-256:**
`5698e75944f6c1a687c46988845459d4732a54f432e3953267fe23264153abab`
(per `LATEST.md`'s own M387.5 record, computed over all files except
`RELEASES.md`).

**Package SHA-256:** see `RELEASES.md` (Rule 60 — authoritative location).

---

## M144 – M386 (prior milestones)

**Status:** CLOSED (all)

Real, Closed milestones — authoritative detail lives in their own
`docs/history/MNNN.md` files (where present) and in `RELEASES.md`, not
reconstructed here. This queue does not carry per-engine fields for
these because Rule 75's own seeding note (above) applies: no fresh
repository-wide verification of each one's exact stop-point was
performed this pass, and restating remembered detail without that
verification would violate Rule 69.

---

## Quick answers (per Rule 75, "the queue must answer immediately")

- **Which milestone is active?** None. M388 just Closed this pass — the next milestone (Living AI Learning) has not begun.
- **Which milestones are paused?** None.
- **Which milestones are waiting?** Living AI Learning — not yet started; its own Phase 0/1/2 are the correct next step for a future session.
- **Which milestones are closed?** M388 (this pass), M387.5, and M144–M386 (see above).
- **Which engine is running?** None — Engine 11 (Video Interpreter Coordinator) Closed (Phase 9) this pass, completing M388.
- **Which engine is next?** None within M388 — the milestone is complete. The next session begins the Living AI Learning milestone's own Phase 0, not an Engine 12 (none exists).
- **How many engines remain (M388)?** 0 — all 11 Closed.
- **Which ZIP is the safe GitHub version?** `CozyOS-main-v3_02_28-M388-E11-Closed.zip` (this
  session's Rule 67 Delivery block) — supersedes
  `CozyOS-main-v3_02_27-M388-E11-Phase4-Verification.zip`.
