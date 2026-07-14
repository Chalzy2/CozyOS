/**
 * CozyOS Enterprise Framework — CozyBuilder AI Planner
 * File Reference: core/modules/builder/builder-ai.js
 * Layer: Core / Code Generation — Build Planning
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   Turns a developer's plain-language request ("Build Customer Management
 *   Coordinator") into a structured build plan — module name, entities,
 *   fields, events, dependencies, folder — that cozy-builder.js hands to
 *   builder-templates.js.
 *
 * HONESTY NOTE — THIS IS NOT AN LLM
 *   "AI" here means deterministic, rule-based planning (keyword/pattern
 *   matching against the request text) — it does not call Claude, does not
 *   call any external API, and makes no network requests (this file has
 *   none, and never will by design — Zero Logic, execution-free, offline-
 *   first). Per the "should not depend on Claude" / "provider-independent"
 *   requirement, a real LLM-backed planner could be wired in later via
 *   setExternalPlanner() below — but this file never assumes one exists,
 *   and ships with only the deterministic heuristic path working today.
 *   Anything this planner infers that isn't explicitly stated in the
 *   request is a reasonable DEFAULT, not a fabricated fact about the
 *   developer's intent — the build plan it returns is always inspectable
 *   and editable before cozy-builder.js generates anything.
 *
 * ZERO LOGIC
 *   Produces a plan object only. Never generates files itself (that's
 *   builder-templates.js/cozy-builder.js), never executes anything.
 */

