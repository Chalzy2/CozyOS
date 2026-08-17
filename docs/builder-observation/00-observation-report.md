# Cozy Builder — Engineering Report
**Workspace:** CozyOS-M372-RememberMe-Fix.zip · **Mode:** Observe → Understand → Analyze → Learn → Report (no code modified)

**Method note (honesty first):** 641 files / ~14MB were inventoried, and every JS file was machine-parsed for syntax validity. Deep manual reading was targeted at the systems relevant to the zip's own name (authentication/session/"Remember Me") and at every duplicate/frozen/known-issue reference the codebase's own docs (`BASELINE.md`, `core/docs/*`) point to — not at all ~480 JS files individually. Findings below are things I actually verified by reading code or running `node --check`, not inferred from filenames.

---

## 1. Workspace Summary
- 641 files, 793 zip entries (folders counted separately), ~14.1 MB uncompressed.
- No `package.json` / build tooling — this is a **no-build, browser-native** platform: plain `<script>` tags, IIFEs registering onto a single `window.CozyOS` global, no bundler, no npm dependencies.
- Governance is unusually explicit for a codebase this size: `core/docs/DEVELOPMENT_RULES.md`, `FROZEN_MODULES.md`, `CORE_ARCHITECTURE.md`, plus per-milestone `BASELINE.md` / certification reports, and inline "Rule N" / "Ownership" doc-blocks inside individual files.
- Top-level composition: `core/` (kernel, security, identity, shell, 66 business modules, 12 media/data engines, 23 plugins), `applications/` (ShopOS, MpesaOS, QuarryOS), `modules/` (legacy quarry + live), `Firebase/`, `docs/` (governance + 25 milestone files), plus PWA assets (`manifest.json`, `sw.js`, icon sets).
- Filename gives away intent: this snapshot is post-**Milestone 372**, described as a "Remember Me" fix — confirmed in Section 6.

