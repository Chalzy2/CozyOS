# Cozy Builder — Architecture Ambiguity Registry (AA)

Distinct from the Duplicate Consolidation Registry (a duplicate isn't an
ambiguity) and from a plain "blocked — missing dependency" (an ambiguity
can exist even when the file is available). Every entry follows the
7-step lifecycle defined in Rule 52: ID → Evidence → Possible
Explanations → Risk Assessment → Evidence Needed to Resolve →
Implementation Lock → Closure Criteria. No explanation is treated as
fact until closure.

---

## AA-001 — `core/modules/builder/understanding-engine.js`

**Status:** Closed — Resolved by Compose Analysis, real source verified

**1. Evidence (every conflicting source, verbatim/paraphrased with attribution):**

| Source | What it says this module does |
|---|---|
| `knowledge/module-inventory.json` / `.csv` (Builder Knowledge) | "Requirement Understanding" — turns raw input (plain text, source code, text-based PDFs, screenshots, uploaded projects) into a structured Understanding (application type, detected features/entities, requirements) for **code generation** |
| `core/modules/builder/observation-engine.js` (composer, live in this workspace) | Composes `UnderstandingEngine.analyzeCode()` / `analyzeRepository()` for per-file class/version/layer/public-method/emitted-event extraction — structural analysis of **existing CozyOS source** |
| Submitted Layer 2 — Understanding Engine specification (registered as evidence, not a description of an existing file) | Full architectural understanding of the **existing** system: module graph, dependency graph, API/event graphs, ownership detection, pattern recognition — reverse-engineering, not requirement-intake |
| **`core/modules/builder/understanding-engine.js` — the real source (verified this pass)** | Header states responsibility exactly as the Builder Knowledge inventory describes: raw input → structured Understanding for CozyBuilder's generation preview. Public API (`analyzeCode`, `analyzeRepository`, `analyzeText`, `analyzePDF`, `analyzeImage`, `analyzeScreenshot(s)`, `fetchGitHubRepository`) confirms `analyzeCode()`/`analyzeRepository()` are generic per-file structural extractors — exactly what `observation-engine.js` composes |

**2. Possible explanations (evaluated against real source):**
1. **Confirmed.** One engine legitimately performs both requirement-understanding and repository-understanding, on a shared generic "parse/structure code" primitive (`analyzeCode`/`analyzeRepository`).
2. Not supported — the Builder Knowledge inventory description matches the real header exactly; not outdated.
3. Not supported — no evidence of undisclosed scope creep; the header's own "WHAT THIS MODULE DOES NOT DO" section is consistent with its actual API.
4. Not supported at this time — the two responsibilities share one clean, generic primitive rather than being tangled; no split is warranted by the evidence.

**3. Risk assessment:** Resolved — no longer open-ended. See full reasoning in `reports/layer2-compose-analysis-AA-001.md` §3.

**4. Evidence used to resolve:** The real `core/modules/builder/understanding-engine.js` source (700 lines, `node --check` clean), confirmed present and loaded in the verified Main Production ZIP at the position `observation-engine.js`'s own header and `dashboard.html` already declared.

**5. Implementation lock:** **Lifted.** Composition against the real, verified API is permitted going forward, subject to ordinary Rule 50/Rule 6 review per proposed change.

**6. Relationship to the separate missing-dependency record:** `knowledge/missing-dependency-registry.md` MD-001 closed in the same pass — the file being supplied was the trigger for this closure.

**7. Closure criteria (met):** Real source read; actual API/scope compared against all recorded descriptions, including the Layer 2 spec submitted as evidence; Explanation 1 confirmed and recorded above; full gap analysis of the Layer 2 spec against real coverage recorded in `reports/layer2-compose-analysis-AA-001.md`.

---

## AA-002 — Layer 2 graphs not implemented in M372 (planning record only)

**Status:** Open — planning record, not a blocking ambiguity. Logged per M372 Decision 5.

**Context:** M372 implemented Module Graph, Dependency Graph, API Graph (verified scope), Event Graph, and Ownership Graph in `core/modules/builder/layer2-graph-composer.js`, all derived from real signals already extracted by `understanding-engine.js` v1.1.0 and `ownership-scanner.js`. The remaining eight graphs from the original Layer 2 specification were deliberately not built, because no engine anywhere in the verified workspace extracts the signals they'd require. Building them now would mean either fabricating output or silently duplicating parsing logic — both forbidden by this milestone's Decision 4.

