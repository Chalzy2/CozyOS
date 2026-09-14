# CozyOS File - Phase 0: Repository Discovery Report

STATUS: DISCOVERY ONLY. No implementation was performed. No file was
created, modified, or deleted (other than this report). This exists to
establish what already exists before any Phase 1 work is authorized.

---

## Headline finding

CozyOS already contains a real, mature, honestly-disclosed document
platform covering a large fraction of what "CozyOS File" needs:

```
Image -> CozyOCR (core/modules/ocr/cozy-ocr.js)
       -> DocumentEngine (core/modules/documents/cozy-document-engine.js)
          [classification, Standard Document Record, permanent IDs,
           validation, receipt intelligence, optional IdentityEngine
           permission checks, audit logging]
       -> Document Understanding (core/modules/document-understanding/document-understanding.js)
          [sections, entities, tables - deterministic, never OCR/classification again]
       -> DocumentStorageProvider (core/modules/documents/cozy-document-storage-provider.js)
          [save/retrieve/search/version/archive/audit - REAL but IN-MEMORY ONLY,
           explicitly designed to be swapped for a real backend via the
           same 5-method registerStorageProvider() interface]
```

This is not a set of stubs. Each file's own header explicitly states
what it reuses and refuses to duplicate, and each is honest about its
own limitations (see component table below). "CozyOS File" should very
likely become the organization/permission/sharing/publishing/booklet/
print orchestration and UI layer built ON this existing pipeline, with
one new real, persistent storage backend - not a parallel document or
OCR engine.

## STOP CONDITION FLAGGED THIS ROUND

Two real components both claim storage-coordination responsibility,
and no evidence was found connecting them:

- core/storage.js ("CozyOS Universal Core Storage Gateway", v2.1.0) -
  the established, sole-authorized gatekeeper to IndexedDB, LocalStorage,
  SessionStorage, Cache API, and Cloud Sync. Has real tenant isolation
  (session-bound _activeTenantId) and append-only audit logging already
  built in.
