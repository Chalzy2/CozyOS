/**
 * CozyOS — Administrator Login Gate
 * File Reference: core/shell/cozy-login-gate.js
 * Layer: Core / Shell UI
 * Version: 2.0.0-ENTERPRISE
 * Milestone: 125-UI
 *
 * ═══════════════════════════════════════════════════════════════════════
 * DESIGN STANDARD
 * ═══════════════════════════════════════════════════════════════════════
 *   Visual design (layout, colors, glassmorphism, animations, component
 *   arrangement, responsive structure) is the supplied CozyOS Enterprise
 *   Login Gate HTML, adopted as-is per Milestone 125 Design Standard.
 *   Not redesigned. Only demo content was replaced with real wiring.
 *
 * CANONICAL OWNERSHIP
 *   Owns: UI, user interaction, navigation, display, calling existing
 *   coordinators. Nothing else.
 *
 *   Does NOT own — and never re-implements:
 *     ✗ Authentication — window.CozyOS.AuthCoordinator
 *       (loginWithCredentials / restoreSession / logout / isAuthenticated
 *       / getLoginHistory / changePassword).
 *     ✗ "Who is current" — window.CozyOS.Auth.getCurrentIdentity(), read
 *       only, via AuthCoordinator.getCurrentIdentity().
 *     ✗ Identities — IdentityEngine.
 *     ✗ Sessions — CozyOS.Session.
 *     ✗ Themes — CozyOS.Theme / LivingThemeEngine (this file only calls
 *       Theme.setTheme() with whatever cozyThemeName LivingThemeEngine
 *       reports active — never invents colors itself).
 *     ✗ Messages — LivingMessageEngine (this file only displays
 *       whatever pickNextMessage()/getEligibleMessages() returns —
 *       never fabricates a broadcast).
 *     ✗ Modes — ModeEngine.
 *     ✗ WorkspaceShell's own UI.
 *
 * MILESTONE 125-UI SCOPE
 *   Real: Username/Password/Remember Me/Sign In, Change Password, Login
 *   History, live IdentityEngine/AuthCoordinator/Session status, Living
 *   Theme/Message/Mode Engine integration.
 *   Explicitly NOT built yet (rendered as disabled "Coming in Milestone
 *   125b/125c", never faked): Create First Administrator, Forgot/Reset
 *   Password, Trusted Devices, Administrator Recovery (phrase/questions/
 *   key/emergency code), WebAuthn/Passkeys/biometrics.
 *
 * HONEST SCOPE / KNOWN SIMPLIFICATION
 *   WorkspaceShell has no unmount(); logout does a real full page reload
 *   after AuthCoordinator.logout() completes, same as the prior version.
 *   Tailwind/Lucide are loaded on demand by this file (dashboard.html
 *   does not otherwise use them) since the supplied design depends on
 *   both — this is a UI dependency the Login Gate owns for its own
 *   rendering, not a change to any other module.
 */