## 2. Architecture Overview
CozyOS is layered, self-documented as:
```
Kernel (Compatibility → Bootstrap → Lifecycle → Diagnostics)
   ↓
Shared Engines (identity, security, session, storage, connectivity, calculation, media…)
   ↓
Applications (ShopOS, MpesaOS, QuarryOS, ChurchOS, Developer Hub…)
```
Composition, not inheritance, is the stated house style: coordinator files repeatedly declare what they own vs. what they merely "compose" from other engines (e.g. `AuthCoordinator`'s file-header explicitly disclaims owning password hashing, trusted devices, or session snapshots — it only orchestrates). This pattern is followed consistently in the files I read.

**Notable gap:** the Kernel layer described above (`core/kernel.js` + `bootstrap.js`/`compatibility.js`/`diagnostics.js`/`lifecycle.js`) is written as ES modules (`import`/`export`) — the *only* ES-module code I found in the project, everywhere else uses classic IIFE scripts. I confirmed **none of these five files are referenced by any `.html` entrypoint** (`dashboard.html`, `login.html`, `index.html`). The Kernel layer appears to be fully orphaned/dead code today, despite its own header claiming "self-certified (26/26)."

## 3. Module Inventory (high level)
- `core/modules/` — 66 business/domain modules (identity, security, vault, sync, storage, notification, ChurchOS, MpesaOS, ShopOS, OCR studio, builder/CozyBuilder itself, etc.)
- `core/engines/` — 12 media/runtime engines (audio, camera, video, playback, wakeword, search, scene, collaboration…)
- `core/plugins/` — 23 plugin files (ShopOS/MpesaOS/WholesaleOS/ChurchOS/PharmacyOS/HospitalOS sub-plugins)
- `applications/` — 3 wired app shells (ShopOS, MpesaOS, QuarryOS) with their own HTML/manifest
- Per `core/modules/module-registry.js`'s own header: **only 3 applications are honestly registered** (developer-hub, shopos, mpesaos) — HospitalOS/SchoolOS/ChurchOS/QuarryOS have code present but are explicitly *not* claimed as shell-integrated yet. This is disclosed by the code itself, not a finding I'm asserting independently.

## 4. Dependency Overview
- No external package dependencies (no `package.json`). "Vendor" libraries (`core/vendor/opencv`, `jspdf`, `sqlite`, `ffmpeg`, `onnx`, `tesseract`, `pdf-lib`, `jszip`) are present as near-empty placeholder folders (most are 1-byte stub files except `tesseract/`, which has a real `manifest.json`/`install.sh`) — these read as reserved integration points, not working vendor bundles yet.
- Internal dependency direction generally follows the documented Kernel → Engines → Applications rule in the files I inspected (`AuthCoordinator`, `module-registry.js`, `CozyBaseLinker` docs all explicitly forbid reaching downward).
- One real internal naming collision risk, resolved deliberately: **two files are both named `auth-coordinator.js`** (`core/modules/identity/auth-coordinator.js` and `core/security/auth-coordinator.js`). I verified they register under different globals on purpose — `window.CozyOS.AuthCoordinator` (login orchestration) vs. `window.CozyOS.AuthorizationCoordinator` (step-up/policy decisions) — with an explicit "must never be registered as AuthCoordinator again" comment in the second file. Not a bug, but a real collision-prone naming pattern worth flagging for anyone skimming the tree.

## 5. Startup Flow
Traced via `dashboard.html`'s actual script order (80+ tags): Launch sequence/theme/background → living-environment/animation → startup-orchestrator → connectivity → registry → **Firebase (8 files)** → identity stack (platform-identity-bridge → identity-storage → identity-engine) → **session service → cozy-auth → auth-coordinator** → the full security-factor stack (OTP, policy, recovery, trusted-device, session-manager, webauthn, biometrics) → **second auth-coordinator (authorization)** → vault → documents → founder-story → module-registry → application-launcher/window-manager → platform services.

Timing specifics (stage durations, glow, motto/voice sequencing) were already the subject of the M366.2 branding/UX pass documented in this same workspace (`CHANGELOG_M366.2_Main_Final.md`) — that pass explicitly touched *only* visual/timing files and left auth/session/routing untouched, which I independently confirmed by re-reading the files it named as unchanged.

## 6. Authentication / "Remember Me" Flow — the M372 fix, verified
This is the change the zip is named for, and I traced it end-to-end:

- **Owner:** `core/modules/identity/auth-coordinator.js`. `loginWithCredentials(username, password, { rememberMe })` persists a *non-secret session pointer* — never credentials — to `localStorage` if `rememberMe` is true, or `sessionStorage` if false (`#persistPointer`). This is a deliberate, documented choice over the app's `CozyStorage`/IndexedDB systems, both async and unsuited to pre-init page load.
- **Root cause (pre-M372):** `AuthCoordinator.restoreSession()` requires `window.CozyOS.Session` to exist. `login.html` and `index.html` — the two pages where restoration actually needs to run on reload — were **missing the `<script src="core/modules/session/cozy-session-service.js">` tag** that `dashboard.html` already had. Restoration silently failed every time with "Session not loaded yet," regardless of whether the pointer was correctly stored.
- **The fix, confirmed present in both files:** the script tag was added to `login.html` (before `auth-coordinator.js`) and `index.html`, matching `dashboard.html`'s existing order. I diffed the surrounding comments in both files — they're consistent and cross-reference each other correctly.
- **Defense-in-depth, also added this milestone:** `auth-coordinator.js`'s bottom-of-file auto-restore block now genuinely retries (`tryRestore`, up to 15× every 200ms) if `IdentityEngine`/`Session` aren't ready yet, rather than the previous version's comment which *claimed* retry behavior that the code never actually implemented (the file's own inline comment admits this: "this comment previously claimed this exact retry behavior already existed, but the code only ever called tryRestore() once").
- **UI:** both `login.html` (`#cozy-remember-me`) and `core/shell/cozy-login-gate.js` (`#cozy-login-remember`, `#cozy-register-remember`) wire a checked-by-default "Remember Me (30 Days)" checkbox through to `loginWithCredentials`.

**Assessment: the fix is real, internally consistent, and matches its own changelog claims** across all four files I checked (root cause + fix + UI + defense-in-depth). I did not find a residual bug in this flow.

## 7. Synchronization / Offline Flow
`core/connectivity/` is a large (20-file) offline-first subsystem: queue, cache, replication, snapshot, conflict resolution, bandwidth-aware routing, heartbeat, compression. Two files here failed syntax validation (see §9) — `compression.js` and `bandwidth.js` — meaning **this subsystem cannot currently load without a JS parse error** if those files are on a page's script path. I did not trace which HTML pages actually include them to confirm blast radius; that's the natural next step before any fix.

## 8. Plugin Ecosystem
23 plugin files under `core/plugins/`, organized by vertical (ShopOS: core/sales/inventory/purchasing/payments/bookkeeping/reporting/dashboard/reconciliation; MpesaOS: core/float/till/paybill/reporting; WholesaleOS: core/customer/debt; plus ChurchOS/HospitalOS/PharmacyOS single-file entries). `core/pluginManager.js` (v1.2.0) implements real production-hardening: crash isolation with per-plugin failure counters and auto-disable, concurrent-execution guards, permission allowlisting, lifecycle events, and read-only stats snapshots (`Object.defineProperty` rather than exposing live Maps) — a notably mature plugin runtime for a project this size.

