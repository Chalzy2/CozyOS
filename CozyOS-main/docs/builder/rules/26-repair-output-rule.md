# Rule 81 — CozyOS Repair Output Rule

**Adopted:** this pass, at the person's explicit direction, following
RP-025-A/RP-025-B. Formalizes the FREE-ACCOUNT SINGLE-PATH REPAIR
workflow already used for those two repairs into a permanent, named
rule so every future Repair session — not just this one — follows it
without needing to be re-specified each time.

**Extends:** Rule 62 (Repair Queue), Rule 67 (Delivery Metadata), Rule
69 (Repository Authority), Rule 80 (Builder Stop Gate). Does not
replace any of them — a Repair session still owes Rule 80's final
"was a verified ZIP produced" gate; this rule defines the workflow and
packaging shape that gets a Repair session to that gate honestly.

## Scope

Applies to every Repair session (an `RP-NNN`/`RP-NNN-X` item), as
distinct from a Milestone/Engine session (which Rules 58–79 already
govern). A Repair session must follow exactly one path:

**FIND → FIX → TEST → RECORD → PACKAGE → HANDOFF**

If a genuine blocker prevents full completion:

**FIND → FIX what is safely possible → TEST → RECORD BLOCKER → PACKAGE → HANDOFF**

Never fabricate completion. Never start a second, unrelated repair or
design path in the same session.

## 1. FIND

- Identify the specific broken behavior, missing capability,
  regression, or inconsistency.
- Inspect actual repository and deployment evidence before changing
  anything.
- Identify the owner file(s) and relevant dependencies.
- Do not guess or fabricate missing functionality.

## 2. FIX

- Make the smallest correct change that fixes the identified problem.
- Follow existing CozyOS architecture, registries, provider contracts,
  and governance — do not redesign unrelated systems.
- Do not modify locked/out-of-scope files unless the repair explicitly
  requires it.
- Do not create fake implementations merely to make a status display
  ONLINE, ACTIVE, or READY.
- Preserve working behavior outside the repair scope.

## 3. TEST

- Syntax-check every changed JS file.
- Run the relevant regression tests.
- Run broader repository integrity/syntax checks where practical.
- Verify unrelated/locked files were not changed.
- If the repair concerns a live capability, test the real capability —
  not merely its registration or its presence in the UI.
- **A capability may only be reported as ONLINE, READY, or ACTIVE
  after its real underlying operation succeeds.** Registration,
  wiring, or a loaded library is infrastructure, not a working
  capability, until a real operation has actually been observed to
  succeed.

## 4. RECORD

Record the repair in the repository's existing Builder records:

- repair history (`docs/builder/knowledge/repair-history-registry.md`)
- repair queue/status where applicable (`docs/builder/knowledge/repair-queue.md`)
- `LATEST.md`
- `HANDOFF.md`
- release information where required (`RELEASES.md`)

The record must state:

- **FIND** — what was actually wrong
- **FIX** — what actually changed
- **TEST** — what actually passed/failed
- **LIMITATION/BLOCKER** — what could not be verified
- **FILES CHANGED**
- **FINAL STATUS**

Never record an unverified capability as complete.

## 5. PACKAGE

The ZIP is the authoritative Repair deliverable.

Before the session ends:

- Update all required repository records.
- Calculate the required integrity/hash information.
- Build the complete ZIP.
- Verify the ZIP contents.
- Confirm the ZIP contains the repair records and handoff.
- Ensure the next Builder can continue from the ZIP alone, without
  needing the previous chat.

## 6. Output-Folder Rule

Standalone output files (delivered outside the ZIP, individually) are
restricted to:

- the full repository ZIP
- `.js`
- `.html`
- `.css`

**All Markdown/documentation files belong inside the ZIP, at their
real repository paths — never as a standalone output file.** This
includes, without exception: `HANDOFF.md`, `LATEST.md`, repair history,
repair queue, release notes, and any repair prompt written for a
future Builder session (e.g. `docs/builder/repair-prompts/*.md`).

| | |
|---|---|
| ❌ | standalone `RP-NNN-REPAIR-PROMPT.md` |
| ❌ | standalone `HANDOFF.md` |
| ❌ | standalone `LATEST.md` |
| ❌ | standalone repair reports |
| ✅ | `docs/builder/repair-prompts/RP-NNN-REPAIR-PROMPT.md` inside the ZIP |
| ✅ | `HANDOFF.md` inside the ZIP |
| ✅ | `LATEST.md` inside the ZIP |
| ✅ | repair history inside the ZIP |
| ✅ | the full ZIP as the authoritative baseline |

## 7. Single-Path Rule

A Repair session must not branch into unrelated improvements. It must
follow FIND → FIX → TEST → RECORD → PACKAGE → HANDOFF, or, if genuinely
blocked, FIND → FIX what is safely possible → TEST → RECORD BLOCKER →
PACKAGE → HANDOFF. It must not fabricate completion and must not start
a new repair/design path in the same session.

## 8. Session-Ending Rule

A Builder must never stop after only writing a design when
implementation is within the approved repair scope.

- If implementation is possible, implement it.
- If implementation is blocked, package the verified work and record
  the exact blocker.

The next Builder must be able to open the ZIP, read the repository
records and repair prompt, and continue from exactly where the
previous Builder stopped — without the prior chat.
