/**
 * CozyOS Health Engine
 * File Reference: core/platform/health-engine.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   Assigns the per-file health badge (🟢 Healthy / 🟡 Warning / 🔴 Broken /
 *   ⚪ Not Loaded) purely by reading Usage Engine's classification and
 *   Dependency Engine's missing/circular reports — no independent scanning
 *   or storage (Rule 1). This is the last of the four engines Discovery
 *   feeds; it depends on all three of the others being loaded.
 *
 * BADGE RULES
 *   ⚪ Not Loaded — Usage status is "dead" (never loaded, nothing depends on it)
 *   🔴 Broken     — file has a missing dependency OR sits in a circular chain
 *   🟡 Warning    — loaded but "loaded-orphan" or "duplicate-candidate"
 *   🟢 Healthy    — loaded, used by something, no missing/circular issues
 */
(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const HEALTH_ENGINE_VERSION = "1.0.0-ENTERPRISE";
    const BADGES = Object.freeze({ HEALTHY: "🟢 Healthy", WARNING: "🟡 Warning", BROKEN: "🔴 Broken", NOT_LOADED: "⚪ Not Loaded" });

    class CozyHealthEngine {
        getVersion() { return HEALTH_ENGINE_VERSION; }

        #usage() {
            const engine = window.CozyOS.UsageEngine;
            if (!engine) throw new Error("[HealthEngine] UsageEngine is not loaded.");
            return engine;
        }

        #deps() {
            const engine = window.CozyOS.DependencyEngine;
            if (!engine) throw new Error("[HealthEngine] DependencyEngine is not loaded.");
            return engine;
        }

        badgeFor(pathKey) {
            const usage = this.#usage().classify(pathKey);
            if (!usage) return null;

            const { missing } = this.#deps().detectMissingDependencies();
            const { cycles } = this.#deps().detectCircular();
            const hasMissingDep = missing.some(m => m.path === pathKey);
            const inCircular = cycles.some(cycle => cycle.includes(pathKey));

            let badge;
            if (usage.status === "dead") badge = BADGES.NOT_LOADED;
            else if (hasMissingDep || inCircular) badge = BADGES.BROKEN;
            else if (usage.status === "loaded-orphan" || usage.status === "duplicate-candidate") badge = BADGES.WARNING;
            else badge = BADGES.HEALTHY;

            return {
                path: pathKey,
                badge,
                reasons: {
                    usageStatus: usage.status,
                    missingDependency: hasMissingDep,
                    circular: inCircular
                },
                bestEffort: true
            };
        }

        /** report() — badge for every file; backs Diagnostics Center's health view. */
        report() {
            const reg = window.CozyOS.FileRegistry;
            if (!reg) throw new Error("[HealthEngine] FileRegistry is not loaded.");
            const files = reg.list().map(r => this.badgeFor(r.path)).filter(Boolean);
            const summary = { [BADGES.HEALTHY]: 0, [BADGES.WARNING]: 0, [BADGES.BROKEN]: 0, [BADGES.NOT_LOADED]: 0 };
            for (const f of files) summary[f.badge] = (summary[f.badge] || 0) + 1;
            return { total: files.length, summary, files, bestEffort: true };
        }
    }

    if (window.CozyOS.HealthEngine && typeof window.CozyOS.HealthEngine.getVersion === "function") {
        const existingVersion = window.CozyOS.HealthEngine.getVersion();
        if (existingVersion !== HEALTH_ENGINE_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: HealthEngine existing v${existingVersion} conflicts with load target v${HEALTH_ENGINE_VERSION}.`);
        return;
    }

    window.CozyOS.HealthEngine = new CozyHealthEngine();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "HealthEngine", category: "Platform", icon: "heart-pulse",
                description: "Assigns the 🟢/🟡/🔴/⚪ per-file health badge from Usage Engine and Dependency Engine signals."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