- core/modules/storage/cozy-storage.js ("CozyOS Enterprise Framework -
  Storage Subsystem", v1.0.0) - a coordinator explicitly covering
  "storage spaces, objects, folders, collections, versions, snapshots,
  indexes, search, quotas" via an adapter-registration pattern
  (registerAdapter(category, adapter)), explicitly never implementing a
  database/filesystem/cloud service itself.

Searched directly: cozy-storage.js contains zero references to
core/storage.js. Whether cozy-storage.js's adapters are meant to
ultimately route through core/storage.js's gateway, or whether these
are two independent, non-integrated systems, was not resolved this
round. Per the master prompt's own stop conditions ("two engines appear
to own the same responsibility"), this must be resolved - by inspecting
actual adapter implementations and callers, not guessed at - before any
new storage-provider work begins.

---

## Component-by-component findings

### CozyOCR (the real, canonical OCR engine)

- PATH: core/modules/ocr/cozy-ocr.js
- PURPOSE: Extracts real text from images/scanned PDF pages, backed by
  Tesseract.js (WASM, client-side, optional CDN script)
- CURRENT OWNER: this file (window.CozyOS.OCR)
- RUNTIME STATUS: real when Tesseract.js is loaded; honestly returns
  {available:false} otherwise - never fabricates text
- DEPENDENCIES: Tesseract.js (optional, loaded like jsPDF/pdf.js
  elsewhere in CozyOS)
- REUSE POSSIBILITY: HIGH - already the reused-by-design OCR authority
  for cozy-document-engine.js
- LIMITATIONS: table/form extraction is an explicitly-disclosed layout
  heuristic (bounding-box grouping), not structural understanding
- SECURITY CONCERNS: none found; entirely client-side/offline, no
  network calls
- RECOMMENDATION: REUSE. Do not build a second OCR engine for File.

### OCR Studio (a separate, standalone application)

- PATH: core/modules/ocrstudio/ (ocr-engine.js, Ocr-register.js,
  ocr-cli.js, ocr-history.js, exporter.js, ocr-document.js, ocr-image.js,
  ocr-language.js, ocr-result.js)
- PURPOSE: A standalone OCR workflow tool (registry/history/export/CLI)
  built around "certified OCR Studio modules." Its own OCREngine
  explicitly self-declares: "It is NOT an OCR recognizer... never
  performs OCR recognition."
- CURRENT OWNER: this module family (window.CozyOS.OCRRegistry/
  OCRHistory/OCRExporter/OCRRunner/OCRCLI)
- RUNTIME STATUS: OBSERVED to exist and register real globals; its
  exact relationship to core/modules/ocr/cozy-ocr.js was NOT fully
  traced this round (searched for direct calls to window.CozyOS.OCR
  from ocr-engine.js and found none in the areas searched - this needs
  a deeper trace, not an assumption, before File depends on either)
- REUSE POSSIBILITY: UNKNOWN pending the trace above
- RECOMMENDATION: DOCUMENT ONLY this round. Before Phase 6 (OCR
  integration), determine definitively whether OCR Studio is a UI layer
  over cozy-ocr.js or an independent recognition path, and record the
  evidence.

### CozyDocumentEngine (the real document classification/lifecycle authority)

- PATH: core/modules/documents/cozy-document-engine.js
- PURPOSE: Document type detection (real keyword-based heuristic, honest
  "unknown/low confidence" fallback), Standard Document Record schema,
  permanent per-country monotonic document ID generation, validation,
  receipt intelligence, optional non-duplicate IdentityEngine permission
  checks, real audit logging matching existing CozyOS conventions
- CURRENT OWNER: this file (window.CozyOS.DocumentEngine),
  PluginManager-registered
- RUNTIME STATUS: real; explicitly refuses to fabricate extracted text
  if OCR isn't connected
- DEPENDENCIES: window.CozyOS.OCR (required for text extraction),
  window.CozyOS.IdentityEngine (optional, permission checks)
- REUSE POSSIBILITY: HIGH - this is very likely the correct owner of
  "document identity/classification/lifecycle" for CozyOS File, per the
  master prompt's own section 6 (File/Document Identity) and section 9
  (Document Lifecycle)
- LIMITATIONS: validation/receipt-intelligence are described as "real,
  computable checks only" - no AI/ML classification
- SECURITY CONCERNS: permission checks are optional and silently pass
  if IdentityEngine is absent - this fail-open-when-disconnected
  behavior needs explicit review before File relies on it for
  organization isolation (File's own security model must not
  silently degrade the same way)
- RECOMMENDATION: EXTEND. This is the real document identity/lifecycle
  owner; File should register into it, not replace it.

### Document Understanding Coordinator

- PATH: core/modules/document-understanding/document-understanding.js
- PURPOSE: Section/heading/paragraph/list detection, table
  interpretation, deterministic (regex/dictionary, never a trained
  model) entity extraction - strictly downstream of DocumentEngine,
  never touches OCR or classification itself
- CURRENT OWNER: this file
- RUNTIME STATUS: real, deterministic; explicitly documented as never
  reimplementing detectDocumentType()/parseDocument()
- DEPENDENCIES: window.CozyOS.DocumentEngine (required, never bypassed)
- REUSE POSSIBILITY: HIGH - this is the natural home for "document
  intelligence" (master prompt section 12) beyond what DocumentEngine
  itself does
- RECOMMENDATION: REUSE/EXTEND for entity/topic/keyword extraction
  needs; do not duplicate.

### Document Storage Provider (the existing, honest, in-memory reference implementation)

- PATH: core/modules/documents/cozy-document-storage-provider.js
- PURPOSE: save/retrieve/search/version/archive/audit for documents via
  DocumentEngine's own already-real, previously-unused
  registerStorageProvider() hook
- CURRENT OWNER: this file
- RUNTIME STATUS: REAL functionally, but explicitly, honestly disclosed
  as an in-memory reference implementation only - "NOT durable across a
  page reload," never presented as production-grade persistence, both
  in its own header comment and in a getDiagnosticsReport() method
- DEPENDENCIES: DocumentEngine's registerStorageProvider() hook (a
  fixed 5-method interface)
- REUSE POSSIBILITY: HIGH as an architectural pattern - a real backend
  (IndexedDB, a real database, cloud storage) can implement the exact
  same 5-method interface and replace this without any consuming
  application changing
- LIMITATIONS: not durable; this is the single most important concrete
  gap File's Phase 2 (storage abstraction + real provider) would need
  to close
