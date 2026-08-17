# Compose Analysis (Rule 50) — Layer 2 Understanding Engine Spec vs. Verified Architecture

**Trigger:** Submitted "Cozy Builder – Layer 2: Understanding Engine" specification, registered as evidence in `knowledge/architecture-ambiguity-registry.md` AA-001.
**Sequence followed:** Observe → Understand → Analyze → Compose → Suggest (no Implement step taken this pass).

---

## 0. Headline finding — the AA-001/MD-001 blocking premise was wrong

Both records have said, across several prior sessions, that the real `core/modules/builder/understanding-engine.js` was **not supplied**. It was verified in this pass to be **present in the Main Production ZIP the entire time**: `core/modules/builder/understanding-engine.js`, 700 lines, 43,036 B, `node --check` passes, loaded in `dashboard.html` at the exact position both MD-001 and `observation-engine.js`'s header already assumed. This wasn't in the smaller Builder-side ZIPs from earlier sessions — only in the full repository — which is almost certainly why it was repeatedly logged as missing. Per Rule 49, this is now corrected against the actual verified workspace rather than left on the earlier assumption.

This satisfies AA-001's own stated closure criteria (§4/§7 below) and MD-001's closure criterion (file supplied) — both are closed at the end of this analysis, with the evidence that justifies it.

---

## 1. Registering the Layer 2 spec as evidence

Added to AA-001 as a fourth source (see registry). Its content is a **target-state specification** for a much larger architectural-understanding system: module/dependency/API/event/data-flow/UI/startup/auth/sync graphs, ownership detection, pattern recognition, boundary detection, capability discovery, version-history tracking, confidence-scored knowledge objects. It does not itself claim to describe any existing file — it's an aspiration document, evaluated here against what's actually built.

## 2. What the real `understanding-engine.js` (v1.0.0-ENTERPRISE) actually is

Its own header states its responsibility plainly: turn raw input (text, code, PDF, screenshots, uploaded projects) into a structured Understanding — application type, detected features, requirement gaps, estimated modules — that **CozyBuilder's code-generation Home experience previews before generating anything**. This matches the Builder Knowledge inventory description exactly.

Its actual public surface (verified from source, not inferred):
- `analyzeText`, `analyzeCode(sourceText)`, `analyzePDF`, `analyzeImage`, `analyzeScreenshot(s)`, `analyzeRepository(files)`, `fetchGitHubRepository`
- `analyzeCode()` does pure regex/text extraction of: class name, version, file-path header, layer header, public method names, emitted event names — never executes the source (same non-execution discipline as CozyBugFixer).
- `analyzeRepository(files)` runs `analyzeCode()` across every `.js` file in a provided file list and merges the results.

## 3. Resolving AA-001's four candidate explanations

**Explanation 1 confirmed — with correction.** *"One engine legitimately performs both requirement-understanding and repository-understanding, on a shared generic parse/structure code primitive."* This is exactly what the source shows: `analyzeCode()`/`analyzeRepository()` are generic, reusable, per-file structural extractors. CozyBuilder's generation preview and `observation-engine.js`'s existing-code structural facts are two different **consumers** of the same primitive — not two competing responsibilities inside one file, and not duplication.

Explanations 2–4 (stale documentation, undisclosed scope creep, split-candidate) do **not** hold — the Builder Knowledge inventory description and the file's own header agree with each other precisely.

**What the Layer 2 spec actually is, now that the real file is known:** not a third conflicting description of `understanding-engine.js` — it's a specification for a system that doesn't exist yet anywhere in this workspace, at any layer. Nothing in `understanding-engine.js`, `observation-engine.js`, or `ownership-scanner.js` builds module graphs, dependency graphs, API/event graphs, ownership registries, pattern catalogs, boundary maps, or confidence-scored knowledge objects. The ambiguity wasn't three sources disagreeing about one file — it was two real, agreeing sources plus one aspirational spec for a different, larger, currently-unbuilt system.

