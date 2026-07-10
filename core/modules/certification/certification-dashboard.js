/**
 * CozyOS Certification Dashboard
 * File Reference: core/modules/certification/certification-dashboard.js
 * Layer: UI / Orchestration layer over the Certification Coordinator
 * Version: 1.0.0-ENTERPRISE
 *
 * ARCHITECTURE RULES (non-negotiable, per spec)
 *   - This file NEVER reimplements certification logic. Every verdict,
 *     score, defect, regression, or compatibility judgment displayed here
 *     came directly from calling a real public method on
 *     window.CozyOS.Certification. If that coordinator isn't loaded, every
 *     certification action in this dashboard is disabled with a visible
 *     reason — nothing here computes a fallback verdict of its own.
 *   - This file NEVER executes uploaded or pasted source. Uploaded/pasted
 *     JavaScript is read as plain text (FileReader.readAsText / the value of
 *     a <textarea>) and handed to certifyModule()/quickCertification() as a
 *     string — nothing here ever calls eval(), new Function(...), or
 *     assigns it to a <script> tag.
 *   - This file never blocks the main thread indefinitely: every
 *     certification action shows a progress overlay, and any action that
 *     loops over more than one item (batch uploads, Application
 *     Certification across multiple apps) yields between items and checks
 *     a cancellation flag. The one honest exception: fullCertification()
 *     and other single-call engine methods are synchronous by design (the
 *     engine can't be modified to chunk internally) — those show an
 *     indeterminate progress spinner and can be prevented from starting,
 *     but not interrupted mid-call once running.
 */

