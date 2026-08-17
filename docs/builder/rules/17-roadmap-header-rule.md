# Rule 72 — Project Roadmap Header

Extends Rule 65 (Builder Lifecycle) and Rule 66 (Repository Completeness).

## Rule

Every `LATEST.md` and every `HANDOFF.md` must begin with a Project
Roadmap Header, before any other content in the file. The header states,
at a glance and without needing to read the rest of the file: the
current milestone, the current stable/authoritative ZIP, repository
integrity status, every engine's real name and real status in this
milestone's own Approved Implementation Order, which engine unlocks next
and under what condition, and a completion count.

The header's content must be sourced only from the repository's own
authoritative records (`docs/history/MNNN.md`'s Approved Implementation
Order, `RELEASES.md`, the Repair Queue) — never from chat history, a
prior account's summary, or an externally supplied engine list, per Rule
69. If an externally supplied roadmap conflicts with the repository's
own recorded engine names, count, or order, the repository is
authoritative and the discrepancy is noted, not silently adopted.

## Required Format

```
==================================================
COZYOS PROJECT ROADMAP
==================================================

Current Milestone
-----------------
<MNNN>

Current Stable ZIP
------------------
<filename of the most recently delivered, verified ZIP>

Repository Status
-----------------
Repository Verified
ZIP Verified
SHA-256 Verified

==================================================
ENGINE STATUS
==================================================

<one block per engine in the milestone's real Approved Implementation
Order, in order, using each engine's real name from that document>

✅ / 🟡 / 🔒 Engine <N>
<Real Engine Name>
Status: CLOSED / <real Phase name, e.g. PHASE 2 REVIEW> / LOCKED

==================================================
NEXT UNLOCK
==================================================

Current:
Engine <N>

After Phase 9:
Unlock Engine <N+1>

==================================================
SAFE GITHUB BUILD
==================================================

Latest Stable ZIP

<filename>

==================================================
PROJECT COMPLETION
==================================================

Completed Engines:
<count of Closed>

Current Engine:
<N, in progress>

Remaining Engines:
<count of Locked>
```

Legend: ✅ Closed (Phase 9 complete) · 🟡 currently in progress (any
Phase 0–8) · 🔒 Locked (blocked behind an earlier engine's Phase 9, per
Rule 68).

## Maintenance

This header must be updated every time `LATEST.md`/`HANDOFF.md` are
updated (i.e., every phase close, per Rule 71) — it is part of both
files' required content, not a one-time addition. If a milestone's own
Approved Implementation Order is later revised (as M388's own top-level
Phase 2 Review once revised an 8-step proposal to 11 steps), the header
must be updated to match on the same pass as that revision, per Rule 58
(Milestone Integrity).
