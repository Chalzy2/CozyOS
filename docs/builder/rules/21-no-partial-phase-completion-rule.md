# Rule 76 — No Partial Phase Completion

Extends Rule 65 (Builder Lifecycle), Rule 71/73 (Mandatory/Automatic
Phase Packaging), and Rule 75 (Milestone Waiting Queue).

## Rule

Before beginning any phase, the Builder must estimate whether it has
sufficient remaining execution budget to complete, in the same session:

1. Implementation
2. Verification
3. Documentation
4. Repository Hash computation
5. Package Hash computation
6. ZIP production
7. ZIP Verification
8. Rule 67 Delivery

If budget is insufficient for all eight, the Builder must not begin that
phase. Instead it must:

1. Produce a recovery ZIP of the current (last-known-good) repository state.
2. End the session.
3. Hand off cleanly (`LATEST.md`/`HANDOFF.md`/`RELEASES.md`/Waiting Queue
   all updated to match the recovery ZIP's actual contents).

A phase must never be left in a state where implementation is finished
but the repository ZIP has not been produced. "Continue and I'll build
the ZIP" is not a valid stopping point under this rule — the ZIP is the
finish line of every phase, not an optional next step.

## Required sequence, every phase

```
Recovery ZIP
   |
Implementation
   |
Verification
   |
Documentation
   |
Repository Hash
   |
Package Hash
   |
ZIP
   |
ZIP Verification
   |
Rule 67 Delivery
   |
Session Ends
```

## Effect

Combined with Rules 68–75, the repository is always left in a
recoverable state — a verified ZIP with matching Repository/Package
SHA-256 and up-to-date `LATEST.md`/`HANDOFF.md`/`RELEASES.md`/Waiting
Queue — regardless of account switches, usage limits, or a session
ending mid-phase. A session that runs out of budget mid-phase does not
lose work: it stops at the last completed, fully packaged checkpoint,
never at an undelivered implementation.
