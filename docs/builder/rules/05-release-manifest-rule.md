# Builder Rules — Addendum: Release Manifest & Package Hash Self-Reference

Extends `04-implementation-contract-rule.md` (Rule 59). Cumulative per
Rule 15; replaces nothing.

## Rule 60 — Release Manifest Pattern

**Problem this rule closes:** a package (ZIP) cannot contain a correct hash
of its own final byte content — writing the hash into any file inside the
package changes the package's bytes, which changes the hash, forever. Prior
milestones (through M387.5) worked around this ad hoc, each time re-editing
in-repo docs and re-packaging until the mismatch was "close enough" or
punted to "see final chat message." This rule replaces that ad hoc pattern
with one structural fix, going forward.

1. **`RELEASES.md`** (new, top-level, append-only) is the single place
   package hashes live. It is never edited retroactively except to append
   the next milestone's entry — past entries are never rewritten.

2. Each milestone's `RELEASES.md` entry has exactly two fields:
   - **Repository SHA-256** — computed over every real repository file
     *except* `RELEASES.md` itself, so this value is real, computable, and
     stable before packaging. (Excluding the one file whose own content
     depends on the computation is the same pattern real checksum tools use
     — a `SHA256SUMS` file never lists a hash of itself.)
   - **Package SHA-256** — for the *current* (just-produced) milestone, this
     field is always the literal placeholder text `Generated after
     packaging — see delivery message for this release.` It is **never** a
     computed value at time of authoring, because no computed value could
     ever be correct (see Problem above). The real value is communicated
     once, externally, in the delivery message for that release — never
     re-embedded into that same release's files afterward.

3. **Retroactive confirmation, not retroactive editing:** the *next*
   milestone's `RELEASES.md` entry may include a `Confirms:` line stating the
   *previous* milestone's real package hash, once known — e.g. M387.6's entry
   can state `Confirms M387.5 package SHA-256: <value>`. This is how the
   permanent record eventually captures every real value, without ever
   requiring a package to describe itself.

4. `LATEST.md` and `HANDOFF.md` should point to `RELEASES.md` for package
   hashes rather than hardcoding a package hash value inline going forward —
   this avoids the repeated re-edit-and-repackage churn seen in M387.5 and
   keeps exactly one authoritative location.

**Reason:** this is a structural fix, not a per-milestone workaround — no
future Builder should have to re-discover the self-reference problem or
re-invent a punt like "see final chat message" from scratch.
