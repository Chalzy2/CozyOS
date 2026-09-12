/**
 * CozyOS — Organization-Scoped Entitlement Bridge
 * File Reference: core/modules/entitlement/organization-entitlement-bridge.js
 * Version: 1.0.0-ENTERPRISE
 * Layer: Core / Platform Service — Composition ONLY
 *
 * OWNERSHIP AUDIT PERFORMED BEFORE THIS FILE WAS WRITTEN
 *   Inspected core/organization/organization-membership.js (real,
 *   canonical userId+organizationId membership authority —
 *   getMembership()/hasMembership(), record.status, record.applications[]),
 *   core/modules/entitlement/entitlement-engine.js (real plan+admin-
 *   override merge — getEffectiveState(organizationId, feature), REQUIRED/
 *   PLAN_RESTRICTED/ADMIN_DISABLED/MUTED/ENABLED, guard()), and
 *   core/shell/organization-workspace.js's own disclosed limitation
 *   (file header, "DISCLOSED LIMITATION" section): EntitlementEngine is a
 *   real, separate authority that nothing organization-scoped composes
 *   with yet. That composition — and ONLY that composition — is what
 *   this file adds.
 *
 * WHAT THIS FILE DOES NOT OWN (Zero Duplication Rule)
 *   - Membership, roles, worker-application assignment: owned by
 *     OrganizationMembership. This file only ever calls
 *     getMembership(userId, organizationId) — never creates, mutates, or
 *     caches a second copy of a membership record.
 *   - Plan truth, administrator overrides, the effective-state merge
 *     itself: owned by EntitlementEngine. This file only ever calls the
 *     existing getEffectiveState(organizationId, featureKey) — never
 *     stores an override, never reads BillingEngine directly, never
 *     computes REQUIRED/PLAN_RESTRICTED/ADMIN_DISABLED logic itself.
 *   - Authorization for *changing* an override: unchanged, still
 *     EntitlementEngine.setAdminOverride()/clearAdminOverride(), which
 *     already delegates to IdentityEngine.checkPermission(actorUserId,
 *     "admin", {orgId}) — this file adds no new authorization path and
 *     no new way to mutate entitlement state.
 *   - Application platform-existence / platform-mute: owned solely by
 *     the platform-admin path (outside this milestone). This file has no
 *     method that removes an application from CozyOS or platform-mutes
 *     it, and organization admins reach this bridge with no more
 *     authority than OrganizationMembership.assignApplication/
 *     removeApplication already grants them (their own organization's
 *     worker-access records only).
 *
 *   This file owns exactly one thing: given an explicit organization
 *   context, composing "is this application assigned to this worker in
 *   this organization" (OrganizationMembership) with "what does this
 *   organization's plan + admin overrides say about this application/
 *   feature/function" (EntitlementEngine) into one explainable decision,
 *   plus the application -> feature -> function cascade (a disabled
 *   application-level key blocks every child key beneath it) that
 *   neither existing engine models on its own.
 *
 * FAIL-CLOSED / HONESTY RULES
 *   - organizationId is REQUIRED and must be passed explicitly by the
 *     caller (server-verified context). This file never reads
 *     window.organizationId or any other ambient/client-supplied value —
 *     same discipline organization-workspace.js already documents for
 *     itself.
 *   - No membership for userId+organizationId, or membership.status is
 *     not "active" -> DENIED (MEMBERSHIP_INACTIVE / NOT_A_MEMBER),
 *     regardless of what EntitlementEngine would otherwise say.
 *   - applicationId not present in the membership's own
 *     record.applications[] -> DENIED (APPLICATION_NOT_ASSIGNED), before
 *     EntitlementEngine is ever consulted.
 *   - An application-level ADMIN_DISABLED/MUTED/PLAN_RESTRICTED state
 *     cascades to every feature/function beneath it UNLESS that
 *     feature/function key is itself registered REQUIRED on
 *     EntitlementEngine — required capabilities stay protected exactly
 *     like EntitlementEngine already protects them for a single key.
 *   - A worker's roles/permissions (OrganizationMembership) are never
 *     consulted to raise the ceiling EntitlementEngine sets — this
 *     bridge only ever narrows (membership assignment AND entitlement
 *     state must both allow), never widens.
 *   - Missing OrganizationMembership or EntitlementEngine on
 *     window.CozyOS is a thrown, fail-closed error — never a silent
 *     "allow".
 */
