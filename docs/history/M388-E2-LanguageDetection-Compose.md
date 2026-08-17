# M388 — Engine 2: Language Detection Engine (Compose Report)

**Per Rule 68:** Engine 1 (Media Decode Engine) reached Phase 9 (Close) —
recorded Complete in `docs/history/M388-E1-MediaDecode-Compose.md` and
`RELEASES.md` (M388 Round 10). Engine 2's own Phase 0 is therefore
unblocked. This document covers **Phase 0 (Repository Verification)** and
**Phase 1 (Compose Report)** only, per this session's explicit scope —
no application code, no implementation, no new engine files.

---

## Phase 0 — Repository Verification

All items below were checked against the actual extracted source in this
session, not restated from a prior summary (Rule 69).

### 1. Existing language-detection capability — searched repository-wide

No real automatic language-detection implementation exists anywhere in
the repository. Confirms `MD-012` exactly as composed:
`core/modules/speech/adapters/speech-translation-adapter.js`'s own header
explicitly lists "auto language detection" under **NOT BUILT**, and
`core/modules/ChurchOS/church-worship-session.js` independently discloses
the same gap in its own honest-gaps comment ("no real LanguageDetector
engine exists — the pastor/admin must [supply it manually]"). Two
unrelated files independently confirming the same absence is strong
evidence this is a real, repository-wide gap, not a local one.

### 2. Duplicate-ownership scan

Three *unrelated* modules use "Language" in their name or a similar
global; none of them do audio/media language detection, so none compete
with Engine 2's actual scope:

| Name | File | Real responsibility | Collision risk |
|---|---|---|---|
| `CozyLanguageEngine` | `core/modules/language/language-engine.js` | Real, key-based **UI-string** translation (Save/Cancel/Delete/etc.), the one platform-wide localization system per its own "Approved Exception to Rule 43" | None — display-layer dictionary lookup, not detection |
| `CozyLanguageImporter` | `core/languageImporter.js` | Static bundled UI-string dictionaries per locale (`window.CozyLanguageImporter`) | None — same display layer as above |
| `CozyLanguageVerification` | `core/living/cozy-language-verification.js` | A `Living*` coordinator (different subsystem family entirely, per class name `CozyLanguageVerification`) | None — different responsibility, not reviewed further this pass (out of Engine 2's scope) |

**Real finding (new, registered below):** `core/language.js:32` reads
`window.CozyLanguage?.LANGUAGES` as a fallback source of valid locale
codes, but `window.CozyLanguage` is never assigned anywhere in the
repository (confirmed via a repository-wide search for the assignment) —
only `window.CozyLanguageImporter` and `window.CozyOS.CozyLanguageEngine`
exist. The optional-chaining means this always silently falls through to
the hardcoded 8-locale fallback object; it does not throw, so it is not
an active defect, but it is dead/misleading code. This is unrelated to
Engine 2's own build and predates M388 — logged as `DI-004` below per
Rule 62 (found the moment it was discovered), not fixed in this Compose
pass.

### 3. The real, pre-existing composition point — `cozy-live.js`

`modules/live/cozy-live.js` already reserves a **named optional subsystem
slot** for exactly this capability:
- `KNOWN_SUBSYSTEMS` (line 299) includes `'CozyLanguage'` as a closed-list
  entry alongside `CozySpeech`/`CozyTranslate`.
- `relaySpeechSegment()` (line ~2309) calls
  `hasSubsystem('CozyLanguage')` → `languageAdapter.detectLanguage(sourceAudioRef)`
  → expects `{ languageCode: string }` back, purely as an **optional,
  informational** hook (never required; pipeline behaves identically if
  unregistered).
- The existing test suite (`modules/live/ourcozy-live.test.js:773-784`)
  already exercises this exact contract with a mock
  (`detectLanguage: () => ({ languageCode: 'sw' })`), confirming the
  interface shape is real and already covered, not speculative.

**Naming note (not a runtime collision):** the subsystem key string
`'CozyLanguage'` used inside `cozy-live.js`'s own private `subsystems`
Map is a different namespace from the global `window.CozyLanguage`
referenced (but never assigned) in `core/language.js` — no shared state,
no runtime conflict. The identical name is a real *documentation*
confusion risk for future readers, worth a one-line disambiguating
comment at implementation time, but not a blocking finding.

### 4. `MD-012` ownership — confirmed

`MD-012` ("no automatic language-detection capability") is sequenced as
Engine 2 in the Approved Implementation Order (`docs/history/M388.md`,
Phase 2 Review, item 2). Nothing else in the repository claims or
partially implements this scope. Ownership confirmed clean.

### 5. `MD-016` relationship — checked, confirmed non-blocking but adjacent

`MD-016` (no engine owns the audio-buffer → `SpeechRecognitionAdapter`
bridge) is a **different** gap: it's about getting decoded audio *into*
STT, not about detecting the spoken language. Engine 2's
`detectLanguage(sourceAudioRef)` contract (per §3) takes the same opaque
`sourceAudioRef` handle `relaySpeechSegment` already passes to
`CozySpeech.transcribe()` — so Engine 2 has the same input-availability
dependency as `MD-016`, but does not resolve it and is not blocked by it
for its own Phase 0/1 (Compose can proceed; real end-to-end wiring at
Implementation time will need `MD-016` addressed by whichever engine
owns it, most naturally Engine 1 or a thin adapter — still unassigned,
carried forward unchanged).

### 6. Dependencies from Engine 1 — checked

Engine 2 has **no hard code dependency** on Engine 1's
`media-decode-engine.js`. Engine 1's `decodeMedia()` returns
`{ audioTrack, videoTrackRef, metadata }` (an honest `isReal:false`
structural envelope, per its own Compose §4) — not a raw audio buffer.
`cozy-live.js`'s `sourceAudioRef` (the input to both `CozySpeech.transcribe`
and the proposed `CozyLanguage.detectLanguage`) is a *pre-existing*,
already-live parameter of `relaySpeechSegment`, independent of whether
Engine 1's decode path is wired into it (that wiring is exactly `MD-016`,
per §5). Engine 2 can therefore Compose and even Plan against the
existing live-session contract without waiting on Engine 1's output
format — a real, evidence-based finding, not an assumption.

