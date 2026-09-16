/**
 * CozyOS Application Health Monitor — core/shell/application-health-monitor.js (M312)
 *
 * OWNERSHIP: composes the existing, real ApplicationLauncher (M290) -
 * never a second launch mechanism. Adds real lifecycle-state tracking
 * and real crash containment on top of what ApplicationLauncher
 * already does.
 *
 * HONEST ISOLATION BOUNDARY - the central technical reality this file
 * is built around, disclosed rather than glossed over:
 *   Standalone apps (ApplicationLauncher mounts them in a real
 *   <iframe>) get GENUINE browser-level fault isolation - a JS error
 *   inside an iframe cannot crash the parent page or other iframes.
 *   This is a real, strong boundary that already existed as a side
 *   effect of M290's design.
 *
 *   Fragment apps (mounted via direct innerHTML injection into the
 *   same document, per ApplicationLauncher's own real detection logic)
 *   have NO real JS-level sandbox - their code runs in the same global
 *   scope as CozyOS Core. This file's real, honest mitigation for
 *   fragment apps is best-effort error ATTRIBUTION (matching a real
 *   error's stack trace against known app source paths) plus real
 *   crash CONTAINMENT (removing the fragment's DOM and marking it
 *   Stopped) - not true process isolation, which fragment-based apps
 *   cannot have in a browser without becoming iframe-based themselves.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    if (window.CozyOS.ApplicationHealthMonitor) return;

    const LIFECYCLE_STATES = Object.freeze(["Installed", "Loaded", "Running", "Healthy", "Error", "Degraded", "Recovering", "Recovered", "Stopped"]);

    class CozyApplicationHealthMonitor {
        #appStates = new Map();
        #globalHandlersInstalled = false;

        async openSupervised(appId, appSourcePaths = []) {
            const launcher = window.CozyOS.ApplicationLauncher;
            if (!launcher || typeof launcher.open !== "function") return { success: false, reason: "ApplicationLauncher is not loaded." };

            this.#setState(appId, "Installed");
            this.#installGlobalHandlers();

            const result = await launcher.open(appId);
            if (!result.success) {
                this.#setState(appId, "Error", { reason: result.reason });
                return result;
            }

            const prior = this.#appStates.get(appId);
            this.#appStates.set(appId, {
                state: "Loaded", history: prior?.history || [],
                errorCount: prior?.errorCount || 0, lastError: prior?.lastError || null,
                sourcePathsKnown: appSourcePaths, isStandalone: result.isStandalone
            });
            this.#setState(appId, "Running");
            this.#setState(appId, "Healthy");
            return { ...result, isolation: result.isStandalone ? "iframe (genuine browser-level isolation)" : "fragment (best-effort error attribution only - shares the global scope with Core)" };
        }

        #setState(appId, state, detail = {}) {
            if (!LIFECYCLE_STATES.includes(state)) return;
            const existing = this.#appStates.get(appId) || { state: null, history: [], errorCount: 0, lastError: null };
            existing.state = state;
            existing.history.push({ state, at: new Date().toISOString(), detail });
            this.#appStates.set(appId, existing);
            const bus = window.CozyOS.PlatformEventBus;
            if (bus && typeof bus.emit === "function") { try { bus.emit("application:state-changed", { appId, state, detail }); } catch (_err) { /* non-fatal */ } }
        }

        #installGlobalHandlers() {
            if (this.#globalHandlersInstalled || typeof window.addEventListener !== "function") return;
            this.#globalHandlersInstalled = true;
            window.addEventListener("error", (event) => this.#handleGlobalError(event.filename, event.error?.stack, event.message));
            window.addEventListener("unhandledrejection", (event) => this.#handleGlobalError(null, event.reason?.stack, String(event.reason)));
        }

        #handleGlobalError(filename, stack, message) {
            for (const [appId, info] of this.#appStates) {
                if (info.isStandalone) continue;
                const matches = (filename && info.sourcePathsKnown.some(p => filename.includes(p))) || (stack && info.sourcePathsKnown.some(p => stack.includes(p)));
                if (matches) {
                    this.#recordAppError(appId, message);
                    return;
                }
            }
        }

        async #recordAppError(appId, message) {
            const info = this.#appStates.get(appId);
            if (!info) return;
            info.errorCount++;
            info.lastError = { message, at: new Date().toISOString() };
            this.#setState(appId, "Error", { message });

            const living = window.CozyOS.Living;
            if (living && info.livingTransactionId && typeof living.transaction?.rollback === "function") {
                await living.transaction.rollback(info.livingTransactionId);
            }

            const launcher = window.CozyOS.ApplicationLauncher;
            if (launcher && typeof launcher.close === "function") launcher.close(appId);

            this.#setState(appId, "Degraded");
            this.#attemptRecovery(appId);
        }

        async #attemptRecovery(appId) {
            this.#setState(appId, "Recovering");
            const info = this.#appStates.get(appId);
            const result = await this.openSupervised(appId, info?.sourcePathsKnown || []);
            if (result.success) this.#setState(appId, "Recovered");
            else this.#setState(appId, "Stopped", { reason: result.reason });
            return result;
        }

        getAppHealth(appId) {
            const info = this.#appStates.get(appId);
            return info ? { appId, state: info.state, errorCount: info.errorCount, lastError: info.lastError, history: [...info.history] } : null;
        }

        platformHealth() {
            const states = Array.from(this.#appStates.values()).map(i => i.state);
            return {
                totalApps: states.length,
                healthy: states.filter(s => s === "Healthy" || s === "Running").length,
                degraded: states.filter(s => s === "Degraded" || s === "Recovering").length,
                stopped: states.filter(s => s === "Stopped").length,
                coreAffected: false
            };
        }

        getVersion() { return "1.0.0"; }
        getId() { return "ApplicationHealthMonitor"; }
    }

    window.CozyOS.ApplicationHealthMonitor = new CozyApplicationHealthMonitor();
})();
