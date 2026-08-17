# Rule 70 — Hash Recording Rule

**Extends Rule 60 (Release Manifest Pattern) and Rule 67 (Delivery
Metadata).** Adopted M388 Round 14, in direct response to a real
self-inflicted bug found and fixed during Engine 2's Phase 3–7 close-out
(M388 Round 13): a computed Repository SHA-256 value was written directly
into `LATEST.md`/`HANDOFF.md` before those files' own content was final —
since both files are themselves included in the repository hash
computation, the embedded value went stale the instant the file
containing it was saved, requiring a second recomputation and a
second edit. This rule codifies the fix so no future Builder account
repeats it.

## The rule

1. **Repository SHA-256 must never be embedded inside any file that
   participates in the repository hash computation.** The documented
   hashing method (Rule 60) walks every file under the repository root
   except `_archive/` and `RELEASES.md`. That means `LATEST.md`,
   `HANDOFF.md`, every file under `docs/`, and every application file are
   all *inputs* to the hash — none of them may contain the hash's own
   *output* value.
2. **Package SHA-256 must never be embedded inside the package (ZIP)
   being hashed.** The ZIP's hash is computed over its own final bytes,
   which include every file inside it — including `RELEASES.md`. A value
   written into any packaged file before the ZIP is built is therefore
   also not the ZIP's real hash the moment the ZIP is assembled.
3. **Repository SHA-256 belongs only in:**
   - `RELEASES.md` — the one file the documented hashing method already
     excludes (Rule 60), so a value recorded there is stable regardless
     of when it's written, and
   - the Rule 67 Delivery block (chat/delivery message), restated there
     for convenience only, never as the authoritative source.
4. **Package SHA-256 belongs only in the Rule 67 Delivery block**, and
   only after the ZIP has been finalized and hashed — never written into
   any repository file at all (not even `RELEASES.md`), since the ZIP
   necessarily contains `RELEASES.md` and any other file it might be
   written to.
5. **If a hash value is discovered written into a file before that
   file's own content — and, transitively, the full hash computation —
   was actually finalized, it must be treated as invalid and
   recomputed.** Do not assume a hash is correct merely because it is
   present; check whether anything hashed changed after the value was
   written.

## Correct sequencing (the pattern this rule requires)

```
1. Finish all content edits to every file EXCEPT RELEASES.md
   (this includes LATEST.md, HANDOFF.md, docs/history/*.md,
   docs/builder/knowledge/*.md, and any application code).
2. Compute Repository SHA-256 over that final state (excludes
   RELEASES.md by the documented method — Rule 60).
3. Write that value into RELEASES.md only (RELEASES.md is excluded
   from the hash it now records, so this is safe).
4. Build the ZIP from the now-fully-finalized repository, including
   the just-updated RELEASES.md.
5. Compute Package SHA-256 over the finalized ZIP's own bytes.
6. Report Package SHA-256 ONLY in the Rule 67 Delivery block — never
   write it into any repository file, including RELEASES.md.
```

Steps 1–3 must happen strictly before step 4. Writing a "final" hash
value into any file, then continuing to edit other hashed files
afterward, produces exactly the stale-value bug this rule exists to
prevent.

## Why this is a real, not cosmetic, rule

Rule 60 already established that a package can never contain a correct
hash of its own final bytes — that was the reasoning for excluding
`RELEASES.md` from the repository hash and for keeping Package SHA-256
out of the package entirely. Rule 70 makes explicit the corollary that
was previously only implicit: the same self-reference problem applies to
*every other file that participates in the hash*, not just `RELEASES.md`
itself. `LATEST.md` and `HANDOFF.md` are hashed inputs, so treating them
as if they were safe places to record the hash's output (as M388 Round
13 initially did, before correcting it) reproduces the exact class of
bug Rule 60 was written to prevent, just one file removed from the one
Rule 60 already covers.

## Relationship to Rule 69 (Repository Authority)

Rule 69 says a proven repository discrepancy must be recorded, not
silently resolved in either direction, until the canonical procedure is
confirmed. Rule 70 does not weaken that: the *root cause* of the M388
Round 10/11/12 Repository SHA-256 discrepancy (a plain `xargs` pipeline
mis-splitting filenames containing spaces — logged as `DI-005`) was found
and fixed separately, by correcting the hashing *command* itself
(`-print0`/`-z`/`-0`). Rule 70 addresses a different, second failure
mode — not a broken command, but a broken *sequencing* of when a
correctly-computed value gets written down. Both are real, both are now
fixed, and both are documented so they are told apart in any future
investigation rather than conflated into one story.
