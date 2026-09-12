# Milestone 174 — OCR Provider Architecture

**Project:** CozyOS Enterprise
**Milestone ID:** 174
**Status:** Certified

> **Gate 0 note:** Milestone 174 was completed before the governance process
> (`Engineering-Governance-v1.0.md`) was formalized, so it has no formal
> Gate 0 section of its own. The baseline it was actually performed against
> is a known fact from that conversation, recorded here for continuity:
> **Baseline:** `CozyOS-main-v1_3_0-M173.zip` — `CozyOS-main` repository.
> All findings, ownership decisions, implementation, and certification
> below apply only to that baseline.

---

## Repository State

**Repository version:** `core/modules/ocr/cozy-ocr.js` → `1.1.0-ENTERPRISE`
(bumped from `1.0.0-ENTERPRISE`; additive change, no breaking signature changes)

**Verification status:** Certified — ownership, static, runtime, regression,
and honest-status checks all passed (see Verification below).

**Files modified:**
- `core/modules/ocr/cozy-ocr.js` (coordinator — provider registry, routing, status/discovery methods)
- `dashboard.html` (one line added — plugin script tag, no reordering)

**Files created:**
- `core/vendor/tesseract/manifest.json`

**Files archived:**
- `modules/cozy-ocr.js` → `_archive/ocr/cozy-ocr.js.archived-2026-07-26`

**Files loaded, unmodified:**
- `core/modules/ocr/plugins/tesseract-plugin.js` — confirmed byte-identical to the pre-174 repository

**Canonical ownership:** `core/modules/ocr/cozy-ocr.js` (`CozyOSOcrCoordinator`)
is the sole owner of `window.CozyOS.OCR`. Confirmed against `dashboard.html`'s
script tags, `core/platform/discovery-manifest.json`, and real calls from
`core/modules/documents/cozy-document-engine.js` (`ocr.extractText()`,
`ocr.parseReceipt()`), which exist only on this class. `modules/cozy-ocr.js`
(`CozyOCREngine`, v1.1.0-FINAL-FREEZE) had no live callers and is no longer
part of the repository's active ownership surface.

---

## Architecture

### OCR Provider Architecture

**Before:**
```
Document Engine → Cozy OCR → window.Tesseract
```

**After:**
```
Document Engine → parseDocument()
                      │
                      ▼
              Cozy OCR Coordinator → extractText()
                      │
                      ▼
                OCR Provider Registry
                      │
                      ▼
                Tesseract Provider (tesseract-plugin.js)
                      │
                      ▼
                   Worker → WASM → Recognition
```

`parseDocument()` is owned by `core/modules/documents/cozy-document-engine.js`,
not by the coordinator — shown only to make the full call chain accurate.

### Single Canonical Coordinator

One coordinator, one registry, one active provider selected by priority. No
second engine, no second `window.CozyOS.OCR` owner.

### Provider Registration Model

Providers register themselves at load time via `registerPlugin()`/
`registerProvider()`. The coordinator stores each as `{priority, instance}`;
the highest-priority registered provider is the active one. A provider must
expose `process(file)` returning `{rawText, confidence}` — this is validated
at registration time, not assumed.

### Provider Contract (shipped API)

| Method | Purpose |
|---|---|
| `registerPlugin(pluginId, pluginInstance, priority)` | Register a provider. Original name — the exact call `tesseract-plugin.js` already makes. |
| `registerProvider(providerId, providerInstance, priority)` | Alias of `registerPlugin()`, vendor-neutral naming for new providers. |
| `unregisterPlugin(pluginId)` / `unregisterProvider(providerId)` | Remove a registered provider. |
| `listPlugins()` | List registered providers with priority and version. |
| `getProvider()` | Metadata for the active provider: `{providerId, priority, version}`, or `null`. |
| `status()` | Alias of `getProviderStatus()`. |
| `languages()` | Delegates to the active provider's own language registry. Returns `null` if none registered or none exposed — never guesses. |
| `isAvailable()` | Checks the active provider's `getHealthStatus().isWorkerActive` first; falls back to `window.Tesseract` presence. |
| `extractText(imageSource, {lang})` | Routes through the active provider first; falls back to direct `window.Tesseract.recognize()` if no provider is registered. |

---

## Implementation

### Coordinator Additions

Added to `core/modules/ocr/cozy-ocr.js`: `#ocrPlugins` registry (private field),
`registerPlugin()`/`unregisterPlugin()`/`listPlugins()`,
`registerProvider()`/`unregisterProvider()` aliases, `getProvider()`,
`languages()`, `status()`. Modified `isAvailable()` and `getProviderStatus()`
to check the active provider first. Modified `extractText()` to route through
the active provider's `process()` before falling back to direct
`window.Tesseract`.

