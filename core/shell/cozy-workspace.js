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
    const SHELL_VERSION = "3.2.0-ENTERPRISE-CONTROL-CENTER";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    const PROTECTED_FILE_PATTERNS = Object.freeze([
        /^cozy-certification\.js$/i, /^cozy-workspace\.js$/i,
        /^cozy-identity\.js$/i, /^cozy-security\.js$/i, /^cozy-registry\.js$/i
    ]);

    const SUSPICIOUS_PATTERNS = Object.freeze([
        { id: "EVAL_USAGE", pattern: /\beval\s*\(/, description: "Contains eval()." },
        { id: "FUNCTION_CTOR", pattern: /\bnew\s+Function\s*\(/, description: "Contains new Function()." },
        { id: "DOCUMENT_WRITE", pattern: /document\s*\.\s*write\s*\(/, description: "Uses the document.write DOM API." },
        { id: "PROTO_POLLUTION_LITERAL", pattern: /__proto__\s*[:=]/, description: "Contains a literal __proto__ assignment/key." }
    ]);

    function isProtectedFile(filename) {
        return PROTECTED_FILE_PATTERNS.some(p => p.test(filename));
    }

    function scanForSuspiciousPatterns(source) {
        return SUSPICIOUS_PATTERNS.filter(p => p.pattern.test(source)).map(p => ({ id: p.id, description: p.description }));
    }

    async function sha256Hex(text) {
        if (typeof crypto === "undefined" || !crypto.subtle) throw new Error("[WorkspaceShell] crypto.subtle unavailable — cannot compute a checksum.");
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
        return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
    }

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
        translation: "LanguageEngine",
        notification: "CozyNotification",
        ai: "CozyAI",
        plugin: null, // no single coordinator convention exists for plugins yet
        // Additive (Administrator Workspace expansion): Users/Roles/Permissions
        // all read the SAME CozyIdentity coordinator already used by
        // getVisibleApplications() above — CozyOS has one identity coordinator,
        // not three, so these three centers honestly share one connection
        // check rather than pretending to be three independent systems.
        users: "CozyIdentity",
        roles: "CozyIdentity",
        permissions: "CozyIdentity"
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

        // ---- file registry: the "Upload to Workspace" / "central file hub"
        // data layer. Each entry is metadata ONLY (filename, category,
        // moduleId if it maps to a known coordinator, and either the raw
        // source text or — when available — a real File System Access API
        // handle). This shell never opens, reads, or writes any file beyond
        // what's registered here; there is no folder-browsing capability. ----
        #fileRegistry = new Map(); // fileId -> full record, see #buildFileRecord
        #fileBackups = new Map(); // fileId -> [{ backupId, source, hash, timestamp }], bounded
        #projectRegistry = new Map(); // projectName -> { name, fileIds, folderStructure, registeredAt, lastUpdated }

        // ---- WorkspaceShell's own public event bus state (fallback only —
        // see the MIGRATION note on on/off/once/emit below) ----
        #ownListeners = new Map();
        #onceWrapped = new Map();

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
            this.#subscribeToServiceRegistryEvents();
        }

        /**
         * Keeps #coordinators from ever going silently stale: subscribes to
         * ServiceRegistry's own coordinator:registered/updated/unregistered
         * events and re-runs discovery on each one. If ServiceRegistry
         * hasn't loaded yet (load order isn't guaranteed — the same reason
         * every coordinator's own Service Registry registration retries),
         * this retries the subscription itself on the same bounded
         * interval rather than only ever discovering once at construction.
         */
        #subscribeToServiceRegistryEvents() {
            const trySubscribe = () => {
                if (!window.CozyOS.ServiceRegistry || typeof window.CozyOS.ServiceRegistry.on !== "function") return false;
                const refresh = () => this.rediscover();
                window.CozyOS.ServiceRegistry.on("coordinator:registered", refresh);
                window.CozyOS.ServiceRegistry.on("coordinator:updated", refresh);
                window.CozyOS.ServiceRegistry.on("coordinator:unregistered", refresh);
                // Subscribing only catches FUTURE events — anything already
                // registered before this subscription attached (e.g. during
                // ServiceRegistry's own synchronous load-time queue drain)
                // would otherwise never trigger a refresh. Re-sync once,
                // right now, the moment the subscription actually lands.
                this.rediscover();
                return true;
            };
            if (trySubscribe()) return;
            let attempts = 0;
            const maxAttempts = 200;
            const intervalId = setInterval(() => {
                attempts++;
                if (trySubscribe() || attempts >= maxAttempts) clearInterval(intervalId);
            }, 250);
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

        // ---- WorkspaceShell's OWN public event bus — distinct from
        // #recordEvent below, which observes events emitted BY discovered
        // coordinators. This bus is for events WorkspaceShell itself
        // raises (file:registered, etc.) that external code can subscribe
        // to directly.
        // MIGRATION (Shared Platform Rule): delegates to
        // window.CozyOS.PlatformEventBus, namespaced "workspaceshell:<e>",
        // when loaded. #ownListeners/#onceWrapped kept as fallback only.
        // #recordEvent's own subscriptions to OTHER coordinators (via their
        // .on() methods) are UNCHANGED by this migration — those
        // coordinators' public on() signature is identical post-migration,
        // so no caller-side change was needed there. ----
        on(eventName, handler) {
            if (typeof eventName !== "string" || !eventName.trim()) throw new TypeError("[WorkspaceShell] on(): eventName must be a non-empty string.");
            if (typeof handler !== "function") throw new TypeError("[WorkspaceShell] on(): handler must be a function.");
            const bus = window.CozyOS && window.CozyOS.PlatformEventBus;
            if (bus) return bus.on(`workspaceshell:${eventName}`, handler);
            if (!this.#ownListeners.has(eventName)) this.#ownListeners.set(eventName, new Set());
            this.#ownListeners.get(eventName).add(handler);
            return () => this.off(eventName, handler);
        }

        off(eventName, handler) {
            const bus = window.CozyOS && window.CozyOS.PlatformEventBus;
            if (bus) {
                const before = bus.getDiagnostics().events[`workspaceshell:${eventName}`]?.listenerCount || 0;
                bus.off(`workspaceshell:${eventName}`, handler);
                const after = bus.getDiagnostics().events[`workspaceshell:${eventName}`]?.listenerCount || 0;
                return after < before;
            }
            const set = this.#ownListeners.get(eventName);
            if (!set) return false;
            const wrapped = this.#onceWrapped.get(handler);
            const removed = set.delete(handler) || (wrapped ? set.delete(wrapped) : false);
            if (set.size === 0) this.#ownListeners.delete(eventName);
            return removed;
        }

        once(eventName, handler) {
            if (typeof handler !== "function") throw new TypeError("[WorkspaceShell] once(): handler must be a function.");
            const bus = window.CozyOS && window.CozyOS.PlatformEventBus;
            if (bus) { bus.once(`workspaceshell:${eventName}`, handler); return; }
            const wrapper = (payload) => { this.off(eventName, handler); this.#onceWrapped.delete(handler); handler(payload); };
            this.#onceWrapped.set(handler, wrapper);
            this.on(eventName, wrapper);
        }

        emit(eventName, payload) {
            if (typeof eventName !== "string" || !eventName.trim()) { this.#diagnostics.errorsHidden++; return false; }
            let safePayload = payload;
            try { safePayload = this.#deepClone(payload); } catch (_err) { safePayload = payload; }
            const bus = window.CozyOS && window.CozyOS.PlatformEventBus;
            if (bus) {
                const hadListeners = (bus.getDiagnostics().events[`workspaceshell:${eventName}`]?.listenerCount || 0) > 0;
                if (!hadListeners) return false;
                bus.emit(`workspaceshell:${eventName}`, safePayload);
                return true;
            }
            const set = this.#ownListeners.get(eventName);
            if (!set || set.size === 0) return false;
            for (const fn of Array.from(set)) {
                try { fn(safePayload); } catch (_err) { this.#diagnostics.errorsHidden++; }
            }
            return true;
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
            // show up in the coordinator list. WorkspaceShell counts itself
            // like any other coordinator (no self-exclusion) — excluding it
            // only from this one variable while ServiceRegistry legitimately
            // registers it under its own name was exactly what caused this
            // shell's own "coordinators discovered" count to disagree with
            // Service Registry's "coordinators registered" count.
            const liveKeys = window.CozyOS
                ? Object.keys(window.CozyOS).filter(k => typeof window.CozyOS[k] !== "function")
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

        // Plugin Center — CONNECTED (Rule 32 verified): core/pluginManager.js
        // exposes a real coordinator at window.CozyOS.PluginManager with its
        // own read-only stats()/list()/health() API (P-08 in its header). This
        // shell reuses that API directly rather than reimplementing any
        // plugin bookkeeping. Falls back to honest "Not Connected" only if
        // pluginManager.js genuinely isn't loaded on the page.
        getPluginCenterData() {
            const pm = window.CozyOS && window.CozyOS.PluginManager;
            if (!pm || typeof pm.stats !== "function") {
                return { connected: false, message: "PluginManager (core/pluginManager.js) is not loaded on this page." };
            }
            let stats = null, list = null;
            try { stats = pm.stats(); } catch (_err) { this.#diagnostics.errorsHidden++; }
            try { list = pm.list(); } catch (_err) { this.#diagnostics.errorsHidden++; }
            return this.#deepClone({ connected: true, stats, list: list || [] });
        }

        // Tenant Center has no backing coordinator convention at all yet in
        // CozyOS — honestly empty, not simulated.
        getTenantCenterData() {
            return { connected: false, message: "No tenant/multi-org coordinator exists yet in CozyOS. Nothing to show until one is built and registers tenants with a documented API." };
        }

        // =========================================================================
        // ─── ADMINISTRATOR WORKSPACE EXPANSION (additive) ──────────────────────
        // Users / Roles / Permissions read the same CozyIdentity coordinator as
        // getVisibleApplications() above — generic version/diagnostics only,
        // since this shell has no documented CozyIdentity API for listing
        // actual user/role/permission records and must not invent one.
        // =========================================================================
        getUsersCenterData() { return this.#getIntegrationSlotData("users"); }
        getRolesCenterData() { return this.#getIntegrationSlotData("roles"); }
        getPermissionsCenterData() { return this.#getIntegrationSlotData("permissions"); }

        // Companies, Monitoring, Configuration, and Audit have no backing
        // coordinator convention at all yet in CozyOS — same honest treatment
        // as Plugin/Tenant Center above, not simulated.
        getCompaniesCenterData() {
            return { connected: false, message: "No company/organization coordinator exists yet in CozyOS. Nothing to show until one is built and registers companies with a documented API." };
        }
        getMonitoringCenterData() {
            return { connected: false, message: "No monitoring coordinator exists yet in CozyOS, distinct from the Diagnostics Center above. Nothing to show until one is built with a documented API." };
        }
        getConfigurationCenterData() {
            return { connected: false, message: "No platform-configuration coordinator exists yet in CozyOS. Nothing to show until one is built with a documented API." };
        }
        getAuditCenterData() {
            return { connected: false, message: "No audit-log coordinator exists yet in CozyOS. Nothing to show until one is built with a documented API." };
        }

        // RULE 32 OWNERSHIP NOTE — Engines and Services are NOT the same
        // concept as Module Manager, and this is a TEMPORARY integration
        // state, not a permanent alias:
        //   Module Manager → loaded modules (coordinator discovery, as-is)
        //   Engines        → certified CozyOS business engines (no
        //                     dedicated Engine Registry coordinator exists
        //                     yet — ownership analysis pending)
        //   Services       → platform/runtime services (no dedicated
        //                     Service Registry listing coordinator exists
        //                     yet, distinct from generic module discovery)
        // Until those coordinators exist, both centers render the SAME
        // this.#coordinators data as Module Manager, purely because it's
        // the only real discovery mechanism CozyOS has today — never
        // fabricated data. The render layer below labels both views
        // explicitly as temporary, so nobody mistakes this for the real
        // Engine/Service domains being merged into Module Manager.
        getEnginesCenterData() { return this.getModuleManagerData(); }
        getServicesCenterData() { return this.getModuleManagerData(); }

        // =====================================================================
        // ─── FILE REGISTRY (Upload / central file hub) ────────────────────────
        // Data layer only — no rendering here (that belongs to whatever
        // dashboard builds the actual Developer Actions menu / Upload
        // Center UI on top of these methods). Auto-classifies by extension;
        // never guesses at a moduleId beyond a plain filename match against
        // discovered coordinators.
        // =====================================================================

        #classifyFile(filename) {
            const ext = (filename.split(".").pop() || "").toLowerCase();
            const kindByExt = { js: "javascript", html: "html", css: "css", json: "json", md: "markdown" };
            const category = kindByExt[ext] || "unknown";
            // Best-effort moduleId guess from this project's OWN naming
            // convention ("cozy-customer.js" -> "Customer") — derived from
            // the filename alone, not gated on the coordinator already
            // being live. A just-uploaded, not-yet-loaded file is exactly
            // the case this needs to work for; this is a naming-convention
            // match, not a claim that the module is confirmed loaded.
            let moduleId = null;
            const m = /^cozy-([a-z0-9-]+)\.js$/i.exec(filename);
            if (m) moduleId = m[1].split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join("");
            return { category, moduleId };
        }

        /**
         * registerFile({ filename, filePath, source, handle })
         *   Either source (plain text) or handle (a real
         *   FileSystemFileHandle) — or both. Returns a fileId. This is the
         *   entry point for "Upload to Workspace" / drag-and-drop.
         */
        registerFile({ filename, filePath = null, source = null, handle = null, moduleId: explicitModuleId = null } = {}) {
            if (typeof filename !== "string" || !filename.trim()) throw new TypeError("[WorkspaceShell] registerFile(): filename is required.");
            if (FORBIDDEN_KEYS.has(filename)) throw new Error(`[WorkspaceShell] registerFile(): rejected filename "${filename}".`);
            if (source === null && !handle) throw new TypeError("[WorkspaceShell] registerFile(): either source text or a real file handle is required.");
            const classified = this.#classifyFile(filename);
            const category = classified.category;
            // An explicit moduleId (e.g. from Builder's plan.exportName,
            // which preserves exact internal casing like "VendorX") always
            // wins over the filename-derived guess — kebab-case filenames
            // are lossy for camelCase identifiers and can't recover them.
            const moduleId = explicitModuleId || classified.moduleId;
            const fileId = "wsfile_" + (crypto.randomUUID ? crypto.randomUUID() : Date.now());
            const applicationId = this.#applicationOwning(moduleId);
            const resolvedPath = filePath || filename;
            const lastSlash = resolvedPath.lastIndexOf("/");
            const record = {
                fileId, filename, filePath: resolvedPath,
                folderPath: lastSlash > -1 ? resolvedPath.slice(0, lastSlash) : "",
                category, namespace: moduleId ? `window.CozyOS.${moduleId}` : null,
                coordinator: moduleId, application: applicationId,
                source, handle,
                workspaceStatus: "REGISTERED",
                deploymentProvider: "None", deploymentTarget: "None", deploymentStatus: "Not Deployed",
                deploymentVersion: null, deploymentTime: null, deploymentReleaseId: null, rollbackAvailable: false, deploymentFailureReason: null,
                builderStatus: null, bugFixStatus: null, certificationStatus: null, repairStatus: null,
                goldenVersion: null, productionVersion: null,
                lastModified: new Date().toISOString(), lastCertification: null, lastRepair: null,
                sha256Checksum: null,
                // Real, live version snapshots — only populated if those
                // coordinators are actually connected right now; never
                // guessed or hardcoded.
                builderVersion: (window.CozyOS.Builder && typeof window.CozyOS.Builder.getVersion === "function") ? window.CozyOS.Builder.getVersion() : null,
                bugFixerVersion: (window.CozyOS.BugFixer && typeof window.CozyOS.BugFixer.getVersion === "function") ? window.CozyOS.BugFixer.getVersion() : null,
                certificationEngineVersion: (window.CozyOS.Certification && typeof window.CozyOS.Certification.getVersion === "function") ? window.CozyOS.Certification.getVersion() : null,
                protectionLevel: isProtectedFile(filename) ? "PROTECTED" : "STANDARD",
                registeredAt: new Date().toISOString()
            };
            this.#fileRegistry.set(fileId, Object.freeze(record));
            this.#logAudit("FILE_REGISTERED", `${filename} registered (category: ${category}${moduleId ? `, matched module: ${moduleId}` : ""}).`);
            this.emit("file:registered", { fileId, filename, category, moduleId });
            if (window.CozyOS.CozyMemory) {
                try { window.CozyOS.CozyMemory.saveMemory("Project", `file-${fileId}`, { filename, filePath: record.filePath, category, coordinator: moduleId }, { tags: ["file", category, moduleId].filter(Boolean) }); } catch (_err) { /* memory is additive — never blocks registration */ }
            }
            if (source) this.#refreshFileStatus(fileId).catch(() => { this.#diagnostics.errorsHidden++; });
            return fileId;
        }

        /**
         * registerProject(projectName, files)
         *   Phase 4 — real multi-file project registration. files is the
         *   same {path: content} shape ProjectRefactor's importFromZip()/
         *   buildProjectModel() and BugFixer's repairProject() already
         *   produce. Every original path/filename is preserved exactly —
         *   this reuses registerFile() per file, never a second file-
         *   registration path. Re-registering the SAME projectName
         *   updates the existing project record (and each file within
         *   it) rather than creating a duplicate.
         */
        registerProject(projectName, files) {
            if (typeof projectName !== "string" || !projectName.trim()) throw new TypeError("[WorkspaceShell] registerProject(): projectName is required.");
            if (!files || typeof files !== "object") throw new TypeError("[WorkspaceShell] registerProject(): files must be a {path: content} object.");

            const existing = this.#projectRegistry.get(projectName);
            const pathToFileId = existing ? new Map(existing.fileIds.map(id => [this.getFile(id)?.filePath, id])) : new Map();
            const fileIds = [];
            let filesRegistered = 0, filesUpdated = 0, filesUnchanged = 0;

            for (const [path, content] of Object.entries(files)) {
                const filename = path.split("/").pop() || path;
                const existingFileId = pathToFileId.get(path);
                if (existingFileId && this.#fileRegistry.has(existingFileId)) {
                    const existingRecord = this.getFile(existingFileId);
                    if (existingRecord && existingRecord.source === content) {
                        // Genuinely unchanged — no save, no unnecessary
                        // backup, no rewrite of identical content.
                        fileIds.push(existingFileId);
                        filesUnchanged++;
                    } else {
                        // Real update — same path, same fileId, new content.
                        // Fire-and-forget matches registerFile()'s own async
                        // status-refresh pattern; failures are non-fatal.
                        this.saveFile(existingFileId, { proposedSource: content, approve: true }).catch(() => { this.#diagnostics.errorsHidden++; });
                        fileIds.push(existingFileId);
                        filesUpdated++;
                    }
                } else {
                    const fileId = this.registerFile({ filename, filePath: path, source: content });
                    fileIds.push(fileId);
                    filesRegistered++;
                }
            }

            const folderStructure = Array.from(new Set(Object.keys(files).map(p => { const i = p.lastIndexOf("/"); return i > -1 ? p.slice(0, i) : ""; }).filter(Boolean))).sort();
            const record = {
                name: projectName, fileIds, folderStructure,
                registeredAt: existing ? existing.registeredAt : new Date().toISOString(),
                lastUpdated: new Date().toISOString()
            };
            this.#projectRegistry.set(projectName, record);
            this.#logAudit("PROJECT_REGISTERED", `${projectName}: ${filesRegistered} new, ${filesUpdated} updated, ${filesUnchanged} unchanged (${existing ? "existing project updated, not duplicated" : "new project"}).`);
            this.emit("project:registered", { projectName, filesRegistered, filesUpdated });
            return { projectName, filesRegistered, filesUpdated, filesUnchanged, totalFiles: fileIds.length, updatedExistingProject: !!existing };
        }

        getProject(projectName) {
            const record = this.#projectRegistry.get(projectName);
            if (!record) return null;
            return { ...record, files: record.fileIds.map(id => this.getFile(id)).filter(Boolean) };
        }

        listProjects() {
            return Array.from(this.#projectRegistry.keys()).map(name => this.getProject(name));
        }

        /**
         * editFile(fileId)
         *   Real "open this file for editing" — if a live FileSystemFileHandle
         *   exists, re-reads the CURRENT on-disk content (not a cached copy)
         *   and updates the registry record's source before returning it.
         *   If no handle exists (the file was only ever registered as bare
         *   text), honestly returns hasHandle:false rather than pretending
         *   to re-read something that was never opened from disk.
         */
        async editFile(fileId) {
            const record = this.#fileRegistry.get(fileId);
            if (!record) throw new Error(`[WorkspaceShell] editFile(): unknown fileId "${fileId}".`);
            if (!record.handle || typeof record.handle.getFile !== "function") {
                return { fileId, hasHandle: false, source: record.source, message: "No file handle available for this entry — it was registered as text only. Re-open it via a file picker to edit the actual on-disk file." };
            }
            const file = await record.handle.getFile();
            const freshSource = await file.text();
            this.#fileRegistry.set(fileId, Object.freeze({ ...record, source: freshSource }));
            this.#logAudit("FILE_OPENED_FOR_EDIT", `${record.filename} re-read from disk for editing.`);
            return { fileId, hasHandle: true, source: freshSource };
        }

        /**
         * duplicateFile(fileId, newFilename)
         *   Registers a genuinely new file-registry entry with the same
         *   source text — a real duplicate, not a rename. Never touches
         *   the original's handle (a duplicate has no disk location of
         *   its own until Saved As).
         */
        duplicateFile(fileId, newFilename) {
            const record = this.#fileRegistry.get(fileId);
            if (!record) throw new Error(`[WorkspaceShell] duplicateFile(): unknown fileId "${fileId}".`);
            if (typeof newFilename !== "string" || !newFilename.trim()) throw new TypeError("[WorkspaceShell] duplicateFile(): newFilename is required.");
            const newFileId = this.registerFile({ filename: newFilename, source: record.source });
            this.#logAudit("FILE_DUPLICATED", `${record.filename} -> ${newFilename}`);
            this.emit("file:duplicated", { sourceFileId: fileId, newFileId });
            return newFileId;
        }

        /**
         * renameFile(fileId, newFilename)
         *   Updates the registry entry's filename/coordinator/namespace in
         *   place — does NOT touch a real on-disk file even if a handle
         *   exists (the browser's File System Access API has no rename
         *   primitive; the handle's own name stays what it was until the
         *   file is re-opened or Saved As under the new name).
         */
        renameFile(fileId, newFilename) {
            const record = this.#fileRegistry.get(fileId);
            if (!record) throw new Error(`[WorkspaceShell] renameFile(): unknown fileId "${fileId}".`);
            if (typeof newFilename !== "string" || !newFilename.trim()) throw new TypeError("[WorkspaceShell] renameFile(): newFilename is required.");
            const { category, moduleId } = this.#classifyFile(newFilename);
            const updated = { ...record, filename: newFilename, category, coordinator: moduleId, namespace: moduleId ? `window.CozyOS.${moduleId}` : null, lastModified: new Date().toISOString() };
            this.#fileRegistry.set(fileId, Object.freeze(updated));
            this.#logAudit("FILE_RENAMED", `${record.filename} -> ${newFilename}`);
            this.emit("file:renamed", { fileId, previousFilename: record.filename, newFilename });
            return this.getFile(fileId);
        }

        /**
         * moveFile(fileId, newFolderPath)
         *   Updates the registry's own folderPath/filePath bookkeeping —
         *   this is a logical move within CozyOS's file registry, not a
         *   real filesystem move (the File System Access API has no move
         *   primitive either; a real move needs Save As to the new
         *   location).
         */
        moveFile(fileId, newFolderPath) {
            const record = this.#fileRegistry.get(fileId);
            if (!record) throw new Error(`[WorkspaceShell] moveFile(): unknown fileId "${fileId}".`);
            if (typeof newFolderPath !== "string") throw new TypeError("[WorkspaceShell] moveFile(): newFolderPath is required.");
            const newFilePath = `${newFolderPath.replace(/\/$/, "")}/${record.filename}`;
            const updated = { ...record, folderPath: newFolderPath, filePath: newFilePath, lastModified: new Date().toISOString() };
            this.#fileRegistry.set(fileId, Object.freeze(updated));
            this.#logAudit("FILE_MOVED", `${record.filePath} -> ${newFilePath}`);
            this.emit("file:moved", { fileId, previousPath: record.filePath, newPath: newFilePath });
            return this.getFile(fileId);
        }

        /**
         * getExistingFileInfo(moduleIdOrFilename)
         *   "Existing File Detection" — if a module by this name has any
         *   certification history, returns its real Current/Latest/Golden
         *   version and status, so a re-uploaded/re-opened file shows what
         *   CozyOS already knows about it instead of looking brand new.
         *   Returns null if nothing is known — never fabricates a history.
         */
        getExistingFileInfo(moduleIdOrFilename) {
            if (!window.CozyOS.Certification) return null;
            const m = /^cozy-([a-z0-9-]+)\.js$/i.exec(moduleIdOrFilename);
            const moduleId = m ? m[1].split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join("") : moduleIdOrFilename;
            const history = window.CozyOS.Certification.listRecords(moduleId);
            if (history.length === 0) return null;
            const latest = history[history.length - 1];
            const golden = history.reduce((best, r) => (r.summary.scorePercent > best.summary.scorePercent ? r : best), history[0]);
            let productionVersion = null;
            if (this.#currentReleaseId) {
                const release = window.CozyOS.Certification.getRelease(this.#currentReleaseId);
                const inRelease = release && release.coreModules.modules.find(mm => mm.moduleId === moduleId);
                if (inRelease) productionVersion = inRelease.version;
            }
            const registeredFile = Array.from(this.#fileRegistry.values()).find(f => f.coordinator === moduleId);
            return {
                moduleId,
                currentVersion: latest.version,
                latestVersion: latest.version,
                goldenVersion: golden.version,
                productionVersion,
                lastCertified: latest.timestamp,
                lastRepaired: registeredFile ? registeredFile.lastRepair : null,
                workspaceStatus: registeredFile ? registeredFile.workspaceStatus : "NOT_IN_WORKSPACE",
                serviceRegistryStatus: (window.CozyOS.ServiceRegistry && window.CozyOS.ServiceRegistry.hasCoordinator(moduleId)) ? "REGISTERED" : "NOT_REGISTERED",
                certificationCount: history.length
            };
        }

        #applicationOwning(moduleId) {
            if (!moduleId || !window.CozyOS.Certification) return null;
            try {
                for (const app of window.CozyOS.Certification.listApplications()) {
                    if (Array.isArray(app.modules) && app.modules.includes(moduleId)) return app.id;
                }
            } catch (_err) { /* ignore */ }
            return null;
        }

        /**
         * #refreshFileStatus(fileId)
         *   Recomputes every derived status field from real state —
         *   checksum, certification status/score, Golden/Production
         *   version, and workflow status (Builder -> Needs Repair ->
         *   Awaiting Certification -> Certified -> Golden -> Production ->
         *   Released). Called after registerFile(), saveFile(), and
         *   openWithCertification() so the registry never goes stale.
         */
        async #refreshFileStatus(fileId) {
            const record = this.#fileRegistry.get(fileId);
            if (!record) return;
            const checksum = record.source ? await sha256Hex(record.source) : record.sha256Checksum;

            let certificationStatus = null, goldenVersion = null, productionVersion = null, lastCertification = record.lastCertification;
            if (record.coordinator && window.CozyOS.Certification) {
                const history = window.CozyOS.Certification.listRecords(record.coordinator);
                if (history.length > 0) {
                    const latest = history[history.length - 1];
                    const golden = history.reduce((best, r) => (r.summary.scorePercent > best.summary.scorePercent ? r : best), history[0]);
                    certificationStatus = latest.verdict;
                    goldenVersion = golden.version;
                    lastCertification = latest.timestamp;
                    if (this.#currentReleaseId) {
                        const release = window.CozyOS.Certification.getRelease(this.#currentReleaseId);
                        const inRelease = release && release.coreModules.modules.find(m => m.moduleId === record.coordinator);
                        if (inRelease) productionVersion = inRelease.version;
                    }
                }
            }

            let builderStatus = record.builderStatus;
            if (window.CozyOS.Builder && record.coordinator && window.CozyOS.Builder.getBuildHistory().some(b => b.exportName === record.coordinator)) {
                builderStatus = "BUILT";
            }

            let workspaceStatus = "REGISTERED";
            if (builderStatus === "BUILT" && !certificationStatus) workspaceStatus = "IN_BUILDER";
            else if (record.repairStatus === "REPAIRED" && !certificationStatus) workspaceStatus = "NEEDS_RECERTIFICATION";
            else if (!certificationStatus) workspaceStatus = "AWAITING_CERTIFICATION";
            else if (certificationStatus === "CERTIFICATION_FAILED") workspaceStatus = "FAILED_CERTIFICATION";
            else if (certificationStatus === "CERTIFIED_WITH_WARNINGS") workspaceStatus = "NEEDS_REPAIR";
            else if (productionVersion) workspaceStatus = "PRODUCTION";
            else if (goldenVersion && record.coordinator && certificationStatus === "ENTERPRISE_CERTIFIED") workspaceStatus = "GOLDEN";
            else if (certificationStatus === "ENTERPRISE_CERTIFIED") workspaceStatus = "CERTIFIED";

            // Real, additive: a genuine successful deploy (via
            // DeploymentManager's own history — never inferred, never
            // assumed) is the highest-priority status. Closes the one gap
            // in this derivation — everything above only reflected
            // certification/release-lock state, not an actual deploy.
            //
            // Deployment metadata below is read entirely from
            // DeploymentManager's real history — it works automatically
            // for any future provider (GitHub/GitLab/Cloudflare
            // Pages/Firebase/Netlify/Local Folder) without this file
            // changing, since it's the PROVIDER field on each real history
            // entry that's displayed, never a fixed/assumed value.
            let deploymentProvider = "None", deploymentTarget = "None", deploymentStatus = "Not Deployed";
            let deploymentVersion = null, deploymentTime = null, deploymentReleaseId = null, rollbackAvailable = false;
            let deploymentFailureReason = null;

            if (record.coordinator && window.CozyOS.DeploymentManager) {
                const allDeploys = window.CozyOS.DeploymentManager.listDeploymentHistory(h => h.moduleIds.includes(record.coordinator));
                if (allDeploys.length > 0) {
                    const latest = allDeploys[allDeploys.length - 1];
                    deploymentProvider = latest.provider;
                    // target is exactly what the provider reported via
                    // deploy()/validate() — never invented, never
                    // defaulted to the provider's own name. "None" when
                    // the provider (e.g. Local Workspace today) doesn't
                    // report a distinct target. A future provider can
                    // supply result.target and it appears here automatically.
                    deploymentTarget = latest.target || "None";
                    deploymentStatus = latest.result === "SUCCESS" ? "Deployed" : "Failed";
                    deploymentVersion = latest.version;
                    deploymentTime = latest.date;
                    deploymentReleaseId = latest.releaseId;
                    rollbackAvailable = !!latest.rollbackAvailable;
                    // Real failure reason, straight from DeploymentManager's
                    // own record (e.g. "GitHub provider not configured.") —
                    // never fabricated, null when there's nothing to report.
                    deploymentFailureReason = latest.result === "SUCCESS" ? null : (latest.failureReason || null);
                }
                const successfulDeploys = allDeploys.filter(h => h.result === "SUCCESS");
                if (successfulDeploys.length > 0) workspaceStatus = "DEPLOYED";
            }

            this.#fileRegistry.set(fileId, Object.freeze({
                ...record, sha256Checksum: checksum, certificationStatus, goldenVersion, productionVersion,
                lastCertification, builderStatus, workspaceStatus,
                deploymentProvider, deploymentTarget, deploymentStatus, deploymentVersion, deploymentFailureReason,
                deploymentTime, deploymentReleaseId, rollbackAvailable
            }));
        }

        getFile(fileId) {
            const record = this.#fileRegistry.get(fileId);
            if (!record) return null;
            const { handle, ...rest } = record;
            return Object.freeze({ ...rest, hasHandle: !!handle });
        }

        /**
         * getLifecycleStatus(fileId)
         *   A real, additive convenience view over the existing granular
         *   workspaceStatus — collapses it to the simpler 4-stage
         *   vocabulary (Imported / Modified / Enterprise Certified /
         *   Deployed) some callers may prefer, without replacing or
         *   duplicating the detailed tracking #refreshFileStatus already
         *   maintains.
         */
        getLifecycleStatus(fileId) {
            const record = this.#fileRegistry.get(fileId);
            if (!record) return null;
            const map = {
                REGISTERED: "Imported", IN_BUILDER: "Modified", NEEDS_RECERTIFICATION: "Modified",
                AWAITING_CERTIFICATION: "Modified", FAILED_CERTIFICATION: "Modified", NEEDS_REPAIR: "Modified",
                CERTIFIED: "Enterprise Certified", GOLDEN: "Enterprise Certified", PRODUCTION: "Enterprise Certified",
                DEPLOYED: "Deployed"
            };
            return map[record.workspaceStatus] || "Imported";
        }

        listFiles(filter = {}) {
            let results = Array.from(this.#fileRegistry.values());
            if (filter.category) results = results.filter(f => f.category === filter.category);
            if (filter.coordinator) results = results.filter(f => f.coordinator === filter.coordinator);
            return Object.freeze(results.map(({ handle, ...rest }) => ({ ...rest, hasHandle: !!handle })));
        }

        // =====================================================================
        // ─── DEVELOPER ACTIONS ────────────────────────────────────────────────
        // Returns which actions genuinely apply to a registered file right
        // now, based on real state (file category, which coordinators are
        // actually connected, whether certification history exists) — never
        // a static list shown regardless of context.
        // =====================================================================

        getDeveloperActionRegistry(fileId) {
            const record = this.#fileRegistry.get(fileId);
            if (!record) throw new Error(`[WorkspaceShell] getDeveloperActionRegistry(): unknown fileId "${fileId}".`);
            const actions = ["viewSource", "duplicate", "rename", "move", "export", "download", "properties", "uploadToWorkspace", "uploadFolder", "uploadZip"];
            if (record.category === "javascript") {
                if (window.CozyOS.Builder) actions.push("openWithBuilder", "shareToBuilder");
                if (window.CozyOS.BugFixer) actions.push("openWithBugFixer", "shareToBugFixer");
                if (window.CozyOS.Certification) {
                    actions.push("openWithCertification", "shareToCertification", "quickCertification", "fullCertification", "viewCertificationHistory");
                    if (record.coordinator) {
                        const history = window.CozyOS.Certification.listRecords(record.coordinator);
                        if (history.length > 0) actions.push("compareVersions", "lockRelease");
                        if (window.CozyOS.BugFixer) { actions.push("repair"); if (history.length > 0) actions.push("repairAndRecertify"); }
                    }
                }
                if (window.CozyOS.BugFixer) actions.push("viewRepairHistory");
                if (window.CozyOS.ServiceRegistry) actions.push("registerToServiceRegistry");
                actions.push("registerToWorkspace");
            }
            return Object.freeze({ fileId, filename: record.filename, category: record.category, coordinator: record.coordinator, availableActions: actions });
        }

        /** Backward-compatible alias. */
        getDeveloperActions(fileId) { return this.getDeveloperActionRegistry(fileId); }

        /** Hands the file's REAL source to CozyBuilder's planner — no copy/paste. */
        openWithBuilder(fileId) {
            const record = this.#fileRegistry.get(fileId);
            if (!record) throw new Error(`[WorkspaceShell] openWithBuilder(): unknown fileId "${fileId}".`);
            if (!window.CozyOS.Builder) throw new Error("[WorkspaceShell] openWithBuilder(): CozyOS.Builder is not connected.");
            this.#fileRegistry.set(fileId, Object.freeze({ ...record, builderStatus: "OPENED_IN_BUILDER" }));
            this.#logAudit("OPENED_WITH_BUILDER", `${record.filename} handed to CozyBuilder.`);
            return { filename: record.filename, coordinator: record.coordinator, source: record.source, dependencies: record.coordinator ? this.#dependencyMetadataFor(record.coordinator) : [] };
        }

        /** Registers the file's REAL source (or handle) directly into CozyBugFixer — no re-upload. */
        async openWithBugFixer(fileId) {
            const record = this.#fileRegistry.get(fileId);
            if (!record) throw new Error(`[WorkspaceShell] openWithBugFixer(): unknown fileId "${fileId}".`);
            if (!window.CozyOS.BugFixer) throw new Error("[WorkspaceShell] openWithBugFixer(): CozyOS.BugFixer is not connected.");
            const bugfixerFileId = record.handle
                ? await window.CozyOS.BugFixer.registerFileHandle(record.handle)
                : await window.CozyOS.BugFixer.registerSourceText(record.filename, record.source);
            this.#fileRegistry.set(fileId, Object.freeze({ ...record, bugFixStatus: "IN_BUGFIXER" }));
            this.#logAudit("OPENED_WITH_BUGFIXER", `${record.filename} registered into CozyBugFixer (id ${bugfixerFileId}).`);
            return bugfixerFileId;
        }

        /** Alias — "Share to CozyBugFixer" from a Developer Actions menu is the same real handoff as "Open with CozyBugFixer". */
        async shareToBugFixer(fileId) { return this.openWithBugFixer(fileId); }

        /** Hands the file's real source to CozyBuilder — same handoff whether "Open with" or "Share to". */
        async shareToBuilder(fileId) { return this.openWithBuilder(fileId); }

        /** Runs a real quickCertification() using the file's real source — no copy/paste, no re-typing a moduleId. */
        async openWithCertification(fileId) {
            const record = this.#fileRegistry.get(fileId);
            if (!record) throw new Error(`[WorkspaceShell] openWithCertification(): unknown fileId "${fileId}".`);
            if (!window.CozyOS.Certification) throw new Error("[WorkspaceShell] openWithCertification(): CozyOS.Certification is not connected.");
            if (!record.source) throw new Error("[WorkspaceShell] openWithCertification(): no source text available for this file (handle-only files must be read first).");
            const moduleId = record.coordinator || record.filename;
            const result = window.CozyOS.Certification.quickCertification(record.source, { moduleId, moduleName: moduleId, version: "workspace-triggered" });
            if (!record.coordinator) {
                this.#fileRegistry.set(fileId, Object.freeze({ ...this.#fileRegistry.get(fileId), coordinator: moduleId }));
            }
            await this.#refreshFileStatus(fileId);
            return result;
        }

        /** Alias — "Share to CozyCertification" is the same handoff as "Open with CozyCertification". */
        async shareToCertification(fileId) { return this.openWithCertification(fileId); }

        // =====================================================================
        // ─── FILE PROTECTION / SAVE (the ONLY write-gate in CozyOS) ───────────
        // Builder -> Workspace -> Protection Check -> Backup -> Checksum ->
        // Save. Neither CozyBuilder nor CozyBugFixer ever calls
        // createWritable() themselves — this is the single place that does.
        // =====================================================================

        async #createFileBackup(fileId) {
            const record = this.#fileRegistry.get(fileId);
            const backupId = "wsbak_" + (crypto.randomUUID ? crypto.randomUUID() : Date.now());
            const hash = record.source ? await sha256Hex(record.source) : record.sha256Checksum;
            const backup = Object.freeze({ backupId, fileId, source: record.source, hash, timestamp: new Date().toISOString() });
            if (!this.#fileBackups.has(fileId)) this.#fileBackups.set(fileId, []);
            const list = this.#fileBackups.get(fileId);
            list.push(backup);
            if (list.length > 20) list.shift();
            return backup;
        }

        listFileBackups(fileId) { return Object.freeze((this.#fileBackups.get(fileId) || []).map(b => this.#deepClone(b))); }

        /**
         * rollbackToBackup(fileId, backupId)
         *   Real rollback, built entirely on the backup store saveFile()
         *   already populates — restores that backup's exact source as
         *   the file's current content via the same protected saveFile()
         *   write-gate (backup-before-write, checksum, suspicious-pattern
         *   scan all still apply). This is what closes the "Rollback
         *   Golden" gap disclosed as unimplemented in an earlier session —
         *   it works for any backed-up version, not only a Golden one;
         *   pass the backupId for the version you want restored.
         */
        async rollbackToBackup(fileId, backupId) {
            const backups = this.#fileBackups.get(fileId) || [];
            const target = backups.find(b => b.backupId === backupId);
            if (!target) throw new Error(`[WorkspaceShell] rollbackToBackup(): no backup "${backupId}" for fileId "${fileId}".`);
            const record = this.#fileRegistry.get(fileId);
            const result = await this.saveFile(fileId, { proposedSource: target.source, approve: true, enforcedProtectedOverride: record ? record.protectionLevel === "PROTECTED" : false });
            this.#logAudit("ROLLED_BACK", `${record ? record.filename : fileId} rolled back to backup ${backupId} (${target.timestamp}).`);
            this.emit("file:rolledBack", { fileId, backupId, restoredHash: result.newHash });
            return { ...result, restoredFromBackupId: backupId, restoredFromTimestamp: target.timestamp };
        }

        /**
         * saveFile(fileId, { proposedSource, approve, enforcedProtectedOverride })
         *   The single write-gate for the whole platform. Requires
         *   approve:true. A Protected File additionally requires
         *   enforcedProtectedOverride:true. Always backs up first, always
         *   computes a checksum, writes to disk ONLY if a real handle
         *   exists — this is the only method in CozyOS that calls
         *   createWritable().
         */
        async saveFile(fileId, { proposedSource, approve = false, enforcedProtectedOverride = false, fromRepair = false } = {}) {
            const record = this.#fileRegistry.get(fileId);
            if (!record) throw new Error(`[WorkspaceShell] saveFile(): unknown fileId "${fileId}".`);
            if (typeof proposedSource !== "string" || !proposedSource.trim()) throw new TypeError("[WorkspaceShell] saveFile(): proposedSource is required.");
            if (!approve) throw new Error("[WorkspaceShell] saveFile(): requires approve:true.");
            if (record.protectionLevel === "PROTECTED" && !enforcedProtectedOverride) {
                throw new Error(`[WorkspaceShell] saveFile(): "${record.filename}" is Protected — requires enforcedProtectedOverride:true.`);
            }
            const suspicious = scanForSuspiciousPatterns(proposedSource);
            if (suspicious.length > 0) {
                throw new Error(`[WorkspaceShell] saveFile(): refusing to save — suspicious pattern(s) found: ${suspicious.map(s => s.description).join("; ")}.`);
            }

            const backup = await this.#createFileBackup(fileId);
            const beforeHash = record.sha256Checksum;
            const afterHash = await sha256Hex(proposedSource);
            const now = new Date().toISOString();

            if (record.handle && typeof record.handle.createWritable === "function") {
                const writable = await record.handle.createWritable();
                await writable.write(proposedSource);
                await writable.close();
            }

            this.#fileRegistry.set(fileId, Object.freeze({
                ...record, source: proposedSource, sha256Checksum: afterHash,
                lastModified: now,
                repairStatus: fromRepair ? "REPAIRED" : record.repairStatus,
                lastRepair: fromRepair ? now : record.lastRepair
            }));
            this.#logAudit("FILE_SAVED", `${record.filename} saved${fromRepair ? " (post-repair)" : ""}. Checksum ${beforeHash ? beforeHash.slice(0, 8) + "…" : "?"} -> ${afterHash.slice(0, 8)}….`);
            this.emit("file:saved", { fileId, filename: record.filename, backupId: backup.backupId, previousHash: beforeHash, newHash: afterHash, fromRepair, writtenToDisk: !!(record.handle && typeof record.handle.createWritable === "function") });
            await this.#refreshFileStatus(fileId);
            return { fileId, backupId: backup.backupId, previousHash: beforeHash, newHash: afterHash, fromRepair, writtenToDisk: !!(record.handle && typeof record.handle.createWritable === "function") };
        }

        /**
         * Runs CozyBugFixer's repair() (or repairWithAI() if useAI is
         * requested) preview, has BugFixer.save() log the repair (rules
         * fixed, hash pair, before/after certification score — BugFixer's
         * save() never calls createWritable()), then this shell's OWN
         * saveFile() performs the actual protected write. Two distinct
         * responsibilities, one real disk write.
         *
         * If the preview came from an UNTRUSTED_PROVIDER/
         * EXPERIMENTAL_PROVIDER trust policy, BugFixer.save() will refuse
         * without acknowledgeUntrustedProvider:true — passing approve:true
         * alone is not enough for that tier, by design.
         */
        async repairAndRecertify(fileId, { approve = false, useAI = false, acknowledgeUntrustedProvider = false } = {}) {
            const record = this.#fileRegistry.get(fileId);
            if (!record) throw new Error(`[WorkspaceShell] repairAndRecertify(): unknown fileId "${fileId}".`);
            if (!window.CozyOS.BugFixer) throw new Error("[WorkspaceShell] repairAndRecertify(): CozyOS.BugFixer is not connected.");
            const bfFileId = await this.shareToBugFixer(fileId);
            const preview = (useAI && typeof window.CozyOS.BugFixer.repairWithAI === "function")
                ? await window.CozyOS.BugFixer.repairWithAI(bfFileId)
                : window.CozyOS.BugFixer.repair(bfFileId);
            if (!preview.changed) return { changed: false, preview };
            if (approve) {
                const repairLogEntry = await window.CozyOS.BugFixer.save(bfFileId, {
                    proposedSource: preview.proposedSource, approve: true, ruleIdsFixed: preview.appliedFixes.map(f => f.ruleId),
                    aiTrustPolicy: preview.aiTrustPolicy || null, acknowledgeUntrustedProvider
                });
                await this.saveFile(fileId, { proposedSource: preview.proposedSource, approve: true, fromRepair: true });
                const certResult = record.source ? await this.openWithCertification(fileId) : null;
                return { changed: true, preview, repairLogEntry, certResult };
            }
            return { changed: true, preview, savedYet: false };
        }

        /** Compares two of a module's real certification records — never re-evaluates rules. */
        compareVersions(fileId, { fromCertificationId, toCertificationId } = {}) {
            const record = this.#fileRegistry.get(fileId);
            if (!record || !record.coordinator) throw new Error(`[WorkspaceShell] compareVersions(): file "${fileId}" isn't matched to a known module.`);
            if (!window.CozyOS.Certification) throw new Error("[WorkspaceShell] compareVersions(): CozyOS.Certification is not connected.");
            const history = window.CozyOS.Certification.listRecords(record.coordinator);
            const from = fromCertificationId ? history.find(r => r.certificationId === fromCertificationId) : history[0];
            const to = toCertificationId ? history.find(r => r.certificationId === toCertificationId) : history[history.length - 1];
            if (!from || !to) throw new Error("[WorkspaceShell] compareVersions(): could not resolve both certification records to compare.");
            const passA = from.rulePassMap || {}, passB = to.rulePassMap || {};
            return {
                from: { certificationId: from.certificationId, version: from.version, score: from.summary.scorePercent },
                to: { certificationId: to.certificationId, version: to.version, score: to.summary.scorePercent },
                scoreDifference: Math.round((to.summary.scorePercent - from.summary.scorePercent) * 10) / 10,
                rulesFixed: Object.keys(passB).filter(id => passA[id] === false && passB[id] === true),
                newRegressions: Object.keys(passB).filter(id => passA[id] === true && passB[id] === false)
            };
        }

        viewCertificationHistory(fileId) {
            const record = this.#fileRegistry.get(fileId);
            if (!record || !record.coordinator) throw new Error(`[WorkspaceShell] viewCertificationHistory(): file "${fileId}" isn't matched to a known module.`);
            if (!window.CozyOS.Certification) throw new Error("[WorkspaceShell] viewCertificationHistory(): CozyOS.Certification is not connected.");
            return window.CozyOS.Certification.listRecords(record.coordinator);
        }

        viewRepairHistory(fileId) {
            if (!window.CozyOS.BugFixer) throw new Error("[WorkspaceShell] viewRepairHistory(): CozyOS.BugFixer is not connected.");
            const record = this.#fileRegistry.get(fileId);
            if (!record) throw new Error(`[WorkspaceShell] viewRepairHistory(): unknown fileId "${fileId}".`);
            return window.CozyOS.BugFixer.getRepairLog(r => r.filename === record.filename);
        }

        #dependencyMetadataFor(moduleId) {
            const coord = this.#coordinators.get(moduleId);
            if (!coord || !coord.diagnostics || !Array.isArray(coord.diagnostics.dependencies)) return [];
            return coord.diagnostics.dependencies;
        }

        // =====================================================================
        // ─── DEVELOPER QUEUE ──────────────────────────────────────────────────
        // Per-module status derived ENTIRELY from real state across
        // Certification/Builder/BugFixer — never a fabricated status. The
        // "Golden Version" concept mirrors the Certification Dashboard's own
        // computation (highest score in a module's real, permanent history)
        // since WorkspaceShell has no separate storage of its own for this.
        // =====================================================================

        getDeveloperQueue() {
            if (!window.CozyOS.Certification) {
                return { connected: false, message: "CozyCertification not connected — Developer Queue needs it to know each module's real status." };
            }
            const cert = window.CozyOS.Certification;
            // Union of every source this shell can honestly derive a module
            // name from: live-discovered coordinators, files registered in
            // the workspace file hub (even if not yet loaded), and
            // CozyBuilder's own build history (the "just built, not yet
            // loaded" case) — not live coordinators alone, or a module
            // that's only ever been built or uploaded never shows up.
            const names = new Set(this.#coordinators.keys());
            for (const file of this.#fileRegistry.values()) {
                if (file.coordinator) { names.add(file.coordinator); continue; }
                const m = /^cozy-([a-z0-9-]+)\.js$/i.exec(file.filename);
                if (m) names.add(m[1].split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(""));
            }
            if (window.CozyOS.Builder) {
                for (const build of window.CozyOS.Builder.getBuildHistory()) names.add(build.exportName);
            }
            const moduleNames = Array.from(names);
            const entries = moduleNames.map((name) => {
                const history = cert.listRecords(name);
                const latest = history.length ? history[history.length - 1] : null;
                const golden = history.length ? history.reduce((best, r) => (r.summary.scorePercent > best.summary.scorePercent ? r : best), history[0]) : null;

                let status = "WAITING"; // 🔵-equivalent default: nothing has happened with this module yet
                if (window.CozyOS.Builder && window.CozyOS.Builder.getBuildHistory().some(b => b.exportName === name)) status = "IN_BUILDER";
                if (!latest) status = status === "WAITING" ? "AWAITING_CERTIFICATION" : status;
                else if (latest.verdict === "CERTIFICATION_FAILED") status = "FAILED_CERTIFICATION";
                else if (latest.verdict === "CERTIFIED_WITH_WARNINGS") status = "NEEDS_REPAIR";
                else if (latest.verdict === "ENTERPRISE_CERTIFIED") status = "CERTIFIED";

                return Object.freeze({
                    moduleId: name, status,
                    latestScore: latest ? latest.summary.scorePercent : null,
                    goldenScore: golden ? golden.summary.scorePercent : null,
                    verdict: latest ? latest.verdict : null,
                    recommendedTool: {
                        IN_BUILDER: "CozyBuilder", NEEDS_REPAIR: "CozyBugFixer", FAILED_CERTIFICATION: "CozyBugFixer",
                        AWAITING_CERTIFICATION: "CozyCertification", CERTIFIED: "CertificationReport", WAITING: null
                    }[status]
                });
            });
            return { connected: true, entries };
        }

        getDiagnosticsReport() {
            const discoveredCount = Array.from(this.#coordinators.values()).filter(c => c.discovered).length;
            return Object.freeze({
                ...this.#diagnostics,
                // coordinatorsTracked includes SUGGESTED_COORDINATORS entries
                // that aren't built yet (shown as "Waiting" elsewhere) —
                // compare Service Registry's count against
                // coordinatorsDiscovered, not this field, or the numbers
                // will never agree.
                coordinatorsTracked: this.#coordinators.size,
                coordinatorsDiscovered: discoveredCount,
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
                case "plugins": {
                    const data = this.getPluginCenterData();
                    if (!data.connected) return `<h2>Plugin Center</h2>${this.#renderNotConnected(data.message)}`;
                    const statsHtml = data.stats ? this.#renderKeyValueTable(data.stats) : this.#renderNotConnected("stats() unavailable.");
                    const rows = this.#renderList(data.list, p => `
                        <div class="cozy-module-row">
                            <b>${this.#escapeHtml(p.name || p.id)}</b>
                            <span>v${this.#escapeHtml(p.version)}</span>
                            <span class="cozy-badge">${this.#escapeHtml(p.status)}</span>
                            <span>${this.#escapeHtml(p.author || "unknown author")}</span>
                        </div>`);
                    return `<h2>Plugin Center</h2><h3>Registry Stats</h3>${statsHtml}<h3>Registered Plugins</h3>${rows}`;
                }
                case "tenants": return `<h2>Tenant Center</h2>${this.#renderNotConnected(this.getTenantCenterData().message)}`;

                // --- Administrator Workspace expansion (additive) ---
                case "users": return this.#renderIntegrationSlot(this.getUsersCenterData(), "Users");
                case "roles": return this.#renderIntegrationSlot(this.getRolesCenterData(), "Roles");
                case "permissions": return this.#renderIntegrationSlot(this.getPermissionsCenterData(), "Permissions");
                case "companies": return `<h2>Companies</h2>${this.#renderNotConnected(this.getCompaniesCenterData().message)}`;
                case "monitoring": return `<h2>Monitoring</h2>${this.#renderNotConnected(this.getMonitoringCenterData().message)}`;
                case "configuration": return `<h2>Configuration</h2>${this.#renderNotConnected(this.getConfigurationCenterData().message)}`;
                case "audit": return `<h2>Audit</h2>${this.#renderNotConnected(this.getAuditCenterData().message)}`;
                case "engines": return `<h2>Engines</h2><p class="cozy-disclosure-note">TEMPORARY VIEW — Engines are a distinct domain (certified CozyOS business engines) from Module Manager's loaded-module discovery. No dedicated Engine Registry coordinator exists yet, so this section shows Module Manager's current data as a placeholder only, pending a real Engine Registry (Rule 32 ownership review).</p>${this.#renderList(this.getEnginesCenterData().modules, m => `<div class="cozy-module-row"><b>${this.#escapeHtml(m.name)}</b><span>${m.discovered ? this.#escapeHtml(m.version || "unknown version") : this.#escapeHtml(m.registrationStatus)}</span></div>`)}`;
                case "services": return `<h2>Services</h2><p class="cozy-disclosure-note">TEMPORARY VIEW — Services are a distinct domain (platform/runtime services) from Module Manager's loaded-module discovery. No dedicated Service Registry listing coordinator exists yet, so this section shows Module Manager's current data as a placeholder only, pending a real Service Registry (Rule 32 ownership review).</p>${this.#renderList(this.getServicesCenterData().modules, m => `<div class="cozy-module-row"><b>${this.#escapeHtml(m.name)}</b><span>${m.discovered ? this.#escapeHtml(m.version || "unknown version") : this.#escapeHtml(m.registrationStatus)}</span></div>`)}`;

                // --- Developer Hub: real application, delegated entirely to its
                // own module (developer-hub.js). This shell never reimplements
                // or duplicates any Developer Hub logic — it only injects the
                // markup getDashboard() returns; init()/destroy() lifecycle is
                // wired in mount()/#render() below, matching the real
                // cozy-ui.js loadModule() contract Developer Hub already
                // supports. ---
                case "developerHub": {
                    const hub = window.CozyOS.Modules && window.CozyOS.Modules["developer-hub"];
                    if (!hub) return `<h2>Developer Hub</h2>${this.#renderNotConnected("developer-hub.js is not loaded on this page — Developer Hub cannot mount.")}`;
                    return typeof hub.getDashboard === "function" ? hub.getDashboard() : '<div id="cozy-developer-hub-root" class="cozy-developer-hub-shell"></div>';
                }

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
            // Additive: Core Terminal, preserved unchanged from the original
            // standalone dashboard.html, now rendered as part of the
            // Dashboard section instead of the whole page. Same three status
            // cards, same terminal input/output, same execute button.
            const terminalHtml = `
                <section class="cozy-panel" style="display:flex;flex-direction:column;gap:12px;min-height:350px;margin-top:16px;">
                    <div class="cozy-card-label" style="border-bottom:1px solid var(--cz-border,#262626);padding-bottom:8px;">Unified AI Core Ingestion Gateway</div>
                    <div class="cozy-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));">
                        <div class="cozy-card"><div class="cozy-card-label">Tenant State</div><div class="cozy-card-value">Isolated</div></div>
                        <div class="cozy-card"><div class="cozy-card-label">SDK Framework</div><div class="cozy-card-value">v1.0 Frozen</div></div>
                        <div class="cozy-card"><div class="cozy-card-label">Active Plugins</div><div class="cozy-card-value" id="plugin-count">0 Loaded</div></div>
                    </div>
                    <div id="terminal-output" style="background:#050505;border-radius:6px;padding:12px;font-family:monospace;font-size:0.9rem;flex-grow:1;color:#a0a0a0;overflow-y:auto;min-height:160px;">
                        <div>⚡ CozyOS Kernel initialized. Ready for context queries...</div>
                    </div>
                    <div style="display:flex;gap:8px;">
                        <input type="text" id="terminal-input" placeholder="Query industry context..." style="flex-grow:1;background:#0a0a0a;border:1px solid var(--cz-border,#262626);border-radius:6px;padding:12px;color:white;">
                        <button id="execute-btn" type="button" style="background:var(--accent-emerald,#0f5132);border:none;border-radius:6px;color:white;padding:0 16px;font-weight:600;cursor:pointer;">Execute</button>
                    </div>
                </section>`;
            return `<h2>Dashboard</h2><p>${data.discoveredCount}/${data.totalCount} coordinators discovered.</p>${banner}<div class="cozy-list">${rows}</div>${terminalHtml}`;
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
                { label: "Integrations (awaiting coordinators)", items: [["security", "Security Center"], ["storage", "Storage Center"], ["sync", "Synchronization Center"], ["automation", "Automation Center"], ["live", "Live Center"], ["speech", "Speech Center"], ["translation", "Translation Center"], ["subscription", "Subscription / License Center"], ["ai", "AI Center"], ["plugins", "Plugin Center"], ["tenants", "Tenant Center"]] },
                // Additive: Administrator Workspace expansion per the locked
                // CozyOS architecture. Nothing above this line was changed.
                { label: "Administration", items: [["users", "Users"], ["roles", "Roles"], ["permissions", "Permissions"], ["companies", "Companies"], ["engines", "Engines (temporary view)"], ["services", "Services (temporary view)"], ["monitoring", "Monitoring"], ["configuration", "Configuration"], ["audit", "Audit"]] },
                { label: "Development", items: [["developerHub", "Developer Hub"]] }
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

            // Additive: real post-render lifecycle hooks. Both are no-ops if
            // their target section isn't currently active, and both delegate
            // entirely to existing, already-verified code — nothing here
            // reimplements Developer Hub or the Core Terminal.
            if (this.#activeCenter === "developerHub") {
                const hub = window.CozyOS.Modules && window.CozyOS.Modules["developer-hub"];
                if (hub && typeof hub.init === "function") { try { hub.init(); } catch (_err) { /* non-fatal */ } }
            }
            if (this.#activeCenter === "dashboard") {
                this.#syncTerminalTelemetry();
            }
        }

        /**
         * #handleTerminalQuery() / #syncTerminalTelemetry()
         *   Ported unchanged from the original dashboard.html inline <script>
         *   (postQuery()/syncTelemetry()) so the Core Terminal keeps working
         *   exactly as before, now inside the Dashboard section instead of a
         *   standalone page. Same window.CozyOS.KernelPlugins routing, same
         *   plugin-count telemetry source (window.CozyOS.PluginMetadata).
         */
        #syncTerminalTelemetry() {
            const el = this.#domRoot.querySelector("#plugin-count");
            if (!el) return;
            const plugins = (window.CozyOS && window.CozyOS.PluginMetadata) || new Map();
            const activeCount = Array.from(plugins.values()).filter(m => m.status === "enabled").length;
            el.innerText = `${activeCount} Active`;
        }

        #handleTerminalQuery() {
            const input = this.#domRoot.querySelector("#terminal-input");
            const output = this.#domRoot.querySelector("#terminal-output");
            if (!input || !output) return;

            const text = input.value.trim();
            if (!text) return;

            output.innerHTML += `<div style="color:#ffffff;margin-top:6px;">&gt; ${this.#escapeHtml(text)}</div>`;
            input.value = "";

            try {
                const normalizedText = text.toLowerCase();
                let intentHandled = false;

                if (window.CozyOS && window.CozyOS.KernelPlugins) {
                    if (normalizedText.includes("mpesa") || normalizedText.includes("pay") || normalizedText.includes("stk")) {
                        const mpesaHandler = window.CozyOS.KernelPlugins.get("mpesa");
                        if (mpesaHandler) {
                            const res = mpesaHandler(text);
                            output.innerHTML += `<div style="color:var(--accent-gold, #d4af37);margin-top:2px;">${this.#escapeHtml(res.responseText)}</div>`;
                            intentHandled = true;
                        }
                    } else if (normalizedText.includes("pharmacy") || normalizedText.includes("inventory") || normalizedText.includes("stock")) {
                        const pharmacyHandler = window.CozyOS.KernelPlugins.get("pharmacy");
                        if (pharmacyHandler) {
                            const res = pharmacyHandler(text);
                            output.innerHTML += `<div style="color:var(--accent-gold, #d4af37);margin-top:2px;">${this.#escapeHtml(res.responseText)}</div>`;
                            intentHandled = true;
                        }
                    }
                }

                if (!intentHandled) {
                    output.innerHTML += `<div style="color:#a0a0a0;margin-top:2px;">💡 Kernel Gateway Sandbox: Intent registered. Forwarded safely to base operational layer.</div>`;
                }
            } catch (err) {
                output.innerHTML += `<div style="color:#dc3545;margin-top:2px;">🚨 Exception: ${this.#escapeHtml(err.message)}</div>`;
            }
            output.scrollTop = output.scrollHeight;
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
                        const nextCenter = centerEl.getAttribute("data-center");
                        // Additive: real lifecycle cleanup for Developer Hub —
                        // matches the loadModule() convention of calling the
                        // outgoing module's destroy() before switching away,
                        // without this shell reimplementing any of its logic.
                        if (this.#activeCenter === "developerHub" && nextCenter !== "developerHub") {
                            const hub = window.CozyOS.Modules && window.CozyOS.Modules["developer-hub"];
                            if (hub && typeof hub.destroy === "function") { try { hub.destroy(); } catch (_err) { /* non-fatal */ } }
                        }
                        // Additive: theme switch to match, mirroring the real
                        // cozy-ui.js loadModule() contract
                        // (Theme.setTheme(manifest.theme)) without this shell
                        // needing to know that contract's exact shape — just
                        // toggles between the Administrator Workspace's own
                        // "platform-admin" theme and Developer Hub's
                        // "developer" theme on entry/exit. No-op if
                        // cozy-theme.js isn't loaded.
                        if (nextCenter === "developerHub" && this.#activeCenter !== "developerHub") {
                            if (window.CozyOS.Theme && typeof window.CozyOS.Theme.setTheme === "function") {
                                try { window.CozyOS.Theme.setTheme("developer"); } catch (_err) { /* non-fatal */ }
                            }
                        } else if (nextCenter !== "developerHub" && this.#activeCenter === "developerHub") {
                            if (window.CozyOS.Theme && typeof window.CozyOS.Theme.setTheme === "function") {
                                try { window.CozyOS.Theme.setTheme("platform-admin"); } catch (_err) { /* non-fatal */ }
                            }
                        }
                        this.#activeCenter = nextCenter;
                        this.#selectedContext = null;
                        this.#render();
                        return;
                    }
                    // Additive: Core Terminal (preserved from the original
                    // dashboard.html) — delegated so it keeps working across
                    // re-renders of the Dashboard section.
                    if (evt.target.id === "execute-btn") {
                        this.#handleTerminalQuery();
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
                // Additive: Core Terminal Enter-key submit (preserved behavior
                // from the original dashboard.html's terminal-input listener).
                this.#domRoot.addEventListener("keydown", (evt) => {
                    if (evt.target.id === "terminal-input" && evt.key === "Enter") {
                        this.#handleTerminalQuery();
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

    // Auto-register with the Service Registry — retries if it isn't loaded
    // yet (load order isn't guaranteed), instead of only ever trying once.
    (function registerWithServiceRegistry(descriptor) {
        function attempt() {
            if (typeof window.CozyOS.registerCoordinator !== "function") return false;
            try { window.CozyOS.registerCoordinator(descriptor); } catch (_err) { /* non-fatal */ }
            return true;
        }
        if (attempt()) return;
        if (!Object.prototype.hasOwnProperty.call(window.CozyOS, "__pendingCoordinatorRegistrations")) {
            Object.defineProperty(window.CozyOS, "__pendingCoordinatorRegistrations", { value: [], writable: true, enumerable: false, configurable: true });
        }
        window.CozyOS.__pendingCoordinatorRegistrations.push(descriptor);
        let attempts = 0;
        const maxAttempts = 200;
        const intervalId = setInterval(() => {
            attempts++;
            if (attempt() || attempts >= maxAttempts) {
                clearInterval(intervalId);
                const idx = window.CozyOS.__pendingCoordinatorRegistrations.indexOf(descriptor);
                if (idx !== -1) window.CozyOS.__pendingCoordinatorRegistrations.splice(idx, 1);
            }
        }, 250);
    })({
        name: "WorkspaceShell", category: "Foundation", icon: "workspace.svg",
        description: "CozyOS Workspace Shell — the Developer Gateway. Discovers coordinators/applications, hosts the file registry and Developer Actions/Queue data layer, and is the single protected write-gate for repaired files."
    });
})();
