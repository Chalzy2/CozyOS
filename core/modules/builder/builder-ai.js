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

    /**
     * classifyIntent(text)
     *   Real, deterministic classification only — never routing, and
     *   never a fabricated NLP judgment. Answers exactly one question:
     *   "what kind of document is this?" What happens next (send to
     *   RequirementReader, BugFixer, Certification, Project Refactor,
     *   Builder, or just show the analysis) is entirely the caller's
     *   decision — kept in Developer Hub, not here, so adding a future
     *   document type never requires touching planBuild() or the rest
     *   of the Builder pipeline.
     *
     *   Returns one of: BUSINESS_REQUIREMENTS, USER_STORY, ARCHITECTURE,
     *   SOURCE_CODE, BUG_REPORT, CERTIFICATION_REPORT, REFACTOR_REQUEST,
     *   BUILD_REQUEST, PROJECT_SPECIFICATION, UNKNOWN.
     *
     *   Honest confidence note: BUILD_REQUEST vs. PROJECT_SPECIFICATION
     *   is the least reliably distinguishable pair here — both
     *   legitimately contain "build" language. PROJECT_SPECIFICATION is
     *   only claimed when real structural markers (Entities:/Fields:/
     *   Dependencies:/API: labels) are present; a plain "Build X
     *   Coordinator" phrase alone is BUILD_REQUEST.
     */
    function classifyIntent(text) {
        const scores = {
            BUSINESS_REQUIREMENTS: 0, USER_STORY: 0, ARCHITECTURE: 0, SOURCE_CODE: 0,
            BUG_REPORT: 0, CERTIFICATION_REPORT: 0, REFACTOR_REQUEST: 0, BUILD_REQUEST: 0, PROJECT_SPECIFICATION: 0
        };
        const signals = [];
        const add = (type, points, why) => { scores[type] += points; signals.push(`[${type}] ${why}`); };

        // USER_STORY — real, specific sentence pattern
        const userStoryMatches = text.match(/\bas\s+(a|an|another)\s+[a-z][a-z\s]{2,30},?\s+i\s+want\b/gi) || [];
        if (userStoryMatches.length > 0) add("USER_STORY", userStoryMatches.length * 2, `${userStoryMatches.length} "As a/an ___, I want ___" sentence(s)`);

        // BUSINESS_REQUIREMENTS — real header/section signals
        for (const pattern of [/\brequirements?\s+document\b/i, /\bacceptance\s+criteria\b/i, /\bbusiness\s+requirements\b/i, /\bfunctional\s+requirements\b/i, /\brequirements?\s+discovery\b/i]) {
            if (pattern.test(text)) add("BUSINESS_REQUIREMENTS", 2, `matched ${pattern}`);
        }
        if (/\buser\s+stor(y|ies)\b/i.test(text)) add("BUSINESS_REQUIREMENTS", 1, "mentions \"user stories\" as a section label");

        // ARCHITECTURE — real header signals
        for (const pattern of [/\barchitecture\b/i, /\bsystem\s+design\b/i, /\bmodule\s+relationships?\b/i, /\bcomponent\s+diagram\b/i, /\bdata\s+flow\b/i, /\bdependency\s+graph\b/i]) {
            if (pattern.test(text)) add("ARCHITECTURE", 2, `matched ${pattern}`);
        }

        // SOURCE_CODE — real structural code signals (the code-paste/upload
        // path already handles real parseable code upstream; this exists so
        // the enum is complete and callers relying on classifyIntent() alone
        // still get a real answer, e.g. pasted code accompanied by prose).
        const codeSignalCount = (text.match(/\bfunction\s+\w+\s*\(|\bclass\s+\w+\s*\{|=>\s*\{|;\s*$/gm) || []).length;
        if (codeSignalCount >= 3) add("SOURCE_CODE", Math.min(codeSignalCount, 6), `${codeSignalCount} code-structure marker(s) (function/class/arrow/semicolon-terminated lines)`);

        // BUG_REPORT — real signals
        for (const pattern of [/\bsteps?\s+to\s+reproduce\b/i, /\bexpected\s+(result|behavio(u)?r)\b/i, /\bactual\s+(result|behavio(u)?r)\b/i, /\bstack\s+trace\b/i]) {
            if (pattern.test(text)) add("BUG_REPORT", 2, `matched ${pattern}`);
        }
        if (/\bat\s+[\w.$]+\s*\([^)]*:\d+:\d+\)/.test(text)) add("BUG_REPORT", 3, "contains a real stack-trace-shaped line (at ...:line:col)");
        if (/\berror\s*:/i.test(text)) add("BUG_REPORT", 1, "contains an \"Error:\" line");

        // CERTIFICATION_REPORT — real verdict/severity signals, matching CozyCertification's actual vocabulary
        for (const pattern of [/\bENTERPRISE_CERTIFIED\b/, /\bCERTIFICATION_FAILED\b/, /\bCERTIFIED_WITH_WARNINGS\b/]) {
            if (pattern.test(text)) add("CERTIFICATION_REPORT", 3, `contains the real verdict string ${pattern}`);
        }
        if (/\bcritical\s*:\s*\d+/i.test(text) && /\bhigh\s*:\s*\d+/i.test(text)) add("CERTIFICATION_REPORT", 2, "contains real Critical:/High: severity counts");

        // REFACTOR_REQUEST — real signals, matching ProjectRefactor's own vocabulary
        for (const pattern of [/\brefactor\b/i, /\bsplit\s+(this|the)\s+file\b/i, /\bmerge\s+project\b/i, /\bmodulari[sz]e\b/i, /\boptimi[sz]e\s+(this|the)\s+(project|module|file)\b/i]) {
            if (pattern.test(text)) add("REFACTOR_REQUEST", 2, `matched ${pattern}`);
        }

        // PROJECT_SPECIFICATION — real structural markers only (see honesty note above)
        const specFieldCount = [/\bentities?\s*:/i, /\bfields?\s*:/i, /\bdependenc(y|ies)\s*:/i, /\bapi\s*:/i, /\bfolder\s*:/i].filter(p => p.test(text)).length;
        if (specFieldCount >= 2) add("PROJECT_SPECIFICATION", specFieldCount * 2, `${specFieldCount} structural spec label(s) (Entities:/Fields:/Dependencies:/API:/Folder:)`);

        // BUILD_REQUEST — the existing, already-working pattern, plus an explicit label
        if (/\bbuild\s+[a-z][a-z\s]*?\s+(coordinator|management|module|system)\b/i.test(text)) add("BUILD_REQUEST", 3, "matched \"Build X Coordinator/Module/System\" pattern");
        if (/(?:application name|module|app name)\s*:\s*[A-Za-z]/i.test(text)) add("BUILD_REQUEST", 2, "explicit Application Name/Module label present");

        const best = Object.entries(scores).reduce((top, [type, score]) => score > top.score ? { type, score } : top, { type: "UNKNOWN", score: 0 });
        const type = best.score >= 2 ? best.type : "UNKNOWN";

        return { type, scores, signals: signals.filter(s => s.startsWith(`[${type}]`)) };
    }

    function toPascalCase(words) {
        return words.map(w => {
            // Defense-in-depth: strip anything that isn't a letter/digit
            // before casing — a raw word should never carry punctuation
            // (apostrophes, etc.) into a generated identifier or file path,
            // regardless of which extraction branch produced it.
            const clean = w.replace(/[^A-Za-z0-9]/g, "");
            if (!clean) return "";
            // A word with intentional internal capitals (VendorX, MpesaOS,
            // QuarryOS, CozyBuilder) already has real casing information —
            // preserve it exactly rather than destroying it. Only words
            // that are naturally all-lowercase or all-uppercase (ordinary
            // text input, not an already-cased identifier) get the
            // standard capitalize-first-letter treatment.
            const hasInternalCapital = /[a-z].*[A-Z]/.test(clean);
            if (hasInternalCapital) return clean.charAt(0).toUpperCase() + clean.slice(1);
            return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
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
        /** classifyIntent(text) — real, public. Callers (Developer Hub's Analyze step) use this BEFORE deciding whether to call planBuild() at all. */
        classifyIntent(text) { return classifyIntent(text); }

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

            // Conversational openers and filler words that must never be
            // mistaken for a module/application name — this is exactly
            // what let "Here's a description..." become "HeresA" before.
            const FILLER_WORDS = new Set([
                "here", "here's", "heres", "this", "that", "please", "create", "build", "make", "generate",
                "i", "i'd", "id", "we", "you", "want", "need", "would", "like", "can", "could", "should",
                "a", "an", "the", "is", "are", "was", "for", "to", "of", "and", "so", "so's", "let's", "lets"
            ]);

            // Priority 1 (unchanged): "Build X Coordinator/Management/Module/System"
            const match = /build\s+([a-z][a-z\s]*?)\s+(coordinator|management|module|system)/i.exec(text);
            let rawWords;

            if (match) {
                rawWords = match[1].trim().split(/\s+/);
            } else {
                // Priority 2 (new): an explicit "Application Name: X" /
                // "Module: X" / "Name: X" label — the same structured
                // format RequirementReader's generated summaries use.
                const labelMatch = /(?:application name|module|app name|name)\s*:\s*([A-Za-z][A-Za-z0-9]*(?:\s+[A-Za-z][A-Za-z0-9]*){0,3})/i.exec(text);
                if (labelMatch) {
                    rawWords = labelMatch[1].trim().split(/\s+/);
                } else {
                    // Priority 3 (new): a genuine proper-noun-like token —
                    // capitalized, at least 3 letters, not a filler word.
                    // Prefers a mixed-case identifier (MpesaOS, QuarryOS)
                    // if one exists anywhere in the text.
                    const candidates = Array.from(text.matchAll(/\b[A-Z][A-Za-z0-9]{2,}\b/g)).map(m => m[0]).filter(w => !FILLER_WORDS.has(w.toLowerCase()));
                    const properNoun = candidates.find(w => /[a-z][A-Z]/.test(w)) || candidates[0];
                    if (properNoun) {
                        rawWords = [properNoun];
                    } else {
                        // Priority 4 (last resort, fixed): the first
                        // MEANINGFUL words with filler/stopwords stripped —
                        // never the literal raw first words of the text.
                        const meaningful = text.trim().split(/\s+/).map(w => w.replace(/[^A-Za-z0-9]/g, "")).filter(w => w.length > 1 && !FILLER_WORDS.has(w.toLowerCase()));
                        rawWords = meaningful.slice(0, 2).length ? meaningful.slice(0, 2) : ["Module"];
                    }
                }
            }

            let exportName = toPascalCase(rawWords);
            if (!exportName) exportName = "Module";
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
