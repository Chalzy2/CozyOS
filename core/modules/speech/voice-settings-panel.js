/**
 * CozyOS Settings — Voice & Speech Panel
 * File Reference: core/modules/speech/voice-settings-panel.js
 * Layer: Application Module (loadModule() contract — getDashboard/init)
 * Version: 1.0.0-ENTERPRISE
 * Milestone: 356 — CozyOS Voice Framework
 *
 * OWNERSHIP
 *   Owns: the "Settings \u2192 Voice & Speech" UI only — rendering,
 *   search/filter, badges, and wiring user actions to VoiceManager's
 *   already-real methods. Owns NO voice logic, provider state, or
 *   fallback behavior itself — every action here is a thin call into
 *   window.CozyOS.VoiceManager / VoicePackImporter, composed, not
 *   duplicated.
 *
 * HONEST UI RULE (Engineering Governance v1.0, Principle 12 — Milestone
 *   356b): every provider row shows two distinct, separately-labeled
 *   lines — Current Status (the badge, from VoiceManager's real `status`
 *   field, never softened) and What's Needed Next (from `nextStep`, a
 *   concrete real action, e.g. "Configure Google Speech credentials" —
 *   never a vague reassurance, never implying the feature already
 *   works). The two are never merged into one line that could blur
 *   which is which.
 *   Every provider badge is derived directly from
 *   VoiceManager.listProviders()'s real `status` field — never a
 *   hardcoded "available" for a provider this platform doesn't
 *   actually have a backend for. Preview buttons call
 *   VoiceManager.speak() for real and show whichever provider actually
 *   answered (VoiceManager.getLastSpokenProviderId()), including when
 *   that's a fallback, rather than pretending the requested voice spoke.
 *
 * STYLE NOTE
 *   This repository's `cozy-emerald`/`cozy-gold`/`glass-card` Tailwind-
 *   style classes (seen in core/modules/Cozy-Authenticator/authenticator.js)
 *   are not backed by any loaded CSS or Tailwind runtime anywhere in
 *   this codebase today — using them here would silently render
 *   unstyled, the same pre-existing (and separate) gap, not something
 *   this milestone fabricates around. This panel instead ships its own
 *   real, scoped <style> block, so the "Professional CozyOS glass UI —
 *   Green, Gold, Transparent" requirement is something this file
 *   actually delivers, not something it merely references.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const PANEL_VERSION = "1.0.0-ENTERPRISE";
    if (window.CozyOS.VoiceSettingsPanel) return; // duplicate-load guard

    const CONTEXT_LABELS = Object.freeze({
        startup: "Startup Voice", navigation: "Navigation Voice", assistant: "Assistant Voice",
        notification: "Notification Voice", accessibility: "Accessibility Voice",
    });
    const STATUS_LABEL = Object.freeze({
        installed: "Installed", not_installed: "Not Installed", requires_configuration: "Requires Configuration",
        requires_api_key: "Requires API Key", unsupported_on_device: "Unsupported on this device",
    });

    function escapeHtml(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }

    const STYLE = `
    .vsp-scope { --vsp-green:#1f7a4d; --vsp-green-light:#2fa76b; --vsp-gold:#d4af37; --vsp-gold-light:#e9cf6b;
        --vsp-bg:#0c1f16; --vsp-surface:rgba(20,42,31,0.72); --vsp-border:rgba(212,175,55,0.28);
        background:linear-gradient(160deg,#0c1f16,#0a1712 60%,#0d2419); color:#eaf5ee; min-height:100%;
        font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; padding:20px; box-sizing:border-box; }
    .vsp-scope * { box-sizing:border-box; }
    .vsp-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:18px; flex-wrap:wrap; gap:10px; }
    .vsp-title { font-size:18px; font-weight:800; color:#fff; display:flex; align-items:center; gap:8px; }
    .vsp-title .vsp-badge { font-size:9px; font-weight:700; padding:2px 8px; border-radius:6px; background:rgba(212,175,55,0.16); color:var(--vsp-gold); border:1px solid var(--vsp-border); }
    .vsp-search { background:rgba(0,0,0,0.25); border:1px solid var(--vsp-border); border-radius:10px; padding:8px 12px; color:#eaf5ee; font-size:13px; width:220px; backdrop-filter:blur(6px); }
    .vsp-search::placeholder { color:#7fae94; }
    .vsp-card { background:var(--vsp-surface); border:1px solid var(--vsp-border); border-radius:16px; padding:16px; margin-bottom:14px; backdrop-filter:blur(10px); box-shadow:0 4px 24px rgba(0,0,0,0.25); }
    .vsp-card h3 { margin:0 0 12px 0; font-size:12px; text-transform:uppercase; letter-spacing:0.06em; color:var(--vsp-gold-light); font-weight:700; }
    .vsp-provider-row { display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-radius:12px; background:rgba(0,0,0,0.18); border:1px solid rgba(255,255,255,0.06); margin-bottom:8px; gap:10px; flex-wrap:wrap; }
    .vsp-provider-name { font-weight:700; font-size:13px; color:#fff; }
    .vsp-provider-reason { font-size:11px; color:#8fb8a0; margin-top:2px; }
    .vsp-next-step { font-size:11px; color:var(--vsp-gold-light); margin-top:3px; font-weight:600; }
    .vsp-next-step::before { content:"→ "; opacity:0.7; }
    .vsp-badges { display:flex; gap:6px; flex-wrap:wrap; }
    .vsp-badge { font-size:9.5px; font-weight:700; padding:3px 8px; border-radius:999px; white-space:nowrap; border:1px solid transparent; }
    .vsp-badge-default { background:rgba(47,167,107,0.22); color:var(--vsp-green-light); border-color:rgba(47,167,107,0.4); }
    .vsp-badge-installed { background:rgba(212,175,55,0.16); color:var(--vsp-gold); border-color:var(--vsp-border); }
    .vsp-badge-unavailable { background:rgba(255,255,255,0.06); color:#9fb4a8; border-color:rgba(255,255,255,0.1); }
    .vsp-btn { border:1px solid var(--vsp-border); background:rgba(212,175,55,0.1); color:var(--vsp-gold-light); font-size:11px; font-weight:700; padding:6px 12px; border-radius:9px; cursor:pointer; transition:0.15s; }
    .vsp-btn:hover { background:rgba(212,175,55,0.22); }
    .vsp-btn:disabled { opacity:0.35; cursor:not-allowed; }
    .vsp-btn-primary { background:linear-gradient(135deg,var(--vsp-green),var(--vsp-green-light)); color:#fff; border-color:rgba(47,167,107,0.5); }
    .vsp-row { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:10px; }
    .vsp-row label { font-size:12px; color:#bfe0cd; }
    .vsp-row select, .vsp-row input[type=range] { background:rgba(0,0,0,0.25); border:1px solid var(--vsp-border); border-radius:8px; color:#eaf5ee; padding:5px 8px; font-size:12px; }
    .vsp-row input[type=range] { width:140px; }
    .vsp-context-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:10px; }
    .vsp-status-line { font-size:11px; color:#8fb8a0; margin-top:8px; }
    .vsp-file-input { display:none; }
    .vsp-import-msg { font-size:11px; margin-top:8px; }
    .vsp-import-msg.ok { color:var(--vsp-green-light); }
    .vsp-import-msg.err { color:#e0876b; }
    `;

    function badgesFor(provider, defaultProviderId) {
        const badges = [];
        if (provider.providerId === defaultProviderId) badges.push(`<span class="vsp-badge vsp-badge-default">Default</span>`);
        if (provider.status === "installed") badges.push(`<span class="vsp-badge vsp-badge-installed">Installed</span>`);
        else badges.push(`<span class="vsp-badge vsp-badge-unavailable">${escapeHtml(STATUS_LABEL[provider.status] || provider.status)}</span>`);
        return badges.join("");
    }

    function providerRowHtml(provider, defaultProviderId) {
        const reason = provider.meta && provider.meta.reason ? provider.meta.reason : "";
        return `
        <div class="vsp-provider-row" data-vsp-provider-row="${escapeHtml(provider.providerId)}">
            <div>
                <div class="vsp-provider-name">${escapeHtml(provider.displayName)}</div>
                ${reason ? `<div class="vsp-provider-reason">${escapeHtml(reason)}</div>` : ""}
                <div class="vsp-next-step">${escapeHtml(provider.nextStep || "")}</div>
            </div>
            <div class="vsp-badges">
                ${badgesFor(provider, defaultProviderId)}
                <button class="vsp-btn" data-vsp-action="preview" data-vsp-provider="${escapeHtml(provider.providerId)}" ${provider.status !== "installed" ? "disabled" : ""}>Preview</button>
                <button class="vsp-btn ${provider.providerId === defaultProviderId ? "" : "vsp-btn-primary"}" data-vsp-action="set-default" data-vsp-provider="${escapeHtml(provider.providerId)}" ${provider.status !== "installed" || provider.providerId === defaultProviderId ? "disabled" : ""}>${provider.providerId === defaultProviderId ? "Default" : "Make Default"}</button>
            </div>
        </div>`;
    }

    function shellHtml() {
        return `
<div class="vsp-scope">
    <style>${STYLE}</style>
    <div class="vsp-header">
        <div class="vsp-title">🔊 Voice &amp; Speech <span class="vsp-badge">ENTERPRISE</span></div>
        <input class="vsp-search" type="text" placeholder="Search voices…" data-vsp="search">
    </div>

    <div class="vsp-card">
        <h3>Default &amp; Installed Voices</h3>
        <div data-vsp="installed-list"></div>
    </div>

    <div class="vsp-card">
        <h3>Available Providers</h3>
        <div data-vsp="available-list"></div>
        <div class="vsp-status-line">Unavailable providers are honestly marked — CozyOS does not fake a provider it cannot actually speak with.</div>
    </div>

    <div class="vsp-card">
        <h3>Import Voice Pack</h3>
        <p class="vsp-provider-reason">Accepts a voice pack manifest (.voicepack or a plain .json manifest). Real .zip extraction is not available in this environment yet — see this panel's own honest limitation notice below.</p>
        <button class="vsp-btn vsp-btn-primary" data-vsp-action="import-click">Choose Voice Pack File…</button>
        <input class="vsp-file-input" type="file" accept=".voicepack,.json,.zip" data-vsp="import-file">
        <div class="vsp-import-msg" data-vsp="import-msg"></div>
    </div>

    <div class="vsp-card">
        <h3>Voice Speed / Pitch / Volume</h3>
        <div class="vsp-row"><label>Speed</label><input type="range" min="0.5" max="2" step="0.1" data-vsp="speed"></div>
        <div class="vsp-row"><label>Pitch</label><input type="range" min="0" max="2" step="0.1" data-vsp="pitch"></div>
        <div class="vsp-row"><label>Volume</label><input type="range" min="0" max="1" step="0.05" data-vsp="volume"></div>
    </div>

    <div class="vsp-card">
        <h3>Per-Context Voice</h3>
        <div class="vsp-context-grid" data-vsp="context-grid"></div>
    </div>

    <div class="vsp-card">
        <h3>Voice Preview</h3>
        <div class="vsp-row"><label>Last spoken by</label><span data-vsp="last-spoken" style="font-size:12px;color:#bfe0cd;">—</span></div>
        <button class="vsp-btn vsp-btn-primary" data-vsp-action="preview-default">Preview Default Voice</button>
        <button class="vsp-btn" data-vsp-action="reset">Reset Voice Settings</button>
    </div>
</div>`;
    }

    class VoiceSettingsPanelUI {
        #container = null;

        getVersion() { return PANEL_VERSION; }
        #q(sel) { return this.#container ? this.#container.querySelector(sel) : null; }
        #qa(sel) { return this.#container ? [...this.#container.querySelectorAll(sel)] : []; }

        #vm() { return window.CozyOS.VoiceManager; }

        async init(arg) {
            const isDomNode = arg && typeof arg === "object" && typeof arg.nodeType === "number";
            const { container = null } = isDomNode ? { container: arg } : (arg || {});
            this.#container = container || document.getElementById("cozy-app-root");
            if (!this.#container) return;
            this.#container.innerHTML = shellHtml();
            this.#bind();
            this.#renderAll();
        }

        #bind() {
            const search = this.#q('[data-vsp="search"]');
            if (search) search.addEventListener("input", () => this.#renderAll(search.value.trim().toLowerCase()));

            this.#container.addEventListener("click", async (evt) => {
                const btn = evt.target.closest("[data-vsp-action]");
                if (!btn) return;
                const vm = this.#vm();
                const action = btn.getAttribute("data-vsp-action");
                const providerId = btn.getAttribute("data-vsp-provider");

                if (action === "preview" && vm) {
                    btn.disabled = true; btn.textContent = "Playing…";
                    const result = await vm.speak({ providerId, context: "assistant" });
                    this.#setLastSpoken(result);
                    btn.disabled = false; btn.textContent = "Preview";
                } else if (action === "preview-default" && vm) {
                    const result = await vm.speak({ context: "assistant" });
                    this.#setLastSpoken(result);
                } else if (action === "set-default" && vm) {
                    vm.setDefaultVoice(providerId);
                    this.#renderAll(search ? search.value.trim().toLowerCase() : "");
                } else if (action === "reset" && vm) {
                    vm.resetSettings();
                    this.#renderAll();
                } else if (action === "import-click") {
                    const fileInput = this.#q('[data-vsp="import-file"]');
                    if (fileInput) fileInput.click();
                }
            });

            const fileInput = this.#q('[data-vsp="import-file"]');
            if (fileInput) fileInput.addEventListener("change", () => this.#handleImport(fileInput));

            const speed = this.#q('[data-vsp="speed"]');
            const pitch = this.#q('[data-vsp="pitch"]');
            const volume = this.#q('[data-vsp="volume"]');
            const vm = this.#vm();
            if (speed) speed.addEventListener("change", () => vm && vm.setSpeed(parseFloat(speed.value)));
            if (pitch) pitch.addEventListener("change", () => vm && vm.setPitch(parseFloat(pitch.value)));
            if (volume) volume.addEventListener("change", () => vm && vm.setVolume(parseFloat(volume.value)));
        }

        #setLastSpoken(result) {
            const el = this.#q('[data-vsp="last-spoken"]');
            if (!el) return;
            const vm = this.#vm();
            const spokeAs = vm ? vm.getLastSpokenProviderId() : null;
            if (!result || !result.available || !result.played) { el.textContent = "Nothing available spoke — see console."; return; }
            el.textContent = spokeAs ? `${spokeAs}${result.reason ? " (" + result.reason + ")" : ""}` : "unknown";
        }

        /**
         * #handleImport — real, honest: reads the chosen file as text and
         * attempts JSON.parse (works for a plain manifest.json or a
         * .voicepack file that IS json). A real .zip is not decodable
         * here — that failure is reported honestly, not silently retried
         * as if it worked.
         */
        #handleImport(fileInput) {
            const msg = this.#q('[data-vsp="import-msg"]');
            const file = fileInput.files && fileInput.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onerror = () => { if (msg) { msg.className = "vsp-import-msg err"; msg.textContent = "Could not read the selected file."; } };
            reader.onload = () => {
                let manifest;
                try { manifest = JSON.parse(String(reader.result)); }
                catch (_err) {
                    if (msg) { msg.className = "vsp-import-msg err"; msg.textContent = "This file isn't a readable JSON manifest — real .zip extraction isn't available in this environment yet, so a binary .zip/.voicepack can't be imported here."; }
                    return;
                }
                const importer = window.CozyOS.VoicePackImporter;
                if (!importer) { if (msg) { msg.className = "vsp-import-msg err"; msg.textContent = "VoicePackImporter is not loaded."; } return; }
                const result = importer.importManifest(manifest, { hasAudio: false });
                if (!result.success) { if (msg) { msg.className = "vsp-import-msg err"; msg.textContent = result.reason; } return; }
                if (msg) { msg.className = "vsp-import-msg ok"; msg.textContent = `Imported "${manifest.name}" as metadata only (Requires Configuration — no audio bundled).`; }
                this.#renderAll();
            };
            reader.readAsText(file);
        }

        #renderAll(filter = "") {
            const vm = this.#vm();
            if (!vm) return;
            const providers = vm.listProviders().filter((p) => !filter || p.displayName.toLowerCase().includes(filter));
            const defaultProviderId = vm.getDefaultVoice();

            const installed = providers.filter((p) => p.status === "installed");
            const available = providers.filter((p) => p.status !== "installed");

            const installedList = this.#q('[data-vsp="installed-list"]');
            if (installedList) installedList.innerHTML = installed.length ? installed.map((p) => providerRowHtml(p, defaultProviderId)).join("") : `<div class="vsp-provider-reason">No installed voices match your search.</div>`;

            const availableList = this.#q('[data-vsp="available-list"]');
            if (availableList) availableList.innerHTML = available.length ? available.map((p) => providerRowHtml(p, defaultProviderId)).join("") : `<div class="vsp-provider-reason">No providers match your search.</div>`;

            const settings = vm.getSettings();
            const speed = this.#q('[data-vsp="speed"]'); if (speed) speed.value = settings.speed;
            const pitch = this.#q('[data-vsp="pitch"]'); if (pitch) pitch.value = settings.pitch;
            const volume = this.#q('[data-vsp="volume"]'); if (volume) volume.value = settings.volume;

            const contextGrid = this.#q('[data-vsp="context-grid"]');
            if (contextGrid) {
                contextGrid.innerHTML = vm.listContexts().map((ctx) => {
                    const current = vm.getContextVoice(ctx);
                    const options = vm.listProviders().map((p) => `<option value="${escapeHtml(p.providerId)}" ${p.providerId === current ? "selected" : ""} ${p.status !== "installed" ? "disabled" : ""}>${escapeHtml(p.displayName)}${p.status !== "installed" ? " (" + escapeHtml(STATUS_LABEL[p.status]) + ")" : ""}</option>`).join("");
                    return `<div class="vsp-row" style="flex-direction:column;align-items:flex-start;"><label>${escapeHtml(CONTEXT_LABELS[ctx] || ctx)}</label><select data-vsp-context="${escapeHtml(ctx)}" style="width:100%;margin-top:4px;">${options}</select></div>`;
                }).join("");
                this.#qa("[data-vsp-context]").forEach((sel) => sel.addEventListener("change", () => vm.setContextVoice(sel.getAttribute("data-vsp-context"), sel.value)));
            }
        }
    }

    const singletonInstance = new VoiceSettingsPanelUI();

    window.CozyOS.VoiceSettingsPanel = {
        getVersion: () => PANEL_VERSION,
        getDashboard() { return { name: "Voice & Speech", icon: "🔊", version: PANEL_VERSION }; },
        async init(arg) { await singletonInstance.init(arg); },
    };

    window.CozyOS.Modules = window.CozyOS.Modules || {};
    window.CozyOS.Modules.voiceSettings = window.CozyOS.VoiceSettingsPanel;
    window.CozyOS.VoiceSettingsPanel.visibility = Object.freeze({
        appId: "voiceSettings", name: "Voice & Speech", icon: "🔊", category: "settings",
        launchTarget: Object.freeze({ center: "voiceSettings" }), audience: "admin",
    });

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                sourcePath: "core/modules/speech/voice-settings-panel.js", name: "VoiceSettingsPanel", category: "Application", icon: "mic.svg",
                description: "Settings \u2192 Voice & Speech UI. Composes VoiceManager/VoicePackImporter only — owns no voice logic itself.",
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
