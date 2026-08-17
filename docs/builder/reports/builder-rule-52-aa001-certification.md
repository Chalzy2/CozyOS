# Certification — Rule 52 (Architecture Ambiguity Classification) Adopted; AA-001 Opened

**Milestone:** Cozy Builder — new finding category adopted and applied to `understanding-engine.js`
**Mode:** Report/Learn (documentation only — no production code touched, nothing generated)

## File changes in this ZIP (verified via `diff -rq` against the prior certified output)
| File | Change |
|---|---|
| `docs/builder/rules/02-architecture-rules.md` | Modified — Rule 52 added; Rule 51's evidence column trimmed to missing-dependency status only, text of Rule 51 itself unchanged; Rules 49–50 and all other sections byte-identical |
| `docs/builder/CHANGELOG.md` | Modified — adoption + AA-001 entry appended |
| `docs/builder/knowledge/architecture-ambiguity-registry.md` | Added — new registry, entry AA-001 for `understanding-engine.js` |

No other file changed.

## What this pass does
Separates two previously-conflated findings about `understanding-engine.js`:
- **Missing-dependency status** (file not in workspace) — stays under Rule 51, tracked as before.
- **Purpose ambiguity** (three in-workspace sources describe conflicting responsibilities) — moved to its own classification (Rule 52) and its own registry (AA-001), explicitly not framed as a blocker or an implementation task.

## What this pass does NOT do
- Does not resolve AA-001. No explanation among the four listed is asserted as correct.
- Does not implement, extend, or stub any code.
- Does not affect the blocked status of `cozy-identity.js` / `developer-profile.js` (no ambiguity opened for either — both have single, consistent in-workspace descriptions).

## Testing
- `diff -rq` against the prior certified ZIP — confirms scope matches this report.

## Verdict
**PASS.** Additive classification and registry, correctly scoped, no fabricated resolution.
