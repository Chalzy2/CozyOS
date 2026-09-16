# CozyOS — Architecture Rules (Enforceable Set)
Source: `CozyOS_Master_Production_Rules_Updated.docx` (the actual canonical rule set — 24 rules, cumulative, never superseded) + `core/docs/DEVELOPMENT_RULES.md` (a separate, file-hygiene rule set) + inline "Rule N" citations found in coordinator source files. This is the real ruleset, not inferred — Builder should treat Section 1/2 below as ground truth for future validation.

## Section 1 — Original Master Production Rules (1–15)
| # | Rule | Enforcement evidence found in this workspace |
|---|---|---|
| 1 | Start from latest Production ZIP; read entire repo; reuse existing engines; never duplicate | Violated by 2 known duplicate engines (CozyQuarryManager, InternalEventBus) — pre-existing, disclosed |
| 2 | Production code first, documentation second | `core/docs/DEVELOPMENT_RULES.md` restates this as its own Rule 1 |
| 3 | Never remove working functionality without approval | — |
| 4 | Fix regressions before adding features | M372 itself is a regression fix, matches this rule |
| 5 | Preserve Administrator/Developer/End User/other roles | `module-registry.js` `VALID_DASHBOARDS` = platform-admin/developer/end-user |
| 6 | Compose, never duplicate engines/coordinators | This is the dominant pattern in every coordinator read (AuthCoordinator, AuthorizationCoordinator, Kernel) — explicitly self-declared in file headers |
| 7 | Registration order: username/email/password first; biometrics/voice/passkey enrolled only after login | Confirmed in `core/security/auth-coordinator.js` login flow and Rule 22 below (same constraint, restated) |
| 8 | Improve UI, preserve workflow + green/gold glass identity + Living Backgrounds | M366.2 changelog explicitly scoped itself to "no logic changes," matching this rule |
| 9 | Startup sequence: no white flash, logo animation, typing wordmark, welcome voice, motto, living background, floating login | `launch-sequence.js`/`startup-orchestrator.js` implement this stage list; voice-content gap already disclosed in `FINAL_UX_AUDIT_REPORT_M366.2.md` |
| 10 | Official logo is fixed, never redesigned | M366.2 pass replaced logo *assets* with "the supplied logo" — worth confirming this was the approved emblem, not a redesign |
| 11 | Applications must be genuinely usable, not placeholder | `module-registry.js` self-restricts to 3 honestly-registered apps for exactly this reason |
| 12 | Honest verification: syntax/regression/duplicate checks before certifying | This report's own §9/§11 (syntax errors, duplicates) follows this rule |
| 13 | Final report order: ZIP, then certification (version/sizes/counts/changes/testing/limitations/verdict) | `BASELINE.md`/`M361-Stage2-Certification-Report.md` follow this exact structure |
| 14 | Gemini scope limit: design UI only, preserve architecture/functionality | `core/docs/CORE_ARCHITECTURE.md`: "BaseLinker MUST NEVER... contain business logic" — same spirit |
| 15 | CozyOS is cumulative — extend, never replace | Governing meta-rule for all others |

## Section 2 — M356 Living Login Correction Rules (16–24)
Added after real, verified defects reached a prior "PASS" certification — each closes a specific found gap and generalizes it.

| # | Rule | Relevance to this observation pass |
|---|---|---|
| 16 | Startup timing must be signal-gated (real completion event), never a fixed timer or script-load-order guess | `cozy:launch-sequence-complete` event confirmed as the real gate both `index.html`/`dashboard.html` use |
| 17 | Distinct animation behaviors must use distinct animation implementations/sound cues, even if visually similar | Not independently re-verified this pass |
| 18 | Multi-line voice narration must be segmented and synced to each moment, never one combined utterance | Relevant to the still-open "welcome" voice-content gap (§9) |
| 19 | Living Background must persist through the *entire* auth flow (login/register/forgot-password), only switching after real authenticated session begins | Not independently re-verified this pass — good candidate for Layer 2/3 analysis |
| 20 | No white surfaces anywhere in auth/enrollment — every such screen individually audited | Same |
| 21 | One real audio toggle governs all startup/login audio (ambience, typing, motto, voice), including browser TTS fallback | Relevant given TTS fallback exists per `charles-voice-provider.js` |
| 22 | Biometrics never bypass first-login credentials; alternate methods collapsed under "More Sign-in Options," enrolled only post-login in Settings | Consistent with `core/security/auth-coordinator.js`'s `login()`/enrollment split |
| 23 | A milestone is not "PASS" until verified against the real repository (syntax checks, greps confirming defect gone, duplicate audit) — a prior PASS doesn't exempt re-checking | **This is the rule this Builder report itself is built to satisfy** — every finding above was re-verified against the actual M372 code, not assumed from prior reports |
| 24 | Corrections extend, they do not reopen settled design — fix the owning engine, don't add a parallel implementation or touch unrelated approved decisions | The M372 fix (adding a missing script tag + real retry logic to the *existing* AuthCoordinator) is a clean example of compliance with this rule |

## Section 3 — Standing Reminder
Existing functionality/engines/UI/themes/animations/ideas must never be removed or replaced unless explicitly instructed; improvements extend rather than rewrite. Applies to all rules above and every rule added after.

## Separate: File-Hygiene Rules (`core/docs/DEVELOPMENT_RULES.md`)
1. File First — complete production file before explanation.
2. No Partial Reports — don't stop to explain/analyze/ask unless blocked.
3. Clean Source Files — no certification reports/changelogs/engineering notes in production code.
4. Separate Documents — CERTIFICATION.md / CHANGELOG.md / REVIEW.md / README.md.
5. Preserve Architecture — never change public APIs/routing/module IDs/permissions/storage schema/finance paths/folder structure without explicit instruction.
6. Finish the File — completion before documentation.

## Auto-discovered structural conventions (not written down anywhere as a numbered rule, but consistent across every file read)
- IIFE modules register onto a single `window.CozyOS` global namespace.
- Coordinators declare, in a header comment, exactly what they own vs. what they merely compose ("Canonical Ownership Declaration" pattern).
- Version guards: re-executing a script with a version mismatch throws `VERSION_CONFLICT` rather than silently overwriting (seen in `AuthCoordinator`, `module-registry.js`, others).
- `getDiagnosticsReport()` / `getAuditLog()` / `getVersion()` are near-universal public methods across coordinators — an implicit interface contract worth formalizing.
