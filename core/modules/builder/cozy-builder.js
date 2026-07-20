/**
 * CozyOS Enterprise Framework — CozyBuilder Engine
 * File Reference: core/modules/builder/cozy-builder.js
 * Layer: Core / Code Generation — Build Orchestration
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   Coordinates a build: takes a developer request or an explicit build
 *   spec, asks BuilderAI for a plan (if needed), asks BuilderTemplates to
 *   generate real file content, and returns a complete build result — a
 *   map of {filename: content} ready for download/review. Never writes to
 *   disk, never executes anything it generates.
 *
 * WHAT THIS MODULE DOES NOT DO (Zero Logic Rule)
 *   - Does not certify anything — every generated file is designed to
 *     pass CozyCertification with minimal work, but only CozyCertification
 *     itself is the authority on whether it actually does.
 *   - Does not modify CozyCertification, WorkspaceShell, or ServiceRegistry.
 *   - Does not execute, evaluate, or import generated JavaScript.
 *   - Does not deploy, write files, or change release records.
 *
 * OPTIONAL INTEGRATIONS
 *   BuilderRules — required (conventions).
 *   BuilderTemplates — required (file generation).
 *   BuilderAI — required for plain-language requests; not required if the
 *               caller supplies a complete build spec directly.
 *   CozyCertification — read generically, only to show a developer whether
 *               a generated file passed, right after generating it (this
 *               module still never certifies anything itself — it asks
 *               the real engine, same as every other consumer in this
 *               project).
 */

