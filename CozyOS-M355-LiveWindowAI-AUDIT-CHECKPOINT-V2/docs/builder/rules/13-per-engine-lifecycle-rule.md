# Builder Rules — Addendum: Per-Engine Lifecycle Gate

Extends `10-builder-lifecycle-rule.md` (Rule 65) and `12-delivery-metadata-rule.md`
(Rule 67). Cumulative per Rule 15; replaces nothing.

## Rule 68 — Per-Engine Lifecycle

**Problem this rule closes:** Rule 65 named the Phase 0–9 sequence and
already states, in prose, that it applies per engine within a
multi-engine milestone (first exercised in `docs/history/M388.md`'s Phase
2 Review: "each of the 11 items above goes through the full ... cycle
independently"). But until now that per-engine application was only
narrative, milestone-specific text — no rule file made the actual
**gating mechanism** (engine N+1 may not begin until engine N reaches
Phase 9) a standing, cross-milestone requirement, the way Rule 64 does
for milestones themselves. This rule closes that gap.

### Engine Lifecycle

Every engine within a milestone independently moves through Rule 65's
Phase 0–9 sequence, with the following made explicit for engine scope:

- **Phase 0 (Repository Verification):** same checks as milestone-level
  Phase 0 (repository/package SHA-256, `LATEST.md`/`HANDOFF.md`/
  `RELEASES.md`, Rule Index, Repair Queue), scoped to what changed since
  the engine's own last checkpoint.
- **Phase 1 (Compose):** no application code. Report covers purpose,
  existing capabilities, ownership, composition opportunities,
  dependencies, interfaces, data flow, risks, security, performance
  targets, missing components, and Repair Queue impacts — the same
  discipline Rule 50/51 already require at milestone scope, applied to
  one engine.
- **Phase 2 (Review/Approval):** outcome is Approved, Approved (Revised),
  or Rejected. A Rejected outcome requires the registries and
  `LATEST.md`/`HANDOFF.md` to be updated to say so, and implementation
  does not begin. No implementation begins without Approved or Approved
  (Revised).
- **Phase 3 (Implementation):** only the approved contract. Must compose
  existing systems (Rule 50), not duplicate ownership (the locked
  ownership table an engine's Compose report already established), and
  record every changed file.
- **Phase 4 (Verification):** real, executed checks (Rule 61's discipline)
  — syntax, runtime, regression, compatibility, and, where applicable,
  performance and security. Every result is classified **VERIFIED**,
  **PARTIAL**, **NOT VERIFIED**, or **ASSUMED** — a finer-grained
  evidence taxonomy than Rule 61's finding-status taxonomy, used
  specifically for verification results within this phase.
- **Phase 5 (Registry Updates):** immediate, per Rule 62 — RP/RG/SF/MD/
  PF/AA/DI/DC entries for whatever this engine's Phase 3/4 actually
  produced. No unsupported (unevidenced) finding may be recorded.
- **Phase 6 (Reports):** Compose, Implementation, Verification,
  Improvement, and Continuation reports for this engine's pass.
- **Phase 7 (Handoff):** `LATEST.md`, `HANDOFF.md`, `RELEASES.md`, Repair
  Queue, and this engine's own history entry all updated together,
  including repository state, evidence, remaining work, and exactly what
  the next account must do.
- **Phase 8 (Package):** verification re-run after documentation updates
  (so the package reflects a state that was actually re-checked, not
  just edited); full repository ZIP, repository SHA-256, package
  SHA-256, ZIP size, and repository size produced; `RELEASES.md`
  appended per Rule 60.
- **Phase 9 (Close):** the engine is marked **Complete**, **Deferred**, or
  **Blocked**, with the closure reason recorded in its history entry.

### Engine Progression Gate

**The next engine may not begin Phase 0 until the current engine has
reached Phase 9.** This is the enforcement mechanism for Rule 65's
per-engine application, the same relationship Rule 64 has to Rule 63 at
milestone scope:

```
Engine 1: Phase 0 → 9
              ↓
Engine 2: Phase 0 → 9
              ↓
Engine 3: Phase 0 → 9
```

Parallel engine implementation is prohibited unless explicitly approved
and documented as an exception in the milestone's own history file,
naming which engines run in parallel and why their ownership boundaries
don't conflict.

### Repository Requirement

Per Rule 66, the repository — not the conversation — is the authoritative
record of every engine's state. A new Builder must be able to determine,
by reading repository documentation alone: the current engine, the
current phase, completed work, outstanding findings, and the next
required action.

### Compliance

A Builder that begins implementing an engine before that engine's own
Phase 0–2 are complete, or that starts the next engine before the current
engine reaches Phase 9, is not compliant with CozyBuilder's governance
rules.

### Reason

Rule 65 gave the milestone-level lifecycle its name and phases. Rule 64
made milestone sequencing binding (no jumping ahead while the gate is
unsatisfied). Multi-engine milestones like M388 need the identical
binding relationship at engine scope, or "per engine independently" (Rule
65's own phrase) remains aspirational language that a future account
could reasonably read past under time pressure. This rule makes it a
checkable fact, the same way Rule 63/64 did for milestones.
