# Rule 77 — Phase Focus

Extends Rule 65 (Builder Lifecycle), Rule 68 (Per-Engine Lifecycle Gate),
Rule 71 (Mandatory Phase Packaging), Rule 73 (Automatic Session Closure),
Rule 76 (No Partial Phase Completion).

## Rule

Finish the current engine before thinking about later work.

**Before work:** Complete Phase 0 per Rule 65.

**During Phase 3 (Implementation):** Focus only on Phase 3. Do not plan
later phases, write release notes, estimate future work, or start
another engine. Implement only the approved Implementation Contract.

**When Phase 3 finishes:** Immediately begin Phase 4 (Verification).

**Phase 4:** Run all required verification. If verification fails, fix
only the failure, verify again, and repeat until all checks pass. This
loop completes the current engine — it is not new implementation, and is
not itself a reason to revisit Phase 3 scope beyond the specific failure.

**After Phase 4 passes:** Continue Rule 65's sequence without pause —
Phase 5 (Registry Updates), Phase 6 (Reports), Phase 7 (Handoff), Phase 8
(Package, per Rules 71 & 76), Phase 9 (Close).

**Stop condition:** After Phase 9, print the Rule 67 Delivery Block and
end the session. Do not start another engine in the same session.

**Next session:** Resume from the produced ZIP per Rule 65 Phase 0.

If repository state conflicts with previous chat history or session
summaries, Rule 69 (Repository Authority) governs — the repository's own
recorded phase wins.

## Adoption note

Formally adopted into the repository this session (M388, Engine 5
start), per the user's explicit instruction. No prior repository record
of this rule existed before this session — its content is applied
starting now, not retroactively assumed to have governed earlier
engines. Earlier engines (1–4) were, as a matter of fact, already run
this same way (one engine's full Phase 0–9 per session, no forward
planning into later engines) — this rule makes that existing practice
binding and explicit rather than changing it.
