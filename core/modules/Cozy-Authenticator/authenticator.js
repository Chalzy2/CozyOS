/**
 * CozyAuthenticator App Logic — Milestone 136
 * File Reference: applications/authenticator/authenticator.js
 *
 * Wires the approved design to real CozyOS engines. Never fabricates a
 * status: every badge reflects an engine's actual loaded/real state as
 * observed at runtime, checked defensively (this app does not force-load
 * IdentityEngine/AuthCoordinator/AuthorizationCoordinator itself — those
 * are expected to already be loaded by the hosting CozyOS shell; if
 * absent, that is reported honestly as "Not Loaded", not glossed over).
 */
(function () {
    "use strict";

    let tickHandle = null;
    const CIRCUMFERENCE = 113; // 2 * PI * r18, matches the approved design's stroke-dasharray

    function $(id) { return document.getElementById(id); }
    function escapeHtml(s) { const d = document.createElement("div"); d.textContent = String(s); return d.innerHTML; }

    function showToast(message, ms = 2600) {
        const el = $("ca-toast");
        el.textContent = message;
        el.hidden = false;
        clearTimeout(showToast._t);
        showToast._t = setTimeout(() => { el.hidden = true; }, ms);
    }

    function copyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(() => {});
    }

    // ---------- Engine status (real, never fabricated) ----------
    function badgeHtml(dotColorClass, label) {
        return `<span class="w-2 h-2 rounded-full ${dotColorClass} mr-1.5 animate-pulse"></span> ${label}`;
    }

    function renderSessionStatus() {
        const coord = window.CozyOS && window.CozyOS.AuthCoordinator;
        const icon = $("ca-session-icon");
        const label = $("ca-session-label");
        if (!coord || typeof coord.isAuthenticated !== "function") {
            label.textContent = "AuthCoordinator not loaded";
            icon.classList.remove("text-cozy-success");
            icon.classList.add("text-slate-500");
            return;
        }
        const authed = coord.isAuthenticated();
        if (!authed) {
            label.innerHTML = `No active session`;
            icon.classList.remove("text-cozy-success");
            icon.classList.add("text-slate-500");
            return;
        }
        const identity = typeof coord.getCurrentIdentity === "function" ? coord.getCurrentIdentity() : null;
        const name = (identity && (identity.username || identity.email || identity.userId)) || "Signed in";
        label.innerHTML = `Admin: <strong class="text-white">${escapeHtml(name)}</strong>`;
        icon.classList.add("text-cozy-success");
        icon.classList.remove("text-slate-500");
    }

    function renderEngineStatusCards() {
        const identityEngine = window.CozyOS && window.CozyOS.IdentityEngine;
        const authCoord = window.CozyOS && window.CozyOS.AuthCoordinator;
        const authzCoord = window.CozyOS && window.CozyOS.AuthorizationCoordinator;
        const factorRegistry = window.CozyOS && window.CozyOS.AuthFactorRegistry;

        $("ca-status-identity").innerHTML = (identityEngine && typeof identityEngine.getVersion === "function")
            ? badgeHtml("bg-cozy-success", "Active") : badgeHtml("bg-slate-500", "Not Loaded");

        $("ca-status-authcoord").innerHTML = (authCoord && typeof authCoord.isAuthenticated === "function")
            ? badgeHtml("bg-cozy-success", "Connected") : badgeHtml("bg-slate-500", "Not Loaded");

        $("ca-status-authz").innerHTML = (authzCoord && typeof authzCoord.authorize === "function")
            ? badgeHtml("bg-cozy-success", "Enforced") : badgeHtml("bg-slate-500", "Not Loaded");

        let allLoaded = !!(identityEngine && authCoord && authzCoord && factorRegistry);

        if (factorRegistry && typeof factorRegistry.listFactors === "function") {
            const factors = factorRegistry.listFactors();
            const realCount = factors.filter(f => f.isReal).length;
            $("ca-status-factors").innerHTML = badgeHtml(realCount > 0 ? "bg-cozy-success" : "bg-cozy-gold", `${realCount}/${factors.length} Real`);

            const displayNames = { face: "Face Unlock", fingerprint: "Fingerprint", voice: "Voice", "security-key": "Passkey", otp: "OTP (TOTP)" };
            const detailFactors = ["fingerprint", "face", "voice", "security-key", "otp"].map(name => factors.find(f => f.factorName === name)).filter(Boolean);
            $("ca-factor-detail-list").innerHTML = detailFactors.map(f => {
                const label = displayNames[f.factorName] || f.factorName;
                const stateText = f.isReal ? "Active" : "Stub";
                const colorClass = f.isReal ? "bg-cozy-success/20 text-cozy-success border-cozy-success/30" : "bg-slate-500/20 text-slate-400 border-slate-500/30";
                return `<span class="text-[10px] px-2 py-1 rounded-lg border ${colorClass}" title="${escapeHtml(f.note || "")}">${escapeHtml(label)} — ${stateText}</span>`;
            }).join("");
        } else {
            $("ca-status-factors").innerHTML = badgeHtml("bg-slate-500", "Not Loaded");
            $("ca-factor-detail-list").innerHTML = "";
            allLoaded = false;
        }

        const overall = $("ca-overall-status-badge");
        if (allLoaded) {
            overall.textContent = "ALL SYSTEMS OPERATIONAL";
            overall.className = "text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30";
        } else {
            overall.textContent = "SOME ENGINES NOT LOADED";
            overall.className = "text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30";
        }
    }

    // ---------- Account cards ----------
    function accountCardHtml(acc, colorTheme) {
        return `
        <div class="glass-card p-5 rounded-2xl relative overflow-hidden group hover:border-cozy-gold/50 transition-all duration-300 shadow-xl" data-account-id="${acc.accountId}">
            <div class="absolute top-0 right-0 w-32 h-32 bg-${colorTheme}-500/10 rounded-full blur-2xl pointer-events-none"></div>
            <div class="flex items-start justify-between">
                <div class="flex items-center space-x-3">
                    <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-${colorTheme}-600 to-${colorTheme}-800 flex items-center justify-center shadow-md border border-${colorTheme}-400/30">
                        <i data-lucide="shield" class="w-6 h-6 text-white"></i>
                    </div>
                    <div>
                        <div class="text-xs font-semibold text-${colorTheme}-400 uppercase tracking-wider">${escapeHtml(acc.issuer)}</div>
                        <h3 class="text-base font-bold text-white">${escapeHtml(acc.accountName)}</h3>
                    </div>
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
                    <span class="text-[10px] text-cozy-success flex items-center mt-0.5"><i data-lucide="check-circle-2" class="w-3 h-3 mr-1"></i> RFC6238 TOTP Active</span>
                </div>
                <div class="flex items-center space-x-2">
                    <button class="p-2.5 rounded-xl bg-cozy-surface hover:bg-cozy-border text-slate-300 hover:text-white transition border border-cozy-border" title="Copy OTP" data-copy="${acc.accountId}">
                        <i data-lucide="copy" class="w-4 h-4 text-${colorTheme}-400"></i>
                    </button>
                    <button class="p-2.5 rounded-xl bg-cozy-surface hover:bg-cozy-border text-slate-300 hover:text-white transition border border-cozy-border" title="Remove Account" data-remove="${acc.accountId}">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </div>
            </div>
        </div>`;
    }

    const COLOR_THEMES = ["emerald", "amber", "purple", "cyan", "rose", "indigo"];

    function renderAccountGrid(provider) {
        const grid = $("ca-account-grid");
        const accounts = provider.listAccounts();
        const query = ($("ca-search-input").value || "").toLowerCase().trim();
        const filtered = query
            ? accounts.filter(a => a.issuer.toLowerCase().includes(query) || a.accountName.toLowerCase().includes(query))
            : accounts;

        grid.querySelectorAll("[data-account-id]").forEach(el => el.remove());

        if (accounts.length === 0) {
            $("ca-empty-state").hidden = false;
            $("ca-empty-state").innerHTML = `No accounts enrolled yet. Use <strong class="text-cozy-gold">Manual Setup</strong> to add one — QR enrollment isn't available this milestone.`;
        } else if (filtered.length === 0) {
            $("ca-empty-state").hidden = false;
            $("ca-empty-state").textContent = "No accounts match your search.";
        } else {
            $("ca-empty-state").hidden = true;
        }

        filtered.forEach((acc, i) => {
            grid.insertAdjacentHTML("beforeend", accountCardHtml(acc, COLOR_THEMES[i % COLOR_THEMES.length]));
        });

        if (window.lucide) lucide.createIcons();
        wireCardActions(provider);
    }

    function wireCardActions(provider) {
        document.querySelectorAll("[data-copy]").forEach(btn => {
            btn.onclick = () => {
                const codeEl = document.querySelector(`[data-code="${btn.dataset.copy}"]`);
                if (codeEl) { copyText(codeEl.textContent.replace(/\s/g, "")); showToast("Code copied."); }
            };
        });
        document.querySelectorAll("[data-remove]").forEach(btn => {
            btn.onclick = () => { provider.removeAccount(btn.dataset.remove); renderAccountGrid(provider); };
        });
    }

    async function tickCodes(provider) {
        const accounts = provider.listAccounts();
        for (const acc of accounts) {
            const result = await provider.currentCode(acc.accountId);
            if (!result.available) continue;
            const codeEl = document.querySelector(`[data-code="${acc.accountId}"]`);
            const secEl = document.querySelector(`[data-seconds="${acc.accountId}"]`);
            const ringEl = document.querySelector(`[data-ring="${acc.accountId}"]`);
            if (codeEl) codeEl.textContent = result.code.replace(/(\d{3})(\d{3,})/, "$1 $2");
            if (secEl) secEl.textContent = `${result.secondsRemaining}s`;
            if (ringEl) {
                const fraction = result.secondsRemaining / result.period;
                ringEl.setAttribute("stroke-dashoffset", String(CIRCUMFERENCE * (1 - fraction)));
            }
        }
    }

    // ---------- Manual enrollment ----------
    function wireEnrollModal(provider) {
        const backdrop = $("ca-enroll-backdrop");
        const errEl = $("ca-enroll-error");
        function open() { $("ca-issuer-input").value = ""; $("ca-accountname-input").value = ""; errEl.hidden = true; backdrop.hidden = false; }
        function close() { backdrop.hidden = true; }
        $("ca-manual-setup-btn").addEventListener("click", open);
        $("ca-enroll-cancel-btn").addEventListener("click", close);
        $("ca-enroll-confirm-btn").addEventListener("click", () => {
            const issuer = $("ca-issuer-input").value.trim();
            const accountName = $("ca-accountname-input").value.trim();
            const result = provider.enrollAccount({ issuer, accountName });
            if (!result.success) { errEl.hidden = false; errEl.textContent = result.reason; return; }
            close();
            renderAccountGrid(provider);
        });
    }

    function wireScanQrPlaceholder() {
        // Locked: UI placeholder only. No camera permission, no decoding, no account creation.
        $("ca-scan-qr-btn").addEventListener("click", () => showToast("QR Scanner Module Pending — coming in a future milestone."));
    }

    function wireSearch(provider) {
        $("ca-search-input").addEventListener("input", () => renderAccountGrid(provider));
    }

    async function boot() {
        if (window.lucide) lucide.createIcons();
        renderSessionStatus();
        renderEngineStatusCards();
        wireScanQrPlaceholder();

        const provider = window.CozyOS && window.CozyOS.OtpProvider;
        if (!provider) {
            showToast("OtpProvider failed to load — account features unavailable.", 6000);
            return;
        }
        wireEnrollModal(provider);
        wireSearch(provider);
        renderAccountGrid(provider);
        await tickCodes(provider);
        tickHandle = setInterval(() => tickCodes(provider), 1000);
    }

    document.addEventListener("DOMContentLoaded", boot);
})();
