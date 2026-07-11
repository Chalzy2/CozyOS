/**
 * CozyOS Enterprise Framework — CozyAIMode
 * File Reference: core/modules/aimode/cozy-ai-mode.js
 * Layer: Core / Code Generation — AI Provider Gateway
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   The single, platform-wide source of truth for which AI mode is
 *   currently active, and the one gateway any coordinator (CozyBuilder,
 *   CozyBugFixer, future ones) goes through if it wants optional AI
 *   assistance. Every mode except a real provider works with zero network
 *   calls; OFFLINE_ONLY and RULES_ONLY are structurally incapable of
 *   reaching outside this process, not just configured not to.
 *
 * WHAT THIS MODULE DOES NOT DO (Zero Logic Rule)
 *   - Ships with NO real provider wired in. Claude/Gemini/GPT/Local AI/
 *     Custom are real, selectable modes, but calling any of them requires
 *     a developer to register a real adapter function via
 *     registerProvider() — this file makes zero network requests itself,
 *     in any mode, ever.
 *   - Does not execute, evaluate, or import anything a provider returns.
 *     A provider's result is treated as plain data, passed back to the
 *     caller (BuilderAI/BugFixer), which applies its OWN existing safety
 *     gates before doing anything with it — this module doesn't weaken
 *     those gates or bypass them.
 *   - Does not guarantee secret redaction. redactText() is the same
 *     best-effort, known-pattern scan used elsewhere in this project —
 *     documented as non-exhaustive everywhere it's used, never called a
 *     guarantee.
 *   - Does not persist the selected mode or registered providers across a
 *     reload — mode selection is a runtime/session concern; a host
 *     dashboard can layer its own persistence (e.g. localStorage) on top
 *     of getMode()/setMode() if it wants that.
 *
 * OPTIONAL INTEGRATIONS
 *   BuilderAI    — calls requestAssistance("plan-build", ...) if this is
 *                  connected, before falling back to its own heuristic.
 *   BugFixer     — calls requestAssistance("repair", ...) if this is
 *                  connected and useAI is requested, before falling back
 *                  to its own deterministic fixer map.
 *   ServiceRegistry — registerCoordinator(), if present.
 */

