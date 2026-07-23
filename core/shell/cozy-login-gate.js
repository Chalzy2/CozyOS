/**
 * CozyOS — Administrator Login Gate
 * File Reference: core/shell/cozy-login-gate.js
 * Layer: Core / Shell UI
 * Version: 1.1.0-ENTERPRISE
 * Milestone: 129 — Login Gate UI Enterprise Redesign
 *
 * ═══════════════════════════════════════════════════════════════════════
 * MILESTONE 129 SCOPE — UI ONLY
 * ═══════════════════════════════════════════════════════════════════════
 *   Ownership Review confirmed this file is the sole real LoginGate
 *   (Layer: UI only). Canonical AuthCoordinator remains
 *   core/modules/identity/auth-coordinator.js exclusively — 
 *   core/security/auth-coordinator.js is deprecated/orphaned and is
 *   neither called nor referenced here. No session architecture was
 *   touched: this file still calls window.CozyOS.AuthCoordinator and
 *   window.CozyOS.Session exactly as Milestone 121 wired them.
 *
 *   Changed: rendered HTML, CSS, animation, responsive layout, and a
 *   new collapsible biometric side panel.
 *   Unchanged: exports, public API (getVersion/mountIfNeeded), element
 *   IDs the login/device forms rely on, event wiring, AuthCoordinator
 *   calls, Session behavior, version-conflict guard pattern.
 *
 *   Biometric panel honesty (per Constitution — never fake biometric
 *   auth): Fingerprint/Face Unlock entries use real capability
 *   detection only (PublicKeyCredential
 *   .isUserVerifyingPlatformAuthenticatorAvailable()) to report
 *   whether platform authenticator hardware exists. No such entry
 *   performs or claims to perform an actual biometric login — there is
 *   no AuthCoordinator API for that. Tapping an available entry reveals
 *   the one real secure path we do have wired (Trusted Device sign-in);
 *   tapping when unavailable shows an honest "not available" state.
 *   Voice Sign-In has no standard browser authentication-capability
 *   API, so it is always reported as unavailable rather than faked.
 */
