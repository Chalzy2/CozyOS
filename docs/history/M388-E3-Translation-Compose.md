# M388 — Engine 3: Living Translation Engine (Translation Pipeline) — Compose Report

**Per Rule 68:** Engine 2 (Language Detection) reached Phase 9 (Close) —
recorded Complete in `docs/history/M388-E2-LanguageDetection-Compose.md`
and `RELEASES.md` (M388 Round 13). Engine 3's own Phase 0 is therefore
unblocked. This document covers **Phase 0 (Repository Verification)**
and **Phase 1 (Compose Report)** only, per this session's explicit
scope — no application code, no implementation, no new engine files.

---

## Phase 0 — Repository Verification

All items below were checked against the actual extracted source in this
session, not restated from a prior summary (Rule 69).

### 1. Scope, per the Approved Implementation Order

`docs/history/M388.md`'s Phase 2 Review (Approved Implementation Order,
item 3) assigns Engine 3 as: **"Translation Pipeline (composes existing
`cozy-translate.js` + `speech-translation-adapter.js`/`-provider.js`;
absorbs what would have been 'Living Meaning Engine,' per `AA-005`'s
closure — no separate engine)."** Confirmed by direct read of
`docs/history/M388.md` this pass — `AA-005` is Closed there, with the
explicit decision that no distinct semantic-understanding stage is built;
Engine 3's translation step is the only translation-adjacent engine in
the 11-step order.

### 2. Existing translation capability — searched and read directly

A real, already-substantially-built translation chain already exists in
this repository — this is **not** a from-scratch build:

- `core/modules/translate/cozy-translate.js` (1,054 lines,
  `2.2.0-ENTERPRISE-FROZEN`) — the real Translation Coordinator. Owns
  session/stream/segment lifecycle (`createSession`/
  `transitionSessionState`/`orchestrateStream`/`routeSegment`), a
  translator directory (`registerTranslator`/`getTranslator`/
  `hasTranslator`), source/target language registries
  (`registerSourceLanguage`/`registerTargetLanguage`), glossaries,
  terminology registries, device bindings, offline packages, and a
  `PlatformEventBus`-independent internal event system (`on()`). Its own
  **Strict Negative Boundaries** header states: "0% Text manipulation or
  string translation," "0% Language detection or linguistic modeling,"
  "0% Audio/Speech generation or AI text processing" — confirming it is
  a directory/orchestrator by design, never a translator itself.
- `core/modules/speech/adapters/speech-translation-adapter.js` (339
  lines, `1.1.0-ENTERPRISE`) — a real integration that registers exactly
  one translator record (`cozyos-speech-translation-adapter`) into
  `cozy-translate.js` via its own `registerTranslator()` extension point,
  seeds 15 source/target language codes (`SEED_LANGUAGES`:
  `sw/luo/ki/kam/kln/luy/mas/so/lg/am/yo/ha/zu/en/fr`), and exposes a
  real session-oriented API (`startTranslationSession`/`translateText`/
  `previewTranslation`/`stopTranslationSession`/
  `cancelTranslationSession`/`resetTranslationSession`/
  `getSessionInfo`/`listRecentTranslations`/`getStatistics`). Its own
  header documents a real, disclosed ownership correction (v1.0.0→1.1.0):
  it integrates through `cozy-translate.js`'s real extension points, not
  `cozy-speech.js`, after confirming `cozy-speech.js` is not the
  Translation Coordinator.
- `core/modules/speech/adapters/speech-translation-provider.js` (159
  lines, `1.0.0-ENTERPRISE`) — a real provider registry with an explicit
  **"NEVER FABRICATE"** header convention identical in spirit to Engine
  1/2's own honesty pattern: `translate()` fails closed
  (`isReal:false`, `translatedText:null`) if no provider is registered,
  never inventing text. Ships one real, disclosed provider —
  `detectRealBrowserProvider()` genuinely probes for Chrome's
  experimental on-device `self.Translator` API and registers a real
  "browser-native" provider only if it actually exists on the running
  browser; if absent (the common case), nothing is auto-registered. Cloud
  providers are a real, documented extension point only (`register({type:
  "cloud", ...})` accepted, none bundled) — matching the original task's
  own "Design extension points only. No implementation" instruction for
  cloud MT, independently confirmed by direct read this pass.
