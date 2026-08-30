/**
 * CozyOS Enterprise Framework — Entitlement Engine
 * File Reference: core/modules/entitlement/entitlement-engine.js
 * Version: 1.0.0-ENTERPRISE
 * Layer: Core / Platform Service — Feature Entitlement & Admin Muting
 *
 * OWNERSHIP AUDIT PERFORMED BEFORE THIS FILE WAS WRITTEN
 *   Inspected modules/billingEngine.js (window.CozyOS.Billing — real
 *   per-tenant plan/subscription truth: licensedModules[], status,
 *   expiresAt, isFeatureLicensed()), core/modules/identity/
 *   identity-engine.js (window.CozyOS.IdentityEngine — real
 *   authorization: checkPermission()/isPlatformAdmin(), organization-
 *   scoped via {orgId}), core/tenant.js / core/organization/
 *   organization-registry.js (organization isolation, keyed by
 *   orgId/tenantId), core/shell/platform-event-bus.js (the one shared
 *   pub/sub), core/registry/cozy-registry.js (metadata-only app
 *   catalog — confirmed NOT a permission authority), and the three
 *   existing role dictionaries (core/permissions.js,
 *   core/business/permissions.js, IdentityEngine's role model) — none
 *   of which model sub-feature entitlement inside a single application.
 *   No existing engine merges "plan says X" with "administrator says Y"
 *   into one explainable decision. That merge is the only new thing
 *   this file does.
 *
 * WHAT THIS FILE DOES NOT OWN (Zero Duplication Rule)
 *   - Plan/subscription truth: owned by BillingEngine
 *     (window.CozyOS.Billing). This engine only ever READS
 *     getSubscriptionSnapshot()/isFeatureLicensed() from it — never
 *     stores a second copy of plan data, never mutates it.
 *   - Authorization: owned by IdentityEngine
 *     (window.CozyOS.IdentityEngine). This engine only ever calls
 *     checkPermission()/isPlatformAdmin() on it — never grants roles,
 *     never stores a second permission table, never touches
 *     IdentityEngine internals.
 *   - Organization/tenant identity and isolation: owned by
 *     core/tenant.js and core/organization/*. This engine only ever
 *     receives an organizationId as an opaque key — it never creates,
 *     validates, or resolves organizations itself.
 *   - Event delivery: owned by PlatformEventBus
 *     (window.CozyOS.PlatformEventBus). This engine emits through it,
 *     best-effort, and never builds a second pub/sub.
 *
 *   This engine owns exactly one thing: the MERGE — plan entitlement +
 *   administrator override -> one explainable effective feature state
 *   — plus the override store itself (administrator overrides have no
 *   other home) and the service-boundary guard() built on top of the
 *   merge.
 *
 * FAIL-CLOSED / HONESTY RULES
 *   - Mutating an override (setAdminOverride/clearAdminOverride)
 *     without IdentityEngine present, or without the actor holding
 *     the required authority, is REJECTED — never silently allowed.
 *   - Reading effective state without BillingEngine present never
 *     fabricates a planId or a "not included in subscription" verdict
 *     — the plan layer simply reports as not-restricting, exactly like
 *     BillingEngine's own SUBSCRIPTIONS_ENABLED=false convention, and
 *     the returned decision says so honestly (source: "DEFAULT").
 *   - A feature registered as REQUIRED can never be muted, disabled,
 *     or plan-restricted by anything this engine does — enforced at
 *     both write time (setAdminOverride rejects it) and read time
 *     (getEffectiveState short-circuits to REQUIRED before consulting
 *     plan or override data).
 *   - A plan restriction is never overridable upward by an
 *     administrator override — an administrator can only ever narrow
 *     (mute/disable) what the plan already allows, never widen what
 *     the plan excludes. Clearing an override when the plan itself
 *     excludes the feature returns to PLAN_RESTRICTED, not ENABLED.
 */