(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const GATE_VERSION = "2.0.0-ENTERPRISE"; // Milestone 125-UI: real design standard adopted

    function escapeHtml(v) {
        return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    function waitFor(check, { timeoutMs = 15000, intervalMs = 200 } = {}) {
        return new Promise((resolve) => {
            if (check()) return resolve(true);
            let waited = 0;
            const interval = setInterval(() => {
                waited += intervalMs;
                if (check()) { clearInterval(interval); resolve(true); }
                else if (waited >= timeoutMs) { clearInterval(interval); resolve(false); }
            }, intervalMs);
        });
    }

    /**
     * Vendor assets (Milestone 125-UI): the supplied design requires
     * Tailwind (CDN, JIT) and Lucide icons. Neither is loaded elsewhere
     * in CozyOS. Injected once, real <script> elements (not innerHTML,
     * which never executes scripts), so Tailwind's config callback and
     * Lucide's global actually run.
     */
    let vendorReadyPromise = null;
    function ensureVendorAssets() {
        if (vendorReadyPromise) return vendorReadyPromise;
        vendorReadyPromise = new Promise((resolve) => {
            let pending = 0;
            function done() { pending--; if (pending <= 0) resolve(true); }

            if (!window.tailwind) {
                pending++;
                const tw = document.createElement("script");
                tw.src = "https://cdn.tailwindcss.com";
                tw.onload = () => {
                    if (window.tailwind && typeof window.tailwind.config === "object" || true) {
                        window.tailwind.config = {
                            darkMode: "class",
                            theme: { extend: { colors: {
                                cozy: { emerald: "#1B5E20", emeraldLight: "#2E7D32", gold: "#F9A825", goldLight: "#FBC02D", dark: "#0A0F0D", surface: "#111A14", card: "#16231A", border: "#233827", muted: "#81C784" }
                            } } }
                        };
                    }
                    done();
                };
                tw.onerror = done;
                document.head.appendChild(tw);
            }
            if (!window.lucide) {
                pending++;
                const lu = document.createElement("script");
                lu.src = "https://unpkg.com/lucide@latest";
                lu.onload = done;
                lu.onerror = done;
                document.head.appendChild(lu);
            }
            if (pending === 0) resolve(true);
        });
        return vendorReadyPromise;
    }

    function refreshIcons() {
        try { if (window.lucide && typeof window.lucide.createIcons === "function") window.lucide.createIcons(); }
        catch (_err) { /* icons are cosmetic only — never block auth on this */ }
    }

    /** Live Subsystem Status (Milestone 125-UI) — real presence/version checks, never simulated. */
    function subsystemStatus() {
        const check = (obj) => !!(obj && typeof obj.getVersion === "function");
        return {
            identityEngine: check(window.CozyOS.IdentityEngine),
            authCoordinator: check(window.CozyOS.AuthCoordinator),
            session: check(window.CozyOS.Session)
        };
    }

    function statusDot(running) {
        return `<span class="w-2 h-2 rounded-full ${running ? "bg-emerald-500" : "bg-slate-600"}" title="${running ? "Running" : "Not Loaded"}"></span>`;
    }

    /**
     * Living Theme Engine integration (Milestone 125-UI) — applies
     * whatever theme LivingThemeEngine actually reports scheduled/active
     * via the real owner, CozyOS.Theme. If nothing is scheduled (true on
     * a fresh install — nothing pre-registers a theme), the page keeps
     * the design standard's own default styling. Never invents a theme.
     */
    function applyLivingTheme() {
        try {
            const engine = window.CozyOS.LivingThemeEngine;
            const themeController = window.CozyOS.Theme;
            if (!engine || typeof engine.getActiveTheme !== "function") return;
            const active = engine.getActiveTheme();
            if (active && active.cozyThemeName && themeController && typeof themeController.setTheme === "function") {
                themeController.setTheme(active.cozyThemeName);
            }
        } catch (_err) { /* theme application is cosmetic — never blocks auth */ }
    }

    /**
     * Living Message Engine integration (Milestone 125-UI) — real
     * pickNextMessage()/getEligibleMessages() call. If no message is
     * eligible (true by default — nothing pre-registers one), this is
     * displayed honestly rather than showing a fabricated broadcast.
     */
    function getBroadcastMessage() {
        try {
            const engine = window.CozyOS.LivingMessageEngine;
            if (!engine) return null;
            if (typeof engine.pickNextMessage === "function") {
                const msg = engine.pickNextMessage({ mode: "sequential" });
                if (msg && msg.text) return msg.text;
            }
            if (typeof engine.getEligibleMessages === "function") {
                const list = engine.getEligibleMessages();
                if (list && list.length && list[0].text) return list[0].text;
            }
            return null;
        } catch (_err) { return null; }
    }

    /** Mode Engine integration (Milestone 125-UI) — real getActiveMode(), display-only. */
    function getActiveModeLabel() {
        try {
            const engine = window.CozyOS.ModeEngine;
            if (!engine || typeof engine.getActiveMode !== "function") return null;
            const mode = engine.getActiveMode();
            return mode ? mode.modeId : null;
        } catch (_err) { return null; }
    }

    function comingSoonBadge(milestone) {
        return `<span class="px-2 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30">Coming in Milestone ${escapeHtml(milestone)}</span>`;
    }

    function renderLoginForm(container) {
        const status = subsystemStatus();
        const broadcast = getBroadcastMessage();
        const activeMode = getActiveModeLabel();

        container.innerHTML = `
        <div class="bg-cozy-dark text-slate-100 font-sans antialiased min-h-screen flex flex-col justify-between relative overflow-x-hidden">
            <div class="absolute inset-0 pointer-events-none z-0 overflow-hidden">
                <div class="absolute -top-40 -left-40 w-96 h-96 bg-cozy-emerald/20 rounded-full blur-3xl"></div>
                <div class="absolute top-1/3 -right-20 w-80 h-80 bg-cozy-gold/10 rounded-full blur-3xl"></div>
                <div class="absolute -bottom-20 left-1/3 w-96 h-96 bg-cozy-emerald/15 rounded-full blur-3xl"></div>
                <div class="absolute inset-0 opacity-[0.03]" style="background-image: radial-gradient(#81C784 1px, transparent 1px); background-size: 32px 32px;"></div>
            </div>

            <main class="relative z-10 flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
                <div class="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">

                    <div class="lg:col-span-5 flex flex-col justify-between space-y-6 p-6 sm:p-8 rounded-2xl glass-panel-subtle shadow-2xl relative overflow-hidden">
                        <div class="space-y-4">
                            <div class="flex items-center space-x-3">
                                <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-cozy-emerald to-cozy-emeraldLight flex items-center justify-center shadow-lg shadow-cozy-emerald/30 border border-cozy-muted/30">
                                    <i data-lucide="shield-check" class="w-6 h-6 text-cozy-gold"></i>
                                </div>
                                <div>
                                    <div class="flex items-center space-x-2">
                                        <span class="font-black tracking-wider text-lg text-white">COZYOS</span>
                                        ${activeMode ? `<span class="text-[10px] font-bold px-2 py-0.5 rounded bg-cozy-gold/20 text-cozy-gold border border-cozy-gold/30">${escapeHtml(activeMode)}</span>` : ""}
                                    </div>
                                    <p class="text-xs text-cozy-muted">Enterprise Smart Living Solutions</p>
                                </div>
                            </div>
                            <div class="pt-2">
                                <h1 class="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Enterprise Access Portal</h1>
                                <p class="text-xs sm:text-sm text-slate-300 mt-1 leading-relaxed">Secure administrative gateway for CozyOS infrastructure nodes, worker clusters, and vertical engines.</p>
                            </div>
                        </div>

                        <div class="p-4 rounded-xl bg-cozy-card/80 border border-cozy-border relative">
                            <div class="flex items-center space-x-2 text-cozy-gold text-xs font-semibold mb-1">
                                <i data-lucide="sparkles" class="w-3.5 h-3.5"></i>
                                <span>SYSTEM BROADCAST</span>
                            </div>
                            <p class="text-xs text-slate-200 italic">${broadcast ? escapeHtml(broadcast) : "No live broadcast currently scheduled."}</p>
                        </div>

                        <div class="space-y-2 pt-4 border-t border-cozy-border/60">
                            <div class="flex items-center justify-between text-xs">
                                <span class="text-slate-400">Identity Engine</span>
                                <div class="flex items-center space-x-1.5">${statusDot(status.identityEngine)}<span>${status.identityEngine ? "Running" : "Not Loaded"}</span></div>
                            </div>
                            <div class="flex items-center justify-between text-xs">
                                <span class="text-slate-400">Auth Coordinator</span>
                                <div class="flex items-center space-x-1.5">${statusDot(status.authCoordinator)}<span>${status.authCoordinator ? "Running" : "Not Loaded"}</span></div>
                            </div>
                            <div class="flex items-center justify-between text-xs">
                                <span class="text-slate-400">Session</span>
                                <div class="flex items-center space-x-1.5">${statusDot(status.session)}<span>${status.session ? "Running" : "Not Loaded"}</span></div>
                            </div>
                        </div>
                    </div>

                    <div class="lg:col-span-7">
                        <div class="glass-panel p-6 sm:p-8 rounded-2xl shadow-2xl space-y-6">

                            <div class="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-cozy-border gap-3">
                                <div>
                                    <h2 class="text-lg font-bold text-white tracking-wide">Administrator Login</h2>
                                    <p class="text-xs text-slate-400 mt-0.5">Authenticate with elevated administrative privileges.</p>
                                </div>
                            </div>

                            <form id="cozy-login-credentials-form" class="space-y-4">
                                <div class="space-y-1">
                                    <label class="block text-xs font-medium text-slate-300">Administrator Username</label>
                                    <div class="relative">
                                        <i data-lucide="user" class="w-4 h-4 text-cozy-muted absolute left-3 top-1/2 -translate-y-1/2"></i>
                                        <input id="cozy-login-username" type="text" autocomplete="username" required
                                            class="w-full bg-cozy-dark/80 border border-cozy-border rounded-xl pl-9 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cozy-gold focus:ring-1 focus:ring-cozy-gold transition">
                                    </div>
                                </div>

                                <div class="space-y-1">
                                    <div class="flex items-center justify-between">
                                        <label class="block text-xs font-medium text-slate-300">Password</label>
                                        <span class="text-[11px] text-slate-500 cursor-not-allowed" title="Coming in Milestone 125b">Forgot Password?</span>
                                    </div>
                                    <div class="relative">
                                        <i data-lucide="lock" class="w-4 h-4 text-cozy-muted absolute left-3 top-1/2 -translate-y-1/2"></i>
                                        <input id="cozy-login-password" type="password" autocomplete="current-password" required
                                            class="w-full bg-cozy-dark/80 border border-cozy-border rounded-xl pl-9 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cozy-gold focus:ring-1 focus:ring-cozy-gold transition">
                                    </div>
                                </div>

                                <div class="flex items-center justify-between text-xs py-1">
                                    <label class="flex items-center space-x-2 cursor-pointer">
                                        <input id="cozy-login-remember-me" type="checkbox" checked class="w-4 h-4 rounded bg-cozy-dark border-cozy-border accent-cozy-emerald">
                                        <span class="text-slate-300">Remember Me</span>
                                    </label>
                                    <label class="flex items-center space-x-2 opacity-50 cursor-not-allowed" title="Coming in Milestone 125b">
                                        <input type="checkbox" disabled class="w-4 h-4 rounded bg-cozy-dark border-cozy-border">
                                        <span class="text-slate-400">Trusted Device</span>
                                    </label>
                                </div>

                                <button type="submit" class="w-full py-3 rounded-xl bg-gradient-to-r from-cozy-emerald to-cozy-emeraldLight hover:from-cozy-emeraldLight hover:to-emerald-600 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-cozy-emerald/40 border border-cozy-gold/30 transition transform active:scale-[0.99] flex items-center justify-center space-x-2">
                                    <i data-lucide="log-in" class="w-4 h-4 text-cozy-gold"></i>
                                    <span>Sign In to CozyOS Enterprise</span>
                                </button>

                                <div id="cozy-login-error" style="display:none;" class="mt-2 p-2.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/30 text-xs"></div>
                            </form>

                            <div class="pt-3 border-t border-cozy-border">
                                <div class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                                    <span>Biometric &amp; Hardware Keys</span>
                                    ${comingSoonBadge("125c")}
                                </div>
                                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 opacity-50">
                                    <div class="flex flex-col items-center justify-center p-2.5 rounded-xl bg-cozy-dark/60 border border-cozy-border text-slate-400 cursor-not-allowed"><i data-lucide="key-round" class="w-4 h-4 mb-1"></i><span class="text-[10px] font-medium">Passkeys</span></div>
                                    <div class="flex flex-col items-center justify-center p-2.5 rounded-xl bg-cozy-dark/60 border border-cozy-border text-slate-400 cursor-not-allowed"><i data-lucide="fingerprint" class="w-4 h-4 mb-1"></i><span class="text-[10px] font-medium">Fingerprint</span></div>
                                    <div class="flex flex-col items-center justify-center p-2.5 rounded-xl bg-cozy-dark/60 border border-cozy-border text-slate-400 cursor-not-allowed"><i data-lucide="scan-face" class="w-4 h-4 mb-1"></i><span class="text-[10px] font-medium">Face Unlock</span></div>
                                    <div class="flex flex-col items-center justify-center p-2.5 rounded-xl bg-cozy-dark/60 border border-cozy-border text-slate-400 cursor-not-allowed"><i data-lucide="hash" class="w-4 h-4 mb-1"></i><span class="text-[10px] font-medium">Device PIN</span></div>
                                </div>
                            </div>

                            <details class="group pt-2 border-t border-cozy-border">
                                <summary class="flex items-center justify-between text-xs font-semibold text-slate-300 cursor-pointer list-none py-1">
                                    <span class="flex items-center space-x-2">
                                        <i data-lucide="shield-alert" class="w-3.5 h-3.5 text-cozy-gold"></i>
                                        <span>Administrator Recovery &amp; Emergency Options</span>
                                    </span>
                                    ${comingSoonBadge("125b")}
                                </summary>
                                <div class="mt-3 space-y-2 text-xs opacity-60">
                                    <div class="flex items-center justify-between p-2 rounded-lg bg-cozy-dark/50 border border-cozy-border"><span class="text-slate-300">Recovery Phrase</span>${comingSoonBadge("125b")}</div>
                                    <div class="flex items-center justify-between p-2 rounded-lg bg-cozy-dark/50 border border-cozy-border"><span class="text-slate-300">Recovery Questions</span>${comingSoonBadge("125b")}</div>
                                    <div class="flex items-center justify-between p-2 rounded-lg bg-cozy-dark/50 border border-cozy-border"><span class="text-slate-300">Recovery Key</span>${comingSoonBadge("125b")}</div>
                                    <div class="flex items-center justify-between p-2 rounded-lg bg-cozy-dark/50 border border-cozy-border"><span class="text-slate-300">Emergency Recovery Code</span>${comingSoonBadge("125b")}</div>
                                </div>
                            </details>

                            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-cozy-border text-center">
                                <span class="p-2 rounded-lg bg-cozy-dark/40 text-[11px] text-slate-500 border border-cozy-border/60 cursor-not-allowed" title="Coming in Milestone 125b">Reset Password</span>
                                <span class="p-2 rounded-lg bg-cozy-dark/40 text-[11px] text-slate-500 border border-cozy-border/60 cursor-not-allowed" title="Coming in Milestone 125b">Create Admin</span>
                                <span class="p-2 rounded-lg bg-cozy-dark/40 text-[11px] text-slate-500 border border-cozy-border/60 cursor-not-allowed" title="Sign in to view Login History">Login History</span>
                                <span class="p-2 rounded-lg bg-cozy-dark/40 text-[11px] text-slate-500 border border-cozy-border/60 cursor-not-allowed" title="Coming in Milestone 125b">Trusted Devices</span>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>`;

        refreshIcons();
    }

    function showError(container, message) {
        const el = container.querySelector("#cozy-login-error");
        if (!el) return;
        el.textContent = message;
        el.style.display = "block";
    }

    function closeModal() { document.getElementById("cozy-auth-modal")?.remove(); }

    function openModal(title, bodyHtml) {
        closeModal();
        const modal = document.createElement("div");
        modal.id = "cozy-auth-modal";
        modal.className = "fixed inset-0 z-[100000] bg-black/50 flex items-center justify-center font-sans";
        modal.innerHTML = `
            <div class="bg-cozy-card border border-cozy-border text-slate-100 max-w-md w-[90%] max-h-[80vh] overflow-auto rounded-2xl p-5">
                <div class="flex justify-between items-center mb-3">
                    <h3 class="text-sm font-bold text-white">${escapeHtml(title)}</h3>
                    <button id="cozy-auth-modal-close" class="text-slate-400 hover:text-white text-sm">✕</button>
                </div>
                ${bodyHtml}
            </div>`;
        document.body.appendChild(modal);
        document.getElementById("cozy-auth-modal-close").addEventListener("click", closeModal);
        return modal;
    }

    /** Login History (Milestone 125a/125-UI) — reads AuthCoordinator.getLoginHistory(), which reads IdentityEngine's existing audit log. No new storage. */
    function openLoginHistory(userId) {
        const result = window.CozyOS.AuthCoordinator.getLoginHistory(userId);
        const rows = (result.entries || []).slice().reverse().map(e =>
            `<tr><td class="py-1 px-2 text-[11px] text-slate-300">${escapeHtml(e.timestamp)}</td><td class="py-1 px-2 text-[11px] text-slate-300">${escapeHtml(e.action)}</td></tr>`
        ).join("") || `<tr><td colspan="2" class="py-2 px-2 text-[11px] text-slate-500">No login history recorded yet.</td></tr>`;
        openModal("Login History", `<table class="w-full border-collapse">${rows}</table>`);
    }

    /** Change Password (Milestone 125a/125-UI) — real self-service change via AuthCoordinator.changePassword() → IdentityEngine.changePassword(), which verifies the current password. */
    function openChangePassword(userId) {
        const modal = openModal("Change Password", `
            <form id="cozy-change-password-form" class="flex flex-col gap-3">
                <label class="text-xs text-slate-300">Current Password
                    <input id="cozy-cp-old" type="password" autocomplete="current-password" required class="block w-full box-border p-2 mt-1 bg-cozy-dark border border-cozy-border rounded-lg text-xs text-white">
                </label>
                <label class="text-xs text-slate-300">New Password
                    <input id="cozy-cp-new" type="password" autocomplete="new-password" required class="block w-full box-border p-2 mt-1 bg-cozy-dark border border-cozy-border rounded-lg text-xs text-white">
                </label>
                <button type="submit" class="py-2.5 rounded-lg bg-cozy-emerald text-white text-xs font-bold">Change Password</button>
                <div id="cozy-cp-error" style="display:none;" class="text-red-400 text-xs"></div>
            </form>`);
        modal.querySelector("#cozy-change-password-form").addEventListener("submit", async (e) => {
            e.preventDefault();
            const oldPassword = modal.querySelector("#cozy-cp-old").value;
            const newPassword = modal.querySelector("#cozy-cp-new").value;
            const result = await window.CozyOS.AuthCoordinator.changePassword(userId, oldPassword, newPassword);
            if (!result.available) {
                const err = modal.querySelector("#cozy-cp-error");
                err.textContent = result.reason || "Change password failed.";
                err.style.display = "block";
                return;
            }
            closeModal();
        });
    }

    function renderSignedInBar(userId) {
        if (document.getElementById("cozy-auth-bar")) return;
        const bar = document.createElement("div");
        bar.id = "cozy-auth-bar";
        bar.className = "fixed top-0 right-0 z-[99999] px-3.5 py-2 text-xs font-sans bg-cozy-surface text-slate-100 border-l border-b border-cozy-border rounded-bl-xl flex gap-2.5 items-center";
        bar.innerHTML = `<span>Signed in: ${escapeHtml(userId || "administrator")}</span>
            <button id="cozy-login-history-button" class="px-2.5 py-1 rounded-md bg-cozy-card border border-cozy-border text-white text-[11px]">Login History</button>
            <button id="cozy-change-password-button" class="px-2.5 py-1 rounded-md bg-cozy-card border border-cozy-border text-white text-[11px]">Change Password</button>
            <button id="cozy-logout-button" class="px-2.5 py-1 rounded-md bg-red-600 text-white text-[11px]">Logout</button>`;
        document.body.appendChild(bar);
        document.getElementById("cozy-logout-button").addEventListener("click", () => {
            try { window.CozyOS.AuthCoordinator.logout(); } finally { window.location.reload(); }
        });
        document.getElementById("cozy-login-history-button").addEventListener("click", () => openLoginHistory(userId));
        document.getElementById("cozy-change-password-button").addEventListener("click", () => openChangePassword(userId));
    }

    const CozyOSLoginGate = {
        getVersion() { return GATE_VERSION; },

        /**
         * mountIfNeeded(container, onAuthenticated)
         *   Real gate: waits (bounded) for AuthCoordinator/Session/vendor
         *   assets, lets restoreSession() attempt run, then checks
         *   isAuthenticated(). Shows the real login form if not; calls
         *   onAuthenticated() immediately if already signed in.
         */
        async mountIfNeeded(container, onAuthenticated) {
            await ensureVendorAssets();

            const ready = await waitFor(() => !!(window.CozyOS && window.CozyOS.AuthCoordinator && window.CozyOS.Session));
            if (!ready) {
                container.innerHTML = `<p style="font-family:system-ui,sans-serif;color:#b91c1c;padding:24px;">CozyOS Identity/Session services failed to load — cannot verify sign-in. Failing closed.</p>`;
                return;
            }

            applyLivingTheme();

            // Give restoreSession() (already auto-triggered by auth-coordinator.js
            // on DOMContentLoaded) a moment to finish before deciding.
            await window.CozyOS.AuthCoordinator.restoreSession();

            const proceed = () => {
                renderSignedInBar(window.CozyOS.AuthCoordinator.getCurrentIdentity()?.userId);
                onAuthenticated();
            };

            if (window.CozyOS.AuthCoordinator.isAuthenticated()) { proceed(); return; }

            renderLoginForm(container);

            container.querySelector("#cozy-login-credentials-form").addEventListener("submit", async (e) => {
                e.preventDefault();
                const username = container.querySelector("#cozy-login-username").value;
                const password = container.querySelector("#cozy-login-password").value;
                const rememberMe = !!container.querySelector("#cozy-login-remember-me")?.checked;
                const result = await window.CozyOS.AuthCoordinator.loginWithCredentials(username, password, { rememberMe });
                if (!result.available) { showError(container, result.reason || "Sign-in failed."); return; }
                proceed();
            });
        }
    };

    if (window.CozyOS.LoginGate?.getVersion) {
        if (window.CozyOS.LoginGate.getVersion() !== GATE_VERSION) {
            throw new Error("[CozyOS Framework Execution Error] VERSION_CONFLICT: LoginGate.");
        }
        return;
    }
    window.CozyOS.LoginGate = Object.freeze(CozyOSLoginGate);
})();