### 7. Interfaces into Translation Pipeline (Engine 3) — checked

No Engine 3 work exists yet (correctly — Engine 2 is not yet closed).
`cozy-translate.js`'s registries (`registerSourceLanguage`/
`registerTargetLanguage`) already accept arbitrary language codes;
`speech-translation-adapter.js` already seeds a fixed set (§ real source,
Phase 0 read). Engine 2's natural output (`languageCode`) is
already the type both registries expect — no interface mismatch found.
Full Engine 3 composition is out of this report's scope.

### 8. Conflict check — `cozy-translate.js`

Confirmed via direct read of its header (unchanged since Engine 1's
Compose): `cozy-translate.js`'s **Strict Negative Boundary** explicitly
states "0% Language detection or linguistic modeling." Engine 2 building
detection in its own new file, then feeding a plain `languageCode` string
into `cozy-translate.js`'s existing registries, does not cross that
boundary — the boundary is about *cozy-translate.js itself* never doing
detection internally, which stays true either way.

### 9. Conflict check — `cozy-speech.js`

`cozy-speech.js` has a real, existing `_languages` Map / `registerLanguage`
/ `listAfricanLanguages()` registry (§3.5, confirmed by direct read) —
but this is a **directory of known languages** (metadata: name, region,
locale), not a detection capability, and its own comments never claim
detection. No overlap with Engine 2's proposed scope (detecting *which*
language a given audio segment is spoken in). Engine 2 would be a new
producer that could optionally feed this existing registry's codes as
valid output values — a composition opportunity, not a conflict.

### 10. Performance expectations

No existing pipeline in this repository performs any form of automatic
language detection today (confirmed, §1), so — consistent with Engine 1's
own Compose §8 precedent — this report does not fabricate a per-stage
latency budget without a real baseline. Real measurement is a
Plan/Implementation-stage activity, not asserted here.

### 11. Security/privacy implications

- Same open, unresolved repository-wide question already flagged by the
  parent M388 Compose (processing third-party/copyrighted or otherwise
  sensitive audio has no existing CozyOS policy) — carried forward, not
  a new risk specific to Engine 2, not resolved here.
- Language detection from voice audio is a lower-sensitivity operation
  than diarization/voice-cloning (Engine 4/`MD-008`) — it does not by
  itself identify *who* is speaking, only *what language*. No biometric
  or identity data is produced by this engine's proposed scope.
