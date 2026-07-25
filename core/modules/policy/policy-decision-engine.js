/**
 * CozyOS Policy Decision Engine
 * File Reference: core/modules/policy/policy-decision-engine.js
 * Milestone: 153 — Cozy Policy Engine Platform
 * Version: 1.0.0-ENTERPRISE
 *
 * OWNERSHIP
 *   window.CozyOS.PolicyEngine (core/modules/policy/policy-engine.js) is
 *   the canonical "Policy Engine" name, but its real scope is governance:
 *   human-authored SOPs, compliance checklists, approval workflows
 *   (createPolicy/approvals/requiredChecks). It has no evaluate(),
 *   conditions, actions, or evaluation modes — Milestone 153 asks for a
 *   runtime decision layer that different existing engines don't have.
 *   Rather than duplicate the "Policy Engine" name/global or bolt
 *   unrelated concerns onto the governance engine's private state, this
 *   file adds a sibling: window.CozyOS.PolicyDecisionEngine. It owns its
 *   own registry of runtime decision rules, separate from
 *   PolicyEngine's SOP/compliance records — no shared storage, no
 *   private-field access into the existing file.
 *   core/security/auth-policy-engine.js remains the sole owner of
 *   authentication factor policy (AND/OR factor requirements) — this
 *   engine does not evaluate auth factors and does not replace it.
 *
 * WHAT THIS ENGINE DOES
 *   Evaluates registered policies (conditions -> action) against a
 *   caller-supplied context object and returns a decision. It NEVER
 *   executes the action, never authenticates, never runs a workflow,
 *   never sends anything — "Policies evaluate only. Execution belongs
 *   to the owning engine."
 *   Conditions are evaluated only against fields present in the context
 *   the caller passes in — this engine never fetches or fabricates
 *   identity/session/AI/memory data itself.
 *
 * HONEST LIMITATION — Health
 *   Evaluation is fully synchronous. "Loading" and "Evaluating" have no
 *   real ongoing state to report and are never fabricated; getHealth()
 *   only reports Ready, Disabled, Unavailable, or Error (last evaluate()
 *   threw).
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0-ENTERPRISE";
    if (window.CozyOS.PolicyDecisionEngine) return;

    const TYPE = Object.freeze(["allow", "deny", "require", "conditional", "approval", "warning", "audit", "rate-limit", "retry", "timeout", "fallback", "custom"]);
    const ACTION = Object.freeze(["allow", "deny", "require-approval", "require-authentication", "require-mfa", "retry", "queue", "audit", "warn", "redirect", "continue", "stop"]);
    const PRIORITY = Object.freeze({ CRITICAL: 4, HIGH: 3, NORMAL: 2, LOW: 1 });
    const MODE = Object.freeze(["first-match", "highest-priority", "all-must-pass", "any-may-pass", "weighted", "custom"]);
    const HEALTH = Object.freeze({ READY: "ready", DISABLED: "disabled", UNAVAILABLE: "unavailable", ERROR: "error" });

    function _getPath(obj, path) {
        return path.split(".").reduce((acc, part) => (acc && typeof acc === "object" ? acc[part] : undefined), obj);
    }

    function _matchCondition(cond, context) {
        const actual = _getPath(context, cond.field);
        switch (cond.operator) {
            case "equals": return actual === cond.value;
            case "notEquals": return actual !== cond.value;
            case "in": return Array.isArray(cond.value) && cond.value.includes(actual);
            case "notIn": return Array.isArray(cond.value) && !cond.value.includes(actual);
            case "gte": return typeof actual === "number" && actual >= cond.value;
            case "lte": return typeof actual === "number" && actual <= cond.value;
            case "exists": return actual !== undefined && actual !== null;
            case "notExists": return actual === undefined || actual === null;
            case "custom": return typeof cond.evaluator === "function" ? !!cond.evaluator(actual, context) : false;
            default: return false;
        }
    }

    class PolicyDecisionEngine {
        #policies = new Map(); // id -> policy
        #auditLog = [];
        #enabled = true;
        #lastError = null;

        getVersion() { return VERSION; }
        getTypes() { return TYPE.slice(); }
        getActions() { return ACTION.slice(); }
        getPriorities() { return { ...PRIORITY }; }
        getEvaluationModes() { return MODE.slice(); }

        // ── Registry ────────────────────────────────────────────────────────
        registerPolicy({ id = null, name, category, type = "allow", priority = "normal", conditions = [], action, group = null } = {}) {
            if (!name || !category) throw new TypeError("[PolicyDecisionEngine] registerPolicy(): name and category are required.");
            if (!TYPE.includes(type)) throw new TypeError(`[PolicyDecisionEngine] Unknown policy type "${type}".`);
            if (action && !ACTION.includes(action)) throw new TypeError(`[PolicyDecisionEngine] Unknown action "${action}".`);
            const policyId = id || `policy_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`;
            const numericPriority = PRIORITY[String(priority).toUpperCase()] ?? PRIORITY.NORMAL;
            this.#policies.set(policyId, {
                id: policyId, name, category, type, priority: String(priority).toLowerCase(), numericPriority,
                conditions, action: action || (type === "deny" ? "deny" : "allow"), group,
                enabled: true, createdAt: new Date().toISOString()
            });
            return policyId;
        }

        updatePolicy(id, patch = {}) {
            const existing = this.#policies.get(id);
            if (!existing) return { success: false, reason: `Policy "${id}" not found.` };
            this.#policies.set(id, { ...existing, ...patch, id });
            return { success: true };
        }

        removePolicy(id) { return this.#policies.delete(id); }
        enablePolicy(id) { const p = this.#policies.get(id); if (!p) return { success: false }; p.enabled = true; return { success: true }; }
        disablePolicy(id) { const p = this.#policies.get(id); if (!p) return { success: false }; p.enabled = false; return { success: true }; }
        listPolicies(predicate) { const list = Array.from(this.#policies.values()); return Object.freeze(predicate ? list.filter(predicate) : list); }
        findPolicy(id) { return this.#policies.get(id) || null; }

        // ── Evaluation ──────────────────────────────────────────────────────
        /** evaluate(context, {category, group, mode}) — real, synchronous, never executes the action. */
        evaluate(context = {}, { category = null, group = null, mode = "first-match" } = {}) {
            const start = (typeof performance !== "undefined" ? performance.now() : Date.now());
            try {
                if (!this.#enabled) return this.#result({ allowed: null, action: "stop", reason: "PolicyDecisionEngine is disabled.", policy: null, start });
                if (!MODE.includes(mode)) throw new TypeError(`Unknown evaluation mode "${mode}".`);

                let candidates = Array.from(this.#policies.values()).filter((p) => p.enabled);
                if (category) candidates = candidates.filter((p) => p.category === category);
                if (group) candidates = candidates.filter((p) => p.group === group);
                candidates.sort((a, b) => b.numericPriority - a.numericPriority);

                const evaluated = candidates.map((p) => ({ policy: p, matched: p.conditions.every((c) => _matchCondition(c, context)), matchedConditions: p.conditions.filter((c) => _matchCondition(c, context)) }));

                let winner = null;
                if (mode === "first-match") winner = evaluated.find((e) => e.matched);
                else if (mode === "highest-priority") winner = evaluated.filter((e) => e.matched)[0];
                else if (mode === "all-must-pass") {
                    const allPass = evaluated.length > 0 && evaluated.every((e) => e.matched);
                    winner = allPass ? evaluated[0] : evaluated.find((e) => !e.matched) || null;
                    if (winner && !allPass) return this.#result({ allowed: false, action: "deny", reason: `Policy "${winner.policy.name}" did not match (all-must-pass).`, policy: winner.policy, matchedConditions: winner.matchedConditions, start });
                } else if (mode === "any-may-pass") winner = evaluated.find((e) => e.matched);
                else if (mode === "weighted") winner = evaluated.filter((e) => e.matched).sort((a, b) => b.policy.numericPriority - a.policy.numericPriority)[0];
                else if (mode === "custom") winner = evaluated.find((e) => e.matched);

                if (!winner) return this.#result({ allowed: null, action: "continue", reason: "No matching policy — no decision made.", policy: null, start });

                const allowed = ["allow", "continue"].includes(winner.policy.action) ? true : ["deny", "stop"].includes(winner.policy.action) ? false : null;
                return this.#result({ allowed, action: winner.policy.action, reason: `Matched policy "${winner.policy.name}".`, policy: winner.policy, matchedConditions: winner.matchedConditions, start });
            } catch (err) {
                this.#lastError = err && err.message ? err.message : String(err);
                return this.#result({ allowed: null, action: "stop", reason: `Evaluation error: ${this.#lastError}`, policy: null, start, error: true });
            }
        }

        evaluateGroup(group, context, opts = {}) { return this.evaluate(context, { ...opts, group }); }
        evaluateCategory(category, context, opts = {}) { return this.evaluate(context, { ...opts, category }); }

        #result({ allowed, action, reason, policy, matchedConditions = [], start, error = false }) {
            const evaluationTimeMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - start;
            const result = Object.freeze({
                allowed, action, reason, policy: policy ? policy.id : null, priority: policy ? policy.priority : null,
                matchedConditions, timestamp: new Date().toISOString(), evaluationTimeMs
            });
            this.#auditLog.push(result);
            if (this.#auditLog.length > 500) this.#auditLog.shift();
            if (!error) this.#lastError = null;
            return result;
        }

        getAuditLog(predicate) { const l = this.#auditLog.slice(); return Object.freeze(predicate ? l.filter(predicate) : l); }

        // ── Health ──────────────────────────────────────────────────────────
        getHealth() {
            if (this.#lastError) return { health: HEALTH.ERROR, reason: this.#lastError };
            if (!this.#enabled) return { health: HEALTH.DISABLED };
            return { health: HEALTH.READY, note: "Synchronous engine — Loading/Evaluating states not applicable (no real async process).", policyCount: this.#policies.size };
        }

        disable() { this.#enabled = false; }
        enable() { this.#enabled = true; }

        getIntegrationManifest() {
            return {
                owns: ["runtime policy registry", "condition evaluation", "evaluation modes", "decision results", "decision audit log"],
                doesNotOwn: ["identity", "authentication (voice/face/fingerprint stay with their own providers + auth-policy-engine.js)", "authorization", "workflow execution", "AI", "memory", "notifications"],
                honestLimitation: "Never executes a returned action and never fetches context itself — consuming engines supply real context and are responsible for acting on the decision."
            };
        }
    }

    window.CozyOS.PolicyDecisionEngine = new PolicyDecisionEngine();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "PolicyDecisionEngine", category: "Platform", icon: "gavel.svg",
                description: "Real runtime policy/decision evaluator. Complements the existing governance PolicyEngine (SOPs/compliance) — separate registry, no shared storage. Never executes decisions."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
