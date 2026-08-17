# Builder Rules — Addendum: Milestone Integrity

Extends `02-architecture-rules.md` (Rule 54, Continuous Development Handoff).
Does not replace or modify any existing rule, per Rule 15 (CozyOS Is
Cumulative) and Rule 24 (Corrections Extend, They Do Not Reopen Settled
Design).

## Rule 58 — Milestone Integrity

Once a milestone has been certified:

1. Its recorded scope is never silently redefined.
2. Work that was explicitly deferred inside a milestone's own compose
   report or handoff is never implemented under that same milestone
   number later — it becomes the next milestone.
3. Previous milestone records (compose reports, handoffs, certification
   reports) remain immutable, except for documented corrections filed
   as their own milestone.
4. If a new request appears to overlap a completed milestone's number
   or scope, the correct response is a Gate 1 Conflict Review — not
   quiet reuse of the old milestone ID.

**Reason:** without this rule, two different Builder sessions (or two
different accounts) can attach two different meanings to the same
milestone ID (e.g. "M374"), which breaks the Continuity Principle in
Rule 54 and the ZIP-First / forward-only Migration Log requirements in
the Engineering Rules. This rule closes that gap.

**Origin:** adopted during the Gate 1 Conflict Review that opened M375,
after the M374 naming/scope conflict described in
`docs/builder/compose/M375-compose-report.md`.
