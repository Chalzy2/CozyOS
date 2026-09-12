# Rule 78 — Large Engine Implementation

Extends Rule 65 (Builder Lifecycle), Rule 76 (No Partial Phase
Completion), Rule 77 (Phase Focus).

## Rule

If an engine's Phase 3 implementation cannot reasonably finish in one
session:

1. Implement as much of Phase 3 as possible.
2. Produce a complete repository ZIP.
3. Update `LATEST.md`.
4. Update `HANDOFF.md`.
5. Update `RELEASES.md`.
6. Update the Repair Queue.
7. Update the Milestone Waiting Queue.
8. Record exactly: completed work, remaining work, and the next
   implementation step.
9. Compute Repository SHA-256.
10. Compute Package SHA-256.
11. Verify ZIP integrity.
12. Print the Rule 67 Delivery Block.
13. End the session.

**Do not attempt Phase 4 (Verification) until Phase 3 is fully
complete.** A partially-implemented engine is never verified as if it
were done — that would misrepresent an in-progress contract item as a
passing check, the same class of honesty failure Rule 6 (Never
Fabricate) forbids elsewhere in this project.

## Relationship to Rule 76

Rule 76 governs the decision *before* starting a phase (is there enough
budget to finish it, including packaging). Rule 78 governs what happens
if that estimate turns out wrong *mid-Phase-3* — implementation is
already underway and genuinely cannot finish this session. The recovery
action is the same in both cases: package the real, honest current
state and stop, never leave an implemented-but-unpackaged or
partially-implemented-but-silently-claimed-done stopping point.

## Adoption note

Formally adopted into the repository this session (M388, Engine 5
start), per the user's explicit instruction. No prior repository record
of this rule existed before this session.
