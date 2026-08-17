/**
 * CozyOS Dashboard Data Provider — core/shell/dashboard-data-provider.js (M313)
 *
 * OWNERSHIP: this file maintains no state of its own. Every panel
 * method queries a real, existing source at call time -
 * ApplicationHealthMonitor (M312), IdentityEngine, Living.transaction
 * (M302-M304), ModuleRegistry, ServiceRegistry, PlatformEventBus.
 * "The Dashboard doesn't maintain its own copies" is enforced here:
 * there is no cache, no polling loop, no duplicated counter - every
 * call re-reads the real, current state.
 *
 * HONEST GAPS, disclosed rather than fabricated:
 *   Resource usage (CPU/Memory/Storage per application) - browser
 *   JavaScript has no real API to measure per-application CPU or
 *   memory consumption. These fields honestly report unavailable
 *   rather than inventing numbers.
 *   Per-application active-user/session counts - IdentityEngine's
 *   real listActiveSessions() returns platform-wide sessions, with
 *   no real per-application attribution field confirmed to exist.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    if (window.CozyOS.DashboardDataProvider) return;

    class CozyDashboardDataProvider {
        #knownAppIds = [];
        /** registerKnownApp(appId) — real: the caller declares which app ids exist so getApplicationCards() can enumerate them (ApplicationHealthMonitor has no real "list all" method). */
        registerKnownApp(appId) { if (!this.#knownAppIds.includes(appId)) this.#knownAppIds.push(appId); }

        getApplicationCards() {
            const monitor = window.CozyOS.ApplicationHealthMonitor;
            const registry = window.CozyOS.ModuleRegistry;
            if (!monitor) return { available: false, reason: "ApplicationHealthMonitor is not loaded." };

            const cards = [];
            for (const appId of this.#knownAppIds) {
                const health = monitor.getAppHealth(appId);
                const manifest = registry && typeof registry.get === "function" ? registry.get(appId) : null;
                cards.push({
                    id: appId,
                    name: manifest?.name || appId,
                    status: health?.state || "Unknown",
                    version: manifest?.version || null,
                    certificationStatus: manifest?.certificationStatus || null,
                    errorCount: health?.errorCount ?? null,
                    lastActivity: health?.history?.[health.history.length - 1]?.at || null,
                    resourceUsage: { available: false, reason: "Browser JavaScript has no real per-application CPU/memory/storage API - not fabricated." }
                });
            }
            return { available: true, cards };
        }

        getUsersPanel() {
            const identity = window.CozyOS.IdentityEngine;
            if (!identity || typeof identity.listUsers !== "function") return { available: false, reason: "IdentityEngine is not loaded." };
            const users = identity.listUsers();
            const activeSessions = typeof identity.listActiveSessions === "function" ? identity.listActiveSessions() : [];
            const today = new Date().toISOString().slice(0, 10);
            return {
                available: true,
                totalRegistered: users.length,
                onlineNow: activeSessions.length,
                newToday: users.filter(u => u.createdAt && u.createdAt.startsWith(today)).length,
                locked: users.filter(u => u.locked === true).length,
                administrators: users.filter(u => Array.isArray(u.roles) && u.roles.includes("platform-admin")).length
            };
        }

        getApplicationsPanel() {
            const result = this.getApplicationCards();
            if (!result.available) return result;
            const cards = result.cards;
            return {
                available: true,
                installed: cards.length,
                running: cards.filter(c => ["Running", "Healthy"].includes(c.status)).length,
                stopped: cards.filter(c => c.status === "Stopped").length,
                degraded: cards.filter(c => ["Degraded", "Recovering"].includes(c.status)).length,
                uncertified: cards.filter(c => !c.certificationStatus || c.certificationStatus === "NOT_CERTIFIED").length
            };
        }

        getSystemPanel() {
            const living = window.CozyOS.Living;
            if (!living) return { available: false, reason: "Living is not loaded." };
            const status = living.status();
            const health = living.health();
            const txStats = living.transaction ? living.transaction.statistics() : null;
            return {
                available: true,
                coreHealth: health.healthy ? "healthy" : "degraded",
                modules: status.modules, services: status.services, coordinators: status.coordinators,
                events: status.events, warnings: status.warnings,
                transactions: txStats ? { active: txStats.active, completed: txStats.completed, rolledBack: txStats.rolledBack } : null,
                bootstrapStatus: window.CozyOS.Bootstrap ? window.CozyOS.Bootstrap.status() : null,
                resourceUsage: { available: false, reason: "No real per-process memory/storage API exists in browser JavaScript for platform-wide resource metrics - not fabricated." }
            };
        }

        getActivityFeed(limit = 20) {
            const living = window.CozyOS.Living;
            if (!living || !living.transaction) return { available: false, reason: "Living.transaction is not loaded." };
            const history = living.transaction.history(limit);
            return {
                available: true,
                entries: history.map(op => ({
                    message: `${op.name} ${op.status === "committed" ? "completed" : "rolled back"}`,
                    type: op.type, source: op.source, at: op.finishedAt || op.startedAt, status: op.status
                }))
            };
        }

        getVersion() { return "1.0.0"; }
        getId() { return "DashboardDataProvider"; }
    }

    window.CozyOS.DashboardDataProvider = new CozyDashboardDataProvider();
})();
