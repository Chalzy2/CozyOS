# HANDOFF — Kiswahili Structural Semantic Improvement

## Baseline
- Input: `checkpoint-7.zip` -> inner project zip `CozyOS-mainD3-voice-checkpoint-7.zip`
- Baseline inner-zip SHA-256 (as declared by prior checkpoint's own handoff,
  `HANDOFF-NEXT-ACCOUNT-checkpoint7.md`): 2398e8e7587c39317102ea6eab4544c9f91aa9f37e6bd017aee21467f78d9ebd
- Baseline file count: 2154 files
- A second upload, `files__7_.zip`, supplied a candidate implementation
  (`cozy-kiswahili-structural-analysis.js`, its test file, and a
  purely-additive MODIFIED copy of the provider). This candidate was
  independently inspected, diffed against the real baseline file, and
  verified rather than trusted blindly (see "Verification method" below).

## Gemini's role vs. what was actually implemented
Gemini's four supplied blocks assumed file shapes and paths that do not
exist in the real repository (a Node-`module.exports` lexicon with a
`roots` object, and a grammar-model file at a path that in reality holds
the RP-035 TranslationRelationship/CorrectionRecord/ConflictRecord data
model). Per this task's own instruction, Gemini's blocks were treated as
*design intent*, not literal replacement files. The real, actually-existing
files were inspected first (see below), and Gemini's target
capabilities (noun classes, verbal extensions, tense/aspect, subject/
object prefixes, interrogatives, structural sentence decomposition,
layered language-detection evidence) were implemented as a **new,
additive module** that composes the real existing files read-only,
instead of overwriting either of them.

## Files changed
- `core/modules/intelligence/providers/rule-based-conversational-provider.js`
  — **18 lines added, 0 removed** (verified by `git diff --stat`). A new
  fallback branch inside the existing `detectLanguageHeuristic()`
  function, invoked only after the existing ~90-word marker list and the
  existing `-je` suffix rule both find nothing. No existing marker,
  intent handler, or behavior was changed, reordered, or deleted.