(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const BUILDER_VERSION = "1.0.0-ENTERPRISE";

    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    const BUILD_MODES = Object.freeze([
        "quick", "enterprise", "application", "coordinator", "dashboard", "crud", "report", "template"
    ]);

    /**
     * BUILDER_PATTERN_APPLIERS
     *   The ONLY functions #applyActivePatterns() will ever run — keyed
     *   by applierId, never by an approved pattern's free-text
     *   description. Each is additive-only (adds something missing;
     *   never removes or rewrites existing code), the same discipline
     *   CozyBugFixer's DETERMINISTIC_FIXERS already follows. An approved
     *   pattern whose applierId doesn't match one of these is simply not
     *   applied — it stays a documented, human-reviewable record, not
     *   executable code.
     */
    const BUILDER_PATTERN_APPLIERS = Object.freeze({
        "ensure-forbidden-keys": (source) => {
            if (/FORBIDDEN_KEYS\s*=\s*new Set/.test(source)) return { applied: false, source };
            const marker = /(\(function \(\) \{\s*["']use strict["'];\s*\n)/;
            if (!marker.test(source)) return { applied: false, source };
            const injected = source.replace(marker, `$1\n    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);\n`);
            return { applied: true, source: injected };
        },
        "ensure-doc-version-field": (source) => {
            if (/\*\s*Version:/.test(source)) return { applied: false, source };
            const marker = /(\/\*\*\n)/;
            if (!marker.test(source)) return { applied: false, source };
            const injected = source.replace(marker, `$1 * Version: 1.0.0-ENTERPRISE\n`);
            return { applied: true, source: injected };
        },
        "ensure-doc-layer-field": (source) => {
            if (/\*\s*Layer:/.test(source)) return { applied: false, source };
            const marker = /(\*\s*Version:.*\n)/;
            if (!marker.test(source)) return { applied: false, source };
            const injected = source.replace(marker, `$1 * Layer: Business Domain\n`);
            return { applied: true, source: injected };
        }
    });

    class CozyOSBuilderEngine {
        #auditLogs = [];
        #timelineEvents = [];
        #listeners = new Map();
        #onceWrapped = new Map();
        #buildHistory = []; // append-only: every build this session produced

        #diagnostics = {
            buildsRun: 0, filesGenerated: 0, errorsHidden: 0, eventsEmitted: 0, memoryBaseline: 5.0
        };

        getVersion() { return BUILDER_VERSION; }

        #requireDependency(name) {
            if (!window.CozyOS[name]) {
                throw new Error(`[CozyBuilder] window.CozyOS.${name} must be loaded before CozyBuilder can generate anything.`);
            }
            return window.CozyOS[name];
        }

        #deepClone(value) {
            if (typeof structuredClone === "function") {
                try { return structuredClone(value); } catch (_err) { /* fall through */ }
            }
            try { return JSON.parse(JSON.stringify(value)); } catch (_err) { return value; }
        }

        // This engine doesn't render HTML itself — it only PRODUCES source
        // text via BuilderTemplates — but a future dashboard view listing
        // build specs/descriptions could reasonably need this, so it
        // carries the same standard escaping utility every CozyOS
        // coordinator does.
        #escapeHtml(value) {
            const str = String(value === undefined || value === null ? "" : value);
            return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
        }

        #enforceNoForbiddenKeys(obj, path = "root") {
            if (!obj || typeof obj !== "object") return;
            for (const key of Object.keys(obj)) {
                if (FORBIDDEN_KEYS.has(key)) {
                    throw new Error(`[CozyBuilder] Prototype-pollution key "${key}" rejected at path "${path}.${key}".`);
                }
                this.#enforceNoForbiddenKeys(obj[key], `${path}.${key}`);
            }
        }

        #logAudit(action, msg) {
            this.#auditLogs.push(Object.freeze({ id: "aud_" + (crypto.randomUUID ? crypto.randomUUID() : Date.now()), timestamp: new Date().toISOString(), action, msg }));
            if (this.#auditLogs.length > 500) this.#auditLogs.shift();
        }

        #logTimeline(label) {
            this.#timelineEvents.push(Object.freeze({ time: new Date().toISOString(), label }));
            if (this.#timelineEvents.length > 500) this.#timelineEvents.shift();
        }

        on(eventName, handler) {
            if (typeof eventName !== "string" || !eventName.trim()) throw new TypeError("[CozyBuilder] on(): eventName must be a non-empty string.");
            if (typeof handler !== "function") throw new TypeError("[CozyBuilder] on(): handler must be a function.");
            if (!this.#listeners.has(eventName)) this.#listeners.set(eventName, new Set());
            this.#listeners.get(eventName).add(handler);
            return () => this.off(eventName, handler);
        }

        off(eventName, handler) {
            const set = this.#listeners.get(eventName);
            if (!set) return false;
            return set.delete(handler);
        }

        once(eventName, handler) {
            const wrapper = (payload) => { this.off(eventName, wrapper); handler(payload); };
            this.on(eventName, wrapper);
        }

        emit(eventName, payload) {
            if (typeof eventName !== "string" || !eventName.trim()) return false;
            this.#diagnostics.eventsEmitted++;
            const set = this.#listeners.get(eventName);
            if (!set || set.size === 0) return false;
            for (const fn of Array.from(set)) {
                try { fn(this.#deepClone(payload)); } catch (_err) { this.#diagnostics.errorsHidden++; }
            }
            return true;
        }

        listBuildModes() { return BUILD_MODES.slice(); }

        /**
         * planFromDescription(description, options)
         *   Thin pass-through to BuilderAI.planBuild() — kept here so a
         *   caller only needs to talk to CozyBuilder, not every sub-module.
         */
        planFromDescription(description, options = {}) {
            const ai = this.#requireDependency("BuilderAI");
            return ai.planBuild({ description, ...options });
        }

        /** Async sibling — pass-through to BuilderAI.planBuildWithAI(), which consults CozyAIMode before falling back to the same heuristic. */
        async planFromDescriptionWithAI(description, options = {}) {
            const ai = this.#requireDependency("BuilderAI");
            if (typeof ai.planBuildWithAI !== "function") return ai.planBuild({ description, ...options });
            return ai.planBuildWithAI({ description, ...options });
        }

        /**
         * buildCoordinator(spec, { mode, forceGenerate })
         *   spec: either a plain-language description string, or a full
         *   build spec object (see builder-templates.js generateCoordinator).
         *   Rule 16 — before generating anything, this consults
         *   UnderstandingEngine.performWorkspaceDiscovery() against the
         *   description (or plan.exportName/responsibility if spec was
         *   already a resolved plan). If it finds an existing match, this
         *   returns {blocked:true, discovery, message} INSTEAD of
         *   generating duplicate files — pass forceGenerate:true only
         *   after reviewing the discovery result and confirming it's a
         *   false match or that a genuinely new module is still warranted.
         *   Returns { files: {filename: content}, plan, certificationPreview }
         *   on a normal (non-blocked) build.
         */
        buildCoordinator(spec, { mode = "coordinator", forceGenerate = false } = {}) {
            if (!BUILD_MODES.includes(mode)) throw new TypeError(`[CozyBuilder] Unknown build mode "${mode}". Valid modes: ${BUILD_MODES.join(", ")}.`);
            const plan = typeof spec === "string" ? this.planFromDescription(spec) : spec;
            const blocked = this.#checkWorkspaceDiscovery(spec, plan, forceGenerate);
            if (blocked) return blocked;
            return this.#buildFromPlan(plan, mode);
        }

        /**
         * buildCoordinatorWithAI(spec, { mode, forceGenerate })
         *   Async sibling of buildCoordinator(). Only difference: when spec
         *   is a plain-language string, plan resolution goes through
         *   planFromDescriptionWithAI() (which consults CozyAIMode) instead
         *   of the synchronous heuristic-only path. If spec is already a
         *   resolved plan object, or CozyAIMode is offline/not connected,
         *   this produces IDENTICAL output to buildCoordinator(). Same
         *   Rule 16 discovery gate applies.
         */
        async buildCoordinatorWithAI(spec, { mode = "coordinator", forceGenerate = false } = {}) {
            if (!BUILD_MODES.includes(mode)) throw new TypeError(`[CozyBuilder] Unknown build mode "${mode}". Valid modes: ${BUILD_MODES.join(", ")}.`);
            const plan = typeof spec === "string" ? await this.planFromDescriptionWithAI(spec) : spec;
            const blocked = this.#checkWorkspaceDiscovery(spec, plan, forceGenerate);
            if (blocked) return blocked;
            return this.#buildFromPlan(plan, mode);
        }

        /** Rule 16 gate — shared by both buildCoordinator entry points. */
        #checkWorkspaceDiscovery(originalSpec, plan, forceGenerate) {
            const ue = window.CozyOS.UnderstandingEngine;
            if (!ue || typeof ue.performWorkspaceDiscovery !== "function") return null; // discovery not available — proceed as before, never block on a missing optional dependency
            const query = typeof originalSpec === "string" ? originalSpec : (plan.exportName || plan.responsibility || "");
            if (!query) return null;
            let discovery;
            try { discovery = ue.performWorkspaceDiscovery(query); } catch (_err) { return null; }
            if (!discovery.alreadyExists || forceGenerate) return null;
            this.#logAudit("BUILD_BLOCKED_BY_DISCOVERY", `"${query}" — existing module(s) found, generation blocked (Rule 16).`);
            this.#logTimeline(`Build blocked by discovery: "${query}"`);
            this.emit("build:blockedByDiscovery", { query });
            return Object.freeze({
                blocked: true, discovery,
                message: `An existing module already appears to cover this requirement — not generating a duplicate. Reuse the existing module (re-certify it if needed), or call again with forceGenerate:true if this is a false match or extension is genuinely warranted.`
            });
        }

        #buildFromPlan(plan, mode) {
            const templates = this.#requireDependency("BuilderTemplates");
            if (!plan || !plan.exportName) throw new TypeError("[CozyBuilder] buildCoordinator(): could not resolve a valid build plan (missing exportName).");
            this.#enforceNoForbiddenKeys(plan, "buildSpec");

            const files = {};
            const folder = plan.folder || `core/modules/${plan.exportName.toLowerCase()}`;
            const baseName = plan.exportName.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

            const coordinatorPath = `${folder}/cozy-${baseName}.js`;
            const generated = templates.generateCoordinator(plan);
            const { source: patternAppliedSource, appliedPatternIds } = this.#applyActivePatterns(generated);
            files[coordinatorPath] = patternAppliedSource;

            if (mode === "dashboard" || mode === "enterprise" || mode === "application") {
                files[`${folder}/${baseName}.html`] = templates.generateDashboardHtml(plan);
                files[`${folder}/${baseName}-dashboard.css`] = templates.generateDashboardCss(plan);
                files[`${folder}/${baseName}-dashboard.js`] = templates.generateDashboardJs(plan);
            }

            let applicationManifest = null;
            if (mode === "application") {
                applicationManifest = templates.generateApplicationManifest(plan);
                files[`${folder}/application-manifest.json`] = JSON.stringify(applicationManifest, null, 2);
            }

            const certificationPreview = this.#previewCertification(files[coordinatorPath], plan.exportName);
            this.#recordPatternOutcomes(appliedPatternIds, certificationPreview);

            this.#diagnostics.buildsRun++;
            this.#diagnostics.filesGenerated += Object.keys(files).length;
            const buildRecord = Object.freeze({
                buildId: "build_" + (crypto.randomUUID ? crypto.randomUUID() : Date.now()),
                mode, exportName: plan.exportName,
                fileCount: Object.keys(files).length,
                timestamp: new Date().toISOString(),
                certificationPreview,
                appliedPatternIds
            });
            this.#buildHistory.push(buildRecord);
            if (this.#buildHistory.length > 200) this.#buildHistory.shift();
            if (window.CozyOS.CozyMemory) {
                try { window.CozyOS.CozyMemory.saveMemory("Builder", `build-${buildRecord.buildId}`, { plan, mode, fileList: Object.keys(files), certificationPreview }, { tags: ["build", mode, plan.exportName] }); } catch (_err) { /* memory is additive — never blocks a build */ }
            }

            this.#logAudit("BUILD_COMPLETED", `${plan.exportName} built in "${mode}" mode — ${Object.keys(files).length} file(s)${appliedPatternIds.length ? `, ${appliedPatternIds.length} pattern(s) applied` : ""}.`);
            this.#logTimeline(`Build completed: ${plan.exportName} (${mode})`);
            this.emit("build:completed", { exportName: plan.exportName, mode, fileCount: Object.keys(files).length, appliedPatternIds });

            return { files, plan, applicationManifest, certificationPreview, buildId: buildRecord.buildId, appliedPatternIds };
        }

        /**
         * #applyActivePatterns(source)
         *   Phase 4 — consults UnderstandingEngine.listActivePatterns()
         *   (only ever populated by explicit human approval — see
         *   understanding-engine.js) and applies ONLY patterns whose
         *   extractedPattern.applierId matches one of this coordinator's
         *   own small, curated, additive-only applier functions. An
         *   approved pattern's stored description/metadata is never
         *   executed as code — only a pre-vetted function keyed by a
         *   known applierId ever runs, the same safety principle
         *   CozyBugFixer's DETERMINISTIC_FIXERS already uses.
         */
        #applyActivePatterns(source) {
            const ue = window.CozyOS.UnderstandingEngine;
            if (!ue || typeof ue.listActivePatterns !== "function") return { source, appliedPatternIds: [] };
            let working = source;
            const applied = [];
            for (const pattern of ue.listActivePatterns()) {
                const applierId = pattern.extractedPattern && pattern.extractedPattern.applierId;
                const applier = BUILDER_PATTERN_APPLIERS[applierId];
                if (!applier) continue;
                const result = applier(working);
                if (result.applied) { working = result.source; applied.push(pattern.id); }
            }
            return { source: working, appliedPatternIds: applied };
        }

        /** Reports real, observed outcomes back to the Pattern Library — never estimated. */
        #recordPatternOutcomes(patternIds, certificationPreview) {
            if (!patternIds.length) return;
            const ue = window.CozyOS.UnderstandingEngine;
            if (!ue || typeof ue.recordPatternUsage !== "function") return;
            const success = !!(certificationPreview && certificationPreview.available && certificationPreview.verdict !== "CERTIFICATION_FAILED");
            for (const id of patternIds) { try { ue.recordPatternUsage(id, { success }); } catch (_err) { /* pattern may have been deprecated between consult and record — non-fatal */ } }
        }

        /**
         * #previewCertification(source, moduleId)
         *   Reads CozyCertification generically (if connected) to show what
         *   the generated file would score — this NEVER certifies on the
         *   engine's permanent record; it's a read-only preview using the
         *   engine's own real quickCertification(), same as any other
         *   consumer would call it. If CozyCertification isn't connected,
         *   this honestly says so instead of guessing a score.
         */
        #previewCertification(source, moduleId) {
            if (!window.CozyOS.Certification || typeof window.CozyOS.Certification.quickCertification !== "function") {
                return { available: false, message: "CozyCertification not connected — cannot preview certification score." };
            }
            try {
                const result = window.CozyOS.Certification.quickCertification(source, { moduleId: `${moduleId}_preview`, moduleName: moduleId, version: "1.0.0-ENTERPRISE" });
                return {
                    available: true,
                    verdict: result.verdict,
                    scorePercent: result.summary.scorePercent,
                    grade: result.overallGrade,
                    criticalCount: result.severityCounts.critical,
                    highCount: result.severityCounts.high,
                    mediumCount: result.severityCounts.medium,
                    lowCount: result.severityCounts.low
                };
            } catch (err) {
                this.#diagnostics.errorsHidden++;
                return { available: false, message: `Preview certification failed: ${err.message}` };
            }
        }

        getBuildHistory() { return Object.freeze(this.#buildHistory.map(b => this.#deepClone(b))); }

        getTimeline(predicate) {
            const list = this.#timelineEvents.map(e => this.#deepClone(e));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

        getAuditLog(predicate) {
            const list = this.#auditLogs.map(e => this.#deepClone(e));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

        getDiagnosticsReport() {
            const deps = ["BuilderRules", "BuilderTemplates", "BuilderAI"].map(name => ({
                name, required: name !== "BuilderAI", purpose: name === "BuilderAI" ? "Plain-language build planning" : "Conventions/templates"
            }));
            return Object.freeze({
                moduleVersion: BUILDER_VERSION,
                ...this.#diagnostics,
                dependencies: deps,
                integrationCount: deps.filter(d => !!window.CozyOS[d.name]).length,
                auditLogCount: this.#auditLogs.length,
                timelineEventCount: this.#timelineEvents.length,
                buildHistorySize: this.#buildHistory.length
            });
        }

        isVersionCompatible(version) {
            const a = /^v?(\d+)\./.exec(String(BUILDER_VERSION));
            const b = /^v?(\d+)\./.exec(String(version || ""));
            if (!a || !b) return false;
            return a[1] === b[1];
        }

        exportSnapshot() {
            return Object.freeze({
                version: BUILDER_VERSION,
                exportedAt: new Date().toISOString(),
                buildHistory: this.#buildHistory,
                auditLog: this.#auditLogs,
                timeline: this.#timelineEvents
            });
        }

        importSnapshot(snapshot, { mergeStrategy = "merge" } = {}) {
            if (!snapshot || typeof snapshot !== "object") throw new TypeError("[CozyBuilder] importSnapshot(): snapshot must be an object.");
            if (mergeStrategy !== "merge" && mergeStrategy !== "replace") {
                throw new TypeError('[CozyBuilder] importSnapshot(): mergeStrategy must be "merge" or "replace".');
            }
            if (mergeStrategy === "replace") this.#buildHistory.length = 0;
            let imported = 0;
            for (const record of (snapshot.buildHistory || [])) {
                if (!this.#buildHistory.some(b => b.buildId === record.buildId)) {
                    this.#buildHistory.push(Object.freeze(record));
                    imported++;
                }
            }
            this.#logAudit("SNAPSHOT_IMPORTED", `${imported} build record(s) imported (strategy: ${mergeStrategy}).`);
            return { imported };
        }
    }

    if (window.CozyOS.Builder && typeof window.CozyOS.Builder.getVersion === "function") {
        const existingVersion = window.CozyOS.Builder.getVersion();
        if (existingVersion !== BUILDER_VERSION) {
            throw new Error(`[CozyOS Framework Execution Error] VERSION_CONFLICT: Builder existing v${existingVersion} conflicts with load target v${BUILDER_VERSION}.`);
        }
        return;
    }

    window.CozyOS.Builder = new CozyOSBuilderEngine();
    // Application Visibility Registry (core/platform/application-visibility.js)
    // — real, additive self-declaration. Builder is hosted as an internal
    // Developer Hub section, not a standalone mountable module, so
    // launchTarget reflects that honestly: navigate to Developer Hub and
    // deep-link to its real "builder" section (already real and working —
    // see cozy-workspace.js's Developer Hub embedded-nav deep-linking).
    window.CozyOS.Builder.visibility = Object.freeze({
        appId: "builder", name: "Builder", icon: "🔨", category: "platform-tool",
        launchTarget: Object.freeze({ center: "developerHub", section: "builder" }),
        audience: "developer"
    });

    // Auto-register with the Service Registry — retries if it isn't loaded
    // yet (load order isn't guaranteed), instead of only ever trying once.
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
        const maxAttempts = 200; // ~50s at 250ms — bounded, not infinite
        const intervalId = setInterval(() => {
            attempts++;
            if (attempt() || attempts >= maxAttempts) {
                clearInterval(intervalId);
                const idx = window.CozyOS.__pendingCoordinatorRegistrations.indexOf(descriptor);
                if (idx !== -1) window.CozyOS.__pendingCoordinatorRegistrations.splice(idx, 1);
            }
        }, 250);
    })({
        name: "Builder", category: "Code Generation", icon: "builder.svg",
        description: "CozyBuilder — the Enterprise Code Generator. Generates CozyOS-compliant coordinators, dashboards, and application manifests. Never certifies, executes, or deploys anything itself."
    });
})();