| Missing graph | Missing signal | Extraction engine that would be needed |
|---|---|---|
| Data Flow Graph | Value/state flow between modules | A call-graph or runtime-tracing engine — none exists |
| UI Hierarchy | DOM/component structure from HTML/JS | An HTML/markup structural parser — Code Analyzer only reads header/class/method/event facts, never markup |
| Startup Flow | Verified boot order | A `<script>`-tag-order extractor over `dashboard.html` (and other entrypoints) — real order exists in markup today, just unextracted |
| Authentication Flow | Call-chain between `core/security/*` files | A call-graph engine scoped to the auth coordinator's real invocation sequence |
| Synchronization Flow | CozyStorage/CozyLive sync call sequencing | Same call-graph capability as above, scoped to sync-related files |
| Plugin Relationship Graph | Plugin-to-host registration signal | A `core/plugins/*` -specific registration-call extractor (distinct from the generic `window.CozyOS.<Name>` signal Dependency Graph already uses, since plugin registration uses a different, not-yet-inventoried pattern) |
| Service Relationship Graph | Live `ServiceRegistry` relationship snapshot | An offline snapshot mechanism for `getCoordinator()`/`getApplication()` state — currently only observable at live runtime, not from static file analysis |
| Architecture Graph | Aggregate architectural summary | Currently a human/LLM-authored document (`docs/builder/architecture/01-architecture-graphs.md`); no runtime engine generates it |

