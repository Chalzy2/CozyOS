# Builder Rules — Master Index

**Read this file first**, before any other file in `docs/builder/rules/`.
Every rule below is cumulative (Rule 15 — CozyOS Is Cumulative): later rules
extend earlier ones and never silently replace them. This index exists so
any future Builder session — a new human-directed account, or CozyBuilder's
own runtime tooling (`core/modules/builder/*.js`) consulting its rule
library — has one place to find every governance rule that applies to
composing, planning, implementing, and verifying CozyOS work, rather than
needing to discover files individually.

This index itself must be updated the moment a new rule file is added —
an undiscoverable rule is as good as no rule.

## Files, in required reading order

| File | Rules | What it governs |
|---|---|---|
| `02-architecture-rules.md` | 1–24, 49–55 | The 24 canonical Master Production Rules (naming, roles, startup sequence, registration order, honest verification, cumulative-not-replaced) plus the Cozy Builder Governance Rules (49–55: verified workspace integrity, compose-before-implementation, missing-dependency resolution, architecture-ambiguity classification, ZIP classification, continuous handoff, continuous self-improvement) |
| `03-milestone-integrity-rule.md` | 58 | Once a milestone is certified, its scope is never silently redefined; deferred work becomes the *next* milestone, not a retroactive edit to the current one |
| `04-implementation-contract-rule.md` | 59 | Implementation Contract Fidelity — an implementation session must load and honor the compose report it's implementing; contradictions are documented and paused on, never quietly improvised around |
| `05-release-manifest-rule.md` | 60 | Release Manifest Pattern — a package can never contain a correct hash of its own final bytes; `RELEASES.md` is the single, append-only, authoritative location for package hashes, computed and communicated outside the package itself |
| `06-finding-lifecycle-rule.md` | 61 | Finding Lifecycle (Compose ≠ Fixed) — every finding must show Compose → Plan → Implement → Verify → Close, with one of 6 explicit states at all times; never skip straight from Composed to Fixed |
| `07-repair-queue-rule.md` | 62 | Repair Queue — every Composed finding automatically becomes a tracked work item (ID, Status, Priority, Owner, Depends On) in `docs/builder/knowledge/repair-queue.md`; every handoff must summarize open items by priority |
| `08-milestone-completion-gate-rule.md` | 63 | Milestone Completion Gate — a milestone is never "Completed" just because coding stopped; 10 explicit conditions (implementation, all 4 verify types, no new High-priority open Repair Queue items, `RELEASES.md`/`LATEST.md`/`HANDOFF.md` updated, hashes generated) must all hold, and both `LATEST.md`/`HANDOFF.md` must carry an explicit Milestone Status field |
| `09-no-milestone-jumping-rule.md` | 64 | No Milestone Jumping — a Builder must not start the next milestone while any High-priority Repair Queue item from the current milestone is open, or the current milestone's Rule 63 Milestone Status isn't Completed; the enforcement mechanism that makes Rule 63 binding across accounts |
| `10-builder-lifecycle-rule.md` | 65 | Builder Lifecycle (Phase 0–9) — the named, authoritative sequence every milestone moves through (Repository Verification → Compose → Review/Approval → Implementation → Verification → Registry Updates → Reports → Handoff → Package → Close); every milestone's `docs/history/MNNN.md` records a Builder Lifecycle Status block showing exactly which phase it reached, so the repository — not chat history — is the permanent source of truth |
| `11-repository-completeness-rule.md` | 66 | Repository Completeness — every finding (`RP`/`RG`/`MD`/`SF`/`PF`/`AA`/`DI`/`DC`) must be written into its repository registry, never left only in chat; the repository is the single source of truth; the only information allowed outside it is packaging metadata that would create a self-reference loop (ZIP filename, ZIP size, repository size, Package SHA-256, download info); information existing only in chat is treated as undocumented and may not be relied upon; extends Rule 63's Milestone Completion Gate with repository-completeness checks |
| `12-delivery-metadata-rule.md` | 67 | Delivery Metadata — fixes the exact contents/format of the packaging metadata Rule 66 excludes from the repository (ZIP filename, ZIP size, repository size, Package SHA-256 — Repository SHA-256 stays in `RELEASES.md` per Rule 60 and is only restated for convenience); mandates a fixed `Delivery` block, every delivery, with ZIP-size and repository-size deltas against the previous delivery so growth/shrinkage can be tracked without embedding tracking data in the package it describes |
| `13-per-engine-lifecycle-rule.md` | 68 | Per-Engine Lifecycle Gate — makes Rule 65's per-engine application of the Phase 0–9 sequence a binding, checkable gate rather than narrative text: the next engine in a multi-engine milestone may not begin Phase 0 until the current engine reaches Phase 9 (Complete/Deferred/Blocked), the same enforcement relationship Rule 64 has to Rule 63 at milestone scope; also names the finer VERIFIED/PARTIAL/NOT VERIFIED/ASSUMED evidence taxonomy used within an engine's own Phase 4 |
| `14-repository-authority-rule.md` | 69 | Repository Authority — if chat history, screenshots, user summaries, or previous Builder claims conflict with the repository's own contents, the repository is authoritative by default; the Builder must record the discrepancy, explain it, and continue from the repository's recorded phase, never assuming undocumented work exists. Includes a Newer-ZIP Exception: if the repository is proven older than a newer verified ZIP (SHA-256/version-metadata mismatch), the Builder stops and requests the newer ZIP instead of proceeding |
| `15-hash-recording-rule.md` | 70 | Hash Recording — extends Rule 60/67: Repository SHA-256 must never be embedded in any file that participates in the repository hash (this includes `LATEST.md`/`HANDOFF.md`, not just application files); Package SHA-256 must never be embedded in the package it hashes. Repository SHA-256 belongs only in `RELEASES.md` and the Rule 67 Delivery block; Package SHA-256 belongs only in the Delivery block, after final packaging. A hash found written into a file before that file's content was finalized must be treated as invalid and recomputed. Adopted after a real self-inflicted instance of this exact bug during M388 Round 13's Engine 2 close-out |
| `16-mandatory-phase-packaging-rule.md` | 71 | Mandatory Phase Packaging — extends Rule 67/68: a completed phase and an undelivered ZIP must never coexist as a stopping point. The Builder must never pause after a phase to ask whether to package — finishing docs, verifying integrity, computing both hashes, building the ZIP, verifying it, and printing the Rule 67 Delivery block are all mandatory, automatic continuations of finishing a phase, not a separately-approved next step. If remaining context looks insufficient to finish a phase plus its packaging, the Builder must not start that phase — it must package the last completed phase and end the session instead, so the next account always resumes from a valid ZIP checkpoint |
| `17-roadmap-header-rule.md` | 72 | Project Roadmap Header — extends Rule 65/66: `LATEST.md`/`HANDOFF.md` must each begin with a Project Roadmap Header (current milestone, current stable ZIP, repository/ZIP/hash verification status, every real engine's name/status from the milestone's own Approved Implementation Order, next-unlock condition, completion count) sourced only from the repository's own authoritative records, never from an externally supplied roster — Rule 69 governs any conflict |
| `18-automatic-session-closure-rule.md` | 73 | Automatic Session Closure — extends/restates Rule 71 as a hard behavioral requirement: on completing a phase, the Builder must automatically update docs, build/verify the full ZIP, print the Rule 67 Delivery block, and end the session — never asking whether to package, continue, or finish. Combined with Rules 68–72, this fixes the full per-phase workflow: complete phase → update docs → verify → build ZIP → compute hashes → deliver → end session |
| `19-milestone-pause-resume-rule.md` | 74 | Milestone Pause & Resume — extends Rule 65/68/72: a milestone may be paused only immediately after a Rule 71 verified-ZIP checkpoint (never mid-phase), recording exactly which engine/phase it stopped at in a required Milestone Roadmap (ACTIVE/PAUSED/WAITING/COMPLETED per milestone, sourced only from real repository records per Rule 69). Resuming means continuing from that exact recorded point — never restarting a milestone, a Closed engine, or a Complete phase — so an urgent milestone can be worked to completion and the paused one resumed later, regardless of elapsed time, with zero repeated work |
| `20-milestone-waiting-queue-rule.md` | 75 | Milestone Waiting Queue — extends Rule 65/68/74: makes Rule 74's per-milestone status a permanent, standalone, always-current file (`docs/builder/knowledge/milestone-waiting-queue.md`) rather than prose inside `LATEST.md`/`HANDOFF.md`. Tracks every milestone (ID, Name, Status Active/Paused/Waiting/Closed, Current Engine, Current Phase, Completed/Remaining/Next Engines, Current Stable ZIP, Repository SHA-256, Package SHA-256), updated the same session as any Phase 0 start, engine close, phase completion, pause, resume, or milestone close. Answers "which milestone is active/paused/waiting/closed," "which engine is running/next," "how many engines remain," and "which ZIP is safe" from one file, without searching chat history |
| `21-no-partial-phase-completion-rule.md` | 76 | No Partial Phase Completion — extends Rule 65/71/73/75: before starting any phase, the Builder must estimate whether it has enough remaining execution budget to finish Implementation, Verification, Documentation, both hashes, ZIP production, ZIP Verification, and Rule 67 Delivery in the same session; if not, it must not start that phase, and instead must produce a recovery ZIP of the current state and end the session cleanly. A phase must never be left implemented but unpackaged — "continue and I'll build the ZIP later" is not a valid stopping point |
| `22-phase-focus-rule.md` | 77 | Phase Focus — extends Rule 65/68/71/73/76: while inside a phase (especially Phase 3, Implementation), the Builder focuses only on that phase — no planning later phases, no release notes, no future-work estimates, no starting another engine. Phase 3 completing flows immediately into Phase 4 (Verification); a failed check is fixed and re-verified in a loop until all pass — this loop is completion of the current engine, not new implementation. After Phase 4 passes, Rule 65's Phase 5–9 sequence continues without pause to the Rule 67 Delivery Block and session end; no other engine begins in the same session |
| `23-large-engine-implementation-rule.md` | 78 | Large Engine Implementation — extends Rule 65/76/77: if an engine's Phase 3 cannot reasonably finish in one session, the Builder implements as much as possible, then packages that real partial state exactly like a completed phase would be packaged (full ZIP, `LATEST.md`/`HANDOFF.md`/`RELEASES.md`/Repair Queue/Waiting Queue updated, both hashes, ZIP verified, Rule 67 Delivery printed, session ended) with an explicit completed/remaining/next-step record. Phase 4 (Verification) is never attempted against an incomplete Phase 3 — that would misrepresent in-progress work as passing |
| `24-mandatory-phase-checkpoint-rule.md` | 79 | Mandatory Phase Checkpoint — generalizes Rule 78's per-phase packaging discipline to every phase, not just Phase 3: at the end of any completed phase (0 through 9), before starting the next, the Builder must update the phase's required documents, compute both hashes, build and integrity-verify a full repository ZIP, print the Rule 67 Delivery Block, and deliver it — only then may the next phase begin. No completed phase exists without a delivered ZIP; the latest delivered ZIP is always the official recovery point if a session ends unexpectedly |
| `25-builder-stop-gate-rule.md` | 80 | Builder Stop Gate — the repository's final safety rule. Before ending any session, ask only one question: "Has a verified ZIP been produced for the work completed this session?" If NO: do not end, do not write "Continue"/"Say continue"/any deferral, do not start new work — produce the ZIP, verify it, print the Rule 67 Delivery Block, then end. If YES: end. A minimal, one-question gate layered after Rules 67/71/73/76/79's fuller packaging procedure, deliberately restated in `HANDOFF.md`'s top-of-file checklist, `LATEST.md`'s title-line reminder, and the Builder Prompt's own final-reminder block, so it is encountered multiple times regardless of reading order |
| `30-continuous-zip-recovery-checkpoint-rule.md` | 85 | Continuous ZIP Recovery Checkpoint — extends Rule 79/80 to the *inside* of a phase, not just its boundary: after every meaningful completed unit of work (an audit, a file created/modified-and-syntax-verified, a test suite created, tests passing, integration, regression, a governance update, packaging) the Builder must produce a checkpoint ZIP, compute its SHA-256 (single hash for ordinary recovery checkpoints, dual matching hash only when a checkpoint is promoted to certification), and continue immediately — never treating checkpoint creation itself as a stopping point while budget remains. Checkpoints are immutable and cumulative (`<MILESTONE>-START` → `-IMPLEMENTED` → `-TESTED` → `-MID` → `-REGRESSION` → `-FINAL`), must each contain the complete working tree (not a diff), and every future Builder/milestone prompt for a governed subsystem must repeat this rule's mandatory header at the top. Certification itself is unchanged and still requires the full Rule 60/65/67/70/79/80 gate |

