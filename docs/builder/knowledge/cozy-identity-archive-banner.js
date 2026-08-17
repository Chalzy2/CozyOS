/**
 * ============================================================================
 * ARCHIVED — DO NOT WIRE IN WITHOUT A NEW DESIGN REVIEW
 * ============================================================================
 * Status:        Archive Candidate → ARCHIVED (decision logged)
 * Decided by:     Cozy Builder investigation, see:
 *                 docs/builder/reports/cozy-identity-investigation.md
 * Decision date:  (fill in when applied — Rule 23: verified against real repo)
 *
 * WHY THIS FILE IS ARCHIVED, NOT DELETED (Rule 3 — never remove without
 * explicit approval; Rule 15 — CozyOS is cumulative):
 *   - Exports only to `globalThis.CozyIdentity`, never `window.CozyOS.*` —
 *     outside the convention every live coordinator uses.
 *   - `createCozyIdentity()` is never invoked anywhere in the repository —
 *     none of this file's ~2,571 lines execute today.
 *   - No HTML entrypoint loads this file.
 *
 * SUPERSEDED capability groups (richer, live, already wired — do not restore
 * these from here): Identity lifecycle, Organizations/Memberships,
 * Roles/Permissions, Device trust, Identity sessions.
 *   Live owners: IdentityEngine, AuthCoordinator, TrustedDeviceManager,
 *   SessionService.
 *
 * DEAD CODE (real code, unreachable — required adapters never registered):
 *   authenticate(), syncIdentity()
 *
 * ALREADY IMPLEMENTED ELSEWHERE (inert bookkeeping only, no execution here):
 *   Plugin registry → core/pluginManager.js
 *   Integration registry → CozyStorage
 *
 * GENUINELY UNIQUE — not duplicated live, but NOT a green light to reactivate
 * this file as-is. Each requires its own scoped design review, architecture
 * approval, compatibility analysis, and regression assessment before any
 * new implementation:
 *   - Groups (create/join/leave/list)
 *   - Privacy & Consent (setPrivacyPreferences/recordConsent/getPublicProfile)
 *   - Access-Level ranking (ACCESS_LEVEL_RANK / evaluateAccess) — distinct
 *     from core/security/auth-policy-engine.js, which governs auth
 *     *factors*, not resource visibility.
 *
 * If any of the above is ever built for real, re-specify it as a new,
 * intentionally-scoped engine that reuses this file's enums/shapes as a
 * reference — do not reactivate this factory wholesale (Rule 24: corrections
 * extend, they do not reopen settled design).
 * ============================================================================
 */

