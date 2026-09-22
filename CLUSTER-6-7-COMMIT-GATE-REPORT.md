# Cluster 6/7 Deep Investigation — Commit-Gate Report

Scope: continuation of `PRE-EXISTING-FAILURE-REGISTER.md`, per explicit instruction —
1. Cluster 6: investigate the real universal privacy/visibility boundary and all potential internal-information leakage paths.
2. Cluster 7: investigate Native Dynamic Response Construction and Response Validation, especially the 8 genuine Live Window app-naming failures.

**Hard constraints honored:** no commit, no push, no file deletion, no test weakened, no unrelated system modified. Reused existing CozyAI/LivingAI/Live Window/semantic/cognitive/answer/language/memory/learning/presentation systems throughout — no second AI, response engine, TTS system, language engine, or Live Window was created anywhere in this pass. The prior 74-fix baseline from round 1 is untouched and independently reconfirmed (199/199, see below).

---

## 1. Cluster 6 — Privacy/visibility boundary audit

**Method:** static code search across `core/` for any path from a caught exception's `.message`/`.stack`, `__dirname`/`__filename`, or raw internal identifiers into an `answer`/`reply`/`text` field the Live Window renders — followed by 10 adversarial questions against the real, live `dashboard.html` Live Window in a real headless-Chromium session (English and Kiswahili), including direct requests for source code, file paths, internal functions, database details, an internal error, `process.env`, `__dirname`, and the "system prompt."

**Evidence:**
- Every `err.message`/`.stack` usage found in `core/living/` and `core/modules/intelligence/answer/` writes only to `console.warn` (dev console, never the UI) or a `reason:` diagnostic field never surfaced as answer text. Zero matches for `String(err)`/`err.toString()` reaching an answer-shaped field anywhere.
- All 10 real-browser adversarial probes returned the honest fallback ("I don't have verified information to answer that yet" / the Kiswahili equivalent) — **zero internal information disclosed in any case.**

**Verdict:** `PASS` today. But the non-leakage is currently a side effect of a closed-vocabulary content source (every answer traces to a human-authored `cozy-knowledge-registry.js` entry), not an enforced classification/access-check layer as master-spec item 63 requires ("security must not depend on wording... the meaning being exposed must be controlled"). Flagged as a real, specific architectural prerequisite for the Native Dynamic Response Construction work — not urgent today, not a current vulnerability, but a named gap rather than an assumed non-issue.

Full detail: `PRE-EXISTING-FAILURE-REGISTER.md` §7.1.

---

## 2. Cluster 7 — Live Window app-naming repair

### Root cause

`cozy-language-templates.js`'s 8 `"semantic-answer:intro:*"` frames (used by SA-4's `language-realizer.js` to introduce a multi-claim answer) were **fixed, entity-agnostic strings by explicit original design** ("Here's how this helps:", never "Here's how ShopOS helps:"). The underlying answer content was always 100% correct and on-topic (verified directly against `cozy-knowledge-registry.js`); the entity's own name simply never appeared anywhere in the rendered sentence.

### Affected files (before fix)

- `core/modules/intelligence/language/cozy-language-templates.js` — the 8 static intro strings
- `core/modules/intelligence/semantic-answer/realization/language-realizer.js` — `introFor()`/`composeClaims()`, which never had an entity name to pass through even though the plan's real `entity.value` was already available two lines away (`generatePlanId()` already reads it)

### Minimal repair (reusing existing systems only)

1. Converted the 8 intro template entries to **functions** taking an optional `entityName` — using `cozy-language-realize.js`'s **own pre-existing** `realize(key, language, ...params)` mechanism, which already special-cased function-shaped templates (proven by the pre-existing `"pastor-question:unavailable"` template using the identical pattern). No new template store.
2. `introFor(goal, language, entityName)` and `composeClaims(pieces, goal, language, entityName)` now accept and pass through the entity name.
3. The one real call site in `realizeCandidateSentence()` passes `plan.entity.value` — the same real field, not newly derived.
4. Calling with no entity name reproduces the **exact original generic wording, byte-for-byte** — every existing caller that doesn't opt in sees zero behavior change.

No new AI, response engine, TTS system, language engine, or Live Window. `cozy-living-assistant.js`, `cozy-answer-engine.js`, `cozy-ai.js`, and the Live Window renderer itself are all untouched (confirmed by `git status`).

### Focused tests added