## Related, non-rule governance files (read alongside, not instead of, the above)

- `docs/builder/knowledge/repair-queue.md` — the live Repair Queue (Rule 62)
- `docs/builder/knowledge/repair-history-registry.md` — closed repairs (RP-NNN)
- `docs/builder/knowledge/missing-dependency-registry.md` — missing dependencies (MD-NNN)
- `docs/builder/knowledge/architecture-ambiguity-registry.md` — open ambiguities (AA-NNN)
- `docs/builder/knowledge/regression-registry.md` — regressions (RG-NNN)
- `docs/builder/knowledge/security-finding-registry.md` (SF-NNN), `performance-finding-registry.md` (PF-NNN), `documentation-integrity-registry.md` (DI-NNN), `duplicate-consolidation-registry.md` (DC-NNN) — see Rule 52's "Section 5 — Builder Registry Family" in `02-architecture-rules.md` for why these stay separate
- `docs/builder/handoffs/LATEST.md` → the most recent milestone handoff (Rule 54)
- `/LATEST.md`, `/HANDOFF.md` (repository root) — the Continuous Development Contract itself; must reflect every rule above, every session

## How this applies beyond browser-verification passes

These rules are not specific to M387.5 or to browser verification — they are
CozyBuilder's general operating rules for **all future coding, planning,
composing, implementing, and verifying work**, in any milestone:

