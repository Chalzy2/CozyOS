# Builder Rules — Addendum: Repository Authority

Extends `11-repository-completeness-rule.md` (Rule 66). Cumulative per
Rule 15; replaces nothing.

## Rule 69 — Repository Authority

**Problem this rule closes:** Rule 66 established that the repository is
the authoritative record of engine/milestone state, but did not say what
to do when a conflicting account of that state arrives from outside the
repository — a chat summary, a screenshot, a prior Builder's claim, or a
user's description of what was completed. Without a binding rule, a new
Builder could reasonably trust a confident external summary over a
repository it hasn't fully read yet, and silently skip real work believed
already done. First triggered in practice during M388 Engine 1: an
external summary claimed Implementation/Verification/`MD-017` were
already complete; `LATEST.md`/`HANDOFF.md` and the repository's own files
showed Engine 1 was still at Phase 2 Approved → Phase 3 not started, and
no `MD-017` existed.

### Rule

If any conflict exists between chat history, screenshots, user summaries,
or previous Builder claims and the repository's own contents, **the
repository is authoritative**, unless a newer verified ZIP is supplied
and confirmed (Phase 0 hashes/integrity) to postdate the one in hand.

### Requirement

On detecting such a conflict, the Builder must, before any other action:

1. **Record the discrepancy** — what the external summary claimed, what
   the repository actually shows, and the specific files/lines that
   settle it.
2. **Explain it** — state plainly that the two disagree and why the
   repository wins by default.
3. **Continue from the repository state** — resume at the phase the
   repository's own `LATEST.md`/`HANDOFF.md`/history file records, not
   the phase the external summary implied.
4. **Never assume work exists that is not recorded in the repository.**
   Undocumented work is treated as not done, per Rule 66.

### Newer-ZIP Exception

If the repository is proven to be older than a newer verified ZIP — by
Repository SHA-256 mismatch against `RELEASES.md`, a later milestone/
version marker, or explicit version metadata — the Builder must:

5. Stop before making any change, report the mismatch (which evidence
   proved the repository stale), and request the newer ZIP before
   proceeding. The Builder does not attempt to reconcile or merge the two
   states itself.

### Compliance

A Builder that begins any phase on the strength of an external summary
alone — without checking it against `LATEST.md`, `HANDOFF.md`, and the
relevant `docs/history/` file — is not compliant with CozyBuilder's
governance rules.

### Reason

Rule 66 requires the repository to be complete enough to stand alone.
Rule 69 requires it to also be trusted alone — otherwise completeness is
undermined by any sufficiently confident conflicting claim from outside
it. The Newer-ZIP Exception keeps the rule symmetric: it defaults to
trusting the repository, but does not require trusting a repository that
is itself demonstrably the stale artifact.
