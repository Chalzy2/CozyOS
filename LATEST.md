# LATEST.md — Continuous Development Contract

**This session (Engine 11 Phase 5 — Close):** Completed Phase 5
(Registry Updates) through Phase 9 (Close) after independently
re-verifying Phase 0–4's own checkpoint (ZIP integrity, Package/
Repository SHA-256 both matched exactly, 10/10 Engine 11 tests, 196/196
Engine 1–10 regression tests, the locked-file diff, all re-run fresh
this session, not reused from the delivered checkpoint's own claims).
**Engine 11 is CLOSED. M388 — Living Media Interpreter is COMPLETE — all
11 engines Closed.** Full detail:
`docs/history/M388-E11-VideoInterpreterCoordinator-Compose.md`.

**SESSION CANNOT END WITHOUT A VERIFIED, DELIVERED ZIP.** (Rule 80 —
Builder Stop Gate; see `docs/builder/rules/25-builder-stop-gate-rule.md`.
Per Rule 80, "delivered" means the person has actually received the
file via `present_files`, not merely that it was built on disk.)

==================================================
PROJECT MILESTONES
==================================================

✅ M381–M387
(Prior milestones, Completed — full detail: `docs/history/M381.md` through `docs/history/M387.md`)

✅ M387.5
Browser Verification & Integration
Status: COMPLETED

✅ M388
Living Media Interpreter
Status: COMPLETE (this pass) — all 11 engines Closed

Completed
✓ Engine 1 — Media Decode Engine
✓ Engine 2 — Language Detection Engine
✓ Engine 3 — Living Translation Engine (Translation Pipeline)
✓ Engine 4 — Speaker Diarization Engine
✓ Engine 5 — Background Audio Separation Engine
✓ Engine 6 — Subtitle Timeline Engine
✓ Engine 7 — Voice Generation Engine
✓ Engine 8 — Synchronization Engine
✓ Engine 9 — Media Encode Engine
✓ Engine 10 — Streaming/Playback Pipeline Engine
✓ Engine 11 — Video Interpreter Coordinator — **CLOSED (Phase 9) this
pass.** 10/10 real tests reconfirmed at Close; 196/196 Engine 1–10
regression reconfirmed, zero regressions. Full detail:
`docs/history/M388-E11-VideoInterpreterCoordinator-Compose.md`.

**Engine 12 does not exist and was not invented.** M388's Approved
11-engine Implementation Order is fully Closed. The next milestone is
**Living AI Learning** — not begun this pass; a future session begins it
with its own Phase 0/1/2, searching the entire repository for existing
capabilities before proposing any new engine.

No milestone is currently ACTIVE, PAUSED, or WAITING as of this pass.
Rule 74 governs pause/resume if a future milestone requires one to
pause.

==================================================
COZYOS PROJECT ROADMAP
==================================================

Current Milestone
-----------------
None active. M388 — Living Media Interpreter is COMPLETE. Living AI
Learning has not yet begun.

Current Stable ZIP
------------------
`CozyOS-main-v3_02_28-M388-E11-Closed.zip` (this session's Rule 67
Delivery block)

Governance
----------
Repository SHA-256 reverified this pass against `RELEASES.md` before any
work began — matched exactly, no discrepancy.

Repository Status
-----------------
Repository Verified
ZIP Verified
SHA-256 Verified

==================================================
ENGINE STATUS
==================================================

✅ Engine 1
Media Decode Engine
Status: CLOSED

✅ Engine 2
Language Detection Engine
Status: CLOSED

✅ Engine 3
Living Translation Engine (Translation Pipeline)
Status: CLOSED (Phase 9). Implementation Contract items 1–7 fulfilled; item 8 (MD-018) correctly not resolved. 12/12 real tests pass.

✅ Engine 4
Speaker Diarization Engine
Status: CLOSED (Phase 9). Final Implementation Contract items 1–6 fulfilled exactly as written, no locked file touched, MD-019 correctly not resolved. 23/23 real tests pass.

✅ Engine 5
Background Audio Separation Engine
Status: CLOSED (Phase 9). Final Implementation Contract items 1–6 fulfilled exactly as written, no locked file touched, AA-007 naming-collision risk resolved by construction. 18/18 real tests pass.

✅ Engine 6
Subtitle Timeline Engine
Status: CLOSED (Phase 9). Final Implementation Contract items 1–6 fulfilled exactly as written, no locked file touched. 22/22 real tests pass.

✅ Engine 7
Voice Generation Engine
Status: CLOSED (Phase 9). Final Implementation Contract items 1–6 fulfilled exactly as written, no locked file touched. 13/13 real tests pass; 142/142 total including regression. MD-020's underlying buffer-capture question remains open (blocks Engine 9), correctly out of Engine 7's own orchestration-only scope.

✅ Engine 8
Synchronization Engine
Status: CLOSED (Phase 9). Final Implementation Contract items 1–6 fulfilled exactly as written, no locked file touched. 21/21 unit + 3/3 integration tests pass; 166/166 total including regression. Real, honest crossCheckTiming() classification — never a fabricated drift value (getCapabilities().realDriftMeasurement stays honestly false).

✅ Engine 9
Media Encode Engine
Status: CLOSED (Phase 9). Final 7-item Implementation Contract fulfilled — real deterministic buildEncodePlan() composing Engine 1/7/8's real outputs into a structural mux plan (realEncode: false, honest). 12/12 real tests pass; 178/178 total including regression.

✅ Engine 10
Streaming/Playback Pipeline Engine
Status: CLOSED (Phase 9). Real per-stream segment latency/throughput instrumentation over cozy-live.js's existing Stream/TranslationStream state, never fabricating a latency it didn't observe (getCapabilities().realLowLatencyTransport honestly false). 21/21 real tests pass; 199/199 total including regression, zero regressions.

✅ Engine 11
Video Interpreter Coordinator
Status: CLOSED (Phase 9) this pass. `core/engines/media/coordinator/video-interpreter-coordinator.js` composes Engines 1–10's own real public APIs into a single real, sequenced 8-stage pipeline, cascading an honest skip whenever a required upstream stage was itself skipped or failed closed — never fabricating a downstream result over a missing upstream one. One additive `REGISTRATIONS` entry, no locked file touched (confirmed via file-list diff against the original delivered ZIP, twice this milestone). 10/10 real tests pass; 196/196 Engine 1–10 regression tests re-run fresh, zero regressions. Full detail: `docs/history/M388-E11-VideoInterpreterCoordinator-Compose.md`.

Note: this is the repository's real, verified 11-engine Approved
Implementation Order (`docs/history/M388.md`, Phase 2 Review) — the only
authoritative roster per Rule 69/72. **All 11 engines are now Closed.**

==================================================
NEXT UNLOCK
==================================================

Current:
None within M388 — the milestone is complete.

Next milestone: Living AI Learning — its own Phase 0 (Repository
Verification) is the correct next step for a future session. Engine 12
does not exist and will not be invented.

==================================================
SAFE GITHUB BUILD
==================================================

Latest Stable ZIP

`CozyOS-main-v3_02_28-M388-E11-Closed.zip` (this session's Rule 67
Delivery block)

==================================================
PROJECT COMPLETION
==================================================

Completed Engines:
11

Current Engine:
None — M388 complete. Next milestone: Living AI Learning (not begun this pass).

Remaining Engines (Locked):
0

==================================================
# LATEST.md

**Current Milestone:** M388 — Living Media Interpreter (**Engine 1 Closed, Engine 2 Closed, Engine 3 (Living Translation Engine / Translation Pipeline) CLOSED this pass (Phase 0 → Phase 9 complete across sessions)** — see `docs/history/M388.md` and `docs/history/M388-E3-Translation-Compose.md`)
**Milestone Status:** **Phase 3 In Progress (per-engine)** (Rule 63/65/68). Engine 1: Closed (Phase 9). Engine 2: Closed (Phase 9). Engine 3: **Closed (Phase 9) this pass** — Final Implementation Contract items 1–7 fulfilled exactly as written, item 8 (`MD-018`) correctly not resolved per Phase 2 Review's own decision. 12/12 real, executed tests pass (`core/engines/media/translation/tests/translation-pipeline-engine.test.js`); Engine 1 (23/23) and Engine 2 (31/31) regression re-run clean. Overall M388 Milestone Status remains not-Completed (8 more engines to go after Engine 3). **Rule 75 (Milestone Waiting Queue) also adopted this pass** — see `docs/builder/rules/20-milestone-waiting-queue-rule.md` and `docs/builder/knowledge/milestone-waiting-queue.md`.
**Current Version:** Builder 1.0.0-ENTERPRISE
**Current Repository Status:** New files this pass: `core/engines/media/translation/translation-pipeline-engine.js`, `core/engines/media/translation/tests/translation-pipeline-engine.test.js`, `docs/builder/rules/20-milestone-waiting-queue-rule.md`, `docs/builder/knowledge/milestone-waiting-queue.md`. Modified this pass: `core/bridge/engine-bridge-bootstrap.js` (one new `REGISTRATIONS` entry), `docs/builder/knowledge/repair-queue.md`, `docs/builder/rules/00-INDEX.md`, `docs/history/M388-E3-Translation-Compose.md`, this file, `HANDOFF.md`, `RELEASES.md`. Repository integrity: unchanged otherwise — `core/engines/media/media-pipeline-manager.js` (registered as `MediaEngine`) still fails its pre-existing dynamic import — missing `background-engine.js` (`MD-004`/`MD-009`, decode-half resolved via Engine 1, unaffected here).
**Current Phase:** Phase 3 (Implementation) complete and Closed for Engines 1–3. **Engine 4 (Speaker Diarization Engine) is unlocked (Rule 68), Phase 0 not started.**