- RECOMMENDATION: REVIVE THE PATTERN, REPLACE THE BACKEND. Do not
  invent a different storage-provider interface; implement a real,
  durable provider against this exact existing 5-method contract.

### Core Storage Gateway

- PATH: core/storage.js
- PURPOSE: sole authorized gateway to IndexedDB/LocalStorage/
  SessionStorage/Cache API/Cloud Sync; real tenant isolation
  (session-bound, non-overridable _activeTenantId); append-only audit
  log (put() -> add() specifically to prevent audit tampering)
- CURRENT OWNER: this file
- RUNTIME STATUS: mature (v2.1.0, multiple disclosed critical fixes in
  its own changelog); "Cloud Sync" portion confirmed in an earlier round
  of this engagement to be a placeholder (zero real fetch/XMLHttpRequest
  calls) - local browser storage access itself is real
- REUSE POSSIBILITY: potentially HIGH for a browser-local storage
  backend, but relationship to cozy-storage.js is unresolved (see STOP
  CONDITION above)
- RECOMMENDATION: DOCUMENT ONLY pending the storage-coordinator
  relationship trace.

### Storage Subsystem Coordinator

- PATH: core/modules/storage/cozy-storage.js
- PURPOSE: coordinates storage spaces/objects/folders/collections/
  versions/snapshots/indexes/search/quotas across CozyOS via an
  adapter-registration pattern; explicitly never implements a database/
  filesystem/cloud service/compression/encryption/sync engine itself
- CURRENT OWNER: this file
- RUNTIME STATUS: OBSERVED to exist with this stated scope; no adapter
  registrations or real backend were traced this round
- REUSE POSSIBILITY: potentially HIGH - its stated scope (objects,
  versions, indexes, search, quotas) maps almost exactly onto File's
  own Phase 2/5/7/31 needs - but see STOP CONDITION above
- RECOMMENDATION: DOCUMENT ONLY pending the storage-coordinator
  relationship trace. Do not build a third storage coordinator.

### Full-text search / indexing infrastructure

- PATH: none found
- PURPOSE: n/a
- RUNTIME STATUS: ABSENT - searched directly (full-text, fulltext,
  search-index patterns), zero hits anywhere in the repository
- RECOMMENDATION: this is genuinely new work for a future phase (master
  prompt Phase 7/8), once OCR-extracted text has a durable home to index
  from. Not to be built in Phase 0 or assumed to already exist.

### Server-side document/file database schema

- PATH: none found in server/webauthn-rp/migrations/
- RUNTIME STATUS: ABSENT - searched directly for CREATE TABLE
  statements matching document/file naming, zero hits
- RECOMMENDATION: genuinely new work for a future phase (master prompt
  Phase 1/3), following the exact same versioned-migration, partial-
  unique-index, organization-scoped pattern already proven across every
  registry built in this engagement since Phase 2 (billing, crypto
  payments, quotes, knowledge). Not to be designed in Phase 0.

### PDF library usage already present elsewhere in CozyOS

- OBSERVED: jsPDF/pdf-lib/pdf.js/PDFDocument reference patterns appear
  in core/modules/ocrstudio/ocr-image.js, core/modules/research/
  cozy-research-engine.js, core/modules/developer/developer-hub.js,
  core/modules/certification/certification-dashboard.js, core/modules/
  builder/understanding-engine.js, core/modules/builder/project-refactor.js,
  and core/modules/ocr/cozy-ocr.js's own header (which mentions jsPDF/
  pdf.js being loaded "the same way" Tesseract.js is)
- RECOMMENDATION: before Phase 11 (PDF Processing) or Phase 13 (Booklet
  Engine) begins, trace which of these is a real, reusable PDF
  generation/manipulation utility versus an unrelated, narrow use of a
  PDF library for a different module's own purpose. Not resolved this
  round - flagged as the next dependency for those specific future
  phases, not assumed.

### Existing organization/identity/permission/audit infrastructure

