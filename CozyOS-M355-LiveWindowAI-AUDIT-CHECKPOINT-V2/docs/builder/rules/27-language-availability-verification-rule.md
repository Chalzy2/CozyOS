# Rule 82 — Language Availability Verification Rule

**Adopted:** this pass, at the person's explicit direction, following
RP-027 (CozyOS Conversational Knowledge + Multilingual Response
Expansion) and the owner-provided Language Expansion Roadmap recorded
in `docs/builder/knowledge/repair-queue.md`'s "Not Yet Composed"
section. Formalizes, as a permanent named rule, the principle RP-027's
own language registry already implemented in code (`NOT_READY` until
verified) so it binds every future Builder session — not just RP-027 —
without needing to be re-specified each time a new language is
considered.

**Extends:** Rule 62 (Repair Queue), Rule 69 (Repository Authority),
Rule 81 (CozyOS Repair Output Rule — its Section 3 TEST clause "a
capability may only be reported as ONLINE, READY, or ACTIVE after its
real underlying operation succeeds" is the same principle this rule
applies specifically to language availability).

## The Rule

**A roadmap is not an implementation.**

A language listed as a candidate — on the Language Expansion Roadmap,
in a repair prompt, in a person's message, or anywhere else — carries
NO presumption of readiness. Appearing on a list, being named as
"high priority," or being requested by the person is never, by itself,
grounds to mark a language `AVAILABLE`.

A language may move from `NOT_READY` to `AVAILABLE` **only after all
of the following are independently verified, in the same session that
makes the change:**

1. **Real language resources exist** — the language's actual grammar,
   vocabulary, and phrasing are available to whoever is writing the
   templates (a fluent speaker, a reviewed reference source, or
   equivalent) — not assumed from general familiarity with a language
   family or a related language.
2. **Templates are written and committed** — every intent the
   conversational provider supports has an actual, reviewed template
   string in `cozy-language-templates.js` for that language code. A
   partially-covered language stays `NOT_READY` (or, if this registry
   later adds a `PARTIAL` state for genuine partial coverage, that
   state — never `AVAILABLE` on partial coverage alone).
3. **No uncontrolled machine translation** — templates are committed,
   reviewed strings, never the live output of a runtime translation
   call. This applies with equal force to a new language as it did to
   the original 5 defaults.
4. **Tests exist and pass** — the language's own intent×language test
   rows (mirroring `rule-based-conversational-provider-rp027.test.js`'s
   existing pattern) are written and pass, for every intent, before the
   registry state changes.
5. **Runtime behavior is actually observed** — the templates are
   exercised through the real provider (`composeReply()`/`think()`),
   not merely present as strings in a file, and produce a correct,
   non-empty, appropriately-formatted reply (including verifying
   right-to-left rendering for RTL languages, where a browser/DOM
   runtime is available to check it; if it is not available, this must
   be recorded as `NOT_TESTED_LIVE`, honestly, per Rule 81 — not
   silently assumed correct).

**Only when all five are true, in that same session, may
`cozy-language-registry.js`'s entry for that language code be changed
from `NOT_READY` to `AVAILABLE`.**

## What this rule forbids, explicitly

- Marking a language `AVAILABLE` because it appears on a roadmap,
  priority table, or request list.
- Marking a language `AVAILABLE` because templates exist for *some*
  but not all supported intents.
- Marking a language `AVAILABLE` on the strength of a live/uncontrolled
  translation call standing in for a verified template.
- Marking a language `AVAILABLE` without its own passing test rows.
- Treating a high-priority marking (🔴/🟠/🟡 or equivalent) as
  urgency to skip verification steps — priority affects work order
  only, never verification rigor.
- Bulk-flipping several roadmap languages to `AVAILABLE` in one pass
  without each one individually satisfying all five conditions above.

## Recording

When a language is genuinely promoted to `AVAILABLE`, the record
(repair history, repair queue, `HANDOFF.md`, `LATEST.md`) must state,
per language: which resources/reviewer were used, how many intents are
covered, the test file and pass count, and whether runtime behavior
was confirmed live or recorded as `NOT_TESTED_LIVE`. A language must
never be recorded as complete/available without this detail — an
unverified promotion is exactly the failure mode this rule exists to
prevent.
