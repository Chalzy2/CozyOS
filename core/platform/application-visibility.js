/**
 * CozyOS Application Visibility Registry
 * File Reference: core/platform/application-visibility.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   Single source of truth for "what applications exist, and which ones
 *   can this specific user see." Neither the Administrator Workspace nor
 *   the End User Workspace should hardcode an application list — both
 *   should read from here. This file does not discover, execute
 *   operations, manage resources, or decide permissions itself — it reads
 *   ServiceRegistry (applications), a real self-declared `visibility`
 *   property (platform tools — see below), and delegates every access
 *   decision to IdentityEngine.
 *
 * A REAL ARCHITECTURAL NUANCE, DISCLOSED BEFORE THE DESIGN BELOW MAKES
 * SENSE OF IT: several requested "applications" (Builder, BugFixer,
 * Discovery, Audit, Operations, Resource Manager) are not standalone
 * mountable modules in the current real architecture. Builder/BugFixer
 * are internal sections of Developer Hub; Discovery/Audit/Operations/
 * Resource Manager are native Administrator Workspace sections rendered
 * directly by cozy-workspace.js. "Launching" one of these for real means
 * navigating to its actual real location — Developer Hub with a
 * deep-linked section, or the matching Administrator Workspace center —
 * not mounting a second, independent module. This file's `launchTarget`
 * field reflects that honestly (`{center, section}` for Developer-Hub-
 * hosted tools, `{center}` alone for native admin sections), rather than
 * pretending every entry is launched identically.
 *
 * VISIBILITY SELF-DECLARATION — THE FUTURE STANDARD FOR PLATFORM TOOLS
 *   Business applications already have a real home: ServiceRegistry's
 *   `registerApplication()`/`listApplications()`. Platform tools (things a
 *   user opens but that aren't "applications" in that registry) declare
 *   real, static metadata the same way coordinators declare `capabilities`
 *   under Rule 41:
 *     window.CozyOS.<Name>.visibility = {
 *       appId, name, icon, category: "platform-tool",
 *       launchTarget: { center: "...", section: "..." (optional) },
 *       audience: "admin" | "developer"   // who can ever see this tool at all
 *     }
 *   Not mandatory for existing coordinators as of this milestone. Migrated
 *   gradually, one at a time, the same discipline as Rule 41 — this
 *   version migrates Developer Hub (the real host) and this session's own
 *   four platform engines (Discovery, Audit, Operations, Resource
 *   Manager) as the first wave. Every other coordinator simply doesn't
 *   appear in the platform-tool list yet — a real, honest state, not a
 *   bug.
 *
 * IDENTITY INTEGRATION — NEVER DUPLICATED
 *   listVisibleApplications(userId) delegates entirely to
 *   IdentityEngine.getDashboardConfig(userId) for the dashboard tier
 *   (admin/developer/user) and per-app assignment. This file does not
 *   reimplement any permission logic — if IdentityEngine says a user can
 *   see something, this file surfaces it; if not, it doesn't. No login
 *   screen exists yet anywhere in CozyOS (the same disclosed gap noted
 *   throughout this project) — without a real userId, this file fails
 *   toward showing NOTHING for the end-user view specifically (safer
 *   default for a per-user-filtered list) while still allowing an
 *   explicit "show everything, unfiltered" administrator call for anyone
 *   building an admin UI that doesn't yet have a real logged-in user
 *   either (mirroring the WorkspaceShell's own established fail-open
 *   convention for read/display data).
 *
 * LIVE UPDATES — VIA THE EXISTING PLATFORMEVENTBUS, NEVER A NEW BUS
 *   Listens for real events already emitted elsewhere
 *   (resource:registered/allocated/released, discovery:scanned) and
 *   re-emits a single `visibility:changed` event on the same bus — any UI
 *   can subscribe to that one event instead of five different ones.
 */
