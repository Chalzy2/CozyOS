# CozyOS File Phase 3 - Verification Document

## Phase 3 Objective

File/Folder Organization: real, server-authoritative, persistent
folder hierarchy, integrated with the existing Phase 1/2 document and
binary storage architecture, without creating a competing storage
engine.

## Repository Discovery Findings

Exactly one existing folder-shaped implementation was found repository-
wide: `core/modules/storage/cozy-storage.js` - a real, in-memory-only,
browser-side folder Map (createFolder/renameFolder/moveFolder) with
only direct self-parenting rejection (no descendant-cycle check).
Already established in Phase 0.1 as unused/planned (zero registered
adapters, three defensive-only external callers) - unchanged since.
This does not satisfy real persistence or server authority, confirming
a genuine gap for the server-side layer this phase builds.

**Correction to the task's own stated premise**: the task instructed
treating `companyId` as the Phase 1 schema's authoritative field.
Direct inspection of `013_document_storage.sql` shows the real,
authoritative database column is `organization_id` (matching every
registry since Phase 2 - organizations, billing, payments, knowledge).
`companyId` is only `CozyDocumentEngine`'s own client-side record field
name, a different layer. This implementation follows the verified real
convention, documented precisely in migration 015's own header.

## Ownership Decision

`core/storage.js` and `core/modules/storage/cozy-storage.js`: both
confirmed byte-identical, untouched. No new storage coordinator was
created. The new `FolderRegistry` (server/webauthn-rp/folder-registry.js)
is the sole new authority for folder hierarchy, following the exact
conventions of `DocumentStorageRegistry` and every other registry since
Phase 2.

## Implementation

- **Migration 015** (`015_document_folders.sql` + SQLite mirror in
  `db.js`): a new `folders` table (id, organization_id,
  parent_folder_id, name, normalized_name, status, is_root, audit
  fields), plus `documents.folder_id` (nullable, single-parent model).
- **Documented design decisions** (no existing convention found for
  either): (1) one parent folder per document, not a join table; (2) no
  two active sibling folders may share a normalized name, enforced by a
  real partial unique index, not just application logic.
- **`server/webauthn-rp/folder-registry.js`**: `createFolder`,
  `getFolder`, `listContents`, `renameFolder`, `moveFolder`,
  `moveDocument`, `archiveFolder`, `restoreFolder`, `ensureRoot`.
- **Real cycle prevention**: `moveFolder()` walks the actual database
  parent chain (bounded to 1000 hops as defense in depth), not a
  client-supplied claim - verified by a real, passing multi-level
  (4-deep) cycle test, not just a direct-parent check.
- **Root folder**: exactly one per organization (real partial unique
  index), lazily created on first use, structurally immutable - every
  mutating method explicitly checks `is_root` and refuses regardless of
  caller permission.
- **9 new server routes**: `POST /folders`, `/folders/root`,
  `/folders/get`, `/folders/children`, `/folders/rename`,
  `/folders/move`, `/folders/archive`, `/folders/restore`,
  `/documents/move` - all following the existing session/JSON/error
  conventions exactly.

## Database

- PostgreSQL migration: `server/webauthn-rp/migrations/015_document_folders.sql`.
- SQLite mirror: `migrateAddDocumentFolders()` in `db.js`, idempotent
  column-add matching `migrateAddFirebaseUid()`'s established pattern.
- **PostgreSQL runtime status: BLOCKED / NOT VERIFIED** - no live
  PostgreSQL server in this environment. SQLite was not substituted and
  presented as PostgreSQL-verified.

## API

9 routes added (listed above), all requiring an authenticated session,
all deriving `organizationId` authority from real
`OrganizationRegistry.isAuthorized()`/`getMembership()` checks - never
trusting a client-supplied value as authority. Folder operations remain
small JSON metadata requests, never routed through Phase 2's binary
body handling.

## Security - Tests and Results

23 new tests, all passing on first full run:
cross-organization read/create/parent-assignment rejection, forged
organizationId rejection, member-without-grant denial (with confirmed
read-still-works), self-parenting rejection, direct-child cycle
rejection, **4-level-deep cycle rejection** (proving the ancestor walk
is real, not a shallow check), invalid-parent rejection, a real
SQL-injection/path-traversal-shaped folder name (stored and retrieved
as literal text, table confirmed still functional afterward), a real
prototype-pollution-shaped request body (server confirmed still
functional afterward), root immutability (rename/move/archive all
rejected), non-empty-folder archive rejection, and document identity/
version/binary-reference preservation across a real move.

## Persistence Verification

Real restart test, not an in-memory substitute: PROCESS A creates a
nested hierarchy (root -> parent -> child), places a document with real
uploaded binary content into the child folder, records the real
server-computed checksum. The server is fully closed. PROCESS B (a
genuinely new server instance, same database file) confirms: the
hierarchy relationship is intact, the document-to-folder association is
intact, the binary content downloads byte-for-byte identical, and the
checksum header matches exactly. **VERIFIED.**

## Binary Integrity

`moveDocument()` performs a pure metadata update
(`UPDATE documents SET folder_id = ...`) - it never touches
`binary_storage_ref`, `binary_checksum`, or `current_version`. A
dedicated test confirms all three remain byte-for-byte identical after
two consecutive moves between different folders, and that the document
remains loadable with its real title/content intact afterward.
**VERIFIED**, not inferred.

## Render Verification

