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

        async buildFromPlan(plan, mode = "coordinator") {
            this.#diagnostics.actionsDelegated++;
            const builder = this.#builder();
            if (!builder) throw new Error("[DeveloperHub] CozyBuilder is not connected.");
            return builder.buildCoordinator(plan, { mode });
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
        rollbackGolden(_moduleId) {
            throw new Error("[DeveloperHub] Rollback to Golden is not implemented in CozyCertification yet — no real API exists for this. The Golden version's certification record itself is available via getModuleCard()/viewCertificationHistory().");
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
