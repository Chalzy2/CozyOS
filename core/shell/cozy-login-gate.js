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
    const GATE_VERSION = "1.0.0-ENTERPRISE";

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

    function renderLoginForm(container) {
        container.innerHTML = `
            <div id="cozy-login-gate" style="max-width:380px;margin:10vh auto;padding:32px;font-family:system-ui,sans-serif;border:1px solid #ddd;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,0.06);background:#fff;">
                <h2 style="margin:0 0 4px 0;font-size:20px;">CozyOS Administrator Login</h2>
                <p style="margin:0 0 20px 0;color:#666;font-size:13px;">Sign in to continue to the Administrator Workspace.</p>

                <form id="cozy-login-credentials-form" style="display:flex;flex-direction:column;gap:10px;">
                    <label style="font-size:12px;color:#444;">Username
                        <input id="cozy-login-username" type="text" autocomplete="username" required
                            style="display:block;width:100%;box-sizing:border-box;padding:8px;margin-top:4px;border:1px solid #ccc;border-radius:6px;">
                    </label>
                    <label style="font-size:12px;color:#444;">Password
                        <input id="cozy-login-password" type="password" autocomplete="current-password" required
                            style="display:block;width:100%;box-sizing:border-box;padding:8px;margin-top:4px;border:1px solid #ccc;border-radius:6px;">
                    </label>
                    <button type="submit" style="padding:9px;border:none;border-radius:6px;background:#2563eb;color:#fff;font-weight:600;cursor:pointer;">
                        Sign In
                    </button>
                </form>

                <details style="margin-top:16px;">
                    <summary style="font-size:12px;color:#666;cursor:pointer;">Trusted-device Administrator sign-in</summary>
                    <form id="cozy-login-device-form" style="display:flex;flex-direction:column;gap:10px;margin-top:10px;">
                        <label style="font-size:12px;color:#444;">Administrator User ID
                            <input id="cozy-login-device-userid" type="text" required
                                style="display:block;width:100%;box-sizing:border-box;padding:8px;margin-top:4px;border:1px solid #ccc;border-radius:6px;">
                        </label>
                        <label style="font-size:12px;color:#444;">Device ID
                            <input id="cozy-login-device-deviceid" type="text" required
                                style="display:block;width:100%;box-sizing:border-box;padding:8px;margin-top:4px;border:1px solid #ccc;border-radius:6px;">
                        </label>
                        <button type="submit" style="padding:9px;border:1px solid #2563eb;border-radius:6px;background:#fff;color:#2563eb;font-weight:600;cursor:pointer;">
                            Sign In with Trusted Device
                        </button>
                    </form>
                </details>

                <div id="cozy-login-error" style="display:none;margin-top:14px;padding:10px;border-radius:6px;background:#fef2f2;color:#b91c1c;font-size:12px;"></div>
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
