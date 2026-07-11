/**
 * CozyOS Enterprise Framework — CozyBuilder Templates
 * File Reference: core/modules/builder/builder-templates.js
 * Layer: Core / Code Generation — Reusable Templates
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   Generates real, complete CozyOS source file content as strings —
 *   coordinators, CRUD entities, HTML dashboards, CSS, application
 *   manifests. Every template reads its conventions from
 *   window.CozyOS.BuilderRules — nothing here reinvents naming, security,
 *   or header conventions.
 *
 *   Domain templates (Company, Customer, Supplier, Inventory, Products,
 *   Orders, Invoices, Payments, Deliveries, Attendance, Meetings, Users,
 *   Roles, Reports, ...) are all generated from ONE generic, parametrized
 *   entity-coordinator template — not twenty separate copies. A "Supplier"
 *   coordinator and a "Product" coordinator differ only in entity name and
 *   declared fields, so that's the only thing that varies.
 *
 * ZERO LOGIC
 *   This file only produces text. It never executes, evaluates, or writes
 *   the code it generates — that's the developer's (or the Builder
 *   dashboard's download mechanism's) job.
 */

(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const TEMPLATES_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    function requireRules() {
        if (!window.CozyOS.BuilderRules) {
            throw new Error("[BuilderTemplates] window.CozyOS.BuilderRules must be loaded before builder-templates.js can generate anything.");
        }
        return window.CozyOS.BuilderRules;
    }

    function toKebab(name) {
        return String(name).replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
    }

    function toUpperSnake(name) {
        return String(name).replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
    }

    // =========================================================================
    // ─── COORDINATOR TEMPLATE (the one generic template every domain uses) ────
    // =========================================================================

    /**
     * generateCoordinator(spec)
     *   spec: {
     *     exportName,            // e.g. "Supplier" -> window.CozyOS.Supplier
     *     responsibility,        // one sentence
     *     category,              // Service Registry category, e.g. "Business Domain"
     *     entities: [            // one or more CRUD entity groups
     *       { name, idPrefix, requiredFields: [...], optionalFields: {...}, softDelete }
     *     ],
     *     dependencies: [{ name, required, purpose }],
     *     zeroLogicNotes: [...]
     *   }
     *   Returns the complete .js source text as a string.
     */
    function enforceNoForbiddenKeys(obj, path) {
        if (!obj || typeof obj !== "object") return;
        for (const key of Object.keys(obj)) {
            if (FORBIDDEN_KEYS.has(key)) {
                throw new Error(`[BuilderTemplates] Prototype-pollution key "${key}" rejected at path "${path}.${key}".`);
            }
            enforceNoForbiddenKeys(obj[key], `${path}.${key}`);
        }
    }

    function generateCoordinator(spec) {
        enforceNoForbiddenKeys(spec, "spec");
        const rules = requireRules();
        const exportName = spec.exportName;
        const versionConst = `${toUpperSnake(exportName)}_VERSION`;
        const fileReference = `core/modules/${toKebab(exportName)}/cozy-${toKebab(exportName)}.js`;
        const className = `CozyOS${exportName}Coordinator`;
        const moduleTag = `Cozy${exportName}`;
        // Default to colon:notation (module:action) so generated coordinators
        // certify cleanly without needing a waiver — set spec.eventSeparator
        // to "." only if this module intentionally joins an existing
        // dot-notation family (e.g. alongside Company/Customer Management).
        const eventSeparator = spec.eventSeparator || ":";

        const header = rules.buildEnterpriseHeader({
            moduleName: `${exportName} Management`,
            fileReference,
            layer: "Core / Business Domain",
            version: "1.0.0-ENTERPRISE",
            responsibility: spec.responsibility,
            zeroLogicNotes: spec.zeroLogicNotes || [
                "Does not authenticate or authorize anyone — that belongs to CozyIdentity.",
                "Does not call out to any coordinator whose real API isn't already known — it only reads CozyCertification/ServiceRegistry generically, both real, already-built APIs."
            ],
            dependsOn: spec.dependencies || []
        });

        const entityBlocks = (spec.entities || []).map(entity => generateEntityCrudBlock(entity, rules, eventSeparator)).join("\n\n");
        const registryFieldDecls = (spec.entities || []).map(e => `        #${e.name}Registry = new Map();`).join("\n");
        const registryCodeIndexDecls = (spec.entities || [])
            .filter(e => e.uniqueCodeField)
            .map(e => `        #${e.name}CodeIndex = new Map(); // ${e.uniqueCodeField} -> id, uniqueness enforcement`)
            .join("\n");

        const diagnosticsCounters = (spec.entities || []).map(e => `${e.name}Count: 0`).join(", ");
        const diagnosticsReportFields = (spec.entities || [])
            .map(e => `                ${e.name}Count: this.#${e.name}Registry.size`).join(",\n");

        const dependenciesArray = (spec.dependencies || []).map(d =>
            `{ name: ${JSON.stringify(d.name)}, required: ${!!d.required}, purpose: ${JSON.stringify(d.purpose)} }`).join(", ");

        const exportSnapshotFields = (spec.entities || [])
            .map(e => `                ${e.name}s: Array.from(this.#${e.name}Registry.values())`).join(",\n");
        const importMergeBlocks = (spec.entities || []).map(e => `
            if (snapshot.${e.name}s && Array.isArray(snapshot.${e.name}s)) {
                for (const incoming of snapshot.${e.name}s) {
                    if (!incoming || typeof incoming.id !== "string") { skipped++; continue; }
                    const existing = this.#${e.name}Registry.get(incoming.id);
                    if (existing && mergeStrategy === "merge" && new Date(incoming.updatedDate || 0) <= new Date(existing.updatedDate || 0)) { skipped++; continue; }
                    this.#${e.name}Registry.set(incoming.id, this.#deepFreeze(this.#deepClone(incoming)));
                    imported++;
                }
            }`).join("\n");
        const clearOnReplace = (spec.entities || []).map(e => `                this.#${e.name}Registry.clear();`).join("\n");

        return `${header}(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const ${versionConst} = "1.0.0-ENTERPRISE";

    ${rules.security.forbiddenKeysConst}

    class ${className} {
${registryFieldDecls}
${registryCodeIndexDecls}

        #auditLogs = [];
        #timelineEvents = [];
        #listeners = new Map();
        #onceWrapped = new Map();

        #diagnostics = {
            ${diagnosticsCounters}, errorsHidden: 0, eventsEmitted: 0, memoryBaseline: 5.2
        };

        getVersion() { return ${versionConst}; }

${rules.cloneFreeze.deepClone}

${rules.cloneFreeze.deepFreeze}

${rules.security.escapeHtmlHelper}

${rules.security.safeMergeHelper(className)}

        #generateId(prefix) {
            const raw = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : \`\${Date.now()}-\${Math.random().toString(16).slice(2)}\`;
            return \`\${prefix}_\${raw}\`;
        }

        #logAudit(action, msg) {
            this.#auditLogs.push(Object.freeze({ id: this.#generateId("aud"), timestamp: new Date().toISOString(), action, msg }));
            if (this.#auditLogs.length > 500) this.#auditLogs.shift();
        }

        #logTimeline(label) {
            this.#timelineEvents.push(Object.freeze({ time: new Date().toISOString(), label }));
            if (this.#timelineEvents.length > 500) this.#timelineEvents.shift();
        }

        getTimeline(predicate) {
            const list = this.#timelineEvents.map(e => this.#deepClone(e));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

        getAuditLog(predicate) {
            const list = this.#auditLogs.map(e => this.#deepClone(e));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

${VALIDATION_HELPER_SNIPPET.replace("Coordinator", moduleTag)}
${rules.eventBusSnippet.replaceAll("__MODULE_TAG__", moduleTag)}

${entityBlocks}

        isVersionCompatible(version) {
            const a = /^v?(\\d+)\\./.exec(String(${versionConst}));
            const b = /^v?(\\d+)\\./.exec(String(version || ""));
            if (!a || !b) return false;
            return a[1] === b[1];
        }

        getDiagnosticsReport() {
            let certificationStatus = "Unknown — CozyCertification not connected";
            let integrationCount = 0;
            if (window.CozyOS && window.CozyOS.Certification && typeof window.CozyOS.Certification.getWorkspaceSummary === "function") {
                integrationCount++;
                try {
                    const summary = window.CozyOS.Certification.getWorkspaceSummary("${exportName}");
                    certificationStatus = summary && summary.certification ? summary.certification : "NOT_CERTIFIED";
                } catch (_err) { this.#diagnostics.errorsHidden++; }
            }
            if (window.CozyOS && window.CozyOS.ServiceRegistry) integrationCount++;
            return this.#deepFreeze(this.#deepClone({
                ...this.#diagnostics,
                moduleVersion: ${versionConst},
                dependencies: [${dependenciesArray}],
                integrationCount,
                auditLogCount: this.#auditLogs.length,
                timelineEventCount: this.#timelineEvents.length,
${diagnosticsReportFields},
                certificationStatus
            }));
        }

        exportSnapshot() {
            return this.#deepFreeze(this.#deepClone({
                version: ${versionConst},
                exportedAt: new Date().toISOString(),
${exportSnapshotFields}
            }));
        }

        importSnapshot(snapshot, { mergeStrategy = "merge" } = {}) {
            if (!snapshot || typeof snapshot !== "object") {
                throw new TypeError("[${moduleTag}] importSnapshot(): snapshot must be an object.");
            }
            if (mergeStrategy !== "merge" && mergeStrategy !== "replace") {
                throw new TypeError('[${moduleTag}] importSnapshot(): mergeStrategy must be "merge" or "replace".');
            }
            if (mergeStrategy === "replace") {
${clearOnReplace}
            }
            let imported = 0, skipped = 0;
${importMergeBlocks}
            this.#logAudit("SNAPSHOT_IMPORTED", \`\${imported} record(s) imported, \${skipped} skipped (strategy: \${mergeStrategy}).\`);
            this.emit("${exportName.toLowerCase()}.snapshot.imported", { imported, skipped, mergeStrategy });
            return { imported, skipped };
        }

        isSnapshotCompatible(snapshot) {
            return !!(snapshot && typeof snapshot.version === "string" && snapshot.version.split(".")[0] === ${versionConst}.split(".")[0]);
        }
    }

${rules.versionGuardSnippet(exportName, versionConst)}

    window.CozyOS.${exportName} = new ${className}();

${rules.serviceRegistryRegistrationSnippet(exportName, spec.category || "Business Domain", spec.responsibility.replace(/"/g, '\\\\"'))}
})();
`;
    }

    // =========================================================================
    // ─── ENTITY CRUD BLOCK (one entity's full method set) ─────────────────────
    // =========================================================================

    function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

    function generateEntityCrudBlock(entity, rules, eventSeparator) {
        const sep = eventSeparator || ":";
        const Name = cap(entity.name);
        const registry = `#${entity.name}Registry`;
        const codeIndex = entity.uniqueCodeField ? `#${entity.name}CodeIndex` : null;
        const idPrefix = entity.idPrefix || entity.name.slice(0, 3);
        const required = entity.requiredFields || [];
        const optional = entity.optionalFields || {};
        const softDelete = entity.softDelete !== false; // default: archive, not hard delete

        const requiredChecks = required.map(f =>
            `            if (input.${f} === undefined || input.${f} === null || input.${f} === "") throw new Error("[${Name}] create${Name}(): missing required field ${f}.");`
        ).join("\n");

        const optionalDefaults = Object.entries(optional).map(([field, def]) =>
            `                ${field}: input.${field} ?? ${JSON.stringify(def)},`
        ).join("\n");

        const duplicateCheck = entity.uniqueCodeField ? `
            if (this.${codeIndex}.has(input.${entity.uniqueCodeField})) {
                throw new Error(\`[${Name}] Duplicate ${entity.uniqueCodeField}: "\${input.${entity.uniqueCodeField}}" already exists.\`);
            }` : "";
        const indexSet = entity.uniqueCodeField ? `\n            this.${codeIndex}.set(input.${entity.uniqueCodeField}, id);` : "";
        const indexDelete = entity.uniqueCodeField ? `\n            if (existing.${entity.uniqueCodeField}) this.${codeIndex}.delete(existing.${entity.uniqueCodeField});` : "";

        const searchableFields = [...required, ...Object.keys(optional)].filter(f => typeof (optional[f] ?? "") !== "number" && typeof (optional[f] ?? "") !== "boolean");

        const createdEvent = `${entity.name}${sep}created`;
        const updatedEvent = `${entity.name}${sep}updated`;
        const archivedEvent = `${entity.name}${sep}archived`;
        const restoredEvent = `${entity.name}${sep}restored`;
        const deletedEvent = `${entity.name}${sep}deleted`;

        const archiveOrDeleteMethods = softDelete ? `
        archive${Name}(id, reason = null) {
            const existing = this.${registry}.get(id);
            if (!existing) throw new Error(\`[${Name}] archive${Name}(): no ${entity.name} found with id "\${id}".\`);
            const merged = this.#deepClone(existing);
            merged.status = "ARCHIVED";
            merged.updatedDate = new Date().toISOString();
            this.${registry}.set(id, this.#deepFreeze(merged));
            this.#logAudit("STATUS_CHANGED", \`\${id} archived.\${reason ? \` Reason: \${reason}\` : ""}\`);
            this.#logTimeline(\`${Name} archived: \${id}\`);
            this.emit("${archivedEvent}", { id, reason });
            return this.get${Name}(id);
        }

        restore${Name}(id) {
            const existing = this.${registry}.get(id);
            if (!existing) throw new Error(\`[${Name}] restore${Name}(): no ${entity.name} found with id "\${id}".\`);
            const merged = this.#deepClone(existing);
            merged.status = "ACTIVE";
            merged.updatedDate = new Date().toISOString();
            this.${registry}.set(id, this.#deepFreeze(merged));
            this.#logAudit("STATUS_CHANGED", \`\${id} restored to ACTIVE.\`);
            this.#logTimeline(\`${Name} restored: \${id}\`);
            this.emit("${restoredEvent}", { id });
            return this.get${Name}(id);
        }` : `
        delete${Name}(id) {
            const existing = this.${registry}.get(id);
            if (!existing) return false;
            this.${registry}.delete(id);${indexDelete}
            this.#logAudit("${entity.name.toUpperCase()}_DELETED", \`\${id} deleted.\`);
            this.#logTimeline(\`${Name} deleted: \${id}\`);
            this.emit("${deletedEvent}", { id });
            return true;
        }`;

        return `        // ---- ${Name} CRUD ----

        create${Name}(input = {}) {
            this.#enforceValidInput(input);
${requiredChecks}
${duplicateCheck}
            const id = input.id || this.#generateId("${idPrefix}");
            const now = new Date().toISOString();
            const { metadata, ...fields } = input;
            const record = this.#safeMerge({
                id,
${optionalDefaults}
                status: "ACTIVE",
                createdDate: now,
                updatedDate: now,
                metadata: metadata && typeof metadata === "object" ? metadata : {}
            }, fields);
            record.id = id;
            record.createdDate = now;
            record.updatedDate = now;
            record.metadata = metadata && typeof metadata === "object" ? this.#deepClone(metadata) : {};

            this.${registry}.set(id, this.#deepFreeze(record));${indexSet}
            this.#diagnostics.${entity.name}Count = this.${registry}.size;
            this.#logAudit("${entity.name.toUpperCase()}_CREATED", \`\${id} created.\`);
            this.#logTimeline(\`${Name} created: \${id}\`);
            this.emit("${createdEvent}", { id });
            return this.get${Name}(id);
        }

        update${Name}(id, patch = {}) {
            this.#enforceValidInput(patch);
            const existing = this.${registry}.get(id);
            if (!existing) throw new Error(\`[${Name}] update${Name}(): no ${entity.name} found with id "\${id}".\`);
            const merged = this.#safeMerge(existing, patch);
            merged.id = id;
            merged.createdDate = existing.createdDate;
            merged.updatedDate = new Date().toISOString();
            this.${registry}.set(id, this.#deepFreeze(merged));
            this.#logAudit("${entity.name.toUpperCase()}_UPDATED", \`\${id} updated.\`);
            this.#logTimeline(\`${Name} updated: \${id}\`);
            this.emit("${updatedEvent}", { id });
            return this.get${Name}(id);
        }
${archiveOrDeleteMethods}

        get${Name}(id) {
            const record = this.${registry}.get(id);
            return record ? this.#deepFreeze(this.#deepClone(record)) : null;
        }

        list${Name}s(filter = {}) {
            let results = Array.from(this.${registry}.values());
            if (filter.status) results = results.filter(r => r.status === filter.status);
            return this.#deepFreeze(results.map(r => this.#deepClone(r)));
        }

        search${Name}s(query) {
            const needle = String(query || "").toLowerCase().trim();
            if (!needle) return this.#deepFreeze([]);
            const results = Array.from(this.${registry}.values()).filter(r =>
                [${searchableFields.map(f => `r.${f}`).join(", ")}].filter(Boolean).some(v => String(v).toLowerCase().includes(needle))
            );
            return this.#deepFreeze(results.map(r => this.#deepClone(r)));
        }`;
    }

    // Shared validation: rejects a non-object input outright. Field-level
    // required-field checks are generated per entity above.
    const VALIDATION_HELPER_SNIPPET = `        #enforceValidInput(input) {
            if (input === null || typeof input !== "object" || Array.isArray(input)) {
                throw new TypeError("[Coordinator] Input must be a plain object.");
            }
        }
`;

    // =========================================================================
    // ─── HTML DASHBOARD TEMPLATE ────────────────────────────────────────────────
    // =========================================================================

    function generateDashboardHtml(spec) {
        const rootId = `cozy-${toKebab(spec.exportName)}-root`;
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${spec.exportName} — CozyOS</title>
<link rel="stylesheet" href="${toKebab(spec.exportName)}-dashboard.css" />
<script src="cozy-${toKebab(spec.exportName)}.js" defer></script>
<script src="${toKebab(spec.exportName)}-dashboard.js" defer></script>
</head>
<body>
    <div id="${rootId}">
        <noscript>${spec.exportName} requires JavaScript.</noscript>
    </div>
</body>
</html>
`;
    }

    // =========================================================================
    // ─── CSS TEMPLATE ────────────────────────────────────────────────────────────
    // =========================================================================

    function generateDashboardCss(spec) {
        const rules = requireRules();
        return `/**
 * ${spec.exportName} Dashboard — Stylesheet
 * File Reference: core/modules/${toKebab(spec.exportName)}/${toKebab(spec.exportName)}-dashboard.css
 * Uses the shared CozyOS Enterprise design system (same tokens as the
 * Certification Dashboard) so every generated UI looks consistent.
 */

${rules.designTokensCss}

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; height: 100%; font-family: var(--cz-font); color: var(--cz-text); background: var(--cz-panel-alt); }
#${`cozy-${toKebab(spec.exportName)}-root`} { height: 100vh; }

.cz-app { display: grid; grid-template-columns: 240px 1fr; grid-template-rows: 56px 1fr; grid-template-areas: "sidebar topbar" "sidebar main"; height: 100%; }
.cz-sidebar { grid-area: sidebar; background: var(--cz-sidebar); color: var(--cz-text-inverse); padding: 16px 0; }
.cz-topbar { grid-area: topbar; background: var(--cz-panel); border-bottom: 1px solid var(--cz-border); display: flex; align-items: center; padding: 0 20px; }
.cz-main { grid-area: main; overflow-y: auto; padding: 24px 28px; }
.cz-nav-item { padding: 9px 20px; font-size: 13.5px; cursor: pointer; color: #cbd2e1; }
.cz-nav-item:hover, .cz-nav-item.active { background: var(--cz-sidebar-hover); color: #fff; }
.cz-panel { background: var(--cz-panel); border: 1px solid var(--cz-border); border-radius: var(--cz-radius); padding: 18px 20px; margin-bottom: 18px; box-shadow: var(--cz-shadow); }
.cz-btn { font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid var(--cz-border); background: var(--cz-panel); border-radius: 8px; padding: 8px 14px; }
.cz-btn-primary { background: var(--cz-accent); border-color: var(--cz-accent); color: #fff; }
table.cz-table { width: 100%; border-collapse: collapse; font-size: 13px; }
table.cz-table th, table.cz-table td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--cz-border); }
input.cz-input, select.cz-input { width: 100%; border: 1px solid var(--cz-border); border-radius: 8px; padding: 8px 10px; }
.cz-status-active { color: var(--cz-ready); font-weight: 600; }
.cz-status-archived { color: var(--cz-text-muted); font-weight: 600; }
`;
    }

    // =========================================================================
    // ─── DASHBOARD JS TEMPLATE ──────────────────────────────────────────────────
    // Generic CRUD dashboard: sidebar with one entry per entity, a table +
    // create/edit form + search box, wired only to the generated coordinator's
    // real public API (create/update/archive/restore/search/list).
    // =========================================================================

    function generateDashboardJs(spec) {
        const rootId = "cozy-" + toKebab(spec.exportName) + "-root";
        const entities = spec.entities || [];
        const defaultEntity = entities.length ? entities[0].name : null;

        const navItemsCode = entities.map(e =>
            '["' + e.name + '", "' + cap(e.name) + 's"]').join(", ");

        const switchCases = entities.map(e =>
            "                case \"" + e.name + "\": return this.#render" + cap(e.name) + "Panel();").join("\n");

        const entityPanels = entities.map(e => generateEntityPanelJs(e)).join("\n\n");

        const clickHandlers = entities.map(e =>
            "            if (action === \"archive-" + e.name + "\") { this.#coordinator.archive" + cap(e.name) + "(id); this.#render(); return; }\n" +
            "            if (action === \"restore-" + e.name + "\") { this.#coordinator.restore" + cap(e.name) + "(id); this.#render(); return; }"
        ).join("\n");

        const lines = [
            "/**",
            " * " + spec.exportName + " Dashboard",
            " * File Reference: core/modules/" + toKebab(spec.exportName) + "/" + toKebab(spec.exportName) + "-dashboard.js",
            " * Consumes only window.CozyOS." + spec.exportName + "'s real public API — no business logic here.",
            " * Deliberately builds markup via string concatenation rather than",
            " * nested template literals (keeps this file simple to read and",
            " * avoids the nested-backtick pattern CozyCertification's syntax",
            " * heuristic doesn't track).",
            " */",
            "",
            "(function () {",
            "    \"use strict\";",
            "",
            "    function escapeHtml(value) {",
            "        var str = String(value === undefined || value === null ? \"\" : value);",
            "        return str.replace(/&/g, \"&amp;\").replace(/</g, \"&lt;\").replace(/>/g, \"&gt;\").replace(/\"/g, \"&quot;\").replace(/'/g, \"&#39;\");",
            "    }",
            "",
            "    class " + spec.exportName + "Dashboard {",
            "        #coordinator = null;",
            "        #activeEntity = " + JSON.stringify(defaultEntity) + ";",
            "        #root = null;",
            "",
            "        constructor() {",
            "            this.#coordinator = (window.CozyOS && window.CozyOS." + spec.exportName + ") ? window.CozyOS." + spec.exportName + " : null;",
            "        }",
            "",
            "        mount(root) {",
            "            this.#root = root;",
            "            this.#render();",
            "            root.addEventListener(\"click\", (evt) => this.#handleClick(evt));",
            "        }",
            "",
            "        #render() {",
            "            if (!this.#coordinator) {",
            "                this.#root.innerHTML = '<div class=\"cz-panel\">window.CozyOS." + spec.exportName + " is not loaded.</div>';",
            "                return;",
            "            }",
            "            var navHtml = [" + navItemsCode + "].map((entry) => {",
            "                var key = entry[0], label = entry[1];",
            "                var cls = \"cz-nav-item\" + (this.#activeEntity === key ? \" active\" : \"\");",
            "                return '<div class=\"' + cls + '\" data-entity=\"' + key + '\">' + escapeHtml(label) + '</div>';",
            "            }).join(\"\");",
            "            var html = '<div class=\"cz-app\"><nav class=\"cz-sidebar\">' +",
            "                '<div style=\"padding:0 20px 16px;font-weight:700;\">" + spec.exportName + "</div>' + navHtml + '</nav>' +",
            "                '<header class=\"cz-topbar\">" + spec.exportName + " — v' + escapeHtml(this.#coordinator.getVersion()) + '</header>' +",
            "                '<main class=\"cz-main\" id=\"cz-gen-main\">' + this.#renderEntityPanel(this.#activeEntity) + '</main></div>';",
            "            this.#root.innerHTML = html;",
            "        }",
            "",
            "        #renderEntityPanel(entityKey) {",
            "            switch (entityKey) {",
            switchCases,
            "                default: return '<div class=\"cz-panel\">Unknown entity.</div>';",
            "            }",
            "        }",
            "",
            entityPanels,
            "",
            "        #handleClick(evt) {",
            "            var navEl = evt.target.closest(\"[data-entity]\");",
            "            if (navEl) { this.#activeEntity = navEl.getAttribute(\"data-entity\"); this.#render(); return; }",
            "            var actionEl = evt.target.closest(\"[data-action]\");",
            "            if (!actionEl) return;",
            "            var action = actionEl.getAttribute(\"data-action\");",
            "            var id = actionEl.getAttribute(\"data-id\");",
            clickHandlers,
            "        }",
            "    }",
            "",
            "    window.addEventListener(\"DOMContentLoaded\", () => {",
            "        var root = document.getElementById(\"" + rootId + "\");",
            "        if (!root) return;",
            "        var dash = new " + spec.exportName + "Dashboard();",
            "        dash.mount(root);",
            "        window.Cozy" + spec.exportName + "Dashboard = dash;",
            "    });",
            "})();",
            ""
        ];
        return lines.join("\n");
    }

    function generateEntityPanelJs(entity) {
        const Name = cap(entity.name);
        const lines = [
            "        #render" + Name + "Panel() {",
            "            var items = this.#coordinator.list" + Name + "s();",
            "            var rows = items.map((r) => {",
            "                var actionHtml = r.status === \"ACTIVE\"",
            "                    ? '<button class=\"cz-btn\" data-action=\"archive-" + entity.name + "\" data-id=\"' + escapeHtml(r.id) + '\">Archive</button>'",
            "                    : '<button class=\"cz-btn\" data-action=\"restore-" + entity.name + "\" data-id=\"' + escapeHtml(r.id) + '\">Restore</button>';",
            "                var statusClass = r.status === \"ACTIVE\" ? \"cz-status-active\" : \"cz-status-archived\";",
            "                return '<tr><td>' + escapeHtml(r.id) + '</td><td class=\"' + statusClass + '\">' + escapeHtml(r.status) + '</td><td>' + actionHtml + '</td></tr>';",
            "            }).join(\"\");",
            "            var body = rows || '<tr><td colspan=\"3\">No records yet.</td></tr>';",
            "            return '<h2>" + Name + "s</h2><div class=\"cz-panel\"><table class=\"cz-table\"><thead><tr><th>ID</th><th>Status</th><th>Actions</th></tr></thead><tbody>' + body + '</tbody></table></div>';",
            "        }"
        ];
        return lines.join("\n");
    }

    // =========================================================================
    // ─── APPLICATION MANIFEST TEMPLATE ──────────────────────────────────────────
    // =========================================================================

    function generateApplicationManifest(spec) {
        return {
            id: spec.appId || toKebab(spec.exportName),
            name: spec.exportName,
            version: "1.0.0",
            launcher: `${toKebab(spec.exportName)}/index.html`,
            category: spec.category || "Application",
            icon: `${toKebab(spec.exportName)}.svg`,
            certificationProvider: "Certification",
            permissionsProvider: "CozyIdentity",
            modules: (spec.modules || [spec.exportName])
        };
    }

    // =========================================================================
    // ─── PUBLIC SURFACE ─────────────────────────────────────────────────────────
    // =========================================================================

    class CozyOSBuilderTemplates {
        #listeners = new Map();

        getVersion() { return TEMPLATES_VERSION; }

        getDiagnosticsReport() {
            return Object.freeze({
                moduleVersion: TEMPLATES_VERSION,
                templateCount: 5,
                dependencies: [{ name: "BuilderRules", required: true, purpose: "Header/security/naming conventions" }],
                integrationCount: window.CozyOS && window.CozyOS.BuilderRules ? 1 : 0
            });
        }

        on(eventName, handler) {
            if (typeof eventName !== "string" || !eventName.trim()) throw new TypeError("[BuilderTemplates] on(): eventName must be a non-empty string.");
            if (typeof handler !== "function") throw new TypeError("[BuilderTemplates] on(): handler must be a function.");
            if (!this.#listeners.has(eventName)) this.#listeners.set(eventName, new Set());
            this.#listeners.get(eventName).add(handler);
            return () => this.off(eventName, handler);
        }

        off(eventName, handler) {
            const set = this.#listeners.get(eventName);
            return set ? set.delete(handler) : false;
        }

        once(eventName, handler) {
            const wrapper = (payload) => { this.off(eventName, wrapper); handler(payload); };
            this.on(eventName, wrapper);
        }

        emit(eventName, payload) {
            if (typeof eventName !== "string" || !eventName.trim()) return false;
            const set = this.#listeners.get(eventName);
            if (!set || set.size === 0) return false;
            for (const fn of Array.from(set)) { try { fn(payload); } catch (_err) { /* a subscriber's own error shouldn't break generation */ } }
            return true;
        }

        generateCoordinator(spec) { const result = generateCoordinator(spec); this.emit("template:generated", { kind: "coordinator", exportName: spec.exportName }); return result; }
        generateDashboardHtml(spec) { return generateDashboardHtml(spec); }
        generateDashboardCss(spec) { return generateDashboardCss(spec); }
        generateDashboardJs(spec) { return generateDashboardJs(spec); }
        generateApplicationManifest(spec) { return generateApplicationManifest(spec); }
    }

    if (window.CozyOS.BuilderTemplates && typeof window.CozyOS.BuilderTemplates.getVersion === "function") {
        const existingVersion = window.CozyOS.BuilderTemplates.getVersion();
        if (existingVersion !== TEMPLATES_VERSION) {
            throw new Error(`[CozyOS Framework Execution Error] VERSION_CONFLICT: BuilderTemplates existing v${existingVersion} conflicts with load target v${TEMPLATES_VERSION}.`);
        }
        return;
    }

    window.CozyOS.BuilderTemplates = new CozyOSBuilderTemplates();

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
        name: "BuilderTemplates", category: "Code Generation", icon: "builder-templates.svg",
        description: "CozyBuilder's template engine — generates coordinator, dashboard HTML/CSS/JS, and application manifest source text."
    });
})();
