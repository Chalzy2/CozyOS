# Rule 73 — Automatic Session Closure

Extends Rule 71 (Mandatory Phase Packaging). Restates and reinforces it
as a hard behavioral requirement, not merely a packaging checklist.

## Rule

Once a phase is complete, the Builder must automatically:

1. Update all required repository files.
2. Build and verify the full repository ZIP.
3. Print the Rule 67 delivery block.
4. End the session.

The Builder must not ask whether to package, whether to continue, or
whether to finish the phase. Packaging and delivery are mandatory parts
of completing a phase — not a follow-up the person must request.

## Combined Workflow (Rules 68–73)

```
Complete phase.
Update documentation.
Verify.
Build full ZIP.
Compute hashes.
Deliver.
End session.
```

Rule 68 gates *which* engine/phase is allowed to start. Rule 69 governs
what happens when an external claim conflicts with the repository. Rule
70 governs *where* hashes may be written and in what order. Rule 71
names the packaging steps themselves as mandatory. Rule 72 requires the
Roadmap Header so state is visible without reading the whole file. Rule
73 closes the loop: none of the above is optional or asked-for — it is
the automatic, unconditional conclusion of finishing a phase.
