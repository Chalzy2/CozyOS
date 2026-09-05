# Builder Rules — Addendum: Repository Completeness

Extends the full rule set (1–65). Cumulative per Rule 15; replaces nothing.

## Rule 66 — Repository Completeness

**Problem this rule closes:** every prior rule (61's lifecycle, 62's
Repair Queue, 65's per-engine lifecycle block) describes *what* must be
tracked and *where* it must live once tracked. None of them explicitly
forbade a finding, a decision, or a status update from existing only in
conversation with a Builder account. A future account reading only the
repository — with no access to any prior chat — could otherwise miss real
findings that were discussed but never written down. This rule closes that
gap directly.

1. **Every finding must be written into the repository.** Never left only
   in the conversation. This applies without exception to every finding
   class already established:
   - `RP` — Repair (`repair-queue.md` + `repair-history-registry.md`)
   - `RG` — Regression (`regression-registry.md`)
   - `MD` — Missing Dependency (`missing-dependency-registry.md`)
   - `SF` — Security Finding (`security-finding-registry.md`)
   - `PF` — Performance Finding (`performance-finding-registry.md`)
   - `AA` — Architecture Ambiguity (`architecture-ambiguity-registry.md`)
   - `DI` — Documentation Integrity (`documentation-integrity-registry.md`)
   - `DC` — Duplicate Consolidation (`duplicate-consolidation-registry.md`)

2. **The repository is the single source of truth.** Everything required
   for the next account to continue work must exist inside the repository
   — not in chat, not in the current account's memory, not assumed from
   context. If it is not written down, it does not count as known.

3. **The only information permitted to exist outside the repository** is
   packaging metadata that cannot permanently live inside the package
   without creating a self-reference loop (Rule 60's same reasoning,
   extended):
   - Final ZIP filename
   - ZIP size
   - Repository size
   - Final Package SHA-256
   - Download information

   Everything else — every finding, decision, status, and next step —
   belongs inside the repository, per point 1.

4. **Undocumented-information clause:** if information exists only in the
   conversation and not in the repository, it is treated as
   **undocumented** and must not be relied upon by any account, including
   the one that produced it. A finding mentioned only in a chat reply and
   never written to its registry is, for every purpose after that message,
   the same as a finding that was never found.

## Milestone Completion Gate — extended (adds to Rule 63's 10 conditions)

Before any milestone (or, per Rule 65, any single engine's own lifecycle)
can be marked Complete, the Builder must additionally verify:

- [ ] All findings from this session exist in their repository registries — not only summarized in a chat reply.
- [ ] Repair Queue matches findings — no finding referenced in a report that isn't also a Repair Queue row.
- [ ] `LATEST.md` is current — reflects this session's real status, not last session's.
- [ ] `HANDOFF.md` is current — same standard.
- [ ] `RELEASES.md` is current — new hashes/entries present if anything changed.
- [ ] The relevant history document (`docs/history/MNNN*.md`) is complete — contains the full finding, not a pointer back to chat.
- [ ] `docs/builder/rules/00-INDEX.md` is current — any new rule is listed, or the milestone cannot close.

**If any box above is unchecked, the milestone (or engine, per Rule 65)
cannot be marked Complete** — this is an additive gate alongside Rule 63's
existing ten, not a replacement for them.

## Future Builder Requirement

Every new Builder account starts only from:
1. The latest ZIP.
2. Repository SHA-256 verification.
3. Package SHA-256 verification.
4. `LATEST.md`.
5. `HANDOFF.md`.
6. `RELEASES.md`.
7. `docs/builder/rules/00-INDEX.md` (and everything it indexes).
8. The Repair Queue (`docs/builder/knowledge/repair-queue.md`).
9. Repository integrity verification (Rule 49/this account's own Phase 0).

**No Builder should ever require previous chat history to continue work.**
If a future account finds itself needing to ask "what did the last session
actually find," that is itself evidence Rule 66 was violated by whichever
account produced that gap.

## Relationship to Rule 60 (Release Manifest Pattern)

Rule 60 already established that a package can never contain a correct
hash of its own final bytes, and that this is the *one* accepted
self-reference exception, resolved by keeping hashes in `RELEASES.md`
rather than embedded in the package. Rule 66 generalizes the same
reasoning to *all* findings and decisions, not just hashes, and names the
same narrow packaging-metadata exception explicitly (point 3 above) so it
is not mistaken for a general license to leave anything else out.

## Next Builder MUST (added to the existing Rule 59/61/62/65 lists)

1. Before writing any chat summary of findings, first write those findings
   into their real repository registries — the chat summary is a
   restatement of what the repository already says, never the other way
   around.
2. Before marking any milestone or engine-level phase Complete, run the
   extended gate above in addition to Rule 63's ten conditions.
3. If a new rule is authored mid-session (as this one was), update
   `docs/builder/rules/00-INDEX.md` in the same pass — an unindexed rule
   file is, per Rule 66 point 4's own logic, effectively undocumented.