## 4. Existing capabilities (mapped against the Layer 2 spec's own section headings)

| Layer 2 spec section | Real coverage today | Owner |
|---|---|---|
| Module Understanding | Partial — className, version, filePath, layer, publicMethods, eventsEmitted per file | `understanding-engine.js` |
| Event Graph | Partial — `eventsEmitted` (producers only, via regex on `emit("...")`) | `understanding-engine.js` |
| Ownership Detection | Partial — collision-only: is a proposed module/coordinator/global name already registered | `ownership-scanner.js` |
| Repository-wide aggregation | Real — per-file results merged across a file list | `understanding-engine.js` (`analyzeRepository`), composed by `observation-engine.js` |
| Manifest persistence across passes | Real, if `CozyStorage` connected | `observation-engine.js` |

## 5. Missing capabilities (spec sections with no implementation anywhere in the verified workspace)

Module Graph (parent/child/shared-module mapping) · Dependency Graph (required/optional/circular/missing/unused) · API Graph (public/private/internal/deprecated, consumers, compatibility) · Event Graph consumers/routing/priority/lifecycle · Data Flow Graph · UI Hierarchy · Startup Graph · Authentication Graph · Synchronization Graph · Interface stability/deprecation tracking · Pattern Recognition · Boundary Detection · Capability Discovery catalog · Version/evolution history · Confidence scoring (Very High…Unknown) · structured Knowledge Objects with cross-references.

## 6. Suggested extension path (not implemented — proposal only)

Per Rule 50's priority order (Reuse → Composition → Extension → Refactoring → New implementation → Replacement):

1. **A new composing layer, not a rewrite of `understanding-engine.js`.** The spec's ambitions are architecturally a different responsibility (aggregate reasoning across many files' facts) from `understanding-engine.js`'s actual job (per-file/per-input extraction for generation preview). Extending `understanding-engine.js` itself to also build graphs would blur two responsibilities that are currently cleanly separated — the same risk Explanation 4 already warned against.
2. **Compose, don't re-parse.** Any future graph-builder should consume `analyzeRepository()`'s per-file output and `OwnershipScanner`'s collision data as raw material — never re-implement class/version/method/event extraction, which already exists and is verified.
3. **`observation-engine.js` is the natural home for the aggregation step**, or a sibling Layer-2-named module that composes it the same way `observation-engine.js` composes `understanding-engine.js` today (declared hard dependency, load-ordered after it in `dashboard.html`).
4. **Build incrementally against real signal, not the full spec at once** — e.g., Dependency Graph and Module Graph first (both derivable today from existing `analyzeRepository()` output plus require/import-style regex scanning), before Data Flow/UI Hierarchy/Startup/Auth/Sync graphs, which need signals nothing currently extracts.

## 7. Integration points

- Hard dependency on `understanding-engine.js.analyzeRepository()` (already the pattern `observation-engine.js` uses).
- Hard dependency on `ownership-scanner.js.scan()` for the Ownership Detection section.
- Optional dependency on `observation-engine.js`'s stored manifests (`getManifest`/`listManifests`/`compareManifests`) for the Version Understanding / evolution-history section — this is the one section of the spec closest to already having a data source, since manifests are milestone-stamped.

## 8. No duplicated functionality — verified

No suggestion above re-implements: per-file class/version/method/event extraction (owned by `understanding-engine.js`), name-collision detection (owned by `ownership-scanner.js`), or manifest persistence (owned by `observation-engine.js` + `CozyStorage`). The extension path composes all three; it introduces no parallel engine for anything that already exists.

---

## 9. Outcome

- AA-001 **closed** — real source read, compared against all recorded descriptions, Explanation 1 confirmed, Layer 2 spec correctly reclassified as target-state (not a fourth conflicting description).
- MD-001 **closed** — file confirmed present and loaded in the verified Main Production ZIP.
- No code implemented this pass. The extension path in §6 is a suggestion for a future, separately-scoped milestone — not authorized or begun by this analysis.