Already deeply verified in prior rounds of this engagement, re-confirmed
applicable: OrganizationRegistry, IdentityEngine (client-side, as
referenced by DocumentEngine's own optional integration), the
server-side audit_events table, and the KnowledgeRegistry's own
visibility/organization-isolation pattern (PUBLIC/USER/ORGANIZATION/
ADMIN/SYSTEM/SECRET) are all real, already-proven, already-tested
systems from this engagement's own prior phases.

- RECOMMENDATION: REUSE directly for File's own organization isolation,
  permission model, and audit requirements (master prompt sections 7,
  8, 28) - do not build parallel authorization or audit systems.

---

## Architectural principle - proposed ownership split, pending confirmation

```
CozyOS File (new)      -> orchestrates documents/folders/versions/
                          publishing/booklets/sharing UI; owns the NEW
                          durable storage backend and NEW server-side
                          schema; owns organization-scoped document
                          metadata
CozyOCR                -> owns OCR (REUSE, unchanged)
CozyDocumentEngine      -> owns classification/ID generation/validation/
                          lifecycle (REUSE/EXTEND, unchanged)
Document Understanding  -> owns sections/entities/tables (REUSE, unchanged)
IdentityEngine/         -> owns identity/organization authority (REUSE,
OrganizationRegistry       unchanged - note: File's server-side work
                          should use OrganizationRegistry, the real,
                          server-authoritative one from this engagement's
                          own prior phases, not solely the client-side
                          IdentityEngine DocumentEngine currently
                          optionally checks)
audit_events            -> owns audit evidence (REUSE, unchanged)
Storage coordinator     -> UNRESOLVED (core/storage.js vs
                          cozy-storage.js) - must be resolved before
                          File's own storage-provider work begins
```

## What was explicitly NOT done this round

No new implementation file was created. No existing file was modified.
No storage backend was implemented. No database migration was written.
No component's ownership ambiguity (OCR Studio's real relationship to
CozyOCR; core/storage.js vs cozy-storage.js) was resolved by guessing -
both are reported as open, evidence-based questions for the next round,
per the master prompt's own explicit stop conditions.

## Recommended next dependency

Resolve the storage-coordinator relationship (core/storage.js vs
core/modules/storage/cozy-storage.js) by tracing actual adapter
registrations and callers of each, since this determines the correct
foundation for File's own Phase 2 (storage abstraction + real provider)
work. This is the single blocking ambiguity found this round; every
other major piece of the pipeline (OCR, classification, understanding,
in-memory storage pattern) has a clear, evidenced owner already.

========================================
COZYOS FILE - PHASE REPORT
========================================

PHASE: 0 (Repository Discovery)
STATUS: COMPLETE

OBSERVED: CozyOCR, CozyDocumentEngine, Document Understanding
Coordinator, Document Storage Provider (in-memory), core/storage.js,
cozy-storage.js, OCR Studio module family, PDF library usage across
6 unrelated modules

VERIFIED: CozyOCR/DocumentEngine/Document Understanding form a real,
non-duplicating, honestly-disclosed pipeline (confirmed by direct
header/code inspection, not assumed)

INFERRED: the proposed ownership split above (reasonable given
evidence, not yet confirmed by implementation)

NOT-RUN: no tests were run this round (no code was changed)

SKIPPED: full trace of OCR Studio's relationship to CozyOCR; full
trace of core/storage.js vs cozy-storage.js's relationship; PDF
library reusability trace

BLOCKED: none - this is a discovery round, nothing required external
access

EXISTING COMPONENTS REUSED: none yet (discovery only)
NEW FILES: this discovery report only
MODIFIED FILES: none
DATABASE CHANGES: none
API CHANGES: none
SECURITY CHANGES: none
TEST RESULTS: not applicable (no code changed)
REAL PROVIDER RESULTS: not applicable
REGRESSION RESULTS: not applicable (no code changed; not run this round)

CHECKPOINT: not created - per the master prompt's own instruction that
a checkpoint is required for a "completed implementation," and this
round implemented nothing

NEXT DEPENDENCY: resolve the core/storage.js vs cozy-storage.js
ownership question before any Phase 1/2 implementation begins

STOP CONDITION: two engines (core/storage.js and cozy-storage.js)
appear to potentially own overlapping storage-coordination
responsibility, with no evidence found connecting them - per the master
prompt's own explicit stop conditions, this must be resolved with real
evidence before implementation proceeds, not guessed at.
========================================
