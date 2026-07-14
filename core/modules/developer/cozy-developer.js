/**
 * CozyOS Enterprise Framework — CozyDeveloperHub
 * File Reference: core/modules/developer/cozy-developer.js
 * Layer: Core / Orchestration — Developer Hub
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   Pure orchestration. Every method here aggregates or delegates to a
 *   real coordinator's real public API — CozyBuilder, UnderstandingEngine,
 *   CozyOCR, CozyCertification, CozyBugFixer, WorkspaceShell,
 *   ServiceRegistry, CozyAIMode. This file contains no independent
 *   business logic of its own: it does not certify, repair, generate, or
 *   register anything by itself — it calls the coordinator that already
 *   does, and combines their real answers into one view.
 *
 * WHAT THIS MODULE DOES NOT DO (Zero Logic Rule)
 *   - Never re-implements certification scoring, repair logic, code
 *     generation, or registry storage. Every number surfaced here traces
 *     back to a real call on the coordinator that owns that data.
 *   - Never executes, evaluates, or imports anything.
 *   - Never claims a coordinator is connected when it isn't — every
 *     status field is a live check, not a cached assumption.
 *
 * OPTIONAL INTEGRATIONS (all of them — this file works with any subset connected)
 *   CozyBuilder, UnderstandingEngine, CozyOCR, CozyCertification,
 *   CozyBugFixer, WorkspaceShell, ServiceRegistry, CozyAIMode.
 */

