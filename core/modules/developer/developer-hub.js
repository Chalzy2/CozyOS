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
        #lastQuickCertSource = null;
        #lastQuickCertResult = null;
        #lastBuildPlan = null;
        #lastBuildResult = null;
        #pendingBuilderFiles = null;
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
                ["developerQueue", "Developer Queue"], ["search", "Search"], ["settings", "Settings"]
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
            return `<h1>Builder</h1>
                <p class="cz-subtitle">${selected ? `Opened with "${escapeHtml(selected)}" already loaded — no re-upload.` : "Describe what you want to build, paste existing source, or upload existing files — whichever you already have."}</p>
                <div class="cz-panel">
                    <div class="cz-field"><label>Method 1 — Describe what you want to build</label>
                        <textarea class="cz-input" id="cz-hub-builder-prompt" rows="3" placeholder="Describe what you want to build...">${escapeHtml(selected ? `Build ${selected} Coordinator` : "")}</textarea>
                    </div>
                    <div class="cz-field"><label>Method 2 — Paste existing source code</label>
                        <textarea class="cz-input" id="cz-hub-builder-code-paste" rows="4" placeholder="Paste existing JS/HTML/CSS/JSON/Markdown/TXT source here — Builder reads it instead of asking you to describe it."></textarea>
                    </div>
                    <div class="cz-field"><label>Method 3 — Upload existing file(s)</label>
                        <div class="cz-dropzone" id="cz-hub-builder-dropzone">
                            <p>Drag &amp; drop file(s) here (.js, .html, .css, .json, .md, .txt) — multiple files supported — or use the picker below.</p>
                            <input type="file" id="cz-hub-builder-files" accept=".js,.html,.css,.json,.md,.txt" multiple />
                        </div>
                        <div id="cz-hub-builder-attachment-summary" class="cz-muted"></div>
                    </div>
                    <button class="cz-btn cz-btn-primary" data-action="hub-analyze">Analyze</button>
                </div>
                ${this.#lastAnalysis ? this.#renderAnalysisResult(this.#lastAnalysis) : ""}
                ${this.#lastBuildResult ? this.#renderBuildResult(this.#lastBuildResult) : ""}
                <div class="cz-panel cz-dev-action-output-panel" id="cz-hub-output"></div>`;
        }

        #renderAnalysisResult(a) {
            return `<div class="cz-panel">
                <h3>Understanding Preview</h3>
                <p><b>Application Type:</b> ${escapeHtml(a.understanding.applicationType)}</p>
                <p><b>Detected Features:</b> ${escapeHtml((a.understanding.detectedFeatures || []).join(", ") || "none")}</p>
                <p><b>Missing (Gap Detector):</b> ${escapeHtml(a.gaps.missing.map(g => g.label).join(", ") || "none")}</p>
                <button class="cz-btn cz-btn-primary" data-action="hub-build-plan">Continue → Generate</button>
            </div>`;
        }

        #renderBuildResult(result) {
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
            const uploaded = this.#pendingBuilderFiles || [];

            try {
                const codeAnalyses = [];
                if (ue) {
                    if (pastedCode) { try { codeAnalyses.push(ue.analyzeCode(pastedCode)); } catch (_err) { /* not parseable as code */ } }
                    for (const f of uploaded) { try { codeAnalyses.push(ue.analyzeCode(f.text)); } catch (_err) { /* skip unparseable file */ } }
                }

                if (codeAnalyses.length > 0) {
                    const primary = codeAnalyses[0];
                    const description = text || `Build ${primary.className || "Module"} Coordinator`;
                    this.#lastAnalysis = await hub.analyzeRequirement(description);
                    this.#lastAnalysis.codeAnalyses = codeAnalyses;
                } else if (text) {
                    this.#lastAnalysis = await hub.analyzeRequirement(text);
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
            const read = await Promise.all(files.map(async f => ({ name: f.name, text: await this.#readFileAsText(f) })));
            this.#pendingBuilderFiles = read;
            const summaryEl = document.getElementById("cz-hub-builder-attachment-summary");
            if (summaryEl) summaryEl.textContent = `Attached: ${read.map(f => f.name).join(", ")}`;
        }

        async #hubBuildPlan() {
            const hub = this.#hub();
            const text = document.getElementById("cz-hub-builder-prompt")?.value.trim();
            try {
                const plan = this.#lastAnalysis?.understanding?.plan || (await hub.openWithBuilder((text || "Module").replace(/^build\s+/i, "").replace(/\s+coordinator$/i, "")));
                this.#lastBuildResult = await hub.buildFromPlan(plan, "coordinator");
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
            return `<h1>Understanding Engine</h1>
                <div class="cz-panel">
                    ${row("Text Analyzer", p.textAnalyzer)}
                    ${row("Code Analyzer", p.codeAnalyzer)}
                    ${row("PDF Analyzer", p.pdfAnalyzer)}
                    ${row("Image Analyzer", p.imageAnalyzer)}
                    ${row("OCR Engine", p.ocrEngine)}
                </div>
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

        /** Handles a file dropped or picked for Quick Certification — reads it, auto-detects metadata, and remembers its source so later Developer Actions never need it pasted again. */
        async #handleQuickFileSelected(fileOrList) {
            const files = Array.isArray(fileOrList) || (fileOrList && typeof fileOrList.length === "number" && !fileOrList.name)
                ? Array.from(fileOrList) : [fileOrList];
            if (files.length === 0 || !files[0]) return;

            const [firstFile, ...restFiles] = files;
            const sourceText = await this.#readFileAsText(firstFile);
            const meta = this.#detectFileMetadata(firstFile.name, sourceText);
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
            const moduleId = document.getElementById("cz-hub-qc-moduleid")?.value.trim() || "untitled_module";
            const version = document.getElementById("cz-hub-qc-version")?.value.trim() || "0.0.0";
            const source = document.getElementById("cz-hub-qc-source")?.value || "";
            try {
                const result = hub.quickCertifyModule(moduleId, source, version);
                this.#lastQuickCertModuleId = moduleId;
                this.#lastQuickCertSource = source;
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
                        this.#ensureQuickCertWorkspaceFile(moduleId);
                        const preview = await hub.repairModule(moduleId, { approve: false });
                        if (!preview.changed) { this.#devOutput("<p>No deterministically-fixable findings.</p>"); break; }
                        this.#devOutput(`<p>Before: ${escapeHtml(preview.preview.beforeCertification.scorePercent)}% → After: ${escapeHtml(preview.preview.afterCertification.available ? preview.preview.afterCertification.scorePercent : "?")}%</p>
                            <button class="cz-btn cz-btn-primary" data-action="hub-confirm-repair" data-module="${escapeHtml(moduleId)}">Confirm &amp; Save</button>`);
                        break;
                    }
                    case "hub-qc-open-bugfixer": {
                        this.#ensureQuickCertWorkspaceFile(moduleId);
                        const bfFileId = await hub.openWithBugFixer(moduleId);
                        this.#devOutput(`<p>Loaded into CozyBugFixer (fileId ${escapeHtml(bfFileId)}).</p>`);
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
            if (!selected) return `<h1>BugFixer</h1><div class="cz-panel">No module selected. Select one from Module Explorer or the Developer Queue.</div>`;
            return `<h1>BugFixer: ${escapeHtml(selected)}</h1>
                <div class="cz-panel">
                    <button class="cz-btn" data-action="hub-open-bugfixer" data-module="${escapeHtml(selected)}">Open with CozyBugFixer</button>
                    <button class="cz-btn cz-btn-primary" data-action="hub-repair" data-module="${escapeHtml(selected)}">Repair with CozyBugFixer</button>
                </div>
                <div class="cz-panel cz-dev-action-output-panel" id="cz-hub-output"></div>`;
        }

        async #hubOpenBugFixer(moduleId) {
            const hub = this.#hub();
            try { const bfFileId = await hub.openWithBugFixer(moduleId); this.#devOutput(`<p>Loaded into CozyBugFixer (fileId ${escapeHtml(bfFileId)}).</p>`); }
            catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
        }

        async #hubRepair(moduleId) {
            const hub = this.#hub();
            try {
                const preview = await hub.repairModule(moduleId, { approve: false });
                if (!preview.changed) { this.#devOutput("<p>No deterministically-fixable findings.</p>"); return; }
                this.#devOutput(`<p>Before: ${escapeHtml(preview.preview.beforeCertification.scorePercent)}% → After: ${escapeHtml(preview.preview.afterCertification.available ? preview.preview.afterCertification.scorePercent : "?")}%</p>
                    <button class="cz-btn cz-btn-primary" data-action="hub-confirm-repair" data-module="${escapeHtml(moduleId)}">Confirm &amp; Save</button>`);
            } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
        }

        async #hubConfirmRepair(moduleId) {
            const hub = this.#hub();
            try { const result = await hub.repairModule(moduleId, { approve: true }); this.#devOutput(`<p>Saved. New certification: ${result.certResult ? escapeHtml(result.certResult.verdict) : "n/a"}.</p>`); }
            catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
        }

        // =====================================================================
        // ─── WORKSPACE ────────────────────────────────────────────────────────
        // =====================================================================

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
                ["hub-delete-registration", "Delete Registration"]
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
                            const rollbackUnavailable = action === "hub-rollback-golden";
                            return `<button class="cz-btn" data-action="${action}" data-module="${escapeHtml(moduleId)}"${rollbackUnavailable ? ` disabled title="Rollback unavailable. CozyCertification does not currently expose a rollback API."` : ""}>${escapeHtml(label)}</button>`;
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
                    case "hub-save": { const src = hub.getModuleSource(moduleId); const result = await hub.saveModule(moduleId, src); this.#devOutput(`<p>Saved. Checksum → ${escapeHtml(result.newHash.slice(0, 8))}….</p>`); break; }
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
                    case "hub-rollback-golden": this.#devOutput("<p class=\"cz-muted\">Rollback unavailable. CozyCertification does not currently expose a rollback API.</p>"); break;
                    case "hub-delete-registration": { const ok = window.confirm(`Delete "${moduleId}"'s Service Registry registration? This cannot be undone.`); if (ok) { hub.deleteRegistration(moduleId); this.#devOutput("<p>Registration deleted.</p>"); } break; }
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
            this.#root.addEventListener("change", (evt) => {
                if (evt.target.id === "cz-hub-qc-file" && evt.target.files && evt.target.files.length > 0) {
                    this.#handleQuickFileSelected(evt.target.files);
                }
                if (evt.target.id === "cz-hub-builder-files" && evt.target.files && evt.target.files.length > 0) {
                    this.#handleBuilderFilesSelected(evt.target.files);
                }
            });
            this.#root.addEventListener("dragover", (evt) => {
                const zone = evt.target.closest("#cz-hub-qc-dropzone, #cz-hub-builder-dropzone");
                if (zone) { evt.preventDefault(); zone.classList.add("cz-dropzone-active"); }
            });
            this.#root.addEventListener("dragleave", (evt) => {
                const zone = evt.target.closest("#cz-hub-qc-dropzone, #cz-hub-builder-dropzone");
                if (zone) zone.classList.remove("cz-dropzone-active");
            });
            this.#root.addEventListener("drop", (evt) => {
                const qcZone = evt.target.closest("#cz-hub-qc-dropzone");
                const builderZone = evt.target.closest("#cz-hub-builder-dropzone");
                if (!qcZone && !builderZone) return;
                evt.preventDefault();
                (qcZone || builderZone).classList.remove("cz-dropzone-active");
                const droppedFiles = evt.dataTransfer && evt.dataTransfer.files;
                if (!droppedFiles || droppedFiles.length === 0) return;
                if (qcZone) this.#handleQuickFileSelected(droppedFiles);
                else this.#handleBuilderFilesSelected(droppedFiles);
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
                case "hub-download-file": this.#hubDownloadFile(actionEl.getAttribute("data-file")); return;
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
                case "hub-confirm-repair": this.#hubConfirmRepair(moduleId); return;
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
