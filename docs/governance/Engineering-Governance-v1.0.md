# CozyOS Engineering Governance — v1.0 (Locked)

This document governs how CozyOS engineering milestones are verified,
documented, and certified. It prescribes process, not implementation
details, and applies to every subsystem (OCR, AI, Memory, or otherwise).

Established during Milestone 174 (OCR Provider Architecture) — reflects
what was actually exercised during that milestone, not a prewritten
template applied in advance.

## Lifecycle

```
Gate 0   Baseline Lock
Rule 00  Repository Version
Gate 1   Repository Verification
Gate 2   Implementation
Gate 3   Verification
Gate 4   Known Limitations
Gate 5   Continuation State
Certification
Migration Log Entry
```

## Gate 0 — Baseline Lock

Purpose: ensure every milestone is tied to one verified repository state.

**Conversation-scoped, not carried over.** A model instance cannot assume
continuity across conversations. Every new milestone begins with a fresh
Gate 0, even if a file with the same name was seen before. Never write
"continuing from the previous repository" unless the baseline is
explicitly re-established in the current conversation.

Required output:
- Repository source (ZIP, branch, or commit)
- Baseline identifier
- Date
- Statement that all findings apply only to this baseline

Example:
```
Baseline:  CozyOS-main-v1_3_0-M173.zip
Repository: CozyOS-main
Status:     Baseline locked for this conversation only.
Scope:      All findings, ownership decisions, implementation, and
            certification apply only to this uploaded baseline.
```

Any later ZIP, branch, or commit — even with the same filename — begins a
new baseline and a new Gate 0. No implementation begins before Gate 0 is
complete.

## Rule 00 — Repository Version

Verified facts only. Record:
- Repository
- Version
- Commit (if available)
- Date
- Continuation Document ID
- Repository Verification status

No inferred versions. No reconstructed history.

## Gate 1 — Repository Verification

Implementation is forbidden until this gate completes.

Activities: Ownership Review, Dependency Review, Runtime Review, Conflict
Review.

Possible outcomes:
- **A — Repository verified, no blockers.** Proceed to Gate 2.
- **B — Conflict found.** Implementation halted, no code modified. This is
  a *successful* Gate 1 outcome — stopping is correct behaviour, not a
  failed milestone.

## Gate 2 — Implementation

Document only actual repository modifications:
- Files Modified
- Files Created
- Files Archived
- Ownership changes
- Public API changes

Never include future plans, roadmap items, or intended work.

## Gate 3 — Verification

Each verification level must have matching evidence — no level is claimed
without it:

| Level | Evidence |
|---|---|
| Repository Verified | Repository inspection completed |
| Static Verified | Syntax check, lint, build validation |
| Runtime Verified | Node harness, unit tests, executable verification |
| Browser Runtime Verified | Only when exercised in an actual browser — script loading order, DOM lifecycle, Worker execution, Canvas, File APIs, WASM loading, browser-only behaviours |

Node runtime does not imply browser runtime. If browser verification is
unavailable, the record states:
```
Browser Runtime Verified   NOT VERIFIED
```
Never substitute Node evidence for it.

## Gate 4 — Known Limitations

Only verified limitations — e.g. vendor binaries absent, dependency
unresolved, feature intentionally deferred. Never speculation.

## Gate 5 — Continuation State

Snapshot of the repository after implementation:
- Canonical owners
- Active integrations
- Outstanding blockers
- Repository health

This becomes the starting point for the next milestone's Gate 0.

## Certification

Only after all prior gates complete. States exactly which verification
levels were achieved — no certification beyond available evidence:
```
Repository Verified
Static Verified
Runtime Verified
Browser Runtime Verified (only if evidenced)
Certified
```

## OCR Roadmap

Separate planning document (`OCR-Roadmap.md`). Contains future milestones
and long-term planning. Never mixed into milestone certification.

## Migration Log

Separate document (`Migration-Log.md`). Chronological record of completed
milestones only — forward-only, never backfilled, no plans or intentions,
only certified milestones. First entry begins with Milestone 175, not 174
(174 predates this locked process).

## Governance Principles (Locked)

1. One baseline per milestone.
2. Verify before modifying.
3. One canonical owner per responsibility.
4. Resolve ownership conflicts before implementation.
5. Document only completed work.
6. Distinguish Node runtime from browser runtime.
7. Record only repository evidence.
8. Keep roadmap separate from certification.
9. Keep migration history forward-only.
10. If evidence is missing, fail closed rather than infer.
11. **Scope Integrity** — every statement in a milestone must be traceable
    to one of: the locked baseline, the implementation performed during
    that milestone, or the verification evidence collected during that
    milestone. Nothing else belongs in the certification.
