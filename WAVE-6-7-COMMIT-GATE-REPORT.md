# Wave 6/7 Verification Checkpoint — Commit-Gate Report (Re-verified)

Continuation from commit `9cebab9`. This revision does not treat the prior
draft of this report as authoritative — every repair below was re-proven
in this pass by first reverting it (via `git stash` on the single
production file, nothing else touched) and confirming the ORIGINAL
failure re-occurs against the pre-fix code, then restoring the fix and
confirming it passes again. "Passing tests" alone were never accepted as
proof; the before/after contrast is the proof.

**No commit or push has been made.** This report is the evidence package
for the next COMMIT/PUSH AUTHORIZED decision, not a record of one.

---

## 0. Scope and preservation rules honored

- One CozyAI, one Live Window: confirmed — no new engine, orchestrator,
  provider, template store, knowledge store, or Live Window file exists
  anywhere in the diff (`git status` reviewed in full, §7).
- No second AI, second language engine, second learning system, second
  TTS/voice system: every repair below is a change inside an *existing*
  function (`tryConstructSemanticAnswer()`, `partitionEvidenceByAuthority()`)
  or a content correction inside an *existing* data record
  (`cozy-knowledge-registry.js`'s `churchos` entry). Nothing new was
  registered on `window.CozyOS`.
- No capability deleted to make anything pass: every diff hunk reviewed
  line-by-line in §7; every "deletion" `git diff --stat` reports is a line
  being replaced by an equivalent-or-stronger line, never a removed
  capability, test, or assertion.
- Native multilingual understanding, not English-intermediary translation:
  verified again this pass — the Kiswahili content fix (§2.2) is a native
  Kiswahili content correction, not a runtime translation shim, and
  `cozy-answer-engine-semantic-construction.test.js` Test D (already
  passing, unmodified) independently proves Kiswahili answers are
  constructed from real, committed Kiswahili evidence, never generated in
  English and translated after the fact.

---

## 1. Wave 7 — reproduction-first proof for both repairs

### 1.1 Multi-turn entity switching

**Reproduction against the pre-fix code** (`git stash push -- cozy-answer-engine.js`, i.e. every OTHER file including the new focused test stayed in place):

```
node --test core/modules/intelligence/answer/tests/cozy-answer-engine-stale-cognitive-result.test.js
# pass 2, fail 2
```
- Test A failed: asking about MpesaOS with a stale ChurchOS-cached
  cognitive result returned **ChurchOS's own answer text**
  ("Here's what ChurchOS can currently do: setupChurch()...") instead of
  MpesaOS's.
- Test D failed: a cached CLARIFICATION plan blocked a real, current-turn,
  entity-hinted question, falling through to "I don't have verified
  information to answer that yet" instead of the correct QuarryOS answer.

Fix restored (`git stash pop`) → same file, same tests: **4/4 pass.**

**Root cause (traced through the real, unmodified call chain, not
assumed):** `semantic-answer-interpretation-provider.js`'s
`buildInterpretation()` (SA-3B's bridge, invoked early in every turn by
`CognitiveCoordinator.run()` from inside `rule-based-conversational-
provider.js`'s `think()`) calls `SemanticAnswerPlanner.planAnswer({text,
conversationState, actorId})` with **no `entityHint`** (confirmed by
direct reading, line 174 of that file). When the current turn names an
application `SemanticIntentEngine`'s own `KNOWN_ENTITIES` list does not
recognize (a real, disclosed, pre-existing gap — documented in
`semantic-answer-planner.js`'s own header), SA-3's
`resolveContextualEntity()` falls back to inheriting
`conversationState.lastDiscussedApplication` — the **previous** turn's
application — producing a structurally valid but wrong-entity plan.
Meanwhile `cozy-living-assistant.js`'s own `entityHint`
(`contextualEntityName`) is computed correctly, separately, after the
turn's conversation state updates. `cozy-answer-engine.js`'s Wave 1 reuse
optimization trusted the stale plan without ever comparing it to
`entityHint`.

A second, fully faithful reproduction (matching the exact SA-3B bridge
call shape — current-turn text, OLD conversationState, no entityHint) was
run directly against `SemanticAnswerPlanner.planAnswer()` and confirmed
the same mechanism: `planAnswer({text: 'What does MpesaOS do?',
conversationState: {lastDiscussedApplication: 'ChurchOS', ...}})` resolves
`entity: "ChurchOS"`, not MpesaOS — this is SA-3's own real behavior, not
a test artifact.

**Repair:** `tryConstructSemanticAnswer()` now only reuses `cognitiveResult`
when its own resolved entity agrees with `entityHint` (or no `entityHint`
was supplied, preserving every pre-fix caller's exact behavior). A
disagreement falls through to the same fresh `planner.planAnswer()` call
already made when `cognitiveResult` is absent.

### 1.2 ChurchOS Kiswahili "kanisa" content gap

**Reproduction against the pre-fix content** (`git stash push --
cozy-knowledge-registry.js`):

```
node --test core/modules/intelligence/knowledge/tests/churchos-capability-kiswahili-content.test.js
# pass 3, fail 1
```
- Test A failed: `churchos.currentVerifiedCapabilitiesSw` returned
  `"setupChurch() — hutumia tena OrganizationRegistry halisi iliyopo,
  hakuna mfumo wa pili wa shirika uundaji, upatikanaji, na uorodheshaji wa
  wanachama..."` — real, correct, verified content, containing neither
  "kanisa" nor "makanisa" anywhere.

