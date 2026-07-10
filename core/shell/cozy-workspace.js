/**
 * CozyOS Enterprise Framework — Workspace Shell (Enterprise Control Center)
 * File Reference: core/shell/cozy-workspace.js
 * Layer: Shell / Enterprise Orchestration & Visualization
 * Version: 3.1.1-ENTERPRISE-CONTROL-CENTER
 *
 * v3.1.0 (additive-only, final pre-freeze pass): Application Status Center
 * fields (health/completion/upgrade readiness/current release), Feature
 * Visibility (mapped honestly from declared plannedFeatures — not a
 * licensing decision), Subscription/License Center (generic read-only slot,
 * same pattern as every other not-yet-built coordinator), consolidated
 * Application Details, Role-Based Menu (fails open with a visible reason if
 * CozyIdentity isn't connected), Global Status Bar, Enterprise Notification
 * Center (filtered real event feed), and a real Startup Sequence readout.
 * Nothing existing was removed or rewritten.
 *
 * v3.1.1 (final companion fix, required by the new Service Registry):
 * discovery no longer misidentifies bare functions attached to window.CozyOS
 * (e.g. the Service Registry's window.CozyOS.registerApplication(...)
 * passthroughs) as coordinators. Application Center now sources its catalog
 * from window.CozyOS.listApplications() (Service Registry) first, falling
 * back to CozyCertification's own registry for backward compatibility, and
 * cross-references both when an id is registered in each. Module Manager
 * additionally shows descriptive category/icon/description metadata from
 * registerCoordinator() when present. No existing API removed or changed.
 *
 * RESPONSIBILITY CHANGE FROM v2.x
 *   The Workspace Shell no longer certifies anything itself and no longer
 *   invents placeholder data for coordinators it can't see. Every previous
 *   version of this file had mock applications, fabricated "integrity
 *   signatures," made-up memory numbers, and a hardcoded fallback version
 *   string for undiscovered modules — that's gone. This file now does two
 *   things only:
 *     1. Discovers what's actually registered on window.CozyOS right now.
 *     2. Asks the real coordinators — chiefly CozyCertification — for real
 *        data, and displays exactly that. Nothing it shows is invented.
 *   If a named coordinator (CozyStorage, CozySync, CozySecurity, CozyLive,
 *   CozySpeech, CozyTranslate, CozyNotification, CozyMeeting, CozyAttendance,
 *   CozyIdentity, CozyAnalytics, CozyAutomation, CozyAI, ...) isn't actually
 *   registered yet, its panel says so plainly — "Not Connected" — rather
 *   than rendering plausible-looking fake numbers.
 *
 * DELEGATION MODEL
 *   CozyCertification → certification, history, releases, upgrades, reports
 *   (all other named coordinators)  → whatever they expose, read generically
 *   (getVersion / getDiagnosticsReport / on-off-emit) since this shell has
 *   no way to know their specific APIs in advance without executing their
 *   code, which it must never do.
 */

