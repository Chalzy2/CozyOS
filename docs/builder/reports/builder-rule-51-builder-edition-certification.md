# Certification — Rule 51 Refined to Builder Edition; understanding-engine.js Knowledge Finding

**Milestone:** Cozy Builder — Rule 51 refined in place (Builder Edition text); broadened search executed against all 3 open dependencies
**Mode:** Report/Learn (documentation + a real Builder Knowledge search — no production code touched, nothing generated)

## File changes in this ZIP (verified via `diff -rq` against the prior certified output)
| File | Change |
|---|---|
| `docs/builder/rules/02-architecture-rules.md` | Modified — Rule 51 row replaced in place with the Builder Edition text; Rules 49–50 and every other section byte-identical |
| `docs/builder/CHANGELOG.md` | Modified — new entry appended documenting the refinement and the knowledge-search finding |

No other file changed.

## Search performed (Rule 51 Builder Edition steps 1–4, this pass)
1. Workspace — re-confirmed: no `understanding-engine.js`, no `cozy-identity.js`, no `developer-profile.js` source present.
2. Builder Memory/Knowledge — `grep -i understanding` run against `knowledge/module-inventory.json`, `.csv`, `memory/07-builder-memory.json`. **Found:** a real inventory record for `core/modules/builder/understanding-engine.js` (v1.0.0-ENTERPRISE, layer "Core / Code Generation — Requirement Understanding").
3. Previous CozyOS versions — none supplied to this workspace; nothing to search.
4. Builder architectural specs — `grep -i understanding` run against `architecture/01-architecture-graphs.md`, `03-event-catalog.md`, `04-api-catalog.md`. No hits.

## Resolution applied
An authoritative implementation record was found (step 2) for `understanding-engine.js`. Per the rule's own branch logic, this forecloses "create a Builder-Generated implementation" — the correct action is reuse/repair/extend once the real source is available, not fabrication. `cozy-identity.js` and `developer-profile.js` each have named, confirmed-live replacement owners already documented in the workspace (see `reports/cozy-identity-investigation.md`), so neither triggers the Builder-Generated branch either.

## New finding, not resolved
The recorded purpose of `understanding-engine.js` (code-generation requirement understanding) does not obviously match its use elsewhere in this same workspace (`observation-engine.js` composing it for existing-code structural analysis) or the submitted Layer 2 spec's scope (reverse-engineering existing architecture). Flagged for a human ownership decision; not guessed at here.

## Testing
- `diff -rq` against the prior certified ZIP — confirms scope matches this report.
- `grep` searches above are reproducible against the same uploaded workspace.

## Limitations
- No Builder-Generated implementation was created for any of the 3 dependencies — none qualified under this rule's own logic.
- The layer-mismatch finding is descriptive only; no resolution is proposed without the real file.

## Verdict
**PASS** for the scope claimed: rule refined correctly, real search performed and documented, no fabrication. All 3 dependencies remain **blocked**, now with a sharper, evidence-backed reason why building a stub would be premature.