- No credential or PII handling anticipated in this engine's own scope.

### 12. Failure handling

Per `relaySpeechSegment`'s own existing contract (§3): if
`CozyLanguage` is not registered, or `detectLanguage` is missing/throws,
the hook is skipped and the pipeline continues exactly as it does today
(confirmed by reading the existing `if (hasSubsystem(...))` guard —
this is not a proposal, it's already-live defensive code). Engine 2's own
internal implementation would need to follow the repository's consistent
"fail closed, never fabricate a language guess" convention (same pattern
as Engine 1's `isReal:false`, `SpeechTranslationProviders`' "NEVER
FABRICATE") — a Plan/Implementation-stage decision, not made here.

---

## Phase 1 — Compose Report: Language Detection Engine

### Purpose

Resolve `MD-012` by producing a new engine that determines the spoken
language of an audio segment, optionally attaching to `cozy-live.js`'s
already-reserved `CozyLanguage` subsystem slot so `relaySpeechSegment()`
can auto-populate `detectedLanguage` in its relay result — currently
always `null` when no adapter is registered (confirmed live in Phase 0,
§3).

### Existing capabilities (already present, to be composed with, not rebuilt)

- `cozy-live.js`'s `CozyLanguage` subsystem slot + `relaySpeechSegment()`
  wiring (§3) — real, live, already tested.
- `cozy-speech.js`'s language directory (§9) — a valid target for
  cross-referencing detected codes against known/registered languages.
- `cozy-translate.js`'s source/target language registries (§7) — a valid
  downstream consumer of Engine 2's output.
- `speech-translation-adapter.js`'s seeded language set (Phase 0 read) —
  a candidate reference list for which languages this engine's honest
  scope should claim to detect first.

### Ownership

New file (name TBD at Plan stage, e.g.
`core/engines/media/language/language-detection-engine.js`, following
Engine 1's `core/engines/media/<stage>/` convention) — does not modify
`cozy-live.js`, `cozy-speech.js`, `cozy-translate.js`, or
`core/modules/language/language-engine.js`. Registers into `cozy-live.js`
via `registerSubsystem('CozyLanguage', adapter)`, the same non-invasive
attachment pattern Engine 1 used for `cozy-media.js`
(`attachToCoordinator`) — the host module's own registries are extended
through its existing public API, never edited directly.

### Composition plan

1. New engine exposes `detectLanguage(audioRef, options?) -> { languageCode, confidence, isReal }`
   (honest envelope, matching repository convention — §12).
2. A thin adapter object implementing that same shape is registered via
   `cozy-live.js`'s existing `registerSubsystem('CozyLanguage', adapter)`
   — no change to `cozy-live.js` itself.
3. Optionally cross-checks the detected code against `cozy-speech.js`'s
   `listLanguages()` directory for a human-readable name (read-only use
   of an existing registry, not a new one).
4. Registers via `EngineBridge`/`engine-bridge-bootstrap.js`'s
   `REGISTRATIONS` array, one new entry, matching Engine 1's exact
   pattern (§ Phase 0 read of the bridge file).

### Dependencies

- **None blocking within M388** — confirmed §6: no hard dependency on
  Engine 1's decode output format; consumes the same pre-existing
  `sourceAudioRef` `relaySpeechSegment` already receives.
- **Soft, shared dependency with `MD-016`** (§5): real end-to-end value
  requires *some* engine to bridge decoded audio into a usable buffer —
  not resolved by, and not blocking, this Compose.

### Data flow

`sourceAudioRef` (opaque, caller-supplied) → Engine 2
`detectLanguage()` → `{ languageCode }` → consumed optionally by
`cozy-live.js`'s `relaySpeechSegment()` result, and/or passed forward
explicitly by a future Engine 3 (Translation Pipeline) as the source
language when the caller hasn't already specified one.

### Risks

- Detecting language from short/noisy audio segments is a real accuracy
  challenge in any real implementation — a Plan-stage design question
  (e.g., minimum segment length, confidence threshold), not resolved
  here.
- Same open Security/Privacy question carried from the parent Compose
  (§11) — unresolved, not new.

### Missing components

- No real language-detection algorithm/model exists anywhere in this
  repository to compose with (confirmed §1) — Engine 2's Implementation
  phase will need an honest reference approach (matching Engine 1's
  `isReal:false` precedent) unless a real browser API or bundled
  approach is approved at Plan stage. Not decided in this Compose.

### Repair Queue impact

- `MD-012`: reinforced with Phase 0 evidence (two independent
  confirmations of the gap, §1); remains 🟡 Composed → owner is now
  actively engaged at Compose stage (see registry update below).
- `MD-016`: unchanged, still open, confirmed non-blocking for Engine 2's
  own Compose (§5).
- New: `DI-004` opened (§2) — `core/language.js:32`'s dead
  `window.CozyLanguage?.LANGUAGES` reference. Unrelated to M388/Engine 2;
  logged per Rule 62 the moment it was found, not fixed this pass.

### Duplicate-engine scan

No duplicate or competing language-detection implementation found
anywhere in the repository (§1, §2). Three same-named-family modules
(`CozyLanguageEngine`, `CozyLanguageImporter`, `CozyLanguageVerification`)
checked individually and confirmed unrelated in responsibility (§2) — no
duplication risk.

### Implementation contract (draft, for Phase 2 Review to confirm/revise)

1. New file only, under `core/engines/media/language/` (path to be
   confirmed at Plan/Review stage) — no existing file modified except
   one new entry in `engine-bridge-bootstrap.js`'s `REGISTRATIONS` array.
2. `cozy-live.js`, `cozy-speech.js`, `cozy-translate.js`,
   `core/modules/language/language-engine.js` all remain untouched.
3. Attaches to `cozy-live.js` only through `registerSubsystem()`, its own
   existing public API — never reaches into its internals.
4. Must return an honest `isReal`/confidence envelope — no fabricated
   detection result, consistent with the repository's established
   pattern (Engine 1, `SpeechTranslationProviders`).
5. Does not resolve `MD-016` — explicitly out of scope, carried forward.
6. Does not touch `DI-004` — unrelated pre-existing issue, logged only.

---

## Repair Queue / Registry updates (Rule 62 — logged the moment discovered)

- **`MD-012`** — status unchanged (🟡 Composed), owner updated: "Future
  Builder (M388 Plan)" → **"M388 Engine 2 session (Compose stage,
  in progress)"**. Depends-on unchanged (None).
- **`MD-016`** — unchanged, cross-referenced from this report (§5); no
  status change.
- **New — `DI-004`** (`core/language.js:32` references
  `window.CozyLanguage?.LANGUAGES`, but `window.CozyLanguage` is never
  assigned anywhere in the repository — confirmed by repository-wide
  search, Phase 0 §2). Registered in the Documentation Integrity
  Registry (taxonomy: Open/Closed, not the Rule 61 Composed/Fixed
  taxonomy — DI findings are documentation/architecture mismatches, not
  defects). Status: Open. Priority: Low (masked by optional chaining +
  hardcoded fallback; not an active defect, no observed failure). Owner:
  Future Builder (unrelated to M388, not fixed this pass per this
  session's explicit "no fixes" scope).

Both registry files (`docs/builder/knowledge/repair-queue.md`,
`docs/builder/knowledge/missing-dependency-registry.md`) and
`LATEST.md`/`HANDOFF.md`/`RELEASES.md` updated to match this report as
part of this same pass (below).

## Builder Lifecycle Status (Rule 65, this engine)

- Phase 0 (Repository Verification): ✅ Complete, this pass.
- Phase 1 (Compose): ✅ Complete, this pass — this report.
- Phase 2 (Review/Approval): Not started — next required step before any
  Implementation.
- Phase 3–9: Not started.

**Certification — Engine 2 / Language Detection (sub-milestone)**
- Repository Verified: **YES** — live searches executed against actual
  source this pass, not restated.
- Compose Verified: **YES** — this report.
- Review/Approval: **NO** — pending.
- Implementation Verified: **NO** — not started, and explicitly out of
  this session's scope.
- Verification Verified: **NO** — nothing implemented yet.
- New findings this pass: `DI-004` (Open, Low, unrelated pre-existing
  issue). `MD-012` owner updated, status unchanged.
- Ready for Next Account: **YES** — Phase 2 Review of this Compose Report
  is the correct next step. No implementation should begin before that
  Review, per Rule 65/68.

---

## Phase 2 — Review/Approval

Independent re-verification performed against actual repository source
this pass (not restated from Phase 0/1's own account, per Rule 69) —
every load-bearing claim in the Compose Report was re-checked directly:

1. **cozy-live.js composition point (Section 3) — re-confirmed exact.**
   `KNOWN_SUBSYSTEMS` (line 296 array, `'CozyLanguage'` at line 299),
   `relaySpeechSegment()`'s `hasSubsystem('CozyLanguage')` guard at line
   2309, `subsystems.get('CozyLanguage')` at line 2310, and the
   `detectLanguage(sourceAudioRef)` call with `{ languageCode }` handling
   at lines 2311-2314 — read directly, matches the Compose Report's
   description exactly, including the "skipped entirely if unregistered"
   behavior (`detectedLanguage` stays `null`).
2. **Test coverage (Section 3) — re-confirmed exact.**
   `modules/live/ourcozy-live.test.js:784` registers
   `('CozyLanguage', { detectLanguage: () => ({ languageCode: 'sw' }) })`
   and asserts `withHooks.detectedLanguage === 'sw'` — a real, executed,
   passing test already exercises this exact contract shape.
3. **No production code currently registers `'CozyLanguage'` — checked
   repository-wide, not just asserted.** A full-repository search for
   `registerSubsystem(` found only test-file call sites
   (`ourcozy-live.test.js`) for `CozyLanguage`/`CozySpeech`/
   `CozyTranslate`/`CozyKnowledge`/`CozyLogger`/`CozyResilience` — zero
   production registrants for any subsystem name, `CozyLanguage`
   included. Confirms **no other engine, present or planned, already
   attaches to this name** — Engine 2 would be the first real
   registrant, not a second one racing an existing occupant. This is a
   stronger check than the Compose Report itself performed (it checked
   *naming* collisions in Section 2/3's disambiguation note; this Review
   additionally checked *runtime registration* collisions) — no
   discrepancy found, but this closes a gap Phase 0 left implicit rather
   than merely restating Phase 0.
4. **DI-004 — re-confirmed as real and correctly scoped.** Direct read
   of `core/language.js:32`: `window.CozyLanguage?.LANGUAGES || {...8
   locale fallback...}`. Repository-wide search for any assignment to
   `window.CozyLanguage` (as opposed to `CozyLanguageEngine`/
   `CozyLanguageImporter`/`CozyLanguageVerification`, which are distinct
   identifiers) returns zero results. Optional chaining means this
   always falls through to the hardcoded fallback — confirmed not an
   active defect, correctly logged as Low/Open, correctly scoped as
   unrelated to Engine 2's own build (Engine 2 does not assign
   `window.CozyLanguage` either — it registers into `cozy-live.js`'s
   *private* `subsystems` Map under the string key `'CozyLanguage'`, a
   different namespace entirely, exactly as the Compose Report's naming
   note in Section 3 states).
5. **Duplicate-ownership scan (Section 2) — spot-checked, holds.**
   `core/modules/language/language-engine.js`'s `CozyOSLanguageEngine`
   class (confirmed by direct read) is a UI-string dictionary lookup, no
   detection method anywhere in the file. `core/languageImporter.js`
   assigns `window.CozyLanguageImporter` (confirmed) — static bundled
   locale dictionaries, no detection. `core/living/cozy-language-verification.js`'s
   `CozyLanguageVerification` class registers as
   `window.CozyOS.LivingLanguageVerification` (confirmed) — a `Living*`
   coordinator, unrelated family. None compete with Engine 2's proposed
   scope.
6. **cozy-translate.js boundary (Section 8) — re-confirmed exact.**
   Header read directly: "0% Language detection or linguistic modeling"
   is a real, present line in its Strict Negative Boundaries block.
   Engine 2's plan (detect in its own file, hand a plain `languageCode`
   string to `cozy-translate.js`'s existing `registerSourceLanguage`/
   `registerTargetLanguage` registries) does not require
   `cozy-translate.js` to perform detection itself — boundary respected.
7. **speech-translation-adapter.js / church-worship-session.js gap
   disclosures (Section 1) — re-confirmed exact**, both files' relevant
   comment blocks read directly, characterization matches the Compose
   Report on both passes.
8. **File-path collision check (new this Review) — clear.** The Compose
   Report's candidate path,
   `core/engines/media/language/language-detection-engine.js`, does not
   exist yet; `core/engines/media/` currently contains only `decode/`
   (Engine 1) and `tests/`. No collision — confirms the path is free for
   Plan-stage confirmation, consistent with Engine 1's own
   `core/engines/media/decode/` precedent.
9. **REGISTRATIONS array shape (Composition plan, item 4) — spot-checked.**
   `core/bridge/engine-bridge-bootstrap.js`'s existing `media-decode`
   entry uses the shape `{ name, modulePath, globalName,
   expectedManifestName }` — Engine 2's proposed "one new entry,
   matching Engine 1's exact pattern" is achievable without any change
   to the array's existing structure.

### Findings

No completeness gap, no architecture defect, and no unsafe assumption
found anywhere in the Compose Report. Unlike M388's own milestone-level
Phase 2 Review (which found a real sequencing gap and required revision)
and Engine 1's Phase 2 Review (which surfaced `MD-016`), this Review
surfaces **no new finding** — Engine 2's Compose Report already
identified and correctly scoped every adjacent gap it touches (`MD-016`
cross-referenced but not claimed as resolved; `DI-004` logged but
explicitly not fixed). The one genuinely new check performed this Review
(item 3 above — the runtime-registration collision check) came back
clean, so it strengthens rather than changes the existing conclusion.

### Verdict: Approved (not Revised)

The Compose Report's architecture, ownership boundaries, composition
point, honest-envelope commitment, and Implementation Contract are all
sound as written. No revision to the 6-item Implementation Contract is
required. Phase 3 (Implementation) of Engine 2 is unlocked as a direct
result of this Review.

**Explicit confirmations requested by HANDOFF.md's Next-Builder checklist
(item 11), answered:**
- (a) The `registerSubsystem('CozyLanguage', adapter)` attachment plan is
  confirmed against `cozy-live.js`'s real, existing, already-tested slot
  — **Yes, correct as proposed.**
- (b) No other engine should attach to the same `CozyLanguage` name —
  **Confirmed**, and confirmed more strongly than Phase 0 alone showed
  (item 3 above: zero production registrants exist for any subsystem
  name today).
- (c) The honest-envelope approach for a real detection implementation is
  appropriate, since no real detection algorithm/model exists anywhere in
  the repository to compose with — **Confirmed**; Engine 2's
  Implementation phase must follow the same `isReal`/confidence
  disclosure convention as Engine 1 (`isReal:false` where applicable) and
  the `SpeechTranslationProviders` "never fabricate" precedent — no
  fabricated detection result may ship.

### Repair Queue impact of this Review

- `MD-012` — status unchanged (Composed); no change warranted, since
  Compose to Review does not itself implement anything. Owner remains
  "M388 Engine 2 session."
- `MD-016` — unchanged, still open, still correctly non-blocking for
  Engine 2 per this Review's own re-check of item 5/Section 5's
  reasoning.
- `DI-004` — unchanged, still Open/Low, still correctly out of this
  engine's scope.
- No new finding opened by this Review.

## Builder Lifecycle Status (Rule 65, this engine) — updated

- Phase 0 (Repository Verification): Complete.
- Phase 1 (Compose): Complete.
- Phase 2 (Review/Approval): Complete — Approved.
- Phase 3 (Implementation): Unlocked, not started.
- Phase 4-9: Not started.

**Certification — Engine 2 / Language Detection (sub-milestone, updated)**
- Repository Verified: **YES** — Phase 0, plus this Review's own
  independent re-execution of every load-bearing claim.
- Compose Verified: **YES**.
- Review/Approval: **YES — Approved** (not Revised).
- Implementation Verified: **NO** — not started, out of this session's
  explicit scope (Phase 2 only).
- Verification Verified: **NO** — nothing implemented yet.
- New findings this Review: **None.**
- Ready for Next Account: **YES** — begin Engine 2 Phase 3
  (Implementation) per the Implementation Contract above, unrevised. Do
  not start Engine 3 first — it remains blocked behind Engine 2's own
  Phase 9 per Rule 68.

---

## Phase 3 — Implementation (Engine 2)

Per the Implementation Contract, followed item by item:

1. **New file only, under `core/engines/media/language/`:** created
   `core/engines/media/language/language-detection-engine.js` and a
   companion `core/engines/media/language/provider-lexical.js` (same
   engine/provider split Engine 1 used). No existing file was renamed or
   repurposed.
2. **`cozy-live.js`, `cozy-speech.js`, `cozy-translate.js`,
   `core/modules/language/language-engine.js` all left untouched** —
   confirmed by a full `diff -rq` of the extracted repository against
   this session's own pre-Implementation checkout: the only existing file
   that differs is `core/bridge/engine-bridge-bootstrap.js` (item 3
   below); every other file, including all four named above, is
   byte-identical.
3. **Attaches only through `registerSubsystem()`:** `attachToLive(cozyLive)`
   calls `cozyLive.registerSubsystem('CozyLanguage', adapter)` — the
   adapter's `detectLanguage(sourceAudioRef)` method returns exactly
   `{ languageCode }`, matching `relaySpeechSegment()`'s existing read
   (Compose Phase 0 §3) and the shape `ourcozy-live.test.js:773-784`
   already mocks. `cozy-live.js`'s own source is never opened for
   editing.
4. **Honest `isReal`/confidence envelope, no fabricated result (item 4):**
   no acoustic language-ID model exists in this environment (same
   constraint Engine 1 disclosed for real container decode). Real work is
   only ever performed on text that is actually available for a segment
   — either an explicit `options.hintText`, or a duck-typed
   `hintText`/`text`/`transcript`/`captionText` property already present
   on the opaque `audioRef` (never required, never assumed). When real
   text is available: (a) a real, deterministic Unicode-script check
   (Ethiopic block → `am`/Amharic) runs first; (b) otherwise a real,
   computed lexical-overlap heuristic scores the text's actual tokens
   against a small, curated, honestly-partial reference lexicon
   (`en`/`fr`/`sw`/`so`/`ha`/`yo`/`zu`/`lg` only — every other candidate
   code, including `ki`/`kam`/`kln`/`luy`/`luo`/`mas`, is left with no
   fabricated lexicon and will honestly score 0). Confidence is capped at
   0.65 for the lexical heuristic (0.9 for the deterministic script
   match) — never claims certainty the method cannot earn. When no text
   is available at all (the ordinary case, since `sourceAudioRef` is
   opaque raw audio per `cozy-live.js`'s own contract), `detectLanguage()`
   returns an honest `{ languageCode: null, confidence: 0, isReal: false,
   method: 'no-analyzable-signal' }` envelope rather than a guess.
5. **`MD-016` not resolved (item 5):** this Implementation does not
   attempt the audio-buffer → `SpeechRecognitionAdapter` bridge. Engine 2
   consumes whatever `hintText` a caller already happens to have (e.g.
   from an already-run STT pass elsewhere) — it does not itself decode or
   transcribe audio. `MD-016` remains open, unchanged in scope.
6. **`DI-004` not touched (item 6):** `core/language.js:32` is
   unmodified; unrelated pre-existing issue, logged only.

### Files changed this pass

| File | Change |
|---|---|
| `core/engines/media/language/language-detection-engine.js` | New. Engine 2 implementation — `detectLanguage()`, `crossReferenceName()`, `getCapabilities()`, `getServiceManifest()`/`registerWithKernel()`, `attachToLive()`, provider registry, event bus. |
| `core/engines/media/language/provider-lexical.js` | New. Reference provider — real Unicode-script classification; real, deliberately-partial curated lexical-overlap heuristic. |
| `core/engines/media/language/tests/language-detection-engine.test.js` | New. 31 real, executed tests (Phase 4, below). |
| `core/bridge/engine-bridge-bootstrap.js` | Modified — one `REGISTRATIONS` array entry added (`language-detection`). No other line changed. |

No other application file was modified (confirmed by full-repository
`diff -rq`, item 2 above).

---

## Phase 4 — Verification (Engine 2)

Real, executed checks (Rule 61), not assumed:

| Check | Command | Result |
|---|---|---|
| Syntax — new files | `node --check core/engines/media/language/language-detection-engine.js` / `provider-lexical.js` / `tests/language-detection-engine.test.js` | **VERIFIED** — clean |
| Syntax — modified file | `node --check core/bridge/engine-bridge-bootstrap.js` | **VERIFIED** — clean |
| Engine 2 test suite | `node core/engines/media/language/tests/language-detection-engine.test.js` | **VERIFIED** — 31/31 passed. Covers real script classification (Ethiopic vs. Latin), real lexical-overlap detection for every covered language, honest null/zero-confidence results for empty text, unmatched text, and unanalyzable opaque `audioRef`s, `candidateLanguages` restriction, confidence capping, frozen-envelope immutability, event emission, `crossReferenceName()` read-only behavior (including honest null on no match), `getCapabilities()` honesty (`realAcousticDetection:false`), `getServiceManifest()`/`registerWithKernel()`, `attachToLive()` composition into a fake `cozy-live.js`-shaped instance (including the exact `{ languageCode }`-only return shape `relaySpeechSegment()` reads), and provider-registration validation. |
| Regression — Engine 1's own suite, unaffected | `node core/engines/media/decode/tests/media-decode-engine.test.js` | **VERIFIED** — still 23/23 passed, unchanged. Confirms Engine 2 introduced no regression to Engine 1 (no shared file was modified, no shared runtime state). |
| Regression — existing Media Engine suite | `node core/engines/media/tests/media-pipeline-manager.test.js` | **PARTIAL** — fails at the same pre-existing import line as before this Implementation (`background-engine.js` missing, `MD-004`/`MD-009`). Identical failure signature before and after: confirms Engine 2 introduced **no new regression**, since it neither imports from nor is imported by that file. |
| Full-repository diff (item 2, Phase 3) | `diff -rq` of pre- and post-Implementation checkouts | **VERIFIED** — only `core/bridge/engine-bridge-bootstrap.js` differs among pre-existing files; the only new paths are the three files listed above (plus their containing directories). |

**No real acoustic (audio-based) detection assertion was performed** —
this environment has no real acoustic language-ID model to test against
(§ Phase 0/Implementation Contract item 4), so the honest thing to
verify is that the engine correctly discloses *that* (which the test
suite does, exhaustively, via the `isReal:false`/`method:
'no-analyzable-signal'` cases) rather than fabricating an "audio
detection" test that would itself misrepresent this pass's actual
capability. Flagged here rather than silently omitted — same disclosure
pattern Engine 1's own Phase 4 used for real decoded-track assertions.

**Verdict: Phase 3/4 — Complete.** No contradiction between the
Implementation Contract and what Phase 3 discovered; nothing paused on.

---

## Registry updates (Phase 5, Rule 62)

- **`MD-012`** — status updated 🟡 Composed → **🔵 Implementing**
  (`docs/builder/knowledge/repair-queue.md`), matching `MD-009`/Engine 1's
  own precedent (status changes only at real Implementation). Detail:
  real Unicode-script + curated lexical-heuristic detection when text is
  available; honest empty envelope otherwise. Verification done
  (31/31 tests) but Phase 9 Close/final sign-off recorded below, not a
  separate future pass.
- **`MD-016`** — unchanged, still open, still correctly non-blocking (§5
  above).
- **`DI-004`** — unchanged, still Open/Low, still correctly out of this
  engine's scope.
- No new finding opened by Phase 3/4.

## Builder Lifecycle Status (Rule 65, this engine) — final, this pass

```
Phase 0 — Repository Verification      ✅ Complete
Phase 1 — Compose                      ✅ Complete
Phase 2 — Review / Approval            ✅ Complete — Approved
Phase 3 — Implementation               ✅ Complete
Phase 4 — Verification                 ✅ Complete (31/31 new tests; no new regression)
Phase 5 — Registry Updates             ✅ MD-012 updated this pass (see repair-queue.md)
Phase 6 — Reports                      ✅ This document
Phase 7 — Handoff                      ✅ LATEST.md / HANDOFF.md / RELEASES.md updated same pass
Phase 8 — Package                      ✅ Full repository ZIP produced this pass (Rule 67/68)
Phase 9 — Close                        ✅ Complete — Engine 2 closed
```

**Certification — Engine 2 / Language Detection (sub-milestone, final)**
- Repository Verified: **YES**
- Compose Verified: **YES**
- Review/Approval: **YES — Approved** (not Revised)
- Implementation Verified: **YES** — 31/31 real tests pass
- Verification Verified: **YES**
- Ready for Next Account: **YES** — Engine 2 Closed (Phase 9). Per Rule
  68, Engine 3 (Translation Pipeline, absorbs "Living Meaning Engine" per
  `AA-005`) is now unlocked and may begin its own Phase 0. **Not started
  this pass** — no other engine should start first without its own
  Compose/Review, per Rule 65/68.