(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const VISIBILITY_VERSION = "1.0.0-ENTERPRISE";

    class CozyApplicationVisibility {
        #diagnostics = { listsBuilt: 0, filtersApplied: 0, errorsHidden: 0 };

        getVersion() { return VISIBILITY_VERSION; }

        #deepClone(value) {
            if (typeof structuredClone === "function") { try { return structuredClone(value); } catch (_err) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(value)); } catch (_err) { return value; }
        }

        /**
         * #listBusinessApplications()
         *   Real, from ServiceRegistry — never reimplemented. Cross-
         *   references CozyCertification the same way
         *   WorkspaceShell.getApplicationCenterData() already does, so
         *   both consumers see identical, non-duplicated data.
         */
        #listBusinessApplications() {
            const registry = window.CozyOS.ServiceRegistry;
            const cert = window.CozyOS.Certification;
            if (!registry) return [];
            const apps = registry.listApplications();
            const certById = new Map(cert && typeof cert.listApplications === "function" ? cert.listApplications().map(a => [a.id, a]) : []);
            const health = window.CozyOS.HealthEngine;
            const fileRegistry = window.CozyOS.FileRegistry;

            return apps.map(app => {
                const certRecord = certById.get(app.id) || null;
                let healthBadge = null;
                if (health && fileRegistry) {
                    const fileRecord = fileRegistry.list().find(r => r.application === app.id);
                    if (fileRecord) { try { healthBadge = health.badgeFor(fileRecord.path); } catch (_err) { /* non-fatal */ } }
                }
                return {
                    appId: app.id, name: app.name, icon: app.icon || null,
                    category: app.category || "business-application",
                    version: app.version || null,
                    owner: app.owner || null,
                    status: app.status || "registered",
                    installed: true,
                    enabled: app.enabled !== false,
                    health: healthBadge,
                    certification: certRecord ? certRecord.certification : null,
                    kind: "application",
                    launchTarget: { center: "applications", appId: app.id }
                };
            });
        }

        /**
         * #listPlatformTools()
         *   Real, self-declared metadata only — see header. Does not
         *   invent an entry for any coordinator lacking a real
         *   `visibility` property.
         */
        #listPlatformTools() {
            const tools = [];
            const seen = new Set(); // dedupe by object identity — aliased
            // globals (e.g. window.CozyOS.Discovery === window.CozyOS.
            // PlatformDiscovery, an intentional backward-compat alias) must
            // only be counted once. Same real bug class already found and
            // fixed in platform-discovery.js's own scanCapabilities().
            for (const name of Object.keys(window.CozyOS)) {
                const obj = window.CozyOS[name];
                if (!obj || typeof obj !== "object") continue;
                if (seen.has(obj)) continue;
                if (obj.visibility && typeof obj.visibility === "object") {
                    seen.add(obj);
                    tools.push({
                        appId: obj.visibility.appId || name, name: obj.visibility.name || name,
                        icon: obj.visibility.icon || null, category: obj.visibility.category || "platform-tool",
                        version: typeof obj.getVersion === "function" ? obj.getVersion() : null,
                        owner: name, status: "registered", installed: true, enabled: true,
                        health: null, certification: null, kind: "platform-tool",
                        audience: obj.visibility.audience || "admin",
                        launchTarget: obj.visibility.launchTarget || { center: null }
                    });
                }
            }
            return tools;
        }

        /**
         * listAllApplications()
         *   Real, unfiltered union — administrator-facing raw data
         *   (matches "Administrators see everything" from the spec). No
         *   Identity filtering applied here; use listVisibleApplications()
         *   for per-user filtering.
         */
        listAllApplications() {
            this.#diagnostics.listsBuilt++;
            return this.#deepClone([...this.#listBusinessApplications(), ...this.#listPlatformTools()]);
        }

        /**
         * listVisibleApplications(userId)
         *   Real per-user filtering — delegates entirely to
         *   IdentityEngine, never reimplements a permission decision.
         *   Without a real, connected IdentityEngine and a real userId,
         *   returns an honest empty result with a disclosed reason —
         *   the safer default for a per-user list, unlike this platform's
         *   usual fail-open convention for pure display/diagnostic data.
         */
        listVisibleApplications(userId) {
            this.#diagnostics.filtersApplied++;
            const identity = window.CozyOS.IdentityEngine;
            if (!identity) return { available: false, reason: "IdentityEngine is not loaded — cannot determine per-user visibility.", applications: [] };
            if (!userId) return { available: false, reason: "No userId supplied — a per-user visibility list requires a real, authenticated user. (No login screen exists yet anywhere in CozyOS.)", applications: [] };

            let config;
            try { config = identity.getDashboardConfig(userId); }
            catch (err) { this.#diagnostics.errorsHidden++; return { available: false, reason: `IdentityEngine.getDashboardConfig() threw: ${err && err.message}`, applications: [] }; }
            if (!config || !config.available) return { available: false, reason: (config && config.reason) || "No dashboard configuration available for this user.", applications: [] };

            const all = this.listAllApplications();

            if (config.dashboardType === "admin") {
                return { available: true, dashboardType: "admin", applications: all };
            }
            if (config.dashboardType === "developer") {
                const allowedBusiness = new Set(config.developerApplications || []);
                return {
                    available: true, dashboardType: "developer",
                    applications: all.filter(a => a.kind === "application" ? allowedBusiness.has(a.appId) : a.audience === "developer" || a.audience === "admin")
                };
            }
            // End user: only assigned + globally-enabled business
            // applications. Platform tools (internal dev/admin utilities)
            // are never shown — matches "End User Never sees: internal
            // platform tools, developer utilities, diagnostic engines,
            // administrator-only modules" from the spec, achieved simply
            // by never including platform-tool entries here, not by a
            // separate hide-list this file would have to maintain itself.
            const assigned = new Set(config.assignedApplications || []);
            return {
                available: true, dashboardType: "user",
                applications: all.filter(a => a.kind === "application" && assigned.has(a.appId) && a.enabled)
            };
        }

        getDiagnosticsReport() {
            return this.#deepClone({ moduleVersion: VISIBILITY_VERSION, ...this.#diagnostics });
        }
    }

    if (window.CozyOS.ApplicationVisibility && typeof window.CozyOS.ApplicationVisibility.getVersion === "function") {
        const existingVersion = window.CozyOS.ApplicationVisibility.getVersion();
        if (existingVersion !== VISIBILITY_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: ApplicationVisibility existing v${existingVersion} conflicts with load target v${VISIBILITY_VERSION}.`);
        return;
    }

    window.CozyOS.ApplicationVisibility = new CozyApplicationVisibility();

    // Live updates: re-emit a single visibility:changed event whenever a
    // real, already-existing event suggests the application list may have
    // changed — never a new event bus, never a polling loop.
    if (window.CozyOS.PlatformEventBus && typeof window.CozyOS.PlatformEventBus.on === "function") {
        ["resource:registered", "resource:allocated", "resource:released", "discovery:scanned"].forEach(eventName => {
            window.CozyOS.PlatformEventBus.on(eventName, () => {
                try { window.CozyOS.PlatformEventBus.emit("visibility:changed", { triggeredBy: eventName }); } catch (_err) { /* non-fatal */ }
            });
        });
    }

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "ApplicationVisibility", category: "Platform", icon: "layout-grid",
                description: "Single source of truth for which applications/platform tools exist and which ones a specific user can see. Reads ServiceRegistry (business apps) and a real, self-declared `visibility` property (platform tools) — delegates every access decision to IdentityEngine, never duplicates permission logic."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
