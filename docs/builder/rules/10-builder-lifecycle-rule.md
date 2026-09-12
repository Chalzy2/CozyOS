# Builder Rules — Addendum: The Builder Lifecycle (Phase 0–9)

Extends `09-no-milestone-jumping-rule.md` (Rule 64). Cumulative per Rule 15;
replaces nothing.

## Rule 65 — Builder Lifecycle

**Problem this rule closes:** Rules 61–64 govern findings and milestones,
but nothing named the actual sequence of phases a milestone itself moves
through, end to end, in a form every account can check itself against
without re-deriving it from separate rules. This rule names that sequence
once, authoritatively, so any future Builder — human-directed or
CozyBuilder's own runtime — can state exactly where a milestone stands
without needing prior chat history.

### The Phases

| Phase | Name | Meaning |
|---|---|---|
| 0 | Repository Verification | Baseline ZIP uploaded, `LATEST.md`/`HANDOFF.md`/`RELEASES.md` read, repository SHA-256 verified against the checkout, prior milestone's Completed status confirmed. |
| 1 | Compose | Real-repository investigation (Rule 50/51 discipline) — existing capability inventoried, gaps identified, architecture proposed and reconciled against what's real. No code written. |
| 2 | Review / Approval | The Compose report is reviewed; any Architecture Ambiguity it raised (Rule 52) is resolved with real evidence, not a guess; the report is approved or revised. |
| 3 | Implementation | Approved Plan is implemented — only after Phase 2 is complete. Never starts on an unapproved or unresolved Compose report. |
| 4 | Verification | Syntax, browser, regression, and integration checks (Rule 61's four Verify types) run against the Phase 3 implementation. |
| 5 | Registry Updates | RP/MD/AA/Repair Queue entries created or updated to match the phase just completed — happens continuously, not only at the end (Rule 62: the moment a finding is Composed, not later). |
| 6 | Reports | The milestone's report artifacts (Compose report at Phase 1, verification reports at Phase 4, etc.) are written or finalized. |
| 7 | Handoff | `HANDOFF.md` updated to reflect the current phase, open items, and exact next action for the next account. |
| 8 | Package | Repository and package SHA-256 regenerated; `RELEASES.md` appended (never rewritten — Rule 60); ZIP repackaged. |
| 9 | Close | Rule 63's gate re-evaluated; if satisfied, Milestone Status moves to Completed and Rule 64 unblocks the next milestone. If not satisfied, the milestone remains open at whichever phase it stopped.

### How phases combine with milestone status

A milestone does not have to complete every phase in a single pass. It is
entirely normal — and, per Rule 63/64, required — for a milestone to stop
partway (e.g. at Phase 2, awaiting approval) and remain there across
multiple accounts. Phases 5, 6, 7, and 8 recur at *every* stopping point,
not only at the very end: registries, reports, handoff, and package are
kept current with wherever Phase 0–4 actually reached, so the repository
never describes work that hasn't happened.

### Recording phase status

Every milestone's `docs/history/MNNN.md` must include a **Builder
Lifecycle Status** block (see template in Rule 66's sibling documentation,
or any already-published example, e.g. `docs/history/M388.md`) showing
each phase's real status using: ✅ Complete · ⏳ Pending · ⏸ Locked (blocked
by an earlier incomplete phase) · ❌ Not Started. This block is the
permanent historical record of exactly where that milestone stopped — even
after `LATEST.md`/`HANDOFF.md` have since moved on to describe a later
milestone.

### Reason

`LATEST.md` describes the *current* state; `HANDOFF.md` is the operational
continuation guide for whoever picks up next; `docs/history/MNNN.md` is the
permanent record that survives both of those being overwritten by future
milestones. The Builder Lifecycle gives all three a shared, named
vocabulary for "where exactly did this stop," so the repository — not a
chat transcript — remains the complete source of truth for any account,
at any point, including years later.
