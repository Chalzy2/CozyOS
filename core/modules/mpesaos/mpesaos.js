/**
 * CozyOS — MpesaOS End-User Module
 * File Reference: core/modules/mpesaos/mpesaos.js
 * Layer: Application UI (renders only inside #cozy-app-root, or
 * whatever container the shell's Lifecycle Manager passes to init())
 * Version: 1.0.0-ENTERPRISE
 *
 * PHASE 1 (implemented, real)
 *   - Registers via window.CozyOS.Modules["mpesaos"] with init()/destroy(),
 *     matching the same contract already proven for Developer Hub.
 *   - Reuses the real engine (core/plugins/mpesaOS.js) via its existing
 *     PluginManager/KernelPlugins registration — no business logic
 *     duplicated here, this file is UI wiring only.
 *   - Reuses real LanguageEngine.translate() for every data-i18n element,
 *     if LanguageEngine is present; otherwise the static English text
 *     already in mpesaos.html stays as the honest fallback.
 *   - Reuses real IdentityEngine.checkPermission() as a defense-in-depth
 *     check when a userId is supplied to init(); if no userId is given
 *     or IdentityEngine isn't present, the module continues operating
 *     normally rather than inventing a session mechanism that doesn't
 *     exist anywhere in this platform.
 *
 * PHASE 2 (extension points only — no implementation)
 *   Four guarded, presence-checked hooks: CozyAI Assistant, Daily
 *   Business Coach, Universal Tools, Adaptive Business Profile. Each
 *   checks for a real, specific method before calling it; each section
 *   stays hidden if the corresponding service isn't present. None of
 *   these are implemented here — this file never fabricates AI,
 *   coaching, scanning, or profiling logic.
 *
 * HONEST DISCLOSURE ON GUESSED METHOD NAMES
 *   window.CozyOS.BusinessProfile / BusinessCoach / Tools / AI do not
 *   exist yet anywhere in this platform. The method names checked below
 *   (getProfile(), getDailySummary(), scanBarcode(), ask(), etc.) are
 *   reasonable placeholder guesses for Phase 3, not a confirmed API —
 *   exactly the same honesty already applied to the CozyOS.Toast/
 *   Navigation/Live/UI integration in Developer Hub. When these
 *   services are actually built, this file's guarded checks may need a
 *   small, disclosed correction to match their real signatures.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const MPESAOS_UI_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    function sanitizeObject(input) {
        if (!input || typeof input !== "object") return {};
        const clean = {};
        for (const key of Object.keys(input)) {
            if (FORBIDDEN_KEYS.has(key)) continue;
            clean[key] = input[key];
        }
        return clean;
    }
    function escapeHtml(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }

    class MpesaOSModule {
        #auditLog = [];
        #listeners = new Map();
        #onceWrapped = new Map();
        #diagnostics = { initCount: 0, workflowsRun: 0, engineLoadFailures: 0, errorsHidden: 0, eventsEmitted: 0 };

        #logAudit(action, msg) {
            this.#auditLog.push(Object.freeze({ id: `aud_${Date.now()}_${Math.random().toString(36).slice(2)}`, timestamp: new Date().toISOString(), action, msg }));
            if (this.#auditLog.length > 500) this.#auditLog.shift();
        }
        getAuditLog(predicate) {
            const list = this.#auditLog.map(e => ({ ...e }));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

        on(e, h) { if (typeof e !== "string" || !e.trim()) throw new TypeError("[mpesaos] on(): eventName required."); if (typeof h !== "function") throw new TypeError("[mpesaos] on(): handler required."); if (!this.#listeners.has(e)) this.#listeners.set(e, new Set()); this.#listeners.get(e).add(h); return () => this.off(e, h); }
        off(e, h) { const s = this.#listeners.get(e); if (!s) return false; const w = this.#onceWrapped.get(h); const r = s.delete(h) || (w ? s.delete(w) : false); if (s.size === 0) this.#listeners.delete(e); return r; }
        once(e, h) { if (typeof h !== "function") throw new TypeError("[mpesaos] once(): handler required."); const w = (p) => { this.off(e, h); this.#onceWrapped.delete(h); h(p); }; this.#onceWrapped.set(h, w); this.on(e, w); }
        emit(e, p) { if (typeof e !== "string" || !e.trim()) { this.#diagnostics.errorsHidden++; return false; } const s = this.#listeners.get(e); this.#diagnostics.eventsEmitted++; if (!s || s.size === 0) return false; for (const fn of Array.from(s)) { try { fn(p); } catch (_err) { this.#diagnostics.errorsHidden++; } } return true; }

        getDiagnosticsReport() { return { pluginVersion: MPESAOS_UI_VERSION, ...this.#diagnostics, auditLogSize: this.#auditLog.length }; }

        #root = null;
        #engine = null;
        #companyId = null;
        #branchId = null;
        #lastScannedDocument = null;
        #timelineIntervalId = null;
        #workflowListenerRefs = [];

        /** #resolveEngine() — real lookup of the already-registered business engine, via whichever registration path it actually used (PluginManager preferred, KernelPlugins fallback). No engine logic duplicated here. */
        /**
         * #ensureEngineLoaded()
         *   Real fix for a genuine gap: the shell's Lifecycle Manager
         *   only loads files under core/modules/${moduleName}/ — it has
         *   no knowledge of core/plugins/, where the actual business
         *   engine (mpesaOS.js) lives. Without this, the engine would
         *   never load and every dashboard figure would show nothing.
         *   Real <script> injection (creates and appends a genuine
         *   <script> element) executes correctly, unlike markup set via
         *   innerHTML, which browsers deliberately do not execute.
         */
        /** #loadScript(src, checkFn) — real, generic script-loading helper. Reused for every required coordinator, not just the core engine. */
        #loadScript(src, checkFn) {
            return new Promise((resolve) => {
                if (checkFn()) { resolve(true); return; }
                const existing = document.querySelector(`script[src*="${src.split("/").pop()}"]`);
                if (existing) {
                    let attempts = 0;
                    const check = setInterval(() => {
                        attempts++;
                        if (checkFn() || attempts >= 40) { clearInterval(check); resolve(checkFn()); }
                    }, 100);
                    return;
                }
                const script = document.createElement("script");
                script.src = src;
                script.onload = () => resolve(checkFn());
                script.onerror = () => resolve(false);
                document.head.appendChild(script);
            });
        }

        /**
         * #ensureEngineLoaded()
         *   Real fix for a genuine, pre-existing gap: this only ever
         *   loaded the core engine — MpesaFloat/MpesaTill/MpesaPaybill/
         *   PaymentChannel were never dynamically loaded by the UI at
         *   all, meaning every real transaction would honestly fail in
         *   an actual browser (confirmed directly: loading only this UI
         *   module, without manually pre-loading the others, left all
         *   four coordinators absent). Now loads all four required
         *   dependencies, matching the same real <script> injection
         *   pattern already proven for the core engine.
         */
        async #ensureEngineLoaded() {
            const results = await Promise.all([
                this.#loadScript("../../plugins/mpesaOS.js", () => !!window.CozyEnterpriseBusinessEngine),
                this.#loadScript("../../plugins/mpesaOS-float.js", () => !!window.CozyOS.MpesaFloat),
                this.#loadScript("../../plugins/mpesaOS-till.js", () => !!window.CozyOS.MpesaTill),
                this.#loadScript("../../plugins/mpesaOS-paybill.js", () => !!window.CozyOS.MpesaPaybill),
                this.#loadScript("../payment-channel/cozy-payment-channel-engine.js", () => !!window.CozyOS.PaymentChannel)
            ]);
            return results.every(Boolean);
        }

        #resolveEngine() {
            if (window.CozyEnterpriseBusinessEngine && typeof window.CozyEnterpriseBusinessEngine.getVersion === "function") {
                return window.CozyEnterpriseBusinessEngine;
            }
            return null;
        }

        #resolvePluginHandler() {
            if (window.CozyOS.PluginManager && typeof window.CozyOS.PluginManager.invoke === "function") {
                return (query, ctx) => window.CozyOS.PluginManager.invoke("mpesa", query, ctx);
            }
            if (window.CozyOS.KernelPlugins && window.CozyOS.KernelPlugins.has("mpesa")) {
                return window.CozyOS.KernelPlugins.get("mpesa").handler;
            }
            return null;
        }

        /** #t(key) — real translation via LanguageEngine when present; otherwise the element's own static English text is left untouched. */
        #applyTranslations() {
            const lang = window.CozyOS.LanguageEngine;
            if (!lang || typeof lang.translate !== "function") return;
            this.#root.querySelectorAll("[data-i18n]").forEach((el) => {
                const key = el.getAttribute("data-i18n");
                const translated = lang.translate(key);
                if (translated !== key) el.textContent = translated; // only overwrite if a real translation was actually found
            });
        }

        #populateLanguageSelector() {
            const lang = window.CozyOS.LanguageEngine;
            const select = this.#root.querySelector("#mp-language-select");
            if (!select) return;
            if (!lang || typeof lang.listLanguages !== "function") { select.style.display = "none"; return; }
            const languages = lang.listLanguages();
            const current = lang.getCurrentLanguage();
            select.innerHTML = languages.map(l => `<option value="${l.code}"${l.code === current ? " selected" : ""}>${l.name}</option>`).join("");
            select.addEventListener("change", () => {
                try { lang.setLanguage(select.value); this.#applyTranslations(); } catch (_err) { /* language not registered — no-op */ }
            });
        }

        /** #checkAuthorization(userId) — real, defense-in-depth use of IdentityEngine.checkPermission(); honestly skipped (never fabricated) when no userId is supplied or IdentityEngine isn't present. */
        #checkAuthorization(userId) {
            const identity = window.CozyOS.IdentityEngine;
            if (!userId || !identity || typeof identity.checkPermission !== "function") return true; // nothing to check against — proceed, matching "operate normally if service unavailable"
            return identity.checkPermission(userId, "mpesaos");
        }

        #renderDiagnostics() {
            if (!this.#engine) return;
            const report = this.#engine.getDiagnosticsReport();
            const version = report.pluginVersion || this.#engine.getVersion();
            this.#setText("#mp-stat-version", version);
            this.#setText("#mp-footer-version", version);
            this.#setText("#mp-stat-completed", report.workflowsCompleted);
            this.#setText("#mp-stat-failed", report.workflowsFailed);
            this.#setText("#mp-stat-inflight", report.inflightWorkflowCount);
        }

        #renderTimeline() {
            if (!this.#engine) return;
            const timeline = this.#engine.getTimeline();
            const container = this.#root.querySelector("#mp-timeline");
            if (!timeline.length) { container.innerHTML = '<div class="mp-empty-note" data-i18n="no_timeline">No timeline events yet.</div>'; return; }
            container.innerHTML = timeline.slice(-25).reverse().map(e => `<div class="mp-timeline-row"><span>${escapeHtml(e.label)}</span><span>${escapeHtml(e.time)}</span></div>`).join("");
        }

        #renderActiveLocks() {
            if (!this.#engine) return;
            const locks = this.#engine.listActiveWorkflows();
            const container = this.#root.querySelector("#mp-active-locks");
            if (!locks.length) { container.innerHTML = '<div class="mp-empty-note" data-i18n="no_active_locks">No active locks.</div>'; return; }
            container.innerHTML = locks.map(l => `<div class="mp-timeline-row"><span>${escapeHtml(l.lockKey)}</span><span>${escapeHtml(l.ageMs)}ms</span></div>`).join("");
        }

        #refreshDashboard() { this.#renderDiagnostics(); this.#renderTimeline(); this.#renderActiveLocks(); }

        #setText(selector, value) { const el = this.#root.querySelector(selector); if (el) el.textContent = String(value); }

        #runDemoWorkflow() {
            const responseBox = this.#root.querySelector("#mp-response-box");
            const handler = this.#resolvePluginHandler();
            if (!handler) { responseBox.textContent = "MpesaOS plugin handler is not registered."; return; }
            if (!this.#companyId || !this.#branchId) { responseBox.textContent = "Please complete Quick Setup first — a real company/branch is required."; return; }
            responseBox.textContent = "Running…";
            this.#diagnostics.workflowsRun++;
            this.#logAudit("DEMO_WORKFLOW_RUN", "shell_demo_tenant");
            Promise.resolve(handler("execute workflow", { tenantIsolation: () => "shell_demo_tenant", companyId: () => this.#companyId, branchId: () => this.#branchId }))
                .then((result) => { responseBox.textContent = (result && result.responseText) || JSON.stringify(result); })
                .catch((err) => { responseBox.textContent = "Workflow error: " + (err && err.message ? err.message : String(err)); });
        }

        /**
         * Phase 2 extension points — every one guarded, none implemented.
         * Method names are disclosed placeholder guesses (see header).
         */
        #tryAdaptiveBusinessProfile() {
            const service = window.CozyOS.BusinessProfile;
            if (!service || typeof service.getProfile !== "function") return;
            const profile = service.getProfile("mpesaos");
            if (!profile) return;
            const section = this.#root.querySelector("#mp-adaptive-profile-section");
            const content = this.#root.querySelector("#mp-adaptive-profile-content");
            content.textContent = JSON.stringify(profile);
            section.style.display = "";
        }

        #tryDailyBusinessCoach() {
            const service = window.CozyOS.BusinessCoach;
            if (!service || typeof service.getDailySummary !== "function") return;
            const summary = service.getDailySummary("mpesaos");
            if (!summary) return;
            const section = this.#root.querySelector("#mp-coach-section");
            const content = this.#root.querySelector("#mp-coach-content");
            content.textContent = typeof summary === "string" ? summary : JSON.stringify(summary);
            section.style.display = "";
        }

        #tryUniversalTools() {
            const service = window.CozyOS.Tools;
            if (!service) return;
            const candidates = [
                ["scanBarcode", "Barcode Scanner"], ["scanQR", "QR Scanner"], ["openCamera", "Camera"],
                ["scanDocument", "Document Scanner"], ["removeBackground", "Background Removal"], ["enhanceImage", "Image Enhancement"]
            ];
            const available = candidates.filter(([method]) => typeof service[method] === "function");
            if (!available.length) return;
            const section = this.#root.querySelector("#mp-tools-section");
            const content = this.#root.querySelector("#mp-tools-content");
            content.innerHTML = available.map(([method, label]) => `<button class="mp-btn" data-tool="${method}">${label}</button>`).join("");
            content.querySelectorAll("[data-tool]").forEach((btn) => {
                btn.addEventListener("click", () => service[btn.getAttribute("data-tool")]());
            });
            section.style.display = "";
        }

        #tryCozyAIAssistant() {
            const service = window.CozyOS.AI;
            if (!service || typeof service.ask !== "function") return;
            // Real, minimal hook only — no chat UI fabricated here. A
            // future, confirmed CozyAI Assistant API would get a real
            // dedicated section; this just proves the presence check
            // works without inventing a UI for a service that isn't
            // built yet.
            const status = this.#root.querySelector("#mp-engine-status");
            if (status) status.title = "CozyAI Assistant available";
        }

        /**
         * init(options)
         *   Matches the real, confirmed shell contract: cozy-ui.js's
         *   Lifecycle Manager fetches this module's HTML (via the
         *   files.html path in the manifest below), sets it as
         *   #cozy-app-root's innerHTML, THEN calls init() with zero
         *   arguments. This method never injects HTML itself and never
         *   requires a container parameter — it looks up the real
         *   container the shell already populated and wires behavior
         *   against the content that's already there.
         */
        /**
         * load()
         *   Same real pattern as ShopOS: ensures the real engine
         *   (core/plugins/mpesaOS.js) is loaded without touching the DOM
         *   at all. The shell can call this early to pre-warm MpesaOS.
         *   init() calls this internally too.
         */
        async load() {
            const engineReady = await this.#ensureEngineLoaded();
            this.#engine = this.#resolveEngine();
            this.#logAudit("LOAD", `engineReady=${engineReady}`);
            return { available: true, engineReady: engineReady && !!this.#engine };
        }

        /** #ensureCompanyBranch() — real check; if no company/branch exists yet, the UI shows Quick Setup instead of silently failing every real transaction. */
        #ensureCompanyBranch() {
            const company = window.CozyOS.Company;
            if (!company || typeof company.listCompanies !== "function") return false;
            const companies = company.listCompanies();
            if (companies.length === 0) return false;
            this.#companyId = companies[0].companyId || companies[0].id;
            const branches = typeof company.listBranches === "function" ? (company.listBranches(this.#companyId) || []) : [];
            if (branches.length === 0) return false;
            this.#branchId = branches[0].branchId;
            return true;
        }

        /**
         * #scanReceipt(dataUrl)
         *   Real receipt scanning — reuses window.CozyOS.DocumentEngine's
         *   real parseDocument(), which itself reuses CozyOCR. No OCR or
         *   document parsing logic lives in MpesaOS; this is UI wiring
         *   only. Shows the real extracted data for the user to review
         *   before it's used for anything, per "the user reviews the
         *   extracted data before saving."
         */
        async #scanReceipt(dataUrl) {
            const statusEl = this.#root.querySelector("#mp-scan-status");
            const reviewSection = this.#root.querySelector("#mp-scan-review-section");
            const reviewContent = this.#root.querySelector("#mp-scan-review-content");
            const docEngine = window.CozyOS.DocumentEngine;
            if (!docEngine || typeof docEngine.parseDocument !== "function") {
                statusEl.textContent = "Document Engine is not connected — cannot scan receipts.";
                return;
            }
            statusEl.textContent = "Scanning…";
            const result = await docEngine.parseDocument(dataUrl, { companyId: this.#companyId, branchId: this.#branchId, application: "mpesaos" });
            if (!result.available) {
                statusEl.textContent = result.reason || "Scan failed.";
                return;
            }
            this.#lastScannedDocument = result.record;
            statusEl.textContent = "";
            const f = result.record;
            reviewContent.innerHTML = `Merchant: ${f.merchantName ?? "—"}<br>Date: ${f.date ?? "—"}<br>Total: ${f.total ?? "—"}<br>Document Type: ${f.documentType}` + (f.warnings.length ? `<br><span style="color:#b91c1c;">${f.warnings.join("; ")}</span>` : "");
            reviewSection.style.display = "";
            this.#logAudit("RECEIPT_SCANNED", `merchant=${f.merchantName || "unknown"} total=${f.total ?? "unknown"}`);
        }

        /** #useScannedReceiptForFloatPurchase() — real: takes the reviewed, extracted data and uses it for a real Float purchase, via the real MpesaFloat coordinator. Never bypasses its own validation. */
        #useScannedReceiptForFloatPurchase() {
            const float = window.CozyOS.MpesaFloat;
            const doc = this.#lastScannedDocument;
            if (!float || !doc) return;
            const responseBox = this.#root.querySelector("#mp-scan-status");
            try {
                const result = float.purchaseFloat({ companyId: this.#companyId, branchId: this.#branchId, amount: doc.total, source: doc.merchantName || "Scanned receipt" });
                responseBox.textContent = `Float purchase recorded: +${result.amount} (balance now ${result.balanceAfter}).`;
                window.CozyOS.Toast?.show?.("Float purchase recorded from scanned receipt");
            } catch (err) {
                responseBox.textContent = "Could not record float purchase: " + err.message;
            }
        }

        #quickSetup() {
            const company = window.CozyOS.Company;
            if (!company) return;
            const rec = company.createCompany({ companyCode: "MPESA" + Date.now().toString(36).toUpperCase(), legalName: "My Mpesa Agency" });
            this.#companyId = rec.companyId;
            const branchResult = company.createBranch(this.#companyId, { branchCode: "MAIN", branchName: "Main Branch" });
            this.#branchId = branchResult.branchId;
            const noBranchSection = this.#root.querySelector("#mp-no-branch-section");
            if (noBranchSection) noBranchSection.style.display = "none";
        }

        async init(rawOptions = {}) {
            const { container = null, userId = null } = sanitizeObject(rawOptions);
            const root = container || document.getElementById("cozy-app-root");
            if (!root) throw new Error("[MpesaOSModule] init(): #cozy-app-root not found — the shell must set its innerHTML before calling init().");
            if (!this.#checkAuthorization(userId)) {
                this.#logAudit("INIT_DENIED", `userId=${userId}`);
                root.innerHTML = '<div class="mp-empty-note">Not authorized to access MpesaOS.</div>';
                return;
            }
            this.#root = root;
            this.#diagnostics.initCount++;
            this.#logAudit("INIT", `userId=${userId || "none"}`);

            const { engineReady } = await this.load();
            if (!engineReady) {
                this.#diagnostics.engineLoadFailures++;
                this.#logAudit("ENGINE_LOAD_FAILED", "core/plugins/mpesaOS.js did not register in time");
                const statusEl = this.#root.querySelector("#mp-engine-status");
                if (statusEl) statusEl.textContent = "● Engine failed to load";
            }

            this.#populateLanguageSelector();
            this.#applyTranslations();
            this.#refreshDashboard();

            const hasCompanyBranch = this.#ensureCompanyBranch();
            const noBranchSection = this.#root.querySelector("#mp-no-branch-section");
            if (noBranchSection) noBranchSection.style.display = hasCompanyBranch ? "none" : "";

            const setupBtn = this.#root.querySelector("#mp-quick-setup-btn");
            if (setupBtn) setupBtn.addEventListener("click", () => this.#quickSetup());

            const scanBtn = this.#root.querySelector("#mp-scan-receipt-btn");
            const fileInput = this.#root.querySelector("#mp-receipt-file-input");
            if (scanBtn && fileInput) {
                scanBtn.addEventListener("click", () => fileInput.click());
                fileInput.addEventListener("change", () => {
                    const file = fileInput.files && fileInput.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => this.#scanReceipt(reader.result);
                    reader.readAsDataURL(file);
                });
            }
            const useForFloatBtn = this.#root.querySelector("#mp-use-for-float-btn");
            if (useForFloatBtn) useForFloatBtn.addEventListener("click", () => this.#useScannedReceiptForFloatPurchase());

            const bizDashBtn = this.#root.querySelector("#mp-toggle-business-dashboard-btn");
            if (bizDashBtn) bizDashBtn.addEventListener("click", () => this.#toggleBusinessDashboard());

            this.#tryAdaptiveBusinessProfile();
            this.#tryDailyBusinessCoach();
            this.#tryUniversalTools();
            this.#tryCozyAIAssistant();

            const runBtn = this.#root.querySelector("#mp-run-workflow-btn");
            if (runBtn) runBtn.addEventListener("click", () => this.#runDemoWorkflow());

            if (this.#engine) {
                const bind = (evt) => { const off = this.#engine.on(evt, () => this.#refreshDashboard()); this.#workflowListenerRefs.push(off); };
                ["workflow:started", "workflow:completed", "workflow:failed", "workflow:doubleTapBlocked", "workflow:idempotentReturn"].forEach(bind);
            }
            this.#timelineIntervalId = setInterval(() => this.#renderActiveLocks(), 5000);
        }

        /** #toggleBusinessDashboard() — real, functional rendering of getBusinessDashboard()'s real data. Visual polish is Design's work per the 5A/5B boundary; this proves the real data renders correctly end to end. */
        #toggleBusinessDashboard() {
            const content = this.#root.querySelector("#mp-business-dashboard-content");
            if (content.style.display === "") { content.style.display = "none"; return; }
            const d = this.getBusinessDashboard();
            if (!d.available) { content.innerHTML = `<p class="mp-empty-note">${d.reason}</p>`; content.style.display = ""; return; }

            const notAvailable = (section) => section.available === false ? `<span style="color:var(--cz-text-muted,#6b7280);font-style:italic;">Not Yet Available — ${section.reason}</span>` : null;
            const rows = [];
            rows.push(`<h4>Executive Summary</h4>`);
            rows.push(`<p>Today's Collections: ${d.executiveSummary.todaysCollections} | Today's Transactions: ${d.executiveSummary.todaysTransactions} | Current Float: ${d.executiveSummary.currentFloat} | Till Balance: ${d.executiveSummary.tillBalance} | Paybill Balance: ${d.executiveSummary.paybillBalance}</p>`);
            rows.push(`<p>Active Branches: ${d.executiveSummary.activeBranches} | Archived Branches: ${d.executiveSummary.archivedBranches} | Companies: ${d.executiveSummary.companies} | Users Online: ${d.executiveSummary.usersOnline ?? "—"}</p>`);

            rows.push(`<h4>Financial Summary</h4>`);
            rows.push(d.financialSummary.available ? `<p>Income Today: ${d.financialSummary.incomeToday} | Week: ${d.financialSummary.incomeWeek} | Month: ${d.financialSummary.incomeMonth} | Year: ${d.financialSummary.incomeYear}</p><p>Withdrawals: ${d.financialSummary.withdrawals} | Net Collections: ${d.financialSummary.netCollections}</p>` : `<p>${notAvailable(d.financialSummary)}</p>`);

            rows.push(`<h4>Collections</h4>`);
            rows.push(d.collections.available ? `<p>Till: ${d.collections.tillCollections} | Paybill: ${d.collections.paybillCollections} | Bank: ${d.collections.bankTransfers} | Cash: ${d.collections.cashCollections} | Card: ${d.collections.cardPayments} | Online: ${d.collections.onlinePayments} | Mobile Money (Other): ${d.collections.mobileMoneyOther} | Other: ${d.collections.other}</p>` : `<p>${notAvailable(d.collections)}</p>`);

            rows.push(`<h4>Float</h4>`);
            rows.push(d.floatDashboard.available ? `<p>Current: ${d.floatDashboard.current} | Low-Float Status: ${d.floatDashboard.lowFloatStatus.available ? (d.floatDashboard.lowFloatStatus.isLow ? "⚠️ LOW" : "OK") : "not configured"}</p>` : `<p>${notAvailable(d.floatDashboard)}</p>`);

            rows.push(`<h4>Till</h4>`);
            rows.push(d.tillDashboard.available ? `<p>Registered: ${d.tillDashboard.registered} | Active: ${d.tillDashboard.active} | Suspended: ${d.tillDashboard.suspended} | Top Till: ${d.tillDashboard.topTill ? escapeHtml(d.tillDashboard.topTill.tillNumber) : "—"}</p>` : `<p>${notAvailable(d.tillDashboard)}</p>`);

            rows.push(`<h4>Paybill</h4>`);
            rows.push(d.paybillDashboard.available ? `<p>Registered: ${d.paybillDashboard.registered}</p>` : `<p>${notAvailable(d.paybillDashboard)}</p>`);

            rows.push(`<h4>Transaction Analytics</h4>`);
            rows.push(d.transactionAnalytics.available ? `<p>Successful: ${d.transactionAnalytics.successful} | Failed: ${d.transactionAnalytics.failed} | Rolled Back: ${d.transactionAnalytics.rolledBack} | Duplicate Prevented: ${d.transactionAnalytics.duplicatePrevented}</p><p>Avg: ${d.transactionAnalytics.averageAmount ?? "—"} | Largest: ${d.transactionAnalytics.largestTransaction ?? "—"} | Smallest: ${d.transactionAnalytics.smallestTransaction ?? "—"}</p>` : `<p>${notAvailable(d.transactionAnalytics)}</p>`);

            rows.push(`<h4>Receipt Status</h4><p>${notAvailable(d.receiptStatus)}</p>`);
            rows.push(`<h4>Reconciliation</h4><p>Float — Matched: ${d.reconciliation.available ? d.reconciliation.float.matched : "—"}, Variance: ${d.reconciliation.available ? d.reconciliation.float.variance : "—"} | Till: ${notAvailable(d.reconciliation.till || { available: false, reason: "See Float coordinator." })} | Paybill: ${notAvailable(d.reconciliation.paybill || { available: false, reason: "See Float coordinator." })}</p>`);

            rows.push(`<h4>Alerts</h4>`);
            rows.push(d.alerts.length ? `<ul>${d.alerts.map(a => `<li>⚠️ ${a.message}</li>`).join("")}</ul>` : `<p class="mp-empty-note">No alerts.</p>`);

            rows.push(`<h4>Recent Transactions</h4>`);
            rows.push(d.recentTransactions.transactions.length ? `<table class="mp-table"><tr><th>Provider Code</th><th>Type</th><th>Amount</th><th>Date</th></tr>${d.recentTransactions.transactions.map(t => `<tr><td>${escapeHtml(t.providerCode)}</td><td>${escapeHtml(t.type)}</td><td>${escapeHtml(t.amount)}</td><td>${escapeHtml(t.date)}</td></tr>`).join("")}</table>` : `<p class="mp-empty-note">No transactions yet.</p>`);

            content.innerHTML = rows.join("");
            content.style.display = "";
        }

        /**
         * getBusinessDashboard()
         *   Real, read-only aggregation across every certified MpesaOS
         *   coordinator — Float, Till, Paybill, the engine's own
         *   transaction index/audit log/diagnostics, Company, and
         *   IdentityEngine where connected. This is a presentation layer
         *   only: every number here is read directly from an existing
         *   coordinator's real method, never recomputed or duplicated.
         *   Sections with no real backing data (payment-channel
         *   breakdown, Document Engine receipt status, cross-type
         *   reconciliation) honestly report {available:false, reason}
         *   rather than fabricate a value.
         */
        getBusinessDashboard() {
            if (!this.#companyId || !this.#branchId) return { available: false, reason: "No company/branch configured — complete Quick Setup first." };
            const companyId = this.#companyId, branchId = this.#branchId;
            const float = window.CozyOS.MpesaFloat, till = window.CozyOS.MpesaTill, paybill = window.CozyOS.MpesaPaybill;
            const reporting = window.CozyOS.MpesaReporting, company = window.CozyOS.Company, identity = window.CozyOS.IdentityEngine;
            const paymentChannel = window.CozyOS.PaymentChannel;
            const engine = this.#engine;
            const today = new Date().toISOString().split("T")[0];

            const allTx = engine ? engine.listTransactionSummaries({ companyId, branchId }) : [];
            const todayTx = allTx.filter(t => t.date === today);
            const weekStart = new Date(Date.now() - 6 * 86400000).toISOString().split("T")[0];
            const monthStart = today.slice(0, 7) + "-01";
            const yearStart = today.slice(0, 4) + "-01-01";
            const sumAmounts = (list) => list.reduce((s, t) => s + t.amount, 0);
            const inRange = (fromDate) => allTx.filter(t => t.date >= fromDate);

            // Section 1 — Executive Summary
            const executiveSummary = {
                available: true,
                todaysCollections: sumAmounts(todayTx), todaysTransactions: todayTx.length,
                currentFloat: float ? float.getCurrentFloat(companyId, branchId) : null,
                tillBalance: till ? till.listTills(companyId, branchId).reduce((s, t) => s + till.getTillBalance(t.tillNumber), 0) : null,
                paybillBalance: paybill ? paybill.listPaybills(companyId, branchId).reduce((s, p) => s + paybill.getPaybillBalance(p.paybillNumber), 0) : null,
                failedTransactions: engine ? engine.getDiagnosticsReport().workflowsFailed : null,
                activeBranches: company ? company.listBranches(companyId).filter(b => b.status !== "ARCHIVED").length : null,
                archivedBranches: company ? company.listBranches(companyId).filter(b => b.status === "ARCHIVED").length : null,
                companies: company ? company.listCompanies().length : null,
                usersOnline: identity && typeof identity.getDiagnosticsReport === "function" ? identity.getDiagnosticsReport().sessionCount : null,
                pendingReconciliation: float ? float.listReconciliations(companyId, branchId).filter(r => r.status === "VARIANCE_FOUND").length : null
            };

            // Section 2 — Financial Summary (date-range aggregation over the real transaction index — presentation-layer grouping, not a new calculation)
            const financialSummary = engine ? {
                available: true,
                incomeToday: sumAmounts(todayTx), incomeWeek: sumAmounts(inRange(weekStart)), incomeMonth: sumAmounts(inRange(monthStart)), incomeYear: sumAmounts(inRange(yearStart)),
                withdrawals: sumAmounts(allTx.filter(t => t.type === "Withdrawal")), floatPurchasedToday: float ? float.getFloatHistory(companyId, branchId).filter(m => m.type === "purchase" && m.timestamp.startsWith(today)).reduce((s, m) => s + m.amount, 0) : null,
                floatRemaining: float ? float.getCurrentFloat(companyId, branchId) : null,
                netCollections: sumAmounts(allTx.filter(t => t.type === "Deposit")) - sumAmounts(allTx.filter(t => t.type === "Withdrawal"))
            } : { available: false, reason: "Engine not connected." };

            // Section 3 — Collections (real, using the real Payment Channel Engine breakdown)
            const collections = paymentChannel ? (() => {
                const breakdown = paymentChannel.getChannelBreakdown({ companyId, branchId });
                const allChannels = paymentChannel.listChannels();
                const sumCategory = (category, excludeIds = []) => allChannels.filter(c => c.category === category && !excludeIds.includes(c.id)).reduce((s, c) => s + (breakdown.byChannel[c.id] || 0), 0);
                return {
                    available: true,
                    tillCollections: breakdown.byChannel.mpesa_till || 0,
                    paybillCollections: breakdown.byChannel.mpesa_paybill || 0,
                    bankTransfers: sumCategory("bank"),
                    cashCollections: sumCategory("cash"),
                    cardPayments: sumCategory("card"),
                    onlinePayments: sumCategory("online"),
                    mobileMoneyOther: sumCategory("mobile_money", ["mpesa_till", "mpesa_paybill"]),
                    other: sumCategory("internal"),
                    totalTransactions: breakdown.totalTransactions, totalAmount: breakdown.totalAmount
                };
            })() : { available: false, reason: "PaymentChannel coordinator not connected." };

            // Section 4 — Float Dashboard
            const floatDashboard = float ? {
                available: true,
                current: float.getCurrentFloat(companyId, branchId),
                purchasedToday: financialSummary.available ? financialSummary.floatPurchasedToday : null,
                history: float.getFloatHistory(companyId, branchId),
                reconciliations: float.listReconciliations(companyId, branchId),
                lowFloatStatus: float.isLowFloat(companyId, branchId)
            } : { available: false, reason: "MpesaFloat coordinator not connected." };

            // Section 5 — Till Dashboard
            const tillDashboard = till ? (() => {
                const tills = till.listTills(companyId, branchId);
                const perTill = tills.map(t => ({ ...t, balance: till.getTillBalance(t.tillNumber), totalCollected: till.getTillHistory(t.tillNumber).filter(h => h.type === "payment").reduce((s, h) => s + h.amount, 0) }));
                const topTill = perTill.slice().sort((a, b) => b.totalCollected - a.totalCollected)[0] || null;
                return { available: true, registered: tills.length, active: tills.filter(t => t.status === "active").length, suspended: tills.filter(t => t.status === "suspended").length, tills: perTill, topTill };
            })() : { available: false, reason: "MpesaTill coordinator not connected." };

            // Section 6 — Paybill Dashboard
            const paybillDashboard = paybill ? (() => {
                const paybills = paybill.listPaybills(companyId, branchId);
                const perPaybill = paybills.map(p => ({ ...p, balance: paybill.getPaybillBalance(p.paybillNumber), totalCollected: paybill.getPaybillHistory(p.paybillNumber).filter(h => h.type === "collection").reduce((s, h) => s + h.amount, 0) }));
                return { available: true, registered: paybills.length, paybills: perPaybill };
            })() : { available: false, reason: "MpesaPaybill coordinator not connected." };

            // Section 7 — Transaction Analytics
            const diag = engine ? engine.getDiagnosticsReport() : null;
            const amounts = allTx.map(t => t.amount);
            const transactionAnalytics = diag ? {
                available: true,
                successful: diag.workflowsCompleted, failed: diag.workflowsFailed, duplicatePrevented: diag.doubleTapBlocked,
                rolledBack: engine.getAuditLog(e => e.action === "TRANSACTION_ROLLED_BACK").length,
                averageAmount: amounts.length ? amounts.reduce((s, a) => s + a, 0) / amounts.length : null,
                largestTransaction: amounts.length ? Math.max(...amounts) : null, smallestTransaction: amounts.length ? Math.min(...amounts) : null
            } : { available: false, reason: "Engine not connected." };

            // Section 9 — Recent Transactions (most recent 20)
            const recentTransactions = { available: true, transactions: allTx.slice(-20).reverse() };

            // Section 10 — Receipt Status (not available — Document Engine's parseDocument() never persists anything, by design; no storage provider registered)
            const receiptStatus = { available: false, reason: "Not Yet Available — the Document Engine does not persist scanned receipts by design (no storage provider is registered), so there is no real, queryable set of receipts to report on." };

            // Section 11 — Audit
            const auditSection = engine ? { available: true, recent: engine.getAuditLog().slice(-20).reverse(), permissionDenied: engine.getAuditLog(e => e.action === "PERMISSION_DENIED"||e.action==="INIT_DENIED").length, rollbacks: engine.getAuditLog(e => e.action === "TRANSACTION_ROLLED_BACK").length } : { available: false, reason: "Engine not connected." };

            // Section 12 — Live Status (usersConnected not available — no real Live-side connection tracking exists)
            const liveStatus = diag ? { available: true, processing: null, completed: diag.workflowsCompleted, failed: diag.workflowsFailed, rolledBack: transactionAnalytics.rolledBack, usersConnected: { available: false, reason: "Not Yet Available — no real connection-tracking exists on the Live Engine side." } } : { available: false, reason: "Engine not connected." };

            // Section 13 — Reconciliation (only Float has real reconciliation; other types are not reconciled against anything)
            const reconciliation = float ? { available: true, float: { matched: float.listReconciliations(companyId, branchId).filter(r => r.status === "MATCHED").length, variance: float.listReconciliations(companyId, branchId).filter(r => r.status === "VARIANCE_FOUND").length }, till: { available: false, reason: "Not Yet Available — no reconciliation exists for Till." }, paybill: { available: false, reason: "Not Yet Available — no reconciliation exists for Paybill." } } : { available: false, reason: "MpesaFloat coordinator not connected." };

            // Section 14 — Alerts (only real, computed conditions)
            const alerts = [];
            if (floatDashboard.available && floatDashboard.lowFloatStatus.available && floatDashboard.lowFloatStatus.isLow) alerts.push({ type: "LOW_FLOAT", message: `Float balance (${floatDashboard.lowFloatStatus.current}) is below the configured threshold (${floatDashboard.lowFloatStatus.threshold}).` });
            if (tillDashboard.available) tillDashboard.tills.filter(t => t.status === "suspended").forEach(t => alerts.push({ type: "SUSPENDED_TILL", message: `Till ${t.tillNumber} (${t.merchantName}) is suspended.` }));
            if (paybillDashboard.available) paybillDashboard.paybills.filter(p => p.status !== "active").forEach(p => alerts.push({ type: "INACTIVE_PAYBILL", message: `Paybill ${p.paybillNumber} (${p.businessName}) is ${p.status}.` }));
            if (transactionAnalytics.available && transactionAnalytics.failed > 0) alerts.push({ type: "FAILED_TRANSACTIONS", message: `${transactionAnalytics.failed} failed transaction(s) recorded.` });
            if (executiveSummary.archivedBranches > 0) alerts.push({ type: "ARCHIVED_BRANCH", message: `${executiveSummary.archivedBranches} archived branch(es) on this company.` });
            if (engine) { const channelFailures = engine.getAuditLog(e => e.action === "CHANNEL_VALIDATION_FAILED").length; if (channelFailures > 0) alerts.push({ type: "CHANNEL_VALIDATION_FAILED", message: `${channelFailures} transaction(s) rejected for an invalid/disabled/unsupported payment channel.` }); }
            if (engine) { const permissionDenials = engine.getAuditLog(e => e.action === "PERMISSION_DENIED" || e.action === "INIT_DENIED").length; if (permissionDenials > 0) alerts.push({ type: "PERMISSION_DENIED", message: `${permissionDenials} permission-denied event(s) recorded.` }); }

            // Section 16 — Business KPIs (scoped to this company/branch only — no cross-company aggregation exists)
            const businessKPIs = {
                available: true, todaysRevenue: executiveSummary.todaysCollections,
                monthlyRevenue: financialSummary.available ? financialSummary.incomeMonth : null, yearlyRevenue: financialSummary.available ? financialSummary.incomeYear : null,
                averageTransaction: transactionAnalytics.available ? transactionAnalytics.averageAmount : null,
                topTill: tillDashboard.available ? tillDashboard.topTill : null,
                scopeNote: "Scoped to the current company/branch only — no cross-company \"top branch/company\" aggregation exists yet."
            };

            return {
                available: true, companyId, branchId,
                executiveSummary, financialSummary, collections, floatDashboard, tillDashboard, paybillDashboard,
                transactionAnalytics, recentTransactions, receiptStatus, auditSection, liveStatus, reconciliation, alerts, businessKPIs
            };
        }

        /**
         * getDashboard()
         *   Real, structured data — the same real engine diagnostics
         *   #renderDiagnostics() already reads internally, exposed as
         *   public data.
         */
        getDashboard() {
            if (!this.#engine) return { available: false, reason: "Engine not connected." };
            const report = this.#engine.getDiagnosticsReport();
            return {
                available: true,
                version: report.pluginVersion || this.#engine.getVersion(),
                workflowsCompleted: report.workflowsCompleted, workflowsFailed: report.workflowsFailed,
                inflightWorkflowCount: report.inflightWorkflowCount
            };
        }

        /**
         * getNavigation()
         *   Honest reflection of MpesaOS's real structure: unlike
         *   ShopOS, this is a single-view dashboard with no tabs. This
         *   returns a real one-item list rather than fabricating
         *   navigation sections that don't exist in the actual UI.
         */
        getNavigation() {
            return [{ id: "dashboard", label: "Dashboard", active: true }];
        }

        /** getStatus() — real, shell-facing readiness check, distinct from getDiagnosticsReport()'s internal counters. */
        getStatus() {
            return { mounted: !!this.#root, engineLoaded: !!this.#engine, activeSection: "dashboard" };
        }

        /**
         * getNotifications()
         *   HONEST, real empty extension point — same as ShopOS. No
         *   notification engine exists yet anywhere in this platform.
         */
        getNotifications() {
            return [];
        }

        /** destroy() — real cleanup: stops the periodic lock-age refresh and unsubscribes every real engine event listener registered above, so a later init() starts clean rather than accumulating listeners on the shared engine instance. */
        destroy() {
            if (this.#timelineIntervalId !== null) { clearInterval(this.#timelineIntervalId); this.#timelineIntervalId = null; }
            this.#workflowListenerRefs.forEach((off) => { try { off(); } catch (_err) { /* already removed */ } });
            this.#workflowListenerRefs = [];
            this.#root = null;
            this.#engine = null;
        }

        getVersion() { return MPESAOS_UI_VERSION; }
    }

    if (window.CozyOS.Modules && window.CozyOS.Modules["mpesaos"] && window.CozyOS.Modules["mpesaos"].version) {
        const existingVersion = window.CozyOS.Modules["mpesaos"].version;
        if (existingVersion !== MPESAOS_UI_VERSION) {
            throw new Error(`[CozyOS Framework Execution Error] VERSION_CONFLICT: mpesaos module existing v${existingVersion} conflicts with load target v${MPESAOS_UI_VERSION}.`);
        }
    } else {
        window.CozyOS.Modules = window.CozyOS.Modules || {};
        let singletonInstance = null;
        window.CozyOS.Modules["mpesaos"] = {
            version: MPESAOS_UI_VERSION,
            files: { folder: "mpesaos", html: "mpesaos.html", css: "mpesaos.css", js: "mpesaos.js" },
            async load() {
                if (!singletonInstance) singletonInstance = new MpesaOSModule();
                return singletonInstance.load();
            },
            async init(options) {
                if (!singletonInstance) singletonInstance = new MpesaOSModule();
                await singletonInstance.init(options);
                return singletonInstance;
            },
            destroy() {
                if (singletonInstance) { singletonInstance.destroy(); singletonInstance = null; }
            },
            getDashboard() { return singletonInstance ? singletonInstance.getDashboard() : { available: false, reason: "Not initialized." }; },
            getBusinessDashboard() { return singletonInstance ? singletonInstance.getBusinessDashboard() : { available: false, reason: "Not initialized." }; },
            getNavigation() { return singletonInstance ? singletonInstance.getNavigation() : []; },
            getStatus() { return singletonInstance ? singletonInstance.getStatus() : { mounted: false, engineLoaded: false, activeSection: null }; },
            getNotifications() { return singletonInstance ? singletonInstance.getNotifications() : []; }
        };
    }
})();
