/**
 * CozyOS Enterprise Framework — CozyBuilder Rule Library
 * File Reference: core/modules/builder/builder-rules.js
 * Layer: Core / Code Generation — Rules & Standards
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   A pure rules-and-conventions library — no business logic, no file
 *   generation, no build orchestration. Every other CozyBuilder file reads
 *   from this one to know what "Enterprise-quality" means for CozyOS:
 *   header format, naming conventions, required architectural elements,
 *   security requirements, and HTML/CSS/dashboard design tokens.
 *
 *   Every rule here is derived from patterns that have actually been
 *   certified ENTERPRISE_CERTIFIED by CozyCertification in this project
 *   (Company Management, Customer Management, CozyAutomation) — this is
 *   not a guess at what certification wants, it's a codification of what
 *   has already passed.
 *
 * ZERO LOGIC
 *   This file exports only data (strings, objects, small pure functions
 *   that format text). It does not certify anything, does not execute
 *   anything, and does not know about any specific module being built.
 */

(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const RULES_VERSION = "1.0.0-ENTERPRISE";

    // =========================================================================
    // ─── NAMING & FOLDER CONVENTIONS ──────────────────────────────────────────
    // =========================================================================

    const NAMING_RULES = Object.freeze({
        // window.CozyOS.<ExportName> — PascalCase, no "Cozy" prefix on the
        // export key itself (matches Certification/Company/Customer/
        // ServiceRegistry/WorkspaceShell, all registered this way).
        exportNamePattern: /^[A-Z][a-zA-Z0-9]*$/,
        // Class name convention: CozyOS<ExportName>Coordinator
        classNameFor: (exportName) => `CozyOS${exportName}Coordinator`,
        // File name convention: cozy-<kebab-case>.js
        fileNameFor: (exportName) => `cozy-${exportName.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()}.js`,
        // Folder convention: core/modules/<kebab-case>/
        folderFor: (exportName) => `core/modules/${exportName.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()}`,
        // Version constant convention: <UPPER_SNAKE>_VERSION
        versionConstFor: (exportName) => `${exportName.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase()}_VERSION`
    });

    // =========================================================================
    // ─── ENTERPRISE HEADER ─────────────────────────────────────────────────────
    // =========================================================================

    /**
     * buildEnterpriseHeader({ moduleName, fileReference, layer, version, responsibility, zeroLogicNotes, dependsOn })
     *   Produces the exact header block format that has passed DOC-001
     *   through DOC-006 in every certified coordinator in this project.
     */
    function buildEnterpriseHeader({ moduleName, fileReference, layer, version, responsibility, zeroLogicNotes = [], dependsOn = [] }) {
        const lines = [
            "/**",
            ` * CozyOS Enterprise Framework — ${moduleName}`,
            ` * File Reference: ${fileReference}`,
            ` * Layer: ${layer}`,
            ` * Version: ${version}`,
            " *",
            " * RESPONSIBILITY",
            `${wrapCommentBlock(responsibility, "   ")}`,
        ];
        if (zeroLogicNotes.length > 0) {
            lines.push(" *", " * WHAT THIS MODULE DOES NOT DO (Zero Logic Rule)");
            for (const note of zeroLogicNotes) lines.push(`${wrapCommentBlock("- " + note, "   ")}`);
        }
        if (dependsOn.length > 0) {
            lines.push(" *", " * OPTIONAL INTEGRATIONS");
            for (const dep of dependsOn) lines.push(` *   ${dep.name} — ${dep.purpose}`);
        }
        lines.push(" */", "");
        return lines.join("\n");
    }

    function wrapCommentBlock(text, indent) {
        const words = String(text).split(/\s+/);
        const lines = [];
        let current = "";
        for (const word of words) {
            if ((current + " " + word).trim().length > 74) {
                lines.push(` *${indent}${current.trim()}`);
                current = word;
            } else {
                current = (current + " " + word).trim();
            }
        }
        if (current) lines.push(` *${indent}${current.trim()}`);
        return lines.join("\n");
    }

    // =========================================================================
    // ─── ARCHITECTURE / SECURITY / VERSIONING REQUIREMENTS ────────────────────
    // These are TEXT SNIPPETS (real, working code) — builder-templates.js
    // splices them directly into generated files. Every snippet here is
    // copied from patterns already certified ENTERPRISE_CERTIFIED in this
    // project, not invented for this rule library.
    // =========================================================================

    const SECURITY_SNIPPETS = Object.freeze({
        forbiddenKeysConst: `const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);`,
        safeMergeHelper: (className) => `        // Merges \`patch\` onto a clone of \`base\`, rejecting __proto__/
        // constructor/prototype keys at every level — the single merge path
        // every update method routes through.
        #safeMerge(base, patch) {
            const result = this.#deepClone(base);
            if (!patch || typeof patch !== "object") return result;
            for (const key of Object.keys(patch)) {
                if (FORBIDDEN_KEYS.has(key)) continue;
                const value = patch[key];
                if (value && typeof value === "object" && !Array.isArray(value) && result[key] && typeof result[key] === "object" && !Array.isArray(result[key])) {
                    result[key] = this.#safeMerge(result[key], value);
                } else {
                    result[key] = this.#deepClone(value);
                }
            }
            return result;
        }`,
        escapeHtmlHelper: `        #escapeHtml(value) {
            const str = String(value === undefined || value === null ? "" : value);
            return str
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#39;");
        }`
    });

    const CLONE_FREEZE_SNIPPETS = Object.freeze({
        deepClone: `        #deepClone(value) {
            if (typeof structuredClone === "function") {
                try { return structuredClone(value); } catch (_err) { /* fall through */ }
            }
            try { return JSON.parse(JSON.stringify(value)); } catch (_err) { return value; }
        }`,
        deepFreeze: `        #deepFreeze(obj) {
            if (obj && typeof obj === "object" && !Object.isFrozen(obj)) {
                Object.getOwnPropertyNames(obj).forEach((key) => this.#deepFreeze(obj[key]));
                Object.freeze(obj);
            }
            return obj;
        }`
    });

    const EVENT_BUS_SNIPPET = `        on(eventName, handler) {
            if (typeof eventName !== "string" || !eventName.trim()) throw new TypeError("[__MODULE_TAG__] on(): eventName must be a non-empty string.");
            if (typeof handler !== "function") throw new TypeError("[__MODULE_TAG__] on(): handler must be a function.");
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
            if (typeof handler !== "function") throw new TypeError("[__MODULE_TAG__] once(): handler must be a function.");
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
        }`;

    function versionGuardSnippet(exportName, versionConst) {
        return `    if (window.CozyOS.${exportName} && typeof window.CozyOS.${exportName}.getVersion === "function") {
        const existingVersion = window.CozyOS.${exportName}.getVersion();
        if (existingVersion !== ${versionConst}) {
            throw new Error(\`[CozyOS Framework Execution Error] VERSION_CONFLICT: ${exportName} existing v\${existingVersion} conflicts with load target v\${${versionConst}}.\`);
        }
        return;
    }`;
    }

    function serviceRegistryRegistrationSnippet(exportName, category, description) {
        return `    // Auto-register with the Service Registry — retries if it isn't
    // loaded yet (load order isn't guaranteed), instead of only trying once.
    (function registerWithServiceRegistry(descriptor) {
        function attempt() {
            if (typeof window.CozyOS.registerCoordinator !== "function") return false;
            try { window.CozyOS.registerCoordinator(descriptor); } catch (_err) { /* non-fatal */ }
            return true;
        }
        if (attempt()) return;
        window.CozyOS.__pendingCoordinatorRegistrations = window.CozyOS.__pendingCoordinatorRegistrations || [];
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
        name: "${exportName}",
        category: "${category}",
        icon: "${exportName.toLowerCase()}.svg",
        description: "${description}"
    });`;
    }

    // =========================================================================
    // ─── DIAGNOSTICS / AUDIT / IMPORT-EXPORT REQUIREMENTS ─────────────────────
    // Structured metadata (not code) describing WHAT a generated module must
    // include — builder-templates.js reads these to decide what to splice in.
    // =========================================================================

    const DIAGNOSTICS_REQUIREMENTS = Object.freeze({
        requiredFields: ["moduleVersion", "dependencies", "integrationCount", "certificationStatus"],
        boundedArrayCap: 500,
        memoryBaselineRange: [4.5, 7.0]
    });

    const AUDIT_REQUIREMENTS = Object.freeze({
        appendOnly: true,
        capped: true,
        requiredEntryFields: ["id", "timestamp", "action", "msg"]
    });

    const IMPORT_EXPORT_REQUIREMENTS = Object.freeze({
        exportMethodName: "exportSnapshot",
        importMethodName: "importSnapshot",
        mergeStrategies: ["merge", "replace"],
        conflictResolution: "keep-latest-updatedDate"
    });

    const CERTIFICATION_REQUIREMENTS = Object.freeze([
        "IIFE module wrapper with \"use strict\"",
        "Enterprise header (Version / File Reference / Layer / Responsibilities)",
        "getVersion() and version-conflict guard on load",
        "Class-based coordinator with private (#) fields",
        "Object.freeze() on exported/returned records",
        "#deepClone() and #deepFreeze() helpers",
        "Single window.CozyOS.<Name> = new <Class>() export",
        "Prototype-pollution guard (FORBIDDEN_KEYS) on every merge path",
        "No hardcoded secrets",
        "#escapeHtml() helper (even if unused today)",
        "Full on/off/once/emit event bus with eventName type validation",
        "Map-based registries with create/read/update/delete/list/count/has/merge/snapshot",
        "exportSnapshot()/importSnapshot() with an explicit mergeStrategy option",
        "Bounded audit/timeline arrays (cap at 500, shift() when exceeded)",
        "Declared `dependencies` array in getDiagnosticsReport()",
        "isVersionCompatible()-style compatibility checker",
        "Documentation: substantive header, inline comments on non-obvious logic",
        "Service Registry auto-registration (registerCoordinator, if present)"
    ]);

    // =========================================================================
    // ─── HTML / CSS / DASHBOARD DESIGN TOKENS ──────────────────────────────────
    // Same design system as certification-dashboard.css, reused here so every
    // CozyOS generated UI looks and behaves consistently.
    // =========================================================================

    const DESIGN_TOKENS_CSS = `:root {
    --cz-bg: #0b0f19; --cz-panel: #ffffff; --cz-panel-alt: #f6f7fb; --cz-sidebar: #10141f;
    --cz-sidebar-hover: #1b2130; --cz-sidebar-active: #2563eb; --cz-border: #e4e6ef;
    --cz-text: #101321; --cz-text-muted: #6b7280; --cz-text-inverse: #e7e9f2;
    --cz-accent: #2563eb; --cz-accent-soft: #eef2ff;
    --cz-critical: #dc2626; --cz-high: #ea580c; --cz-medium: #ca8a04; --cz-low: #2563eb; --cz-info: #16a34a;
    --cz-ready: #16a34a; --cz-warn: #ca8a04; --cz-blocked: #dc2626;
    --cz-radius: 10px; --cz-shadow: 0 1px 2px rgba(16,19,33,.06), 0 4px 16px rgba(16,19,33,.06);
    --cz-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}`;

    const HTML_CONVENTIONS = Object.freeze({
        requiredSections: ["sidebar", "toolbar", "main-content-table", "form-dialog", "status-indicator", "notification-area"],
        rootElementIdPattern: (exportName) => `cozy-${exportName.toLowerCase()}-root`
    });

    const CODING_STANDARDS = Object.freeze([
        "Private fields (#) for all internal state — never public mutable properties.",
        "Every method that accepts external input validates required fields before mutating state.",
        "Every mutation logs an audit entry and, where meaningful, a domain event.",
        "No two-space-vs-four-space mixing — 4-space indent throughout, matching this project's existing coordinators.",
        "No nested template literals (backtick-in-${}) — CozyCertification's syntax heuristic doesn't track ${} boundaries and will false-positive on them; extract inner template output to a named variable first."
    ]);

    // =========================================================================
    // ─── PUBLIC SURFACE ─────────────────────────────────────────────────────────
    // =========================================================================

    class CozyOSBuilderRules {
        getVersion() { return RULES_VERSION; }

        getDiagnosticsReport() {
            return Object.freeze({
                moduleVersion: RULES_VERSION,
                ruleCategories: 9,
                certificationRequirementCount: CERTIFICATION_REQUIREMENTS.length,
                dependencies: [],
                integrationCount: 0
            });
        }

        // ---- accessors (all return frozen/immutable data or pure functions) ----
        get naming() { return NAMING_RULES; }
        get security() { return SECURITY_SNIPPETS; }
        get cloneFreeze() { return CLONE_FREEZE_SNIPPETS; }
        get eventBusSnippet() { return EVENT_BUS_SNIPPET; }
        get diagnosticsRequirements() { return DIAGNOSTICS_REQUIREMENTS; }
        get auditRequirements() { return AUDIT_REQUIREMENTS; }
        get importExportRequirements() { return IMPORT_EXPORT_REQUIREMENTS; }
        get certificationRequirements() { return CERTIFICATION_REQUIREMENTS; }
        get designTokensCss() { return DESIGN_TOKENS_CSS; }
        get htmlConventions() { return HTML_CONVENTIONS; }
        get codingStandards() { return CODING_STANDARDS; }

        buildEnterpriseHeader(config) { return buildEnterpriseHeader(config); }
        versionGuardSnippet(exportName, versionConst) { return versionGuardSnippet(exportName, versionConst); }
        serviceRegistryRegistrationSnippet(exportName, category, description) { return serviceRegistryRegistrationSnippet(exportName, category, description); }
    }

    if (window.CozyOS.BuilderRules && typeof window.CozyOS.BuilderRules.getVersion === "function") {
        const existingVersion = window.CozyOS.BuilderRules.getVersion();
        if (existingVersion !== RULES_VERSION) {
            throw new Error(`[CozyOS Framework Execution Error] VERSION_CONFLICT: BuilderRules existing v${existingVersion} conflicts with load target v${RULES_VERSION}.`);
        }
        return;
    }

    window.CozyOS.BuilderRules = new CozyOSBuilderRules();

    if (typeof window.CozyOS.registerCoordinator === "function") {
        try {
            window.CozyOS.registerCoordinator({
                name: "BuilderRules", category: "Code Generation", icon: "builder-rules.svg",
                description: "CozyBuilder's rule library — CozyOS Enterprise header, naming, security, and design-token conventions used by builder-templates.js."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
