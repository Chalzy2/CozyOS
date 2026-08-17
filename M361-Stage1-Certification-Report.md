# CozyOS — M361 Stage 1 Certification Report
## Founder Story Vault (Foundation)

### ZIP Accountability
- Baseline: M360 Stage 4 ZIP (SHA-256 `ac914fcf0fefac195cb74c1e54cba7cf598bffd5cf61ecd9072585f33f65557f`)
- Current: `CozyOS-main-v2_25_19-M361-STAGE1.zip`
- SHA-256: published here and in the delivery message (self-reference limitation, same as the M360 baseline note — the ZIP cannot contain its own hash before it is built)
- Modified-files ZIP: `CozyOS-M361-Stage1-ModifiedFiles.zip` (SHA-256 `cbdb0d9d0dff9b4ba9bc682da03b86ed95a432e090f24eaa9d6a30d7f61c1baa`) — contains `dashboard.html`, the only pre-existing file touched (1 file, under the 5-file threshold)
- Produced / Verified (integrity-tested) / Frozen: **Yes / Yes / Yes**

### Pre-Build Verification (M360 Stage 4 baseline, before any change)
| Check | Result |
|---|---|
| ZIP integrity (`unzip -t`) | Clean |
| ZIP SHA-256 | Matches M360-Stage4-Certification-Report.md exactly |
| Files | 602 (matches BASELINE.md) |
| Folders | 149 (matches BASELINE.md) |
| Repo size (independently re-measured) | 14,111,723 B — **346 B below** BASELINE.md's stated 14,112,069 B. Verified two independent ways (filesystem sum, zip central directory). Flagged, not corrected retroactively; carried forward as a minor open item since M360 Stage 4 is frozen and out of scope for this milestone. |
| Syntax audit | 4 failures, same files as declared (`quarry-contants.js`, `cozy-ai-memory.js`, `compression.js`, `bandwidth.js`) |
| Duplicate-engine audit | Same 2 pairs as declared (`CozyQuarryManager`, `InternalEventBus`) |
| `cozy-shell.html` divergence | Confirmed, unchanged |
| Malformed filenames | Same 3 as declared |

### Repository Growth
| | Stage 4 | Stage 1 (M361) | Δ |
|---|---|---|---|
| Files | 602 | 608 | +6 |
| Folders | 149 | 151 | +2 |
| Size | 14,111,723 B (independently measured) | 14,165,414 B | +53,691 B |

### Added Files
- `core/modules/founder-story/founder-story-engine.js` — data & authorization layer (stories, chapters, visibility, audit)
- `core/modules/founder-story/founder-story-seed.js` — the Founder's real initial content (Chapter 1, multilingual EN/SW/FR); calls only the engine's public API
- `core/modules/founder-story/founder-story-panel.js` — read-focused Glass UI dashboard panel
- `core/modules/founder-story/i18n/en.json`, `sw.json`, `fr.json` — UI string packs

### Modified Files (additive-only)
- `dashboard.html` — 32 lines added at one insertion point, 0 lines removed, 0 lines changed. Adds:
  - 6 script tags for the pre-existing Vault (Secrets/Encryption) engine — `core/modules/vault/*` — which existed in the M360 baseline but was not loaded by any page until now
  - 3 script tags for the new Founder Story module
  - Verified via `diff`: byte-for-byte identical outside this one insertion

### Removed Files
NONE

### Ideas Added
- Founder Story Vault: encrypted story + unlimited-chapter storage, five-tier fail-closed visibility (Only Me / Selected People / Family / Mentors / Public), multilingual content model (one story, multiple languages per chapter — not separate stories per language), owner-only editing, share/revoke by resource permission, `requestPublish()` intent-recording stub for M362
- Chapter 1 ("My Story — Part 1") of the Founder's real autobiography, imported verbatim in English, Kiswahili, and French, as an encrypted draft under Only Me visibility

### Ideas Improved
- Wired the pre-existing Vault engine (`core/modules/vault/`) into the application for the first time — it was present in the M360 baseline but orphaned (loaded by no page). This is a prerequisite fix, not a redesign: no internal Vault file was modified, only loaded.

### Ideas Removed
NONE

### Frozen Baseline Integrity
`CozyBaseLinker` (`core/ui/cozy-base-linker.js`) — re-verified byte-identical to M359/M360. No frozen module touched.

