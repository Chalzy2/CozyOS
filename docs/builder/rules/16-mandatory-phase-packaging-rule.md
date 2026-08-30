# Rule 71 — Mandatory Phase Packaging

Extends Rule 67 (Delivery Metadata) and Rule 68 (Per-Engine Lifecycle Gate).

## Rule

Every completed phase automatically ends with packaging. After finishing
any phase (Phase 0–9), the Builder MUST, without pausing to ask
permission or announcing a stopping point mid-sequence:

1. Finish every required documentation update.
2. Verify repository integrity.
3. Compute Repository SHA-256.
4. Build the complete repository ZIP.
5. Compute Package SHA-256.
6. Verify the ZIP.
7. Produce the Rule 67 Delivery block.
8. End the session.

The Builder must never stop after saying "Tool limit reached," "Continue
to package," "Continue to build ZIP," or "Continue to compute hashes."
Those are violations of this rule. A completed phase and an undelivered
ZIP must never coexist as a stopping point.

## Session Boundary

A session/account's work is not finished until all of the following are
true:

- ZIP exists
- Repository SHA-256 and Package SHA-256 both computed
- `RELEASES.md` updated
- `HANDOFF.md` updated
- `LATEST.md` updated
- Rule 67 Delivery block printed

Only then is the phase considered closed out.

## Builder Planning (context budgeting)

Before beginning any phase, the Builder must estimate whether remaining
context is sufficient to finish that phase *and* its Rule 71 packaging
sequence above. If not:

- Do NOT start the next phase.
- Package the current, already-completed phase (steps 1–8 above).
- End session.
- The next Builder session continues from that ZIP.

A completed phase must never be left without its ZIP. This is what makes
every delivered ZIP a reliable checkpoint across accounts/sessions with
limited context: Account A finishes work, packages, and stops; Account B
resumes from that ZIP with zero repeated Compose/Review/Implementation
work, since the latest ZIP always contains the latest repository state.