**NOT VERIFIED FROM CURRENT EXECUTION ENVIRONMENT.** No network or
Shell access to the live Render service exists in this sandbox. The
new `folders` table and `documents.folder_id` column follow the exact
same SQLite-file-on-persistent-disk pattern already established and
partially verified for `COZY_WEBAUTHN_DB`/`COZY_OBJECT_STORAGE_ROOT` in
Phase 2 - there is no structural reason to expect different behavior on
Render, but this is not the same as having tested it there. This is
stated honestly rather than assumed.

## Cozy Share Compatibility Discovery (required before finalizing Phase 3)

A full repository search was performed for any existing file-transfer/
device-pairing/nearby-sharing implementation before finalizing this
phase's architecture, per the explicit instruction not to design folder
organization in a way that would make future Cozy Share integration
difficult.

**Real findings, precisely distinguished by actual domain:**

1. **`core/collaboration/cozy-share.js` exists and is real** - but it
   is a "Device Collaboration Session Manager" for **live church
   production roles** (camera-operator, audio-operator,
   lighting-operator, projection-operator, presenter, viewer) during a
   broadcast - a completely different problem domain from file/folder
   transfer, despite the coincidentally identical product name. Its own
   header already honestly discloses that WiFi Direct, hotspot
   creation, and Bluetooth Classic pairing are "confirmed in Phase 1 to
   require capabilities no browser exposes" and are not implemented -
   direct, independent confirmation of exactly the platform limitation
   this task's own instructions anticipated.

2. **`core/connectivity/cozy-connect.js` (CozyConnect) is real** - the
   actual transport/device-discovery hub `cozy-share.js` itself is
   built on top of. A genuine provider-registry architecture: Bluetooth
   and USB providers call real browser APIs
   (`navigator.bluetooth`/`navigator.usb`) and honestly report
   `{supported:false, reason}` when unavailable, never fabricating
   success. WiFi Direct and hotspot creation have no provider at all
   (confirmed absent). This is the one real, existing, reusable
   transport-discovery primitive a future file-transfer Cozy Share
   could build on.

3. **`core/engines/files/universal-file-engine.js` is real** - local
   folder and OS-mounted USB mass-storage access via the real File
   System Access API. This is local file *access*, not a peer-to-peer
   *transfer protocol* between two CozyOS devices - relevant to a future
   transfer feature's import/export endpoints, not the transport
   mechanism itself.

**Conclusion, stated exactly as instructed**: no existing, real,
file-transfer-purpose Cozy Share implementation exists in this
repository. **Cozy Share transport implementation (QR pairing, hotspot
transfer, resumable/chunked transfer, transfer session state machine)
is a subsequent dependency, not fabricated this round.**

**Compatibility of this round's Phase 3 architecture with that future
work**, verified by re-examining what was actually built, not assumed:
`documentStorage.save()` already requires the caller to supply a real
`documentId` and always resolves `organizationId` from the
authenticated session - a future "receive a file via Cozy Share" flow
would call this exact same, already-tested method, generating a fresh
ID on the receiving device and establishing the receiving
organization's own authority, which directly satisfies this round's
own instruction that "the receiving side must establish its own
ownership/authorization context" without requiring any change to what
was built this phase. The same is true of `folders.createFolder()` for
recreating a received folder hierarchy, and `objectStorage.put()` for
streaming received binary bytes directly to durable storage. No
redesign is anticipated to be necessary when that dependency is
eventually authorized and built.

## Regression Results

| Suite | Tests | Pass | Fail | Skip |
|---|---|---|---|---|
| All prior server suites (http-integration through knowledge-registry) | 231 | 231 | 0 | 1 (provider-certification, pre-existing) |
| document-storage.test.js (Phase 1, unmodified) | 25 | 25 | 0 | 0 |
| document-binary-storage.test.js (Phase 2, unmodified) | 13 | 13 | 0 | 0 |
| folder-organization.test.js (Phase 3, new) | 23 | 23 | 0 | 0 |
| Boundary-server suites | 22 | 22 | 0 | 0 |
| **TOTAL** | **314** | **314** | **0** | **1** |

Zero new failures. The one skip was independently re-confirmed as the
same, unrelated, pre-existing `provider-certification.test.js` skip
present since before Phase 1 - not newly classified without evidence.

## Locked Files

| File | Status |
|---|---|
| core/ai.js | byte-identical, confirmed |
| core/ai/integration.js | byte-identical, confirmed |
| core/ai/cozy-ai-language.js | byte-identical, confirmed |
| core/ai/cozy-ai-memory.js | byte-identical, confirmed |
| core/ai/cozy-ai-integration.js | byte-identical, confirmed |
| core/storage.js | byte-identical, confirmed |
| core/modules/storage/cozy-storage.js | byte-identical, confirmed |

## Known Limitations (evidence-backed only)

- Folder archive/delete requires the folder to be genuinely empty
  (no active subfolders, no non-deleted documents) - recursive
  archive/delete was deliberately not implemented this phase.
- Duplicate-sibling-name policy and single-parent-folder model are
  documented design decisions, not repository-mandated requirements -
  no existing convention decided either question.
- PostgreSQL runtime behavior for the new schema remains unverified in
  this environment.
- Render's specific persistent-disk behavior for the new folders table
  remains unverified from this environment (same limitation already
  disclosed in Phase 2).
- Cozy Share file-transfer capability does not exist yet - confirmed
  by repository-wide search, not assumed absent.

## Next Dependency

Cozy Share transport implementation (QR-based pairing, local
hotspot/LAN transfer, transfer session state machine, resumable/
chunked transfer) - identified, not implemented this round, per the
explicit instruction not to fabricate it and not to expand Phase 3's
scope beyond File/Folder Organization.