(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const ENTITLEMENT_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    /** The org-scoped role an actor must hold (or platform-admin) to mutate an override. Reuses IdentityEngine's existing role vocabulary — no new role system. */
    const ADMIN_ROLE = "admin";

    const STATES = Object.freeze({
        ENABLED: "ENABLED",
        MUTED: "MUTED",
        PLAN_RESTRICTED: "PLAN_RESTRICTED",
        ADMIN_DISABLED: "ADMIN_DISABLED",
        REQUIRED: "REQUIRED"
    });
    const OVERRIDE_STATES = Object.freeze([STATES.MUTED, STATES.ADMIN_DISABLED]);

    function sanitizeKey(value, label) {
        if (typeof value !== "string" || !value.trim()) throw new TypeError(`[Entitlement] ${label} must be a non-empty string.`);
        if (FORBIDDEN_KEYS.has(value)) throw new TypeError(`[Entitlement] ${label} "${value}" is not allowed.`);
        return value;
    }

    /** EntitlementDeniedError — thrown by guard() so callers can distinguish "not entitled" from a generic error and read the full explainable decision off it. */
    class EntitlementDeniedError extends Error {
        constructor(decision) {
            super(`[Entitlement] Feature "${decision.feature}" is not available for organization "${decision.organizationId}" (state: ${decision.state}).`);
            this.name = "EntitlementDeniedError";
            this.decision = decision;
        }
    }

    class CozyOSEntitlementEngine {
        #overrides = new Map();     // `${organizationId}::${feature}` -> { state, reason, actorUserId, setAt, overrideId }
        #requiredFeatures = new Set();
        #auditLogs = [];
        #listeners = new Map();
        #diagnostics = { overridesSet: 0, overridesCleared: 0, guardChecks: 0, guardDenials: 0, unauthorizedAttempts: 0 };

        getVersion() { return ENTITLEMENT_VERSION; }

        #deepClone(v) {
            if (typeof structuredClone === "function") { try { return structuredClone(v); } catch (_e) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; }
        }
        #generateId(p) { return `${p}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`}`; }
        #overrideKey(organizationId, feature) { return `${organizationId}::${feature}`; }

        #logAudit(action, detail) {
            const entry = Object.freeze({ id: this.#generateId("entaud"), timestamp: new Date().toISOString(), action, ...detail });
            this.#auditLogs.push(entry);
            if (this.#auditLogs.length > 2000) this.#auditLogs.shift();
            if (window.CozyOS.PlatformEventBus && typeof window.CozyOS.PlatformEventBus.emit === "function") {
                try { window.CozyOS.PlatformEventBus.emit("entitlement:changed", this.#deepClone(entry)); } catch (_e) { /* non-fatal, this engine's own audit log remains authoritative */ }
            }
            return entry;
        }
        /** getAuditLog(predicate) — real, append-only; matches every other CozyOS coordinator's convention. */
        getAuditLog(predicate) { const l = this.#auditLogs.map(e => this.#deepClone(e)); return Object.freeze(predicate ? l.filter(predicate) : l); }

        on(event, handler) { if (!this.#listeners.has(event)) this.#listeners.set(event, new Set()); this.#listeners.get(event).add(handler); return () => this.off(event, handler); }
        off(event, handler) { const s = this.#listeners.get(event); if (!s) return false; const r = s.delete(handler); if (s.size === 0) this.#listeners.delete(event); return r; }
        once(event, handler) { const w = (p) => { this.off(event, w); handler(p); }; this.on(event, w); }
        emit(event, payload) {
            const s = this.#listeners.get(event);
            if (!s) return false;
            for (const fn of Array.from(s)) { try { fn(this.#deepClone(payload)); } catch (_e) { /* one listener's failure never blocks the others */ } }
            return true;
        }

        // ── REQUIRED feature registry ────────────────────────────────────
        /** registerRequiredFeature(feature) — declares a feature the application depends on. Once registered, no admin override or plan restriction can ever disable it through this engine. */
        registerRequiredFeature(feature) {
            sanitizeKey(feature, "feature");
            this.#requiredFeatures.add(feature);
            this.#logAudit("REQUIRED_FEATURE_REGISTERED", { feature });
            return true;
        }
        unregisterRequiredFeature(feature) {
            const removed = this.#requiredFeatures.delete(feature);
            if (removed) this.#logAudit("REQUIRED_FEATURE_UNREGISTERED", { feature });
            return removed;
        }
        isRequiredFeature(feature) { return this.#requiredFeatures.has(feature); }
        listRequiredFeatures() { return Array.from(this.#requiredFeatures); }

        // ── Authorization gate (delegates entirely to IdentityEngine) ────
        /** #authorizeOverrideChange() — real, fail-closed. Never assumes authorization; an unreachable IdentityEngine is a denial, not a bypass. */
        #authorizeOverrideChange(actorUserId, organizationId) {
            const identity = window.CozyOS && window.CozyOS.IdentityEngine;
            if (!identity || typeof identity.checkPermission !== "function") {
                throw new Error("[Entitlement] Cannot authorize entitlement change: IdentityEngine is not available. Failing closed — no override applied.");
            }
            if (!actorUserId) throw new TypeError("[Entitlement] An authenticated actorUserId is required to change an entitlement override.");
            const orgScoped = identity.checkPermission(actorUserId, ADMIN_ROLE, { orgId: organizationId });
            const platformAdmin = typeof identity.isPlatformAdmin === "function" && identity.isPlatformAdmin(actorUserId);
            if (!orgScoped && !platformAdmin) {
                this.#diagnostics.unauthorizedAttempts++;
                throw new Error(`[Entitlement] Actor "${actorUserId}" does not hold "${ADMIN_ROLE}" for organization "${organizationId}" and is not a platform admin. Override change denied.`);
            }
            return true;
        }

        // ── Plan layer (delegates entirely to BillingEngine — read-only) ─
        /** #readPlanState() — real, honest read. Never fabricates plan data when BillingEngine is absent. */
        #readPlanState(feature) {
            const billing = window.CozyOS && window.CozyOS.Billing;
            if (!billing || typeof billing.getSubscriptionSnapshot !== "function") {
                return { restricted: false, planId: null, source: "DEFAULT", reason: "BillingEngine not connected; plan layer is not enforced for this feature." };
            }
            const snapshot = billing.getSubscriptionSnapshot();
            if (!snapshot || snapshot.isEnforcingActiveBilling === false) {
                return { restricted: false, planId: snapshot ? snapshot.planId : null, source: "DEFAULT", reason: "Subscription enforcement is currently disabled (Free/Evaluation Mode)." };
            }
            const licensed = typeof billing.isFeatureLicensed === "function" ? !!billing.isFeatureLicensed(feature) : true;
            return licensed
                ? { restricted: false, planId: snapshot.planId, source: "PLAN", reason: null }
                : { restricted: true, planId: snapshot.planId, source: "PLAN", reason: "NOT_INCLUDED_IN_SUBSCRIPTION" };
        }

        // ── The merge: plan -> admin override -> effective state ─────────
        /**
         * getEffectiveState(organizationId, feature)
         *   Real, explainable decision object. Order of precedence:
         *     1. REQUIRED — always wins, never overridable in either direction.
         *     2. Plan restriction — final; an admin override can never
         *        re-enable a feature the plan itself excludes.
         *     3. Administrator override (MUTED/ADMIN_DISABLED) — narrows
         *        an otherwise plan-permitted feature.
         *     4. ENABLED — the honest default when nothing restricts it.
         */
        getEffectiveState(organizationId, feature) {
            sanitizeKey(organizationId, "organizationId");
            sanitizeKey(feature, "feature");
            const evaluatedAt = new Date().toISOString();

            if (this.isRequiredFeature(feature)) {
                return Object.freeze({
                    feature, organizationId, enabled: true, state: STATES.REQUIRED,
                    source: "SYSTEM", reason: "This feature is required by the application and cannot be muted or restricted.",
                    planId: null, overrideId: null, evaluatedAt
                });
            }

            const plan = this.#readPlanState(feature);
            if (plan.restricted) {
                return Object.freeze({
                    feature, organizationId, enabled: false, state: STATES.PLAN_RESTRICTED,
                    source: "PLAN", reason: plan.reason, planId: plan.planId, overrideId: null, evaluatedAt
                });
            }

            const override = this.#overrides.get(this.#overrideKey(organizationId, feature));
            if (override) {
                return Object.freeze({
                    feature, organizationId, enabled: false, state: override.state,
                    source: "ADMIN_OVERRIDE", reason: override.reason, planId: plan.planId,
                    overrideId: override.overrideId, evaluatedAt
                });
            }

            return Object.freeze({
                feature, organizationId, enabled: true, state: STATES.ENABLED,
                source: plan.source, reason: plan.reason, planId: plan.planId, overrideId: null, evaluatedAt
            });
        }

        /** isFeatureEnabled(organizationId, feature) — real convenience boolean over getEffectiveState(). */
        isFeatureEnabled(organizationId, feature) { return this.getEffectiveState(organizationId, feature).enabled; }

        /**
         * guard(organizationId, feature)
         *   The real service-boundary enforcement point. Callers place
         *   this at the top of any receipts/reports/exports/etc. code
         *   path — never rely on UI hiding alone. Throws
         *   EntitlementDeniedError (carrying the full explainable
         *   decision) if the feature is not enabled; returns the
         *   decision object on success so callers can also inspect it.
         */
        guard(organizationId, feature) {
            this.#diagnostics.guardChecks++;
            const decision = this.getEffectiveState(organizationId, feature);
            if (!decision.enabled) {
                this.#diagnostics.guardDenials++;
                this.emit("entitlement:guard-denied", decision);
                throw new EntitlementDeniedError(decision);
            }
            return decision;
        }

        // ── Administrator override mutation ──────────────────────────────
        /**
         * setAdminOverride({ actorUserId, organizationId, feature, state, reason })
         *   state must be MUTED or ADMIN_DISABLED. Fails closed if
         *   IdentityEngine is unavailable or the actor lacks authority.
         *   Rejects outright for a REQUIRED feature. Fully auditable:
         *   records actor, organization, feature, previous state, new
         *   state, reason, timestamp — and emits through
         *   PlatformEventBus (best-effort) so the rest of the platform
         *   can react.
         */
        setAdminOverride({ actorUserId, organizationId, feature, state, reason = null } = {}) {
            sanitizeKey(organizationId, "organizationId");
            sanitizeKey(feature, "feature");
            if (!OVERRIDE_STATES.includes(state)) throw new TypeError(`[Entitlement] setAdminOverride(): state must be one of ${OVERRIDE_STATES.join(", ")}.`);
            if (this.isRequiredFeature(feature)) throw new Error(`[Entitlement] "${feature}" is a required feature and cannot be muted or disabled.`);

            this.#authorizeOverrideChange(actorUserId, organizationId);

            const key = this.#overrideKey(organizationId, feature);
            const previous = this.#overrides.get(key) || null;
            const overrideId = previous ? previous.overrideId : this.#generateId("ovr");
            const record = Object.freeze({ overrideId, organizationId, feature, state, reason, actorUserId, setAt: new Date().toISOString() });
            this.#overrides.set(key, record);
            this.#diagnostics.overridesSet++;

            this.#logAudit("ADMIN_OVERRIDE_SET", {
                actorUserId, organizationId, feature,
                previousState: previous ? previous.state : null,
                newState: state, reason, overrideId
            });

            const decision = this.getEffectiveState(organizationId, feature);
            this.emit("entitlement:override-set", decision);
            return decision;
        }

        /** clearAdminOverride() — removes the administrator override; effective state falls back to whatever the plan layer honestly reports (never magically re-enables a plan-restricted feature — see getEffectiveState()). */
        clearAdminOverride({ actorUserId, organizationId, feature, reason = null } = {}) {
            sanitizeKey(organizationId, "organizationId");
            sanitizeKey(feature, "feature");
            this.#authorizeOverrideChange(actorUserId, organizationId);

            const key = this.#overrideKey(organizationId, feature);
            const previous = this.#overrides.get(key) || null;
            const removed = this.#overrides.delete(key);
            if (removed) {
                this.#diagnostics.overridesCleared++;
                this.#logAudit("ADMIN_OVERRIDE_CLEARED", {
                    actorUserId, organizationId, feature,
                    previousState: previous ? previous.state : null,
                    newState: null, reason, overrideId: previous ? previous.overrideId : null
                });
            }

            const decision = this.getEffectiveState(organizationId, feature);
            this.emit("entitlement:override-cleared", decision);
            return decision;
        }

        /** getAdminOverride(organizationId, feature) — real, organization-scoped read; never leaks another organization's override data. */
        getAdminOverride(organizationId, feature) {
            sanitizeKey(organizationId, "organizationId");
            sanitizeKey(feature, "feature");
            const record = this.#overrides.get(this.#overrideKey(organizationId, feature));
            return record ? this.#deepClone(record) : null;
        }

        /** listOrganizationOverrides(organizationId) — real, organization-scoped listing, for an admin panel showing every feature's current override at once. */
        listOrganizationOverrides(organizationId) {
            sanitizeKey(organizationId, "organizationId");
            const prefix = `${organizationId}::`;
            const out = [];
            for (const [key, record] of this.#overrides.entries()) {
                if (key.startsWith(prefix)) out.push(this.#deepClone(record));
            }
            return out;
        }

        // ── Diagnostics / snapshot (matches existing coordinator convention) ─
        isVersionCompatible(v) { const a = /^v?(\d+)\./.exec(ENTITLEMENT_VERSION), b = /^v?(\d+)\./.exec(String(v || "")); return !!(a && b && a[1] === b[1]); }
        getDiagnosticsReport() { return this.#deepClone({ moduleVersion: ENTITLEMENT_VERSION, ...this.#diagnostics, overrideCount: this.#overrides.size, requiredFeatureCount: this.#requiredFeatures.size }); }
    }

    window.CozyOS.EntitlementDeniedError = EntitlementDeniedError;
    window.CozyOS.EntitlementStates = STATES;

    if (window.CozyOS.Entitlement?.getVersion) {
        if (window.CozyOS.Entitlement.getVersion() !== ENTITLEMENT_VERSION) throw new Error("[CozyOS Framework Execution Error] VERSION_CONFLICT: EntitlementEngine.");
        return;
    }
    window.CozyOS.Entitlement = new CozyOSEntitlementEngine();

    (function reg(d) {
        function attempt() { if (typeof window.CozyOS.registerCoordinator !== "function") return false; try { window.CozyOS.registerCoordinator(d); } catch (_e) { /* non-fatal */ } return true; }
        if (attempt()) return;
        if (!Object.prototype.hasOwnProperty.call(window.CozyOS, "__pendingCoordinatorRegistrations")) Object.defineProperty(window.CozyOS, "__pendingCoordinatorRegistrations", { value: [], writable: true, enumerable: false, configurable: true });
        window.CozyOS.__pendingCoordinatorRegistrations.push(d);
        let n = 0; const iv = setInterval(() => { n++; if (attempt() || n >= 200) clearInterval(iv); }, 250);
    })({
        sourcePath: "core/modules/entitlement/entitlement-engine.js",
        name: "EntitlementEngine", category: "Foundation", icon: "entitlement.svg",
        description: "Merges BillingEngine's plan truth with administrator overrides into one explainable, organization-scoped effective feature state, plus a fail-closed service-boundary guard()."
    });
})();
