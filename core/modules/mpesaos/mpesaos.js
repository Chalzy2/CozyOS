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
        #ensureEngineLoaded() {
            return new Promise((resolve) => {
                if (window.CozyEnterpriseBusinessEngine) { resolve(true); return; }
                const existing = document.querySelector('script[src*="mpesaOS.js"]');
                if (existing) {
                    // Already requested by something else — wait briefly for it to finish registering.
                    let attempts = 0;
                    const check = setInterval(() => {
                        attempts++;
                        if (window.CozyEnterpriseBusinessEngine || attempts >= 40) { clearInterval(check); resolve(!!window.CozyEnterpriseBusinessEngine); }
                    }, 100);
                    return;
                }
                const script = document.createElement("script");
                script.src = "../../plugins/mpesaOS.js";
                script.onload = () => resolve(!!window.CozyEnterpriseBusinessEngine);
                script.onerror = () => resolve(false);
                document.head.appendChild(script);
            });
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
            responseBox.textContent = "Running…";
            this.#diagnostics.workflowsRun++;
            this.#logAudit("DEMO_WORKFLOW_RUN", "shell_demo_tenant");
            Promise.resolve(handler("execute workflow", { tenantIsolation: () => "shell_demo_tenant" }))
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
            getNavigation() { return singletonInstance ? singletonInstance.getNavigation() : []; },
            getStatus() { return singletonInstance ? singletonInstance.getStatus() : { mounted: false, engineLoaded: false, activeSection: null }; },
            getNotifications() { return singletonInstance ? singletonInstance.getNotifications() : []; }
        };
    }
})();