## Files created
- `core/modules/intelligence/language-packs/cozy-kiswahili-structural-analysis.js`
  (new, 749 lines) — Kiswahili morphological/structural semantic layer:
  subject-prefix + negation + tense/aspect + object-marker + reflexive +
  root + derivational-extension + final-vowel decomposition; noun-class
  *evidence* (never certainty from spelling alone); clause-marker
  detection (relative/conditional/causal/purpose); question-type
  detection; a small disclosed semantic-family map and geographic-entity
  gazetteer; and a separate `scoreLanguageEvidence()` function used as
  layered language-identification evidence (morphology + function words +
  the `-je` suffix + clause markers, deliberately NOT single-letter
  noun-class prefixes, which produced false positives on English during
  this module's own testing).
- `core/modules/intelligence/language-packs/tests/cozy-kiswahili-structural-analysis.test.js`
  (new, 252 lines / 16 tests) — proves structural generalization on
  sentences not stored anywhere in the module or lexicon, English
  non-regression, and that both pre-existing files (473-record lexicon,
  RP-035 knowledge model) are unmodified after this module loads.

## Files preserved (confirmed, not merely assumed)
- `core/modules/intelligence/knowledge/cozy-lexicon-en-sw.js` — untouched.
  Still exactly 473 records; confirmed both by `git diff` (no changes)
  and by test F1 in the new suite (`getRecordCount() === 473`) actually
  executing against the real file.
- `core/modules/intelligence/language-packs/cozy-language-knowledge-model.js`
  (the real RP-035 file) — untouched. `git diff` shows zero changes.
  Confirmed by test F2 in the new suite, which loads the real file and
  asserts `createTranslationRelationship`, `createCorrection`,
  `openConflict`, and `CORRECTION_VALIDATION_STATES` are exactly as
  before, AND by re-running the file's own pre-existing 14-test suite
  (`cozy-language-knowledge-model.test.js`) unmodified — 14/14 pass.
- All existing provider intents, marker words, and the `-je` heuristic —
  untouched (the new structural layer is appended strictly after them
  and only fires when they return no signal).

## Linguistic capabilities added
- Subject-prefix recognition (affirmative: ni/u/a/tu/m(mu)/wa; negative:
  si/hu/ha/hatu/ham/hawa) — disclosed partial coverage, class 1/2
  (persons) only.
- Tense/aspect markers: na (present continuous), li (past), ta (future),
  me (perfect), ka (consecutive), ki (conditional/during), nge / ngeli
  (would / would-have), hu (subject-less habitual, handled as a distinct
  construction), plus negative-present (final vowel -i) and
  negative-past (-ku- infix) patterns.
- Object markers (class 1/2 persons, reflexive "ji", classes 5/6/7/8/10)
  — accepted only when the remaining decomposition resolves to a
  verified root, to avoid fabricating a marker that happens to match
  letters inside the root.
- Derivational extensions: causative (-ish-/-esh-), applicative
  (-il-/-el-), reciprocal (-an-), stative (-ik-/-ek-), passive (-w-) —
  recognized with a "never over-strip a verified root" guard (tested
  explicitly: "elewa" is never torn into "ele" + fabricated passive).
- Noun-class *evidence* (m-/wa-, ki-/vi-, ji-/ma-, mu-/mi-, u-/n-) —
  always confidence LOW, never presented as a certain classification
  from spelling alone.
- Clause-structure detection: relative (ambaye/ambao/...), conditional
  (kama/ikiwa/iwapo/endapo), causal (kwa sababu/kwa kuwa/kutokana na),
  purpose (ili/kwa ajili ya).
- Interrogative/question-type detection (nini/nani/wapi/lini/vipi/gani/je
  + the generic "-je" suffix pattern).
- A small, disclosed semantic-family map (education, knowledge,
  technology, travel, community, change) and geographic-entity gazetteer
  (Mombasa, Kilifi, Malindi, Nairobi, Kisumu, Nakuru, Eldoret) — new
  data; the lexicon had no geography category at all before this.
- Layered language-detection evidence (`scoreLanguageEvidence`):
  morphology + weighted function-word hits (capped) + "-je" suffix +
  clause markers, combined into a normalized score with NONE/LOW/
  MEDIUM/HIGH confidence bands and an explicit evidence trail — composed
  as an additive fallback in the provider only when its own marker list
  and "-je" rule already found nothing, so genuinely novel Kiswahili
  sentences with none of the ~90 memorized markers can still be
  identified as Kiswahili from structure, without silently defaulting
  to English.

## Verification method (what was actually done, in order)
1. Extracted both uploaded ZIPs; read the real files at their real
   repository paths before writing or changing anything.
2. Compared the real lexicon and real RP-035 knowledge-model files
   against Gemini's example blocks; found the shapes did not match and
   documented why (see "Gemini's role" above) rather than overwriting
   either file.
3. Inspected the candidate `cozy-kiswahili-structural-analysis.js` and
   its test file supplied in `files__7_.zip` line-by-line.
4. Diffed the candidate's "MODIFIED" provider file against the real
   provider file with `diff`/`git diff` — confirmed 18 insertions, 0
   deletions, at the correct point inside `detectLanguageHeuristic()`.
5. `git init` on the extracted baseline tree, committed it as-is, then
   applied the 3 changes on top so every change is a real, inspectable
   diff against the genuine checkpoint-7 baseline.

## Tests actually executed (exact results)
All commands were run for real in this session; nothing below is
simulated or estimated.

- `node --check` on all 3 changed/new files: **all 3 OK** (no syntax
  errors).
- New suite, `cozy-kiswahili-structural-analysis.test.js`, run alone:
  **16 passed, 0 failed.**
- RP-035 regression, `cozy-language-knowledge-model.test.js`, run alone:
  **14 passed, 0 failed.**
- Lexicon regression, `cozy-lexicon-en-sw-pack01.test.js`, run alone:
  **20 passed, 0 failed.**
- Full provider suite, `core/modules/intelligence/providers/tests/*.test.js`
  (14 files): **95 passed, 0 failed.**
- Full knowledge suite, `core/modules/intelligence/knowledge/tests/*.test.js`:
  **155 passed, 0 failed.**
- Full language-packs suite, `core/modules/intelligence/language-packs/tests/*.test.js`
  (8 files): **23 passed, 0 failed.**
- Grep-based blast-radius check: no `*.test.js` file outside those three
  test directories `require()`s any of the three changed/new source
  files.
- Broad safety-net sweep of the entire `core/modules/intelligence/**`
  tree (92 test files, excluding `*-browser.test.js`, which need a real
  browser and were explicitly out of scope for this pass per the task
  brief): **531 passed, 1 failed, 10 cancelled**, run in a single
  `node --test` invocation (542 total).
  - The 1 failure (`cozy-media-evidence.test.js`, "RP-030 registry
    still reports 13 defaults with Phase 4 loaded", got 17) is in the
    unrelated media/RP-030 subsystem, which this change never touches.
    Verified pre-existing: reproduced in isolation on the untouched
    baseline (via `git stash`) with the identical failure before any
    Kiswahili change was applied. Not introduced by this work.
  - The 10 cancelled tests were not individually triaged in this pass
    (see "Known limitations" below) — flagged for the next session
    rather than assumed benign.

## Known limitations (disclosed, not hidden)
- Subject-prefix and object-marker coverage is class 1/2 (persons)
  only, matching the module's own documented scope — classes 3-10
  subject agreement is not modeled.
- Some irregular Kiswahili consonant alternations (e.g. funza ->
  fundisha) are not modeled; the module honestly reports the extension
  where it can (CAUSATIVE) but marks the deeper root `knownRoot: false`
  rather than guessing — see the module's own test for
  `tutawafundisha`.
- Noun-class detection is evidence-only (always LOW confidence) by
  design; it is deliberately excluded from language-identity scoring
  because single-letter prefix matches produced false positives on
  English during this module's own regression testing.
- The 10 cancelled tests in the broad `core/modules/intelligence/**`
  sweep were not triaged individually in this session.
- `core/modules/intelligence/providers/tests/rule-based-conversational-provider-rp0`
  is a pre-existing 1-byte stray file already present in the checkpoint-7
  baseline (confirmed via `git stash` before/after comparison) — not a
  test file, not created or modified by this session, left untouched.
- Per the task brief, VoiceManager/TTS and `*-browser.test.js` UI suites
  (which need a real browser/Playwright) were explicitly out of scope
  for this pass and were not run.
- Luo/Kikuyu/Kamba/Kalenjin were intentionally NOT implemented this
  pass, per the task brief — the module's data shape is written so a
  sibling file can reuse the same architecture later.

## Environment limitations
- No network access in this container; nothing in this change required
  network access.
- The full `core/` tree (2154 files, 333 non-browser test files) was not
  exhaustively run in this session due to time budget — the sweep above
  covers the entire affected subsystem (`core/modules/intelligence/**`,
  92 files / 542 tests) plus a `grep`-verified confirmation that no file
  outside that subsystem references any of the three changed files.

## Exact continuation point for the next account
1. Triage the 10 cancelled tests from the `core/modules/intelligence/**`
   sweep (log at time of this handoff was not preserved as a separate
   artifact beyond this document — rerun
   `node --test $(find core/modules/intelligence -name "*.test.js" | grep -v browser)`
   to reproduce).
2. Formally classify the pre-existing RP-030-count failure
   (`cozy-media-evidence.test.js`) — it is unrelated to Kiswahili work
   and was already flagged as unresolved in the checkpoint-7 baseline
   handoff's own "14 files have real fail counts needing formal
   classification" list.
3. If further Kiswahili structural coverage is wanted: extend
   `cozy-kiswahili-structural-analysis.js`'s subject/object-marker
   tables to classes 3-10, and/or add the irregular-alternation table
   for verbs like funza/fundisha, jenga/jengwa, etc. — additively, in
   the same file, preserving its existing exported API shape.
4. Do not modify VoiceManager or TTS in the next pass either, per the
   task brief — the semantic layer feeds language identity upstream of
   those systems, not the reverse.
5. The `*-browser.test.js` suites (Playwright) were not run this
   session and remain the responsibility of a session with a real
   browser runtime available.