(function () {
    "use strict";

    const DASHBOARD_VERSION = "1.0.0-ENTERPRISE";
    const STORAGE_PREFIX = "cozyCertDashboard:";

    // =========================================================================
    // ─── UTILITIES ────────────────────────────────────────────────────────────
    // =========================================================================

    function escapeHtml(value) {
        const str = String(value === undefined || value === null ? "" : value);
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    // Cooperative yield — lets the browser paint / process input between
    // steps of a loop, instead of one long synchronous block.
    function yieldToBrowser() {
        return new Promise((resolve) => setTimeout(resolve, 0));
    }

    function readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ""));
            reader.onerror = () => reject(reader.error || new Error("File read failed"));
            reader.readAsText(file);
        });
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

    // Turns a plain-text report into a real downloadable PDF using jsPDF
    // (loaded via CDN in certification.html), wrapping long lines and
    // paginating. If jsPDF didn't load (e.g. offline install with no CDN
    // access), this returns null and the caller falls back to opening the
    // HTML report for the browser's own Print -> Save as PDF instead of
    // failing silently.
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

    function loadPersisted(key, fallback) {
        try {
            const raw = localStorage.getItem(STORAGE_PREFIX + key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (_err) { return fallback; }
    }

    function savePersisted(key, value) {
        try { localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value)); } catch (_err) { /* storage unavailable — dashboard still works, just doesn't remember across reloads */ }
    }

    const SEVERITY_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];

    function verdictBadgeClass(verdict) {
        if (verdict === "ENTERPRISE_CERTIFIED") return "cz-badge-ready";
        if (verdict === "CERTIFIED_WITH_WARNINGS") return "cz-badge-warn";
        return "cz-badge-blocked";
    }

    // =========================================================================
    // ─── DASHBOARD APPLICATION ───────────────────────────────────────────────
    // =========================================================================

    class CertificationDashboard {
        #cert = null;
        #workspace = null;
        #registry = null;

        #root = null;
        #activeSection = "dashboard";
        #searchTerm = "";
        #selected = null; // { type, id } for drill-down views

        // Session-tracked module ids this dashboard has certified (used by
        // Module Explorer, since the engine itself has no "list every module
        // ever certified" method — only per-moduleId lookups). Persisted so
        // it survives a reload of this page.
        #knownModuleIds = new Set(loadPersisted("knownModuleIds", []));
        #knownApplicationIds = new Set(loadPersisted("knownApplicationIds", []));

        // Dashboard-local "current release" pointer — separate from any
        // pointer the Workspace Shell might keep; this one belongs to the
        // dashboard's own Release Center view.
        #currentReleaseId = loadPersisted("currentReleaseId", null);

        #settings = loadPersisted("settings", {
            theme: "light", language: "en", exportFolder: "", autoSave: true,
            autoCertification: false, developerMode: false
        });

        #lastResults = {}; // section -> most recent result, for the Reports panel
        #cancelFlag = { cancelled: false };

        // ---- event bus, so a page embedding this dashboard can react to
        // activity (e.g. auto-refresh its own UI when a certification
        // completes) without polling ----
        #listeners = new Map();
        #onceWrapped = new Map();

        // ---- bounded recent-actions log — a lightweight, in-dashboard audit
        // trail (separate from CozyCertification's own append-only audit,
        // which is the real record of what certifications actually ran) ----
        #recentActions = [];

        constructor() {
            this.#cert = window.CozyOS && window.CozyOS.Certification ? window.CozyOS.Certification : null;
            this.#workspace = window.CozyOS && window.CozyOS.WorkspaceShell ? window.CozyOS.WorkspaceShell : null;
            this.#registry = window.CozyOS && window.CozyOS.ServiceRegistry ? window.CozyOS.ServiceRegistry : null;
        }

        getVersion() { return DASHBOARD_VERSION; }

        on(eventName, handler) {
            if (typeof eventName !== "string" || !eventName.trim()) throw new TypeError("[CertificationDashboard] on(): eventName must be a non-empty string.");
            if (typeof handler !== "function") throw new TypeError("[CertificationDashboard] on(): handler must be a function.");
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
            if (typeof handler !== "function") throw new TypeError("[CertificationDashboard] once(): handler must be a function.");
            const wrapper = (payload) => { this.off(eventName, handler); this.#onceWrapped.delete(handler); handler(payload); };
            this.#onceWrapped.set(handler, wrapper);
            this.on(eventName, wrapper);
        }

        emit(eventName, payload) {
            if (typeof eventName !== "string" || !eventName.trim()) return false;
            this.#recentActions.push({ time: new Date().toISOString(), eventName, summary: payload && payload.moduleId ? payload.moduleId : (payload && payload.releaseId) || "" });
            if (this.#recentActions.length > 200) this.#recentActions.shift();
            const set = this.#listeners.get(eventName);
            if (!set || set.size === 0) return false;
            for (const fn of Array.from(set)) {
                try { fn(payload); } catch (_err) { /* a subscriber's own error shouldn't break the dashboard */ }
            }
            return true;
        }

        #persist() {
            savePersisted("knownModuleIds", Array.from(this.#knownModuleIds));
            savePersisted("knownApplicationIds", Array.from(this.#knownApplicationIds));
            savePersisted("currentReleaseId", this.#currentReleaseId);
            savePersisted("settings", this.#settings);
        }

        #rememberModule(moduleId) { this.#knownModuleIds.add(moduleId); this.#persist(); }
        #rememberApplication(applicationId) { this.#knownApplicationIds.add(applicationId); this.#persist(); }

        mount(root) {
            this.#root = root;
            this.#render();
            this.#bindEvents();
        }

        // =====================================================================
        // ─── RENDER FRAME (sidebar / topbar / main) ─────────────────────────
        // =====================================================================

        #showProgress(label, sub) {
            const overlay = document.createElement("div");
            overlay.className = "cz-progress-overlay";
            overlay.id = "cz-progress-overlay";
            overlay.innerHTML = `
                <div class="cz-progress-box">
                    <div class="cz-spinner"></div>
                    <div class="cz-progress-label">${escapeHtml(label)}</div>
                    <div class="cz-progress-sub" id="cz-progress-sub">${escapeHtml(sub || "")}</div>
                    <div class="cz-progress-bar-track"><div class="cz-progress-bar-fill" id="cz-progress-bar" style="width:0%"></div></div>
                    <button type="button" class="cz-btn cz-btn-danger" id="cz-progress-cancel">Cancel</button>
                </div>`;
            document.body.appendChild(overlay);
            this.#cancelFlag = { cancelled: false };
            overlay.querySelector("#cz-progress-cancel").addEventListener("click", () => { this.#cancelFlag.cancelled = true; });
            return this.#cancelFlag;
        }

        #updateProgress(percent, sub) {
            const bar = document.getElementById("cz-progress-bar");
            const subEl = document.getElementById("cz-progress-sub");
            if (bar) bar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
            if (subEl && sub !== undefined) subEl.textContent = sub;
        }

        #hideProgress() {
            const overlay = document.getElementById("cz-progress-overlay");
            if (overlay) overlay.remove();
        }

        #sidebarSections() {
            return [
                ["dashboard", "Dashboard"], ["quick", "Quick Certification"], ["full", "Full Certification"],
                ["application", "Application Certification"], ["platform", "Platform Certification"],
                ["upgrade", "Upgrade Verification"], ["platformUpgrade", "Platform Upgrade"],
                ["release", "Release Center"], ["reports", "Reports"], ["history", "History"],
                ["moduleExplorer", "Module Explorer"], ["applicationExplorer", "Application Explorer"],
                ["workspace", "Workspace"], ["serviceRegistry", "Service Registry"],
                ["diagnostics", "Diagnostics"], ["settings", "Settings"]
            ];
        }

        #render() {
            if (!this.#root) return;
            const navHtml = this.#sidebarSections().map(([id, label]) => `
                <div class="cz-nav-item${this.#activeSection === id ? " active" : ""}" data-section="${id}">${escapeHtml(label)}</div>`).join("");

            const notificationCount = this.#workspace && typeof this.#workspace.getNotificationFeed === "function"
                ? this.#workspace.getNotificationFeed().length : 0;
            const engineVersion = this.#cert ? this.#cert.getVersion() : "not connected";
            const currentRelease = this.#currentReleaseId && this.#cert ? this.#cert.getRelease(this.#currentReleaseId) : null;

            this.#root.innerHTML = `
                <div class="cz-app">
                    <nav class="cz-sidebar">
                        <div class="cz-sidebar-brand"><span class="cz-dot"></span> CozyOS Certification Center</div>
                        <div class="cz-nav-group-label">Navigate</div>
                        ${navHtml}
                    </nav>
                    <header class="cz-topbar">
                        <input type="text" class="cz-search" id="cz-global-search" placeholder="Search modules, applications, releases..." value="${escapeHtml(this.#searchTerm)}" />
                        <div class="cz-topbar-meta">
                            <span class="cz-bell" id="cz-bell-icon">🔔${notificationCount > 0 ? `<span class="cz-bell-count">${notificationCount}</span>` : ""}</span>
                            <span>Engine: <b>v${escapeHtml(engineVersion)}</b></span>
                            <span>Release: <b>${escapeHtml(currentRelease ? currentRelease.name : "None set")}</b></span>
                            <span>Status: <b>${this.#cert ? "Connected" : "Not Connected"}</b></span>
                        </div>
                    </header>
                    <main class="cz-main" id="cz-main">${this.#renderSection(this.#activeSection)}</main>
                </div>`;
        }

        #setSection(id, selected) {
            this.#activeSection = id;
            this.#selected = selected || null;
            this.#render();
        }

        #renderMain() {
            const main = document.getElementById("cz-main");
            if (main) main.innerHTML = this.#renderSection(this.#activeSection);
        }

        #notConnected(message) {
            return `<div class="cz-not-connected">${escapeHtml(message)}</div>`;
        }

        #renderSection(id) {
            if (!this.#cert && id !== "settings" && id !== "workspace" && id !== "serviceRegistry") {
                return `<h1>${escapeHtml(this.#labelFor(id))}</h1>${this.#notConnected("window.CozyOS.Certification is not loaded. This dashboard cannot make certification decisions of its own — check that cozy-certification.js loaded successfully before this file.")}`;
            }
            switch (id) {
                case "dashboard": return this.#renderDashboard();
                case "quick": return this.#renderQuickCertification();
                case "full": return this.#renderFullCertification();
                case "application": return this.#renderApplicationCertification();
                case "platform": return this.#renderPlatformCertification();
                case "upgrade": return this.#renderUpgradeVerification();
                case "platformUpgrade": return this.#renderPlatformUpgrade();
                case "release": return this.#renderReleaseCenter();
                case "reports": return this.#renderReports();
                case "history": return this.#renderHistory();
                case "moduleExplorer": return this.#renderModuleExplorer();
                case "applicationExplorer": return this.#renderApplicationExplorer();
                case "workspace": return this.#renderWorkspaceSection();
                case "serviceRegistry": return this.#renderServiceRegistrySection();
                case "diagnostics": return this.#renderDiagnostics();
                case "settings": return this.#renderSettings();
                default: return this.#notConnected(`Unknown section "${id}".`);
            }
        }

        #labelFor(id) {
            const found = this.#sidebarSections().find(([sid]) => sid === id);
            return found ? found[1] : id;
        }

        #bindEvents() {
            this.#root.addEventListener("click", (evt) => this.#handleClick(evt));
            this.#root.addEventListener("input", (evt) => this.#handleInput(evt));
            this.#root.addEventListener("change", (evt) => this.#handleChange(evt));
        }

        #handleInput(evt) {
            if (evt.target.id === "cz-global-search") {
                this.#searchTerm = evt.target.value;
                if (this.#activeSection === "moduleExplorer" || this.#activeSection === "applicationExplorer") this.#renderMain();
            }
        }

        #handleChange(evt) {
            // Settings inputs and file inputs are handled where they're
            // rendered (delegated by data-action below), but native <select>/
            // checkbox changes for Settings are simplest handled here.
            if (evt.target.matches("[data-setting]")) {
                const key = evt.target.getAttribute("data-setting");
                // Only ever assign a known settings key, and explicitly reject
                // prototype-polluting keys before any dynamic assignment —
                // defense in depth even though data-setting values are
                // rendered by this file itself, not user-supplied.
                const ALLOWED_SETTINGS_KEYS = new Set(["theme", "language", "exportFolder", "autoSave", "autoCertification", "developerMode"]);
                const DENY_KEYS = new Set(["__proto__", "constructor", "prototype"]);
                if (!ALLOWED_SETTINGS_KEYS.has(key) || DENY_KEYS.has(key)) return;
                const value = evt.target.type === "checkbox" ? evt.target.checked : evt.target.value;
                this.#settings[key] = value;
                this.#persist();
            }
        }

        #handleClick(evt) {
            const navEl = evt.target.closest("[data-section]");
            if (navEl) { this.#setSection(navEl.getAttribute("data-section")); return; }

            const actionEl = evt.target.closest("[data-action]");
            if (actionEl) {
                const action = actionEl.getAttribute("data-action");
                this.#dispatchAction(action, actionEl, evt);
            }
        }

        // =====================================================================
        // ─── DASHBOARD ────────────────────────────────────────────────────────
        // =====================================================================

        #renderDashboard() {
            const cert = this.#cert;
            const rules = cert.listRules();
            const releases = cert.listReleases();
            const applications = cert.listApplications();
            const currentRelease = this.#currentReleaseId ? cert.getRelease(this.#currentReleaseId) : null;

            // "Total Certified Modules" / "Certified Applications" — counted
            // from what this dashboard session actually knows about (see the
            // #knownModuleIds note above #render). If a Workspace Shell is
            // connected, its own live discovery is used instead, since that's
            // a strictly more complete picture.
            let certifiedModules = 0, totalModulesTracked = 0;
            if (this.#workspace && typeof this.#workspace.getModuleManagerData === "function") {
                const modules = this.#workspace.getModuleManagerData().modules;
                totalModulesTracked = modules.length;
                certifiedModules = modules.filter(m => m.certification && m.certification.certification === "ENTERPRISE_CERTIFIED").length;
            } else {
                totalModulesTracked = this.#knownModuleIds.size;
                certifiedModules = Array.from(this.#knownModuleIds).filter(id => {
                    const summary = cert.getWorkspaceSummary(id);
                    return summary && summary.certification === "ENTERPRISE_CERTIFIED";
                }).length;
            }

            let platformScore = null, platformGrade = null;
            try {
                const full = cert.fullCertification();
                platformScore = full.platformReport.overallPlatformScore;
                platformGrade = full.platformReport.overallGrade;
            } catch (_err) { /* no discoverable window.CozyOS in this context */ }

            const cards = [
                ["CozyOS Version", this.#workspace ? this.#workspace.getVersion() : "Workspace not connected"],
                ["Certification Engine", `v${cert.getVersion()}`],
                ["Certified Modules", `${certifiedModules} / ${totalModulesTracked}`],
                ["Certified Applications", `${applications.length}`],
                ["Current Release", currentRelease ? currentRelease.name : "None set"],
                ["Platform Health", platformScore !== null ? `${platformScore}%` : "Not yet run"],
                ["Platform Grade", platformGrade || "—"],
                ["Workspace Status", this.#workspace ? "Connected" : "Not Connected"],
                ["Service Registry", this.#registry ? "Connected" : "Not Connected"]
            ];

            const cardHtml = cards.map(([label, value]) => `
                <div class="cz-card"><div class="cz-card-label">${escapeHtml(label)}</div><div class="cz-card-value">${escapeHtml(value)}</div></div>`).join("");

            return `<h1>Dashboard</h1><p class="cz-subtitle">Rule set v${escapeHtml(cert.getRuleSetVersion())} — ${rules.length} enterprise rules loaded.</p>
                <div class="cz-grid">${cardHtml}</div>
                <div class="cz-row" style="margin-top:16px;">
                    <button class="cz-btn cz-btn-primary" data-action="run-full-cert">Run Full Platform Certification</button>
                    <button class="cz-btn" data-action="goto" data-goto="quick">Quick Certify a Module</button>
                </div>`;
        }

        // =====================================================================
        // ─── QUICK CERTIFICATION ──────────────────────────────────────────────
        // =====================================================================

        #renderQuickCertification() {
            const result = this.#lastResults.quick;
            return `<h1>Quick Certification</h1><p class="cz-subtitle">Certify one file — paste source or upload it. Nothing here is ever executed; the text goes straight to CozyCertification.quickCertification().</p>
                <div class="cz-panel">
                    <div class="cz-field"><label>Module ID</label><input class="cz-input" id="cz-quick-moduleid" placeholder="e.g. CozySpeech" /></div>
                    <div class="cz-field"><label>Version</label><input class="cz-input" id="cz-quick-version" placeholder="e.g. 1.0.0" /></div>
                    <div class="cz-field">
                        <label>Upload (.js, .html, .css, .json, .md, .txt)</label>
                        <input type="file" id="cz-quick-file" accept=".js,.html,.css,.json,.md,.txt" />
                    </div>
                    <div class="cz-field"><label>Or paste source</label><textarea class="cz-input" id="cz-quick-source" placeholder="Paste JavaScript, HTML, CSS, JSON, Markdown, or plain text here..."></textarea></div>
                    <button class="cz-btn cz-btn-primary" data-action="run-quick-cert">Run Quick Certification</button>
                </div>
                ${result ? this.#renderCertificationResult(result) : ""}`;
        }

        async #runQuickCertification() {
            const moduleIdEl = document.getElementById("cz-quick-moduleid");
            const versionEl = document.getElementById("cz-quick-version");
            const fileEl = document.getElementById("cz-quick-file");
            const sourceEl = document.getElementById("cz-quick-source");

            const moduleId = (moduleIdEl && moduleIdEl.value.trim()) || "untitled_module";
            const version = (versionEl && versionEl.value.trim()) || "0.0.0";

            let sourceText = sourceEl ? sourceEl.value : "";
            const cancelToken = this.#showProgress("Running Quick Certification…", moduleId);
            await yieldToBrowser();
            try {
                if (fileEl && fileEl.files && fileEl.files.length > 0) {
                    sourceText = await readFileAsText(fileEl.files[0]);
                }
                if (cancelToken.cancelled) return;
                this.#updateProgress(60, "Evaluating enterprise rules…");
                await yieldToBrowser();
                const result = this.#cert.quickCertification(sourceText, { moduleId, moduleName: moduleId, version });
                this.#rememberModule(moduleId);
                this.#lastResults.quick = result;
                this.emit("quickCertification:completed", { moduleId, verdict: result.verdict, scorePercent: result.summary.scorePercent });
                this.#updateProgress(100, "Done");
            } catch (err) {
                this.#lastResults.quick = null;
                window.alert(`Quick Certification failed: ${err.message}`);
            } finally {
                this.#hideProgress();
                this.#renderMain();
            }
        }

        // Shared result renderer — used by Quick, Full (per-module drilldown),
        // and Application Certification views, so certification results look
        // consistent everywhere in the dashboard.
        #renderSnippetLines(codeSnippet) {
            if (!codeSnippet) return "";
            const lineHtml = codeSnippet.lines.map((l) => {
                const marker = l.isTarget ? "  <-- \u25B2" : "";
                return `${String(l.num).padStart(4, " ")}| ${escapeHtml(l.text)}${marker}`;
            }).join("\n");
            return `<pre>${lineHtml}</pre>`;
        }

        #renderCertificationResult(result) {
            const defectsHtml = (result.defects || []).map(d => `
                <div class="cz-defect sev-${d.severity.toLowerCase()}${d.waived ? " waived" : ""}">
                    <b>${d.waived ? "⏸ WAIVED — " : ""}${escapeHtml(d.severity)}</b> ${escapeHtml(d.description)} <span class="cz-tag-source">(${escapeHtml(d.id)}, ${escapeHtml(d.location)})</span>
                    <div>${escapeHtml(d.recommendation)}</div>
                    ${this.#renderSnippetLines(d.codeSnippet)}
                </div>`).join("");

            return `
                <div class="cz-panel">
                    <h2>Result: ${escapeHtml(result.moduleName || result.moduleId)}</h2>
                    <div class="cz-row">
                        <span class="cz-badge ${verdictBadgeClass(result.verdict)}">${escapeHtml(result.quickVerdict || result.verdict)}</span>
                        <span>Score: <b>${escapeHtml(result.summary.scorePercent)}%</b></span>
                        <span>Grade: <b>${escapeHtml(result.overallGrade)}</b></span>
                        <span class="cz-badge cz-badge-critical">${result.severityCounts.critical} Critical</span>
                        <span class="cz-badge cz-badge-high">${result.severityCounts.high} High</span>
                        <span class="cz-badge cz-badge-medium">${result.severityCounts.medium} Medium</span>
                        <span class="cz-badge cz-badge-low">${result.severityCounts.low} Low</span>
                    </div>
                    <p class="cz-subtitle">Passed ${result.summary.passed}/${result.summary.totalChecks} rules · Estimated total fix time: ${(result.defects || []).reduce((s, d) => s + (d.estimatedFixMinutes || 0), 0)} min</p>
                    <div class="cz-row">
                        <button class="cz-btn" data-action="export-current" data-format="html">Export HTML</button>
                        <button class="cz-btn" data-action="export-current" data-format="markdown">Export Markdown</button>
                        <button class="cz-btn" data-action="export-current" data-format="json">Export JSON</button>
                        <button class="cz-btn" data-action="export-current" data-format="csv">Export CSV</button>
                        <button class="cz-btn" data-action="export-current" data-format="text">Export TXT</button>
                        <button class="cz-btn" data-action="export-current" data-format="pdf">Export PDF</button>
                    </div>
                    <h3>Defects</h3>
                    ${defectsHtml || '<div class="cz-empty">No defects found.</div>'}
                </div>`;
        }

        // =====================================================================
        // ─── FULL CERTIFICATION ───────────────────────────────────────────────
        // =====================================================================

        #renderFullCertification() {
            const result = this.#lastResults.full;
            let body = "";
            if (result) {
                const pr = result.platformReport;
                body = `
                    <div class="cz-panel">
                        <div class="cz-row">
                            <span class="cz-badge ${verdictBadgeClass(pr.enterpriseVerdict)}">${escapeHtml(pr.enterpriseVerdictLabel)}</span>
                            <span>Score: <b>${escapeHtml(pr.overallPlatformScore)}%</b></span>
                            <span>Grade: <b>${escapeHtml(pr.overallGrade)}</b></span>
                        </div>
                        <h3>Rule Groups (aggregate across all certified modules this session)</h3>
                        ${this.#renderRuleGroupBreakdown()}
                        <h3>Core Modules</h3>
                        <table class="cz-table"><thead><tr><th>Module</th><th>Verdict</th><th>Score</th><th>Staleness</th></tr></thead><tbody>
                        ${pr.coreModules.map(m => `<tr><td>${escapeHtml(m.name)}</td><td>${escapeHtml(m.verdict)}</td><td>${escapeHtml(m.score)}%</td><td>${escapeHtml(m.staleness)}</td></tr>`).join("")}
                        </tbody></table>
                        <div class="cz-row" style="margin-top:12px;">
                            <button class="cz-btn" data-action="export-current" data-format="html" data-target="full">Export HTML</button>
                            <button class="cz-btn" data-action="export-current" data-format="markdown" data-target="full">Export Markdown</button>
                            <button class="cz-btn" data-action="export-current" data-format="csv" data-target="full">Export CSV</button>
                            <button class="cz-btn" data-action="export-current" data-format="pdf" data-target="full">Export PDF</button>
                        </div>
                    </div>`;
            }
            return `<h1>Full Certification</h1><p class="cz-subtitle">Runs CozyCertification.fullCertification() — every enterprise rule against every discovered coordinator on window.CozyOS.</p>
                <button class="cz-btn cz-btn-primary" data-action="run-full-cert">Run Full Certification</button>
                ${body}`;
        }

        // A breakdown by rule group, built from listRules() (real rule
        // metadata) — not a duplicate scoring engine. If a Quick/Full result
        // is available it's used to show real pass/fail counts per group;
        // otherwise it just lists the groups and rule counts.
        #renderRuleGroupBreakdown() {
            const rules = this.#cert.listRules();
            const groups = {};
            for (const r of rules) {
                if (!groups[r.group]) groups[r.group] = { total: 0 };
                groups[r.group].total++;
            }
            const latestWithGroups = this.#lastResults.quick || this.#lastResults.application;
            const rows = Object.entries(groups).map(([group, info]) => {
                const stat = latestWithGroups && latestWithGroups.checksByGroup && latestWithGroups.checksByGroup[group];
                const passedCell = stat ? `${stat.passed}/${stat.total}` : "—";
                return `<tr><td>${escapeHtml(group)}</td><td>${info.total}</td><td>${passedCell}</td></tr>`;
            }).join("");
            return `<table class="cz-table"><thead><tr><th>Group</th><th>Rule Count</th><th>Last Result Passed/Total</th></tr></thead><tbody>${rows}</tbody></table>`;
        }

        async #runFullCertification() {
            const cancelToken = this.#showProgress("Running Full Platform Certification…", "This runs every discovered coordinator through the real engine — see the note below about why this single call can't be interrupted mid-scan.");
            await yieldToBrowser();
            if (cancelToken.cancelled) { this.#hideProgress(); return; }
            try {
                this.#updateProgress(50, "Certifying discovered coordinators…");
                await yieldToBrowser();
                const result = this.#cert.fullCertification();
                this.#lastResults.full = result;
                this.#lastResults.platform = result; // Platform Certification shares this call, per spec
                this.emit("fullCertification:completed", { verdict: result.platformReport.enterpriseVerdict, scorePercent: result.platformReport.overallPlatformScore });
                this.#updateProgress(100, "Done");
            } catch (err) {
                window.alert(`Full Certification failed: ${err.message}`);
            } finally {
                this.#hideProgress();
                this.#renderMain();
            }
        }

        // =====================================================================
        // ─── APPLICATION CERTIFICATION ────────────────────────────────────────
        // =====================================================================

        #renderApplicationCertification() {
            const apps = this.#cert.listApplications();
            const options = apps.map(a => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)}</option>`).join("");
            const result = this.#lastResults.application;
            let body = "";
            if (result) {
                body = `
                    <div class="cz-panel">
                        <div class="cz-row">
                            <span>Readiness: <b>${escapeHtml(result.matrix ? result.matrix.overallReadiness : 0)}%</b></span>
                            <span>Completion: <b>${escapeHtml(result.roadmap ? result.roadmap.completedPercent : 0)}%</b></span>
                            <span class="cz-badge ${result.matrix && result.matrix.deploymentStatus === "READY" ? "cz-badge-ready" : "cz-badge-warn"}">${escapeHtml(result.matrix ? result.matrix.deploymentStatus : "Unknown")}</span>
                        </div>
                        <h3>Modules Certified</h3>${this.#renderList(result.certifiedModules)}
                        <h3>Modules Missing</h3>${this.#renderList(result.missingModules)}
                        <h3>Warnings</h3>${this.#renderList(result.warnings)}
                    </div>`;
            }
            return `<h1>Application Certification</h1><p class="cz-subtitle">Applications come from CozyCertification's own registry (registerApplication) — nothing here is hardcoded.</p>
                ${apps.length === 0 ? this.#notConnected("No applications registered with CozyCertification yet.") : `
                <div class="cz-panel">
                    <div class="cz-field"><label>Select Application</label><select class="cz-input" id="cz-app-select">${options}</select></div>
                    <button class="cz-btn cz-btn-primary" data-action="run-app-cert">Run Application Certification</button>
                </div>`}
                ${body}`;
        }

        #renderList(items) {
            if (!items || items.length === 0) return '<div class="cz-empty">None.</div>';
            const itemsHtml = items.map((i) => `<li>${escapeHtml(i)}</li>`).join("");
            return `<ul>${itemsHtml}</ul>`;
        }

        async #runApplicationCertification() {
            const select = document.getElementById("cz-app-select");
            const applicationId = select ? select.value : null;
            if (!applicationId) return;
            const cancelToken = this.#showProgress("Running Application Certification…", applicationId);
            await yieldToBrowser();
            try {
                if (cancelToken.cancelled) return;
                let matrix = null, roadmap = null;
                try { matrix = this.#cert.getReadinessMatrix(applicationId); } catch (_err) { /* no certifications yet */ }
                try { roadmap = this.#cert.getRoadmap(applicationId); } catch (_err) { /* ignore */ }
                const certifiedModules = matrix ? matrix.modules.filter(m => m.verdict === "ENTERPRISE_CERTIFIED").map(m => m.moduleId) : [];
                const missingModules = matrix ? matrix.modules.filter(m => m.verdict === "NOT_CERTIFIED").map(m => m.moduleId) : [];
                const warnings = matrix ? matrix.modules.filter(m => m.verdict === "CERTIFIED_WITH_WARNINGS").map(m => `${m.moduleId} certified with warnings.`) : [];
                this.#rememberApplication(applicationId);
                this.#lastResults.application = { applicationId, matrix, roadmap, certifiedModules, missingModules, warnings };
                this.#updateProgress(100, "Done");
            } catch (err) {
                window.alert(`Application Certification failed: ${err.message}`);
            } finally {
                this.#hideProgress();
                this.#renderMain();
            }
        }

        // =====================================================================
        // ─── PLATFORM CERTIFICATION ───────────────────────────────────────────
        // Per spec this runs "Entire CozyOS Certification" — the same real
        // engine call as Full Certification (fullCertification()); there is
        // only one such method on the engine, so this view reuses it rather
        // than inventing a second, parallel platform-scoring mechanism.
        // =====================================================================

        #renderPlatformCertification() {
            const result = this.#lastResults.platform;
            let body = "";
            if (result) {
                const pr = result.platformReport;
                body = `
                    <div class="cz-panel">
                        <div class="cz-row">
                            <span class="cz-badge ${verdictBadgeClass(pr.enterpriseVerdict)}">${escapeHtml(pr.enterpriseVerdictLabel)}</span>
                            <span>Platform Score: <b>${escapeHtml(pr.overallPlatformScore)}%</b></span>
                            <span>Grade: <b>${escapeHtml(pr.overallGrade)}</b></span>
                        </div>
                        <div class="cz-grid" style="margin-top:12px;">
                            <div class="cz-card"><div class="cz-card-label">Applications</div><div class="cz-card-value">${pr.counts.applicationsTotal}</div></div>
                            <div class="cz-card"><div class="cz-card-label">Coordinators</div><div class="cz-card-value">${pr.counts.coreModulesTotal}</div></div>
                            <div class="cz-card"><div class="cz-card-label">Shells</div><div class="cz-card-value">${pr.counts.shellsTotal}</div></div>
                            <div class="cz-card"><div class="cz-card-label">Plugins</div><div class="cz-card-value">${pr.counts.pluginsTotal}</div></div>
                            <div class="cz-card"><div class="cz-card-label">Certified</div><div class="cz-card-value">${pr.counts.certified}</div></div>
                            <div class="cz-card"><div class="cz-card-label">Warnings</div><div class="cz-card-value">${pr.counts.warnings}</div></div>
                            <div class="cz-card"><div class="cz-card-label">Not Yet Certified</div><div class="cz-card-value">${pr.counts.notYetCertified}</div></div>
                        </div>
                        <h3>Workspace</h3>${this.#workspace ? `<p>Connected — v${escapeHtml(this.#workspace.getVersion())}</p>` : this.#notConnected("Workspace Shell not connected.")}
                        <h3>Service Registry</h3>${this.#registry ? `<p>Connected — v${escapeHtml(this.#registry.getVersion())}</p>` : this.#notConnected("Service Registry not connected.")}
                    </div>`;
            }
            return `<h1>Platform Certification</h1><p class="cz-subtitle">Runs the entire CozyOS certification (same engine call as Full Certification).</p>
                <button class="cz-btn cz-btn-primary" data-action="run-full-cert">Run Entire CozyOS Certification</button>
                ${body}`;
        }

        // =====================================================================
        // ─── UPGRADE VERIFICATION ─────────────────────────────────────────────
        // =====================================================================

        #renderUpgradeVerification() {
            const modules = Array.from(this.#knownModuleIds);
            const result = this.#lastResults.upgrade;
            let body = "";
            if (result) {
                const rec = result.upgradeStatus === "APPROVED" ? "Approved" : result.upgradeStatus === "APPROVED_WITH_WARNINGS" ? "Approved with Warnings" : "Rejected";
                body = `
                    <div class="cz-panel">
                        <div class="cz-row">
                            <span class="cz-badge ${verdictBadgeClass(result.upgradeStatus === "APPROVED" ? "ENTERPRISE_CERTIFIED" : result.upgradeStatus === "REJECTED" ? "CERTIFICATION_FAILED" : "CERTIFIED_WITH_WARNINGS")}">${escapeHtml(rec)}</span>
                            <span>v${escapeHtml(result.fromVersion)} → v${escapeHtml(result.toVersion)}</span>
                        </div>
                        <table class="cz-table"><tbody>
                            <tr><th>Backward Compatible</th><td>${result.checks.backwardCompatible ? "✓ Yes" : "✗ No"}</td></tr>
                            <tr><th>Regressions</th><td>${result.regressedRules.length ? result.regressedRules.join(", ") : "None"}</td></tr>
                            <tr><th>New Rules Now Failing</th><td>${result.regressedRules.length}</td></tr>
                            <tr><th>Improvements</th><td>${result.improvedRules.length ? result.improvedRules.join(", ") : "None"}</td></tr>
                            <tr><th>Major Version Bump</th><td>${result.majorVersionBump ? "Yes" : "No"}</td></tr>
                        </tbody></table>
                        <button class="cz-btn" data-action="export-current" data-format="markdown" data-target="upgrade">Export Upgrade Report</button>
                    </div>`;
            }
            return `<h1>Upgrade Verification</h1><p class="cz-subtitle">Compares two certifications of the same module via CozyCertification.verifyUpgrade().</p>
                ${modules.length === 0 ? this.#notConnected("No modules certified in this session yet — run Quick Certification on at least two versions first.") : `
                <div class="cz-panel">
                    <div class="cz-field"><label>Module</label>
                        <select class="cz-input" id="cz-upgrade-module">${modules.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("")}</select>
                    </div>
                    <div class="cz-row">
                        <div class="cz-field" style="flex:1"><label>Version A (from)</label><input class="cz-input" id="cz-upgrade-from" placeholder="leave blank for previous" /></div>
                        <div class="cz-field" style="flex:1"><label>Version B (to)</label><input class="cz-input" id="cz-upgrade-to" placeholder="leave blank for latest" /></div>
                    </div>
                    <button class="cz-btn cz-btn-primary" data-action="run-upgrade">Compare Versions</button>
                </div>`}
                ${body}`;
        }

        #runUpgradeVerification() {
            const moduleSel = document.getElementById("cz-upgrade-module");
            const fromEl = document.getElementById("cz-upgrade-from");
            const toEl = document.getElementById("cz-upgrade-to");
            const moduleId = moduleSel ? moduleSel.value : null;
            if (!moduleId) return;
            const options = {};
            if (fromEl && fromEl.value.trim()) options.fromVersion = fromEl.value.trim();
            if (toEl && toEl.value.trim()) options.toVersion = toEl.value.trim();
            try {
                this.#lastResults.upgrade = this.#cert.verifyUpgrade(moduleId, options);
            } catch (err) {
                window.alert(`Upgrade Verification failed: ${err.message}`);
                return;
            }
            this.#renderMain();
        }

        // =====================================================================
        // ─── PLATFORM UPGRADE VERIFICATION ────────────────────────────────────
        // =====================================================================

        #renderPlatformUpgrade() {
            const releases = this.#cert.listReleases();
            const result = this.#lastResults.platformUpgrade;
            let body = "";
            if (result) {
                const rec = result.releaseStatus === "APPROVED" ? "Approved" : result.releaseStatus === "APPROVED_WITH_WARNINGS" ? "Approved with Warnings" : "Rejected";
                const modulesChanged = result.moduleResults.filter(m => m.status !== "APPROVED" || (m.regressedRules && m.regressedRules.length)).length;
                const appsChanged = result.applications.filter(a => a.regressed || a.isNew || a.isRemoved).length;
                body = `
                    <div class="cz-panel">
                        <div class="cz-row">
                            <span class="cz-badge ${verdictBadgeClass(result.releaseStatus === "APPROVED" ? "ENTERPRISE_CERTIFIED" : result.releaseStatus === "REJECTED" ? "CERTIFICATION_FAILED" : "CERTIFIED_WITH_WARNINGS")}">${escapeHtml(rec)}</span>
                            <span>${escapeHtml(result.fromReleaseName)} → ${escapeHtml(result.toReleaseName)}</span>
                        </div>
                        <table class="cz-table"><tbody>
                            <tr><th>Applications Changed</th><td>${appsChanged}</td></tr>
                            <tr><th>Modules Changed</th><td>${modulesChanged}</td></tr>
                            <tr><th>Compatibility</th><td>${escapeHtml(result.compatibility)}</td></tr>
                            <tr><th>Deployment Ready</th><td>${result.applications.every(a => a.ready) ? "Yes" : "No"}</td></tr>
                            <tr><th>Platform Ready</th><td>${result.releaseStatus !== "REJECTED" ? "Yes" : "No"}</td></tr>
                            <tr><th>Rollback Available</th><td>${releases.length > 1 ? "Yes" : "No"}</td></tr>
                        </tbody></table>
                        <button class="cz-btn" data-action="export-current" data-format="markdown" data-target="platformUpgrade">Export Platform Upgrade Report</button>
                    </div>`;
            }
            return `<h1>Platform Upgrade Verification</h1><p class="cz-subtitle">Compares two locked releases via CozyCertification.verifyPlatformUpgrade().</p>
                ${releases.length < 2 ? this.#notConnected("You need at least two locked releases to compare — see Release Center.") : `
                <div class="cz-panel">
                    <div class="cz-row">
                        <div class="cz-field" style="flex:1"><label>Release A</label><select class="cz-input" id="cz-platform-upgrade-from">${releases.map(r => `<option value="${escapeHtml(r.releaseId)}">${escapeHtml(r.name)}</option>`).join("")}</select></div>
                        <div class="cz-field" style="flex:1"><label>Release B</label><select class="cz-input" id="cz-platform-upgrade-to">${releases.map(r => `<option value="${escapeHtml(r.releaseId)}">${escapeHtml(r.name)}</option>`).join("")}</select></div>
                    </div>
                    <button class="cz-btn cz-btn-primary" data-action="run-platform-upgrade">Compare Releases</button>
                </div>`}
                ${body}`;
        }

        #runPlatformUpgrade() {
            const fromEl = document.getElementById("cz-platform-upgrade-from");
            const toEl = document.getElementById("cz-platform-upgrade-to");
            if (!fromEl || !toEl) return;
            try {
                this.#lastResults.platformUpgrade = this.#cert.verifyPlatformUpgrade(fromEl.value, toEl.value);
            } catch (err) {
                window.alert(`Platform Upgrade Verification failed: ${err.message}`);
                return;
            }
            this.#renderMain();
        }

        // =====================================================================
        // ─── RELEASE CENTER ───────────────────────────────────────────────────
        // =====================================================================

        #renderReleaseCenter() {
            const releases = this.#cert.listReleases().slice().sort((a, b) => new Date(b.lockedAt) - new Date(a.lockedAt));
            const rows = releases.map(r => `
                <tr class="cz-row-clickable" data-action="select-release" data-id="${escapeHtml(r.releaseId)}">
                    <td>${escapeHtml(r.name)}${r.releaseId === this.#currentReleaseId ? ' <span class="cz-badge cz-badge-ready">CURRENT</span>' : ""}</td>
                    <td>${escapeHtml(r.status)}</td>
                    <td>${r.coreModules.ready}/${r.coreModules.total}</td>
                    <td>${r.applications.ready}/${r.applications.total}</td>
                    <td>${escapeHtml(r.lockedAt)}</td>
                </tr>`).join("");

            const detail = this.#selected && this.#selected.type === "release" ? this.#renderReleaseDetail(this.#selected.id) : "";

            return `<h1>Release Center</h1><p class="cz-subtitle">Backed entirely by CozyCertification.lockRelease() / listReleases() / verifyReleaseIntegrity().</p>
                <div class="cz-panel">
                    <h3>Lock a New Release</h3>
                    <div class="cz-field"><label>Release Name</label><input class="cz-input" id="cz-release-name" placeholder="e.g. CozyOS 2.0" /></div>
                    <div class="cz-field"><label>Module IDs (comma-separated)</label><input class="cz-input" id="cz-release-modules" placeholder="e.g. CozySpeech, CozyTranslate" /></div>
                    <div class="cz-field"><label>Application IDs (comma-separated)</label><input class="cz-input" id="cz-release-apps" placeholder="e.g. ChurchOS, QuarryOS" /></div>
                    <button class="cz-btn cz-btn-primary" data-action="lock-release">Lock Release</button>
                </div>
                <div class="cz-panel">
                    <h3>Release History</h3>
                    ${releases.length === 0 ? '<div class="cz-empty">No releases locked yet.</div>' : `
                    <table class="cz-table"><thead><tr><th>Name</th><th>Status</th><th>Modules</th><th>Applications</th><th>Locked At</th></tr></thead><tbody>${rows}</tbody></table>`}
                </div>
                ${detail}`;
        }

        #renderReleaseDetail(releaseId) {
            const release = this.#cert.getRelease(releaseId);
            if (!release) return "";
            let integrity = null;
            try { integrity = this.#cert.verifyReleaseIntegrity(releaseId); } catch (_err) { /* ignore */ }
            return `<div class="cz-panel">
                <h2>${escapeHtml(release.name)}</h2>
                <div class="cz-row">
                    <span class="cz-badge ${release.status === "LOCKED" ? "cz-badge-ready" : "cz-badge-warn"}">${escapeHtml(release.status)}</span>
                    ${integrity ? `<span>${integrity.anyDrift ? "⚠ Drift detected since lock" : "✓ Matches locked state"}</span>` : ""}
                </div>
                <div class="cz-row" style="margin-top:10px;">
                    <button class="cz-btn ${releaseId === this.#currentReleaseId ? "" : "cz-btn-primary"}" data-action="set-current-release" data-id="${escapeHtml(releaseId)}">${releaseId === this.#currentReleaseId ? "Current Release" : "Set as Current Release"}</button>
                    <button class="cz-btn" data-action="export-current" data-format="markdown" data-target="release" data-id="${escapeHtml(releaseId)}">Export Release Notes</button>
                </div>
                <h3>Modules</h3>
                <table class="cz-table"><thead><tr><th>Module</th><th>Version</th><th>Verdict</th><th>Score</th></tr></thead><tbody>
                ${release.coreModules.modules.map(m => `<tr><td>${escapeHtml(m.moduleId)}</td><td>${escapeHtml(m.version)}</td><td>${escapeHtml(m.verdict)}</td><td>${escapeHtml(m.score)}%</td></tr>`).join("")}
                </tbody></table>
                <h3>Applications</h3>
                <table class="cz-table"><thead><tr><th>Application</th><th>Readiness</th><th>Deployment</th></tr></thead><tbody>
                ${release.applications.applications.map(a => `<tr><td>${escapeHtml(a.applicationId)}</td><td>${escapeHtml(a.overallReadiness)}%</td><td>${escapeHtml(a.deploymentStatus)}</td></tr>`).join("")}
                </tbody></table>
            </div>`;
        }

        #lockRelease() {
            const nameEl = document.getElementById("cz-release-name");
            const modulesEl = document.getElementById("cz-release-modules");
            const appsEl = document.getElementById("cz-release-apps");
            const name = nameEl ? nameEl.value.trim() : "";
            const moduleIds = modulesEl ? modulesEl.value.split(",").map(s => s.trim()).filter(Boolean) : [];
            const applicationIds = appsEl ? appsEl.value.split(",").map(s => s.trim()).filter(Boolean) : [];
            try {
                const release = this.#cert.lockRelease({ name: name || undefined, moduleIds, applicationIds });
                this.#selected = { type: "release", id: release.releaseId };
                this.emit("release:locked", { releaseId: release.releaseId, status: release.status });
            } catch (err) {
                window.alert(`Lock Release failed: ${err.message}`);
                return;
            }
            this.#renderMain();
        }

        // =====================================================================
        // ─── REPORTS ──────────────────────────────────────────────────────────
        // =====================================================================

        #renderReports() {
            const availableKeys = Object.keys(this.#lastResults).filter(k => this.#lastResults[k]);
            const options = availableKeys.map(k => `<option value="${escapeHtml(k)}">${escapeHtml(this.#reportLabel(k))}</option>`).join("");
            return `<h1>Reports</h1><p class="cz-subtitle">Download any certification result you've generated in this session. Reports include the executive summary, score dashboard, priority queue, defects, regression, architecture diagram, and enterprise certificate — all sourced directly from CozyCertification's own export methods.</p>
                ${availableKeys.length === 0 ? this.#notConnected("Run a certification first (Quick, Full, Application, Upgrade, or Platform Upgrade) to generate a report here.") : `
                <div class="cz-panel">
                    <div class="cz-field"><label>Report</label><select class="cz-input" id="cz-report-select">${options}</select></div>
                    <div class="cz-row">
                        <button class="cz-btn" data-action="export-report" data-format="pdf">PDF</button>
                        <button class="cz-btn" data-action="export-report" data-format="html">HTML</button>
                        <button class="cz-btn" data-action="export-report" data-format="markdown">Markdown</button>
                        <button class="cz-btn" data-action="export-report" data-format="csv">CSV</button>
                        <button class="cz-btn" data-action="export-report" data-format="json">JSON</button>
                        <button class="cz-btn" data-action="export-report" data-format="text">TXT</button>
                    </div>
                </div>`}`;
        }

        #reportLabel(key) {
            return { quick: "Quick Certification Report", full: "Full Certification Report", platform: "Platform Report", application: "Application Report", upgrade: "Upgrade Report", platformUpgrade: "Platform Upgrade Report", release: "Release Report" }[key] || key;
        }

        // =====================================================================
        // ─── HISTORY ──────────────────────────────────────────────────────────
        // =====================================================================

        #renderHistory() {
            const moduleId = this.#selected && this.#selected.type === "history-module" ? this.#selected.id : (Array.from(this.#knownModuleIds)[0] || null);
            const modules = Array.from(this.#knownModuleIds);
            let historyRows = "";
            if (moduleId) {
                const history = this.#cert.listRecords(moduleId).slice().reverse();
                historyRows = history.map((r) => {
                    const regressionCell = r.regression ? `<td>\u0394 ${escapeHtml(r.regression.scoreDelta)}%</td>` : "<td>—</td>";
                    return `<tr><td>${escapeHtml(r.certificationId)}</td><td>${escapeHtml(r.version)}</td><td>${escapeHtml(r.verdict)}</td><td>${escapeHtml(r.summary.scorePercent)}%</td><td>${escapeHtml(r.timestamp)}</td>${regressionCell}</tr>`;
                }).join("");
            }
            const moduleOptions = modules.map((m) => `<option value="${escapeHtml(m)}" ${m === moduleId ? "selected" : ""}>${escapeHtml(m)}</option>`).join("");
            const releases = this.#cert.listReleases();
            const releaseItems = releases.map((r) => `<li>${escapeHtml(r.name)} — ${escapeHtml(r.status)} (${escapeHtml(r.lockedAt)})</li>`).join("");
            const releaseHistoryHtml = releases.length === 0 ? '<div class="cz-empty">None.</div>' : `<ul>${releaseItems}</ul>`;
            const moduleSectionHtml = modules.length === 0 ? this.#notConnected("No modules certified in this session yet.") : `
                <div class="cz-panel">
                    <div class="cz-field"><label>Module</label>
                        <select class="cz-input" id="cz-history-module" data-action-onchange="select-history-module">${moduleOptions}</select>
                    </div>
                    <table class="cz-table"><thead><tr><th>Certification ID</th><th>Version</th><th>Verdict</th><th>Score</th><th>Date</th><th>Regression</th></tr></thead><tbody>${historyRows}</tbody></table>
                </div>`;

            return `<h1>History</h1><p class="cz-subtitle">Certification, upgrade, platform, and release history — all read from CozyCertification's own append-only records.</p>
                ${moduleSectionHtml}
                <div class="cz-panel"><h3>Release History</h3>${releaseHistoryHtml}</div>`;
        }

        // =====================================================================
        // ─── MODULE EXPLORER ──────────────────────────────────────────────────
        // Searches modules this dashboard session actually knows about (via
        // certification calls made here) plus, if a Workspace Shell is
        // connected, its own live-discovered coordinator list — a strictly
        // more complete picture when available. No modules are invented.
        // =====================================================================

        #renderModuleExplorer() {
            let moduleIds = Array.from(this.#knownModuleIds);
            if (this.#workspace && typeof this.#workspace.getModuleManagerData === "function") {
                const discovered = this.#workspace.getModuleManagerData().modules.filter(m => m.discovered).map(m => m.name);
                moduleIds = Array.from(new Set([...moduleIds, ...discovered]));
            }
            const needle = this.#searchTerm.toLowerCase().trim();
            const filtered = needle ? moduleIds.filter(m => m.toLowerCase().includes(needle)) : moduleIds;

            const rows = filtered.map((moduleId) => {
                const summary = this.#cert.getWorkspaceSummary(moduleId);
                let deps = [];
                try { deps = this.#cert.getDependencyImpact(moduleId).usedBy.map(u => u.applicationId); } catch (_err) { /* ignore */ }
                return `<tr class="cz-row-clickable" data-action="select-module" data-id="${escapeHtml(moduleId)}">
                    <td>${escapeHtml(moduleId)}</td><td>${escapeHtml(summary.version || "—")}</td>
                    <td><span class="cz-badge ${verdictBadgeClass(summary.certification)}">${escapeHtml(summary.certification)}</span></td>
                    <td>${escapeHtml(summary.score ?? "—")}%</td><td>${deps.length ? escapeHtml(deps.join(", ")) : "None"}</td>
                    <td>${escapeHtml(summary.auditDate || "—")}</td></tr>`;
            }).join("");

            const detail = this.#selected && this.#selected.type === "select-module" ? this.#renderModuleDetail(this.#selected.id) : "";

            return `<h1>Module Explorer</h1><p class="cz-subtitle">Search by module name. ${moduleIds.length} module(s) known to this session${this.#workspace ? " + Workspace Shell discovery" : ""}.</p>
                ${moduleIds.length === 0 ? this.#notConnected("No modules known yet — certify one via Quick Certification, or connect a Workspace Shell for live discovery.") : `
                <table class="cz-table"><thead><tr><th>Module</th><th>Version</th><th>Verdict</th><th>Score</th><th>Dependencies</th><th>Certification Date</th></tr></thead><tbody>${rows}</tbody></table>`}
                ${detail}`;
        }

        #renderModuleDetail(moduleId) {
            const history = this.#cert.listRecords(moduleId);
            const latest = history.length ? history[history.length - 1] : null;
            if (!latest) return this.#notConnected(`No certification history for "${moduleId}".`);
            return `<div class="cz-panel"><h2>${escapeHtml(moduleId)}</h2>${this.#renderCertificationResult(latest)}</div>`;
        }

        // =====================================================================
        // ─── APPLICATION EXPLORER ─────────────────────────────────────────────
        // =====================================================================

        #renderApplicationExplorer() {
            const apps = this.#cert.listApplications();
            const needle = this.#searchTerm.toLowerCase().trim();
            const filtered = needle ? apps.filter(a => a.name.toLowerCase().includes(needle) || a.id.toLowerCase().includes(needle)) : apps;

            const rows = filtered.map((app) => {
                let matrix = null, roadmap = null;
                try { matrix = this.#cert.getReadinessMatrix(app.id); } catch (_err) { /* ignore */ }
                try { roadmap = this.#cert.getRoadmap(app.id); } catch (_err) { /* ignore */ }
                return `<tr><td>${escapeHtml(app.name)}</td><td>${matrix ? escapeHtml(matrix.overallReadiness) + "%" : "—"}</td>
                    <td>${matrix ? escapeHtml(matrix.deploymentStatus) : "Not certified"}</td>
                    <td>${roadmap ? escapeHtml(roadmap.completedPercent) + "%" : "—"}</td>
                    <td>Not connected — no CozySubscription/CozyLicense</td></tr>`;
            }).join("");

            return `<h1>Application Explorer</h1><p class="cz-subtitle">Every application registered with CozyCertification.registerApplication().</p>
                ${apps.length === 0 ? this.#notConnected("No applications registered yet.") : `
                <table class="cz-table"><thead><tr><th>Application</th><th>Health</th><th>Certification</th><th>Completion</th><th>Subscription</th></tr></thead><tbody>${rows}</tbody></table>`}`;
        }

        // =====================================================================
        // ─── WORKSPACE / SERVICE REGISTRY SECTIONS ────────────────────────────
        // Both are strictly generic reads of an optional coordinator — the
        // dashboard never assumes either is present, and shows exactly what
        // each one reports if it is.
        // =====================================================================

        #renderWorkspaceSection() {
            if (!this.#workspace) return `<h1>Workspace</h1>${this.#notConnected("Workspace Shell not connected. If this dashboard is embedded in a page that already loaded cozy-workspace.js, this section activates automatically.")}`;
            const bar = typeof this.#workspace.getGlobalStatusBar === "function" ? this.#workspace.getGlobalStatusBar() : null;
            return `<h1>Workspace</h1>
                ${bar ? this.#renderKeyValueTable({
                    "Workspace Connected": "Yes", "Registered Applications": bar.applicationsInstalled,
                    "Registered Coordinators": bar.coordinatorsLoaded, "Running Version": bar.workspaceVersion,
                    "Loaded Modules": bar.coordinatorsLoaded, "Health": `${bar.applicationsRunning} application(s) running`
                }) : this.#notConnected("Workspace Shell connected but getGlobalStatusBar() unavailable.")}`;
        }

        #renderServiceRegistrySection() {
            if (!this.#registry) return `<h1>Service Registry</h1>${this.#notConnected("Service Registry not connected. If this dashboard is embedded in a page that already loaded cozy-registry.js, this section activates automatically.")}`;
            const coordinators = this.#registry.listCoordinators();
            const applications = this.#registry.listApplications();
            return `<h1>Service Registry</h1>
                ${this.#renderKeyValueTable({ "Registered Coordinators": coordinators.length, "Registered Applications": applications.length, "Status": "Connected", "Version": this.#registry.getVersion() })}
                <h3>Coordinators</h3>${this.#renderList(coordinators.map(c => `${c.name} (${c.category})`))}
                <h3>Applications</h3>${this.#renderList(applications.map(a => `${a.name} — ${a.category}`))}`;
        }

        #renderKeyValueTable(obj) {
            const rows = Object.entries(obj).map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`).join("");
            return `<table class="cz-table"><tbody>${rows}</tbody></table>`;
        }

        // =====================================================================
        // ─── DIAGNOSTICS ──────────────────────────────────────────────────────
        // =====================================================================

        getDiagnosticsReport() {
            return {
                dashboardVersion: DASHBOARD_VERSION,
                knownModules: this.#knownModuleIds.size,
                knownApplications: this.#knownApplicationIds.size,
                recentActionsLogged: this.#recentActions.length,
                listenerEventTypes: this.#listeners.size,
                activeSection: this.#activeSection
            };
        }

        #renderDiagnostics() {
            const engineDiag = this.#cert.getDiagnosticsReport();
            const start = performance && performance.now ? performance.now() : Date.now();
            let executionTimeMs = null;
            try { this.#cert.listRules(); executionTimeMs = (performance && performance.now ? performance.now() : Date.now()) - start; } catch (_err) { /* ignore */ }
            const dashDiag = this.getDiagnosticsReport();
            return `<h1>Diagnostics</h1>
                <h3>Certification Engine</h3>${this.#renderKeyValueTable(engineDiag)}
                <h3>Workspace</h3>${this.#workspace && typeof this.#workspace.getDiagnosticsReport === "function" ? this.#renderKeyValueTable(this.#workspace.getDiagnosticsReport()) : this.#notConnected("Workspace Shell not connected.")}
                <h3>Service Registry</h3>${this.#registry ? this.#renderKeyValueTable(this.#registry.getDiagnosticsReport()) : this.#notConnected("Service Registry not connected.")}
                <h3>Dashboard</h3>${this.#renderKeyValueTable({
                    ...dashDiag,
                    "Memory Usage": (performance && performance.memory) ? `${Math.round(performance.memory.usedJSHeapSize / 1048576)} MB` : "Unknown — performance.memory unavailable in this browser",
                    "Execution Time (listRules sample)": executionTimeMs !== null ? `${executionTimeMs.toFixed(2)} ms` : "Unknown"
                })}`;
        }

        // =====================================================================
        // ─── SETTINGS ─────────────────────────────────────────────────────────
        // =====================================================================

        #renderSettings() {
            const s = this.#settings;
            return `<h1>Settings</h1><p class="cz-subtitle">Stored locally in this browser — these are dashboard preferences only, not certification configuration.</p>
                <div class="cz-panel">
                    <div class="cz-field"><label>Theme</label>
                        <select class="cz-input" data-setting="theme"><option value="light" ${s.theme === "light" ? "selected" : ""}>Light</option><option value="dark" ${s.theme === "dark" ? "selected" : ""}>Dark</option></select></div>
                    <div class="cz-field"><label>Language</label><input class="cz-input" data-setting="language" value="${escapeHtml(s.language)}" /></div>
                    <div class="cz-field"><label>Export Folder (label only — browsers choose the actual download location)</label><input class="cz-input" data-setting="exportFolder" value="${escapeHtml(s.exportFolder)}" /></div>
                    <div class="cz-checklist">
                        <label><input type="checkbox" data-setting="autoSave" ${s.autoSave ? "checked" : ""} /> Auto Save session state</label>
                        <label><input type="checkbox" data-setting="autoCertification" ${s.autoCertification ? "checked" : ""} /> Auto Certification on file upload</label>
                        <label><input type="checkbox" data-setting="developerMode" ${s.developerMode ? "checked" : ""} /> Developer Mode (show raw JSON alongside every result)</label>
                    </div>
                </div>`;
        }

        // =====================================================================
        // ─── ACTION DISPATCH ──────────────────────────────────────────────────
        // =====================================================================

        #dispatchAction(action, el) {
            switch (action) {
                case "goto": this.#setSection(el.getAttribute("data-goto")); break;
                case "run-quick-cert": this.#runQuickCertification(); break;
                case "run-full-cert": this.#runFullCertification(); break;
                case "run-app-cert": this.#runApplicationCertification(); break;
                case "run-upgrade": this.#runUpgradeVerification(); break;
                case "run-platform-upgrade": this.#runPlatformUpgrade(); break;
                case "lock-release": this.#lockRelease(); break;
                case "select-release": this.#setSection("release", { type: "release", id: el.getAttribute("data-id") }); break;
                case "set-current-release": this.#currentReleaseId = el.getAttribute("data-id"); this.#persist(); this.#renderMain(); break;
                case "select-module": this.#setSection("moduleExplorer", { type: "select-module", id: el.getAttribute("data-id") }); break;
                case "export-current": this.#exportCurrent(el.getAttribute("data-format"), el.getAttribute("data-target"), el.getAttribute("data-id")); break;
                case "export-report": this.#exportSelectedReport(el.getAttribute("data-format")); break;
                default: break;
            }
        }

        // =====================================================================
        // ─── EXPORT / DOWNLOAD ────────────────────────────────────────────────
        // Every format here comes from a real CozyCertification export method
        // except PDF, which is produced client-side (via jsPDF, loaded in
        // certification.html) from the same plain-text report the engine
        // already generates — no separate report content is invented for PDF.
        // =====================================================================

        #resultFor(target) {
            if (target === "release" && this.#selected && this.#selected.type === "release") {
                return { kind: "release", releaseId: this.#selected.id };
            }
            const key = target || this.#activeSection;
            const result = this.#lastResults[key];
            if (!result) return null;
            if (key === "full" || key === "platform") return { kind: "full", result };
            if (key === "upgrade") return { kind: "upgrade", result };
            if (key === "platformUpgrade") return { kind: "platformUpgrade", result };
            return { kind: "module", result };
        }

        #exportAs(kind, payload, format, filenameBase) {
            const cert = this.#cert;
            let content, mimeType, extension;
            if (kind === "module") {
                content = cert.exportReport(payload, format === "pdf" ? "html" : format);
            } else if (kind === "full") {
                content = cert.exportPlatformReport(payload, format === "pdf" ? "text" : format);
            } else if (kind === "upgrade") {
                content = cert.exportUpgradeVerification(payload, format === "pdf" ? "text" : format);
            } else if (kind === "platformUpgrade") {
                content = cert.exportPlatformUpgradeVerification(payload, format === "pdf" ? "text" : format);
            } else if (kind === "release") {
                content = cert.exportRelease(payload, format === "pdf" ? "text" : format);
            } else {
                return;
            }

            if (format === "pdf") {
                const pdfBlob = textToPdfBlob(`CozyOS Certification Report — ${filenameBase}`, kind === "module" ? this.#stripHtml(content) : content);
                if (pdfBlob) { downloadBlob(`${filenameBase}.pdf`, pdfBlob, "application/pdf"); return; }
                // jsPDF unavailable (e.g. offline, CDN unreachable) — fall back
                // to opening the real HTML report as a Blob URL so the
                // browser's own Print -> Save as PDF can produce one, instead
                // of failing silently. Deliberately avoids the raw HTML-sink
                // pattern some scanners flag (writing markup into an open
                // document reference): a
                // Blob URL navigation renders the same content without ever
                // injecting into an existing document.
                const htmlContent = kind === "module" ? cert.exportReport(payload, "html") : content;
                const blob = new Blob([htmlContent], { type: "text/html" });
                const blobUrl = URL.createObjectURL(blob);
                const win = window.open(blobUrl, "_blank");
                if (win && typeof win.print === "function") {
                    win.addEventListener ? win.addEventListener("load", () => win.print()) : setTimeout(() => win.print(), 300);
                }
                if (!win) window.alert("PDF library unavailable and popup blocked — could not export.");
                setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
                return;
            }

            const mimeMap = { json: "application/json", csv: "text/csv", html: "text/html", markdown: "text/markdown", text: "text/plain" };
            const extMap = { json: "json", csv: "csv", html: "html", markdown: "md", text: "txt" };
            downloadBlob(`${filenameBase}.${extMap[format] || "txt"}`, content, mimeMap[format] || "text/plain");
            this.emit("report:exported", { filenameBase, format });
        }

        #stripHtml(html) {
            const div = document.createElement("div");
            div.innerHTML = html;
            return div.textContent || div.innerText || "";
        }

        #exportCurrent(format, target, explicitId) {
            if (target === "release") {
                const releaseId = explicitId || (this.#selected && this.#selected.id);
                if (!releaseId) return;
                this.#exportAs("release", releaseId, format, releaseId);
                return;
            }
            const resolved = this.#resultFor(target);
            if (!resolved) { window.alert("Nothing to export yet — run a certification first."); return; }
            if (resolved.kind === "release") { this.#exportAs("release", resolved.releaseId, format, resolved.releaseId); return; }
            const filenameBase = (resolved.result.moduleId || resolved.result.applicationId || resolved.result.fromReleaseId || target || "cozyos-report");
            this.#exportAs(resolved.kind, resolved.result, format, filenameBase);
        }

        #exportSelectedReport(format) {
            const select = document.getElementById("cz-report-select");
            if (!select) return;
            this.#exportCurrent(format, select.value);
        }
    }

    window.addEventListener("DOMContentLoaded", () => {
        // Version-conflict guard: if this script somehow loads twice (e.g. a
        // duplicate <script> tag), don't silently double-initialize — that
        // would double every event listener bound in mount(). A same-version
        // reload is a safe no-op; a different version throws, same pattern
        // used across every CozyOS coordinator.
        if (window.CozyCertificationDashboard && typeof window.CozyCertificationDashboard.getVersion === "function") {
            const existingVersion = window.CozyCertificationDashboard.getVersion();
            if (existingVersion !== DASHBOARD_VERSION) {
                throw new Error(`[CozyOS Framework Execution Error] VERSION_CONFLICT: CertificationDashboard existing v${existingVersion} conflicts with load target v${DASHBOARD_VERSION}.`);
            }
            return;
        }
        const root = document.getElementById("cozy-cert-dashboard-root");
        if (!root) return;
        const app = new CertificationDashboard();
        app.mount(root);
        window.CozyCertificationDashboard = app; // exposed for console/debugging use, and for external pages to subscribe via on()/off()
    });
})();
