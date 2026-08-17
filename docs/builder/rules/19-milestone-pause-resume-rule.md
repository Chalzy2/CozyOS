# Rule 74 — Milestone Pause & Resume

Extends Rule 65 (Builder Lifecycle), Rule 68 (Per-Engine Lifecycle Gate),
and Rule 72 (Roadmap Header).

## Purpose

Allow any milestone to be safely paused while another milestone is
completed, without losing progress, and resumed later — after any
length of time — from its exact last verified state.

## Rule

A milestone may be paused only immediately after producing a verified
repository ZIP (i.e., only at a Rule 71 session-closure boundary, never
mid-phase). Before pausing, the Builder must:

1. Complete the current phase (or engine sub-phase).
2. Produce the full repository ZIP (Rule 71).
3. Update `LATEST.md`, `HANDOFF.md`, `RELEASES.md`, and the Repair Queue.
4. Record the pause: which milestone, which engine, which phase it
   stopped at, in the Milestone Roadmap (below).

Resuming a paused milestone means starting from that exact recorded
engine/phase — never restarting the milestone, never restarting an
already-Closed engine, never repeating a phase that was already
Complete. Rule 68's per-engine gate and Rule 65's Phase 0–9 sequence
apply exactly as they would if the milestone had never paused.

## Milestone Roadmap (required repository content)

Every repository must contain a Milestone Roadmap, listing every
milestone the repository has ever tracked, its status
(ACTIVE / PAUSED / WAITING / COMPLETED), and — for the active or any
paused milestone — exactly which engine and phase it is at. Sourced only
from the repository's own real records (Rule 69) — never invented or
assumed. Format:

```
PROJECT MILESTONES

<status icon> <MNNN>
<Real Milestone Name>
Status: <ACTIVE | PAUSED | WAITING | COMPLETED>

Completed
✓ Engine <N> ...

Current
Engine <N>
Phase <N>

Remaining
🔒 Engine <N> ...
```

Status icons: 🔵 ACTIVE · 🟡 PAUSED · ⚪ WAITING (not yet started) ·
✅ COMPLETED.

Multiple milestones may be listed at once (one ACTIVE, any number
PAUSED/WAITING/COMPLETED) — the Builder must never lose track of which
is which, or of a paused milestone's exact stop point, regardless of how
much other work happens in between.

## Effect

With this rule, an urgent milestone can be started and finished without
losing any state in a currently in-progress milestone: pause the
in-progress one at its next verified-ZIP boundary, work the urgent one
to completion (itself following Rules 65/68/71/73 throughout), then
resume the paused milestone from its recorded engine/phase — no repeated
Compose, Review, or Implementation work, regardless of the gap in time.