- **Planning** any new engine, module, or feature: start at Rule 50
  (Compose Before Implementation) and Rule 51 (Missing Dependency
  Resolution) — reuse/compose before writing anything new.
- **Coding** any repair, however small: Rule 61's five stages apply, not
  just to milestone-scale work — a one-line fix still needs its Verify step
  shown, not assumed.
- **Tracking** anything found but not yet fixed, of any kind (a bug, an
  ambiguity, a missing file, a policy question): Rule 62 requires a Repair
  Queue entry the moment it's discovered, not at some later cleanup pass.
- **Releasing** any package, at any milestone: Rule 60 applies — hashes go
  in `RELEASES.md`, never embedded in the artifact they describe. Rule 70
  extends this: Repository SHA-256 must also never be embedded in any
  *other* hashed file (`LATEST.md`/`HANDOFF.md` included) before that
  file's own content is final, and Package SHA-256 must never be written
  into any repository file at all — only into the Rule 67 Delivery block,
  after the ZIP is built.
- **Handing off**, at the end of any session: Rule 59's contract fidelity,
  Rule 61's Composed/Fixed split, and Rule 62's Repair Queue Summary all
  apply together — a handoff is incomplete without all three.
- **Closing** any milestone, of any kind: Rule 63's gate applies — coding
  activity stopping is not the same thing as the milestone being done; the
  full 10-item checklist must be satisfied, and `LATEST.md`/`HANDOFF.md`
  must carry an accurate Milestone Status value, before certification can
  ever move to YES.