**Recommended implementation order (Rule 50 priority — reuse before build):**
1. **Startup Flow** — cheapest: the signal (script tag order) already exists in markup; needs only a new, narrowly-scoped HTML-entrypoint parser, composable the same way `observation-engine.js` already consumes `htmlEntrypoints`.
2. **Plugin Relationship Graph** — `core/plugins/*` already flows through `analyzeRepository()`; only the registration-pattern regex is missing.
3. **Service Relationship Graph** — would need a live-runtime snapshot method added to `ServiceRegistry` itself (out of this milestone's file scope) before anything could compose it offline.
4. **Data Flow / Authentication Flow / Synchronization Flow** — all three need the same underlying capability (a call-graph engine); worth building once, generically, rather than three times.
5. **UI Hierarchy** — needs a dedicated markup-structure parser; lowest priority since no current Builder consumer depends on it.
6. **Architecture Graph** — last, since it's more naturally a human-reviewed synthesis of the other graphs than a thing to extract directly.

**Engineering impact of leaving these open:** None of Module/Dependency/API/Event/Ownership Graph's correctness depends on these eight; they are independent, additive capabilities. No workaround or fabricated data is in use anywhere in the shipped M372 code — `layer2-graph-composer.js#listUnsupportedGraphs()` returns this same list at runtime.

**Closure criteria:** Each row closes independently, whenever its own extraction engine is built and composed — not as a single batch.

---

## AA-003 — Insufficient Signal for Layer 3 Tier C capabilities (planning record only)

**Status:** Open — planning record, not a blocking ambiguity. Logged per M373 Decision 3 (Tier C).

**Context:** M373 implemented `core/modules/builder/analysis-engine.js` — Tier A (duplicate module candidates, circular dependencies, event routing problems, broken interface candidates, version compatibility issues, large/complex modules — all composed from `layer2-graph-composer.js`'s existing verified graphs) and Tier B (deterministic, rule-based regex heuristics over raw file text: `eval(`/`Function(`/unsafe `innerHTML`/inline event handlers/insecure storage patterns; unmatched `setInterval`/`addEventListener`). Six capabilities from the original Layer 3 analysis scope were deliberately not built, because — as with AA-002 — no engine anywhere in the verified workspace extracts the signals they would require. This is named **Insufficient Signal**, not Missing Feature, because the gap is evidentiary: the capability isn't absent by design, there is simply no verified extraction path feeding it yet.

| Deferred capability | Missing signal | Extraction engine that would be needed |
|---|---|---|
| Dead/unreachable code | Control-flow / reachability | A static control-flow or symbolic-execution engine — none exists; this codebase's discipline (Root Cause Discovery Rule, non-execution analysis) forbids running code to find this |
| Deep architecture violations | Machine-checkable architecture policy | A human-authored, codified architecture rule set beyond declared `Layer:` headers and directory grouping (both already used by Module Graph) |
| Signature-level API inconsistencies | Method parameter/type/return shape | API Graph currently extracts method *names* only (regex-based, same discipline as `understanding-engine.js`); no signal captures signatures to compare across callers/implementers |
| Runtime performance bottlenecks | Live profiling / timing data | Real browser or device runtime measurement — this sandbox has neither, same limitation already disclosed in PF-001 |
| Deep plugin compatibility | Plugin Relationship Graph | Blocked upstream on AA-002 (Plugin Relationship Graph itself is unimplemented) |
| Offline synchronization risk | Synchronization Flow Graph | Blocked upstream on AA-002 (needs a shared call-graph engine, also unimplemented) |

**Recommended implementation order (Rule 50 priority — reuse before build):**
1. **Signature-level API inconsistencies** — cheapest of the six: extends the existing per-method regex in `understanding-engine.js#analyzeCode()` to also capture parameter lists, rather than requiring a new engine class.
2. **Deep architecture violations** — needs one human-authored policy document (a machine-checkable ruleset) before any code; no new extraction engine required once that exists.
3. **Deep plugin compatibility** and **Offline synchronization risk** — both wait on their respective AA-002 graphs; build those first, then compose.
4. **Dead/unreachable code** — needs a genuinely new control-flow engine; higher build cost, and this codebase's non-execution discipline makes it the hardest of the six to do honestly.
5. **Runtime performance bottlenecks** — last, since it fundamentally needs a real browser/device, not a sandbox capability at all.

**Engineering impact of leaving these open:** None of Tier A or Tier B's correctness depends on these six; they are independent, additive capabilities. No workaround or fabricated finding is emitted anywhere in the shipped M373 code — `analysis-engine.js#listUnimplementedTier()` returns this same list at runtime.

**Closure criteria:** Each row closes independently, whenever its own extraction engine (or, for Deep Architecture Violations, its policy document) is built and composed — not as a single batch.

---

## AA-004 — `window.CozyOS.AudioEngine` — two files claim the same global name

**Status:** Closed (M387.5b, RP-013) — Resolved by real evidence, not a guess

**1. Evidence (every conflicting source, verbatim/paraphrased with attribution):**

| Source | What it claims |
|---|---|
| `core/engines/audio/cozy-audio-engine.js` (classic script, header comment, line 5) | "OWNERSHIP: this is the real `window.CozyOS.AudioEngine`" — self-declares itself the canonical owner of that exact global, and does assign `window.CozyOS.AudioEngine = new CozyAudioEngine()` (guarded by `if (window.CozyOS.AudioEngine) return;`) |
| `core/modules/hearing/cozy-hearing.js` (header comment, line 19) | States "`audio-manager.js`, `window.CozyOS.AudioEngine`) is the canonical" [owner] — reads as expecting the ES-module `core/engines/audio/audio-manager.js` (loaded via `core/bridge/engine-bridge-bootstrap.js`, exposed under the same name) to be the real `window.CozyOS.AudioEngine`, not the classic-script one |
| `core/bridge/engine-bridge-bootstrap.js` (header comment) | States its 5 ES-module engines are deliberately exposed under distinct `*Engine` names "specifically so they cannot collide with those existing globals or with each other" — implying the author believed `AudioEngine` was a safe, non-colliding choice, which real-browser verification shows is false |
| Real browser evidence (M387.5, Round 2 onward) | `[EngineBridge] "audio" unavailable: [ServiceAdapter] window.CozyOS.AudioEngine is already occupied by a different object — refusing to overwrite (Conflict Review: no duplicate registration).` — confirms `cozy-audio-engine.js` (which loads earlier in `dashboard.html`'s script order) wins the name in practice today, and the ES-module bridge's own `audio-manager.js` never gets exposed under `window.CozyOS.AudioEngine` at all |

**2. Resolution — real method-call evidence, checked before choosing:**

Read every real call site against both candidate engines' actual public APIs, per the registry's own closure criteria (item 7 below):

- `cozy-hearing.js` calls exactly 4 methods on the engine it reads from `window.CozyOS.AudioEngine`: `registerInputAdapter()`, `supportsMicrophone()`, `startListening()`, `stopListening()`.
- `grep` confirms `cozy-audio-engine.js` implements `registerInputAdapter`, `startListening`, `stopListening` (3 of the 4; `supportsMicrophone` is optionally checked via `typeof ... === "function"` and gracefully falls back when absent — not a hard requirement).
- `grep` confirms `audio-manager.js` implements **none** of those 4 methods — it implements `registerProvider()` instead, a different API, consumed by `core/engines/media/live-capture-engine.js` (1 call site) and this bridge's own `wireBrowserAudioProvider()`.
- `cozy-audio-engine.js`'s own header (written before the bridge existed) already states, explicitly and correctly: it is "confirmed NOT the same thing as `core/engines/audio/audio-manager.js` (a separate, ES-module mixer/mic-bus engine ... a different concern, correctly left alone)" — independent confirmation the two were always meant to be distinct, and the bridge's later naming choice was the actual defect.
- Explanation 3 from the original record ("both are intentionally separate concerns that happen to want the same name by accident") is the one supported by this evidence — not explanations 1 or 2, which assumed one file should be retired.

**3. Risk assessment (resolved):** Was real but safe (fails closed, no crash) while open. Confirmed by real-browser re-verification post-fix: `dashboard.html`'s `[EngineBridge] "audio" unavailable: ... already occupied` warning is gone; both `window.CozyOS.AudioEngine` and `window.CozyOS.AudioManager` are now present simultaneously (confirmed via `window.CozyOS` enumeration), and `cozy-hearing.js`/`live-capture-engine.js` each read the one they actually need.

**4. Evidence used to resolve:** Direct `grep` of every real method call in `cozy-hearing.js` and `live-capture-engine.js` against both candidate engines' real, implemented method lists — not preference, not which file loads first, not which comment sounded more authoritative.

**5. Implementation lock:** Lifted. Fix applied: renamed the ES-module bridge's target for `audio-manager.js` from `AudioEngine` to `AudioManager` (matching that file's own self-declared identity, "Audio Manager") in `core/bridge/engine-bridge-bootstrap.js`; updated the 1 real consumer (`live-capture-engine.js`) and the bridge's own `wireBrowserAudioProvider()` to the new name; corrected `cozy-hearing.js`'s outdated header comment (which incorrectly described `audio-manager.js` as the `AudioEngine` it depends on); left `cozy-audio-engine.js` completely untouched, since it was already correct. `node --check` (and `--input-type=module` for the bridge's ES module) PASS on all 4 touched files. Real-browser re-verification (M387.5b): 0 "already occupied" warnings; both engines present; Living Engine chain (`LivingSecurityCoordinator` → `LivingDecisionEngine`) confirmed unchanged, no duplicates.

**6. Related:** Closing this fix's own re-verification surfaced a new, separate, genuine missing dependency — `core/engines/audio/provider-browser.js` (imported by `wireBrowserAudioProvider()`, confirmed absent repository-wide) — logged as `MD-005` rather than silently built (real feature-scale work, out of scope for this repair). Repair itself logged as `RP-013` in `knowledge/repair-history-registry.md`.

**7. Closure criteria (met):** Real method calls on both candidate engines confirmed against their actual implementations (not assumed from comments); root cause (a naming collision introduced by the bridge, not a pre-existing architectural conflict between the two engines) confirmed via `cozy-audio-engine.js`'s own pre-existing, already-correct ownership declaration; fix applied and re-verified in a real browser with 0 regressions to the Living Engine chain or either audio consumer.

---

## AA-005 — "Living Meaning Engine" has no defined real scope

**Status:** Closed — Documented Decision (M388 Phase 2 Review; not a Rule 52 resolved-ambiguity in the strict sense, since there was never a second real file competing for this name, only an undefined proposed stage)

**Decision:** "Living Meaning Engine" is **merged into Living Translation
Engine** for M388 — no separate engine is built.

**Reasoning (evidence-based, not a guess):**

**1. Evidence:** M388's proposed architecture (task specification) names a
"Living Meaning Engine" stage between "Living Language Detector" and
"Living Translation Engine." No file, comment, or existing engine anywhere
in the repository (confirmed via the full inventory in `docs/history/M388.md`
Section 1) corresponds to this responsibility. `cozy-translate.js`'s own
strict boundary ("0% Language detection or linguistic modeling") explicitly
excludes semantic/meaning-level processing from its own scope, so it is not
a candidate silent owner either.

**2. Possible explanations (not yet chosen between):**
1. "Living Meaning Engine" is intended as a genuinely new semantic-
   understanding layer (e.g., disambiguation, context-aware translation
   quality) distinct from literal machine translation.
2. It is a naming/scoping overlap with "Living Translation Engine" that
   the task's own pipeline diagram didn't intend to be two separate
   engines.
3. It maps to a real, external, not-yet-integrated capability (e.g. an
   LLM-based translation-quality layer) that hasn't been named as such.

**3. Risk assessment:** Low urgency at Compose stage (no code is built
against a wrong assumption yet), but real — sizing Plan-stage work for
"Living Translation Engine" without first resolving whether "Meaning" is a
separate stage or the same one risks either duplicate scope or a silent
gap.

**4. Evidence that would resolve this:** Explicit scope clarification from
whoever specified the M388 architecture, before Plan stage assigns any
engineering estimate to either "Living Meaning Engine" or "Living
Translation Engine."

**5. Implementation lock:** No code should be written for either "Living
Meaning Engine" or "Living Translation Engine" until this is resolved —
building one without knowing its boundary against the other risks the same
class of naming collision `AA-004` found in M387.5.

**6. Related:** `docs/history/M388.md` Section 3 (architecture
reconciliation) and Section 7 (duplicate-engine scan).

**7. Closure criteria (met):** `cozy-translate.js`'s own strict boundary
("0% Language detection or linguistic modeling") re-confirmed on Phase 2
review — no real slot exists in the current architecture for a distinct
semantic-understanding stage. No repository evidence (searched twice —
Compose and Phase 2 Review) supports a planned or partially-built "meaning"
layer anywhere. The decisive factor: the milestone's own ~0.5s latency
target makes inserting a *separate* heavyweight semantic-understanding hop
between detection and translation a real, material risk with no offsetting
evidence it's necessary for this milestone's actual goal (interpret spoken
language, preserve original content — not improve translation *quality*
beyond literal MT). If translation-quality work beyond literal MT is wanted
later, it is a distinct, future milestone's scope — not silently expanded
into M388. Full reasoning: `docs/history/M388.md`, Phase 2 Review section.

---

## AA-006 — `MD-009` registry text conflated two different codec contracts (Engine 1 Compose)

**1. What was ambiguous:** `MD-009`'s Repair Queue / missing-dependency
registry text described Engine 1 (Media Decode) and Engine 9 (Media
Encode) as resolving `codec-decoding-engine.js`/`codec-encoding-engine.js`
— the exact file paths already imported by, and tested against, by
`media-pipeline-manager.js`. Direct source inspection during Engine 1's
own Phase 0/Compose (`docs/history/M388-E1-MediaDecode-Compose.md`) found
those two paths already carry a real, narrower, different contract:
still-image container encode/decode (`encodeImage()`/`decodeImage()`,
kernel priority 15, part of the Image/Filter/Enhancement/Background pixel
pipeline) — not media-file/stream demuxing or track extraction.

**2. Why it mattered:** building Engine 1 into that reserved path would
either silently narrow it to still-image-only decode (failing M388's
actual audio/video-track-extraction requirement) or overload one file with
two unrelated contracts — the same class of naming collision `AA-004`
was opened to prevent.

**3. Resolution (closed within the same Compose pass that found it,
evidence already in hand — same pattern `AA-005` used at Phase 2):**
Engine 1 (and, later, Engine 9) get their own, new file path(s) —
recommended `core/engines/media/decode/media-decode-engine.js` — and do
not reuse `codec-decoding-engine.js`/`codec-encoding-engine.js`. The
pre-existing still-image codec gap (`MD-004`) remains tracked separately,
unaffected by Engine 1's existence, and is a real, currently-broken
`MediaEngine` import (confirmed by an actual attempted `import()` this
Compose, not just `find`) worth a dedicated fix in its own right.

**4. Related:** `docs/history/M388-E1-MediaDecode-Compose.md` §2, §11.
