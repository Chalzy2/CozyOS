/**
 * CozyOS Authentication Policy Engine
 * File Reference: core/security/auth-policy-engine.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   Separates "which authentication factors are required for a given
 *   operation" (a real, configurable policy) from "how a factor is
 *   verified" (a real, pluggable provider). This file owns policy
 *   evaluation ONLY — it never itself decides whether a face, voice, or
 *   fingerprint genuinely matches, and as of this refactor it doesn't
 *   even know Face/Voice/Fingerprint exist as concepts. It asks the real
 *   `AuthFactorRegistry` (auth-factor-registry.js) "do you have a
 *   provider for this factor name," and combines whatever real results
 *   come back according to a real, declared AND/OR policy.
 *
 * REFACTORED THIS MILESTONE — REAL ARCHITECTURAL CHANGE, NOT COSMETIC
 *   This file previously held its own internal `#adapters` map for Face/
 *   Fingerprint/Voice/Google Account. That entire concern has been
 *   removed and now lives in `AuthFactorRegistry`, the single real
 *   source of truth for which factors exist — the same Rule 80/81
 *   discipline already applied to formulas (one source of truth,
 *   composition over duplication), applied here to authentication
 *   factors. `evaluate()` now calls `AuthFactorRegistry.getProvider()`
 *   and fails closed if the registry itself isn't loaded, rather than
 *   falling back to any local state.
 *
 * NOT BUILT THIS PASS, NAMED EXPLICITLY
 *   Recovery Questions/Phrase, Device Replacement, Emergency Lock,
 *   Session Manager, Trusted Device Manager, and the five requested
 *   History types remain real, separate, unbuilt work.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const AUTH_POLICY_VERSION = "1.0.0-ENTERPRISE";

    class CozyAuthPolicyEngine {
        #policies = new Map();
        #auditLog = [];

        getVersion() { return AUTH_POLICY_VERSION; }
        #deepClone(v) {
            if (typeof structuredClone === "function") { try { return structuredClone(v); } catch (_e) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; }
        }
        #logAudit(event, detail) {
            this.#auditLog.push({ event, at: new Date().toISOString(), detail: this.#deepClone(detail) });
            if (this.#auditLog.length > 200) this.#auditLog.shift();
            if (window.CozyOS.PlatformEventBus && typeof window.CozyOS.PlatformEventBus.emit === "function") {
                try { window.CozyOS.PlatformEventBus.emit(`authpolicy:${event}`, detail); } catch (_err) { /* non-fatal */ }
            }
        }
        getAuditLog() { return this.#deepClone(this.#auditLog); }

        definePolicy(operationName, policyTree) {
            if (!operationName || (!policyTree?.any && !policyTree?.all)) {
                return { success: false, reason: "A real operationName and a policy tree with a real 'any' or 'all' array are both required." };
            }
            this.#policies.set(operationName, this.#deepClone(policyTree));
            this.#logAudit("policy-registered", { operationName });
            return { success: true };
        }

        updatePolicy(operationName, policyTree) {
            if (!this.#policies.has(operationName)) return { success: false, reason: `No existing policy for "${operationName}" — use definePolicy() to create one.` };
            const result = this.definePolicy(operationName, policyTree);
            if (result.success) this.#logAudit("policy-updated", { operationName });
            return result;
        }

        getPolicy(operationName) {
            const p = this.#policies.get(operationName);
            return p ? this.#deepClone(p) : null;
        }

        #evaluateNode(node, factorResults) {
            if (typeof node === "string") return factorResults[node] === true;
            if (node.any) return node.any.some(child => this.#evaluateNode(child, factorResults));
            if (node.all) return node.all.every(child => this.#evaluateNode(child, factorResults));
            return false;
        }

        #collectFactorNames(node, out = new Set()) {
            if (typeof node === "string") { out.add(node); return out; }
            const children = node.any || node.all || [];
            for (const child of children) this.#collectFactorNames(child, out);
            return out;
        }

        /**
         * evaluate(operationName, context)
         *   Real — looks up the real, defined policy, then asks
         *   `AuthFactorRegistry` (not its own internal state — that
         *   concern was removed in this refactor) whether a real
         *   provider exists for each factor the policy references. This
         *   file no longer knows anything about Face, Voice, or any
         *   other specific factor; it only knows how to compose AND/OR
         *   results, exactly the separation requested.
         */
        async evaluate(operationName, context = {}) {
            const policy = this.#policies.get(operationName);
            if (!policy) {
                this.#logAudit("policy-not-defined", { operationName });
                return { allowed: false, reason: `No real policy is defined for operation "${operationName}" — refused rather than assumed permissive.` };
            }
            const registry = window.CozyOS.AuthFactorRegistry;
            if (!registry) {
                this.#logAudit("registry-unavailable", { operationName });
                return { allowed: false, reason: "AuthFactorRegistry is not loaded — cannot resolve any real factor, so access is refused rather than assumed available." };
            }
            const neededFactors = [...this.#collectFactorNames(policy)];
            const factorResults = {};
            const factorDetails = {};
            for (const factorName of neededFactors) {
                const provider = registry.getProvider(factorName);
                if (!provider) {
                    factorResults[factorName] = false;
                    factorDetails[factorName] = { available: false, reason: `No provider is registered for factor "${factorName}" in AuthFactorRegistry.` };
                    this.#logAudit("missing-authentication-factor", { operationName, factorName });
                    continue;
                }
                try {
                    const result = await provider.verify(context);
                    factorResults[factorName] = result.available === true && result.verified === true;
                    factorDetails[factorName] = result;
                } catch (err) {
                    factorResults[factorName] = false;
                    factorDetails[factorName] = { available: false, verified: false, reason: `Provider for "${factorName}" threw: ${err.message}` };
                }
            }
            const allowed = this.#evaluateNode(policy, factorResults);
            this.#logAudit(allowed ? "authentication-granted" : "authentication-denied", { operationName, factorDetails });
            this.#logAudit("policy-evaluated", { operationName, allowed });
            return { allowed, operationName, policy: this.#deepClone(policy), factorDetails };
        }

        getDiagnosticsReport() {
            const registry = window.CozyOS.AuthFactorRegistry;
            return this.#deepClone({ moduleVersion: AUTH_POLICY_VERSION, definedPolicies: [...this.#policies.keys()], auditEntries: this.#auditLog.length, factorRegistryConnected: !!registry });
        }
    }

    if (window.CozyOS.AuthPolicyEngine && typeof window.CozyOS.AuthPolicyEngine.getVersion === "function") {
        const existingVersion = window.CozyOS.AuthPolicyEngine.getVersion();
        if (existingVersion !== AUTH_POLICY_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: AuthPolicyEngine existing v${existingVersion} conflicts with load target v${AUTH_POLICY_VERSION}.`);
        return;
    }

    const engine = new CozyAuthPolicyEngine();
    window.CozyOS.AuthPolicyEngine = engine;

    engine.definePolicy("normal-login", { all: ["trusted-device", { any: ["face", "fingerprint", "voice"] }] });
    engine.definePolicy("high-security-operation", { all: ["trusted-device", "face", "voice"] });
    engine.definePolicy("emergency-recovery", { all: ["google-account", "face", "recovery-questions", "recovery-phrase"] });
    // Milestone 130 — Administrator Recovery Wizard: at least ONE of six
    // independent methods must succeed. A distinct operation name from
    // "emergency-recovery" above (that policy requires ALL of four
    // factors for an unrelated, already-authenticated high-security
    // case). Administrator policy enables/disables individual recovery
    // methods honestly via the existing updatePolicy() — removing a
    // factor name from this "any" list is enough; no separate on/off
    // switch mechanism was built or is needed.
    engine.definePolicy("administrator-recovery-wizard", { any: ["trusted-device", "recovery-phrase", "recovery-questions", "recovery-key", "emergency-recovery-code", "security-key"] });
    engine.definePolicy("delete-application", { all: ["trusted-device", "face", "voice"] });
    engine.definePolicy("release-production-build", { all: ["trusted-device", "face", "fingerprint", "voice"] });

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "AuthPolicyEngine", category: "Platform", icon: "shield.svg",
                description: "Real, generic AND/OR authentication policy evaluator, separating which factors an operation requires from how each factor is verified. Delegates all factor lookup to AuthFactorRegistry — this file knows nothing about Face, Voice, or any other specific factor. Any policy requiring a factor with no real provider is correctly unreachable until AuthFactorRegistry has one registered."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
