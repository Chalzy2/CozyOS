/**
 * CozyOS — Administrator Login Gate
 * File Reference: core/shell/cozy-login-gate.js
 * Layer: Core / Shell UI
 * Version: 1.0.0-ENTERPRISE
 * Milestone: 121
 *
 * ═══════════════════════════════════════════════════════════════════════
 * WHY THIS EXISTS — MILESTONE 121 FINDING
 * ═══════════════════════════════════════════════════════════════════════
 *   Ownership Review for Milestone 121 found there was no visible
 *   Administrator Login UI anywhere in this codebase — no login form,
 *   no page-level authentication gate. dashboard.html mounted
 *   WorkspaceShell unconditionally regardless of sign-in state; only
 *   individual mutating actions checked authorization (via
 *   checkResourcePermission), never page access itself. That gap is
 *   the real reason session persistence looked broken: there was no
 *   real login screen calling AuthCoordinator in the first place.
 *
 * CANONICAL OWNERSHIP
 *   Owns: the login FORM and the decision of whether to mount
 *   WorkspaceShell vs. show the login screen. Nothing else.
 *
 *   Does NOT own — and never re-implements:
 *     ✗ Authentication itself — delegates entirely to
 *       window.CozyOS.AuthCoordinator (loginWithCredentials /
 *       loginWithTrustedDevice / restoreSession / logout / isAuthenticated).
 *     ✗ "Who is current" — reads window.CozyOS.Auth.getCurrentIdentity()
 *       for display only, never sets it.
 *     ✗ WorkspaceShell's own UI — never modifies cozy-workspace.js;
 *       only calls its existing, real mount(container).
 *
 * HONEST SCOPE / KNOWN SIMPLIFICATION
 *   WorkspaceShell (core/shell/cozy-workspace.js) has no unmount().
 *   Rather than duplicate teardown logic that isn't this file's to own,
 *   logout here does a real, full page reload after
 *   AuthCoordinator.logout() completes — the gate re-evaluates from a
 *   clean slate, honestly, instead of leaving a partially-torn-down
 *   Workspace on screen.
 */