**Engine 3 (Living Translation Engine / Translation Pipeline) — Phase 2
this pass.** Independent re-verification of every load-bearing Compose
claim against actual source (`cozy-translate.js`, `speech-translation-
adapter.js`/`-provider.js`, `modules/live/cozy-live.js`) confirmed the
Compose Report accurate in full, including exact line/version/count
details (1,054-line `cozy-translate.js`, 8 `registerSubsystem('CozyTranslate'`
test-mock call sites, zero production registrants for `'CozyTranslate'`/
`'CozySpeech'`). **Verdict: Approved (Revised)** — architecture, ownership,
and 7 of 8 Implementation Contract items stand unrevised; the one open
question the Compose Report itself deferred to this Review (`MD-018`'s
resolution path) is now decided: fixing it requires editing
`relaySpeechSegment()`'s hardcoded `session.primaryLanguage` argument
directly, which the Contract's own item 2 forbids — no exception granted,
`MD-018` remains open/unassigned, carried forward exactly like `MD-016`.
`MD-017` re-confirmed current and unresolved (Engine 3's own upcoming
Implementation is expected to resolve its `'CozyTranslate'` half only).
No new finding opened this Review. Full report:
`docs/history/M388-E3-Translation-Compose.md`.

**Final Implementation Contract (8 items, confirmed this Review):** new
file only at `core/engines/media/translation/translation-pipeline-engine.js`
(path confirmed free); `cozy-live.js`/`cozy-translate.js`/`speech-
translation-adapter.js`/`speech-translation-provider.js` all remain
untouched, no exception granted; attaches only via
`registerSubsystem('CozyTranslate', adapter)`; adapter's `translate()`
must return `{ text: string }`; preserves the existing chain's "NEVER
FABRICATE" convention; does not resolve `MD-007`, `MD-016`, the
`'CozySpeech'` half of `MD-017`, or `MD-018` (all explicitly out of
scope/carried forward). **Next: Engine 3 Phase 3 (Implementation)** — not
started this pass, per explicit instruction.

**Engine 3 Phase 0 + 1 (Compose), prior pass, unchanged this pass.**
Confirmed a real, substantial, already-built translation chain
(`cozy-translate.js` + `speech-translation-adapter.js` +
`speech-translation-provider.js`) with an existing "NEVER FABRICATE"
honesty convention — Engine 3's scope is composition, not a
from-scratch build, per the Approved Implementation Order
(`docs/history/M388.md`) and `AA-005`'s prior closure (no separate
"Living Meaning Engine"). `MD-017` (High) and `MD-018` (Medium) first
logged this Compose — see above for their status as of this Review.

**Rule 71 (Mandatory Phase Packaging) adopted, this pass.** —
`docs/builder/rules/16-mandatory-phase-packaging-rule.md`, extending
Rule 67/68. A completed phase and an undelivered ZIP must never coexist
as a stopping point: finishing docs, verifying integrity, computing both
hashes, building the ZIP, verifying it, and printing the Rule 67
Delivery block are now mandatory, automatic continuations of finishing
any phase — never a separately-approved next step, and never left
pending on a "continue?" turn. If remaining context looks insufficient
to finish a phase plus its packaging, the Builder must not start that
phase; it must package the last completed phase and end the session
instead.

**Rule 70 (Hash Recording Rule) adopted, prior pass (unchanged).** —
`docs/builder/rules/15-hash-recording-rule.md`, extending Rule 60/67.
Codifies the fix for a real self-inflicted bug found during the prior
pass (M388 Round 13): a computed Repository SHA-256 value was written
directly into `LATEST.md`/`HANDOFF.md` before those files' own content
was final, and since both files are themselves inputs to the repository
hash, the embedded value went stale the instant the file was saved.
Rule 70 requires: (1) Repository SHA-256 is recorded only in
`RELEASES.md` (already excluded from the hash per Rule 60) and the Rule
67 Delivery block; (2) Package SHA-256 is recorded only in the Delivery
block, never in any repository file, since the ZIP contains
`RELEASES.md` itself; (3) all other hashed files must be finalized
*before* the hash is computed, not after; (4) any hash found written
into a file before that sequencing was followed must be treated as
invalid and recomputed. `docs/builder/rules/00-INDEX.md` updated same
pass per Rule 66.

**Repository SHA-256 discrepancy — RESOLVED prior pass (root cause found, `DI-005`).** The Round 10→11→12 mismatches were not tampering — they were a real bug in the documented hashing command itself: three files in this repository have names containing spaces (`modules/quarry/ quarry.html\`` — pre-existing, unrelated to M388; `core/bridge/test/media integration test.js`; `core/docs/CERTIFICATION REPORT md`), which the documented method (`find | sort | xargs sha256sum | sha256sum`) silently mis-splits when piped through plain `xargs`. The corrected method (`-print0`/`-z`/`-0`) reproduced Round 12's own recorded hash exactly, confirming Round 12 was correct all along.**Repository SHA-256 (this round) — see `RELEASES.md` for the authoritative computed value** (Rule 60 §2 convention: `LATEST.md`/`HANDOFF.md` are themselves included in the hash calculation, so stating a live value here would go stale the instant this file is saved — the same reason `RELEASES.md` is excluded from the hash method and is the one place the value is recorded). The corrected canonical **method** (safe to state here, since it isn't self-referential) is: `find . -type f ! -path './_archive/*' ! -name 'RELEASES.md' -print0 | sort -z | xargs -0 sha256sum | sha256sum`.

**Engine 1 (Media Decode Engine) — Phase 0–9 all ✅ Complete.** Full report: `docs/history/M388-E1-MediaDecode-Compose.md` (Phase 3/4 sections appended this pass). Implemented at `core/engines/media/decode/media-decode-engine.js` + `provider-inmemory.js` (new file, per `AA-006` — not `codec-decoding-engine.js`). Registered via one added entry in `engine-bridge-bootstrap.js`'s `REGISTRATIONS` array; attaches to `cozy-media.js`'s existing `Adapters`/`Pipelines` registries via `attachToCoordinator()` — `media-pipeline-manager.js`/`cozy-media.js` themselves untouched. **Honest, not fabricated:** real magic-byte container detection (mp4/webm/wav/ogg/flac/mp3); `isReal:false` structural envelope for tracks; `getCapabilities().realDecode === false`, `codecs: []` — no unearned claims. **23/23 real tests pass.** Regression check against `media-pipeline-manager.test.js` fails at the same pre-existing line as before (no new regression). `MD-009` updated to 🔵 Implementing (decode half done; Engine 9/encode half still open). `MD-016` (STT bridge) deliberately untouched, remains open — not this engine's scope.