`core/modules/intelligence/language/tests/entity-aware-semantic-intro.test.js` — **24/24 pass**:
- A/B (16 tests): every one of the 8 intro keys, EN, both the entity-named form and the byte-identical generic-fallback form.
- C (2 tests): `LanguageRealizer.introFor()` correctly threads the entity name through the seam, and is unaffected when omitted.
- D: a real multi-claim plan with a real entity (`QuarryOS`, chosen to prove this isn't hardcoded to any one app) produces a candidate sentence naming it.
- E: a real single-claim plan is completely unaffected (no intro composed at all — unchanged from before this fix).
- F: the intro mechanism can carry **only** the entity's own coerced string label — a crafted object with an extra `secret` property never leaks that property through the template, ties directly to the Cluster 6 finding.

### Stale pre-existing tests updated (real evidence, not weakened)

- `language-realizer.test.js`: 2 assertions used a real fixture plan whose entity is genuinely `ChurchOS` — the assertions were checking for the *less* correct generic intro; updated to expect the entity-named one, which is what the code now correctly produces.
- `cozy-answer-engine-semantic-construction.test.js` Test A: same real `ChurchOS` fixture, same update.

### Result against the original 8 documented failures

- **1 already fixed by Wave 1** (unrelated, previously reported).
- **5 of the remaining 7 now fixed** by this repair.
- **2 confirmed, by direct re-investigation, to be genuinely different pre-existing bugs** — not caused by, and not fixable by, this change:
  1. A multi-turn entity-context-switching defect (asking about a second app after a first sometimes still returns the first's content) — the SAME class of defect as an already-known baseline failure elsewhere in the same suite.
  2. `cozy-knowledge-registry.js`'s Kiswahili capability content for ChurchOS specifically doesn't contain the word "kanisa"/"makanisa" — a knowledge-content gap, not a code defect.

Both are recorded as open, distinct, classified entries in `PRE-EXISTING-FAILURE-REGISTER.md` §5/§7.2 — not silently absorbed into "fixed."

---

## 3. Regression results

| Suite | Result |
|---|---|
| New focused suite | **24/24** |
| `language-realizer.test.js` + `phase4-language-realize.test.js` | **14/14** |
| Full answer-engine suite (5 files) | **17/17** |
| Real-browser Live Window E2E | **18/20** (up from 13/20 baseline; 2 remaining are confirmed separate, pre-existing defects) |
| `wave1-live-window-real-browser.test.js` | **7/7** |
| `core/living` batch — 17 files (m360–m365, domain4b, teach-flow, pastor-question-flow, universal-*) | **341/341** |
| Cognitive/builder/SA batch — 13 files | **51/52** (1 = already-documented pre-existing `phase10b` failure, unrelated to this change) |
| Knowledge-module batch — 18 files | **157/157** |
| Language-packs/language batch — 7 files | **16/16** |
| `rule-based-conversational-provider-*` batch — 12 files | **93/93** |
| **Round 2 total** | **~960 tests run, 0 new regressions** |
| Round 1 baseline (re-confirmed untouched) | **199/199** |

`git diff --check`: clean (exit 0).

---

## 4. Files changed this round

**Production (2 files, additive only):**
- `core/modules/intelligence/language/cozy-language-templates.js`
- `core/modules/intelligence/semantic-answer/realization/language-realizer.js`

**Tests updated (real evidence, not weakened) — 3 files:**
- `core/modules/intelligence/semantic-answer/realization/test/language-realizer.test.js`
- `core/modules/intelligence/answer/tests/cozy-answer-engine-semantic-construction.test.js`
- (register document itself, not code)

**Tests added — 1 file:**
- `core/modules/intelligence/language/tests/entity-aware-semantic-intro.test.js`

**Documents updated/added:**
- `PRE-EXISTING-FAILURE-REGISTER.md` (updated §3.5, new §7)
- This report

**Untouched (confirmed via `git status`):** `cozy-living-assistant.js`, `cozy-answer-engine.js`, `cozy-ai.js`, `cozy-language-realize.js` (the seam itself — only its already-existing capability was exercised, not modified), the Live Window renderer, all hardware/server-dependent files, all Cluster 1–4 round-1 fixes.

---

## 5. Remaining gaps (honestly carried forward, not resolved)

- Cluster 6's structural classification/access-check layer (§7.1) — not built; flagged as a prerequisite for future dynamic-response work.
- The multi-turn entity-switching defect (§7.2.1) — open, `IMPLEMENTATION_DEFECT`.
- ChurchOS's Kiswahili capability content missing "kanisa" (§7.2.2) — open, content gap.
- Everything else already tracked in `PRE-EXISTING-FAILURE-REGISTER.md` §5–§7 (media engine missing file, hardware-blocked suites, server-dependent suites) — unchanged by this round.

---

**Status: STOPPED at the commit gate.** No commit, no push. Awaiting explicit authorization.
