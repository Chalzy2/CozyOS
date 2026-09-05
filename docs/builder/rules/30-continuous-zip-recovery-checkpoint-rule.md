Rule 85 — Continuous ZIP Recovery Checkpoint

Extends Rule 79 (Mandatory Phase Checkpoint) and Rule 80 (Builder Stop Gate):
a recoverable ZIP is not only a final certification artifact, and not only a
per-phase artifact — it is a continuous recovery point maintained throughout
every milestone, every Repair session, and every Builder/Cloud session
working on CozyOS, COS-RP, WholesaleOS, ShopOS, or any governed subsystem.

This rule exists because Rule 79 checkpoints at phase boundaries only. A
single phase (for example Phase 3 — Implementation) can itself be long
enough to exhaust a session's execution/context budget before it completes.
Rule 85 closes that gap by requiring recovery checkpoints *inside* a phase,
at every meaningful completed unit of work, not merely at the phase's end.

## Mandatory lifecycle

    BASELINE ZIP
         ↓
    SHA-256
         ↓
    FRESH EXTRACTION
         ↓
    AUDIT
         ↓
    IMPLEMENT
         ↓
    TEST
         ↓
    CHECKPOINT ZIP
         ↓
    SHA-256
         ↓
    FRESH EXTRACTION
         ↓
    CONTINUE
         ↓
    NEXT CHECKPOINT
         ↓
    SHA-256
         ↓
    FRESH EXTRACTION
         ↓
    CONTINUE
         ↓
    FINAL CERTIFICATION

## The key principle

For every Builder, Cloud session, milestone, phase, audit, implementation,
repair, test, or certification:

1. Start from a verified ZIP baseline.
2. Independently verify the baseline SHA-256 twice.
3. Before beginning any substantial work, produce a START/RECOVERY ZIP
   containing the current verified state.
4. After every meaningful minimum action, create the next recoverable ZIP.
5. Compute and record its SHA-256.
6. Verify ZIP integrity with `unzip -t`.
7. Continue working from the newly produced ZIP/extracted state — without
   pausing to ask whether to continue.

A "meaningful minimum action" includes, at minimum: a Rule 61 audit
completed, a production file created, a production file modified and
syntax-verified, a test suite created, tests passing, integration
completed, regression completed, a governance update completed, or
packaging completed. The Builder chooses a practical checkpoint boundary
rather than waiting for the entire phase or milestone to finish. Do not
allow a long-running audit, implementation, regression, packaging
operation, or governance update to leave the repository without a recent
recoverable ZIP.

This is not a license to skip Rule 79's phase-boundary packaging — it is a
finer-grained safety net *within* a phase. Do not ZIP after every tiny
file edit (e.g. every 10 lines of a module); that wastes time and storage.
ZIP after a genuine unit of work completes — module done and syntax
passes, test suite done and tests pass, integration done — then continue.

Never overwrite or discard a previous recoverable checkpoint until the
newer checkpoint has been successfully created, hashed, and
integrity-tested. If the Builder/Cloud environment approaches its
execution/tool/token/time limit, the latest verified ZIP is the mandatory
continuation artifact — the next Builder resumes from it, not from
conversation memory or an assumed working tree. A recovery ZIP is never
automatically a certification artifact; never claim a checkpoint is
certified merely because its ZIP hash is valid.

Where practical, use the sequence:

    BASELINE → START ZIP → AUDIT ZIP → IMPLEMENTATION ZIP → TESTED ZIP →
    MID ZIP → REGRESSION ZIP → GOVERNANCE ZIP → FINAL ZIP → DELIVERY COPY

The exact number of checkpoints can vary with the work, but no long
uninterrupted operation should be allowed to consume the entire recovery
window. **The Builder does not ask whether to continue after creating a
checkpoint** — this rule already answers that: create the checkpoint,
verify it, and continue. Only stop when the environment genuinely
prevents further work.

## SHA-256 requirement

Every checkpoint ZIP must receive a SHA-256 hash.

- **Recovery checkpoint** (ordinary, mid-phase): one SHA-256 computation is
  sufficient.
- **Certification checkpoint** (final, or promoted to a certified
  artifact): SHA-256 must be computed twice, and both results must match,
  per Rule 60/67/70.

## Do not stop after ZIP creation

Creating a checkpoint is never the end of the task. The sequence is always:
ZIP → hash → continue. If the session reaches its execution/context limit
immediately after a checkpoint, the checkpoint itself is the recoverable
artifact — but the Builder must not treat checkpoint creation as a natural
stopping point while budget remains, per Rule 76 (No Partial Phase
Completion) and Rule 80 (Builder Stop Gate).

## Recovery requirement

Every checkpoint must contain the complete working tree required to
continue, not merely the changed files. The next Builder/session must be
able to: extract the ZIP, verify its SHA-256, read governance
(`LATEST.md`/`HANDOFF.md`/`RELEASES.md`/`BASELINE.md`), inspect the
checkpoint, and continue from exactly that state. It must not restart the
milestone from the previous certified baseline unless the checkpoint is
invalid (fails integrity or SHA-256 verification).

## Checkpoint naming

Predictable names, consolidated where appropriate:

    <MILESTONE>-START.zip
    <MILESTONE>-AUDITED.zip
    <MILESTONE>-IMPLEMENTED.zip
    <MILESTONE>-TESTED.zip
    <MILESTONE>-MID.zip
    <MILESTONE>-VERIFIED.zip
    <MILESTONE>.zip

The minimum binding rule, if nothing else is remembered:

    WORK → CHECKPOINT ZIP → HASH → CONTINUE

## Checkpoint immutability

