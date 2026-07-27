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

## Resuming Across Conversations

To resume work on CozyOS in a new conversation, provide:
1. The repository baseline (the ZIP being evaluated) — Gate 0
2. The latest Continuation Document (e.g. `Milestone-174-Continuation.md`)
3. Any relevant roadmap document (e.g. `OCR-Roadmap.md`)

This is sufficient to resume from the exact certified repository state
without reconstructing history from conversation memory.