12. **Implementation Status Rule** (Milestone 356, generalized Milestone
    356c) — every configurable feature anywhere in CozyOS with more than
    one real implementation state — a voice provider, an auth factor, a
    payment integration, a translation pack, a sync/backup toggle, an
    access-control setting, or any future one — must display both a
    Current Status and a What's Needed Next, as two distinct fields that
    may never be merged into one line that obscures which is which.
    Current Status must always reflect the actual, verified
    implementation state — never softened, never implied to be further
    along than it is (e.g. "Not Enrolled", "Not Connected", "Offline",
    "Sandbox Mode", "Private", "Disabled" are all real, honest statuses,
    not failures to word something better). What's Needed Next names the
    real, concrete action that would move it forward (e.g. "Enroll a
    face scan in Security Settings", "Link an M-Pesa account", "Download
    language packs", "Connect a production payment gateway"), never a
    vague reassurance, and never phrased in a way that implies the
    feature already works. This applies to UI copy, milestone reports,
    and code comments alike. Adopting this rule for a given feature is
    itself a real milestone — verified against that feature's actual
    code, the same as any other implementation work — not a blanket
    claim to be asserted across the whole platform at once.
13. **Verification Before Certification** — before any feature is
    declared compliant with a Governance Principle (12 or any other), it
    must be individually verified against its current, actual
    implementation. Compliance is never inferred from a similar
    feature's compliance, a prior milestone, architectural intent, or
    assumption — each feature earns its own verified Current Status,
    What's Needed Next, Preservation Audit, Regression Check, and
    Certification. Repository-wide principles define the expected
    standard; a given feature meeting that standard is a separate,
    checked fact, not a inherited one. Reports must clearly distinguish
    Implemented, Verified, Planned, Intended, and Future Work — these
    are not interchangeable words. Code that has not been inspected in
    the current session is never certified, regardless of how confident
    a prior report sounded.

## Resuming Across Conversations

To resume work on CozyOS in a new conversation, provide:
1. The repository baseline (the ZIP being evaluated) — Gate 0
2. The latest Continuation Document (e.g. `Milestone-174-Continuation.md`)
3. Any relevant roadmap document (e.g. `OCR-Roadmap.md`)

This is sufficient to resume from the exact certified repository state
without reconstructing history from conversation memory.

For Cozy Builder sessions specifically (as distinct from general CozyOS
production milestones above), reading `docs/builder/handoffs/LATEST.md`
followed by the milestone handoff it points to (e.g.
`docs/builder/handoffs/M373.md`) — filed per Builder Rule 54, Continuous
Development Handoff — is sufficient on its own to resume Builder work
without reading the full project history.

## Markdown Governance — Active Project-Level Documentation Cap

CozyOS has a maximum of 10 active project-level Markdown documentation
slots.

Builder Rules (`docs/builder/rules/*.md`) and Builder Knowledge
(`docs/builder/knowledge/*.md`) are protected and exempt from this cap —
they remain governed by their own existing cumulative Builder Rules/
Knowledge lifecycle (Rule 15 and related), never counted against, merged,
or replaced to satisfy this limit.

Historical/checkpoint/milestone/audit records (`docs/checkpoints/*.md`,
`docs/history/*.md`, `docs/milestones/*.md`, `docs/audits/*.md`,
`docs/builder/**` non-rules/non-knowledge historical Builder records, and
root-level historical PROMPT/PHASE/PATCH/CHECKPOINT-style records) have
their own separate lifecycle and are exempt from this cap. They are not
deleted as part of maintaining it.

Module-scoped documentation (a subsystem's own `README.md`, e.g.
`applications/MpesaOS/README.md`, `core/vendor/tesseract/README.md`,
`runtime/README.md`, `server/live-relay/README.md`) documents that
subsystem locally and is exempt from the project-level cap.

The authoritative 10 active project-level slots are:

1. `README.md` — Project Overview
2. `CHANGELOG.md` — Current/Milestone Changelog
3. `RELEASES.md` — Release/Hash Ledger
4. `LATEST.md` — Current Status
5. `HANDOFF.md` — Handoff
6. `core/docs/CORE_ARCHITECTURE.md` — Architecture
7. `core/docs/DEVELOPMENT_RULES.md` — Project Development Rules
8. `docs/governance/Engineering-Governance-v1.0.md` — Governance (this file)
9. `docs/governance/OCR-Roadmap.md` — Roadmap
10. `docs/render-deployment.md` — Deployment

When a new project-level active Markdown document is required and all
10 slots are already occupied, the appropriate existing non-protected
slot is updated/replaced in place rather than creating an additional
active project-level Markdown file. The project-level active
documentation layer must never grow beyond these 10 slots.

This rule does not authorize merging real content out of one document
into another merely to manufacture compliance — it governs which
document a given kind of current information belongs in, and applies
only when a slot's existing content is genuinely being superseded or
updated, not as a pretext for content compression.