Once a checkpoint ZIP and its recorded SHA-256 exist, that ZIP is never
modified. If work continues past it, the next unit of work produces a new,
separately named checkpoint with its own hash. This preserves an unbroken,
independently verifiable chain, e.g.:

    <PRIOR-MILESTONE> CERTIFIED
          │
          ▼
    <MILESTONE>-START
          │
          ▼
    <MILESTONE>-IMPLEMENTED
          │
          ▼
    <MILESTONE>-TESTED
          │
          ▼
    <MILESTONE>-MID
          │
          ▼
    <MILESTONE>-REGRESSION
          │
          ▼
    <MILESTONE>-FINAL

## Physical existence is the only evidence a checkpoint exists

A recovery checkpoint is **not** considered created merely because the
Builder reports a filename, hash, or checkpoint status in prose. A
filename written in a report is never evidence that the ZIP exists. The
actual ZIP file must physically exist in the workspace/delivery
filesystem, and the Builder must prove that with real command output, not
restate it as a claim.

For every checkpoint, the Builder MUST:

1. Create the ZIP with an actual archive command (e.g. `zip -r -X`).
2. Verify the file exists on disk (e.g. `ls -l`/`stat`) — do not assume
   the archive command succeeded from its exit message alone.
3. Report its exact filesystem path.
4. Report its byte size.
5. Run `unzip -t` against that exact file and show the real output.
6. Calculate SHA-256 from that exact file and show the real output.
7. Preserve the actual ZIP — never delete or overwrite it (see
   Checkpoint immutability, above).
8. Copy it to the designated delivery/artifact location.
9. Verify the delivered copy's SHA-256 independently matches the
   workspace copy's SHA-256 — a copy operation is not assumed to be
   lossless.
10. Provide the actual artifact/download reference when the environment
    supports artifact delivery (e.g. present_files or equivalent) — a
    checkpoint that only exists in the Builder's working directory and is
    never surfaced to the person/next session is not yet delivered.

If the actual archive cannot be created, found, or delivered at any of
these steps, the Builder MUST report exactly:

    CHECKPOINT NOT PHYSICALLY SECURED

and must NOT report the checkpoint as secured, must NOT continue as if a
valid recovery point exists, and must NOT write another status block that
merely repeats the filename/hash as if restating them made them real.

## Resuming from a checkpoint requires the same physical proof

A Builder/session resuming from a previously reported checkpoint must not
take the prior report's word for it either. Before continuing work from a
checkpoint recorded in an earlier turn or by an earlier session, run a
recovery-artifact verification:

1. Locate the actual checkpoint ZIP file.
2. Confirm it exists on disk.
3. Record its exact path and byte size.
4. `sha256sum` the actual file and compare against the previously recorded
   hash.
5. `unzip -t` the actual file.
6. Extract it into a fresh directory.
7. Confirm the extracted tree corresponds to the state the earlier report
   claimed (e.g. the files/tests it said were present actually are).
8. If all of the above hold: mark **RECOVERY CHECKPOINT PHYSICALLY
   VERIFIED** and continue.
9. If the file is missing, corrupt, or does not match the claimed state:
   do not continue as though it were secured. Recreate the ZIP
   immediately from the current real working tree, hash it, integrity-test
   it, and preserve it — only then continue.

The governing principle, permanently:

    Actual ZIP → actual file verification → SHA-256 → unzip -t →
    fresh extraction → continue.

Never:

    "I wrote the ZIP filename and hash in my report" → therefore the ZIP exists.



At any point, the Builder must be able to state its current recovery point
in this form:

    CURRENT RECOVERY CHECKPOINT

    File:
    <name>.zip

    SHA-256:
    <hash>

    State:
    <what is done>

    NEXT:
    <what comes next>

## Mandatory prompt header

Every future Builder/milestone prompt for a governed subsystem must repeat
this rule at the top:

    MANDATORY CONTINUOUS ZIP RECOVERY RULE — RULE 85
    You MUST work continuously from verified ZIP states.
    Before substantial work:
    verify baseline SHA-256 twice;
    verify ZIP integrity;
    fresh-extract the baseline;
    produce a recovery ZIP before beginning the next substantial operation.
    After every meaningful minimum action, produce and hash a new recovery
    ZIP before continuing into another long operation.
    Do not wait until the milestone is nearly complete to make a ZIP.
    If your execution/tool/token/time limit is approaching, the latest
    verified ZIP MUST already contain the recoverable state.
    Continue from the latest verified ZIP/extraction rather than relying on
    conversation memory.
    Never discard the previous verified checkpoint until the new checkpoint
    has been successfully created, hashed, and integrity-tested.
    A recovery ZIP is not automatically a certification artifact.
    ZIP → SHA-256 → integrity check → continue.
    Do not stop merely because a checkpoint was created. Create the
    checkpoint and continue with the next required operation until the
    environment limit genuinely requires handoff. Do not ask whether to
    continue after creating a checkpoint — continue.
    Certification is separate: final certification still requires dual
    SHA-256 verification, fresh extraction, regression, byte-identity audit,
    governance verification, and delivered-copy verification (Rules 60, 65,
    67, 70, 79, 80).

## Relationship to certification (unchanged)

Rule 85 governs recovery checkpoints only. It does not relax final
certification. The word CERTIFIED remains reserved, per Rule 79/80 and the
Part 23-style certification gate used in milestone/checkpoint prompts,
until baseline SHA (×2), ZIP integrity, fresh extraction, governance read,
audit, implementation, syntax checks, the milestone's own test suite, a MID
checkpoint, lineage regression, dependency-system regression, broader
repository regression, byte-identity audit, governance update, final ZIP,
SHA (×2), final fresh extraction, tests from the final extraction, final
lineage verification, delivered-copy hash, and delivered-copy match are all
complete.
