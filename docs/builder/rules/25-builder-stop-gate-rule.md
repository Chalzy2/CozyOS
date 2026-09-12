# Rule 80 — Builder Stop Gate

**Extends:** Rule 67 (Delivery Metadata), Rule 71/73 (Mandatory/Automatic
Packaging), Rule 76 (No Partial Phase Completion), Rule 79 (Mandatory
Phase Checkpoint).

**Status:** Adopted this pass, at the person's explicit direction,
specifically because the prior four rules (67/71/73/79) already state
the packaging requirement correctly but rely on the Builder *remembering*
to apply it before ending a session. Rule 80 does not restate that
procedure — it is a final, minimal, impossible-to-miss gate that sits
after all of it, framed as a single yes/no check rather than a
multi-step procedure, so a Builder under context pressure has one last
simple thing to check even if it has started to drift from the fuller
rules above.

## The Gate

Before ending any session, for any reason, ask only one question:

> **"Has a verified ZIP been produced for the work completed this
> session?"**

**If NO:**
- Do not end the session.
- Do not write "Continue," "Next turn," "I ran out of tool calls,"
  "I'll package next," "Say continue," or any equivalent deferral.
- Do not begin another engine, another phase, or any new work.
- Produce the ZIP.
- Verify it (integrity check, both hashes).
- Print the Rule 67 Delivery Block.
- *Then* end the session.

**If YES:** End the session. Nothing further is required by this rule.

## Why this is a separate rule from Rule 79

Rule 79 tells the Builder *what to do* at the end of a completed phase
(update docs, build ZIP, compute hashes, verify, deliver) — a procedure.
Rule 80 is not a procedure; it is a **gate condition** the Builder must
satisfy no matter which phase, sub-step, or interruption it is in. It is
deliberately the shortest, plainest rule in this repository, on purpose:
a Builder that has lost track of everything else can still satisfy one
one-sentence question. This is the intended last line of defense, not
the primary mechanism — Rules 67/71/73/76/79 remain the actual
packaging procedure this gate is checking for.

## Redundant surfacing (by design, not an accident)

Per the person's explicit instruction, this gate is deliberately restated
in more than one place so a Builder encounters it multiple times in the
same session regardless of which file it reads first:

1. **This rule file** — read as part of `00-INDEX.md`'s required reading
   order, alongside every other numbered rule.
2. **`HANDOFF.md`** — a `⚠ BUILDER STOP CHECK` checklist block at the very
   top of the file, before any status content.
3. **`LATEST.md`** — a single-sentence reminder directly under the title.
4. **The Builder Prompt itself** — a final reminder block the person adds
   to the end of any prompt that resumes work, so the gate is the literal
   last thing read before the Builder writes its final response.

No single one of these is assumed sufficient on its own — the redundancy
is the point.

## Precedence

Rule 80 is the final safety rule in this repository's numbering. It does
not override, relax, or replace any rule above it (per Rule 15 —
Cumulative, Never Replaced) — it is strictly additive, a closing check
applied after everything else in Rules 1–79 has already been followed.