## 9. Security Assessment
- **Syntax errors (4, all pre-existing per the project's own `BASELINE.md`, confirmed still present today via `node --check` on every `.js` file):**
  - `modules/quarry/quarry-contants.js:341`
  - `core/ai/cozy-ai-memory.js:13`
  - `core/connectivity/compression.js:83`
  - `core/connectivity/bandwidth.js:128`
  These files cannot execute at all in a real browser until fixed.
- **Auth design is fail-closed by stated intent, and this held up under reading:** `AuthCoordinator` explicitly discards invalid pointers rather than fabricating a session, `logout()` ends the real session at its owning engine before clearing the local pointer, and `isAuthenticated()` defers to the real session object rather than trusting a local flag.
- **Disclosed, not-yet-closed gap (not new):** `AdminRecoveryPolicy` has no single-session revoke, so logging out a trusted-device-originated session revokes *every* admin session for that user, not just the current tab's — documented in the coordinator's own header as a known limitation of an API surface it doesn't own.
- **Reload-persistence model:** only a non-secret pointer (`sessionId`/`userId`) goes into `localStorage`/`sessionStorage` — no credentials, no tokens observed in that path.

## 10. Performance Assessment
- No load-time profiling was possible in this sandbox (no browser). From static reading: `core/shell/launch-sequence.css`'s shrink transition still animates `top`/`width` (layout-triggering) rather than pure transforms — a known, previously-documented, deliberately-deferred perf item (see `FINAL_UX_AUDIT_REPORT_M366.2.md` item 11), not something introduced since.
- `pluginManager.js` tracks `avgRuntimeMs`/`totalRuntimeMs` per plugin and enforces a crash threshold — real operational telemetry already exists for the plugin layer specifically.

## 11. Architecture Health
Confirmed still present (all previously self-disclosed in `BASELINE.md`, none of which I found evidence of being resolved in this snapshot):
- **Duplicate engine:** `CozyQuarryManager` defined in both `modules/quarry/index.js` and `core/modules/QuarryOS/quarry-index.js`.
- **Duplicate `InternalEventBus`:** defined in both `modules/live/cozy-live.js` and `core/modules/identity/cozy-identity.js`.
- **Diverging duplicate shell:** `core/cozy-shell.html` vs. `core/shell/cozy-shell.html` — confirmed byte-different via `diff`.
- **Two competing general-purpose audit loggers:** `core/audit.js` vs. `core/business/audit.js` — still un-merged.
- **Malformed filenames (3, confirmed):** `core/bridge/test/media integration test.js` (space), `core/docs/CERTIFICATION REPORT md` (space, missing dot), `modules/quarry/ quarry.html\`` (leading space + trailing backtick).
- **New finding this pass:** the entire Kernel subsystem (`core/kernel.js`, `bootstrap.js`, `compatibility.js`, `diagnostics.js`, `lifecycle.js`) is orphaned — not `<script>`-included anywhere, and written in ES-module syntax inconsistent with the rest of the codebase's IIFE convention.

## 12. High-Risk Findings (ranked)
1. **`core/connectivity/compression.js` and `bandwidth.js` syntax errors** — if either is on a live page's script path, the whole page's script execution breaks at parse time, not just that feature. Highest priority to confirm blast radius.
2. **Two more pre-existing syntax errors** (`quarry-contants.js`, `cozy-ai-memory.js`) — same class of risk, scoped to Quarry/AI-memory features.
3. **Orphaned Kernel layer** — not an active bug (nothing calls it), but it's dead weight presented as "self-certified" infrastructure; risk is future developers building on it assuming it's live.
4. **Duplicate `CozyQuarryManager` / `InternalEventBus`** — real risk of divergent behavior if one copy is patched and the other isn't (already flagged by the project's own governance docs as unresolved).

## 13. Opportunities for Improvement
- Fix the 4 confirmed syntax errors — low-risk, mechanical, high value (unblocks whatever pages load those files).
- Decide and execute on the orphaned Kernel layer: either wire it in with a real `<script type="module">` entrypoint, or archive it like `_archive/` already does for other retired code, so it stops appearing as live infrastructure.
- Resolve or formally park (with a dated governance note, matching the project's own convention) the two duplicate engines and the diverging `cozy-shell.html` pair.
- Rename the 3 malformed files — trivial, removes friction for anyone scripting over the tree.
- The "Remember Me" (M372) flow itself needs no further code work based on what I read — the remaining open item is the same one the project's own `VERIFICATION_REPORT_M366.2.md` already flagged: real-browser confirmation, since this sandbox can't run one.

---
**Modification Rule honored:** no file in the workspace was changed to produce this report. A repair plan (reason / risk / benefit / affected modules / compatibility impact / rollback) can be produced next, starting with the 4 syntax errors, if you want me to proceed to that phase.
