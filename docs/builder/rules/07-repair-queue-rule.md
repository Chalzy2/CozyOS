# Builder Rules — Addendum: Repair Queue

Extends `06-finding-lifecycle-rule.md` (Rule 61). Cumulative per Rule 15;
replaces nothing.

## Rule 62 — Repair Queue

**Problem this rule closes:** Rule 61 gives every finding a state, but a
state sitting inside a report or a registry entry is easy to lose track of
across accounts — nothing forced a composed finding to become an explicit,
trackable work item with an owner and a priority. This rule closes that gap.

1. **Every finding, the moment it is Composed, automatically creates a
   Repair Queue entry.** This is not optional and not deferred to a later
   pass — Compose and the Repair Queue entry happen together.

2. **The Builder Workflow, extended:**

   ```
   Compose
       ↓
   Repair Queue
       ↓
   Plan
       ↓
   Implement
       ↓
   Verify
       ↓
   Close
   ```

   A finding can never move directly from Compose to Closed. The Repair
   Queue entry is what makes every intermediate stage visible and owned,
   not just theoretically required by Rule 61.

3. **Repair Queue record** (`docs/builder/knowledge/repair-queue.md`), one
   row per finding, columns:
   - **ID** — the finding's real ID (`RP-NNN`, `MD-NNN`, or `AA-NNN`)
   - **Status** — the Rule 61 state (🟡 Composed / 🟠 Planned / 🔵
     Implementing / 🟢 Fixed / 🔴 Failed Verification / ⚪ Deferred)
   - **Priority** — High / Medium / Low, assigned at Compose time and
     re-assessed at Plan time if new evidence changes the risk picture
   - **Owner** — which account is responsible (`Next Builder`, `Future
     Builder`, or a named account/session if applicable)
   - **Depends On** — `None`, or what's blocking progress (e.g.
     `Investigation`, `Feature milestone`, another finding's ID)

   The Repair Queue is a permanent, append-only log — entries are never
   deleted when closed, only updated to `🟢 Fixed` (or `⚪ Deferred` /
   `🔴 Failed Verification`), so the full history of every finding's
   priority and ownership stays auditable across every account.

## Handoff Requirement

Every `HANDOFF.md` (and any `docs/builder/handoffs/MNNN.md`) must include a
**Repair Queue Summary**, grouped strictly by priority, listing only
currently-open entries (not 🟢 Fixed ones — those stay in the full log, not
the summary):

```
Repair Queue Summary

High:
- <ID>

Medium:
- <ID>

Low:
- None
```

## Next Builder MUST (added to the existing Rule 59/61 lists)

1. Read the Repair Queue (`docs/builder/knowledge/repair-queue.md`) before
   starting any work.
2. Pick the highest-priority open item — do not skip ahead to a
   lower-priority item just because it looks easier.
3. Implement only that item — no unrelated changes ride along (Rule 59/61
   still apply in full).
4. Verify — all four checks (syntax, browser, regression, integration),
   per Rule 61. Do not mark Fixed on partial verification.
5. Mark Fixed in the Repair Queue and the finding's own registry entry.
6. Update `RELEASES.md` (Rule 60) with the new repository hash.
7. Generate a new `HANDOFF.md` (and milestone handoff, per Rule 54)
   reflecting the updated Repair Queue Summary.

**Reason:** Rule 61 defines a finding's lifecycle; Rule 62 ensures every
finding has an explicit, owned work item for as long as it remains open —
together they make multi-account development robust against a composed
issue being forgotten, or mistaken for a completed repair, simply because no
one account was around to see it through every stage.
