/**
 * CozyOS — Administrator Login Gate
 * File Reference: core/shell/cozy-login-gate.js
 * Layer: Core / Shell UI
 * Version: 1.3.0-ENTERPRISE
 * Milestone: 127
 *
 * ═══════════════════════════════════════════════════════════════════════
 * WHY THIS CHANGED — MILESTONE 127
 * ═══════════════════════════════════════════════════════════════════════
 *   UI-only revision. Reverts Milestone 126's fully-hidden arrow-only
 *   panel back to an always-visible two-column layout (per the attached
 *   design reference), with CozyOS copy: subtitle "Enterprise Operating
 *   System", welcome subtext, and updated approval notice. Reference
 *   image showed CozyCabin branding/colors — per explicit instruction,
 *   only the layout shape is reused; every string and every color is
 *   CozyOS's own (emerald/gold), not Cozycabin's gold-only palette.
 *   Reference showed 3 quick-sign-in tiles (Fingerprint, Face Unlock,
 *   Voice Sign-In) with no separate Trusted Device tile, so this
 *   revision matches that — the trusted-device FORM still exists
 *   underneath (real AuthCoordinator path) and opens from whichever tile
 *   has real capability, same as before.
 *
 * CANONICAL OWNERSHIP (unchanged since 1.0.0)
 *   Owns: login FORM/markup + mount-vs-show decision only. Delegates all
 *   authentication to window.CozyOS.AuthCoordinator. Never touches
 *   cozy-workspace.js or cozy-background.js.
 *
 * HONEST SCOPE (unchanged reasoning from 1.1.0/1.2.0)
 *   Fingerprint / Face Unlock: real capability =
 *   PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().
 *   Both tiles honestly share this one real signal — the API can't tell
 *   sensor types apart. When available, opens the one real
 *   loginWithTrustedDevice() form; never simulates a biometric result.
 *   Voice Sign-In: no backend anywhere in this codebase (verified again
 *   this milestone) — always "Not Supported," using the same
 *   window.CozyOS.VoiceAuthProviders registry introduced in 1.2.0 as its
 *   real (currently empty) capability source.
 *   The reference's top "← Shop / Help" nav bar and "View Plans &
 *   Pricing" bar were CozyCabin site-chrome, not part of this milestone's
 *   requested Login Card content list, and have no real destination in
 *   this codebase — omitted rather than linked to nothing.
 */

