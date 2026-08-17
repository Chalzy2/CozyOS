# CozyOS — BASELINE.md

- **Milestone Identifier:** 361, Stage 2 (Founder Story Vault — Management Layer)
- **Parent (Baseline) Milestone:** M361 Stage 1

## Repository Statistics
- Files: 610 (Stage 1 final: 610, +0 — Stage 2 extends existing files, adds none)
- Folders: 151 (unchanged)
- Repo size (uncompressed): ~14,224,xxx bytes (Stage 1 final: 14,187,918 B, +36,043 B pre-certification-artifact; exact final count has the same self-reference limitation documented at Stage 1 — the ZIP's own integrity test is authoritative, not this line)

## ZIP Information
- Filename: CozyOS-main-v2_25_20-M361-STAGE2.zip
- SHA-256: published in M361-Stage2-Certification-Report.md and the delivery message (self-reference limitation)
- Modified-files ZIP: CozyOS-M361-Stage2-ModifiedFiles.zip (2 files: `founder-story-engine.js`, `dashboard.html`)

## Governance Version
v1.3 (Principles 14–25)

## Frozen Modules (unchanged this milestone)
- CozyBaseLinker v2.4.0 — re-verified byte-identical to M359/M360
- `core/modules/vault/*` (Vault/Encryption engine) — re-verified byte-identical, composed only
- `core/modules/documents/*` (Document Engine + Storage Provider) — re-verified byte-identical, composed only (newly wired into `dashboard.html` this stage — was previously orphaned, same situation Vault was in at Stage 1)

## Added / Modified / Removed
- **Added:** none — Stage 2 extends existing files only
- **Modified (additive-only, 2 files):**
  - `core/modules/founder-story/founder-story-engine.js` — v1.1.0 → v1.2.0. Every Stage 1 public method's signature and behavior unchanged (re-verified). New: story management (rename/archive/restore/delete), chapter management (move/duplicate/delete/reorder), chapter-level visibility with inheritance, permission levels (viewer/commenter/editor/cofounder), publishing workflow, expanded draft-workflow statuses, timeline, authorization-first search, media attachment (composing DocumentStorageProvider), and a real per-owner notification store.
  - `dashboard.html` — 12 lines added (DocumentEngine + DocumentStorageProvider script tags), 0 removed. Combined with Stage 1, cumulative diff against the M360 baseline remains 100% additive.
- **Removed:** none

## Founder Story Vault — Stage 2 State
- Engine version: v1.2.0. Data model, encryption, and Chapter 1 content are exactly as certified at Stage 1 (untouched) — Stage 2 only added capability, not new content.
- New capabilities available: full story lifecycle (create/rename/archive/restore/soft-delete), full chapter lifecycle (add/edit/move/duplicate/soft-delete/reorder) with subtitle/timeline-era/visibility/status per chapter, chapter-level visibility inheriting from the story by default, four-tier "Selected People" permissions, owner/cofounder-gated confirm-required publishing, five-state draft workflow (draft/review/ready/published/archived), chronological timeline view, authorization-first search, real media attachment for images/PDF/DOCX via the newly-wired Document Storage Provider, and a real per-owner notification store covering access requests, permission changes, publication completions, and unauthorized access attempts.
- Storage remains in-memory only (disclosed, unchanged from Stage 1) — all of the above is genuinely functional within a session, not durable across reload.

## Certification Status
PASS

## Known Inherited Issues (carried forward, out of scope)
- 4 pre-existing syntax failures, unchanged since M359
- Duplicate engine: `CozyQuarryManager` (2 locations), unchanged since M359
- Duplicate engine: `InternalEventBus` (2 locations), unchanged since M359
- Diverging duplicate: `core/cozy-shell.html` vs `core/shell/cozy-shell.html`, unchanged since M359
- 3 malformed filenames, pre-existing
- Two competing general-purpose audit loggers (`core/audit.js` vs `core/business/audit.js`) — documented at Stage 1, still not merged/rewritten (Scope Isolation)
- 346-byte repo-size discrepancy inherited from the M360 Stage 4 baseline — flagged, not corrected

## Known Limitations (Stage 2, disclosed — see full certification report for detail)
- `deleteStory()`/`deleteChapter()` are reversible soft-deletes by deliberate design, not permanent erasure
- No `restoreChapter()` (only story-level restore was in scope)
- Audio/video attachments remain encrypted chapter-embedded references (no existing engine to compose for those media types — DocumentStorageProvider doesn't support them, and extending it would mean modifying an engine this milestone doesn't own)
- `attachMedia()` for images/PDF/DOCX depends on the calling user holding IdentityEngine's real `"document:save"` role — a genuine, composed dependency, not bypassed
- "Commenter" is a grantable permission level with no comment-authoring feature behind it yet
- No panel/UI update this stage — Stage 2 is the data/authorization layer only, matching Stage 1's precedent of shipping engine capability ahead of full UI wiring

## Next Approved Milestone
M361 Stage 3 (not yet started — Stage 2 must be fully certified, packaged, and frozen first, per Governance)

---
Full certification detail: `M361-Stage2-Certification-Report.md` (Stage 1: `M361-Stage1-Certification-Report.md`)