Fix restored → **4/4 pass.**

**Also reproduced from the real Live Window** (real browser, real DOM,
this checkpoint): `cozy-living-assistant-live-window-e2e.test.js`'s
"Kiswahili ChurchOS-specific questions" test — "ChurchOS inafanya nini?"
answered correctly-entity-named but "kanisa"-less content before the fix,
now passes (§4).

**Root cause:** every layer (semantic classification, SA-3 planning,
SA-2 evidence retrieval, SA-4 realization, SA-5 validation, Live Window
rendering) behaved correctly given its input. The actual gap was content:
`churchos.currentVerifiedCapabilitiesSw`'s 4 real, verified capability
strings described generic member-management mechanics ("wanachama")
without ever making explicit that, in ChurchOS's own context, those are
specifically *church* members — unlike every other real Kiswahili field
on the same record. This is a genuine content-authoring gap, not a
translation error (the English source has the same generic-mechanism
tone).

**Repair:** the 4 strings now say "wa kanisa" ("of the church") where the
real capability is specifically about church members — same 4 real
capabilities, faithfully and more precisely localized. No capability
invented or removed, no code path touched, English content untouched,
every other application's Kiswahili content untouched (proven by focused
tests B/C/D).

---

## 2. Wave 6 — proof the sensitivity gate is a real enforced control, not accidental

**Reproduction against the pre-fix planner** (`git stash push --
semantic-answer-planner.js`):