All pre-174 methods (`extractFromMultiple()`, `extractTables()`,
`extractForm()`, `parseReceipt()`, `createDocumentRecord()`,
`registerReceiptAnalyzer()` and related, `getDiagnosticsReport()`,
`exportSnapshot()`) are unchanged in signature and return shape.

### Plugin Integration

`core/modules/ocr/plugins/tesseract-plugin.js` required no changes —
its existing `window.CozyOS.OCR.registerPlugin("tesseract", TesseractPlugin, priority)`
call matches the coordinator's new `registerPlugin()` signature exactly.
Diffed against the pre-174 repository: byte-identical.

### Dashboard Integration

`dashboard.html`: one `<script src="core/modules/ocr/plugins/tesseract-plugin.js">`
line added immediately after `cozy-ocr.js`. No other script reordered.

### Vendor Manifest

Created `core/vendor/tesseract/manifest.json`: `installed:false`, every
required file (`tesseract.min.js`, `worker.min.js`, `tesseract-core.wasm.js`,
five `.traineddata` packs) marked `present:false`.

### Ownership Resolution

`modules/cozy-ocr.js` copied to `_archive/ocr/cozy-ocr.js.archived-2026-07-26`
with a header explaining the conflict and resolution, then removed from its
original path. Its document-type detection (National ID / Passport / Driving
Licence / KRA PIN / Business Certificate) and SHA-256 dedup hashing were not
migrated to the canonical class — noted in the archive header as future work
if ever needed, not fabricated as already present.

---

## Verification

**Repository verification:** Confirmed via direct file reads that
`dashboard.html`, `core/platform/discovery-manifest.json`, and
`cozy-document-engine.js` all point to `core/modules/ocr/cozy-ocr.js` as the
live coordinator before any changes were made.

**Static verification:** `node --check` passed on both `cozy-ocr.js` and
`tesseract-plugin.js` after modification. Full `diff` against the original
repository reviewed line-by-line.

**Runtime verification:** Both files loaded together in a live Node harness
(minimal `window`/`document` shim, no network):
- `registerPlugin("tesseract", TesseractPlugin, 100)` completed without throwing
- `listPlugins()` → `[{pluginId:"tesseract", priority:100, version:"2.1.0"}]`
- `getProvider()` → `{providerId:"tesseract", priority:100, version:"2.1.0"}`
- `status()` output matched `getProviderStatus()` output exactly
- `languages()` → real registry `{eng, swa, ara, fra, som}`, active `"eng+swa"`
- `isAvailable()` with no vendor library present → `false`
- `extractText()` with no vendor library present → `{available:false, reason:...}`

**Regression verification:** `diff` against the pre-174 repository confirmed
`document-router.js`, `cozy-document-engine.js`, and
`core/modules/ocr/plugins/tesseract-plugin.js` are byte-identical — zero
changes required in any existing consumer.

**Honest vendor status verification:** `core/vendor/tesseract/manifest.json`
contains `installed:false` and `present:false` on every required file; no
occurrence of `healthy`, `ready:true`, or `connected:true` anywhere in the
manifest.

---

## Known Limitations

- **Vendor binaries not installed** — `installed:false` in
  `core/vendor/tesseract/manifest.json`. No network access in the current
  build environment to fetch `tesseract.min.js`, `worker.min.js`,
  `tesseract-core.wasm.js`, or the `.traineddata` packs.
- **Provider currently exposes text/confidence only** — `tesseract-plugin.js`'s
  `process()` contract returns `{rawText, confidence}`, nothing more.
- **Rich layout output intentionally deferred** — words, lines, blocks,
  tables, and forms are not available through the provider path.
  `extractTables()`/`extractForm()` still require the direct
  `window.Tesseract` path. Not implemented as a stopgap or approximation —
  deferred outright rather than fabricated.

---

## Continuation

**Repository state after Milestone 174:** Single canonical OCR owner
(`core/modules/ocr/cozy-ocr.js`, v1.1.0-ENTERPRISE) with a working provider
registration seam; `tesseract-plugin.js` registered and loaded but not yet
functional (no vendor binaries); all existing consumers unchanged.

**Known blockers only:**
- Vendor binaries require network access not available in this build environment.
- Rich layout output requires provider interface expansion (not yet designed).

No future plans are recorded here. Planned work (rich provider output, vendor
installation, AI+OCR integration) is tracked separately in `OCR-Roadmap.md`,
per the Constitution's rule that the milestone record contains only completed,
verified work.