- **Closing** any milestone or, per Rule 65, any single engine's own
  lifecycle: Rule 66 applies alongside Rule 63 — every finding produced
  this session must already be written into its repository registry, not
  just described in a report or a chat reply, before Complete can be
  claimed. If it only exists in chat, treat it as undocumented.
- **Progressing** between engines within a multi-engine milestone: Rule 68
  blocks the next engine's Phase 0 outright until the current engine's
  Phase 9 (Close) is recorded as Complete, Deferred, or Blocked — checked
  before that next engine's Compose begins, the same relationship Rule 64
  has to milestones.
- **Delivering** any package, at any milestone: Rule 67 applies — ZIP
  filename, ZIP size, repository size, and Package SHA-256 go only in the
  delivery message's fixed `Delivery` block, with size deltas against the
  previous delivery; none of those four are written into the repository as
  this release's live value (Repository SHA-256 is the one exception —
  it stays in `RELEASES.md` per Rule 60, and is only restated for
  convenience in the delivery block). Rule 71 makes this non-optional:
  finishing a phase and delivering its ZIP are the same event, never two
  separately-approved steps.
- **Starting** any new milestone, of any kind: Rule 64 blocks it outright if
  the current milestone has any High-priority Repair Queue item it created,
  or isn't at Milestone Status = Completed. This is checked *before*
  planning work for the next milestone begins, not discovered partway
  through it.