(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const GATE_VERSION = "1.1.0-ENTERPRISE";
    const STYLE_ID = "cozy-login-gate-styles-129";

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

    // ---------------------------------------------------------------
    // Styles (injected once into <head>, not into the container, so
    // the panel-collapse animation survives container re-renders).
    // ---------------------------------------------------------------
    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            #cozy-login-gate-root {
                position: relative;
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 32px 16px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
                background: #05100a;
                overflow: hidden;
            }
            #cozy-login-gate-root::before {
                content: "";
                position: absolute;
                inset: -10%;
                background:
                    radial-gradient(circle at 15% 25%, rgba(27,94,32,0.35), transparent 55%),
                    radial-gradient(circle at 85% 75%, rgba(249,168,37,0.14), transparent 50%),
                    radial-gradient(circle at 50% 50%, rgba(27,94,32,0.18), transparent 60%),
                    #05100a;
                animation: cozy-breathe 9s ease-in-out infinite;
                z-index: 0;
            }
            @keyframes cozy-breathe {
                0%, 100% { transform: scale(1); opacity: 0.85; }
                50% { transform: scale(1.08); opacity: 1; }
            }
            .cozy-gate-wrap {
                position: relative;
                z-index: 1;
                display: flex;
                align-items: stretch;
                gap: 0;
                width: 100%;
                max-width: 920px;
            }
            .cozy-gate-card {
                position: relative;
                flex: 1 1 480px;
                background: rgba(10, 22, 14, 0.72);
                backdrop-filter: blur(18px);
                -webkit-backdrop-filter: blur(18px);
                border: 1px solid rgba(76, 175, 80, 0.35);
                border-radius: 20px;
                padding: 36px 40px 28px;
                box-shadow: 0 0 40px rgba(27,94,32,0.25), 0 20px 60px rgba(0,0,0,0.5);
            }
            .cozy-gate-card::before {
                content: "";
                position: absolute;
                top: -1px; left: 8%; right: 8%; height: 1px;
                background: linear-gradient(90deg, transparent, #4CAF50, transparent);
                opacity: 0.8;
            }
            .cozy-logo-row { display: flex; flex-direction: column; align-items: center; text-align: center; margin-bottom: 6px; }
            .cozy-logo-mark { width: 64px; height: 64px; margin-bottom: 10px; }
            .cozy-logo-text { font-size: 30px; font-weight: 800; letter-spacing: 0.5px; color: #fff; }
            .cozy-logo-text .os { color: #43A047; }
            .cozy-logo-sub { font-size: 11px; letter-spacing: 3px; color: #9fb8a3; margin-top: 2px; }
            .cozy-motto { font-size: 13px; margin: 10px 0 18px; text-align: center; }
            .cozy-motto .a { color: #66BB6A; font-weight: 600; }
            .cozy-motto .b { color: #F9A825; font-weight: 600; }
            .cozy-welcome { color: #fff; font-size: 21px; font-weight: 700; text-align: center; margin: 4px 0 2px; }
            .cozy-subtitle { color: #9fb8a3; font-size: 13px; text-align: center; margin-bottom: 20px; }
            .cozy-field-label { display:block; font-size: 11px; letter-spacing: 1px; color: #66BB6A; font-weight: 700; margin-bottom: 6px; }
            .cozy-field-wrap { position: relative; margin-bottom: 16px; }
            .cozy-field-wrap input {
                width: 100%; box-sizing: border-box; padding: 12px 44px 12px 42px;
                background: rgba(255,255,255,0.03); border: 1px solid rgba(76,175,80,0.35);
                border-radius: 10px; color: #eafbea; font-size: 14px; outline: none;
                transition: border-color .15s, box-shadow .15s;
            }
            .cozy-field-wrap input::placeholder { color: #6b8a70; }
            .cozy-field-wrap input:focus { border-color: #66BB6A; box-shadow: 0 0 0 3px rgba(102,187,106,0.18); }
            .cozy-field-icon { position: absolute; left: 13px; top: 50%; transform: translateY(-50%); color: #4CAF50; display:flex; }
            .cozy-field-icon svg { width: 17px; height: 17px; }
            .cozy-show-toggle {
                position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
                background: none; border: none; color: #66BB6A; font-size: 11px; font-weight: 700;
                letter-spacing: 0.5px; cursor: pointer; padding: 4px;
            }
            .cozy-row-between { display: flex; align-items: center; justify-content: space-between; margin: 2px 0 18px; font-size: 12.5px; }
            .cozy-remember { display: flex; align-items: center; gap: 7px; color: #cfe4d1; cursor: pointer; }
            .cozy-remember input { accent-color: #4CAF50; width: 14px; height: 14px; }
            .cozy-forgot { color: #F9A825; text-decoration: none; font-weight: 600; }
            .cozy-forgot:hover { text-decoration: underline; }
            .cozy-submit-btn {
                width: 100%; padding: 13px; border: none; border-radius: 10px; cursor: pointer;
                font-size: 14.5px; font-weight: 700; letter-spacing: 0.5px; color: #052508;
                background: linear-gradient(135deg, #66BB6A, #1B5E20);
                box-shadow: 0 8px 20px rgba(27,94,32,0.45);
                transition: transform .12s, box-shadow .12s;
            }
            .cozy-submit-btn:hover { transform: translateY(-1px); box-shadow: 0 10px 26px rgba(27,94,32,0.55); }
            .cozy-submit-btn:active { transform: translateY(0); }
            .cozy-divider { display:flex; align-items:center; gap:12px; color:#5c7a60; font-size:11px; margin: 20px 0 14px; }
            .cozy-divider::before, .cozy-divider::after { content:""; flex:1; height:1px; background: rgba(102,187,106,0.25); }
            .cozy-register { text-align:center; font-size: 13px; color: #cfe4d1; }
            .cozy-register a { color: #66BB6A; font-weight: 700; text-decoration: none; }
            .cozy-register a:hover { text-decoration: underline; }
            .cozy-admin-note { display:flex; align-items:center; justify-content:center; gap:6px; margin-top: 16px; color:#7f9f83; font-size: 11.5px; text-align:center; }
            .cozy-admin-note svg { width: 13px; height: 13px; flex: none; color: #F9A825; }

            .cozy-device-details { margin-top: 14px; }
            .cozy-device-details summary { font-size: 12px; color: #9fb8a3; cursor: pointer; list-style: none; }
            .cozy-device-details summary::-webkit-details-marker { display: none; }
            .cozy-device-details[open] summary { color: #66BB6A; margin-bottom: 10px; }

            .cozy-error-box {
                display: none; margin-top: 14px; padding: 10px 12px; border-radius: 8px;
                background: rgba(211,47,47,0.12); border: 1px solid rgba(211,47,47,0.4);
                color: #ff8a80; font-size: 12.5px;
            }

            /* Toggle arrow */
            .cozy-panel-toggle {
                position: relative; z-index: 2; flex: none; width: 34px; display: flex;
                align-items: center; justify-content: center;
            }
            .cozy-panel-toggle button {
                width: 34px; height: 34px; border-radius: 50%; border: 1px solid rgba(249,168,37,0.55);
                background: #0d1a10; color: #F9A825; cursor: pointer; display: flex; align-items: center;
                justify-content: center; box-shadow: 0 0 14px rgba(249,168,37,0.25);
                transition: transform .25s ease;
            }
            .cozy-panel-toggle svg { width: 16px; height: 16px; transition: transform .25s ease; }
            .cozy-gate-wrap.collapsed .cozy-panel-toggle svg { transform: rotate(180deg); }

            /* Biometric side panel */
            .cozy-bio-panel {
                flex: 1 1 300px; max-width: 320px; background: rgba(10, 22, 14, 0.55);
                backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
                border: 1px solid rgba(249,168,37,0.35); border-radius: 20px;
                padding: 28px 26px; transition: max-width .28s ease, opacity .22s ease, padding .28s ease, margin .28s ease;
                overflow: hidden;
            }
            .cozy-gate-wrap.collapsed .cozy-bio-panel {
                max-width: 0; padding-left: 0; padding-right: 0; opacity: 0; margin-left: -1px;
                border-color: transparent; pointer-events: none;
            }
            .cozy-bio-title { color: #F9A825; font-size: 13px; font-weight: 800; letter-spacing: 1.5px; margin-bottom: 6px; }
            .cozy-bio-sub { color: #9fb8a3; font-size: 12.5px; margin-bottom: 18px; line-height: 1.4; }
            .cozy-bio-item {
                display: flex; align-items: center; gap: 14px; padding: 14px; margin-bottom: 12px;
                border: 1px solid rgba(249,168,37,0.25); border-radius: 12px; cursor: pointer;
                background: rgba(255,255,255,0.02); transition: border-color .15s, background .15s;
            }
            .cozy-bio-item:hover { border-color: rgba(249,168,37,0.55); background: rgba(249,168,37,0.05); }
            .cozy-bio-item.unavailable { opacity: 0.45; cursor: not-allowed; }
            .cozy-bio-item.unavailable:hover { border-color: rgba(249,168,37,0.25); background: rgba(255,255,255,0.02); }
            .cozy-bio-icon { width: 38px; height: 38px; flex: none; display:flex; align-items:center; justify-content:center; color: #4CAF50; }
            .cozy-bio-icon.gold { color: #F9A825; }
            .cozy-bio-icon.purple { color: #9C7CF4; }
            .cozy-bio-icon svg { width: 26px; height: 26px; }
            .cozy-bio-name { color: #fff; font-size: 13.5px; font-weight: 700; margin-bottom: 2px; }
            .cozy-bio-desc { color: #93b596; font-size: 11.5px; }
            .cozy-bio-chev { margin-left: auto; color: #6b8a70; }
            .cozy-bio-status { font-size: 10.5px; font-weight: 700; letter-spacing: 0.5px; margin-top: 2px; }
            .cozy-bio-status.ok { color: #66BB6A; }
            .cozy-bio-status.no { color: #a08a63; }

            @media (max-width: 800px) {
                .cozy-gate-wrap { flex-direction: column; max-width: 460px; }
                .cozy-panel-toggle { display: none; }
                .cozy-bio-panel { max-width: 100%; }
                .cozy-gate-wrap.collapsed .cozy-bio-panel { display: none; }
            }

            #cozy-auth-bar {
                position: fixed; top: 0; right: 0; z-index: 99999; padding: 8px 14px;
                font: 12px system-ui, sans-serif; background: #0d1a10; color: #eafbea;
                border-bottom-left-radius: 10px; border: 1px solid rgba(76,175,80,0.35); border-top: none; border-right: none;
                display: flex; gap: 10px; align-items: center;
            }
            #cozy-logout-button {
                padding: 4px 10px; border: none; border-radius: 6px; background: #b91c1c;
                color: #fff; cursor: pointer; font-size: 12px; font-weight: 600;
            }
        `;
        document.head.appendChild(style);
    }

    // ---------------------------------------------------------------
    // Icons (inline SVG — no external asset dependency)
    // ---------------------------------------------------------------
    const ICONS = {
        logo: `<svg viewBox="0 0 100 100" class="cozy-logo-mark" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M68 28C60 22 49 20 39 24C25 30 18 46 24 60C30 74 46 81 60 75C67 72 72 67 75 60"
                stroke="url(#cozyGrad)" stroke-width="9" stroke-linecap="round"/>
            <path d="M60 40C55 37 48 37 43 40C35 44 32 53 36 60C40 67 49 70 57 66"
                stroke="url(#cozyGrad2)" stroke-width="7" stroke-linecap="round"/>
            <defs>
                <linearGradient id="cozyGrad" x1="20" y1="20" x2="80" y2="80">
                    <stop stop-color="#A5D6A7"/><stop offset="1" stop-color="#1B5E20"/>
                </linearGradient>
                <linearGradient id="cozyGrad2" x1="30" y1="35" x2="65" y2="70">
                    <stop stop-color="#66BB6A"/><stop offset="1" stop-color="#2E7D32"/>
                </linearGradient>
            </defs>
        </svg>`,
        user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg>`,
        lock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`,
        shield: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"/></svg>`,
        chevronLeft: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 6l-6 6 6 6"/></svg>`,
        chevronRight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>`,
        fingerprint: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2a7 7 0 0 0-7 7c0 3 1 4 1 7"/><path d="M12 2a7 7 0 0 1 7 7c0 4 0 6 1 8"/><path d="M12 6a5 5 0 0 0-5 5c0 4 1 5 1 6"/><path d="M12 6a5 5 0 0 1 5 5c0 3 .5 5 1 6"/><path d="M12 10a3 3 0 0 0-3 3c0 3 1 4 2 6"/><path d="M12 10a3 3 0 0 1 3 3c0 2 .3 3.5 1 5"/></svg>`,
        face: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 8V6a2 2 0 0 1 2-2h2M4 16v2a2 2 0 0 0 2 2h2M20 8V6a2 2 0 0 0-2-2h-2M20 16v2a2 2 0 0 1-2 2h-2"/><circle cx="9" cy="11" r="1"/><circle cx="15" cy="11" r="1"/><path d="M9 15c1 1 5 1 6 0"/></svg>`,
        voice: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v1M8 9v7M12 5v15M16 9v7M20 12v1"/></svg>`,
        info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v.01M12 11v5"/></svg>`
    };

    // ---------------------------------------------------------------
    // Real (non-fake) biometric capability detection
    // ---------------------------------------------------------------
    async function detectPlatformAuthenticator() {
        try {
            if (window.PublicKeyCredential && PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) {
                return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
            }
        } catch (_) { /* fail closed to "unavailable" */ }
        return false;
    }

    function renderLoginForm(container) {
        injectStyles();
        container.innerHTML = `
            <div id="cozy-login-gate-root">
                <div class="cozy-gate-wrap" id="cozy-gate-wrap">
                    <div class="cozy-gate-card">
                        <div class="cozy-logo-row">
                            ${ICONS.logo}
                            <div class="cozy-logo-text">COZY<span class="os">OS</span></div>
                            <div class="cozy-logo-sub">ENTERPRISE OPERATING SYSTEM</div>
                        </div>
                        <div class="cozy-motto"><span class="a">Built for Africa.</span> <span class="b">Ready for the World.</span></div>
                        <div class="cozy-welcome">Welcome Back</div>
                        <div class="cozy-subtitle">Secure access to the CozyOS Enterprise Platform.</div>

                        <form id="cozy-login-credentials-form">
                            <label class="cozy-field-label">Username</label>
                            <div class="cozy-field-wrap">
                                <span class="cozy-field-icon">${ICONS.user}</span>
                                <input id="cozy-login-username" type="text" autocomplete="username" placeholder="Enter your username" required>
                            </div>
                            <label class="cozy-field-label">Password</label>
                            <div class="cozy-field-wrap">
                                <span class="cozy-field-icon">${ICONS.lock}</span>
                                <input id="cozy-login-password" type="password" autocomplete="current-password" placeholder="Enter your password" required>
                                <button type="button" class="cozy-show-toggle" id="cozy-toggle-password">SHOW</button>
                            </div>
                            <div class="cozy-row-between">
                                <label class="cozy-remember"><input type="checkbox"> Remember me</label>
                                <a href="#" class="cozy-forgot">Forgot Password?</a>
                            </div>
                            <button type="submit" class="cozy-submit-btn">SIGN IN</button>
                        </form>

                        <div class="cozy-divider">OR</div>
                        <div class="cozy-register">Don't have an account? <a href="#">Register for Application</a></div>
                        <div class="cozy-admin-note">${ICONS.shield}Administrator accounts require approval before activation.</div>

                        <details class="cozy-device-details">
                            <summary>Trusted-device Administrator sign-in</summary>
                            <form id="cozy-login-device-form">
                                <label class="cozy-field-label">Administrator User ID</label>
                                <div class="cozy-field-wrap">
                                    <input id="cozy-login-device-userid" type="text" placeholder="User ID" required>
                                </div>
                                <label class="cozy-field-label">Device ID</label>
                                <div class="cozy-field-wrap">
                                    <input id="cozy-login-device-deviceid" type="text" placeholder="Device ID" required>
                                </div>
                                <button type="submit" class="cozy-submit-btn">SIGN IN WITH TRUSTED DEVICE</button>
                            </form>
                        </details>

                        <div id="cozy-login-error" class="cozy-error-box"></div>
                    </div>

                    <div class="cozy-panel-toggle">
                        <button type="button" id="cozy-bio-toggle" aria-label="Toggle quick sign-in panel">${ICONS.chevronLeft}</button>
                    </div>

                    <div class="cozy-bio-panel" id="cozy-bio-panel">
                        <div class="cozy-bio-title">QUICK SIGN-IN</div>
                        <div class="cozy-bio-sub">Use your preferred authentication method</div>

                        <div class="cozy-bio-item" data-bio="fingerprint">
                            <span class="cozy-bio-icon">${ICONS.fingerprint}</span>
                            <div>
                                <div class="cozy-bio-name">FINGERPRINT</div>
                                <div class="cozy-bio-desc">Use your device fingerprint</div>
                                <div class="cozy-bio-status" data-status="fingerprint"></div>
                            </div>
                            <span class="cozy-bio-chev">${ICONS.chevronRight}</span>
                        </div>

                        <div class="cozy-bio-item" data-bio="face">
                            <span class="cozy-bio-icon">${ICONS.face}</span>
                            <div>
                                <div class="cozy-bio-name">FACE UNLOCK</div>
                                <div class="cozy-bio-desc">Use your device face recognition</div>
                                <div class="cozy-bio-status" data-status="face"></div>
                            </div>
                            <span class="cozy-bio-chev">${ICONS.chevronRight}</span>
                        </div>

                        <div class="cozy-bio-item unavailable" data-bio="voice">
                            <span class="cozy-bio-icon purple">${ICONS.voice}</span>
                            <div>
                                <div class="cozy-bio-name">VOICE SIGN-IN</div>
                                <div class="cozy-bio-desc">Use voice authentication</div>
                                <div class="cozy-bio-status no">NOT AVAILABLE</div>
                            </div>
                            <span class="cozy-bio-chev">${ICONS.chevronRight}</span>
                        </div>

                        <div class="cozy-bio-item" data-bio="device">
                            <span class="cozy-bio-icon gold">${ICONS.shield}</span>
                            <div>
                                <div class="cozy-bio-name">TRUSTED DEVICE</div>
                                <div class="cozy-bio-desc">Use a trusted device to sign in securely</div>
                                <div class="cozy-bio-status ok">AVAILABLE</div>
                            </div>
                            <span class="cozy-bio-chev">${ICONS.chevronRight}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Show/hide password (display-only, no auth logic)
        const pwInput = container.querySelector("#cozy-login-password");
        container.querySelector("#cozy-toggle-password").addEventListener("click", (e) => {
            const btn = e.currentTarget;
            const showing = pwInput.type === "text";
            pwInput.type = showing ? "password" : "text";
            btn.textContent = showing ? "SHOW" : "HIDE";
        });

        // Collapsible biometric panel (arrow-driven, per spec)
        const wrap = container.querySelector("#cozy-gate-wrap");
        container.querySelector("#cozy-bio-toggle").addEventListener("click", () => {
            wrap.classList.toggle("collapsed");
        });

        // Real capability detection — never fabricated
        detectPlatformAuthenticator().then((available) => {
            ["fingerprint", "face"].forEach((kind) => {
                const item = container.querySelector(`.cozy-bio-item[data-bio="${kind}"]`);
                const status = container.querySelector(`[data-status="${kind}"]`);
                if (available) {
                    status.textContent = "AVAILABLE";
                    status.classList.add("ok");
                } else {
                    status.textContent = "NOT AVAILABLE";
                    status.classList.add("no");
                    item.classList.add("unavailable");
                }
            });
        });

        // Biometric entries never authenticate on their own (no fake
        // biometric login exists). Available entries route to the one
        // real secure path already wired below: Trusted Device sign-in.
        container.querySelectorAll(".cozy-bio-item:not(.unavailable)").forEach((item) => {
            item.addEventListener("click", () => {
                const details = container.querySelector(".cozy-device-details");
                details.open = true;
                details.scrollIntoView({ behavior: "smooth", block: "center" });
                container.querySelector("#cozy-login-device-userid")?.focus();
            });
        });
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
        bar.innerHTML = `<span>Signed in: ${escapeHtml(userId || "administrator")}</span><button id="cozy-logout-button">Logout</button>`;
        document.body.appendChild(bar);
        document.getElementById("cozy-logout-button").addEventListener("click", () => {
            try { window.CozyOS.AuthCoordinator.logout(); } finally { window.location.reload(); }
        });
    }

    const CozyOSLoginGate = {
        getVersion() { return GATE_VERSION; },

        /**
         * mountIfNeeded(container, onAuthenticated)
         *   Unchanged from Milestone 121: waits (bounded) for
         *   AuthCoordinator to exist, lets its own restoreSession()
         *   attempt run, then checks isAuthenticated(). Shows the login
         *   form if not; calls onAuthenticated() immediately if already
         *   signed in.
         */
        async mountIfNeeded(container, onAuthenticated) {
            const ready = await waitFor(() => !!(window.CozyOS && window.CozyOS.AuthCoordinator && window.CozyOS.Session));
            if (!ready) {
                injectStyles();
                container.innerHTML = `<div id="cozy-login-gate-root"><div class="cozy-gate-card" style="max-width:420px;text-align:center;color:#ff8a80;">CozyOS Identity/Session services failed to load — cannot verify sign-in. Failing closed.</div></div>`;
                return;
            }

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
