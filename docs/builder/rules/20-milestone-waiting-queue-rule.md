# Rule 75 — Milestone Waiting Queue

Extends Rule 65 (Builder Lifecycle), Rule 68 (Per-Engine Lifecycle Gate),
and Rule 74 (Milestone Pause & Resume).

## Purpose

Rule 74 lets a milestone pause and resume without losing state, but its
own status block lives only inside `LATEST.md`/`HANDOFF.md` prose — one
milestone's status at a time, reconstructed by reading history. Rule 75
makes this permanent and structural: a single, standalone, always-current
file that automatically tracks every milestone the repository has ever
started, so "which milestone is active," "where exactly did a paused one
stop," and "which ZIP is safe" are answerable by reading one file, never
by searching chat history or reconstructing state from `docs/history/`.

## The Milestone Waiting Queue

File: `docs/builder/knowledge/milestone-waiting-queue.md`.

Permanent, append-only-by-milestone record. Every milestone the
repository has ever started gets exactly one entry, created the moment
that milestone's Phase 0 begins, updated every time its status changes,
never deleted.

### Required fields, per milestone

- Milestone ID
- Milestone Name
- Status — one of: **Active** · **Paused** · **Waiting** · **Closed**
- Current Engine
- Current Phase
- Completed Engines
- Remaining Engines
- Next Engine
- Current Stable ZIP
- Repository SHA-256
- Package SHA-256

### The queue must answer immediately, without further searching

- Which milestone is active?
- Which milestones are paused?
- Which milestones are waiting?
- Which milestones are closed?
- Which engine is running?
- Which engine is next?
- How many engines remain?
- Which ZIP is the safe GitHub version?

### Pausing an in-progress milestone (for an urgent milestone)

Per Rule 74, a milestone may only be paused at a verified-ZIP session
boundary. When paused, its Waiting Queue entry must record exactly where
it stopped — Current Engine and Current Phase are not optional for a
Paused entry. Example:

```
M388
Living Live Interpretation

Status: PAUSED

Stopped At:
Engine 4
Phase 3

Completed Engines:
1
2
3

Remaining:
4
5
6
7
8
9
10
11
```

### Resuming

When a Paused milestone resumes, the Builder must continue exactly from
its recorded Current Engine / Current Phase — no engine restart, no
repeated Compose/Review/Implementation/Verification work, no searching
chat history for context. The Waiting Queue entry is the sole authority
for where to resume; if it disagrees with anything remembered from a
prior session, the Waiting Queue wins (Rule 69 — Repository is
authoritative).

## Maintenance

The Waiting Queue must be updated, in the same session, whenever any of
the following happens to any milestone: Phase 0 begins (entry created,
Status = Active or Waiting), an engine closes (Completed Engines /
Current Engine / Next Engine updated), a phase completes and a ZIP is
produced (Current Stable ZIP / Repository SHA-256 / Package SHA-256
updated, per Rule 70/71), a milestone pauses (Rule 74 — Status = Paused,
Current Engine/Phase frozen at the stop point), a milestone resumes
(Status = Active again), or a milestone closes (Status = Closed, per
Rule 63's completion gate).

## Effect

The Milestone Waiting Queue becomes the repository's single source of
truth for cross-milestone state — superseding the need to reconstruct
"where did we leave off" from `LATEST.md` prose, `HANDOFF.md` prose, or
`docs/history/` files individually. Those files remain the detailed,
narrative record; the Waiting Queue is the fast, structural index over
all of them, for exactly the eight questions listed above.
