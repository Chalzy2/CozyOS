# Prompt 2 §7 — Community Contribution-Type Picker — Implementation Report

**Baseline:** COS-DASHBOARD-PROMPT2-MID-3.zip (trusted, not re-audited)
**Checkpoint:** COS-DASHBOARD-PROMPT2-MID-4.zip

## PROMPT 2 §7: COMPLETE

## Inspection performed first (§2)
Read in full before writing UI code: `cozy-knowledge-community.js`,
`cozy-knowledge-ingestion.js`, `cozy-knowledge-contribution-core.js`
(RP-029-C, real `CONTRIBUTION_TYPES` + `TYPE_TO_RP029B` mapping),
`cozy-teach-cozyai-routing-core.js` (RP-031 Phase 2A, real
`TEACH_KNOWLEDGE_TYPES` — the friendliest, most complete real,
already-accepted vocabulary), `teach-cozyai-form.html`, and
`cozy-teach-cozyai-ui.js`. No fake values (WORD/AUDIO/VIDEO/CULTURE/
LANGUAGE as invented categories) were introduced — every option this
picker offers is read live from `TEACH_KNOWLEDGE_TYPES`.

## REAL CONTRIBUTION TYPES
WORD, PHRASE, SENTENCE, DEFINITION, LITERAL_MEANING,
CONTEXTUAL_MEANING, PRONUNCIATION, DIALECT_VARIANT, EXAMPLE_USAGE,
TRANSLATION, CULTURAL_NOTE, AGRICULTURE, EDUCATION, BUSINESS,
COMMUNITY_LIFE, OTHER_DOMAIN — all pre-existing, real,
`CozyTeachCozyAIRouting.TEACH_KNOWLEDGE_TYPES` values, themselves
already composed onto RP-029-C's `CONTRIBUTION_TYPES` and RP-029-B's
own review-pipeline types. No new type was invented.

## FILES CREATED
- `core/modules/intelligence/knowledge/teach/ui/cozy-knowledge-contribution-type-picker-core.js`
  — pure logic. Friendly-label presentation layer over the real,
  dynamically-read `TEACH_KNOWLEDGE_TYPES`. Fails closed
  (`CAPABILITY_UNAVAILABLE`) if the real routing module isn't loaded.
- `core/modules/intelligence/knowledge/teach/ui/cozy-knowledge-contribution-type-picker-ui.js`
  — DOM layer. Mobile-first grid of large tappable cards (not a
  `<select>`), visible selected state, keyboard-operable. Never
  submits — only reports a real, engine-verified selection via
  `onSelect()`.
- `core/modules/intelligence/knowledge/teach/ui/tests/cozy-knowledge-contribution-type-picker-core.test.js`
  — 15 real, executed Node tests.

## FILES MODIFIED
- `core/modules/intelligence/knowledge/teach/ui/teach-cozyai-form.html`
  — now shows the picker ("What would you like to teach?") first;
  selecting a type opens the existing, unmodified contribution form
  pre-set to that type. A `?type=` query param lets a caller (or a
  future deep link) skip straight to the form — still validated
  against the real schema, never trusted blindly.
- `core/modules/intelligence/knowledge/teach/ui/cozy-teach-cozyai-ui.js`
  — `init()` now accepts an optional `opts.initialKnowledgeType`,
  validated against the real `TEACH_KNOWLEDGE_TYPES` before use;
  defaults to `"WORD"` exactly as before when absent/invalid. No other
  behavior changed.
- `core/modules/intelligence/knowledge/ui/contribution-form.css` —
  additive picker styles only (large touch targets, selected state,
  responsive 1-column/2-column grid). No existing rule changed.
- `core/shell/user-dashboard.js` — one comment updated on
  `#wireTeachButton()` documenting the new picker step; the actual
  navigation call (`window.location.href = ".../teach-cozyai-form.html"`)
  is byte-identical to MID-3 — the improvement lives entirely in the
  page it navigates to, per §5 ("improve the existing seam").

## FILES DELETED
None.

## NEW TESTS
15/15 passing (`cozy-knowledge-contribution-type-picker-core.test.js`):
Schema (4), Selection (5), Routing (2), Submission boundary (1),
Privacy (1), Admin boundary (1), plus a friendly-label/real-value
cross-check.

## REGRESSION
Directly affected suites re-run, all green, zero regressions:
- New picker suite: 15/15
- `cozy-teach-cozyai-routing-core.test.js`: 21/21
- `cozy-knowledge-contribution-core.test.js`: 21/21
- `cozy-knowledge-safety-gate.test.js`: 22/22
- `cozy-knowledge-quarantine-admin-core.test.js`: 30/30
- `cozy-knowledge-review-dashboard-core.test.js`: 26/26
- `cozy-knowledge-review.test.js`: 30/30
- `cozy-knowledge-community.test.js`: 36/36
- `cozy-knowledge-ingestion.test.js`: 26/26
- `cozy-knowledge-registry.test.js`: 11/11
- `dashboard-community-summary-core.test.js`: 8/8
- `dashboard-settings-admin-boundary-core.test.js`: 9/9
- `dashboard-navigation-core.test.js`: 29/29
- `core/shell/live/tests/*` (6 files): all passing
One unrelated pre-existing file, `core/shell/tests/launch-sequence-above-only.test.js`,
runs long (~30s of simulated timers) and was not touched by this
checkpoint — confirmed unrelated to knowledge/teach/dashboard-community
code by inspection, not silently dismissed. Full-repository regression
(144 test files) was not exhaustively re-run this session due to
context budget — the directly-affected set above was run in full,
matching §15's stated minimum.

## COMMUNITY PIPELINE
Unmodified. `CozyKnowledgeCommunity`/`CozyKnowledgeIngestion`/
`CozyKnowledgeReview` were composed, never edited, never duplicated.

## INGESTION
The picker calls no ingestion function of any kind — verified by a
dedicated test (`the picker itself exposes no submission function`).
Submission still flows exclusively through the existing,
unmodified `CozyTeachCozyAIRouting.submitTeachingContribution()` →
`CozyKnowledgeContributionCore.submitDraft()` → real safety gate →
real review pipeline chain.

## REVIEW
Unaffected — no review/quarantine logic touched.

## PRIVACY
The picker stores no state, reads no contributor identity, and
exposes no history field — verified by a dedicated test.

## ADMIN BOUNDARY
The picker exposes no role/permission/moderation concept and cannot
grant any authority — verified by a dedicated test.

## LANGUAGE
No general dashboard-shell UI-string localization mechanism exists
anywhere in this repository (confirmed by inspection — RP-027's
`CozyLanguageRegistry`/`cozy-language-templates.js` localize only
CozyAI's own conversational replies, a separate, narrower system).
`core/shell/user-dashboard.js`'s own Community/Home/AI/Apps/Settings
surface text is English-only under that same pre-existing convention.
This picker's labels honestly follow that same convention — not
silently addressed by inventing a second, competing registry.

## BROWSER/DEVICE
NOT VERIFIED — no headless-browser environment available in this
session, consistent with prior checkpoints in this lineage.

## KNOWN LIMITATIONS
- Picker labels are English-only, matching the existing dashboard
  shell's own current limitation (see LANGUAGE above) — not a
  regression introduced by this checkpoint.
- Full 144-file repository regression was not exhaustively re-run
  this session (context budget); the directly-affected set was.
- Browser/device verification remains NOT VERIFIED, as in prior
  checkpoints.

## CHECKPOINT
`COS-DASHBOARD-PROMPT2-MID-4.zip`

## NEXT BUILD MUST START WITH
Prompt 2 §8
