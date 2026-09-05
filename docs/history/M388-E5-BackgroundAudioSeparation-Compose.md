# M388 Engine 5 — Background Audio Separation Engine

Fifth of the Approved 11-engine Implementation Order
(`docs/history/M388.md`, Phase 2 Review). Resolves `MD-010` (no
background/ambient audio separation capability).

---

## Phase 0 — Repository Verification

- Repository SHA-256 recomputed against the delivered baseline
  (`CozyOS-main-v3_02_07-M388-E4-Closed.zip`) using the repository's own
  documented method (`find . -type f ! -name 'RELEASES.md' -print0 |
  sort -z | xargs -0 sha256sum | sha256sum`): matched `RELEASES.md`'s
  recorded value exactly
  (`5edd5cb928660aeaa863a41743be9b5c718bd60a76d39f7b59cbb373b6ac85b8`).
  Package SHA-256 (`7f347787ab8d6e52cf8979bac61a59491478d0276c8ff3b3af183305589b5882`)
  and ZIP integrity (`unzip -t`, re-extraction reproducing the same
  repository hash) both reconfirmed this pass.
- `LATEST.md`, `HANDOFF.md`, `RELEASES.md`, `docs/builder/knowledge/repair-queue.md`,
  `docs/builder/knowledge/milestone-waiting-queue.md`,
  `docs/builder/rules/00-INDEX.md` all read directly from the
  repository, not restated from chat history (Rule 69).
- Confirmed Engine 1–4 all Closed, consistent across `LATEST.md`,
  `HANDOFF.md`'s trailing section, `RELEASES.md`, and the Waiting Queue.
  None reopened.
- **Rule 69 discrepancy, this pass:** the session's own instructions
  asserted Rules 77 (Phase Focus) and 78 (Large Engine Implementation)
  were "already adopted." The repository itself had no rule file or
  `00-INDEX.md` entry for either before this pass — only Rule 76 (`21-
  no-partial-phase-completion-rule.md`) existed, and it was already
  correctly indexed. Per Rule 69, the repository's own account governs:
  Rules 77/78 are adopted starting this session, not retroactively
  assumed to have governed Engines 1–4 (see `docs/builder/rules/22-
  phase-focus-rule.md`, `23-large-engine-implementation-rule.md`,
  `00-INDEX.md`).

## Phase 1 — Compose

### 1. Ownership Audit

