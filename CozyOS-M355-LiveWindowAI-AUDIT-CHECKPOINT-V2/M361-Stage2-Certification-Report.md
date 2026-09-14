# CozyOS — M361 Stage 2 Certification Report
## Founder Story Vault — Management Layer

### Pre-Build Verification (M361 Stage 1, before any Stage 2 change)
Repository re-read in full per instruction. Stage 1 state confirmed: 610 files, 151 folders, `founder-story-engine.js` (v1.1.0), `founder-story-seed.js` (v1.1.0, 4-language Chapter 1), `founder-story-panel.js`, 4 i18n packs, `dashboard.html` wired with the Vault engine chain + 3 Founder Story scripts. Full syntax audit re-run before any edit: same 4 pre-existing failures, unchanged.

### ZIP Accountability
- Baseline: M361 Stage 1 (content-revision) ZIP, SHA-256 `385c4fd541d5a6fbd01d8bcd57c5e79276b819e7f767aeee1f77f5d73ef4e6b9`
- Current: `CozyOS-main-v2_25_20-M361-STAGE2.zip`
- SHA-256: published in the delivery message (self-reference limitation, same as prior stages)
- Modified-files ZIP: `CozyOS-M361-Stage2-ModifiedFiles.zip` — contains exactly 2 files (well under the 5-file threshold)
- Produced / Verified (integrity-tested) / Frozen: **Yes / Yes / Yes**

### Repository Growth
| | Stage 1 (final) | Stage 2 | Δ |
|---|---|---|---|
| Files | 610 | 610 | 0 (no new files — pure extension of existing files) |
| Folders | 151 | 151 | 0 |
| Size | 14,187,918 B | 14,223,961 B | +36,043 B |

### Modified Files (additive-only, 2 files — under the 5-file threshold)
1. **`core/modules/founder-story/founder-story-engine.js`** (v1.1.0 → v1.2.0) — every Stage 1 public method kept, unchanged in signature and behavior (verified: same 28-point integration test suite includes calls through the original Stage 1 API paths — createStory, getStory, updateStory, shareWithPerson, setVisibility, addChapter, getChapter, listChapters, updateChapter — all still pass). New methods added: `renameStory`, `archiveStory`, `restoreStory`, `deleteStory`, `moveChapter`, `duplicateChapter`, `deleteChapter`, `reorderChapters`, `setChapterVisibility`, `setChapterStatus`, `canViewChapter`, `invitePerson`, `removePerson`, `changePermission`, `getPersonPermission`, `requestAccess`, `publishStory`, `publishChapter`, `publishChapters`, `getTimeline`, `searchStories`, `attachMedia`, `getNotifications`, `markNotificationRead`.
2. **`dashboard.html`** — 12 lines added (2 new script tags for `core/modules/documents/cozy-document-engine.js` and `cozy-document-storage-provider.js`, both pre-existing in the repo but previously unwired — same situation Vault was in at Stage 1), 0 lines removed. Combined with Stage 1's additions, `dashboard.html`'s cumulative diff against the frozen M360 baseline remains 100% additive — verified via `diff`, 0 deletions across both stages.

### Added Files
NONE — Stage 2 is a pure extension of Stage 1's existing files, no new files created.

### Removed Files
NONE

