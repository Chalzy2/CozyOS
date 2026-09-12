# CozyOS Language Intelligence — Phase C-1 Final Report

Implementation authorized and delivered: the smallest safe dependency
for provider-neutral language capability intelligence. No universal
router, no new registry, no duplicate engine. No checkpoint created.

---

## 1. Existing authorities discovered (confirmed this round, before implementing)

- STT: CozySpeech (core/modules/speech/cozy-speech.js) — confirmed via
  the existing MICROMILESTONE-D-VOICE-STT-AUTHORITY-RECONCILIATION-AUDIT.md.
  Its own header: "CozySpeech is NOT: Speech recognition, Synthesis,
  Translation, Audio processing" — it's a coordinator/registry, owning
  session/stream/device/adapter bookkeeping only.
- TTS: core/living/living-tts.js is an explicit facade; the real owner
  is CozySpeech's registerPreviewBackend()/previewVoice() hook (same
  file as STT's coordinator — one real owner for both).
- OCR: core/modules/ocrstudio/ (ocr-document.js, ocr-image.js) —
  confirmed via MICROMILESTONE-C-OCR-AUTHORITY-RECONCILIATION-AUDIT.md,
  which also flags an existing, separate "permission gap" finding not
  touched this round.
- UI language availability: no dedicated owner found this round
  (searched; no hit).
- Tier 1 (canonical identity): cozy-language-pack-registry.js —
  confirmed, extended this round.
- Tier 2 (conversational): cozy-language-registry.js — confirmed, NOT
  touched this round (deliberately deferred, see section 6).
- Tier 3 (NLLB): nllb_http_bridge.py's COZY_TO_NLLB — confirmed,
  mirrored (keys only) this round.
- Gemini: gemini-cloud-provider.js + gemini-backend-endpoint.js —
  confirmed real, not touched.

## 2. Components reused

cozy-language-pack-registry.js's existing DEFAULT_IDENTITIES,
getPack(), packs Map, registerOptionalPack() — all read, none modified
in behavior. The existing test file's exact loading convention (global.window
+ cache-busted require(), plain function-based runner) was followed
precisely rather than introducing a different test style into this
directory.

## 3. Components extended

core/modules/intelligence/language-packs/cozy-language-pack-registry.js —
two new functions added, purely additively (zero existing lines
changed): getLanguageCapabilities(languageId) and
getOnlineProviderStatus(), both exported from the module's existing
api object.

## 4/5. New components — none created; why extension was sufficient