(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const AIMODE_VERSION = "1.0.0-ENTERPRISE";

    // OFFLINE_ONLY and RULES_ONLY are structural — no provider can ever be
    // registered against them, so requestAssistance() can never reach a
    // network call while either is selected, regardless of what's
    // registered for other modes.
    const OFFLINE_MODES = Object.freeze(["OFFLINE_ONLY", "RULES_ONLY"]);
    const PROVIDER_MODES = Object.freeze(["LOCAL_AI", "CLAUDE", "GEMINI", "GPT", "CUSTOM"]);
    const ALL_MODES = Object.freeze([...OFFLINE_MODES, ...PROVIDER_MODES]);
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    // Trust classifications a provider registration is assigned — a
    // SEPARATE axis from mode selection (mode = which adapter to call;
    // trust policy = how much this coordinator and its callers are allowed
    // to do with what that adapter returns). LOCAL_AI's policy is fixed
    // (never caller-chosen) since it's a structural property of running
    // locally, not a trust judgment about a specific provider.
    const TRUST_POLICY_NAMES = Object.freeze(["OFFLINE_ONLY", "RULES_ONLY", "LOCAL_AI", "TRUSTED_PROVIDER", "UNTRUSTED_PROVIDER", "EXPERIMENTAL_PROVIDER"]);
    const ASSIGNABLE_TRUST_POLICIES = Object.freeze(["TRUSTED_PROVIDER", "UNTRUSTED_PROVIDER", "EXPERIMENTAL_PROVIDER"]);

    const TRUST_POLICIES = Object.freeze({
        OFFLINE_ONLY: Object.freeze({
            networkAllowed: false, autoApplyAllowed: false, confirmationRequired: false, mustPassCertification: false,
            description: "No provider is ever consulted — this policy exists only for symmetry with the other five; it's never actually applied to a request, since isOfflineMode() already refuses to reach a provider in this mode."
        }),
        RULES_ONLY: Object.freeze({
            networkAllowed: false, autoApplyAllowed: false, confirmationRequired: false, mustPassCertification: false,
            description: "Same as OFFLINE_ONLY — deterministic rules/templates only, never a provider."
        }),
        LOCAL_AI: Object.freeze({
            networkAllowed: true, autoApplyAllowed: true, confirmationRequired: true, mustPassCertification: true,
            description: "A local model server — no data leaves the machine, but its output is still an AI guess: still requires confirmation and still must pass Quick Certification before acceptance."
        }),
        TRUSTED_PROVIDER: Object.freeze({
            networkAllowed: true, autoApplyAllowed: true, confirmationRequired: false, mustPassCertification: true,
            description: "A provider the developer has explicitly vetted. Auto-apply is permitted (still subject to CozyBugFixer's own Auto Repair session scoping) and no extra confirmation beyond the normal approve step — but Quick Certification is never skipped, for any tier."
        }),
        UNTRUSTED_PROVIDER: Object.freeze({
            networkAllowed: true, autoApplyAllowed: false, confirmationRequired: true, mustPassCertification: true,
            description: "An unvetted or third-party provider. Output is always preview-only — auto-apply is refused regardless of Auto Repair settings — and an explicit, separate acknowledgement is required before saving."
        }),
        EXPERIMENTAL_PROVIDER: Object.freeze({
            networkAllowed: true, autoApplyAllowed: false, confirmationRequired: true, mustPassCertification: true,
            description: "A provider being evaluated (new model, beta integration, etc.). Same restrictions as UNTRUSTED_PROVIDER — the distinction is informational (why it's restricted), the enforcement is identical."
        })
    });

    // Same best-effort, non-exhaustive secret-shape scan used in
    // CozyBugFixer — centralized here so both it and BuilderAI (and any
    // future coordinator) share one implementation instead of drifting.
    const SECRET_SHAPE_PATTERNS = Object.freeze([
        /sk-[A-Za-z0-9]{20,}/g,
        /[A-Za-z0-9_-]{32,}/g,
        /-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----/g,
        /(password|passwd|secret|api[_-]?key|token)\s*[:=]\s*["'][^"']{6,}["']/gi
    ]);

    function redactText(text) {
        let redacted = String(text || "");
        let redactionCount = 0;
        for (const pattern of SECRET_SHAPE_PATTERNS) {
            redacted = redacted.replace(pattern, () => { redactionCount++; return "[REDACTED-BY-COZYAIMODE]"; });
        }
        return { redacted, redactionCount };
    }

    class CozyOSAIModeGateway {
        #activeMode = "OFFLINE_ONLY";
        #providers = new Map(); // mode -> adapterFn
        #providerTrustPolicies = new Map(); // mode -> trust policy name
        #auditLogs = [];
        #listeners = new Map();
        #onceWrapped = new Map();

        #diagnostics = {
            modeChanges: 0, assistanceRequests: 0, assistanceHandled: 0, assistanceFellBack: 0,
            redactionsPerformed: 0, providerErrors: 0, errorsHidden: 0, eventsEmitted: 0, memoryBaseline: 4.6
        };

        getVersion() { return AIMODE_VERSION; }

        #deepClone(value) {
            if (typeof structuredClone === "function") {
                try { return structuredClone(value); } catch (_err) { /* fall through */ }
            }
            try { return JSON.parse(JSON.stringify(value)); } catch (_err) { return value; }
        }

        // Not used for rendering today — carried for consistency with every
        // other CozyOS coordinator, in case a future dashboard displaying
        // provider names/task text ever needs it.
        #escapeHtml(value) {
            const str = String(value === undefined || value === null ? "" : value);
            return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
        }

        #logAudit(action, msg) {
            this.#auditLogs.push(Object.freeze({ id: "aud_" + (crypto.randomUUID ? crypto.randomUUID() : Date.now()), timestamp: new Date().toISOString(), action, msg }));
            if (this.#auditLogs.length > 500) this.#auditLogs.shift();
        }

        getAuditLog(predicate) {
            const list = this.#auditLogs.map(e => ({ ...e }));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

        on(eventName, handler) {
            if (typeof eventName !== "string" || !eventName.trim()) throw new TypeError("[CozyAIMode] on(): eventName must be a non-empty string.");
            if (typeof handler !== "function") throw new TypeError("[CozyAIMode] on(): handler must be a function.");
            if (!this.#listeners.has(eventName)) this.#listeners.set(eventName, new Set());
            this.#listeners.get(eventName).add(handler);
            return () => this.off(eventName, handler);
        }

        off(eventName, handler) {
            const set = this.#listeners.get(eventName);
            if (!set) return false;
            const wrapped = this.#onceWrapped.get(handler);
            const removed = set.delete(handler) || (wrapped ? set.delete(wrapped) : false);
            if (set.size === 0) this.#listeners.delete(eventName);
            return removed;
        }

        once(eventName, handler) {
            if (typeof handler !== "function") throw new TypeError("[CozyAIMode] once(): handler must be a function.");
            const wrapper = (payload) => { this.off(eventName, handler); this.#onceWrapped.delete(handler); handler(payload); };
            this.#onceWrapped.set(handler, wrapper);
            this.on(eventName, wrapper);
        }

        emit(eventName, payload) {
            if (typeof eventName !== "string" || !eventName.trim()) { this.#diagnostics.errorsHidden++; return false; }
            const set = this.#listeners.get(eventName);
            this.#diagnostics.eventsEmitted++;
            if (!set || set.size === 0) return false;
            let safePayload = payload;
            try { safePayload = this.#deepClone(payload); } catch (_err) { safePayload = payload; }
            for (const fn of Array.from(set)) {
                try { fn(safePayload); } catch (_err) { this.#diagnostics.errorsHidden++; }
            }
            return true;
        }

        listModes() { return ALL_MODES.slice(); }
        isOfflineMode(mode = this.#activeMode) { return OFFLINE_MODES.includes(mode); }

        getMode() { return this.#activeMode; }

        setMode(mode) {
            if (!ALL_MODES.includes(mode)) throw new TypeError(`[CozyAIMode] setMode(): unknown mode "${mode}". Valid modes: ${ALL_MODES.join(", ")}.`);
            const previous = this.#activeMode;
            this.#activeMode = mode;
            this.#diagnostics.modeChanges++;
            this.#logAudit("MODE_CHANGED", `${previous} -> ${mode}`);
            this.emit("mode:changed", { previous, current: mode });
            return mode;
        }

        /**
         * registerProvider(mode, adapterFn, trustPolicy)
         *   adapterFn(task, payload) -> result (sync or Promise). Only
         *   PROVIDER_MODES accept a registration — OFFLINE_ONLY/RULES_ONLY
         *   structurally can never have one, by design, not by convention.
         *   trustPolicy: required for CLAUDE/GEMINI/GPT/CUSTOM — must be
         *   one of TRUSTED_PROVIDER/UNTRUSTED_PROVIDER/EXPERIMENTAL_PROVIDER.
         *   LOCAL_AI's policy is fixed to "LOCAL_AI" and cannot be
         *   overridden — running locally is a structural property, not a
         *   trust judgment the caller gets to relabel.
         */
        registerProvider(mode, adapterFn, trustPolicy) {
            if (!PROVIDER_MODES.includes(mode)) throw new TypeError(`[CozyAIMode] registerProvider(): "${mode}" cannot take a provider. Valid provider modes: ${PROVIDER_MODES.join(", ")}.`);
            if (typeof adapterFn !== "function") throw new TypeError("[CozyAIMode] registerProvider(): adapterFn must be a function.");
            let resolvedPolicy;
            if (mode === "LOCAL_AI") {
                resolvedPolicy = "LOCAL_AI";
            } else {
                if (!ASSIGNABLE_TRUST_POLICIES.includes(trustPolicy)) {
                    throw new TypeError(`[CozyAIMode] registerProvider(): mode "${mode}" requires an explicit trustPolicy — one of ${ASSIGNABLE_TRUST_POLICIES.join(", ")}.`);
                }
                resolvedPolicy = trustPolicy;
            }
            this.#providers.set(mode, adapterFn);
            this.#providerTrustPolicies.set(mode, resolvedPolicy);
            this.#logAudit("PROVIDER_REGISTERED", `Adapter registered for mode "${mode}" with trust policy "${resolvedPolicy}".`);
            this.emit("provider:registered", { mode, trustPolicy: resolvedPolicy });
        }

        unregisterProvider(mode) {
            const removed = this.#providers.delete(mode);
            this.#providerTrustPolicies.delete(mode);
            if (removed) this.#logAudit("PROVIDER_UNREGISTERED", `Adapter removed for mode "${mode}".`);
            return removed;
        }

        isProviderRegistered(mode) { return this.#providers.has(mode); }
        listRegisteredProviders() { return Array.from(this.#providers.keys()); }

        listTrustPolicyNames() { return TRUST_POLICY_NAMES.slice(); }

        /** getTrustPolicy(policyNameOrMode) — accepts either a trust-policy name directly, or a registered provider mode (resolves to that provider's assigned policy). */
        getTrustPolicy(policyNameOrMode) {
            if (TRUST_POLICIES[policyNameOrMode]) return { name: policyNameOrMode, ...TRUST_POLICIES[policyNameOrMode] };
            const assigned = this.#providerTrustPolicies.get(policyNameOrMode);
            if (assigned) return { name: assigned, ...TRUST_POLICIES[assigned] };
            if (OFFLINE_MODES.includes(policyNameOrMode)) return { name: policyNameOrMode, ...TRUST_POLICIES[policyNameOrMode] };
            return null;
        }

        redactText(text) { return redactText(text); }

        /**
         * requestAssistance(task, payload)
         *   The single gateway. Returns { handled, result?, reason?,
         *   provider? }. Callers (BuilderAI, BugFixer) MUST treat
         *   handled:false as "fall back to your own local logic" — this
         *   method never throws for a routine "no provider" case, only for
         *   a genuine programming error (bad task name).
         */
        async requestAssistance(task, payload) {
            if (typeof task !== "string" || !task.trim()) throw new TypeError("[CozyAIMode] requestAssistance(): task is required.");
            this.#diagnostics.assistanceRequests++;

            if (this.isOfflineMode()) {
                this.#diagnostics.assistanceFellBack++;
                return { handled: false, reason: `AI mode is "${this.#activeMode}" — no provider is ever consulted in this mode.` };
            }
            const adapter = this.#providers.get(this.#activeMode);
            if (!adapter) {
                this.#diagnostics.assistanceFellBack++;
                return { handled: false, reason: `No adapter registered for mode "${this.#activeMode}".` };
            }

            let redactedPayload = payload;
            let redactionCount = 0;
            if (payload && typeof payload === "object") {
                redactedPayload = {};
                for (const [key, value] of Object.entries(payload)) {
                    if (FORBIDDEN_KEYS.has(key)) continue;
                    if (typeof value === "string") {
                        const { redacted, redactionCount: count } = redactText(value);
                        redactedPayload[key] = redacted;
                        redactionCount += count;
                    } else {
                        redactedPayload[key] = value;
                    }
                }
            }
            this.#diagnostics.redactionsPerformed += redactionCount;

            try {
                const result = await adapter(task, redactedPayload);
                this.#diagnostics.assistanceHandled++;
                this.#logAudit("ASSISTANCE_HANDLED", `Task "${task}" handled by mode "${this.#activeMode}" (${redactionCount} redaction(s)).`);
                this.emit("assistance:handled", { task, mode: this.#activeMode, redactionCount });
                return { handled: true, result, provider: this.#activeMode, policy: this.getTrustPolicy(this.#activeMode), redactionCount };
            } catch (err) {
                this.#diagnostics.providerErrors++;
                this.#diagnostics.assistanceFellBack++;
                this.#logAudit("ASSISTANCE_FAILED", `Task "${task}" via mode "${this.#activeMode}" threw: ${err.message}`);
                return { handled: false, reason: `Provider for mode "${this.#activeMode}" failed: ${err.message}` };
            }
        }

        isVersionCompatible(version) {
            const a = /^v?(\d+)\./.exec(String(AIMODE_VERSION));
            const b = /^v?(\d+)\./.exec(String(version || ""));
            if (!a || !b) return false;
            return a[1] === b[1];
        }

        getDiagnosticsReport() {
            return Object.freeze({
                moduleVersion: AIMODE_VERSION,
                ...this.#diagnostics,
                activeMode: this.#activeMode,
                offlineActive: this.isOfflineMode(),
                activePolicy: this.getTrustPolicy(this.#activeMode),
                registeredProviders: this.listRegisteredProviders(),
                providerTrustClassifications: Object.fromEntries(this.#providerTrustPolicies),
                dependencies: [],
                integrationCount: [window.CozyOS.BuilderAI, window.CozyOS.BugFixer].filter(Boolean).length,
                auditLogCount: this.#auditLogs.length
            });
        }

        exportSnapshot() {
            // Only the mode and WHICH provider names were registered —
            // never the adapter functions themselves (not serializable,
            // and re-registering a real adapter after reload is the
            // correct/expected flow, not something to silently restore).
            return this.#deepClone({
                version: AIMODE_VERSION,
                exportedAt: new Date().toISOString(),
                activeMode: this.#activeMode,
                registeredProviderModes: this.listRegisteredProviders()
            });
        }

        importSnapshot(snapshot) {
            if (!snapshot || typeof snapshot !== "object") throw new TypeError("[CozyAIMode] importSnapshot(): snapshot must be an object.");
            if (snapshot.activeMode && ALL_MODES.includes(snapshot.activeMode)) this.setMode(snapshot.activeMode);
            return { modeRestored: this.#activeMode, providersNotRestored: snapshot.registeredProviderModes || [] };
        }

        isSnapshotCompatible(snapshot) {
            return !!(snapshot && typeof snapshot.version === "string" && snapshot.version.split(".")[0] === AIMODE_VERSION.split(".")[0]);
        }
    }

    if (window.CozyOS.AIMode && typeof window.CozyOS.AIMode.getVersion === "function") {
        const existingVersion = window.CozyOS.AIMode.getVersion();
        if (existingVersion !== AIMODE_VERSION) {
            throw new Error(`[CozyOS Framework Execution Error] VERSION_CONFLICT: AIMode existing v${existingVersion} conflicts with load target v${AIMODE_VERSION}.`);
        }
        return;
    }

    window.CozyOS.AIMode = new CozyOSAIModeGateway();

    if (typeof window.CozyOS.registerCoordinator === "function") {
        try {
            window.CozyOS.registerCoordinator({
                name: "AIMode", category: "Code Generation", icon: "ai-mode.svg",
                description: "CozyAIMode — the single, provider-independent gateway for optional AI assistance. Defaults to Offline Only; ships with zero real providers wired in; makes no network calls itself in any mode."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
