# Builder Rules — Addendum: No Milestone Jumping

Extends `08-milestone-completion-gate-rule.md` (Rule 63). Cumulative per
Rule 15; replaces nothing.

## Rule 64 — No Milestone Jumping

**Problem this rule closes:** Rule 63 defines when a milestone *may* be
called Completed. Nothing before this rule explicitly forbade a Builder
from simply starting the *next* milestone anyway, while the current one
still sat at Partial. Rule 63 tells you the milestone isn't done; Rule 64 is
what actually stops work on the next one from starting regardless.

### The Rule

A Builder must not start M388 (or any later milestone) while either of
these is true:
- Any High-priority Repair Queue item exists that was created by the
  current milestone, **or**
- The current milestone's Milestone Status (Rule 63) is not **Completed**.

Both conditions being false is required — either one alone is enough to
block starting the next milestone.

### Allowed progression

```
M387.5
   ↓
Close AA-004
   ↓
Interactive verification
   ↓
Mobile verification
   ↓
Rule 63 passes
   ↓
M387.5 = Completed
   ↓
Start M388
```

### Not allowed

```
M387.5 (Partial)
        ↓
        M388
```

No exception for "the next milestone is unrelated to the open item," no
exception for "the open item is low-risk," no exception for schedule
pressure. If Rule 63's gate isn't satisfied, the only legitimate next action
is closing what's open in the current milestone — not opening a new one
alongside it.

### Reason

Rule 63 governs what "Completed" means for one milestone. Rule 64 is the
enforcement mechanism that makes that meaning binding across accounts — it's
specifically what "milestone drift" (new feature work continuing while
unresolved high-priority findings accumulate) requires to happen, and this
rule removes it as an option.