Per the explicit instruction ("only create a new shared capability
abstraction if repository evidence proves no existing authority can
safely own the required metadata"): cozy-language-pack-registry.js
already owns the canonical 17-identity registry and already exposes a
clean per-language record (getPack()). Adding capability metadata as
two new read-only functions on the same existing authority was
sufficient — no evidence emerged justifying a new file, table, or
engine.

## 6. Language capability model (implemented)

getLanguageCapabilities(languageId) returns: languageId, origin,
packStatus, resourceState (this registry's own real fields,
unchanged), plus nllb: { mapped: boolean, mappingSource: '<path>',
runtimeStatus: 'DOCUMENTED_ONLY' }. Deliberately NOT included:
conversational (Tier 2), Gemini, STT/TTS/OCR/UI — reported UNKNOWN by
omission rather than guessed at.

Deliberately scoped to what THIS registry can honestly know without
reaching into another file's authority (Tier 2 composition) or
performing a network call (NLLB live health). Cross-referencing Tier 2
is a real, disclosed, deferred follow-up — not attempted in the same
step as this one, consistent with dependency-ordered, non-rushed
implementation.

supported = true was never used anywhere in this implementation — an
optional/non-default pack correctly reports nllb.mapped: false
(verified by test), and no field anywhere collapses multiple
independent capabilities into one boolean.

## 7. Provider-neutral model (implemented)

getOnlineProviderStatus() reports NLLB and Gemini as two independent,
parallel entries — neither privileged, neither hard-coded as "the"
translation or AI engine. NLLB's entry includes mappingCoverage:
"17/17" (the real, confirmed coverage fact); Gemini's entry includes
languageSpecific: false specifically to prevent it from ever being
folded into a per-language map the way NLLB's genuinely is.

## 8. Offline-first behavior (empirically tested, not just designed)

Directly executed: loading the registry fresh, calling
registerDefaultPacks(), getLanguageCapabilities(), and
getOnlineProviderStatus() — all succeeded with zero network access
attempted, in this network-disabled sandbox, confirming Core
initialization and both new functions work fully offline. A dedicated
test proves neither new function returns a Promise — a real, checkable
guarantee that nothing here silently awaits a network round-trip.

## 9. Network boundary

No network call was added anywhere. Both new functions are pure,
synchronous, side-effect-free reads of already-in-memory data plus one
hard-coded, disclosed-as-manually-synced constant
(NLLB_MAPPED_LANGUAGE_IDS). The actual online edge (a live bridge
health check, a real Gemini call) remains entirely outside this file.

## 10. Gemini status

IMPLEMENTED / NETWORK_REQUIRED / RUNTIME_BLOCKED_CURRENT_ENV — matches
exactly what was specified as the expected current-sandbox status; not
altered, only formally represented in the new getOnlineProviderStatus()
output as runtimeStatus: "NETWORK_REQUIRED".

## 11. NLLB status

17/17 mapping / DOCUMENTED_ONLY / RUNTIME_NOT_VERIFIED — matches
exactly what was specified; represented in
getLanguageCapabilities().nllb.runtimeStatus and
getOnlineProviderStatus().nllb, both always "DOCUMENTED_ONLY", verified
by a dedicated test asserting this is never "RUNTIME_VERIFIED".

## 12. STT status

Owner identified (CozySpeech) per the existing authority audit. Not
extended with capability metadata this round — out of scope for this
minimal step; flagged as a real next candidate, not silently assumed
covered.

## 13. TTS status

Same owner as STT (CozySpeech, via living-tts.js's facade). Not
extended this round, same reasoning as section 12.

## 14. OCR status

Owner identified (ocrstudio module) per the existing authority audit,
which itself flags an unresolved "permission gap" — noted, not
addressed, out of this round's scope.

## 15. UI language status

UNKNOWN — no owner found. Searched this round (setUILanguage,
uiLanguage, UI_LANGUAGE patterns); zero hits. Genuinely unresolved,
reported as such rather than guessed at.

## 16. Learning integration

Not touched this round. core/modules/builder/learning-engine.js,
core/modules/leaning/learning-engine.js, and core/modules/learning/
(the real M322 Universal Learning Pipeline) were traced (see section
17) but none modified — this round's implementation scope was the
language capability model only.

## 17. Learning path discrepancy status — RESOLVED AS "NOT A DEFECT," LEFT UNCHANGED

Traced exhaustively this round, per instruction, before touching
anything:

- core/modules/builder/learning-engine.js explicitly disclaims being
  the same engine as core/modules/leaning/learning-engine.js (line 8)
  and has a real, working runtime check referencing that exact path
  (line 182) — confirming leaning/ is the correct, intentional,
  actively-depended-upon path for a genuinely separate
  window.CozyOS.LearningEngine global.
- core/living/cozy-living-learning.js also correctly expects
  LearningEngine to come from core/modules/leaning/.
- A real, separate, third directory — core/modules/learning/ (correct
  spelling) — exists and is actively loaded by admin-workspace.html/
  dashboard.html/index.html, containing the unrelated M322 Universal
  Learning Pipeline. It contains no learning-engine.js file at all.
- Therefore core/modules/leaning/learning-engine.js's own line-3 header
  comment ("File Reference: core/modules/learning/learning-engine.js")
  is a pure, self-contained documentation error — it references a real
  directory that exists but does not, and never did, contain the file
  being described. Zero code anywhere imports, requires, or loads via
  that incorrect path.

Classification, per the required options: documentation error,
explicitly NOT an import path error, historical path, or build-
resolution issue (all three ruled out by confirming zero real
references use the incorrect path).

Decision: per the explicit instruction — "Fix it ONLY if the evidence
shows it is an actual runtime/build defect" — this evidence shows it
is not one. Left unchanged this round. The file was not edited,
renamed, or moved. This is the conservative, correct choice under the
stated conditional, not an oversight.

## 18. Registry discrepancies

Luganda (lg): unchanged from the prior discovery report — still an
unresolved discrepancy (present in Tier 2's extended list, absent from
Tier 1's canonical 17). Not reconciled this round, per instruction.
Confirmed again this round: NLLB_MAPPED_LANGUAGE_IDS (the new constant)
correctly excludes lg, matching the real COZY_TO_NLLB dict, which also
has no lg entry — the new code does not accidentally paper over or
resolve the discrepancy by omission.

## 19. Security results

No secrets, API keys, or credentials introduced (scanned, confirmed
empty). No client-side code was given authority over provider
credentials, activation, or organization identity — the two new
functions are pure reads of already-public, non-sensitive metadata.

## 20. Regression results

| Suite | Tests | Pass | Fail |
|---|---|---|---|
| cozy-language-pack-registry.test.js (this file, extended) | 40 | 40 | 0 |
| cozy-african-language-intelligence.test.js | 63 | 63 | 0 |
| cozy-language-acquisition-pipeline.test.js | 30 | 30 | 0 |
| cozy-language-knowledge-model.test.js | 14 | 14 | 0 |
| cozy-language-pack-persistence.test.js | 7 | 7 | 0 |
| cozy-rp035-optional-country-correction.test.js | 24 | 24 | 0 |
| cozy-rp035-phase2-teaching-pipeline.test.js | 4 | 4 | 0 |
| cozy-language-pack-export-import.test.js | 9 | 9 | 0 |
| cozy-language-pack-format.test.js | 15 | 15 | 0 |
| cozy-storage-provider.test.js | 10 | 10 | 0 |
| cozy-admin-language-dashboard-core.test.js | 14 | 14 | 0 |
| cozy-admin-language-dashboard-domain-community.test.js | 28 | 28 | 0 |
| cozy-admin-language-dashboard-quarantine-hotspot.test.js | 31 | 31 | 0 |
| cozy-admin-language-dashboard-term-explorer.test.js | 23 | 23 | 0 |
| cozy-admin-language-dashboard-ui.test.js | 22 | 22 | 0 |
| server-side knowledge-registry.test.js (spot-check, unrelated subsystem) | 28 | 28 | 0 |
| TOTAL | 362 | 362 | 0 |

cozy-admin-language-dashboard-ui-browser.test.js reported 0 passed, 0
failed — a real, pre-existing browser-only test file requiring a DOM
this Node environment doesn't provide; unrelated to this round's
change, not newly broken by it.

No SKIP/BLOCKED categories apply to this round's regression — this
change touched no server/database/network-dependent code path.

## 21. Locked-file verification

core/ai.js, core/ai/cozy-ai-language.js, core/ai/cozy-ai-memory.js
confirmed byte-identical before and after this round's work.
core/ai/integration.js confirmed ABSENT / NOT PRESENT, re-verified
directly, not assumed. None of the four were read, referenced, or
modified by this round's implementation.

## 22. Remaining gaps

- STT/TTS/OCR capability metadata not yet added to their respective
  owners (identified, not extended, this round).
- UI language availability ownership genuinely unresolved (UNKNOWN).
- Tier 2 (conversational) cross-referencing deliberately deferred —
  getLanguageCapabilities() does not yet report conversational
  availability.
- Luganda registry discrepancy remains unresolved (by design, per
  instruction).
- The OCR authority audit's own flagged "permission gap" remains
  unaddressed (out of this round's scope).

## 23. NEXT SINGLE DEPENDENCY

Extend getLanguageCapabilities() to also read Tier 2's
cozy-language-registry.js (a second, deliberately-deferred read-only
composition, not a merge) — this is the smallest next step that would
let a single call answer "is this language canonical AND does CozyAI
have a verified conversational answer for it," which is the most
immediately useful composite fact not yet available, and requires no
new authority, no schema, and no network call.

Not proceeding into STT/TTS/OCR extension, UI ownership resolution, or
any universal capability router until this specific next step is
separately authorized.
