# Builder Rules — Addendum: Implementation Contract Fidelity

Extends `03-milestone-integrity-rule.md` (Rule 58). Cumulative per Rule 15;
replaces nothing.

## Rule 59 — Implementation Contract Fidelity

1. Every implementation session must begin by loading the latest
   Compose Report for the milestone it is implementing.
2. The implementation account may not redesign architecture, change
   what's being created/modified/reused, or revisit a "Postpone"
   decision, unless it discovers new evidence that contradicts the
   compose report.
3. Any such contradiction must be documented — what was found, where,
   and why it changes the decision — *before* any code changes begin.
   A contradiction is not grounds to quietly improvise; it's grounds
   to pause and re-run the relevant part of Gate 1.
4. Scope items copied from an example or template are not exempt from
   this rule — e.g. a "Modify: dashboard.html" line is only real scope
   if it's independently verified against the actual repository, the
   same as anything else in the contract.

**Reason:** this is what lets a different account pick up implementation
without repeating discovery, while still keeping the compose report
honest — it's binding, not just informative, but only for what it
actually verified.

## Compose Report Header (required going forward)

Every compose report must open with a machine-readable block:

```
Compose ID: <milestone>
Repository: <repo name>
Milestone: <milestone label>
Status: <PENDING APPROVAL | APPROVED | SUPERSEDED>
Implementation Ready: <YES | NO>

Create:
- <files>

Modify:
- <files, only if independently verified>

Reuse:
- <existing engines/systems composed, not duplicated>

Do Not Build:
- <deferred items>

Reason:
<why deferred items are deferred>

Risk:
<LOW | MEDIUM | HIGH>

Next Milestone:
<id, if already known>
```