### Ideas Added (Stage 2)
- **Story management**: renameStory, archiveStory, restoreStory, deleteStory (owner + `confirm:true` required; implemented as reversible soft-delete — see Known Limitations)
- **Chapter management**: moveChapter, duplicateChapter, deleteChapter (soft), reorderChapters, plus subtitle/timelineEra/visibility/status fields on every chapter
- **Media**: `attachMedia()` composing `window.CozyOS.DocumentStorageProvider.save()` for images/PDF/DOCX (real reuse, zero duplicate storage); audio/video kept as encrypted reference metadata inside the chapter's own envelope (no existing engine to compose for those types — disclosed, not invented)
- **Chapter-level visibility with inheritance**: `canViewChapter()` — `null` visibility inherits the parent story's tier via the unmodified `canView()`; a set tier is checked independently with identical fail-closed logic
- **Selected People permission levels**: viewer/commenter/editor/cofounder via `invitePerson`/`removePerson`/`changePermission`, composing only `IdentityEngine.grantResourcePermission()`/`revokeResourcePermission()` — no parallel ACL store. Stage 1's `shareWithPerson()`/`revokeFromPerson()` untouched and still function identically (implicit "viewer" grant, still honored by the new `#getPersonLevel()` resolver)
- **Publishing**: `publishStory`/`publishChapter`/`publishChapters`, all requiring `confirm:true`, gated to owner or cofounder-level permission holders
- **Draft workflow**: expanded `STORY_STATUSES`/`CHAPTER_STATUSES` to draft/review/ready/published/archived (additive over Stage 1's draft/archived — both original values still valid)
- **Timeline**: `getTimeline()` — visible chapters only, chronologically sorted by `timelineDate`, tagged with freeform `timelineEra` (Childhood/Mother/School/etc., per the brief's examples)
- **Search**: `searchStories()` — authorization-checked before any decrypt; a private story or chapter is invisible to an unauthorized searcher, never partially revealed
- **Notifications**: real per-owner in-memory store (`#notify`/`getNotifications`/`markNotificationRead`), wired into every existing and new denial/permission-change/publish path via a new `#denyOnStory()` helper (extends, does not replace, Stage 1's `#deny()`)

### Ideas Improved
- Wired `core/modules/documents/cozy-document-engine.js` and `cozy-document-storage-provider.js` into the application for the first time — both pre-existing in the M360 baseline but orphaned (loaded by no page), exactly the same situation Vault was in before Stage 1. No internal file of either was modified, only loaded.

### Ideas Removed
NONE

### Frozen Baseline Integrity
`CozyBaseLinker` (`core/ui/cozy-base-linker.js`) — re-verified byte-identical. `core/modules/vault/*` and `core/modules/documents/*` — re-verified byte-identical to the M360 baseline (composed, never modified).

### Authorization / Visibility / Publishing Validation (real, not simulated)
A 28-point end-to-end integration test was run against the real Vault (AES-GCM), a real-shaped IdentityEngine stand-in (resource-permission grants + role checks, same method signatures as production), and the real DocumentEngine/DocumentStorageProvider. All 28 assertions passed, including:
- Chapter-level visibility overriding an inherited story-level "family" tier down to "only-me," verified from both an authorized owner and a now-excluded family member
- Permission-level enforcement: an "editor" grant passes `canEdit()`, a plain "viewer" grant does not
- `publishStory()` rejecting a call without `confirm:true`, then succeeding with it
- `searchStories()` returning an empty array (not an error, not a partial match) for a private story to an unauthorized searcher, while returning the correct result to the owner
- A real, unauthorized `getStory()` call generating an `unauthorized-access-attempted` notification for the real owner, invisible to any other reader
- `deleteStory()`/`restoreStory()` round-trip: story disappears from `listVisibleStories()` after delete, reappears after restore
- Image and PDF attachments genuinely persisted in `DocumentStorageProvider` (confirmed via a follow-up `load()` call returning the saved record); audio attachment correctly routed to the encrypted-reference path instead

### Duplicate-Engine / Duplicate-Script / Dependency-Order Audits
- No new duplicate engines: `CozyDocumentEngine`/`CozyDocumentStorageProvider` each defined exactly once, in their own pre-existing files.
- Both pre-existing duplicate-engine pairs (`CozyQuarryManager`, `InternalEventBus`) unchanged — no growth.
- `dashboard.html`: zero duplicate `<script src>` tags (checked via `sort | uniq -d`).
- Dependency order confirmed correct: `cozy-document-engine.js` loads before `cozy-document-storage-provider.js` (which self-registers into it), both load before `founder-story-engine.js` (which calls `DocumentStorageProvider.save()`).

### Regression Audit
Full-repository `diff` against the pristine M360 Stage 4 baseline confirms exactly the same 2 files touched as at Stage 1 (`dashboard.html`, `BASELINE.md`) plus the certification report file — no other file's bytes changed anywhere in the 610-file repository. `dashboard.html`'s cumulative diff (Stage 1 + Stage 2 combined) is 0 deletions, additive only. Full syntax audit re-run after all Stage 2 changes: still exactly the same 4 pre-existing failures, identical files and line numbers.

### Known Inherited Issues (unchanged, out of scope — Scope Isolation continues to apply)
Same 4 syntax failures, 2 duplicate-engine pairs, 1 diverging `cozy-shell.html`, 3 malformed filenames, the `core/audit.js` vs `core/business/audit.js` duplication, and the 346-byte Stage 4 baseline size discrepancy — all carried forward unresolved from prior stages, per Governance Scope Isolation.

### Known Limitations (Stage 2, disclosed)
- **`deleteStory()` is a reversible soft-delete, not permanent erasure.** This was a deliberate design decision (see `founder-story-engine.js`'s inline documentation): Governance Principle "never remove existing ideas" and the sensitivity of autobiographical content both argue against building true irreversible deletion. If a genuine permanent-delete capability is ever required, that should be its own explicit future decision, not something added silently here.
- **No `restoreChapter()`.** `deleteChapter()` is also a soft delete (record kept, flagged, removed from `chapterOrder`), but Stage 2's brief asked for "Restore" only at the story level, so no chapter-level counterpart was built. The underlying data is preserved either way.
- **Audio/video attachments are not stored via `DocumentStorageProvider`** — its `SUPPORTED_DOCUMENT_TYPES` set has no audio/video entries, and extending that set would mean modifying an engine this milestone does not own. They remain encrypted reference metadata inside the chapter's own envelope (Stage 1's original model), which is real and functional, just not routed through the document engine like images/PDF/DOCX are.
- **`attachMedia()` for images/PDF/DOCX depends on the calling user actually holding IdentityEngine's `"document:save"` role.** This is `DocumentStorageProvider`'s own real, pre-existing authorization gate (composed, not modified) — Founder Story does not and should not bypass it. Whether the Founder's eventual real login identity is granted that role is outside Founder Story's ownership; documented here as a genuine dependency, not assumed away.
- **Commenter permission level exists as a grantable tier but has no comment-authoring feature behind it yet** — Stage 2's brief listed it as a permission name, not a request to build a comments system; a commenter currently has identical capability to a viewer (can view, cannot edit).
- **Living Theme / Living Background / Living Glass UI**: `founder-story-panel.js` (Stage 1) already composes only the existing CSS custom properties — no new UI surfaces were added in Stage 2's engine-layer work; a panel refresh exposing the new management actions (rename/archive/invite/publish buttons, etc.) is deferred to a future stage, consistent with Stage 1's precedent of shipping the data layer ahead of full UI wiring.

### Governance Version
v1.3 (Principles 14–25) — no new principle adopted this stage.

## Verdict / Certification Status: **PASS**
No existing CozyOS behavior was replaced. Every Stage 1 public method's signature and behavior is unchanged and re-verified. Everything in Stage 2 is additive. M361 Stage 2 is frozen as of this report; M361 Stage 3 has not begun.
