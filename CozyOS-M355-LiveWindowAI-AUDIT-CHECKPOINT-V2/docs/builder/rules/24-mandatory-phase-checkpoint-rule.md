Rule 79 Addendum — Mandatory Phase Checkpoint

Every completed phase is a checkpoint.

At the end of EVERY completed phase, before starting the next phase, the Builder MUST:

1. Update all documents required for that phase.
2. Compute Repository SHA-256.
3. Compute Package SHA-256.
4. Build a FULL repository ZIP.
5. Verify ZIP integrity.
6. Print the complete Rule 67 Delivery Block.
7. Deliver the ZIP.

Only after successful ZIP delivery may the Builder continue to the next phase.

If the session ends unexpectedly, the latest delivered ZIP becomes the official recovery point.

No completed phase exists without a delivered ZIP.

Then the workflow becomes:
✅ Phase 0 → Rule 67 → ZIP
✅ Phase 1 → Rule 67 → ZIP
✅ Phase 2 → Rule 67 → ZIP
✅ Phase 3 → Rule 67 → ZIP
✅ Phase 4 → Rule 67 → ZIP
✅ Phase 5 → Rule 67 → ZIP
✅ Phase 6 → Rule 67 → ZIP
✅ Phase 7 → Rule 67 → ZIP
✅ Phase 8 → Rule 67 → ZIP
✅ Phase 9 → Rule 67 → Final ZIP

That means you'll always have a recoverable repository, and you'll never again lose hours of work because a Builder reached the context limit before producing a ZIP.