(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const BRIDGE_VERSION = "1.0.0-ENTERPRISE";

    const DENIAL = Object.freeze({
        NOT_A_MEMBER: "NOT_A_MEMBER",
        MEMBERSHIP_INACTIVE: "MEMBERSHIP_INACTIVE",
        APPLICATION_NOT_ASSIGNED: "APPLICATION_NOT_ASSIGNED",
    });

    function requireDeps() {
        const membership = window.CozyOS && window.CozyOS.OrganizationMembership;
        const entitlement = window.CozyOS && window.CozyOS.Entitlement;
        if (!membership || typeof membership.getMembership !== "function") {
            throw new Error("[OrgEntitlementBridge] OrganizationMembership is not loaded — failing closed.");
        }
        if (!entitlement || typeof entitlement.getEffectiveState !== "function") {
            throw new Error("[OrgEntitlementBridge] EntitlementEngine is not loaded — failing closed.");
        }
        return { membership, entitlement };
    }

    function requireOrganizationId(organizationId) {
        if (typeof organizationId !== "string" || !organizationId.trim()) {
            throw new TypeError("[OrgEntitlementBridge] organizationId must be an explicit, non-empty string — never inferred from client state.");
        }
    }

    function requireApplicationId(applicationId) {
        if (typeof applicationId !== "string" || !applicationId.trim()) {
            throw new TypeError("[OrgEntitlementBridge] applicationId must be a non-empty string.");
        }
    }

    /** buildKeyChain() — the additive part neither existing engine models: application -> feature -> function, broadest first. */
    function buildKeyChain(applicationId, featureId, functionId) {
        const chain = [applicationId];
        if (featureId) chain.push(`${applicationId}.${featureId}`);
        if (featureId && functionId) chain.push(`${applicationId}.${featureId}.${functionId}`);
        return chain;
    }

    function denialDecision({ organizationId, applicationId, featureId, functionId, state, reason }) {
        return Object.freeze({
            organizationId, applicationId, featureId: featureId || null, functionId: functionId || null,
            enabled: false, state, source: "MEMBERSHIP", reason,
            planState: null, adminOverride: null, required: false,
            evaluatedAt: new Date().toISOString(),
        });
    }

    function fromEngineDecision(engineDecision, { organizationId, applicationId, featureId, functionId, cascadedFrom }) {
        return Object.freeze({
            organizationId, applicationId, featureId: featureId || null, functionId: functionId || null,
            enabled: engineDecision.enabled,
            state: engineDecision.state,
            source: cascadedFrom ? `ENTITLEMENT_CASCADE(${cascadedFrom})` : "ENTITLEMENT",
            reason: engineDecision.reason,
            planState: Object.freeze({ planId: engineDecision.planId, restricted: engineDecision.state === "PLAN_RESTRICTED" }),
            adminOverride: engineDecision.overrideId ? Object.freeze({ overrideId: engineDecision.overrideId, state: engineDecision.state }) : null,
            required: engineDecision.state === "REQUIRED",
            evaluatedAt: engineDecision.evaluatedAt,
        });
    }

    /**
     * getEffectiveState({ userId, organizationId, applicationId, featureId, functionId })
     *   THE real composition point. featureId/functionId are optional —
     *   omit both to evaluate at application level, omit only functionId
     *   to evaluate at feature level.
     */
    function getEffectiveState({ userId, organizationId, applicationId, featureId = null, functionId = null } = {}) {
        requireOrganizationId(organizationId);
        requireApplicationId(applicationId);
        if (functionId && !featureId) {
            throw new TypeError("[OrgEntitlementBridge] functionId requires featureId (cannot address a function without its parent feature).");
        }
        const { membership: membershipSvc, entitlement } = requireDeps();

        const record = membershipSvc.getMembership(userId, organizationId);
        if (!record) {
            return denialDecision({ organizationId, applicationId, featureId, functionId, state: DENIAL.NOT_A_MEMBER, reason: `No membership found for this user in organization "${organizationId}".` });
        }
        if (record.status !== "active") {
            return denialDecision({ organizationId, applicationId, featureId, functionId, state: DENIAL.MEMBERSHIP_INACTIVE, reason: `Membership status is "${record.status}", not "active".` });
        }
        if (!Array.isArray(record.applications) || !record.applications.includes(applicationId)) {
            return denialDecision({ organizationId, applicationId, featureId, functionId, state: DENIAL.APPLICATION_NOT_ASSIGNED, reason: `Application "${applicationId}" is not assigned to this worker in organization "${organizationId}".` });
        }

        const chain = buildKeyChain(applicationId, featureId, functionId);
        const leafKey = chain[chain.length - 1];
        const leafDecision = entitlement.getEffectiveState(organizationId, leafKey);

        // A REQUIRED leaf is protected outright — it never inherits a cascaded
        // denial from an ancestor, exactly like EntitlementEngine protects a
        // single REQUIRED key from its own plan/override checks.
        if (leafDecision.state === "REQUIRED") {
            return fromEngineDecision(leafDecision, { organizationId, applicationId, featureId, functionId });
        }

        for (let i = 0; i < chain.length - 1; i++) {
            const ancestorDecision = entitlement.getEffectiveState(organizationId, chain[i]);
            if (ancestorDecision.state === "REQUIRED") continue; // ancestor itself protected; keep walking down
            if (!ancestorDecision.enabled) {
                return fromEngineDecision(ancestorDecision, {
                    organizationId, applicationId, featureId, functionId,
                    cascadedFrom: chain[i],
                });
            }
        }
        return fromEngineDecision(leafDecision, { organizationId, applicationId, featureId, functionId });
    }

    function isEnabled(params) { return getEffectiveState(params).enabled; }

    /** OrgEntitlementBridgeDeniedError — mirrors EntitlementDeniedError's contract so callers can distinguish "not entitled" from a generic error, at organization scope. */
    class OrgEntitlementBridgeDeniedError extends Error {
        constructor(decision) {
            super(`[OrgEntitlementBridge] Application "${decision.applicationId}" (feature: ${decision.featureId || "-"}, function: ${decision.functionId || "-"}) is not available for organization "${decision.organizationId}" (state: ${decision.state}).`);
            this.name = "OrgEntitlementBridgeDeniedError";
            this.decision = decision;
        }
    }

    /** guard(...) — the real service-boundary enforcement point for organization-scoped client integrations. Never rely on UI hiding alone. */
    function guard(params) {
        const decision = getEffectiveState(params);
        if (!decision.enabled) throw new OrgEntitlementBridgeDeniedError(decision);
        return decision;
    }

    window.CozyOS.OrgEntitlementBridgeDeniedError = OrgEntitlementBridgeDeniedError;
    window.CozyOS.OrganizationEntitlementBridge = Object.freeze({
        getVersion: () => BRIDGE_VERSION,
        getEffectiveState,
        isEnabled,
        guard,
    });

    if (window.CozyOS.Modules) {
        window.CozyOS.Modules["organization-entitlement-bridge"] = Object.freeze({
            version: BRIDGE_VERSION,
            description: "Additive composition of OrganizationMembership (worker-application assignment) with EntitlementEngine (plan + admin-override effective state), plus the application->feature->function cascade neither engine models alone. Owns no membership, plan, or override data of its own.",
        });
    }

    (function reg(d) {
        function attempt() { if (typeof window.CozyOS.registerCoordinator !== "function") return false; try { window.CozyOS.registerCoordinator(d); } catch (_e) { /* non-fatal */ } return true; }
        if (attempt()) return;
        if (!Object.prototype.hasOwnProperty.call(window.CozyOS, "__pendingCoordinatorRegistrations")) Object.defineProperty(window.CozyOS, "__pendingCoordinatorRegistrations", { value: [], writable: true, enumerable: false, configurable: true });
        window.CozyOS.__pendingCoordinatorRegistrations.push(d);
        let n = 0; const iv = setInterval(() => { n++; if (attempt() || n >= 200) clearInterval(iv); }, 250);
    })({
        sourcePath: "core/modules/entitlement/organization-entitlement-bridge.js",
        name: "OrganizationEntitlementBridge", category: "Foundation", icon: "entitlement.svg",
        description: "Organization-scoped composition of OrganizationMembership + EntitlementEngine into one explainable effective application/feature/function state.",
    });
})();