| File | Finding |
|---|---|
| `core/engines/audio/audio-manager.js` | Has a per-channel `noiseReduction` boolean (`registerAdapter`/mixer record field, `setNoiseReduction()`) — but this is a **device-level DSP toggle** passed through to a hardware provider (`provider.setNoiseReduction(externalId, enabled)`), not source separation performed on a decoded audio track. `core/engines/audio/provider-inmemory.js` confirms: the reference provider only flips a boolean field on a simulated device record: `device.noiseReduction = enabled`. No waveform-level processing anywhere in either file. |
| `core/modules/hearing/cozy-hearing.js` | Its own `doesNotOwn` list (checked again this pass, same as Engine 4's Phase 0) excludes "microphone acquisition/stream lifecycle," "speech recognition," "audio playback/recording" — sound *category* classification only (34 `SOUND_CATEGORIES`, incl. "Speech" as one category among many), never separation of one audio stream into components. |
| `core/engines/media/media-pipeline-manager.js` | **Critical naming-collision risk found, not a duplicate-scope conflict:** this file already `import`s `BackgroundEngine from './background-engine.js'` (line 41) as part of its `dependencies` array alongside `image-engine.js`, `filter-engine.js`, `enhancement-engine.js` — all real, existing, **visual/image** effects engines. `background-engine.js` itself does not exist (one of `MD-004`'s "3 missing media engine files," confirmed this pass: `background-engine.js`, `codec-encoding-engine.js`, `codec-decoding-engine.js` are the exact three). By its grouping with `ImageEngine`/`FilterEngine`/`EnhancementEngine` (all real, present, visual), the still-unbuilt `background-engine.js` is a **visual background** feature (blur/replace, camera-style), not audio. This is a real, disclosed naming-collision risk for Engine 5: the obvious path `core/engines/media/background-engine.js` is already spoken for by a different, unrelated, not-yet-built feature. Logged as `AA-007` below — Engine 5 must use an unambiguous, distinct path. |
| `core/engines/media/diarization/speaker-diarization-engine.js` (Engine 4, this milestone) | Not a duplicate — Engine 4 groups segments into speaker turns from explicit caller-supplied hints; it does not classify or separate audio into speech/non-speech at all. Its `diarize()` output is a real, usable **upstream** signal for Engine 5 (see Dependency Graph). |
| Repository-wide `grep -ril "background.*audio\|audio.*separation\|source.*separation\|denois"` (code, not docs) | Confirmed the two hits above (`audio-manager.js`'s device-DSP toggle, `media-pipeline-manager.js`'s unrelated visual `BackgroundEngine` import) and no others. No second/partial audio-separation implementation exists. |

**Conclusion:** confirmed genuine gap (`MD-010`), not a duplicate. Engine
5 has a clear path to own a new file, provided it avoids the
`background-engine.js` naming collision identified above.

### 2. Dependency Graph

```
Engine 1 (Media Decode)
   |  audioTrack (honest isReal:false structural envelope — same
   |  load-bearing constraint already disclosed for Engines 2/4)
   v
Engine 4 (Speaker Diarization)
   |  turns: [{ speakerHint, segmentIds }] — real when explicit
   |  per-segment speaker hints are supplied, honest isReal:false
   |  empty envelope otherwise
   v
Engine 5 (Background Audio Separation)  <-- proposed new file, this Compose
   |  segment-level speech/non-speech partition (real, deterministic,
   |  derived from which segments a real diarization turn covers;
   |  honest isReal:false when no turn data exists to partition against)
   v
   +--> Engine 6 (Subtitle Timeline) — benefits from knowing which
   |    segments are actual speech vs. background/ambient, to avoid
   |    generating subtitle cues for non-speech
   +--> Engine 7 (Voice Generation) — needs to know which segments are
        speech worth re-voicing at all
```

**Load-bearing finding (same category as Engines 1/2/4's own
disclosures):** Engine 1's `decodeMedia()` still returns an honest
`isReal:false` envelope for `audioTrack` — no real decoded PCM samples
exist anywhere in this environment. A real acoustic source-separation
model (e.g. spectral/embedding-based speech-vs-background isolation)
would need real audio samples to operate on, which do not exist here,
and no such model/library is available in this environment regardless.
Engine 5 therefore cannot honestly claim real DSP-level separation this
pass — the same honesty boundary already carried by Engines 1/2/4,
disclosed here rather than assumed away.

**Real, available signal:** Engine 4's `diarize()` output is real
whenever the caller supplied explicit per-segment speaker hints. A
segment covered by a diarization turn is, by definition, attributed
speech; a segment with no turn coverage is honestly unclassified (not
assumed to be "background" — that would be a fabricated inference this
engine's own honesty convention forbids). This is genuine, computed
bookkeeping over Engine 4's real output, not acoustic analysis — the
same class of composition Engine 2/3 performed over their own upstream
engines.

### 3. Duplicate-Engine Scan

Repository-wide search for `Separat`, `Denois`, `BackgroundAudio` (code,
not docs) turned up no second implementation, no reserved name, no
in-flight stub. `core/bridge/engine-bridge-bootstrap.js`'s
`REGISTRATIONS` array (8 entries checked) has no entry for background
audio separation and no entry named `background`. **No duplicate risk
found**, subject to the naming-collision caution in Finding `AA-007`
above.

### 4. Integration-Point Analysis

**A. Engine 4's `diarize()` output** — the natural real input. Engine 5
consumes it as a plain function argument (Engine 4's own public API),
no coupling beyond that — matches the composition pattern already used
between Engine 2 and `cozy-live.js`, and between Engine 4 and
`cozy-speech.js`.

**B. `cozy-speech.js` / `cozy-live.js`** — no natural write-target
exists for a speech/non-speech partition in either file (neither has a
registry for it, unlike Engine 4's `_speakers`). Engine 5's result is
therefore a **standalone, caller-consumed value** — it does not write
into any existing repository registry. This is a real scope difference
from Engines 2–4 (all three had a real, pre-existing place to attach
their output); disclosed here rather than silently assumed to need one.

**C. `audio-manager.js`'s `noiseReduction` toggle** — a real, adjacent,
but non-overlapping control surface (device-level DSP request, not
segment-level classification). Engine 5 does not call into it and does
not depend on it — logged only as a boundary clarification, not an
integration point.

### 5. New Findings This Compose

| ID | Finding | Priority | Notes |
|---|---|---|---|
| `AA-007` | `core/engines/media/media-pipeline-manager.js` already imports an unbuilt `background-engine.js` (one of `MD-004`'s 3 missing files) as a **visual** effects engine (grouped with `image-engine.js`/`filter-engine.js`/`enhancement-engine.js`). Engine 5 ("Background Audio Separation Engine") must not use the path `core/engines/media/background-engine.js` — it would silently collide with that unrelated, still-unbuilt visual feature the moment `MD-004` is eventually resolved. | Medium | Resolution: Engine 5 uses an unambiguous, audio-specific path — `core/engines/media/audio-separation/background-audio-separation-engine.js` (proposed, below). |

`MD-010` itself is re-confirmed current, not yet resolved — Compose
only, no implementation this pass, per Phase 0/Phase 1 scope (Rule 77 —
no forward planning into Phase 3 within this section).

### 6. Draft Implementation Contract (for Phase 2 Review — not yet approved)

1. New file(s) only, at `core/engines/media/audio-separation/background-audio-separation-engine.js`
   (+ a companion honest reference provider, same provider-interface
   split as Engines 1/2/4) — path confirmed free and, per `AA-007`,
   deliberately distinct from the reserved-but-unbuilt
   `core/engines/media/background-engine.js`.
2. Does not modify `cozy-live.js`, `cozy-speech.js`, `cozy-media.js`,
   `media-pipeline-manager.js`, `audio-manager.js`, or
   `cozy-hearing.js` — no locked file touched, no exception requested.
3. Consumes Engine 4's `diarize()` output as a plain function argument
   (Engine 4's own public API) — no new coupling invented, no registry
   write anywhere (per Integration-Point Analysis §B, there is no
   existing registry to write into).
4. Registers one new entry in `core/bridge/engine-bridge-bootstrap.js`'s
   `REGISTRATIONS` array (`background-audio-separation`), same
   precedent as Engines 1–4.
5. Honest, not fabricated: given Engine 1's `isReal:false` audio-track
   envelope, real DSP-level source separation is not claimed. The
   engine returns a real, deterministic speech/non-speech-or-
   unclassified partition when diarization turn data is supplied;
   an honest `isReal:false`/`method:'no-analyzable-signal'` empty
   envelope otherwise. No segment is labeled "background" by inference
   — only "speech" (turn-covered) or "unclassified" (not covered),
   since inferring "background" from mere absence of a speaker turn
   would be an unearned claim this engine's own convention forbids.
6. Does not resolve `MD-009` (media encode, Engine 9), `MD-013`
   (streaming pipeline, Engine 10), or `MD-016` (audio-buffer → STT
   bridge) — out of scope, carried forward unchanged.

This draft is not binding — Phase 2 Review may revise it, the same way
Engine 4's own draft contract (item 2) was revised before approval.

---

## Phase 2 — Review / Approval

**Independent re-verification performed against actual repository
source this pass (not restated from Phase 1's own account, per Rule
69):** fresh `grep -ril "background.*audio\|audio.*separation\|source.*
separation\|denois"` across the full repository, code only — reproduced
the same two real hits (`audio-manager.js`'s device-level DSP toggle,
`media-pipeline-manager.js`'s unrelated visual `BackgroundEngine`
import) and no others. Fresh read of `engine-bridge-bootstrap.js`'s
`REGISTRATIONS` array — 8 entries, confirmed no `background` or
`background-audio-separation` name exists, confirmed no entry was added
by any other session since Phase 1. Fresh check that
`core/engines/media/audio-separation/` does not exist. Fresh read of
`core/engines/media/diarization/speaker-diarization-engine.js`'s
`diarize()` — signature and frozen-envelope return shape unchanged from
Phase 1's account.

**Verdict: Approved (not Revised).** Ownership audit, dependency graph,
duplicate-engine scan, and `AA-007`'s naming-collision finding all
reproduced with the same result this Review. The Draft Implementation
Contract's 6 items stand unrevised into Implementation — including item
5's "speech (turn-covered) vs. unclassified (not turn-covered)" framing,
which this Review re-confirms is the honest framing: labeling an
unclassified segment "background" would itself be an inference this
engine has no real signal to support, the same category of restraint
already exercised by Engine 2 (never guessing a language from an
unanalyzable `audioRef`) and Engine 4 (never grouping a hint-less
segment into a fabricated turn).

**Final Implementation Contract (6 items, confirmed this Review,
unrevised from the Phase 1 draft):**
1. New files only, at `core/engines/media/audio-separation/background-audio-separation-engine.js`
   + a companion honest reference provider — path reconfirmed free this
   Review, deliberately distinct from the reserved-but-unbuilt
   `core/engines/media/background-engine.js` (`AA-007`).
2. Does **not** modify `cozy-live.js`, `cozy-speech.js`, `cozy-media.js`,
   `media-pipeline-manager.js`, `audio-manager.js`, or
   `cozy-hearing.js` — no locked file touched, no exception requested
   or granted.
3. Consumes Engine 4's `diarize()` output as a plain function argument
   only — no new coupling, no registry write (none exists to write
   into).
4. Registers one new entry in `engine-bridge-bootstrap.js`'s
   `REGISTRATIONS` array (`background-audio-separation`), same
   precedent as Engines 1–4.
5. Honest, not fabricated: no real DSP-level source separation is
   claimed (Engine 1's `isReal:false` audio envelope, unchanged, still
   caps this). Real, deterministic partition of segments into
   `speech` (covered by a real Engine 4 diarization turn) vs.
   `unclassified` (not covered) when turn data is supplied; an honest
   `isReal:false`/`method:'no-analyzable-signal'` empty envelope
   otherwise. Never labels an unclassified segment "background" — that
   would be an unearned inference.
6. Does not resolve `MD-009`, `MD-013`, or `MD-016` — out of scope,
   unchanged.

**No application code, no implementation this pass's Phase 0–2** — per
Rule 77, Phase 3 begins as its own, separate focus.

---

## Phase 3 — Implementation

Built exactly per the Final Implementation Contract (6 items, Phase 2
Review, above) — no item revised, no locked file touched.

**New files only:**
- `core/engines/media/audio-separation/background-audio-separation-engine.js`
  — core engine (provider registry, `partition()`, `getCapabilities()`,
  `getServiceManifest()`, `registerWithKernel()`), following Engines
  1/2/4's provider-interface split exactly.
- `core/engines/media/audio-separation/provider-turn-coverage.js` —
  honest reference provider: real, deterministic partition of segments
  by Engine 4 diarization-turn coverage; honest `isReal:false`/
  `method:'no-analyzable-signal'` empty envelope with no turn data;
  never labels an uncovered segment "background" (contract item 5).
- `core/engines/media/audio-separation/tests/background-audio-separation-engine.test.js`
  — 18 real, executed tests, including a real end-to-end composition
  test against Engine 4's own `diarize()` output (no mocking of Engine
  4 itself).

**Confirmed by direct diff against this session's own Engine-4-closed
baseline ZIP (`diff -rq`, not just `find`/`grep`):** the only modified
existing files in the entire repository are
`core/bridge/engine-bridge-bootstrap.js` and
`docs/builder/rules/00-INDEX.md` (the latter for Rule 77/78 adoption,
unrelated to Engine 5's own implementation). `cozy-live.js`,
`cozy-speech.js`, `cozy-media.js`, `media-pipeline-manager.js`,
`audio-manager.js`, and `cozy-hearing.js` are all byte-identical to
baseline — contract item 2 held exactly, no exception taken.

**`core/bridge/engine-bridge-bootstrap.js`** gained one new
`REGISTRATIONS` entry (`background-audio-separation` →
`window.CozyOS.BackgroundAudioSeparationEngine`), same precedent as
Engines 1–4 (contract item 4). No other line of that file changed.

**Composition point (contract item 3):** `partition()` takes Engine 4's
`diarize()` return value as a plain argument — no import of, or call
into, Engine 4 from within Engine 5's own files; the two remain
decoupled, callable independently or together. No registry write
anywhere, per Integration-Point Analysis §B — none exists to write
into.

**Honest, not fabricated (contract item 5):** with no diarization turn
data, `partition()` returns `isReal:false`/`method:'no-analyzable-
signal'` — no invented speech/background split. When turn data is
supplied, partitioning is real, deterministic bookkeeping (a segment is
`speech` only if a real Engine 4 turn actually covers its `segmentId`;
otherwise `unclassified`, never `background` — the engine has no signal
to support that stronger claim). `getCapabilities()` reports
`realAcousticSeparation:false` — no unearned claim, matching Engine 1's
`realDecode:false`, Engine 2's `realAcousticDetection:false`, and
Engine 4's `realAcousticDiarization:false` precedent.

**Does not resolve (contract item 6, unchanged):** `MD-009` (media
encode, Engine 9's own scope), `MD-013` (streaming pipeline, Engine
10's own scope), or `MD-016` (audio-buffer → SpeechRecognitionAdapter
bridge).

## Phase 4 — Verification

`node --check` clean on all four new/modified files
(`background-audio-separation-engine.js`, `provider-turn-coverage.js`,
`background-audio-separation-engine.test.js`,
`engine-bridge-bootstrap.js`).

**18/18 real, executed tests pass**
(`core/engines/media/audio-separation/tests/background-audio-separation-engine.test.js`),
covering: honest empty envelopes (zero segments, no turns, undefined
diarization result, no provider registered); real turn-coverage
partitioning across single and multiple turns; the "unclassified, never
background" labeling guarantee (asserted directly against the result's
own key names); a real end-to-end composition test that calls Engine
4's actual `diarize()` and feeds its real output into Engine 5's
`partition()` with no mocking, both for the real-turn case and for
Engine 4's own honest `isReal:false` case (confirming the seam between
the two engines never fabricates across the boundary); frozen envelopes
and `PARTITIONED` event emission; capability/manifest/kernel-
registration honesty checks; and custom-provider registration. All 18
passed on first run — no fix loop was needed this pass.

**Regression — full re-run, all clean, no new failures:**
- Engine 1: 23/23 (unchanged)
- Engine 2: 31/31 (unchanged)
- Engine 3: 12/12 (unchanged)
- Engine 4: 23/23 (unchanged)
- Pre-existing `media-pipeline-manager.test.js` failure: reproduced
  identically (same missing `background-engine.js` line — the same
  file `AA-007` identifies as the unrelated visual engine Engine 5
  deliberately avoids colliding with; `MD-004`/`MD-009`, not new).

**Not performed this pass, honestly disclosed (Rule 116/117):** no
browser/DOM runtime is available in this environment. All verification
above is real Node execution, not a browser session — the same
disclosed, non-blocking limitation already carried by Engine 3 and
Engine 4's own Phase 4.

## Phase 5 — Registry Updates

- `MD-010` — 🟡 Composed → 🔵 Implementing
  (`docs/builder/knowledge/repair-queue.md`), same precedent as
  `MD-009`/`MD-011`/`MD-012`.
- `AA-007` — 🟡-equivalent (Compose finding) → 🟢 Fixed — resolved by
  construction (Engine 5's file path was chosen to avoid the collision
  from the start, not patched after the fact).
- `MD-011`'s repair-queue entry corrected this pass to carry forward
  Engine 4's full real implementation detail (a wording error from this
  session's own first edit was caught and fixed before Delivery — see
  this file's Phase 0 discrepancy-handling precedent; no functional
  claim was ever wrong, only the record's prose was briefly
  under-detailed).
- `docs/builder/knowledge/milestone-waiting-queue.md` updated: Engine 5
  moved to Closed (Phase 9); Engine 6 (Subtitle Timeline) unlocked,
  Phase 0 not started; "Quick answers" section refreshed.
- No new MD/DI finding opened this Implementation (only `AA-007`, opened
  at Phase 1 Compose and now Fixed).

## Phase 6 — Reports

This section (Phase 3–9) is the Phase 6 report for Engine 5's
Implementation, appended to this same file per the repository's own
established convention (Engines 1–4's Compose files).

## Phase 7 — Handoff

`LATEST.md`, `HANDOFF.md`, and `RELEASES.md` all updated this pass (see
each file's own trailing section / new Round entry) to record Engine 5
Closed and Engine 6 unlocked, consistent with this file and the Waiting
Queue.

## Phase 8 — Packaging

Full repository ZIP built and verified this pass, per Rule 67/70/71/77
— see this session's Rule 67 Delivery block for filename, size, and
Package SHA-256 (never embedded in any repository file, per Rule 70).

## Phase 9 — Close

**Engine 5 (Background Audio Separation Engine) is CLOSED.** Final
Implementation Contract items 1–6 fulfilled exactly as written — no
locked file touched, no exception taken, the `AA-007` naming-collision
risk resolved by construction. 18/18 real tests pass; Engines 1–4
regression clean. **Engine 6 (Subtitle Timeline Engine) is unlocked
(Rule 68), Phase 0 not started.**

## Certification — Engine 5 / Background Audio Separation (FINAL, this pass)
- Repository Verified: YES
- Compose Verified: YES
- Review/Approval: YES — Approved (not Revised)
- Implementation Verified: **YES** — new files only, Final Contract
  followed item-by-item, confirmed by direct `diff -rq` against this
  session's own Engine-4-closed baseline
- Verification Verified: **YES (Node-level, complete)** — 18/18 real
  tests, all passing on first run, no fix loop needed; Engine 1/2/3/4
  regression re-run clean (23/31/12/23, unchanged); the one
  pre-existing, unrelated failure reproduced identically. A
  browser-level exercise was not run this pass (no browser/DOM
  available in this environment), honestly disclosed as open and
  non-blocking, same category of gap already carried by Engines 3/4.
- Handoff Verified: YES — this section, plus `LATEST.md`/`HANDOFF.md`/
  `RELEASES.md`/Repair Queue/Waiting Queue all updated same pass
- Artifact SHA-256 Verified: YES — see `RELEASES.md`, this round
- Ready for Next Account: **YES — Engine 5 CLOSED. Begin Engine 6
  (Subtitle Timeline Engine) Phase 0 next. Do not reopen Engine 5. Do
  not skip Engine 6's own Phase 0/Compose/Review before Implementation,
  per Rule 68/77.**