```
node --test core/modules/intelligence/semantic-answer/planning/test/wave6-sensitivity-enforcement.test.js
# pass 2, fail 6
```
This is the decisive evidence the checkpoint required: **test G**
("a MIX of PUBLIC and PRIVATE evidence... only ever surfaces the PUBLIC
claim") failed with `2 !== 1` — meaning, without this repair,
`partitionEvidenceByAuthority()` genuinely included a `PRIVATE`-sensitivity
evidence record in the same `authoritative` bucket as a `PUBLIC` one, and
it would have become a real plan claim, flowing into the real, unmodified
SA-4 realizer and SA-5 validator exactly like any other claim — nothing
downstream would have stopped it. This proves the finding that motivated
Wave 6: prior to this fix, non-leakage depended entirely on every
evidence source SA-3 currently draws from happening to default to
`PUBLIC` — the boundary was a property of today's data, not of the code.

Fix restored → **8/8 pass.**

**Repair:** `partitionEvidenceByAuthority()` now only places a
structurally-authoritative evidence record into `authoritative` when its
own `sensitivity` field is exactly `"PUBLIC"`. Everything else
(`ORGANIZATION`/`PRIVATE`/`ADMIN`/`SYSTEM`/`SECRET`, and any missing or
malformed value — fails closed) goes into a new, honestly-reported
`restricted` bucket and can never become a claim. Reuses SA-1's own,
already-existing `VerifiedEvidenceContract.SENSITIVITY` enum and the
`sensitivity` field every real evidence record already carries — no new
taxonomy, no new evidence field, no new authorization system.

### 2.1 Adversarial and exception-path verification (this pass)

**Real Live Window, real Chromium, English + Kiswahili
(`core/living/tests/live-window-privacy-adversarial.test.js`, 3/3 pass):**
- 6 English adversarial probes (source code, file path, `process.env`,
  system prompt, internal error, internal database) — no leak.
- 3 Kiswahili adversarial probes (same classes) — no leak; the boundary is
  not merely an English-keyword filter.
- 1 legitimate-question control ("What does ShopOS do?") — correctly
  answered, proving the gate does not over-block honest `PUBLIC` content.

**Fault-injection into the exception path itself, EN + SW
(`core/modules/intelligence/answer/tests/cozy-answer-engine-exception-nonleakage.test.js`,
2/2 pass, new this pass):** the real `VerifiedEvidenceAdapter` SA-3
actually calls was made to throw a distinctive, secret-shaped error
message (`INTERNAL_STACK_TRACE_/etc/secrets/db-password.txt_LEAKED` /
its Kiswahili equivalent) from inside a real `answer()` call. Result:
- The marker string appears **nowhere** in the full, serialized return
  value (`answer`, `cognitiveContext`, `sources` — not just the visible
  chat text).
- This is not because the request silently failed: `evidenceState` is
  still `VERIFIED` and a real, correct ChurchOS answer is still returned.
  `tryConstructSemanticAnswer()` catches the exception, discards it, and
  the engine gracefully falls through to the older, separately-verified
  `CozyIdentityFAQRouter`/`CozyAI.getContext()` chain — genuine graceful
  degradation, not a leak and not a hard failure.

**Static trace of every catch block in the SA-2..SA-6 pipeline
(`semantic-answer-planner.js`, `cozy-answer-engine.js`,
`cozy-memory-adapter.js`):** every catch either discards the error
(`catch (_err) {...}`) or, in `cozy-memory-adapter.js`'s
`adaptFromSearch()`, attaches `err.message` only to that call's own
diagnostic `errors` array — traced forward and confirmed this `errors`
field is read in exactly two places in `semantic-answer-planner.js`
(both inside a `{success:false, reason:...}` result object) and is never
copied into `plan`, `plan.claims`, or `cognitiveContext` (which reads only
`.plan`/`.diagnostics`, confirmed by direct reading of
`buildCognitiveContext()`). `CozyMemoryAdapter` is not wired to any goal
in `GOAL_FIELD_MAP` today (per the planner's own header), so this path is
not reachable from a real turn yet — traced anyway as defense in depth for
when a memory-backed goal is eventually added.

### 2.2 Ordinary questions still work (no over-blocking)

Confirmed at both layers: `wave6-sensitivity-enforcement.test.js` test H
(the real, currently-wired `CozyKnowledge` path, unaffected) and the full
337+ -test regression batch (§5) — 0 capability regressions.

---

## 3. Wave 7 — remaining required scenarios, verified this pass

**Multi-turn entity switching:** §1.1, plus real-browser confirmation —
`cozy-living-assistant-live-window-e2e.test.js`'s "every real application
named... is independently reachable" test (the original `not ok 10`) now
passes, looping through all 8 real applications.

**Entity-aware response construction:** unchanged from the already-
committed Cluster 7 fix (`cozy-language-templates.js`/
`language-realizer.js`), reconfirmed passing (§5) — not re-derived, not
touched this checkpoint.

**Kiswahili-native content retrieval:** `cozy-answer-engine-semantic-
construction.test.js` Test D (unmodified, already committed) — every real
Kiswahili `humanBenefits` item used appears verbatim in the answer, proving
direct construction from committed Kiswahili evidence, never English-
generated-then-translated.

**English → Kiswahili → English continuity (new this pass —
`core/living/tests/live-window-language-continuity.test.js`, 4/4 pass,
real browser):**
- Same entity (ShopOS) asked in EN → SW → EN: each turn answers natively
  in the language asked (Kiswahili turn matches `Hivi ndivyo`/`ndivyo`,
  never `^Here's`; English turns match `^Here's`, never Kiswahili), entity
  stays correct throughout.
- Switching topic AND language simultaneously (EN ShopOS → SW ChurchOS):
  no content mixing between the two applications.

**Follow-up questions:** reconfirmed via the existing SA-3B real-browser
suite ("ChurchOS inafanya nini?" → "Na inasaidiaje?" resolves
`HUMAN_BENEFIT — ChurchOS`, unmodified, still passing) and the new
`live-window-language-continuity.test.js`'s dedicated follow-up-after-
clarification test.

**Clarification (new this pass, real browser):** "What are the benefits?"
(no entity, no prior context, fresh session) never guesses a specific
named application — checked against all 8 real app names, none matched.
A follow-up naming an entity in the very next turn ("What does QuarryOS
do?") resolves correctly, proving clarification does not corrupt
conversation state for the next turn.

**Dynamic response construction:** proven throughout §1-§3 — every
answer traced above is constructed by the real SA-3→SA-4→SA-5 pipeline
from real evidence, not retrieved from a fixed string.

**Response validation before rendering:** `ResponseValidationResultContract`
and the repair loop are unmodified and still fully exercised by the
existing, passing `response-validator`/`repair-loop` test suites (part of
the 339-test batch, §5) — `tryConstructSemanticAnswer()` only ever
returns a candidate that already passed `repairLoop.realizeValidated()`;
no path in this checkpoint's diff bypasses that call.

---

## 4. Real-browser evidence summary (this pass)

| Suite | Result |
|---|---|
| `cozy-living-assistant-live-window-e2e.test.js` | 20/20 |
| `live-window-privacy-adversarial.test.js` (new) | 3/3 |
| `live-window-language-continuity.test.js` (new) | 4/4 |
| `wave1-live-window-real-browser.test.js` | 7/7 |
| `deep-application-capability-audit.test.js` | 18/18 |
| `cozy-living-assistant-application-semantic-repair.test.js` | 7/8 (1 pre-existing, out-of-scope failure — §6) |
| `sa3b-real-browser.test.js` (cognitive providers batch) | 6/6 |
| **Total real-browser this pass** | **65/66**, the 1 failure pre-existing and unrelated to any change in this diff |

All suites run with `COZY_E2E_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome` (see §8, BLOCKED_ENVIRONMENT note).

---

## 5. Full regression results (this pass)

| Suite | Result |
|---|---|
| Wave 6/7 focused unit tests (4 files, 18 tests) | 18/18 |
| Full SA-1..SA-6 + answer + knowledge + language batch | 339/339 |
| Cognitive providers batch (incl. real-browser) | 41/41 |
| Round-1 baseline (7 files) + Cluster 7 focused (`entity-aware-semantic-intro.test.js`) + existing privacy suite (`cozy-intelligence-privacy.test.js`) | 118/118 |
| Real-browser Live Window suites (6 files) | 65/66 (§4) |
| **Grand total this pass** | **~581 tests run this verification pass, 0 newly introduced failures** |

`git diff --check`: clean (exit 0).

---

## 6. Failure classification (required vocabulary)

| Status | Item |
|---|---|
| **PASS** | Wave 7a entity-switching fix (4/4 focused + real-browser); Wave 7b Kiswahili content fix (4/4 focused + real-browser); Wave 6 sensitivity gate (8/8 focused, decisive before/after proof); adversarial privacy (3/3 + 2/2 fault-injection); EN↔SW continuity + clarification (4/4, new) |
| **repaired baseline FAIL** (was failing before this checkpoint, confirmed by direct reversion, now fixed) | Multi-turn entity switching; ChurchOS Kiswahili "kanisa" gap; the (newly-demonstrated) unenforced sensitivity boundary |
| **remaining deterministic FAIL** (confirmed present, unrelated to this diff, reproduced twice) | `cozy-living-assistant-application-semantic-repair.test.js`: "ChurchOS ina faida gani?" (Kiswahili HUMAN_BENEFIT) returns a fully-formed **English** answer instead of Kiswahili — a distinct, genuine language-selection defect, not entity resolution (Wave 7a) or content (Wave 7b). Same failure, same file, unrelated code path, on both the pre-fix and post-fix state of all 3 production files in this diff — confirmed NOT introduced by this checkpoint. |
| **BLOCKED_ENVIRONMENT** | Every real-browser suite in this repository defaults to Playwright's managed Chromium resolution, which in this sandbox looks for a `chrome-headless-shell` revision that does not match the pre-installed one. Not a code defect — every suite above passed once `COZY_E2E_CHROMIUM_PATH` was set to the actual pre-installed binary. |
| **newly introduced FAIL** | None found. |
| **BLOCKED_DEPENDENCY / TEST_DEFECT / STALE_EXPECTATION / UNVERIFIED** | None found this pass. |

No test was deleted or weakened to reach any of the above. No pre-existing failure was reclassified as acceptable because it predates this session (per the standing Baseline Failure Reduction Rule) — the one remaining deterministic FAIL is recorded, not dismissed, and is the natural next investigation target.

---

## 7. Files changed (proposed commit contents — not yet committed)

**Production (3 files, all reviewed line-by-line this pass — see §1/§2 for
per-file root cause + repair, and the full diff reviewed for this report):**
- `core/modules/intelligence/answer/cozy-answer-engine.js` — Wave 7a entity cross-check (`tryConstructSemanticAnswer()`). +40/-2 (net).
- `core/modules/intelligence/knowledge/cozy-knowledge-registry.js` — Wave 7b Kiswahili content correction, 4 strings. +8/-8.
- `core/modules/intelligence/semantic-answer/planning/semantic-answer-planner.js` — Wave 6 sensitivity gate (`partitionEvidenceByAuthority()`, `classifyCognitiveStatus()`, `planAnswer()`'s caller-side handling). +68/-13.

**Tests (7 files — 4 from the prior draft, 3 new this verification pass):**
- `core/modules/intelligence/answer/tests/cozy-answer-engine-stale-cognitive-result.test.js` (Wave 7a, 4 tests)
- `core/modules/intelligence/knowledge/tests/churchos-capability-kiswahili-content.test.js` (Wave 7b, 4 tests)
- `core/modules/intelligence/semantic-answer/planning/test/wave6-sensitivity-enforcement.test.js` (Wave 6, 8 tests)
- `core/living/tests/live-window-privacy-adversarial.test.js` (Wave 6, 3 real-browser tests)
- `core/modules/intelligence/answer/tests/cozy-answer-engine-exception-nonleakage.test.js` **(NEW this pass** — exception/fault-injection non-leakage, 2 tests)
- `core/living/tests/live-window-language-continuity.test.js` **(NEW this pass** — EN↔SW continuity + clarification, 4 real-browser tests)

**Report:**
- `WAVE-6-7-COMMIT-GATE-REPORT.md` (this file)

**Confirmed excluded / not part of this proposed commit** (verified via
`git status --short`):
- `MULTILINGUAL-INTELLIGENCE-AUDIT.md` (unrelated, pre-existing untracked file)
- `cozy-taskbar-cdp-diagnostic-*/` (harness-generated artifacts, not created by this checkpoint's own actions — flagged, not deleted)
- All Cluster 1-7 files already committed at `9cebab9` — untouched, reconfirmed still passing (§5), not re-included in this diff.

**Untouched (confirmed via `git status`):** `cozy-living-assistant.js`,
`cozy-ai.js`, `cozy-language-realize.js`, `cozy-language-templates.js`,
`language-realizer.js`, the Live Window renderer, `SemanticIntentEngine`,
`CognitiveCoordinator`, `semantic-answer-interpretation-provider.js`
(SA-3B bridge), the repair loop, the response validator.

---

## 8. 12-wave roadmap mapping

Per explicit instruction: this section states which waves each repair
**touches or advances**, never that a later wave is **complete**. No wave
past W7 is claimed finished by anything in this checkpoint.

| Repair | Waves touched | Why |
|---|---|---|
| Wave 7a entity cross-check | **W1** (lives inside W1's own `cognitiveResult` reuse mechanism, closing a gap that mechanism opened), **W2** (the deeper root is SA-3's `resolveContextualEntity()` — part of the universal semantic-planning foundation), **W7** (Response Construction: determines which plan is used to construct the response) | Root cause spans two layers; fix is minimal and lives at the W7 consumption point |
| Wave 7b Kiswahili content fix | **W5** (Universal Language-Aware Knowledge — the defect was in the knowledge registry's own Kiswahili content, not code), **W4** (indirectly reaffirms no English intermediary: the fix is a native Kiswahili edit, not a translation patch) | Every SA-2..SA-5 code layer was already correct; this is a knowledge-content repair |
| Wave 6 sensitivity gate | **W6** (this checkpoint's primary deliverable — the enforced privacy/visibility boundary), **W7** (the gate lives inside SA-3's own claim-construction step, i.e. response construction) | Converts an accidental (closed-vocabulary) property into a designed control |
| New exception-nonleakage tests | **W6**, **W9** (Architecture Guardian discipline — proves graceful degradation reuses the existing older answer chain rather than any new fallback system) | |
| New EN↔SW↔EN continuity + clarification tests | **W3** (Native Multilingual Understanding), **W4** (no English intermediary — Kiswahili turns verified to be real Kiswahili construction, not translated English), **W7** (Response Construction & Validation) | |

**Explicitly NOT claimed by this checkpoint:** W8 (Universal Application
Integration — no application-specific integration work was done; the
fixes are generic across all 8 apps via existing shared seams, but W8's
own scope is broader than this diff touches), W10 (Continuous Language
Learning & Maturity — `LearningEvidenceSupplement` untouched), W11 (Real-
World Multilingual/Voice Acceptance — this checkpoint contributes EN/SW
real-browser evidence toward W11 but does not exercise voice/TTS or a
full acceptance matrix), W12 (Full-System Verification & Production
Readiness — this is a scoped, three-file checkpoint, not a full-system
sign-off; the one remaining deterministic FAIL in §6 by itself means W12
cannot be declared).

---

## 9. Commit-gate determination (evidence only — decision deferred)

Every repair in this diff was proven, not assumed: reverted to reproduce
the original failure, restored to confirm the fix, then stress-tested
beyond the original failure (fault injection, adversarial probing,
combined entity+language switching, clarification/follow-up). 0 newly
introduced failures across ~581 tests this verification pass. 1 pre-
existing, unrelated, deterministic failure is recorded, not fixed, and
not treated as acceptable merely because it predates this checkpoint.

This report does not authorize a commit. Per instruction, the evidence
above is submitted for review against the 12-wave roadmap; commit/push
remains withheld until that review returns COMMIT/PUSH AUTHORIZED.