### Duplicate Engine / Script Audit
- No new duplicate engines introduced. `FounderStoryEngine`, `window.CozyOS.FounderStory`, and all three `window.CozyOS.Modules["founder-story-*"]` registry keys are unique across the repository.
- No duplicate `<script src="...">` tags in `dashboard.html` (checked via `sort | uniq -d` — zero results).
- **Composition, not duplication, confirmed**: the new engine calls `window.CozyOS.Vault.encrypt()/decrypt()/generateKey()` (real AES-GCM via Web Crypto), `window.CozyOS.Session.current()`, and `window.CozyOS.IdentityEngine.checkResourcePermission()/checkPermission()/grantResourcePermission()/revokeResourcePermission()` — it implements no parallel authentication, authorization, or encryption logic of its own.
- **Naming clarification (per Governance decision)**: the new module lives at `core/modules/founder-story/`, not `core/modules/vault/`, since that path is already the platform's Secrets Vault (API keys, credentials, certificates, tokens) and its own documentation states it never stores document content.

### Syntax / Regression / Preservation Audits
- All 3 new `.js` files pass `node --check`. All 3 new `.json` files parse. Full-repo syntax audit re-run after all changes: still exactly 4 failures, identical files, identical line numbers — confirmed no regression.
- Full-repository `diff` against the pristine M360 Stage 4 baseline confirms exactly one new folder (`core/modules/founder-story/`) and exactly one modified file (`dashboard.html`, additive-only, 0 deletions). No other file's bytes changed.
- **End-to-end integration test performed** (Node, real files loaded, no mocks for Vault/encryption): a story was created, its title/subtitle encrypted via the real `EncryptionManager` (AES-GCM/Web Crypto), a multilingual chapter added, the owner successfully decrypted and read it, an unauthorized viewer was denied and received only `🔒 Private Founder Content` / `This story is private.` with no data leak, and 5 real audit-log entries were recorded (`EDIT`, `EDIT`, `VIEW`, `VIEW`, `ACCESS_DENIED`).
- **Text-fidelity verification**: the English, Kiswahili, and French Chapter 1 text stored in `founder-story-seed.js` was programmatically extracted and diffed byte-for-byte against the source provided — all three sections matched exactly, confirming no rewriting or shortening occurred.

### Known Inherited Issues (unchanged, out of scope — Scope Isolation applied)
- Same 4 syntax failures, 2 duplicate-engine pairs, 1 diverging `cozy-shell.html`, 3 malformed filenames — all pre-existing since M359, tracked in `BASELINE.md`. Not modified, merged, or resolved in this milestone.
- **Newly documented this milestone**: `core/audit.js` (imported by ~10 business modules) and `core/business/audit.js` (imported by nothing — orphaned) are two competing general-purpose audit loggers, neither of which is actually used by the Identity/Session/Authorization stack (that stack instead uses a private per-engine `#auditLog` + `getAuditLog()` convention, which is what `founder-story-engine.js` follows). Per Governance Scope Isolation instruction for M361, this is recorded as a pre-existing inherited issue, not resolved, merged, or rewritten here. Any future consolidation is its own milestone.
- **346-byte repo-size discrepancy** in the M360 Stage 4 baseline (see Pre-Build Verification above) — flagged, not corrected, since M360 Stage 4 is frozen.

### Governance Version
v1.3 (Principles 14–25) — no new principle adopted this stage.

### Deferred to a future stage (disclosed, not silently dropped)
- A visible dashboard navigation entry point to launch the panel — `dashboard.html`'s navigation appears to be shell/data-driven elsewhere rather than static list markup, and `security-insights-panel.js` (M360 Stage 4) establishes the precedent of registering a lazy `init(containerId)` without self-wiring into nav. `founder-story-panel.js` follows that same precedent for Stage 1.
- "Living Settings" — no canonical engine exists in the baseline; skipped per Governance decision, not invented.
- Narration, publishing website, PDF/DOCX export, public blog — explicitly out of Stage 1 scope per the milestone brief.

## Addendum — Content Revision (post-freeze, same milestone)
After initial certification, the Founder supplied a revised Chapter 1 draft (added the passage on his mother's passing; light wording edits for flow across English/Kiswahili/French) and a native-quality Arabic version, approving Arabic for inclusion now rather than deferring it. Applied as:
- `founder-story-engine.js` → v1.1.0 (`SUPPORTED_LANGUAGES` now `["en","sw","fr","ar"]`)
- `founder-story-seed.js` → v1.1.0 (Chapter 1 body replaced with the revised 4-language text — verified byte-for-byte against the Founder's supplied text via the same programmatic diff method used at initial certification)
- `core/modules/founder-story/i18n/ar.json` added (RTL)
- Files: 610 (+1 from Stage 1's 609) · Folders: 151 (unchanged) · Size: 14,186,183 bytes
- Re-ran full syntax audit: still exactly the same 4 pre-existing failures, no regressions
- Re-ran end-to-end integration test with real Vault encryption: all 4 languages present and decrypt correctly for the owner; unauthorized viewer still receives only the private notice; audit log still records real events
- No other file touched; `dashboard.html`'s script tags unchanged (no new script needed — same seed/engine files, updated content)

## Certification Status: **PASS**
ZIP Produced: Yes · Verified: Yes · Frozen: Yes