(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const GATE_VERSION = "1.3.0-ENTERPRISE";

    if (!window.CozyOS.VoiceAuthProviders) {
        const providers = [];
        window.CozyOS.VoiceAuthProviders = Object.freeze({
            register(provider) {
                if (!provider || typeof provider.verify !== "function") {
                    throw new TypeError("[VoiceAuthProviders] register(): provider must implement verify().");
                }
                providers.push(provider);
            },
            list() { return providers.slice(); }
        });
    }

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

    async function detectCapabilities() {
        const result = { platformAuth: false, voice: false };
        try {
            if (window.PublicKeyCredential && window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) {
                result.platformAuth = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
            }
        } catch (_e) { result.platformAuth = false; }
        try { result.voice = window.CozyOS.VoiceAuthProviders.list().length > 0; } catch (_e) { result.voice = false; }
        return result;
    }

    function styles() {
        return `
        #cozy-login-gate * { box-sizing: border-box; }
        #cozy-login-gate {
            position: relative; min-height: 100vh; display: flex; align-items: center; justify-content: center;
            padding: 6vh 20px; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #f3f4f0;
        }
        #cozy-login-gate .cozy-gate-inner { width: 100%; max-width: 720px; display: flex; flex-direction: column; align-items: center; gap: 20px; }
        #cozy-login-gate .cozy-logo-box {
            width: 92px; height: 92px; border-radius: 22px; border: 1px solid rgba(249,168,37,0.35);
            background: rgba(20,24,21,0.6); display: flex; align-items: center; justify-content: center;
            box-shadow: 0 0 24px rgba(27,94,32,0.3);
        }
        #cozy-login-gate .cozy-logo-mark { width: 62px; height: 62px; object-fit: contain; }
        #cozy-login-gate .cozy-wordmark { font-size: 30px; font-weight: 800; letter-spacing: 2px; text-align: center; }
        #cozy-login-gate .cozy-wordmark .g { color: #34a853; } #cozy-login-gate .cozy-wordmark .o { color: #F9A825; }
        #cozy-login-gate .cozy-subtitle { font-size: 12px; letter-spacing: 4px; text-transform: uppercase; color: #8f988f; text-align: center; margin-top: -12px; }
        #cozy-login-gate .cozy-motto { font-size: 11.5px; letter-spacing: 1.5px; color: #a7b0a9; text-align: center; }

        #cozy-login-gate .cozy-panel-row { width: 100%; display: flex; align-items: stretch; gap: 0; }
        #cozy-login-gate .cozy-card {
            flex: 1; min-width: 0; background: rgba(18, 22, 19, 0.6); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
            border: 1px solid rgba(249,168,37,0.3); border-radius: 18px; padding: 30px 28px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.45), 0 0 26px rgba(249,168,37,0.12);
        }
        #cozy-login-gate h2 { margin: 0 0 4px 0; font-size: 20px; font-weight: 700; color: #fff; text-align: center; }
        #cozy-login-gate .cozy-sub { margin: 0 0 22px 0; color: #9aa39c; font-size: 12.5px; text-align: center; }
        #cozy-login-gate label { display: block; font-size: 11px; letter-spacing: 0.5px; text-transform: uppercase; color: #c9d0c9; margin-bottom: 14px; }
        #cozy-login-gate input[type="text"], #cozy-login-gate input[type="password"] {
            display: block; width: 100%; margin-top: 6px; padding: 11px 12px; border-radius: 9px;
            border: 1px solid rgba(255,255,255,0.14); background: rgba(0,0,0,0.35); color: #fff; font-size: 14px; outline: none;
            transition: border-color .15s, box-shadow .15s;
        }
        #cozy-login-gate input:focus { border-color: #F9A825; box-shadow: 0 0 0 3px rgba(249,168,37,0.15); }
        #cozy-login-gate .cozy-pw-wrap { position: relative; }
        #cozy-login-gate .cozy-pw-wrap input { padding-right: 56px; }
        #cozy-login-gate .cozy-pw-toggle {
            position: absolute; right: 8px; top: 50%; transform: translateY(calc(-50% + 3px)); background: none; border: none;
            color: #F9A825; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; cursor: pointer; padding: 4px 6px;
        }
        #cozy-login-gate .cozy-row-between { display: flex; align-items: center; justify-content: space-between; margin: -4px 0 16px 0; font-size: 12px; }
        #cozy-login-gate .cozy-row-between a { color: #F9A825; text-decoration: none; }
        #cozy-login-gate .cozy-remember { display: flex; align-items: center; gap: 6px; color: #c9d0c9; }
        #cozy-login-gate button[type="submit"] {
            width: 100%; padding: 13px; border: none; border-radius: 10px; cursor: pointer; font-weight: 700; font-size: 14.5px;
            background: linear-gradient(135deg, #1B5E20, #2e8b32); color: #fff; letter-spacing: 0.3px;
            box-shadow: 0 4px 18px rgba(27,94,32,0.4); transition: filter .15s, transform .05s;
        }
        #cozy-login-gate button[type="submit"]:hover { filter: brightness(1.12); }
        #cozy-login-gate button[type="submit"]:active { transform: translateY(1px); }
        #cozy-login-gate .cozy-divider { text-align: center; color: #6b746c; font-size: 11px; margin: 18px 0; position: relative; }
        #cozy-login-gate .cozy-divider::before, #cozy-login-gate .cozy-divider::after { content: ""; position: absolute; top: 50%; width: 40%; height: 1px; background: rgba(255,255,255,0.12); }
        #cozy-login-gate .cozy-divider::before { left: 0; } #cozy-login-gate .cozy-divider::after { right: 0; }
        #cozy-login-gate .cozy-register { text-align: center; font-size: 12.5px; color: #9aa39c; }
        #cozy-login-gate .cozy-register a { color: #34a853; font-weight: 700; text-decoration: none; }
        #cozy-login-gate .cozy-approval-note { text-align: center; font-size: 11px; color: #7d867e; margin-top: 12px; }
        #cozy-login-gate .cozy-error {
            display: none; margin-top: 14px; padding: 10px 12px; border-radius: 8px;
            background: rgba(185, 28, 28, 0.15); border: 1px solid rgba(185,28,28,0.4); color: #fca5a5; font-size: 12px;
        }

        #cozy-login-gate .cozy-toggle-rail { width: 26px; display: flex; align-items: center; justify-content: center; }
        #cozy-login-gate .cozy-drawer-toggle {
            width: 26px; height: 64px; border-radius: 14px; border: 1px solid rgba(249,168,37,0.4);
            background: rgba(20,24,21,0.75); color: #F9A825; cursor: pointer; font-size: 14px;
            box-shadow: 0 0 14px rgba(249,168,37,0.25);
        }
        #cozy-login-gate .cozy-drawer {
            width: 220px; display: flex; flex-direction: column; gap: 14px; transition: width .2s ease, opacity .2s ease; overflow: hidden;
        }
        #cozy-login-gate .cozy-drawer.collapsed { width: 0; opacity: 0; }
        #cozy-login-gate .cozy-drawer-card {
            background: rgba(18,22,19,0.55); backdrop-filter: blur(14px); border: 1px solid rgba(249,168,37,0.3);
            border-radius: 18px; padding: 22px 18px; box-shadow: 0 10px 30px rgba(0,0,0,0.4), 0 0 20px rgba(249,168,37,0.1);
            display: flex; flex-direction: column; gap: 14px; height: 100%;
        }
        #cozy-login-gate .cozy-drawer-title { font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; color: #F9A825; font-weight: 700; text-align: center; }
        #cozy-login-gate .cozy-drawer-sub { font-size: 11.5px; color: #9aa39c; text-align: center; margin-top: -8px; }
        #cozy-login-gate .cozy-auth-tile {
            display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center;
            padding: 16px 10px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.03);
            cursor: pointer; font-size: 11px; color: #cfd6cf;
        }
        #cozy-login-gate .cozy-auth-tile[disabled] { opacity: 0.4; cursor: not-allowed; }
        #cozy-login-gate .cozy-auth-tile .tile-icon { font-size: 22px; }
        #cozy-login-gate .cozy-auth-tile .tile-name { font-weight: 700; color: #fff; font-size: 12.5px; }
        #cozy-login-gate .cozy-device-form { display: none; flex-direction: column; gap: 10px; }
        #cozy-login-gate .cozy-device-form.open { display: flex; }
        #cozy-login-gate .cozy-device-form button[type="submit"] { background: linear-gradient(135deg, #F9A825, #c98a12); color: #14150f; box-shadow: none; }

        @media (max-width: 720px) {
            #cozy-login-gate .cozy-panel-row { flex-direction: column; }
            #cozy-login-gate .cozy-toggle-rail { display: none; }
            #cozy-login-gate .cozy-drawer { width: 100% !important; opacity: 1 !important; }
        }
        `;
    }

    function renderLoginForm(container, logoSrc) {
        container.innerHTML = `
            <style>${styles()}</style>
            <div id="cozy-login-gate">
                <div class="cozy-gate-inner">
                    <div class="cozy-logo-box"><img class="cozy-logo-mark" src="${escapeHtml(logoSrc)}" alt="CozyOS" onerror="this.style.display='none'"></div>
                    <div class="cozy-wordmark"><span class="g">COZY</span><span class="o">OS</span></div>
                    <div class="cozy-subtitle">Enterprise Operating System</div>
                    <div class="cozy-motto">Built for Africa. Ready for the World.</div>

                    <div class="cozy-panel-row">
                        <div class="cozy-card">
                            <h2>Welcome Back</h2>
                            <p class="cozy-sub">Secure access to the CozyOS Enterprise Platform.</p>

                            <form id="cozy-login-credentials-form">
                                <label>Username
                                    <input id="cozy-login-username" type="text" autocomplete="username" required>
                                </label>
                                <label>Password
                                    <div class="cozy-pw-wrap">
                                        <input id="cozy-login-password" type="password" autocomplete="current-password" required>
                                        <button type="button" class="cozy-pw-toggle" id="cozy-pw-toggle">SHOW</button>
                                    </div>
                                </label>
                                <div class="cozy-row-between">
                                    <span class="cozy-remember"><input id="cozy-login-remember" type="checkbox" style="width:auto;margin:0;"> Remember me</span>
                                    <a href="#" id="cozy-login-forgot">Forgot Password?</a>
                                </div>
                                <button type="submit">Sign In</button>
                            </form>

                            <div class="cozy-divider">OR</div>
                            <div class="cozy-register">Don't have an account? <a href="#" id="cozy-login-register">Register for Application</a></div>
                            <div class="cozy-approval-note">Administrator accounts require approval before activation.</div>

                            <div id="cozy-login-error" class="cozy-error"></div>
                        </div>

                        <div class="cozy-toggle-rail">
                            <button type="button" class="cozy-drawer-toggle" id="cozy-drawer-toggle" aria-label="Toggle quick sign-in">&lsaquo;</button>
                        </div>

                        <div class="cozy-drawer" id="cozy-auth-drawer">
                            <div class="cozy-drawer-card">
                                <div class="cozy-drawer-title">Quick Sign-In</div>
                                <div class="cozy-drawer-sub">Use your preferred authentication method</div>

                                <button type="button" class="cozy-auth-tile" id="cozy-tile-fingerprint">
                                    <span class="tile-icon">🖐️</span>
                                    <span class="tile-name">Fingerprint</span>
                                    <span id="cozy-tile-fingerprint-status">Checking…</span>
                                </button>
                                <button type="button" class="cozy-auth-tile" id="cozy-tile-face">
                                    <span class="tile-icon">🙂</span>
                                    <span class="tile-name">Face Unlock</span>
                                    <span id="cozy-tile-face-status">Checking…</span>
                                </button>
                                <button type="button" class="cozy-auth-tile" id="cozy-tile-voice" disabled>
                                    <span class="tile-icon">🎙️</span>
                                    <span class="tile-name">Voice Sign-In</span>
                                    <span>Not Supported</span>
                                </button>

                                <form id="cozy-login-device-form" class="cozy-device-form">
                                    <label>Administrator User ID
                                        <input id="cozy-login-device-userid" type="text" required>
                                    </label>
                                    <label>Device ID
                                        <input id="cozy-login-device-deviceid" type="text" required>
                                    </label>
                                    <button type="submit">Continue with Trusted Device</button>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function showError(container, message) {
        const el = container.querySelector("#cozy-login-error");
        if (!el) return;
        el.textContent = message;
        el.style.display = "block";
    }

    function renderSignedInBar(userId) {
        if (document.getElementById("cozy-auth-bar")) return;
        const bar = document.createElement("div");
        bar.id = "cozy-auth-bar";
        bar.style.cssText = "position:fixed;top:0;right:0;z-index:99999;padding:8px 14px;font:12px system-ui,sans-serif;background:#111827;color:#fff;border-bottom-left-radius:8px;display:flex;gap:10px;align-items:center;";
        bar.innerHTML = `<span>Signed in: ${escapeHtml(userId || "administrator")}</span><button id="cozy-logout-button" style="padding:4px 10px;border:none;border-radius:5px;background:#ef4444;color:#fff;cursor:pointer;font-size:12px;">Logout</button>`;
        document.body.appendChild(bar);
        document.getElementById("cozy-logout-button").addEventListener("click", () => {
            try { window.CozyOS.AuthCoordinator.logout(); } finally { window.location.reload(); }
        });
    }

    function wirePasswordToggle(container) {
        const input = container.querySelector("#cozy-login-password");
        const btn = container.querySelector("#cozy-pw-toggle");
        btn.addEventListener("click", () => {
            const show = input.type === "password";
            input.type = show ? "text" : "password";
            btn.textContent = show ? "HIDE" : "SHOW";
        });
    }

    function wireDrawer(container, caps) {
        const drawer = container.querySelector("#cozy-auth-drawer");
        container.querySelector("#cozy-drawer-toggle").addEventListener("click", () => {
            drawer.classList.toggle("collapsed");
        });

        const deviceForm = container.querySelector("#cozy-login-device-form");
        const openDeviceForm = () => deviceForm.classList.add("open");

        const fpTile = container.querySelector("#cozy-tile-fingerprint");
        const faceTile = container.querySelector("#cozy-tile-face");
        const fpStatus = container.querySelector("#cozy-tile-fingerprint-status");
        const faceStatus = container.querySelector("#cozy-tile-face-status");

        if (caps.platformAuth) {
            fpStatus.textContent = "Use your device fingerprint";
            faceStatus.textContent = "Use your device face recognition";
            const openViaPlatformAuth = async () => {
                try {
                    await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
                    openDeviceForm();
                } catch (_e) {
                    showError(container, "Platform authenticator check failed. Failing closed.");
                }
            };
            fpTile.addEventListener("click", openViaPlatformAuth);
            faceTile.addEventListener("click", openViaPlatformAuth);
        } else {
            fpStatus.textContent = "Not Supported";
            faceStatus.textContent = "Not Supported";
            fpTile.disabled = true;
            faceTile.disabled = true;
        }
    }

    const CozyOSLoginGate = {
        getVersion() { return GATE_VERSION; },

        async mountIfNeeded(container, onAuthenticated) {
            const ready = await waitFor(() => !!(window.CozyOS && window.CozyOS.AuthCoordinator && window.CozyOS.Session));
            if (!ready) {
                container.innerHTML = `<p style="font-family:system-ui,sans-serif;color:#fca5a5;padding:24px;">CozyOS Identity/Session services failed to load — cannot verify sign-in. Failing closed.</p>`;
                return;
            }

            await window.CozyOS.AuthCoordinator.restoreSession();

            const proceed = () => {
                renderSignedInBar(window.CozyOS.AuthCoordinator.getCurrentIdentity()?.userId);
                onAuthenticated();
            };

            if (window.CozyOS.AuthCoordinator.isAuthenticated()) { proceed(); return; }

            const logoSrc = "Images/cozyos-logo.png";
            renderLoginForm(container, logoSrc);
            wirePasswordToggle(container);

            const caps = await detectCapabilities();
            wireDrawer(container, caps);

            container.querySelector("#cozy-login-credentials-form").addEventListener("submit", async (e) => {
                e.preventDefault();
                const username = container.querySelector("#cozy-login-username").value;
                const password = container.querySelector("#cozy-login-password").value;
                const result = await window.CozyOS.AuthCoordinator.loginWithCredentials(username, password);
                if (!result.available) { showError(container, result.reason || "Sign-in failed."); return; }
                proceed();
            });

            container.querySelector("#cozy-login-device-form").addEventListener("submit", async (e) => {
                e.preventDefault();
                const userId = container.querySelector("#cozy-login-device-userid").value;
                const deviceId = container.querySelector("#cozy-login-device-deviceid").value;
                const result = await window.CozyOS.AuthCoordinator.loginWithTrustedDevice({ userId, deviceId });
                if (!result.granted) { showError(container, (result.failures && result.failures.join(" | ")) || result.reason || "Sign-in failed."); return; }
                proceed();
            });

            const notReady = (label) => (e) => {
                e.preventDefault();
                showError(container, `${label} isn't connected to a backend yet.`);
            };
            container.querySelector("#cozy-login-forgot").addEventListener("click", notReady("Password recovery"));
            container.querySelector("#cozy-login-register").addEventListener("click", notReady("Registration"));
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
