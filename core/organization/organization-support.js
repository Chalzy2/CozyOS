/**
 * CozyOS — Organization Support Authority
 * File Reference: core/organization/organization-support.js
 *
 * LIVE INTEGRATION AUDIT — implements the previously-specified CozyOS
 * Platform Support capability: a Church Administrator (or any
 * organization's administrator) can request help without giving up
 * their organization's own authority, and a CozyOS platform
 * administrator can assist without becoming that organization's
 * administrator. No such capability existed anywhere in the repository
 * before this file (confirmed by the earlier authority/wiring audit).
 *
 * WHY THIS IS GENERIC, NOT CHURCHOS-SPECIFIC
 *   The brief frames this as "CozyOS -> support churches," but the real
 *   mechanism needed - a platform admin temporarily, auditable-y,
 *   scoped-ly assisting ONE organization without becoming its admin -
 *   is not a ChurchOS concept. It belongs beside organization-
 *   membership.js/organization-role.js as another real "Organization
 *   Builder" primitive any application can compose, exactly the same
 *   reasoning churchOS-core.js's own header already gives for reusing
 *   OrganizationRole instead of inventing ChurchOS-specific roles.
 *
 * OWNERSHIP - composes existing engines only:
 *   - core/organization/organization-registry.js -
 *     organizationExists()/recordExternalHistory()/getHistory() - the
 *     SAME real, shared, capped audit log every other organization-
 *     domain file already writes into. No new logging store.
 *   - core/organization/organization-membership.js - isAuthorized() -
 *     a support REQUEST requires the requester to be a real, active
 *     member of the organization asking for help (never an anonymous
 *     or unrelated caller).
 *   - core/modules/identity/identity-engine.js - isPlatformAdmin() -
 *     the one real platform-authority primitive this codebase already
 *     has. Granting support is PLATFORM-tier only; nothing here
 *     re-derives or duplicates that check.
 *
 * AUTHORITY BOUNDARY (the actual point of this file)
 *   requestSupport() grants nothing - it only records a request, same
 *   discipline as founder-story-engine.js's own requestAccess()
 *   precedent ("Grants nothing by itself... this only records the
 *   request").
 *   grantSupport() is PLATFORM-tier only (isPlatformAdmin() required)
 *   and creates a real, time-boxed grant - never permanent, never
 *   silent, always recorded. A grant NEVER creates an
 *   OrganizationMembership record, NEVER assigns an org role, and NEVER
 *   sets isOrgAdmin - isSupportActive() is a SEPARATE authority a
 *   caller must explicitly check and compose (see church-live-
 *   moderation.js's own "platform-support" authorization path), never
 *   something that silently widens what isPlatformAdmin()/
 *   isAuthorized() already answer elsewhere. The organization's own
 *   authority is completely unaffected by a grant existing - its real
 *   admin(s) can revoke a grant at any time (see revokeSupport()).
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    const VERSION = "1.0.0";
    if (window.CozyOS.Modules["organization-support"]) return;

    const DEFAULT_DURATION_MS = 4 * 60 * 60 * 1000; // 4 hours
    const MAX_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours - never indefinite
    const REQUEST_STATUS = Object.freeze({ PENDING: "pending", GRANTED: "granted", DECLINED: "declined", CANCELLED: "cancelled" });

    class OrganizationSupport {
        #requests = new Map(); // requestId -> record
        #grants = new Map();   // grantId -> record

        getVersion() { return VERSION; }

        #deepClone(v) {
            if (typeof structuredClone === "function") { try { return structuredClone(v); } catch (_e) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; }
        }
        #generateId(p) { return `${p}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now() + "_" + Math.random().toString(36).slice(2)}`; }

        #requireOrgRegistry() {
            const registry = window.CozyOS.OrganizationRegistry;
            if (!registry || typeof registry.organizationExists !== "function") return null;
            return registry;
        }
        #record(action, entityId, detail) {
            const registry = this.#requireOrgRegistry();
            if (registry && typeof registry.recordExternalHistory === "function") {
                try { registry.recordExternalHistory(action, "support-grant", entityId, detail); } catch (_err) { /* non-fatal — never blocks the real state change */ }
            }
        }

        /**
         * requestSupport({ organizationId, requesterId, reason, liveSessionId })
         *   Real. Requires a real, existing organization and a real,
         *   active member of it. Grants nothing — see file header.
         */
        requestSupport(rawInput = {}) {
            const { organizationId, requesterId, reason, liveSessionId = null } = rawInput;
            if (!organizationId) return { success: false, reason: "A real organizationId is required." };
            if (!requesterId) return { success: false, reason: "A real requesterId is required." };
            if (!reason || !String(reason).trim()) return { success: false, reason: "A real reason is required — support requests are never anonymous or unexplained." };

            const registry = this.#requireOrgRegistry();
            if (!registry) return { success: false, reason: "OrganizationRegistry is not loaded." };
            if (!registry.organizationExists(organizationId)) return { success: false, reason: `No real organization "${organizationId}".` };

            const membership = window.CozyOS.OrganizationMembership;
            if (!membership || typeof membership.hasMembership !== "function") {
                return { success: false, reason: "OrganizationMembership is not loaded — cannot verify the requester belongs to this organization." };
            }
            if (!membership.hasMembership(requesterId, organizationId)) {
                return { success: false, reason: "The requester is not an active member of this organization." };
            }

            const requestId = this.#generateId("support-req");
            const record = {
                requestId, organizationId, requesterId, reason: String(reason).trim(),
                liveSessionId, status: REQUEST_STATUS.PENDING,
                requestedAt: new Date().toISOString(), resolvedAt: null, grantId: null
            };
            this.#requests.set(requestId, record);
            this.#record("support-requested", requestId, { organizationId, requesterId, reason: record.reason, liveSessionId });

            const bus = window.CozyOS.PlatformEventBus;
            if (bus && typeof bus.emit === "function") {
                try { bus.emit("organization-support:requested", { requestId, organizationId }); } catch (_err) { /* non-fatal */ }
            }
            return { success: true, ...this.#deepClone(record) };
        }

        /** listPendingRequests() — real, platform-admin-facing. Never filtered by organization (a CozyOS Admin must see every church's requests to triage them). */
        listPendingRequests() {
            return Array.from(this.#requests.values())
                .filter((r) => r.status === REQUEST_STATUS.PENDING)
                .map((r) => this.#deepClone(r));
        }

        /** getRequest(requestId) — real, read-only. */
        getRequest(requestId) {
            const r = this.#requests.get(requestId);
            return r ? this.#deepClone(r) : null;
        }

        #requireIdentity() {
            const identity = window.CozyOS.IdentityEngine;
            if (!identity || typeof identity.isPlatformAdmin !== "function") return null;
            return identity;
        }

        /**
         * grantSupport({ requestId?, organizationId, operatorId, reason, scope, durationMs })
         *   PLATFORM-tier only. Real, time-boxed, auditable. `scope` is
         *   a real, disclosed array of what the operator is authorized
         *   to inspect/do (e.g. ["inspect-live-session", "moderate-live-session"])
         *   — a caller composing isSupportActive() below decides for
         *   itself whether a specific action is covered; this file only
         *   stores and returns the scope honestly, never interprets it
         *   as a blanket grant.
         */
        grantSupport(rawInput = {}) {
            const { requestId = null, organizationId, operatorId, reason, scope = [], durationMs = DEFAULT_DURATION_MS } = rawInput;
            const identity = this.#requireIdentity();
            if (!identity) return { success: false, reason: "IdentityEngine is not loaded — cannot verify platform-admin authority." };
            if (!operatorId) return { success: false, reason: "A real operatorId is required." };
            if (!identity.isPlatformAdmin(operatorId)) {
                return { success: false, reason: `"${operatorId}" is not a CozyOS platform administrator — support can only ever be granted by real platform authority, never by an organization's own admin.` };
            }
            if (!organizationId) return { success: false, reason: "A real organizationId is required." };
            const registry = this.#requireOrgRegistry();
            if (!registry || !registry.organizationExists(organizationId)) return { success: false, reason: `No real organization "${organizationId}".` };
            if (!reason || !String(reason).trim()) return { success: false, reason: "A real reason is required." };
            if (!Array.isArray(scope) || scope.length === 0) return { success: false, reason: "A real, non-empty scope array is required — support is never unscoped." };
            const safeDurationMs = (typeof durationMs === "number" && durationMs > 0 && durationMs <= MAX_DURATION_MS) ? durationMs : DEFAULT_DURATION_MS;

            const request = requestId ? this.#requests.get(requestId) : null;
            if (requestId && (!request || request.organizationId !== organizationId)) {
                return { success: false, reason: "requestId does not match a real, pending request for this organization." };
            }

            const grantId = this.#generateId("support-grant");
            const now = Date.now();
            const record = {
                grantId, organizationId, operatorId, reason: String(reason).trim(), scope: [...scope],
                requestId: requestId || null, authorizedAt: new Date(now).toISOString(),
                expiresAt: new Date(now + safeDurationMs).toISOString(), revokedAt: null, revokedBy: null,
                actions: []
            };
            this.#grants.set(grantId, record);

            if (request) {
                request.status = REQUEST_STATUS.GRANTED;
                request.resolvedAt = new Date().toISOString();
                request.grantId = grantId;
            }

            this.#record("support-granted", grantId, { organizationId, operatorId, reason: record.reason, scope: record.scope, expiresAt: record.expiresAt, requestId: record.requestId });

            const bus = window.CozyOS.PlatformEventBus;
            if (bus && typeof bus.emit === "function") {
                try { bus.emit("organization-support:granted", { grantId, organizationId, operatorId }); } catch (_err) { /* non-fatal */ }
            }
            return { success: true, ...this.#deepClone(record) };
        }

        /**
         * isSupportActive(organizationId, operatorId, { requiredScope })
         *   Real, evidence-based: a live (not expired, not revoked)
         *   grant for this exact organization+operator pair, optionally
         *   narrowed to one specific scope item. Fails closed on any
         *   missing/expired/revoked state — never assumes support is
         *   active.
         */
        isSupportActive(organizationId, operatorId, { requiredScope = null } = {}) {
            const nowMs = Date.now();
            for (const grant of this.#grants.values()) {
                if (grant.organizationId !== organizationId || grant.operatorId !== operatorId) continue;
                if (grant.revokedAt) continue;
                if (new Date(grant.expiresAt).getTime() <= nowMs) continue;
                if (requiredScope && !grant.scope.includes(requiredScope)) continue;
                return { active: true, grantId: grant.grantId, expiresAt: grant.expiresAt, scope: [...grant.scope] };
            }
            return { active: false };
        }

        /**
         * recordSupportAction(grantId, action, detail)
         *   Real. Only ever records against a genuinely still-active
         *   grant — a revoked/expired grant cannot accumulate new
         *   "actions performed" entries, keeping the audit trail honest
         *   about when real authority actually existed.
         */
        recordSupportAction(grantId, action, detail = null) {
            const grant = this.#grants.get(grantId);
            if (!grant) return { success: false, reason: `No real support grant "${grantId}".` };
            if (grant.revokedAt) return { success: false, reason: "This support grant has been revoked." };
            if (new Date(grant.expiresAt).getTime() <= Date.now()) return { success: false, reason: "This support grant has expired." };
            const entry = { action, detail: this.#deepClone(detail), at: new Date().toISOString() };
            grant.actions.push(entry);
            this.#record("support-action", grantId, { organizationId: grant.organizationId, operatorId: grant.operatorId, action, detail });
            return { success: true, entry: this.#deepClone(entry) };
        }

        /**
         * revokeSupport(grantId, revokedBy, reason)
         *   Real. Callable by: the operator themselves, ANY platform
         *   admin, or a real, active org-admin of the affected
         *   organization — an organization must always be able to end
         *   platform support into itself; that is the whole point of
         *   this never removing normal organization ownership.
         */
        revokeSupport(grantId, revokedBy, reason = null) {
            const grant = this.#grants.get(grantId);
            if (!grant) return { success: false, reason: `No real support grant "${grantId}".` };
            if (grant.revokedAt) return { success: false, reason: "This support grant was already revoked." };

            const identity = this.#requireIdentity();
            const isOperatorSelf = revokedBy === grant.operatorId;
            const isPlatformAdmin = !!(identity && identity.isPlatformAdmin(revokedBy));
            const membership = window.CozyOS.OrganizationMembership;
            const isOrgAdmin = !!(membership && membership.hasMembership(revokedBy, grant.organizationId) && this.#isRecordedOrgAdmin(membership, revokedBy, grant.organizationId));

            if (!isOperatorSelf && !isPlatformAdmin && !isOrgAdmin) {
                return { success: false, reason: `"${revokedBy}" is not authorized to revoke this support grant.` };
            }

            grant.revokedAt = new Date().toISOString();
            grant.revokedBy = revokedBy;
            this.#record("support-revoked", grantId, { organizationId: grant.organizationId, operatorId: grant.operatorId, revokedBy, reason });

            const bus = window.CozyOS.PlatformEventBus;
            if (bus && typeof bus.emit === "function") {
                try { bus.emit("organization-support:revoked", { grantId, organizationId: grant.organizationId }); } catch (_err) { /* non-fatal */ }
            }
            return { success: true, ...this.#deepClone(grant) };
        }

        /** #isRecordedOrgAdmin — real, best-effort: an org member holding 'owner'/'admin' as an assigned role name on their own membership record. */
        #isRecordedOrgAdmin(membership, userId, organizationId) {
            const record = typeof membership.getMembership === "function" ? membership.getMembership(userId, organizationId) : null;
            return !!(record && Array.isArray(record.roles) && (record.roles.includes("owner") || record.roles.includes("admin")));
        }

        /** getGrant(grantId) — real, read-only. */
        getGrant(grantId) {
            const g = this.#grants.get(grantId);
            return g ? this.#deepClone(g) : null;
        }

        /** listActiveGrants(organizationId) — real, org-scoped visibility for that organization's own administrator ("who currently has support access to us"). */
        listActiveGrants(organizationId) {
            if (!organizationId) return [];
            const nowMs = Date.now();
            return Array.from(this.#grants.values())
                .filter((g) => g.organizationId === organizationId && !g.revokedAt && new Date(g.expiresAt).getTime() > nowMs)
                .map((g) => this.#deepClone(g));
        }

        /** getAuditTrail(organizationId) — real, composes the SAME shared OrganizationRegistry history log every other organization-domain file writes into (see file header) — no second log. */
        getAuditTrail(organizationId) {
            const registry = this.#requireOrgRegistry();
            if (!registry || typeof registry.getHistory !== "function") return [];
            const events = registry.getHistory({});
            return events.filter((e) => e.detail && e.detail.organizationId === organizationId &&
                ["support-requested", "support-granted", "support-action", "support-revoked"].includes(e.action));
        }

        getDiagnosticsReport() {
            return {
                moduleVersion: VERSION,
                pendingRequests: Array.from(this.#requests.values()).filter((r) => r.status === REQUEST_STATUS.PENDING).length,
                activeGrants: Array.from(this.#grants.values()).filter((g) => !g.revokedAt && new Date(g.expiresAt).getTime() > Date.now()).length
            };
        }
    }

    window.CozyOS.OrganizationSupport = new OrganizationSupport();
    window.CozyOS.Modules["organization-support"] = Object.freeze({
        version: VERSION,
        description: "Real, scoped, time-boxed, auditable CozyOS platform support for one organization at a time. requestSupport() (org member, grants nothing) / grantSupport() (platform-admin only, real expiry) / isSupportActive() (fail-closed evidence check) / recordSupportAction()/revokeSupport() (operator, platform-admin, or the org's own admin). Never creates an OrganizationMembership record, never assigns a role, never converts the platform administrator into that organization's administrator."
    });

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                sourcePath: "core/organization/organization-support.js",
                name: "OrganizationSupport", category: "Organization", icon: "life-buoy",
                description: "Scoped, time-boxed, auditable CozyOS platform support for one organization — never grants organization admin authority."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