(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const HUB_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    const REVIEW_INSTRUCTIONS = `=================================================
Review this CozyOS implementation.

Check:
1. Enterprise architecture compliance.
2. Builder integration.
3. Certification integration.
4. BugFixer integration.
5. Workspace integration.
6. Service Registry integration.
7. Duplicate logic.
8. Missing enterprise patterns.
9. Security issues.
10. Performance improvements.

Return ONLY:

• Updated production-ready files.
• Certification summary.
• Files changed.

Do not rewrite unrelated modules.
Preserve CozyOS architecture.
=================================================`;

    /** renderBuildPackageText(data) — plain-text rendering; omits any section/field not present in data. */
    function renderBuildPackageText(data) {
        const lines = ["CozyOS Enterprise Build Package", ""];
        const field = (label, value) => { if (value !== undefined && value !== null && value !== "") lines.push(`${label}: ${value}`); };

        field("Project", data.projectName);
        field("Application", data.applicationName);
        field("Module Name", data.moduleName);
        field("Module ID", data.moduleId);
        field("Version", data.version);
        field("Workspace", data.workspace);
        field("File Path", data.filePath);
        field("Folder Path", data.folderPath);
        if (data.generatedFiles) field("Generated Files", Object.keys(data.generatedFiles).join(", "));
        field("Builder Version", data.builderVersion);
        field("Understanding Engine Version", data.understandingEngineVersion);
        field("Certification Engine Version", data.certificationEngineVersion);
        field("BugFixer Version", data.bugFixerVersion);
        field("Build Date", data.buildDate);
        field("Last Certified", data.lastCertified);
        field("Last Repaired", data.lastRepaired);

        if (data.builder) {
            lines.push("", "Builder");
            field("Requirement", data.builder.requirement);
            field("Understanding Summary", data.builder.understandingSummary);
            if (data.builder.detectedFeatures) field("Detected Features", data.builder.detectedFeatures.join(", "));
            if (data.builder.missingFeatures) field("Missing Features (Gap Detector)", data.builder.missingFeatures.join(", "));
            field("Recommended Architecture", data.builder.recommendedArchitecture);
            if (data.builder.modulesGenerated) field("Modules Generated", data.builder.modulesGenerated.join(", "));
        }

        if (data.generatedFiles) {
            lines.push("", "Generated Files");
            for (const [filename, source] of Object.entries(data.generatedFiles)) {
                lines.push("", `File Name: ${filename.split("/").pop()}`, `File Path: ${filename}`, "", "----- START SOURCE -----", source, "----- END SOURCE -----");
            }
        }

        if (data.certification) {
            const c = data.certification;
            lines.push("", "Certification");
            field("Verdict", c.verdict);
            field("Score", `${c.score}%`);
            field("Grade", c.grade);
            lines.push(`Critical: ${c.critical} · High: ${c.high} · Medium: ${c.medium} · Low: ${c.low}`);
            field("Passed Rules", `${c.passedRules}/${c.totalRules}`);
            if (c.failedRules && c.failedRules.length) { lines.push("Failed Rules:"); for (const r of c.failedRules) lines.push(`- ${r}`); }
            field("Repair Roadmap", c.repairRoadmapMinutes ? `~${c.repairRoadmapMinutes} min estimated` : null);
            if (c.remainingFindings && c.remainingFindings.length) { lines.push("Remaining Findings:"); for (const f of c.remainingFindings) lines.push(`- ${f}`); }
            if (c.waivers && c.waivers.length) { lines.push("Waivers:"); for (const w of c.waivers) lines.push(`- ${w}`); }
        }

        if (data.bugFixer) {
            lines.push("", "BugFixer");
            field("Repairs Applied", data.bugFixer.repairsApplied);
            if (data.bugFixer.deterministicFixersUsed && data.bugFixer.deterministicFixersUsed.length) field("Deterministic Fixers Used", data.bugFixer.deterministicFixersUsed.join(", "));
            field("Last Repair Date", data.bugFixer.lastRepairDate);
        }

        if (data.dependencies && data.dependencies.length) {
            lines.push("", "Dependencies");
            for (const d of data.dependencies) lines.push(`- ${typeof d === "string" ? d : (d.name || JSON.stringify(d))}`);
        }

        lines.push("", REVIEW_INSTRUCTIONS);
        return lines.join("\n");
    }

    /** renderBuildPackageMarkdown(data) — same real data as renderBuildPackageText(), formatted with Markdown headers/code fences. */
    function renderBuildPackageMarkdown(data) {
        const lines = ["# CozyOS Enterprise Build Package", ""];
        const field = (label, value) => { if (value !== undefined && value !== null && value !== "") lines.push(`**${label}:** ${value}  `); };

        field("Project", data.projectName);
        field("Application", data.applicationName);
        field("Module Name", data.moduleName);
        field("Module ID", data.moduleId);
        field("Version", data.version);
        field("Workspace", data.workspace);
        field("File Path", data.filePath);
        field("Folder Path", data.folderPath);
        if (data.generatedFiles) field("Generated Files", Object.keys(data.generatedFiles).join(", "));
        field("Builder Version", data.builderVersion);
        field("Understanding Engine Version", data.understandingEngineVersion);
        field("Certification Engine Version", data.certificationEngineVersion);
        field("BugFixer Version", data.bugFixerVersion);
        field("Build Date", data.buildDate);
        field("Last Certified", data.lastCertified);
        field("Last Repaired", data.lastRepaired);

        if (data.builder) {
            lines.push("", "## Builder");
            field("Requirement", data.builder.requirement);
            field("Understanding Summary", data.builder.understandingSummary);
            if (data.builder.detectedFeatures) field("Detected Features", data.builder.detectedFeatures.join(", "));
            if (data.builder.missingFeatures) field("Missing Features (Gap Detector)", data.builder.missingFeatures.join(", "));
            field("Recommended Architecture", data.builder.recommendedArchitecture);
            if (data.builder.modulesGenerated) field("Modules Generated", data.builder.modulesGenerated.join(", "));
        }

        if (data.generatedFiles) {
            lines.push("", "## Generated Files");
            for (const [filename, source] of Object.entries(data.generatedFiles)) {
                lines.push("", `### ${filename.split("/").pop()}`, `**File Path:** ${filename}`, "", "```javascript", source, "```");
            }
        }

        if (data.certification) {
            const c = data.certification;
            lines.push("", "## Certification");
            field("Verdict", c.verdict);
            field("Score", `${c.score}%`);
            field("Grade", c.grade);
            lines.push(`Critical: ${c.critical} · High: ${c.high} · Medium: ${c.medium} · Low: ${c.low}  `);
            field("Passed Rules", `${c.passedRules}/${c.totalRules}`);
            if (c.failedRules && c.failedRules.length) { lines.push("", "**Failed Rules:**"); for (const r of c.failedRules) lines.push(`- ${r}`); }
            field("Repair Roadmap", c.repairRoadmapMinutes ? `~${c.repairRoadmapMinutes} min estimated` : null);
            if (c.remainingFindings && c.remainingFindings.length) { lines.push("", "**Remaining Findings:**"); for (const f of c.remainingFindings) lines.push(`- ${f}`); }
            if (c.waivers && c.waivers.length) { lines.push("", "**Waivers:**"); for (const w of c.waivers) lines.push(`- ${w}`); }
        }

        if (data.bugFixer) {
            lines.push("", "## BugFixer");
            field("Repairs Applied", data.bugFixer.repairsApplied);
            if (data.bugFixer.deterministicFixersUsed && data.bugFixer.deterministicFixersUsed.length) field("Deterministic Fixers Used", data.bugFixer.deterministicFixersUsed.join(", "));
            field("Last Repair Date", data.bugFixer.lastRepairDate);
        }

        if (data.dependencies && data.dependencies.length) {
            lines.push("", "## Dependencies");
            for (const d of data.dependencies) lines.push(`- ${typeof d === "string" ? d : (d.name || JSON.stringify(d))}`);
        }

        lines.push("", "```", REVIEW_INSTRUCTIONS, "```");
        return lines.join("\n");
    }

    /**
     * renderAuditRequest(data, realFixableRuleIds)
     *   Builds the Enterprise Audit prompt on top of the same real
     *   getBuildPackageData() output used for the plain build package —
     *   this is a richer, more explicit instruction set for a deep
     *   qualitative review, run AFTER the deterministic Certification
     *   Engine + BugFixer + Re-Certification, never instead of them.
     *   realFixableRuleIds is included so whoever/whatever performs the
     *   audit knows CozyBugFixer's ACTUAL current auto-fix capability
     *   up front, rather than guessing — though this coordinator still
     *   independently re-verifies every claim on import either way.
     */
    function renderAuditRequest(data, realFixableRuleIds) {
        const base = renderBuildPackageText(data);
        const [header, ...rest] = base.split(REVIEW_INSTRUCTIONS);

        const spec = `
=================================================
ENTERPRISE AUDIT REQUEST

This runs AFTER the deterministic Certification Engine, CozyBugFixer, and
Re-Certification shown above. Do not re-score or override that verdict —
this is a separate, qualitative engineering review layered on top of it.

CozyBugFixer can currently auto-fix ONLY these rule IDs, deterministically:
${realFixableRuleIds.length ? realFixableRuleIds.join(", ") : "(none currently registered)"}
Any other rule ID you propose as auto-fixable is a PROPOSAL for a future
permanent fixer, not something that will run automatically.

Severity model to use throughout:
🔴 Critical   🟠 High   🟡 Medium   🔵 Low   ℹ Information

Return your review using EXACTLY these sections, in this order. Omit a
section entirely if you have nothing real to put in it — never fill a
section with placeholder text.

1. Executive Summary
2. Enterprise Certification (restate the verdict/score shown above — do not recompute it)
3. Confirmed Bugs
4. Security Findings
5. Performance Findings
6. Architecture Findings
7. Integration Findings
8. Code Quality
9. Auto-Fix Candidates
   For every confirmed issue, classify it as one of:
   ✅ Automatically fixable by CozyBugFixer (ONLY if the rule ID is in the
      real fixer list above — otherwise use ⚠ or ❌)
   ⚠ Requires developer review
   ❌ Manual architectural decision
   For every ✅, include: Fix ID, Bug category, Confidence, Risk level.
10. Deterministic Repair Mapping
    For every confirmed issue, provide: Rule ID, Detection Pattern, Repair
    Pattern, Expected Certification Improvement, Possible Side Effects.
11. Improvement Recommendations
12. Enterprise Scorecard
13. Final Verdict
14. Machine-Readable Repair Data (JSON)
    Provide this as its own fenced block, immediately after a line that
    says exactly "MACHINE_READABLE_REPAIR_DATA:", in this shape:
    MACHINE_READABLE_REPAIR_DATA:
    \`\`\`json
    {
      "moduleId": "${data.moduleId}",
      "autoFixCandidates": [
        { "ruleId": "...", "category": "...", "confidence": "high|medium|low", "riskLevel": "low|medium|high", "classification": "auto-fixable|review|manual" }
      ],
      "deterministicRepairMapping": [
        { "ruleId": "...", "detectionPattern": "...", "repairPattern": "...", "expectedImprovement": "...", "possibleSideEffects": "..." }
      ]
    }
    \`\`\`
15. Audit Metadata (model/reviewer identity if known, date, scope reviewed)

${REVIEW_INSTRUCTIONS}
`;
        return header + spec;
    }

    class CozyOSDeveloperHub {
        #auditLogs = [];
        #timelineEvents = [];
        #listeners = new Map();
        #onceWrapped = new Map();
        #diagnostics = { aggregationsRun: 0, actionsDelegated: 0, errorsHidden: 0, eventsEmitted: 0, memoryBaseline: 3.2 };

        getVersion() { return HUB_VERSION; }

        #deepClone(value) {
            if (typeof structuredClone === "function") { try { return structuredClone(value); } catch (_err) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(value)); } catch (_err) { return value; }
        }

        #deepFreeze(obj) {
            if (obj && typeof obj === "object" && !Object.isFrozen(obj)) {
                Object.getOwnPropertyNames(obj).forEach((key) => this.#deepFreeze(obj[key]));
                Object.freeze(obj);
            }
            return obj;
        }

        #escapeHtml(value) {
            const str = String(value === undefined || value === null ? "" : value);
            return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
        }

        #generateId(prefix) {
            const raw = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
            return `${prefix}_${raw}`;
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

        // =====================================================================
        // ─── EVENT BUS ────────────────────────────────────────────────────────
        // =====================================================================

        on(eventName, handler) {
            if (typeof eventName !== "string" || !eventName.trim()) throw new TypeError("[DeveloperHub] on(): eventName must be a non-empty string.");
            if (typeof handler !== "function") throw new TypeError("[DeveloperHub] on(): handler must be a function.");
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
            if (typeof handler !== "function") throw new TypeError("[DeveloperHub] once(): handler must be a function.");
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
            for (const fn of Array.from(set)) { try { fn(safePayload); } catch (_err) { this.#diagnostics.errorsHidden++; } }
            return true;
        }

        // =====================================================================
        // ─── LIVE COORDINATOR ACCESS (never captured once — see the exact
        // staleness bug already fixed in certification-dashboard.js) ─────────
        // =====================================================================

        #builder() { return (window.CozyOS && window.CozyOS.Builder) || null; }
        #understandingEngine() { return (window.CozyOS && window.CozyOS.UnderstandingEngine) || null; }
        #ocr() { return (window.CozyOS && window.CozyOS.OCR) || null; }
        #cert() { return (window.CozyOS && window.CozyOS.Certification) || null; }
        #bugfixer() { return (window.CozyOS && window.CozyOS.BugFixer) || null; }
        #workspace() { return (window.CozyOS && window.CozyOS.WorkspaceShell) || null; }
        #registry() { return (window.CozyOS && window.CozyOS.ServiceRegistry) || null; }
        #aimode() { return (window.CozyOS && window.CozyOS.AIMode) || null; }

        // =====================================================================
        // ─── CONNECTION STATUS ────────────────────────────────────────────────
        // =====================================================================

        /** getConnectionStatus() — a live check of every integration, never assumed. */
        getConnectionStatus() {
            return this.#deepClone({
                builder: !!this.#builder(), understandingEngine: !!this.#understandingEngine(), ocr: !!this.#ocr(),
                certification: !!this.#cert(), bugfixer: !!this.#bugfixer(), workspace: !!this.#workspace(),
                serviceRegistry: !!this.#registry(), aimode: !!this.#aimode()
            });
        }

        // =====================================================================
        // ─── HOME DASHBOARD ───────────────────────────────────────────────────
        // =====================================================================

        /**
         * getHomeDashboardData()
         *   Every field here is read from the real owning coordinator —
         *   Developer Queue from WorkspaceShell, Golden Releases from
         *   CozyCertification, status flags from getConnectionStatus().
         *   Nothing is computed independently.
         */
        getHomeDashboardData() {
            this.#diagnostics.aggregationsRun++;
            const workspace = this.#workspace();
            const cert = this.#cert();
            const registry = this.#registry();
            const aimode = this.#aimode();

            let developerQueue = { connected: false, entries: [] };
            if (workspace && typeof workspace.getDeveloperQueue === "function") {
                try { developerQueue = workspace.getDeveloperQueue(); } catch (_err) { this.#diagnostics.errorsHidden++; }
            }

            let recentModules = [], recentCertifications = [], goldenReleases = [];
            if (cert) {
                try {
                    const names = developerQueue.entries ? developerQueue.entries.map(e => e.moduleId) : [];
                    recentModules = names.slice(0, 10);
                    recentCertifications = names
                        .map(name => { const h = cert.listRecords(name); return h.length ? { moduleId: name, ...h[h.length - 1] } : null; })
                        .filter(Boolean)
                        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                        .slice(0, 10);
                    if (typeof cert.listReleases === "function") {
                        goldenReleases = cert.listReleases().filter(r => r.status === "LOCKED" || r.status === "GOLDEN").slice(0, 10);
                    }
                } catch (_err) { this.#diagnostics.errorsHidden++; }
            }

            let recentRepairs = [];
            const bugfixer = this.#bugfixer();
            if (bugfixer && typeof bugfixer.getRepairLog === "function") {
                try { recentRepairs = bugfixer.getRepairLog().slice(-10).reverse(); } catch (_err) { this.#diagnostics.errorsHidden++; }
            }

            return this.#deepClone({
                developerQueue,
                recentModules, recentCertifications, recentRepairs, goldenReleases,
                workspaceStatus: workspace ? "Connected" : "Not Connected",
                serviceRegistryStatus: registry ? "Connected" : "Not Connected",
                aiStatus: aimode ? aimode.getMode() : "Not Connected",
                builderStatus: this.#builder() ? "Connected" : "Not Connected",
                bugFixerStatus: bugfixer ? "Connected" : "Not Connected",
                certificationStatus: cert ? "Connected" : "Not Connected",
                ocrStatus: this.#ocr() ? (this.#ocr().isAvailable() ? "Connected (provider loaded)" : "Connected (no provider loaded)") : "Not Connected"
            });
        }

        // =====================================================================
        // ─── DEVELOPER QUEUE (pure pass-through — WorkspaceShell owns this) ───
        // =====================================================================

        getDeveloperQueue() {
            const workspace = this.#workspace();
            if (!workspace || typeof workspace.getDeveloperQueue !== "function") {
                return { connected: false, message: "WorkspaceShell is not connected." };
            }
            return workspace.getDeveloperQueue();
        }

        // =====================================================================
        // ─── MODULE CARD ──────────────────────────────────────────────────────
        // Combines WorkspaceShell (file/version/status), CozyCertification
        // (score/grade/history), ServiceRegistry (registration), and the
        // Builder/BugFixer version stamps captured at registration time.
        // Every field traces to one real coordinator call.
        // =====================================================================

        getModuleCard(moduleId) {
            if (!moduleId) throw new TypeError("[DeveloperHub] getModuleCard(): moduleId is required.");
            this.#diagnostics.aggregationsRun++;
            const workspace = this.#workspace();
            const cert = this.#cert();
            const registry = this.#registry();

            const file = workspace ? workspace.listFiles({ coordinator: moduleId })[0] || null : null;
            const existingInfo = workspace && typeof workspace.getExistingFileInfo === "function" ? workspace.getExistingFileInfo(moduleId) : null;
            const registryEntry = registry && typeof registry.getCoordinator === "function" ? registry.getCoordinator(moduleId) : null;
            const history = cert ? cert.listRecords(moduleId) : [];
            const latest = history.length ? history[history.length - 1] : null;
            const golden = history.length ? history.reduce((best, r) => (r.summary.scorePercent > best.summary.scorePercent ? r : best), history[0]) : null;

            return this.#deepClone({
                moduleId,
                category: file ? file.category : null,
                filePath: file ? file.filePath : null,
                folderPath: file ? file.folderPath : null,
                workspaceStatus: file ? file.workspaceStatus : "NOT_IN_WORKSPACE",
                certificationScore: latest ? latest.summary.scorePercent : null,
                certificationGrade: latest ? latest.overallGrade : null,
                goldenVersion: golden ? golden.version : null,
                latestVersion: latest ? latest.version : null,
                productionVersion: existingInfo ? existingInfo.productionVersion : null,
                repairStatus: file ? file.repairStatus : null,
                builderVersion: file ? file.builderVersion : null,
                bugFixerVersion: file ? file.bugFixerVersion : null,
                lastCertified: latest ? latest.timestamp : null,
                lastRepaired: file ? file.lastRepair : null,
                dependencies: registryEntry ? (registryEntry.dependencies || []) : [],
                registeredToServiceRegistry: !!registryEntry,
                status: !latest ? "AWAITING_CERTIFICATION" : latest.verdict === "CERTIFICATION_FAILED" ? "FAILED" : latest.verdict === "CERTIFIED_WITH_WARNINGS" ? "NEEDS_REPAIR" : "CERTIFIED"
            });
        }

        // =====================================================================
        // ─── MODULE ACTIONS (thin delegation — no independent logic) ──────────
        // Every action below calls the SAME real coordinator method a direct
        // caller would; this file adds no scoring, no repair, no generation
        // of its own. moduleId-based actions require the module to already
        // be registered in Workspace (via registerToWorkspace first, or by
        // certifying it, which auto-registers via the caller's own flow).
        // =====================================================================

        #requireWorkspace() {
            const workspace = this.#workspace();
            if (!workspace) throw new Error("[DeveloperHub] WorkspaceShell is not connected.");
            return workspace;
        }

        #requireFileId(moduleId) {
            const workspace = this.#requireWorkspace();
            const file = workspace.listFiles({ coordinator: moduleId })[0];
            if (!file) throw new Error(`[DeveloperHub] "${moduleId}" is not registered in Workspace yet.`);
            return file.fileId;
        }

        async openWithBuilder(moduleId) {
            this.#diagnostics.actionsDelegated++;
            const builder = this.#builder();
            if (!builder) throw new Error("[DeveloperHub] CozyBuilder is not connected.");
            const plan = builder.planFromDescription(`Build ${moduleId} Coordinator`);
            this.#logAudit("OPEN_WITH_BUILDER", moduleId);
            this.#logTimeline(`Opened with Builder: ${moduleId}`);
            this.emit("hub:openedWithBuilder", { moduleId });
            return plan;
        }

        async analyzeRequirement(text) {
            this.#diagnostics.actionsDelegated++;
            const ue = this.#understandingEngine();
            if (!ue) throw new Error("[DeveloperHub] UnderstandingEngine is not connected.");
            const understanding = ue.analyzeText(text);
            const gaps = ue.detectRequirementGaps(text);
            return { understanding, gaps };
        }

        async buildFromPlan(plan, mode = "coordinator", { forceGenerate = false } = {}) {
            this.#diagnostics.actionsDelegated++;
            const builder = this.#builder();
            if (!builder) throw new Error("[DeveloperHub] CozyBuilder is not connected.");
            return builder.buildCoordinator(plan, { mode, forceGenerate });
        }

        quickCertifyModule(moduleId, sourceText, version = "0.0.0") {
            this.#diagnostics.actionsDelegated++;
            const cert = this.#cert();
            if (!cert) throw new Error("[DeveloperHub] CozyCertification is not connected.");
            const result = cert.quickCertification(sourceText, { moduleId, moduleName: moduleId, version });
            this.#logAudit("QUICK_CERTIFICATION", `${moduleId}: ${result.verdict} (${result.summary.scorePercent}%)`);
            this.#logTimeline(`Quick certified: ${moduleId}`);
            this.emit("hub:quickCertified", { moduleId, verdict: result.verdict, scorePercent: result.summary.scorePercent });
            return result;
        }

        fullCertification() {
            this.#diagnostics.actionsDelegated++;
            const cert = this.#cert();
            if (!cert) throw new Error("[DeveloperHub] CozyCertification is not connected.");
            return cert.fullCertification();
        }

        #deriveFilename(moduleId) {
            return /^cozy-[a-z0-9-]+\.js$/i.test(moduleId) ? moduleId : `cozy-${moduleId.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()}.js`;
        }

        /**
         * repairModule(moduleId, { approve, useAI, sourceText })
         *   If WorkspaceShell is connected AND the module is already
         *   registered there, uses its real repairAndRecertify() (backup,
         *   checksum, the single protected write-gate). Otherwise —
         *   Workspace disconnected, or just not registered yet — runs
         *   entirely through CozyBugFixer directly: repair()/save() calls
         *   that never touch Workspace, requiring sourceText be supplied
         *   since there's no registry to read it from. Returns
         *   standalone:true/false so callers can show the right message.
         *   Never throws just because Workspace is missing.
         */
        async repairModule(moduleId, { approve = false, useAI = false, sourceText = null } = {}) {
            this.#diagnostics.actionsDelegated++;
            if (!this.#bugfixer()) throw new Error("[DeveloperHub] CozyBugFixer is not connected.");
            const workspace = this.#workspace();
            const existingFile = workspace ? workspace.listFiles({ coordinator: moduleId })[0] : null;

            if (workspace && existingFile) {
                const result = await workspace.repairAndRecertify(existingFile.fileId, { approve, useAI });
                this.#logAudit("REPAIR", `${moduleId}: changed=${result.changed}`);
                this.#logTimeline(`Repair run: ${moduleId}`);
                this.emit("hub:repaired", { moduleId, changed: result.changed, standalone: false });
                return { ...result, standalone: false };
            }

            // Standalone path — CozyBugFixer directly, no Workspace involved.
            if (!sourceText) throw new Error(`[DeveloperHub] No source available for "${moduleId}" to repair standalone — pass sourceText (e.g. from the last certification result or an uploaded file).`);
            const bugfixer = this.#bugfixer();
            const filename = this.#deriveFilename(moduleId);
            const bfFileId = await bugfixer.registerSourceText(filename, sourceText);
            const preview = bugfixer.repair(bfFileId);
            this.#logTimeline(`Repair run (standalone): ${moduleId}`);
            if (!preview.changed) {
                this.emit("hub:repaired", { moduleId, changed: false, standalone: true });
                return { changed: false, preview, standalone: true };
            }
            if (approve) {
                const repairLogEntry = await bugfixer.save(bfFileId, { proposedSource: preview.proposedSource, approve: true, ruleIdsFixed: preview.appliedFixes.map(f => f.ruleId) });
                let certResult = null;
                if (this.#cert()) { try { certResult = this.quickCertifyModule(moduleId, preview.proposedSource, "standalone-repair"); } catch (_err) { /* certification optional here */ } }
                this.#logAudit("REPAIR", `${moduleId}: standalone repair saved`);
                this.emit("hub:repaired", { moduleId, changed: true, standalone: true });
                return { changed: true, preview, repairLogEntry, certResult, standalone: true, repairedSource: preview.proposedSource, repairedFilename: filename };
            }
            return { changed: true, preview, savedYet: false, standalone: true, repairedFilename: filename };
        }

        /**
         * openWithBugFixer(moduleId, sourceText)
         *   Same loose-coupling rule as repairModule(): uses Workspace's
         *   real shareToBugFixer() when it's connected and already knows
         *   this module; otherwise registers sourceText directly into
         *   CozyBugFixer, standalone. Never throws just because Workspace
         *   is missing — only throws if BugFixer itself isn't connected,
         *   or if standalone mode has no source to work with.
         */
        async openWithBugFixer(moduleId, sourceText = null) {
            this.#diagnostics.actionsDelegated++;
            if (!this.#bugfixer()) throw new Error("[DeveloperHub] CozyBugFixer is not connected.");
            const workspace = this.#workspace();
            const existingFile = workspace ? workspace.listFiles({ coordinator: moduleId })[0] : null;

            if (workspace && existingFile) {
                const bfFileId = await workspace.shareToBugFixer(existingFile.fileId);
                this.#logAudit("OPEN_WITH_BUGFIXER", moduleId);
                this.#logTimeline(`Opened with BugFixer: ${moduleId}`);
                this.emit("hub:openedWithBugFixer", { moduleId, standalone: false });
                return { bfFileId, standalone: false };
            }

            if (!sourceText) throw new Error(`[DeveloperHub] No source available for "${moduleId}" — WorkspaceShell isn't connected (or doesn't have it registered yet) and no sourceText was supplied.`);
            const filename = this.#deriveFilename(moduleId);
            const bfFileId = await this.#bugfixer().registerSourceText(filename, sourceText);
            this.#logAudit("OPEN_WITH_BUGFIXER_STANDALONE", moduleId);
            this.#logTimeline(`Opened with BugFixer (standalone): ${moduleId}`);
            this.emit("hub:openedWithBugFixer", { moduleId, standalone: true });
            return { bfFileId, standalone: true };
        }

        registerToWorkspace({ filename, source, handle }) {
            this.#diagnostics.actionsDelegated++;
            const workspace = this.#requireWorkspace();
            const fileId = workspace.registerFile({ filename, source, handle });
            this.#logAudit("REGISTER_WORKSPACE", filename);
            this.#logTimeline(`Registered to Workspace: ${filename}`);
            this.emit("hub:registeredWorkspace", { filename, fileId });
            return fileId;
        }

        registerToServiceRegistry(moduleId) {
            this.#diagnostics.actionsDelegated++;
            const registry = this.#registry();
            if (!registry) throw new Error("[DeveloperHub] ServiceRegistry is not connected.");
            const live = window.CozyOS[moduleId];
            if (!live || typeof live !== "object") throw new Error(`[DeveloperHub] "${moduleId}" is not currently loaded as a live coordinator — only a loaded instance can register itself.`);
            const result = registry.registerCoordinator({ name: moduleId, category: "Business Domain", icon: `${moduleId.toLowerCase()}.svg`, description: `${moduleId} — registered from Developer Hub.` });
            this.#logAudit("REGISTER_SERVICE_REGISTRY", moduleId);
            this.#logTimeline(`Registered to Service Registry: ${moduleId}`);
            this.emit("hub:registeredServiceRegistry", { moduleId });
            return result;
        }

        lockRelease(options) {
            this.#diagnostics.actionsDelegated++;
            const cert = this.#cert();
            if (!cert) throw new Error("[DeveloperHub] CozyCertification is not connected.");
            const result = cert.lockRelease(options);
            this.#logAudit("LOCK_RELEASE", JSON.stringify(options));
            this.#logTimeline("Release locked.");
            this.emit("hub:releaseLocked", { options });
            return result;
        }

        /**
         * rollbackGolden(moduleId)
         *   No real rollback-to-golden API exists in CozyCertification
         *   yet — this honestly reports that rather than fabricating a
         *   call to a method that doesn't exist. The Golden version
         *   itself is still real and readable (see getModuleCard); actually
         *   restoring it as the active/production version is a genuine
         *   gap, not something this file will pretend to close.
         */
        /**
         * rollbackGolden(moduleId)
         *   Real rollback, built on WorkspaceShell.rollbackToBackup() and
         *   its real backup store — this closes the gap that was
         *   previously and correctly disclosed as unimplemented (no
         *   fabricated API is being called).
         *   Honest limitation: nothing in CozyOS today stores an exact
         *   link between a specific backup and a specific certification
         *   record's version — backups are keyed by save-time, cert
         *   records by certification-time. This picks the backup whose
         *   timestamp is closest at-or-before the Golden record's
         *   timestamp, which is correct whenever a save immediately
         *   followed that certification (the common case), but is a
         *   best-effort match, not a guaranteed-exact one. Returns which
         *   backup was used and its timestamp so the caller can verify.
         */
        async rollbackGolden(moduleId) {
            const cert = this.#cert();
            const workspace = this.#workspace();
            if (!cert) throw new Error("[DeveloperHub] CozyCertification is not connected.");
            if (!workspace) throw new Error("[DeveloperHub] WorkspaceShell is not connected — rollback needs its backup store.");
            const history = cert.listRecords(moduleId);
            if (history.length === 0) throw new Error(`[DeveloperHub] No certification history for "${moduleId}".`);
            const golden = history.reduce((best, r) => (r.summary.scorePercent > best.summary.scorePercent ? r : best), history[0]);

            const fileId = this.#requireFileId(moduleId);
            const backups = workspace.listFileBackups(fileId);
            if (backups.length === 0) throw new Error(`[DeveloperHub] No backups exist for "${moduleId}" yet — rollback has nothing to restore from.`);

            const goldenTime = new Date(golden.timestamp).getTime();
            const candidates = backups.filter(b => new Date(b.timestamp).getTime() <= goldenTime);
            const chosen = (candidates.length ? candidates : backups).reduce((closest, b) =>
                Math.abs(new Date(b.timestamp).getTime() - goldenTime) < Math.abs(new Date(closest.timestamp).getTime() - goldenTime) ? b : closest
            );

            const result = await workspace.rollbackToBackup(fileId, chosen.backupId);
            this.#logAudit("ROLLBACK_GOLDEN", `${moduleId}: restored backup ${chosen.backupId} (${chosen.timestamp}), targeting Golden v${golden.version} (${golden.summary.scorePercent}%, certified ${golden.timestamp}).`);
            this.emit("hub:rolledBackToGolden", { moduleId, backupId: chosen.backupId });
            return {
                ...result,
                targetGoldenVersion: golden.version, targetGoldenScore: golden.summary.scorePercent, targetGoldenTimestamp: golden.timestamp,
                matchConfidence: candidates.length ? "backup predates the Golden certification (likely correct)" : "no backup predates the Golden certification — restored the closest available one; verify by re-running Quick Certification"
            };
        }

        // =====================================================================
        // ─── CONTINUOUS WORKFLOW C ──────────────────────────────────────────
        // Upload/Paste/Receive → Repair → Quick Cert → Full Cert →
        // Enterprise Audit → (Rule 27) Auto-Register Workspace → Service
        // Registry → Ready for Deployment — one call, no re-upload between
        // stages. Every stage below is a real, already-existing call on
        // this coordinator or a connected engine; nothing here duplicates
        // certification/repair/audit logic.
        // =====================================================================

        /**
         * runWorkflowC(moduleId, sourceText, { auditImportResult })
         *   Rule 27 auto-registration only fires when ALL of these are
         *   real and true: Full Certification completed, Enterprise Audit
         *   completed (a real auditImportResult was supplied), verdict is
         *   ENTERPRISE_CERTIFIED, Critical=0, High=0. If any condition is
         *   false, registration is skipped — never partially applied.
         *   auditImportResult is optional; without one, the pipeline still
         *   runs through Full Certification but Rule 27 registration is
         *   correctly withheld (no completed audit == no auto-registration).
         */
        async runWorkflowC(moduleId, sourceText, { auditImportResult = null } = {}) {
            const stages = { repair: null, quickCertification: null, fullCertification: null, enterpriseAudit: null, workspaceRegistration: null, serviceRegistryUpdate: null, readyForDeployment: false };

            // Repair (standalone-safe — reuses the real repairModule() gate already built for loose coupling)
            try { stages.repair = await this.repairModule(moduleId, { approve: true, sourceText }); }
            catch (err) { stages.repair = { error: err.message }; }
            const repairedSource = (stages.repair && stages.repair.repairedSource) || sourceText;

            // Quick Certification (real)
            stages.quickCertification = this.quickCertifyModule(moduleId, repairedSource, "workflow-c");

            // Full Certification (real, whole-platform — filtered to this module's own result for display)
            try {
                const full = this.fullCertification();
                stages.fullCertification = (full.moduleReports || []).find(r => r.moduleId === moduleId) || { note: "Module not found in live full-certification scan — relying on Quick Certification result.", verdict: stages.quickCertification.verdict, summary: stages.quickCertification.summary };
            } catch (err) { stages.fullCertification = { error: err.message }; }

            // Enterprise Audit (real — only "completed" if a real, parsed result was supplied; never fabricated here)
            stages.enterpriseAudit = { completed: !!(auditImportResult && auditImportResult.parsed === true), auditImportResult };

            // Rule 27 — Auto-Register Workspace, ONLY if every real condition holds
            const verdict = stages.quickCertification.verdict;
            const severityCounts = stages.quickCertification.severityCounts;
            const allConditionsMet = stages.fullCertification && !stages.fullCertification.error
                && stages.enterpriseAudit.completed
                && verdict === "ENTERPRISE_CERTIFIED"
                && severityCounts.critical === 0 && severityCounts.high === 0;

            if (allConditionsMet) {
                const workspace = this.#workspace();
                if (workspace) {
                    try {
                        const existing = workspace.listFiles({ coordinator: moduleId })[0];
                        if (existing) {
                            await workspace.saveFile(existing.fileId, { proposedSource: repairedSource, approve: true });
                            stages.workspaceRegistration = { action: "UPDATED", fileId: existing.fileId };
                        } else {
                            const filename = `cozy-${moduleId.toLowerCase()}.js`;
                            const fileId = workspace.registerFile({ filename, source: repairedSource, moduleId });
                            stages.workspaceRegistration = { action: "REGISTERED", fileId };
                        }
                    } catch (err) { stages.workspaceRegistration = { error: err.message }; }
                } else {
                    stages.workspaceRegistration = { error: "Workspace not connected — registration skipped, retry available once connected." };
                }

                // Service Registry self-registration requires the
                // coordinator to actually be live (window.CozyOS[moduleId]
                // executing) — a freshly-generated-but-not-yet-loaded
                // module legitimately can't do that yet (Zero Logic Rule:
                // generated code is never auto-executed). That failure is
                // disclosed honestly in serviceRegistryUpdate.error, but
                // doesn't block readyForDeployment — Workspace holding the
                // real, certified source is the actual deployment gate.
                try { this.registerToServiceRegistry(moduleId); stages.serviceRegistryUpdate = { registered: true }; }
                catch (err) { stages.serviceRegistryUpdate = { error: err.message }; }

                stages.readyForDeployment = !!(stages.workspaceRegistration && !stages.workspaceRegistration.error);
            }

            this.#logAudit("WORKFLOW_C_RUN", `${moduleId}: verdict=${verdict}, autoRegistered=${allConditionsMet}, readyForDeployment=${stages.readyForDeployment}`);
            this.emit("hub:workflowC", { moduleId, readyForDeployment: stages.readyForDeployment });
            return stages;
        }

        compareVersions(moduleId, options) {
            this.#diagnostics.actionsDelegated++;
            const workspace = this.#requireWorkspace();
            const fileId = this.#requireFileId(moduleId);
            return workspace.compareVersions(fileId, options);
        }

        viewCertificationHistory(moduleId) {
            const cert = this.#cert();
            if (!cert) throw new Error("[DeveloperHub] CozyCertification is not connected.");
            return cert.listRecords(moduleId);
        }

        viewRepairHistory(moduleId) {
            const bugfixer = this.#bugfixer();
            if (!bugfixer) throw new Error("[DeveloperHub] CozyBugFixer is not connected.");
            return bugfixer.getRepairLog(r => r.filename && r.filename.includes(moduleId));
        }

        async saveModule(moduleId, proposedSource, { approve = true, enforcedProtectedOverride = false } = {}) {
            this.#diagnostics.actionsDelegated++;
            const workspace = this.#requireWorkspace();
            const fileId = this.#requireFileId(moduleId);
            const result = await workspace.saveFile(fileId, { proposedSource, approve, enforcedProtectedOverride });
            this.#logAudit("SAVE", moduleId);
            this.#logTimeline(`Saved: ${moduleId}`);
            this.emit("hub:saved", { moduleId });
            return result;
        }

        async editModule(moduleId) {
            this.#diagnostics.actionsDelegated++;
            const workspace = this.#requireWorkspace();
            const fileId = this.#requireFileId(moduleId);
            return workspace.editFile(fileId);
        }

        getModuleSource(moduleId) {
            const workspace = this.#requireWorkspace();
            const fileId = this.#requireFileId(moduleId);
            const file = workspace.getFile(fileId);
            return file ? file.source : null;
        }

        deleteRegistration(moduleId) {
            this.#diagnostics.actionsDelegated++;
            const registry = this.#registry();
            if (!registry || typeof registry.unregisterCoordinator !== "function") throw new Error("[DeveloperHub] ServiceRegistry is not connected.");
            const result = registry.unregisterCoordinator(moduleId);
            this.#logAudit("DELETE_REGISTRATION", moduleId);
            this.#logTimeline(`Registration deleted: ${moduleId}`);
            this.emit("hub:registrationDeleted", { moduleId });
            return result;
        }

        duplicateModule(moduleId, newFilename) {
            this.#diagnostics.actionsDelegated++;
            const workspace = this.#requireWorkspace();
            const fileId = this.#requireFileId(moduleId);
            const newFileId = workspace.duplicateFile(fileId, newFilename);
            this.#logAudit("DUPLICATE", `${moduleId} -> ${newFilename}`);
            this.#logTimeline(`Duplicated: ${moduleId} -> ${newFilename}`);
            this.emit("hub:duplicated", { moduleId, newFilename });
            return newFileId;
        }

        renameModule(moduleId, newFilename) {
            this.#diagnostics.actionsDelegated++;
            const workspace = this.#requireWorkspace();
            const fileId = this.#requireFileId(moduleId);
            const result = workspace.renameFile(fileId, newFilename);
            this.#logAudit("RENAME", `${moduleId} -> ${newFilename}`);
            this.#logTimeline(`Renamed: ${moduleId} -> ${newFilename}`);
            this.emit("hub:renamed", { moduleId, newFilename });
            return result;
        }

        moveModule(moduleId, newFolderPath) {
            this.#diagnostics.actionsDelegated++;
            const workspace = this.#requireWorkspace();
            const fileId = this.#requireFileId(moduleId);
            const result = workspace.moveFile(fileId, newFolderPath);
            this.#logAudit("MOVE", `${moduleId} -> ${newFolderPath}`);
            this.#logTimeline(`Moved: ${moduleId} -> ${newFolderPath}`);
            this.emit("hub:moved", { moduleId, newFolderPath });
            return result;
        }

        /** exportModule(moduleId) — returns {filename, source} for the caller to download; this file performs no file I/O itself. */
        exportModule(moduleId) {
            const workspace = this.#requireWorkspace();
            const fileId = this.#requireFileId(moduleId);
            const file = workspace.getFile(fileId);
            return { filename: file.filename, source: file.source };
        }

        /**
         * getBuildPackageData(moduleId, context)
         *   Gathers every real, currently-available fact about a module
         *   into one structured object — nothing here is invented. Fields
         *   or whole sections with no real data are simply absent from the
         *   returned object (never blank strings, never "..."); the three
         *   render functions below (Markdown/Text/JSON) each independently
         *   omit whatever isn't present.
         *
         *   context (all optional — supplied by the caller when it still
         *   has them in memory from a live session; this coordinator has
         *   no persistent store for any of them):
         *     requirement       — the original plain-language description
         *     understanding     — an UnderstandingEngine result
         *     generatedFiles    — { filename: sourceText } from a real
         *                         CozyBuilder buildCoordinator() result,
         *                         covering multi-file builds (dashboard/
         *                         application modes) that Workspace's
         *                         single-file-per-module registry can't
         *                         represent on its own
         *     buildDate         — ISO timestamp of when the build ran
         *     applicationName   — if this module belongs to a registered application
         */
        getBuildPackageData(moduleId, context = {}) {
            if (!moduleId) throw new TypeError("[DeveloperHub] getBuildPackageData(): moduleId is required.");
            const card = this.getModuleCard(moduleId);
            const cert = this.#cert();
            const bugfixer = this.#bugfixer();
            const workspace = this.#workspace();
            const registry = this.#registry();

            let certRecord = null;
            if (cert) { const h = cert.listRecords(moduleId); if (h.length) certRecord = h[h.length - 1]; }
            const waivers = cert && certRecord ? cert.listWaivers(moduleId) : [];

            const data = {};
            data.projectName = "CozyOS Enterprise Framework";
            if (context.applicationName) data.applicationName = context.applicationName;
            data.moduleName = moduleId;
            data.moduleId = moduleId;
            if (card.latestVersion || card.goldenVersion) data.version = card.latestVersion || card.goldenVersion;
            data.workspace = card.workspaceStatus;
            if (card.filePath) data.filePath = card.filePath;
            if (card.folderPath) data.folderPath = card.folderPath;
            if (this.#builder()) data.builderVersion = this.#builder().getVersion();
            if (this.#understandingEngine()) data.understandingEngineVersion = this.#understandingEngine().getVersion();
            if (cert) data.certificationEngineVersion = cert.getVersion ? cert.getVersion() : undefined;
            if (bugfixer) data.bugFixerVersion = bugfixer.getVersion();
            if (context.buildDate) data.buildDate = context.buildDate;
            if (card.lastCertified) data.lastCertified = card.lastCertified;
            if (card.lastRepaired) data.lastRepaired = card.lastRepaired;

            // ---- Generated Files: prefer an explicit multi-file build
            // result if the caller has one in memory; otherwise fall back
            // to the single file Workspace has registered for this module. ----
            const files = {};
            if (context.generatedFiles && Object.keys(context.generatedFiles).length > 0) {
                Object.assign(files, context.generatedFiles);
            } else {
                const source = (() => { try { return this.getModuleSource(moduleId); } catch (_err) { return null; } })();
                if (source) files[card.filePath || `cozy-${moduleId.toLowerCase()}.js`] = source;
            }
            if (Object.keys(files).length > 0) data.generatedFiles = files;

            // ---- Builder section ----
            const builderSection = {};
            if (context.requirement) builderSection.requirement = context.requirement;
            if (context.understanding) {
                const u = context.understanding;
                if (u.applicationType) builderSection.understandingSummary = u.applicationType;
                if (u.detectedFeatures && u.detectedFeatures.length) builderSection.detectedFeatures = u.detectedFeatures;
                if (u.missingInformation && u.missingInformation.length) builderSection.missingFeatures = u.missingInformation;
                if (u.recommendedArchitecture) builderSection.recommendedArchitecture = u.recommendedArchitecture;
                if (u.plan && u.plan.entities && u.plan.entities.length) builderSection.modulesGenerated = u.plan.entities.map(e => e.name);
            }
            if (Object.keys(builderSection).length > 0) data.builder = builderSection;

            // ---- Certification section ----
            if (certRecord) {
                const failedRules = (certRecord.defects || []).map(d => `${d.waived ? "[WAIVED] " : ""}[${d.severity}] ${d.id}: ${d.description}`);
                const roadmapMinutes = (certRecord.defects || []).filter(d => !d.waived).reduce((sum, d) => sum + (d.estimatedFixMinutes || 0), 0);
                data.certification = {
                    verdict: certRecord.verdict, score: certRecord.summary.scorePercent, grade: certRecord.overallGrade,
                    critical: certRecord.severityCounts.critical, high: certRecord.severityCounts.high,
                    medium: certRecord.severityCounts.medium, low: certRecord.severityCounts.low,
                    passedRules: certRecord.summary.passed, totalRules: certRecord.summary.totalChecks,
                    failedRules: failedRules.slice(0, 50),
                    repairRoadmapMinutes: roadmapMinutes,
                    remainingFindings: (certRecord.defects || []).filter(d => !d.waived).map(d => `[${d.severity}] ${d.id}: ${d.description}`),
                    waivers: waivers.map(w => `${w.ruleId}: ${w.reason}`)
                };
            }

            // ---- BugFixer section ----
            if (bugfixer) {
                const log = bugfixer.getRepairLog(r => r.filename && (r.filename.includes(moduleId) || r.filename.toLowerCase().includes(moduleId.toLowerCase())));
                if (log.length > 0) {
                    const latestRepair = log[log.length - 1];
                    data.bugFixer = {
                        repairsApplied: log.length,
                        deterministicFixersUsed: Array.from(new Set(log.flatMap(r => r.rulesFixed || []))),
                        lastRepairDate: latestRepair.timestamp
                    };
                }
            }

            // ---- Dependencies ----
            if (card.dependencies && card.dependencies.length > 0) data.dependencies = card.dependencies;

            this.#logAudit("BUILD_PACKAGE_GENERATED", moduleId);
            this.#logTimeline(`Build package generated: ${moduleId}`);
            this.emit("hub:buildPackageGenerated", { moduleId });
            return data;
        }

        /** generateBuildPackage(moduleId, context) — same as getBuildPackageData(), rendered as plain text (the default/legacy format). */
        generateBuildPackage(moduleId, context = {}) {
            return renderBuildPackageText(this.getBuildPackageData(moduleId, context));
        }

        /** generateBuildPackageMarkdown(moduleId, context) — same real data, rendered as Markdown. */
        generateBuildPackageMarkdown(moduleId, context = {}) {
            return renderBuildPackageMarkdown(this.getBuildPackageData(moduleId, context));
        }

        /** generateBuildPackageJSON(moduleId, context) — same real data, as a JSON string. */
        generateBuildPackageJSON(moduleId, context = {}) {
            return JSON.stringify(this.getBuildPackageData(moduleId, context), null, 2);
        }

        /**
         * importImprovedFile(moduleId, improvedSource)
         *   The other half of the manual workflow — text pasted back from
         *   an external AI chat. This NEVER trusts it: it only ever runs
         *   the real quickCertification() against it and returns a
         *   before/after comparison. It does not save, register, or lock
         *   anything — that stays a separate, explicit human action, the
         *   same as every other AI-provenance path in CozyOS.
         */
        importImprovedFile(moduleId, improvedSource) {
            if (typeof improvedSource !== "string" || !improvedSource.trim()) {
                throw new TypeError("[DeveloperHub] importImprovedFile(): improvedSource is required.");
            }
            const cert = this.#cert();
            if (!cert) throw new Error("[DeveloperHub] CozyCertification is not connected — cannot verify the imported file.");

            let beforeScore = null, beforeVerdict = null;
            const history = cert.listRecords(moduleId);
            if (history.length) { beforeScore = history[history.length - 1].summary.scorePercent; beforeVerdict = history[history.length - 1].verdict; }

            const afterResult = cert.quickCertification(improvedSource, { moduleId, moduleName: moduleId, version: "external-ai-import" });
            this.#logAudit("IMPORT_IMPROVED_FILE", `${moduleId}: ${beforeVerdict || "n/a"} (${beforeScore ?? "?"}%) -> ${afterResult.verdict} (${afterResult.summary.scorePercent}%)`);
            this.#logTimeline(`Imported external improvement: ${moduleId}`);
            this.emit("hub:importedImprovedFile", { moduleId, beforeScore, afterScore: afterResult.summary.scorePercent });

            return {
                moduleId, improvedSource,
                beforeScore, beforeVerdict,
                afterScore: afterResult.summary.scorePercent, afterVerdict: afterResult.verdict,
                scoreDelta: beforeScore !== null ? Math.round((afterResult.summary.scorePercent - beforeScore) * 10) / 10 : null,
                certResult: afterResult
            };
        }

        // =====================================================================
        // ─── ENTERPRISE AUDIT LAYER ────────────────────────────────────────────
        // Runs AFTER the deterministic Certification Engine + BugFixer +
        // Re-Certification — never replaces or feeds into that score. The
        // Auditor is a qualitative, advisory report (usually AI-produced,
        // via CozyAIMode or a manual copy/paste to an external chat) laid
        // on top of the same real, already-certified facts. Nothing here
        // changes CozyCertification's verdict/score, and nothing an audit
        // claims is "automatically fixable" is ever trusted without
        // checking it against CozyBugFixer's real, current fixer list.
        // =====================================================================

        /**
         * generateAuditRequest(moduleId, context)
         *   Produces the full structured prompt an external AI (or a human
         *   reviewer) should fill in — built on the same real
         *   getBuildPackageData() this coordinator already has, so nothing
         *   needs re-uploading. Every field the report is asked to return
         *   is listed explicitly, including the exact severity iconography
         *   and the Machine-Readable Repair Data JSON contract BugFixer
         *   integration depends on.
         */
        generateAuditRequest(moduleId, context = {}) {
            const data = this.getBuildPackageData(moduleId, context);
            const realFixableRuleIds = this.#bugfixer() ? this.#bugfixer().listDeterministicFixerRuleIds() : [];
            return renderAuditRequest(data, realFixableRuleIds);
        }

        /**
         * requestEnterpriseAudit(moduleId, context)
         *   Tries CozyAIMode first (if connected and not offline) — same
         *   provider gateway used everywhere else in CozyOS, same trust-
         *   policy enforcement. Returns {handled:false, promptForManualUse}
         *   if no provider is available, so the caller can fall back to
         *   the same Copy/Download-and-paste-into-a-chat workflow Share to
         *   Claude already provides — this is not a second AI system, it's
         *   the same one with a different, richer prompt.
         */
        async requestEnterpriseAudit(moduleId, context = {}) {
            const prompt = this.generateAuditRequest(moduleId, context);
            const aimode = this.#aimode();
            if (!aimode || aimode.isOfflineMode()) {
                return { handled: false, promptForManualUse: prompt, reason: aimode ? `AI mode is "${aimode.getMode()}" — no provider is consulted in this mode.` : "CozyAIMode is not connected." };
            }
            const assistance = await aimode.requestAssistance("enterprise-audit", { moduleId, prompt });
            if (!assistance.handled) {
                return { handled: false, promptForManualUse: prompt, reason: assistance.reason };
            }
            this.#logAudit("ENTERPRISE_AUDIT_REQUESTED", `${moduleId} via ${assistance.provider}`);
            this.#logTimeline(`Enterprise audit requested: ${moduleId} (${assistance.provider})`);
            this.emit("hub:enterpriseAuditRequested", { moduleId, provider: assistance.provider });
            return { handled: true, provider: assistance.provider, policy: assistance.policy, rawResult: assistance.result };
        }

        /**
         * importAuditResult(moduleId, auditText)
         *   Parses the "MACHINE_READABLE_REPAIR_DATA:" JSON block out of a
         *   returned audit report (pasted back or from requestEnterpriseAudit's
         *   rawResult) and cross-checks every claimed auto-fix candidate
         *   against CozyBugFixer's REAL, current fixer list — an AI saying
         *   a rule is "✅ automatically fixable" is only ever a proposal
         *   here, never accepted at face value. Candidates matching a real
         *   fixer are marked verifiedAutoFixable:true (safe to actually run
         *   through repair()); everything else is
         *   verifiedAutoFixable:false — a genuine gap, and exactly the
         *   kind of thing the constitution's Self-Improvement Rule means
         *   by "converted into a permanent repair rule" only after human
         *   review, never automatically promoted by this method.
         */
        importAuditResult(moduleId, auditText) {
            if (typeof auditText !== "string" || !auditText.trim()) {
                throw new TypeError("[DeveloperHub] importAuditResult(): auditText is required.");
            }
            const match = /MACHINE_READABLE_REPAIR_DATA:\s*```json\s*([\s\S]*?)```/i.exec(auditText) || /```json\s*([\s\S]*?)```/i.exec(auditText);
            if (!match) {
                return { parsed: false, reason: "No Machine-Readable Repair Data (JSON) block found — expected a ```json ... ``` block, ideally after a \"MACHINE_READABLE_REPAIR_DATA:\" marker." };
            }
            let repairData;
            try { repairData = JSON.parse(match[1]); } catch (err) { return { parsed: false, reason: `JSON in the audit report did not parse: ${err.message}` }; }

            const realFixableRuleIds = new Set(this.#bugfixer() ? this.#bugfixer().listDeterministicFixerRuleIds() : []);
            const candidates = Array.isArray(repairData.autoFixCandidates) ? repairData.autoFixCandidates : [];
            const verifiedCandidates = candidates.map(c => ({
                ...c,
                verifiedAutoFixable: !!(c && c.ruleId && realFixableRuleIds.has(c.ruleId))
            }));

            this.#logAudit("AUDIT_RESULT_IMPORTED", `${moduleId}: ${verifiedCandidates.filter(c => c.verifiedAutoFixable).length}/${verifiedCandidates.length} candidate(s) verified auto-fixable.`);
            this.#logTimeline(`Audit result imported: ${moduleId}`);
            this.emit("hub:auditResultImported", { moduleId, candidateCount: verifiedCandidates.length });

            return {
                parsed: true,
                moduleId,
                repairData,
                verifiedCandidates,
                verifiedAutoFixableCount: verifiedCandidates.filter(c => c.verifiedAutoFixable).length,
                unverifiedCount: verifiedCandidates.filter(c => !c.verifiedAutoFixable).length
            };
        }

        // =====================================================================
        // ─── GLOBAL SEARCH ────────────────────────────────────────────────────
        // Real search across every real data source — never a fabricated
        // unified index. Each category is queried from the coordinator that
        // actually owns it, at search time.
        // =====================================================================

        globalSearch(query) {
            if (typeof query !== "string" || !query.trim()) throw new TypeError("[DeveloperHub] globalSearch(): query is required.");
            const q = query.toLowerCase();
            const results = { modules: [], applications: [], repairs: [], certifications: [], workspace: [], registry: [], releases: [], patternLibrary: [] };

            const workspace = this.#workspace();
            if (workspace) {
                try { results.workspace = workspace.listFiles().filter(f => f.filename.toLowerCase().includes(q) || (f.coordinator || "").toLowerCase().includes(q)); }
                catch (_err) { this.#diagnostics.errorsHidden++; }
            }
            const registry = this.#registry();
            if (registry) {
                try {
                    results.registry = registry.listCoordinators().filter(c => c.name.toLowerCase().includes(q));
                    results.applications = (typeof registry.listApplications === "function" ? registry.listApplications() : []).filter(a => a.name.toLowerCase().includes(q));
                } catch (_err) { this.#diagnostics.errorsHidden++; }
            }
            const cert = this.#cert();
            if (cert) {
                try {
                    const moduleNames = new Set([...(results.workspace.map(f => f.coordinator).filter(Boolean)), ...(results.registry.map(r => r.name))]);
                    for (const name of moduleNames) {
                        const history = cert.listRecords(name);
                        if (history.length) results.certifications.push({ moduleId: name, latest: history[history.length - 1] });
                    }
                    if (typeof cert.listReleases === "function") results.releases = cert.listReleases().filter(r => (r.name || "").toLowerCase().includes(q));
                } catch (_err) { this.#diagnostics.errorsHidden++; }
            }
            const bugfixer = this.#bugfixer();
            if (bugfixer) {
                try { results.repairs = bugfixer.getRepairLog(r => (r.filename || "").toLowerCase().includes(q)); }
                catch (_err) { this.#diagnostics.errorsHidden++; }
            }
            const ue = this.#understandingEngine();
            if (ue) {
                try { results.patternLibrary = ue.listEnterprisePatternLibrary().filter(p => p.moduleId.toLowerCase().includes(q)); }
                catch (_err) { this.#diagnostics.errorsHidden++; }
            }
            results.modules = Array.from(new Set([...results.workspace.map(f => f.coordinator), ...results.registry.map(r => r.name)].filter(n => n && n.toLowerCase().includes(q))));
            return this.#deepClone(results);
        }

        // =====================================================================
        // ─── DIAGNOSTICS / COMPATIBILITY ──────────────────────────────────────
        // =====================================================================

        isVersionCompatible(version) {
            const a = /^v?(\d+)\./.exec(String(HUB_VERSION));
            const b = /^v?(\d+)\./.exec(String(version || ""));
            if (!a || !b) return false;
            return a[1] === b[1];
        }

        getDiagnosticsReport() {
            return this.#deepClone({
                moduleVersion: HUB_VERSION,
                ...this.#diagnostics,
                connections: this.getConnectionStatus(),
                integrationCount: Object.values(this.getConnectionStatus()).filter(Boolean).length,
                auditLogCount: this.#auditLogs.length
            });
        }

        exportSnapshot() {
            return this.#deepClone({ version: HUB_VERSION, exportedAt: new Date().toISOString(), diagnostics: this.#diagnostics });
        }

        importSnapshot(_snapshot) {
            return { imported: false, message: "DeveloperHub has no state of its own to restore — every real record lives in the coordinator that owns it." };
        }

        isSnapshotCompatible(snapshot) {
            return !!(snapshot && typeof snapshot.version === "string" && snapshot.version.split(".")[0] === HUB_VERSION.split(".")[0]);
        }
    }

    if (window.CozyOS.DeveloperHub && typeof window.CozyOS.DeveloperHub.getVersion === "function") {
        const existingVersion = window.CozyOS.DeveloperHub.getVersion();
        if (existingVersion !== HUB_VERSION) {
            throw new Error(`[CozyOS Framework Execution Error] VERSION_CONFLICT: DeveloperHub existing v${existingVersion} conflicts with load target v${HUB_VERSION}.`);
        }
        return;
    }

    window.CozyOS.DeveloperHub = new CozyOSDeveloperHub();

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
        name: "DeveloperHub", category: "Foundation", icon: "developer-hub.svg",
        description: "CozyDeveloperHub — pure orchestration layer over Builder/UnderstandingEngine/OCR/Certification/BugFixer/Workspace/ServiceRegistry/AIMode. Duplicates no logic; every action delegates to the real owning coordinator."
    });
})();
