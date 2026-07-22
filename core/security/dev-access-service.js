/**
 * CozyOS Development Access Service
 * File Reference: core/security/dev-access-service.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * ============================================================
 * READ THIS BEFORE DEPLOYING THIS FILE ANYWHERE
 * ============================================================
 *   CozyOS is a static, client-side-only application (confirmed from
 *   this project's own origin: GitHub Pages, no server, no build
 *   pipeline, no compile-time step that strips code for production).
 *   This means every check in this file — including the environment
 *   detection below — runs entirely inside the visitor's own browser,
 *   where the visitor has full control. Anyone with browser developer
 *   tools can override `window.COZY_ENVIRONMENT`, edit this file's
 *   loaded source directly, or call any of this file's methods from the
 *   console. A client-side "if (environment === 'production')" check is
 *   real code that does real, useful things during ordinary development
 *   — it is NOT a cryptographic or server-enforced security boundary,
 *   and it cannot become one just by being written carefully.
 *
 *   THE REAL, ACTUAL SAFEGUARD is this: never deploy this file to the
 *   real production URL at all. Keep it out of whatever build/copy step
 *   publishes to the live site. The environment check below is a real,
 *   honest best-effort convenience — defaulting to the SAFE outcome
 *   (treat anything unrecognized as Production, deny access) — but it
 *   exists to prevent accidental exposure during normal development, not
 *   to resist a determined visitor who already has this file loaded in
 *   their browser. If this file is ever present on the real, public
 *   deployment, its own environment check should be assumed bypassable
 *   by anyone who looks.
 *
 * RESPONSIBILITY
 *   A temporary, explicitly-disclosed development convenience —
 *   Production access continues to require a real, verified
 *   `CozyOS.Auth` administrator session with no exception. Development
 *   Mode is a real, separate, environment-gated fallback used only when
 *   no real session exists and the environment is genuinely recognized
 *   as Development.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const DEV_ACCESS_VERSION = "1.0.0-ENTERPRISE";

    const KNOWN_DEV_HOSTNAMES = Object.freeze(["localhost", "127.0.0.1", "0.0.0.0"]);

    class CozyDevAccessService {
        #devModeEnabled = false;
        #configuredAdministrator = null;
        #auditLog = [];

        getVersion() { return DEV_ACCESS_VERSION; }
        #deepClone(v) {
            if (typeof structuredClone === "function") { try { return structuredClone(v); } catch (_e) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; }
        }
        #logAudit(event, detail) {
            this.#auditLog.push({ event, at: new Date().toISOString(), detail: this.#deepClone(detail) });
            if (this.#auditLog.length > 200) this.#auditLog.shift();
            if (window.CozyOS.PlatformEventBus && typeof window.CozyOS.PlatformEventBus.emit === "function") {
                try { window.CozyOS.PlatformEventBus.emit(`devaccess:${event}`, detail); } catch (_err) { /* non-fatal */ }
            }
        }
        getAuditLog() { return this.#deepClone(this.#auditLog); }

        getEnvironment() {
            try {
                const hostname = window.location && window.location.hostname;
                return KNOWN_DEV_HOSTNAMES.includes(hostname) ? "Development" : "Production";
            } catch (_err) {
                return "Production";
            }
        }

        enableDevelopmentMode({ name, role } = {}) {
            if (this.getEnvironment() !== "Development") {
                this.#logAudit("development-mode-refused", { reason: "Environment is not Development." });
                return { success: false, reason: "Development Mode cannot be enabled — environment is Production." };
            }
            if (!name) return { success: false, reason: "A real administrator name is required to configure Development Mode." };
            this.#devModeEnabled = true;
            this.#configuredAdministrator = { name: String(name).slice(0, 200), role: role || "Platform Administrator" };
            this.#logAudit("development-login", { name: this.#configuredAdministrator.name });
            return { success: true };
        }

        disableDevelopmentMode() {
            this.#devModeEnabled = false;
            this.#configuredAdministrator = null;
            this.#logAudit("development-logout", {});
            return { success: true };
        }

        checkAccess() {
            const auth = window.CozyOS.Auth;
            if (auth && typeof auth.getCurrentAdministrator === "function") {
                const realAdmin = auth.getCurrentAdministrator();
                if (realAdmin) return { allowed: true, method: "real-session", administrator: realAdmin };
            }

            const environment = this.getEnvironment();
            if (environment === "Production") {
                this.#logAudit("access-denied", { reason: "No real session; Development Mode never consulted in Production.", environment });
                return { allowed: false, reason: "No authenticated Platform Administrator session.", environment, developmentMode: "Not applicable in Production" };
            }
            if (!this.#devModeEnabled || !this.#configuredAdministrator) {
                this.#logAudit("access-denied", { reason: "No real session and Development Mode is not enabled.", environment });
                return { allowed: false, reason: "No authenticated Platform Administrator session.", environment, developmentMode: "Disabled" };
            }
            this.#logAudit("development-access-granted", { name: this.#configuredAdministrator.name });
            return { allowed: true, method: "development-mode", administrator: this.#configuredAdministrator, environment };
        }

        getStatus() {
            return { environment: this.getEnvironment(), developmentModeEnabled: this.#devModeEnabled, configuredAdministrator: this.#configuredAdministrator ? this.#deepClone(this.#configuredAdministrator) : null };
        }

        getDiagnosticsReport() {
            return this.#deepClone({ moduleVersion: DEV_ACCESS_VERSION, ...this.getStatus(), auditEntries: this.#auditLog.length });
        }
    }

    if (window.CozyOS.DevAccessService && typeof window.CozyOS.DevAccessService.getVersion === "function") {
        const existingVersion = window.CozyOS.DevAccessService.getVersion();
        if (existingVersion !== DEV_ACCESS_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: DevAccessService existing v${existingVersion} conflicts with load target v${DEV_ACCESS_VERSION}.`);
        return;
    }

    window.CozyOS.DevAccessService = new CozyDevAccessService();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "DevAccessService", category: "Platform", icon: "code.svg",
                description: "Real, disclosed-limitation development convenience — real CozyOS.Auth sessions always take priority; Development Mode only ever activates when the (client-side, non-cryptographic) environment check genuinely reads Development. Never deploy this file to the real production URL — see this file's own header for why the environment check cannot be a true security boundary in a static, client-side application."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
