# Micro-Milestone C — OCR Authority Reconciliation Audit

**Type:** Audit only. No production files were changed in this pass.
**Baseline:** Checkpoint B — Public/Private Story Governance
**Baseline SHA-256:** `66c31a9e3362041b38488339471d83b529199892d7346a7159cba11e2a224fce`
(Verified: this hash was recomputed against the actual uploaded checkpoint
before any work began, and matched exactly.)

This audit confirms, extends, and cross-checks the OCR ownership conflict
first disclosed in `docs/audits/MICROMILESTONE-A-COZYAI-OWNERSHIP-AUDIT.md`
(row 15) and referenced honestly in `cognitive-coordinator.js`'s
`runFromImage()` header. Nothing here overrides those prior disclosures;
this document goes deeper on each required audit dimension.

---

## 1. Authority 1 — `core/modules/ocr/cozy-ocr.js` ("CozyOCR")

| Dimension | Finding |
|---|---|
| Owner | `core/modules/ocr/` — registers `window.CozyOS.OCR` |
| Version | 1.1.0-ENTERPRISE |
| Live/dead | **LIVE.** Loaded by `<script src="core/modules/ocr/cozy-ocr.js">` in `admin-workspace.html` (line 1545), followed by its plugin and router. |
| Script/module loading | Classic browser global IIFE — `(function(){...})()`, no `require`/`import`. Sets `window.CozyOS.OCR = new CozyOSOcrCoordinator()`. |
| Callers/consumers (repo-wide grep, not name-guessed) | `cozy-research-engine.js`, `cozy-developer.js`, `developer-hub.js` (x2), `certification-dashboard.js`, `ai-bootstrap.js` (registers it as the real "vision" provider), `understanding-engine.js` (Builder), `cognitive-coordinator.js` (`runFromImage()`), `cozy-document-engine.js`, `platform-resource-manager.js` (receipt-analyzer inventory), `cozy-living-assistant.js` (Living Floating Assistant's image-attach button), `shopOS-core.js` (integration health check). This is a wide, real consumer set — not a stub referenced once. |
| API | `extractText()`, `extractFromMultiple()`, `extractTables()`, `extractForm()`, `parseReceipt()`, `createDocumentRecord()`, `registerReceiptAnalyzer()/getReceiptAnalyzer()/hasReceiptAnalyzer()/listReceiptAnalyzers()`, `registerPlugin(id, instance, priority)`, `isAvailable()`, `getVersion()`, `getProviderStatus()`. |
| Dependencies | Optional `window.Tesseract` (direct path) or a registered OCR driver plugin (`tesseract-plugin.js`) via `registerPlugin()`. Optional `ServiceRegistry.registerCoordinator()`. |
| OCR provider | Tesseract.js v6.x, client-side WASM. `core/modules/ocr/plugins/tesseract-plugin.js` is the certified v6 driver adapter (createWorker(lang, oem, options) contract). |
| Supported input types | Images and image-based PDF pages (per header); `extractFromMultiple()` for multi-image merge. |
| Output format | `{available, text, confidence, reason}` from the plugin contract; `extractTables()`/`extractForm()` additionally use Tesseract's own word bounding boxes (layout heuristic, explicitly documented as non-structural). |
| Existing tests | **None found.** No `*ocr*.test.js` file exists anywhere in the repository for this module. It is exercised only indirectly (mentions inside other modules' comments), never with a dedicated executed test suite. |
| Browser/runtime tests | None found beyond the script-tag load order itself. |
| Production usage | Wired into real UI/flows (Document Engine, Living Assistant, Developer Hub, Research Engine) — but **not yet operational**, because the OCR binary is not installed (see §5). |
| Security/authorization boundary | `extractText()` itself performs **no permission check** — any caller with a reference to `window.CozyOS.OCR` can invoke it directly. The one caller that does gate it — `cozy-document-engine.js#parseDocument()` — calls `#checkPermission(userId, "document:create")`, but that check silently returns `true` (i.e., allows) whenever `IdentityEngine` isn't connected or no `userId` is passed. This is a genuine, pre-existing gap, not something this milestone introduces or fixes. |
| Organization context | Not organization-scoped itself; it is a shared Core coordinator consumed by application-layer code (ShopOS, MpesaOS, Document Engine, etc.). |
| Application-specific or reusable Core | **Reusable Core.** Confirmed via its consumer breadth — it is consumed by cross-application coordinators (Cognitive Coordinator, Document Engine), not by one app. |
| Overlap with the other implementation | Same capability domain (image → recognized text) as OCR Studio, but no shared code path — see §3. |

## 2. Authority 2 — `core/modules/ocrstudio/` ("OCR Studio")

10 files: `Ocr-register.js`, `ocr-document.js`, `ocr-engine.js`, `ocr-result.js`, `ocr-language.js`, `ocr-cli.js`, `ocr-history.js`, `ocr-image.js`, `exporter.js`, `orc-runner.js`.

**Filename note (per the "not by file name alone" instruction):** several files'
own internal header comments name a *different* filename than the file
actually uses on disk:
- `Ocr-register.js` — header says `core/modules/ocrstudio/ocr-registry.js`
- `orc-runner.js` — header says `core/modules/ocrstudio/ocr-runner.js` (the
  file on disk has a transposed "orc"/"ocr" typo in its actual name)

This mismatch was investigated by content and by grep, not by name — the
findings below reflect what the code actually does, not what its docstring
claims.

| Dimension | Finding |
|---|---|
| Owner | `core/modules/ocrstudio/` — registers `window.CozyOS.OCRRegistry`, `OCREngine`, `OCRDocument`, `OCRResult`, `OCRLanguage`, `OCRCLI`, `OCRHistory`, `OCRExporter`, `OCRRunner`, and `OCR.OCRImage` (nested — see collision note below). |
| Version | 1.0.0-PRODUCTION (each module) |
| Live/dead | **DEAD at runtime.** No `<script>` tag, `import`, or `require()` anywhere in the repository loads any `ocrstudio/*` file. Confirmed by a full-repo grep for `ocrstudio` in every `.html` file (zero matches) and every `.js` file (matches only inside the `ocrstudio/` files' own headers plus two honest disclosure comments in `cognitive-coordinator.js` and `cozy-knowledge-ingestion.js`). |
| Script/module loading | Same browser-global IIFE pattern as CozyOCR, but never actually executed by any real page. |
| Callers/consumers | **None in the shipped application.** Internally the modules call each other (`OCREngine` → `OCRRegistry`; `OCRRunner` → `OCRDocument`/`OCREngine`), but nothing outside `ocrstudio/` calls into it. |
| API | Split across many single-responsibility registries — `OCRRegistry` (immutable descriptors), `OCRDocument`/`OCRResult`/`OCRHistory` (immutable record stores), `OCREngine`/`OCRRunner` (orchestration only — explicitly "NOT an OCR engine"), `OCRImage` (real pixel preprocessing — the one designated execution engine), `OCRLanguage` (language metadata registry, provider-agnostic — lists Tesseract/PaddleOCR/EasyOCR/Google Vision/Azure OCR as future providers), `OCRCLI` (command validator/dispatcher), `OCRExporter` (JSON/TEXT serialization of history). |
| Dependencies | Purely internal — each module depends only on other `ocrstudio/` modules via `window.CozyOS.*`. No external library reference. |
| OCR provider | **None wired.** Every module's own header states it performs no recognition. `OCREngine`'s job is to orchestrate a recognition call, but nothing in the subsystem actually calls Tesseract, PaddleOCR, or any other backend — `OCRLanguage` only lists these as metadata for future engines to consult. |
| Supported input types | Registry-level only (documents, images, by descriptor) — no real file/byte handling exists since no execution engine is wired. |
| Output format | `OCRResult` descriptor shape only — never populated by a real recognition run. |
| Existing tests | **None found** for any `ocrstudio/` file. |
| Browser/runtime tests | None — consistent with never being loaded. |
| Production usage | **None.** |
| Security/authorization boundary | N/A — never reached at runtime, so it enforces nothing and blocks nothing. |
| Organization context | None — no application wires it in. |
| Application-specific or reusable Core | Was clearly *designed* as reusable Core infrastructure (provider-agnostic language registry, Zero Logic Rule discipline throughout) but has zero live integration to demonstrate that in practice. |
| Overlap with the other implementation | Same capability domain, genuinely un-integrated with CozyOCR — see §3. |

### Namespace collision risk (new finding this pass)

`ocr-image.js` does:
```js
window.CozyOS.OCR = window.CozyOS.OCR || {};
window.CozyOS.OCR.OCRImage = Object.freeze({ ... });
```

`cozy-ocr.js` does:
```js
if (window.CozyOS.OCR && typeof window.CozyOS.OCR.getVersion === "function") { ...; return; }
window.CozyOS.OCR = new CozyOSOcrCoordinator();
```

Both target the **same key**, `window.CozyOS.OCR`. Today this is inert only
because `ocrstudio/` is never loaded. If it were ever added to a page
*before* `cozy-ocr.js`, `cozy-ocr.js`'s guard (`typeof getVersion ===
"function"`) would be false against `ocr-image.js`'s plain object, so
`cozy-ocr.js` would silently overwrite it, destroying the `OCRImage`
registration. If loaded *after*, `ocr-image.js` would attach `OCRImage` as
an extra property onto the live `CozyOSOcrCoordinator` instance — not
fatal, but not a designed integration either. This is a **latent
collision, not an active bug** (since only one side is ever actually
loaded), and is recorded here, not fixed, per this milestone's audit-only
scope.

## 3. Dependency Map

**CozyOCR (live) — full chain, end to end:**
```
Image / scanned PDF page
  ↓
window.CozyOS.OCR (cozy-ocr.js, CozyOSOcrCoordinator)
  ↓ (registered driver, if present)
tesseract-plugin.js → window.Tesseract (v6, WASM) — NOT INSTALLED (see §5)
  ↓
{available, text, confidence} normalized result
  ↓
consumers: cognitive-coordinator.js (runFromImage), cozy-document-engine.js
(parseDocument/parseReceipt), cozy-living-assistant.js (image-attach),
understanding-engine.js (Builder), cozy-research-engine.js
  ↓
cozy-document-engine.js assembles the Standard Document Record (Permanent
Document ID, document-type detection, receipt/invoice field extraction,
validation warnings) — the one point where OCR output reaches a
business/storage record.
```

**OCR Studio (dead) — designed chain, never wired to any input or consumer:**
```
(no live input path)
OCRRegistry ← OCRDocument/OCRResult/OCRHistory (immutable descriptor stores)
OCREngine/OCRRunner (orchestration only, no backend attached)
OCRImage (real pixel preprocessing, but nothing feeds it or reads from it)
OCRLanguage (metadata registry — Tesseract/PaddleOCR/EasyOCR/Google
Vision/Azure OCR listed as available *provider names*, none implemented)
OCRCLI / OCRExporter (command + export layer over the above, never invoked)
  ↓
(no consumer, no storage/business record ever produced)
```

**Should one become the reusable CozyOS OCR Core?**

They are not "genuinely different purposes" in the sense of solving
different problems — both exist to turn an image into text. But they
differ sharply in *design intent*: CozyOCR is a single coordinator that
owns recognition, receipt parsing, and table/form heuristics together;
OCR Studio is a decomposed set of single-responsibility registries
(explicitly "Zero Logic Rule" — no module may both orchestrate and
execute) with a real, designed exception for image preprocessing
(`OCRImage`) and a provider-agnostic language registry that already
anticipates non-Tesseract engines. CozyOCR is proven by its live,
wide consumer base; OCR Studio is proven by nothing, because it has
never run. A future consolidation is plausible (OCR Studio's
provider-agnostic language registry and its `OCRImage` preprocessing
engine are the two components most likely worth keeping if that
milestone happens), but forcing that decision now is out of scope — this
milestone documents the conflict, it does not resolve it.

## 4. Dead Code

`core/modules/ocrstudio/` (all 10 files) is recorded as:

**DEAD / RECOVERY CANDIDATE**

Not deleted, not merged, not modified. Concepts worth extracting if/when a
real OCR Core decision is made:
- `OCRLanguage`'s provider-agnostic design (already lists Tesseract,
  PaddleOCR, EasyOCR, Google Vision, Azure OCR as future backends —
  CozyOCR today is Tesseract-only).
- `OCRImage`'s designated pixel-preprocessing execution engine (geometry,
  filters, tone) — CozyOCR has no equivalent preprocessing step of its
  own before handing an image to Tesseract.
- The strict orchestration/execution separation pattern itself (`OCREngine`
  never executes; `OCRRunner` only coordinates) as a possible refactor
  target for CozyOCR, which currently mixes coordination and execution in
  one class.

## 5. Security

- OCR can be pointed at private documents, business documents, receipts,
  IDs, images, and screenshots — nothing in `extractText()`'s signature
  restricts input type or classifies sensitivity; it processes whatever
  `imageSource` it is given.
- Processing is local/offline (Tesseract.js WASM, no network call) once a
  real backend is installed. **Today, no real backend is installed** —
  `core/vendor/tesseract/manifest.json` reports `"installed": false` for
  every required file (`tesseract.min.js`, `worker.min.js`,
  `tesseract-core.wasm.js`, and all five language packs), so
  `window.Tesseract` is undefined and `isAvailable()` is honestly `false`
  in this environment. No image is actually being recognized anywhere in
  production right now.
- Existing boundary: the only permission gate in the whole chain is
  `cozy-document-engine.js#checkPermission(userId, "document:create")`,
  and it fails open (returns `true`) when `IdentityEngine` isn't wired or
  `userId` is omitted. `window.CozyOS.OCR.extractText()` itself, and every
  other direct caller of it (Living Assistant's image-attach button,
  Cognitive Coordinator's `runFromImage()`, the Understanding
  Engine/Builder), has **no permission check at all** — this is a genuine,
  pre-existing gap, disclosed here and left unchanged per this milestone's
  scope.

## 6. Third Implementation Check

No third OCR implementation exists. Searched for PaddleOCR, EasyOCR,
Google Vision, Azure OCR, AWS Textract, and OCR.space integrations
repository-wide — the only hits are inside `ocr-language.js` (metadata
list of future/unimplemented providers) and `cozy-ocr.js`'s own docstring.
`core/modules/vision/cozy-vision.js` ("CozyVision") was checked because
its header mentions OCR, but it is a distinct, genuinely separate
subsystem: a request/session/adapter registry for vision tasks broadly
(camera, barcode, QR, object detection, OCR) that explicitly states it
performs no computation itself ("CozyVision is NOT: OCR engine..."). It
tracks OCR *requests* as metadata (`_ocrRequests` map) but never extracts
text — it is not a third OCR authority, and it does not currently delegate
to either `cozy-ocr.js` or `ocrstudio/`. No server-side OCR code exists
(`server/` has no OCR references).

## 7. Tests Run This Pass

No dedicated OCR test file exists for either authority (confirmed by
repository-wide search), so there was nothing to add a browser/runtime
test *against* without creating new production wiring, which is out of
scope for an audit-only milestone. No test was added. The existing
non-OCR test suites were left untouched and were not re-run, since no
production file changed for them to regress against.

## 8. Summary

- **CozyOCR (`core/modules/ocr/cozy-ocr.js`) is the live, reusable Core
  authority** — genuinely wired across Research, Document Engine, Living
  Assistant, Cognitive Coordinator, Understanding Engine/Builder, and
  ShopOS's health check — but not yet operational because its Tesseract.js
  vendor binaries are not installed.
- **OCR Studio (`core/modules/ocrstudio/`) is dead code** — well-designed,
  disciplined, but never loaded by any page and never called by anything
  outside itself. Recorded as DEAD / RECOVERY CANDIDATE, not deleted.
- The two systems do not share code today and do not conflict at runtime
  only because OCR Studio is never loaded; a latent `window.CozyOS.OCR`
  namespace collision exists and is documented, not fixed.
- The permission gap (OCR itself is uncontrolled; only one downstream
  consumer checks permission, and that check fails open) is a genuine,
  pre-existing security gap, documented and left unchanged.
- No production files were modified. This document is the only
  intentional addition in this milestone.