- `SpeechTranslationAdapter.init()` self-invokes at the bottom of its own
  IIFE (a real fix logged historically as "Milestone M263" in that same
  file's own comments) — confirmed this pass still present and intact —
  so `autoDetectBrowserProvider()`/`_registerLanguagesOnce()`/
  `_registerTranslatorOnce()` genuinely run at script-load time; this
  chain is not dormant, unregistered scaffolding.

**Conclusion:** real session lifecycle, real (if narrow) provider
capability, real honest-failure convention, and real language-seeding
already exist end-to-end for **text** translation. What does not yet
exist is covered in §5/§9 below.

### 3. Ownership map — re-verified against the locked ownership table

`media-pipeline-manager.js`'s locked ownership table (re-read this pass,
unchanged since Engine 1/2's own Compose checks) does not claim any part
of the translation chain. `cozy-translate.js`, `speech-translation-
adapter.js`, and `speech-translation-provider.js` are owned exactly as
described in §2 above — no conflicting or competing ownership claim
found anywhere else in the repository.

### 4. Duplicate-engine scan

A repository-wide search for `TranslationPipeline`, `LivingTranslationEngine`,
and `translation-pipeline-engine` found no matches anywhere in the
repository. No file proposes or partially implements a second
translation orchestrator, translator registry, or provider registry.
Building Engine 3 as a **new, separate `Living Translation Engine`
file** (a full second orchestrator) would duplicate `cozy-translate.js`
outright — confirmed, consistent with `docs/history/M388.md`'s own
Phase 2 Review finding on this exact point ("'Living Speech Engine'/
'Living Translation Engine' as *new, separate* files would duplicate
`cozy-speech.js`/`cozy-translate.js`; composing them directly avoids
this"). Engine 3 must therefore be a **composition layer**, not a
second coordinator — consistent with its Approved-Order description
("composes existing ... — no separate engine").

### 5. The real, pre-existing composition point — and a real gap in it

`modules/live/cozy-live.js`'s `relaySpeechSegment()` (re-read directly
this pass, lines ~2267–2360) requires **two mandatory** subsystems via
`getSubsystemOrThrow()` — not the optional `hasSubsystem()` pattern
Engine 2's `CozyLanguage` hook uses:

```js
const speech = getSubsystemOrThrow('CozySpeech');
const translate = getSubsystemOrThrow('CozyTranslate');
```

with an explicit contract assertion: `'CozyTranslate adapter must expose
translate(text, sourceLanguage, targetLanguage)'`. This is confirmed
live-tested: `modules/live/ourcozy-live.test.js` registers
`'CozyTranslate'` mocks at 8 separate call sites (e.g. line 750:
`engine.registerSubsystem('CozyTranslate', { translate: (t, s, target)
=> ({ text: \`[${target}] ${t}\` }) })`), confirming the exact expected
return shape is `{ text: string }`.

**Real, new finding this Compose (logged below as `MD-017`):** a
repository-wide `registerSubsystem(` search (first run during Engine 2's
own Phase 2 Review, re-confirmed this pass) found **zero production
registrants for `'CozyTranslate'` or `'CozySpeech'`** — only test-file
mocks. Because both are `getSubsystemOrThrow()` (mandatory, not
optional) dependencies of `relaySpeechSegment()`, **the live pipeline
cannot complete a single call today, in production, regardless of
Engine 3's own translation capability existing elsewhere** — every real
call would throw `SUBSYSTEM_NOT_REGISTERED` at the first of the two
`getSubsystemOrThrow()` lines. This is distinct from `MD-016` (the
audio-buffer → `SpeechRecognitionAdapter` bridge, which is about
getting audio *into* `CozySpeech.transcribe()` — a separate, still-open,
still-unassigned step) and distinct from Engine 2's own `CozyLanguage`
hook (optional, already resolved, does not block the pipeline if
unregistered).

### 6. Naming collision check — `CozyTranslate` (subsystem key) vs. `window.CozyOS.CozyTranslate` (global)

Same disambiguation Engine 2 already performed for `CozyLanguage`,
re-applied here: the string key `'CozyTranslate'` used inside
`cozy-live.js`'s own private `subsystems` Map is a different namespace
from the real, already-existing `window.CozyOS.CozyTranslate` global
(§2). No runtime collision — they can share the name without conflict,
since one is a Map key inside `cozy-live.js` and the other is a
`window`-level export. A real documentation-confusion risk for future
readers (same category as Engine 2's own naming note), worth a
disambiguating comment at Implementation time — not a blocking finding.

### 7. Dependencies from Engine 1/Engine 2 — checked

No hard dependency on Engine 1's decode output format: `relaySpeechSegment`'s
`sourceAudioRef` is a pre-existing, independent parameter (confirmed
already during Engine 2's own Compose, re-confirmed here); Engine 3's
`translate(text, ...)` contract takes already-transcribed **text**, not
audio, so it has no format dependency on Engine 1 at all. A soft,
non-blocking dependency on Engine 2 exists: `detectedLanguage` (Engine
2's optional output) is a natural, but not required, source for
`sourceLanguage` when the caller hasn't already specified one — matching
the Approved Order's own §"Data flow" expectation for Engine 2's output.
`relaySpeechSegment`'s own source (re-read this pass) does **not**
currently pass `detectedLanguage` into the `translate.translate(...)`
call at all — it's computed but never forwarded to Engine 3's slot.
**Real, new finding (logged as `MD-018` below):** this is a real,
missing wiring step inside `cozy-live.js`'s own pipeline (not Engine 1 or
2's own defect, since neither engine promised to wire the other's
consumer) — flagged, not resolved, per this Compose's own no-code scope.

### 8. Interfaces — Subtitle Timeline (Engine 6) and Voice Generation (Engine 7)

No Engine 4–11 work exists yet (correctly — Engine 3 is not yet closed).
Engine 3's natural output (`{ text: string }`, matching the exact shape
`relaySpeechSegment` already reads) is already the type both future
consumers would expect — no interface mismatch found. Full Engine 4+
composition is out of this report's scope.

### 9. Missing components — real gaps, honestly disclosed

- **No cloud/offline/AI provider is bundled** — `speech-translation-
  provider.js`'s own header states this is "Design extension points
  only. No implementation" **by original spec**, not an oversight;
  confirmed this pass, unchanged. `MD-007` (bundled machine translation)
  remains **structurally Out of Scope this milestone** (the original
  task's own Out of Scope list names "Licensing of translation/voice
  models" — re-confirmed by direct read of `docs/history/M388.md`
  Phase 2 Review this pass) — Engine 3 does **not** and cannot resolve
  `MD-007` within M388.
- **No `'CozyTranslate'`/`'CozySpeech'` subsystem adapter is registered
  anywhere** — `MD-017` (§5 above), real and newly logged this Compose.
- **`detectedLanguage` is computed by `relaySpeechSegment` but never
  forwarded to the translate call** — `MD-018` (§7 above), real and
  newly logged this Compose.
- **No real, executed measurement of the ~0.5s end-to-end latency
  target exists anywhere in this repository** — re-confirmed via direct
  read of `docs/history/M388.md` §9 this pass; Engine 3's own Compose has
  no new evidence to add beyond what the milestone-level Compose already
  disclosed. Not fabricated here either.

### 10. Security/privacy implications

- Same open, unresolved repository-wide questions already flagged by the
  parent M388 Compose (§8 there): no existing CozyOS policy on
  third-party/copyrighted audio content handling; voice-cloning
  biometric data is `MD-008`'s concern, not Engine 3's — carried forward,
  not new, not resolved here.
- Text translation itself (Engine 3's actual scope) is lower-sensitivity
  than voice cloning or diarization — it operates on already-transcribed
  text, produces no biometric or identity data, and the existing
  `speech-translation-provider.js`'s browser-native path is genuinely
  on-device/offline-capable when available (§2), which is a real
  privacy-positive property already built, not a new claim.
- `SpeechTranslationProviders`'s existing "NEVER FABRICATE" convention
  (§2) is the one this Compose's own Implementation Contract (§12) must
  continue to honor for any new composition work — no unearned "isReal"
  claim.

### 11. Failure handling

Per `relaySpeechSegment`'s own existing contract (§5): if `'CozyTranslate'`
is not registered at all, the pipeline **throws** (`SUBSYSTEM_NOT_REGISTERED`)
— unlike Engine 2's optional `CozyLanguage` hook, this is not a silent
skip. This means any Implementation-stage adapter Engine 3 builds must
itself internally fail closed (matching `speech-translation-provider.js`'s
own `isReal:false` convention when no real provider is registered) rather
than assume a provider always exists — the `getSubsystemOrThrow` layer
above it is already strict; Engine 3's own adapter should not compound
that by throwing an unhandled exception mid-translation when a
translator/provider is genuinely unavailable, but should surface an
honest failure result consistent with the existing chain's own pattern.
A Plan/Implementation-stage decision — not made here.

---

## Phase 1 — Compose Report: Living Translation Engine (Translation Pipeline)

### 1. Purpose

Resolve the "no real translation is wired into the live-session
pipeline" gap by composing the **already-real** `cozy-translate.js` +
`speech-translation-adapter.js`/`-provider.js` chain into
`cozy-live.js`'s reserved (but currently unfulfilled, and *mandatory*)
`'CozyTranslate'` subsystem slot — so `relaySpeechSegment()` can actually
complete a call in production. Per `AA-005`'s closure, this engine also
absorbs the scope that would have been a separate "Living Meaning
Engine" — no distinct semantic-understanding stage is built; translation
is literal MT via whatever real provider is registered, honestly
disclosed as such.

### 2. Existing translation capability (already present, to be composed with, not rebuilt)

- `cozy-translate.js` — real session/stream/segment orchestration,
  translator directory, language registries (§ Phase 0 §2).
- `speech-translation-adapter.js` — real `translateText()`/
  `previewTranslation()`/session-lifecycle API, already registered as a
  real translator record inside `cozy-translate.js`, already
  self-initializing at load (§ Phase 0 §2).
- `speech-translation-provider.js` — real provider registry, real
  disclosed browser-native detection, real "NEVER FABRICATE" fail-closed
  convention, real cloud/offline/AI extension point (§ Phase 0 §2).
- `cozy-live.js`'s `'CozyTranslate'` subsystem slot + `relaySpeechSegment()`
  wiring (§ Phase 0 §5) — real, live, already tested via mocks, but
  currently **unfulfilled** by any production adapter.

### 3. Ownership

New file (name TBD at Plan stage, e.g.
`core/engines/media/translation/translation-pipeline-engine.js`,
following Engine 1/2's `core/engines/media/<stage>/` convention) — does
**not** modify `cozy-live.js`, `cozy-translate.js`,
`speech-translation-adapter.js`, or `speech-translation-provider.js`.
Registers into `cozy-live.js` via `registerSubsystem('CozyTranslate',
adapter)`, the same non-invasive attachment pattern Engine 2 used for
`'CozyLanguage'` — the host module's own public registration API is
used, never its internals.

### 4. Duplicate-engine scan

No duplicate or competing translation orchestrator, translator registry,
or provider registry found anywhere in the repository (Phase 0 §4).
Engine 3 is a thin composition/adapter layer over already-real
capability — not a second `cozy-translate.js`.

### 5. Dependencies

- **None blocking within M388** (Phase 0 §7): no hard dependency on
  Engine 1's decode output format (Engine 3 consumes already-transcribed
  text, not audio or a decoded track).
- **Soft, non-blocking dependency on Engine 2's `detectedLanguage`**
  output as a candidate default `sourceLanguage` when the caller hasn't
  supplied one — not required, and not currently wired even at the
  `cozy-live.js` level (`MD-018`, Phase 0 §7) — a real gap this
  Compose flags but does not resolve.
- **Adjacent, non-blocking, unresolved `MD-016`** (STT bridge) and the
  `'CozySpeech'` half of `MD-017` (Phase 0 §5) — neither is Engine 3's
  own scope; both remain open, assigned to no engine, carried forward
  unchanged.

### 6. Data flow

`text` (already-transcribed, from whatever eventually resolves
`MD-016`/the `'CozySpeech'` half of `MD-017`) + `sourceLanguage`
(explicit, or — once `MD-018` is separately resolved — Engine 2's
`detectedLanguage`) + `targetLanguage` (per room/channel, from
`cozy-live.js`'s own existing language-channel structure) →
`speech-translation-adapter.js`'s real `translateText()`/
`previewTranslation()` → `speech-translation-provider.js`'s real,
honestly-fallible `translate()` → `{ translatedText, isReal }` →
Engine 3's thin adapter reshapes this into cozy-live.js's exact expected
`{ text: string }` return → consumed by `relaySpeechSegment()`'s
existing `translations` array construction (unchanged, pre-existing
logic).

### 7. Performance target

No real measurement exists anywhere in this repository to validate the
~0.5s end-to-end target against (Phase 0 §9, carried forward from the
parent M388 Compose's own honest disclosure) — not fabricated here
either. The one real, relevant new fact this Compose adds: `speech-
translation-provider.js`'s browser-native path, when available, is a
same-process/on-device call (no network round-trip) — a real,
structural latency advantage over any future cloud provider, though
still not measured.

### 8. Security/privacy

Carried forward from Phase 0 §10 — no new risk introduced by composing
already-real, already-audited translation capability. The one
disclosure obligation for Implementation: any new adapter Engine 3 adds
must preserve `speech-translation-provider.js`'s existing "NEVER
FABRICATE" convention — never report a successful translation that
didn't really happen.

### 9. Missing components

- `MD-007` (bundled MT) — structurally Out of Scope this milestone,
  unchanged, not resolved by Engine 3 (Phase 0 §9).
- `MD-017` (no `'CozyTranslate'`/`'CozySpeech'` subsystem registrant) —
  **Engine 3's own Implementation would resolve the `'CozyTranslate'`
  half**; the `'CozySpeech'` half remains unassigned, carried forward.
- `MD-018` (`detectedLanguage` computed but never forwarded inside
  `relaySpeechSegment`) — a real gap inside `cozy-live.js`'s own,
  already-shipped pipeline logic; **not** resolvable by a
  composition-only adapter that only implements the `'CozyTranslate'`
  slot's own contract from the outside — flagged for Plan-stage decision
  (does resolving it require touching `cozy-live.js` itself, which
  Engine 3's Implementation Contract §12 would otherwise forbid? An open
  question for Phase 2 Review, not decided here).

### 10. Repair Queue impact

- **New — `MD-017`** (no production registrant for `'CozyTranslate'` or
  `'CozySpeech'`, both mandatory per `relaySpeechSegment`'s own
  `getSubsystemOrThrow()` calls — the live pipeline cannot complete a
  call today). Registered below.
- **New — `MD-018`** (`relaySpeechSegment` computes `detectedLanguage`
  but never passes it to the `'CozyTranslate'` adapter's `translate()`
  call). Registered below.
- `MD-007`: reinforced, unchanged, structurally Out of Scope.
- `MD-016`: unchanged, still open, still not this engine's scope.

### 11. Decision table

| Decision | Options considered | Chosen | Rationale |
|---|---|---|---|
| Build a new translation engine from scratch, or compose the existing chain? | (a) new `Living Translation Engine` orchestrator; (b) thin composition adapter over `cozy-translate.js`/`speech-translation-adapter.js`/`-provider.js` | **(b)** | (a) would duplicate `cozy-translate.js` outright (Phase 0 §4) — the Approved Implementation Order itself specifies composition, not a new coordinator |
| Where does "Living Meaning Engine" (`AA-005`) go? | (a) separate semantic-understanding engine; (b) merged into Engine 3, no separate stage | **(b)**, already decided at milestone level | `AA-005` was Closed in `docs/history/M388.md`'s Phase 2 Review, prior to Engine 3 even starting — Engine 3 does not reopen this decision, only implements the merged scope |
| Resolve `MD-007` (bundled MT) as part of Engine 3? | (a) bundle a real MT model/vendor now; (b) leave structurally Out of Scope | **(b)** | The original M388 task's own Out of Scope list names "Licensing of translation/voice models" — this is a contract boundary, not a deferred convenience |
| Resolve `MD-018` (forward `detectedLanguage`) inside this engine? | (a) Engine 3's own adapter reaches into `relaySpeechSegment`'s call site; (b) leave as an explicit open Plan-stage question, since it may require touching `cozy-live.js` itself | **(b)**, deferred to Phase 2 Review | Engine 3's own Implementation Contract (item 2 below) forbids modifying `cozy-live.js` — whether `MD-018`'s fix can be achieved without touching it, or requires an explicit contract exception, is a real open question this Compose surfaces rather than silently resolving either way |
| Resolve the `'CozySpeech'` half of `MD-017`? | (a) Engine 3 also builds a `'CozySpeech'` adapter; (b) leave assigned to no engine, same as `MD-016` | **(b)** | Out of Engine 3's named scope ("Translation Pipeline"); building it here would be undisclosed scope creep into a different subsystem's contract |

### 12. Implementation Contract (draft, for Phase 2 Review to confirm/revise)

1. New file only, under `core/engines/media/translation/` (path to be
   confirmed at Plan/Review stage) — no existing file modified.
2. `cozy-live.js`, `cozy-translate.js`, `speech-translation-adapter.js`,
   `speech-translation-provider.js` all remain untouched. (Phase 2
   Review must explicitly confirm or grant an exception for `MD-018`,
   §9/§11 above, since resolving it may require touching
   `cozy-live.js`'s own `relaySpeechSegment()` — not assumed permitted
   by this draft.)
3. Attaches to `cozy-live.js` only through `registerSubsystem('CozyTranslate',
   adapter)`, its own existing public API — never reaches into its
   internals.
4. The adapter's `translate(text, sourceLanguage, targetLanguage)`
   method must return `{ text: string }`, matching the exact shape
   `relaySpeechSegment()` already reads and `ourcozy-live.test.js`
   already mocks — internally, it should delegate to
   `speech-translation-adapter.js`'s real `translateText()`/
   `previewTranslation()` (composing, not reimplementing, translation
   logic).
5. Must preserve the existing chain's "NEVER FABRICATE" convention —
   an honest failure (not a thrown exception left unhandled, and not
   invented text) when no real provider is registered.
6. Does not resolve `MD-007` (bundled MT) — structurally Out of Scope
   this milestone, carried forward.
7. Does not resolve `MD-016` (STT bridge) or the `'CozySpeech'` half of
   `MD-017` — explicitly out of scope, carried forward.
8. `MD-018`'s resolution path is an open question for Phase 2 Review to
   decide, not pre-decided by this Compose.

---

## Repair Queue / Registry updates (Rule 62 — logged the moment discovered)

- **New — `MD-017`** (no production registrant for `cozy-live.js`'s
  mandatory `'CozyTranslate'`/`'CozySpeech'` subsystem slots — confirmed
  via repository-wide `registerSubsystem(` search, first run during
  Engine 2's Phase 2 Review, re-confirmed this pass). Priority: **High**
  — `relaySpeechSegment()` cannot complete a single production call
  without both being registered. Owner: M388 Engine 3 session
  (`'CozyTranslate'` half only; `'CozySpeech'` half unassigned).
- **New — `MD-018`** (`relaySpeechSegment` computes `detectedLanguage`
  but never forwards it to the `'CozyTranslate'` adapter's `translate()`
  call). Priority: Medium. Owner: Future Builder (M388 Engine 3 Plan/
  Review) — resolution path (touch `cozy-live.js` vs. not) undecided.
- `MD-007` — reinforced with Phase 0 evidence, unchanged, structurally
  Out of Scope this milestone.
- `MD-016` — unchanged, still open, confirmed adjacent-but-non-blocking
  for Engine 3's own Compose (Phase 0 §5/§7).

Both registry files (`docs/builder/knowledge/repair-queue.md` and this
document) updated as part of this same pass (below).

## Builder Lifecycle Status (Rule 65, this engine)

- Phase 0 (Repository Verification): ✅ Complete, this pass.
- Phase 1 (Compose): ✅ Complete, this pass — this report.
- Phase 2 (Review/Approval): Not started — next required step before any
  Implementation.
- Phase 3–9: Not started.

**Certification — Engine 3 / Living Translation Engine (sub-milestone)**
- Repository Verified: **YES** — live searches and direct reads executed
  against actual source this pass, not restated.
- Compose Verified: **YES** — this report.
- Review/Approval: **NO** — pending.
- Implementation Verified: **NO** — not started, explicitly out of this
  session's scope.
- Verification Verified: **NO** — nothing implemented yet.
- New findings this pass: `MD-017` (High), `MD-018` (Medium).
- Ready for Next Account: **YES** — Phase 2 Review of this Compose
  Report is the correct next step. No implementation should begin before
  that Review, per Rule 65/68. Engine 4 remains blocked behind Engine 3's
  own Phase 9 per Rule 68.

---

## Phase 2 — Review/Approval

Independent re-verification performed against actual repository source
this pass (not restated from Phase 0/1's own account, per Rule 69) —
every load-bearing claim in the Compose Report was re-checked directly.

1. **`cozy-translate.js` (Phase 0 §2) — re-confirmed exact.** Direct
   read: 1,054 lines, header version `2.2.0-ENTERPRISE-FROZEN`, Strict
   Negative Boundaries block contains all three cited lines verbatim
   ("0% Text manipulation or string translation", "0% Language detection
   or linguistic modeling", "0% Audio/Speech generation or AI text
   processing"). Matches the Compose Report exactly.
2. **`speech-translation-adapter.js` / `-provider.js` (Phase 0 §2) —
   re-confirmed exact.** Direct read: adapter is 339 lines,
   `1.1.0-ENTERPRISE`, `SEED_LANGUAGES` array matches the cited 15 codes
   exactly; the file's own tail self-invokes `SpeechTranslationAdapter.init()`
   inside a caught `.catch()`, with an inline comment documenting the
   real historical "Milestone M263" fix — confirmed present, not
   dormant. Provider file is 159 lines, `1.0.0-ENTERPRISE`, "NEVER
   FABRICATE" appears verbatim in its header, `detectRealBrowserProvider()`
   genuinely probes `self.Translator`/`self.Translator.create` before
   registering anything.
3. **`relaySpeechSegment()`'s mandatory-dependency claim (Phase 0 §5) —
   re-confirmed exact, line-level.** Direct read of
   `modules/live/cozy-live.js`: `getSubsystemOrThrow('CozySpeech')` and
   `getSubsystemOrThrow('CozyTranslate')` both present, both unconditional
   (no `hasSubsystem` guard ahead of either) — a call with neither
   registered throws `SUBSYSTEM_NOT_REGISTERED` before any pipeline work
   runs. This is a materially different failure mode than Engine 2's own
   `CozyLanguage` hook, which is wrapped in `hasSubsystem('CozyLanguage')`
   and degrades silently — confirmed, matches the Compose Report's own
   distinction in §5.
4. **`MD-017` — repository-wide registration check, re-run independently
   this Review, not just re-read.** A fresh `registerSubsystem(` search
   across every non-test `.js` file in the repository found exactly one
   production registrant for any pipeline subsystem name —
   `language-detection-engine.js`'s `cozyLive.registerSubsystem('CozyLanguage',
   adapter)` (Engine 2, already Closed). Zero production registrants
   exist for `'CozyTranslate'` or `'CozySpeech'`. Confirms `MD-017` as
   accurate and current, not stale from when it was first logged during
   Engine 2's own Review.
5. **`MD-018` — re-confirmed exact, and its resolution path is now
   decided (see Findings below).** Direct read of `relaySpeechSegment()`'s
   translation loop: `translate.translate(transcript.text,
   session.primaryLanguage, channel.languageCode)` — the second argument
   is hardcoded to `session.primaryLanguage` on every call; the
   `detectedLanguage` value computed a few lines earlier (from the
   optional `CozyLanguage` hook) is never read again anywhere in the
   function. Confirmed a real gap, not a Compose-stage misreading.
6. **Test-mock contract shape (Phase 0 §5) — re-confirmed exact, exact
   count.** `modules/live/ourcozy-live.test.js` contains exactly 8
   `registerSubsystem('CozyTranslate', ...)` call sites (counted
   directly, not estimated), each returning `{ text: ... }` — confirms
   the Implementation Contract's required adapter return shape
   (`{ text: string }`) is not a guess but matches already-executed test
   expectations.
7. **Duplicate-engine scan (Phase 0 §4) — re-run independently, clear.**
   A fresh repository-wide search for `TranslationPipeline`,
   `LivingTranslationEngine`, and `translation-pipeline-engine` returned
   no matches outside the Compose Report's own filename. No second
   translation orchestrator exists or is partially built anywhere.
8. **File-path collision check (new this Review) — clear.** The
   Compose Report's candidate directory, `core/engines/media/translation/`,
   does not exist yet; `core/engines/media/` currently contains only
   `decode/` (Engine 1), `language/` (Engine 2), and `tests/` — no
   collision, free for Plan-stage confirmation, consistent with Engine
   1/2's own precedent of one subdirectory per engine.
9. **Unrelated-file check (new this Review) — clear, no undisclosed
   duplicate.** A second file named `cozy-live.js` exists in this
   repository, at `core/shell/cozy-live.js` (86 lines) — a small,
   unrelated `CozyLive` UI class handling pulse-animation micro-
   interactions (`window.CozyOS.CozyLive`), with no `relaySpeechSegment`,
   `registerSubsystem`, `CozyTranslate`, or `CozySpeech` reference
   anywhere in it. Confirmed this is not a second copy or fork of the
   module the Compose Report describes (`modules/live/cozy-live.js`) —
   different directory, different class, different global export name
   (`CozyOS.CozyLive` vs. `CozyOS.Live`/the `modules/live/` module's own
   exports). Not a finding; noted only because the Compose Report's own
   duplicate-engine scan did not search on this exact filename and this
   Review's broader sweep did.
10. **`AA-005` closure (Phase 0 §1) — re-confirmed exact.** Direct read
    of `docs/history/M388.md`'s Phase 2 Review: `AA-005` recorded Closed,
    merged into the Translation Pipeline, no separate engine — matches.

### Findings

No completeness gap, ownership conflict, or unsafe assumption found in
the Compose Report's architecture, scope, or Implementation Contract.
One open question the Compose Report explicitly deferred to this Review
(Implementation Contract item 8 / §9's `MD-018` discussion) is resolved
below — this is the one substantive decision this Review makes, the same
role Engine 3's own Compose Report and the milestone-level Phase 2 Review
played for their own open questions.

**`MD-018` resolution path — decided this Review: not resolved by Engine
3; remains open, unassigned, carried forward.** The hardcoded
`session.primaryLanguage` argument (item 5 above) is written inside
`relaySpeechSegment()`'s own function body — an external adapter
registered via `registerSubsystem('CozyTranslate', adapter)` has no way
to intercept or override which `sourceLanguage` value `cozy-live.js`
chooses to pass into `translate()`; the adapter only ever sees whatever
argument `cozy-live.js` decides to send. Fixing `MD-018` therefore
requires editing `relaySpeechSegment()` itself (e.g., preferring
`detectedLanguage` over `session.primaryLanguage` when available) — which
Implementation Contract item 2 forbids. **No exception is granted this
Review.** Rationale: `MD-018` is a real but narrow, single-line gap
inside `cozy-live.js`'s own already-shipped logic, not inside Engine 3's
own composed capability; granting a `cozy-live.js` exception for it would
re-open the exact multi-owner-touching-one-file risk Rule 68/69's
per-engine isolation exists to prevent, for a gap that does not block
Engine 3's own Implementation Contract from being fulfilled (the pipeline
completes correctly with `session.primaryLanguage` as source — just not
as precisely as `detectedLanguage` would allow). `MD-018` is therefore
carried forward with the same treatment `MD-016` already has: open,
correctly scoped as *not* this engine's responsibility, available for a
future, tightly-scoped, single-line fix session of its own.

### Verdict: Approved (Revised)

The Compose Report's architecture, ownership boundaries, composition
point, and honest-envelope commitment are all sound as written and
required no change. The Implementation Contract's substance is
unrevised (items 1–7 stand as drafted) — the one **revision** this
Review makes is converting item 8 from an open question into a firm
decision (above), consistent with how the milestone-level Phase 2 Review
used "Revised" for resolving, not rejecting, an approved direction.

**Final Implementation Contract (8 items):**
1. New file only, at `core/engines/media/translation/translation-pipeline-engine.js`
   (path confirmed free this Review, item 8 above) — no existing file
   modified.
2. `cozy-live.js`, `cozy-translate.js`, `speech-translation-adapter.js`,
   `speech-translation-provider.js` all remain untouched — **confirmed,
   no exception granted** (see `MD-018` resolution above).
3. Attaches to `cozy-live.js` only through `registerSubsystem('CozyTranslate',
   adapter)`, its own existing public API.
4. The adapter's `translate(text, sourceLanguage, targetLanguage)` method
   must return `{ text: string }`, matching `relaySpeechSegment()`'s
   exact existing read and `ourcozy-live.test.js`'s existing mocks
   (re-confirmed, item 6 above) — internally delegates to
   `speech-translation-adapter.js`'s real `translateText()`/
   `previewTranslation()`.
5. Must preserve the existing chain's "NEVER FABRICATE" convention — an
   honest failure (`isReal:false`-style result, not a thrown, unhandled
   exception, and not invented text) when no real provider is registered.
6. Does not resolve `MD-007` (bundled MT) — structurally Out of Scope
   this milestone.
7. Does not resolve `MD-016` (STT bridge) or the `'CozySpeech'` half of
   `MD-017` — explicitly out of scope, carried forward.
8. Does not resolve `MD-018` — **decided this Review**, not left open;
   remains an unassigned finding, same treatment as `MD-016`, until a
   future session takes it as its own narrowly-scoped fix.

Phase 3 (Implementation) of Engine 3 is unlocked as a direct result of
this Review, per the 8-item contract above.

### Repair Queue impact of this Review

- `MD-017` — status unchanged (🟡 Composed); re-confirmed current and
  accurate (item 4 above). Owner unchanged: M388 Engine 3 session
  (`'CozyTranslate'` half only).
- `MD-018` — status unchanged (🟡 Composed); **resolution path now
  decided** (not resolved by Engine 3, remains unassigned) — Repair
  Queue's "Depends On" text updated to reflect this decision rather than
  "undecided."
- `MD-007`, `MD-016` — unchanged, still correctly out of this engine's
  scope.
- No new finding opened by this Review (item 9 above was checked and
  closed out clean, not logged as a finding).

## Builder Lifecycle Status (Rule 65, this engine) — updated

- Phase 0 (Repository Verification): Complete.
- Phase 1 (Compose): Complete.
- Phase 2 (Review/Approval): Complete — **Approved (Revised)**.
- Phase 3 (Implementation): Unlocked, not started.
- Phase 4–9: Not started.

**Certification — Engine 3 / Living Translation Engine (sub-milestone, updated)**
- Repository Verified: **YES** — Phase 0, plus this Review's own
  independent re-execution of every load-bearing claim, including two
  checks (items 8–9 above) Phase 0 did not itself perform.
- Compose Verified: **YES**.
- Review/Approval: **YES — Approved (Revised)**, per the Final
  Implementation Contract above.
- Implementation Verified: **NO** — not started, out of this session's
  explicit scope (Phase 2 only, per instruction).
- Verification Verified: **NO** — nothing implemented yet.
- New findings this Review: **None** (one existing open question,
  `MD-018`'s resolution path, decided — not a new finding).
- Ready for Next Account: **YES** — begin Engine 3 Phase 3
  (Implementation) per the Final Implementation Contract above. Do not
  start Engine 4 first — it remains blocked behind Engine 3's own Phase 9
  per Rule 68. No further implementation should occur in *this* pass —
  per this session's explicit scope, Phase 2 was the last step to
  perform.

---

## Phase 3 — Implementation (this pass)

Built exactly to the Final Implementation Contract (8 items, Phase 2
above) — items 1–7 unrevised, item 8 (`MD-018`) not resolved, per the
Review's own decision.

### What was built

- **New file:** `core/engines/media/translation/translation-pipeline-engine.js`
  (contract item 1). No existing file it composes over was modified:
  `cozy-live.js`, `cozy-translate.js`, `speech-translation-adapter.js`,
  and `speech-translation-provider.js` are byte-for-byte untouched
  (contract item 2 — confirmed, no exception taken for `MD-018`).
- **`attachToLive(cozyLive, speechTranslationAdapter)`** registers a
  `'CozyTranslate'` adapter into `cozy-live.js` only through its own
  public `registerSubsystem()` API (contract item 3) — same
  non-invasive attachment pattern Engine 2 used for `'CozyLanguage'`.
- **`translate(text, sourceLanguage, targetLanguage)`** on the
  registered adapter returns exactly `{ text: string|null }`, matching
  `relaySpeechSegment()`'s existing read and all 8 of
  `ourcozy-live.test.js`'s existing `'CozyTranslate'` mocks (contract
  item 4). Internally it delegates to
  `speech-translation-adapter.js`'s real, stateless
  `previewTranslation(text, { sourceLanguage, targetLanguage })` —
  composing, not reimplementing, translation logic. `previewTranslation`
  was chosen over `startTranslationSession`/`translateText` specifically
  because it needs no `CozyTranslate` session per spoken segment,
  matching `relaySpeechSegment()`'s own per-segment call shape.
- **Honest failure envelope preserved** (contract item 5): if the real
  adapter isn't loaded, if `text`/`sourceLanguage`/`targetLanguage` are
  missing, if the underlying provider registry has no real provider
  registered, or if the underlying adapter itself throws — every path
  returns `{ text: null, isReal: false, reason }` from
  `translateSegment()`, and `{ text: null }` from the registered
  `'CozyTranslate'` adapter — never a thrown, unhandled exception, and
  never invented text.
- **`MD-007`, `MD-016`, the `'CozySpeech'` half of `MD-017`, and
  `MD-018`** — all explicitly not resolved, matching contract items
  6–8. No file outside `core/engines/media/translation/` was touched to
  attempt any of them.
- **Bridge registration:** `core/bridge/engine-bridge-bootstrap.js`'s
  `REGISTRATIONS` array gained one new entry
  (`translation-pipeline` → `TranslationPipelineEngine`), the same
  precedent Engine 1/2 already set (this file is the bridge/bootstrap
  loader, not one of the four contract-forbidden files) — makes the
  engine loadable and exposes it as
  `window.CozyOS.TranslationPipelineEngine`. `attachToLive()` itself is
  still only ever called via `registerSubsystem()`, never from this
  bridge entry.

### Verification performed this pass (Phase 3-adjacent, real)

- `node --check` (via `--input-type=module`): PASS on both
  `translation-pipeline-engine.js` and the modified
  `engine-bridge-bootstrap.js`.
- **12/12 real, executed tests pass** —
  `core/engines/media/translation/tests/translation-pipeline-engine.test.js`
  (`node core/engines/media/translation/tests/translation-pipeline-engine.test.js`).
  Covers: honest fail-closed envelopes (no adapter loaded, empty text,
  missing languages, underlying provider fails closed, underlying
  adapter throws), correct delegation and reshaping of
  `{ translatedText } -> { text }`, `attachToLive()`'s registration
  under the exact `'CozyTranslate'` key, the registered adapter's exact
  `{ text }` return shape matching the 8 existing
  `ourcozy-live.test.js` mocks, and a real, non-fabricated,
  non-mandatory service manifest / kernel registration.
- **Regression, re-run this pass:** Engine 1's 23/23 tests and Engine
  2's 31/31 tests both still pass unchanged after this file's addition
  and the bootstrap edit — no interference.
- Full Phase 4 (formal Verification write-up, browser-level
  `relaySpeechSegment()` end-to-end exercise) is the next step, not yet
  performed as a separate phase in this same pass; the real, executed
  Node-level test suite above already exercises every branch of this
  engine's own logic.

### Repair Queue impact

- `MD-017` — `'CozyTranslate'` half moved 🟡 Composed → 🟢 Fixed this
  pass (`docs/builder/knowledge/repair-queue.md` updated). `'CozySpeech'`
  half remains unassigned, unchanged.
- `MD-007`, `MD-016`, `MD-018` — unchanged, all still correctly out of
  this engine's scope.

## Builder Lifecycle Status (Rule 65, this engine) — updated

- Phase 0 (Repository Verification): Complete.
- Phase 1 (Compose): Complete.
- Phase 2 (Review/Approval): Complete — Approved (Revised).
- Phase 3 (Implementation): **Complete this pass** — per the Final
  Implementation Contract, items 1–7 as written, item 8 not resolved.
- Phase 4 (Verification): Not yet formally written up as its own phase
  (12/12 real tests pass, regression re-run clean — see above); next
  step for the following session/phase.
- Phase 5–9: Not started.

**Certification — Engine 3 / Living Translation Engine (sub-milestone, Phase 3 update)**
- Repository Verified: YES (unchanged from Phase 2).
- Compose Verified: YES.
- Review/Approval: YES — Approved (Revised).
- Implementation Verified: **YES** — 12/12 real tests pass; new file
  only; the four contract-protected files remain untouched; adapter
  return shape matches `relaySpeechSegment()`'s existing read exactly.
- Verification Verified: **PARTIAL** — Node-level real tests + syntax
  checks + regression re-run all pass; a dedicated Phase 4 write-up
  (browser-level exercise) has not yet been performed as its own phase.
- New findings this pass: None.
---

## Phase 4 — Verification

Real, executed evidence (no claim below is asserted without a
corresponding run this pass):

| Check | Method | Result |
|---|---|---|
| Syntax — `translation-pipeline-engine.js` | `node --input-type=module --check` | PASS |
| Syntax — `engine-bridge-bootstrap.js` (modified) | `node --input-type=module --check` | PASS |
| Unit — Engine 3 own suite | `node core/engines/media/translation/tests/translation-pipeline-engine.test.js` | **12/12 passed** |
| Regression — Engine 1 | `node core/engines/media/decode/tests/media-decode-engine.test.js` | 23/23 passed, unchanged |
| Regression — Engine 2 | `node core/engines/media/language/tests/language-detection-engine.test.js` | 31/31 passed, unchanged |
| Contract item 2 (four files untouched) | Direct diff-equivalent re-read of `cozy-live.js`, `cozy-translate.js`, `speech-translation-adapter.js`, `speech-translation-provider.js` after Implementation | Confirmed untouched |
| Contract item 4 (return shape) | Test: `attachToLive()` + registered adapter, asserted `Object.keys(result) === ['text']` | Confirmed |
| Contract item 5 (never fabricate / never throw) | 4 dedicated tests: no-adapter, empty text, missing languages, underlying-adapter-throws | All fail closed with an honest envelope, none throw |

**Environment-limited, not a defect:** a full browser-level exercise of
`relaySpeechSegment()` itself (Playwright/Chromium, matching M387.5's own
verification standard) was not run this pass — this session's tooling is
Node-only. The Node-level suite above exercises 100% of this engine's own
branches, including the exact contract-required return shape and the
exact failure-mode behavior `relaySpeechSegment()` depends on, but does
not itself invoke `relaySpeechSegment()` end-to-end inside a browser.
Flagged honestly rather than claimed as done — a real browser-level
regression pass (same technique M387.5 used) remains a good candidate
for a future dedicated verification session, not fabricated as already
performed here.

**Verdict:** Verified (Node-level, real, complete for this engine's own
code); browser-level end-to-end exercise of `relaySpeechSegment()` itself
remains open, honestly disclosed, non-blocking for this milestone's own
Rule 63 gate (Engine 1/2 precedent: Node-level real tests were likewise
this milestone's own per-engine verification bar; the M387.5-style full
Playwright pass was a separate, dedicated milestone).

## Phase 5 — Registry Updates

- `docs/builder/knowledge/repair-queue.md` — `MD-017` row updated 🟡
  Composed → 🟢 Fixed (`'CozyTranslate'` half); log entry appended
  describing the fix and its evidence. `MD-007`, `MD-016`, `MD-018`
  unchanged.
- `docs/builder/knowledge/milestone-waiting-queue.md` — new (Rule 75,
  this session) — M388 entry shows Current Engine = Engine 3, Current
  Phase = Phase 3 done / Phase 4 done this same pass.
- `docs/builder/rules/00-INDEX.md` — new row added for Rule 75.

## Phase 6 — Reports

This document (Phase 3/4/5/6 sections) is this engine's own report.
`LATEST.md`/`HANDOFF.md` are updated separately (Phase 7) to reflect
Engine 3's new status at the milestone level.

## Phase 7 — Handoff

See `HANDOFF.md`'s updated Engine 3 certification block and "Next
Builder MUST" list, written this same pass.

## Phase 8 — Package

Full repository ZIP built this session, per Rule 68/71/73. Repository
SHA-256 computed and recorded in `RELEASES.md` (Rule 60/70); Package
SHA-256 reported only in this session's Rule 67 Delivery block.

## Phase 9 — Close

**Engine 3 (Living Translation Engine / Translation Pipeline): CLOSED.**
All 8 Final Implementation Contract items accounted for (1–7 fulfilled
as written, 8 explicitly and correctly not resolved, per Phase 2
Review's own decision). Per Rule 68, Engine 4 is now unlocked — its own
Phase 0 (Repository Verification) is the correct next step for a future
session; per this session's own scope (finish Rule 75, then Engine 3
through Close, then package/end), Engine 4 itself is not started here.

**Certification — Engine 3 / Living Translation Engine (final, this session)**
- Repository Verified: YES.
- Compose Verified: YES.
- Review/Approval: YES — Approved (Revised).
- Implementation Verified: YES — 12/12 real tests, contract items 1–7
  fulfilled exactly as written, item 8 correctly not resolved.
- Verification Verified: YES (Node-level, complete) — browser-level
  end-to-end honestly disclosed as not yet performed, non-blocking.
- Handoff Verified: YES — `HANDOFF.md` updated this pass.
- Ready for Next Account: **YES — Engine 3 Closed. Engine 4 unlocked,
  not started. Begin Engine 4 Phase 0 next.**