(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const SHELL_VERSION = "3.1.1-ENTERPRISE-CONTROL-CENTER";

    // Suggested display order/labels for coordinators that are expected to
    // exist eventually. This is NOT a source of truth about what's installed
    // — it only keeps the sidebar's ordering stable. Anything discovered on
    // window.CozyOS that ISN'T in this list still shows up (see
    // #discoverCoordinators); anything IN this list that isn't discovered
    // shows as "Not Connected", never as fake data.
    const SUGGESTED_COORDINATORS = [
        "Certification", "Identity", "Storage", "Sync", "Automation", "Analytics",
        "Security", "Live", "Speech", "Translate", "Notification", "Meeting",
        "Attendance", "Media", "Vision", "Camera", "Network", "Emergency", "Accessibility"
    ];

    // Centers whose data this shell can only ever read generically, because
    // no CozyOS coordinator with a known, agreed API exists for them yet.
    // Each maps to the coordinator name it would read from once one exists.
    const INTEGRATION_SLOTS = Object.freeze({
        security: "CozySecurity",
        storage: "CozyStorage",
        sync: "CozySync",
        automation: "CozyAutomation",
        live: "CozyLive",
        speech: "CozySpeech",
        translation: "CozyTranslate",
        notification: "CozyNotification",
        ai: "CozyAI",
        plugin: null // no single coordinator convention exists for plugins yet
    });

    class CozyOSWorkspaceShell {
        // ---- discovered coordinators, rebuilt on every discovery cycle ----
        #coordinators = new Map(); // name -> { name, discovered, version, diagnostics }

        // ---- tracks which live objects already have event listeners bound,
        // persists ACROSS discovery cycles (unlike #coordinators) so
        // rediscover() never double-subscribes to the same live coordinator ----
        #boundEventSources = new Map(); // name -> liveRef

        // ---- shell-local state (NOT business data — navigation/UI only) ----
        #activeCenter = "dashboard";
        #selectedContext = null; // { type: "module"|"application"|"release", id }
        #searchTerm = "";

        // ---- live event stream (real events only, from real emitters) ----
        #eventLog = [];
        #maxEventLog = 300;

        // ---- application launchers, registered by whoever actually owns
        // launching an app (this shell has no OS-level launch capability of
        // its own) ----
        #launchers = new Map(); // applicationId -> launch function

        // ---- launch-requested state (see getGlobalStatusBar honesty note) ----
        #runningApplications = new Set();

        // ---- shell-local operational pointer, not certification data ----
        #currentReleaseId = null;

        #auditLogs = [];
        #diagnostics = {
            renderCycles: 0,
            discoveryCycles: 0,
            searchQueries: 0,
            eventsObserved: 0,
            errorsHidden: 0
        };

        #domRoot = null;
        #documentClickDismissBound = false;

        constructor() {
            this.#discoverCoordinators();
        }

        getVersion() { return SHELL_VERSION; }

        // =========================================================================
        // ─── UTILITIES ──────────────────────────────────────────────────────────
        // =========================================================================

        #escapeHtml(value) {
            const str = String(value === undefined || value === null ? "" : value);
            return str
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#39;");
        }

        #deepClone(value) {
            if (typeof structuredClone === "function") {
                try { return structuredClone(value); } catch (_err) { /* fall through */ }
            }
            try { return JSON.parse(JSON.stringify(value)); } catch (_err) { return value; }
        }

        #logAudit(action, msg) {
            this.#auditLogs.push(Object.freeze({ id: "aud_" + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random()), timestamp: new Date().toISOString(), action, msg }));
            if (this.#auditLogs.length > 500) this.#auditLogs.shift();
        }

        #recordEvent(source, eventName, payload) {
            this.#diagnostics.eventsObserved++;
            this.#eventLog.push(Object.freeze({
                time: new Date().toISOString(), source, eventName,
                summary: this.#summarizeEventPayload(payload)
            }));
            if (this.#eventLog.length > this.#maxEventLog) this.#eventLog.shift();
        }

        // Never store/display a raw, unbounded, possibly-huge payload — just a
        // short, safe-to-render summary of it.
        #summarizeEventPayload(payload) {
            if (payload === undefined || payload === null) return "";
            if (typeof payload === "string" || typeof payload === "number" || typeof payload === "boolean") return String(payload);
            try {
                const keys = Object.keys(payload).slice(0, 4);
                return keys.map(k => `${k}: ${String(payload[k]).slice(0, 40)}`).join(", ");
            } catch (_err) {
                return "";
            }
        }

        get #certification() {
            return window.CozyOS && window.CozyOS.Certification ? window.CozyOS.Certification : null;
        }

        // =========================================================================
        // ─── DISCOVERY ──────────────────────────────────────────────────────────
        // Rebuilds the coordinator list from what's ACTUALLY on window.CozyOS
        // right now. Nothing here is cached-and-assumed; call this again
        // (rediscover()) any time you want a fresh picture, e.g. after another
        // script tag finishes loading a coordinator.
        // =========================================================================

        #discoverCoordinators() {
            this.#diagnostics.discoveryCycles++;
            this.#coordinators.clear();

            // A real coordinator is always an object exposing methods
            // (getVersion, on/off/emit, etc). Bare functions attached
            // directly to window.CozyOS — e.g. the Service Registry's
            // window.CozyOS.registerApplication(...) convenience
            // passthroughs — are helpers, not coordinators, and must never
            // show up in the coordinator list.
            const liveKeys = window.CozyOS
                ? Object.keys(window.CozyOS).filter(k => k !== "WorkspaceShell" && typeof window.CozyOS[k] !== "function")
                : [];
            // Coordinators announced via registerCoordinator() but not yet
            // actually loaded should still appear (as UNREGISTERED, with
            // whatever descriptive metadata was declared) rather than being
            // invisible until someone happens to load them.
            const registryNames = (window.CozyOS && window.CozyOS.ServiceRegistry)
                ? window.CozyOS.ServiceRegistry.listCoordinators().map(c => c.name)
                : [];
            const allNames = new Set([...SUGGESTED_COORDINATORS, ...liveKeys, ...registryNames]);

            for (const name of allNames) {
                const liveRef = window.CozyOS ? window.CozyOS[name] : undefined;
                const discovered = !!liveRef && typeof liveRef !== "function";
                const version = discovered && typeof liveRef.getVersion === "function" ? liveRef.getVersion() : null;
                let diagnostics = null;
                if (discovered && typeof liveRef.getDiagnosticsReport === "function") {
                    try { diagnostics = liveRef.getDiagnosticsReport(); }
                    catch (_err) { this.#diagnostics.errorsHidden++; }
                }

                this.#coordinators.set(name, {
                    name, discovered, version, diagnostics,
                    hasEventBus: discovered && typeof liveRef.on === "function"
                });

                // Wire the live event stream — but only ONCE per live object.
                // rediscover() can run many times over the shell's lifetime;
                // without this guard, every re-scan would add another
                // duplicate .on() subscription to the same coordinator,
                // doubling (then tripling...) every future event log entry.
                if (discovered && typeof liveRef.on === "function" && this.#boundEventSources.get(name) !== liveRef) {
                    const eventNames = name === "Certification"
                        ? ["certification:completed", "application:certified", "registry:imported", "release:locked", "module:frozen-violation", "upgrade:verified", "platform:upgrade-verified"]
                        : ["session:create"];
                    for (const eventName of eventNames) {
                        try {
                            liveRef.on(eventName, (payload) => this.#recordEvent(name, eventName, payload));
                        } catch (_err) {
                            this.#diagnostics.errorsHidden++;
                        }
                    }
                    this.#boundEventSources.set(name, liveRef);
                }
            }

            this.#logAudit("DISCOVERY_CYCLE", `Discovered ${liveKeys.length} live coordinator(s) on window.CozyOS.`);
        }

        /** Call this any time to re-scan window.CozyOS for newly-loaded coordinators. */
        rediscover() {
            this.#discoverCoordinators();
            return this.getDashboardData();
        }

        registerLauncher(applicationId, launchFn) {
            if (typeof launchFn !== "function") throw new TypeError("[WorkspaceShell] registerLauncher(): launchFn must be a function.");
            this.#launchers.set(applicationId, launchFn);
            return true;
        }

        launch(applicationId) {
            const fn = this.#launchers.get(applicationId);
            if (!fn) return { launched: false, message: `No launcher registered for "${applicationId}". Call registerLauncher() first.` };
            try {
                fn();
                this.#runningApplications.add(applicationId);
                this.#logAudit("APPLICATION_LAUNCHED", `${applicationId} launched.`);
                return { launched: true, message: `${applicationId} launched.` };
            } catch (err) {
                this.#diagnostics.errorsHidden++;
                return { launched: false, message: `Launcher for "${applicationId}" threw an error.` };
            }
        }

        /** Marks an application as no longer running (launch-requested state only — see getGlobalStatusBar notes). */
        markApplicationStopped(applicationId) {
            return this.#runningApplications.delete(applicationId);
        }

        // =========================================================================
        // ─── DASHBOARD ──────────────────────────────────────────────────────────
        // =========================================================================

        /**
         * getDashboardData()
         *   Per-coordinator certification status. If CozyCertification isn't
         *   connected, status is honestly "Unknown — Certification engine not
         *   connected" for everything rather than guessed.
         */
        getDashboardData() {
            const cert = this.#certification;
            const rows = Array.from(this.#coordinators.values())
                .filter(c => c.name !== "Certification")
                .map((c) => {
                    let certStatus = "Unknown";
                    let certSymbol = "?";
                    if (cert) {
                        const summary = cert.getWorkspaceSummary(c.name);
                        if (summary && summary.certification) {
                            certStatus = summary.certification;
                            certSymbol = summary.certification === "ENTERPRISE_CERTIFIED" ? "✓"
                                : summary.certification === "CERTIFIED_WITH_WARNINGS" ? "⚠" : "✗";
                        } else {
                            certStatus = "NOT_CERTIFIED";
                            certSymbol = "✗";
                        }
                    } else {
                        certStatus = "Certification engine not connected";
                        certSymbol = "?";
                    }
                    return { name: c.name, registrationStatus: c.discovered ? "REGISTERED" : "UNREGISTERED", discovered: c.discovered, version: c.version, certStatus, certSymbol };
                })
                .sort((a, b) => a.name.localeCompare(b.name));

            return this.#deepClone({
                generatedAt: new Date().toISOString(),
                certificationConnected: !!cert,
                coordinators: rows,
                discoveredCount: rows.filter(r => r.discovered).length,
                totalCount: rows.length
            });
        }

        // =========================================================================
        // ─── APPLICATION CENTER ─────────────────────────────────────────────────
        // Applications are discovered from window.CozyOS.listApplications()
        // (the Service Registry) — that's the general-purpose catalog an app
        // announces itself in once, with launch/display metadata (icon,
        // category, launcher path, and which coordinator serves as its
        // license/health/certification/permissions provider). This shell
        // never hardcodes an application name.
        //
        // CozyCertification's OWN application registry (registerApplication /
        // getReadinessMatrix / getRoadmap) is a separate, narrower system for
        // certification tracking specifically (it needs a `modules` list the
        // Service Registry manifest doesn't have). When the same id is
        // registered in BOTH places, this cross-references it for real
        // readiness data; when it's only in the Service Registry, readiness
        // is honestly "not tracked" rather than guessed. If the Service
        // Registry isn't loaded at all, this falls back to
        // CozyCertification's list, matching the shell's original behavior.
        // =========================================================================

        getApplicationCenterData() {
            const cert = this.#certification;
            const registry = window.CozyOS && window.CozyOS.ServiceRegistry ? window.CozyOS.ServiceRegistry : null;

            const registryApps = registry ? registry.listApplications() : [];
            const certApps = cert ? cert.listApplications() : [];
            if (!registry && !cert) {
                return { connected: false, message: "Neither the Service Registry nor CozyCertification is connected — no application catalog available.", applications: [] };
            }

            const certAppsById = new Map(certApps.map(a => [a.id, a]));
            const byId = new Map();
            for (const app of registryApps) byId.set(app.id, { fromRegistry: app, fromCert: certAppsById.get(app.id) || null });
            // Anything registered with CozyCertification but NOT (yet) announced
            // in the Service Registry still shows up — additive, not a regression
            // of prior behavior.
            for (const app of certApps) if (!byId.has(app.id)) byId.set(app.id, { fromRegistry: null, fromCert: app });

            const applications = Array.from(byId.values()).map(({ fromRegistry, fromCert }) => {
                const id = fromRegistry ? fromRegistry.id : fromCert.id;
                const name = fromRegistry ? fromRegistry.name : fromCert.name;
                const version = fromRegistry ? fromRegistry.version : fromCert.version;

                let matrix = null, roadmap = null, manifestCheck = null;
                if (fromCert) {
                    try { matrix = cert.getReadinessMatrix(id); } catch (_err) { /* no certifications yet */ }
                    try { roadmap = cert.getRoadmap(id); } catch (_err) { /* ignore */ }
                    try { manifestCheck = cert.certifyApplication({ id, name, version, modules: fromCert.modules }); } catch (_err) { /* ignore */ }
                }

                const upgradeReadiness = fromCert ? fromCert.modules.map(moduleId => this.getUpgradeAvailability(moduleId)) : [];
                const anyUpgradeAvailable = upgradeReadiness.some(u => u.upgradeAvailable);
                const currentRelease = this.#currentReleaseId && cert ? cert.getRelease(this.#currentReleaseId) : null;
                const inCurrentRelease = currentRelease ? currentRelease.applications.applications.some(a => a.applicationId === id) : false;

                return {
                    id, name, version,
                    source: fromRegistry && fromCert ? "ServiceRegistry+Certification" : fromRegistry ? "ServiceRegistry" : "Certification",
                    category: fromRegistry ? fromRegistry.category : null,
                    icon: fromRegistry ? fromRegistry.icon : null,
                    launcher: fromRegistry ? fromRegistry.launcher : null,
                    certificationProvider: fromRegistry ? fromRegistry.certificationProvider : null,
                    licenseProvider: fromRegistry ? fromRegistry.licenseProvider : null,
                    healthProvider: fromRegistry ? fromRegistry.healthProvider : null,
                    permissionsProvider: fromRegistry ? fromRegistry.permissionsProvider : null,
                    status: this.#launchers.has(id) ? "Launcher Connected" : "No Launcher Registered",
                    health: matrix ? matrix.overallReadiness : (fromCert ? 0 : null),
                    completionPercent: roadmap ? roadmap.completedPercent : (fromCert ? 0 : null),
                    certificationStatus: matrix ? (matrix.modules.every(m => m.verdict === "ENTERPRISE_CERTIFIED") ? "ENTERPRISE_CERTIFIED" : "PARTIAL") : (fromCert ? "NOT_CERTIFIED" : "Not tracked by CozyCertification"),
                    upgradeReadiness: fromCert ? (anyUpgradeAvailable ? "UPDATE_AVAILABLE" : "UP_TO_DATE") : "Unknown",
                    connectedModules: fromCert ? fromCert.modules.length : null,
                    tenantCount: null, // honest: no tenant coordinator exists yet — see Tenant Center
                    offlineReady: manifestCheck ? manifestCheck.offlineReadiness : null,
                    lastSynchronization: null, // honest: no CozySync coordinator exists yet — see Synchronization Center
                    currentRelease: inCurrentRelease ? this.#currentReleaseId : null,
                    deploymentStatus: matrix ? matrix.deploymentStatus : (fromCert ? "NOT READY — no certifications on file for its modules yet" : "Not tracked by CozyCertification"),
                    overallReadiness: matrix ? matrix.overallReadiness : (fromCert ? 0 : null),
                    hasLauncher: this.#launchers.has(id)
                };
            });
            return { connected: true, applications };
        }

        /** Application Health — one application, in detail. */
        getApplicationHealthData(applicationId) {
            const cert = this.#certification;
            if (!cert) return { connected: false, message: "Certification engine not connected." };
            const app = cert.getApplication(applicationId);
            if (!app) return { connected: true, found: false, message: `No application registered with id "${applicationId}".` };
            let matrix = null, roadmap = null, dependencyImpacts = [];
            try { matrix = cert.getReadinessMatrix(applicationId); } catch (_err) { /* ignore */ }
            try { roadmap = cert.getRoadmap(applicationId); } catch (_err) { /* ignore */ }
            for (const moduleId of app.modules) {
                try { dependencyImpacts.push(cert.getDependencyImpact(moduleId)); } catch (_err) { /* ignore */ }
            }

            const certifiedModules = [];
            const missingModules = [];
            const warnedModules = [];
            const warnings = [];
            const upgradeReadiness = [];
            if (matrix) {
                for (const m of matrix.modules) {
                    if (m.verdict === "ENTERPRISE_CERTIFIED") certifiedModules.push(m.moduleId);
                    else if (m.verdict === "CERTIFIED_WITH_WARNINGS") { warnedModules.push(m.moduleId); warnings.push(`${m.moduleId} is certified with warnings.`); }
                    else missingModules.push(m.moduleId);

                    const liveCoord = this.#coordinators.get(m.moduleId);
                    const summary = cert.getWorkspaceSummary(m.moduleId);
                    const updateStatus = this.#computeUpdateStatus(liveCoord ? liveCoord.version : null, summary ? summary.version : null);
                    if (updateStatus === "PENDING_CERTIFICATION") warnings.push(`${m.moduleId} has a running version newer than its last certification — re-certify before shipping.`);
                    upgradeReadiness.push({ moduleId: m.moduleId, updateStatus });
                }
            }

            return this.#deepClone({
                connected: true, found: true,
                application: app, matrix, roadmap, dependencyImpacts,
                certifiedModules, missingModules, warnedModules, warnings, upgradeReadiness
            });
        }

        // =========================================================================
        // ─── MODULE MANAGER ─────────────────────────────────────────────────────
        // For each discovered coordinator: version, diagnostics (whatever it
        // actually reports — read generically, never assumed), certification
        // status and upgrade status if CozyCertification knows about it.
        // =========================================================================

        // Tiny local semver parser — for DISPLAY comparison only (e.g. "is the
        // live version newer than what was last certified"). This is not a
        // certification decision and doesn't duplicate CozyCertification's own
        // compatibility logic; it's just string parsing to label a badge.
        #parseSemverLocal(v) {
            const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(v || "").trim());
            return m ? { major: +m[1], minor: +m[2], patch: +m[3] } : null;
        }

        #compareSemverLocal(a, b) {
            if (a.major !== b.major) return a.major - b.major;
            if (a.minor !== b.minor) return a.minor - b.minor;
            return a.patch - b.patch;
        }

        /**
         * "Update status" for a coordinator: compares the version currently
         * running (getVersion()) against the version CozyCertification last
         * certified. This is a DISPLAY label only — CozyCertification remains
         * the sole authority on whether an upgrade is safe (see Upgrade Center).
         */
        #computeUpdateStatus(liveVersion, certifiedVersion) {
            if (!certifiedVersion) return "NOT_YET_CERTIFIED";
            if (!liveVersion) return "UNKNOWN";
            if (liveVersion === certifiedVersion) return "UP_TO_DATE";
            const live = this.#parseSemverLocal(liveVersion);
            const certified = this.#parseSemverLocal(certifiedVersion);
            if (!live || !certified) return "VERSION_MISMATCH";
            const cmp = this.#compareSemverLocal(live, certified);
            return cmp > 0 ? "PENDING_CERTIFICATION" : cmp < 0 ? "ROLLED_BACK_FROM_CERTIFIED" : "UP_TO_DATE";
        }

        getModuleManagerData() {
            const cert = this.#certification;
            const modules = Array.from(this.#coordinators.values()).map((c) => {
                const certification = cert ? cert.getWorkspaceSummary(c.name) : null;
                // Dependencies/compatibility are only known if the module was
                // certified WITH a declared `compatibleWith` — read from the
                // full latest record (getWorkspaceSummary is a condensed view
                // that doesn't include it).
                let dependencies = [];
                if (cert) {
                    const history = cert.listRecords(c.name);
                    const latest = history.length > 0 ? history[history.length - 1] : null;
                    if (latest && latest.compatibility) dependencies = latest.compatibility;
                }
                const health = certification && typeof certification.score === "number" ? certification.score : null;
                const updateStatus = cert ? this.#computeUpdateStatus(c.version, certification ? certification.version : null) : "UNKNOWN";
                // "Connected applications" — real, reused from Dependency
                // Impact Analysis (which apps declared this module in their
                // registerApplication() manifest).
                let connectedApplications = [];
                if (cert) {
                    try { connectedApplications = cert.getDependencyImpact(c.name).usedBy.map(u => u.applicationId); } catch (_err) { /* ignore */ }
                }
                // Purely descriptive — category/icon/description a coordinator
                // (or whoever installs it) chose to announce via
                // registerCoordinator(). Never required, never fabricated if absent.
                const registry = window.CozyOS && window.CozyOS.ServiceRegistry ? window.CozyOS.ServiceRegistry : null;
                const registryInfo = registry ? registry.getCoordinator(c.name) : null;
                return {
                    name: c.name,
                    registrationStatus: c.discovered ? "REGISTERED" : "UNREGISTERED",
                    discovered: c.discovered,
                    version: c.version,
                    category: registryInfo ? registryInfo.category : null,
                    icon: registryInfo ? registryInfo.icon : null,
                    description: registryInfo ? registryInfo.description : null,
                    health,
                    hasEventBus: c.hasEventBus,
                    dependencies: dependencies,
                    connectedApplications,
                    // No CozyOS coordinator implements a heartbeat/ping protocol
                    // today — honestly null rather than a fabricated timestamp.
                    lastHeartbeat: null,
                    lastUpdate: certification ? certification.auditDate : null,
                    diagnostics: c.diagnostics,
                    certification,
                    updateStatus
                };
            }).sort((a, b) => a.name.localeCompare(b.name));
            return this.#deepClone({ modules, certificationConnected: !!cert });
        }

        // =========================================================================
        // ─── CERTIFICATION CENTER ───────────────────────────────────────────────
        // Thin display layer over CozyCertification. This shell does not
        // re-implement certification logic, scoring, or verdicts — it only
        // calls the real API and renders what comes back.
        // =========================================================================

        getCertificationCenterData(moduleId = null) {
            const cert = this.#certification;
            if (!cert) return { connected: false, message: "Certification engine not connected." };
            if (!moduleId) {
                // Overview: certification summary across every discovered coordinator.
                const rows = Array.from(this.#coordinators.values())
                    .filter(c => c.name !== "Certification")
                    .map(c => ({ name: c.name, ...cert.getWorkspaceSummary(c.name) }));
                return { connected: true, overview: rows };
            }
            const history = cert.listRecords(moduleId);
            const latest = history.length > 0 ? history[history.length - 1] : null;
            const baseline = cert.getBaseline(moduleId);
            const waivers = cert.listWaivers(moduleId);
            const frozenInfo = cert.getFrozenInfo(moduleId);
            return this.#deepClone({
                connected: true, moduleId,
                latest, history, baseline, waivers,
                frozen: cert.isModuleFrozen(moduleId), frozenInfo
            });
        }

        /** Runs a real certification (delegates entirely to CozyCertification). */
        certifyModule(sourceText, metadata) {
            const cert = this.#certification;
            if (!cert) throw new Error("[WorkspaceShell] Certification engine not connected — cannot certify.");
            return cert.certifyModule(sourceText, metadata);
        }

        exportCertificationReport(report, format = "html") {
            const cert = this.#certification;
            if (!cert) throw new Error("[WorkspaceShell] Certification engine not connected.");
            return cert.exportReport(report, format);
        }

        // =========================================================================
        // ─── RELEASE CENTER ─────────────────────────────────────────────────────
        // =========================================================================

        /**
         * "Current release" is a shell-local pointer, not certification data —
         * CozyCertification's lockRelease() only knows about snapshots it took;
         * it has no concept of "which one is currently deployed" (that's an
         * operational fact, not a certification fact). Setting it here doesn't
         * change anything in CozyCertification.
         */
        setCurrentRelease(releaseId) {
            const cert = this.#certification;
            if (cert && !cert.getRelease(releaseId)) throw new Error(`[WorkspaceShell] setCurrentRelease(): no release locked with id "${releaseId}".`);
            this.#currentReleaseId = releaseId;
            this.#logAudit("CURRENT_RELEASE_SET", `Current release pointer set to ${releaseId}.`);
            return releaseId;
        }

        getCurrentReleaseId() { return this.#currentReleaseId; }

        getReleaseCenterData(releaseId = null) {
            const cert = this.#certification;
            if (!cert) return { connected: false, message: "Certification engine not connected." };
            if (!releaseId) {
                const releases = cert.listReleases().slice().sort((a, b) => new Date(b.lockedAt) - new Date(a.lockedAt));
                return this.#deepClone({
                    connected: true,
                    currentReleaseId: this.#currentReleaseId,
                    releases: releases.map(r => ({ ...r, isCurrent: r.releaseId === this.#currentReleaseId }))
                });
            }
            const release = cert.getRelease(releaseId);
            if (!release) return { connected: true, found: false, message: `No release locked with id "${releaseId}".` };
            let integrity = null;
            try { integrity = cert.verifyReleaseIntegrity(releaseId); } catch (_err) { /* ignore */ }
            const allReleases = cert.listReleases();
            const previousReleases = allReleases
                .filter(r => r.releaseId !== releaseId && new Date(r.lockedAt) < new Date(release.lockedAt))
                .sort((a, b) => new Date(b.lockedAt) - new Date(a.lockedAt));
            return this.#deepClone({
                connected: true, found: true,
                release, integrity,
                isCurrent: releaseId === this.#currentReleaseId,
                rollbackAvailable: previousReleases.length > 0,
                previousReleases,
                releaseNotes: "Not provided — CozyCertification's lockRelease() doesn't currently accept release notes."
            });
        }

        // =========================================================================
        // ─── UPGRADE CENTER ─────────────────────────────────────────────────────
        // =========================================================================

        /** Single-module upgrade check, e.g. "is my current work safe to ship?" */
        getModuleUpgradeData(moduleId, options = {}) {
            const cert = this.#certification;
            if (!cert) return { connected: false, message: "Certification engine not connected." };
            try {
                const result = cert.verifyUpgrade(moduleId, options);
                return { connected: true, found: true, result };
            } catch (err) {
                return { connected: true, found: false, message: err.message };
            }
        }

        /** Whole-platform upgrade check between two locked releases. */
        getPlatformUpgradeData(fromReleaseId, toReleaseId) {
            const cert = this.#certification;
            if (!cert) return { connected: false, message: "Certification engine not connected." };
            try {
                const result = cert.verifyPlatformUpgrade(fromReleaseId, toReleaseId);
                return { connected: true, found: true, result };
            } catch (err) {
                return { connected: true, found: false, message: err.message };
            }
        }

        /**
         * "Is there an upgrade available for this module at all" — i.e. is the
         * version currently running ahead of what's certified. This is a quick
         * display check; whether that upgrade is SAFE is a separate question,
         * answered only by getModuleUpgradeData() → CozyCertification.verifyUpgrade().
         */
        getUpgradeAvailability(moduleId) {
            const cert = this.#certification;
            if (!cert) return { connected: false, message: "Certification engine not connected." };
            const liveCoord = this.#coordinators.get(moduleId);
            const summary = cert.getWorkspaceSummary(moduleId);
            const updateStatus = this.#computeUpdateStatus(liveCoord ? liveCoord.version : null, summary ? summary.version : null);
            return this.#deepClone({
                connected: true, moduleId,
                liveVersion: liveCoord ? liveCoord.version : null,
                certifiedVersion: summary ? summary.version : null,
                updateStatus,
                upgradeAvailable: updateStatus === "PENDING_CERTIFICATION"
            });
        }

        // =========================================================================
        // ─── DEPENDENCY VIEWER ──────────────────────────────────────────────────
        // A simple, honest tree: application → its declared modules. This is
        // NOT an auto-discovered dependency graph (nothing in CozyOS can derive
        // "who depends on what" from source text alone — see CozyCertification's
        // own notes on this) — it reflects exactly what was declared via
        // registerApplication(), nothing inferred.
        // =========================================================================

        getDependencyViewerData(applicationId = null) {
            const cert = this.#certification;
            if (!cert) return { connected: false, message: "Certification engine not connected." };
            const apps = applicationId ? [cert.getApplication(applicationId)].filter(Boolean) : cert.listApplications();
            const trees = apps.map((app) => ({
                applicationId: app.id,
                applicationName: app.name,
                modules: app.modules.map((moduleId) => {
                    let impact = null;
                    try { impact = cert.getDependencyImpact(moduleId); } catch (_err) { /* ignore */ }
                    return { moduleId, verdict: impact ? impact.moduleVerdict : "NOT_CERTIFIED" };
                })
            }));
            return this.#deepClone({ connected: true, trees });
        }

        // =========================================================================
        // ─── FEATURE VISIBILITY ─────────────────────────────────────────────────
        // "Enable/disable menu items according to application metadata." The
        // only real per-application feature-style metadata CozyCertification
        // exposes today is `plannedFeatures` (declared via registerApplication).
        // This maps that honestly: a feature marked done is shown unlocked
        // (✓), one not yet done shows locked (✗) — visible either way, never
        // hidden, matching "disabled features must remain visible but locked."
        // This is NOT a licensing/entitlement decision (see Subscription
        // Center for that) — it only reflects what was declared as planned.
        // =========================================================================

        getFeatureVisibility(applicationId) {
            const cert = this.#certification;
            if (!cert) return { connected: false, message: "Certification engine not connected." };
            const app = cert.getApplication(applicationId);
            if (!app) return { connected: true, found: false, message: `No application registered with id "${applicationId}".` };
            const features = (app.plannedFeatures || []).map(f => ({ name: f.name, enabled: !!f.done, symbol: f.done ? "✓" : "✗" }));
            return this.#deepClone({
                connected: true, found: true, applicationId,
                features,
                note: "Reflects each application's declared plannedFeatures (via registerApplication) — not a licensing/entitlement decision. See Subscription Center for plan-based access."
            });
        }

        // =========================================================================
        // ─── SUBSCRIPTION / LICENSE CENTER ──────────────────────────────────────
        // The Workspace NEVER decides who has paid or what plan is active. It
        // only reads whatever CozySubscription or CozyLicense — whichever
        // exists — reports, generically (version + diagnostics), same as every
        // other integration slot. No entitlement logic lives here.
        // =========================================================================

        getSubscriptionCenterData() {
            const primary = window.CozyOS && window.CozyOS.CozySubscription ? "CozySubscription"
                : window.CozyOS && window.CozyOS.CozyLicense ? "CozyLicense" : null;
            if (!primary) {
                return { connected: false, coordinator: null, message: "Neither CozySubscription nor CozyLicense is installed/registered yet." };
            }
            const liveRef = window.CozyOS[primary];
            const version = typeof liveRef.getVersion === "function" ? liveRef.getVersion() : null;
            let diagnostics = null;
            if (typeof liveRef.getDiagnosticsReport === "function") {
                try { diagnostics = liveRef.getDiagnosticsReport(); } catch (_err) { this.#diagnostics.errorsHidden++; }
            }
            return this.#deepClone({ connected: true, coordinator: primary, version, diagnostics });
        }

        // =========================================================================
        // ─── APPLICATION DETAILS (consolidated) ────────────────────────────────
        // Overview / Modules / Certification / Health / Dependencies /
        // Subscription / Diagnostics / Events / Release History / Upgrade
        // Status, assembled from the real data-layer methods above. Settings,
        // Audit, and Timeline are explicitly reported as unavailable — no
        // coordinator exposes per-application settings/audit/timeline today,
        // and this shell won't invent placeholder content for them.
        // =========================================================================

        getApplicationDetails(applicationId) {
            const cert = this.#certification;
            if (!cert) return { connected: false, message: "Certification engine not connected." };
            const app = cert.getApplication(applicationId);
            if (!app) return { connected: true, found: false, message: `No application registered with id "${applicationId}".` };

            const health = this.getApplicationHealthData(applicationId);
            const features = this.getFeatureVisibility(applicationId);
            const subscription = this.getSubscriptionCenterData();
            const events = this.#eventLog.filter(e => app.modules.includes(e.source)).slice(-50);
            const releaseHistory = cert.listReleases().filter(r => r.applications.applications.some(a => a.applicationId === applicationId));
            const upgradeStatus = app.modules.map(moduleId => this.getUpgradeAvailability(moduleId));

            return this.#deepClone({
                connected: true, found: true,
                overview: app,
                modules: app.modules,
                certification: health.matrix,
                healthPercent: health.matrix ? health.matrix.overallReadiness : 0,
                dependencies: health.dependencyImpacts,
                subscription,
                features: features.features,
                diagnostics: app.modules.map(moduleId => ({ moduleId, diagnostics: this.#coordinators.get(moduleId) ? this.#coordinators.get(moduleId).diagnostics : null })),
                events,
                releaseHistory,
                upgradeStatus,
                settings: null, settingsNote: "Not available — no coordinator exposes per-application settings yet.",
                audit: null, auditNote: "Not available — Workspace doesn't track per-application audit; see each coordinator's own audit via Diagnostics Center.",
                timeline: null, timelineNote: "Not available — Workspace doesn't track per-application timeline; see each coordinator's own timeline via Diagnostics Center."
            });
        }

        // =========================================================================
        // ─── ROLE-BASED MENU ────────────────────────────────────────────────────
        // Reads permissions from CozyIdentity ONLY — the Workspace never
        // decides who can see what. If CozyIdentity isn't connected, or
        // doesn't expose the proposed getAllowedApplications(role) method,
        // this fails OPEN (shows everything) with a clear, visible reason,
        // rather than silently hiding applications for a reason the operator
        // can't see.
        // =========================================================================

        getVisibleApplications(role) {
            const cert = this.#certification;
            const allApps = cert ? cert.listApplications() : [];
            const identity = window.CozyOS && window.CozyOS.CozyIdentity ? window.CozyOS.CozyIdentity : null;
            if (!identity) {
                return this.#deepClone({ role: role || null, source: "none", applications: allApps, message: "CozyIdentity not connected — showing all applications (role-based filtering unavailable)." });
            }
            if (typeof identity.getAllowedApplications !== "function") {
                return this.#deepClone({ role: role || null, source: "CozyIdentity (unsupported)", applications: allApps, message: "CozyIdentity is connected but doesn't expose getAllowedApplications(role) — showing all applications." });
            }
            let allowedIds;
            try { allowedIds = identity.getAllowedApplications(role); }
            catch (_err) {
                this.#diagnostics.errorsHidden++;
                return this.#deepClone({ role: role || null, source: "CozyIdentity (error)", applications: allApps, message: "CozyIdentity.getAllowedApplications() threw — showing all applications." });
            }
            const allowedSet = new Set(Array.isArray(allowedIds) ? allowedIds : []);
            return this.#deepClone({
                role: role || null, source: "CozyIdentity",
                applications: allApps.filter(a => allowedSet.has(a.id))
            });
        }

        // =========================================================================
        // ─── DIAGNOSTICS CENTER ─────────────────────────────────────────────────
        // Collects whatever getDiagnosticsReport() each discovered coordinator
        // actually returns. Different coordinators will have different fields —
        // this deliberately does NOT normalize them into a fake common shape.
        // =========================================================================

        getDiagnosticsCenterData() {
            const rows = Array.from(this.#coordinators.values()).map(c => ({
                name: c.name, discovered: c.discovered, diagnostics: c.diagnostics
            }));
            return this.#deepClone({
                shellDiagnostics: { ...this.#diagnostics },
                coordinators: rows
            });
        }

        // =========================================================================
        // ─── EVENT MONITOR ──────────────────────────────────────────────────────
        // =========================================================================

        getEventLog(limit = 100) {
            return this.#deepClone(this.#eventLog.slice(-limit).reverse());
        }

        /**
         * Enterprise Notification Center — a filtered view of the same real
         * event log, restricted to the coordinators the spec names as
         * notification sources (CozyNotification, CozySecurity, CozySync,
         * CozyCertification, CozySubscription). Nothing here is generated by
         * the Workspace itself — it only re-presents events those
         * coordinators already emitted (see #discoverCoordinators for the
         * honest event-vocabulary limits: only CozyCertification's documented
         * events, plus the generic "session:create" convention, are ever
         * subscribed to).
         */
        getNotificationFeed(limit = 50) {
            const sources = new Set(["Certification", "CozyNotification", "CozySecurity", "CozySync", "CozySubscription"]);
            return this.#deepClone(this.#eventLog.filter(e => sources.has(e.source)).slice(-limit).reverse());
        }

        // =========================================================================
        // ─── GLOBAL STATUS BAR ──────────────────────────────────────────────────
        // Every field here is either a real count from real data, or an
        // honest "Unknown — <coordinator> not connected" rather than a guess.
        // =========================================================================

        getGlobalStatusBar() {
            const cert = this.#certification;
            const applicationsInstalled = cert ? cert.listApplications().length : 0;
            const coordinatorsLoaded = Array.from(this.#coordinators.values()).filter(c => c.discovered).length;
            // "Running" is tracked locally: an application counts as running
            // once this shell has actually requested its launch. There's no
            // way to verify an application is still alive without it
            // reporting back, so this is "launch requested," stated plainly.
            const applicationsRunning = this.#runningApplications.size;
            const subscription = this.getSubscriptionCenterData();
            const sync = this.getSynchronizationCenterData();
            return this.#deepClone({
                workspaceVersion: SHELL_VERSION,
                applicationsInstalled,
                coordinatorsLoaded,
                applicationsRunning,
                notificationCount: this.getNotificationFeed().length,
                currentTenant: null, currentTenantNote: "No tenant coordinator connected yet.",
                licenseStatus: subscription.connected ? `${subscription.coordinator} v${subscription.version || "unknown"}` : "Not connected",
                synchronizationStatus: sync.connected ? `${sync.coordinator} v${sync.version || "unknown"}` : "Not connected",
                offlineStatus: "Unknown — requires a synchronization/offline coordinator"
            });
        }

        // =========================================================================
        // ─── STARTUP SEQUENCE ───────────────────────────────────────────────────
        // A real status readout (not a fixed animation): each step reflects
        // whether that coordinator is actually discovered right now.
        // =========================================================================

        getStartupSequence() {
            const cert = this.#certification;
            const steps = [
                { label: "Initializing Workspace", loaded: true },
                { label: "Loading Registry", loaded: true },
                { label: "Loading Coordinators", loaded: this.#coordinators.size > 0 },
                { label: "Loading Applications", loaded: !!cert && cert.listApplications().length >= 0 && !!cert },
                { label: "Loading Certification", loaded: !!cert },
                { label: "Loading Identity", loaded: !!(window.CozyOS && window.CozyOS.CozyIdentity) },
                { label: "Loading Subscription", loaded: this.getSubscriptionCenterData().connected },
                { label: "Loading Notifications", loaded: !!(window.CozyOS && window.CozyOS.CozyNotification) },
                { label: "Loading Storage", loaded: !!(window.CozyOS && window.CozyOS.CozyStorage) },
                { label: "Loading Sync", loaded: !!(window.CozyOS && window.CozyOS.CozySync) },
                { label: "Workspace Ready", loaded: true }
            ];
            return this.#deepClone({ steps, allLoaded: steps.every(s => s.loaded) });
        }

        // =========================================================================
        // ─── ENTERPRISE SEARCH ──────────────────────────────────────────────────
        // Searches only across data this shell actually has: discovered
        // coordinators, registered applications, certification history, and
        // locked releases. No users/tenants/logs beyond what's real.
        // =========================================================================

        search(term) {
            this.#diagnostics.searchQueries++;
            this.#searchTerm = term;
            const needle = String(term || "").toLowerCase().trim();
            if (!needle) return { term, results: [] };

            const results = [];
            for (const c of this.#coordinators.values()) {
                if (c.name.toLowerCase().includes(needle)) results.push({ type: "module", id: c.name, label: c.name });
            }

            const cert = this.#certification;
            if (cert) {
                for (const app of cert.listApplications()) {
                    if (app.name.toLowerCase().includes(needle) || app.id.toLowerCase().includes(needle)) {
                        results.push({ type: "application", id: app.id, label: app.name });
                    }
                }
                for (const release of cert.listReleases()) {
                    if (release.name.toLowerCase().includes(needle) || release.releaseId.toLowerCase().includes(needle)) {
                        results.push({ type: "release", id: release.releaseId, label: release.name });
                    }
                }
                // Certification history: match on certificationId or verdict
                // text, across every discovered coordinator's real history.
                for (const c of this.#coordinators.values()) {
                    let history = [];
                    try { history = cert.listRecords(c.name); } catch (_err) { /* ignore */ }
                    for (const record of history) {
                        if (record.certificationId.toLowerCase().includes(needle) || record.verdict.toLowerCase().includes(needle)) {
                            results.push({ type: "certification", id: record.certificationId, label: `${c.name} — ${record.certificationId} (${record.verdict})` });
                        }
                    }
                }
            }

            return this.#deepClone({ term, results });
        }

        // =========================================================================
        // ─── INTEGRATION SLOTS ──────────────────────────────────────────────────
        // Security / Backup / Synchronization / Notification / AI / Tenant /
        // Plugin Centers. No coordinator with an agreed API exists for these
        // yet in CozyOS, so these panels read generically (version +
        // diagnostics, whatever shape that turns out to be) and are explicit
        // about being unconnected rather than showing invented numbers.
        // =========================================================================

        #getIntegrationSlotData(slotKey) {
            const coordinatorName = INTEGRATION_SLOTS[slotKey];
            if (!coordinatorName) {
                return { slot: slotKey, coordinator: null, connected: false, message: "No CozyOS coordinator convention exists for this yet." };
            }
            const liveRef = window.CozyOS ? window.CozyOS[coordinatorName] : undefined;
            if (!liveRef) {
                return { slot: slotKey, coordinator: coordinatorName, connected: false, message: `${coordinatorName} is not yet installed/registered.` };
            }
            const version = typeof liveRef.getVersion === "function" ? liveRef.getVersion() : null;
            let diagnostics = null;
            if (typeof liveRef.getDiagnosticsReport === "function") {
                try { diagnostics = liveRef.getDiagnosticsReport(); } catch (_err) { this.#diagnostics.errorsHidden++; }
            }
            return this.#deepClone({ slot: slotKey, coordinator: coordinatorName, connected: true, version, diagnostics });
        }

        getSecurityCenterData() { return this.#getIntegrationSlotData("security"); }
        getStorageCenterData() { return this.#getIntegrationSlotData("storage"); }
        getSynchronizationCenterData() { return this.#getIntegrationSlotData("sync"); }
        getAutomationCenterData() { return this.#getIntegrationSlotData("automation"); }
        getLiveCenterData() { return this.#getIntegrationSlotData("live"); }
        getSpeechCenterData() { return this.#getIntegrationSlotData("speech"); }
        getTranslationCenterData() { return this.#getIntegrationSlotData("translation"); }
        getNotificationCenterData() { return this.#getIntegrationSlotData("notification"); }
        getAICenterData() { return this.#getIntegrationSlotData("ai"); }

        // Plugin Center and Tenant Center have no backing coordinator
        // convention at all yet in CozyOS — honestly empty, not simulated.
        getPluginCenterData() {
            return { connected: false, message: "No plugin-registry coordinator exists yet in CozyOS. Nothing to show until one is built and registers plugins with a documented API." };
        }

        getTenantCenterData() {
            return { connected: false, message: "No tenant/multi-org coordinator exists yet in CozyOS. Nothing to show until one is built and registers tenants with a documented API." };
        }

        getDiagnosticsReport() {
            return Object.freeze({
                ...this.#diagnostics,
                coordinatorsTracked: this.#coordinators.size,
                eventLogSize: this.#eventLog.length,
                launchersRegistered: this.#launchers.size,
                auditLogSize: this.#auditLogs.length
            });
        }

        // =========================================================================
        // ─── RENDER LAYER ───────────────────────────────────────────────────────
        // Deliberately generic: a handful of reusable renderers (key/value
        // table, list, "not connected" placeholder) rather than one bespoke
        // hand-built markup block per center. Every dynamic value is routed
        // through #escapeHtml before reaching innerHTML.
        // =========================================================================

        #renderNotConnected(message) {
            return `<div class="cozy-empty-state"><p>${this.#escapeHtml(message || "Not connected.")}</p></div>`;
        }

        #renderKeyValueTable(obj) {
            if (!obj || typeof obj !== "object") return this.#renderNotConnected("No data.");
            const rows = Object.entries(obj).map(([k, v]) => {
                const display = (v === null || v === undefined) ? "—"
                    : (typeof v === "object") ? this.#escapeHtml(JSON.stringify(v))
                    : this.#escapeHtml(v);
                return `<tr><th>${this.#escapeHtml(k)}</th><td>${display}</td></tr>`;
            }).join("");
            return `<table class="cozy-kv">${rows}</table>`;
        }

        #renderList(items, renderItem) {
            if (!items || items.length === 0) return this.#renderNotConnected("Nothing here yet.");
            return `<div class="cozy-list">${items.map(renderItem).join("")}</div>`;
        }

        #symbolFor(verdict) {
            if (verdict === "ENTERPRISE_CERTIFIED") return "✓";
            if (verdict === "CERTIFIED_WITH_WARNINGS") return "⚠";
            return "✗";
        }

        #renderCenter(centerId) {
            switch (centerId) {
                case "dashboard": return this.#renderDashboard();
                case "applications":
                    if (this.#selectedContext && this.#selectedContext.type === "app-health") return this.#renderApplicationHealth(this.#selectedContext.id);
                    return this.#renderApplicationCenter();
                case "modules": return this.#renderModuleManager();
                case "certification":
                    if (this.#selectedContext && this.#selectedContext.type === "certification-detail") return this.#renderCertificationDetail(this.#selectedContext.id);
                    return this.#renderCertificationCenter();
                case "releases":
                    if (this.#selectedContext && this.#selectedContext.type === "release-detail") return this.#renderReleaseDetail(this.#selectedContext.id);
                    return this.#renderReleaseCenter();
                case "upgrades": return this.#renderUpgradeCenter();
                case "dependencies": return this.#renderDependencyViewer();
                case "diagnostics": return this.#renderDiagnosticsCenter();
                case "events": return this.#renderEventMonitor();
                case "search": return this.#renderSearch();
                case "security": return this.#renderIntegrationSlot(this.getSecurityCenterData(), "Security Center");
                case "storage": return this.#renderIntegrationSlot(this.getStorageCenterData(), "Storage Center");
                case "sync": return this.#renderIntegrationSlot(this.getSynchronizationCenterData(), "Synchronization Center");
                case "automation": return this.#renderIntegrationSlot(this.getAutomationCenterData(), "Automation Center");
                case "live": return this.#renderIntegrationSlot(this.getLiveCenterData(), "Live Center");
                case "speech": return this.#renderIntegrationSlot(this.getSpeechCenterData(), "Speech Center");
                case "translation": return this.#renderIntegrationSlot(this.getTranslationCenterData(), "Translation Center");
                case "notifications": return this.#renderNotificationCenter();
                case "ai": return this.#renderIntegrationSlot(this.getAICenterData(), "AI Center");
                case "subscription": return this.#renderIntegrationSlot(this.getSubscriptionCenterData(), "Subscription / License Center");
                case "plugins": return `<h2>Plugin Center</h2>${this.#renderNotConnected(this.getPluginCenterData().message)}`;
                case "tenants": return `<h2>Tenant Center</h2>${this.#renderNotConnected(this.getTenantCenterData().message)}`;
                default: return this.#renderNotConnected(`Unknown center "${centerId}".`);
            }
        }

        #renderDashboard() {
            const data = this.getDashboardData();
            const rows = data.coordinators.map(c => `
                <div class="cozy-nav-link" data-view="modules" data-id="${this.#escapeHtml(c.name)}">
                    <span>${this.#escapeHtml(c.name)}</span>
                    <span class="cozy-badge">${this.#escapeHtml(c.certSymbol)} ${this.#escapeHtml(c.certStatus)}</span>
                </div>`).join("");
            const banner = data.certificationConnected ? "" : this.#renderNotConnected("CozyCertification is not connected — certification status below is unknown for every coordinator, not fabricated as passing.");
            return `<h2>Dashboard</h2><p>${data.discoveredCount}/${data.totalCount} coordinators discovered.</p>${banner}<div class="cozy-list">${rows}</div>`;
        }

        #renderApplicationCenter() {
            const data = this.getApplicationCenterData();
            if (!data.connected) return `<h2>Application Center</h2>${this.#renderNotConnected(data.message)}`;
            return `<h2>Application Center</h2>${this.#renderList(data.applications, app => `
                <div class="cozy-nav-link" data-view="app-health" data-id="${this.#escapeHtml(app.id)}">
                    <span>${this.#escapeHtml(app.name)}</span>
                    <span class="cozy-badge">${this.#escapeHtml(app.overallReadiness)}% — ${this.#escapeHtml(app.deploymentStatus)}</span>
                </div>`)}`;
        }

        #renderModuleManager() {
            const data = this.getModuleManagerData();
            return `<h2>Module Manager</h2>${this.#renderList(data.modules, m => `
                <div class="cozy-module-row" data-view="certification-detail" data-id="${this.#escapeHtml(m.name)}">
                    <b>${this.#escapeHtml(m.name)}</b>
                    <span>${m.discovered ? this.#escapeHtml(m.version || "unknown version") : this.#escapeHtml(m.registrationStatus)}</span>
                    <span class="cozy-badge">${m.certification ? this.#escapeHtml(m.certification.certification) : "Unknown"}</span>
                    <span class="cozy-badge">${this.#escapeHtml(m.updateStatus)}</span>
                    <span>${m.health !== null ? this.#escapeHtml(m.health) + "%" : "Health: Unknown"}</span>
                    <span>${m.dependencies.length} dependenc${m.dependencies.length === 1 ? "y" : "ies"} declared</span>
                </div>`)}`;
        }

        #renderApplicationHealth(applicationId) {
            const data = this.getApplicationHealthData(applicationId);
            if (!data.connected) return `<h2>Application Health</h2>${this.#renderNotConnected(data.message)}`;
            if (!data.found) return `<h2>Application Health</h2>${this.#renderNotConnected(data.message)}`;
            const m = data.matrix;
            return `<h2>${this.#escapeHtml(data.application.name)}</h2>
                <p>${m ? this.#escapeHtml(m.overallReadiness) : 0}% — ${m ? this.#escapeHtml(m.deploymentStatus) : "Unknown"}</p>
                <h3>Certified Modules</h3>${this.#renderList(data.certifiedModules, id => `<div>${this.#escapeHtml(id)}</div>`)}
                <h3>Missing / Not Certified</h3>${this.#renderList(data.missingModules, id => `<div>${this.#escapeHtml(id)}</div>`)}
                <h3>Warnings</h3>${this.#renderList(data.warnings, w => `<div>${this.#escapeHtml(w)}</div>`)}
                <h3>Roadmap</h3>${data.roadmap ? this.#renderKeyValueTable({ completedPercent: data.roadmap.completedPercent + "%", estimatedCompletionDays: data.roadmap.estimatedCompletionDays, remaining: data.roadmap.remaining.join(", ") || "none" }) : this.#renderNotConnected("No roadmap available.")}`;
        }

        #renderCertificationDetail(moduleId) {
            const data = this.getCertificationCenterData(moduleId);
            if (!data.connected) return `<h2>Certification Center</h2>${this.#renderNotConnected(data.message)}`;
            const latest = data.latest;
            if (!latest) return `<h2>${this.#escapeHtml(moduleId)}</h2>${this.#renderNotConnected("Not yet certified.")}`;
            return `<h2>${this.#escapeHtml(moduleId)}</h2>
                <p>${this.#escapeHtml(latest.verdict)} — ${this.#escapeHtml(latest.summary.scorePercent)}% (Grade ${this.#escapeHtml(latest.overallGrade)})</p>
                <p>${data.frozen ? "🔒 FROZEN" : "ACTIVE"}${data.baseline ? " — Baseline on file" : ""}</p>
                <h3>Warnings</h3><p>${this.#escapeHtml(latest.summary.warnings)}</p>
                <h3>Defects</h3>${this.#renderList(latest.defects, d => `<div>[${this.#escapeHtml(d.severity)}] ${this.#escapeHtml(d.id)} — ${this.#escapeHtml(d.description)}</div>`)}
                <h3>History (${data.history.length})</h3>${this.#renderList(data.history, r => `<div>${this.#escapeHtml(r.certificationId)} — ${this.#escapeHtml(r.verdict)} (${this.#escapeHtml(r.summary.scorePercent)}%)</div>`)}
                <h3>Enterprise Certificate</h3>${this.#renderKeyValueTable(latest.certificate)}`;
        }

        #renderReleaseDetail(releaseId) {
            const data = this.getReleaseCenterData(releaseId);
            if (!data.connected) return `<h2>Release Center</h2>${this.#renderNotConnected(data.message)}`;
            if (!data.found) return `<h2>Release Center</h2>${this.#renderNotConnected(data.message)}`;
            const r = data.release;
            return `<h2>${this.#escapeHtml(r.name)}</h2>
                <p>${this.#escapeHtml(r.status)}${data.isCurrent ? " — CURRENT" : ""}</p>
                <p>Core Modules: ${r.coreModules.ready}/${r.coreModules.total} — Applications: ${r.applications.ready}/${r.applications.total}</p>
                <p>Rollback available: ${data.rollbackAvailable ? "Yes" : "No"}</p>
                <p>${this.#escapeHtml(data.releaseNotes)}</p>
                <h3>Modules</h3>${this.#renderList(r.coreModules.modules, m => `<div>${this.#escapeHtml(m.moduleId)} — v${this.#escapeHtml(m.version)} — ${this.#escapeHtml(m.verdict)}</div>`)}`;
        }

        #renderCertificationCenter() {
            const data = this.getCertificationCenterData();
            if (!data.connected) return `<h2>Certification Center</h2>${this.#renderNotConnected(data.message)}`;
            return `<h2>Certification Center</h2>${this.#renderList(data.overview, r => `
                <div class="cozy-nav-link" data-view="certification-detail" data-id="${this.#escapeHtml(r.name)}">
                    <span>${this.#escapeHtml(r.name)}</span>
                    <span class="cozy-badge">${this.#escapeHtml(r.certification || "NOT_CERTIFIED")} — ${this.#escapeHtml(r.score ?? 0)}%</span>
                </div>`)}`;
        }

        #renderReleaseCenter() {
            const data = this.getReleaseCenterData();
            if (!data.connected) return `<h2>Release Center</h2>${this.#renderNotConnected(data.message)}`;
            return `<h2>Release Center</h2>${this.#renderList(data.releases, r => `
                <div class="cozy-nav-link" data-view="release-detail" data-id="${this.#escapeHtml(r.releaseId)}">
                    <span>${this.#escapeHtml(r.name)}</span>
                    <span class="cozy-badge">${this.#escapeHtml(r.status)}</span>
                </div>`)}`;
        }

        #renderUpgradeCenter() {
            return `<h2>Upgrade Center</h2><p>Use getModuleUpgradeData(moduleId) or getPlatformUpgradeData(fromReleaseId, toReleaseId) to run a check — this panel needs a target picked first.</p>`;
        }

        #renderDependencyViewer() {
            const data = this.getDependencyViewerData();
            if (!data.connected) return `<h2>Dependency Viewer</h2>${this.#renderNotConnected(data.message)}`;
            const trees = data.trees.map(tree => `
                <div class="cozy-dep-tree">
                    <b>${this.#escapeHtml(tree.applicationName)}</b>
                    ${tree.modules.map(m => `<div class="cozy-dep-node">↓ ${this.#escapeHtml(m.moduleId)} <span class="cozy-badge">${this.#symbolFor(m.verdict)}</span></div>`).join("")}
                </div>`).join("");
            return `<h2>Dependency Viewer</h2>${trees || this.#renderNotConnected("No applications registered.")}`;
        }

        #renderDiagnosticsCenter() {
            const data = this.getDiagnosticsCenterData();
            const shellTable = this.#renderKeyValueTable(data.shellDiagnostics);
            const rows = data.coordinators.map(c => `
                <div class="cozy-module-row">
                    <b>${this.#escapeHtml(c.name)}</b>
                    ${c.discovered ? this.#renderKeyValueTable(c.diagnostics) : "<span>Not Connected</span>"}
                </div>`).join("");
            return `<h2>Diagnostics Center</h2><h3>Shell</h3>${shellTable}<h3>Coordinators</h3>${rows}`;
        }

        #renderEventMonitor() {
            const events = this.getEventLog(50);
            return `<h2>Event Monitor</h2>${this.#renderList(events, e => `
                <div class="cozy-event-row"><b>${this.#escapeHtml(e.time)}</b> ${this.#escapeHtml(e.source)} → ${this.#escapeHtml(e.eventName)} <span class="cozy-muted">${this.#escapeHtml(e.summary)}</span></div>`)}`;
        }

        #renderNotificationCenter() {
            const feed = this.getNotificationFeed(50);
            return `<h2>Enterprise Notification Center</h2>
                <p class="cozy-muted">Sources: CozyNotification, CozySecurity, CozySync, CozyCertification, CozySubscription — only real events these coordinators actually emitted.</p>
                ${this.#renderList(feed, e => `
                <div class="cozy-event-row"><b>${this.#escapeHtml(e.time)}</b> ${this.#escapeHtml(e.source)} → ${this.#escapeHtml(e.eventName)} <span class="cozy-muted">${this.#escapeHtml(e.summary)}</span></div>`)}`;
        }

        #renderSearch() {
            const results = this.#searchTerm ? this.search(this.#searchTerm).results : [];
            return `<h2>Enterprise Search</h2>
                <input type="text" class="cozy-search-box" id="cozy-global-search-field" value="${this.#escapeHtml(this.#searchTerm)}" placeholder="Search modules, applications, releases..." />
                ${this.#renderList(results, r => `<div class="cozy-nav-link"><span>${this.#escapeHtml(r.label)}</span><span class="cozy-badge">${this.#escapeHtml(r.type)}</span></div>`)}`;
        }

        #renderIntegrationSlot(data, title) {
            if (!data.connected) return `<h2>${this.#escapeHtml(title)}</h2>${this.#renderNotConnected(data.message)}`;
            return `<h2>${this.#escapeHtml(title)}</h2><p>Connected: ${this.#escapeHtml(data.coordinator)} v${this.#escapeHtml(data.version || "unknown")}</p>${this.#renderKeyValueTable(data.diagnostics)}`;
        }

        // =========================================================================
        // ─── MOUNT ──────────────────────────────────────────────────────────────
        // =========================================================================

        #render() {
            if (!this.#domRoot) return;
            this.#diagnostics.renderCycles++;

            const NAV_SECTIONS = [
                { label: "Overview", items: [["dashboard", "Dashboard"], ["applications", "Application Center"], ["modules", "Module Manager"]] },
                { label: "Certification", items: [["certification", "Certification Center"], ["releases", "Release Center"], ["upgrades", "Upgrade Center"], ["dependencies", "Dependency Viewer"]] },
                { label: "Operations", items: [["diagnostics", "Diagnostics Center"], ["events", "Event Monitor"], ["notifications", "Notification Center"], ["search", "Enterprise Search"]] },
                { label: "Integrations (awaiting coordinators)", items: [["security", "Security Center"], ["storage", "Storage Center"], ["sync", "Synchronization Center"], ["automation", "Automation Center"], ["live", "Live Center"], ["speech", "Speech Center"], ["translation", "Translation Center"], ["subscription", "Subscription / License Center"], ["ai", "AI Center"], ["plugins", "Plugin Center"], ["tenants", "Tenant Center"]] }
            ];

            const navHtml = NAV_SECTIONS.map(section => `
                <div class="cozy-nav-section">
                    <div class="cozy-nav-section-label">${this.#escapeHtml(section.label)}</div>
                    ${section.items.map(([id, label]) => `<div class="cozy-nav-link${this.#activeCenter === id ? " active" : ""}" data-center="${id}">${this.#escapeHtml(label)}</div>`).join("")}
                </div>`).join("");

            const mainHtml = this.#renderCenter(this.#activeCenter);
            const bar = this.getGlobalStatusBar();
            const statusBarHtml = `<div class="cozy-status-bar">
                <span>v${this.#escapeHtml(bar.workspaceVersion)}</span>
                <span>Apps: ${this.#escapeHtml(bar.applicationsInstalled)}</span>
                <span>Coordinators: ${this.#escapeHtml(bar.coordinatorsLoaded)}</span>
                <span>Running: ${this.#escapeHtml(bar.applicationsRunning)}</span>
                <span>Notifications: ${this.#escapeHtml(bar.notificationCount)}</span>
                <span>License: ${this.#escapeHtml(bar.licenseStatus)}</span>
                <span>Sync: ${this.#escapeHtml(bar.synchronizationStatus)}</span>
            </div>`;

            this.#domRoot.innerHTML = `
                <div class="cozy-shell">
                    <nav class="cozy-sidebar">
                        <div class="cozy-shell-title">CozyOS Enterprise Control Center</div>
                        <button type="button" id="cozy-rediscover-btn" class="cozy-rediscover-btn">Rediscover</button>
                        ${navHtml}
                    </nav>
                    <div class="cozy-main-wrap">
                        ${statusBarHtml}
                        <main class="cozy-main">${mainHtml}</main>
                    </div>
                </div>`;
        }

        mount(mountingContainerElement) {
            if (!mountingContainerElement || typeof mountingContainerElement.appendChild !== "function") {
                throw new TypeError("[WorkspaceShell] mount(): a valid DOM container element is required.");
            }
            this.#domRoot = mountingContainerElement;

            if (!this.#documentClickDismissBound) {
                this.#domRoot.addEventListener("click", (evt) => {
                    const centerEl = evt.target.closest("[data-center]");
                    if (centerEl) {
                        this.#activeCenter = centerEl.getAttribute("data-center");
                        this.#selectedContext = null;
                        this.#render();
                        return;
                    }
                    if (evt.target.id === "cozy-rediscover-btn") {
                        this.rediscover();
                        this.#render();
                        return;
                    }
                    const navLink = evt.target.closest("[data-view]");
                    if (navLink) {
                        this.#selectedContext = { type: navLink.getAttribute("data-view"), id: navLink.getAttribute("data-id") };
                        this.#render();
                    }
                });
                this.#domRoot.addEventListener("input", (evt) => {
                    if (evt.target.id === "cozy-global-search-field") {
                        this.#searchTerm = evt.target.value;
                        this.#render();
                    }
                });
                this.#documentClickDismissBound = true;
            }

            this.#render();
        }
    }

    // --- INSTANTIATION & VERSION CONFLICT / HOT RELOAD PROTECTION ---
    if (window.CozyOS.WorkspaceShell && typeof window.CozyOS.WorkspaceShell.getVersion === "function") {
        const existingVersion = window.CozyOS.WorkspaceShell.getVersion();
        if (existingVersion !== SHELL_VERSION) {
            throw new Error(`[CozyOS Framework Execution Error] VERSION_CONFLICT: WorkspaceShell existing v${existingVersion} conflicts with load target v${SHELL_VERSION}.`);
        }
        return;
    }

    window.CozyOS.WorkspaceShell = new CozyOSWorkspaceShell();
})();
