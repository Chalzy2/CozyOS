# Rule 86 — Interruption Safety / Mandatory Mid-Milestone Differential Patch

Extends Rule 79 (Mandatory Phase Checkpoint), Rule 80 (Builder Stop Gate),
and Rule 85 (Continuous ZIP Recovery Checkpoint). Rule 85 already requires
a full-tree recovery ZIP after every meaningful unit of work. Rule 86 adds
a second, lighter-weight, faster-to-produce artifact for the specific
failure mode Rule 85 does not fully cover: an implementation session ending
abruptly — a tool/session/token/time limit — with **no full Rule 85
checkpoint yet produced** for the work just completed.

## Why this rule exists

A full Rule 85 recovery ZIP contains the complete working tree. That is
correct as the primary recovery mechanism, but producing it (re-packaging
the entire repository, re-hashing it, re-verifying it) takes real time and
tool calls. If a session is interrupted mid-operation — before that full
packaging step completes — the only artifact that may exist is a
half-written file or an unfinished implementation, which is not usable by
the next session. Rule 86 requires a smaller, always-fast-to-produce
artifact that can be created the moment a major subtask finishes, so that
even a session that never reaches its next full Rule 85 ZIP still leaves
something independently mergeable and honest behind.

## The rule

**INTERRUPTION SAFETY RULE:** This implementation may be interrupted by
Claude's (or any Builder's) tool/session limits. The Builder MUST create a
differential MID-MILESTONE PATCH checkpoint:

- before reaching the likely tool/session/time limit (best-effort estimate
  — there is no reliable countdown, so the Builder must checkpoint
  conservatively rather than wait for a signal that may never come), and
- whenever a major subtask is completed, regardless of remaining budget.

## Mandatory contents of a MID-MILESTONE PATCH

The patch must be based on the **last certified baseline** (not an
assumed or narrated one — the same baseline-authority requirement as Rule
69) and must contain **only added, modified, or deleted files** relative
to that baseline — never the full tree. It must include, at minimum:

1. **Manifest** — every file added, modified, or deleted, by exact path.
2. **Implementation status** — what is genuinely done vs. mid-edit vs.
   not started, stated plainly, per file if needed. A file that is
   present in the patch but not yet regression-tested must be labeled as
   such — it must never be presented the same way as a verified file.
3. **Exact test status** — real counts (`X/X pass`), never "all tests
   passed" without a number, per Rule 70/Rule 60's existing hash-and-count
   discipline.
4. **Limitations** — the honest technical boundaries of the patch.
5. **Missing dependencies** — what remains outstanding, unchanged from
   or updated against the prior checkpoint's own list.
6. **Protected-file audit** — explicit confirmation (by diff, not by
   assertion) that every protected file/path for the project is
   untouched, unless a task has explicitly authorized changing one.
7. **SHA-256, computed twice, matching** — per Rule 60/67/70's existing
   dual-hash discipline, applied to the patch archive itself.
8. **`NEXT BUILD MUST START WITH`** — explicit, in the exact format Rule
   79-family checkpoints already use — naming the first unresolved item
   in dependency order, not merely the easiest next task.

## Independently mergeable

A MID-MILESTONE PATCH must be applicable onto the last certified baseline
by diff/patch alone, without requiring any other artifact from the
interrupted session. It is not a substitute for a full Rule 85 recovery
ZIP or a Rule 79 phase-boundary certification package — it is the fallback
that exists precisely because a full one might not have been produced yet
when the interruption happens.

## Resume behavior

**Never wait for the session to terminate before creating the recovery
patch.** If a session is interrupted, the next session must resume from
the latest MID-MILESTONE PATCH — verified against its own dual SHA-256 and
merged onto the baseline it names — rather than restarting the work or
trusting a chat-history narrative of what was done (Rule 69's authority
principle applies here identically: the repository/patch is authoritative,
chat is not).

## Relationship to Rule 85 and certification

Rule 85's full-tree recovery ZIP remains the preferred, primary checkpoint
whenever there is time to produce one. Rule 86 exists for the gap Rule 85
cannot close by itself: the interval between "major subtask completed" and
"full Rule 85 ZIP actually produced." Neither a MID-MILESTONE PATCH nor a
Rule 85 recovery ZIP is ever, by itself, a certification artifact — the
word CERTIFIED remains reserved for the full Rule 79/80 gate (baseline
hash ×2, fresh extraction, full regression, byte-identity audit, governance
update, final ZIP, final hash ×2, delivered-copy verification).

## Mandatory prompt header

Every future implementation prompt for a governed subsystem must repeat
this rule at the top, verbatim or in substance:

    INTERRUPTION SAFETY RULE: This implementation may be interrupted by
    Claude's tool/session limits. You MUST create a differential
    MID-MILESTONE PATCH checkpoint before reaching the likely tool limit
    and whenever a major subtask is completed. The patch must be based on
    the last certified baseline, contain only added/modified/deleted
    files, include a manifest, implementation status, exact test status,
    limitations, missing dependencies, protected-file audit, SHA-256 x2,
    and explicit NEXT BUILD MUST START WITH. It must be independently
    mergeable onto the baseline. Never wait for the session to terminate
    before creating the recovery patch. If interrupted, the next session
    must resume from the latest MID checkpoint rather than restarting the
    work.