- **Tracking where a milestone actually stopped**, at any point, for any
  reason: Rule 65 names the Phase 0–9 sequence every milestone moves
  through and requires a Builder Lifecycle Status block in that
  milestone's `docs/history/MNNN.md` — so `LATEST.md`/`HANDOFF.md` moving
  on to a later milestone never erases the permanent record of exactly
  where an earlier one left off.
- **Running any Repair session** (an `RP-NNN`/`RP-NNN-X` item, as
  opposed to a Milestone/Engine session): Rule 81
  (`26-repair-output-rule.md`) governs the whole workflow — single-path
  FIND → FIX → TEST → RECORD → PACKAGE → HANDOFF (or, if genuinely
  blocked, FIND → FIX what is safely possible → TEST → RECORD BLOCKER →
  PACKAGE → HANDOFF); a capability may only be reported ONLINE/READY/
  ACTIVE after its real operation is observed to succeed, never on
  registration/wiring alone; and every Markdown/documentation file
  (`HANDOFF.md`, `LATEST.md`, repair history/queue, any repair prompt
  written for a future Builder) is delivered inside the ZIP at its real
  repository path — never as a standalone output file. Standalone
  output files are restricted to the full ZIP plus `.js`/`.html`/`.css`.
- **Promoting any language from `NOT_READY` to `AVAILABLE`** in
  `cozy-language-registry.js` (or any future language registry): Rule 82
  (`27-language-availability-verification-rule.md`) governs it — a
  roadmap or priority listing is never itself grounds for promotion.
  All five conditions (real language resources, templates committed for
  every intent, no uncontrolled machine translation, passing
  intent×language tests, and observed runtime behavior — recorded as
  `NOT_TESTED_LIVE` if no browser/DOM runtime is available to confirm
  it) must be independently verified in the same session that changes
  the registry state, and the record must state, per language, exactly
  how each was verified.
- **Extending the language registry's schema itself** (adding a
  country-mapping table, dialect/variant metadata, `script`/
  `direction`/`locale` fields, offline-resource pack states, voice
  round-trip verification, or refactoring public-answer facts to a
  single authoritative source): Rule 84
  (`29-language-taxonomy-and-single-source-governance-rule.md`)
  governs it — Target/Registered/Available must stay three
  independent fields (never `TARGET → AVAILABLE` directly), and the
  binding principle is that facts have one authoritative source while
  languages only render it, never restate it independently.
