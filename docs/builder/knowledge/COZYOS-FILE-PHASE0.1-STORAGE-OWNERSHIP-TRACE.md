COZYOS FILE - PHASE 0.1 REPORT
Storage Ownership & Adapter Trace

CODE CHANGED: NO

No file was created, modified, or deleted other than this report. No
new files, migrations, routes, UI, or storage adapters were built. No
existing file (CozyDocumentEngine, CozyDocumentStorageProvider,
core/storage.js, cozy-storage.js, CozyOCR) was modified.

================================================================
A. core/storage.js - TRACE RESULTS
================================================================

Real global: window.CozyStorage (NOT window.CozyOS.Storage - this was
a real correction made during this round's own search; the initial
search pattern was wrong and was redone with the correct name once
the file's actual export was inspected directly).

Also exports as an ES module default export (export default
CozyStorageGateway), in addition to the window global - the only
storage-related file in this repository doing so.

1/2. Real, load-bearing callers (grep-confirmed, not inferred):
     core/ai.js, core/ai/cozy-ai-memory.js, core/ai/cozy-ai-language.js
     (all three LOCKED files), core/ai/cozy-ai-integration.js (the AI
     orchestrator), core/pluginManager.js, core/languageImporter.js,
     core/connectivity/transport.js, core/connectivity/recovery.js,
     core/connectivity/snapshot.js, core/security/authentication-
     enrollment-store.js, core/calculation/business-record-engine.js,
     core/plugins/mpesaOS.js, core/plugins/mpesaOS-engine.js,
     core/plugins/hospitalOS.js, core/modules/identity/
     auth-coordinator.js, core/modules/intelligence/language-packs/
     cozy-language-pack-persistence.js, core/modules/intelligence/
     language-packs/storage/cozy-storage-provider.js, and several
     application/module files (modules/quarry/*, modules/billingEngine.js,
     modules/smallBusiness.js, modules/mpesaAgent.js, modules/wellbeing.js).
3. Real API surface includes initModule(tenantId, moduleContext),
   transaction-based read/write methods, and an internal
   _logAudit(actionType, tenantId, details) writing to an "audit_logs"
   IndexedDB object store.
4/5. Runtime registration: window.CozyStorage = CozyStorageGateway,
     guarded by typeof window !== "undefined" - browser-only. No
     server-side reference found anywhere in server/webauthn-rp/.
6. It is directly authoritative for IndexedDB access itself - not a
   gateway to another storage system. Its own header states it is "the
   absolute ONLY component in CozyOS allowed to talk directly to
   IndexedDB, LocalStorage, SessionStorage, Cache API, and Cloud Sync."
7. Tenant isolation (_activeTenantId, session-bound, non-overridable
   per its own changelog entry F-02) applies at the module/tenant
   level generically - it is not document-specific. It isolates
   whatever data a calling module stores through it, for whichever
   tenant is active; it has no built-in concept of a "document" at all.
8. Append-only audit: _logAudit() uses IndexedDB's add() (never put())
   specifically so existing audit_logs entries cannot be overwritten -
   confirmed directly in the code, matching its own changelog entry
   F-03 ("switched put() -> add() to make audit log append-only").
9. Persistence: real IndexedDB persistence survives page reload and
   browser restart on the same device (standard IndexedDB behavior).
   Device restart: also survives, since IndexedDB is disk-backed, not
   memory-backed. Deployment: NOT APPLICABLE in the sense of surviving
   a new deployment - IndexedDB is per-browser-profile, per-device
   storage; a new device, browser, or cleared browser data would not
   see this data at all. This is real, working local persistence, not
   any form of server-side or cross-device durability.
10. Whether it currently stores actual large binary files: no evidence
    found of this being exercised for large binaries specifically. Its
    callers (audit logs, business records, plugin data, connectivity
    snapshots) all appear to be structured/JSON-shaped data, not raw
    document binaries. IndexedDB itself can technically store Blobs,
    but no caller was found doing so in this repository.

CONCLUSION FOR A: core/storage.js / window.CozyStorage is a real,
widely-integrated, actively load-bearing browser storage gateway -
including use by all three locked AI files. It is NOT currently used
for document/file binary storage, and has no built-in document concept.

================================================================
B. core/modules/storage/cozy-storage.js - TRACE RESULTS
================================================================

Real global: window.CozyOS.CozyStorage (distinct namespace from A's
window.CozyStorage - confirmed no naming collision).

1/2. Real external callers (only three found in the entire repository,
     beyond the file's own internal use):
     core/modules/builder/observation-engine.js (3 references),
     core/platform/platform-resource-manager.js (1 reference),
     core/shell/cozy-workspace.js (1 reference).
     All three uses are defensive/optional existence checks
     (e.g. "cozyStorage: !!window.CozyOS.CozyStorage", or
     "{ label: 'Loading Storage', loaded: !!(window.CozyOS &&
     window.CozyOS.CozyStorage) }") - none of the three treat it as a
     required, load-bearing dependency.
3. Real exported methods include getMediaBreakdown, registerCacheEntry/
   listCacheEntries/pinObject/unpinObject/recordRecentlyUsed/
   listRecentlyUsed, enqueuePending/listPending/markProcessed,
   listAudit, getHealth, registerDeviceCapability/getDeviceCapability/
   listDeviceCapabilities, registerPlugin/listPlugins/getPlugin,
   listIntegrations/isKnownIntegration, getVersion, and
   registerAdapter(category, adapter)/registerCompressionAdapter/
   registerEncryptionAdapter.
4. Runtime registration: window.CozyOS.CozyStorage = Object.freeze({...}).
5. Adapter interface: registerAdapter(category, adapter) is real and
   functional as a registration mechanism.
6. Adapter implementations currently present: NONE. Searched the
   entire repository for actual .registerAdapter( CALLS (not the
   definition) - found zero. The mechanism works; nothing has ever
   used it.
7. No memory, SQLite, PostgreSQL, filesystem, or object-storage adapter
   exists for this coordinator anywhere in the codebase.
8. Browser-side only (window.CozyOS.CozyStorage, no server-side
   reference found).
9. NOT production-wired in any load-bearing sense - its only three
   callers use it defensively, never as a required dependency, and it
   has no adapters registered to actually do any storage work through.
10. Its object/version/folder/index/quota model is NOT currently
    consumed by any existing application in a load-bearing way.

CONCLUSION FOR B: core/modules/storage/cozy-storage.js is real,
correctly-written code with a genuinely working adapter-registration
mechanism, but it is an unused/planned coordinator today - built, but
with zero adapters ever registered and only optional, defensive
external references.

================================================================
C. CozyDocumentStorageProvider - TRACE RESULTS
================================================================

1. Exact path: core/modules/documents/cozy-document-storage-provider.js
2. Exact required 5-method interface, confirmed directly from
   DocumentEngine's own registerStorageProvider() validation code:
   save, load, delete, archive, restore
   (const required = ["save", "load", "delete", "archive", "restore"])
3. All callers of registerStorageProvider(: exactly two files in the
   entire repository - the DEFINITION inside
   core/modules/documents/cozy-document-engine.js, and the one real
   CALLER, core/modules/documents/cozy-document-storage-provider.js
   itself (which registers itself as the provider).
4. All implementations: exactly one - the in-memory reference
   implementation in cozy-document-storage-provider.js. No other file
   implements this five-method interface anywhere in the repository.
5. Confirmed: the in-memory provider is the only implementation that
   exists today.
6. No adapter/provider bridge exists between this and either A or B -
   DocumentEngine's #storageProvider is called directly, with zero
   intermediation from core/storage.js or cozy-storage.js.
7. CozyDocumentEngine assumes this interface directly - it calls
   this.#storageProvider.save(record) / .load(documentId) /
   .delete(documentId) / .archive(documentId) / .restore(documentId)
   with no coordinator in between (confirmed by direct code inspection
   of each call site).
8. Confirmed: replacing the provider implementation with a real,
   durable one requires zero changes to DocumentEngine, provided the
   new implementation exposes exactly these five methods with
   compatible signatures. This was verified by reading the actual call
   sites, not inferred from documentation.

ADDITIONAL REAL FINDING, not previously known: saveDocument() has real
Vault integration - when window.CozyOS.Vault is connected, it requests
a real encryption key (reusing an existing one via Vault's own
validateKey(), never duplicating that logic), encrypts the record's
raw text, and stores only ciphertext. DocumentEngine never stores the
encryption key itself, only a keyId reference. This is relevant to any
future real storage provider's own security design.

================================================================
D. DOCUMENT ENGINE - ACTUAL CALL CHAIN
================================================================

Confirmed, direct, unambiguous:

CozyDocumentEngine -> CozyDocumentStorageProvider

There is no intermediate coordinator. Every one of CREATE, SAVE
(save), RETRIEVE (load), SEARCH, VERSION, ARCHIVE (archive), and
RESTORE (restore) calls this.#storageProvider.<method>() directly.
Neither core/storage.js nor cozy-storage.js sits anywhere in this
chain today.

================================================================
E. ALL STORAGE ADAPTER REGISTRATIONS - REPOSITORY-WIDE SEARCH
================================================================

Searched for registerAdapter, StorageProvider, storageProvider,
StorageAdapter across the entire repository (excluding node_modules).

Real, functioning registration mechanisms found: exactly two -
DocumentEngine's registerStorageProvider() (section C above) and
cozy-storage.js's registerAdapter() (section B above). No third,
hidden integration was found. No configuration file, environment
variable, dependency-injection container, or factory function
referencing either mechanism was found beyond what is already
documented in sections A-D.

================================================================
F. REAL DATABASE STORAGE - FINDINGS
================================================================

WHAT EXISTS: real, production-grade PostgreSQL and SQLite adapters at
server/webauthn-rp/db.js and the broader server/webauthn-rp/ registry
family (OrganizationRegistry, BillingRegistry, PaymentRegistry,
CryptoPaymentRegistry, QuoteEngine, KnowledgeRegistry - all built and
verified across prior phases of this same engagement).

WHO OWNS IT: server/webauthn-rp/db.js (openDb(), the shared connection/
migration entry point every registry above already uses).

WHAT IT STORES: structured relational metadata only - users,
organizations, billing/subscription records, payment intents, crypto
transactions, quotes, and the recently-added knowledge_records table.
No document- or file-specific table exists anywhere in the current
migration set (confirmed again this round; unchanged from Phase 0).

WHAT IT DOES NOT STORE: any large binary object (PDF bytes, images,
scanned documents, generated booklets, etc.) - there is no BLOB/bytea
column or object-storage reference table for documents anywhere in the
current schema.

CONCLUSION FOR F: the existing PostgreSQL/SQLite infrastructure is a
real, proven, reusable foundation for a future document_versions-style
metadata table (following the exact same versioned-migration,
organization-scoped pattern already used everywhere else), but it does
not currently store, and was never designed to store, large binary
document content itself.

================================================================
G. OBJECT STORAGE CANDIDATES - REPOSITORY-WIDE SEARCH
================================================================

Searched for: S3, S3-compatible, R2, object storage, blob storage,
bucket, presigned URL, signed URL, multipart upload, stream upload,
filesystem storage, cloud storage patterns (aws-sdk, CloudflareR2,
presignedUrl, multipart.*upload).

RESULT: zero real or stub candidates found anywhere in the repository.

PATH: none
OWNER: none
STATUS: ABSENT
REAL/STUB: neither exists
CALLERS: none
CONFIGURATION: none
PRODUCTION-WIRED: no
RECOMMENDATION: this is genuinely new infrastructure for a future
phase (master prompt Phase 2). Nothing to reuse, extend, or revive
here - confirmed by direct, exhaustive search, not assumed absent.

================================================================
H. OCR STUDIO -> CozyOCR RELATIONSHIP
================================================================

RESULT: NOT CONNECTED for actual text extraction, with a nuance worth
recording precisely rather than forcing into a simpler answer.

Evidence: core/modules/ocrstudio/ocr-image.js does reference
window.CozyOS.OCR - but not by calling any of cozy-ocr.js's methods.
Instead, it does window.CozyOS.OCR = window.CozyOS.OCR || {} and then
adds its own sub-property, window.CozyOS.OCR.OCRImage = {...}. This is
a genuine SHARED NAMESPACE, not a call relationship: cozy-ocr.js
populates window.CozyOS.OCR with extraction methods (extractText, etc);
ocr-image.js separately adds an OCRImage sub-object to that same
parent object for its own, different purpose (image processing/
pipeline work). Searched ocr-image.js directly for any reference to
extractText or Tesseract - found zero. The two do not call each other,
do not duplicate each other's actual logic, and do not conflict, since
they occupy different keys on the shared object.

CONCLUSION FOR H: NOT CONNECTED (no call relationship for text
extraction), but also NOT a duplicate OCR engine - ocr-image.js's real
responsibility (image processing/pipeline orchestration) is genuinely
different from cozy-ocr.js's real responsibility (Tesseract-backed text
extraction). The rest of the OCR Studio module family
(Ocr-register.js, ocr-cli.js, ocr-history.js, exporter.js) was not
re-traced this round beyond the Phase 0 finding that ocr-engine.js
itself explicitly self-declares "NOT an OCR recognizer" - this remains
consistent with today's finding.

================================================================
I. OWNERSHIP DECISION MATRIX
================================================================

| Responsibility | Current Owner | Runtime Evidence | Status |
|---|---|---|---|
| Browser storage gateway | core/storage.js (window.CozyStorage) | Called by all 3 locked AI files, the AI orchestrator, pluginManager, connectivity, security, business-record-engine, multiple applications | ACTIVE, AUTHORITATIVE |
| Document storage | core/modules/documents/cozy-document-storage-provider.js | Sole implementation of DocumentEngine's 5-method interface; called directly by DocumentEngine for every lifecycle operation | ACTIVE, but IN-MEMORY ONLY (not durable) |
| Object storage | none | Zero candidates found repository-wide | ABSENT |
| Document versions | CozyDocumentStorageProvider (in-memory) | archive/restore methods confirmed called directly by DocumentEngine | ACTIVE, but IN-MEMORY ONLY |
| Folders | none confirmed | cozy-storage.js declares folder coordination in its stated scope, but has zero registered adapters and no confirmed document-folder usage | PLANNED, UNUSED |
| Snapshots | core/connectivity/snapshot.js (uses core/storage.js) | Real caller of window.CozyStorage found | ACTIVE, but not document-specific |
| Search index | none | No full-text/search-index infrastructure found anywhere (confirmed in Phase 0, re-confirmed this round) | ABSENT |
| Storage quotas | none confirmed active | cozy-storage.js declares quota coordination in its stated scope but has zero registered adapters | PLANNED, UNUSED |
| OCR | core/modules/ocr/cozy-ocr.js (window.CozyOS.OCR) | Called directly by CozyDocumentEngine for text extraction | ACTIVE, AUTHORITATIVE |
| Document understanding | core/modules/document-understanding/document-understanding.js | Confirmed in Phase 0 to depend on DocumentEngine only, never OCR/classification directly | ACTIVE |
| Audit | core/storage.js's _logAudit() (generic, tenant-scoped) AND CozyDocumentEngine's own #logAudit() (document-specific) AND the server-side audit_events table (this engagement's own prior phases) | All three confirmed real and independently active, for different scopes | ACTIVE, THREE SEPARATE REAL AUDIT MECHANISMS AT DIFFERENT LAYERS |
| Database metadata | server/webauthn-rp/db.js (PostgreSQL/SQLite) | Real, proven, used by 6+ registries in this engagement's own prior phases | ACTIVE, AUTHORITATIVE, but has zero document/file tables today |
| Large binary objects | none | Neither database nor any traced storage system stores large binaries today | ABSENT |

================================================================
J. RESOLUTION (per the stated rule: runtime ownership, callers, data flow, adapter registration)
================================================================

Applying the rule exactly as instructed:

core/storage.js wins on every evidentiary criterion: real, numerous,
load-bearing callers including all three locked AI files; real,
exercised data flow (IndexedDB, tenant-scoped, append-only audited);
no adapter-registration mechanism needed because it directly owns its
one real backend (IndexedDB) rather than coordinating others.

cozy-storage.js has real code and a real adapter-registration
mechanism, but zero actual adapter registrations and only three
defensive/optional external references. It is not runtime-authoritative
for anything today.

This is OUTCOME 2 from the required list: one is the real runtime
owner (core/storage.js) and the other is unused/planned
(cozy-storage.js) - not Outcome 3 (genuine duplicates), because their
actual current usage does not overlap: core/storage.js is exercised
for tenant-scoped structured browser data; cozy-storage.js's much
broader stated scope (objects/folders/versions/snapshots/search/
quotas) has never been exercised by any real adapter or caller.

================================================================
K. POSSIBLE OUTCOMES - WHICH APPLIES
================================================================

OUTCOME 2 applies, as stated in J above.

Migration/integration risk if cozy-storage.js's adapter pattern were
later adopted for File's own needs: LOW, since it currently has zero
real consumers depending on its behavior - extending or building
against it would not risk breaking anything that exists today. However,
this does NOT mean File should necessarily build on it; core/storage.js
remains the proven, load-bearing local persistence layer, and
CozyDocumentStorageProvider already demonstrates the correct, working
pattern (a direct, swappable 5-method provider) without needing
cozy-storage.js's adapter system at all. Any future decision to route
a real document storage provider through core/storage.js (for local/
offline persistence) or a new server-side/object-storage backend (for
durable, cross-device persistence) can be made independently of
cozy-storage.js's fate.

================================================================
L. FILE DISPOSITION MATRIX
================================================================

| File | Disposition |
|---|---|
| core/storage.js | REUSE - real, authoritative browser storage gateway; a future local-persistence document storage provider could be built on top of this |
| core/modules/storage/cozy-storage.js | DOCUMENT ONLY - real, correct code, currently unused; do not delete; do not build File's storage on it without a specific, evidenced reason |
| core/modules/documents/cozy-document-engine.js | EXTEND - the real document identity/lifecycle owner; File should register a new provider into it, not replace it |
| core/modules/documents/cozy-document-storage-provider.js | REVIVE THE PATTERN, REPLACE THE BACKEND - keep as a reference/fallback implementation; build a new, durable provider matching its exact 5-method contract |
| core/modules/document-understanding/document-understanding.js | REUSE - real, deterministic, non-duplicating |
| core/modules/ocr/cozy-ocr.js | REUSE - the real, canonical OCR engine |
| core/modules/ocrstudio/ (entire family) | DOCUMENT ONLY - real, separate application; ocr-image.js confirmed non-duplicating and non-conflicting with cozy-ocr.js |
| server/webauthn-rp/db.js and its registry family | REUSE - proven pattern for any future document-metadata schema |

Nothing was deleted. Nothing is recommended for deletion at this stage.

================================================================
REMAINING BLOCKERS
================================================================

None that block a decision. The Phase 0 stop condition ("two engines
appear to own the same responsibility") is resolved: they are Outcome
2 (one authoritative, one unused/planned), not genuine duplicates
requiring consolidation risk analysis beyond what section K already
provides.

One open, non-blocking question for a later phase: core/storage.js's
audit mechanism, CozyDocumentEngine's own audit mechanism, and the
server-side audit_events table are three separate, real, independently
active audit systems at different layers (browser-tenant-generic,
document-specific-client-side, and server-authoritative respectively).
File's own audit requirements (master prompt section 28) should
clarify which of these it writes to, and should almost certainly use
the server-side audit_events table as the authoritative record for
security-sensitive actions (matching the "all security-sensitive
authority must remain server-side" rule), while still allowing
DocumentEngine's own existing client-side audit hook to continue
operating unchanged for its own purposes.

================================================================
RECOMMENDED NEXT DEPENDENCY
================================================================

With the storage-ownership ambiguity resolved, the next real
dependency for CozyOS File's eventual Phase 1 (not authorized to begin
yet) is: design the server-side document/document_version schema
(master prompt section 35), following the exact versioned-migration,
organization-scoped, partial-unique-index pattern already proven in
this engagement's own prior registries, and define how it will
reference large binary content (a storage key/reference column) even
though the actual object-storage backend (section G, confirmed
ABSENT) does not exist yet. This is a design/schema question, not
implementation - still subject to explicit authorization before any
code is written.

================================================================
CODE CHANGED: NO
================================================================

No implementation was performed. No file was created, modified, or
deleted other than this report. Do not proceed to Phase 1 without
separate, explicit authorization.
