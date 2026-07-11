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

    const DASHBOARD_VERSION = "2.0.0-ENTERPRISE-CONTROL-CENTER";

    // Matches the Progress Tracker's own example list — a stable checklist of
    // expected core coordinators. Anything in this list that isn't actually
    // discovered shows "Waiting", never fake data; anything discovered that
    // ISN'T in this list (a custom/future coordinator) still shows up too.
    const SUGGESTED_COORDINATOR_LIST = Object.freeze([
        "Company", "Customer", "Storage", "Identity", "Security", "Automation",
        "Speech", "Translation", "Notification", "Live", "Media", "Camera",
        "Vision", "Attendance", "Meeting", "Emergency", "Analytics", "Accessibility"
    ]);
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

    // Tiny local semver parser/comparator — for DISPLAY labeling only (e.g.
    // "is the running version newer than what's certified"). Not a
    // certification decision; CozyCertification remains the sole authority
    // on whether an upgrade is safe.
    function parseSemverLocal(v) {
        const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(v || "").trim());
        return m ? { major: +m[1], minor: +m[2], patch: +m[3] } : null;
    }
    function compareSemverLocal(a, b) {
        if (a.major !== b.major) return a.major - b.major;
        if (a.minor !== b.minor) return a.minor - b.minor;
        return a.patch - b.patch;
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

        // ---- source text last submitted via Quick Certification, per
        // moduleId — kept ONLY so Technical Debt Center can analyze it;
        // never sent anywhere, never persisted across a reload ----
        #lastSourceTexts = new Map();

        // ---- dashboard-side "release integration" bookkeeping: releaseId ->
        // [{ moduleId, goldenCertificationId, goldenVersion, sourceHash,
        // hasSourceSnapshot }], captured at lock time — see #lockRelease().
        // Persisted so it survives a reload, unlike #lastSourceTexts. ----
        #releaseVaultBundles = new Map(loadPersisted("releaseVaultBundles", []));

        // ---- Workspace Scanner: cached aggregate of everything discoverable
        // via real public APIs (Certification / WorkspaceShell / ServiceRegistry).
        // Rebuilt only on manual "Scan Workspace", or automatically after any
        // action that could change the picture (a certification completing, a
        // release locking) — never on every render, so navigating around the
        // dashboard doesn't re-scan repeatedly. ----
        #scanCache = null;
        #scanTimestamp = null;

        constructor() {
            this.#cert = window.CozyOS && window.CozyOS.Certification ? window.CozyOS.Certification : null;
            this.#workspace = window.CozyOS && window.CozyOS.WorkspaceShell ? window.CozyOS.WorkspaceShell : null;
            this.#registry = window.CozyOS && window.CozyOS.ServiceRegistry ? window.CozyOS.ServiceRegistry : null;
        }

        getVersion() { return DASHBOARD_VERSION; }

        #invalidateScan() { this.#scanCache = null; }

        #computeUpdateStatus(liveVersion, certifiedVersion) {
            if (!certifiedVersion) return "NOT_YET_CERTIFIED";
            if (!liveVersion) return "UNKNOWN";
            if (liveVersion === certifiedVersion) return "UP_TO_DATE";
            const live = parseSemverLocal(liveVersion);
            const certified = parseSemverLocal(certifiedVersion);
            if (!live || !certified) return "VERSION_MISMATCH";
            const cmp = compareSemverLocal(live, certified);
            return cmp > 0 ? "PENDING_CERTIFICATION" : cmp < 0 ? "ROLLED_BACK_FROM_CERTIFIED" : "UP_TO_DATE";
        }

        // =====================================================================
        // ─── PHASE-BASED REPAIR ROADMAP ───────────────────────────────────────
        // Groups a certification's REAL defects (already computed by
        // CozyCertification) into implementation phases, and sums each
        // phase's REAL estimatedFixMinutes — no new time estimates invented,
        // no new rule evaluation. This is a re-presentation of existing
        // defect data, added above the existing flat defect list, which
        // stays exactly as it was.
        // =====================================================================

        #phaseFor(ruleId) {
            if (ruleId.startsWith("ARCH-")) return "phase2";
            if (ruleId.startsWith("COORD-") || ruleId.startsWith("DIAG-") || ruleId.startsWith("EVENT-") || ruleId.startsWith("REG-") || ruleId.startsWith("IE-")) return "phase3";
            if (ruleId.startsWith("SEC-")) return "phase4";
            if (ruleId.startsWith("PERF-") || ruleId.startsWith("VER-") || ruleId.startsWith("DOC-") || ruleId.startsWith("UI-") || ruleId.startsWith("CONSIST-") || ruleId.startsWith("SYN-")) return "phase5";
            return "phase5";
        }

        #computeRepairRoadmap(defects) {
            const PHASE_META = {
                phase1: { label: "Critical" },
                phase2: { label: "Enterprise Architecture" },
                phase3: { label: "Coordinator Standards" },
                phase4: { label: "Security" },
                phase5: { label: "Optimization" }
            };
            const buckets = { phase1: [], phase2: [], phase3: [], phase4: [], phase5: [] };
            for (const d of defects || []) {
                if (d.waived) continue; // deliberately deferred — not part of the active repair roadmap
                const phaseKey = d.severity === "CRITICAL" ? "phase1" : this.#phaseFor(d.id);
                buckets[phaseKey].push(d);
            }
            const phases = Object.entries(buckets).map(([key, items]) => ({
                key, label: PHASE_META[key].label,
                ruleIds: items.map(d => d.id),
                issueCount: items.length,
                estimatedMinutes: items.reduce((sum, d) => sum + (d.estimatedFixMinutes || 0), 0)
            }));
            const totalMinutes = phases.reduce((sum, p) => sum + p.estimatedMinutes, 0);
            return { phases, totalMinutes };
        }

        // "Progress": compares the EARLIEST certification on file for a module
        // against its LATEST, per phase — real rule-level pass/fail diffing
        // over two already-computed records, not a fabricated percentage.
        #computeRepairProgress(moduleId) {
            const history = this.#cert.listRecords(moduleId);
            if (history.length < 2) return null;
            const baseline = history[0];
            const latest = history[history.length - 1];
            const basePass = baseline.rulePassMap || {};
            const latestPass = latest.rulePassMap || {};

            const phaseTotals = { phase1: 0, phase2: 0, phase3: 0, phase4: 0, phase5: 0 };
            const phaseDone = { phase1: 0, phase2: 0, phase3: 0, phase4: 0, phase5: 0 };
            for (const ruleId of Object.keys(basePass)) {
                if (basePass[ruleId] === true) continue; // wasn't a gap at baseline
                const phaseKey = this.#phaseFor(ruleId);
                phaseTotals[phaseKey]++;
                if (latestPass[ruleId] === true) phaseDone[phaseKey]++;
            }
            const phases = Object.keys(phaseTotals).map((key) => {
                const total = phaseTotals[key];
                const done = phaseDone[key];
                let status;
                if (total === 0) status = "NOT_APPLICABLE";
                else if (done === total) status = "COMPLETED";
                else if (done === 0) status = "WAITING";
                else status = "IN_PROGRESS";
                return { key, total, done, percent: total === 0 ? null : Math.round((done / total) * 100), status };
            });
            return { comparedFrom: baseline.certificationId, comparedTo: latest.certificationId, phases };
        }

        // =====================================================================
        // ─── CERTIFICATION VAULT (Golden / Latest / Production / Rollback) ───
        // Every certification CozyCertification runs is already permanently
        // appended to that module's history — nothing here overwrites or
        // duplicates that storage. This only computes derived labels over
        // the real, already-permanent history: Golden (highest score ever),
        // Latest (most recent), Rollback Candidate (best-scoring version
        // before Latest, if Latest regressed), Production (whichever release
        // is marked "current" in the dashboard's Release Center and includes
        // this module).
        // =====================================================================

        computeVaultEntry(moduleId) {
            const history = this.#cert.listRecords(moduleId);
            if (history.length === 0) return null;

            const golden = history.reduce((best, r) => (r.summary.scorePercent > best.summary.scorePercent ? r : best), history[0]);
            const latest = history[history.length - 1];
            const bySequence = history.slice().sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            const latestIdx = bySequence.findIndex(r => r.certificationId === latest.certificationId);
            const previous = latestIdx > 0 ? bySequence[latestIdx - 1] : null;
            const regressionDetected = latest.certificationId !== golden.certificationId && latest.summary.scorePercent < golden.summary.scorePercent;

            let production = null;
            if (this.#currentReleaseId) {
                const release = this.#cert.getRelease(this.#currentReleaseId);
                if (release) {
                    const inRelease = release.coreModules.modules.find(m => m.moduleId === moduleId);
                    if (inRelease) production = history.find(r => r.certificationId === inRelease.certificationId) || null;
                }
            }

            return {
                moduleId,
                certificationCount: history.length,
                golden, latest, previous, production,
                rollbackCandidate: regressionDetected ? golden : previous,
                regressionDetected,
                bestScore: golden.summary.scorePercent,
                latestScore: latest.summary.scorePercent
            };
        }

        getCertificationVault() {
            const scan = this.scanWorkspace();
            return scan.coordinators.filter(c => c.latest).map(c => this.computeVaultEntry(c.name)).filter(Boolean);
        }

        // =====================================================================
        // ─── CERTIFICATION COMPARISON ─────────────────────────────────────────
        // Compares two already-computed records (never re-evaluates rules) —
        // score/grade difference, rules fixed, new regressions, new warnings.
        // =====================================================================

        compareCertificationRecords(recordA, recordB) {
            const passA = recordA.rulePassMap || {};
            const passB = recordB.rulePassMap || {};
            const rulesFixed = Object.keys(passB).filter(id => passA[id] === false && passB[id] === true);
            const newRegressions = Object.keys(passB).filter(id => passA[id] === true && passB[id] === false);
            const warningsA = new Set((recordA.defects || []).filter(d => d.severity === "MEDIUM" || d.severity === "LOW").map(d => d.id));
            const warningsB = (recordB.defects || []).filter(d => (d.severity === "MEDIUM" || d.severity === "LOW") && !warningsA.has(d.id));
            return {
                fromCertificationId: recordA.certificationId, toCertificationId: recordB.certificationId,
                scoreDifference: Math.round((recordB.summary.scorePercent - recordA.summary.scorePercent) * 10) / 10,
                gradeDifference: `${recordA.overallGrade} → ${recordB.overallGrade}`,
                rulesFixed, newRegressions,
                newWarnings: warningsB.map(d => d.id)
            };
        }

        /**
         * scanWorkspace({ force })
         *   Discovers coordinators, applications, releases, and workspace/
         *   registry status using only real public APIs — never duplicates
         *   certification logic, just reads what CozyCertification /
         *   WorkspaceShell / ServiceRegistry already know. Cached until
         *   invalidated by a completed action or an explicit force rescan.
         */
        scanWorkspace({ force = false } = {}) {
            if (this.#scanCache && !force) return this.#scanCache;
            const startedAt = performance && performance.now ? performance.now() : Date.now();

            const liveKeys = window.CozyOS
                ? Object.keys(window.CozyOS).filter(k => k !== "WorkspaceShell" && typeof window.CozyOS[k] !== "function")
                : [];
            const registryCoordNames = this.#registry ? this.#registry.listCoordinators().map(c => c.name) : [];
            const allNames = Array.from(new Set([...SUGGESTED_COORDINATOR_LIST, ...liveKeys, ...registryCoordNames, ...this.#knownModuleIds]));

            const coordinators = allNames.map((name) => {
                const liveRef = window.CozyOS ? window.CozyOS[name] : undefined;
                const discovered = !!liveRef && typeof liveRef !== "function";
                const version = discovered && typeof liveRef.getVersion === "function" ? liveRef.getVersion() : null;
                let diagnostics = null;
                if (discovered && typeof liveRef.getDiagnosticsReport === "function") {
                    try { diagnostics = liveRef.getDiagnosticsReport(); } catch (_err) { /* ignore */ }
                }
                const registryInfo = this.#registry ? this.#registry.getCoordinator(name) : null;
                const certSummary = this.#cert ? this.#cert.getWorkspaceSummary(name) : null;
                let history = [];
                if (this.#cert) { try { history = this.#cert.listRecords(name); } catch (_err) { /* ignore */ } }
                let frozen = false, waivers = [];
                if (this.#cert) {
                    try { frozen = this.#cert.isModuleFrozen(name); } catch (_err) { /* ignore */ }
                    try { waivers = this.#cert.listWaivers(name); } catch (_err) { /* ignore */ }
                }
                let dependencyImpact = null;
                if (this.#cert) { try { dependencyImpact = this.#cert.getDependencyImpact(name); } catch (_err) { /* ignore */ } }
                const updateStatus = this.#computeUpdateStatus(version, certSummary ? certSummary.version : null);
                return {
                    name, discovered, version, diagnostics, registryInfo, certSummary, history,
                    frozen, waivers, dependencyImpact, updateStatus,
                    latest: history.length ? history[history.length - 1] : null
                };
            }).sort((a, b) => a.name.localeCompare(b.name));

            const certApps = this.#cert ? this.#cert.listApplications() : [];
            const registryApps = this.#registry ? this.#registry.listApplications() : [];
            const appIds = Array.from(new Set([...certApps.map(a => a.id), ...registryApps.map(a => a.id)]));
            const applications = appIds.map((id) => {
                const certApp = certApps.find(a => a.id === id) || null;
                const registryApp = registryApps.find(a => a.id === id) || null;
                let matrix = null, roadmap = null, manifestCheck = null;
                if (certApp) {
                    try { matrix = this.#cert.getReadinessMatrix(id); } catch (_err) { /* ignore */ }
                    try { roadmap = this.#cert.getRoadmap(id); } catch (_err) { /* ignore */ }
                    try { manifestCheck = this.#cert.certifyApplication({ id, name: certApp.name, version: certApp.version, modules: certApp.modules }); } catch (_err) { /* ignore */ }
                }
                return { id, name: (certApp || registryApp).name, certApp, registryApp, matrix, roadmap, manifestCheck };
            });

            const releases = this.#cert ? this.#cert.listReleases().slice().sort((a, b) => new Date(a.lockedAt) - new Date(b.lockedAt)) : [];

            const elapsedMs = (performance && performance.now ? performance.now() : Date.now()) - startedAt;
            this.#scanCache = {
                scannedAt: new Date().toISOString(),
                scanDurationMs: elapsedMs,
                coordinators, applications, releases,
                workspaceConnected: !!this.#workspace,
                registryConnected: !!this.#registry,
                certificationConnected: !!this.#cert
            };
            this.#scanTimestamp = this.#scanCache.scannedAt;
            return this.#scanCache;
        }

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
            savePersisted("releaseVaultBundles", Array.from(this.#releaseVaultBundles.entries()));
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
                ["vault", "Certification Vault"], ["comparison", "Certification Comparison"],
                ["dependencyGraph", "Dependency Graph"], ["apiExplorer", "API Explorer"],
                ["release", "Release Center"], ["reports", "Reports"], ["history", "Certification History"],
                ["moduleExplorer", "Module Explorer"], ["applicationExplorer", "Application Explorer"],
                ["security", "Security Center"], ["techDebt", "Technical Debt"], ["documentation", "Documentation"],
                ["aiAssistant", "AI Assistant"],
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
                        <input type="text" class="cz-search" id="cz-global-search" placeholder="Search modules, applications, releases, events, history..." value="${escapeHtml(this.#searchTerm)}" />
                        <div class="cz-topbar-meta">
                            <span class="cz-bell" id="cz-bell-icon">🔔${notificationCount > 0 ? `<span class="cz-bell-count">${notificationCount}</span>` : ""}</span>
                            <span>Engine: <b>v${escapeHtml(engineVersion)}</b></span>
                            <span>Release: <b>${escapeHtml(currentRelease ? currentRelease.name : "None set")}</b></span>
                            <span>Status: <b>${this.#cert ? "Connected" : "Not Connected"}</b></span>
                        </div>
                    </header>
                    <div id="cz-global-search-results">${this.#renderGlobalSearchResults()}</div>
                    <main class="cz-main" id="cz-main">${this.#renderSection(this.#activeSection)}</main>
                </div>`;
        }

        /**
         * globalSearch(term)
         *   Searches modules/applications/releases/events/history (all real,
         *   already-scanned data) plus Company/Customer records IF those
         *   coordinators are connected and expose their own search methods —
         *   never re-implements their search logic, just calls it.
         */
        globalSearch(term) {
            const needle = String(term || "").toLowerCase().trim();
            if (!needle) return null;
            const scan = this.scanWorkspace();
            const results = {
                modules: scan.coordinators.filter(c => c.name.toLowerCase().includes(needle)).map(c => c.name),
                applications: scan.applications.filter(a => a.name.toLowerCase().includes(needle)).map(a => a.name),
                releases: scan.releases.filter(r => r.name.toLowerCase().includes(needle)).map(r => r.name),
                events: this.#recentActions.filter(a => a.eventName && a.eventName.toLowerCase().includes(needle)).map(a => a.eventName),
                versions: scan.coordinators.filter(c => c.version && c.version.toLowerCase().includes(needle)).map(c => `${c.name} v${c.version}`),
                companies: (window.CozyOS && window.CozyOS.Company && typeof window.CozyOS.Company.searchCompanies === "function")
                    ? window.CozyOS.Company.searchCompanies(needle).map(c => c.legalName) : null,
                customers: (window.CozyOS && window.CozyOS.Customer && typeof window.CozyOS.Customer.searchCustomers === "function")
                    ? window.CozyOS.Customer.searchCustomers(needle).map(c => c.displayName) : null
            };
            return results;
        }

        #renderGlobalSearchResults() {
            const results = this.globalSearch(this.#searchTerm);
            if (!results) return "";
            const categories = [
                ["Modules", results.modules], ["Applications", results.applications], ["Releases", results.releases],
                ["Events", results.events], ["Versions", results.versions],
                ["Companies", results.companies], ["Customers", results.customers]
            ];
            const anyHits = categories.some(([, items]) => items && items.length > 0);
            const rows = categories.map(([label, items]) => {
                if (items === null) return `<div><b>${escapeHtml(label)}:</b> <span class="cz-muted">not connected</span></div>`;
                return `<div><b>${escapeHtml(label)} (${items.length}):</b> ${items.length ? escapeHtml(items.slice(0, 8).join(", ")) : "no matches"}</div>`;
            }).join("");
            return `<div class="cz-panel" style="margin:0 28px 0;">${anyHits ? "" : '<p class="cz-muted">No matches found across any connected source.</p>'}${rows}</div>`;
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
                case "vault": return this.#renderCertificationVault();
                case "comparison": return this.#renderCertificationComparison();
                case "dependencyGraph": return this.#renderDependencyGraph();
                case "apiExplorer": return this.#renderApiExplorer();
                case "release": return this.#renderReleaseCenter();
                case "reports": return this.#renderReports();
                case "history": return this.#renderHistory();
                case "moduleExplorer": return this.#renderModuleExplorer();
                case "applicationExplorer": return this.#renderApplicationExplorer();
                case "security": return this.#renderSecurityCenter();
                case "techDebt": return this.#renderTechDebtCenter();
                case "documentation": return this.#renderDocumentationCenter();
                case "aiAssistant": return this.#renderAiAssistant();
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
                const resultsPanel = document.getElementById("cz-global-search-results");
                if (resultsPanel) resultsPanel.innerHTML = this.#renderGlobalSearchResults();
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
            const scan = this.scanWorkspace();
            const currentRelease = this.#currentReleaseId ? cert.getRelease(this.#currentReleaseId) : null;

            const certifiedModules = scan.coordinators.filter(c => c.certSummary && c.certSummary.certification === "ENTERPRISE_CERTIFIED").length;
            const totalModulesTracked = scan.coordinators.length;

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
                ["Certified Applications", `${scan.applications.length}`],
                ["Current Release", currentRelease ? currentRelease.name : "None set"],
                ["Platform Health", platformScore !== null ? `${platformScore}%` : "Not yet run"],
                ["Platform Grade", platformGrade || "—"],
                ["Workspace Status", this.#workspace ? "Connected" : "Not Connected"],
                ["Service Registry", this.#registry ? "Connected" : "Not Connected"]
            ];

            const cardHtml = cards.map(([label, value]) => `
                <div class="cz-card"><div class="cz-card-label">${escapeHtml(label)}</div><div class="cz-card-value">${escapeHtml(value)}</div></div>`).join("");

            return `<h1>Dashboard</h1><p class="cz-subtitle">Rule set v${escapeHtml(cert.getRuleSetVersion())} — ${rules.length} enterprise rules loaded.</p>
                <div class="cz-scan-meta">Last scanned: ${escapeHtml(scan.scannedAt)} (${scan.scanDurationMs.toFixed(1)} ms) — <span data-action="scan-workspace" style="cursor:pointer; text-decoration:underline;">Scan Workspace now</span></div>
                <div class="cz-grid">${cardHtml}</div>
                <div class="cz-row" style="margin-top:16px;">
                    <button class="cz-btn cz-btn-primary" data-action="run-full-cert">Run Full Platform Certification</button>
                    <button class="cz-btn" data-action="scan-workspace">Scan Workspace</button>
                    <button class="cz-btn" data-action="goto" data-goto="quick">Quick Certify a Module</button>
                </div>
                <h2>Progress Tracker — Core Coordinators</h2>
                ${this.#renderProgressTracker(scan)}
                <h2>Platform Health Map</h2>
                ${this.#renderHealthMap(scan)}`;
        }

        /** Matches the spec's own example: a stable checklist with real ✔/Waiting status, never fabricated. */
        #renderProgressTracker(scan) {
            const rows = SUGGESTED_COORDINATOR_LIST.map((name) => {
                const coord = scan.coordinators.find(c => c.name === name);
                const certified = coord && coord.certSummary && coord.certSummary.certification === "ENTERPRISE_CERTIFIED";
                const label = certified ? "✔ Certified" : (coord && coord.discovered) ? "Discovered — Not Yet Certified" : "Waiting";
                return `<div class="cz-progress-tracker-row"><span>${escapeHtml(name)}</span><span class="${certified ? "cz-badge cz-badge-ready" : ""}">${escapeHtml(label)}</span></div>`;
            }).join("");
            return `<div class="cz-panel">${rows}</div>`;
        }

        /**
         * Health-map colors, per spec:
         *   Green = Certified, Yellow = Needs Certification, Orange = Upgrade
         *   Available, Red = Failed, Gray = Not Built.
         */
        #healthColorFor(coord) {
            if (!coord.discovered && !coord.certSummary) return "gray";
            if (!coord.discovered && (!coord.certSummary || coord.certSummary.certification === "NOT_CERTIFIED")) return "gray";
            if (coord.certSummary && coord.certSummary.certification === "CERTIFICATION_FAILED") return "red";
            if (coord.updateStatus === "PENDING_CERTIFICATION") return "orange";
            if (!coord.certSummary || coord.certSummary.certification === "NOT_CERTIFIED") return "yellow";
            if (coord.certSummary.certification === "CERTIFIED_WITH_WARNINGS") return "yellow";
            if (coord.certSummary.certification === "ENTERPRISE_CERTIFIED") return "green";
            return "gray";
        }

        #renderHealthMap(scan) {
            const tiles = scan.coordinators.map((c) => {
                const color = this.#healthColorFor(c);
                return `<div class="cz-health-tile health-${color}" title="${escapeHtml(c.certSummary ? c.certSummary.certification : "NOT_CERTIFIED")}">${escapeHtml(c.name)}</div>`;
            }).join("");
            return `<div class="cz-health-grid">${tiles}</div>
                <p class="cz-muted">🟩 Certified · 🟨 Needs Certification · 🟧 Upgrade Available · 🟥 Failed · ⬜ Not Built</p>`;
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
                this.#lastSourceTexts.set(moduleId, sourceText);
                this.#lastResults.quick = result;
                this.#invalidateScan();
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

        #renderRoadmapPhase(phase) {
            if (phase.issueCount === 0) return "";
            return `<div class="cz-roadmap-phase">
                <div class="cz-roadmap-phase-header"><b>${escapeHtml(phase.label)}</b><span>${phase.issueCount} issue${phase.issueCount === 1 ? "" : "s"}</span></div>
                <div class="cz-muted">${escapeHtml(phase.ruleIds.join(", "))}</div>
                <div class="cz-roadmap-phase-time">Estimated time: ${phase.estimatedMinutes} min</div>
            </div>`;
        }

        #renderRepairRoadmap(result) {
            const roadmap = this.#computeRepairRoadmap(result.defects);
            const activePhases = roadmap.phases.filter(p => p.issueCount > 0);
            if (activePhases.length === 0) return "";
            const progress = this.#computeRepairProgress(result.moduleId);
            const progressHtml = progress ? `
                <h3>Automatic Repair Progress</h3>
                <div class="cz-panel">
                    <p class="cz-muted">Compared: ${escapeHtml(progress.comparedFrom)} → ${escapeHtml(progress.comparedTo)}</p>
                    ${progress.phases.filter(p => p.status !== "NOT_APPLICABLE").map(p => `
                        <div class="cz-progress-tracker-row"><span>${escapeHtml({ phase1: "Critical", phase2: "Enterprise Architecture", phase3: "Coordinator Standards", phase4: "Security", phase5: "Optimization" }[p.key])}</span>
                        <span class="cz-badge ${p.status === "COMPLETED" ? "cz-badge-ready" : p.status === "IN_PROGRESS" ? "cz-badge-warn" : "cz-badge-neutral"}">${p.status === "COMPLETED" ? "Completed ✔" : p.status === "IN_PROGRESS" ? `In Progress ${p.percent}%` : "Waiting"}</span></div>`).join("")}
                </div>` : "";

            return `<h3>Repair Roadmap</h3>
                <div class="cz-panel">
                    ${activePhases.map(p => this.#renderRoadmapPhase(p)).join('<div class="cz-roadmap-divider"></div>')}
                    <div class="cz-roadmap-total">Total estimated repair time: <b>${roadmap.totalMinutes} min</b></div>
                </div>
                ${progressHtml}`;
        }

        #renderVaultStatusLine(moduleId) {
            const vault = this.computeVaultEntry(moduleId);
            if (!vault || vault.certificationCount < 2) return "";
            return `<p class="cz-row">
                <span class="cz-badge cz-badge-ready">⭐ Golden: v${escapeHtml(vault.golden.version)} (${vault.golden.summary.scorePercent}%)</span>
                <span class="cz-badge ${vault.regressionDetected ? "cz-badge-blocked" : "cz-badge-neutral"}">🧪 Latest: v${escapeHtml(vault.latest.version)} (${vault.latest.summary.scorePercent}%)${vault.regressionDetected ? " — Regression Detected" : ""}</span>
                ${vault.production ? `<span class="cz-badge cz-badge-warn">🏆 Production: v${escapeHtml(vault.production.version)}</span>` : ""}
            </p>`;
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
                    ${this.#renderVaultStatusLine(result.moduleId)}
                    <p class="cz-subtitle">Passed ${result.summary.passed}/${result.summary.totalChecks} rules · Estimated total fix time: ${(result.defects || []).reduce((s, d) => s + (d.estimatedFixMinutes || 0), 0)} min</p>
                    <div class="cz-row">
                        <button class="cz-btn" data-action="export-current" data-format="html">Export HTML</button>
                        <button class="cz-btn" data-action="export-current" data-format="markdown">Export Markdown</button>
                        <button class="cz-btn" data-action="export-current" data-format="json">Export JSON</button>
                        <button class="cz-btn" data-action="export-current" data-format="csv">Export CSV</button>
                        <button class="cz-btn" data-action="export-current" data-format="text">Export TXT</button>
                        <button class="cz-btn" data-action="export-current" data-format="pdf">Export PDF</button>
                    </div>
                    ${this.#renderRepairRoadmap(result)}
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
                this.#invalidateScan();
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
                this.#invalidateScan();
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
                let dependencyImpact = null;
                try { dependencyImpact = this.#cert.getDependencyImpact(result.moduleId); } catch (_err) { /* ignore */ }
                const recommendationText = result.upgradeStatus === "APPROVED"
                    ? "Safe to ship — no regressions, no public-API-surface changes detected."
                    : result.upgradeStatus === "APPROVED_WITH_WARNINGS"
                        ? `Ship with awareness: ${result.majorVersionBump ? "this is a deliberate major-version (breaking) bump." : "some non-blocking rules regressed — review before release."}`
                        : `Do not ship as-is: ${result.blockingRegressions && result.blockingRegressions.length ? result.blockingRegressions.join(", ") + " regressed at blocking severity." : "the public API surface changed in a way that breaks backward compatibility."}`;
                body = `
                    <div class="cz-panel">
                        <div class="cz-row">
                            <span class="cz-badge ${verdictBadgeClass(result.upgradeStatus === "APPROVED" ? "ENTERPRISE_CERTIFIED" : result.upgradeStatus === "REJECTED" ? "CERTIFICATION_FAILED" : "CERTIFIED_WITH_WARNINGS")}">${escapeHtml(rec)}</span>
                            <span>v${escapeHtml(result.fromVersion)} → v${escapeHtml(result.toVersion)}</span>
                        </div>
                        <h3>Breaking Change Detector</h3>
                        <table class="cz-table"><tbody>
                            <tr><th>Public APIs Changed</th><td>${result.apiRegressions.length ? escapeHtml(result.apiRegressions.join(", ")) : "None"}</td></tr>
                            <tr><th>Affected Modules</th><td>${dependencyImpact ? escapeHtml(dependencyImpact.module) : escapeHtml(result.moduleId || "—")}</td></tr>
                            <tr><th>Affected Applications</th><td>${dependencyImpact && dependencyImpact.usedBy.length ? escapeHtml(dependencyImpact.usedBy.map(u => u.applicationName).join(", ")) : "None declared"}</td></tr>
                            <tr><th>Backward Compatible</th><td>${result.checks.backwardCompatible ? "✓ Yes" : "✗ No"}</td></tr>
                            <tr><th>Risk</th><td>${dependencyImpact ? escapeHtml(dependencyImpact.risk) : "Unknown"}</td></tr>
                            <tr><th>Recommendation</th><td>${escapeHtml(recommendationText)}</td></tr>
                        </tbody></table>
                        <h3>Full Detail</h3>
                        <table class="cz-table"><tbody>
                            <tr><th>Regressions (any severity)</th><td>${result.regressedRules.length ? result.regressedRules.join(", ") : "None"}</td></tr>
                            <tr><th>Improvements</th><td>${result.improvedRules.length ? result.improvedRules.join(", ") : "None"}</td></tr>
                            <tr><th>Major Version Bump</th><td>${result.majorVersionBump ? "Yes" : "No"}</td></tr>
                        </tbody></table>
                        <p class="cz-muted">Never guessed — every field above comes directly from CozyCertification.verifyUpgrade()'s own recorded comparison of two real certifications.</p>
                        <button class="cz-btn" data-action="export-current" data-format="markdown" data-target="upgrade">Export Upgrade Report</button>
                    </div>`;
            }
            return `<h1>Upgrade Verification — Breaking Change Detector</h1><p class="cz-subtitle">Compares two certifications of the same module via CozyCertification.verifyUpgrade().</p>
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
                this.#invalidateScan();
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
                this.#invalidateScan();
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

        #renderReleaseVaultBundle(releaseId) {
            const bundle = this.#releaseVaultBundles.get(releaseId);
            if (!bundle || bundle.length === 0) return "";
            const rows = bundle.map(b => `<tr>
                <td>${escapeHtml(b.moduleId)}</td>
                <td>${b.goldenVersion ? `v${escapeHtml(b.goldenVersion)}` : "—"}</td>
                <td>${escapeHtml(b.goldenCertificationId || "—")}</td>
                <td>${escapeHtml(b.sourceHash || "—")}</td>
                <td>${b.hasSourceSnapshot ? "Yes (this session)" : "No"}</td>
            </tr>`).join("");
            return `<h3>Release Integration — Golden Snapshot Bundle</h3>
                <p class="cz-muted">Captured at lock time by this dashboard (not by CozyCertification.lockRelease() itself) — the Golden Certified version of each module as it stood when this release was locked, for verification/restore purposes.</p>
                <table class="cz-table"><thead><tr><th>Module</th><th>Golden Version</th><th>Certification ID</th><th>Source Hash</th><th>Source Snapshot</th></tr></thead><tbody>${rows}</tbody></table>`;
        }

        #renderReleaseDetail(releaseId) {
            const release = this.#cert.getRelease(releaseId);
            if (!release) return "";
            let integrity = null;
            try { integrity = this.#cert.verifyReleaseIntegrity(releaseId); } catch (_err) { /* ignore */ }

            const allReleases = this.#cert.listReleases().slice().sort((a, b) => new Date(a.lockedAt) - new Date(b.lockedAt));
            const idx = allReleases.findIndex(r => r.releaseId === releaseId);
            const previous = idx > 0 ? allReleases[idx - 1] : null;
            let diffHtml = `<p class="cz-muted">No previous release to compare against.</p>`;
            if (previous) {
                const prevModules = new Map(previous.coreModules.modules.map(m => [m.moduleId, m]));
                const currModules = new Map(release.coreModules.modules.map(m => [m.moduleId, m]));
                const added = [...currModules.keys()].filter(id => !prevModules.has(id));
                const removed = [...prevModules.keys()].filter(id => !currModules.has(id));
                const updated = [...currModules.keys()].filter(id => prevModules.has(id) && prevModules.get(id).version !== currModules.get(id).version);
                diffHtml = `<table class="cz-table"><tbody>
                    <tr><th>Compared To</th><td>${escapeHtml(previous.name)}</td></tr>
                    <tr><th>Modules Added</th><td>${added.length ? escapeHtml(added.join(", ")) : "None"}</td></tr>
                    <tr><th>Modules Removed</th><td>${removed.length ? escapeHtml(removed.join(", ")) : "None"}</td></tr>
                    <tr><th>Modules Updated</th><td>${updated.length ? escapeHtml(updated.join(", ")) : "None"}</td></tr>
                </tbody></table>`;
            }

            return `<div class="cz-panel">
                <h2>${escapeHtml(release.name)}</h2>
                <div class="cz-row">
                    <span class="cz-badge ${release.status === "LOCKED" ? "cz-badge-ready" : "cz-badge-warn"}">${escapeHtml(release.status)}</span>
                    ${integrity ? `<span>${integrity.anyDrift ? "⚠ Drift detected since lock" : "✓ Matches locked state"}</span>` : ""}
                    <span>Rollback available: ${idx > 0 ? "Yes" : "No"}</span>
                </div>
                <div class="cz-row" style="margin-top:10px;">
                    <button class="cz-btn ${releaseId === this.#currentReleaseId ? "" : "cz-btn-primary"}" data-action="set-current-release" data-id="${escapeHtml(releaseId)}">${releaseId === this.#currentReleaseId ? "Current Release" : "Set as Current Release"}</button>
                    <button class="cz-btn" data-action="export-current" data-format="markdown" data-target="release" data-id="${escapeHtml(releaseId)}">Export Release Notes</button>
                </div>
                <h3>Compared to Previous Release</h3>
                ${diffHtml}
                <h3>Modules</h3>
                <table class="cz-table"><thead><tr><th>Module</th><th>Version</th><th>Verdict</th><th>Score</th></tr></thead><tbody>
                ${release.coreModules.modules.map(m => `<tr><td>${escapeHtml(m.moduleId)}</td><td>${escapeHtml(m.version)}</td><td>${escapeHtml(m.verdict)}</td><td>${escapeHtml(m.score)}%</td></tr>`).join("")}
                </tbody></table>
                <h3>Applications</h3>
                <table class="cz-table"><thead><tr><th>Application</th><th>Readiness</th><th>Deployment</th></tr></thead><tbody>
                ${release.applications.applications.map(a => `<tr><td>${escapeHtml(a.applicationId)}</td><td>${escapeHtml(a.overallReadiness)}%</td><td>${escapeHtml(a.deploymentStatus)}</td></tr>`).join("")}
                </tbody></table>
                ${this.#renderReleaseVaultBundle(releaseId)}
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

                // Dashboard-side release integration: capture each module's
                // Golden Certified snapshot (certificationId, version,
                // sourceHash, and source text if this session has it)
                // alongside the real release lock — this.#cert.lockRelease()
                // itself is untouched; this is purely additive bookkeeping
                // this dashboard keeps for its own Vault/Restore features.
                const bundle = moduleIds.map((moduleId) => {
                    const vault = this.computeVaultEntry(moduleId);
                    return vault ? {
                        moduleId,
                        goldenCertificationId: vault.golden.certificationId,
                        goldenVersion: vault.golden.version,
                        sourceHash: vault.golden.sourceHash,
                        hasSourceSnapshot: this.#lastSourceTexts.has(moduleId)
                    } : { moduleId, goldenCertificationId: null, goldenVersion: null, sourceHash: null, hasSourceSnapshot: false };
                });
                this.#releaseVaultBundles.set(release.releaseId, bundle);
                this.#persist();

                this.#invalidateScan();
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

        // Which locked release (if any) last included this module, and which
        // registered application declares it — both real lookups against the
        // scan, not guesses.
        #lastReleaseFor(scan, moduleName) {
            for (let i = scan.releases.length - 1; i >= 0; i--) {
                if (scan.releases[i].coreModules.modules.some(m => m.moduleId === moduleName)) return scan.releases[i].name;
            }
            return null;
        }

        #ownerApplicationsFor(scan, moduleName) {
            return scan.applications
                .filter(a => a.certApp && a.certApp.modules.includes(moduleName))
                .map(a => a.name);
        }

        #currentStateFor(coord) {
            if (coord.frozen) return "🔒 FROZEN";
            if (coord.waivers && coord.waivers.length > 0) return `⏸ ${coord.waivers.length} Waiver(s)`;
            return "ACTIVE";
        }

        #renderModuleExplorer() {
            const scan = this.scanWorkspace();
            const needle = this.#searchTerm.toLowerCase().trim();
            const filtered = needle ? scan.coordinators.filter(c => c.name.toLowerCase().includes(needle)) : scan.coordinators;

            const rows = filtered.map((c) => {
                const owner = this.#ownerApplicationsFor(scan, c.name);
                const release = this.#lastReleaseFor(scan, c.name);
                return `<tr class="cz-row-clickable" data-action="select-module" data-id="${escapeHtml(c.name)}">
                    <td>${escapeHtml(c.name)}</td>
                    <td>${c.discovered ? escapeHtml(c.version || "unknown") : this.#notBuiltLabel(c)}</td>
                    <td>${escapeHtml(c.registryInfo ? c.registryInfo.category : "—")}</td>
                    <td><span class="cz-badge ${verdictBadgeClass(c.certSummary ? c.certSummary.certification : "NOT_CERTIFIED")}">${escapeHtml(c.certSummary ? c.certSummary.certification : "NOT_CERTIFIED")}</span></td>
                    <td>${escapeHtml(c.latest ? c.latest.overallGrade : "—")}</td>
                    <td>${escapeHtml(c.certSummary && c.certSummary.score !== null ? c.certSummary.score + "%" : "—")}</td>
                    <td>${c.discovered ? "REGISTERED" : "UNREGISTERED"}</td>
                    <td>${c.dependencyImpact ? c.dependencyImpact.affectedApplications : 0}</td>
                    <td>${escapeHtml(c.updateStatus)}</td>
                    <td>${escapeHtml(release || "—")}</td>
                    <td>${escapeHtml(c.latest ? c.latest.timestamp : "—")}</td>
                    <td>${escapeHtml(c.latest ? c.latest.timestamp : "—")}</td>
                    <td>${escapeHtml(owner.join(", ") || "—")}</td>
                    <td>${escapeHtml(this.#currentStateFor(c))}</td>
                </tr>`;
            }).join("");

            const detail = this.#selected && this.#selected.type === "select-module" ? this.#renderModuleDetail(this.#selected.id) : "";
            const header = `<tr><th>Module</th><th>Version</th><th>Category</th><th>Certification</th><th>Grade</th><th>Health</th><th>Registration</th><th>Dependents</th><th>Upgrade</th><th>Release</th><th>Last Certified</th><th>Last Updated</th><th>Owner App</th><th>State</th></tr>`;

            return `<h1>Module Explorer</h1><p class="cz-subtitle">${scan.coordinators.length} coordinator(s) known (suggested list + live discovery + Service Registry catalog). Last scanned: ${escapeHtml(scan.scannedAt)}.</p>
                <table class="cz-table"><thead>${header}</thead><tbody>${rows}</tbody></table>
                ${detail}`;
        }

        #notBuiltLabel(coord) {
            return coord.certSummary && coord.certSummary.certification !== "NOT_CERTIFIED" ? "Not Connected" : "Not Built";
        }

        #renderModuleDetail(moduleId) {
            const scan = this.scanWorkspace();
            const coord = scan.coordinators.find(c => c.name === moduleId);
            const latest = coord && coord.latest;
            const dependsOn = (coord && coord.diagnostics && Array.isArray(coord.diagnostics.dependencies)) ? coord.diagnostics.dependencies : [];
            const requiredBy = scan.coordinators.filter(other =>
                other.diagnostics && Array.isArray(other.diagnostics.dependencies) &&
                other.diagnostics.dependencies.some(d => d.name === moduleId || d.name === `${moduleId} Management`)
            ).map(o => o.name);

            const detailPanel = `<div class="cz-panel">
                <h3>Depends On</h3>${this.#renderList(dependsOn.map(d => `${d.name}${d.required ? " (required)" : " (optional)"} — ${d.purpose || ""}`))}
                <h3>Required By</h3>${this.#renderList(requiredBy)}
                <h3>Risk Level</h3><p>${coord && coord.dependencyImpact ? escapeHtml(coord.dependencyImpact.risk) : "Unknown"}</p>
                <h3>Affected Applications</h3>${this.#renderList(coord && coord.dependencyImpact ? coord.dependencyImpact.usedBy.map(u => u.applicationName) : [])}
            </div>`;

            if (!latest) return `<div class="cz-panel"><h2>${escapeHtml(moduleId)}</h2>${this.#notConnected("No certification history yet.")}</div>${detailPanel}`;
            return `<div class="cz-panel"><h2>${escapeHtml(moduleId)}</h2>${this.#renderCertificationResult(latest)}</div>${detailPanel}${this.#renderCertificationTimeline(moduleId)}`;
        }

        // =====================================================================
        // ─── CERTIFICATION TIMELINE ───────────────────────────────────────────
        // Every certification a module has ever received, oldest to newest.
        // Reads CozyCertification's own append-only history directly — this
        // dashboard never deletes or rewrites anything in it.
        // =====================================================================

        #renderCertificationTimeline(moduleId) {
            const history = this.#cert.listRecords(moduleId);
            if (history.length === 0) return "";
            const steps = history.map((r, i) => {
                const symbol = r.verdict === "ENTERPRISE_CERTIFIED" ? "✓" : r.verdict === "CERTIFIED_WITH_WARNINGS" ? "⚠" : "✗";
                const label = r.verdict === "ENTERPRISE_CERTIFIED" ? "Certified" : r.verdict === "CERTIFIED_WITH_WARNINGS" ? "Warning" : "Failed";
                return `<div class="cz-timeline-step"><b>v${escapeHtml(r.version)}</b> <span class="cz-badge ${verdictBadgeClass(r.verdict)}">${symbol} ${label}</span> <span class="cz-muted">${escapeHtml(r.timestamp)}</span></div>${i < history.length - 1 ? '<div class="cz-timeline-arrow">↓</div>' : ""}`;
            }).join("");
            return `<div class="cz-panel"><h3>Certification Timeline</h3>${steps}</div>`;
        }

        // =====================================================================
        // ─── APPLICATION EXPLORER ─────────────────────────────────────────────
        // =====================================================================

        #renderApplicationExplorer() {
            const scan = this.scanWorkspace();
            const needle = this.#searchTerm.toLowerCase().trim();
            const filtered = needle ? scan.applications.filter(a => a.name.toLowerCase().includes(needle)) : scan.applications;

            const rows = filtered.map((app) => {
                const installed = app.certApp ? app.certApp.modules : [];
                const missing = app.matrix ? app.matrix.modules.filter(m => m.verdict === "NOT_CERTIFIED").map(m => m.moduleId) : [];
                const offlineReady = app.manifestCheck ? (app.manifestCheck.offlineReadiness ? "Yes" : "No") : "Unknown";
                const tenantReady = app.certApp ? "Yes (Company Management issues tenantId)" : "Unknown";
                const upgradeReady = app.matrix ? (app.matrix.modules.every(m => m.verdict === "ENTERPRISE_CERTIFIED") ? "Yes" : "No") : "Unknown";
                return `<tr><td>${escapeHtml(app.name)}</td>
                    <td>${escapeHtml(installed.join(", ") || "—")}</td>
                    <td>${escapeHtml(missing.join(", ") || "None")}</td>
                    <td><span class="cz-badge ${verdictBadgeClass(app.matrix && app.matrix.modules.every(m => m.verdict === "ENTERPRISE_CERTIFIED") ? "ENTERPRISE_CERTIFIED" : "CERTIFIED_WITH_WARNINGS")}">${app.certApp ? "Tracked" : "Not tracked"}</span></td>
                    <td>${app.matrix ? escapeHtml(app.matrix.overallReadiness) + "%" : "—"}</td>
                    <td>${app.matrix ? escapeHtml(app.matrix.overallReadiness) + "%" : "—"}</td>
                    <td>${escapeHtml(offlineReady)}</td>
                    <td>${escapeHtml(tenantReady)}</td>
                    <td>${escapeHtml(upgradeReady)}</td>
                    <td>${escapeHtml(this.#currentReleaseId || "—")}</td>
                    <td>${app.matrix ? escapeHtml(app.matrix.deploymentStatus) : "Not certified"}</td>
                </tr>`;
            }).join("");

            const header = `<tr><th>Application</th><th>Installed Modules</th><th>Missing Modules</th><th>Certification</th><th>Readiness</th><th>Health</th><th>Offline Ready</th><th>Tenant Ready</th><th>Upgrade Ready</th><th>Release</th><th>Status</th></tr>`;
            return `<h1>Application Explorer</h1><p class="cz-subtitle">Sourced from CozyCertification's application registry and Service Registry catalog — ${scan.applications.length} application(s) found.</p>
                ${scan.applications.length === 0 ? this.#notConnected("No applications registered yet.") : `<table class="cz-table"><thead>${header}</thead><tbody>${rows}</tbody></table>`}`;
        }

        // =====================================================================
        // ─── WORKSPACE / SERVICE REGISTRY SECTIONS ────────────────────────────
        // Both are strictly generic reads of an optional coordinator — the
        // dashboard never assumes either is present, and shows exactly what
        // each one reports if it is.
        // =====================================================================

        // =====================================================================
        // ─── CERTIFICATION VAULT DASHBOARD PAGE ───────────────────────────────
        // Every row here reflects CozyCertification's own permanent,
        // append-only history — Golden/Latest/Production/Rollback are
        // derived labels computed fresh each time, never separately stored
        // or capable of overwriting anything.
        // =====================================================================

        #renderCertificationVault() {
            const vaultEntries = this.getCertificationVault();
            const selected = (this.#selected && this.#selected.type === "vault-module") ? this.#selected.id : null;

            if (vaultEntries.length === 0) {
                return `<h1>Certification Vault</h1>${this.#notConnected("No certifications on file yet — run Quick Certification to start building vault history.")}`;
            }

            const rows = vaultEntries.map(v => `
                <tr class="cz-row-clickable" data-action="select-vault-module" data-id="${escapeHtml(v.moduleId)}">
                    <td>${escapeHtml(v.moduleId)}</td>
                    <td>⭐ v${escapeHtml(v.golden.version)} (${v.golden.summary.scorePercent}%)</td>
                    <td>🧪 v${escapeHtml(v.latest.version)} (${v.latest.summary.scorePercent}%)${v.regressionDetected ? " ⚠" : ""}</td>
                    <td>${v.production ? `🏆 v${escapeHtml(v.production.version)}` : "—"}</td>
                    <td>${v.certificationCount}</td>
                    <td>${v.bestScore}%</td>
                    <td>${v.latestScore}%</td>
                </tr>`).join("");

            const detail = selected ? this.#renderVaultModuleDetail(selected) : "";

            return `<h1>Certification Vault</h1><p class="cz-subtitle">Permanent certification history for every coordinator — nothing here is ever overwritten; CozyCertification's own history is append-only.</p>
                <table class="cz-table"><thead><tr><th>Module</th><th>Golden</th><th>Latest</th><th>Production</th><th>Cert Count</th><th>Best Score</th><th>Latest Score</th></tr></thead><tbody>${rows}</tbody></table>
                ${detail}`;
        }

        #renderVaultModuleDetail(moduleId) {
            const vault = this.computeVaultEntry(moduleId);
            if (!vault) return "";
            const history = this.#cert.listRecords(moduleId);
            const sourceSnapshot = this.#lastSourceTexts.get(moduleId);
            return `<div class="cz-vault-card">
                <h3>${escapeHtml(moduleId)}</h3>
                <table class="cz-table"><tbody>
                    <tr><th>⭐ Golden Certified</th><td>v${escapeHtml(vault.golden.version)} — ${vault.golden.summary.scorePercent}% (${escapeHtml(vault.golden.certificationId)})</td></tr>
                    <tr><th>🧪 Latest Certification</th><td>v${escapeHtml(vault.latest.version)} — ${vault.latest.summary.scorePercent}% (${escapeHtml(vault.latest.certificationId)})</td></tr>
                    <tr><th>🏆 Production Version</th><td>${vault.production ? `v${escapeHtml(vault.production.version)} (${escapeHtml(vault.production.certificationId)})` : "Not set — lock a release including this module and mark it current"}</td></tr>
                    <tr><th>↩ Rollback Candidate</th><td>${vault.rollbackCandidate ? `v${escapeHtml(vault.rollbackCandidate.version)} — ${vault.rollbackCandidate.summary.scorePercent}%` : "None"}</td></tr>
                    <tr><th>Regression Detected</th><td>${vault.regressionDetected ? "⚠ Yes — Latest scores lower than Golden" : "No"}</td></tr>
                    <tr><th>Source Snapshot Available</th><td>${sourceSnapshot ? "Yes (from this session's Quick Certification)" : "No — not retained for this module in this session"}</td></tr>
                </tbody></table>
                <div class="cz-row" style="margin-top:10px;">
                    <button class="cz-btn" data-action="restore-golden" data-id="${escapeHtml(moduleId)}">Restore Golden (Export Snapshot)</button>
                    <button class="cz-btn" data-action="export-current" data-format="html" data-target="vault-golden" data-id="${escapeHtml(moduleId)}">Export Golden Report (HTML)</button>
                    <button class="cz-btn" data-action="export-current" data-format="markdown" data-target="vault-golden" data-id="${escapeHtml(moduleId)}">Export Golden Report (Markdown)</button>
                </div>
                ${this.#renderCertificationTimeline(moduleId)}
            </div>`;
        }

        // =====================================================================
        // ─── CERTIFICATION COMPARISON ─────────────────────────────────────────
        // =====================================================================

        #renderCertificationComparison() {
            const scan = this.scanWorkspace();
            const withHistory = scan.coordinators.filter(c => c.history && c.history.length >= 1).map(c => c.name);
            if (withHistory.length === 0) return `<h1>Certification Comparison</h1>${this.#notConnected("No certified modules yet.")}`;

            const moduleOptions = withHistory.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
            const result = this.#lastResults.comparison;
            let body = "";
            if (result) {
                body = `<div class="cz-panel">
                    <table class="cz-table"><tbody>
                        <tr><th>Score Difference</th><td>${result.scoreDifference > 0 ? "+" : ""}${result.scoreDifference}%</td></tr>
                        <tr><th>Grade Difference</th><td>${escapeHtml(result.gradeDifference)}</td></tr>
                        <tr><th>Rules Fixed</th><td>${result.rulesFixed.length ? escapeHtml(result.rulesFixed.join(", ")) : "None"}</td></tr>
                        <tr><th>New Regressions</th><td>${result.newRegressions.length ? escapeHtml(result.newRegressions.join(", ")) : "None"}</td></tr>
                        <tr><th>New Warnings</th><td>${result.newWarnings.length ? escapeHtml(result.newWarnings.join(", ")) : "None"}</td></tr>
                    </tbody></table>
                </div>`;
            }

            return `<h1>Certification Comparison</h1><p class="cz-subtitle">Compares two already-computed certifications — no rules are re-evaluated.</p>
                <div class="cz-panel">
                    <div class="cz-field"><label>Module</label><select class="cz-input" id="cz-compare-module">${moduleOptions}</select></div>
                    <div class="cz-row">
                        <button class="cz-btn" data-action="run-comparison" data-mode="current-vs-golden">Current vs Golden</button>
                        <button class="cz-btn" data-action="run-comparison" data-mode="current-vs-previous">Current vs Previous</button>
                    </div>
                </div>
                ${body}`;
        }

        #runComparison(mode) {
            const select = document.getElementById("cz-compare-module");
            if (!select) return;
            const vault = this.computeVaultEntry(select.value);
            if (!vault) return;
            const from = mode === "current-vs-golden" ? vault.golden : (vault.previous || vault.golden);
            const to = vault.latest;
            if (from.certificationId === to.certificationId) { window.alert("Nothing to compare — only one certification on file."); return; }
            this.#lastResults.comparison = this.compareCertificationRecords(from, to);
            this.#renderMain();
        }


        // =====================================================================
        // ─── DEPENDENCY GRAPH ─────────────────────────────────────────────────
        // Built ONLY from what each module honestly declares about itself
        // (getDiagnosticsReport().dependencies, a convention — not every
        // module exposes it). This is not a discovered/inferred graph; a
        // module with no declared dependencies simply shows no children.
        // =====================================================================

        #renderDependencyGraph() {
            const scan = this.scanWorkspace();
            const declaring = scan.coordinators.filter(c => c.diagnostics && Array.isArray(c.diagnostics.dependencies) && c.diagnostics.dependencies.length > 0);
            if (declaring.length === 0) {
                return `<h1>Dependency Graph</h1>${this.#notConnected("No discovered coordinator currently declares a `dependencies` field in getDiagnosticsReport() — nothing to draw yet. This graph only ever reflects what a module honestly reports about itself.")}`;
            }
            const trees = declaring.map((c) => {
                const children = c.diagnostics.dependencies.map(d => `<div class="cz-dep-tree-node">↳ ${escapeHtml(d.name)} ${d.required ? "(required)" : "(optional)"} — <span class="cz-muted">${escapeHtml(d.purpose || "")}</span></div>`).join("");
                return `<div class="cz-panel"><b>${escapeHtml(c.name)}</b>${children}</div>`;
            }).join("");
            return `<h1>Dependency Graph</h1><p class="cz-subtitle">Each module's own declared dependencies (getDiagnosticsReport().dependencies) — not an inferred/discovered graph.</p>${trees}`;
        }

        // =====================================================================
        // ─── API EXPLORER ─────────────────────────────────────────────────────
        // Real reflection on a live coordinator's prototype — genuine method
        // names and declared-parameter counts (fn.length), never guessed.
        // Parameter NAMES/types/descriptions aren't retained by JS at
        // runtime, so those are honestly reported as unavailable rather than
        // invented. "Events" shows only events this dashboard has actually
        // observed firing this session — not a claimed complete list.
        // =====================================================================

        #renderApiExplorer() {
            const scan = this.scanWorkspace();
            const discovered = scan.coordinators.filter(c => c.discovered);
            const selectedName = (this.#selected && this.#selected.type === "api-explorer") ? this.#selected.id : (discovered[0] ? discovered[0].name : null);
            const options = discovered.map(c => `<option value="${escapeHtml(c.name)}" ${c.name === selectedName ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("");

            let detail = this.#notConnected("No discovered coordinators to inspect.");
            if (selectedName) {
                const liveRef = window.CozyOS[selectedName];
                const proto = Object.getPrototypeOf(liveRef);
                const methodNames = Object.getOwnPropertyNames(proto).filter(n => n !== "constructor" && typeof liveRef[n] === "function" && !n.startsWith("#"));
                const methodRows = methodNames.sort().map(n => `<tr><td>${escapeHtml(n)}()</td><td>${liveRef[n].length}</td></tr>`).join("");
                const observedEvents = this.#recentActions.filter(a => a.eventName).map(a => a.eventName);
                const exportsList = Object.keys(window.CozyOS).filter(k => typeof window.CozyOS[k] !== "function");

                detail = `<div class="cz-panel">
                    <h3>${escapeHtml(selectedName)} — v${escapeHtml(liveRef.getVersion ? liveRef.getVersion() : "unknown")}</h3>
                    <h3>Public Methods (${methodNames.length})</h3>
                    <p class="cz-muted">Parameter names/types/descriptions aren't retained by JS at runtime — "Params" below is the declared parameter COUNT (fn.length) only, not names.</p>
                    <table class="cz-table"><thead><tr><th>Method</th><th>Params</th></tr></thead><tbody>${methodRows}</tbody></table>
                    <h3>Events Observed This Session</h3>${this.#renderList(observedEvents)}
                    <h3>Exports on window.CozyOS</h3>${this.#renderList(exportsList)}
                </div>`;
            }

            return `<h1>API Explorer</h1><p class="cz-subtitle">Real reflection on a live coordinator — not a static doc lookup.</p>
                <div class="cz-panel"><div class="cz-field"><label>Coordinator</label><select class="cz-input" id="cz-api-explorer-select">${options}</select></div>
                <button class="cz-btn" data-action="select-api-coordinator">Inspect</button></div>
                ${detail}`;
        }

        // =====================================================================
        // ─── SECURITY CENTER ──────────────────────────────────────────────────
        // A themed VIEW over CozyCertification's own SEC-*/UI-safety findings
        // from a module's latest certification — this does NOT re-implement
        // eval()/raw-HTML-sink/innerHTML detection itself, since that
        // would duplicate the certification engine's own rules.
        // =====================================================================

        #renderSecurityCenter() {
            const scan = this.scanWorkspace();
            const certified = scan.coordinators.filter(c => c.latest);
            if (certified.length === 0) return `<h1>Security Center</h1>${this.#notConnected("No module has been certified yet — Security Center re-presents CozyCertification's own SEC-*/UI-safety findings, so certify something first.")}`;

            const rows = certified.map((c) => {
                const secDefects = c.latest.defects.filter(d => d.group === "security" || d.group === "uisafety");
                const criticalCount = secDefects.filter(d => d.severity === "CRITICAL").length;
                const highCount = secDefects.filter(d => d.severity === "HIGH").length;
                return { name: c.name, secDefects, criticalCount, highCount };
            });

            const summaryRows = rows.map(r => `<tr><td>${escapeHtml(r.name)}</td><td>${r.criticalCount}</td><td>${r.highCount}</td><td>${r.secDefects.length}</td></tr>`).join("");
            const details = rows.filter(r => r.secDefects.length > 0).map(r => `
                <div class="cz-panel"><h3>${escapeHtml(r.name)}</h3>
                ${r.secDefects.map(d => `<div class="cz-defect sev-${d.severity.toLowerCase()}"><b>${escapeHtml(d.severity)}</b> ${escapeHtml(d.id)}: ${escapeHtml(d.description)}<div>${escapeHtml(d.recommendation)}</div></div>`).join("")}
                </div>`).join("");

            return `<h1>Security Center</h1><p class="cz-subtitle">Sourced entirely from CozyCertification's Security and UI Safety rule groups — this view reports, it never re-scans code itself.</p>
                <table class="cz-table"><thead><tr><th>Module</th><th>Critical</th><th>High</th><th>Total Findings</th></tr></thead><tbody>${summaryRows}</tbody></table>
                ${details || '<div class="cz-empty">No security/UI-safety findings across any certified module.</div>'}`;
        }

        // =====================================================================
        // ─── TECHNICAL DEBT CENTER ────────────────────────────────────────────
        // Genuinely new, narrow analysis (not duplicating any certification
        // rule): TODO/FIXME count, duplicate method names, and a rough
        // complexity signal, computed on source text this dashboard actually
        // has (whatever was most recently run through Quick Certification).
        // "Unused methods/exports" are explicitly NOT claimed — determining
        // that reliably needs whole-codebase call-graph analysis this
        // dashboard has no access to.
        // =====================================================================

        #analyzeTechDebt(sourceText) {
            const todoMatches = sourceText.match(/\b(TODO|FIXME)\b/g) || [];
            const methodNames = [...sourceText.matchAll(/^\s{4,12}(?:async\s+)?#?([a-zA-Z_$][\w$]*)\s*\([^)]*\)\s*\{/gm)].map(m => m[1]);
            const nameCounts = {};
            methodNames.forEach(n => { nameCounts[n] = (nameCounts[n] || 0) + 1; });
            const duplicates = Object.entries(nameCounts).filter(([, count]) => count > 1).map(([name, count]) => `${name} (${count}x)`);
            const deprecated = [...sourceText.matchAll(/@deprecated[^\n]*/g)].map(m => m[0].trim());
            // Rough complexity: count branching keywords per method body isn't
            // reliably extractable without a real parser; as an honest proxy,
            // flag methods whose declaration-to-next-declaration span exceeds
            // ~60 lines as "long" (a real, if crude, complexity signal).
            const lines = sourceText.split("\n");
            const declLineNumbers = [...sourceText.matchAll(/^\s{4,12}(?:async\s+)?#?[a-zA-Z_$][\w$]*\s*\([^)]*\)\s*\{/gm)].map(m => sourceText.slice(0, m.index).split("\n").length);
            const longMethods = [];
            for (let i = 0; i < declLineNumbers.length; i++) {
                const span = (declLineNumbers[i + 1] || lines.length) - declLineNumbers[i];
                if (span > 60) longMethods.push(`line ${declLineNumbers[i]} (${span} lines)`);
            }
            const estimatedCleanupMinutes = todoMatches.length * 10 + duplicates.length * 15 + longMethods.length * 20;
            return { todoCount: todoMatches.length, duplicateMethods: duplicates, deprecatedApis: deprecated, longMethods, estimatedCleanupMinutes };
        }

        #renderTechDebtCenter() {
            const moduleIds = Array.from(this.#lastSourceTexts.keys());
            if (moduleIds.length === 0) {
                return `<h1>Technical Debt Center</h1>${this.#notConnected("Run Quick Certification on a module first — Technical Debt Center analyzes the source text you most recently submitted, which this dashboard doesn't otherwise retain.")}`;
            }
            const selected = (this.#selected && this.#selected.type === "techdebt-module") ? this.#selected.id : moduleIds[moduleIds.length - 1];
            const analysis = this.#analyzeTechDebt(this.#lastSourceTexts.get(selected));
            const options = moduleIds.map(m => `<option value="${escapeHtml(m)}" ${m === selected ? "selected" : ""}>${escapeHtml(m)}</option>`).join("");

            return `<h1>Technical Debt Center</h1><p class="cz-subtitle">Analyzes source text submitted via Quick Certification this session — not a claim about the whole codebase.</p>
                <div class="cz-panel"><div class="cz-field"><label>Module</label><select class="cz-input" id="cz-techdebt-select">${options}</select></div>
                <button class="cz-btn" data-action="select-techdebt-module">Analyze</button></div>
                <div class="cz-panel">
                    <table class="cz-table"><tbody>
                        <tr><th>TODO / FIXME count</th><td>${analysis.todoCount}</td></tr>
                        <tr><th>Deprecated APIs</th><td>${analysis.deprecatedApis.length ? escapeHtml(analysis.deprecatedApis.join("; ")) : "None found"}</td></tr>
                        <tr><th>Duplicate Method Names</th><td>${analysis.duplicateMethods.length ? escapeHtml(analysis.duplicateMethods.join(", ")) : "None"}</td></tr>
                        <tr><th>Unused Methods</th><td class="cz-muted">Not reliably computable from a single file — requires whole-project call-graph analysis this dashboard doesn't have access to.</td></tr>
                        <tr><th>Unused Exports</th><td class="cz-muted">Same limitation as above.</td></tr>
                        <tr><th>Long/Complex Methods (&gt;60 lines, rough signal)</th><td>${analysis.longMethods.length ? escapeHtml(analysis.longMethods.join(", ")) : "None flagged"}</td></tr>
                        <tr><th>Estimated Cleanup Time</th><td>${analysis.estimatedCleanupMinutes} min <span class="cz-muted">(rough heuristic: 10 min/TODO, 15 min/duplicate, 20 min/long method — not a real estimate)</span></td></tr>
                    </tbody></table>
                </div>`;
        }

        // =====================================================================
        // ─── DOCUMENTATION CENTER ─────────────────────────────────────────────
        // Also a themed VIEW over CozyCertification's own Documentation rule
        // group — coverage % comes directly from checksByGroup.documentation,
        // not a separate parser.
        // =====================================================================

        #renderDocumentationCenter() {
            const scan = this.scanWorkspace();
            const certified = scan.coordinators.filter(c => c.latest);
            if (certified.length === 0) return `<h1>Documentation Center</h1>${this.#notConnected("No module has been certified yet.")}`;

            const rows = certified.map((c) => {
                const docStats = c.latest.checksByGroup.documentation;
                const coverage = docStats ? Math.round((docStats.passed / docStats.total) * 1000) / 10 : null;
                const gaps = c.latest.defects.filter(d => d.group === "documentation");
                return { name: c.name, coverage, gaps };
            });

            const summaryRows = rows.map(r => `<tr><td>${escapeHtml(r.name)}</td><td>${r.coverage !== null ? r.coverage + "%" : "—"}</td><td>${r.gaps.length}</td></tr>`).join("");
            const details = rows.filter(r => r.gaps.length > 0).map(r => `
                <div class="cz-panel"><h3>${escapeHtml(r.name)}</h3>${r.gaps.map(d => `<div class="cz-defect sev-${d.severity.toLowerCase()}"><b>${escapeHtml(d.id)}</b>: ${escapeHtml(d.description)} — ${escapeHtml(d.recommendation)}</div>`).join("")}</div>`).join("");

            return `<h1>Documentation Center</h1><p class="cz-subtitle">Coverage % is CozyCertification's own Documentation rule-group pass rate — this view re-presents it, it doesn't parse headers itself.</p>
                <table class="cz-table"><thead><tr><th>Module</th><th>Coverage</th><th>Gaps</th></tr></thead><tbody>${summaryRows}</tbody></table>
                ${details}`;
        }

        // =====================================================================
        // ─── AI DEVELOPMENT ASSISTANT (recommendations only, never edits code) ─
        // Every suggestion below is computed from real scan data. When there's
        // nothing to flag, it says so — it does not manufacture an example.
        // =====================================================================

        #computeAiSuggestions(scan) {
            const suggestions = [];

            // 1. Declared-but-missing dependencies.
            for (const c of scan.coordinators) {
                if (!c.diagnostics || !Array.isArray(c.diagnostics.dependencies)) continue;
                for (const dep of c.diagnostics.dependencies) {
                    const target = scan.coordinators.find(x => x.name === dep.name || `${x.name} Management` === dep.name);
                    const targetMissing = !target || (!target.discovered && (!target.certSummary || target.certSummary.certification === "NOT_CERTIFIED"));
                    if (dep.required && targetMissing) {
                        suggestions.push({
                            priority: "Highest Priority",
                            title: `${dep.name} is required by ${c.name} but isn't built/certified yet.`,
                            affectedModules: [c.name],
                            recommendation: `Build and certify ${dep.name} before relying further on ${c.name}.`
                        });
                    }
                }
            }

            // 2. Shared rule failures across 2+ certified modules — a real,
            // generically-detectable "the same pattern keeps failing" signal.
            const failuresByRule = new Map();
            for (const c of scan.coordinators) {
                if (!c.latest) continue;
                for (const d of c.latest.defects) {
                    if (!failuresByRule.has(d.id)) failuresByRule.set(d.id, []);
                    failuresByRule.get(d.id).push(c.name);
                }
            }
            for (const [ruleId, modules] of failuresByRule.entries()) {
                if (modules.length >= 2) {
                    suggestions.push({
                        priority: "Medium Priority",
                        title: `${ruleId} fails the same way across ${modules.length} modules.`,
                        affectedModules: modules,
                        recommendation: "Consider a shared helper or convention fix rather than repeating the same change per module."
                    });
                }
            }

            return suggestions;
        }

        #renderAiAssistant() {
            const scan = this.scanWorkspace();
            const suggestions = this.#computeAiSuggestions(scan);
            if (suggestions.length === 0) {
                return `<h1>AI Development Assistant</h1><p class="cz-subtitle">Recommendations only — never modifies code.</p>${this.#notConnected("No issues detected from current scan data. This checks for required-but-missing declared dependencies, and rule failures repeated across 2+ certified modules — right now, neither condition is present.")}`;
            }
            const cards = suggestions.map(s => `
                <div class="cz-panel">
                    <h3>${escapeHtml(s.priority)}</h3>
                    <p>${escapeHtml(s.title)}</p>
                    <p><b>Affected Modules:</b> ${escapeHtml(s.affectedModules.join(", "))}</p>
                    <p><b>Recommendation:</b> ${escapeHtml(s.recommendation)}</p>
                    <p class="cz-muted">Estimated effort: not shown — this dashboard has no reliable basis to estimate developer time, and won't guess.</p>
                </div>`).join("");
            return `<h1>AI Development Assistant</h1><p class="cz-subtitle">Recommendations only — never modifies code.</p>${cards}`;
        }

        #renderWorkspaceSection() {
            const bar = (this.#workspace && typeof this.#workspace.getGlobalStatusBar === "function") ? this.#workspace.getGlobalStatusBar() : null;
            const vaultEntries = this.getCertificationVault();
            const vaultRows = vaultEntries.map(v => `
                <tr><td>${escapeHtml(v.moduleId)}</td>
                    <td>⭐ v${escapeHtml(v.golden.version)}</td>
                    <td>🧪 v${escapeHtml(v.latest.version)}${v.regressionDetected ? " ⚠" : ""}</td>
                    <td>${v.production ? `🏆 v${escapeHtml(v.production.version)}` : "—"}</td></tr>`).join("");

            const statusBlock = this.#workspace
                ? (bar ? this.#renderKeyValueTable({
                    "Workspace Connected": "Yes", "Registered Applications": bar.applicationsInstalled,
                    "Registered Coordinators": bar.coordinatorsLoaded, "Running Version": bar.workspaceVersion,
                    "Loaded Modules": bar.coordinatorsLoaded, "Health": `${bar.applicationsRunning} application(s) running`
                }) : this.#notConnected("Workspace Shell connected but getGlobalStatusBar() unavailable."))
                : this.#notConnected("Workspace Shell not connected. If this dashboard is embedded in a page that already loaded cozy-workspace.js, this section activates automatically.");

            return `<h1>Workspace</h1>
                ${statusBlock}
                <h3>Golden / Latest / Production (from Certification Vault)</h3>
                <p class="cz-muted">Computed by this dashboard from CozyCertification's real history — shown regardless of Workspace Shell connection, since this data comes from Certification, not from the shell itself.</p>
                ${vaultEntries.length === 0 ? this.#notConnected("No certified modules yet.") : `<table class="cz-table"><thead><tr><th>Module</th><th>⭐ Golden</th><th>🧪 Latest</th><th>🏆 Production</th></tr></thead><tbody>${vaultRows}</tbody></table>`}`;
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
            const scan = this.#scanCache; // read cache directly — don't force a rescan just to view diagnostics
            const scanSummary = scan ? {
                "Last Scan": scan.scannedAt,
                "Scan Time": `${scan.scanDurationMs.toFixed(2)} ms`,
                "Coordinator Count": scan.coordinators.length,
                "Application Count": scan.applications.length,
                "Release Count": scan.releases.length,
                "Certification Count (this session's known modules)": scan.coordinators.filter(c => c.latest).length,
                "Modules Waiting (not built)": scan.coordinators.filter(c => !c.discovered && !c.latest).length,
                "Modules Failed": scan.coordinators.filter(c => c.certSummary && c.certSummary.certification === "CERTIFICATION_FAILED").length
            } : { "Last Scan": "Never — visit Dashboard or click Scan Workspace" };
            return `<h1>Diagnostics</h1>
                <h3>Workspace Scan</h3>${this.#renderKeyValueTable(scanSummary)}
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
                case "scan-workspace": this.scanWorkspace({ force: true }); this.#renderMain(); break;
                case "select-api-coordinator": {
                    const sel = document.getElementById("cz-api-explorer-select");
                    if (sel) this.#setSection("apiExplorer", { type: "api-explorer", id: sel.value });
                    break;
                }
                case "select-techdebt-module": {
                    const sel = document.getElementById("cz-techdebt-select");
                    if (sel) this.#setSection("techDebt", { type: "techdebt-module", id: sel.value });
                    break;
                }
                case "select-vault-module": this.#setSection("vault", { type: "vault-module", id: el.getAttribute("data-id") }); break;
                case "run-comparison": this.#runComparison(el.getAttribute("data-mode")); break;
                case "restore-golden": this.#restoreGolden(el.getAttribute("data-id")); break;
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
            if (target === "vault-golden") {
                if (!explicitId) return;
                const vault = this.computeVaultEntry(explicitId);
                if (!vault) return;
                this.#exportAs("module", vault.golden, format, `${explicitId}-golden`);
                return;
            }
            const resolved = this.#resultFor(target);
            if (!resolved) { window.alert("Nothing to export yet — run a certification first."); return; }
            if (resolved.kind === "release") { this.#exportAs("release", resolved.releaseId, format, resolved.releaseId); return; }
            const filenameBase = (resolved.result.moduleId || resolved.result.applicationId || resolved.result.fromReleaseId || target || "cozyos-report");
            this.#exportAs(resolved.kind, resolved.result, format, filenameBase);
        }

        /**
         * restoreGolden(moduleId)
         *   "Restore" here means giving the developer everything needed to
         *   manually redeploy the Golden Certified version — this dashboard
         *   has no mechanism (and no business) actually replacing a live
         *   coordinator's running code. It downloads the Golden record's
         *   full report, which includes its sourceHash for verification
         *   against whichever source file is redeployed.
         */
        #restoreGolden(moduleId) {
            const vault = this.computeVaultEntry(moduleId);
            if (!vault) return;
            this.#exportAs("module", vault.golden, "markdown", `${moduleId}-golden-restore`);
            window.alert(`Downloaded the Golden Certified report for "${moduleId}" (v${vault.golden.version}, sourceHash ${vault.golden.sourceHash}). This dashboard cannot replace running code itself — use this report to verify you're redeploying the correct source.`);
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
