# Cozy Builder — M373 Improvement Report

Filed under Builder Rule 55 (Continuous Improvement & Version Evolution). First Improvement Report filed under this rule.

---

## Self Review

- **What worked well:** Composing Tier A entirely from `Layer2GraphComposer`'s already-verified graphs meant zero new parsing risk for 3 of the 6 Tier A finding types (duplicate, circular, version) and cheap extension for the rest. The Node-level runtime harness (synthetic defect-injection, then full 484-file repository) caught the environment gaps (`setInterval` not defined in the `vm` context, `registerCoordinator` ordering) before they could reach a certification claim.
- **What was difficult:** Deciding where the Tier A/Tier B boundary should sit — several candidate findings (e.g. "large/complex modules") could have been done via a new line-count parser (Tier B-adjacent) instead of the existing method-count signal (Tier A). Reusing an existing signal was the safer call per Rule 50, but required re-reading `layer2-graph-composer.js`'s API Graph fields closely first.
- **What caused delays:** None significant — the milestone was fully scoped by the incoming authorization (Decisions 1–6), so no re-negotiation of scope was needed mid-session.
- **What required manual work:** Writing the synthetic 2-file test repository with six deliberately injected defects — no existing fixture covered this, so it was authored fresh for this milestone only (not persisted as a reusable fixture; see Recommended Improvement IMP-002 below).
- **What information was missing:** No file-size/line-count signal exists anywhere in the verified workspace, which constrained "large/complex modules" to a method-count proxy rather than a more standard complexity measure — disclosed honestly in the finding's own `rootCause` field rather than silently approximated.
- **What assumptions were incorrect:** None caught this pass — the Node-level harness would have surfaced a wrong assumption about `repoAnalysis`/`graphs` shape before certification, and none occurred.
- **What could be automated:** The Node-level runtime harness itself (currently hand-assembled per session in `/tmp`) — see IMP-002.
- **Which rule prevented mistakes:** Rule 49 (Verified Workspace Integrity) — kept Tier C honestly unimplemented instead of fabricating findings for capabilities with no signal. Rule 52's registry discipline directly shaped how AA-003 was structured.
- **Which rule should be improved:** Rule 52 (Architecture Ambiguity Classification) doesn't currently distinguish an *ambiguity* (AA-001/AA-002 style — conflicting sources) from an *insufficient-signal* record (AA-003 style — no source at all, nothing conflicts). Both currently share the `AA-NNN` prefix and registry, which works but blurs two different situations under one ID scheme.
- **Which new rule is needed:** None beyond 54/55 this pass — no gap surfaced that isn't already covered by an existing or newly-adopted rule.

## Improvement Report

| Field | IMP-001 | IMP-002 | IMP-003 |
|---|---|---|---|
| **Improvement ID** | IMP-001 | IMP-002 | IMP-003 |
| **Category** | Registry structure | Verification tooling | Documentation clarity |
| **Current Process** | AA registry uses one ID scheme (`AA-NNN`) for both genuine multi-source ambiguities (AA-001) and insufficient-signal planning records (AA-002, AA-003) | The Node-level runtime harness (synthetic + full-repo) is hand-written per session in `/tmp`, never saved to the repository | Rule 52 doesn't explicitly state the distinction now visible after 3 AA records exist |
| **Problem** | A future reader can't tell from the ID alone whether a record is "sources disagree" vs "no source exists yet" | Verification work is not reusable or auditable across sessions — the same synthetic defects have to be re-authored from scratch each time a Builder engine is added | New Builder sessions may misfile a future record under the wrong lifecycle expectations |
| **Root Cause** | Rule 52 was written before AA-002/AA-003's "planning record only" pattern existed | No rule yet mandates persisting verification fixtures as first-class repository artifacts | Rule 52's text predates this pattern's second and third instance |
| **Recommended Improvement** | Consider a registry sub-type marker (e.g. `AA-NNN (ambiguity)` vs `AA-NNN (insufficient-signal)`) inside each record's Status line — additive, no ID scheme change needed | Persist reusable synthetic fixtures under `docs/builder/testing/fixtures/` (e.g. a small synthetic repo with known, documented defects) so future engines can be verified against the same known-answer set | Add one clarifying sentence to Rule 52 noting the two observed sub-patterns, cross-referencing AA-002/AA-003 as examples |
| **Expected Benefit** | Faster triage for future Builder sessions reading the registry | Faster, more consistent verification for future Layer 4+ engines; regression-safe if fixtures are versioned | Reduces future ambiguity about how to file a new AA record |
| **Risk** | Low — purely additive labeling, no structural change | Low — additive new directory; must not be mistaken for production code | Very low — documentation-only |
| **Priority** | Medium | Medium | Low |
| **Affected Components** | `docs/builder/knowledge/architecture-ambiguity-registry.md`, Rule 52 text | New `docs/builder/testing/fixtures/`, future engine certification reports | `docs/builder/rules/02-architecture-rules.md` Rule 52 |

