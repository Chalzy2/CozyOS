/**
 * CozyAuthenticator App Logic — Milestone 132a Shell Integration
 * File Reference: core/modules/Cozy-Authenticator/authenticator.js
 *
 * The approved Gemini UI (markup, layout, spacing, colors, behavior) is
 * LOCKED and unchanged here — this file only changes HOW it is hosted:
 *   - Was: a standalone page (applications/Cozy-Authenticator/index.html)
 *     with its own <html>/<body>, its own copies of auth-factor-registry.js
 *     and otp-provider.js, Tailwind CDN, and Lucide CDN.
 *   - Now: a module registered under window.CozyOS.Modules["authenticator"],
 *     following the exact real loadModule() contract developer-hub.js
 *     already uses (getDashboard() returns wrapper markup, init() takes
 *     ZERO arguments and resolves its own container). Consumes the
 *     platform's ALREADY-LOADED IdentityEngine / AuthCoordinator /
 *     AuthorizationCoordinator / AuthFactorRegistry / OtpProvider —
 *     never loads or duplicates any of them itself.
 *   - The two CDN scripts are gone. Tailwind's CDN output for this
 *     exact, unchanged markup is now a real local stylesheet
 *     (authenticator.css). Lucide icons are inlined as local SVG below
 *     (ICONS), same visual slots, zero network dependency.
 *
 * Never fabricates a status: every badge reflects an engine's actual
 * loaded/real state as observed at runtime.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    const AUTHENTICATOR_VERSION = "1.0.0-ENTERPRISE";

    const CIRCUMFERENCE = 113; // 2 * PI * r18, matches the approved design's stroke-dasharray
    const COLOR_THEMES = ["emerald", "amber", "purple", "cyan", "rose", "indigo"];

    // ---------- Local icon set (replaces the unpkg.com/lucide CDN — same slots, no network) ----------
    const ICONS = {
        "user-check": '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m17 11 2 2 4-4"/>',
        "shield-check": '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
        "settings": '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9c.1.7.6 1.3 1.3 1.5.2.1.4.1.6.1H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.4 1Z"/>',
        "search": '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
        "scan": '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/>',
        "plus": '<path d="M5 12h14M12 5v14"/>',
        "cpu": '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/>',
        "shield": '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>',
        "check-circle-2": '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
        "copy": '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
        "trash-2": '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/><path d="M10 11v6M14 11v6"/>'
    };
    function icon(name, cls) {
        const body = ICONS[name] || "";
        return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
    }

    // ---------- Approved markup, unchanged structure/layout/spacing/colors from index.html ----------
    function shellHtml() {
        return `
<div class="ca-scope bg-cozy-dark text-slate-100 font-sans antialiased min-h-screen flex flex-col justify-between">
    <header class="h-16 border-b border-cozy-border bg-cozy-surface/90 sticky top-0 z-30 flex items-center justify-between px-4 sm:px-8">
        <div class="flex items-center space-x-3">
            <div class="w-10 h-10 rounded-xl overflow-hidden border border-cozy-gold/40 shadow-md shadow-cozy-emerald/30 bg-black flex items-center justify-center">
                <img src="core/modules/Cozy-Authenticator/797850.png" alt="CozyOS Logo" class="w-full h-full object-cover">
            </div>
            <div>
                <div class="flex items-center space-x-2">
                    <span class="font-extrabold text-white tracking-wider text-sm sm:text-base">CozyAuthenticator</span>
                    <span class="text-[9px] font-bold px-2 py-0.5 rounded bg-cozy-gold/20 text-cozy-gold border border-cozy-gold/30">ENTERPRISE</span>
                </div>
                <p class="text-[10px] text-slate-400">Built for Africa. Ready for the World.</p>
            </div>
        </div>
        <div class="flex items-center space-x-3">
            <div class="hidden sm:flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-cozy-card border border-cozy-border text-xs text-slate-300">
                ${icon("user-check", "w-3.5 h-3.5 text-cozy-success")}<span id="ca-session-label" data-ca="session-label">Checking session…</span>
            </div>
            <button class="p-2 rounded-xl bg-cozy-card hover:bg-cozy-border text-slate-300 hover:text-white transition border border-cozy-border" title="Security Center">${icon("shield-check", "w-5 h-5 text-cozy-success")}</button>
            <button class="p-2 rounded-xl bg-cozy-card hover:bg-cozy-border text-slate-300 hover:text-white transition border border-cozy-border" title="Settings">${icon("settings", "w-5 h-5")}</button>
        </div>
    </header>
    <main class="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        <div class="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div class="relative w-full sm:w-96">
                ${icon("search", "w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2")}
                <input type="text" data-ca="search-input" placeholder="Search accounts, issuers, or tags..."
                    class="w-full bg-cozy-surface border border-cozy-border rounded-xl pl-9 pr-4 py-2 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cozy-gold transition shadow-inner">
            </div>
            <div class="flex items-center space-x-3 w-full sm:w-auto justify-end">
                <button data-ca="scan-qr-btn" class="px-4 py-2 rounded-xl bg-cozy-emerald hover:bg-cozy-emeraldLight text-white font-semibold text-xs transition flex items-center space-x-2 shadow-lg shadow-cozy-emerald/30 border border-cozy-gold/30">${icon("scan", "w-4 h-4 text-cozy-gold")}<span>Scan QR</span></button>
                <button data-ca="manual-setup-btn" class="px-4 py-2 rounded-xl bg-cozy-card hover:bg-cozy-border text-cozy-gold font-semibold text-xs transition flex items-center space-x-2 border border-cozy-gold/40">${icon("plus", "w-4 h-4")}<span>Manual Setup</span></button>
            </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4" data-ca="account-grid">
            <div class="glass-card p-6 rounded-2xl text-center text-sm text-slate-400 md:col-span-2" data-ca="empty-state">
                No accounts enrolled yet. Use <strong class="text-cozy-gold">Manual Setup</strong> to add one — QR enrollment isn't available this milestone.
            </div>
        </div>
        <div class="glass-panel p-5 rounded-2xl space-y-4">
            <div class="flex items-center justify-between border-b border-cozy-border pb-3">
                <div class="flex items-center space-x-2">${icon("cpu", "w-4 h-4 text-cozy-gold")}<span class="text-xs font-bold text-white uppercase tracking-wider">CozyOS Engine Integration Status</span></div>
                <span class="text-[10px] font-mono px-2 py-0.5 rounded border" data-ca="overall-status-badge">CHECKING…</span>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div class="p-3 rounded-xl bg-cozy-dark/60 border border-cozy-border space-y-1"><span class="text-slate-400 block text-[10px]">Identity Engine</span><span class="font-bold text-white flex items-center" data-ca="status-identity"><span class="w-2 h-2 rounded-full bg-slate-500 mr-1.5"></span> Checking…</span></div>
                <div class="p-3 rounded-xl bg-cozy-dark/60 border border-cozy-border space-y-1"><span class="text-slate-400 block text-[10px]">Auth Coordinator</span><span class="font-bold text-white flex items-center" data-ca="status-authcoord"><span class="w-2 h-2 rounded-full bg-slate-500 mr-1.5"></span> Checking…</span></div>
                <div class="p-3 rounded-xl bg-cozy-dark/60 border border-cozy-border space-y-1"><span class="text-slate-400 block text-[10px]">Authorization</span><span class="font-bold text-white flex items-center" data-ca="status-authz"><span class="w-2 h-2 rounded-full bg-slate-500 mr-1.5"></span> Checking…</span></div>
                <div class="p-3 rounded-xl bg-cozy-dark/60 border border-cozy-border space-y-1"><span class="text-slate-400 block text-[10px]">Factor Registry</span><span class="font-bold text-white flex items-center" data-ca="status-factors"><span class="w-2 h-2 rounded-full bg-slate-500 mr-1.5"></span> Checking…</span></div>
            </div>
            <div class="pt-2 border-t border-cozy-border/60">
                <div class="text-[10px] text-slate-400 uppercase tracking-wider mb-2">Factor Detail (live from AuthFactorRegistry)</div>
                <div class="flex flex-wrap gap-2" data-ca="factor-detail-list"></div>
            </div>
        </div>
    </main>
    <div class="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-40" data-ca="enroll-backdrop" hidden>
        <div class="glass-panel w-full max-w-sm rounded-2xl p-6 space-y-3">
            <h2 class="text-sm font-bold text-white">Add Account (Manual Entry)</h2>
            <div><label class="text-[10px] text-slate-400 block mb-1">Issuer</label><input data-ca="issuer-input" type="text" placeholder="e.g. CozyOS" class="w-full bg-cozy-surface border border-cozy-border rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cozy-gold"></div>
            <div><label class="text-[10px] text-slate-400 block mb-1">Account Name</label><input data-ca="accountname-input" type="text" placeholder="e.g. jane@cozyos.dev" class="w-full bg-cozy-surface border border-cozy-border rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cozy-gold"></div>
            <p class="text-[10px] text-cozy-error" data-ca="enroll-error" hidden></p>
            <div class="flex justify-end gap-2 pt-2">
                <button data-ca="enroll-cancel-btn" class="px-3 py-1.5 rounded-lg bg-cozy-card border border-cozy-border text-slate-300 text-xs">Cancel</button>
                <button data-ca="enroll-confirm-btn" class="px-3 py-1.5 rounded-lg bg-cozy-emerald text-white text-xs font-semibold">Create</button>
            </div>
        </div>
    </div>
    <div data-ca="toast" class="fixed bottom-6 left-1/2 -translate-x-1/2 bg-cozy-card border border-cozy-gold/40 text-white text-xs px-4 py-2 rounded-xl shadow-xl z-50" hidden></div>
    <footer class="py-4 px-6 border-t border-cozy-border bg-cozy-surface text-center text-xs text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-2">
        <div class="flex items-center space-x-2"><span class="font-bold text-white">CozyAuthenticator v4.2.0</span><span>&copy; 2026 CozyOS Enterprise. Built for Africa. Ready for the World.</span></div>
        <div class="flex items-center space-x-4"><a href="#" class="hover:text-cozy-gold transition">Security Center</a><a href="#" class="hover:text-cozy-gold transition">Backup &amp; Restore</a><a href="#" class="hover:text-cozy-gold transition">Documentation</a></div>
    </footer>
</div>`;
    }

    class CozyAuthenticatorUI {
        #container = null;
        #tickHandle = null;
        #currentUserId = null;
        #isAdmin = false;

        getVersion() { return AUTHENTICATOR_VERSION; }
        #q(sel) { return this.#container ? this.#container.querySelector(sel) : null; }
        #qa(sel) { return this.#container ? [...this.#container.querySelectorAll(sel)] : []; }
        #escapeHtml(s) { const d = document.createElement("div"); d.textContent = String(s); return d.innerHTML; }

        #showToast(message, ms = 2600) {
            const el = this.#q('[data-ca="toast"]');
            if (!el) return;
            el.textContent = message;
            el.hidden = false;
            clearTimeout(this._toastT);
            this._toastT = setTimeout(() => { el.hidden = true; }, ms);
        }
        #copyText(text) {
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(() => {});
        }
        #badgeHtml(dotColorClass, label) {
            return `<span class="w-2 h-2 rounded-full ${dotColorClass} mr-1.5 animate-pulse"></span> ${label}`;
        }

        // ---------- Engine status (real, never fabricated — consumes the
        // platform's ALREADY-LOADED engines only; never loads its own) ----------
        #renderSessionStatus() {
            const coord = window.CozyOS && window.CozyOS.AuthCoordinator;
            const label = this.#q('[data-ca="session-label"]');
            if (!label) return;
            if (!coord || typeof coord.isAuthenticated !== "function") { label.textContent = "AuthCoordinator not loaded"; return; }
            const authed = coord.isAuthenticated();
            if (!authed) { label.innerHTML = "No active session"; return; }
            const identity = typeof coord.getCurrentIdentity === "function" ? coord.getCurrentIdentity() : null;
            const name = (identity && (identity.username || identity.email || identity.userId)) || "Signed in";
            label.innerHTML = `Admin: <strong class="text-white">${this.#escapeHtml(name)}</strong>`;
        }

        #renderEngineStatusCards() {
            const identityEngine = window.CozyOS && window.CozyOS.IdentityEngine;
            const authCoord = window.CozyOS && window.CozyOS.AuthCoordinator;
            const authzCoord = window.CozyOS && window.CozyOS.AuthorizationCoordinator;
            const factorRegistry = window.CozyOS && window.CozyOS.AuthFactorRegistry;

            this.#q('[data-ca="status-identity"]').innerHTML = (identityEngine && typeof identityEngine.getVersion === "function") ? this.#badgeHtml("bg-cozy-success", "Active") : this.#badgeHtml("bg-slate-500", "Not Loaded");
            this.#q('[data-ca="status-authcoord"]').innerHTML = (authCoord && typeof authCoord.isAuthenticated === "function") ? this.#badgeHtml("bg-cozy-success", "Connected") : this.#badgeHtml("bg-slate-500", "Not Loaded");
            this.#q('[data-ca="status-authz"]').innerHTML = (authzCoord && typeof authzCoord.authorize === "function") ? this.#badgeHtml("bg-cozy-success", "Enforced") : this.#badgeHtml("bg-slate-500", "Not Loaded");

            let allLoaded = !!(identityEngine && authCoord && authzCoord && factorRegistry);
            const factorsEl = this.#q('[data-ca="status-factors"]');
            const detailEl = this.#q('[data-ca="factor-detail-list"]');

            if (factorRegistry && typeof factorRegistry.listFactors === "function") {
                const factors = factorRegistry.listFactors();
                const realCount = factors.filter(f => f.isReal).length;
                factorsEl.innerHTML = this.#badgeHtml(realCount > 0 ? "bg-cozy-success" : "bg-cozy-gold", `${realCount}/${factors.length} Real`);
                const displayNames = { face: "Face Unlock", fingerprint: "Fingerprint", voice: "Voice", "security-key": "Passkey", otp: "OTP (TOTP)" };
                const detailFactors = ["fingerprint", "face", "voice", "security-key", "otp"].map(name => factors.find(f => f.factorName === name)).filter(Boolean);
                detailEl.innerHTML = detailFactors.map(f => {
                    const label = displayNames[f.factorName] || f.factorName;
                    const stateText = f.isReal ? "Active" : "Stub";
                    const colorClass = f.isReal ? "bg-cozy-success/20 text-cozy-success border-cozy-success/30" : "bg-slate-500/20 text-slate-400 border-slate-500/30";
                    return `<span class="text-[10px] px-2 py-1 rounded-lg border ${colorClass}" title="${this.#escapeHtml(f.note || "")}">${this.#escapeHtml(label)} — ${stateText}</span>`;
                }).join("");
            } else {
                factorsEl.innerHTML = this.#badgeHtml("bg-slate-500", "Not Loaded");
                detailEl.innerHTML = "";
                allLoaded = false;
            }

            const overall = this.#q('[data-ca="overall-status-badge"]');
            if (allLoaded) { overall.textContent = "ALL SYSTEMS OPERATIONAL"; overall.className = "text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"; }
            else { overall.textContent = "SOME ENGINES NOT LOADED"; overall.className = "text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30"; }
        }

        // ---------- Account cards ----------
        #accountCardHtml(acc, colorTheme) {
            return `
        <div class="glass-card p-5 rounded-2xl relative overflow-hidden group hover:border-cozy-gold/50 transition-all duration-300 shadow-xl" data-account-id="${acc.accountId}">
            <div class="absolute top-0 right-0 w-32 h-32 bg-${colorTheme}-500/10 rounded-full blur-2xl pointer-events-none"></div>
            <div class="flex items-start justify-between">
                <div class="flex items-center space-x-3">
                    <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-${colorTheme}-600 to-${colorTheme}-800 flex items-center justify-center shadow-md border border-${colorTheme}-400/30">${icon("shield", "w-6 h-6 text-white")}</div>
                    <div><div class="text-xs font-semibold text-${colorTheme}-400 uppercase tracking-wider">${this.#escapeHtml(acc.issuer)}</div><h3 class="text-base font-bold text-white">${this.#escapeHtml(acc.accountName)}</h3></div>
                </div>
                <div class="relative w-10 h-10 flex items-center justify-center">
                    <svg class="w-10 h-10 transform -rotate-90">
                        <circle cx="20" cy="20" r="18" stroke="currentColor" stroke-width="3" class="text-cozy-border" fill="transparent" />
                        <circle cx="20" cy="20" r="18" stroke="currentColor" stroke-width="3" class="text-cozy-gold countdown-ring" stroke-dasharray="${CIRCUMFERENCE}" stroke-dashoffset="0" fill="transparent" data-ring="${acc.accountId}" />
                    </svg>
                    <span class="absolute text-[10px] font-mono font-bold text-cozy-gold" data-seconds="${acc.accountId}">--s</span>
                </div>
            </div>
            <div class="mt-5 flex items-center justify-between pt-4 border-t border-cozy-border/60">
                <div>
                    <div class="text-2xl sm:text-3xl font-mono font-black tracking-widest text-white drop-shadow" data-code="${acc.accountId}">------</div>
                    <span class="text-[10px] text-cozy-success flex items-center mt-0.5">${icon("check-circle-2", "w-3 h-3 mr-1")} RFC6238 TOTP Active</span>
                </div>
                <div class="flex items-center space-x-2">
                    <button class="p-2.5 rounded-xl bg-cozy-surface hover:bg-cozy-border text-slate-300 hover:text-white transition border border-cozy-border" title="Copy OTP" data-copy="${acc.accountId}">${icon("copy", `w-4 h-4 text-${colorTheme}-400`)}</button>
                    <button class="p-2.5 rounded-xl bg-cozy-surface hover:bg-cozy-border text-slate-300 hover:text-white transition border border-cozy-border" title="Remove Account" data-remove="${acc.accountId}">${icon("trash-2", "w-4 h-4")}</button>
                </div>
            </div>
        </div>`;
        }

        #renderAccountGrid(provider) {
            const grid = this.#q('[data-ca="account-grid"]');
            const accounts = provider.listAccounts();
            const searchInput = this.#q('[data-ca="search-input"]');
            const query = ((searchInput && searchInput.value) || "").toLowerCase().trim();
            const filtered = query ? accounts.filter(a => a.issuer.toLowerCase().includes(query) || a.accountName.toLowerCase().includes(query)) : accounts;

            grid.querySelectorAll("[data-account-id]").forEach(el => el.remove());
            const emptyState = this.#q('[data-ca="empty-state"]');
            if (accounts.length === 0) { emptyState.hidden = false; emptyState.innerHTML = `No accounts enrolled yet. Use <strong class="text-cozy-gold">Manual Setup</strong> to add one — QR enrollment isn't available this milestone.`; }
            else if (filtered.length === 0) { emptyState.hidden = false; emptyState.textContent = "No accounts match your search."; }
            else { emptyState.hidden = true; }

            filtered.forEach((acc, i) => { grid.insertAdjacentHTML("beforeend", this.#accountCardHtml(acc, COLOR_THEMES[i % COLOR_THEMES.length])); });
            this.#wireCardActions(provider);
        }

        #wireCardActions(provider) {
            this.#qa("[data-copy]").forEach(btn => {
                btn.onclick = () => {
                    const codeEl = this.#q(`[data-code="${btn.dataset.copy}"]`);
                    if (codeEl) { this.#copyText(codeEl.textContent.replace(/\s/g, "")); this.#showToast("Code copied."); }
                };
            });
            this.#qa("[data-remove]").forEach(btn => { btn.onclick = () => { provider.removeAccount(btn.dataset.remove); this.#renderAccountGrid(provider); }; });
        }

        async #tickCodes(provider) {
            const accounts = provider.listAccounts();
            for (const acc of accounts) {
                const result = await provider.currentCode(acc.accountId);
                if (!result.available) continue;
                const codeEl = this.#q(`[data-code="${acc.accountId}"]`);
                const secEl = this.#q(`[data-seconds="${acc.accountId}"]`);
                const ringEl = this.#q(`[data-ring="${acc.accountId}"]`);
                if (codeEl) codeEl.textContent = result.code.replace(/(\d{3})(\d{3,})/, "$1 $2");
                if (secEl) secEl.textContent = `${result.secondsRemaining}s`;
                if (ringEl) { const fraction = result.secondsRemaining / result.period; ringEl.setAttribute("stroke-dashoffset", String(CIRCUMFERENCE * (1 - fraction))); }
            }
        }

        #wireEnrollModal(provider) {
            const backdrop = this.#q('[data-ca="enroll-backdrop"]');
            const errEl = this.#q('[data-ca="enroll-error"]');
            const open = () => { this.#q('[data-ca="issuer-input"]').value = ""; this.#q('[data-ca="accountname-input"]').value = ""; errEl.hidden = true; backdrop.hidden = false; };
            const close = () => { backdrop.hidden = true; };
            this.#q('[data-ca="manual-setup-btn"]').addEventListener("click", open);
            this.#q('[data-ca="enroll-cancel-btn"]').addEventListener("click", close);
            this.#q('[data-ca="enroll-confirm-btn"]').addEventListener("click", () => {
                const issuer = this.#q('[data-ca="issuer-input"]').value.trim();
                const accountName = this.#q('[data-ca="accountname-input"]').value.trim();
                const result = provider.enrollAccount({ issuer, accountName });
                if (!result.success) { errEl.hidden = false; errEl.textContent = result.reason; return; }
                close();
                this.#renderAccountGrid(provider);
            });
        }

        #wireScanQrPlaceholder() {
            // Locked: UI placeholder only. No camera permission, no decoding, no account creation.
            this.#q('[data-ca="scan-qr-btn"]').addEventListener("click", () => this.#showToast("QR Scanner Module Pending — coming in a future milestone."));
        }
        #wireSearch(provider) {
            this.#q('[data-ca="search-input"]').addEventListener("input", () => this.#renderAccountGrid(provider));
        }

        /** init() — real loadModule() contract: called with ZERO arguments
         *  after getDashboard()'s wrapper is already in the DOM. Resolves
         *  its own container by id, exactly like developer-hub.js.
         *  Milestone 347 real fix: also accepts the {container, userId,
         *  isAdmin} options object ApplicationLauncher now sends
         *  (composing the real CozyOS.Auth identity) — a raw DOM node
         *  (the pre-existing initStandaloneMount() convention below)
         *  still works unchanged. */
        async init(arg) {
            const isDomNode = arg && typeof arg === "object" && typeof arg.nodeType === "number";
            const { container = null, userId = null, isAdmin = false } = isDomNode ? { container: arg } : (arg || {});
            this.#container = container || document.getElementById("cozy-authenticator-root") || document.getElementById("cozy-app-root");
            if (!this.#container) return;
            this.#currentUserId = userId;
            this.#isAdmin = isAdmin;
            this.#container.innerHTML = shellHtml();

            this.#renderSessionStatus();
            this.#renderEngineStatusCards();
            this.#wireScanQrPlaceholder();

            const provider = window.CozyOS && window.CozyOS.OtpProvider;
            if (!provider) { this.#showToast("OtpProvider failed to load — account features unavailable.", 6000); return; }
            this.#wireEnrollModal(provider);
            this.#wireSearch(provider);
            this.#renderAccountGrid(provider);
            await this.#tickCodes(provider);
            this.#tickHandle = setInterval(() => this.#tickCodes(provider), 1000);
        }

        destroy() {
            if (this.#tickHandle) { clearInterval(this.#tickHandle); this.#tickHandle = null; }
            if (this.#container) this.#container.innerHTML = "";
            this.#container = null;
        }
    }

    if (window.CozyOS.Modules["authenticator"] && window.CozyOS.Modules["authenticator"].version) {
        const existingVersion = window.CozyOS.Modules["authenticator"].version;
        if (existingVersion !== AUTHENTICATOR_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: authenticator module existing v${existingVersion} conflicts with load target v${AUTHENTICATOR_VERSION}.`);
    } else {
        let singletonInstance = null;
        window.CozyOS.Modules["authenticator"] = {
            version: AUTHENTICATOR_VERSION,
            files: { folder: "Cozy-Authenticator", css: "authenticator.css", js: "authenticator.js" },
            getDashboard() { return '<div id="cozy-authenticator-root"></div>'; },
            async init(container) {
                if (!singletonInstance) singletonInstance = new CozyAuthenticatorUI();
                await singletonInstance.init(container);
                return singletonInstance;
            },
            destroy() { if (singletonInstance) { singletonInstance.destroy(); singletonInstance = null; } }
        };
    }

    // Milestone 214 — real Service Registry registration, matching the
    // exact pattern QuarryOS/MpesaOS/ShopOS already use. Never
    // duplicates window.CozyOS.Modules["authenticator"] above (which
    // remains the real mount/init mechanism) — this only announces the
    // application in the general-purpose catalog for dashboard display.
    try {
        if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerApplication === "function") {
            window.CozyOS.ServiceRegistry.registerApplication({
                id: "authenticator", name: "Authenticator", version: AUTHENTICATOR_VERSION,
                category: "business-application", icon: "authenticator.svg", enabled: true,
                launcher: "core/modules/Cozy-Authenticator/authenticator.js", entryPoint: "core/modules/Cozy-Authenticator/authenticator.js",
                sourcePath: "core/modules/Cozy-Authenticator/authenticator.js", certificationStatus: "NOT_CERTIFIED"
            });
        }
    } catch (_err) { /* non-fatal */ }

    // Standalone-mount fallback, same convention as developer-hub.js — only
    // relevant if this module is ever opened directly without cozy-shell.
    function initStandaloneMount() {
        const root = document.getElementById("cozy-app-root") || document.getElementById("cozy-authenticator-root");
        if (!root) return false;
        window.CozyOS.Modules["authenticator"].init(root);
        return true;
    }
    if (document.readyState === "complete" || document.readyState === "interactive") {
        let attempts = 0;
        const intervalId = setInterval(() => { attempts++; if (initStandaloneMount() || attempts >= 40) clearInterval(intervalId); }, 50);
    } else {
        document.addEventListener("DOMContentLoaded", () => { initStandaloneMount(); });
    }
})();
