# CozyOS — Version Knowledge (Milestone Timeline)
Built only from milestones that left direct evidence in this workspace (code comments, changelogs, certification reports actually present in the zip). This is **not** a complete project history — CozyOS's own docs reference milestones back into the 100s that aren't otherwise evidenced here. Builder should treat this file as append-only and grow it every time a new milestone's artifacts are observed.

| Milestone | What changed (confirmed by reading code/docs in this workspace) | Evidence |
|---|---|---|
| M120 | AuthCoordinator created (login orchestration composition layer) | `auth-coordinator.js` header: "Milestone: 120" |
| M125a | Remember Me first introduced — `rememberMe=true` → localStorage, `false` → sessionStorage | `auth-coordinator.js` inline doc comment |
| M132a | Ownership Review — `core/security/auth-coordinator.js` confirmed as distinct `AuthorizationCoordinator`, must never register as `AuthCoordinator` | File header "Ownership Note (Milestone 132a Ownership Report)" |
| M176 (Gate 1) | Traced and removed a compatibility-alias fallback that mis-bound `SessionManager`/`TrustedDeviceManager` globals to the wrong objects | `auth-coordinator.js` "MILESTONE 176A — COMPATIBILITY-ALIAS BLOCK REMOVED" comment |
| M177 | AuthFactorRegistry factor-list/health data added | `core/security/auth-coordinator.js` comment on `getFactorInventory()`/`getFactorHealthReport()` |
| M200D | Fixed silent login failure — `getCurrentIdentity()` was calling a non-existent method name; corrected to `getCurrentAdministrator()` | `auth-coordinator.js` inline comment, verified against actual method names |
| M352 | `loginWithBiometrics()` added | `auth-coordinator.js` version comment `COORDINATOR_VERSION = "1.2.0-ENTERPRISE"` |
| M356 | "Living Login Correction" — Rules 16–24 formalized after real defects reached a prior PASS certification (timing gating, animation segmentation, voice sync, Living Background persistence, no-white-surfaces, unified audio toggle, biometric-never-bypasses-first-login, re-verification requirement, corrections-extend-not-reopen) | `CozyOS_Master_Production_Rules_Updated.docx`, Section 2 |
| M361 (Stage 1 & 2) | Founder Story Vault — management layer added (story/chapter lifecycle, permissions, publishing workflow, media attachment via Document Storage Provider) | `BASELINE.md`, `M361-Stage1/2-Certification-Report.md` |
| M364.5 | Removed the platform-administrator-only biometric/trusted-device recovery modal from the public login page | `login.html` comment |
| M366.2 | Branding/visual/timing polish pass (logo assets, launch-sequence timing 6s→~18-20s, dual-tone glow) — explicitly no auth/session/routing/security logic touched | `CHANGELOG_M366.2_Main_Final.md`, both verification reports |
| M366.2 (UX audit sub-pass) | Logo upward-rise animation, mobile overflow safety net, perf `will-change` hints, WCAG contrast audit (one borderline pair flagged, not changed) | `FINAL_UX_AUDIT_REPORT_M366.2.md` |
| M370.5 | `CozyEnvironment` facade introduced — read-only composition over Living Background state | `login.html`/`index.html` script-tag comments |
| **M372** | **"Remember Me" repair: root cause was `cozy-session-service.js` missing from `login.html`/`index.html`; added, matching `dashboard.html`'s existing wiring. Also added genuine bounded-retry auto-restore logic (previous version's comment falsely claimed retry already existed).** | `auth-coordinator.js`, `login.html`, `index.html` — cross-checked, consistent |

## Confidence notes
- All entries above were read directly from source, not inferred from filenames or the M372 zip name alone.
- Gaps almost certainly exist between M182 (last milestone doc file present) and M356 (next evidenced milestone) — no artifacts for that range shipped in this zip.
