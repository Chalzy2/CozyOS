/**
 * CozyOS Organization Builder — Organization Membership
 * File Reference: core/organization/organization-membership.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * WHY THIS FILE EXISTS (Milestone A)
 *   `IdentityEngine` (`core/modules/identity/identity-engine.js`) models
 *   organization membership with a single `user.orgId` field. That field
 *   answers "who is this user" fine, but it cannot answer "which
 *   organizations does this user belong to, and what can they do in
 *   EACH one" — a real user (e.g. a cashier for one business who also
 *   owns a second business) legitimately belongs to more than one
 *   organization, with a different role and different application
 *   access in each. `user.orgId` is a single scalar; it cannot represent
 *   that without either overwriting itself on every organization switch
 *   or silently picking one organization and locking the user out of
 *   the other. This file is the real, additive fix: the one, canonical
 *   authority for userId+organizationId membership, organization-
 *   specific roles/applications/permissions, invitations, and
 *   organization-scoped authorization.
 *
 * OWNERSHIP AUDIT PERFORMED BEFORE THIS FILE WAS WRITTEN
 *   - `core/modules/identity/identity-engine.js` — confirmed the sole
 *     source of WHO IS THIS USER (identity, authentication, sessions,
 *     platform-level roles, `isPlatformAdmin()`/`isDeveloper()`/etc.,
 *     platform-wide `checkPermission()`). This file never re-implements
 *     login, sessions, or platform-level roles, and never duplicates
 *     IdentityEngine's user record — it only ever stores an opaque
 *     `userId` key.
 *   - `core/organization/organization-registry.js` — confirmed the sole
 *     source of organization existence (`organizationExists()`) and the
 *     one real, shared audit history (`recordExternalHistory()`). This
 *     file is fail-closed against it exactly like `organization-role.js`
 *     and `organization-branding.js`: no membership can be created for
 *     an organization the registry does not recognize.
 *   - `core/organization/organization-role.js` — confirmed this owns
 *     organization *role definitions* (a named position with declared
 *     permissions/restrictions, capacity, reporting line). This file
 *     does not duplicate that: `assignRole()`/`removeRole()` here store
 *     which role NAME(S) a given membership currently holds in that one
 *     organization — the same free-text role-name model
 *     `IdentityEngine.checkPermission(userId, requiredRole)` already
 *     uses platform-wide, now scoped per organization. Organizations
 *     that also want a full `OrganizationRole` position record for that
 *     name may create one; this file does not require it.
 *   - `core/modules/entitlement/entitlement-engine.js` — confirmed the
 *     sole authority for application-level feature entitlement/muting
 *     (plan + administrator override -> effective state), and confirmed
 *     it already calls `IdentityEngine.checkPermission(actorUserId,
 *     ADMIN_ROLE, { orgId })` for its own org-scoped admin check. This
 *     file does not rebuild EntitlementEngine and does not call it —
 *     `assignApplication()`/`removeApplication()` below only ever
 *     change ONE worker's OWN access record inside their own
 *     organization; they can never remove, mute, or otherwise affect an
 *     application platform-wide or for any other worker. Only a CozyOS
 *     Platform Administrator, through the existing platform-level path,
 *     may do that.
 *   - `core/shell/platform-event-bus.js` — confirmed the one shared
 *     pub/sub. This file emits through it, best-effort, exactly like
 *     its siblings — never builds a second event system.
 *
 * WHAT THIS FILE DOES NOT OWN (Zero Duplication Rule)
 *   - Identity, authentication, sessions, platform-level roles, platform
 *     administrator authority: owned by IdentityEngine, untouched here.
 *   - Organization/branch/department existence: owned by
 *     OrganizationRegistry. This file only ever reads
 *     `organizationExists()` — never creates, archives, or mutates an
 *     organization record.
 *   - Organization role DEFINITIONS (permissions/restrictions/capacity
 *     attached to a named position): owned by OrganizationRole.
 *   - Application/feature entitlement and admin muting: owned by
 *     EntitlementEngine. This file never mutes, disables, or removes an
 *     application — it only ever grants/removes ONE worker's access to
 *     an application their organization has chosen to use.
 *
 * DENY-OVER-ALLOW (mandatory, applied at read time in `isAuthorized()`)
 *   Membership STATUS always wins over whatever roles/permissions/
 *   applications a membership record still lists. A `suspended` or
 *   `removed` membership is denied even though its roles/permissions
 *   arrays are left intact (suspension is reversible and auditable —
 *   the grant history is not destroyed, only the authority is withheld
 *   while suspended, or removed permanently while removed). Only
 *   `status === "active"` can ever authorize anything. This is the same
 *   "explicit denial beats an otherwise-present grant" discipline
 *   `organization-role.js`'s `evaluateCapability()` already applies —
 *   reused here as a doctrine, not duplicated as code.
 *
 * ORGANIZATION ISOLATION (mandatory, structural — not just a runtime
 * check)
 *   Every membership record is keyed by the exact pair
 *   `userId + organizationId`. `listOrganizationMembers(organizationId)`
 *   only ever iterates records matching that one organizationId;
 *   `isAuthorized(userId, organizationId, ...)` only ever reads the one
 *   record for that exact pair. A user who belongs to five organizations
 *   has five independent records — there is no code path in this file
 *   that lets a lookup scoped to Organization B return, merge with, or
 *   be influenced by Organization C's record for the same user.
 *
 * IDENTITYENGINE COMPATIBILITY (Milestone A)
 *   `identity-engine.js`'s `checkPermission(userId, requiredRole,
 *   { orgId })` has been additively changed (smallest possible edit,
 *   see that file's own comment at the change site) to delegate to this
 *   file's `isAuthorized()` when `window.CozyOS.OrganizationMembership`
 *   is loaded, and to fall back to its exact prior
 *   `user.orgId === orgId` comparison when it is not — so every existing
 *   caller (EntitlementEngine's org-scoped admin check,
 *   AdministrativeRequestCoordinator's org-scoped approver check, and
 *   any test that never loads this file) keeps working unchanged.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const ORG_MEMBERSHIP_VERSION = "1.0.0-ENTERPRISE";
    const PERMISSION_PATTERN = /^[a-z0-9_-]+:[a-z0-9_-]+$/i; // identical to IdentityEngine's/OrganizationRole's own real, verified regex
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    // Terminal/non-authorizing statuses: only "active" ever authorizes anything (deny-over-allow).
    const STATUS = Object.freeze({
        INVITED: "invited", ACTIVE: "active", SUSPENDED: "suspended",
        DECLINED: "declined", EXPIRED: "expired", REVOKED: "revoked", REMOVED: "removed"
    });

    function sanitize(input) {
        if (!input || typeof input !== "object") return {};
        const clean = {};
        for (const key of Object.keys(input)) { if (!FORBIDDEN_KEYS.has(key)) clean[key] = input[key]; }
        return clean;
    }

    function memberKey(userId, organizationId) { return `${userId}::${organizationId}`; }

    class CozyOrganizationMembership {
        #memberships = new Map(); // "userId::organizationId" -> membership record
        #diagnostics = { membershipsCreated: 0, invitationsSent: 0, authorizationChecks: 0, deniedChecks: 0 };

        getVersion() { return ORG_MEMBERSHIP_VERSION; }
        #deepClone(v) {
            if (typeof structuredClone === "function") { try { return structuredClone(v); } catch (_e) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; }
        }
        #escapeHtml(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
        #generateId(p) { return `${p}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now() + "_" + Math.random().toString(36).slice(2)}`; }

        /**
         * #record(action, membershipId, detail) — reuses OrganizationRegistry's
         * one, real, shared history exactly like organization-role.js and
         * organization-branding.js; falls back to PlatformEventBus directly
         * only when the registry isn't loaded. Never keeps a second,
         * fragmented log of its own.
         */
        #record(action, membershipId, detail) {
            if (window.CozyOS.OrganizationRegistry && typeof window.CozyOS.OrganizationRegistry.recordExternalHistory === "function") {
                window.CozyOS.OrganizationRegistry.recordExternalHistory(action, "membership", membershipId, detail);
            } else if (window.CozyOS.PlatformEventBus) {
                try { window.CozyOS.PlatformEventBus.emit(`organization:${action}`, { entityType: "membership", entityId: membershipId, ...detail }); } catch (_err) { /* non-fatal */ }
            }
        }

        #requireOrganization(organizationId) {
            const registry = window.CozyOS.OrganizationRegistry;
            if (!registry || typeof registry.organizationExists !== "function") {
                throw new Error("[organization-membership] OrganizationRegistry is not loaded — cannot verify a real organization for this membership.");
            }
            if (!organizationId || !registry.organizationExists(organizationId)) {
                throw new TypeError(`[organization-membership] no real organization "${organizationId}".`);
            }
        }

        #get(userId, organizationId) { return this.#memberships.get(memberKey(userId, organizationId)) || null; }

        // ── Membership creation / lookup ──────────────────────────────────
        /**
         * createMembership({userId, organizationId, roles, applications,
         *                    permissions, status, createdBy})
         *   Direct creation (no invitation round-trip) — e.g. seeding an
         *   organization's initial owner. Fail-closed: requires a real,
         *   existing organization, a real userId, and refuses to create a
         *   second record for a pair that already has a live (non-
         *   terminal) membership — use assignRole/suspendMembership/etc.
         *   on the existing record instead of creating a duplicate.
         */
        createMembership(rawInput = {}) {
            const input = sanitize(rawInput);
            if (!input.userId) throw new TypeError("[organization-membership] createMembership(): a real userId is required.");
            this.#requireOrganization(input.organizationId);
            const existing = this.#get(input.userId, input.organizationId);
            if (existing && ![STATUS.DECLINED, STATUS.EXPIRED, STATUS.REVOKED, STATUS.REMOVED].includes(existing.status)) {
                throw new Error(`[organization-membership] createMembership(): "${input.userId}" already has a live membership (status "${existing.status}") in organization "${input.organizationId}".`);
            }
            const roles = Array.isArray(input.roles) ? input.roles.map(r => this.#escapeHtml(String(r))) : [];
            const applications = Array.isArray(input.applications) ? input.applications.map(a => this.#escapeHtml(String(a))) : [];
            const permissions = Array.isArray(input.permissions) ? input.permissions : [];
            const invalidPermission = permissions.find(p => !PERMISSION_PATTERN.test(p));
            if (invalidPermission) throw new TypeError(`[organization-membership] createMembership(): permission "${invalidPermission}" does not match the real "resource:action" format.`);

            const membershipId = this.#generateId("orgmem");
            const now = new Date().toISOString();
            const record = {
                membershipId, userId: input.userId, organizationId: input.organizationId,
                status: input.status && Object.values(STATUS).includes(input.status) ? input.status : STATUS.ACTIVE,
                roles, applications, permissions: [...permissions],
                invitedBy: null, invitedAt: null, expiresAt: null, respondedAt: null,
                joinedAt: now, suspendedAt: null, removedAt: null,
                createdAt: now, updatedAt: now, createdBy: input.createdBy || null
            };
            this.#memberships.set(memberKey(input.userId, input.organizationId), record);
            this.#diagnostics.membershipsCreated++;
            this.#record("membership-created", membershipId, { userId: input.userId, organizationId: input.organizationId, roles });
            return this.#deepClone(record);
        }

        getMembership(userId, organizationId) {
            const record = this.#get(userId, organizationId);
            return record ? this.#deepClone(record) : null;
        }

        hasMembership(userId, organizationId) {
            const record = this.#get(userId, organizationId);
            return !!record && record.status === STATUS.ACTIVE;
        }

        /** listOrganizationMembers(organizationId, {status}) — real, isolated to exactly this organization. */
        listOrganizationMembers(organizationId, { status } = {}) {
            let list = Array.from(this.#memberships.values()).filter(m => m.organizationId === organizationId);
            if (status) list = list.filter(m => m.status === status);
            return list.map(m => this.#deepClone(m));
        }

        /** listUserOrganizations(userId, {status}) — real, every organization this ONE user belongs to (their own membership list, never another user's). */
        listUserOrganizations(userId, { status } = {}) {
            let list = Array.from(this.#memberships.values()).filter(m => m.userId === userId);
            if (status) list = list.filter(m => m.status === status);
            return list.map(m => this.#deepClone(m));
        }

        // ── Invitation lifecycle ──────────────────────────────────────────
        /**
         * invite({userId, organizationId, invitedBy, roles, expiresAt})
         *   Creates a membership record in "invited" status — not yet
         *   authorized for anything (isAuthorized() only ever grants on
         *   "active"). Refuses to invite a pair that already has a live
         *   membership.
         */
        invite(rawInput = {}) {
            const input = sanitize(rawInput);
            if (!input.userId) throw new TypeError("[organization-membership] invite(): a real userId is required.");
            this.#requireOrganization(input.organizationId);
            const existing = this.#get(input.userId, input.organizationId);
            if (existing && ![STATUS.DECLINED, STATUS.EXPIRED, STATUS.REVOKED, STATUS.REMOVED].includes(existing.status)) {
                throw new Error(`[organization-membership] invite(): "${input.userId}" already has a live membership (status "${existing.status}") in organization "${input.organizationId}".`);
            }
            const roles = Array.isArray(input.roles) ? input.roles.map(r => this.#escapeHtml(String(r))) : [];
            const membershipId = this.#generateId("orgmem");
            const now = new Date().toISOString();
            const record = {
                membershipId, userId: input.userId, organizationId: input.organizationId,
                status: STATUS.INVITED, roles, applications: [], permissions: [],
                invitedBy: input.invitedBy || null, invitedAt: now, expiresAt: input.expiresAt || null, respondedAt: null,
                joinedAt: null, suspendedAt: null, removedAt: null,
                createdAt: now, updatedAt: now, createdBy: input.invitedBy || null
            };
            this.#memberships.set(memberKey(input.userId, input.organizationId), record);
            this.#diagnostics.invitationsSent++;
            this.#record("membership-invited", membershipId, { userId: input.userId, organizationId: input.organizationId, invitedBy: record.invitedBy });
            return this.#deepClone(record);
        }

        #transitionInvite(userId, organizationId, toStatus, action, { requireNotExpired = false } = {}) {
            const record = this.#get(userId, organizationId);
            if (!record) throw new Error(`[organization-membership] ${action}(): no membership found for "${userId}" in "${organizationId}".`);
            if (record.status !== STATUS.INVITED) throw new Error(`[organization-membership] ${action}(): membership is "${record.status}", not "invited".`);
            if (requireNotExpired && record.expiresAt && new Date(record.expiresAt).getTime() <= Date.now()) {
                throw new Error(`[organization-membership] ${action}(): invitation expired at ${record.expiresAt} — call expireInvitation() and re-invite.`);
            }
            record.status = toStatus;
            record.respondedAt = new Date().toISOString();
            record.updatedAt = record.respondedAt;
            if (toStatus === STATUS.ACTIVE) record.joinedAt = record.respondedAt;
            this.#record(action, record.membershipId, { userId, organizationId });
            return this.#deepClone(record);
        }

        acceptInvitation(userId, organizationId) { return this.#transitionInvite(userId, organizationId, STATUS.ACTIVE, "membership-accepted", { requireNotExpired: true }); }
        declineInvitation(userId, organizationId) { return this.#transitionInvite(userId, organizationId, STATUS.DECLINED, "membership-declined"); }
        expireInvitation(userId, organizationId) { return this.#transitionInvite(userId, organizationId, STATUS.EXPIRED, "membership-expired"); }
        revokeInvitation(userId, organizationId) { return this.#transitionInvite(userId, organizationId, STATUS.REVOKED, "membership-revoked"); }

        // ── Active-membership lifecycle ───────────────────────────────────
        suspendMembership(userId, organizationId) {
            const record = this.#get(userId, organizationId);
            if (!record) throw new Error(`[organization-membership] suspendMembership(): no membership found for "${userId}" in "${organizationId}".`);
            if (record.status !== STATUS.ACTIVE) throw new Error(`[organization-membership] suspendMembership(): membership is "${record.status}", not "active".`);
            record.status = STATUS.SUSPENDED;
            record.suspendedAt = new Date().toISOString();
            record.updatedAt = record.suspendedAt;
            this.#record("membership-suspended", record.membershipId, { userId, organizationId });
            return this.#deepClone(record);
        }
        reactivateMembership(userId, organizationId) {
            const record = this.#get(userId, organizationId);
            if (!record) throw new Error(`[organization-membership] reactivateMembership(): no membership found for "${userId}" in "${organizationId}".`);
            if (record.status !== STATUS.SUSPENDED) throw new Error(`[organization-membership] reactivateMembership(): membership is "${record.status}", not "suspended".`);
            record.status = STATUS.ACTIVE;
            record.suspendedAt = null;
            record.updatedAt = new Date().toISOString();
            this.#record("membership-reactivated", record.membershipId, { userId, organizationId });
            return this.#deepClone(record);
        }
        /** removeMembership() — final, terminal workforce offboarding. Roles/permissions are left on the record for audit purposes but can never authorize again once status is "removed" (deny-over-allow). */
        removeMembership(userId, organizationId) {
            const record = this.#get(userId, organizationId);
            if (!record) throw new Error(`[organization-membership] removeMembership(): no membership found for "${userId}" in "${organizationId}".`);
            if (record.status === STATUS.REMOVED) return this.#deepClone(record);
            record.status = STATUS.REMOVED;
            record.removedAt = new Date().toISOString();
            record.updatedAt = record.removedAt;
            this.#record("membership-removed", record.membershipId, { userId, organizationId });
            return this.#deepClone(record);
        }

        // ── Organization-specific roles ───────────────────────────────────
        /** assignRole/removeRole — free-text role NAME on this one membership, in this one organization only. Not a platform role, not an OrganizationRole position record — see file header. */
        assignRole(userId, organizationId, role) {
            const record = this.#get(userId, organizationId);
            if (!record) throw new Error(`[organization-membership] assignRole(): no membership found for "${userId}" in "${organizationId}".`);
            if (!role || typeof role !== "string") throw new TypeError("[organization-membership] assignRole(): a real, non-empty role name is required.");
            const clean = this.#escapeHtml(role);
            if (!record.roles.includes(clean)) record.roles.push(clean);
            record.updatedAt = new Date().toISOString();
            this.#record("membership-role-assigned", record.membershipId, { userId, organizationId, role: clean });
            return this.#deepClone(record);
        }
        removeRole(userId, organizationId, role) {
            const record = this.#get(userId, organizationId);
            if (!record) throw new Error(`[organization-membership] removeRole(): no membership found for "${userId}" in "${organizationId}".`);
            const clean = this.#escapeHtml(String(role));
            record.roles = record.roles.filter(r => r !== clean);
            record.updatedAt = new Date().toISOString();
            this.#record("membership-role-removed", record.membershipId, { userId, organizationId, role: clean });
            return this.#deepClone(record);
        }

        // ── Organization-specific application assignment (WORKER ACCESS ONLY) ─
        /**
         * assignApplication/removeApplication(userId, organizationId, applicationId)
         *   Scoped to exactly ONE worker's access record inside ONE
         *   organization. This can never remove, mute, disable, or
         *   otherwise affect an application platform-wide, or for any
         *   other member of the same organization — that authority
         *   belongs solely to a CozyOS Platform Administrator via the
         *   existing platform-level path. An organization administrator
         *   using this method is configuring "can THIS worker currently
         *   use this application," nothing more.
         */
        assignApplication(userId, organizationId, applicationId) {
            const record = this.#get(userId, organizationId);
            if (!record) throw new Error(`[organization-membership] assignApplication(): no membership found for "${userId}" in "${organizationId}".`);
            if (!applicationId || typeof applicationId !== "string") throw new TypeError("[organization-membership] assignApplication(): a real, non-empty applicationId is required.");
            const clean = this.#escapeHtml(applicationId);
            if (!record.applications.includes(clean)) record.applications.push(clean);
            record.updatedAt = new Date().toISOString();
            this.#record("membership-application-assigned", record.membershipId, { userId, organizationId, applicationId: clean });
            return this.#deepClone(record);
        }
        removeApplication(userId, organizationId, applicationId) {
            const record = this.#get(userId, organizationId);
            if (!record) throw new Error(`[organization-membership] removeApplication(): no membership found for "${userId}" in "${organizationId}".`);
            const clean = this.#escapeHtml(String(applicationId));
            record.applications = record.applications.filter(a => a !== clean);
            record.updatedAt = new Date().toISOString();
            this.#record("membership-application-removed", record.membershipId, { userId, organizationId, applicationId: clean });
            return this.#deepClone(record);
        }

        // ── Organization-specific permissions ─────────────────────────────
        /** grantPermission/revokePermission — real "resource:action" strings, same validated format IdentityEngine/OrganizationRole already require, scoped to this one membership. */
        grantPermission(userId, organizationId, permission) {
            const record = this.#get(userId, organizationId);
            if (!record) throw new Error(`[organization-membership] grantPermission(): no membership found for "${userId}" in "${organizationId}".`);
            if (typeof permission !== "string" || !PERMISSION_PATTERN.test(permission)) {
                throw new TypeError(`[organization-membership] grantPermission(): "${permission}" does not match the real "resource:action" format.`);
            }
            if (!record.permissions.includes(permission)) record.permissions.push(permission);
            record.updatedAt = new Date().toISOString();
            this.#record("membership-permission-granted", record.membershipId, { userId, organizationId, permission });
            return this.#deepClone(record);
        }
        revokePermission(userId, organizationId, permission) {
            const record = this.#get(userId, organizationId);
            if (!record) throw new Error(`[organization-membership] revokePermission(): no membership found for "${userId}" in "${organizationId}".`);
            record.permissions = record.permissions.filter(p => p !== permission);
            record.updatedAt = new Date().toISOString();
            this.#record("membership-permission-revoked", record.membershipId, { userId, organizationId, permission });
            return this.#deepClone(record);
        }

        // ── Canonical organization-scoped authorization ───────────────────
        /**
         * isAuthorized(userId, organizationId, permissionOrRole)
         *   THE canonical organization-scoped authorization API (per this
         *   milestone's spec). Deny-over-allow, deterministic:
         *     1. no membership for this exact pair          -> denied
         *     2. membership.status !== "active"              -> denied
         *        (suspended/removed/invited/declined/expired/revoked all
         *        deny, regardless of what roles/permissions the record
         *        still lists — status always wins)
         *     3. permissionOrRole is an explicitly granted permission
         *        string on THIS membership                  -> allowed
         *     4. permissionOrRole matches an assigned role name on THIS
         *        membership                                  -> allowed
         *     5. otherwise                                    -> denied (default)
         *   Organization isolation is structural here: only the ONE
         *   record for this exact userId+organizationId pair is ever
         *   read — a grant in any other organization is invisible to
         *   this call.
         */
        isAuthorized(userId, organizationId, permissionOrRole) {
            this.#diagnostics.authorizationChecks++;
            const record = this.#get(userId, organizationId);
            if (!record || record.status !== STATUS.ACTIVE) { this.#diagnostics.deniedChecks++; return false; }
            if (typeof permissionOrRole !== "string" || !permissionOrRole) { this.#diagnostics.deniedChecks++; return false; }
            if (record.permissions.includes(permissionOrRole) || record.roles.includes(permissionOrRole)) return true;
            this.#diagnostics.deniedChecks++;
            return false;
        }

        getDiagnosticsReport() {
            return this.#deepClone({ moduleVersion: ORG_MEMBERSHIP_VERSION, ...this.#diagnostics, totalMemberships: this.#memberships.size });
        }
    }

    if (window.CozyOS.OrganizationMembership && typeof window.CozyOS.OrganizationMembership.getVersion === "function") {
        const existingVersion = window.CozyOS.OrganizationMembership.getVersion();
        if (existingVersion !== ORG_MEMBERSHIP_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: OrganizationMembership existing v${existingVersion} conflicts with load target v${ORG_MEMBERSHIP_VERSION}.`);
        return;
    }

    window.CozyOS.OrganizationMembership = new CozyOrganizationMembership();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({ sourcePath: "core/organization/organization-membership.js",
                name: "OrganizationMembership", category: "Platform", icon: "id-badge.svg",
                description: "Real, canonical userId+organizationId membership authority — multi-organization support, organization-specific roles/applications/permissions, invitation lifecycle, and deny-over-allow organization-scoped authorization. Never a second identity system; IdentityEngine remains WHO IS THIS USER."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
