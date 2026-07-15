/**
 * CozyOS Enterprise Framework — Developer Hub UI
 * File Reference: core/modules/developer/developer-hub.js
 * Version: 1.0.0-ENTERPRISE
 * Layer: Core / Orchestration — Developer Hub UI
 * Every data read and every action here calls window.CozyOS.DeveloperHub,
 * which itself only ever delegates to the real owning coordinator. This
 * file renders; it never certifies, repairs, generates, or scores anything.
 */

(function () {
    "use strict";

    const HUB_UI_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    function escapeHtml(value) {
        const str = String(value === undefined || value === null ? "" : value);
        return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    function verdictBadgeClass(verdict) {
        if (verdict === "ENTERPRISE_CERTIFIED" || verdict === "CERTIFIED") return "cz-badge-ready";
        if (verdict === "CERTIFIED_WITH_WARNINGS" || verdict === "NEEDS_REPAIR") return "cz-badge-warn";
        return "cz-badge-blocked";
    }

    function downloadTextFile(filename, content) {
        const blob = new Blob([content], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = filename.split("/").pop();
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }

    function downloadBlob(filename, content, mimeType) {
        const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType || "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }

    // Same real jsPDF-based generation used in the original Certification
    // Center (loaded via CDN in developer-hub.html) — returns null if
    // jsPDF isn't loaded, so the caller can fall back to the browser's own
    // Print -> Save as PDF instead of failing silently.
    function textToPdfBlob(title, text) {
        const jsPDFCtor = window.jspdf && window.jspdf.jsPDF;
        if (!jsPDFCtor) return null;
        const doc = new jsPDFCtor({ unit: "pt", format: "a4" });
        const marginX = 40, marginTop = 50, lineHeight = 14, pageHeight = doc.internal.pageSize.getHeight();
        doc.setFont("Courier", "normal");
        doc.setFontSize(14);
        doc.text(title, marginX, marginTop - 20);
        doc.setFontSize(9);
        const maxWidth = doc.internal.pageSize.getWidth() - marginX * 2;
        const rawLines = String(text || "").split("\n");
        let y = marginTop;
        for (const rawLine of rawLines) {
            const wrapped = doc.splitTextToSize(rawLine.length ? rawLine : " ", maxWidth);
            for (const line of wrapped) {
                if (y > pageHeight - 40) { doc.addPage(); y = marginTop; }
                doc.text(line, marginX, y);
                y += lineHeight;
            }
        }
        return doc.output("blob");
    }

    function stripHtml(html) {
        const div = document.createElement("div");
        div.innerHTML = html;
        return div.textContent || div.innerText || "";
    }

    class CozyDeveloperHubUI {
        #root = null;
        #activeSection = "dashboard";
        #selectedModuleId = null;
        #lastAnalysis = null;
        #lastQuickCertModuleId = null;
        #lastUploadedFilename = null;
        #lastQuickCertSource = null;
        #lastQuickCertResult = null;
        #retainedSources = new Map();
        #lastSharePackage = null;
        #lastBuildPlan = null;
        #lastBuildResult = null;
        #pendingBuilderFiles = null;
        #currentProjectFiles = null;
        #currentProjectModel = null;
        #uploadedFileOriginal = null;
        #uploadedFileMeta = null;
        #requirementReading = null;
        #requirementSummary = null;
        #pendingBugFixerFiles = null;
        #bugfixerUploadedOriginal = null;
        #bugfixerUploadedMeta = null;
        #bugfixerRequirementReading = null;
        #lastProjectRepairResult = null;
        #builderSubTab = "generate";
        #lastRefactorResult = null;
        #lastRefactorFinalJs = null;
        #researchSubTab = "dashboard";
        #selectedResearchEntryId = null;
        #memorySubTab = "dashboard";
        #memoryExplorerNamespace = null;
        #eventsBound = false;

        // ---- this UI's OWN audit log / event bus — distinct from
        // DeveloperHub's business audit log, which already exists on
        // window.CozyOS.DeveloperHub. This one tracks UI-level activity
        // (section changes, module actions) for anyone observing this
        // page, without duplicating what DeveloperHub itself already logs. ----
        #auditLogs = [];
        #listeners = new Map();
        #onceWrapped = new Map();
        #diagnostics = { rendersRun: 0, actionsHandled: 0, errorsShown: 0, eventsEmitted: 0, memoryBaseline: 2.4 };
        #timelineEvents = [];

        getVersion() { return HUB_UI_VERSION; }

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
            const list = this.#timelineEvents.map(e => ({ ...e }));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

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

        isVersionCompatible(version) {
            const a = /^v?(\d+)\./.exec(String(HUB_UI_VERSION));
            const b = /^v?(\d+)\./.exec(String(version || ""));
            if (!a || !b) return false;
            return a[1] === b[1];
        }

        getAuditLog(predicate) {
            const list = this.#auditLogs.map(e => ({ ...e }));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

        on(eventName, handler) {
            if (typeof eventName !== "string" || !eventName.trim()) throw new TypeError("[DeveloperHubUI] on(): eventName must be a non-empty string.");
            if (typeof handler !== "function") throw new TypeError("[DeveloperHubUI] on(): handler must be a function.");
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
            if (typeof handler !== "function") throw new TypeError("[DeveloperHubUI] once(): handler must be a function.");
            const wrapper = (payload) => { this.off(eventName, handler); this.#onceWrapped.delete(handler); handler(payload); };
            this.#onceWrapped.set(handler, wrapper);
            this.on(eventName, wrapper);
        }

        emit(eventName, payload) {
            if (typeof eventName !== "string" || !eventName.trim()) { this.#diagnostics.errorsShown++; return false; }
            const set = this.#listeners.get(eventName);
            this.#diagnostics.eventsEmitted++;
            if (!set || set.size === 0) return false;
            for (const fn of Array.from(set)) { try { fn(payload); } catch (_err) { this.#diagnostics.errorsShown++; } }
            return true;
        }

        getDiagnosticsReport() {
            return Object.freeze({ moduleVersion: HUB_UI_VERSION, ...this.#diagnostics, auditLogCount: this.#auditLogs.length, timelineEventCount: this.#timelineEvents.length });
        }

        #hub() { return (window.CozyOS && window.CozyOS.DeveloperHub) || null; }

        mount(root) {
            if (!root || typeof root.addEventListener !== "function") {
                throw new Error("[DeveloperHubUI] mount(): a valid DOM container element is required.");
            }
            this.#root = root;
            this.#render();
            this.#bindEvents();
        }

        #sections() {
            return [
                ["dashboard", "Dashboard"], ["builder", "Builder"], ["understanding", "Understanding Engine"], ["ocr", "OCR"],
                ["quickCert", "Quick Certification"], ["fullCert", "Full Certification"], ["bugfixer", "BugFixer"],
                ["workspace", "Workspace"], ["moduleExplorer", "Module Explorer"], ["applicationExplorer", "Application Explorer"],
                ["serviceRegistry", "Service Registry"], ["releaseCenter", "Release Center"], ["goldenVault", "Golden Vault"],
                ["certHistory", "Certification History"], ["repairHistory", "Repair History"],
                ["reviewQueue", "Knowledge Review Queue"], ["patternLibrary", "Enterprise Pattern Library"],
                ["developerQueue", "Developer Queue"], ["research", "Research"], ["memory", "Memory"], ["search", "Search"], ["settings", "Settings"]
            ];
        }

        #render() {
            const navHtml = this.#sections().map(([id, label]) =>
                `<div class="cz-nav-item${this.#activeSection === id ? " active" : ""}" data-section="${id}">${escapeHtml(label)}</div>`).join("");
            const hub = this.#hub();
            this.#root.innerHTML = `
                <div class="cz-app">
                    <nav class="cz-sidebar">
                        <div class="cz-sidebar-brand"><span class="cz-dot"></span> Developer Hub</div>
                        <div class="cz-field" style="padding:0 16px;"><input class="cz-input" id="cz-hub-search-box" placeholder="Search modules, applications, repairs..." /></div>
                        ${navHtml}
                    </nav>
                    <header class="cz-topbar">${hub ? "Developer Hub — v" + escapeHtml(hub.getVersion()) : "DeveloperHub coordinator not connected"}</header>
                    <main class="cz-main" id="cz-hub-main">${this.#renderSection(this.#activeSection)}</main>
                </div>`;
        }

        #renderMain() {
            const main = document.getElementById("cz-hub-main");
            if (main) main.innerHTML = this.#renderSection(this.#activeSection);
        }

        #setSection(id) {
            this.#activeSection = id;
            this.#diagnostics.rendersRun++;
            this.#logAudit("SECTION_CHANGED", id);
            this.#logTimeline(`Section changed: ${id}`);
            if (this.#auditLogs.length > 500) this.#auditLogs.shift();
            this.emit("hubui:sectionchanged", { section: id });
            this.#render();
        }

        #renderSection(id) {
            const hub = this.#hub();
            if (!hub) return `<h1>${escapeHtml(this.#labelFor(id))}</h1><div class="cz-not-connected">window.CozyOS.DeveloperHub is not loaded.</div>`;
            switch (id) {
                case "dashboard": return this.#renderDashboard();
                case "builder": return this.#renderBuilder();
                case "understanding": return this.#renderUnderstanding();
                case "ocr": return this.#renderOcr();
                case "quickCert": return this.#renderQuickCert();
                case "fullCert": return this.#renderFullCert();
                case "bugfixer": return this.#renderBugFixerSection();
                case "workspace": return this.#renderWorkspaceSection();
                case "moduleExplorer": return this.#renderModuleExplorer();
                case "applicationExplorer": return this.#renderApplicationExplorer();
                case "serviceRegistry": return this.#renderServiceRegistrySection();
                case "releaseCenter": return this.#renderReleaseCenter();
                case "goldenVault": return this.#renderGoldenVault();
                case "certHistory": return this.#renderCertHistory();
                case "repairHistory": return this.#renderRepairHistory();
                case "reviewQueue": return this.#renderReviewQueue();
                case "patternLibrary": return this.#renderPatternLibrary();
                case "developerQueue": return this.#renderDeveloperQueue();
                case "research": return this.#renderResearch();
                case "memory": return this.#renderMemory();
                case "search": return this.#renderSearch();
                case "settings": return this.#renderSettings();
                default: return `<div class="cz-not-connected">Unknown section.</div>`;
            }
        }

        #labelFor(id) {
            const found = this.#sections().find(([sid]) => sid === id);
            return found ? found[1] : id;
        }

        #devOutput(html) {
            const out = document.getElementById("cz-hub-output");
            if (!out) return;
            out.innerHTML = html;
            out.style.display = html ? "block" : "none";
            if (html && typeof out.scrollIntoView === "function") out.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }

        // =====================================================================
        // ─── HOME DASHBOARD ───────────────────────────────────────────────────
        // =====================================================================

        #renderDashboard() {
            const hub = this.#hub();
            const data = hub.getHomeDashboardData();
            const statusRow = (label, value) => `<div class="cz-panel"><div class="cz-muted">${escapeHtml(label)}</div><div style="font-weight:700;">${escapeHtml(value)}</div></div>`;

            return `<h1>Developer Hub</h1>
                <p class="cz-subtitle">The single control center for CozyOS development — orchestrates Builder, Certification, BugFixer, Workspace, Service Registry, and AI Mode. It doesn't replace them.</p>
                <div class="cz-row" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;">
                    ${statusRow("Workspace", data.workspaceStatus)}
                    ${statusRow("Service Registry", data.serviceRegistryStatus)}
                    ${statusRow("AI Mode", data.aiStatus)}
                    ${statusRow("Builder", data.builderStatus)}
                    ${statusRow("BugFixer", data.bugFixerStatus)}
                    ${statusRow("Certification", data.certificationStatus)}
                    ${statusRow("OCR", data.ocrStatus)}
                </div>

                <div class="cz-panel">
                    <h3>Developer Queue</h3>
                    ${data.developerQueue.connected === false ? `<p class="cz-muted">${escapeHtml(data.developerQueue.message)}</p>` :
                        data.developerQueue.entries.slice(0, 12).map(e => `<div class="cz-row" data-action="select-module" data-module="${escapeHtml(e.moduleId)}" style="cursor:pointer;">
                            <span>${escapeHtml(e.moduleId)}</span><span class="cz-badge ${verdictBadgeClass(e.status)}">${escapeHtml(e.status)}</span>
                            ${e.latestScore !== null ? `<span>${escapeHtml(e.latestScore)}%</span>` : ""}
                        </div>`).join("")}
                </div>

                <div class="cz-panel">
                    <h3>Recent Certifications</h3>
                    ${data.recentCertifications.length === 0 ? '<div class="cz-empty">None yet.</div>' :
                        data.recentCertifications.map(c => `<div class="cz-row"><span>${escapeHtml(c.moduleId)}</span><span class="cz-badge ${verdictBadgeClass(c.verdict)}">${escapeHtml(c.verdict)}</span><span>${escapeHtml(c.summary.scorePercent)}%</span></div>`).join("")}
                </div>

                <div class="cz-panel">
                    <h3>Recent Repairs</h3>
                    ${data.recentRepairs.length === 0 ? '<div class="cz-empty">None yet.</div>' :
                        data.recentRepairs.map(r => `<div class="cz-row"><span>${escapeHtml(r.filename)}</span><span>${escapeHtml(r.certificationScoreBefore)}% → ${escapeHtml(r.certificationScoreAfter)}%</span></div>`).join("")}
                </div>

                <div class="cz-panel">
                    <h3>Golden Releases</h3>
                    ${data.goldenReleases.length === 0 ? '<div class="cz-empty">None locked yet.</div>' :
                        data.goldenReleases.map(r => `<div class="cz-row"><span>${escapeHtml(r.name || r.releaseId)}</span><span class="cz-badge cz-badge-ready">${escapeHtml(r.status)}</span></div>`).join("")}
                </div>`;
        }

        // =====================================================================
        // ─── BUILDER ──────────────────────────────────────────────────────────
        // Delegates entirely to hub.analyzeRequirement()/openWithBuilder()/
        // buildFromPlan() — same real UnderstandingEngine/CozyBuilder calls
        // used elsewhere, exposed here without a second upload: if a module
        // is already selected, its known metadata seeds the description.
        // =====================================================================

        #renderBuilder() {
            const selected = this.#selectedModuleId;
            const subTab = this.#builderSubTab || "generate";
            const tabs = [["generate", "Generate"], ["refactor-split", "Split Single File"], ["refactor-merge", "Merge Project"], ["refactor-modularize", "Convert to CozyOS Module"], ["refactor-optimize", "Optimize Project"]];
            const nav = `<div class="cz-row" style="flex-wrap:wrap;gap:6px;margin-bottom:10px;">
                ${tabs.map(([id, label]) => `<button class="cz-btn${subTab === id ? " cz-btn-primary" : ""}" data-action="hub-builder-subtab" data-tab="${id}">${escapeHtml(label)}</button>`).join("")}
            </div>`;

            if (subTab !== "generate") return `<h1>Builder — Refactor Existing Project</h1>${nav}${this.#renderRefactorPanel(subTab)}`;

            return `<h1>Builder</h1>${nav}
                <p class="cz-subtitle">${selected ? `Opened with "${escapeHtml(selected)}" already loaded — no re-upload.` : "Describe what you want to build, paste existing source, or upload existing files — whichever you already have."}</p>
                <div class="cz-panel">
                    <div class="cz-field"><label>Method 1 — Describe what you want to build</label>
                        <textarea class="cz-input" id="cz-hub-builder-prompt" rows="3" placeholder="Describe what you want to build...">${escapeHtml(selected ? `Build ${selected} Coordinator` : "")}</textarea>
                    </div>
                    <div class="cz-field"><label>Method 2 — Paste existing source code</label>
                        <textarea class="cz-input" id="cz-hub-builder-code-paste" rows="${this.#uploadedFileOriginal ? 14 : 4}" placeholder="Paste existing JS/HTML/CSS/JSON/Markdown/TXT source here — Builder reads it instead of asking you to describe it.">${this.#uploadedFileOriginal ? escapeHtml(this.#uploadedFileOriginal.text) : ""}</textarea>
                    </div>
                    <div class="cz-field"><label>Method 3 — Upload existing file(s)</label>
                        <div class="cz-dropzone" id="cz-hub-builder-dropzone">
                            <p>Drag &amp; drop file(s) here (.js, .html, .css, .json, .md, .txt) — multiple files supported — or a single .zip project archive, which extracts with its real folder structure preserved. The first file's content loads directly into Method 2's editor above.</p>
                            <input type="file" id="cz-hub-builder-files" accept=".js,.html,.css,.json,.md,.txt,.zip" multiple />
                        </div>
                        <div id="cz-hub-builder-attachment-summary" class="cz-muted"></div>
                    </div>
                    ${this.#renderUploadConfirmation()}
                    ${this.#requirementSummary ? `<div class="cz-field"><label>Requirement Summary (from RequirementReader — editable before Build)</label>
                        <textarea class="cz-input" id="cz-hub-requirement-summary" rows="10">${escapeHtml(this.#requirementSummary)}</textarea>
                    </div>` : ""}
                    <button class="cz-btn cz-btn-primary" data-action="hub-analyze">Analyze</button>
                </div>
                ${this.#lastAnalysis ? this.#renderAnalysisResult(this.#lastAnalysis) : ""}
                ${this.#lastBuildResult ? this.#renderBuildResult(this.#lastBuildResult) : ""}
                <div class="cz-panel cz-dev-action-output-panel" id="cz-hub-output"></div>`;
        }

        /**
         * #renderRefactorPanel(subTab)
         *   Every action here calls the real window.CozyOS.ProjectRefactor
         *   methods (splitSingleFile/mergeProject/modularizeProject/
         *   refactorAndCertify) — this file adds no refactoring logic of
         *   its own, only the upload/paste UI and result display.
         */
        #renderRefactorPanel(subTab) {
            const refactor = window.CozyOS.ProjectRefactor;
            if (!refactor) return `<div class="cz-panel"><p class="cz-muted">ProjectRefactor is not connected.</p></div>`;

            if (subTab === "refactor-split") {
                return `<div class="cz-panel">
                    <div class="cz-field"><label>HTML to split (paste, or drop a file)</label>
                        <div class="cz-dropzone" id="cz-hub-refactor-dropzone"><p>Drag &amp; drop an .html file here, or paste below.</p><input type="file" id="cz-hub-refactor-file" accept=".html,.htm" /></div>
                        <textarea class="cz-input" id="cz-hub-refactor-html" rows="10" placeholder="Paste the HTML file to split..."></textarea>
                    </div>
                    <div class="cz-field"><label>Base filename</label><input class="cz-input" id="cz-hub-refactor-basename" placeholder="page" value="page" /></div>
                    <button class="cz-btn cz-btn-primary" data-action="hub-refactor-split">Split File</button>
                </div>
                <div class="cz-panel cz-dev-action-output-panel" id="cz-hub-output"></div>`;
            }
            if (subTab === "refactor-merge") {
                return `<div class="cz-panel">
                    <div class="cz-field"><label>HTML (with &lt;link&gt;/&lt;script src&gt; references)</label><textarea class="cz-input" id="cz-hub-merge-html" rows="8" placeholder="Paste the HTML..."></textarea></div>
                    <div class="cz-field"><label>CSS to inline</label><textarea class="cz-input" id="cz-hub-merge-css" rows="4" placeholder="Paste the CSS..."></textarea></div>
                    <div class="cz-field"><label>JS to inline</label><textarea class="cz-input" id="cz-hub-merge-js" rows="4" placeholder="Paste the JS..."></textarea></div>
                    <button class="cz-btn cz-btn-primary" data-action="hub-refactor-merge">Merge into One File</button>
                </div>
                <div class="cz-panel cz-dev-action-output-panel" id="cz-hub-output"></div>`;
            }
            if (subTab === "refactor-modularize") {
                return `<div class="cz-panel">
                    <div class="cz-field"><label>Module name</label><input class="cz-input" id="cz-hub-modularize-name" placeholder="MyModule" /></div>
                    <div class="cz-field"><label>JavaScript</label><textarea class="cz-input" id="cz-hub-modularize-js" rows="8" placeholder="Paste the JS to modularize..."></textarea></div>
                    <div class="cz-field"><label>HTML (optional, for compatibility scanning)</label><textarea class="cz-input" id="cz-hub-modularize-html" rows="4" placeholder="Paste the HTML, if any..."></textarea></div>
                    <button class="cz-btn cz-btn-primary" data-action="hub-refactor-modularize">Convert to CozyOS Module</button>
                </div>
                <div class="cz-panel cz-dev-action-output-panel" id="cz-hub-output"></div>`;
            }
            // refactor-optimize
            return `<div class="cz-panel">
                <p class="cz-subtitle">Runs the full pipeline on existing JS: Quick Certification → BugFixer → Re-Certification.</p>
                <div class="cz-field"><label>Module ID</label><input class="cz-input" id="cz-hub-optimize-moduleid" placeholder="MyModule" /></div>
                <div class="cz-field"><label>JavaScript</label><textarea class="cz-input" id="cz-hub-optimize-js" rows="10" placeholder="Paste the JS to optimize..."></textarea></div>
                <button class="cz-btn cz-btn-primary" data-action="hub-refactor-optimize">Optimize</button>
            </div>
            <div class="cz-panel cz-dev-action-output-panel" id="cz-hub-output"></div>`;
        }

        #renderAnalysisResult(a) {
            const intent = a.intent;
            const isRequirementsDoc = intent && intent.type === "requirements_document";
            const classificationPanel = intent && intent.type !== "unclassified" ? `<div class="cz-panel" style="border-left:3px solid ${isRequirementsDoc ? "#d97706" : "#16a34a"};">
                <h3>Input Classification</h3>
                <p><b>Type:</b> ${isRequirementsDoc ? "Business Requirements Document" : "Build Request"}</p>
                <p><b>Intent:</b> ${isRequirementsDoc ? "Requirements Discovery" : "Code Generation"}</p>
                <p><b>Expected Output:</b> ${isRequirementsDoc ? "Business Requirements Document" : "Generated source code"}</p>
                <p><b>Code Generation:</b> ${isRequirementsDoc ? "NOT REQUIRED" : "Expected"}</p>
                <p class="cz-muted">Detected from: ${escapeHtml(intent.signals.join("; "))}</p>
                ${isRequirementsDoc ? '<p class="cz-muted">RequirementAnalyzer\'s full Requirements Book generation is not yet wired into this screen — this classification only prevents silently generating code from what looks like a planning document. Review the input before proceeding.</p>' : ""}
            </div>` : "";
            return `${classificationPanel}<div class="cz-panel">
                <h3>Understanding Preview</h3>
                <p><b>Application Type:</b> ${escapeHtml(a.understanding.applicationType)}</p>
                <p><b>Detected Features:</b> ${escapeHtml((a.understanding.detectedFeatures || []).join(", ") || "none")}</p>
                <p><b>Missing (Gap Detector):</b> ${escapeHtml(a.gaps.missing.map(g => g.label).join(", ") || "none")}</p>
                <button class="cz-btn ${isRequirementsDoc ? "" : "cz-btn-primary"}" data-action="hub-build-plan">${isRequirementsDoc ? "Generate Code Anyway" : "Continue → Generate"}</button>
            </div>`;
        }

        #renderBuildResult(result) {
            if (result.blocked) {
                return `<div class="cz-panel" style="border-left:3px solid #d97706;">
                    <h3>Build Blocked — Existing Module Found</h3>
                    <p>${escapeHtml(result.message)}</p>
                    ${result.discovery.liveModuleMatches.length ? `<p class="cz-muted">Matches: ${escapeHtml(result.discovery.liveModuleMatches.join(", "))}</p>` : ""}
                    <button class="cz-btn cz-btn-primary" data-action="hub-force-generate">Generate Anyway</button>
                </div>`;
            }
            const files = Object.keys(result.files);
            const cp = result.certificationPreview;
            return `<div class="cz-panel">
                <h3>Certification Preview</h3>
                ${cp.available !== false ? `<div class="cz-row"><span class="cz-badge ${verdictBadgeClass(cp.verdict)}">${escapeHtml(cp.verdict)}</span><span>${escapeHtml(cp.scorePercent)}%</span></div>` : `<p class="cz-muted">${escapeHtml(cp.message)}</p>`}
                <h3>Generated Files</h3>
                ${files.map(name => `<div class="cz-row"><span>${escapeHtml(name)}</span><button class="cz-btn" data-action="hub-download-file" data-file="${escapeHtml(name)}">Download</button></div>`).join("")}
            </div>`;
        }

        /**
         * #hubAnalyze()
         *   Never forces retyping a requirement when code already exists:
         *   if pasted code and/or uploaded files are present, this runs
         *   UnderstandingEngine.analyzeCode() on each and uses that —
         *   the plain-language description is only required when neither
         *   of the other two methods provided anything.
         */
        async #hubAnalyze() {
            const hub = this.#hub();
            const ue = window.CozyOS.UnderstandingEngine;
            const text = document.getElementById("cz-hub-builder-prompt")?.value.trim();
            const pastedCode = document.getElementById("cz-hub-builder-code-paste")?.value.trim();
            const requirementSummaryEl = document.getElementById("cz-hub-requirement-summary");
            const editedRequirementSummary = requirementSummaryEl?.value.trim();
            // If the user edited the RequirementReader-generated summary,
            // that edited version is what drives Analyze — RequirementReader
            // stays the source of truth, but the summary remains genuinely
            // editable before Build as required.
            if (editedRequirementSummary && editedRequirementSummary !== this.#requirementSummary) {
                try {
                    this.#lastAnalysis = await hub.analyzeRequirement(editedRequirementSummary);
                    this.#lastAnalysis.requirementReaderUsed = true;
                    this.#requirementSummary = editedRequirementSummary;
                    this.#lastBuildPlan = null; this.#lastBuildResult = null;
                    this.#renderMain();
                    return;
                } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); return; }
            }
            // The primary uploaded file's content is auto-loaded into the
            // editor (pastedCode) — skip it here to avoid analyzing it
            // twice; only additional uploaded files (multi-file uploads)
            // are analyzed separately.
            const additionalUploaded = (this.#pendingBuilderFiles || []).slice(1);

            try {
                const codeAnalyses = [];
                if (ue) {
                    // Priority: uploaded/pasted source (unified in the
                    // editor) always wins over the written requirement —
                    // the user never has to re-describe something already
                    // loaded as real code.
                    if (pastedCode) { try { codeAnalyses.push(ue.analyzeCode(pastedCode)); } catch (_err) { /* not parseable as code */ } }
                    for (const f of additionalUploaded) { try { codeAnalyses.push(ue.analyzeCode(f.text)); } catch (_err) { /* skip unparseable file */ } }
                }

                if (codeAnalyses.length > 0) {
                    const primary = codeAnalyses[0];
                    const description = text || `Build ${primary.className || "Module"} Coordinator`;
                    this.#lastAnalysis = await hub.analyzeRequirement(description);
                    this.#lastAnalysis.codeAnalyses = codeAnalyses;
                } else if (text) {
                    // Real, deterministic intent classification — root-cause
                    // fix for a requirements/planning document being silently
                    // treated as a build request. Never blocks; surfaces the
                    // classification so the developer can make an informed
                    // choice, same "always allow override" pattern as Rule 16.
                    const ai = window.CozyOS.BuilderAI;
                    const intent = ai && typeof ai.classifyIntent === "function" ? ai.classifyIntent(text) : null;
                    this.#lastAnalysis = await hub.analyzeRequirement(text);
                    this.#lastAnalysis.intent = intent;
                } else {
                    this.#devOutput('<p class="cz-muted">Describe what you want, paste existing code, or upload a file first.</p>');
                    return;
                }
                this.#lastBuildPlan = null; this.#lastBuildResult = null;
                this.#renderMain();
            } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
        }

        /** Handles file(s) dropped or picked for Builder's Method 3 — reads each as text, no upload limit beyond the accepted extensions. */
        async #handleBuilderFilesSelected(fileList) {
            const files = Array.from(fileList);

            // A ZIP upload is a project, not a text file — must be read as
            // binary (ArrayBuffer) and routed through the real
            // importFromZip()/buildProjectModel() path, never through the
            // text-reading path below (which would corrupt binary content).
            if (files.length === 1 && /\.zip$/i.test(files[0].name)) {
                await this.#handleZipProjectUpload(files[0]);
                return;
            }

            const read = await Promise.all(files.map(async f => ({ name: f.name, text: await this.#readFileAsText(f) })));
            this.#pendingBuilderFiles = read;

            // Auto-load: the first file's real content goes straight into
            // the paste editor, unedited — this is what actually fixes the
            // Analyze bug, since Analyze already reliably reads from this
            // editor regardless of any separate upload-tracking state.
            const primary = read[0];
            if (primary) {
                const pasteEl = document.getElementById("cz-hub-builder-code-paste");
                if (pasteEl) pasteEl.value = primary.text;
                this.#uploadedFileOriginal = { name: primary.name, text: primary.text, loadedAt: new Date().toISOString() };
                this.#uploadedFileMeta = this.#detectFileMetadata(primary.name, primary.text);
            }

            // RequirementReader is the single source of truth for uploaded
            // analysis when connected — populates identity/purpose/public
            // interface/dependencies/quality/summary automatically, and
            // pre-fills lastAnalysis so Builder is ready without a second
            // Analyze click. Falls back to the existing #detectFileMetadata
            // regex path (above) when RequirementReader isn't connected —
            // nothing is removed, only preferred when available.
            await this.#runRequirementReaderOnUpload(read);

            this.#renderMain();
        }

        /**
         * #runRequirementReaderOnUpload(files)
         *   RequirementReader is the single source of truth for uploaded-
         *   file analysis when connected — this never re-implements its
         *   extraction. For multiple files, every supported one is read
         *   and their summaries combined into one project requirement
         *   (per the Project Upload rule); for one file, its own summary
         *   becomes the requirement. Silently no-ops (existing regex path
         *   still applies) if RequirementReader isn't connected.
         */
        async #runRequirementReaderOnUpload(files) {
            const rr = window.CozyOS.RequirementReader;
            const hub = this.#hub();
            if (!rr || !hub || !files.length) return;
            try {
                const readings = [];
                for (const f of files) {
                    try { readings.push(rr.readFile(f.name, f.text)); } catch (_err) { /* unsupported/unparseable file — skip, other files still processed */ }
                }
                if (readings.length === 0) { this.#requirementReading = null; this.#requirementSummary = null; return; }

                if (readings.length === 1) {
                    this.#requirementReading = readings[0];
                    this.#requirementSummary = rr.generateRequirementSummary(readings[0].id);
                } else {
                    // Real cross-file project synthesis — coordinators,
                    // shared utilities, missing modules, entry points —
                    // never plain per-file concatenation.
                    this.#requirementReading = { project: true, readings, synthesis: rr.synthesizeProjectRequirement(readings) };
                    this.#requirementSummary = rr.generateProjectRequirementSummary(readings);
                }

                // Pre-fill lastAnalysis from the real summary — no second
                // Analyze click required. The Analyze button remains fully
                // functional and re-runs this same real path if clicked.
                this.#lastAnalysis = await hub.analyzeRequirement(this.#requirementSummary);
                this.#lastAnalysis.requirementReaderUsed = true;

                // RequirementReader already extracted an exact, unambiguous
                // className — BuilderAI's word-extraction is tuned for
                // natural-language prose ("Build X Coordinator"), not the
                // structured "Module: X" summary format, and can otherwise
                // pick up the literal label text. The real, clean identity
                // always wins here.
                const primaryIdentity = readings.length === 1 ? readings[0].identity : readings[0].identity;
                if (primaryIdentity && primaryIdentity.className && this.#lastAnalysis.understanding && this.#lastAnalysis.understanding.plan) {
                    this.#lastAnalysis.understanding.plan.exportName = primaryIdentity.className;
                    this.#lastAnalysis.understanding.plan.folder = `core/modules/${primaryIdentity.className.toLowerCase()}`;
                }
            } catch (err) { this.#devOutput(`<p class="cz-muted">RequirementReader: ${escapeHtml(err.message)}</p>`); }
        }

        #hubSetBuilderSubTab(tab) { this.#builderSubTab = tab; this.#renderMain(); }

        /** Real compare: is the editor's current content still exactly what was uploaded? */
        #isBuilderSourceModified() {
            if (!this.#uploadedFileOriginal) return false;
            const current = document.getElementById("cz-hub-builder-code-paste")?.value ?? "";
            return current !== this.#uploadedFileOriginal.text;
        }

        #renderUploadConfirmation() {
            if (!this.#uploadedFileOriginal) return "";
            const lang = { js: "JavaScript", html: "HTML", css: "CSS", json: "JSON", md: "Markdown" }[this.#uploadedFileOriginal.name.split(".").pop().toLowerCase()] || "Unknown";
            const current = document.getElementById("cz-hub-builder-code-paste")?.value ?? this.#uploadedFileOriginal.text;
            const modified = this.#isBuilderSourceModified();
            const lines = current.split("\n").length;
            const sizeKb = (new Blob([current]).size / 1024).toFixed(1);
            return `<div class="cz-panel" style="border-left:3px solid ${modified ? "#d97706" : "#16a34a"};">
                <p>✅ File loaded successfully</p>
                ${this.#renderKeyValueTable({
                    "Filename": this.#uploadedFileOriginal.name, "Size": `${sizeKb} KB`, "Lines": lines, "Language": lang,
                    "Module ID": this.#uploadedFileMeta?.moduleId || "—", "Version": this.#uploadedFileMeta?.version || "—"
                })}
                <p>Status: <b data-upload-status>${modified ? "Modified (Unsaved)" : "Unchanged"}</b></p>
                ${modified ? '<p class="cz-muted">Changes detected — editor differs from the original uploaded file.</p>' : ""}
            </div>`;
        }

        async #handleRefactorFileSelected(file) {
            const text = await this.#readFileAsText(file);
            const el = document.getElementById("cz-hub-refactor-html");
            if (el) el.value = text;
        }

        #hubRefactorSplit() {
            const refactor = window.CozyOS.ProjectRefactor;
            const html = document.getElementById("cz-hub-refactor-html")?.value;
            const baseName = document.getElementById("cz-hub-refactor-basename")?.value.trim() || "page";
            if (!html || !html.trim()) { this.#devOutput('<p class="cz-muted">Paste or drop an HTML file first.</p>'); return; }
            try {
                const result = refactor.splitSingleFile(html, baseName);
                this.#lastRefactorResult = result;
                this.#devOutput(`
                    <h3>Split Result</h3>
                    <p>${escapeHtml(result.detected.cssBlocksExtracted)} CSS block(s), ${escapeHtml(result.detected.jsBlocksExtracted)} JS block(s) extracted.</p>
                    ${result.warnings.map(w => `<p class="cz-muted">⚠ ${escapeHtml(w)}</p>`).join("")}
                    <div class="cz-row">
                        <button class="cz-btn" data-action="hub-download-refactor" data-part="html" data-name="${escapeHtml(baseName)}.html">Download ${escapeHtml(baseName)}.html</button>
                        ${result.css ? `<button class="cz-btn" data-action="hub-download-refactor" data-part="css" data-name="${escapeHtml(baseName)}.css">Download ${escapeHtml(baseName)}.css</button>` : ""}
                        ${result.js ? `<button class="cz-btn" data-action="hub-download-refactor" data-part="js" data-name="${escapeHtml(baseName)}.js">Download ${escapeHtml(baseName)}.js</button>` : ""}
                    </div>
                    ${result.js ? `<button class="cz-btn cz-btn-primary" data-action="hub-refactor-certify">Certify Extracted JS</button>` : ""}`);
            } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
        }

        #hubDownloadRefactor(part, name) {
            if (!this.#lastRefactorResult) return;
            const content = this.#lastRefactorResult[part];
            if (!content) return;
            downloadTextFile(name, content);
        }

        async #hubRefactorCertify() {
            const refactor = window.CozyOS.ProjectRefactor;
            if (!this.#lastRefactorResult || !this.#lastRefactorResult.js) { this.#devOutput('<p class="cz-muted">Nothing to certify.</p>'); return; }
            try {
                const result = await refactor.refactorAndCertify(this.#lastRefactorResult.js, { moduleId: "RefactoredModule", autoRepair: true });
                this.#devOutput(`
                    <h3>Certification</h3>
                    <p>Quick: <span class="cz-badge ${verdictBadgeClass(result.quickResult.verdict)}">${escapeHtml(result.quickResult.verdict)}</span> ${escapeHtml(result.quickResult.summary.scorePercent)}%</p>
                    ${result.recertifyResult ? `<p>Re-certified after repair: <span class="cz-badge ${verdictBadgeClass(result.recertifyResult.verdict)}">${escapeHtml(result.recertifyResult.verdict)}</span> ${escapeHtml(result.recertifyResult.summary.scorePercent)}%</p>` : ""}
                    <button class="cz-btn" data-action="hub-download-refactor-final">Download Final JS</button>`);
                this.#lastRefactorFinalJs = result.finalSource;
            } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
        }

        #hubDownloadRefactorFinal() {
            if (!this.#lastRefactorFinalJs) return;
            downloadTextFile("refactored-module.js", this.#lastRefactorFinalJs);
        }

        #hubRefactorMerge() {
            const refactor = window.CozyOS.ProjectRefactor;
            const html = document.getElementById("cz-hub-merge-html")?.value;
            const css = document.getElementById("cz-hub-merge-css")?.value || null;
            const js = document.getElementById("cz-hub-merge-js")?.value || null;
            if (!html || !html.trim()) { this.#devOutput('<p class="cz-muted">Paste the HTML first.</p>'); return; }
            try {
                const result = refactor.mergeProject({ html, css, js });
                this.#lastRefactorResult = { html: result.html };
                this.#devOutput(`
                    <h3>Merged File</h3>
                    ${result.notes.map(n => `<p class="cz-muted">${escapeHtml(n)}</p>`).join("")}
                    <textarea class="cz-input" rows="10" readonly>${escapeHtml(result.html)}</textarea>
                    <button class="cz-btn cz-btn-primary" data-action="hub-download-refactor" data-part="html" data-name="merged.html">Download merged.html</button>`);
            } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
        }

        #hubRefactorModularize() {
            const refactor = window.CozyOS.ProjectRefactor;
            const moduleName = document.getElementById("cz-hub-modularize-name")?.value.trim() || "Module";
            const js = document.getElementById("cz-hub-modularize-js")?.value;
            const html = document.getElementById("cz-hub-modularize-html")?.value || null;
            if (!js || !js.trim()) { this.#devOutput('<p class="cz-muted">Paste the JavaScript first.</p>'); return; }
            try {
                const result = refactor.modularizeProject({ html, js }, moduleName);
                this.#lastRefactorResult = { js: result.js };
                this.#devOutput(`
                    <h3>Modularized: ${escapeHtml(result.filename)}</h3>
                    ${result.compatibilityWarnings.map(w => `<p class="cz-muted">⚠ ${escapeHtml(w)}</p>`).join("") || '<p class="cz-muted">No compatibility warnings.</p>'}
                    <button class="cz-btn cz-btn-primary" data-action="hub-download-refactor" data-part="js" data-name="${escapeHtml(result.filename)}">Download ${escapeHtml(result.filename)}</button>
                    <button class="cz-btn" data-action="hub-refactor-certify">Certify</button>`);
            } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
        }

        async #hubRefactorOptimize() {
            const refactor = window.CozyOS.ProjectRefactor;
            const moduleId = document.getElementById("cz-hub-optimize-moduleid")?.value.trim() || "OptimizedModule";
            const js = document.getElementById("cz-hub-optimize-js")?.value;
            if (!js || !js.trim()) { this.#devOutput('<p class="cz-muted">Paste the JavaScript first.</p>'); return; }
            try {
                const result = await refactor.refactorAndCertify(js, { moduleId, autoRepair: true });
                this.#lastRefactorFinalJs = result.finalSource;
                this.#devOutput(`
                    <h3>Optimize Result: ${escapeHtml(moduleId)}</h3>
                    <p>Before: <span class="cz-badge ${verdictBadgeClass(result.quickResult.verdict)}">${escapeHtml(result.quickResult.verdict)}</span> ${escapeHtml(result.quickResult.summary.scorePercent)}%</p>
                    ${result.recertifyResult ? `<p>After repair: <span class="cz-badge ${verdictBadgeClass(result.recertifyResult.verdict)}">${escapeHtml(result.recertifyResult.verdict)}</span> ${escapeHtml(result.recertifyResult.summary.scorePercent)}%</p>` : '<p class="cz-muted">No deterministically-fixable findings.</p>'}
                    <button class="cz-btn cz-btn-primary" data-action="hub-download-refactor-final">Download Optimized JS</button>`);
            } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
        }

        async #hubBuildPlan(forceGenerate = false) {
            const hub = this.#hub();
            const text = document.getElementById("cz-hub-builder-prompt")?.value.trim();
            try {
                const plan = this.#lastAnalysis?.understanding?.plan || (await hub.openWithBuilder((text || "Module").replace(/^build\s+/i, "").replace(/\s+coordinator$/i, "")));

                // Identity preservation: if a real existing file was
                // uploaded (Method 3), its actual module identity
                // overrides whatever the heuristic plan invented — this is
                // what makes "improve/bugfix/certify this file" target the
                // SAME file rather than generating a new one. Only applied
                // when it actually differs (case-insensitively) from what
                // real class-name analysis already produced — filename
                // casing is a cruder signal than a real detected class
                // name, so it never clobbers a more accurate identity.
                if (this.#pendingBuilderFiles && this.#pendingBuilderFiles.length > 0) {
                    const uploaded = this.#pendingBuilderFiles[0];
                    const realModuleId = this.#deriveModuleIdFromFilename(uploaded.name);
                    if (realModuleId && (!plan.exportName || plan.exportName.toLowerCase() !== realModuleId.toLowerCase())) {
                        plan.exportName = realModuleId;
                        plan.folder = `core/modules/${realModuleId.toLowerCase()}`;
                    }
                }

                this.#lastBuildResult = await hub.buildFromPlan(plan, "coordinator", { forceGenerate });
                this.#renderMain();
            } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
        }

        #hubDownloadFile(filename) {
            if (!this.#lastBuildResult || !this.#lastBuildResult.files[filename]) return;
            downloadTextFile(filename, this.#lastBuildResult.files[filename]);
        }

        // =====================================================================
        // ─── UNDERSTANDING ENGINE / OCR ────────────────────────────────────────
        // =====================================================================

        #renderUnderstanding() {
            const ue = window.CozyOS.UnderstandingEngine;
            if (!ue) return `<h1>Understanding Engine</h1><div class="cz-not-connected">Not connected.</div>`;
            const p = ue.listProviders();
            const row = (label, info) => `<div class="cz-row"><span>${escapeHtml(label)}</span><span class="cz-badge ${info.available ? "cz-badge-ready" : "cz-badge-neutral"}">${info.available ? "Ready" : "Not installed"}</span><span class="cz-muted">${escapeHtml(info.note)}</span></div>`;

            // Language Engine — real status card. Every value below is read
            // directly from the live LanguageEngine, never fabricated: real
            // count of loaded languages, the real current default, and a
            // real check of whether any loaded language is actually RTL
            // (not just whether the isRTL() method exists).
            const lang = window.CozyOS.LanguageEngine;
            const languageCard = lang ? (() => {
                const languages = lang.listLanguages();
                const currentCode = lang.getCurrentLanguage();
                const current = languages.find(l => l.code === currentCode);
                const rtlSupported = languages.some(l => l.rtl);
                return `<div class="cz-panel">
                    <div class="cz-row"><span>Language Engine</span><span class="cz-badge cz-badge-ready">Ready</span><span class="cz-muted">${escapeHtml(lang.getVersion())}</span></div>
                    <div class="cz-row"><span>Languages Loaded</span><span>${languages.length}</span><span class="cz-muted">${escapeHtml(languages.map(l => l.name).join(", "))}</span></div>
                    <div class="cz-row"><span>Default Language</span><span>${escapeHtml(current ? current.name : currentCode)}</span></div>
                    <div class="cz-row"><span>RTL Support</span><span class="cz-badge ${rtlSupported ? "cz-badge-ready" : "cz-badge-neutral"}">${rtlSupported ? "Ready" : "None loaded"}</span></div>
                </div>`;
            })() : `<div class="cz-panel"><div class="cz-row"><span>Language Engine</span><span class="cz-badge cz-badge-neutral">Not installed</span></div></div>`;

            return `<h1>Understanding Engine</h1>
                <div class="cz-panel">
                    ${row("Text Analyzer", p.textAnalyzer)}
                    ${row("Code Analyzer", p.codeAnalyzer)}
                    ${row("PDF Analyzer", p.pdfAnalyzer)}
                    ${row("Image Analyzer", p.imageAnalyzer)}
                    ${row("OCR Engine", p.ocrEngine)}
                </div>
                ${languageCard}
                <div class="cz-panel">
                    <h3>Requirement Gap Checklist</h3>
                    ${ue.listChecklist().map(c => `<span class="cz-badge cz-badge-neutral">${escapeHtml(c.label)}</span>`).join(" ")}
                </div>`;
        }

        #renderOcr() {
            const ocr = window.CozyOS.OCR;
            if (!ocr) return `<h1>OCR</h1><div class="cz-not-connected">Not connected.</div>`;
            const status = ocr.getProviderStatus();
            return `<h1>OCR</h1>
                <div class="cz-panel">
                    <div class="cz-row"><span class="cz-badge ${status.available ? "cz-badge-ready" : "cz-badge-neutral"}">${status.available ? "Ready" : "No provider loaded"}</span><span>${escapeHtml(status.note)}</span></div>
                </div>
                <div class="cz-panel">${this.#renderKeyValueTable(ocr.getDiagnosticsReport())}</div>`;
        }

        #renderKeyValueTable(obj) {
            return `<table class="cz-table"><tbody>${Object.entries(obj).map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(typeof v === "object" ? JSON.stringify(v) : v)}</td></tr>`).join("")}</tbody></table>`;
        }

        // =====================================================================
        // ─── QUICK / FULL CERTIFICATION ────────────────────────────────────────
        // Same real CozyCertification calls used elsewhere in CozyOS,
        // reached through hub.quickCertifyModule()/fullCertification().
        // =====================================================================

        #renderQuickCert() {
            const workspace = window.CozyOS.WorkspaceShell;
            const files = workspace ? workspace.listFiles() : [];
            return `<h1>Quick Certification</h1>
                <p class="cz-subtitle">Drag a file in, pick it, load one already uploaded elsewhere in CozyOS, or paste source. Nothing here is ever executed; the text goes straight to CozyCertification.quickCertification().</p>
                <div class="cz-panel">
                    ${files.length > 0 ? `
                    <div class="cz-field">
                        <label>Load a file already uploaded to Workspace (from Builder, BugFixer, or a prior registration — no re-upload)</label>
                        <div class="cz-row">
                            <select class="cz-input" id="cz-hub-qc-existing-file">
                                <option value="">— Select a file —</option>
                                ${files.map(f => `<option value="${escapeHtml(f.fileId)}">${escapeHtml(f.filename)}${f.coordinator ? ` (${escapeHtml(f.coordinator)})` : ""}</option>`).join("")}
                            </select>
                            <button class="cz-btn" data-action="hub-load-existing-file">Load</button>
                        </div>
                    </div>` : ""}
                    <div class="cz-dropzone" id="cz-hub-qc-dropzone">
                        <p>Drag &amp; drop a file here (.js, .html, .css, .json, .md, .txt) — or use the picker below.</p>
                        <input type="file" id="cz-hub-qc-file" accept=".js,.html,.css,.json,.md,.txt" multiple />
                    </div>
                    <div id="cz-hub-qc-detected" class="cz-muted"></div>
                    <div class="cz-field"><label>Module ID</label><input class="cz-input" id="cz-hub-qc-moduleid" placeholder="e.g. CozySpeech" /></div>
                    <div class="cz-field"><label>Version</label><input class="cz-input" id="cz-hub-qc-version" placeholder="1.0.0" /></div>
                    <div class="cz-field"><label>Or paste source</label><textarea class="cz-input" id="cz-hub-qc-source" placeholder="Paste source, drag a file above, or load an already-uploaded file..."></textarea></div>
                    <button class="cz-btn cz-btn-primary" data-action="hub-quick-cert">Run Quick Certification</button>
                </div>
                <div class="cz-panel cz-dev-action-output-panel" id="cz-hub-output"></div>`;
        }

        /**
         * #detectFileMetadata(filename, sourceText)
         *   Same real, regex-based extraction used throughout CozyOS —
         *   the file's own header (Version:, File Reference:, Layer:) and
         *   the "cozy-<kebab-case>.js" filename convention. Never
         *   fabricates a field it can't actually find in the text.
         */
        /** Derives a real moduleId from an actual filename — the SAME convention WorkspaceShell uses, so identity stays consistent across the pipeline. Returns null (never a fabricated name) if there's nothing real to derive from. */
        #deriveModuleIdFromFilename(filename) {
            if (!filename) return null;
            const m = /^cozy-([a-z0-9-]+)\.(js|html|css)$/i.exec(filename);
            if (m) return m[1].split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join("");
            const bare = filename.replace(/\.[^.]+$/, "");
            return bare || null;
        }

        #detectFileMetadata(filename, sourceText) {
            const versionMatch = /^\s*\*\s*Version:\s*(.+)$/m.exec(sourceText);
            const fileRefMatch = /^\s*\*\s*File Reference:\s*(.+)$/m.exec(sourceText);
            const layerMatch = /^\s*\*\s*Layer:\s*(.+)$/m.exec(sourceText);
            const nameMatch = /^\s*\*\s*CozyOS Enterprise Framework\s*[—-]\s*(.+)$/m.exec(sourceText);
            const kebabMatch = /^cozy-([a-z0-9-]+)\.(js|html|css)$/i.exec(filename);
            const moduleIdFromFilename = kebabMatch ? kebabMatch[1].split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join("") : null;
            const ext = (filename.split(".").pop() || "").toLowerCase();
            const extToCategory = { js: "javascript", html: "html", css: "css", json: "json", md: "markdown", txt: "text" };
            return {
                moduleId: moduleIdFromFilename || (nameMatch ? nameMatch[1].replace(/\s+/g, "") : null),
                version: versionMatch ? versionMatch[1].trim() : null,
                filePath: fileRefMatch ? fileRefMatch[1].trim() : filename,
                layer: layerMatch ? layerMatch[1].trim() : null,
                category: extToCategory[ext] || "unknown",
                extension: ext
            };
        }

        #readFileAsText(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(reader.error);
                reader.readAsText(file);
            });
        }

        #readFileAsArrayBuffer(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(reader.error);
                reader.readAsArrayBuffer(file);
            });
        }

        /**
         * #handleZipProjectUpload(file)
         *   Real ZIP extraction via ProjectRefactor.importFromZip() (real
         *   JSZip, honestly unavailable if the library isn't loaded) +
         *   buildProjectModel() (real categorization/folder structure/
         *   RequirementReader analysis) — original paths and filenames
         *   preserved exactly, never flattened, never renamed.
         */
        async #handleZipProjectUpload(file) {
            const refactor = window.CozyOS.ProjectRefactor;
            if (!refactor) { this.#devOutput('<p class="cz-muted">ProjectRefactor is not connected.</p>'); return; }
            try {
                const arrayBuffer = await this.#readFileAsArrayBuffer(file);
                const imported = await refactor.importFromZip(arrayBuffer);
                if (!imported.available) { this.#devOutput(`<p class="cz-muted">${escapeHtml(imported.reason)}</p>`); return; }

                const model = refactor.buildProjectModel(imported.files);
                this.#currentProjectFiles = imported.files;
                this.#currentProjectModel = model;

                if (model.requirementSummary) {
                    this.#requirementSummary = model.requirementSummary;
                    const hub = this.#hub();
                    this.#lastAnalysis = await hub.analyzeRequirement(model.requirementSummary);
                    this.#lastAnalysis.requirementReaderUsed = true;
                }

                this.#devOutput(`
                    <h3>Project loaded: ${escapeHtml(file.name)}</h3>
                    <p>${model.fileCount} file(s) across ${model.folderStructure.length} folder(s): ${escapeHtml(model.folderStructure.join(", ") || "(root only)")}</p>
                    ${Object.entries(model.byCategory).map(([cat, paths]) => `<p class="cz-muted">${escapeHtml(cat)}: ${escapeHtml(paths.join(", "))}</p>`).join("")}
                `);
                this.#renderMain();
            } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
        }

        /** Handles a file dropped or picked for Quick Certification — reads it, auto-detects metadata, and remembers its source so later Developer Actions never need it pasted again. */
        async #handleQuickFileSelected(fileOrList) {
            const files = Array.isArray(fileOrList) || (fileOrList && typeof fileOrList.length === "number" && !fileOrList.name)
                ? Array.from(fileOrList) : [fileOrList];
            if (files.length === 0 || !files[0]) return;

            const [firstFile, ...restFiles] = files;
            const sourceText = await this.#readFileAsText(firstFile);
            const meta = this.#detectFileMetadata(firstFile.name, sourceText);
            const rr = window.CozyOS.RequirementReader;
            if (rr) {
                try {
                    const reading = rr.readFile(firstFile.name, sourceText);
                    if (reading.identity.className) meta.moduleId = reading.identity.className;
                    if (reading.identity.version) meta.version = reading.identity.version;
                } catch (_err) { /* RequirementReader couldn't parse this file — existing regex-based meta above still applies */ }
            }
            this.#lastUploadedFilename = firstFile.name;
            const moduleIdEl = document.getElementById("cz-hub-qc-moduleid");
            const versionEl = document.getElementById("cz-hub-qc-version");
            const sourceEl = document.getElementById("cz-hub-qc-source");
            if (moduleIdEl && meta.moduleId) moduleIdEl.value = meta.moduleId;
            if (versionEl && meta.version) versionEl.value = meta.version;
            if (sourceEl) sourceEl.value = sourceText;

            const hub = this.#hub();
            const existing = meta.moduleId && hub ? (() => { try { return hub.getModuleCard(meta.moduleId); } catch (_err) { return null; } })() : null;
            const detectedEl = document.getElementById("cz-hub-qc-detected");
            let extraHtml = "";
            if (restFiles.length > 0 && hub) {
                const results = [];
                for (const f of restFiles) {
                    try {
                        const text = await this.#readFileAsText(f);
                        const m = this.#detectFileMetadata(f.name, text);
                        const id = m.moduleId || f.name.replace(/\.[^.]+$/, "");
                        const r = hub.quickCertifyModule(id, text, m.version || "0.0.0");
                        results.push({ name: f.name, moduleId: id, verdict: r.verdict, score: r.summary.scorePercent });
                    } catch (err) { results.push({ name: f.name, error: err.message }); }
                }
                extraHtml = `<br>Also certified: ${results.map(r => r.error ? `${escapeHtml(r.name)} (failed: ${escapeHtml(r.error)})` : `${escapeHtml(r.name)} → ${escapeHtml(r.moduleId)}: ${escapeHtml(r.verdict)} (${escapeHtml(r.score)}%)`).join("; ")}`;
            }
            if (detectedEl) {
                detectedEl.innerHTML = `Detected: <b>${escapeHtml(meta.moduleId || "unknown")}</b>
                    ${meta.version ? ` · v${escapeHtml(meta.version)}` : ""}
                    ${meta.layer ? ` · ${escapeHtml(meta.layer)}` : ""}
                    · ${escapeHtml(meta.category)} · path: ${escapeHtml(meta.filePath)}
                    ${existing && existing.goldenVersion ? ` · <b>Existing file found</b> (Golden v${escapeHtml(existing.goldenVersion)})` : ""}${extraHtml}`;
            }
        }

        /** Loads a file already registered in Workspace's file registry directly into the Quick Certification form — its real stored source, never a re-upload prompt. */
        #hubLoadExistingFile() {
            const workspace = window.CozyOS.WorkspaceShell;
            const fileId = document.getElementById("cz-hub-qc-existing-file")?.value;
            if (!workspace || !fileId) return;
            const file = workspace.getFile(fileId);
            if (!file) { this.#devOutput('<p class="cz-muted">That file is no longer registered.</p>'); return; }
            if (!file.source) {
                this.#devOutput('<p class="cz-muted">This entry has no text source on file (it was registered as a handle-only reference) — open it with CozyBugFixer\'s Edit action to read its current on-disk content first.</p>');
                return;
            }
            const moduleIdEl = document.getElementById("cz-hub-qc-moduleid");
            const versionEl = document.getElementById("cz-hub-qc-version");
            const sourceEl = document.getElementById("cz-hub-qc-source");
            if (moduleIdEl) moduleIdEl.value = file.coordinator || file.filename.replace(/\.[^.]+$/, "");
            if (versionEl) versionEl.value = file.builderVersion || versionEl.value || "";
            if (sourceEl) sourceEl.value = file.source;

            // Same RequirementReader path uploads use — a file opened from
            // Workspace is analyzed exactly like an uploaded one, and the
            // result is shared with Builder (#requirementReading/#requirementSummary)
            // and BugFixer (#bugfixerRequirementReading), so the user never
            // has to upload the same file again to use those tools.
            const rr = window.CozyOS.RequirementReader;
            if (rr) {
                try {
                    const reading = rr.readFile(file.filename, file.source);
                    this.#requirementReading = reading;
                    this.#requirementSummary = rr.generateRequirementSummary(reading.id);
                    this.#bugfixerRequirementReading = reading;
                    this.#uploadedFileOriginal = { name: file.filename, text: file.source, loadedAt: new Date().toISOString() };
                    this.#bugfixerUploadedOriginal = { name: file.filename, text: file.source, loadedAt: new Date().toISOString() };
                } catch (_err) { /* file didn't parse as code — Certification fields above are still populated */ }
            }
            this.#devOutput(`<p>Loaded <b>${escapeHtml(file.filename)}</b> (${escapeHtml(file.source.length)} characters) from Workspace.</p>`);
        }

        /**
         * #hubQuickCert()
         *   Runs the real quickCertifyModule() call, then shows the six
         *   requested Developer Actions directly below the result — every
         *   one of them reuses the source already captured here (upload,
         *   drag-drop, or existing-file load), auto-registering to
         *   Workspace first if needed, so nothing downstream ever needs
         *   the source pasted a second time.
         */
        #hubQuickCert() {
            const hub = this.#hub();
            const moduleId = document.getElementById("cz-hub-qc-moduleid")?.value.trim() || this.#deriveModuleIdFromFilename(this.#lastUploadedFilename) || "untitled_module";
            const version = document.getElementById("cz-hub-qc-version")?.value.trim() || "0.0.0";
            const source = document.getElementById("cz-hub-qc-source")?.value || "";
            try {
                const result = hub.quickCertifyModule(moduleId, source, version);
                this.#lastQuickCertModuleId = moduleId;
                this.#lastQuickCertSource = source;
                this.#retainedSources.set(moduleId, source);
                this.#lastQuickCertResult = result;
                this.#devOutput(`
                    <div class="cz-row"><span class="cz-badge ${verdictBadgeClass(result.verdict)}">${escapeHtml(result.verdict)}</span><span>${escapeHtml(result.summary.scorePercent)}%</span><span>Grade ${escapeHtml(result.overallGrade)}</span></div>
                    <div class="cz-row" style="flex-wrap:wrap;gap:6px;">
                        <button class="cz-btn" data-action="hub-export-qc" data-format="html">Export HTML</button>
                        <button class="cz-btn" data-action="hub-export-qc" data-format="markdown">Export Markdown</button>
                        <button class="cz-btn" data-action="hub-export-qc" data-format="json">Export JSON</button>
                        <button class="cz-btn" data-action="hub-export-qc" data-format="csv">Export CSV</button>
                        <button class="cz-btn" data-action="hub-export-qc" data-format="text">Export TXT</button>
                        <button class="cz-btn" data-action="hub-export-qc" data-format="pdf">Export PDF</button>
                    </div>
                    ${this.#renderQuickCertDeveloperActions(moduleId)}`);
            } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
        }

        /** Exports the last Quick Certification result — same real cert.exportReport() call and PDF pipeline as the original Certification Center. */
        /**
         * #getRetainedSource(moduleId)
         *   Tries WorkspaceShell first (the richer, authoritative source
         *   when it's connected and knows this module), then falls back to
         *   this UI's own retained-source cache — populated by every
         *   Quick Certification, Builder generation, or upload this
         *   session. Never requires WorkspaceShell to find source text.
         */
        #getRetainedSource(moduleId) {
            const cached = this.#retainedSources.get(moduleId);
            if (cached) return cached;
            const hub = this.#hub();
            if (hub) { try { const s = hub.getModuleSource(moduleId); if (s) return s; } catch (_err) { /* Workspace not connected or module not registered there — fall through */ } }
            return null;
        }

        #hubExportQuickCert(format) {
            const cert = window.CozyOS.Certification;
            if (!cert || !this.#lastQuickCertResult) { this.#devOutput('<p class="cz-muted">Nothing to export yet — run Quick Certification first.</p>'); return; }
            const filenameBase = this.#lastQuickCertModuleId || "cozyos-report";
            const content = cert.exportReport(this.#lastQuickCertResult, format === "pdf" ? "html" : format);
            if (format === "pdf") {
                const pdfBlob = textToPdfBlob(`CozyOS Certification Report — ${filenameBase}`, stripHtml(content));
                if (pdfBlob) { downloadBlob(`${filenameBase}.pdf`, pdfBlob, "application/pdf"); return; }
                const blob = new Blob([content], { type: "text/html" });
                const blobUrl = URL.createObjectURL(blob);
                const win = window.open(blobUrl, "_blank");
                if (win) { win.addEventListener ? win.addEventListener("load", () => win.print()) : setTimeout(() => win.print(), 300); }
                else window.alert("PDF library unavailable and popup blocked — could not export.");
                setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
                return;
            }
            const mimeMap = { json: "application/json", csv: "text/csv", html: "text/html", markdown: "text/markdown", text: "text/plain" };
            const extMap = { json: "json", csv: "csv", html: "html", markdown: "md", text: "txt" };
            downloadBlob(`${filenameBase}.${extMap[format] || "txt"}`, content, mimeMap[format] || "text/plain");
        }

        #renderQuickCertDeveloperActions(moduleId) {
            const actions = [
                ["hub-qc-repair", "🛠 Repair with CozyBugFixer"], ["hub-qc-open-bugfixer", "📂 Open with CozyBugFixer"],
                ["hub-qc-open-builder", "🏗 Open with CozyBuilder"], ["hub-qc-register-workspace", "📋 Register to Workspace"],
                ["hub-qc-register-registry", "📦 Register to Service Registry"], ["hub-qc-lock-release", "🔒 Lock Release"]
            ];
            return `<div class="cz-panel cz-dev-actions">
                <h3>Developer Actions</h3>
                <div class="cz-row" style="flex-wrap:wrap;gap:6px;">
                    ${actions.map(([action, label]) => `<button class="cz-btn" data-action="${action}" data-module="${escapeHtml(moduleId)}">${escapeHtml(label)}</button>`).join("")}
                </div>
            </div>`;
        }

        /** Ensures the just-certified module has a real Workspace registration, using the source already captured by Quick Certification — never re-prompts for it. */
        #ensureQuickCertWorkspaceFile(moduleId) {
            const hub = this.#hub();
            const workspace = window.CozyOS.WorkspaceShell;
            if (!workspace) throw new Error("WorkspaceShell is not connected.");
            const existing = workspace.listFiles({ coordinator: moduleId })[0];
            if (existing) return existing.fileId;
            if (moduleId !== this.#lastQuickCertModuleId || !this.#lastQuickCertSource) {
                throw new Error(`No captured source for "${moduleId}" — run Quick Certification on it first.`);
            }
            const filename = /^cozy-[a-z0-9-]+\.js$/i.test(moduleId) ? moduleId : `cozy-${moduleId.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()}.js`;
            return hub.registerToWorkspace({ filename, source: this.#lastQuickCertSource });
        }

        async #hubQuickCertAction(action, moduleId) {
            const hub = this.#hub();
            try {
                switch (action) {
                    case "hub-qc-repair": {
                        const sourceText = this.#getRetainedSource(moduleId);
                        const preview = await hub.repairModule(moduleId, { approve: false, sourceText });
                        this.#renderRepairPreview(moduleId, preview);
                        break;
                    }
                    case "hub-qc-open-bugfixer": {
                        const sourceText = this.#getRetainedSource(moduleId);
                        const result = await hub.openWithBugFixer(moduleId, sourceText);
                        this.#renderOpenBugFixerResult(moduleId, result);
                        break;
                    }
                    case "hub-qc-open-builder": {
                        const plan = await hub.openWithBuilder(moduleId);
                        this.#devOutput(`<p>Plan ready: ${escapeHtml(plan.exportName)}. Visit Builder to generate.</p>`);
                        break;
                    }
                    case "hub-qc-register-workspace": {
                        const fileId = this.#ensureQuickCertWorkspaceFile(moduleId);
                        this.#devOutput(`<p>Registered to Workspace (fileId ${escapeHtml(fileId)}).</p>`);
                        break;
                    }
                    case "hub-qc-register-registry": {
                        hub.registerToServiceRegistry(moduleId);
                        this.#devOutput("<p>Registered to Service Registry.</p>");
                        break;
                    }
                    case "hub-qc-lock-release": this.#setSection("releaseCenter"); return;
                }
            } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
        }

        // Shared rendering for a repair preview, whether it came from
        // Workspace's richer flow or CozyBugFixer running standalone.
        #renderRepairPreview(moduleId, preview) {
            const standaloneNotice = preview.standalone
                ? `<div class="cz-panel" style="border-left:3px solid #d97706;"><p class="cz-muted">Workspace not connected. Running in standalone mode.</p></div>` : "";
            if (!preview.changed) { this.#devOutput(`${standaloneNotice}<p>No deterministically-fixable findings.</p>`); return; }
            const before = preview.preview ? preview.preview.beforeCertification : null;
            const after = preview.preview ? preview.preview.afterCertification : null;
            this.#devOutput(`${standaloneNotice}
                <p>Before: ${before ? escapeHtml(before.scorePercent) : "?"}% → After: ${after && after.available ? escapeHtml(after.scorePercent) : "?"}%</p>
                <button class="cz-btn cz-btn-primary" data-action="hub-confirm-repair" data-module="${escapeHtml(moduleId)}">Confirm &amp; Save</button>`);
        }

        #renderOpenBugFixerResult(moduleId, result) {
            const standaloneNotice = result.standalone
                ? `<div class="cz-panel" style="border-left:3px solid #d97706;"><p class="cz-muted">Workspace not connected. Running in standalone mode.</p></div>` : "";
            this.#devOutput(`${standaloneNotice}<p>Loaded into CozyBugFixer (fileId ${escapeHtml(result.bfFileId)}).</p>
                <div class="cz-row">
                    <button class="cz-btn" data-action="hub-qc-repair" data-module="${escapeHtml(moduleId)}">Repair</button>
                </div>`);
        }



        #renderFullCert() {
            return `<h1>Full Certification</h1>
                <div class="cz-panel"><button class="cz-btn cz-btn-primary" data-action="hub-full-cert">Run Full Certification</button></div>
                <div class="cz-panel cz-dev-action-output-panel" id="cz-hub-output"></div>`;
        }

        #hubFullCert() {
            const hub = this.#hub();
            try {
                const result = hub.fullCertification();
                const pr = result.platformReport;
                this.#devOutput(`<div class="cz-row"><span class="cz-badge ${verdictBadgeClass(pr.enterpriseVerdict)}">${escapeHtml(pr.enterpriseVerdictLabel)}</span><span>${escapeHtml(pr.overallPlatformScore)}%</span></div>
                    <table class="cz-table"><thead><tr><th>Module</th><th>Verdict</th><th>Score</th></tr></thead><tbody>
                    ${pr.coreModules.map(m => `<tr><td>${escapeHtml(m.name)}</td><td>${escapeHtml(m.verdict)}</td><td>${escapeHtml(m.score)}%</td></tr>`).join("")}
                    </tbody></table>`);
            } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
        }

        // =====================================================================
        // ─── BUGFIXER ─────────────────────────────────────────────────────────
        // =====================================================================

        #renderBugFixerSection() {
            const selected = this.#selectedModuleId;
            if (selected) {
                return `<h1>BugFixer: ${escapeHtml(selected)}</h1>
                    <div class="cz-panel">
                        <p class="cz-subtitle">Method 1 — Received from Builder / Module Explorer.</p>
                        <button class="cz-btn" data-action="hub-open-bugfixer" data-module="${escapeHtml(selected)}">Open with CozyBugFixer</button>
                        <button class="cz-btn cz-btn-primary" data-action="hub-repair" data-module="${escapeHtml(selected)}">Repair with CozyBugFixer</button>
                    </div>
                    <div class="cz-panel cz-dev-action-output-panel" id="cz-hub-output"></div>`;
            }
            return `<h1>BugFixer</h1>
                <p class="cz-subtitle">No module selected via Builder/Module Explorer — use Method 2 or Method 3 below, matching Builder exactly.</p>
                <div class="cz-panel">
                    <div class="cz-field"><label>Method 2 — Paste source code</label>
                        <textarea class="cz-input" id="cz-hub-bugfixer-code-paste" rows="${this.#bugfixerUploadedOriginal ? 14 : 4}" placeholder="Paste existing JS/HTML/CSS/JSON/Markdown/TXT source here...">${this.#bugfixerUploadedOriginal ? escapeHtml(this.#bugfixerUploadedOriginal.text) : ""}</textarea>
                    </div>
                    <div class="cz-field"><label>Method 3 — Upload existing file(s)</label>
                        <div class="cz-dropzone" id="cz-hub-bugfixer-dropzone">
                            <p>Drag &amp; drop a file here (.js, .html, .css, .json, .md, .txt), or use the picker — content loads directly into Method 2's editor above.</p>
                            <input type="file" id="cz-hub-bugfixer-files" accept=".js,.html,.css,.json,.md,.txt,.zip" multiple />
                        </div>
                    </div>
                    ${this.#renderBugFixerUploadConfirmation()}
                    <button class="cz-btn cz-btn-primary" data-action="hub-bugfixer-repair-pasted">Repair</button>
                </div>
                <div class="cz-panel cz-dev-action-output-panel" id="cz-hub-output"></div>`;
        }

        #renderBugFixerUploadConfirmation() {
            if (!this.#bugfixerUploadedOriginal) return "";
            const lang = { js: "JavaScript", html: "HTML", css: "CSS", json: "JSON", md: "Markdown" }[this.#bugfixerUploadedOriginal.name.split(".").pop().toLowerCase()] || "Unknown";
            const current = document.getElementById("cz-hub-bugfixer-code-paste")?.value ?? this.#bugfixerUploadedOriginal.text;
            const modified = current !== this.#bugfixerUploadedOriginal.text;
            const lines = current.split("\n").length;
            const sizeKb = (new Blob([current]).size / 1024).toFixed(1);
            return `<div class="cz-panel" style="border-left:3px solid ${modified ? "#d97706" : "#16a34a"};">
                <p>✅ File loaded successfully</p>
                ${this.#renderKeyValueTable({
                    "Filename": this.#bugfixerUploadedOriginal.name, "Size": `${sizeKb} KB`, "Lines": lines, "Language": lang,
                    "Module ID": this.#bugfixerUploadedMeta?.moduleId || "—", "Version": this.#bugfixerUploadedMeta?.version || "—"
                })}
                <p>Status: <b data-bugfixer-upload-status>${modified ? "Modified (Unsaved)" : "Unchanged"}</b></p>
            </div>`;
        }

        async #handleBugFixerFilesSelected(fileList) {
            const files = Array.from(fileList);

            if (files.length === 1 && /\.zip$/i.test(files[0].name)) {
                await this.#handleZipProjectRepair(files[0]);
                return;
            }

            const read = await Promise.all(files.map(async f => ({ name: f.name, text: await this.#readFileAsText(f) })));
            this.#pendingBugFixerFiles = read;
            const primary = read[0];
            if (primary) {
                const pasteEl = document.getElementById("cz-hub-bugfixer-code-paste");
                if (pasteEl) pasteEl.value = primary.text;
                this.#bugfixerUploadedOriginal = { name: primary.name, text: primary.text, loadedAt: new Date().toISOString() };
                this.#bugfixerUploadedMeta = this.#detectFileMetadata(primary.name, primary.text);
            }
            // Same RequirementReader path Builder uses — no duplicate
            // parsing. BugFixer gets real identity/dependencies/quality
            // features already extracted, not re-derived.
            const rr = window.CozyOS.RequirementReader;
            if (rr && primary) {
                try { this.#bugfixerRequirementReading = rr.readFile(primary.name, primary.text); } catch (_err) { this.#bugfixerRequirementReading = null; }
            }
            this.#renderMain();
        }

        /**
         * #handleZipProjectRepair(file)
         *   Phase 2 — BugFixer Project Mode. Reuses ProjectRefactor's
         *   exact same real importFromZip()/exportProjectAsZip() path
         *   Phase 1 established (no duplicated ZIP logic), and
         *   CozyBugFixer's new real repairProject() — never a separate
         *   repair engine. Shows exactly which files changed, offers the
         *   repaired project back as a real downloadable ZIP.
         */
        async #handleZipProjectRepair(file) {
            const refactor = window.CozyOS.ProjectRefactor;
            const bugfixer = window.CozyOS.BugFixer;
            if (!refactor) { this.#devOutput('<p class="cz-muted">ProjectRefactor is not connected.</p>'); return; }
            if (!bugfixer) { this.#devOutput('<p class="cz-muted">CozyBugFixer is not connected.</p>'); return; }
            try {
                const arrayBuffer = await this.#readFileAsArrayBuffer(file);
                const imported = await refactor.importFromZip(arrayBuffer);
                if (!imported.available) { this.#devOutput(`<p class="cz-muted">${escapeHtml(imported.reason)}</p>`); return; }

                const result = await bugfixer.repairProject(imported.files);
                this.#lastProjectRepairResult = result;

                const changedList = Object.entries(result.report).filter(([, r]) => r.changed).map(([path]) => path);
                const unchangedList = Object.entries(result.report).filter(([, r]) => !r.changed && !r.error).map(([path]) => path);

                this.#devOutput(`
                    <h3>Project Repair: ${escapeHtml(file.name)}</h3>
                    <p>${result.fileCount} file(s) total — ${result.modifiedCount} modified, ${result.unchangedCount} unchanged, ${result.skippedCount} non-JS preserved as-is.</p>
                    ${changedList.length ? `<p><b>Changed:</b> ${escapeHtml(changedList.join(", "))}</p>` : "<p class=\"cz-muted\">No files required changes.</p>"}
                    ${unchangedList.length ? `<p class="cz-muted"><b>Unchanged:</b> ${escapeHtml(unchangedList.join(", "))}</p>` : ""}
                    <button class="cz-btn cz-btn-primary" data-action="hub-download-repaired-project">Download repaired project ZIP</button>
                `);
            } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
        }

        async #hubDownloadRepairedProjectZip() {
            const refactor = window.CozyOS.ProjectRefactor;
            if (!refactor || !this.#lastProjectRepairResult) return;
            const exported = await refactor.exportProjectAsZip(this.#lastProjectRepairResult.files);
            if (!exported.available) { this.#devOutput(`<p class="cz-muted">${escapeHtml(exported.reason)}</p>`); return; }
            downloadBlob("repaired-project.zip", exported.blob, "application/zip");
        }

        /** Repairs pasted/uploaded source directly — reuses CozyBugFixer's real standalone path (registerSourceText + repair), same as Builder's identity-preservation approach. */
        async #hubBugFixerRepairPasted() {
            const hub = this.#hub();
            const pastedCode = document.getElementById("cz-hub-bugfixer-code-paste")?.value.trim();
            if (!pastedCode) { this.#devOutput('<p class="cz-muted">Paste source or upload a file first.</p>'); return; }
            const meta = this.#bugfixerUploadedMeta || this.#detectFileMetadata(this.#bugfixerUploadedOriginal?.name || "untitled.js", pastedCode);
            const moduleId = meta.moduleId || this.#deriveModuleIdFromFilename(this.#bugfixerUploadedOriginal?.name) || "PastedModule";
            try {
                const preview = await hub.repairModule(moduleId, { approve: false, sourceText: pastedCode });
                this.#retainedSources.set(moduleId, pastedCode);
                this.#renderRepairPreview(moduleId, preview);
            } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
        }

        async #hubOpenBugFixer(moduleId) {
            const hub = this.#hub();
            try {
                const sourceText = this.#getRetainedSource(moduleId);
                const result = await hub.openWithBugFixer(moduleId, sourceText);
                this.#renderOpenBugFixerResult(moduleId, result);
            } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
        }

        async #hubRepair(moduleId) {
            const hub = this.#hub();
            try {
                const sourceText = this.#getRetainedSource(moduleId);
                const preview = await hub.repairModule(moduleId, { approve: false, sourceText });
                this.#renderRepairPreview(moduleId, preview);
            } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
        }

        async #hubConfirmRepair(moduleId) {
            const hub = this.#hub();
            try {
                const sourceText = this.#getRetainedSource(moduleId);
                const result = await hub.repairModule(moduleId, { approve: true, sourceText });
                const standaloneNotice = result.standalone
                    ? `<div class="cz-panel" style="border-left:3px solid #d97706;"><p class="cz-muted">Workspace not connected. Running in standalone mode.</p></div>` : "";
                if (result.standalone && result.repairedSource) {
                    this.#retainedSources.set(moduleId, result.repairedSource);
                    this.#devOutput(`${standaloneNotice}
                        <p>Repaired. New certification: ${result.certResult ? escapeHtml(result.certResult.verdict) : "n/a"}.</p>
                        <button class="cz-btn cz-btn-primary" data-action="hub-download-repaired" data-module="${escapeHtml(moduleId)}" data-filename="${escapeHtml(result.repairedFilename)}">Download repaired file</button>`);
                } else {
                    this.#devOutput(`${standaloneNotice}<p>Saved. New certification: ${result.certResult ? escapeHtml(result.certResult.verdict) : "n/a"}.</p>`);
                }
            } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
        }

        #hubDownloadRepaired(moduleId, filename) {
            const source = this.#retainedSources.get(moduleId);
            if (!source) { this.#devOutput('<p class="cz-muted">No repaired source retained for this module.</p>'); return; }
            downloadTextFile(filename || `cozy-${moduleId.toLowerCase()}.js`, source);
        }

        // =====================================================================
        // ─── SHARE TO CLAUDE / GEMINI / CHATGPT ────────────────────────────────
        // Every field is gathered from real state already in this session —
        // the last Understanding/Build result if it matches this module, the
        // requirement text still in the Builder form, and CozyDeveloperHub's
        // own real getBuildPackageData(). Nothing here is invented, and
        // nothing pasted back is ever trusted without re-certification.
        // =====================================================================

        #hubShareClaude(moduleId) {
            const hub = this.#hub();
            try {
                const context = {};
                if (this.#lastAnalysis && this.#lastAnalysis.understanding) context.understanding = this.#lastAnalysis.understanding;
                if (this.#lastBuildResult && this.#lastBuildResult.plan && this.#lastBuildResult.plan.exportName === moduleId) {
                    context.generatedFiles = this.#lastBuildResult.files;
                }
                const promptText = document.getElementById("cz-hub-builder-prompt")?.value?.trim();
                if (promptText) context.requirement = promptText;
                const retained = this.#getRetainedSource(moduleId);
                if (retained && !context.generatedFiles) context.generatedFiles = { [`cozy-${moduleId.toLowerCase()}.js`]: retained };

                this.#lastSharePackage = { moduleId, context };
                const text = hub.generateBuildPackage(moduleId, context);

                this.#devOutput(`
                    <h3>Build Package: ${escapeHtml(moduleId)}</h3>
                    <textarea class="cz-input" id="cz-hub-share-preview" rows="14" readonly>${escapeHtml(text)}</textarea>
                    <div class="cz-row" style="flex-wrap:wrap;gap:6px;">
                        <button class="cz-btn cz-btn-primary" data-action="hub-copy-package">Copy Prompt</button>
                        <button class="cz-btn" data-action="hub-download-package" data-format="markdown">Download Markdown</button>
                        <button class="cz-btn" data-action="hub-download-package" data-format="text">Download TXT</button>
                        <button class="cz-btn" data-action="hub-download-package" data-format="json">Download JSON</button>
                    </div>
                    <div class="cz-field" style="margin-top:12px;">
                        <label>Paste back the improved file from Claude / Gemini / ChatGPT</label>
                        <textarea class="cz-input" id="cz-hub-import-source" rows="8" placeholder="Paste the improved source code here..."></textarea>
                        <button class="cz-btn cz-btn-primary" data-action="hub-import-improved" data-module="${escapeHtml(moduleId)}">Re-certify &amp; Compare</button>
                    </div>`);
            } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
        }

        #hubCopyPackage() {
            if (!this.#lastSharePackage) return;
            const hub = this.#hub();
            const text = hub.generateBuildPackage(this.#lastSharePackage.moduleId, this.#lastSharePackage.context);
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text)
                    .then(() => this.#devOutput('<p>Copied to clipboard.</p>'))
                    .catch(() => this.#devOutput('<p class="cz-muted">Could not copy automatically — select the text above and copy manually.</p>'));
            } else {
                const el = document.getElementById("cz-hub-share-preview");
                if (el && el.select) { el.select(); this.#devOutput('<p>Selected — press Ctrl/Cmd+C to copy.</p>'); }
            }
        }

        #hubDownloadPackage(format) {
            if (!this.#lastSharePackage) return;
            const hub = this.#hub();
            const { moduleId, context } = this.#lastSharePackage;
            if (format === "markdown") downloadBlob(`${moduleId}-build-package.md`, hub.generateBuildPackageMarkdown(moduleId, context), "text/markdown");
            else if (format === "json") downloadBlob(`${moduleId}-build-package.json`, hub.generateBuildPackageJSON(moduleId, context), "application/json");
            else downloadBlob(`${moduleId}-build-package.txt`, hub.generateBuildPackage(moduleId, context), "text/plain");
        }

        /**
         * #hubImportImproved(moduleId)
         *   Runs the pasted-back text through real quickCertification()
         *   only — never saves, registers, or locks anything by itself.
         *   Shows a before/after comparison; the human decides whether to
         *   proceed with Save/Register/Repair from there.
         */
        async #hubImportImproved(moduleId) {
            const hub = this.#hub();
            const improvedSource = document.getElementById("cz-hub-import-source")?.value;
            if (!improvedSource || !improvedSource.trim()) { this.#devOutput('<p class="cz-muted">Paste the improved source first.</p>'); return; }
            try {
                const result = hub.importImprovedFile(moduleId, improvedSource);
                this.#retainedSources.set(moduleId, improvedSource);
                this.#devOutput(`
                    <h3>Imported Improvement: ${escapeHtml(moduleId)}</h3>
                    <div class="cz-row">
                        <span>Before: ${result.beforeScore !== null ? escapeHtml(result.beforeScore) + "%" : "not previously certified"}</span>
                        <span>After: <b>${escapeHtml(result.afterScore)}%</b></span>
                        <span class="cz-badge ${verdictBadgeClass(result.afterVerdict)}">${escapeHtml(result.afterVerdict)}</span>
                        ${result.scoreDelta !== null ? `<span>Δ ${result.scoreDelta >= 0 ? "+" : ""}${escapeHtml(result.scoreDelta)}%</span>` : ""}
                    </div>
                    <p class="cz-muted">This is only certified, not saved. Use Save / Register to Workspace / Lock Release below to proceed, or discard it.</p>
                    <div class="cz-row">
                        <button class="cz-btn cz-btn-primary" data-action="hub-register-workspace" data-module="${escapeHtml(moduleId)}">Register to Workspace</button>
                        <button class="cz-btn" data-action="hub-save" data-module="${escapeHtml(moduleId)}">Save</button>
                    </div>`);
            } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
        }



        #renderWorkspaceSection() {
            const workspace = window.CozyOS.WorkspaceShell;
            if (!workspace) return `<h1>Workspace</h1><div class="cz-not-connected">Not connected.</div>`;
            const files = workspace.listFiles();
            return `<h1>Workspace</h1>
                <div class="cz-panel">
                    <table class="cz-table"><thead><tr><th>File</th><th>Coordinator</th><th>Status</th><th>Checksum</th></tr></thead><tbody>
                    ${files.map(f => `<tr><td>${escapeHtml(f.filename)}</td><td>${escapeHtml(f.coordinator || "—")}</td><td>${escapeHtml(f.workspaceStatus)}</td><td>${escapeHtml(f.sha256Checksum ? f.sha256Checksum.slice(0, 8) + "…" : "—")}</td></tr>`).join("") || '<tr><td colspan="4">No files registered.</td></tr>'}
                    </tbody></table>
                </div>`;
        }

        // =====================================================================
        // ─── MODULE EXPLORER / MODULE CARD ─────────────────────────────────────
        // Every field on a Module Card, and every action button, delegates
        // to hub.getModuleCard()/hub's action methods — no independent
        // scoring or state here.
        // =====================================================================

        #renderModuleExplorer() {
            const hub = this.#hub();
            const workspace = window.CozyOS.WorkspaceShell;
            const moduleIds = workspace ? Array.from(new Set(workspace.listFiles().map(f => f.coordinator).filter(Boolean))) : [];
            if (this.#selectedModuleId) return this.#renderModuleCard(this.#selectedModuleId);
            return `<h1>Module Explorer</h1>
                <div class="cz-panel">
                    <table class="cz-table"><thead><tr><th>Module</th><th></th></tr></thead><tbody>
                    ${moduleIds.map(id => `<tr><td>${escapeHtml(id)}</td><td><button class="cz-btn" data-action="select-module" data-module="${escapeHtml(id)}">Open</button></td></tr>`).join("") || '<tr><td colspan="2">No modules registered to Workspace yet.</td></tr>'}
                    </tbody></table>
                </div>`;
        }

        #renderModuleCard(moduleId) {
            const hub = this.#hub();
            let card;
            try { card = hub.getModuleCard(moduleId); } catch (err) { return `<h1>${escapeHtml(moduleId)}</h1><div class="cz-panel"><p class="cz-muted">${escapeHtml(err.message)}</p></div>`; }

            const actions = [
                ["hub-analyze-module", "Analyze"], ["hub-open-builder", "Open with CozyBuilder"], ["hub-quick-cert-module", "Quick Certification"],
                ["hub-full-cert", "Full Certification"], ["hub-repair", "Repair with CozyBugFixer"], ["hub-open-bugfixer", "Open with CozyBugFixer"],
                ["hub-compare", "Compare Versions"], ["hub-cert-history", "Certification History"], ["hub-repair-history", "Repair History"],
                ["hub-view-source", "View Source"], ["hub-save", "Save"], ["hub-save-as", "Save As"], ["hub-duplicate", "Duplicate"],
                ["hub-rename", "Rename"], ["hub-move", "Move"], ["hub-export", "Export"], ["hub-register-workspace", "Register Workspace"],
                ["hub-register-registry", "Register Service Registry"], ["hub-lock-release", "Lock Release"], ["hub-rollback-golden", "Rollback Golden"],
                ["hub-delete-registration", "Delete Registration"], ["hub-share-claude", "🤖 Share to Claude / Gemini / ChatGPT"]
            ];

            return `<h1>${escapeHtml(moduleId)}</h1>
                <button class="cz-btn" data-action="select-module" data-module="">← Back to Module Explorer</button>
                <div class="cz-panel">
                    ${this.#renderKeyValueTable({
                        "Category": card.category || "n/a", "File Path": card.filePath || "n/a", "Workspace Status": card.workspaceStatus,
                        "Certification Score": card.certificationScore !== null ? card.certificationScore + "%" : "n/a",
                        "Certification Grade": card.certificationGrade || "n/a", "Golden Version": card.goldenVersion || "n/a",
                        "Latest Version": card.latestVersion || "n/a", "Production Version": card.productionVersion || "n/a",
                        "Repair Status": card.repairStatus || "n/a", "Builder Version": card.builderVersion || "n/a",
                        "BugFixer Version": card.bugFixerVersion || "n/a", "Last Certified": card.lastCertified || "n/a",
                        "Last Repaired": card.lastRepaired || "n/a", "Dependencies": (card.dependencies || []).join(", ") || "none",
                        "Registered to Service Registry": card.registeredToServiceRegistry ? "Yes" : "No", "Status": card.status
                    })}
                </div>
                <div class="cz-panel cz-dev-actions">
                    <div class="cz-row" style="flex-wrap:wrap;gap:6px;">
                        ${actions.map(([action, label]) => {
                            const workspaceOnlyActions = ["hub-register-workspace", "hub-save", "hub-save-as", "hub-duplicate", "hub-rename", "hub-move", "hub-compare", "hub-rollback-golden"];
                            const workspaceUnavailable = workspaceOnlyActions.includes(action) && !window.CozyOS.WorkspaceShell;
                            const title = workspaceUnavailable ? "Workspace not connected. This action becomes available once WorkspaceShell is loaded." : "";
                            return `<button class="cz-btn" data-action="${action}" data-module="${escapeHtml(moduleId)}"${workspaceUnavailable ? ` disabled title="${escapeHtml(title)}"` : ""}>${escapeHtml(label)}</button>`;
                        }).join("")}
                    </div>
                </div>
                <div class="cz-panel cz-dev-action-output-panel" id="cz-hub-output"></div>`;
        }

        #selectModule(moduleId) { this.#selectedModuleId = moduleId || null; this.#setSection("moduleExplorer"); }

        // Generic module-action dispatcher — every case calls exactly one
        // real hub method; this function adds no scoring/repair logic.
        async #moduleAction(action, moduleId) {
            const hub = this.#hub();
            if (FORBIDDEN_KEYS.has(moduleId)) { this.#devOutput('<p class="cz-muted">Rejected module id.</p>'); return; }
            this.#diagnostics.actionsHandled++;
            this.#logAudit("MODULE_ACTION", `${action}: ${moduleId}`);
            this.emit("hubui:moduleaction", { action, moduleId });
            try {
                switch (action) {
                    case "hub-analyze-module": {
                        const src = hub.getModuleSource(moduleId);
                        const { understanding, gaps } = await hub.analyzeRequirement(src || moduleId);
                        this.#devOutput(`<p>${escapeHtml(understanding.applicationType)} — missing: ${escapeHtml(gaps.missing.map(g => g.label).join(", ") || "none")}</p>`);
                        break;
                    }
                    case "hub-open-builder": { const plan = await hub.openWithBuilder(moduleId); this.#devOutput(`<p>Plan ready: ${escapeHtml(plan.exportName)}. Visit Builder to generate.</p>`); break; }
                    case "hub-quick-cert-module": {
                        const src = hub.getModuleSource(moduleId);
                        if (!src) { this.#devOutput('<p class="cz-muted">No source on file for this module.</p>'); break; }
                        const result = hub.quickCertifyModule(moduleId, src, "workspace-triggered");
                        this.#devOutput(`<div class="cz-row"><span class="cz-badge ${verdictBadgeClass(result.verdict)}">${escapeHtml(result.verdict)}</span><span>${escapeHtml(result.summary.scorePercent)}%</span></div>`);
                        break;
                    }
                    case "hub-full-cert": this.#hubFullCert(); break;
                    case "hub-repair": await this.#hubRepair(moduleId); break;
                    case "hub-open-bugfixer": await this.#hubOpenBugFixer(moduleId); break;
                    case "hub-compare": { const cmp = hub.compareVersions(moduleId); this.#devOutput(`<p>v${escapeHtml(cmp.from.version)} (${escapeHtml(cmp.from.score)}%) → v${escapeHtml(cmp.to.version)} (${escapeHtml(cmp.to.score)}%). Fixed: ${escapeHtml(cmp.rulesFixed.join(", ") || "none")}. Regressions: ${escapeHtml(cmp.newRegressions.join(", ") || "none")}.</p>`); break; }
                    case "hub-cert-history": { const h = hub.viewCertificationHistory(moduleId); this.#devOutput(`<p>${h.length} certification record(s). Latest: ${h.length ? escapeHtml(h[h.length - 1].verdict) : "none"}.</p>`); break; }
                    case "hub-repair-history": { const h = hub.viewRepairHistory(moduleId); this.#devOutput(`<p>${h.length} repair record(s).</p>`); break; }
                    case "hub-view-source": { const src = hub.getModuleSource(moduleId); this.#devOutput(src ? `<pre style="max-height:400px;overflow:auto;">${escapeHtml(src)}</pre>` : '<p class="cz-muted">No source on file.</p>'); break; }
                    case "hub-save": { const src = this.#getRetainedSource(moduleId); if (!src) throw new Error(`No source available for "${moduleId}".`); const result = await hub.saveModule(moduleId, src); this.#devOutput(`<p>Saved. Checksum → ${escapeHtml(result.newHash.slice(0, 8))}….</p>`); break; }
                    case "hub-save-as": {
                        if (typeof window.showSaveFilePicker !== "function") { this.#devOutput('<p class="cz-muted">Save As needs the File System Access API (not available in this browser). Use Export instead.</p>'); break; }
                        const src = hub.getModuleSource(moduleId);
                        const handle = await window.showSaveFilePicker({ suggestedName: `cozy-${moduleId.toLowerCase()}.js` });
                        const writable = await handle.createWritable(); await writable.write(src); await writable.close();
                        hub.registerToWorkspace({ filename: handle.name, source: src, handle });
                        this.#devOutput(`<p>Saved as ${escapeHtml(handle.name)}.</p>`);
                        break;
                    }
                    case "hub-duplicate": { const name = window.prompt("New filename for the duplicate:", `cozy-${moduleId.toLowerCase()}-copy.js`); if (name) { hub.duplicateModule(moduleId, name); this.#devOutput(`<p>Duplicated as ${escapeHtml(name)}.</p>`); } break; }
                    case "hub-rename": { const name = window.prompt("New filename:"); if (name) { const r = hub.renameModule(moduleId, name); this.#devOutput(`<p>Renamed to ${escapeHtml(r.filename)}.</p>`); this.#selectedModuleId = r.coordinator; } break; }
                    case "hub-move": { const folder = window.prompt("New folder path:", "core/modules/"); if (folder) { const r = hub.moveModule(moduleId, folder); this.#devOutput(`<p>Moved to ${escapeHtml(r.filePath)}.</p>`); } break; }
                    case "hub-export": { const exported = hub.exportModule(moduleId); downloadTextFile(exported.filename, exported.source); this.#devOutput(`<p>Exported ${escapeHtml(exported.filename)}.</p>`); break; }
                    case "hub-register-workspace": { const src = hub.getModuleSource(moduleId); this.#devOutput(src ? "<p>Already registered to Workspace.</p>" : '<p class="cz-muted">No source to register.</p>'); break; }
                    case "hub-register-registry": { hub.registerToServiceRegistry(moduleId); this.#devOutput("<p>Registered to Service Registry.</p>"); break; }
                    case "hub-lock-release": this.#setSection("releaseCenter"); return;
                    case "hub-rollback-golden": {
                        const ok = window.confirm(`Roll back "${moduleId}" to its Golden version? This restores an earlier backup and cannot be undone.`);
                        if (!ok) break;
                        const result = await hub.rollbackGolden(moduleId);
                        this.#devOutput(`<p>Rolled back to backup from ${escapeHtml(result.restoredFromTimestamp)} — targeting Golden v${escapeHtml(result.targetGoldenVersion)} (${escapeHtml(result.targetGoldenScore)}%).</p><p class="cz-muted">${escapeHtml(result.matchConfidence)}</p>`);
                        break;
                    }
                    case "hub-delete-registration": { const ok = window.confirm(`Delete "${moduleId}"'s Service Registry registration? This cannot be undone.`); if (ok) { hub.deleteRegistration(moduleId); this.#devOutput("<p>Registration deleted.</p>"); } break; }
                    case "hub-share-claude": this.#hubShareClaude(moduleId); break;
                    default: this.#devOutput(`<p class="cz-muted">Unknown action "${escapeHtml(action)}".</p>`);
                }
            } catch (err) { this.#diagnostics.errorsShown++; this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
        }

        // =====================================================================
        // ─── APPLICATION EXPLORER / SERVICE REGISTRY / RELEASE CENTER ─────────
        // =====================================================================

        #renderApplicationExplorer() {
            const registry = window.CozyOS.ServiceRegistry;
            if (!registry || typeof registry.listApplications !== "function") return `<h1>Application Explorer</h1><div class="cz-not-connected">ServiceRegistry not connected.</div>`;
            const apps = registry.listApplications();
            return `<h1>Application Explorer</h1><div class="cz-panel">
                ${apps.length === 0 ? '<div class="cz-empty">No applications registered.</div>' : apps.map(a => `<div class="cz-row"><span>${escapeHtml(a.name)}</span><span class="cz-muted">${escapeHtml(a.category || "")}</span></div>`).join("")}
            </div>`;
        }

        #renderServiceRegistrySection() {
            const registry = window.CozyOS.ServiceRegistry;
            if (!registry) return `<h1>Service Registry</h1><div class="cz-not-connected">Not connected.</div>`;
            const coords = registry.listCoordinators();
            const apps = typeof registry.listApplications === "function" ? registry.listApplications() : [];
            return `<h1>Service Registry</h1>
                <div class="cz-panel">${this.#renderKeyValueTable({ "Registered Coordinators": coords.length, "Registered Applications": apps.length })}</div>
                <div class="cz-panel"><h3>Coordinators</h3>${coords.map(c => `<div class="cz-row"><span>${escapeHtml(c.name)}</span><span class="cz-muted">${escapeHtml(c.category)}</span></div>`).join("")}</div>`;
        }

        #renderReleaseCenter() {
            const cert = window.CozyOS.Certification;
            if (!cert || typeof cert.listReleases !== "function") return `<h1>Release Center</h1><div class="cz-not-connected">Not connected.</div>`;
            const releases = cert.listReleases();
            return `<h1>Release Center</h1><div class="cz-panel">
                <table class="cz-table"><thead><tr><th>Release</th><th>Status</th></tr></thead><tbody>
                ${releases.map(r => `<tr><td>${escapeHtml(r.name || r.releaseId)}</td><td>${escapeHtml(r.status)}</td></tr>`).join("") || '<tr><td colspan="2">No releases.</td></tr>'}
                </tbody></table>
            </div>`;
        }

        #renderGoldenVault() {
            const cert = window.CozyOS.Certification;
            const workspace = window.CozyOS.WorkspaceShell;
            if (!cert || !workspace) return `<h1>Golden Vault</h1><div class="cz-not-connected">Needs both Certification and Workspace connected.</div>`;
            const moduleIds = Array.from(new Set(workspace.listFiles().map(f => f.coordinator).filter(Boolean)));
            const rows = moduleIds.map(id => { const h = cert.listRecords(id); if (!h.length) return null; const golden = h.reduce((b, r) => r.summary.scorePercent > b.summary.scorePercent ? r : b, h[0]); return { id, golden }; }).filter(Boolean);
            return `<h1>Golden Vault</h1><div class="cz-panel">
                <table class="cz-table"><thead><tr><th>Module</th><th>Golden Version</th><th>Score</th></tr></thead><tbody>
                ${rows.map(r => `<tr><td>${escapeHtml(r.id)}</td><td>${escapeHtml(r.golden.version)}</td><td>${escapeHtml(r.golden.summary.scorePercent)}%</td></tr>`).join("") || '<tr><td colspan="3">No certified modules yet.</td></tr>'}
                </tbody></table>
            </div>`;
        }

        #renderCertHistory() {
            const selected = this.#selectedModuleId;
            const cert = window.CozyOS.Certification;
            if (!cert) return `<h1>Certification History</h1><div class="cz-not-connected">Not connected.</div>`;
            if (!selected) return `<h1>Certification History</h1><div class="cz-panel">Select a module from Module Explorer first.</div>`;
            const history = cert.listRecords(selected);
            return `<h1>Certification History: ${escapeHtml(selected)}</h1><div class="cz-panel">
                ${history.map(r => `<div class="cz-row"><span>${escapeHtml(r.timestamp)}</span><span class="cz-badge ${verdictBadgeClass(r.verdict)}">${escapeHtml(r.verdict)}</span><span>${escapeHtml(r.summary.scorePercent)}%</span></div>`).join("") || '<div class="cz-empty">No history.</div>'}
            </div>`;
        }

        #renderRepairHistory() {
            const bugfixer = window.CozyOS.BugFixer;
            if (!bugfixer) return `<h1>Repair History</h1><div class="cz-not-connected">Not connected.</div>`;
            const log = bugfixer.getRepairLog().slice().reverse();
            return `<h1>Repair History</h1><div class="cz-panel">
                ${log.map(r => `<div class="cz-row"><span>${escapeHtml(r.filename)}</span><span>${escapeHtml(r.certificationScoreBefore)}% → ${escapeHtml(r.certificationScoreAfter)}%</span><span class="cz-muted">${escapeHtml(r.timestamp)}</span></div>`).join("") || '<div class="cz-empty">No repairs yet.</div>'}
            </div>`;
        }

        // =====================================================================
        // ─── KNOWLEDGE REVIEW QUEUE / ENTERPRISE PATTERN LIBRARY ──────────────
        // =====================================================================

        #renderReviewQueue() {
            const ue = window.CozyOS.UnderstandingEngine;
            if (!ue) return `<h1>Knowledge Review Queue</h1><div class="cz-not-connected">Not connected.</div>`;
            const pending = ue.listCandidatePatterns(c => c.status === "PENDING_REVIEW");
            const rejected = ue.listCandidatePatterns(c => c.status === "REJECTED" || c.status === "REJECTED_NOT_LEARNED");
            return `<h1>Knowledge Review Queue</h1>
                <div class="cz-panel"><h3>Pending Review</h3>
                ${pending.map(c => `<div class="cz-panel">
                    <b>${escapeHtml(c.moduleId)}</b>
                    ${this.#renderKeyValueTable({ "Security Score": c.securityScore + "%", "Architecture Score": c.architectureScore + "%", "Performance Score": c.performanceScore + "%", "Similarity Score": c.similarityScore + "%" })}
                    <button class="cz-btn cz-btn-primary" data-action="hub-approve-pattern" data-id="${escapeHtml(c.id)}">Approve</button>
                    <button class="cz-btn" data-action="hub-reject-pattern" data-id="${escapeHtml(c.id)}">Reject</button>
                </div>`).join("") || '<div class="cz-empty">Nothing pending.</div>'}
                </div>
                <div class="cz-panel"><h3>Rejected (${rejected.length})</h3>${rejected.map(c => `<div class="cz-row">${escapeHtml(c.moduleId)}</div>`).join("") || '<div class="cz-empty">None.</div>'}</div>
                <div class="cz-panel cz-dev-action-output-panel" id="cz-hub-output"></div>`;
        }

        #renderPatternLibrary() {
            const ue = window.CozyOS.UnderstandingEngine;
            if (!ue) return `<h1>Enterprise Pattern Library</h1><div class="cz-not-connected">Not connected.</div>`;
            const library = ue.listEnterprisePatternLibrary();
            return `<h1>Enterprise Pattern Library</h1><div class="cz-panel">
                ${library.map(p => `<div class="cz-row"><b>${escapeHtml(p.moduleId)}</b><span>${escapeHtml(p.overallScore)}%</span><span class="cz-muted">approved ${escapeHtml(p.approvedAt)}</span></div>`).join("") || '<div class="cz-empty">Empty until a candidate is explicitly approved.</div>'}
            </div>`;
        }

        // =====================================================================
        // ─── DEVELOPER QUEUE / SEARCH / SETTINGS ──────────────────────────────
        // =====================================================================

        #renderDeveloperQueue() {
            const hub = this.#hub();
            const queue = hub.getDeveloperQueue();
            if (queue.connected === false) return `<h1>Developer Queue</h1><div class="cz-not-connected">${escapeHtml(queue.message)}</div>`;
            const buckets = { NEEDS_BUILD: [], AWAITING_CERTIFICATION: [], NEEDS_REPAIR: [], CERTIFIED: [], FAILED_CERTIFICATION: [], IN_BUILDER: [] };
            for (const e of queue.entries) (buckets[e.status] || (buckets[e.status] = [])).push(e);
            return `<h1>Developer Queue</h1>${Object.entries(buckets).filter(([, list]) => list.length).map(([status, list]) => `
                <div class="cz-panel"><h3>${escapeHtml(status)} (${list.length})</h3>
                ${list.map(e => `<div class="cz-row" data-action="select-module" data-module="${escapeHtml(e.moduleId)}" style="cursor:pointer;"><span>${escapeHtml(e.moduleId)}</span>${e.latestScore !== null ? `<span>${escapeHtml(e.latestScore)}%</span>` : ""}</div>`).join("")}
                </div>`).join("")}`;
        }

        // =====================================================================
        // ─── RESEARCH WORKSPACE ────────────────────────────────────────────────
        // Every action here calls the real window.CozyOS.ResearchEngine — this
        // file adds no ingestion, indexing, or analysis logic of its own.
        // =====================================================================

        #renderResearch() {
            const re = window.CozyOS.ResearchEngine;
            if (!re) return `<h1>Research</h1><div class="cz-not-connected">ResearchEngine is not connected.</div>`;
            const tab = this.#researchSubTab || "dashboard";
            const selectedEntry = this.#selectedResearchEntryId;
            const tabs = [["dashboard", "Dashboard"], ["new", "New Research"], ["browse", "Browse / Search"]];
            const nav = `<div class="cz-row" style="flex-wrap:wrap;gap:6px;margin-bottom:10px;">
                ${tabs.map(([id, label]) => `<button class="cz-btn${tab === id ? " cz-btn-primary" : ""}" data-action="hub-research-subtab" data-tab="${id}">${escapeHtml(label)}</button>`).join("")}
            </div>`;

            if (selectedEntry) return `<h1>Research</h1>${nav}${this.#renderResearchEntryDetail(selectedEntry)}`;
            if (tab === "new") return `<h1>Research — New Research</h1>${nav}${this.#renderResearchUpload()}`;
            if (tab === "browse") return `<h1>Research — Browse / Search</h1>${nav}${this.#renderResearchBrowse()}`;
            return `<h1>Research</h1>${nav}${this.#renderResearchDashboard()}`;
        }

        #renderResearchDashboard() {
            const re = window.CozyOS.ResearchEngine;
            const kb = re.getKnowledgeBase();
            const projects = re.listProjects();
            const tags = re.listTags();
            const types = re.listAvailableIngestTypes();
            const availRow = (label, info) => `<span class="cz-badge ${info.available ? "cz-badge-ready" : "cz-badge-neutral"}">${escapeHtml(label)}: ${info.available ? "Ready" : "Unavailable"}</span>`;
            return `
                <div class="cz-panel">
                    <h3>Ingestion Providers</h3>
                    <div class="cz-row" style="flex-wrap:wrap;">
                        ${availRow("Text", types.text)}${availRow("Code", types.code)}${availRow("PDF", types.pdf)}${availRow("Screenshot", types.screenshot)}${availRow("Video", types.video)}${availRow("Book", types.book)}
                    </div>
                </div>
                <div class="cz-panel">${this.#renderKeyValueTable({ "Knowledge Base Entries": kb.length, "Projects": projects.length, "Distinct Tags": tags.length })}</div>
                <div class="cz-panel"><h3>Projects</h3>
                    ${projects.map(p => `<div class="cz-row"><span>${escapeHtml(p.name)}</span><span class="cz-muted">${escapeHtml(p.entryIds.length)} document(s)</span></div>`).join("") || '<div class="cz-empty">No projects yet.</div>'}
                    <div class="cz-row" style="margin-top:8px;"><input class="cz-input" id="cz-hub-research-new-project" placeholder="New project name" /><button class="cz-btn" data-action="hub-research-create-project">Create Project</button></div>
                </div>
                <div class="cz-panel"><h3>Recent Documents</h3>
                    ${kb.slice(-8).reverse().map(e => `<div class="cz-row" data-action="hub-research-select" data-entry="${escapeHtml(e.id)}" style="cursor:pointer;"><span>${escapeHtml(e.title)}</span><span class="cz-muted">${escapeHtml(e.type)}</span></div>`).join("") || '<div class="cz-empty">Nothing ingested yet.</div>'}
                </div>
                <div class="cz-panel cz-dev-action-output-panel" id="cz-hub-output"></div>`;
        }

        #renderResearchUpload() {
            return `<div class="cz-panel">
                <div class="cz-field"><label>Title</label><input class="cz-input" id="cz-hub-research-title" placeholder="Document title" /></div>
                <div class="cz-field"><label>Tags (comma-separated)</label><input class="cz-input" id="cz-hub-research-tags" placeholder="requirements, church" /></div>
                <div class="cz-field"><label>Paste text or code</label><textarea class="cz-input" id="cz-hub-research-text" rows="6" placeholder="Paste plain-language requirements or source code..."></textarea>
                    <div class="cz-row"><label><input type="radio" name="cz-hub-research-kind" value="text" checked /> Text</label><label><input type="radio" name="cz-hub-research-kind" value="code" /> Code</label></div>
                    <button class="cz-btn cz-btn-primary" data-action="hub-research-ingest-text">Ingest Text/Code</button>
                </div>
                <div class="cz-field"><label>Upload a PDF</label>
                    <input type="file" id="cz-hub-research-pdf" accept=".pdf" />
                    <button class="cz-btn" data-action="hub-research-ingest-pdf">Ingest PDF</button>
                </div>
                <div class="cz-field"><label>Upload a screenshot</label>
                    <input type="file" id="cz-hub-research-screenshot" accept="image/*" />
                    <button class="cz-btn" data-action="hub-research-ingest-screenshot">Ingest Screenshot</button>
                </div>
            </div>
            <div class="cz-panel cz-dev-action-output-panel" id="cz-hub-output"></div>`;
        }

        #renderResearchBrowse() {
            const re = window.CozyOS.ResearchEngine;
            const kb = re.getKnowledgeBase();
            return `<div class="cz-panel">
                <div class="cz-row"><input class="cz-input" id="cz-hub-research-search" placeholder="Search knowledge base..." /><button class="cz-btn cz-btn-primary" data-action="hub-research-search">Search</button></div>
            </div>
            <div class="cz-panel"><h3>All Documents (${kb.length})</h3>
                ${kb.map(e => `<div class="cz-row" data-action="hub-research-select" data-entry="${escapeHtml(e.id)}" style="cursor:pointer;">
                    <span>${escapeHtml(e.title)}</span><span class="cz-muted">${escapeHtml(e.type)}</span>${e.tags.length ? `<span class="cz-muted">${e.tags.map(escapeHtml).join(", ")}</span>` : ""}
                </div>`).join("") || '<div class="cz-empty">Nothing ingested yet.</div>'}
            </div>
            <div class="cz-panel cz-dev-action-output-panel" id="cz-hub-output"></div>`;
        }

        #renderResearchEntryDetail(entryId) {
            const re = window.CozyOS.ResearchEngine;
            const entry = re.getEntry(entryId);
            if (!entry) { this.#selectedResearchEntryId = null; return '<div class="cz-panel">That document no longer exists.</div>'; }
            return `<button class="cz-btn" data-action="hub-research-deselect">← Back</button>
                <div class="cz-panel">
                    ${this.#renderKeyValueTable({
                        "Title": entry.title, "Type": entry.type, "Ingested": entry.ingestedAt,
                        "Detected Features": entry.detectedFeatures.join(", ") || "none",
                        "Principles": entry.principles.join(", ") || "none extracted yet",
                        "Tags": entry.tags.join(", ") || "none"
                    })}
                    <div class="cz-row" style="flex-wrap:wrap;gap:6px;">
                        <button class="cz-btn" data-action="hub-research-extract-principles" data-entry="${escapeHtml(entryId)}">Extract Principles</button>
                        <button class="cz-btn" data-action="hub-research-summarize" data-entry="${escapeHtml(entryId)}">Generate Summary</button>
                        <button class="cz-btn" data-action="hub-research-send-builder" data-entry="${escapeHtml(entryId)}">Send to Builder</button>
                        ${entry.type === "code" ? `<button class="cz-btn" data-action="hub-research-send-bugfixer" data-entry="${escapeHtml(entryId)}">Send to BugFixer</button>
                        <button class="cz-btn" data-action="hub-research-send-cert" data-entry="${escapeHtml(entryId)}">Send to Certification</button>` : ""}
                    </div>
                </div>
                <div class="cz-panel cz-dev-action-output-panel" id="cz-hub-output"></div>`;
        }

        #hubSetResearchSubTab(tab) { this.#researchSubTab = tab; this.#selectedResearchEntryId = null; this.#renderMain(); }
        #hubResearchSelect(entryId) { this.#selectedResearchEntryId = entryId; this.#renderMain(); }
        #hubResearchDeselect() { this.#selectedResearchEntryId = null; this.#renderMain(); }

        #hubResearchCreateProject() {
            const re = window.CozyOS.ResearchEngine;
            const name = document.getElementById("cz-hub-research-new-project")?.value.trim();
            if (!name) return;
            re.createProject(name);
            this.#renderMain();
        }

        async #hubResearchIngestText() {
            const re = window.CozyOS.ResearchEngine;
            const title = document.getElementById("cz-hub-research-title")?.value.trim() || null;
            const tags = (document.getElementById("cz-hub-research-tags")?.value || "").split(",").map(t => t.trim()).filter(Boolean);
            const text = document.getElementById("cz-hub-research-text")?.value;
            const kind = this.#root.querySelector('input[name="cz-hub-research-kind"]:checked')?.value || "text";
            if (!text || !text.trim()) { this.#devOutput('<p class="cz-muted">Paste something first.</p>'); return; }
            const result = await re.ingestDocument({ type: kind, content: text, title, tags });
            this.#devOutput(result.ingested ? `<p>Ingested. Summary: ${escapeHtml(result.summary || "n/a")}.</p>` : `<p class="cz-muted">${escapeHtml(result.reason)}</p>`);
            if (result.ingested) this.#renderMain();
        }

        async #hubResearchIngestPdf() {
            const re = window.CozyOS.ResearchEngine;
            const fileEl = document.getElementById("cz-hub-research-pdf");
            const title = document.getElementById("cz-hub-research-title")?.value.trim() || null;
            if (!fileEl || !fileEl.files[0]) { this.#devOutput('<p class="cz-muted">Choose a PDF file first.</p>'); return; }
            const buffer = await fileEl.files[0].arrayBuffer();
            const result = await re.ingestDocument({ type: "pdf", content: buffer, title: title || fileEl.files[0].name });
            this.#devOutput(result.ingested ? `<p>Ingested.</p>` : `<p class="cz-muted">${escapeHtml(result.reason)}</p>`);
            if (result.ingested) this.#renderMain();
        }

        async #hubResearchIngestScreenshot() {
            const re = window.CozyOS.ResearchEngine;
            const fileEl = document.getElementById("cz-hub-research-screenshot");
            const title = document.getElementById("cz-hub-research-title")?.value.trim() || null;
            if (!fileEl || !fileEl.files[0]) { this.#devOutput('<p class="cz-muted">Choose an image first.</p>'); return; }
            const dataUrl = await this.#readFileAsDataUrl(fileEl.files[0]);
            const result = await re.ingestDocument({ type: "screenshot", content: dataUrl, title: title || fileEl.files[0].name });
            this.#devOutput(result.ingested ? `<p>Ingested.</p>` : `<p class="cz-muted">${escapeHtml(result.reason)}</p>`);
            if (result.ingested) this.#renderMain();
        }

        #readFileAsDataUrl(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(file);
            });
        }

        #hubResearchSearch() {
            const re = window.CozyOS.ResearchEngine;
            const query = document.getElementById("cz-hub-research-search")?.value.trim();
            if (!query) return;
            const results = re.searchKnowledgeBase(query);
            this.#devOutput(results.length
                ? results.map(r => `<div class="cz-row" data-action="hub-research-select" data-entry="${escapeHtml(r.entry.id)}" style="cursor:pointer;"><span>${escapeHtml(r.entry.title)}</span><span class="cz-muted">${escapeHtml(r.matchCount)} match(es)</span></div>`).join("")
                : '<p class="cz-muted">No matches.</p>');
        }

        async #hubResearchAction(action, entryId) {
            const re = window.CozyOS.ResearchEngine;
            try {
                switch (action) {
                    case "hub-research-extract-principles": {
                        const r = re.extractPrinciples(entryId);
                        this.#devOutput(`<p>Principles: ${escapeHtml(r.principles.join(", ") || "none found")}.</p>`);
                        this.#renderMain();
                        break;
                    }
                    case "hub-research-summarize": {
                        const r = await re.generateSummary(entryId);
                        this.#devOutput(`<p><b>Source:</b> ${escapeHtml(r.source)}</p><p>${escapeHtml(r.summary)}</p>`);
                        break;
                    }
                    case "hub-research-send-builder": {
                        const plan = re.sendToBuilder(entryId);
                        this.#devOutput(`<p>Plan ready: ${escapeHtml(plan.exportName)}. Visit Builder to generate.</p>`);
                        break;
                    }
                    case "hub-research-send-bugfixer": {
                        const bfFileId = await re.sendToBugFixer(entryId);
                        this.#devOutput(`<p>Loaded into CozyBugFixer (fileId ${escapeHtml(bfFileId)}).</p>`);
                        break;
                    }
                    case "hub-research-send-cert": {
                        const r = re.sendToCertification(entryId, entryId);
                        this.#devOutput(`<div class="cz-row"><span class="cz-badge ${verdictBadgeClass(r.verdict)}">${escapeHtml(r.verdict)}</span><span>${escapeHtml(r.summary.scorePercent)}%</span></div>`);
                        break;
                    }
                }
            } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
        }

        // =====================================================================
        // ─── MEMORY INTELLIGENCE CENTER ────────────────────────────────────────
        // Every figure and record here comes from real window.CozyOS.CozyMemory
        // calls — this file adds no storage, search, or comparison logic of
        // its own. Semantic search / embeddings / graph / vector DB are real,
        // disclosed extension points, not simulated.
        // =====================================================================

        #renderMemory() {
            const mem = window.CozyOS.CozyMemory;
            if (!mem) return `<h1>Memory</h1><div class="cz-not-connected">CozyMemory is not connected.</div>`;
            const tab = this.#memorySubTab || "dashboard";
            const tabs = [["dashboard", "Dashboard"], ["search", "Search"], ["timeline", "Timeline"], ["graph", "Dependency Graph"], ["compare", "Compare"], ["explorer", "Memory Explorer"], ["future", "Future Ready"]];
            const nav = `<div class="cz-row" style="flex-wrap:wrap;gap:6px;margin-bottom:10px;">
                ${tabs.map(([id, label]) => `<button class="cz-btn${tab === id ? " cz-btn-primary" : ""}" data-action="hub-memory-subtab" data-tab="${id}">${escapeHtml(label)}</button>`).join("")}
            </div>`;
            const renderers = {
                dashboard: () => this.#renderMemoryDashboard(), search: () => this.#renderMemorySearch(),
                timeline: () => this.#renderMemoryTimeline(), graph: () => this.#renderMemoryGraph(),
                compare: () => this.#renderMemoryCompare(), explorer: () => this.#renderMemoryExplorer(),
                future: () => this.#renderMemoryFuture()
            };
            return `<h1>Memory Intelligence Center</h1>${nav}${(renderers[tab] || renderers.dashboard)()}`;
        }

        #renderMemoryDashboard() {
            const mem = window.CozyOS.CozyMemory;
            const namespaces = mem.listNamespaces();
            const totalEntries = namespaces.reduce((sum, n) => sum + n.entryCount, 0);
            const recent = namespaces.flatMap(n => mem.listKeys(n.name).map(e => ({ ...e, namespace: n.name })))
                .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt)).slice(0, 10);
            const certHistory = mem.listKeys("Project", e => e.key.startsWith("certification-"));
            const builderHistory = mem.listKeys("Builder", e => e.key.startsWith("build-"));

            return `
                <div class="cz-panel">${this.#renderKeyValueTable({ "Total Memories": totalEntries, "Namespaces": namespaces.length })}</div>
                <div class="cz-panel"><h3>Memory by Namespace</h3>
                    ${namespaces.map(n => `<div class="cz-row"><span>${escapeHtml(n.label)}</span><span class="cz-muted">${escapeHtml(n.entryCount)} entries</span></div>`).join("") || '<div class="cz-empty">Nothing recorded yet.</div>'}
                </div>
                <div class="cz-panel"><h3>Recently Learned / Changed</h3>
                    ${recent.map(e => `<div class="cz-row"><span>${escapeHtml(e.namespace)}/${escapeHtml(e.key)}</span><span class="cz-muted">v${escapeHtml(e.versionNumber)} · ${escapeHtml(e.savedAt)}</span></div>`).join("") || '<div class="cz-empty">Nothing yet.</div>'}
                </div>
                <div class="cz-panel"><h3>Certification History (${certHistory.length})</h3>
                    ${certHistory.slice(-5).reverse().map(e => `<div class="cz-row"><span>${escapeHtml(e.value.moduleId)}</span><span class="cz-badge ${verdictBadgeClass(e.value.verdict)}">${escapeHtml(e.value.verdict)}</span></div>`).join("") || '<div class="cz-empty">None yet.</div>'}
                </div>
                <div class="cz-panel"><h3>Builder History (${builderHistory.length})</h3>
                    ${builderHistory.slice(-5).reverse().map(e => `<div class="cz-row"><span>${escapeHtml(e.value.plan ? e.value.plan.exportName : e.key)}</span><span class="cz-muted">${escapeHtml(e.value.mode)}</span></div>`).join("") || '<div class="cz-empty">None yet.</div>'}
                </div>`;
        }

        #renderMemorySearch() {
            return `<div class="cz-panel">
                <div class="cz-row">
                    <input class="cz-input" id="cz-hub-memory-search" placeholder="Full text..." />
                    <input class="cz-input" id="cz-hub-memory-search-ns" placeholder="Namespace (optional)" />
                    <button class="cz-btn cz-btn-primary" data-action="hub-memory-search">Search</button>
                </div>
                <p class="cz-muted">Searches full text and tags across the given namespace, or every namespace if left blank. Date/Project/Engine filtering can be done by searching those terms directly — there is no separate faceted index yet.</p>
            </div>
            <div class="cz-panel cz-dev-action-output-panel" id="cz-hub-output"></div>`;
        }

        #renderMemoryTimeline() {
            const mem = window.CozyOS.CozyMemory;
            const events = mem.getTimeline().slice(-30).reverse();
            return `<div class="cz-panel"><h3>Visual History</h3>
                ${events.map(e => `<div class="cz-row"><span>⬤</span><span>${escapeHtml(e.label)}</span><span class="cz-muted">${escapeHtml(e.time)}</span></div>`).join("") || '<div class="cz-empty">No timeline events yet.</div>'}
            </div>`;
        }

        #renderMemoryGraph() {
            const workspace = window.CozyOS.WorkspaceShell;
            const moduleIds = workspace ? Array.from(new Set(workspace.listFiles().map(f => f.coordinator).filter(Boolean))) : [];
            return `<div class="cz-panel">
                <div class="cz-field"><label>Module</label>
                    <select class="cz-input" id="cz-hub-memory-graph-module">
                        <option value="">— Select —</option>
                        ${moduleIds.map(id => `<option value="${escapeHtml(id)}">${escapeHtml(id)}</option>`).join("")}
                    </select>
                    <button class="cz-btn cz-btn-primary" data-action="hub-memory-graph">Show Pipeline</button>
                </div>
                <p class="cz-muted">Traces the real pipeline stages actually recorded in Memory for this module — Research → Requirement → Builder → Certification. A stage is only shown if a real record exists; nothing here is inferred.</p>
            </div>
            <div class="cz-panel cz-dev-action-output-panel" id="cz-hub-output"></div>`;
        }

        #renderMemoryCompare() {
            return `<div class="cz-panel">
                <div class="cz-field"><label>Namespace</label><input class="cz-input" id="cz-hub-memory-compare-ns" placeholder="Builder" /></div>
                <div class="cz-row">
                    <input class="cz-input" id="cz-hub-memory-compare-a" placeholder="Key A (or key + version A)" />
                    <input class="cz-input" id="cz-hub-memory-compare-b" placeholder="Key B (or version B)" />
                </div>
                <div class="cz-row">
                    <button class="cz-btn" data-action="hub-memory-compare-keys">Compare Two Memories</button>
                    <button class="cz-btn" data-action="hub-memory-compare-versions">Compare Two Versions (same key)</button>
                </div>
            </div>
            <div class="cz-panel cz-dev-action-output-panel" id="cz-hub-output"></div>`;
        }

        #renderMemoryExplorer() {
            const mem = window.CozyOS.CozyMemory;
            const namespaces = mem.listNamespaces();
            const active = this.#memoryExplorerNamespace || (namespaces[0] && namespaces[0].name);
            return `<div class="cz-panel">
                <div class="cz-row" style="flex-wrap:wrap;gap:6px;">
                    ${namespaces.map(n => `<button class="cz-btn${active === n.name ? " cz-btn-primary" : ""}" data-action="hub-memory-explore-ns" data-ns="${escapeHtml(n.name)}">${escapeHtml(n.label)} (${n.entryCount})</button>`).join("") || '<span class="cz-muted">No namespaces yet.</span>'}
                </div>
            </div>
            ${active ? `<div class="cz-panel"><h3>${escapeHtml(active)}</h3>
                ${mem.listKeys(active).map(e => `<div class="cz-row"><span>${escapeHtml(e.key)}</span><span class="cz-muted">v${escapeHtml(e.versionNumber)}</span><span class="cz-muted">${escapeHtml((e.tags || []).join(", "))}</span></div>`).join("") || '<div class="cz-empty">Empty.</div>'}
            </div>` : ""}`;
        }

        #renderMemoryFuture() {
            return `<div class="cz-panel">
                <h3>Future-Ready Extension Points</h3>
                <p class="cz-muted">These are real, currently-empty extension points — not simulated capability.</p>
                ${["Semantic search (needs an embedding model — none exists here)", "AI embeddings storage (needs an embedding model)", "Graph database backing (currently a flat namespaced Map)", "Vector database backing (needs a vector index)"].map(f => `<div class="cz-row">○ ${escapeHtml(f)}</div>`).join("")}
            </div>`;
        }

        #hubSetMemorySubTab(tab) { this.#memorySubTab = tab; this.#renderMain(); }
        #hubMemoryExploreNamespace(ns) { this.#memoryExplorerNamespace = ns; this.#renderMain(); }

        #hubMemorySearch() {
            const mem = window.CozyOS.CozyMemory;
            const query = document.getElementById("cz-hub-memory-search")?.value.trim();
            const ns = document.getElementById("cz-hub-memory-search-ns")?.value.trim();
            if (!query) { this.#devOutput('<p class="cz-muted">Type something to search.</p>'); return; }
            try {
                const results = ns ? mem.searchMemory(ns, query).map(r => ({ namespace: ns, ...r })) : mem.searchAllNamespaces(query);
                this.#devOutput(results.length
                    ? results.map(r => `<div class="cz-row"><span>${escapeHtml(r.namespace)}/${escapeHtml(r.key)}</span><span class="cz-muted">${escapeHtml(r.matchCount)} match(es)</span></div>`).join("")
                    : '<p class="cz-muted">No matches.</p>');
            } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
        }

        #hubMemoryGraph() {
            const mem = window.CozyOS.CozyMemory;
            const moduleId = document.getElementById("cz-hub-memory-graph-module")?.value;
            if (!moduleId) { this.#devOutput('<p class="cz-muted">Select a module first.</p>'); return; }
            const stages = [];
            const research = mem.searchMemory("Research", moduleId);
            if (research.length) stages.push(`Research Added (${research.length} document(s))`);
            const requirement = mem.searchMemory("Project", moduleId).filter(r => r.key.startsWith("requirement-"));
            if (requirement.length) stages.push("Requirement Generated");
            const build = mem.listKeys("Builder", e => e.key.startsWith("build-") && e.value.plan && e.value.plan.exportName === moduleId);
            if (build.length) stages.push(`Builder Generated Code (${build.length} build(s))`);
            const repairs = mem.listKeys("Builder", e => e.key.startsWith("repair-") && e.value.filename && e.value.filename.includes(moduleId.toLowerCase()));
            if (repairs.length) stages.push(`Bug Fixed (${repairs.length} repair(s))`);
            const cert = mem.listKeys("Project", e => e.key === `certification-${moduleId}`);
            if (cert.length) stages.push(`Certified (${cert[0].value.verdict})`);
            this.#devOutput(stages.length
                ? stages.map((s, i) => `<div class="cz-row">${i > 0 ? "↓" : ""} ${escapeHtml(s)}</div>`).join("")
                : '<p class="cz-muted">No real pipeline stages recorded for this module yet.</p>');
        }

        #hubMemoryCompareKeys() {
            const mem = window.CozyOS.CozyMemory;
            const ns = document.getElementById("cz-hub-memory-compare-ns")?.value.trim() || "Builder";
            const a = document.getElementById("cz-hub-memory-compare-a")?.value.trim();
            const b = document.getElementById("cz-hub-memory-compare-b")?.value.trim();
            if (!a || !b) { this.#devOutput('<p class="cz-muted">Enter both keys.</p>'); return; }
            try {
                const r = mem.compareMemory(ns, a, b);
                this.#devOutput(`<p>Identical: ${r.identical}</p>${r.addedKeys ? `<p>Added: ${escapeHtml(r.addedKeys.join(", ") || "none")}</p><p>Removed: ${escapeHtml(r.removedKeys.join(", ") || "none")}</p><p>Changed: ${escapeHtml(r.changedKeys.join(", ") || "none")}</p>` : ""}`);
            } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
        }

        #hubMemoryCompareVersions() {
            const mem = window.CozyOS.CozyMemory;
            const ns = document.getElementById("cz-hub-memory-compare-ns")?.value.trim() || "Builder";
            const key = document.getElementById("cz-hub-memory-compare-a")?.value.trim();
            const versions = document.getElementById("cz-hub-memory-compare-b")?.value.trim();
            const [vA, vB] = (versions || "").split(",").map(v => parseInt(v.trim(), 10));
            if (!key || !vA || !vB) { this.#devOutput('<p class="cz-muted">Enter a key in field A and "v1,v2" in field B.</p>'); return; }
            try {
                const r = mem.compareVersions(ns, key, vA, vB);
                this.#devOutput(`<p>Identical: ${r.identical}</p><p>v${vA} saved ${escapeHtml(r.savedAtA)} → v${vB} saved ${escapeHtml(r.savedAtB)}</p>`);
            } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
        }

        #renderSearch() {
            return `<h1>Search</h1>
                <div class="cz-panel"><input class="cz-input" id="cz-hub-search-input" placeholder="Search everything..." /><button class="cz-btn cz-btn-primary" data-action="hub-search">Search</button></div>
                <div class="cz-panel cz-dev-action-output-panel" id="cz-hub-output"></div>`;
        }

        #hubSearch(query) {
            const hub = this.#hub();
            if (!query) return;
            const r = hub.globalSearch(query);
            this.#devOutput(`
                <p><b>Modules:</b> ${escapeHtml(r.modules.join(", ") || "none")}</p>
                <p><b>Applications:</b> ${escapeHtml(r.applications.map(a => a.name).join(", ") || "none")}</p>
                <p><b>Repairs:</b> ${escapeHtml(r.repairs.map(x => x.filename).join(", ") || "none")}</p>
                <p><b>Releases:</b> ${escapeHtml(r.releases.map(x => x.name || x.releaseId).join(", ") || "none")}</p>
                <p><b>Pattern Library:</b> ${escapeHtml(r.patternLibrary.map(x => x.moduleId).join(", ") || "none")}</p>`);
        }

        #renderSettings() {
            const hub = this.#hub();
            return `<h1>Settings</h1><div class="cz-panel">${this.#renderKeyValueTable(hub.getDiagnosticsReport())}</div>`;
        }

        // =====================================================================
        // ─── EVENTS ───────────────────────────────────────────────────────────
        // =====================================================================

        #bindEvents() {
            if (this.#eventsBound) return;
            this.#eventsBound = true;
            this.#root.addEventListener("click", (evt) => this.#handleClick(evt));
            this.#root.addEventListener("keydown", (evt) => {
                if (evt.target.id === "cz-hub-search-box" && evt.key === "Enter") { this.#setSection("search"); }
            });
            this.#root.addEventListener("input", (evt) => {
                if (evt.target.id === "cz-hub-builder-code-paste" && this.#uploadedFileOriginal) {
                    const modified = this.#isBuilderSourceModified();
                    const statusCell = this.#root.querySelector("[data-upload-status]");
                    if (statusCell) statusCell.textContent = modified ? "Modified (Unsaved)" : "Unchanged";
                }
                if (evt.target.id === "cz-hub-bugfixer-code-paste" && this.#bugfixerUploadedOriginal) {
                    const modified = evt.target.value !== this.#bugfixerUploadedOriginal.text;
                    const statusCell = this.#root.querySelector("[data-bugfixer-upload-status]");
                    if (statusCell) statusCell.textContent = modified ? "Modified (Unsaved)" : "Unchanged";
                }
            });
            this.#root.addEventListener("change", (evt) => {
                if (evt.target.id === "cz-hub-qc-file" && evt.target.files && evt.target.files.length > 0) {
                    this.#handleQuickFileSelected(evt.target.files);
                }
                if (evt.target.id === "cz-hub-builder-files" && evt.target.files && evt.target.files.length > 0) {
                    this.#handleBuilderFilesSelected(evt.target.files);
                }
                if (evt.target.id === "cz-hub-bugfixer-files" && evt.target.files && evt.target.files.length > 0) {
                    this.#handleBugFixerFilesSelected(evt.target.files);
                }
                if (evt.target.id === "cz-hub-refactor-file" && evt.target.files && evt.target.files[0]) {
                    this.#handleRefactorFileSelected(evt.target.files[0]);
                }
            });
            this.#root.addEventListener("dragover", (evt) => {
                const zone = evt.target.closest("#cz-hub-qc-dropzone, #cz-hub-builder-dropzone, #cz-hub-refactor-dropzone, #cz-hub-bugfixer-dropzone");
                if (zone) { evt.preventDefault(); zone.classList.add("cz-dropzone-active"); }
            });
            this.#root.addEventListener("dragleave", (evt) => {
                const zone = evt.target.closest("#cz-hub-qc-dropzone, #cz-hub-builder-dropzone, #cz-hub-refactor-dropzone, #cz-hub-bugfixer-dropzone");
                if (zone) zone.classList.remove("cz-dropzone-active");
            });
            this.#root.addEventListener("drop", (evt) => {
                const qcZone = evt.target.closest("#cz-hub-qc-dropzone");
                const builderZone = evt.target.closest("#cz-hub-builder-dropzone");
                const refactorZone = evt.target.closest("#cz-hub-refactor-dropzone");
                const bugfixerZone = evt.target.closest("#cz-hub-bugfixer-dropzone");
                if (!qcZone && !builderZone && !refactorZone && !bugfixerZone) return;
                evt.preventDefault();
                (qcZone || builderZone || refactorZone || bugfixerZone).classList.remove("cz-dropzone-active");
                const droppedFiles = evt.dataTransfer && evt.dataTransfer.files;
                if (!droppedFiles || droppedFiles.length === 0) return;
                if (qcZone) this.#handleQuickFileSelected(droppedFiles);
                else if (builderZone) this.#handleBuilderFilesSelected(droppedFiles);
                else if (bugfixerZone) this.#handleBugFixerFilesSelected(droppedFiles);
                else this.#handleRefactorFileSelected(droppedFiles[0]);
            });
        }

        #handleClick(evt) {
            const navEl = evt.target.closest("[data-section]");
            if (navEl) { this.#setSection(navEl.getAttribute("data-section")); return; }

            const actionEl = evt.target.closest("[data-action]");
            if (!actionEl) return;
            const action = actionEl.getAttribute("data-action");
            const moduleId = actionEl.getAttribute("data-module");

            switch (action) {
                case "select-module": this.#selectModule(moduleId); return;
                case "hub-analyze": this.#hubAnalyze(); return;
                case "hub-build-plan": this.#hubBuildPlan(); return;
                case "hub-force-generate": this.#hubBuildPlan(true); return;
                case "hub-download-file": this.#hubDownloadFile(actionEl.getAttribute("data-file")); return;
                case "hub-builder-subtab": this.#hubSetBuilderSubTab(actionEl.getAttribute("data-tab")); return;
                case "hub-refactor-split": this.#hubRefactorSplit(); return;
                case "hub-download-refactor": this.#hubDownloadRefactor(actionEl.getAttribute("data-part"), actionEl.getAttribute("data-name")); return;
                case "hub-refactor-certify": this.#hubRefactorCertify(); return;
                case "hub-download-refactor-final": this.#hubDownloadRefactorFinal(); return;
                case "hub-refactor-merge": this.#hubRefactorMerge(); return;
                case "hub-refactor-modularize": this.#hubRefactorModularize(); return;
                case "hub-refactor-optimize": this.#hubRefactorOptimize(); return;
                case "hub-research-subtab": this.#hubSetResearchSubTab(actionEl.getAttribute("data-tab")); return;
                case "hub-research-select": this.#hubResearchSelect(actionEl.getAttribute("data-entry")); return;
                case "hub-research-deselect": this.#hubResearchDeselect(); return;
                case "hub-research-create-project": this.#hubResearchCreateProject(); return;
                case "hub-research-ingest-text": this.#hubResearchIngestText(); return;
                case "hub-research-ingest-pdf": this.#hubResearchIngestPdf(); return;
                case "hub-research-ingest-screenshot": this.#hubResearchIngestScreenshot(); return;
                case "hub-research-search": this.#hubResearchSearch(); return;
                case "hub-research-extract-principles": case "hub-research-summarize": case "hub-research-send-builder":
                case "hub-research-send-bugfixer": case "hub-research-send-cert":
                    this.#hubResearchAction(action, actionEl.getAttribute("data-entry")); return;
                case "hub-memory-subtab": this.#hubSetMemorySubTab(actionEl.getAttribute("data-tab")); return;
                case "hub-memory-search": this.#hubMemorySearch(); return;
                case "hub-memory-graph": this.#hubMemoryGraph(); return;
                case "hub-memory-compare-keys": this.#hubMemoryCompareKeys(); return;
                case "hub-memory-compare-versions": this.#hubMemoryCompareVersions(); return;
                case "hub-memory-explore-ns": this.#hubMemoryExploreNamespace(actionEl.getAttribute("data-ns")); return;
                case "hub-quick-cert": this.#hubQuickCert(); return;
                case "hub-load-existing-file": this.#hubLoadExistingFile(); return;
                case "hub-export-qc": this.#hubExportQuickCert(actionEl.getAttribute("data-format")); return;
                case "hub-qc-repair": case "hub-qc-open-bugfixer": case "hub-qc-open-builder":
                case "hub-qc-register-workspace": case "hub-qc-register-registry": case "hub-qc-lock-release":
                    this.#hubQuickCertAction(action, moduleId); return;
                case "hub-confirm-repair": this.#hubConfirmRepair(moduleId); return;
                case "hub-full-cert": this.#hubFullCert(); return;
                case "hub-open-bugfixer": this.#hubOpenBugFixer(moduleId); return;
                case "hub-repair": this.#hubRepair(moduleId); return;
                case "hub-download-repaired-project": this.#hubDownloadRepairedProjectZip(); return;
                case "hub-bugfixer-repair-pasted": this.#hubBugFixerRepairPasted(); return;
                case "hub-download-repaired": this.#hubDownloadRepaired(moduleId, actionEl.getAttribute("data-filename")); return;
                case "hub-copy-package": this.#hubCopyPackage(); return;
                case "hub-download-package": this.#hubDownloadPackage(actionEl.getAttribute("data-format")); return;
                case "hub-import-improved": this.#hubImportImproved(moduleId); return;
                case "hub-approve-pattern": { try { window.CozyOS.UnderstandingEngine.approveCandidatePattern(actionEl.getAttribute("data-id")); this.#renderMain(); } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); } return; }
                case "hub-reject-pattern": { try { window.CozyOS.UnderstandingEngine.rejectCandidatePattern(actionEl.getAttribute("data-id"), "Rejected from Knowledge Review Queue."); this.#renderMain(); } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); } return; }
                case "hub-search": this.#hubSearch(document.getElementById("cz-hub-search-input")?.value.trim()); return;
                default:
                    if (action.startsWith("hub-")) { this.#moduleAction(action, moduleId); return; }
            }
        }
    }

    window.addEventListener("DOMContentLoaded", () => {
        const root = document.getElementById("cozy-developer-hub-root");
        if (!root) return;
        if (window.CozyDeveloperHubUI && typeof window.CozyDeveloperHubUI.getVersion === "function") {
            const existingVersion = window.CozyDeveloperHubUI.getVersion();
            if (existingVersion !== HUB_UI_VERSION) {
                throw new Error(`[CozyOS Framework Execution Error] VERSION_CONFLICT: DeveloperHubUI existing v${existingVersion} conflicts with load target v${HUB_UI_VERSION}.`);
            }
            return;
        }
        const ui = new CozyDeveloperHubUI();
        ui.mount(root);
        window.CozyDeveloperHubUI = ui;
    });
})();