(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const AI_VERSION = "1.0.0-ENTERPRISE";

    // Known real dependency targets in this project — the planner only ever
    // suggests a dependency that actually, honestly exists as a coordinator
    // convention already established here (Company Management for tenantId
    // resolution, Certification/ServiceRegistry for the generic
    // integrations every coordinator already has).
    const KNOWN_DEPENDENCY_KEYWORDS = Object.freeze([
        { keywords: ["tenant", "company", "customer"], name: "Company Management", purpose: "Resolve tenantId from companyId" },
        { keywords: ["identity", "user", "permission", "role", "auth"], name: "CozyIdentity", purpose: "Authentication/authorization (not yet built — declared for future integration)" }
    ]);

    // Feature keyword -> optionalFields this planner will add to the primary
    // entity. Purely a convenience default; every field is visible and
    // editable in the returned plan before anything is generated.
    const FEATURE_FIELD_HINTS = Object.freeze([
        { keywords: ["credit", "payment terms", "balance"], fields: { creditLimit: 0, outstandingBalance: 0, paymentTerms: "Cash" } },
        { keywords: ["contact", "email", "phone"], fields: { contactEmail: null, contactPhone: null } },
        { keywords: ["address", "location", "delivery"], fields: { physicalAddress: null, county: null } },
        { keywords: ["price", "pricing", "cost"], fields: { unitPrice: 0 } },
        { keywords: ["category", "type", "classification"], fields: { category: null } }
    ]);

    function toPascalCase(words) {
        return words.map(w => {
            // A word with intentional internal capitals (VendorX, MpesaOS,
            // QuarryOS, CozyBuilder) already has real casing information —
            // preserve it exactly rather than destroying it. Only words
            // that are naturally all-lowercase or all-uppercase (ordinary
            // text input, not an already-cased identifier) get the
            // standard capitalize-first-letter treatment.
            const hasInternalCapital = /[a-z].*[A-Z]/.test(w);
            if (hasInternalCapital) return w.charAt(0).toUpperCase() + w.slice(1);
            return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
        }).join("");
    }

    function singularize(word) {
        if (/ies$/i.test(word)) return word.replace(/ies$/i, "y");
        if (/ses$/i.test(word)) return word.replace(/es$/i, "");
        if (/s$/i.test(word) && !/ss$/i.test(word)) return word.replace(/s$/i, "");
        return word;
    }

    function lowerFirst(word) { return word.charAt(0).toLowerCase() + word.slice(1); }

    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    class CozyOSBuilderAI {
        #externalPlanner = null;
        #diagnostics = { plansGenerated: 0, externalPlannerUsed: 0, errorsHidden: 0, eventsEmitted: 0 };
        #auditLogs = [];
        #listeners = new Map();
        #onceWrapped = new Map();

        getVersion() { return AI_VERSION; }

        #escapeHtml(value) {
            const str = String(value === undefined || value === null ? "" : value);
            return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
        }

        #enforceNoForbiddenKeys(obj, path = "root") {
            if (!obj || typeof obj !== "object") return;
            for (const key of Object.keys(obj)) {
                if (FORBIDDEN_KEYS.has(key)) {
                    throw new Error(`[BuilderAI] Prototype-pollution key "${key}" rejected at path "${path}.${key}".`);
                }
                this.#enforceNoForbiddenKeys(obj[key], `${path}.${key}`);
            }
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
            if (typeof eventName !== "string" || !eventName.trim()) throw new TypeError("[BuilderAI] on(): eventName must be a non-empty string.");
            if (typeof handler !== "function") throw new TypeError("[BuilderAI] on(): handler must be a function.");
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
            if (typeof handler !== "function") throw new TypeError("[BuilderAI] once(): handler must be a function.");
            const wrapper = (payload) => { this.off(eventName, handler); this.#onceWrapped.delete(handler); handler(payload); };
            this.#onceWrapped.set(handler, wrapper);
            this.on(eventName, wrapper);
        }

        emit(eventName, payload) {
            if (typeof eventName !== "string" || !eventName.trim()) { this.#diagnostics.errorsHidden++; return false; }
            const set = this.#listeners.get(eventName);
            this.#diagnostics.eventsEmitted++;
            if (!set || set.size === 0) return false;
            for (const fn of Array.from(set)) {
                try { fn(payload); } catch (_err) { this.#diagnostics.errorsHidden++; }
            }
            return true;
        }

        getDiagnosticsReport() {
            return Object.freeze({
                moduleVersion: AI_VERSION,
                ...this.#diagnostics,
                externalPlannerConnected: !!this.#externalPlanner,
                auditLogCount: this.#auditLogs.length,
                dependencies: [],
                integrationCount: 0
            });
        }

        /**
         * setExternalPlanner(fn)
         *   Optional hook for a real AI provider later — fn(requestText)
         *   must return a build-plan object synchronously (or this
         *   coordinator will treat a Promise as "not usable" and fall back
         *   to the heuristic, since certifyModule-adjacent code in this
         *   project stays execution-free/synchronous by convention). Never
         *   called unless explicitly set — the heuristic path below is the
         *   only thing that runs by default.
         */
        setExternalPlanner(fn) {
            if (typeof fn !== "function") throw new TypeError("[BuilderAI] setExternalPlanner(): fn must be a function.");
            this.#externalPlanner = fn;
        }

        clearExternalPlanner() { this.#externalPlanner = null; }

        /**
         * planBuild(request)
         *   request: { description: "Build Supplier Management Coordinator",
         *              features: ["credit", "contact"] (optional, free text hints),
         *              dependencies: ["Company Management"] (optional, explicit override) }
         *   Returns a build plan shaped exactly like generateCoordinator()'s
         *   spec parameter — inspect/edit it before generating anything.
         */
        planBuild(request) {
            if (!request || typeof request.description !== "string" || !request.description.trim()) {
                throw new TypeError("[BuilderAI] planBuild(): request.description is required.");
            }
            this.#enforceNoForbiddenKeys(request, "planBuild");

            if (this.#externalPlanner) {
                try {
                    const externalPlan = this.#externalPlanner(request.description);
                    if (externalPlan && typeof externalPlan === "object" && !(externalPlan instanceof Promise)) {
                        this.#diagnostics.externalPlannerUsed++;
                        this.#logAudit("PLAN_GENERATED", `External planner used for: "${request.description.slice(0, 60)}"`);
                        return externalPlan;
                    }
                } catch (_err) {
                    this.#diagnostics.errorsHidden++;
                    // fall through to the heuristic planner below
                }
            }

            const plan = this.#heuristicPlan(request);
            this.#diagnostics.plansGenerated++;
            this.#logAudit("PLAN_GENERATED", `Heuristic plan for: "${request.description.slice(0, 60)}" -> ${plan.exportName}`);
            this.emit("plan:generated", { exportName: plan.exportName });
            return plan;
        }

        /**
         * planBuildWithAI(request)
         *   Async sibling of planBuild(). Priority: (1) a directly-set
         *   #externalPlanner, unchanged from planBuild()'s own behavior;
         *   (2) window.CozyOS.AIMode.requestAssistance(), if AIMode is
         *   connected and its current mode isn't offline; (3) the same
         *   deterministic heuristic planBuild() uses. In Offline Only or
         *   Rules Only mode (or with no AIMode connected at all), this
         *   produces IDENTICAL output to planBuild() — nothing about the
         *   default, offline path changes by this method existing.
         */
        async planBuildWithAI(request) {
            if (!request || typeof request.description !== "string" || !request.description.trim()) {
                throw new TypeError("[BuilderAI] planBuildWithAI(): request.description is required.");
            }
            this.#enforceNoForbiddenKeys(request, "planBuildWithAI");

            if (this.#externalPlanner) {
                try {
                    const externalPlan = this.#externalPlanner(request.description);
                    if (externalPlan && typeof externalPlan === "object" && !(externalPlan instanceof Promise)) {
                        this.#diagnostics.externalPlannerUsed++;
                        this.#logAudit("PLAN_GENERATED", `External planner used for: "${request.description.slice(0, 60)}"`);
                        return externalPlan;
                    }
                } catch (_err) { this.#diagnostics.errorsHidden++; }
            }

            if (window.CozyOS.AIMode && typeof window.CozyOS.AIMode.requestAssistance === "function") {
                const assistance = await window.CozyOS.AIMode.requestAssistance("plan-build", { description: request.description });
                if (assistance.handled && assistance.result && typeof assistance.result === "object") {
                    this.#diagnostics.externalPlannerUsed++;
                    this.#logAudit("PLAN_GENERATED", `AIMode (${assistance.provider}) planned for: "${request.description.slice(0, 60)}"`);
                    this.emit("plan:generated", { exportName: assistance.result.exportName, provider: assistance.provider });
                    return assistance.result;
                }
            }

            const plan = this.#heuristicPlan(request);
            this.#diagnostics.plansGenerated++;
            this.#logAudit("PLAN_GENERATED", `Heuristic plan for: "${request.description.slice(0, 60)}" -> ${plan.exportName}`);
            this.emit("plan:generated", { exportName: plan.exportName });
            return plan;
        }

        #heuristicPlan(request) {
            const text = request.description;
            const lower = text.toLowerCase();

            // Extract module name: look for "Build <Name> Coordinator/Management/Module"
            const match = /build\s+([a-z][a-z\s]*?)\s+(coordinator|management|module|system)/i.exec(text);
            const rawWords = match ? match[1].trim().split(/\s+/) : text.trim().split(/\s+/).slice(0, 2);
            const exportName = toPascalCase(rawWords);
            const entitySingular = lowerFirst(singularize(rawWords[rawWords.length - 1] || exportName));

            // Dependencies: only suggested if the request text or explicit
            // override actually implies them — never invented.
            let dependencies = [];
            if (Array.isArray(request.dependencies)) {
                dependencies = request.dependencies.map(name => ({ name, required: false, purpose: "Explicitly requested" }));
            } else {
                for (const candidate of KNOWN_DEPENDENCY_KEYWORDS) {
                    if (candidate.keywords.some(k => lower.includes(k))) {
                        dependencies.push({ name: candidate.name, required: false, purpose: candidate.purpose });
                    }
                }
            }

            // Optional fields: only added if a feature keyword actually
            // appears in the request or the explicit features list.
            const featureText = lower + " " + (Array.isArray(request.features) ? request.features.join(" ").toLowerCase() : "");
            let optionalFields = {};
            for (const hint of FEATURE_FIELD_HINTS) {
                if (hint.keywords.some(k => featureText.includes(k))) {
                    optionalFields = { ...optionalFields, ...hint.fields };
                }
            }

            const softDelete = !lower.includes("no archive") && !lower.includes("permanent delete");
            const uniqueCodeField = lower.includes("code") || lower.includes("number") ? `${entitySingular}Code` : null;

            return {
                exportName,
                responsibility: request.responsibility || `The single source of truth for ${exportName.toLowerCase()} records managed by this CozyOS application.`,
                category: request.category || "Business Domain",
                dependencies,
                eventSeparator: request.eventSeparator || ":",
                entities: [{
                    name: entitySingular,
                    idPrefix: entitySingular.slice(0, 3),
                    uniqueCodeField,
                    requiredFields: request.requiredFields || [uniqueCodeField, "name"].filter(Boolean),
                    optionalFields,
                    softDelete
                }],
                folder: `core/modules/${exportName.toLowerCase()}`,
                notes: [
                    "This plan was generated heuristically from plain-language input — review requiredFields/optionalFields/dependencies before generating files.",
                    "No network call, no LLM call, no execution occurred while planning this."
                ]
            };
        }
    }

    if (window.CozyOS.BuilderAI && typeof window.CozyOS.BuilderAI.getVersion === "function") {
        const existingVersion = window.CozyOS.BuilderAI.getVersion();
        if (existingVersion !== AI_VERSION) {
            throw new Error(`[CozyOS Framework Execution Error] VERSION_CONFLICT: BuilderAI existing v${existingVersion} conflicts with load target v${AI_VERSION}.`);
        }
        return;
    }

    window.CozyOS.BuilderAI = new CozyOSBuilderAI();

    (function registerWithServiceRegistry(descriptor) {
        function attempt() {
            if (typeof window.CozyOS.registerCoordinator !== "function") return false;
            try { window.CozyOS.registerCoordinator(descriptor); } catch (_err) { /* non-fatal */ }
            return true;
        }
        if (attempt()) return;
        if (!Object.prototype.hasOwnProperty.call(window.CozyOS, "__pendingCoordinatorRegistrations")) {
            Object.defineProperty(window.CozyOS, "__pendingCoordinatorRegistrations", { value: [], writable: true, enumerable: false, configurable: true });
        }
        window.CozyOS.__pendingCoordinatorRegistrations.push(descriptor);
        let attempts = 0;
        const maxAttempts = 200;
        const intervalId = setInterval(() => {
            attempts++;
            if (attempt() || attempts >= maxAttempts) {
                clearInterval(intervalId);
                const idx = window.CozyOS.__pendingCoordinatorRegistrations.indexOf(descriptor);
                if (idx !== -1) window.CozyOS.__pendingCoordinatorRegistrations.splice(idx, 1);
            }
        }, 250);
    })({
        name: "BuilderAI", category: "Code Generation", icon: "builder-ai.svg",
        description: "CozyBuilder's build planner — deterministic, rule-based (not an LLM call); turns plain-language requests into structured build plans."
    });
})();