**New this pass — Rule 69 adopted:** Repository Authority
(`docs/builder/rules/14-repository-authority-rule.md`), extending Rule 66.
If chat history, screenshots, or prior Builder claims conflict with the
repository's own contents, the repository is authoritative by default —
record the discrepancy, explain it, continue from the repository's
recorded phase. Newer-ZIP Exception: stop and request the newer ZIP if
the repository is proven to be the stale artifact (SHA-256/version
mismatch). First triggered in practice this session (an external summary
claimed Engine 1 was already Implemented/Verified with a `MD-017` that
did not exist — the repository's own account was followed instead).
`docs/builder/rules/00-INDEX.md` updated same pass per Rule 66.

**Prior pass — Rule 68 adopted:** Per-Engine Lifecycle Gate
(`docs/builder/rules/13-per-engine-lifecycle-rule.md`), extending Rule 65.
Makes the next-engine-blocked-until-current-engine-Phase-9 relationship a
binding rule, the same enforcement relationship Rule 64 has to Rule 63 at
milestone scope.

## M388 Phase 2 Review — Outcome: Approved (Revised)

Reviewed the Compose Report against architecture soundness, `AA-005`,
ownership map, duplicate-engine risk, performance targets, security/
privacy, `MD-007`–`MD-015`, and the Repair Queue. Found one real
completeness gap: the originally-proposed 8-engine order had no step that
extracts audio from a video file — every downstream stage had no real
input without it. **Revised** the implementation order to 11 engines
(inserted Media Decode, Diarization, Background Separation, Media Encode;
repositioned others) rather than reject the report outright — the
architecture direction and ownership findings were sound, only the
sequencing was incomplete.

**`AA-005` closed**, documented decision: "Living Meaning Engine" is
merged into "Living Translation Engine" — no separate engine — because (a)
`cozy-translate.js`'s own boundary reserves no slot for a semantic layer,
(b) no repository evidence supports one, (c) the ~0.5s latency target
makes a separate heavyweight hop a real risk with no offsetting need.

**Explicit scope correction:** `MD-007` (bundled translation) and `MD-008`
(voice cloning) are not just deferred — the original task's own Out of
Scope list ("Licensing of translation/voice models") **structurally
excludes** them from M388 entirely. The approved contract does not promise
either.

Full Phase 2 Review, Approved Implementation Order (11 engines), and
per-engine Rule 65 lifecycle requirement: `docs/history/M388.md`.

## M388 Compose — Summary (Phase 1, unchanged)

Real capability confirmed to already exist: speech-to-text (browser
`SpeechRecognition`, real), translation orchestration (`cozy-translate.js`,
real), live captions/text-translation for meetings (`ldce-caption-engine.js`,
real, working today), generic TTS (Web Speech API, real), room/channel/
stream coordination scaffolding (`cozy-live.js`, real, structural).

Real, confirmed gaps (none are defects — capabilities never built): no
bundled machine translation (`MD-007`), no voice cloning/neural TTS
(`MD-008`), no video/audio codec decode/encode (`MD-009`, same root as
`MD-004`), no background-audio separation (`MD-010`), no speaker
diarization (`MD-011`), no language auto-detection (`MD-012`), no
streaming/low-latency pipeline (`MD-013`), no subtitle export (`MD-014`),
no lip-sync (`MD-015`, explicitly Out of Scope this Compose). One
architecture ambiguity: "Living Meaning Engine" has no defined real scope
(`AA-005`).

**9 new `MD` entries + 1 new `AA` entry logged to the Repair Queue this
Compose, per Rule 62 — the moment a finding is composed.** None are High-
priority *defects* (nothing is broken); `MD-007`/`MD-008`/`MD-009`/`MD-013`
are High priority as *build candidates* per the Compose report's own gap
analysis, since they block the widest set of M388's in-scope use cases.

Full report, including the ownership map, duplicate-engine scan, and
stage-by-stage reconciliation of the task's proposed architecture against
what's real: `docs/history/M388.md`.

## Engine 2 (Language Detection) — Phase 0–9 this pass — Closed

**Phase 0–2 (Repository Verification, Compose, Review/Approval) — carried
forward, unchanged from prior passes.** Full report:
`docs/history/M388-E2-LanguageDetection-Compose.md`.

Confirmed `MD-012` (no automatic language-detection capability) with two
independent repository sources; confirmed a real, already-live,
already-tested composition point — `cozy-live.js`'s reserved
`CozyLanguage` subsystem slot in `relaySpeechSegment()`. No
duplicate-ownership conflict among the three other `CozyLanguage*`-named
modules. No hard dependency on Engine 1's decode output format. `MD-016`
confirmed adjacent but non-blocking. `DI-004` logged, not fixed (unrelated
pre-existing issue). Phase 2 Verdict: **Approved (not Revised)** — the
6-item Implementation Contract stood unrevised into Implementation.

**Phase 3 (Implementation) — complete this pass.** New files only:
`core/engines/media/language/language-detection-engine.js` and
`provider-lexical.js` (companion reference provider, same split as
Engine 1). One `REGISTRATIONS` entry added to
`core/bridge/engine-bridge-bootstrap.js` (`language-detection`) — no
other line of that file, and no line of `cozy-live.js`/`cozy-speech.js`/
`cozy-translate.js`/`core/modules/language/language-engine.js`, changed
(confirmed by full-repository `diff -rq` against the pre-Implementation
checkout). Attaches to `cozy-live.js` **only** via its own existing
`registerSubsystem('CozyLanguage', adapter)` API — `attachToLive()` never
edits `cozy-live.js` itself. **Honest, not fabricated:** real
deterministic Unicode-script classification (Ethiopic block → `am`); a
real, deliberately-partial curated lexical-overlap heuristic
(`en`/`fr`/`sw`/`so`/`ha`/`yo`/`zu`/`lg` only — every other candidate
code is left honestly uncovered, not guessed at) used only when text is
actually available for a segment (explicit `hintText` or a duck-typed
property on the opaque `audioRef`); an honest `isReal:false`,
`method:'no-analyzable-signal'` empty envelope otherwise — no fabricated
guess from unanalyzable opaque audio. Confidence capped (0.65 heuristic /
0.9 script match) — never claims unearned certainty.

**Phase 4 (Verification) — complete this pass.** `node --check` clean on
every new/modified file. **31/31 real, executed tests pass**
(`core/engines/media/language/tests/language-detection-engine.test.js`).
Regression: Engine 1's own suite still 23/23 unchanged; the pre-existing
`media-pipeline-manager.test.js` failure is byte-identical to before
(same missing `background-engine.js` line, `MD-004`/`MD-009`) — no new
regression.

**Phase 5 (Registry Updates) — complete this pass.** `MD-012` status
updated 🟡 Composed → 🔵 Implementing (`docs/builder/knowledge/repair-queue.md`),
matching `MD-009`/Engine 1's own precedent. `MD-016`/`DI-004` unchanged,
still correctly out of scope. **New this pass, unrelated to Engine 2's
own build:** `DI-005` — the documented repository-hashing method
silently mis-splits three filenames containing spaces, the real root
cause of the Round 10/11/12 SHA-256 discrepancy; **Resolved**, canonical
`-print0`/`-z`/`-0` method adopted (§ top of this file). Full detail:
`docs/builder/knowledge/documentation-integrity-registry.md`.

**Phase 6–9 (Reports, Handoff, Package, Close) — complete this pass.**
Full Phase 3/4 report appended to
`docs/history/M388-E2-LanguageDetection-Compose.md`. This file,
`HANDOFF.md`, and `RELEASES.md` updated same pass. Full repository ZIP
produced and verified this pass (Rule 67/68, delivery block below/in
chat). **Engine 2 is Closed.**

**Next:** Per Rule 68, Engine 3 (Translation Pipeline, absorbs "Living
Meaning Engine" per `AA-005`) is now unlocked. **Not started this
pass** — its own Phase 0 (Repository Verification) is the correct next
step for a future session, not a continuation of this one.

## M388 Prior Step — Engine 1 (unchanged this pass)

Per Rule 65, M388 is at **Phase 3 In Progress (per-engine) → Engine 2
Closed, Engine 3 Unlocked**. Full Builder Lifecycle Status block:
`docs/history/M388.md`.

**Engine 1 (Media Decode Engine) — Phase 0–9 all Complete**, closed. See
`docs/history/M388-E1-MediaDecode-Compose.md`.

## M387.5 — Completed (prior milestone, unchanged this pass)

Finding-state legend (Rule 61): 🟡 Composed · 🟠 Planned · 🔵 Implementing · 🟢 Fixed · 🔴 Failed Verification · ⚪ Deferred. Per Rule 62, every finding has a Repair Queue entry (`docs/builder/knowledge/repair-queue.md`).

## Milestone Completion Gate (Rule 63) — final re-evaluation
- [x] All planned implementations are finished.
- [x] All syntax verification passes. (`node --check` clean on every touched file this milestone.)
- [x] **Browser/device verification passes.** Page-load (6+ rounds), interactive auth-flow (registration, login, logout, remember-me on/off, OTP, recovery codes, session-restore-after-OTP, trusted-device-scope-confirmation), and mobile emulation (Chromium Pixel 7 — touch, orientation, reload, IndexedDB) all pass, 0 unexplained console errors.
- [x] Regression verification passes. Full 3-page harness re-run after every fix; final pass identical to baseline (1 environment-limited error, 5 documented missing-dependency requests).
- [x] Integration verification passes. Living Engine chain (`LivingSecurityCoordinator`→`LivingDecisionEngine`) confirmed intact, no duplicates, 279 globals, throughout.
- [x] Repair Queue contains no High-priority Composed item created by this milestone. (`AA-004`, `RP-014`, `RP-015` all closed. `MD-004`/`MD-005` Medium, deliberately Deferred.)
- [x] `RELEASES.md` updated.
- [x] `LATEST.md` updated.
- [x] `HANDOFF.md` updated.
- [x] Repository and package hashes generated.

**Result: 10 of 10 conditions met. Milestone Status: Completed.**

## No Milestone Jumping (Rule 64) — final re-evaluation
Both blocking conditions are now resolved: no High-priority Repair Queue
item, and Milestone Status is Completed. **M388 is unblocked and may
begin, starting with Compose.**

```
M387.5
   ↓
Close AA-004  ✅
   ↓
RP-014 found → Fixed ✅
   ↓
Resume interactive verification ✅
   ↓
RP-015 found → Fixed ✅
   ↓
Mobile verification ✅
   ↓
Final regression ✅
   ↓
Rule 63 passes ✅
   ↓
M387.5 = Completed ✅
   ↓
Start M388 (Compose)
```

## Certification
- Repository Verified: YES
- Compose Verified: YES
- Implementation Verified: **YES**
- Verification Verified: **YES**
- Handoff Verified: YES
- Artifact SHA-256 Verified: YES
- Ready for Next Account: **YES** — begin M388 Compose.

## What This Milestone Did (summary)

Real-browser (Chromium via Playwright, not Node/vm) verification of the
M372–M387 Living Engine chain, across page-load, interactive auth-flow,
mobile-emulation, and regression testing.

**🟢 Fixed (11 findings, full Compose→Plan→Implement→Verify→Close chains):**
1. `developer-hub.css` doubled `core/` import paths.
2. `SESSION_STATE` global collision (`cozy-speech.js`/`cozy-vision.js`).
3. `pluginManager.js` `SEMVER_RE` rejecting real semver pre-release versions.
4. `CozyPaymentProviderEngine` missing dependency scripts.
5. `core/dashboard.js` ES import as classic script (+ `permissions.js` dead code).
6. `PluginManager.register()` handler-type mismatch, 23 call sites.
7. `index.html` missing theme-token stylesheet.
8. `EngineBridge` Node-only `playback-engine.js` browser registration.
9. `AA-004` — `window.CozyOS.AudioEngine` naming collision (`cozy-audio-engine.js` vs. bridge's `audio-manager.js`).
10. `RP-014` — premature `restoreSession()` auto-trigger wiped valid Remember Me pointers on every reload.
11. `RP-015` — `restoreSession()`'s trusted-pointer fallback always re-persisted with `rememberMe=true`, silently upgrading Remember-Me-OFF sessions.

**⚪ Deferred (2, deliberate, documented, non-blocking):**
- `MD-004` — 3 missing media engine files (feature-scale work).
- `MD-005` — `provider-browser.js` missing (feature-scale work; Camera has the identical gap).

**Environment-limited, not a defect:** Firebase CDN fetch fails in this sandbox (no outbound internet) — fails closed correctly.

## Package
**Repository SHA-256:** `5698e75944f6c1a687c46988845459d4732a54f432e3953267fe23264153abab`
(computed over all files except `RELEASES.md`)
**Package SHA-256:** see `RELEASES.md` (Rule 60 — authoritative location, never embedded in the package itself)

## Unmodified from M387 (still valid)
- `core/security/living-security-coordinator.js`: `a96aaeb1a743e0381e5fe1ca01df9d681d7e1a48932789578154980115258d3e`
- `core/security/living-risk-engine.js`: `0d71b17a70847157d7d2e3da35d82bd84d09b59b787ddb7afcf55a67673865ff`
- `core/security/living-trust-engine.js`: `10398fde61b70da14a42937d7ca9db9e69a9ed847449fd1ea0d4d297a9993699`
- `core/security/living-behavior-engine.js`: `d1b65d9eaa9a5cdb14f8c482c5a78093ef0e9f319f013ae9d3672c2123684096`
- `core/security/living-ai-context-engine.js`: `9aecaad67030a25858340400ec6d69f8c1b5e42453a0a85664bc2a462954da18`
- `core/security/living-device-intelligence-engine.js`: `10b450425613d4b3c71ef98cda0b1734185454e6fd85f1fffed9a0a22c516925`
- `core/security/living-decision-engine.js`: `7ee4eabbf5290484ade4dd335e2a52b694048a20624d923a01aa4027d7409772`
- `core/modules/identity/identity-storage.js`: `1fad3217ef114ebd2e089e4bab57b055466c14a946fde4e583804749365055e1`

## Next Task
**M388 — start with Compose.** Before that, the next Builder account MUST:
1. Upload the latest ZIP as baseline.
2. Read this file (`LATEST.md`).
3. Read `HANDOFF.md`.
4. Read `RELEASES.md`.
5. Read the Repair Queue (`docs/builder/knowledge/repair-queue.md`).
6. Verify the repository SHA-256 above against your own checkout.
7. Confirm M387.5 = Completed (this file, `HANDOFF.md`, `RELEASES.md` all agree).
8. Only then start M388 Compose.

Other outstanding, non-blocking items carried forward:
- `MD-004`, `MD-005` — Medium priority, deferred, may be picked up as their own dedicated compose pass at any time.
- Policy review: M387's "brand-new user → Restrict on first decision" behavior — still needs Charles's explicit sign-off.
- Wire a real caller to `LivingDecisionEngine.recordOutcome()` — still unreached.
- Pattern Engine (M377–M380 chain) — still blocked on RG evidence (0/6), unrelated to M387.5.

## Read Next
1. This file (done).
2. `/HANDOFF.md`.
3. `/RELEASES.md`.
4. `/docs/builder/knowledge/repair-queue.md`.
5. `/docs/history/M387.5.md` — full verification detail, all 9 rounds.
6. `/docs/builder/rules/00-INDEX.md` — master governance rules index.
7. `/docs/history/M388-E1-MediaDecode-Compose.md` — Engine 1 (Media Decode Engine), Phase 0–9 Complete.
8. `/docs/history/M388-E2-LanguageDetection-Compose.md` — Engine 2 (Language Detection) Phase 0–9 Complete, Closed.
9. `/docs/history/M388-E3-Translation-Compose.md` — Engine 3 (Living Translation Engine / Translation Pipeline) Phase 0–2 Complete this pass (Phase 2: Approved, Revised). Phase 3 (Implementation) is the next real work — not started.
10. `/docs/builder/rules/15-hash-recording-rule.md` — Rule 70, adopted prior pass.
11. `/docs/builder/rules/16-mandatory-phase-packaging-rule.md` — Rule 71, adopted this pass.
12. `/docs/builder/rules/17-roadmap-header-rule.md` — Rule 72, adopted this pass (this file's own header, above).

---

## THIS PASS — Rule 75 Adopted + Engine 3 Closed (supersedes the "Next Task"/"Read Next" lists above, which describe an earlier pass)

**Rule 75 — Milestone Waiting Queue: ADOPTED.** See
`docs/builder/rules/20-milestone-waiting-queue-rule.md` (Rule 75) and the
new permanent file `docs/builder/knowledge/milestone-waiting-queue.md`,
which now answers "which milestone is active/paused/waiting/closed,"
"which engine is running/next," "how many engines remain," and "which
ZIP is safe" from one file.

**Engine 3 (Living Translation Engine / Translation Pipeline): Phase 3
(Implementation) through Phase 9 (Close) all completed this pass.** Full
detail: `docs/history/M388-E3-Translation-Compose.md`, "Phase 3 —
Implementation" section onward. Summary:
- New file `core/engines/media/translation/translation-pipeline-engine.js`
  composes the existing `cozy-translate.js` +
  `speech-translation-adapter.js`/`-provider.js` chain into
  `cozy-live.js`'s reserved `'CozyTranslate'` subsystem slot, via
  `registerSubsystem()` only — the four contract-protected files remain
  untouched.
- `core/bridge/engine-bridge-bootstrap.js` gained one new
  `REGISTRATIONS` entry (`translation-pipeline`), same precedent as
  Engine 1/2.
- 12/12 real, executed tests pass
  (`core/engines/media/translation/tests/translation-pipeline-engine.test.js`);
  Engine 1 (23/23) and Engine 2 (31/31) regression re-run clean.
- `MD-017`'s `'CozyTranslate'` half: 🟡 Composed → 🟢 Fixed. `'CozySpeech'`
  half, `MD-007`, `MD-016`, `MD-018` all remain open/out-of-scope,
  unchanged, per the Final Implementation Contract.
- **Engine 4 (Speaker Diarization Engine) is now unlocked (Rule 68),
  Phase 0 not started.**

## Next Builder MUST (supersedes the numbered list above)

1. Upload the latest ZIP as baseline; verify Repository SHA-256 against
   `RELEASES.md` (never against a value embedded in `LATEST.md`/
   `HANDOFF.md` themselves, per Rule 70).
2. Read this file, `HANDOFF.md`, `RELEASES.md`,
   `docs/builder/knowledge/repair-queue.md`, and — per Rule 75 — the new
   `docs/builder/knowledge/milestone-waiting-queue.md` for a fast index
   of milestone/engine state.
3. Read `docs/history/M388-E3-Translation-Compose.md` in full — Engine 3
   is Closed; do not reopen it.
4. Confirm Engine 1/2/3 all Closed (this file, `HANDOFF.md`,
   `RELEASES.md`, and the Waiting Queue must all agree — they do).
5. Begin **Engine 4 (Speaker Diarization Engine) Phase 0** (Repository
   Verification) — do not skip to Implementation, do not start any
   engine past 4, per Rule 68.

---

## THIS PASS — Engine 4 Phase 0–1 Complete (supersedes the "Next Builder MUST" list above)

**Engine 4 (Speaker Diarization Engine) — Phase 0 (Repository
Verification) and Phase 1 (Compose) both complete this pass.** Full
report: `docs/history/M388-E4-Diarization-Compose.md`.

Summary: confirmed genuine ownership gap (no automatic diarization
anywhere in the repository — `MD-011` re-confirmed); mapped the
dependency graph (Engine 1 upstream, Engines 5/7/8 downstream, and
Engine 1's own `isReal:false` audio-track envelope as a load-bearing
constraint on what Engine 4 can honestly claim); ran a duplicate-engine
scan (clean); found a new integration-point gap (`MD-019` — no optional
`hasSubsystem('CozyDiarization')`-style hook in `relaySpeechSegment()`,
resolution path deferred to Phase 2 Review); fixed two documentation
inconsistencies found during Phase 0 (`DI-006` milestone-name mismatch
in the Waiting Queue, `DI-007` stale `HANDOFF.md` header block); and
recorded a draft, not-yet-approved 6-item Implementation Contract.

**Next Builder MUST:**
1. Upload the latest ZIP as baseline; verify Repository SHA-256 against
   `RELEASES.md` only (Rule 70).
2. Read this file, `HANDOFF.md`, `RELEASES.md`,
   `docs/builder/knowledge/repair-queue.md`, and
   `docs/builder/knowledge/milestone-waiting-queue.md`.
3. Read `docs/history/M388-E4-Diarization-Compose.md` in full.
4. Confirm Engine 1–3 Closed, Engine 4 at Phase 1 Complete, across all
   four files — they agree.
5. Begin Engine 4 **Phase 2 (Review/Approval)** — independently
   re-verify this Compose Report against actual source, decide
   `MD-019`'s resolution path, approve or revise the draft Implementation
   Contract. Do not start Phase 3 before that. Do not start Engine 5.

---

## THIS PASS — Engine 4 Phase 2 Complete, Approved (Revised) (supersedes the "Next Builder MUST" list above)

**Engine 4 (Speaker Diarization Engine) — Phase 2 (Review/Approval)
complete this pass.** Full report: `docs/history/M388-E4-Diarization-Compose.md`
(Phase 2 section). Independent re-verification reproduced every Phase 1
claim against fresh source reads (ownership audit, dependency graph,
duplicate-engine scan all confirmed unrevised).

**`MD-019` decided this pass:** no exception granted to add a new
`CozyDiarization` hook to `cozy-live.js`'s `relaySpeechSegment()` —
unlike `CozyLanguage`/`CozyKnowledge`, which were pre-existing hooks
Engines 2/3 only filled, a diarization hook would be a new addition to a
locked file, and Engine 1's own `isReal:false` audio envelope means
there's no real signal to feed it yet regardless. Engine 4's
Implementation Contract is **revised to fully external**: writes only
into `cozy-speech.js`'s existing `_speakers` registry, touches no locked
file. `MD-019` remains open/unassigned (same treatment as `MD-016`).

**Final Implementation Contract (6 items):** new file only
(`core/engines/media/diarization/speaker-diarization-engine.js`, path
reconfirmed free); no locked file touched (revised from Phase 1's
conditional item 2); attaches via `cozy-speech.js`'s existing
`registerSpeaker()`/`addActiveSpeaker()`; one new
`REGISTRATIONS` entry; honest `isReal:false`/`confidence:null` until
real decoded audio + a real backend both exist; does not resolve
`MD-016`/`MD-013`/`MD-010`.

**Next Builder MUST:**
1. Upload the latest ZIP as baseline; verify Repository SHA-256 against
   `RELEASES.md` only (Rule 70).
2. Read this file, `HANDOFF.md`, `RELEASES.md`,
   `docs/builder/knowledge/repair-queue.md`, and
   `docs/builder/knowledge/milestone-waiting-queue.md`.
3. Read `docs/history/M388-E4-Diarization-Compose.md` in full — Phase 2
   is Approved (Revised); the Final Implementation Contract (6 items,
   revised item 2) is what Phase 3 must build against, not the Phase 1
   draft.
4. Confirm Engine 1–3 Closed, Engine 4 at Phase 2 Complete, across all
   four files — they agree.
5. Begin Engine 4 **Phase 3 (Implementation)** — build the new file per
   the Final Contract exactly as written. Do not touch `cozy-live.js`,
   `cozy-speech.js` itself, `cozy-media.js`, or `media-pipeline-manager.js`
   (only call their existing public APIs). Do not start Engine 5.

---

## THIS PASS — Engine 4 (Speaker Diarization) Phase 3–9 Complete, CLOSED (supersedes the "Next Builder MUST" list above)

**Engine 4 (Speaker Diarization Engine) — Phase 3 (Implementation)
through Phase 9 (Close) all completed this pass.** Full report:
`docs/history/M388-E4-Diarization-Compose.md` (Phase 3 onward). Summary:
- New files only: `core/engines/media/diarization/speaker-diarization-engine.js`
  + `provider-speaker-hint.js` (reference provider, real deterministic
  contiguous speaker-hint turn-grouping) + a 23-test suite. Confirmed by
  direct `diff -rq` against this session's own pristine baseline: no
  locked file (`cozy-live.js`/`cozy-speech.js`/`cozy-media.js`/
  `media-pipeline-manager.js`) changed at all — Final Contract item 2
  held exactly, no exception taken.
- `core/bridge/engine-bridge-bootstrap.js` gained one new
  `REGISTRATIONS` entry (`speaker-diarization`) — no other line changed.
- Writes only into `cozy-speech.js`'s existing `_speakers` registry via
  its already-public `registerSpeaker()`/`addActiveSpeaker()` methods
  (`applyToSpeechRegistry()`) — `cozy-live.js` untouched, `MD-019`
  unaffected, remains open/unassigned.
- **23/23 real, executed tests pass**
  (`core/engines/media/diarization/tests/speaker-diarization-engine.test.js`);
  Engine 1 (23/23), Engine 2 (31/31), and Engine 3 (12/12) regression
  re-run clean; the one pre-existing, unrelated `media-pipeline-manager.test.js`
  failure reproduced identically (`MD-004`/`MD-009`, not new).
- `MD-011`: 🟡 Composed → 🔵 Implementing. `MD-019`, `MD-016`, `MD-013`,
  `MD-010` all remain open/out-of-scope, unchanged, per the Final
  Implementation Contract.
- **No browser/DOM runtime available in this environment** — verification
  this pass is real Node execution only (`node --check`, real test runs),
  honestly disclosed per Rule 116/117, same category of gap already
  carried by Engine 3's own Phase 4.
- **Engine 5 (Background Audio Separation Engine) is now unlocked (Rule
  68), Phase 0 not started.**

## Next Builder MUST (supersedes the numbered list above)

1. Upload the latest ZIP (`CozyOS-main-v3_02_10-M388-E7-Compose.zip`) as
   baseline; verify Repository SHA-256 against `RELEASES.md` only (Rule
   70).
2. Read this file, `HANDOFF.md`, `RELEASES.md`,
   `docs/builder/knowledge/repair-queue.md`, and
   `docs/builder/knowledge/milestone-waiting-queue.md`.
3. Read `docs/history/M388-E4-Diarization-Compose.md` in full — Engine 4
   is Closed; do not reopen it.
4. Confirm Engine 1–4 all Closed (this file, `HANDOFF.md`, `RELEASES.md`,
   and the Waiting Queue must all agree — they do).
5. Begin **Engine 5 (Background Audio Separation Engine) Phase 0**
   (Repository Verification) — do not skip to Implementation, do not
   start any engine past 5, per Rule 68.

---

## THIS PASS — Engine 5 (Background Audio Separation) Phase 0–9 Complete, CLOSED (supersedes the "Next Builder MUST" list above)

**Engine 5 (Background Audio Separation Engine) — Phase 0 through Phase
9 all completed this pass.** Full report:
`docs/history/M388-E5-BackgroundAudioSeparation-Compose.md`. Summary:
- Ownership audit found a real naming-collision risk (`AA-007`):
  `media-pipeline-manager.js` already imports an unbuilt, VISUAL
  `background-engine.js` (one of `MD-004`'s missing files). Engine 5 was
  deliberately built at a distinct path —
  `core/engines/media/audio-separation/background-audio-separation-engine.js`
  + `provider-turn-coverage.js` — resolving `AA-007` by construction.
- Consumes Engine 4's own `diarize()` output as a plain argument (no new
  coupling); no locked file touched (`cozy-live.js`/`cozy-speech.js`/
  `cozy-media.js`/`media-pipeline-manager.js`/`audio-manager.js`/
  `cozy-hearing.js` all confirmed byte-identical to the Engine-4-closed
  baseline via direct `diff -rq`).
- Real, deterministic partition: a segment is `speech` only if a real
  Engine 4 diarization turn covers it; otherwise `unclassified` — never
  `background`, since no positive signal supports that stronger
  inference. Honest `isReal:false`/`method:'no-analyzable-signal'` empty
  envelope with no diarization data at all.
- **18/18 real, executed tests pass**, including a real end-to-end
  composition test against Engine 4's actual `diarize()` output (no
  mocking); all passed on first run. Engines 1–4 regression re-run
  clean (23/31/12/23); the one pre-existing `media-pipeline-manager.test.js`
  failure reproduced identically.
- Rules 77 (Phase Focus) and 78 (Large Engine Implementation) formally
  adopted into the repository this session (`docs/builder/rules/22-
  phase-focus-rule.md`, `23-large-engine-implementation-rule.md`,
  `00-INDEX.md`) — no prior repository record existed; per Rule 69 this
  is noted as a this-session adoption, not retroactively assumed.
- **No browser/DOM runtime available in this environment** — Node-level
  verification only, honestly disclosed per Rule 116/117.
- **Engine 6 (Subtitle Timeline Engine) is now unlocked (Rule 68),
  Phase 0 not started.**

## Next Builder MUST (supersedes the numbered list above)

1. Upload the latest ZIP (`CozyOS-main-v3_02_10-M388-E7-Compose.zip`) as
   baseline; verify Repository SHA-256 against `RELEASES.md` only (Rule
   70).
2. Read this file, `HANDOFF.md`, `RELEASES.md`,
   `docs/builder/knowledge/repair-queue.md`,
   `docs/builder/knowledge/milestone-waiting-queue.md`,
   `docs/builder/rules/00-INDEX.md` (Rules 77/78 now present).
3. Read `docs/history/M388-E5-BackgroundAudioSeparation-Compose.md` in
   full — Engine 5 is Closed; do not reopen it.
4. Confirm Engine 1–5 all Closed (this file, `HANDOFF.md`, `RELEASES.md`,
   and the Waiting Queue must all agree — they do).
5. Begin **Engine 6 (Subtitle Timeline Engine) Phase 0** (Repository
   Verification) per Rule 65/68/77 — do not skip to Implementation, do
   not start any engine past 6.

---

## THIS PASS — Engine 7 (Voice Generation Engine) CLOSED (supersedes the "Next Builder MUST" list above, which describes an earlier pass)

Per Rule 69, this session resumed strictly from the repository's own
state: Repository SHA-256 recomputed with the canonical method matched
`RELEASES.md`'s recorded value exactly
(`2543557b859096af71ec33bc3de96548dce8e07879cd89291503af379d0143bc`) —
no discrepancy with this session's prompt.

**Engine 7 (Voice Generation Engine) — Phase 4 (Verification) through
Phase 9 (Close) all completed this pass.** Full detail:
`docs/history/M388-E7-VoiceGeneration-Compose.md` ("Phase 4" section
onward). Summary:
- `node --check` clean on every file under `core/engines/` and
  `core/modules/speech/`.
- **13/13 real, executed tests pass**
  (`core/modules/speech/generation/tests/voice-generation-engine.test.js`).
- **129/129 prior-engine tests re-run this pass, byte-identical to their
  own last-recorded counts** — Engine 1 (23/23), Engine 2 (31/31), Engine
  3 (12/12), Engine 4 (23/23), Engine 5 (18/18), Engine 6 (22/22).
  **142/142 total this pass, zero regressions.**
- Ownership re-confirmed: `cozy-speech.js`, `voice-manager.js`,
  `cozy-tts-browser-adapter.js` all unchanged; `engine-bridge-bootstrap.js`
  carries exactly one additive `voice-generation` entry.
- No genuine implementation defect found — Phase 3 was not reopened.
- `MD-020` updated in the Repair Queue: Engine 7's own scope
  (orchestration only) is complete/Closed; the underlying buffer-capture
  question remains correctly open/High, still blocking Engine 9.

**Engine 8 (Synchronization Engine) is now unlocked (Rule 68), Phase 0
not started.**

## Next Builder MUST (this pass, final — supersedes all prior lists)

1. Upload the latest ZIP as baseline; verify Repository SHA-256 only
   against `RELEASES.md` (Rule 70).
2. Read this file (this section), `HANDOFF.md` (this pass's section),
   `RELEASES.md`, `docs/builder/knowledge/repair-queue.md`, and
   `docs/builder/knowledge/milestone-waiting-queue.md`.
3. Read `docs/history/M388-E7-VoiceGeneration-Compose.md` in full —
   Engine 7 is Closed; do not reopen it.
4. Confirm Engine 1–7 all Closed across this file, `HANDOFF.md`,
   `RELEASES.md`, and the Waiting Queue — they agree.
5. Begin **Engine 8 (Synchronization Engine) Phase 0** (Repository
   Verification) per Rule 65/68/77 — do not skip to Implementation, do
   not start any engine past 8.

---

## THIS PASS — Engine 8 (Synchronization Engine) Phase 0 + Phase 1 (Compose) (supersedes the "Next Builder MUST" list above)

Per Rule 69, this session resumed strictly from the repository's own
state — ZIP integrity, Repository SHA-256, and Package SHA-256 all
reverified against `RELEASES.md`/the prior session's own Delivery block
before any work began; no discrepancy found.

**Engine 8 Phase 0 (Repository Verification) — complete this pass.**
Confirmed no pre-existing media timing-synchronization capability exists
anywhere in the repository. Four unrelated `*sync*`-named modules
checked directly and ruled out as collisions (`AA-008`, closed). Direct
read of Engines 1, 4, 6, and 7's actual return shapes confirmed: Engine 6
is the only engine producing real millisecond timing; Engine 7 produces
no duration/buffer at all (`realAudioBuffer:false`, confirmed in every
code path); Engine 1's decode remains structural-only.

**Engine 8 Phase 1 (Compose) — complete this pass.** Full report:
`docs/history/M388-E8-Synchronization-Compose.md`. New finding **`MD-021`**
logged: no engine in the Approved 11-engine order produces a real audio
duration or buffer, so no component can compute a real numeric timing
offset/drift — an environment-level constraint, not an Engine 6/7 defect.
Engine 8's honest composed scope, given that constraint: a real,
deterministic timing-vs-playback **cross-check/classification**
(`aligned` / `timing-without-playback` / `playback-without-timing` /
`unresolved`) joining Engine 6's cue timeline against Engine 7's playback
results by `segmentId` — never a fabricated drift value.
`getCapabilities().realDriftMeasurement` must honestly report `false`.
Draft Implementation Contract (6 items) recorded in the Compose report.

**No application code written this pass** — Phase 0/1 only, per Rule
65/77. **Next: Engine 8 Phase 2 (Review/Approval)** — a future session's
own work.

## Next Builder MUST (supersedes the numbered list above)

1. Upload the latest ZIP as baseline; verify Repository SHA-256 only
   against `RELEASES.md` (Rule 70).
2. Read this file (this section), `HANDOFF.md` (this pass's section),
   `RELEASES.md`, `docs/builder/knowledge/repair-queue.md` (new `MD-021`/
   `AA-008`), and `docs/builder/knowledge/milestone-waiting-queue.md`.
3. Read `docs/history/M388-E8-Synchronization-Compose.md` in full —
   Phase 0/1 complete; Phase 2 (Review/Approval) is the next required
   step, not Implementation.
4. Confirm Engine 1–7 all Closed, Engine 8 at Phase 1 Complete, across
   this file, `HANDOFF.md`, `RELEASES.md`, and the Waiting Queue — they
   agree.
5. Perform **Engine 8 Phase 2 (Review/Approval)** — independently
   re-verify this Compose Report's claims against actual source (same
   standard every prior engine's own Phase 2 applied), decide the
   Verdict (Approved / Approved-Revised / Rejected), and finalize the
   Implementation Contract. Do not begin Phase 3 (Implementation) in the
   same pass unless Phase 2 is itself Approved and packaged first, per
   Rule 71/79.

---

## THIS PASS — Engine 8 Phase 2 (Review/Approval) (supersedes the "Next Builder MUST" list above)

Per Rule 69, this session resumed strictly from the repository's own
state — ZIP integrity, Repository SHA-256, and Package SHA-256 all
reverified against `RELEASES.md`/the prior session's own Delivery block
before any work began; no discrepancy found.

**Engine 8 Phase 2 (Review/Approval) — complete this pass.** Full report:
`docs/history/M388-E8-Synchronization-Compose.md` (Phase 2 section
appended). Every Phase 0/1 claim independently re-checked against live
source — all confirmed accurate (Engine 6/7 output shapes, Engine 1
`isReal:false`, `MD-021`'s underlying constraint, target-path collision
check, `engine-bridge-bootstrap.js` registration pattern).

**One real gap found and corrected in place:** `AA-008`'s naming-
collision scan, re-run from scratch with its own stated search pattern
rather than just re-read, surfaced two real hits it had missed —
`modules/live/cozy-live.js`'s `syncTimestamp()`/`EVENT_SYNC` mechanism
and `core/network/cozy-network-orchestrator.js`'s `#stampMediaSync()`.
Both read directly and confirmed **not duplicates** (different data
model/purpose — session-level checkpoint broadcast and transport-layer
sequence stamping, respectively, neither reads Engine 6's or Engine 7's
output). `AA-008` revised in place to include both with the same
"checked, no collision" disposition as the original four. New,
informational-only finding **`MD-022`** logged separately (an unbuilt
"Scene Manager" referenced by an unrelated file — tangential, not
blocking Engine 8).

**Verdict: Approved**, with the `AA-008` revision applied this pass. No
change to the Draft Implementation Contract's substance — it is now
Final. **Phase 3 (Implementation) is unlocked for Engine 8** — not
started this pass, per this session's explicit Review-only scope. Do not
start Engine 9.

## Next Builder MUST (supersedes the numbered list above)

1. Upload the latest ZIP as baseline; verify Repository SHA-256 only
   against `RELEASES.md` (Rule 70).
2. Read this file (this section), `HANDOFF.md` (this pass's section),
   `RELEASES.md`, `docs/builder/knowledge/repair-queue.md` (revised
   `AA-008`, new `MD-022`), and
   `docs/builder/knowledge/milestone-waiting-queue.md`.
3. Read `docs/history/M388-E8-Synchronization-Compose.md` in full —
   Phase 0/1/2 all complete, Approved. Phase 3 (Implementation) is the
   next required step.
4. Confirm Engine 1–7 all Closed, Engine 8 at Phase 2 Approved, across
   this file, `HANDOFF.md`, `RELEASES.md`, and the Waiting Queue — they
   agree.
5. Begin **Engine 8 Phase 3 (Implementation)** per the (now Final)
   Implementation Contract. Do not start Engine 9. Do not modify
   `subtitle-timeline-engine.js` or `voice-generation-engine.js`.

## THIS PASS — Engine 8 Phase 3–9 (Implementation through Close) (supersedes the "Next Builder MUST" list above)

Per Rule 69/80, this session resumed strictly from the repository's own
state — ZIP integrity, Repository SHA-256
(`3bcd4fb4977a3e61dd32a30a3fe6b2dbe7c20ed1f46e42b763589f3d58f64dfa`), and
Package SHA-256 (`48775192df0c25a10818994b733f6c9ec58e99223eeaef7c847e53a1591daacc`)
all reverified against `RELEASES.md` before any work began; no
discrepancy found.

**Engine 8 Phase 3 (Implementation) — complete this pass.** New files
only: `core/engines/media/synchronization/synchronization-engine.js`,
`.../tests/synchronization-engine.test.js`,
`.../tests/synchronization-engine.integration.test.js`. One additive
`REGISTRATIONS` entry in `core/bridge/engine-bridge-bootstrap.js`
(`synchronization`) — confirmed the only line changed there. Core method
`crossCheckTiming()` — real, deterministic, `segmentId`-keyed
classification of Engine 6's cue timeline against Engine 7's playback
results (`aligned`/`timing-without-playback`/`playback-without-timing`/
`unresolved`). Never fabricates a drift value —
`getCapabilities().realDriftMeasurement` is honestly `false`, per
`MD-021`. `subtitle-timeline-engine.js`/`voice-generation-engine.js`
confirmed byte-identical to a pristine, freshly re-extracted checkout.

**Engine 8 Phase 4 (Verification) — complete this pass.** 21/21 new
unit tests pass; 3/3 new real end-to-end integration tests pass (fed
the actual live output of `SubtitleTimelineEngine.buildTimeline()` and
`VoiceGenerationEngine.generateSpeechForSegments()`, not fixtures); all
7 prior engines' suites re-run unmodified, 142/142 pass. **166/166
total this pass, zero regressions.** The one pre-existing failure
(`media-pipeline-manager.test.js`, `MD-004`/`MD-009`) confirmed
byte-identical to the pristine checkout — not a regression.

**Engine 8 Phase 5–9 — complete this pass.** `MD-021` updated to 🔵
Implementing in the Repair Queue. `docs/history/M388-E8-Synchronization-Compose.md`,
`HANDOFF.md`, `docs/builder/knowledge/milestone-waiting-queue.md`, and
`RELEASES.md` all updated. Full repository ZIP built and verified.

**Engine 8 (Synchronization Engine) is CLOSED.** Per Rule 68, Engine 9
(Media Encode Engine) is now unlocked — not started this pass.

## Next Builder MUST (supersedes the numbered list above)

1. Upload the latest ZIP as baseline; verify Repository SHA-256 only
   against `RELEASES.md` (Rule 70).
2. Read this file (this section), `HANDOFF.md` (this pass's section),
   `RELEASES.md`, `docs/builder/knowledge/repair-queue.md` (`MD-021`
   updated), and `docs/builder/knowledge/milestone-waiting-queue.md`.
3. Confirm Engine 1–8 all Closed across this file, `HANDOFF.md`,
   `RELEASES.md`, and the Waiting Queue — they agree.
4. Begin **Engine 9 (Media Encode Engine) Phase 0** (Repository
   Verification) fresh. Do not skip Phase 0/1/2 before Implementation.
   Do not modify any of Engines 1–8's own files.

## THIS PASS — Engine 9 (Media Encode Engine) Phase 0 + Phase 1 (Compose) (supersedes the "Next Builder MUST" list above)

Per Rule 69/80, this session resumed strictly from the repository's own
state — ZIP integrity, Repository SHA-256
(`8bb5b91936df1d55198165e2cb658edea1e85aa0626bb54a1eaeba36acac9305`) both
reverified against `RELEASES.md` before any work began; no discrepancy
found against the repository's own records.

**Rule 69 conflict found and resolved this pass.** The session prompt
described Engine 9 as a "Living AI Learning Engine." The repository's
real Approved Implementation Order (`docs/history/M388.md`), the
Milestone Waiting Queue, and `MD-009`/`MD-020`'s own Repair Queue text
all independently and unambiguously confirm Engine 9 is the **Media
Encode Engine** — no learning/memory/reasoning/observation engine exists
anywhere in this milestone's real roster. This Compose proceeded against
the real Engine 9. Full detail, including the conflict finding, in
`docs/history/M388-E9-MediaEncode-Compose.md`.

**Engine 9 Phase 0 (Repository Verification) — complete this pass.** ZIP
integrity, Repository SHA-256, and repository structure (810 files/516
JS) all confirmed. `LATEST.md`/`HANDOFF.md`/`RELEASES.md`/00-INDEX.md/
Repair Queue/Milestone Waiting Queue/`docs/history/M388.md` all read in
full.

**Engine 9 Phase 1 (Compose) — complete this pass.** Searched the entire
repository for existing AI/learning/memory/reasoning/observation/
knowledge/imagination/sensing/repair systems relevant to the prompt's
framing, and separately for Engine 9's real mission (media mux/encode):
confirmed Engine 1's `videoTrackRef` (structural, `realDecode: false`)
and Engine 7's speech generation (`realAudioBuffer: false`, `MD-020`,
unconditional in every code path) are Engine 9's two real upstream
inputs, and **neither carries real data today** — so Engine 9, like
Engine 1 before it, can only honestly compose a structural envelope this
milestone, not a real encode. `record-export-session-manager.js`
(pre-existing, Milestone 140) read in full and confirmed **not** a
duplicate — different data shape (frame-by-frame `videoFrames[]` +
buffer vs. container/track pair), different scope (already-captured
session export vs. downloaded-video re-mux), explicitly disclaimed
overlap in its own docstring. `codec-encoding-engine.js` reserved-path
boundary (`AA-006`) reconfirmed, not Engine 9's scope. No duplicate
"Media Encode Engine" or mux/demux/remux capability found anywhere.
`core/engines/media/encode/` confirmed free. No new Repair Queue entry
required — `MD-009`/`MD-020`/`MD-004` all re-confirmed current and
unchanged.

**Draft 7-item Implementation Contract** (future Phase 2 Review to
confirm or revise): new file only at
`core/engines/media/encode/media-encode-engine.js`; one additive
`REGISTRATIONS` entry (`media-encode` / `MediaEncodeEngine`); attaches
only via `cozy-media.js`'s existing `Adapters`/`Pipelines` registries,
same pattern as Engine 1; honest structural envelope only —
`realEncode` must stay `false`, no fabricated byte output; consumes
Engine 1/7/8's real outputs, does not re-implement them; does not
resolve `MD-004`; does not implement Engine 10/11.

**Full repository ZIP built and verified this pass — Phase 1 checkpoint
only, per this session's explicit stop point.**

## Next Builder MUST (supersedes the numbered list above)

1. Upload the latest ZIP as baseline; verify Repository SHA-256 only
   against `RELEASES.md` (Rule 70).
2. Read this file (this section), `HANDOFF.md` (this pass's section),
   `RELEASES.md`, `docs/builder/knowledge/repair-queue.md`, and
   `docs/builder/knowledge/milestone-waiting-queue.md`.
3. Read `docs/history/M388-E9-MediaEncode-Compose.md` in full, including
   its Rule 69 conflict finding at the top.
4. Begin **Engine 9 Phase 2 (Review/Approval)** — independently
   re-verify every load-bearing Compose claim against actual source
   (Rule 69), not restated. Do not begin Phase 3 (Implementation) before
   Phase 2 completes. Do not begin Engine 10 — it remains blocked behind
   Engine 9's own Phase 9 per Rule 68.

## THIS PASS — Engine 9 (Media Encode Engine) Phase 2 (Review/Approval) (supersedes the "Next Builder MUST" list above)

Per Rule 69/80, resumed strictly from the repository's own state —
Repository SHA-256
(`d5b94a8561994c2dc67d2316fd825563c478e6438ec93d853baa7c710da70716`)
reverified against `RELEASES.md` before any work began; confirmed exact.

**Independent re-verification performed against actual source (Rule
69), not restated from Phase 1's own account:** Engine 1's `videoTrackRef`
followed into `provider-inmemory.js`'s `_envelope()` — confirmed
`isReal: false` hardcoded on every call. Engine 7's `realAudioBuffer:
false` confirmed hardcoded, unconditional, in both
`generateSpeechForSegment()` and `generateSpeechForSegments()`.
Duplicate/mux/remux/demux scan re-run — clear, unchanged.
`record-export-session-manager.js` re-confirmed a different data model
(`videoFrames[]` + one buffer vs. Engine 9's track/container pair) — not
a duplicate. `core/engines/media/encode/` re-confirmed free.
`engine-bridge-bootstrap.js`'s `REGISTRATIONS` array re-confirmed no
`'media-encode'` entry exists. `cozy-media.js`'s `Adapters`/`Pipelines`
registries re-confirmed real and available for Engine 9's own
`attachToCoordinator()`.

**Verdict: Approved, no revision required.** All 7 Draft Implementation
Contract items confirmed sound as written — no open question left
unresolved by Compose, unlike Engine 3's or Engine 8's own Phase 2
Reviews. **Phase 3 (Implementation) is unlocked.**

Full Phase 2 section appended to
`docs/history/M388-E9-MediaEncode-Compose.md`. `MD-009` owner text
updated (Phase 2 Approved, Phase 3 unlocked); `MD-020`/`MD-004`
unchanged, correctly still open/out of scope. No new finding.

**Full repository ZIP built and verified this pass — Phase 2 checkpoint
only, per Rule 77/79 (Phase Focus / Mandatory Phase Checkpoint): this
session does not drift into Phase 3 implementation work in the same
pass.**

## Next Builder MUST (supersedes the numbered list above)

1. Upload the latest ZIP as baseline; verify Repository SHA-256 only
   against `RELEASES.md` (Rule 70).
2. Read this file (this section), `HANDOFF.md` (this pass's section),
   `RELEASES.md`, `docs/builder/knowledge/repair-queue.md`, and
   `docs/builder/knowledge/milestone-waiting-queue.md`.
3. Read `docs/history/M388-E9-MediaEncode-Compose.md` in full, including
   its Phase 2 section — the Final 7-item Implementation Contract is
   there.
4. Begin **Engine 9 Phase 3 (Implementation)** per the Final
   Implementation Contract exactly as written — do not reopen items 1–7.
   Do not start Engine 10 — it remains blocked behind Engine 9's own
   Phase 9 per Rule 68.

---

## THIS PASS — Engine 9 (Media Encode Engine) Phase 3–9 Complete, CLOSED (supersedes the "Next Builder MUST" list above)

Per Rule 69/76/77/78/80, resumed strictly from the repository's own
state — Repository SHA-256
(`71af032b5e0bb21670f674d55d5196f8905f95c5c4d1f91aa3b9f826e92f1fdf`)
reverified against `RELEASES.md` before any work began; confirmed exact.

**Engine 9 (Media Encode Engine): Phase 3 through Phase 9 all complete
this pass. CLOSED.** Full detail: `docs/history/M388-E9-MediaEncode-Compose.md`,
"Phase 3" onward. Summary:
- New file `core/engines/media/encode/media-encode-engine.js` —
  `buildEncodePlan()` composes Engine 1's `videoTrackRef`, Engine 7's
  per-segment playback result, and Engine 8's `crossCheckTiming()`
  classification into a real, deterministic mux plan (a segment is
  included only when `classification === 'aligned'` and `played ===
  true` — never inferred or defaulted). `realEncode` stays honestly
  `false`; no byte output fabricated.
- One additive `REGISTRATIONS` entry in `engine-bridge-bootstrap.js`.
  `attachToCoordinator()` registers via `cozy-media.js`'s existing
  `Adapters`/`Pipelines` registries only — `cozy-media.js` itself
  untouched.
- **12/12 real, executed tests pass**
  (`core/engines/media/encode/tests/media-encode-engine.test.js`); all
  8 prior engines' suites re-run unmodified — **178/178 total pass**.
- `MD-009`'s encode half updated: structural mux plan delivered; real
  codec bytes remain open, unchanged position. `MD-020`/`MD-004`
  unaffected, correctly out of scope.
- **Engine 10 (Streaming/Playback Pipeline Engine) is now unlocked
  (Rule 68), Phase 0 not started.** Engine 9 was not relabeled; Engines
  1–8 were not reopened; Engine 10 was not started this pass, per the
  Locked Continuation instruction and Rule 77.

## Next Builder MUST (supersedes the numbered list above)

1. Upload the latest ZIP as baseline; verify Repository SHA-256 only
   against `RELEASES.md` (Rule 70).
2. Read this file (this section), `HANDOFF.md` (this pass's section),
   `RELEASES.md`, `docs/builder/knowledge/repair-queue.md`, and
   `docs/builder/knowledge/milestone-waiting-queue.md`.
3. Read `docs/history/M388-E9-MediaEncode-Compose.md` in full — Engine 9
   is Closed.
4. Confirm Engines 1–9 all Closed across `LATEST.md`, `HANDOFF.md`,
   `RELEASES.md`, and the Waiting Queue — they agree.
5. Begin **Engine 10 (Streaming/Playback Pipeline Engine) Phase 0**
   (Repository Verification) — real repository search/reads first, no
   code, per Rule 65/68. Do not start Engine 11 — it remains blocked
   behind Engine 10's own Phase 9 per Rule 68.

---

## THIS PASS — Engine 10 (Streaming/Playback Pipeline Engine) Phase 0–2 Complete (supersedes the "Next Builder MUST" list above)

Per Rule 69/76/77/78/80, resumed strictly from the repository's own
state — Repository SHA-256
(`ada967e18c3e1c6456870d3cc6c9357995e9926c0e1cbf306f30489f6268cecb`)
reverified against `RELEASES.md` before any work began; confirmed exact.
Note: the session prompt that opened this pass supplied a stale
checkpoint hash (`71af032b...`, Engine 9's own Phase 2 checkpoint, before
Engine 9 was implemented) — the live repository state (Engine 9 Closed)
was followed instead, per Rule 69.

**Naming note (Rule 69):** the prompt named Engine 10 "Media
Export/Delivery Engine" and Engine 11 "Living AI Learning Engine." Per
the repository's real Approved Implementation Order, Engine 10 is the
**Streaming/Playback Pipeline Engine** and Engine 11 remains the
**Video Interpreter Coordinator** — see
`docs/history/M388-E10-StreamingPipeline-Compose.md` for the full
finding.

**Engine 10 — Phase 0 (Repository Verification), Phase 1 (Compose), and
Phase 2 (Review/Approval) all complete this pass — Approved.** Full
report: `docs/history/M388-E10-StreamingPipeline-Compose.md`. Summary:
- `cozy-live.js` already owns real Room→Stream→TranslationStream state
  (`createStream`/`setStreamStatus`/`relaySpeechSegment`), but is pure
  bookkeeping — no real low-latency transport exists anywhere (`MD-013`).
- `core/engines/playback/playback-engine.js` independently disambiguated
  as a different, pre-existing engine (replays finished recordings, not
  live segments) — not a duplicate.
- Final 7-item Implementation Contract approved: new file
  `core/engines/media/streaming/streaming-pipeline-engine.js`, real
  per-stream segment-latency instrumentation computed only from real
  caller-observed timestamps (never fabricated), `getCapabilities().realLowLatencyTransport`
  stays honestly `false`.
- **Per Rule 77 (Phase Focus), this pass stops at the Phase 2 checkpoint
  — Phase 3 (Implementation) is unlocked but not started this pass**,
  same cadence as Engine 9's own Phase 2 session.

## Next Builder MUST (supersedes the numbered list above)

1. Upload the latest ZIP as baseline; verify Repository SHA-256 only
   against `RELEASES.md` (Rule 70).
2. Read this file (this section), `HANDOFF.md` (this pass's section),
   `RELEASES.md`, `docs/builder/knowledge/repair-queue.md`, and
   `docs/builder/knowledge/milestone-waiting-queue.md`.
3. Read `docs/history/M388-E10-StreamingPipeline-Compose.md` in full —
   the Final 7-item Implementation Contract is there.
4. Begin **Engine 10 Phase 3 (Implementation)** per the Final
   Implementation Contract exactly as written — do not reopen items 1–7.
   Do not start Engine 11 — it remains blocked behind Engine 10's own
   Phase 9 per Rule 68. Do not reopen Engines 1–9.

---

## THIS PASS — Engine 10 (Streaming/Playback Pipeline Engine) Phase 5–9 Complete, CLOSED (supersedes the "Next Builder MUST" list above)

Per Rule 69/76/77/78/80, resumed strictly from the repository's own
state. **Phase 0 re-verification found a real discrepancy:** the
delivered ZIP's claimed Repository SHA-256
(`1c9467750816deb4fe33b2573f63a78e80cfcb9e0995b213c160673fd44f1dba`) did
not match the hash independently recomputed from the ZIP's own actual
extracted contents, via this repository's canonical method, reproduced
under explicit `LC_ALL=C` to rule out a locale/sort artifact. ZIP
integrity and Package SHA-256 both matched their claimed values exactly
— only the Repository SHA-256 was wrong. Per Rule 69, the independently
verified hash (`92adfd8ef288f18c2218d311f47ce014b9cfce558b2ad6e81f781451e038b2b2`)
was adopted as this round's real starting state. Logged as `DI-009` in
the Repair Queue — root cause not determined this pass. `DI-008` (a real
finding from the Engine 10 Phase 3 round, referenced by id in three
files but never given its own Repair Queue row) was also backfilled
this pass.

**Phase 4 re-confirmed:** all 10 real test suites re-run directly this
round against the now-authoritative repository state — 199/199 pass
(media-decode 23, language-detection 31, translation-pipeline 12,
speaker-diarization 23, background-audio-separation 18, subtitle-
timeline 22, voice-generation 13, synchronization 21+3, media-encode
12, streaming-pipeline 21). The one pre-existing `media-pipeline-
manager.test.js` failure (`MD-004`/`MD-009`) reproduced identically —
confirmed not a new regression. `streaming-pipeline` registration entry
in `engine-bridge-bootstrap.js` reconfirmed present.

**Phase 5 (Registry Updates) through Phase 9 (Close) complete this
round:** `docs/history/M388-E10-StreamingPipeline-Compose.md` updated
with the Phase 0 finding, Phase 4 reconfirmation, and full Close
section. `docs/builder/knowledge/repair-queue.md` updated (`MD-013`
reflects Engine 10 Closed; `DI-008`/`DI-009` added, both Fixed).
`docs/builder/knowledge/milestone-waiting-queue.md` updated (Engine 10
Closed, Engine 11 current/unlocked). **Engine 10 (Streaming/Playback
Pipeline Engine) is now CLOSED (Phase 9). Engine 11 (Video Interpreter
Coordinator) is unlocked (Rule 68), Phase 0 not started this pass** —
per this round's explicit Close-only scope (do not start, plan, or
estimate Engine 11's own work).

## Next Builder MUST (supersedes the numbered list above)

1. Upload the latest ZIP as baseline; verify Repository SHA-256 only
   against `RELEASES.md` (Rule 70).
2. Read this file (this section), `HANDOFF.md` (this pass's section),
   `RELEASES.md`, `docs/builder/knowledge/repair-queue.md`, and
   `docs/builder/knowledge/milestone-waiting-queue.md`.
3. Read `docs/history/M388-E10-StreamingPipeline-Compose.md` in full —
   Engine 10 is Closed; do not reopen it.
4. Confirm Engines 1–10 all Closed across `LATEST.md`, `HANDOFF.md`,
   `RELEASES.md`, and the Waiting Queue — they agree.
5. Begin **Engine 11 (Video Interpreter Coordinator) Phase 0**
   (Repository Verification) — real repository search/reads first, no
   code, per Rule 65/68. This is the final engine in the Approved
   11-engine Implementation Order — its own Phase 9 close completes
   M388.

---

## THIS PASS — Engine 11 (Video Interpreter Coordinator) Phase 0–1 Complete (supersedes the "Next Builder MUST" list above)

Per Rule 69/80, this session resumed strictly from the repository's own
recorded state — ZIP integrity clean, Repository SHA-256
(`d10fa341627fd00d55904b8335be97005f9f81b21d81f254c467f2b7eeaf01bc`)
independently reverified against `RELEASES.md` before any work began;
confirmed exact, no discrepancy this pass. Engine 11's identity
("Video Interpreter Coordinator," not any other name) confirmed
unchanged from `docs/history/M388.md`'s own Approved Implementation
Order.

**Engine 11 Phase 0 (Repository Verification) — complete this pass.**
`LATEST.md`, `HANDOFF.md`, `RELEASES.md`,
`docs/builder/rules/00-INDEX.md`,
`docs/builder/knowledge/repair-queue.md`,
`docs/builder/knowledge/milestone-waiting-queue.md`, and
`docs/history/M388.md`'s Approved Implementation Order + Phase 2 Review
all read in full. Engines 1–10 all reconfirmed Closed directly from
`core/bridge/engine-bridge-bootstrap.js`'s own 14-entry `REGISTRATIONS`
array (4 pre-existing platform engines + all 10 M388 engines) and each
engine's implementation file present on disk. Engine 11 unlock confirmed
per Rule 68.

**Engine 11 Phase 1 (Compose) — complete this pass.** Full report:
`docs/history/M388-E11-VideoInterpreterCoordinator-Compose.md`.
Anti-duplication scan performed across five independent search angles —
**clean: no existing video-interpreter/coordinator/orchestration
capability found anywhere.** `media-pipeline-manager.js` (a real,
pre-existing coordinator) and `core/modules/interpretation/
cozy-interpretation.js` (a real, pre-existing, name-adjacent
interpretation engine) were both read in full and confirmed **not**
duplicates — different, non-overlapping domains from Engine 11's real
mission (orchestrating Engines 1–10's own already-Closed pipeline
stages). `core/engines/media/coordinator/` confirmed free. Real call
surfaces of all ten upstream engines read directly from source (table in
the Compose report) — every one already honestly reports its own "real"
capability as `false`; Engine 11's own `getCapabilities()` must therefore
aggregate honestly, never rounding up. Draft 7-item Implementation
Contract recorded, not yet approved. One new finding, `DI-010` (Low,
Fixed this pass) — corrects `MD-022`'s literal phrasing (a "Scene
Manager" module does exist; its real scope just doesn't include the
frame-sync-for-export capability `MD-022` correctly identified as
absent).

**No application code written this pass** — Phase 0/1 only, per Rule
65/77. **Next: Engine 11 Phase 2 (Review/Approval)** — a future
session's own work.

## Next Builder MUST (supersedes the numbered list above)

1. Upload the latest ZIP as baseline; verify Repository SHA-256 only
   against `RELEASES.md` (Rule 70).
2. Read this file (this section), `HANDOFF.md` (this pass's section),
   `RELEASES.md`, `docs/builder/knowledge/repair-queue.md` (new
   `DI-010`), and `docs/builder/knowledge/milestone-waiting-queue.md`.
3. Read `docs/history/M388-E11-VideoInterpreterCoordinator-Compose.md`
   in full — Phase 0/1 complete; Phase 2 (Review/Approval) is the next
   required step, not Implementation.
4. Confirm Engine 1–10 all Closed, Engine 11 at Phase 1 Complete, across
   this file, `HANDOFF.md`, `RELEASES.md`, and the Waiting Queue — they
   agree.
5. Perform **Engine 11 Phase 2** (Review/Approval) — independently
   re-verify this Compose Report's claims against actual source (same
   standard every prior engine's own Phase 2 applied), decide the
   registration-mechanism open question (`EngineBridge` only, vs. also
   `PluginManager`), and finalize the Implementation Contract. Do not
   begin Phase 3 (Implementation) in the same pass unless Phase 2 is
   itself Approved and packaged first, per Rule 71/79. Do not invent an
   Engine 12 — none exists; Engine 11's own Phase 9 Close completes
   M388.

---

## THIS PASS (FINAL) — Engine 11 Phase 5–9 Complete, CLOSED. M388 COMPLETE. (supersedes every "Next Builder MUST" / "Current Engine" block above)

**Engine 11 (Video Interpreter Coordinator) — Phase 5 through Phase 9
all completed this pass, after independently re-verifying the delivered
Phase 0–4 checkpoint fresh (ZIP integrity, Package/Repository SHA-256,
10/10 Engine 11 tests, 196/196 Engine 1–10 regression, locked-file diff
— all matched exactly).** Full report:
`docs/history/M388-E11-VideoInterpreterCoordinator-Compose.md`.

**M388 — Living Media Interpreter is COMPLETE. All 11 engines Closed.**
No Engine 12 exists and none was invented. `MD-023`/`MD-024` (found
during Engine 11's own Phase 2/3) were both resolved within Engine 11's
own scope (an optional-adapter parameter with an honest skip; a cascade
so Encode honestly skips whenever Synchronization was skipped) —
neither is a carried-forward gap. `DI-011` (stale status blocks in this
file/`HANDOFF.md`) was found and fixed at Phase 4, before this Close.

**Known limitations, honestly unresolved by M388 as a whole (not new,
not Engine 11's to fix):** `MD-013` (no real low-latency transport),
`MD-016` (audio-buffer → STT bridge), `MD-017`'s `'CozySpeech'` half,
`MD-018` (`detectedLanguage` not forwarded), `MD-019` (no
`CozyDiarization` hook), `MD-020` (no real captured audio buffer from
synthesized speech), `MD-021` (no real timing-drift number). Every
`getCapabilities().realX` flag across all 11 engines remains honestly
`false` where no real signal-processing backend exists in this
environment — Engine 11 orchestrates real upstream outputs, it does not
upgrade any of them.

**Next milestone: Living AI Learning.** Not begun this pass. A future
session begins it with its own Phase 0 (Repository Verification), Phase
1 (Compose), and Phase 2 (Review/Approval) — searching the entire
repository for existing capabilities before proposing any new engine,
per Rule 65.

### Next Builder MUST (final, supersedes every prior list in this file)
1. Upload `CozyOS-main-v3_02_28-M388-E11-Closed.zip` as baseline; verify
   Repository SHA-256 against `RELEASES.md` only (Rule 70).
2. Read this file's top-of-file summary, `HANDOFF.md`, `RELEASES.md`,
   Repair Queue, Milestone Waiting Queue.
3. Confirm M388 shows COMPLETE (all 11 engines Closed) across all four
   files — they agree.
4. Begin the **Living AI Learning** milestone's own Phase 0 — not an
   "Engine 12," which does not exist.
