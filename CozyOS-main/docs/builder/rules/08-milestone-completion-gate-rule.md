# Builder Rules — Addendum: Milestone Completion Gate

Extends `07-repair-queue-rule.md` (Rule 62). Cumulative per Rule 15;
replaces nothing.

## Rule 63 — Milestone Completion Gate

**Problem this rule closes:** Rules 61 and 62 make sure an individual
finding can't be called fixed prematurely. Nothing stopped the *milestone as
a whole* from being called done just because coding activity stopped —
"milestone drift," where new feature work quietly begins while unresolved
high-priority findings from the current milestone are still sitting open.
This rule closes that gap one level up from Rule 61/62.

### The Gate

A milestone may only be marked **Completed** when all of the following are
true:

- [ ] All planned implementations are finished.
- [ ] All syntax verification passes.
- [ ] Browser/device verification passes (if applicable).
- [ ] Regression verification passes.
- [ ] Integration verification passes.
- [ ] Repair Queue contains no High-priority Composed item *created by that
      milestone*. (Pre-existing High-priority items from an earlier
      milestone don't themselves block this one's completion, but a new one
      this milestone caused or discovered does.)
- [ ] `RELEASES.md` updated.
- [ ] `LATEST.md` updated.
- [ ] `HANDOFF.md` updated.
- [ ] Repository and package hashes generated.

**If any single condition is missing:**
- Milestone status = **Partial** (see enum below for the more granular
  value to record).
- Certification remains **NO**.
- The next Builder account's first job is completing the remaining gate
  items — not starting a new milestone.

### Milestone Status field

Both `LATEST.md` and `HANDOFF.md` must carry an explicit **Milestone
Status** field, at or near the top, using exactly one of these values:

| Status | Meaning |
|---|---|
| Planning | Scope being defined; no compose report yet |
| Compose | Findings/requirements being discovered and recorded; no repair yet |
| Implementing | Approved repairs actively being applied |
| Partial Verification | Some verification passes done and passing; not all required checks complete yet |
| Verification Complete | Every required verification check (syntax, browser, regression, integration) has passed for everything in scope |
| Completed | The full Rule 63 gate above is satisfied, with no exceptions — only this status permits certification to move to YES |
| Archived | Milestone closed and superseded by later work; kept for history only |

This gives any Builder — a new human-directed account, or CozyBuilder's own
runtime tooling — an immediate read on where the project stands before
touching anything, without needing to re-derive it from scattered evidence.

### Reason

Rule 61 governs one finding. Rule 62 governs the queue of all findings.
Rule 63 governs the milestone that contains them — the gate that decides
whether "the coding stopped" is allowed to be read as "the milestone is
done." It isn't, until every box above is checked.
