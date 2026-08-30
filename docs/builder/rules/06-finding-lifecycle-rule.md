# Builder Rules — Addendum: Finding Lifecycle (Compose ≠ Fixed)

Extends `04-implementation-contract-rule.md` (Rule 59) and
`05-release-manifest-rule.md` (Rule 60). Cumulative per Rule 15; replaces
nothing.

## Rule 61 — Finding Lifecycle

**Problem this rule closes:** a finding being written up in a compose
report — cause identified, evidence gathered — is not the same thing as
that finding being repaired. Nothing before this rule stopped a report from
reading as "fixed" when only the analysis stage had actually happened.

1. Every discovered issue is a **Finding** that must pass through exactly
   these five stages before it can be called fixed:
   - **Compose** — discover the issue, record evidence. Do not claim repair
     at this stage, even implicitly.
   - **Plan** — decide the smallest safe repair, identify every affected
     file, check for duplicate/competing engines before touching anything
     (Rule 6/Rule 50).
   - **Implement** — apply only the approved repair. No unrelated changes
     ride along.
   - **Verify** — syntax verification, browser verification, regression
     verification, integration verification. All four, not a subset,
     before the finding can close.
   - **Close** — mark the finding fixed; update the relevant RP/RG/MD/AA
     registry entry; update `LATEST.md`; update `HANDOFF.md`.

2. A finding is never described as fixed on the strength of Compose or Plan
   alone. "I found it and know what to do" is not "I did it and confirmed
   it worked."

3. **Every finding always carries exactly one of these states, everywhere
   it's mentioned** (reports, registries, `LATEST.md`, `HANDOFF.md`):

   | State | Meaning |
   |---|---|
   | 🟡 Composed | Discovered, evidence recorded, no repair attempted yet |
   | 🟠 Planned | Repair approach decided, not yet applied |
   | 🔵 Implementing | Repair applied, verification not yet complete |
   | 🟢 Fixed | Repair applied AND all four Verify checks passed |
   | 🔴 Failed Verification | Repair applied, but a Verify check failed — reverted or needs another Plan pass |
   | ⚪ Deferred | A deliberate decision not to repair this pass (e.g. out of scope, needs a bigger dedicated pass, or — per Rule 51/52 — genuinely nothing safe to implement yet) |

   A finding may never skip directly from 🟡 Composed to 🟢 Fixed in any
   report — the intermediate states must be shown to have actually
   happened, with evidence, not just implied.

## Handoff Requirement

Every handoff (`HANDOFF.md`, and any `docs/builder/handoffs/MNNN.md`) must
separate findings into exactly two sections:

**Composed (Not Yet Fixed)** — for every finding not at 🟢:
- Finding ID
- Description
- Evidence
- Priority

**Fixed** — for every finding at 🟢 only:
- Finding ID
- Files changed
- Tests passed
- Verification evidence

**Reason:** this lets the next Builder account tell, at a glance and without
re-deriving it, what is only analysis, what still needs implementation, and
what has actually been repaired and confirmed — so a compose report can
never again be read as if it were a completed fix.