*(No improvement above has been applied yet — Rule 55 requires recording recommendations, not silently acting on them. Applying IMP-001/002/003 is itself future engineering work, subject to its own Conflict/Ownership Review before touching Rule 52's locked text.)*

## Version Evolution

- **New capabilities added:** Layer 3 Analysis Engine (Tier A + Tier B); Rule 54 (Continuous Development Handoff); Rule 55 (this rule).
- **Capabilities improved:** None this milestone — Layer 1/2 were not modified (Change Scope Rule).
- **Capabilities removed:** None.
- **Architecture improvements:** Formal Tier A/Tier B/Tier C split for analysis work, reusable for any future Builder analysis layer.
- **Learning improvements:** None yet — no Layer 4 (Learning Engine) exists. Recommended next per the M373 handoff §8.
- **Memory improvements:** `builder-analysis` namespace introduced in `CozyMemory`.
- **Validation improvements:** Two-tier Node-level runtime harness pattern (synthetic defect-injection + full-repository scale run) established and reusable.
- **Performance improvements:** None targeted this milestone; full-repository analysis completes in ~456ms at current scale (484 files) — noted as a baseline, not yet a target.

## Engineering Metrics (this milestone's contribution)

See `docs/builder/metrics/M373-engineering-metrics.json` for the structured, cumulative record. Summary:

- Bugs found: 0 (Layer 3 analyzes CozyOS application code, not Builder's own code, this pass — the 1,548 findings are about the *analyzed repository*, not defects in Builder's own new file)
- Bugs fixed: 0 (no repair performed — Decision 4 forbids it)
- Duplicate modules reduced: 0 (Layer 3 detects, does not reduce — see finding DUP-* records)
- Architecture violations reduced: 0 (detection only)
- Syntax errors reduced: 0 (`analysis-engine.js` itself: 0 syntax errors, `node --check` clean)
- Regression count: 0
- Build success rate: 1/1 this milestone (100%)
- Validation success rate: 2/2 harness runs passed (100%)
- Builder analysis accuracy: not yet measurable — no ground-truth-labeled corpus exists to score Tier A/B findings against; flagged as a future metric, not fabricated here
- Average repair confidence: not applicable — Layer 3 does not repair

## Knowledge Evolution

New entries recorded in `docs/builder/knowledge/lessons-learned.md`:
- Engineering pattern: Tier A (compose existing signals) / Tier B (minimal new deterministic extraction) / Tier C (honestly unimplemented, registry-tracked) as a reusable structure for any future Builder analysis-style layer.
- Validation pattern: two-scale Node-level harness (synthetic known-defect repo, then full real repository) as the minimum bar before certifying a new Builder engine.
- Regression pattern: `vm.createContext` sandboxes used for Node-level harnesses need `setInterval`/`clearInterval`/`document` stubs and a working `registerCoordinator` stub before any Builder engine with the standard self-registration IIFE will load cleanly — worth stating once so it isn't re-discovered per session.

## Recommendation Engine

- **Highest-priority engineering task:** AA-003 row 1 (Signature-level API inconsistencies) — cheapest closable gap, per the M373 handoff §8.
- **Highest-risk issue:** The unresolved-reference/no-observed-consumer volume (796 + 529 = 1,325 raw findings from the full-repository run) could be misread as 1,325 confirmed defects by a future session or a Layer 4 Learning Engine if it ever ingests these findings without also ingesting their `confidence` field — worth a explicit safeguard when Layer 4 is designed.
- **Biggest architectural improvement available:** A shared call-graph engine (needed by 3 of AA-002's 8 remaining graphs simultaneously) — building it once would unblock Data Flow, Authentication Flow, and Synchronization Flow graphs together, per AA-002's own recommended order §4.
- **Greatest technical debt:** AA-002 (8 graphs) and AA-003 (6 capabilities) combined represent 14 open, honestly-tracked gaps — none blocking, but the largest standing "known incomplete" surface in the project.
- **Next Builder capability to implement:** Either AA-003 row 1 (cheapest) or a Layer 4 Learning Engine that consumes Layer 3's findings (per the M373 handoff's alternative recommendation) — both are evidence-based, reasonable next steps; the choice depends on whether breadth (closing AA rows) or depth (a new Builder layer) is prioritized next.
- **Recommended milestone order:** M374 = AA-003 row 1 (Signature-level API inconsistencies, cheap, closes a registry row) → M375 = shared call-graph engine (unblocks 3 AA-002 rows at once) → M376 = Layer 4 Learning Engine (now has both richer Layer 3 findings and a call-graph signal to learn from).