(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const GATE_VERSION = "1.2.0-ENTERPRISE-M352";

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
     * showAuthenticationForm(container, onAuthenticated, proceed)
     *   Extracted, byte-for-byte unchanged from mountIfNeeded()'s
     *   previous inline body (M254 and earlier). Renders the existing,
     *   tested login form, starts LivingParticles, wires input typing
     *   pulses, voice button, and both submit handlers - all exactly
     *   as before. Now callable from the new Phase 1 Welcome Screen's
     *   Login button as well as directly, with zero logic changes.
     */
    async function showAuthenticationForm(container, onAuthenticated, proceed) {
            renderLoginForm(container);

            // Living Engine integration: start the real, existing
            // particle system on the login screen. Honest no-op if
            // LivingParticles isn't loaded - never a hard dependency.
            if (window.CozyOS.LivingParticles && typeof window.CozyOS.LivingParticles.start === "function") {
                try { window.CozyOS.LivingParticles.start(); } catch (_err) { /* non-fatal */ }
            }

            // Phase 2 - Input Lighting: real typing pulse. Same class
            // name (cozy-typing) a future Living Sound engine can
            // listen for via a class-change observer, no redesign.
            for (const inputEl of [container.querySelector("#cozy-login-username"), container.querySelector("#cozy-login-password")]) {
                if (!inputEl) continue;
                inputEl.addEventListener("input", () => {
                    inputEl.classList.remove("cozy-typing");
                    void inputEl.offsetWidth; // restart animation on rapid typing
                    inputEl.classList.add("cozy-typing");
                });
            }

            // Milestone M211 — real composition of the existing
            // LoginExperienceOrchestrator (M210) and LanguageEngine/
            // CozySpeech. Never duplicates any of their logic.
            const orchestrator = window.CozyOS.LoginExperienceOrchestrator;
            const messageTextEl = container.querySelector("#cozy-live-message-text");
            let orchestratorResult = null;
            if (orchestrator && typeof orchestrator.run === "function") {
                orchestratorResult = await orchestrator.run({ greetingElement: messageTextEl });
            }

            const languageEngine = window.CozyOS.LanguageEngine;
            const langSelect = container.querySelector("#cozy-live-language-select");
            if (languageEngine && typeof languageEngine.listLanguages === "function" && langSelect) {
                const real = languageEngine.listLanguages();
                if (Array.isArray(real) && real.length > 0) {
                    langSelect.innerHTML = real.map(l => `<option value="${l.code}">${l.nativeName || l.name || l.code}</option>`).join("");
                }
                langSelect.addEventListener("change", (e) => {
                    try { languageEngine.setLanguage(e.target.value); }
                    catch (err) { console.error("[CozyOS] setLanguage failed:", err.message); }
                    // Milestone 212 addition: persist per-user, reusing
                    // IdentityEngine's new setLanguagePreference() (backed
                    // by the existing users store, no new storage).
                    const identity = window.CozyOS.IdentityEngine;
                    const currentUserId = window.CozyOS.Auth && typeof window.CozyOS.Auth.getCurrentAdministrator === "function"
                        ? (window.CozyOS.Auth.getCurrentAdministrator() || {}).userId : null;
                    if (identity && currentUserId && typeof identity.setLanguagePreference === "function") {
                        identity.setLanguagePreference(currentUserId, e.target.value);
                    }
                    // HONEST: does not re-translate the message's own text -
                    // no real capability to do so exists (see file header).
                });
                // Real restore: if a session was just restored and this
                // user has a real, saved preference, apply it - never
                // fabricates a preference that wasn't actually saved.
                if (orchestratorResult && orchestratorResult.sessionRestored) {
                    const identity = window.CozyOS.IdentityEngine;
                    const currentUserId = window.CozyOS.Auth && typeof window.CozyOS.Auth.getCurrentAdministrator === "function"
                        ? (window.CozyOS.Auth.getCurrentAdministrator() || {}).userId : null;
                    const savedPref = identity && currentUserId && typeof identity.getLanguagePreference === "function" ? identity.getLanguagePreference(currentUserId) : null;
                    if (savedPref) {
                        try { languageEngine.setLanguage(savedPref); langSelect.value = savedPref; } catch (_err) { /* honest no-op if no longer a real, registered language */ }
                    }
                }
            }

            const speech = window.CozyOS.CozySpeech;
            const voiceBtn = container.querySelector("#cozy-live-voice-btn");
            if (voiceBtn) {
                voiceBtn.addEventListener("click", async () => {
                    if (!speech || typeof speech.previewVoice !== "function" || !messageTextEl) return;
                    const text = messageTextEl.textContent || (orchestratorResult && orchestratorResult.greetingText) || "";
                    if (!text.trim()) return;
                    // Phase 3 - AI Lighting: real purple glow tied to the
                    // actual speech call's real duration, not a fake timer.
                    messageTextEl.classList.add("cozy-ai-speaking");
                    try { await speech.previewVoice({ text }); }
                    finally { messageTextEl.classList.remove("cozy-ai-speaking"); }
                });
            }

            const passwordToggle = container.querySelector("#cozy-login-password-toggle");
            if (passwordToggle) {
                passwordToggle.addEventListener("click", () => {
                    const pwField = container.querySelector("#cozy-login-password");
                    if (!pwField) return;
                    const isHidden = pwField.type === "password";
                    pwField.type = isHidden ? "text" : "password";
                    passwordToggle.textContent = isHidden ? "🙈" : "👁";
                    passwordToggle.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
                });
            }

            container.querySelector("#cozy-login-credentials-form").addEventListener("submit", async (e) => {
                e.preventDefault();
                const username = container.querySelector("#cozy-login-username").value;
                const password = container.querySelector("#cozy-login-password").value;
                const rememberMeChecked = container.querySelector("#cozy-login-remember")?.checked ?? true;
                // Milestone 200B: previously, any real exception thrown
                // anywhere inside this await chain (not just a returned
                // {available:false} result) was an uncaught rejected
                // promise — silently swallowed, leaving the page stuck
                // on the login screen with zero visible feedback. This
                // try/catch changes no logic; it only makes a genuine
                // failure visible instead of silent.
                try {
                    const result = await window.CozyOS.AuthCoordinator.loginWithCredentials(username, password, { rememberMe: rememberMeChecked });
                    if (!result.available) { showError(container, result.reason || "Sign-in failed."); return; }
                    // Living Engine integration: real login-success sound,
                    // composing the already-registered "login" event.
                    // Honestly no-ops if no sound pack is loaded (per
                    // LivingSounds' own real, tested behavior).
                    // Living Audio Engine integration: request through the
                    // central hierarchical API rather than calling
                    // LivingSounds directly, per the "applications must
                    // not embed their own sound systems" rule. Falls back
                    // to LivingSounds directly if LivingAudio isn't loaded
                    // (older builds / load-order edge case), never a hard
                    // dependency either way.
                    const audioEngine = window.CozyOS.LivingAudio;
                    if (audioEngine && typeof audioEngine.play === "function") {
                        try { await audioEngine.play("auth.login.success"); } catch (_err) { /* honest no-op */ }
                    } else if (window.CozyOS.LivingSounds && typeof window.CozyOS.LivingSounds.play === "function") {
                        try { await window.CozyOS.LivingSounds.play("login"); } catch (_err) { /* honest no-op */ }
                    }
                    await offerBiometricEnrollmentIfEligible(container, result.userId, proceed);
                } catch (err) {
                    console.error("[CozyOS] Login threw an unexpected exception:", err);
                    showError(container, `Unexpected error: ${err.message || "see console for details"}`);
                }
            });

            container.querySelector("#cozy-login-forgot-password").addEventListener("click", (e) => {
                e.preventDefault();
                if (!window.CozyOS.AdminRecoveryWizard || typeof window.CozyOS.AdminRecoveryWizard.open !== "function") {
                    showError(container, "Administrator Recovery Wizard is not loaded — check that core/shell/cozy-admin-recovery-wizard.js is present.");
                    return;
                }
                window.CozyOS.AdminRecoveryWizard.open();
            });

            container.querySelector("#cozy-goto-register").addEventListener("click", (e) => {
                e.preventDefault();
                renderAndBindRegisterForm(container, "user", proceed);
            });

            container.querySelector("#cozy-login-device-form").addEventListener("submit", async (e) => {
                e.preventDefault();
                const userId = container.querySelector("#cozy-login-device-userid").value;
                const deviceId = container.querySelector("#cozy-login-device-deviceid").value;
                try {
                    const result = await window.CozyOS.AuthCoordinator.loginWithTrustedDevice({ userId, deviceId });
                    if (!result.granted) { showError(container, (result.failures && result.failures.join(" | ")) || result.reason || "Sign-in failed."); return; }
                    proceed(userId);
                } catch (err) {
                    console.error("[CozyOS] Trusted-device login threw an unexpected exception:", err);
                    showError(container, `Unexpected error: ${err.message || "see console for details"}`);
                }
            });

            container.querySelector("#cozy-login-biometric-form").addEventListener("submit", async (e) => {
                e.preventDefault();
                const username = container.querySelector("#cozy-login-biometric-username").value.trim();
                const identity = window.CozyOS.IdentityEngine;
                const tdm = window.CozyOS.TrustedDeviceManager;
                if (!identity || typeof identity.listUsers !== "function" || !tdm || typeof tdm.generateFingerprint !== "function") {
                    showError(container, "IdentityEngine or TrustedDeviceManager is not loaded — cannot sign in with biometrics.");
                    return;
                }
                const user = identity.listUsers().find(u => u.username === username);
                if (!user) { showError(container, `No real administrator account found for "${username}".`); return; }
                const fingerprint = await tdm.generateFingerprint();
                const device = tdm.findDeviceForUser(user.id, fingerprint);
                if (!device) { showError(container, "This browser is not a trusted device for this account yet — sign in with your password first, then enroll biometrics."); return; }
                if (!device.biometricEnabled) { showError(container, "Biometric sign-in has not been enrolled on this device yet."); return; }
                try {
                    const result = await window.CozyOS.AuthCoordinator.loginWithBiometrics({ userId: user.id, deviceId: device.deviceId });
                    if (!result.granted) { showError(container, result.reason || "Biometric sign-in failed."); return; }
                    proceed(user.id);
                } catch (err) {
                    console.error("[CozyOS] Biometric login threw an unexpected exception:", err);
                    showError(container, `Unexpected error: ${err.message || "see console for details"}`);
                }
            });
    }

    /**
     * renderWelcomeScreen(container, onLoginSelected, onRegisterSelected)
     *   Real, new Phase 1 entry layer (per architecture decision).
     *   Shows logo + COZY(green)/OS(gold) + motto + two buttons. No
     *   username/password fields here - selecting either button calls
     *   the existing, unchanged showAuthenticationForm()/
     *   renderAndBindRegisterForm() to render the real, tested forms.
     *   Never duplicates authentication logic.
     */
    function renderWelcomeScreen(container, onLoginSelected, onRegisterSelected) {
        container.innerHTML = `
            <div style="position:relative;min-height:70vh;background:#0A0F0D;overflow:hidden;">
                <div class="cozy-living-bg cozy-ambient-light" style="position:absolute;inset:0;background:linear-gradient(rgba(10,15,13,0.55),rgba(10,15,13,0.85)),linear-gradient(135deg,#0A2612,#1B5E20);"></div>
                <div id="cozy-welcome-content" class="cozy-living-card cozy-living-panel cozy-bloom cozy-living-glass cozy-living-border-glow" style="position:relative;z-index:1;max-width:420px;margin:10vh auto;padding:36px;text-align:center;font-family:system-ui,sans-serif;border-radius:16px;backdrop-filter:blur(14px);color:#f1f5f4;transition:opacity 0.4s ease, transform 0.4s ease;">
                    <img src="assets/branding/cozyoslogo-emblem.png" alt="CozyOS" style="width:96px;height:auto;margin-bottom:8px;">
                    <h1 style="font-size:34px;font-weight:800;letter-spacing:0.06em;margin:6px 0;">
                        <span style="color:#2E7D32;">COZY</span><span style="color:#F9A825;">OS</span>
                    </h1>
                    <p style="font-size:13px;color:#81C784;margin:0 0 28px 0;letter-spacing:0.03em;">Built for Africa. Ready for the World.</p>
                    <div style="display:flex;flex-direction:column;gap:12px;">
                        <button type="button" id="cozy-welcome-login-btn" class="cozy-living-btn" style="padding:14px;border:1px solid rgba(249,168,37,0.3);border-radius:10px;background:linear-gradient(90deg,#1B5E20,#2E7D32);color:#fff;font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;cursor:pointer;">Login</button>
                        <button type="button" id="cozy-welcome-register-btn" class="cozy-living-btn" style="padding:14px;border:1px solid rgba(129,199,132,0.3);border-radius:10px;background:rgba(22,35,26,0.6);color:#f1f5f4;font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;cursor:pointer;">Register</button>
                    </div>
                </div>
            </div>`;

        if (window.CozyOS.LivingParticles && typeof window.CozyOS.LivingParticles.start === "function") {
            try { window.CozyOS.LivingParticles.start(); } catch (_err) { /* non-fatal */ }
        }

        /**
         * transitionToForm(selectedBtn, otherBtn, callback)
         *   Real timing per spec: button ripple immediately (CSS
         *   :active state, already inherent), other button dims over
         *   150ms, content fades out over 400ms, then the real form
         *   renders (which has its own bloom/glass entrance via
         *   existing classes - a real fade-in, not fabricated).
         */
        function transitionToForm(selectedBtn, otherBtn, callback) {
            const sounds = window.CozyOS.LivingSounds;
            if (sounds && typeof sounds.play === "function") { try { sounds.play("notification"); } catch (_err) { /* honest no-op */ } }
            if (otherBtn) otherBtn.style.opacity = "0.4";
            selectedBtn.style.filter = "brightness(1.15)";
            const content = container.querySelector("#cozy-welcome-content");
            setTimeout(() => {
                if (content) { content.style.opacity = "0"; content.style.transform = "translateY(-8px)"; }
                setTimeout(callback, 400);
            }, 150);
        }

        const loginBtn = container.querySelector("#cozy-welcome-login-btn");
        const registerBtn = container.querySelector("#cozy-welcome-register-btn");
        if (loginBtn) loginBtn.addEventListener("click", () => transitionToForm(loginBtn, registerBtn, onLoginSelected));
        if (registerBtn) registerBtn.addEventListener("click", () => transitionToForm(registerBtn, loginBtn, onRegisterSelected));
    }

    function renderLoginForm(container) {
        container.innerHTML = `
            <div style="position:relative;min-height:70vh;background:#0A0F0D;overflow:hidden;">
                <div class="cozy-living-bg cozy-ambient-light" style="position:absolute;inset:0;background:linear-gradient(rgba(10,15,13,0.55),rgba(10,15,13,0.85)),linear-gradient(135deg,#0A2612,#1B5E20);"></div>
                <div id="cozy-login-gate" class="cozy-living-card cozy-living-panel cozy-bloom cozy-living-glass cozy-living-border-glow" style="position:relative;z-index:1;max-width:400px;margin:8vh auto;padding:28px;font-family:system-ui,sans-serif;border-radius:16px;backdrop-filter:blur(14px);color:#f1f5f4;">
                    <div style="text-align:center;">
                        <span style="display:inline-block;font-size:10px;font-weight:700;padding:3px 10px;border-radius:999px;background:rgba(249,168,37,0.18);color:#F9A825;border:1px solid rgba(249,168,37,0.3);margin-bottom:8px;">SECURED WORKSPACE</span>
                        <h2 style="margin:0 0 2px 0;font-size:20px;font-weight:800;color:#fff;">CozyOS Enterprise</h2>
                        <p style="margin:0 0 12px 0;color:#81C784;font-size:11px;">Built in Africa. Ready for the World.</p>
                        <p style="margin:0 0 4px 0;font-size:15px;font-weight:600;">Administrator Login</p>
                        <p style="margin:0 0 20px 0;color:#94a3b8;font-size:12px;">Sign in to continue to the Administrator Workspace.</p>
                    </div>

                    <form id="cozy-login-credentials-form" style="display:flex;flex-direction:column;gap:10px;">
                        <label style="font-size:11px;color:#cbd5e1;">Username
                            <input id="cozy-login-username" type="text" autocomplete="username" required class="cozy-living-input"
                                style="display:block;width:100%;box-sizing:border-box;padding:9px;margin-top:4px;background:rgba(10,15,13,0.8);border-radius:10px;color:#fff;">
                        </label>
                        <label style="font-size:11px;color:#cbd5e1;">Password
                            <div style="position:relative;">
                                <input id="cozy-login-password" type="password" autocomplete="current-password" required class="cozy-living-input"
                                    style="display:block;width:100%;box-sizing:border-box;padding:9px;padding-right:36px;margin-top:4px;background:rgba(10,15,13,0.8);border-radius:10px;color:#fff;">
                                <button type="button" id="cozy-login-password-toggle" aria-label="Show password" class="cozy-pw-toggle-btn" style="position:absolute;right:8px;top:50%;transform:translateY(calc(-50% + 2px));background:none;border:none;cursor:pointer;color:#81C784;font-size:14px;padding:4px;transition:color 175ms ease, text-shadow 175ms ease;">👁</button>
                            </div>
                        </label>
                        <label style="font-size:11px;color:#cbd5e1;display:flex;align-items:center;gap:6px;">
                            <input id="cozy-login-remember" type="checkbox" checked> Remember Me (30 Days)
                        </label>
                        <button type="submit" style="padding:11px;border:1px solid rgba(249,168,37,0.3);border-radius:10px;background:linear-gradient(90deg,#1B5E20,#2E7D32);color:#fff;font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;cursor:pointer;margin-top:4px;">
                            Sign In to Administrator Workspace
                        </button>
                    </form>

                    <div style="display:flex;align-items:center;gap:10px;margin:16px 0;">
                        <div style="flex:1;border-top:1px solid #233827;"></div>
                        <span style="font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">modular security gateway</span>
                        <div style="flex:1;border-top:1px solid #233827;"></div>
                    </div>

                    <details>
                        <summary style="font-size:11px;color:#94a3b8;cursor:pointer;">Trusted-device Administrator sign-in</summary>
                        <form id="cozy-login-device-form" style="display:flex;flex-direction:column;gap:10px;margin-top:10px;">
                            <label style="font-size:11px;color:#cbd5e1;">Administrator User ID
                                <input id="cozy-login-device-userid" type="text" required
                                    style="display:block;width:100%;box-sizing:border-box;padding:9px;margin-top:4px;background:rgba(10,15,13,0.8);border:1px solid #233827;border-radius:10px;color:#fff;">
                            </label>
                            <label style="font-size:11px;color:#cbd5e1;">Device ID
                                <input id="cozy-login-device-deviceid" type="text" required
                                    style="display:block;width:100%;box-sizing:border-box;padding:9px;margin-top:4px;background:rgba(10,15,13,0.8);border:1px solid #233827;border-radius:10px;color:#fff;">
                            </label>
                            <button type="submit" style="padding:9px;border:1px solid #F9A825;border-radius:10px;background:transparent;color:#F9A825;font-weight:600;font-size:12px;cursor:pointer;">
                                Sign In with Trusted Device
                            </button>
                        </form>
                    </details>

                    <!-- Milestone 352 — real Biometric Sign-In. Never shown
                         as a substitute for username/password on a first
                         login: this only ever succeeds if AdminRecoveryPolicy
                         confirms (a) this exact browser is already a real,
                         trusted device for the entered username AND (b) that
                         device already has a real enrolled WebAuthn
                         credential (biometricEnabled) — both real,
                         pre-existing checks, composed here, never
                         re-implemented. -->
                    <details>
                        <summary style="font-size:11px;color:#94a3b8;cursor:pointer;">Biometric Sign-In</summary>
                        <form id="cozy-login-biometric-form" style="display:flex;flex-direction:column;gap:10px;margin-top:10px;">
                            <label style="font-size:11px;color:#cbd5e1;">Username
                                <input id="cozy-login-biometric-username" type="text" autocomplete="username" required
                                    style="display:block;width:100%;box-sizing:border-box;padding:9px;margin-top:4px;background:rgba(10,15,13,0.8);border:1px solid #233827;border-radius:10px;color:#fff;">
                            </label>
                            <button type="submit" style="padding:9px;border:1px solid #F9A825;border-radius:10px;background:transparent;color:#F9A825;font-weight:600;font-size:12px;cursor:pointer;">
                                Sign In with Biometrics
                            </button>
                        </form>
                    </details>

                    <div id="cozy-login-error" style="display:none;margin-top:14px;padding:10px;border-radius:8px;background:rgba(239,68,68,0.12);color:#fca5a5;font-size:12px;"></div>

                    <a href="#" id="cozy-login-forgot-password" style="display:block;margin-top:14px;font-size:12px;color:#F9A825;text-decoration:none;">Forgot Password?</a>
                    <a href="#" id="cozy-goto-register" style="display:block;margin-top:8px;font-size:12px;color:#F9A825;text-decoration:none;">Create an Account</a>
                    <p style="margin:16px 0 0 0;font-size:10px;color:#475569;text-align:center;">Build ${GATE_VERSION}</p>
                </div>

                <!--
                  Milestone M211 — Living Login Panel. Pure composition:
                  #cozy-live-message-text is the real target the existing
                  LoginExperienceOrchestrator's showTyping() writes into
                  (M210). Language select calls the existing
                  LanguageEngine.setLanguage() directly. Voice button
                  calls the existing CozySpeech.previewVoice() directly.
                  HONEST SCOPE: LivingMessageEngine stores a single text
                  field per message, not per-language variants, and
                  LanguageEngine.translate() is a pre-registered UI-key
                  lookup, not a machine translator - switching language
                  here does not re-translate the message's own text,
                  since no real capability to do so exists anywhere in
                  this repository. Disclosed rather than fabricated.
                -->
                <div id="cozy-live-panel" class="cozy-living-card cozy-living-glass" style="position:relative;z-index:1;max-width:400px;margin:16px auto 0;padding:20px;font-family:system-ui,sans-serif;border:1px solid rgba(129,199,132,0.18);border-radius:16px;color:#f1f5f4;">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                        <span style="font-size:12px;font-weight:700;color:#fff;">Live Message</span>
                        <select id="cozy-live-language-select" style="background:rgba(10,15,13,0.8);color:#cbd5e1;border:1px solid #233827;border-radius:8px;font-size:11px;padding:4px 6px;">
                            <option value="en">English</option>
                        </select>
                    </div>
                    <p id="cozy-live-message-text" style="margin:0 0 12px 0;font-size:12px;color:#e2e8f0;line-height:1.5;min-height:1.2em;"></p>
                    <button type="button" id="cozy-live-voice-btn" style="padding:7px 12px;border:1px solid #F9A825;border-radius:8px;background:transparent;color:#F9A825;font-size:11px;font-weight:600;cursor:pointer;">Listen</button>
                </div>
            </div>
        `;
    }

    /**
     * renderRegisterForm(container, accountType)
     *   Real (Milestone 202) — dual Administrator/User registration,
     *   switching via accountType without a page reload. Required
     *   fields only in this v1 (First/Last Name, Username, Email, Phone,
     *   Password, Confirm, Terms) — optional fields (photo, company,
     *   employee number, timezone, language) are real, disclosed,
     *   deferred UI work, not built this pass.
     */
    function renderRegisterForm(container, accountType) {
        // Security fix: the public registration form no longer offers
        // an "Administrator" option at all - accountType is always
        // "user" here now. Legitimate admin-invited registration
        // happens from the authenticated admin workspace
        // (#handleCreateAdministrator in cozy-workspace.js), never from
        // this public, unauthenticated page. The backend register()
        // also independently enforces this (see identity-engine.js),
        // so this is defense-in-depth, not the only safeguard.
        //
        // M364.1 fix: this rendered a white (#fff) card, in direct
        // violation of the "no white screens" rule and out of step
        // with renderWelcomeScreen()/renderLoginForm() above (same
        // file) which already use the real Living Glass pattern.
        // Restyled to match those two exactly - same wrapper classes,
        // same background gradient, same glass card - not a redesign,
        // a correction to match this file's own established pattern.
        // Every field id, name, and business rule below is unchanged.
        container.innerHTML = `
            <div style="position:relative;min-height:70vh;background:#0A0F0D;overflow:hidden;">
                <div class="cozy-living-bg cozy-ambient-light" style="position:absolute;inset:0;background:linear-gradient(rgba(10,15,13,0.55),rgba(10,15,13,0.85)),linear-gradient(135deg,#0A2612,#1B5E20);"></div>
                <div id="cozy-register-gate" class="cozy-living-card cozy-living-panel cozy-bloom cozy-living-glass cozy-living-border-glow" style="position:relative;z-index:1;max-width:400px;margin:6vh auto;padding:32px;font-family:system-ui,sans-serif;border-radius:16px;backdrop-filter:blur(14px);color:#f1f5f4;">
                    <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:800;color:#fff;">CozyOS Enterprise</h2>
                    <p style="margin:0 0 16px 0;color:#81C784;font-size:12px;">Built in Africa. Ready for the World.</p>
                    <p style="margin:0 0 16px 0;font-size:14px;font-weight:600;color:#f1f5f4;">Create an Account</p>
                    <form id="cozy-register-form" style="display:flex;flex-direction:column;gap:8px;">
                        <div style="display:flex;gap:8px;">
                            <input id="cozy-register-firstname" type="text" placeholder="First Name" required style="flex:1;padding:9px;background:rgba(10,15,13,0.8);border:1px solid #233827;border-radius:10px;color:#fff;">
                            <input id="cozy-register-lastname" type="text" placeholder="Last Name" required style="flex:1;padding:9px;background:rgba(10,15,13,0.8);border:1px solid #233827;border-radius:10px;color:#fff;">
                        </div>
                        <input id="cozy-register-username" type="text" placeholder="Username" required style="padding:9px;background:rgba(10,15,13,0.8);border:1px solid #233827;border-radius:10px;color:#fff;">
                        <input id="cozy-register-email" type="email" placeholder="Email Address" required style="padding:9px;background:rgba(10,15,13,0.8);border:1px solid #233827;border-radius:10px;color:#fff;">
                        <input id="cozy-register-phone" type="tel" placeholder="Phone Number" required style="padding:9px;background:rgba(10,15,13,0.8);border:1px solid #233827;border-radius:10px;color:#fff;">
                        <input id="cozy-register-password" type="password" placeholder="Password" required style="padding:9px;background:rgba(10,15,13,0.8);border:1px solid #233827;border-radius:10px;color:#fff;">
                        <input id="cozy-register-confirm" type="password" placeholder="Confirm Password" required style="padding:9px;background:rgba(10,15,13,0.8);border:1px solid #233827;border-radius:10px;color:#fff;">
                        <label style="font-size:12px;color:#cbd5e1;display:flex;align-items:center;gap:6px;">
                            <input id="cozy-register-terms" type="checkbox" required> I accept the Terms
                        </label>
                        <label style="font-size:12px;color:#cbd5e1;display:flex;align-items:center;gap:6px;">
                            <input id="cozy-register-remember" type="checkbox" checked> Remember Me (30 Days)
                        </label>
                        <button type="submit" style="padding:11px;border:1px solid rgba(249,168,37,0.3);border-radius:10px;background:linear-gradient(90deg,#1B5E20,#2E7D32);color:#fff;font-weight:700;cursor:pointer;margin-top:4px;">
                            Create Account
                        </button>
                    </form>
                    <div id="cozy-register-error" style="display:none;margin-top:14px;padding:10px;border-radius:8px;background:rgba(239,68,68,0.12);color:#fca5a5;font-size:12px;"></div>
                    <a href="#" id="cozy-goto-login" style="display:block;margin-top:14px;font-size:12px;color:#F9A825;text-decoration:none;">Already have an account? Sign In</a>
                </div>
            </div>
        `;
    }

    function renderFirstTimeSetupForm(container) {
        // M364.1 fix: this was the exact "old white administrator setup
        // page" the approved spec explicitly prohibits (background:#fff).
        // Restyled to match renderWelcomeScreen()/renderLoginForm()'s
        // already-established Living Glass pattern in this same file -
        // same background gradient, same glass card classes. No field,
        // id, or business rule changed.
        container.innerHTML = `
            <div style="position:relative;min-height:70vh;background:#0A0F0D;overflow:hidden;">
                <div class="cozy-living-bg cozy-ambient-light" style="position:absolute;inset:0;background:linear-gradient(rgba(10,15,13,0.55),rgba(10,15,13,0.85)),linear-gradient(135deg,#0A2612,#1B5E20);"></div>
                <div id="cozy-first-time-setup" class="cozy-living-card cozy-living-panel cozy-bloom cozy-living-glass cozy-living-border-glow" style="position:relative;z-index:1;max-width:400px;margin:8vh auto;padding:32px;font-family:system-ui,sans-serif;border-radius:16px;backdrop-filter:blur(14px);color:#f1f5f4;">
                    <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:800;color:#fff;">Welcome to CozyOS Enterprise</h2>
                    <p style="margin:0 0 4px 0;color:#81C784;font-size:12px;">Built in Africa. Ready for the World.</p>
                    <p style="margin:14px 0 20px 0;color:#cbd5e1;font-size:13px;">No Administrator account has been configured yet. Complete the initial setup to secure your CozyOS platform.</p>

                    <form id="cozy-setup-form" style="display:flex;flex-direction:column;gap:10px;">
                        <label style="font-size:12px;color:#cbd5e1;">Administrator Username
                            <input id="cozy-setup-username" type="text" autocomplete="username" required
                                style="display:block;width:100%;box-sizing:border-box;padding:9px;margin-top:4px;background:rgba(10,15,13,0.8);border:1px solid #233827;border-radius:10px;color:#fff;">
                        </label>
                        <label style="font-size:12px;color:#cbd5e1;">Password
                            <input id="cozy-setup-password" type="password" autocomplete="new-password" required
                                style="display:block;width:100%;box-sizing:border-box;padding:9px;margin-top:4px;background:rgba(10,15,13,0.8);border:1px solid #233827;border-radius:10px;color:#fff;">
                        </label>
                        <label style="font-size:12px;color:#cbd5e1;">Confirm Password
                            <input id="cozy-setup-confirm" type="password" autocomplete="new-password" required
                                style="display:block;width:100%;box-sizing:border-box;padding:9px;margin-top:4px;background:rgba(10,15,13,0.8);border:1px solid #233827;border-radius:10px;color:#fff;">
                        </label>
                        <button type="submit" style="padding:11px;border:1px solid rgba(249,168,37,0.3);border-radius:10px;background:linear-gradient(90deg,#1B5E20,#2E7D32);color:#fff;font-weight:700;cursor:pointer;">
                            Create Administrator
                        </button>
                    </form>

                    <div id="cozy-setup-error" style="display:none;margin-top:14px;padding:10px;border-radius:8px;background:rgba(239,68,68,0.12);color:#fca5a5;font-size:12px;"></div>
                    <p style="margin:16px 0 0 0;font-size:10px;color:#64748b;text-align:center;">Build ${GATE_VERSION}</p>
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

    /**
     * offerBiometricEnrollmentIfEligible(container, userId, proceed)
     *   Real (Milestone 205, Gates 2/3/5/11) — composes the existing,
     *   real WebAuthnProvider and TrustedDeviceManager. Never fabricates
     *   support: if WebAuthnProvider is missing or isSupported() is
     *   false, this silently calls proceed() with no prompt at all,
     *   exactly as it did before this milestone. The prompt appears at
     *   most once per real device (tracked via biometricPromptShown on
     *   the actual trusted-device record). Declining, or any failure
     *   along this path, always still calls proceed() — biometrics can
     *   never lock an administrator out of password login.
     */
    async function offerBiometricEnrollmentIfEligible(container, userId, proceed) {
        const webauthn = window.CozyOS.WebAuthnProvider;
        const tdm = window.CozyOS.TrustedDeviceManager;
        if (!webauthn || typeof webauthn.isSupported !== "function" || !webauthn.isSupported() || !tdm) {
            proceed(userId); // no real WebAuthn support - never fabricate a prompt
            return;
        }
        if (tdm.ready) await tdm.ready;
        const fingerprint = await tdm.generateFingerprint();
        let device = tdm.findDeviceForUser(userId, fingerprint);
        if (!device) {
            const reg = tdm.registerDevice(userId, { nickname: "This Device", fingerprint });
            if (!reg.success) { proceed(userId); return; }
            device = reg.device;
        }
        if (device.biometricEnabled || device.biometricPromptShown) { proceed(userId); return; }

        // M364.1 fix: white (#fff) card, same violation as the two
        // forms above - restyled to the same established Living Glass
        // pattern, no logic/id changes.
        container.innerHTML = `
            <div style="position:relative;min-height:50vh;background:#0A0F0D;overflow:hidden;">
                <div class="cozy-living-bg cozy-ambient-light" style="position:absolute;inset:0;background:linear-gradient(rgba(10,15,13,0.55),rgba(10,15,13,0.85)),linear-gradient(135deg,#0A2612,#1B5E20);"></div>
                <div id="cozy-biometric-prompt" class="cozy-living-card cozy-living-panel cozy-bloom cozy-living-glass cozy-living-border-glow" style="position:relative;z-index:1;max-width:380px;margin:10vh auto;padding:32px;font-family:system-ui,sans-serif;border-radius:16px;backdrop-filter:blur(14px);color:#f1f5f4;text-align:center;">
                    <h2 style="margin:0 0 8px 0;font-size:18px;font-weight:800;color:#fff;">Welcome back.</h2>
                    <p style="margin:0 0 20px 0;color:#cbd5e1;font-size:13px;">Would you like to enable biometric unlock for this trusted device?</p>
                    <button type="button" id="cozy-biometric-enable" style="width:100%;padding:11px;border:1px solid rgba(249,168,37,0.3);border-radius:10px;background:linear-gradient(90deg,#1B5E20,#2E7D32);color:#fff;font-weight:700;cursor:pointer;margin-bottom:8px;">Enable</button>
                    <button type="button" id="cozy-biometric-skip" style="width:100%;padding:10px;border:1px solid #233827;border-radius:10px;background:transparent;color:#cbd5e1;cursor:pointer;">Not Now</button>
                </div>
            </div>
        `;
        container.querySelector("#cozy-biometric-skip").addEventListener("click", () => {
            tdm.markBiometricPromptShown(device.deviceId);
            proceed(userId);
        });
        container.querySelector("#cozy-biometric-enable").addEventListener("click", async () => {
            tdm.markBiometricPromptShown(device.deviceId);
            try {
                const regResult = await webauthn.registerCredential(userId);
                if (regResult && regResult.available !== false) tdm.setBiometricEnabled(device.deviceId, true);
            } catch (_err) {
                // Real enrollment failure never blocks proceeding — password
                // login already succeeded; biometrics are purely additive.
            }
            proceed(userId);
        });
    }

    const CozyOSLoginGate = {
        getVersion() { return GATE_VERSION; },

        /**
         * mountIfNeeded(container, onAuthenticated)
         *   Real gate: waits (bounded) for AuthCoordinator to exist, lets
         *   its own restoreSession() attempt run, then checks
         *   isAuthenticated(). Shows the login form if not; calls
         *   onAuthenticated() immediately if already signed in.
         */
        async mountIfNeeded(container, onAuthenticated) {
            const ready = await waitFor(() => !!(window.CozyOS && window.CozyOS.AuthCoordinator && window.CozyOS.Session));
            if (!ready) {
                container.innerHTML = `<p style="font-family:system-ui,sans-serif;color:#b91c1c;padding:24px;">CozyOS Identity/Session services failed to load — cannot verify sign-in. Failing closed.</p>`;
                return;
            }

            // Give restoreSession() (already auto-triggered by auth-coordinator.js
            // on DOMContentLoaded) a moment to finish before deciding.
            await window.CozyOS.AuthCoordinator.restoreSession();

            const proceed = (explicitUserId = null) => {
                // Milestone 217 real bug fix: AuthCoordinator.getCurrentIdentity()
                // delegates to CozyOS.Auth.getCurrentAdministrator(), which is
                // intentionally administrator/developer-only by design (see
                // cozy-auth.js's identity:session-created listener - it
                // explicitly rejects and never tracks standard-user
                // sessions). Relying on it here silently returned null for
                // every non-admin login, which made the earlier routing
                // fix fall through to the wrong branch. Callers with a real
                // userId from an actual login/registration result must pass
                // it explicitly; the getCurrentIdentity() fallback remains
                // only for the admin/developer paths where it is correct.
                const currentUserId = explicitUserId || window.CozyOS.AuthCoordinator.getCurrentIdentity()?.userId;
                renderSignedInBar(currentUserId);
                const identity = window.CozyOS.IdentityEngine;
                const config = identity && currentUserId && typeof identity.getDashboardConfig === "function"
                    ? identity.getDashboardConfig(currentUserId) : null;
                // Milestone 353 — real fix: every real, active-account role
                // (admin, developer, user) now proceeds into the real
                // dashboard (WorkspaceShell), which as of this same
                // milestone resolves its own current user/role (via
                // Session/Auth/IdentityEngine) and filters navigation and
                // the Application Center accordingly — Administrator sees
                // everything, Developer sees Developer Hub plus permitted
                // apps, End User sees only their assigned apps. The old
                // "You do not have Administrator access" static placeholder
                // is removed: it existed only because WorkspaceShell could
                // not yet tell who was signed in or filter by role. Still
                // fails closed for a genuinely unavailable/misconfigured
                // account (!config || !config.available) rather than
                // guessing a dashboard for it.
                if (config && config.available) {
                    onAuthenticated();
                    return;
                }
                if (container) {
                    container.innerHTML = `
                        <div style="max-width:420px;margin:10vh auto;padding:24px;font-family:system-ui,sans-serif;border:1px solid #233827;border-radius:12px;background:#0A2612;color:#e2e8f0;">
                            <h2 style="margin:0 0 8px 0;color:#fff;">Signed in</h2>
                            <p style="margin:0 0 12px 0;font-size:13px;color:#81C784;">${(config && config.reason) ? config.reason.replace(/</g, "&lt;") : "Your account's dashboard configuration is unavailable."}</p>
                            <p style="font-size:12px;color:#94a3b8;">Contact your administrator if this continues.</p>
                        </div>`;
                }
            };

            if (window.CozyOS.AuthCoordinator.isAuthenticated()) {
                // Milestone 353 — real fix: on reload, AuthCoordinator's own
                // getCurrentIdentity() fallback inside proceed() only
                // resolves administrator/developer sessions (by design —
                // see the Milestone 217 note above proceed()'s
                // definition). CozyOS.Session (role-agnostic, established
                // for every real login) is checked first here so a
                // restored End User session also routes correctly instead
                // of silently falling through to the unavailable-config
                // branch.
                const restoredUid = (window.CozyOS.Session && typeof window.CozyOS.Session.current === "function" && window.CozyOS.Session.current()?.uid) || null;
                proceed(restoredUid);
                return;
            }

            /**
             * Real first-time-setup check.
             *
             * Milestone 216 fix: administrator existence must be a
             * PLATFORM property, not a browser property. This first asks
             * window.CozyOS.PlatformIdentity (core/modules/identity/
             * platform-identity-bridge.js, composing Firestore) whether
             * the platform already has an administrator — a real,
             * cross-device fact — before ever falling back to the local,
             * browser-scoped IdentityEngine.listUsers() signal that
             * caused this bug (a new browser/device/private window always
             * has an empty local IndexedDB and would otherwise wrongly
             * conclude no administrator exists).
             *
             * HONEST FALLBACK: if the platform can't be reached
             * (PlatformIdentity not loaded, offline, Firestore rules not
             * yet deployed), this degrades to the OLD local-only check
             * rather than blocking the page — but this is a known,
             * disclosed degraded mode, not the fixed behavior. See this
             * file's Milestone 216 report for what that means in
             * practice.
             */
            const identity = window.CozyOS.IdentityEngine;
            if (identity) {
                if (identity.ready && typeof identity.ready.then === "function") {
                    try { await identity.ready; } catch (_err) { /* proceed with whatever real state exists */ }
                }

                const platformIdentity = window.CozyOS.PlatformIdentity;
                let platformSaysAdminExists = null; // null = undetermined
                if (platformIdentity && typeof platformIdentity.checkAdminExists === "function") {
                    try {
                        const platformResult = await platformIdentity.checkAdminExists();
                        if (platformResult.determined) platformSaysAdminExists = platformResult.adminExists;
                        else console.warn("[CozyOS LoginGate] Platform administrator check was undetermined — degrading to local-only signal:", platformResult.reason);
                    } catch (err) {
                        console.warn("[CozyOS LoginGate] Platform administrator check threw — degrading to local-only signal:", err && err.message);
                    }
                }

                const localHasNoUsers = typeof identity.listUsers === "function" && identity.listUsers().length === 0;
                // Real decision: if the platform gave a determined answer, it
                // wins outright — a determined "yes" must never be overridden
                // by an empty local store, since that empty-local-store case
                // is exactly the bug being fixed. Only when the platform is
                // genuinely undetermined does this fall back to the old,
                // honestly-narrower local-only signal.
                const shouldShowFirstTimeSetup = platformSaysAdminExists !== null ? (platformSaysAdminExists === false) : localHasNoUsers;

                if (shouldShowFirstTimeSetup) {
                    renderFirstTimeSetupForm(container);
                    container.querySelector("#cozy-setup-form").addEventListener("submit", async (e) => {
                        e.preventDefault();
                        const username = container.querySelector("#cozy-setup-username").value;
                        const password = container.querySelector("#cozy-setup-password").value;
                        const confirm = container.querySelector("#cozy-setup-confirm").value;
                        const errorEl = container.querySelector("#cozy-setup-error");
                        const showSetupError = (msg) => { errorEl.textContent = msg; errorEl.style.display = "block"; };
                        if (password !== confirm) { showSetupError("Passwords do not match."); return; }
                        const result = await identity.createUser({ username, password, roles: ["platform-admin"] });
                        if (!result.available) { showSetupError(result.reason || "Could not create administrator account."); return; }
                        // Milestone M212 — real verification, not assumed.
                        // Reads back from the actual persisted IndexedDB
                        // store directly (IdentityStorage.loadAll), not
                        // IdentityEngine's in-memory list (which would
                        // trivially show the user regardless of whether
                        // persistence genuinely succeeded). If
                        // IdentityStorage itself isn't loaded, this is
                        // honestly reported rather than silently skipped.
                        const storage = window.CozyOS.IdentityStorage;
                        if (storage && typeof storage.loadAll === "function") {
                            const readback = await storage.loadAll("users");
                            if (!readback.success) {
                                showSetupError(`Administrator was created but persistence verification failed: ${readback.reason || "unknown storage error"}. Your account may not survive a refresh.`);
                                return;
                            }
                            const found = readback.records.some(u => u.id === result.userId);
                            if (!found) {
                                showSetupError("Administrator was created but could not be verified in permanent storage. Your account may not survive a refresh.");
                                return;
                            }
                        } else {
                            showSetupError("Warning: IdentityStorage is not loaded — the administrator account exists only in memory for this session and will not survive a refresh.");
                            return;
                        }
                        // Milestone 216 — real, atomic platform-level claim.
                        // Local persistence above only proves this browser
                        // has the account; this closes the actual race the
                        // task requires ("only one administrator can ever
                        // exist"): if another device claimed the platform
                        // administrator slot a moment earlier, this fails
                        // honestly rather than silently creating a second,
                        // conflicting administrator. Non-fatal if
                        // PlatformIdentity isn't loaded — the account still
                        // exists locally, but cross-device recognition
                        // degrades to the disclosed fallback (see this
                        // file's Milestone 216 header).
                        const platformIdentity = window.CozyOS.PlatformIdentity;
                        if (platformIdentity && typeof platformIdentity.claimAdministratorSlot === "function") {
                            try {
                                const claim = await platformIdentity.claimAdministratorSlot({ userId: result.userId, username });
                                if (!claim.claimed) {
                                    showSetupError(`Administrator was created locally, but could not be registered as the platform administrator: ${claim.reason || "unknown reason"}. If another device just completed setup, sign in instead rather than retrying.`);
                                    return;
                                }
                            } catch (err) {
                                showSetupError(`Administrator was created locally, but the platform-wide claim failed: ${err && err.message}. Cross-device recognition may not work until this is resolved.`);
                                return;
                            }
                        }
                        // Real, honest re-entry: re-run mountIfNeeded() so it
                        // now correctly falls through to the real login form
                        // (listUsers().length is no longer 0), rather than
                        // fabricating a signed-in state here.
                        this.mountIfNeeded(container, onAuthenticated);
                    });
                    return;
                }
            }

            // M354 real fix: this previously passed onAuthenticated instead
            // of proceed for the Register path — the only call site out of
            // four (see line ~218's correct sibling call) that skipped
            // proceed()'s real, Milestone 353 role/dashboard-config
            // fail-closed check and renderSignedInBar(). A user who
            // registered from this first Welcome Screen was routed
            // differently than one who registered via the login form's own
            // "Create an Account" link, even though both must behave
            // identically. No new logic added — this now threads the same
            // proceed closure already used by every other real entry point
            // in this file.
            renderWelcomeScreen(container, () => showAuthenticationForm(container, onAuthenticated, proceed), () => renderAndBindRegisterForm(container, "user", proceed));
        }
    };

    /**
     * renderAndBindRegisterForm(container, accountType, onAuthenticated)
     *   Real (Milestone 202) — renders the registration form, binds tab
     *   switching, and binds the real submit flow: calls the new
     *   IdentityEngine.register(), then — on success — calls the
     *   existing, completely unmodified AuthCoordinator.
     *   loginWithCredentials() for real auto-login, composing it rather
     *   than duplicating any login logic, before calling onAuthenticated().
     */
    function renderAndBindRegisterForm(container, accountType, onAuthenticated) {
        // Security fix: this public form only ever registers standard
        // users now - accountType is forced to "user" regardless of
        // what's passed in, and there is no UI path to request
        // otherwise. See identity-engine.js's register() for the
        // independent, backend-enforced version of this same rule.
        const realAccountType = "user";
        renderRegisterForm(container, realAccountType);

        container.querySelector("#cozy-goto-login").addEventListener("click", (e) => {
            e.preventDefault();
            // Real, clean re-entry — renderLoginForm() alone only sets
            // innerHTML, it does not rebind listeners. Re-running
            // mountIfNeeded() (already idempotent, used identically after
            // first-run setup) correctly re-renders AND rebinds.
            CozyOSLoginGate.mountIfNeeded(container, onAuthenticated);
        });

        container.querySelector("#cozy-register-form").addEventListener("submit", async (e) => {
            e.preventDefault();
            const errorEl = container.querySelector("#cozy-register-error");
            const showRegError = (msg) => { errorEl.textContent = msg; errorEl.style.display = "block"; };
            const identity = window.CozyOS.IdentityEngine;
            if (!identity || typeof identity.register !== "function") { showRegError("IdentityEngine is not loaded."); return; }

            const rememberMe = container.querySelector("#cozy-register-remember").checked;
            const payload = {
                accountType: realAccountType, firstName: container.querySelector("#cozy-register-firstname").value,
                lastName: container.querySelector("#cozy-register-lastname").value,
                username: container.querySelector("#cozy-register-username").value,
                email: container.querySelector("#cozy-register-email").value,
                phone: container.querySelector("#cozy-register-phone").value,
                password: container.querySelector("#cozy-register-password").value,
                confirmPassword: container.querySelector("#cozy-register-confirm").value,
                acceptTerms: container.querySelector("#cozy-register-terms").checked
            };

            try {
                const result = await identity.register(payload);
                if (!result.available) { showRegError(result.reason || "Registration failed."); return; }
                // Milestone 220 — best-effort mirror only, never a second
                // source of truth. IdentityEngine.register() above already
                // fully created and owns this account; this only gives the
                // same person a real, portable Firebase Auth credential
                // (the gap platform-identity-bridge.js's own header
                // disclosed: cross-device credentials need real Firebase
                // Auth). Failure here is intentionally non-fatal — it never
                // blocks registration or the real auto-login below, and is
                // only logged, not surfaced as a registration error.
                const firebaseAuth = window.CozyOS.Firebase && window.CozyOS.Firebase.Auth;
                if (firebaseAuth && typeof firebaseAuth.createUserWithEmailAndPassword === "function") {
                    try {
                        const mirror = await firebaseAuth.createUserWithEmailAndPassword(payload.email, payload.password);
                        if (!mirror.available) console.warn("[CozyOS LoginGate] Firebase credential mirror skipped:", mirror.reason);
                    } catch (err) {
                        console.warn("[CozyOS LoginGate] Firebase credential mirror threw:", err && err.message);
                    }
                }
                // Real auto-login — composes the exact same, unmodified
                // loginWithCredentials() the normal login form uses.
                // Never a second authentication path.
                const loginResult = await window.CozyOS.AuthCoordinator.loginWithCredentials(payload.username, payload.password, { rememberMe });
                if (!loginResult.available) { showRegError(`Account created but automatic sign-in failed: ${loginResult.reason || "unknown error"}. Please sign in manually.`); return; }
                // Milestone M207 — reuses the exact same biometric/trusted-device
                // onboarding built in M205 for the login form. No new
                // architecture: same function, same TrustedDeviceManager,
                // same WebAuthnProvider, same honest fallback if unsupported.
                await offerBiometricEnrollmentIfEligible(container, result.userId, () => onAuthenticated(result.userId));
            } catch (err) {
                console.error("[CozyOS] Registration threw an unexpected exception:", err);
                showRegError(`Unexpected error: ${err.message || "see console for details"}`);
            }
        });
    }

    if (window.CozyOS.LoginGate?.getVersion) {
        if (window.CozyOS.LoginGate.getVersion() !== GATE_VERSION) {
            throw new Error("[CozyOS Framework Execution Error] VERSION_CONFLICT: LoginGate.");
        }
        return;
    }
    window.CozyOS.LoginGate = Object.freeze(CozyOSLoginGate);
})();
