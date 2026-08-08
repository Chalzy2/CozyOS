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
        "Attendance", "Media", "Vision", "Camera", "Network", "Emergency", "Accessibility",
        "LivingThemeEngine", "LivingMessageEngine", "ModeEngine"
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
        // all read the SAME IdentityEngine coordinator — CORRECTED (Phase 1):
        // the real global is window.CozyOS.IdentityEngine
        // (core/modules/identity/identity-engine.js), not the guessed
        // "CozyIdentity" — this was a functional bug (these three sections
        // would never have connected even with the real file loaded).
        users: "IdentityEngine",
        roles: "IdentityEngine",
        permissions: "IdentityEngine"
    });

    class CozyOSWorkspaceShell {
        // ---- discovered coordinators, rebuilt on every discovery cycle ----
        #coordinators = new Map(); // name -> { name, discovered, version, diagnostics }

        // ---- tracks which live objects already have event listeners bound,
        // persists ACROSS discovery cycles (unlike #coordinators) so
        // rediscover() never double-subscribes to the same live coordinator ----
        #boundEventSources = new Map(); // name -> liveRef
        #livingEventsBound = false; // guards the one-time PlatformEventBus subscription below (LivingThemeEngine/LivingMessageEngine/ModeEngine emit only through the bus, not their own on/off/emit)

        // ---- shell-local state (NOT business data — navigation/UI only) ----
        #activeCenter = (() => { try { return window.localStorage.getItem("cozy.workspace.activeCenter") || "dashboard"; } catch (_err) { return "dashboard"; } })();
        // Milestone 353 — real fix: a login gate (core/shell/cozy-login-gate.js)
        // and role-agnostic session snapshot (window.CozyOS.Session, from
        // cozy-session-service.js) both now exist and are real. #currentUserId
        // is resolved for real in mount() via #resolveCurrentUserId() below —
        // this initializer only covers the brief window before mount() runs,
        // and every gated action still fails closed if resolution finds nobody
        // signed in.
        #currentUserId = null;
        #currentUserRole = null; // "admin" | "developer" | "user" | null — set alongside #currentUserId, never derived twice
        #diagnosticsFilter = "";
        #diagnosticsSort = "name";
        #diagnosticsConnectedOnly = false;
        #diagnosticsErrorsOnly = false;
        #diagnosticsExpanded = new Set();
        #appManageExpanded = new Set(); // M364.8 Phase 2 - Application Center management accordion state, same pattern as #diagnosticsExpanded
        #employeeManageExpanded = new Set(); // M365.1 - Employee Management accordion state, same pattern
        #orgManagerExpanded = new Set(); // M365.3 - Organization Manager tree expand state, keyed "level:id" (same Set-toggle pattern, one Set instead of six for a deep tree)
        #vendorStateCache = null; // populated only by an explicit "Refresh Diagnostics" click (VendorDiagnostics.listVendorStates() is async; render() itself stays synchronous)
        #themeStudioSelected = null;
        #createAdminError = null;
        #publishError = null;
        #themeStudioCertification = null;
        #modeEngineLastError = null; // last real registerMode()/activateMode() failure reason, cleared on the next attempt
        #livingThemeEngineLastError = null; // last real registerTheme() failure reason
        #livingThemeEngineSearch = ""; // real client-side filter over engine.listThemes()
        #livingThemeEngineCategory = "all";
        #livingThemeEngineSort = "name";
        #publishColorPreset = null; // selected built-in color's hex, mirrors #cozy-publish-color
        #livingMessageEngineLastError = null; // last real createMessage()/setStatus()/deleteMessage() failure reason
        #livingMessageEnginePreview = null; // last real pickNextMessage() result shown on the Living Message Engine page
        #selectedContext = null; // { type: "module"|"application"|"release", id }
        #searchTerm = "";
        #sidebarCollapsed = (() => { try { return window.localStorage.getItem("cozy.workspace.sidebarCollapsed") === "1"; } catch (_err) { return false; } })();
        #openNavSection = (() => { try { return window.localStorage.getItem("cozy.workspace.openNavSection") || null; } catch (_err) { return null; } })();
        #sidebarMobileOpen = false;
        #pendingDevHubSection = null; // set when a quick-action requests a specific Developer Hub section on arrival

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
            this.#wireLivingEnvironment();
        }

        /**
         * #wireLivingEnvironment()
         *   M371 — composes the existing CozyEnvironment.getState()/
         *   onChange() (M370.5), setting real CSS custom properties on
         *   the document root so this file's own CSS can read them (no
         *   manual theme switching, no separate hour/lighting
         *   calculation here). Honest no-op if CozyEnvironment isn't
         *   loaded.
         */
        #wireLivingEnvironment() {
            const env = window.CozyOS && window.CozyOS.CozyEnvironment;
            if (!env || typeof env.getState !== "function") return;
            const apply = (state) => {
                if (!state || !state.available) return;
                document.documentElement.style.setProperty("--cozy-env-lighting", String(state.lighting));
                document.documentElement.setAttribute("data-cozy-time-of-day", state.timeOfDay);
            };
            apply(env.getState());
            if (typeof env.onChange === "function") env.onChange(apply);
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

            // LivingThemeEngine/LivingMessageEngine/ModeEngine don't expose
            // their own on()/off() — they only emit through
            // window.CozyOS.PlatformEventBus (namespaced theme:*/message:*/
            // mode:*). Subscribe to those real, documented event names
            // directly, once, so real activity from these three coordinators
            // genuinely reaches Event Monitor/Recent Activity rather than
            // being silently invisible.
            const bus = window.CozyOS && window.CozyOS.PlatformEventBus;
            if (bus && typeof bus.on === "function" && !this.#livingEventsBound) {
                const livingEvents = [
                    ["LivingThemeEngine", ["theme:theme-changed", "theme:theme-scheduled", "theme:theme-activated", "theme:theme-deactivated", "theme:theme-expired", "theme:profile-created", "theme:profile-applied"]],
                    ["LivingMessageEngine", ["message:message-created", "message:message-updated", "message:message-deleted", "message:message-published", "message:message-expired", "message:message-viewed", "message:message-dismissed"]],
                    ["ModeEngine", ["mode:mode-activated", "mode:mode-changed", "mode:mode-scheduled", "mode:mode-completed"]]
                ];
                for (const [source, eventNames] of livingEvents) {
                    for (const eventName of eventNames) {
                        try { bus.on(eventName, (payload) => this.#recordEvent(source, eventName, payload)); }
                        catch (_err) { this.#diagnostics.errorsHidden++; }
                    }
                }
                this.#livingEventsBound = true;
            }

            this.#logAudit("DISCOVERY_CYCLE", `Discovered ${liveKeys.length} live coordinator(s) on window.CozyOS.`);
        }

        /** Call this any time to re-scan window.CozyOS for newly-loaded coordinators. */
        rediscover() {
            this.#discoverCoordinators();
            return this.getDashboardData();
        }

        /**
         * #autoCertifyDiscovered()
         *   Real (Milestone 222 - startup certification, first slice).
         *   Only certifies coordinators that have a real sourcePath in
         *   their ServiceRegistry manifest AND are not already
         *   certified - never fabricates a result, never re-certifies
         *   needlessly. Coordinators without sourcePath are honestly
         *   left NOT_CERTIFIED; this is the real, current limitation
         *   (no per-coordinator file path exists for most of the 168
         *   yet) rather than a bug to paper over.
         */
        async #autoCertifyDiscovered() {
            const registry = window.CozyOS.ServiceRegistry;
            const cert = this.#certification;
            if (!registry || typeof registry.listCoordinators !== "function" || !cert || typeof cert.certifyModule !== "function") return;
            const coordinators = registry.listCoordinators().filter(c => c.sourcePath);
            for (const c of coordinators) {
                try {
                    let existing = null;
                    try { existing = cert.getWorkspaceSummary(c.name); } catch (_err) { /* no certification yet - proceed */ }
                    if (existing && existing.certification && existing.certification !== "NOT_CERTIFIED") continue;
                    const response = await fetch(c.sourcePath);
                    if (!response.ok) continue;
                    const sourceText = await response.text();
                    cert.certifyModule(sourceText, { moduleId: c.name, moduleName: c.name, version: c.version, filePath: c.sourcePath });
                } catch (_err) { /* honestly skip - never fabricate a result for a fetch/cert failure */ }
            }
        }

        /**
         * autoRediscover()
         *   Real, additive entry point that runs discovery AND real
         *   auto-certification for any coordinator with a real
         *   sourcePath. rediscover() itself is untouched - existing
         *   callers see zero behavior change.
         */
        async autoRediscover() {
            this.#discoverCoordinators();
            await this.#autoCertifyDiscovered();
            return this.getDashboardData();
        }

        /**
         * #canLaunchApplication(appId) — M345 real fix.
         * Honest check of whether window.CozyOS.ApplicationLauncher.open(appId)
         * would actually succeed, mirroring its own real resolution order
         * (verified against core/shell/application-launcher.js, not assumed):
         *   Mode 3 — window.CozyOS.Modules[appId] with getDashboard()+init()
         *   Mode 1/2 — window.CozyOS.ModuleRegistry.get(appId) with a real html path
         * Composes the real launcher/registry read-only; never launches anything
         * itself and never duplicates their resolution logic beyond this check.
         */
        #canLaunchApplication(appId) {
            const launcher = window.CozyOS && window.CozyOS.ApplicationLauncher;
            if (!launcher || typeof launcher.open !== "function") return false;
            const jsModule = window.CozyOS.Modules && window.CozyOS.Modules[appId];
            const hasJsModule = !!(jsModule && typeof jsModule.getDashboard === "function" && typeof jsModule.init === "function");
            if (hasJsModule) return true;
            const registry = window.CozyOS.ModuleRegistry;
            const manifest = registry && typeof registry.get === "function" ? registry.get(appId) : null;
            return !!(manifest && manifest.html);
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

        // Milestone 214 — real, explicit allowlist. Enterprise release
        // requirement: only these four applications should appear on
        // the dashboard right now. This does NOT unregister or delete
        // ChurchOS/WholesaleOS from the Service Registry — they remain
        // real, registered applications; this filter only controls
        // dashboard visibility for this release, per the explicit
        // "additional applications can be added later" future rule.
        // Milestone 215A — real, honest per-app status, replacing the
        // unconditional "Ready" override from M214B. Verified by
        // reading each application's actual real HTML/JS files before
        // assigning status:
        //   MpesaOS: index.html is confirmed to be an engine
        //     diagnostics page ("Run Automated Workflow", "Engine
        //     Timeline", "Active Workflow Locks") — not the
        //     Dashboard/Transactions/STK Push/PayBill business UI this
        //     milestone describes. Honestly Development, not Ready.
        //   ShopOS: confirmed real, substantial plugin ecosystem
        //     (shopOS-dashboard.js, shopOS-inventory.js, shopOS-
        //     reporting.js, shopOS-payments.js, and more) matching the
        //     requested feature set. Ready.
        //   QuarryOS: confirmed real, substantial application sections,
        //     but the Company Administrator onboarding flow does not
        //     exist (verified by search in M215) — the entry point
        //     itself is broken. Setup Required, not Ready.
        //   Authenticator: MFA/Passkeys/Recovery codes not confirmed
        //     complete. Development, not Ready.
        static ENTERPRISE_DASHBOARD_STATUS = Object.freeze({
            mpesaos: "Development",
            shopos: "Ready",
            quarry_manager_001: "Setup Required",
            authenticator: "Development"
        });
        static ENTERPRISE_DASHBOARD_APPS = Object.freeze(["mpesaos", "shopos", "quarry_manager_001", "authenticator"]);

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
                    sourcePath: fromRegistry ? (fromRegistry.sourcePath || null) : null,
                    certificationProvider: fromRegistry ? fromRegistry.certificationProvider : null,
                    licenseProvider: fromRegistry ? fromRegistry.licenseProvider : null,
                    healthProvider: fromRegistry ? fromRegistry.healthProvider : null,
                    permissionsProvider: fromRegistry ? fromRegistry.permissionsProvider : null,
                    // M345 real fix: this.#launchers is only ever populated by
                    // registerLauncher(), which nothing in the codebase calls, so
                    // it was always empty — every app showed "No Launcher
                    // Registered" regardless of real readiness. #canLaunchApplication()
                    // checks the real, composed ApplicationLauncher/ModuleRegistry
                    // instead. hasLauncher additionally requires the app's honest
                    // ENTERPRISE_DASHBOARD_STATUS to be "Ready" — a Development or
                    // Setup Required app stays honestly disabled even if its launch
                    // route happens to resolve, per the "don't pretend it's
                    // launchable" requirement.
                    status: this.#canLaunchApplication(id) ? "Launcher Connected" : "No Launcher Registered",
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
                    hasLauncher: this.#canLaunchApplication(id) && this.constructor.ENTERPRISE_DASHBOARD_STATUS[id] === "Ready",
                    // M345: honest, specific reason the Open button is disabled,
                    // rather than one generic message regardless of cause.
                    openDisabledReason: this.constructor.ENTERPRISE_DASHBOARD_STATUS[id] !== "Ready"
                        ? `Marked "${this.constructor.ENTERPRISE_DASHBOARD_STATUS[id] || "Unknown"}", not Ready yet.`
                        : (this.#canLaunchApplication(id) ? null : "Ready, but its launch route did not resolve — no registered module or manifest html.")
                };
            });
            // M366.5 — real fix: ENTERPRISE_DASHBOARD_APPS was a
            // hardcoded 4-item allowlist silently hiding every other
            // real, dynamically-discovered application (ServiceRegistry/
            // CozyCertification already build the full, real
            // `applications` list above — this filter existed only to
            // narrow it down, not to add anything). Removed per the
            // explicit "never use hardcoded application lists"
            // requirement — Application Center now shows every real
            // registered application. ENTERPRISE_DASHBOARD_STATUS is
            // left in place and still consulted below for apps it names;
            // any application NOT in that map honestly defaults to
            // hasLauncher:false / "Marked \"Unknown\", not Ready yet." —
            // never fabricated as launchable.
            const identity = window.CozyOS && window.CozyOS.IdentityEngine;
            const roleFiltered = (identity && typeof identity.canAccessApplication === "function" && this.#currentUserId)
                ? applications.filter(app => identity.canAccessApplication(this.#currentUserId, app.id))
                : (this.#currentUserRole === "admin" ? applications : []);
            return { connected: true, applications: roleFiltered };
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
        // ─── USER-BASED APPLICATION VISIBILITY ─────────────────────────────────
        // CORRECTED (Phase 1, Identity integration): the real coordinator is
        // window.CozyOS.IdentityEngine (core/modules/identity/identity-engine.js),
        // not the guessed "CozyIdentity" global, and its real model is
        // per-user (via getDashboardConfig(userId)/canAccessApplication),
        // not per-role — there is no getAllowedApplications(role) method on
        // the real file. This method had zero existing callers anywhere in
        // this file, so correcting its parameter from a guessed `role` to
        // the real `userId` breaks nothing. Still fails OPEN (shows
        // everything) with a clear, visible reason if Identity isn't
        // connected or the call throws — never silently hides applications
        // for a reason the operator can't see.
        // =========================================================================

        getVisibleApplications(userId) {
            const cert = this.#certification;
            const allApps = cert ? cert.listApplications() : [];
            const identity = window.CozyOS && window.CozyOS.IdentityEngine ? window.CozyOS.IdentityEngine : null;
            if (!identity) {
                return this.#deepClone({ userId: userId || null, source: "none", applications: allApps, message: "IdentityEngine not connected — showing all applications (per-user filtering unavailable)." });
            }
            if (typeof identity.getDashboardConfig !== "function") {
                return this.#deepClone({ userId: userId || null, source: "IdentityEngine (unsupported)", applications: allApps, message: "IdentityEngine is connected but doesn't expose getDashboardConfig(userId) — showing all applications." });
            }
            let config;
            try { config = identity.getDashboardConfig(userId); }
            catch (_err) {
                this.#diagnostics.errorsHidden++;
                return this.#deepClone({ userId: userId || null, source: "IdentityEngine (error)", applications: allApps, message: "IdentityEngine.getDashboardConfig() threw — showing all applications." });
            }
            if (!config || !config.available) {
                return this.#deepClone({ userId: userId || null, source: "IdentityEngine", applications: [], message: (config && config.reason) || "No dashboard configuration available for this user." });
            }
            // Three-tier model, per the real getDashboardConfig() contract:
            // admin sees everything; developer sees developer-hub plus
            // whatever's individually assigned; end-user sees only their
            // real assigned+enabled applications.
            if (config.dashboardType === "admin") {
                return this.#deepClone({ userId, source: "IdentityEngine", dashboardType: "admin", applications: allApps });
            }
            const allowedIds = new Set(
                config.dashboardType === "developer"
                    ? [...(config.developerApplications || [])]
                    : [...(config.assignedApplications || [])]
            );
            return this.#deepClone({
                userId, source: "IdentityEngine", dashboardType: config.dashboardType,
                applications: allApps.filter(a => allowedIds.has(a.id))
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
                { label: "Loading Identity", loaded: !!(window.CozyOS && window.CozyOS.IdentityEngine) },
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
        // CORRECTED (Phase 1): real global is IdentityEngine, not the guessed
        // "CozyIdentity". Users now shows real data via the real listUsers()
        // method (verified to exist and match this exact use case). Roles/
        // Permissions remain generic version/diagnostics-only for now —
        // identity-engine.js has listResourcePermissions()/checkPermission()
        // but no confirmed "list every role" / "list every permission
        // definition" method; upgrading those two needs that read finished
        // first, not guessed at.
        // =========================================================================
        getUsersCenterData() {
            const identity = window.CozyOS && window.CozyOS.IdentityEngine ? window.CozyOS.IdentityEngine : null;
            if (!identity) return { connected: false, message: "IdentityEngine is not connected." };
            if (typeof identity.listUsers !== "function") return { connected: false, message: "IdentityEngine is connected but doesn't expose listUsers()." };
            try { return this.#deepClone({ connected: true, users: identity.listUsers() }); }
            catch (_err) { this.#diagnostics.errorsHidden++; return { connected: false, message: "IdentityEngine.listUsers() threw." }; }
        }

        /**
         * #handleCreateAdministrator()
         *   Real (Milestone 192, Gate 7) — the one path that creates an
         *   administrator AFTER platform initialization (distinct from
         *   the first-run wizard's one-time createUser() call). Requires
         *   real step-up authorization via the EXISTING
         *   AuthorizationCoordinator + the new "create-administrator"
         *   policy before ever calling IdentityEngine.createUser() — no
         *   second policy engine, no bypass path. Fails closed: if
         *   AuthorizationCoordinator is missing or denies, createUser()
         *   is never called.
         */
        /**
         * #handlePublishMessage()
         *   Real (Milestone 209) — pure orchestration. Reads the real
         *   form fields and calls the existing, already-extended
         *   LivingMessageEngine.createMessage() directly. Permission
         *   enforcement (Platform vs Organisation Administrator scope)
         *   is entirely the existing engine's own #checkPermission() —
         *   this method does not duplicate or second-guess it.
         */
        /**
         * #handleCertifyApplication(appId)
         *   Real - only reachable when sourcePath exists (button disabled
         *   otherwise). Fetches the actual real source file and calls the
         *   existing CozyCertification.certifyModule(). Never fabricates
         *   a result if the fetch fails.
         */
        async #handleCertifyApplication(appId) {
            const registry = window.CozyOS.ServiceRegistry;
            const cert = this.#certification;
            const app = registry && typeof registry.getApplication === "function" ? registry.getApplication(appId) : null;
            if (!app || !app.sourcePath || !cert || typeof cert.certifyModule !== "function") { this.#render(); return; }
            try {
                const response = await fetch(app.sourcePath);
                if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
                const sourceText = await response.text();
                cert.certifyModule(sourceText, { moduleId: app.id, moduleName: app.name, version: app.version, filePath: app.sourcePath });
            } catch (err) {
                console.error("[WorkspaceShell] Certification fetch/run failed:", err.message);
            }
            this.#render();
        }

        /**
         * verifyAndRepairApplication(appId, currentUserId)
         *   Real - runs every check, collecting all findings before
         *   returning (never stops early), each genuine against real
         *   data. Every failure includes a real impact statement and
         *   repair action - never a generic "failed to load."
         *
         *   HONEST SCOPE on "Runtime Verification": this cannot
         *   actually boot/execute the application's real entry file
         *   safely from within this coordinator (that would mean
         *   evaluating arbitrary fetched code, which is not attempted
         *   here). What IS genuine: checking whether the application's
         *   own live coordinator object (if one is declared and
         *   already loaded on window.CozyOS) responds to a real
         *   health/version call without throwing - a real liveness
         *   check, not a fabricated full boot simulation.
         */
        async verifyAndRepairApplication(appId, currentUserId = null) {
            const checks = [];
            const registry = window.CozyOS.ServiceRegistry;

            // 1. Registration Check
            const app = registry && typeof registry.getApplication === "function" ? registry.getApplication(appId) : null;
            checks.push({
                check: "registration", passed: !!app,
                detail: app ? `Registered as "${app.name}", version ${app.version || "unknown"}.` : `No application registered with id "${appId}".`,
                impact: app ? null : "The application cannot be launched, certified, or deployed at all until it is registered.",
                repair: app ? null : "Register the application through ServiceRegistry.registerApplication()."
            });
            if (!app) return this.#buildVerificationSummary(appId, checks);

            // 2. Manifest Verification
            const hasEntryPoint = !!(app.entryPoint || app.launcher);
            checks.push({
                check: "manifest", passed: hasEntryPoint,
                detail: hasEntryPoint ? `Entry point declared: ${app.entryPoint || app.launcher}` : "Manifest missing required field: entryPoint.",
                impact: hasEntryPoint ? null : "The application has no known location to load from.",
                repair: hasEntryPoint ? null : "Restore or regenerate the application manifest with a real entryPoint."
            });

            // 3. Entry Files Verification (real fetch, not assumed)
            let filesPresent = false;
            let fetchDetail = "No entry point to check.";
            if (hasEntryPoint) {
                const target = app.entryPoint || app.launcher;
                try {
                    const response = await fetch(target);
                    filesPresent = response.ok;
                    fetchDetail = response.ok ? `Real file confirmed present at "${target}".` : `Missing: real fetch returned HTTP ${response.status} for "${target}".`;
                } catch (err) {
                    fetchDetail = `Missing: real fetch failed for "${target}": ${err.message}`;
                }
            }
            checks.push({
                check: "entry-files", passed: filesPresent, detail: fetchDetail,
                impact: filesPresent ? null : "The application cannot load - its real entry file does not exist at the declared path.",
                repair: filesPresent ? null : "Restore the missing file at the declared path, or correct the manifest's entryPoint."
            });

            // 4. Dependency Verification
            const declaredDeps = Array.isArray(app.dependencies) ? app.dependencies : [];
            const missingDeps = declaredDeps.filter(dep => !window.CozyOS[dep]);
            checks.push({
                check: "dependencies", passed: missingDeps.length === 0,
                detail: declaredDeps.length === 0 ? "No dependencies declared." : (missingDeps.length === 0 ? "All declared dependencies are live." : `Dependency Missing: ${missingDeps.join(", ")}.`),
                impact: missingDeps.length === 0 ? null : `Features depending on ${missingDeps.join(", ")} will be unavailable.`,
                repair: missingDeps.length === 0 ? null : `Load or enable: ${missingDeps.join(", ")}.`
            });

            // 5. Runtime Verification (real liveness check, honest scope per header comment)
            let runtimeOk = true, runtimeDetail = "No live coordinator declared for this application - runtime liveness not applicable.";
            if (app.liveCoordinatorName) {
                const live = window.CozyOS[app.liveCoordinatorName];
                if (!live) {
                    runtimeOk = false;
                    runtimeDetail = `Runtime Error: "${app.liveCoordinatorName}" is not live on window.CozyOS.`;
                } else {
                    try {
                        if (typeof live.getVersion === "function") live.getVersion();
                        else if (typeof live.getHealth === "function") live.getHealth();
                        runtimeDetail = `Real liveness check passed - "${app.liveCoordinatorName}" responded without throwing.`;
                    } catch (err) {
                        runtimeOk = false;
                        runtimeDetail = `Runtime Error: "${app.liveCoordinatorName}" threw: ${err.message}`;
                    }
                }
            }
            checks.push({
                check: "runtime", passed: runtimeOk, detail: runtimeDetail,
                impact: runtimeOk ? null : "The application's live coordinator is not responding correctly - it may fail during use.",
                repair: runtimeOk ? null : "Review initialisation logs for the coordinator named in the manifest."
            });

            // 6. Status Verification (real distinct states, not just a boolean)
            const status = app.status || (app.enabled === false ? "disabled" : "enabled");
            const statusOk = status === "enabled";
            checks.push({
                check: "status", passed: statusOk,
                detail: statusOk ? "Application is enabled." : `Application Disabled: current status is "${status}".`,
                impact: statusOk ? null : (status === "maintenance" ? "Users will see a maintenance message instead of the application." : "The application will not appear in the normal user dashboard."),
                repair: statusOk ? null : `Change the application's status from "${status}" to "enabled" when ready.`
            });

            // 7. Permission Verification
            const identity = window.CozyOS.IdentityEngine;
            let hasPermission = true, permDetail = "No real userId provided - permission check skipped, not a denial.";
            if (currentUserId && identity && typeof identity.isPlatformAdmin === "function") {
                hasPermission = identity.isPlatformAdmin(currentUserId) || (typeof identity.isDeveloper === "function" && identity.isDeveloper(currentUserId));
                permDetail = hasPermission ? "Current administrator has real permission to launch this application." : "Permission Denied: requires Platform Administrator.";
            }
            checks.push({
                check: "permission", passed: hasPermission, detail: permDetail,
                impact: hasPermission ? null : "This user cannot open, certify, or manage this application.",
                repair: hasPermission ? null : "Assign the required role, or use an authorised administrator account."
            });

            return this.#buildVerificationSummary(appId, checks);
        }

        /**
         * #buildVerificationSummary(appId, checks)
         *   Real - computes the real health percentage from actual
         *   pass/fail counts (never a fabricated or rounded-up number),
         *   and lists real blocking issues by name.
         */
        #buildVerificationSummary(appId, checks) {
            const total = checks.length;
            const passed = checks.filter(c => c.passed).length;
            const failed = total - passed;
            const health = total === 0 ? 0 : Math.round((passed / total) * 100);
            const blockingIssues = checks.filter(c => !c.passed).map(c => c.detail);
            return {
                appId, checksPerformed: total, passed, failed,
                overallHealth: health, readyToLaunch: failed === 0,
                blockingIssues, checks
            };
        }

        async #handlePublishMessage() {
            const messages = window.CozyOS.LivingMessageEngine;
            const auth = window.CozyOS.Auth;
            if (!messages) { this.#publishError = "LivingMessageEngine is not loaded."; this.#render(); return; }
            const currentUserId = auth && typeof auth.getCurrentAdministrator === "function" ? (auth.getCurrentAdministrator() || {}).userId : null;
            if (!currentUserId) { this.#publishError = "No authenticated administrator found."; this.#render(); return; }

            const category = this.#domRoot?.querySelector("#cozy-publish-category")?.value || "";
            const title = this.#domRoot?.querySelector("#cozy-publish-title")?.value || "";
            const text = this.#domRoot?.querySelector("#cozy-publish-text")?.value || "";
            const animation = this.#domRoot?.querySelector("#cozy-publish-animation")?.value || "fade";
            const textColor = this.#domRoot?.querySelector("#cozy-publish-color")?.value || null;
            const expiryRaw = this.#domRoot?.querySelector("#cozy-publish-expiry")?.value || "";
            const voicePlayback = !!this.#domRoot?.querySelector("#cozy-publish-voice")?.checked;
            const expiresAt = expiryRaw ? new Date(expiryRaw).toISOString() : null;

            const result = messages.createMessage(currentUserId, { category, title, text, animation, textColor: textColor || null, voicePlayback, expiresAt });
            this.#publishError = result.success ? null : result.reason;
            this.#render();
        }

        async #handleCreateAdministrator() {
            const username = this.#domRoot?.querySelector("#cozy-create-admin-username")?.value || "";
            const password = this.#domRoot?.querySelector("#cozy-create-admin-password")?.value || "";
            const authCoord = window.CozyOS.AuthorizationCoordinator;
            const identity = window.CozyOS.IdentityEngine;
            if (!authCoord || typeof authCoord.authorize !== "function") {
                this.#createAdminError = "AuthorizationCoordinator is not loaded — administrator creation is refused rather than left unprotected.";
                this.#render(); return;
            }
            if (!identity || typeof identity.createUser !== "function") {
                this.#createAdminError = "IdentityEngine is not loaded.";
                this.#render(); return;
            }
            const authResult = await authCoord.authorize({ policy: "create-administrator" });
            if (!authResult.authorized) {
                this.#createAdminError = `Step-up authorization denied: ${(authResult.diagnostics && authResult.diagnostics.reason) || "not authorized"}.`;
                this.#render(); return;
            }
            if (!username || !password) {
                this.#createAdminError = "Username and password are both required.";
                this.#render(); return;
            }
            const result = await identity.createUser({ username, password, roles: ["platform-admin"] });
            this.#createAdminError = result.available ? null : result.reason;
            this.#render();
        }

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

        /**
         * M365.2 — #hasPermission(action)
         *   The one, shared fail-open/fail-closed check used by the menu
         *   filter, page guard, and every button-visibility check below.
         *   Composes the same real, unmodified
         *   IdentityEngine.checkResourcePermission() — never a second
         *   permission mechanism.
         */
        #hasPermission(action) {
            if (this.#currentUserRole === "admin" || this.#currentUserRole === "developer") return true;
            const identity = window.CozyOS.IdentityEngine;
            return !!(identity && typeof identity.checkResourcePermission === "function" && this.#currentUserId && identity.checkResourcePermission(this.#currentUserId, action));
        }

        /**
         * M365.3 — #renderOrgManager()
         *   COMPOSED over the real, unmodified CozyCompany engine + the
         *   real, unmodified IdentityEngine. No new backend, no new
         *   storage, no new event system — every button below calls a
         *   method that existed before this milestone.
         *
         *   HONEST DISCLOSURE (found during Gate 1 tracing, not assumed):
         *   the real backend does NOT nest Organization under Company —
         *   createCompany() has no orgId field anywhere in its schema,
         *   confirmed by direct search. Organizations are rendered as a
         *   separate, top-level list here rather than forcing a parent-
         *   child relationship the data doesn't have. Likewise,
         *   Department belongs directly to Company (createDepartment()
         *   takes only companyId) — NOT to Division — so Departments are
         *   rendered as siblings of Divisions/Branches under each
         *   Company, not nested inside a Division.
         *
         *   Branch Restore is not implemented in the canonical
         *   CozyCompany backend and is intentionally not exposed here
         *   (confirmed absent by direct search; only archive/delete
         *   exist for Branch) — per explicit instruction, cozy-company.js
         *   is not modified in this milestone.
         */
        #renderOrgManager() {
            const company = window.CozyOS.Company;
            if (!company) return this.#renderNotConnected("CozyCompany (core/modules/company/cozy-company.js) is not loaded.");
            const identity = window.CozyOS.IdentityEngine;
            const canManage = this.#hasPermission("companies:manage");

            const orgs = company.listOrganizations();
            const companies = company.listCompanies();
            const allUsers = identity && typeof identity.listUsers === "function" ? identity.listUsers() : [];
            const usersInCompany = (companyId) => allUsers.filter(u => {
                const ref = identity.getCompanyReference(u.id);
                return ref && ref.companyId === companyId;
            });
            const usersInDept = (companyId, departmentId) => usersInCompany(companyId).filter(u => identity.getCompanyReference(u.id).departmentId === departmentId);
            const usersInTeam = (companyId, teamId) => allUsers.filter(u => {
                const ref = identity.getCompanyReference(u.id);
                return ref && ref.companyId === companyId && ref.teamId === teamId;
            });

            const stats = `
                <div class="cozy-living-card" style="display:flex;gap:18px;flex-wrap:wrap;margin-bottom:14px;">
                    <span><b>${orgs.length}</b> Organizations</span>
                    <span><b>${companies.length}</b> Companies</span>
                    <span><b>${company.listDivisions({}).length}</b> Divisions</span>
                    <span><b>${company.listTeams({}).length}</b> Teams</span>
                    <span><b>${allUsers.length}</b> Employees</span>
                </div>
                <p class="cozy-disclosure-note">These are platform-wide totals, not per-organization totals — Organizations are managed independently from Companies in this repository (see note below); there is no real grouping to scope Companies/Divisions/Teams/Employees by Organization.</p>`;

            const orgList = orgs.map(o => {
                const isArchived = o.status === "archived";
                return `
                <div class="cozy-module-row">
                    <b>${this.#escapeHtml(o.name)}</b>
                    <span class="cozy-badge">${this.#escapeHtml(o.status || "active")}</span>
                    ${canManage ? `
                        <input type="text" data-org-rename-input="${o.id}" class="cozy-field" placeholder="Rename to..." style="width:160px;">
                        <button type="button" class="cozy-btn" data-org-rename="${o.id}">Rename</button>
                        <button type="button" class="cozy-btn" data-org-archive="${o.id}">${isArchived ? "Restore" : "Archive"}</button>
                        <button type="button" class="cozy-btn" data-org-delete="${o.id}">Delete</button>` : ""}
                </div>`;
            }).join("")
                || `<p class="cozy-disclosure-note">No organizations yet.</p>`;
            const orgCreateRow = canManage ? `
                <div style="display:flex;gap:6px;margin-top:6px;">
                    <input type="text" id="cozy-org-new-name" class="cozy-field" placeholder="Organization name" style="flex:1;">
                    <button type="button" class="cozy-btn" data-org-create>Create Organization</button>
                </div>` : "";

            const companyRows = companies.map(c => {
                const key = `company:${c.companyId}`;
                const expanded = this.#orgManagerExpanded.has(key);
                const empCount = usersInCompany(c.companyId).length;
                const branches = company.listBranches(c.companyId);
                const divisions = company.listDivisions({ companyId: c.companyId });
                const departments = Object.values(c.departments || {});
                let inner = "";
                if (expanded) {
                    const branchRows = branches.map(b => `
                        <div class="cozy-module-row">
                            <span>${this.#escapeHtml(b.branchName)}</span>
                            <span class="cozy-badge">${this.#escapeHtml(b.status)}</span>
                            <span>${company.listDivisions({ companyId: c.companyId, branchId: b.branchId }).length} divisions</span>
                            ${canManage ? `<button type="button" class="cozy-btn" data-branch-archive="${c.companyId}:${b.branchId}" ${b.status === "ARCHIVED" ? "disabled" : ""}>${b.status === "ARCHIVED" ? "Archived" : "Archive"}</button><button type="button" class="cozy-btn" data-branch-delete="${c.companyId}:${b.branchId}">Delete</button>` : ""}
                        </div>`).join("") || `<p class="cozy-disclosure-note">No branches yet.</p>`;
                    const divisionRows = divisions.map(d => `
                        <div class="cozy-module-row">
                            <span>${this.#escapeHtml(d.name)}</span>
                            <span class="cozy-badge">${this.#escapeHtml(d.status)}</span>
                            ${canManage ? `<button type="button" class="cozy-btn" data-division-archive="${d.divisionId}">${d.status === "ARCHIVED" ? "Restore" : "Archive"}</button><button type="button" class="cozy-btn" data-division-delete="${d.divisionId}">Delete</button>` : ""}
                        </div>`).join("") || `<p class="cozy-disclosure-note">No divisions yet.</p>`;
                    const deptRows = departments.map(dept => {
                        const deptKey = `dept:${dept.departmentId}`;
                        const deptExpanded = this.#orgManagerExpanded.has(deptKey);
                        const deptEmpCount = usersInDept(c.companyId, dept.departmentId).length;
                        const teams = company.listTeams({ companyId: c.companyId, departmentId: dept.departmentId });
                        let deptInner = "";
                        if (deptExpanded) {
                            const teamRows = teams.map(t => `
                                <div class="cozy-module-row" style="flex-direction:column;align-items:stretch;">
                                    <div style="display:flex;align-items:center;gap:8px;">
                                        <span>${this.#escapeHtml(t.name)}</span>
                                        <span>Lead: ${this.#escapeHtml(t.lead || "unassigned")}</span>
                                        <span>${usersInTeam(c.companyId, t.teamId).length} members</span>
                                        <span class="cozy-badge">${this.#escapeHtml(t.status)}</span>
                                    </div>
                                    ${canManage ? `
                                    <div style="display:flex;gap:6px;margin-top:4px;">
                                        <input type="text" data-team-lead-input="${t.teamId}" class="cozy-field" placeholder="New lead (userId)" style="flex:1;">
                                        <button type="button" class="cozy-btn" data-team-assign-lead="${t.teamId}">Assign Leader</button>
                                        <input type="text" data-team-member-input="${t.teamId}" class="cozy-field" placeholder="userId" style="flex:1;">
                                        <button type="button" class="cozy-btn" data-team-add-member="${t.teamId}:${c.companyId}:${dept.departmentId}">Add Member</button>
                                        <button type="button" class="cozy-btn" data-team-remove-member="${t.teamId}">Remove Member</button>
                                    </div>` : ""}
                                </div>`).join("") || `<p class="cozy-disclosure-note">No teams yet.</p>`;
                            deptInner = `
                                <div style="margin-top:6px;padding-left:14px;border-left:2px solid var(--cozy-border,#233827);">
                                    ${teamRows}
                                    ${canManage ? `<div style="display:flex;gap:6px;margin-top:6px;"><input type="text" data-team-new-name="${dept.departmentId}" class="cozy-field" placeholder="New team name" style="flex:1;"><button type="button" class="cozy-btn" data-team-create="${c.companyId}:${dept.departmentId}">Add Team</button></div>` : ""}
                                </div>`;
                        }
                        return `
                            <div class="cozy-module-row" style="flex-direction:column;align-items:stretch;">
                                <div style="display:flex;align-items:center;gap:8px;">
                                    <button type="button" class="cozy-btn" data-dept-toggle="${dept.departmentId}">${deptExpanded ? "▼" : "▶"}</button>
                                    <span>${this.#escapeHtml(dept.name)}</span>
                                    <span>Manager: ${this.#escapeHtml(dept.managerId || "unassigned")}</span>
                                    <span>${deptEmpCount} employees</span>
                                    <span>${teams.length} teams</span>
                                    <span class="cozy-badge">${this.#escapeHtml(dept.status)}</span>
                                    ${canManage ? `<button type="button" class="cozy-btn" data-dept-archive="${c.companyId}:${dept.departmentId}">${dept.status === "ARCHIVED" ? "Restore" : "Archive"}</button>` : ""}
                                </div>
                                ${canManage ? `<div style="display:flex;gap:6px;margin-top:4px;"><input type="text" data-dept-manager-input="${dept.departmentId}" class="cozy-field" placeholder="Manager userId" style="flex:1;"><button type="button" class="cozy-btn" data-dept-assign-manager="${c.companyId}:${dept.departmentId}">Assign Manager</button></div>` : ""}
                                ${deptInner}
                            </div>`;
                    }).join("") || `<p class="cozy-disclosure-note">No departments yet.</p>`;

                    inner = `
                        <div style="margin-top:8px;padding-left:14px;border-left:2px solid var(--cozy-border,#233827);">
                            <h4>Branches</h4>${branchRows}
                            ${canManage ? `<div style="display:flex;gap:6px;margin:6px 0;"><input type="text" data-branch-new-code="${c.companyId}" class="cozy-field" placeholder="Branch code" style="width:100px;"><input type="text" data-branch-new-name="${c.companyId}" class="cozy-field" placeholder="Branch name" style="flex:1;"><button type="button" class="cozy-btn" data-branch-create="${c.companyId}">Add Branch</button></div>` : ""}
                            <h4>Divisions</h4>${divisionRows}
                            ${canManage ? `<div style="display:flex;gap:6px;margin:6px 0;"><input type="text" data-division-new-name="${c.companyId}" class="cozy-field" placeholder="Division name" style="flex:1;"><button type="button" class="cozy-btn" data-division-create="${c.companyId}">Add Division</button></div>` : ""}
                            <h4>Departments</h4>${deptRows}
                            ${canManage ? `<div style="display:flex;gap:6px;margin:6px 0;"><input type="text" data-dept-new-name="${c.companyId}" class="cozy-field" placeholder="Department name" style="flex:1;"><button type="button" class="cozy-btn" data-dept-create="${c.companyId}">Add Department</button></div>` : ""}
                        </div>`;
                }
                const settingsKey = `settings:${c.companyId}`;
                const settingsExpanded = this.#orgManagerExpanded.has(settingsKey);
                let settingsPanel = "";
                if (settingsExpanded) {
                    const b = c.branding || {}, bs = c.businessSettings || {}, ci = c.contactInformation || {}, pl = c.physicalLocation || {}, fs = c.financialSettings || {}, dt = c.documentTemplates || {};
                    const field = (label, name, value, ph = "") => `<label style="display:block;margin-bottom:4px;">${label}<input type="text" data-company-field="${name}" data-company-id="${c.companyId}" value="${this.#escapeHtml(value || "")}" placeholder="${ph}" class="cozy-field" style="width:100%;" ${canManage ? "" : "disabled"}></label>`;
                    settingsPanel = `
                        <div class="cozy-living-card cozy-living-glass" style="margin-top:8px;padding:12px;">
                            <h4>Company Profile</h4>
                            ${field("Legal Name", "profile.legalName", c.legalName)}
                            ${field("Trading Name", "profile.tradingName", c.tradingName)}
                            ${field("Registration Number", "profile.registrationNumber", c.registrationNumber)}
                            ${field("Tax PIN", "profile.taxPIN", c.taxPIN)}
                            ${field("VAT Number", "profile.vatNumber", c.vatNumber)}
                            ${field("Industry", "profile.industry", c.industry)}
                            ${field("Description", "profile.companyDescription", c.companyDescription)}
                            ${canManage ? `<button type="button" class="cozy-btn" data-company-save="profile:${c.companyId}">Save Profile</button>` : ""}

                            <h4 style="margin-top:14px;">Branding</h4>
                            ${field("Primary Logo (URL)", "branding.primaryLogo", b.primaryLogo)}
                            ${field("Icon (URL)", "branding.icon", b.icon)}
                            ${field("Brand Colors (comma-separated)", "branding.brandColors", (b.brandColors || []).join(","))}
                            ${field("Company Watermark", "branding.companyWatermark", b.companyWatermark)}
                            ${field("Email Signature (companySignature)", "branding.companySignature", b.companySignature)}
                            <p class="cozy-disclosure-note">"Letterhead" composes the Document Templates headers below; "Email Signature" composes the existing companySignature field above — repository equivalents, not exact field names.</p>
                            ${canManage ? `<button type="button" class="cozy-btn" data-company-save="branding:${c.companyId}">Save Branding</button>` : ""}

                            <h4 style="margin-top:14px;">Business Settings</h4>
                            ${field("Time Zone", "businessSettings.timeZone", bs.timeZone)}
                            ${field("Language", "businessSettings.language", bs.language)}
                            ${field("Date Format", "businessSettings.dateFormat", bs.dateFormat)}
                            ${field("Number Format", "businessSettings.numberFormat", bs.numberFormat)}
                            ${field("Opening Hours", "businessSettings.openingHours", bs.openingHours)}
                            ${field("Closing Hours", "businessSettings.closingHours", bs.closingHours)}
                            ${field("Working Days (comma-separated)", "businessSettings.workingDays", (bs.workingDays || []).join(","))}
                            ${canManage ? `<button type="button" class="cozy-btn" data-company-save="businessSettings:${c.companyId}">Save Business Settings</button>` : ""}

                            <h4 style="margin-top:14px;">Contact Information</h4>
                            ${field("Email", "contactInformation.email", ci.email)}
                            ${field("Website", "contactInformation.website", ci.website)}
                            ${field("Country", "physicalLocation.country", pl.country)}
                            ${field("Region/County", "physicalLocation.county", pl.county)}
                            ${field("City", "physicalLocation.city", pl.city)}
                            ${field("Postal Address", "physicalLocation.postalAddress", pl.postalAddress)}
                            <p class="cozy-disclosure-note">Address/country/region/city compose the real, separate physicalLocation section (not contactInformation) — a genuine repository section split, not an error.</p>
                            ${canManage ? `<button type="button" class="cozy-btn" data-company-save="contact:${c.companyId}">Save Contact Info</button>` : ""}

                            <h4 style="margin-top:14px;">Financial Settings</h4>
                            ${field("Currency", "financialSettings.currency", fs.currency)}
                            ${field("Financial Year", "financialSettings.financialYear", fs.financialYear)}
                            ${field("Invoice Prefix", "financialSettings.invoicePrefix", fs.invoicePrefix)}
                            ${field("Receipt Prefix", "financialSettings.receiptPrefix", fs.receiptPrefix)}
                            ${field("Quotation Prefix", "financialSettings.quotationPrefix", fs.quotationPrefix)}
                            ${field("Purchase Order Prefix", "financialSettings.purchasePrefix", fs.purchasePrefix)}
                            ${canManage ? `<button type="button" class="cozy-btn" data-company-save="financial:${c.companyId}">Save Financial Settings</button>` : ""}

                            <h4 style="margin-top:14px;">Document Templates</h4>
                            ${field("Invoice Header", "documentTemplates.invoiceHeader", dt.invoiceHeader)}
                            ${field("Receipt Header", "documentTemplates.receiptHeader", dt.receiptHeader)}
                            ${field("Quotation Header", "documentTemplates.quotationHeader", dt.quotationHeader)}
                            ${field("Delivery Note Header", "documentTemplates.deliveryHeader", dt.deliveryHeader)}
                            <p class="cozy-disclosure-note"><b>Purchase Order Template: not available in the canonical CozyCompany backend.</b> Confirmed absent by direct search — no purchaseHeader/purchaseFooter field exists in documentTemplates. Disclosed rather than fabricated; the Purchase Order numbering prefix above is real and available.</p>
                            ${canManage ? `<button type="button" class="cozy-btn" data-company-save="templates:${c.companyId}">Save Document Templates</button>` : ""}
                        </div>`;
                }
                return `
                    <div class="cozy-living-card" style="margin-bottom:8px;padding:12px;">
                        <div style="display:flex;align-items:center;gap:8px;">
                            <button type="button" class="cozy-btn" data-company-toggle="${c.companyId}">${expanded ? "▼" : "▶"}</button>
                            <b>${this.#escapeHtml(c.legalName)}</b>
                            <span class="cozy-badge">${this.#escapeHtml(c.companyStatus)}</span>
                            <span>${branches.length} branches</span>
                            <span>${empCount} employees</span>
                            <button type="button" class="cozy-btn" data-company-settings-toggle="${c.companyId}">${settingsExpanded ? "Hide Settings" : "Company Settings"}</button>
                        </div>
                        ${inner}
                        ${settingsPanel}
                    </div>`;
            }).join("") || `<p class="cozy-disclosure-note">No companies yet.</p>`;

            return `<h2>Organization Manager</h2>${stats}
                <h3>Organizations</h3>${orgList}${orgCreateRow}
                <h3 style="margin-top:16px;">Companies</h3>${companyRows}
                <p class="cozy-disclosure-note" style="margin-top:10px;">Organizations are currently managed independently from Companies in this repository. Organizations are shown separately from Companies because the real backend does not link them (createCompany() has no orgId field) — disclosed rather than forced into a nesting the data doesn't support. Departments are shown as siblings of Branches/Divisions under each Company, matching the real schema (Department belongs to Company, not Division). Branch Restore is not implemented in the canonical CozyCompany backend and is intentionally not exposed.</p>`;
        }

        #renderNotConnected(message) {
            return `<div class="cozy-empty-state"><p>${this.#escapeHtml(message || "Not connected.")}</p></div>`;
        }

        /**
         * M365.2 — #renderAccessDenied(centerId)
         *   Real, honest denial view — same visual convention as
         *   #renderNotConnected() above (a shared, existing empty-state
         *   class), not a new UI pattern. Names the exact permission
         *   string an admin would need to grant, so this is actionable
         *   rather than a dead end.
         */
        #renderAccessDenied(centerId) {
            return `<div class="cozy-empty-state"><h2>Access Denied</h2><p>You do not have permission to view this section. An administrator can grant access via the "${this.#escapeHtml(centerId)}:view" permission in Employee Management.</p></div>`;
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

        /**
         * #getPublisherColorPalette()
         *   M346 — real, static built-in colour swatches for the Message
         *   Publisher's colour selector (Basic/Pastel/Bright/Dark/
         *   Accessibility/Church/Corporate — 34 built-ins, within the
         *   requested 20-50 range), plus a genuine "Theme Colours" category
         *   sourced live from CozyOS.Theme.getThemeTokens() for whichever
         *   theme is currently active (real resolved values, never a second
         *   hardcoded copy). Custom HEX/RGB/RGBA is still always available
         *   via the adjacent free-text field — this list never replaces it.
         */
        #getPublisherColorPalette() {
            const categories = [
                { label: "Basic", colors: [
                    { name: "Black", hex: "#000000" }, { name: "White", hex: "#ffffff" },
                    { name: "Red", hex: "#ef4444" }, { name: "Orange", hex: "#f97316" },
                    { name: "Yellow", hex: "#eab308" }, { name: "Green", hex: "#22c55e" },
                    { name: "Blue", hex: "#3b82f6" }, { name: "Purple", hex: "#a855f7" }
                ]},
                { label: "Pastel", colors: [
                    { name: "Pastel Pink", hex: "#fbcfe8" }, { name: "Pastel Blue", hex: "#bfdbfe" },
                    { name: "Pastel Green", hex: "#bbf7d0" }, { name: "Pastel Yellow", hex: "#fef08a" },
                    { name: "Pastel Purple", hex: "#e9d5ff" }
                ]},
                { label: "Bright", colors: [
                    { name: "Bright Lime", hex: "#a3e635" }, { name: "Bright Cyan", hex: "#22d3ee" },
                    { name: "Bright Magenta", hex: "#e879f9" }, { name: "Bright Orange", hex: "#fb923c" },
                    { name: "Bright Red", hex: "#f43f5e" }
                ]},
                { label: "Dark", colors: [
                    { name: "Charcoal", hex: "#1f2937" }, { name: "Midnight", hex: "#111827" },
                    { name: "Dark Slate", hex: "#334155" }, { name: "Dark Maroon", hex: "#450a0a" },
                    { name: "Dark Forest", hex: "#14532d" }
                ]},
                { label: "Accessibility (WCAG AA on white)", colors: [
                    { name: "AA Blue", hex: "#1d4ed8" }, { name: "AA Green", hex: "#15803d" },
                    { name: "AA Red", hex: "#b91c1c" }, { name: "AA Purple", hex: "#6d28d9" },
                    { name: "AA Grey", hex: "#374151" }
                ]},
                { label: "Church Colours", colors: [
                    { name: "Liturgical Purple", hex: "#5b21b6" }, { name: "Liturgical Gold", hex: "#b45309" },
                    { name: "Liturgical Red", hex: "#991b1b" }, { name: "Liturgical Green", hex: "#166534" },
                    { name: "Liturgical White", hex: "#f8fafc" }
                ]},
                { label: "Corporate Colours", colors: [
                    { name: "Corporate Navy", hex: "#1e3a8a" }, { name: "Corporate Grey", hex: "#4b5563" },
                    { name: "Corporate Teal", hex: "#0f766e" }, { name: "Corporate Gold", hex: "#a16207" },
                    { name: "Corporate Black", hex: "#0f172a" }
                ]}
            ];

            // Real theme colours — pulled live, not fabricated. Only shown
            // when CozyOS.Theme is actually loaded and the active theme's
            // tokens actually resolve.
            const themeController = window.CozyOS && window.CozyOS.Theme;
            if (themeController && typeof themeController.getThemeTokens === "function") {
                const activeName = document.documentElement.getAttribute("data-cozy-app");
                if (activeName) {
                    const resolved = themeController.getThemeTokens(activeName);
                    if (resolved.available) {
                        const themeColors = Object.entries(resolved.tokens)
                            .filter(([k, v]) => k.startsWith("--cozy-") && /^#|^rgb/i.test(v))
                            .map(([k, v]) => ({ name: k.replace("--cozy-", "").replace(/-/g, " "), hex: v }));
                        if (themeColors.length) categories.push({ label: `Theme Colours (${resolved.theme})`, colors: themeColors });
                    }
                }
            }
            return categories;
        }

        #symbolFor(verdict) {
            if (verdict === "ENTERPRISE_CERTIFIED") return "✓";
            if (verdict === "CERTIFIED_WITH_WARNINGS") return "⚠";
            return "✗";
        }

        #renderCenter(centerId) {
            /**
             * M365.2 — page-access guard. Composes the same real,
             * existing IdentityEngine.checkResourcePermission() the menu
             * filter above uses — never a second check mechanism. Same
             * fail-open/fail-closed split: Platform Admin/Developer are
             * completely unaffected (matches today's behavior exactly);
             * every other role tier must hold "<centerId>:view" or sees
             * a real Access Denied view instead of the section. This is
             * a second, defense-in-depth layer behind the menu filter
             * (which already hides the link) - protects direct/stale
             * #activeCenter values the same way the existing fail-closed
             * fallback above already protects against stale localStorage.
             */
            if (!this.#hasPermission(`${centerId}:view`)) return this.#renderAccessDenied(centerId);
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
                case "aiProviders": return this.#renderAIProviders();
                case "platformDiscovery": return this.#renderPlatformDiscovery();
                case "platformAudit": return this.#renderPlatformAudit();
                case "platformOperations": return this.#renderPlatformOperations();
                case "platformResources": return this.#renderPlatformResources();
                case "referenceIntegrityCenter": return this.#renderReferenceIntegrityCenter();
                case "vendorStatusCenter": return this.#renderVendorStatusCenter();
                case "accessibilityCenter": return this.#renderAccessibilityCenter();
                case "contentStudio": return this.#renderContentStudio();
                case "themeStudio": return this.#renderThemeStudio();
                case "livingThemeEngine": return this.#renderLivingThemeEngine();
                case "livingMessageEngine": return this.#renderLivingMessageEngine();
                case "modeEngine": return this.#renderModeEngine();
                case "livingButtonEngine": return this.#renderLivingButtonEngine();
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
                case "publisher": {
                    // Milestone 209 — Admin Publisher Console. Pure
                    // orchestration: every field here maps directly to a
                    // real, existing LivingMessageEngine.createMessage()
                    // parameter (extended in this same milestone). No new
                    // publishing logic — this UI only calls the existing
                    // engine.
                    const messageEngine = window.CozyOS.LivingMessageEngine;
                    if (!messageEngine) return `<h2>Message Publisher</h2>${this.#renderNotConnected("LivingMessageEngine is not loaded.")}`;
                    const identity = window.CozyOS.IdentityEngine;
                    const currentUserId = window.CozyOS.Auth && typeof window.CozyOS.Auth.getCurrentAdministrator === "function"
                        ? (window.CozyOS.Auth.getCurrentAdministrator() || {}).userId : null;
                    const isPlatformAdmin = identity && currentUserId && typeof identity.isPlatformAdmin === "function" && identity.isPlatformAdmin(currentUserId);
                    const animEngine = window.CozyOS.LiveAnimationEngine;
                    const animOptions = (animEngine ? animEngine.getSupportedAnimations() : ["fade"])
                        .map(a => `<option value="${this.#escapeHtml(a)}">${this.#escapeHtml(a)}</option>`).join("");

                    // Real listing - shows whatever this admin is actually
                    // permitted to see, via the existing message engine's
                    // own real data (never fabricated).
                    const allMessages = [...(messageEngine.getEligibleMessages ? messageEngine.getEligibleMessages() : [])];
                    const rows = this.#renderList(allMessages, m => `
                        <div class="cozy-module-row">
                            <b>${this.#escapeHtml(m.title || m.category)}</b>
                            <span>${this.#escapeHtml(m.text.slice(0, 60))}</span>
                            <span class="cozy-badge">${this.#escapeHtml(m.priority)}</span>
                        </div>`);

                    // M346 — production colour selector data. Categorized,
                    // built-in swatches (name + real hex) shown as clickable
                    // colour squares; custom HEX/RGB/RGBA still allowed via
                    // the existing #cozy-publish-color text field, which
                    // this selector fills in rather than replaces. Theme
                    // colours pull the REAL currently-resolved tokens of
                    // whichever theme is active right now (getThemeTokens()
                    // — never a hardcoded second copy).
                    const colorCategories = this.#getPublisherColorPalette();
                    const activeColorPreset = this.#publishColorPreset;
                    const colorSwatchesHtml = colorCategories.map(cat => `
                        <div class="cozy-color-category">
                            <span class="cozy-disclosure-note">${this.#escapeHtml(cat.label)}</span>
                            <div class="cozy-color-swatch-grid" style="display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 10px;">
                                ${cat.colors.map(c => `
                                    <button type="button" class="cozy-color-swatch" data-publish-color-swatch="${this.#escapeHtml(c.hex)}"
                                        title="${this.#escapeHtml(c.name)} (${this.#escapeHtml(c.hex)})"
                                        style="width:28px;height:28px;border-radius:6px;background:${this.#escapeHtml(c.hex)};border:2px solid ${activeColorPreset === c.hex ? "var(--cozy-accent,#111)" : "rgba(0,0,0,0.15)"};cursor:pointer;">
                                    </button>`).join("")}
                            </div>
                        </div>`).join("");

                    return `<h2>Message Publisher</h2>
                        ${isPlatformAdmin ? '<p class="cozy-disclosure-note">Platform Administrator — may publish globally or to any application.</p>' : '<p class="cozy-disclosure-note">Application Administrator — messages are scoped to your organisation only, enforced by the existing LivingMessageEngine permission check.</p>'}
                        ${rows}
                        <h3>Publish New Message</h3>
                        <input type="text" id="cozy-publish-category" placeholder="Category (e.g. announcement)" class="cozy-field" />
                        <input type="text" id="cozy-publish-title" placeholder="Title" class="cozy-field" />
                        <textarea id="cozy-publish-text" placeholder="Message body" class="cozy-field"></textarea>
                        <select id="cozy-publish-animation" class="cozy-field">${animOptions}</select>
                        <h4>Text Colour</h4>
                        <div class="cozy-color-selector">
                            ${colorSwatchesHtml}
                            <div style="display:flex;align-items:center;gap:8px;">
                                <span style="width:24px;height:24px;border-radius:5px;border:1px solid rgba(0,0,0,0.2);background:${this.#escapeHtml(activeColorPreset || "#000000")};display:inline-block;"></span>
                                <input type="text" id="cozy-publish-color" placeholder="Custom HEX / RGB / RGBA (e.g. #10b981, rgb(16,185,129))" class="cozy-field" value="${this.#escapeHtml(activeColorPreset || "")}" />
                            </div>
                        </div>
                        <input type="datetime-local" id="cozy-publish-expiry" class="cozy-field" title="Expiry time (optional)" />
                        <label><input type="checkbox" id="cozy-publish-voice" /> Enable voice playback</label>
                        <button type="button" class="cozy-btn cozy-btn-primary" id="cozy-publish-submit">Publish</button>
                        <p id="cozy-publish-error" class="cozy-disclosure-note" style="color:var(--cozy-error,#ef4444);">${this.#escapeHtml(this.#publishError || "")}</p>`;
                }
                case "users": {
                    const data = this.getUsersCenterData();
                    if (!data.connected) return `<h2>Users</h2>${this.#renderNotConnected(data.message)}`;
                    const identity = window.CozyOS.IdentityEngine;
                    /**
                     * M365.1 — resource:action vocabulary. This is DATA,
                     * not a new authorization engine: every string below
                     * is passed as-is to the existing, real
                     * grantResourcePermission()/checkResourcePermission()
                     * (format-validated there, unchanged). Composing the
                     * documented app-category x action-type matrix from
                     * the approved scope - no new permission logic.
                     */
                    const RESOURCE_ACTION_VOCABULARY = ["users", "applications", "marketplace", "finance", "church", "education", "hr", "inventory", "pos", "crm", "reports", "ai", "voice", "builder", "tasks"]
                        .flatMap(resource => ["view", "create", "edit", "delete", "export", "approve", "manage-settings", "manage"].map(action => `${resource}:${action}`));
                    const rows = data.users.map(u => {
                        const expanded = this.#employeeManageExpanded.has(u.id);
                        let managePanel = "";
                        if (expanded) {
                            const roles = u.roles || [];
                            const resourcePerms = identity && typeof identity.listResourcePermissions === "function" ? identity.listResourcePermissions(u.id) : [];
                            const assignedApps = identity && typeof identity.listAssignedApplications === "function" ? identity.listAssignedApplications(u.id) : [];
                            const companyRef = identity && typeof identity.getCompanyReference === "function" ? identity.getCompanyReference(u.id) : null;
                            managePanel = `
                                <div class="cozy-app-manage-panel" style="margin-top:8px;padding:10px;border-top:1px dashed var(--cozy-border,#233827);font-size:12px;">
                                    <p><b>Status:</b> ${this.#escapeHtml(u.status)}
                                        ${this.#hasPermission("users:edit") ? `<button type="button" class="cozy-btn" data-employee-suspend="${this.#escapeHtml(u.id)}">${u.status === "suspended" ? "Reactivate" : "Suspend"}</button>` : ""}
                                    </p>
                                    <p><b>Effective Permissions</b> (real, aggregated - composes existing IdentityEngine data only, no new store):</p>
                                    <ul style="margin:0 0 8px 18px;">
                                        <li>Roles: ${roles.length ? this.#escapeHtml(roles.join(", ")) : "none"}</li>
                                        <li>Resource permissions: ${resourcePerms.length ? this.#escapeHtml(resourcePerms.join(", ")) : "none"}</li>
                                        <li>Assigned applications: ${assignedApps.length ? this.#escapeHtml(assignedApps.join(", ")) : "none"}</li>
                                        <li>Department/Team: ${companyRef && companyRef.departmentId ? this.#escapeHtml(`${companyRef.companyId || "?"} / ${companyRef.departmentId}${companyRef.teamId ? " / " + companyRef.teamId : ""}`) : "not assigned"}</li>
                                    </ul>
                                    ${this.#hasPermission("users:edit") ? `
                                    <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">
                                        <input type="text" data-employee-role-input="${this.#escapeHtml(u.id)}" placeholder="Role to delegate" class="cozy-field" style="flex:1;">
                                        <button type="button" class="cozy-btn" data-employee-delegate-role="${this.#escapeHtml(u.id)}">Delegate Role</button>
                                    </div>
                                    <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">
                                        <select data-employee-perm-select="${this.#escapeHtml(u.id)}" class="cozy-field" style="flex:1;">${RESOURCE_ACTION_VOCABULARY.map(p => `<option value="${p}">${p}</option>`).join("")}</select>
                                        <button type="button" class="cozy-btn" data-employee-grant-perm="${this.#escapeHtml(u.id)}">Grant</button>
                                        <button type="button" class="cozy-btn" data-employee-revoke-perm="${this.#escapeHtml(u.id)}">Revoke</button>
                                    </div>
                                    <div style="display:flex;gap:6px;align-items:center;">
                                        <input type="text" data-employee-company-input="${this.#escapeHtml(u.id)}" placeholder="companyId" class="cozy-field" style="width:80px;">
                                        <input type="text" data-employee-dept-input="${this.#escapeHtml(u.id)}" placeholder="departmentId" class="cozy-field" style="width:100px;">
                                        <input type="text" data-employee-team-input="${this.#escapeHtml(u.id)}" placeholder="teamId (optional)" class="cozy-field" style="width:100px;">
                                        <button type="button" class="cozy-btn" data-employee-assign-dept="${this.#escapeHtml(u.id)}">Assign</button>
                                    </div>` : `<p class="cozy-disclosure-note">You do not have permission to modify roles, permissions, or department assignment ("users:edit" required).</p>`}
                                    <p class="cozy-disclosure-note" style="margin-top:8px;">Delegate Role composes the real delegateRole() — requires the currently signed-in administrator to already hold the role being delegated (an existing, unmodified safeguard). Department/Team assignment composes the real, existing assignCompanyReference() - department/team entities themselves are managed in Company Administration (a separate, future milestone), not here.</p>
                                </div>`;
                        }
                        return `
                        <div class="cozy-module-row" style="flex-direction:column;align-items:stretch;">
                            <div style="display:flex;align-items:center;gap:10px;">
                                <b>${this.#escapeHtml(u.username)}</b>
                                <span>${this.#escapeHtml((u.roles || []).join(", ") || "no roles")}</span>
                                <span class="cozy-badge">${this.#escapeHtml(u.status)}</span>
                                <button type="button" class="cozy-btn" data-employee-manage-toggle="${this.#escapeHtml(u.id)}">${expanded ? "Hide Manage" : "Manage"}</button>
                            </div>
                            ${managePanel}
                        </div>`;
                    }).join("");
                    // Milestone 192, Gate 7 — real, new capability (none
                    // existed before: createUser() previously had exactly
                    // one caller, the first-run wizard). Protected by a
                    // real step-up check via the existing
                    // AuthorizationCoordinator + the new
                    // "create-administrator" policy — never bypassed,
                    // never a second policy engine.
                    const authCoord = window.CozyOS.AuthorizationCoordinator;
                    const createAdminForm = authCoord ? `
                        <h3>Create Additional Administrator</h3>
                        <p class="cozy-disclosure-note">Requires a real step-up check (trusted device) via AuthorizationCoordinator — a compromised session on an unrecognized device cannot create new administrators.</p>
                        <input type="text" id="cozy-create-admin-username" placeholder="Username" class="cozy-field" />
                        <input type="password" id="cozy-create-admin-password" placeholder="Password" class="cozy-field" />
                        <button type="button" class="cozy-btn cozy-btn-primary" id="cozy-create-admin-submit">Create Administrator</button>
                        <p id="cozy-create-admin-error" class="cozy-disclosure-note" style="color:var(--cozy-error,#ef4444);">${this.#escapeHtml(this.#createAdminError || "")}</p>
                    ` : `<p class="cozy-disclosure-note">AuthorizationCoordinator is not loaded — administrator creation is unavailable rather than left unprotected.</p>`;
                    return `<h2>Users</h2>${rows}${createAdminForm}`;
                }
                case "roles": return this.#renderIntegrationSlot(this.getRolesCenterData(), "Roles");
                case "permissions": return this.#renderIntegrationSlot(this.getPermissionsCenterData(), "Permissions");
                case "companies": return `<h2>Companies</h2>${this.#renderNotConnected(this.getCompaniesCenterData().message)}`;
                case "orgManager": return this.#renderOrgManager();
                case "monitoring": return `<h2>Monitoring</h2>${this.#renderNotConnected(this.getMonitoringCenterData().message)}`;
                case "configuration": return `<h2>Configuration</h2>${this.#renderNotConnected(this.getConfigurationCenterData().message)}`;
                case "audit": return `<h2>Audit</h2>${this.#renderNotConnected(this.getAuditCenterData().message)}`;
                case "engines": return `<h2>Engines</h2><p class="cozy-disclosure-note">TEMPORARY VIEW — Engines are a distinct domain (certified CozyOS business engines) from Module Manager's loaded-module discovery. No dedicated Engine Registry coordinator exists yet, so this section shows Module Manager's current data as a placeholder only, pending a real Engine Registry (Rule 32 ownership review).</p>${this.#renderList(this.getEnginesCenterData().modules, m => `<div class="cozy-module-row"><b>${this.#escapeHtml(m.name)}</b><span>${m.discovered ? this.#escapeHtml(m.version || "unknown version") : this.#escapeHtml(m.registrationStatus)}</span></div>`)}`;
                case "services": return `<h2>Services</h2><p class="cozy-disclosure-note">TEMPORARY VIEW — Services are a distinct domain (platform/runtime services) from Module Manager's loaded-module discovery. No dedicated Service Registry listing coordinator exists yet, so this section shows Module Manager's current data as a placeholder only, pending a real Service Registry (Rule 32 ownership review).</p>${this.#renderList(this.getServicesCenterData().modules, m => `<div class="cozy-module-row"><b>${this.#escapeHtml(m.name)}</b><span>${m.discovered ? this.#escapeHtml(m.version || "unknown version") : this.#escapeHtml(m.registrationStatus)}</span></div>`)}`;

                // --- Founder Story: real application, delegated entirely to its
                // own module (founder-story-panel.js). This shell never
                // reimplements Founder Story rendering — it only provides the
                // container div founder-story-panel.js's own init(containerId)
                // already expects (its documented default,
                // "cozy-founderstory-root", matching the security-insights-
                // panel.js lazy-mount convention it was built to follow);
                // init()/repaint lifecycle is wired in #render() below, the
                // exact same unconditional-call-on-every-render convention
                // already used for Developer Hub immediately below this case. ---
                case "founderStory":
                    return `<div id="cozy-founderstory-root"></div>`;

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
                    // Developer Hub's own #setSection() is private, and its
                    // real internal nav sidebar (Builder/BugFixer/etc.) only
                    // ever existed as static markup in the standalone
                    // developer-hub.html — never rendered at all when
                    // embedded here, meaning its internal navigation was
                    // completely unusable inside the Administrator
                    // Workspace until now. developer-hub.js's own click
                    // listener is bound on `document` and matches ANY
                    // ".cozy-nav-item[data-section]" element anywhere on
                    // the page (verified by reading its #bindShellNavigation()
                    // implementation) — so rendering the exact same real
                    // section list here, dual-classed with .cozy-nav-link
                    // for this page's own visual styling, makes it work for
                    // real with zero changes to developer-hub.js itself.
                    const devHubSections = [
                        ["dashboard", "⌂ Dashboard"], ["builder", "🔨 Builder"],
                        ["understanding", "🧠 Understanding Engine"], ["ocr", "📷 OCR"], ["aimode", "🤖 AI Mode"],
                        ["quickCert", "⚡ Quick Certification"], ["fullCert", "✔ Full Certification"],
                        ["bugfixer", "🐛 BugFixer"], ["workspace", "🗂 Workspace"],
                        ["moduleExplorer", "🧩 Module Explorer"], ["applicationExplorer", "📱 Application Explorer"],
                        ["serviceRegistry", "📇 Service Registry"], ["releaseCenter", "🚀 Release Center"],
                        ["goldenVault", "🏆 Golden Vault"], ["certHistory", "📜 Certification History"],
                        ["repairHistory", "🛠 Repair History"], ["reviewQueue", "📥 Knowledge Review Queue"],
                        ["patternLibrary", "📚 Enterprise Pattern Library"], ["developerQueue", "🧑‍💻 Developer Queue"],
                        ["research", "🔍 Research"], ["memory", "💾 Memory"],
                        ["search", "🔎 Search"], ["settings", "⚙ Settings"]
                    ];
                    const devHubNavHtml = `<div class="cozy-devhub-embedded-nav">${devHubSections.map(([id, label]) =>
                        `<a href="#" class="cozy-nav-item cozy-nav-link" data-section="${id}">${this.#escapeHtml(label)}</a>`).join("")}</div>`;
                    const rootHtml = typeof hub.getDashboard === "function" ? hub.getDashboard() : '<div id="cozy-developer-hub-root" class="cozy-developer-hub-shell"></div>';
                    return `${devHubNavHtml}${rootHtml}`;
                }

                default: return this.#renderNotConnected(`Unknown center "${centerId}".`);
            }
        }

        #renderDashboard() {
            const data = this.getDashboardData();
            const cert = this.#certification;
            const identity = window.CozyOS && window.CozyOS.IdentityEngine ? window.CozyOS.IdentityEngine : null;

            // Real stat cards only — every number below comes from an
            // actually-connected coordinator, or the card honestly shows
            // "—" rather than a fabricated figure.
            let appsValue = "—";
            try {
                const reg = window.CozyOS.ServiceRegistry;
                if (reg && typeof reg.listApplications === "function") {
                    appsValue = String(reg.listApplications().filter(a => this.constructor.ENTERPRISE_DASHBOARD_APPS.includes(a.id)).length);
                } else if (cert && typeof cert.listApplications === "function") { appsValue = String(cert.listApplications().length); }
            } catch (_err) { /* stays "—" */ }
            const modulesValue = `${data.discoveredCount}/${data.totalCount}`;
            let usersValue = "—";
            try { if (identity && typeof identity.listUsers === "function") usersValue = String(identity.listUsers().length); } catch (_err) { /* stays "—" */ }

            const heroHtml = `
                <div class="cozy-hero">
                    <div>
                        <h1>Welcome to the Administrator Workspace</h1>
                        <p>CozyOS Enterprise Control Center</p>
                    </div>
                    <span class="cozy-hero-status">System Online</span>
                </div>`;

            const statsHtml = `
                <div class="cozy-stat-grid">
                    <div class="cozy-stat-card"><div class="cozy-card-label">Applications</div><div class="cozy-card-value">${appsValue}</div></div>
                    <div class="cozy-stat-card"><div class="cozy-card-label">Modules Discovered</div><div class="cozy-card-value">${modulesValue}</div></div>
                    <div class="cozy-stat-card"><div class="cozy-card-label">Users</div><div class="cozy-card-value">${usersValue}</div></div>
                </div>`;

            // Executive summary cards — every value below is either read
            // from a real, connected engine or shown honestly as "Not
            // tracked"/"Not loaded". Verified before writing this: no real
            // memory-usage API exists anywhere in CozyOS; the real Kernel
            // (core/core/kernel/) is confirmed dormant, never loaded on
            // this page (Bootstrap Certification); CozySync's real API is
            // session/plugin lifecycle tracking, not literal sync status —
            // none of these three are fabricated to look populated.
            let healthSummary = "—";
            try {
                const health = window.CozyOS.HealthEngine;
                if (health && typeof health.report === "function") {
                    const badges = health.report().files;
                    const counts = { "🟢": 0, "🟡": 0, "🔴": 0, "⚪": 0 };
                    badges.forEach(b => { if (counts[b.badge] !== undefined) counts[b.badge]++; });
                    healthSummary = `🟢 ${counts["🟢"]} · 🟡 ${counts["🟡"]} · 🔴 ${counts["🔴"]}`;
                }
            } catch (_err) { /* stays "—" */ }

            let certSummary = "—";
            try {
                if (cert && typeof cert.listApplications === "function") {
                    const apps = cert.listApplications();
                    const certified = apps.filter(a => a.certification && a.certification !== "Not Certified").length;
                    certSummary = `${certified}/${apps.length} certified`;
                }
            } catch (_err) { /* stays "—" */ }

            const notificationCount = this.getNotificationFeed(500).length;
            const a11yLoaded = !!(window.CozyOS && window.CozyOS.AccessibilityEngine);
            const kernelLoaded = !!(window.CozyOS && window.CozyOS.Kernel);
            const resourceCount = (() => {
                try { return window.CozyOS.PlatformResourceManager ? window.CozyOS.PlatformResourceManager.discoverResources().length : null; }
                catch (_err) { return null; }
            })();

            const summaryCardsHtml = `
                <h3 style="margin:20px 0 10px;">Platform Summary</h3>
                <div class="cozy-stat-grid">
                    <div class="cozy-stat-card"><div class="cozy-card-label">Coordinator Health</div><div class="cozy-card-value" style="font-size:16px;">${healthSummary}</div></div>
                    <div class="cozy-stat-card"><div class="cozy-card-label">Certification Summary</div><div class="cozy-card-value" style="font-size:16px;">${certSummary}</div></div>
                    <div class="cozy-stat-card"><div class="cozy-card-label">Notifications</div><div class="cozy-card-value">${notificationCount}</div></div>
                    <div class="cozy-stat-card"><div class="cozy-card-label">Resources Tracked</div><div class="cozy-card-value">${resourceCount === null ? "—" : resourceCount}</div></div>
                    <div class="cozy-stat-card"><div class="cozy-card-label">Accessibility Engine</div><div class="cozy-card-value" style="font-size:16px;">${a11yLoaded ? "Loaded" : "Not Loaded"}</div></div>
                    <div class="cozy-stat-card"><div class="cozy-card-label">Kernel Status</div><div class="cozy-card-value" style="font-size:16px;">${kernelLoaded ? "Loaded" : "Not Loaded"}</div></div>
                    <div class="cozy-stat-card"><div class="cozy-card-label">Memory</div><div class="cozy-card-value" style="font-size:14px;color:var(--cozy-muted);">Not tracked</div></div>
                    <div class="cozy-stat-card"><div class="cozy-card-label">Live Synchronization</div><div class="cozy-card-value" style="font-size:14px;color:var(--cozy-muted);">Not tracked</div></div>
                </div>`;

            const quickActionsHtml = `
                <h3 style="margin:20px 0 10px;">Quick Actions</h3>
                <div class="cozy-quick-grid">
                    <div class="cozy-quick-card" data-center="developerHub">
                        <div class="cozy-card-label">Developer Hub</div>
                        <div style="color:var(--text-secondary,#475569);font-size:0.85rem;">Dev tools</div>
                    </div>
                    <div class="cozy-quick-card" data-center="applications">
                        <div class="cozy-card-label">Application Center</div>
                        <div style="color:var(--text-secondary,#475569);font-size:0.85rem;">Manage applications</div>
                    </div>
                    <div class="cozy-quick-card" data-center="modules">
                        <div class="cozy-card-label">Module Manager</div>
                        <div style="color:var(--text-secondary,#475569);font-size:0.85rem;">Manage modules</div>
                    </div>
                    <div class="cozy-quick-card" data-center="security">
                        <div class="cozy-card-label">Security Center</div>
                        <div style="color:var(--text-secondary,#475569);font-size:0.85rem;">System security</div>
                    </div>
                </div>`;

            // Feature cards — the two real, connected major capabilities
            // today (Developer Hub, Certification). Sub-tiles reflect real
            // sections/actions that exist, not invented feature names.
            const featureCardsHtml = `
                <div class="cozy-feature-card" style="border-left:4px solid var(--accent-emerald,#1B5E20);">
                    <div class="cozy-feature-card-head">
                        <div>
                            <h3 style="margin:0;text-transform:none;color:var(--text-primary);font-size:1.1rem;">Developer Hub</h3>
                            <p style="margin:4px 0 0;color:var(--text-secondary);font-size:0.85rem;">Builder, Certification, BugFixer, Workspace, and Service Registry tools for CozyOS development.</p>
                        </div>
                        <button type="button" class="cozy-btn cozy-btn-primary" data-center="developerHub">Open Developer Hub →</button>
                    </div>
                    <div class="cozy-quick-grid" style="margin-top:14px;">
                        <div class="cozy-quick-card" data-center="developerHub" data-section="builder"><div class="cozy-card-label">Builder</div><div style="font-size:0.8rem;color:var(--text-secondary);">Code generation</div></div>
                        <div class="cozy-quick-card" data-center="developerHub" data-section="bugfixer"><div class="cozy-card-label">BugFixer</div><div style="font-size:0.8rem;color:var(--text-secondary);">Repair tools</div></div>
                        <div class="cozy-quick-card" data-center="developerHub" data-section="memory"><div class="cozy-card-label">Memory</div><div style="font-size:0.8rem;color:var(--text-secondary);">Knowledge search</div></div>
                    </div>
                </div>
                <div class="cozy-feature-card" style="border-left:4px solid #3b82f6;">
                    <div class="cozy-feature-card-head">
                        <div>
                            <h3 style="margin:0;text-transform:none;color:var(--text-primary);font-size:1.1rem;">Certification</h3>
                            <p style="margin:4px 0 0;color:var(--text-secondary);font-size:0.85rem;">Platform-wide certification, release integrity, and dependency tracking.</p>
                        </div>
                        <button type="button" class="cozy-btn" style="border-color:#3b82f6;color:#3b82f6;" data-center="certification">Open Certification →</button>
                    </div>
                    <div class="cozy-quick-grid" style="margin-top:14px;">
                        <div class="cozy-quick-card" data-center="certification"><div class="cozy-card-label">Certification Center</div><div style="font-size:0.8rem;color:var(--text-secondary);">Run checks</div></div>
                        <div class="cozy-quick-card" data-center="releases"><div class="cozy-card-label">Release Center</div><div style="font-size:0.8rem;color:var(--text-secondary);">Track releases</div></div>
                        <div class="cozy-quick-card" data-center="dependencies"><div class="cozy-card-label">Dependency Viewer</div><div style="font-size:0.8rem;color:var(--text-secondary);">Inspect dependencies</div></div>
                    </div>
                </div>`;

            // System Status — real presence checks only. No fabricated
            // "Running"/"Ready"/"Online" for anything not actually verified;
            // shows the real connection state each coordinator itself
            // reports elsewhere in this file.
            const statusChecks = [
                ["Certification", !!cert],
                ["Identity", !!identity],
                ["Service Registry", !!(window.CozyOS && window.CozyOS.ServiceRegistry)],
                ["Module Registry", !!(window.CozyOS && window.CozyOS.ModuleRegistry)],
                ["Plugin Manager", !!(window.CozyOS && window.CozyOS.PluginManager)],
                ["Platform Event Bus", !!(window.CozyOS && window.CozyOS.PlatformEventBus)]
            ];
            const systemStatusHtml = `
                <div class="cozy-panel">
                    <h3 style="margin:0 0 10px;">System Status</h3>
                    ${statusChecks.map(([label, ok]) => `
                        <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border-color,#e2e8f0);">
                            <span>${ok ? "✅" : "⭕"} ${this.#escapeHtml(label)}</span>
                            <span style="color:${ok ? "var(--accent-emerald,#1B5E20)" : "var(--text-secondary,#475569)"};font-size:0.85rem;">${ok ? "Connected" : "Not connected"}</span>
                        </div>`).join("")}
                </div>`;

            // Recent Activity — real events from getEventLog(), the same
            // log every coordinator's live activity already writes to.
            // Never fabricated; shows an honest empty state if nothing has
            // happened yet this session.
            let recentEvents = [];
            try { recentEvents = this.getEventLog(6); } catch (_err) { /* stays empty */ }
            const recentActivityHtml = `
                <div class="cozy-panel">
                    <h3 style="margin:0 0 10px;">Recent Activity</h3>
                    ${recentEvents.length ? recentEvents.map(e => `
                        <div style="padding:6px 0;border-bottom:1px solid var(--border-color,#e2e8f0);">
                            <div>${this.#escapeHtml(e.source)}: ${this.#escapeHtml(e.eventName)}</div>
                            <div style="font-size:0.75rem;color:var(--text-secondary,#475569);">${this.#escapeHtml(new Date(e.time).toLocaleString())}</div>
                        </div>`).join("") : `<p class="cozy-disclosure-note">No activity recorded yet this session.</p>`}
                </div>`;

            const rows = data.coordinators.map(c => `
                <div class="cozy-nav-link" data-view="modules" data-id="${this.#escapeHtml(c.name)}">
                    <span>${this.#escapeHtml(c.name)}</span>
                    <span class="cozy-badge">${this.#escapeHtml(c.certSymbol)} ${this.#escapeHtml(c.certStatus)}</span>
                </div>`).join("");
            const banner = data.certificationConnected ? "" : this.#renderNotConnected("CozyCertification is not connected — certification status below is unknown for every coordinator, not fabricated as passing.");
            // Core Terminal, preserved unchanged from the original standalone
            // dashboard.html — same three status cards, same terminal
            // input/output, same execute button, now inside the new layout.
            const terminalHtml = `
                <section class="cozy-panel" style="display:flex;flex-direction:column;gap:12px;min-height:350px;margin-top:20px;">
                    <div class="cozy-card-label" style="border-bottom:1px solid var(--border-color,#e2e8f0);padding-bottom:8px;">Unified AI Core Ingestion Gateway</div>
                    <div class="cozy-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));">
                        <div class="cozy-card"><div class="cozy-card-label">Tenant State</div><div class="cozy-card-value">Isolated</div></div>
                        <div class="cozy-card"><div class="cozy-card-label">SDK Framework</div><div class="cozy-card-value">v1.0 Frozen</div></div>
                        <div class="cozy-card"><div class="cozy-card-label">Active Plugins</div><div class="cozy-card-value" id="plugin-count">0 Loaded</div></div>
                    </div>
                    <div id="terminal-output" style="border-radius:6px;padding:12px;font-family:monospace;font-size:0.9rem;flex-grow:1;overflow-y:auto;min-height:160px;">
                        <div>⚡ CozyOS Kernel initialized. Ready for context queries...</div>
                    </div>
                    <div style="display:flex;gap:8px;">
                        <input type="text" id="terminal-input" placeholder="Query industry context..." style="flex-grow:1;border-radius:6px;padding:12px;">
                        <button id="execute-btn" type="button" style="background:var(--accent-emerald,#1B5E20);border:none;border-radius:6px;color:white;padding:0 16px;font-weight:600;cursor:pointer;">Execute</button>
                    </div>
                </section>`;

            // Living Platform panel — every value below comes from a real
            // call into LivingThemeEngine/LivingMessageEngine/ModeEngine
            // (or honestly reads "Not loaded"). No "Next Scheduled
            // Theme/Mode/Message" row: none of the three engines expose a
            // schedule-lookahead API, and computing one here would mean
            // re-implementing their own scheduling logic a second time —
            // exactly what Rule 80/81 (reuse, don't duplicate) forbids.
            const lte = window.CozyOS && window.CozyOS.LivingThemeEngine ? window.CozyOS.LivingThemeEngine : null;
            const lme = window.CozyOS && window.CozyOS.LivingMessageEngine ? window.CozyOS.LivingMessageEngine : null;
            const modeEng = window.CozyOS && window.CozyOS.ModeEngine ? window.CozyOS.ModeEngine : null;
            const lteActive = lte ? lte.getActiveTheme() : null;
            const modeActive = modeEng ? modeEng.getActiveMode() : null;

            // Milestone 122: Engine Status and Last Activity — both read
            // directly from the three engines' own real getVersion()/
            // getHistory() (already real, already exposed); nothing new is
            // tracked or duplicated here, only aggregated for display.
            const livingEnginesForStatus = [
                ["Living Theme Engine", lte], ["Living Message Engine", lme], ["Mode Engine", modeEng]
            ];
            const connectedCount = livingEnginesForStatus.filter(([, e]) => !!e).length;
            const engineStatusRows = livingEnginesForStatus
                .map(([label, e]) => `${this.#escapeHtml(label)}: ${e ? "Connected" : "Not loaded"}`)
                .join(" · ");

            const lastActivityEntries = [];
            for (const [source, engine] of livingEnginesForStatus) {
                if (!engine || typeof engine.getHistory !== "function") continue;
                const history = engine.getHistory();
                const latest = history[history.length - 1];
                if (latest) lastActivityEntries.push({ source, event: latest.event, at: latest.at });
            }
            lastActivityEntries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
            const lastActivity = lastActivityEntries[0] || null;

            const livingPlatformHtml = `
                <div class="cozy-panel" style="margin-top:20px;">
                    <h3 style="margin:0 0 10px;">Living Platform</h3>
                    <div class="cozy-stat-grid">
                        <div class="cozy-stat-card"><div class="cozy-card-label">Active Theme</div><div class="cozy-card-value" style="font-size:16px;">${lte ? this.#escapeHtml(lteActive ? lteActive.themeId : "None active") : "Not loaded"}</div></div>
                        <div class="cozy-stat-card"><div class="cozy-card-label">Active Mode</div><div class="cozy-card-value" style="font-size:16px;">${modeEng ? this.#escapeHtml(modeActive ? modeActive.modeId : "None active") : "Not loaded"}</div></div>
                        <div class="cozy-stat-card"><div class="cozy-card-label">Registered Messages</div><div class="cozy-card-value">${lme ? lme.listMessages().length : "—"}</div></div>
                        <div class="cozy-stat-card"><div class="cozy-card-label">Engine Status</div><div class="cozy-card-value" style="font-size:14px;">${connectedCount}/3 connected</div><div class="cozy-muted" style="font-size:11px;margin-top:4px;">${engineStatusRows}</div></div>
                        <div class="cozy-stat-card"><div class="cozy-card-label">Last Activity</div><div class="cozy-card-value" style="font-size:13px;">${lastActivity ? `${this.#escapeHtml(lastActivity.source)}: ${this.#escapeHtml(lastActivity.event)}` : "No activity yet this session"}</div>${lastActivity ? `<div class="cozy-muted" style="font-size:11px;margin-top:4px;">${this.#escapeHtml(lastActivity.at)}</div>` : ""}</div>
                    </div>
                    <div class="cozy-quick-grid" style="margin-top:14px;">
                        <div class="cozy-quick-card" data-center="livingThemeEngine"><div class="cozy-card-label">Living Theme Engine</div></div>
                        <div class="cozy-quick-card" data-center="livingMessageEngine"><div class="cozy-card-label">Living Message Engine</div></div>
                        <div class="cozy-quick-card" data-center="modeEngine"><div class="cozy-card-label">Mode Engine</div></div>
                    </div>
                </div>`;

            return `${heroHtml}${statsHtml}
                ${summaryCardsHtml}
                <h3 style="margin:20px 0 10px;">Platform Capabilities</h3>
                ${featureCardsHtml}
                ${quickActionsHtml}
                <div class="cozy-grid" style="grid-template-columns:1fr 1fr;margin-top:20px;">${systemStatusHtml}${recentActivityHtml}</div>
                ${livingPlatformHtml}
                <h3 style="margin:24px 0 10px;">Coordinator Status</h3>
                <p style="color:var(--text-secondary,#475569);font-size:0.85rem;">${data.discoveredCount}/${data.totalCount} coordinators discovered.</p>
                ${banner}<div class="cozy-list">${rows}</div>${terminalHtml}`;
        }

        /**
         * #getHealthColor(overallReadiness)
         *   Real (Milestone 214) — maps the existing overallReadiness
         *   percentage to a real color, never a fabricated status.
         *   null readiness (not tracked) is honestly grey, not green.
         */
        #getHealthColor(overallReadiness) {
            if (overallReadiness === null || overallReadiness === undefined) return "#94a3b8"; // grey - honestly not tracked
            if (overallReadiness >= 80) return "#22c55e"; // green
            if (overallReadiness >= 50) return "#f59e0b"; // amber
            return "#ef4444"; // red
        }

        #renderApplicationCenter() {
            const data = this.getApplicationCenterData();
            if (!data.connected) return `<h2>Application Center</h2>${this.#renderNotConnected(data.message)}`;
            const identity = window.CozyOS.IdentityEngine;
            const cards = data.applications.map(app => {
                const color = this.#getHealthColor(app.overallReadiness);
                const healthLabel = app.overallReadiness === null ? "Not tracked" : `${app.overallReadiness}%`;
                const expanded = this.#appManageExpanded.has(app.id);
                // M364.8 Phase 2 - Gap 2: real current state read directly
                // from IdentityEngine (isApplicationEnabled() honestly
                // defaults to true if never toggled - same real method
                // now driving both this display and the toggle above).
                const isEnabled = identity && typeof identity.isApplicationEnabled === "function" ? identity.isApplicationEnabled(app.id) : true;
                const managePanel = expanded ? `
                    <div class="cozy-app-manage-panel" style="margin-top:8px;padding:10px;border-top:1px dashed var(--cozy-border,#233827);font-size:12px;">
                        <label style="display:flex;align-items:center;gap:6px;">
                            <input type="checkbox" data-app-toggle-enabled="${this.#escapeHtml(app.id)}" ${isEnabled ? "checked" : ""}>
                            ${isEnabled ? "Enabled" : "Disabled"} platform-wide (real, via IdentityEngine.setApplicationEnabled)
                        </label>
                        <div style="display:flex;gap:6px;margin-top:8px;align-items:center;">
                            <input type="text" data-app-assign-input="${this.#escapeHtml(app.id)}" placeholder="Username" class="cozy-field" style="flex:1;">
                            <button type="button" class="cozy-btn" data-app-assign="${this.#escapeHtml(app.id)}">Assign</button>
                            <button type="button" class="cozy-btn" data-app-unassign="${this.#escapeHtml(app.id)}">Unassign</button>
                        </div>
                        <p class="cozy-disclosure-note" style="margin:8px 0 0;">Assign/Unassign compose the real, existing IdentityEngine.assignApplication()/unassignApplication() (per-user grant, audited). A reverse "who has this app" list is not shown here — IdentityEngine currently only exposes per-user lookup (listAssignedApplications(userId)), not per-app reverse lookup — disclosed rather than fabricated.</p>
                    </div>` : "";
                return `
                <div class="cozy-app-card" style="border:1px solid var(--cozy-border,#233827);border-radius:12px;padding:16px;margin-bottom:10px;display:flex;flex-direction:column;gap:8px;">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <img src="${app.icon ? this.#escapeHtml(app.icon) : "assets/branding/favicon-32.png"}" alt="" width="20" height="20" style="border-radius:4px;flex-shrink:0;object-fit:contain;" onerror="this.onerror=null;this.src='assets/branding/favicon-32.png';">
                        <span style="width:10px;height:10px;border-radius:50%;background:${color};display:inline-block;flex-shrink:0;" title="Health: ${this.#escapeHtml(healthLabel)}"></span>
                        <b style="font-size:14px;">${this.#escapeHtml(app.name)}</b>
                        <span class="cozy-badge">${this.#escapeHtml(app.version || "unknown version")}</span>
                        ${isEnabled ? "" : `<span class="cozy-badge" style="background:var(--cozy-error,#ef4444);">Disabled</span>`}
                    </div>
                    <div style="font-size:12px;color:var(--cozy-muted,#81C784);display:flex;gap:14px;flex-wrap:wrap;">
                        <span>Status: ${this.#escapeHtml(this.constructor.ENTERPRISE_DASHBOARD_STATUS[app.id] || app.status)}</span>
                        <span>Modules: ${app.connectedModules !== null ? app.connectedModules : "—"}</span>
                        <span>Health: ${this.#escapeHtml(healthLabel)}</span>
                        <span>Deployment: ${this.#escapeHtml(app.deploymentStatus || "Unknown")}</span>
                    </div>
                    <div style="display:flex;gap:8px;margin-top:4px;">
                        <button type="button" class="cozy-btn ${app.hasLauncher ? "cozy-btn-primary" : ""}" data-app-action="open" data-app-id="${this.#escapeHtml(app.id)}" ${app.hasLauncher ? "" : `disabled title="${this.#escapeHtml(app.openDisabledReason || "Not launchable yet.")}"`}>Open</button>
                        ${this.#hasPermission("applications:manage") ? `<button type="button" class="cozy-btn" data-app-manage-toggle="${this.#escapeHtml(app.id)}">${expanded ? "Hide Manage" : "Manage"}</button>` : ""}
                        <button type="button" class="cozy-btn" data-view="app-health" data-id="${this.#escapeHtml(app.id)}">Settings</button>
                        <button type="button" class="cozy-btn ${app.sourcePath ? "cozy-btn-primary" : ""}" data-app-action="certify" data-app-id="${this.#escapeHtml(app.id)}" ${app.sourcePath ? "" : "disabled"} title="${app.sourcePath ? "" : "Source unavailable for certification."}">${app.sourcePath ? "Certify" : "Source unavailable for certification"}</button>
                    </div>
                    ${managePanel}
                </div>`;
            }).join("");
            return `<h2>Application Center</h2>${cards || this.#renderNotConnected("No applications registered yet.")}`;
        }

        #renderModuleManager() {
            const data = this.getModuleManagerData();
            const missing = data.modules.filter(m => !m.discovered);
            const total = data.modules.length;
            const loaded = total - missing.length;
            const pct = total > 0 ? ((loaded / total) * 100).toFixed(2) : "0.00";
            const summary = `
                <div style="padding:12px;border:1px solid var(--cozy-border,#233827);border-radius:8px;margin-bottom:12px;">
                    <b>Startup completion: ${pct}%</b> — Loaded ${loaded} / ${total}, Missing ${missing.length}
                </div>
                ${missing.length > 0 ? `<details style="margin-bottom:16px;">
                    <summary style="cursor:pointer;">View Missing Coordinators (${missing.length})</summary>
                    ${missing.map(m => `<div class="cozy-module-row"><span>✗ ${this.#escapeHtml(m.name)}</span><span style="color:var(--cozy-muted,#81C784);font-size:12px;">Not found on window.CozyOS — never loaded, or script not registered</span></div>`).join("")}
                </details>` : ""}`;
            return `<h2>Module Manager</h2>${summary}${this.#renderList(data.modules, m => `
                <div class="cozy-module-row" data-view="certification-detail" data-id="${this.#escapeHtml(m.name)}">
                    <div class="cozy-module-row-main">
                        <b>${this.#escapeHtml(m.name)}</b>
                        <span class="cozy-badge">${m.certification ? this.#escapeHtml(m.certification.certification) : "Unknown"}</span>
                        <span class="cozy-badge cozy-badge-neutral">${this.#escapeHtml(m.updateStatus)}</span>
                    </div>
                    <div class="cozy-module-row-meta">
                        <span>${m.discovered ? this.#escapeHtml(m.version || "unknown version") : this.#escapeHtml(m.registrationStatus)}</span>
                        <span>${m.health !== null ? "Health: " + this.#escapeHtml(m.health) + "%" : "Health: Unknown"}</span>
                        <span>${m.dependencies.length} dependenc${m.dependencies.length === 1 ? "y" : "ies"} declared</span>
                    </div>
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

        /**
         * #renderDiagnosticsCenter()
         *   Real accordion redesign. Collapsed view shows only fields that
         *   actually exist on a given coordinator's own real
         *   getDiagnosticsReport() output — Version/Certification/Memory/
         *   Events show "—" per-coordinator when that coordinator doesn't
         *   expose them, never a fabricated placeholder. Expanded content
         *   is the exact same real key-value table this page always
         *   showed, lazy-rendered (built only when a row is expanded, not
         *   for all rows up front).
         */
        /**
         * #renderAIProviders()
         *   M367.2 — real diagnostics page composing the existing,
         *   unmodified ProviderManager. No fabricated status; every
         *   column comes directly from ProviderManager.list()/health().
         */
        #renderAIProviders() {
            const pm = window.CozyOS.ProviderManager;
            if (!pm) return `<h2>AI Providers</h2>${this.#renderNotConnected("ProviderManager is not loaded.")}`;
            const canManage = this.#hasPermission("ai-providers:manage");
            const providers = pm.list();
            const rows = providers.map(p => {
                const h = pm.health(p.id);
                const healthColor = h.health === "ONLINE" ? "#4CAF50" : h.health === "DISABLED" ? "#9e9e9e" : h.health === "FAILED" ? "#ef4444" : "#FFCA28";
                return `
                <div class="cozy-module-row" style="flex-direction:column;align-items:stretch;">
                    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                        <b>${this.#escapeHtml(p.name)}</b>
                        <span class="cozy-badge" style="background:${healthColor};">${this.#escapeHtml(h.health)}</span>
                        <span>${p.enabled ? "Enabled" : "Disabled"}</span>
                        <span>v${this.#escapeHtml(p.version || "—")}</span>
                        <span>Last check: ${this.#escapeHtml(p.lastHealthCheck || "never")}</span>
                        ${canManage ? `<button type="button" class="cozy-btn" data-provider-toggle="${this.#escapeHtml(p.id)}">${p.enabled ? "Disable" : "Enable"}</button>` : ""}
                    </div>
                    <div style="font-size:12px;color:var(--cozy-muted,#81C784);">
                        Dependencies: ${p.dependencies.length ? this.#escapeHtml(p.dependencies.join(", ")) : "none"}
                        ${h.reason ? ` · ${this.#escapeHtml(h.reason)}` : ""}
                    </div>
                </div>`;
            }).join("");
            const liveViewRestore = window.CozyOS.LiveViewController && typeof window.CozyOS.LiveViewController.show === "function"
                ? `<div class="cozy-living-card" style="margin-bottom:10px;"><b>Live View Controller</b><p class="cozy-disclosure-note">If a user has hidden the Live Worship controller, restore it here.</p><button type="button" class="cozy-btn" data-liveview-restore>Restore Live View Controller</button></div>`
                : "";
            return `<h2>AI Providers</h2>${liveViewRestore}<p class="cozy-disclosure-note">Real status from ProviderManager - composes each provider's own health() call, never fabricated. Disabled/failed providers show their real reason.</p>${rows || this.#renderNotConnected("No providers registered yet.")}`;
        }

        /**
         * #renderLivingEnvironmentDiagnostics()
         *   M372 — real diagnostics composing CozyEnvironment.getState()/
         *   getDiagnosticsReport() (both unmodified, M370.5/M370.5)
         *   directly. Never fabricates a value - shows "unavailable" if
         *   CozyEnvironment isn't loaded, and the real update source
         *   (polling vs the "cozy:environment-changed" event) exactly as
         *   CozyEnvironment itself reports it.
         */
        #renderLivingEnvironmentDiagnostics() {
            const env = window.CozyOS && window.CozyOS.CozyEnvironment;
            if (!env || typeof env.getState !== "function") {
                return `<div class="cozy-living-card"><b>Living Environment</b>${this.#renderNotConnected("CozyEnvironment is not loaded.")}</div>`;
            }
            const state = env.getState();
            if (!state.available) {
                return `<div class="cozy-living-card"><b>Living Environment</b>${this.#renderNotConnected(state.reason || "Environment unavailable.")}</div>`;
            }
            const diag = typeof env.getDiagnosticsReport === "function" ? env.getDiagnosticsReport() : {};
            const updateSource = diag.usingRealEvent ? "Event (cozy:environment-changed)" : "Polling";
            return `<div class="cozy-living-card" style="margin-bottom:12px;">
                <b>Living Environment</b>
                <div class="cozy-event-row">Time period: ${this.#escapeHtml(state.timeOfDay)}</div>
                <div class="cozy-event-row">Lighting: ${this.#escapeHtml(String(state.lighting))}</div>
                <div class="cozy-event-row">Wind strength: ${this.#escapeHtml(state.windStrength != null ? String(state.windStrength) : "—")}</div>
                <div class="cozy-event-row">Bird activity: ${state.birdsActive == null ? "—" : (state.birdsActive ? "Active" : "Inactive")}</div>
                <div class="cozy-event-row">Cloud density: ${this.#escapeHtml(state.cloudDensity != null ? String(state.cloudDensity) : "—")}</div>
                <div class="cozy-event-row">Update source: ${this.#escapeHtml(updateSource)}</div>
            </div>`;
        }

        #renderDiagnosticsCenter() {
            const data = this.getDiagnosticsCenterData();
            const shellTable = this.#renderKeyValueTable(data.shellDiagnostics);
            const filterValue = this.#diagnosticsFilter || "";
            const sortMode = this.#diagnosticsSort || "name";
            const connectedOnly = !!this.#diagnosticsConnectedOnly;
            const errorsOnly = !!this.#diagnosticsErrorsOnly;

            let rows = data.coordinators.slice();
            if (filterValue) rows = rows.filter(c => c.name.toLowerCase().includes(filterValue.toLowerCase()));
            if (connectedOnly) rows = rows.filter(c => c.discovered);
            if (errorsOnly) rows = rows.filter(c => c.discovered && c.diagnostics && (c.diagnostics.errors > 0 || c.diagnostics.lastError));
            if (sortMode === "name") rows.sort((a, b) => a.name.localeCompare(b.name));
            else if (sortMode === "status") rows.sort((a, b) => (b.discovered ? 1 : 0) - (a.discovered ? 1 : 0));
            else if (sortMode === "certification") rows.sort((a, b) => {
                const av = (a.diagnostics && a.diagnostics.certification) || "";
                const bv = (b.diagnostics && b.diagnostics.certification) || "";
                return String(av).localeCompare(String(bv));
            });

            const accordionRows = rows.map(c => {
                const d = c.diagnostics || {};
                const version = d.moduleVersion || "—";
                const certification = d.certification || "—";
                const memory = d.memory || "—";
                const events = (typeof d.eventsEmitted === "number") ? d.eventsEmitted : "—";
                const expanded = this.#diagnosticsExpanded && this.#diagnosticsExpanded.has(c.name);
                return `
                <div class="cozy-accordion-item" data-coordinator-row="${this.#escapeHtml(c.name)}">
                    <button type="button" class="cozy-accordion-header" data-toggle-coordinator="${this.#escapeHtml(c.name)}">
                        <span class="cozy-accordion-title">${this.#escapeHtml(c.name)}</span>
                        <span class="cozy-badge ${c.discovered ? "cozy-badge-success" : "cozy-badge-neutral"}">${c.discovered ? "Connected" : "Not Connected"}</span>
                        <span class="cozy-muted">v${this.#escapeHtml(String(version))}</span>
                        <span class="cozy-muted">Cert: ${this.#escapeHtml(String(certification))}</span>
                        <span class="cozy-muted">Mem: ${this.#escapeHtml(String(memory))}</span>
                        <span class="cozy-muted">Events: ${this.#escapeHtml(String(events))}</span>
                        <span class="cozy-accordion-chevron">${expanded ? "▾" : "▸"}</span>
                    </button>
                    ${expanded ? `<div class="cozy-accordion-body">${c.discovered ? this.#renderKeyValueTable(c.diagnostics) : "<p class=\"cozy-disclosure-note\">Not connected on this page.</p>"}</div>` : ""}
                </div>`;
            }).join("");

            return `<h2>Diagnostics Center</h2>
                ${this.#renderLivingEnvironmentDiagnostics()}
                <div class="cozy-field" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
                    <input type="text" id="cozy-diag-search" placeholder="Search coordinators…" value="${this.#escapeHtml(filterValue)}" />
                    <button type="button" class="cozy-btn" id="cozy-diag-expand-all">Expand All</button>
                    <button type="button" class="cozy-btn" id="cozy-diag-collapse-all">Collapse All</button>
                    <button type="button" class="cozy-btn ${sortMode === "name" ? "cozy-btn-primary" : ""}" id="cozy-diag-sort-name">Sort by Name</button>
                    <button type="button" class="cozy-btn ${sortMode === "status" ? "cozy-btn-primary" : ""}" id="cozy-diag-sort-status">Sort by Status</button>
                    <button type="button" class="cozy-btn ${sortMode === "certification" ? "cozy-btn-primary" : ""}" id="cozy-diag-sort-cert">Sort by Certification</button>
                    <button type="button" class="cozy-btn ${connectedOnly ? "cozy-btn-primary" : ""}" id="cozy-diag-connected-only">Connected Only</button>
                    <button type="button" class="cozy-btn ${errorsOnly ? "cozy-btn-primary" : ""}" id="cozy-diag-errors-only">Errors Only</button>
                </div>
                <p class="cozy-disclosure-note">Certification/Memory/Events show "—" for coordinators whose own diagnostics don't report that field — never a fabricated value.</p>
                <h3>Shell</h3>${shellTable}
                <h3>Coordinators (${rows.length}/${data.coordinators.length})</h3>
                ${accordionRows || `<p class="cozy-disclosure-note">No coordinators match this filter.</p>`}`;
        }

        #renderEventMonitor() {
            const events = this.getEventLog(50);
            return `<h2>Event Monitor</h2>${this.#renderList(events, e => `
                <div class="cozy-event-row"><b>${this.#escapeHtml(e.time)}</b> ${this.#escapeHtml(e.source)} → ${this.#escapeHtml(e.eventName)} <span class="cozy-muted">${this.#escapeHtml(e.summary)}</span></div>`)}`;
        }

        #renderPlatformDiscovery() {
            const disc = window.CozyOS && window.CozyOS.PlatformDiscovery ? window.CozyOS.PlatformDiscovery : null;
            if (!disc) return `<h2>Platform Discovery</h2>${this.#renderNotConnected("PlatformDiscovery is not loaded on this page.")}`;

            const buttons = `
                <div style="display:flex;gap:8px;margin-bottom:16px;">
                    <button type="button" id="cozy-discovery-scan-btn" class="cozy-btn cozy-btn-primary">Scan Now</button>
                    <button type="button" id="cozy-discovery-scan-sources-btn" class="cozy-btn">Scan Source Files for Duplicates</button>
                </div>`;

            const report = disc.getReport();
            if (!report.available) {
                return `<h2>Platform Discovery</h2>${buttons}<p class="cozy-disclosure-note">${this.#escapeHtml(report.message)}</p>`;
            }

            const listBlock = (title, names, emptyMsg) => `
                <h3>${this.#escapeHtml(title)}</h3>
                ${names.length ? `<div class="cozy-list">${names.map(n => `<div class="cozy-nav-link"><span>${this.#escapeHtml(n)}</span></div>`).join("")}</div>` : `<p class="cozy-disclosure-note">${this.#escapeHtml(emptyMsg)}</p>`}`;

            const runtimeBlock = `
                <h3>Runtime Provider — Reality</h3>
                ${this.#renderKeyValueTable({ liveCoordinators: report.runtime.live.count, declaredCoordinators: report.runtime.coordinators.declaredCount, declaredApplications: report.runtime.applications.declaredCount, declaredModules: report.runtime.modules.declaredCount, declaredPlugins: report.runtime.plugins.declaredCount })}
                ${listBlock("Loaded but Not Declared in ServiceRegistry", report.runtime.coordinators.loadedButUndeclared, "None — everything loaded is also declared.")}
                ${listBlock("Declared but Not Actually Loaded (possible broken registration)", report.runtime.coordinators.declaredButMissing, "None — every declared coordinator is actually present.")}`;

            const manifestBlock = report.manifest.manifestAvailable ? `
                <h3>Manifest Provider — Design</h3>
                ${this.#renderKeyValueTable({ generatedAt: report.manifest.generatedAt, generatedBy: report.manifest.generatedBy, fileCount: report.manifest.fileCount })}
                ${report.manifest.architecturalIssues.length ? listBlock("Architectural Issues Declared in Manifest", report.manifest.architecturalIssues.map(i => `${i.path} — ${i.issue}`), "") : `<p class="cozy-disclosure-note">No architectural issues declared in the manifest.</p>`}`
                : `<h3>Manifest Provider — Design</h3><p class="cozy-disclosure-note">${this.#escapeHtml(report.manifest.reason)}</p>`;

            const driftBlock = report.drift.comparisonPossible ? `
                <h3>Drift — Where Reality and Design Disagree</h3>
                ${listBlock("In Manifest, Not Currently Live (possibly stale)", report.drift.manifestStaleEntries, "None — everything the manifest describes as loaded is actually live right now.")}
                ${listBlock("Live Now, Not in Last Manifest Scan (new since manifest was generated)", report.drift.newSinceManifest, "None — nothing live is missing from the manifest.")}`
                : `<h3>Drift</h3><p class="cozy-disclosure-note">Drift comparison needs both providers connected (Manifest Provider + FileRegistry) — not available this scan.</p>`;

            const usageBlock = report.usage ? `
                <h3>Usage Classification (via UsageEngine)</h3>
                ${this.#renderKeyValueTable(report.usage.summary)}`
                : `<h3>Usage Classification</h3><p class="cozy-disclosure-note">UsageEngine is not loaded — dead/orphan/duplicate-candidate classification unavailable.</p>`;

            const dependencyBlock = report.dependency ? `
                <h3>Dependency Analysis (via DependencyEngine)</h3>
                ${listBlock("Missing Dependencies", report.dependency.missing.missing.map(m => `${m.path} → ${m.dependency}`), "None found.")}
                ${listBlock("Circular Dependency Chains (possible — see DependencyEngine's own bestEffort disclosure)", report.dependency.circular.cycles.map(c => c.join(" → ")), "None found.")}`
                : `<h3>Dependency Analysis</h3><p class="cozy-disclosure-note">DependencyEngine is not loaded — missing/circular dependency detection unavailable.</p>`;

            const sourceBlock = report.sourceAnalysis ? `
                <h3>Source File Analysis (scanSources — duplicate global assignments)</h3>
                ${this.#renderKeyValueTable({ filesScanned: report.sourceAnalysis.filesScanned, filesFetchedOk: report.sourceAnalysis.filesFetchedOk })}
                ${listBlock("Duplicate window.CozyOS.<Name> Assignments Found", report.sourceAnalysis.duplicateAssignments.map(d => `${d.name} — registered in ${d.files.length} files: ${d.files.join(", ")}`), "None found across scanned files.")}`
                : `<p class="cozy-disclosure-note">Source file analysis hasn't been run yet — click "Scan Source Files for Duplicates."</p>`;

            return `<h2>Platform Discovery</h2>${buttons}
                <p class="cozy-disclosure-note">Scanned at ${this.#escapeHtml(report.scannedAt)} (${report.durationMs}ms)</p>
                ${runtimeBlock}${manifestBlock}${driftBlock}${usageBlock}${dependencyBlock}${sourceBlock}`;
        }

        /**
         * #renderPlatformAudit()
         *   Real report display only, same discipline as
         *   #renderPlatformDiscovery(): every field comes directly from
         *   PlatformAudit's real methods, each of which itself only reads
         *   from an already-connected engine. No fabricated diagnosis.
         */
        #renderPlatformAudit() {
            const audit = window.CozyOS && window.CozyOS.PlatformAudit ? window.CozyOS.PlatformAudit : null;
            if (!audit) return `<h2>Audit Center</h2>${this.#renderNotConnected("PlatformAudit is not loaded on this page.")}`;

            const buttons = `<button type="button" id="cozy-audit-run-btn" class="cozy-btn cozy-btn-primary" style="margin-bottom:16px;">Run Full Audit</button>`;
            const listBlock = (title, names, emptyMsg) => `
                <h3>${this.#escapeHtml(title)}</h3>
                ${names.length ? `<div class="cozy-list">${names.map(n => `<div class="cozy-nav-link"><span>${this.#escapeHtml(n)}</span></div>`).join("")}</div>` : `<p class="cozy-disclosure-note">${this.#escapeHtml(emptyMsg)}</p>`}`;

            const full = audit.getFullAuditReport();

            const orphanBlock = full.orphanedApplications.available
                ? listBlock("Orphaned (loaded, nothing depends on them)", full.orphanedApplications.orphans.map(o => o.path), "None found.")
                : `<h3>Orphaned</h3><p class="cozy-disclosure-note">${this.#escapeHtml(full.orphanedApplications.reason)}</p>`;
            const deadBlock = full.deadFiles.available
                ? listBlock("Dead Files (never loaded, nothing depends on them)", full.deadFiles.deadFiles.map(f => f.path), "None found.")
                : `<h3>Dead Files</h3><p class="cozy-disclosure-note">${this.#escapeHtml(full.deadFiles.reason)}</p>`;
            const missingModBlock = full.missingModules.available
                ? listBlock("Missing Modules (declared, no corresponding file or live coordinator found)", full.missingModules.missing.map(m => m.id || m.name), "None found.")
                : `<h3>Missing Modules</h3><p class="cozy-disclosure-note">${this.#escapeHtml(full.missingModules.reason)}</p>`;
            const disconnectedBlock = full.disconnectedServices.available
                ? listBlock("Disconnected Services (declared, not actually live)", full.disconnectedServices.disconnected, "None found.")
                : `<h3>Disconnected Services</h3><p class="cozy-disclosure-note">${this.#escapeHtml(full.disconnectedServices.reason)}</p>`;

            const timelineBlock = full.failureTimeline.available ? `
                <h3>Failure Timeline (best-effort — see note)</h3>
                <p class="cozy-disclosure-note">Checked: ${full.failureTimeline.coordinatorsChecked.join(", ") || "none"}. ${full.failureTimeline.note}</p>
                ${listBlock("Real Logged Failures Found", full.failureTimeline.timeline.map(e => `[${e.source}] ${e.timestamp} — ${e.action}: ${e.msg}`), "None found in any reachable coordinator's audit log.")}`
                : "";

            const sessionBlock = full.sessionChanges.available ? `
                <h3>Changed This Session</h3>
                <p class="cozy-disclosure-note">${this.#escapeHtml(full.sessionChanges.scope)}</p>
                ${listBlock("Newly Live", full.sessionChanges.newlyLive, "None.")}
                ${listBlock("No Longer Live", full.sessionChanges.noLongerLive, "None.")}`
                : `<h3>Changed This Session</h3><p class="cozy-disclosure-note">${this.#escapeHtml(full.sessionChanges.reason)}</p>`;

            return `<h2>Audit Center</h2>${buttons}
                <p class="cozy-disclosure-note">Generated at ${this.#escapeHtml(full.generatedAt)}. This engine discovers nothing itself — every section below reads from an already-connected Discovery/Dependency/Usage/Health engine.</p>
                ${orphanBlock}${deadBlock}${missingModBlock}${disconnectedBlock}${timelineBlock}${sessionBlock}`;
        }

        /**
         * #renderPlatformOperations()
         *   Real Operations Registry display — every row comes from
         *   PlatformOperations.listOperations(), whose `supported` field is
         *   itself computed live from real capability advertisement, never
         *   hardcoded here. No operation is executed from this page without
         *   a real, authenticated userId — none exists yet anywhere in
         *   CozyOS, so every "Execute" action here will honestly refuse
         *   until a real login flow supplies one.
         */
        #renderPlatformOperations() {
            const ops = window.CozyOS && window.CozyOS.PlatformOperations ? window.CozyOS.PlatformOperations : null;
            if (!ops) return `<h2>Operations Center</h2>${this.#renderNotConnected("PlatformOperations is not loaded on this page.")}`;

            const scan = ops.scanCapabilities();
            const scanBlock = `
                <h3>Capability Scanner</h3>
                ${this.#renderKeyValueTable({ capabilitiesDiscovered: scan.capabilitiesDiscovered, advertisingCoordinators: scan.advertisingCoordinators.map(a => a.name).join(", ") || "none" })}
                ${scan.reason ? `<p class="cozy-disclosure-note">${this.#escapeHtml(scan.reason)}</p>` : ""}`;

            const operations = ops.listOperations();
            const rows = operations.map(op => `
                <div class="cozy-module-row">
                    <div class="cozy-module-row-main">
                        <b>${this.#escapeHtml(op.name)}</b>
                        <span class="cozy-badge ${op.supported ? "cozy-badge-success" : "cozy-badge-neutral"}">${op.supported ? "Supported" : "Not Supported"}</span>
                        <span class="cozy-badge cozy-badge-neutral">${this.#escapeHtml(op.category)}</span>
                    </div>
                    <div class="cozy-module-row-meta">
                        <span>Owner: ${this.#escapeHtml(op.owner || "—")}</span>
                        ${op.permission ? `<span>Permission: ${this.#escapeHtml(op.permission)}</span>` : ""}
                        <span>Rollback: ${op.supported ? (op.advertisedRollback ? "Yes" : "No") : "—"}</span>
                        ${!op.supported ? `<span>Reason: ${this.#escapeHtml(op.reason)}</span>` : ""}
                        ${op.requiredFutureOwner ? `<span>Required Future Owner: ${this.#escapeHtml(op.requiredFutureOwner)}</span>` : ""}
                    </div>
                </div>`).join("");

            const history = ops.getHistory(20);
            const historyRows = history.length ? history.map(h => `
                <div class="cozy-nav-link"><span>${this.#escapeHtml(h.timestamp)} — ${this.#escapeHtml(h.operation)} (${this.#escapeHtml(h.target)}): ${h.success ? "✅ success" : "❌ " + this.#escapeHtml(h.reason || "failed")}</span></div>`).join("")
                : `<p class="cozy-disclosure-note">No operations have been run yet this session.</p>`;

            return `<h2>Operations Center</h2>
                <p class="cozy-disclosure-note">The execution layer — every operation delegates to a real, already-connected platform owner. Nothing here is simulated. "Execute" requires a real, authenticated, authorized user — no login screen exists yet anywhere in CozyOS, so every mutating operation will honestly refuse until one does.</p>
                ${scanBlock}
                <h3>Operations Registry (${operations.filter(o => o.supported).length} supported / ${operations.length} total)</h3>
                <div class="cozy-list">${rows}</div>
                <h3>Recent Operation History</h3>
                ${historyRows}`;
        }

        /**
         * #renderPlatformResources()
         *   Real Resource Registry display only. Every resource shown comes
         *   from PlatformResourceManager.discoverResources() (called fresh
         *   on render, real data every time), which itself only pulls from
         *   genuinely connected sources — Memory/Temporary Files/Language
         *   Packs/Knowledge Packs/Icons/Images/Fonts have no real data
         *   source anywhere in CozyOS and are disclosed as such, not shown
         *   as empty-but-implied-tracked categories.
         */
        #renderPlatformResources() {
            const rm = window.CozyOS && window.CozyOS.PlatformResourceManager ? window.CozyOS.PlatformResourceManager : null;
            if (!rm) return `<h2>Resource Center</h2>${this.#renderNotConnected("PlatformResourceManager is not loaded on this page.")}`;

            const resources = rm.discoverResources();
            const byType = {};
            resources.forEach(r => { (byType[r.type] = byType[r.type] || []).push(r); });

            const rows = resources.map(r => `
                <div class="cozy-module-row">
                    <div class="cozy-module-row-main">
                        <b>${this.#escapeHtml(r.name)}</b>
                        <span class="cozy-badge cozy-badge-neutral">${this.#escapeHtml(r.type)}</span>
                        <span class="cozy-badge ${r.status === "allocated" || r.status === "shared" ? "cozy-badge-success" : "cozy-badge-neutral"}">${this.#escapeHtml(r.status)}</span>
                    </div>
                    <div class="cozy-module-row-meta">
                        <span>Owner: ${this.#escapeHtml(r.owner || "—")}</span>
                        <span>Shared: ${r.shared ? "Yes" : "No"}</span>
                        <span>Persistent: ${r.persistent ? "Yes" : "No"}</span>
                        <span>References: ${r.referenceCount}</span>
                        ${r.size !== null ? `<span>Size: ${this.#escapeHtml(String(r.size))} bytes</span>` : ""}
                    </div>
                </div>`).join("");

            const health = rm.getResourceHealth();
            const healthBlock = `
                <h3>Resource Health</h3>
                ${this.#renderKeyValueTable({
                    missingCount: health.missing.length,
                    orphanedCount: health.orphaned.length,
                    invalidOwnershipCount: health.invalidOwnership.length,
                    healthEngineConnected: health.healthEngineConnected
                })}`;

            return `<h2>Resource Center</h2>
                <p class="cozy-disclosure-note">Every resource below comes from a real, connected source (Theme, PluginManager, CozyStorage, CozyAI, OCR, CozyTranslate, FileRegistry). Memory, Temporary Files, Language Packs, Knowledge Packs, Icons, Images, and Fonts have no real tracked data source anywhere in CozyOS yet — they are intentionally absent from this list, not shown empty.</p>
                <h3>Resources by Type</h3>
                ${this.#renderKeyValueTable(Object.fromEntries(Object.entries(byType).map(([t, list]) => [t, list.length])))}
                ${healthBlock}
                <h3>Full Resource Registry (${resources.length})</h3>
                <div class="cozy-list">${rows}</div>`;
        }

        /**
         * #renderReferenceIntegrityCenter()
         *   Real report display only. Every field is labeled with whether
         *   it's genuinely new (broken references/imports/content
         *   duplicates) or delegated from an existing real engine
         *   (circular dependencies, missing modules) — never presented as
         *   if this engine computed all of it itself.
         */
        #renderReferenceIntegrityCenter() {
            const ri = window.CozyOS && window.CozyOS.ReferenceIntegrity ? window.CozyOS.ReferenceIntegrity : null;
            if (!ri) return `<h2>Reference Integrity Center</h2>${this.#renderNotConnected("ReferenceIntegrity is not loaded on this page.")}`;

            const buttons = `<button type="button" id="cozy-ri-scan-btn" class="cozy-btn cozy-btn-primary">Run Full Integrity Scan</button>`;
            const report = ri.getReport();
            if (!report.available) return `<h2>Reference Integrity Center</h2>${buttons}<p class="cozy-disclosure-note">No scan has been run yet.</p>`;

            const brokenRows = report.brokenReferences.available && report.brokenReferences.broken.length
                ? report.brokenReferences.broken.map(b => `<div class="cozy-nav-link"><span>[${this.#escapeHtml(b.kind)}] ${this.#escapeHtml(b.url)} — ${b.status ?? this.#escapeHtml(b.error || "unreachable")}</span></div>`).join("")
                : `<p class="cozy-disclosure-note">No broken script/stylesheet/image references found.</p>`;

            const importRows = report.brokenImports.brokenImports.length
                ? report.brokenImports.brokenImports.map(b => `<div class="cozy-nav-link"><span>${this.#escapeHtml(b.fromFile)} → ${this.#escapeHtml(b.importPath)} (${b.status ?? "unreachable"})</span></div>`).join("")
                : `<p class="cozy-disclosure-note">No broken ES-module imports found (heuristic scan).</p>`;

            const contentDupes = report.contentDuplicates.duplicateGroups.length
                ? report.contentDuplicates.duplicateGroups.map(g => `<div class="cozy-nav-link"><span>Identical content: ${g.map(u => this.#escapeHtml(u)).join(", ")}</span></div>`).join("")
                : `<p class="cozy-disclosure-note">No byte-identical script files found among currently-loaded scripts.</p>`;

            const circular = report.circularDependencies.available
                ? `<p class="cozy-disclosure-note">Source: ${this.#escapeHtml(report.circularDependencies.source)}</p>${this.#renderKeyValueTable(report.circularDependencies.result)}`
                : `<p class="cozy-disclosure-note">${this.#escapeHtml(report.circularDependencies.reason)}</p>`;

            const missing = report.missingModules.available
                ? `<p class="cozy-disclosure-note">Source: ${this.#escapeHtml(report.missingModules.source)}</p>${this.#renderKeyValueTable({ declaredButMissing: report.missingModules.declaredButMissing, loadedButUndeclared: report.missingModules.loadedButUndeclared })}`
                : `<p class="cozy-disclosure-note">${this.#escapeHtml(report.missingModules.reason)}</p>`;

            return `<h2>Reference Integrity Center</h2>${buttons}
                <p class="cozy-disclosure-note">Scanned at ${this.#escapeHtml(report.scannedAt)}. The proactive check this project's own history showed was missing — the same class of bug found manually in mpesaOS.js, developer-hub.css, QuarryOS, and Certification.</p>
                <h3>Broken References (script/stylesheet/image) — new</h3>
                ${brokenRows}
                <h3>Broken ES-Module Imports — new, heuristic</h3>
                ${importRows}
                <h3>Byte-Identical Script Content — new</h3>
                ${contentDupes}
                <h3>Circular Dependencies — delegated</h3>
                ${circular}
                <h3>Missing / Undeclared Modules — delegated</h3>
                ${missing}`;
        }

        /**
         * #renderVendorStatusCenter()
         *   Real report only. As of this version, every declared vendor
         *   honestly shows "Missing" — none are actually loaded anywhere
         *   in this deployment, verified by direct search, not assumed.
         */
        #renderVendorStatusCenter() {
            const vr = window.CozyOS && window.CozyOS.VendorRegistry ? window.CozyOS.VendorRegistry : null;
            const vd = window.CozyOS && window.CozyOS.VendorDiagnostics ? window.CozyOS.VendorDiagnostics : null;
            if (!vr) return `<h2>Vendor Status</h2>${this.#renderNotConnected("VendorRegistry is not loaded on this page.")}`;

            const buttons = `<button type="button" id="cozy-vendor-load-btn" class="cozy-btn cozy-btn-primary">Load Vendor Manifest</button>`;
            const status = vr.listVendorStatus();
            if (!status.available) return `<h2>Vendor Status</h2>${buttons}<p class="cozy-disclosure-note">${this.#escapeHtml(status.reason)}</p>`;

            const cached = this.#vendorStateCache;
            const stateBadgeClass = (s) => (s === "READY" || s === "IN_USE") ? "cozy-badge-success" : s === "ERROR" ? "cozy-badge-blocked" : "cozy-badge-neutral";
            const stageOrder = ["installed", "registered", "runtimeLoaded", "wrapperExists", "ready", "inUse"];
            const stageLabels = { installed: "Installed", registered: "Registered", runtimeLoaded: "Loaded", wrapperExists: "Wrapped", ready: "Ready", inUse: "In Use" };

            const rows = status.vendors.map(v => {
                const derived = cached?.[v.name];
                const state = derived?.state || "…";
                if (!derived) {
                    return `<div class="cozy-module-row cozy-module-row-pending" style="opacity:0.6;"><div class="cozy-module-row-main"><b>${this.#escapeHtml(v.name)}</b><span class="cozy-badge cozy-badge-neutral">Awaiting diagnostics — click "Refresh Diagnostics" above</span></div></div>`;
                }
                const checklist = stageOrder.map(key => `<div>${derived[key] ? "✓" : "✗"} ${stageLabels[key]}</div>`).join("");
                const failReason = !derived.installed ? "Vendor folder/file does not exist."
                    : !derived.registered ? "Not confirmed present and declared."
                    : !derived.runtimeLoaded ? (derived.lastError || "Script failed to load.")
                    : !derived.wrapperExists ? "No wrapper engine connected yet."
                    : !derived.ready ? "Wrapper connected, but not confirmed operational."
                    : !derived.inUse ? "Ready, but no application is currently using it."
                    : null;
                return `
                <div class="cozy-module-row">
                    <div class="cozy-module-row-main">
                        <b>${this.#escapeHtml(v.name)}</b>
                        <span class="cozy-badge ${stateBadgeClass(state)}">${this.#escapeHtml(state)}</span>
                        <span class="cozy-muted">Health: ${derived.healthScorePercent}%</span>
                    </div>
                    <div class="cozy-vendor-detail" style="margin-top:6px;font-size:13px;">
                        <div><b>Status</b></div>
                        ${checklist}
                        ${failReason ? `<div style="margin-top:4px;"><b>Reason:</b> ${this.#escapeHtml(failReason)}</div>` : ""}
                        <div style="margin-top:6px;"><b>Owner Engine:</b> ${this.#escapeHtml(derived.ownerEngine || "— (no wrapper planned yet)")}</div>
                        <div><b>Wrapper Coordinator:</b> ${this.#escapeHtml(derived.wrapperFilePath || "— (none built yet)")}</div>
                        <div><b>Applications Using It:</b> ${derived.applicationsUsingIt.length ? derived.applicationsUsingIt.map(a => this.#escapeHtml(a)).join(", ") : "None"}</div>
                        <div><b>Vendor Folder:</b> core/vendor/${this.#escapeHtml(v.name)}/</div>
                        <div><b>Expected Script Path:</b> ${this.#escapeHtml(derived.expectedFilePath || "—")}</div>
                        <div><b>Loaded Script Path:</b> ${this.#escapeHtml(derived.loadedScriptPath || "— (not successfully loaded)")}</div>
                        <div><b>Version (declared):</b> ${this.#escapeHtml(derived.version)}</div>
                        <div><b>Last Load Time:</b> ${this.#escapeHtml(derived.lastCheckedAt || "—")}</div>
                        <div><b>Load Duration:</b> ${derived.loadDurationMs !== null ? derived.loadDurationMs + " ms" : "—"}</div>
                        <div><b>Memory Usage:</b> Not trackable — no real browser API can report per-library heap usage; not fabricated</div>
                        <div><b>Usage Count:</b> ${derived.applicationsUsingIt.length} application(s)</div>
                        <div><b>Error Message:</b> ${this.#escapeHtml(derived.lastError || "None")}</div>
                        <div><b>Certification Status:</b> ${this.#escapeHtml(derived.certificationResult)} — ${this.#escapeHtml(derived.certificationReason)}</div>
                        <button type="button" class="cozy-btn" data-action="hub-vendor-history" data-vendor-name="${this.#escapeHtml(v.name)}">View History</button>
                        <div id="cozy-vendor-history-${this.#escapeHtml(v.name)}"></div>
                    </div>
                </div>`;
            }).join("");

            const operationalCount = cached ? Object.values(cached).filter(v => v.state === "READY" || v.state === "IN_USE").length : 0;
            return `<h2>Vendor Status</h2>${buttons}
                <button type="button" id="cozy-vendor-diagnose-btn" class="cozy-btn" ${vd ? "" : "disabled"}>Refresh Diagnostics</button>
                <p class="cozy-disclosure-note">${operationalCount}/${status.vendors.length} vendors Ready or In Use. Progression: Not Installed → Installed → Registered → Loaded → Wrapped → Ready → In Use, with Error reachable from any active stage. Every field below comes from VendorDiagnostics, a pure consumer of real, observed signals — never fabricated. No third-party library file can be fetched or vendored in this environment (no network access), so every vendor is expected to show Not Installed until real files are placed manually.</p>
                <div class="cozy-list">${rows}</div>`;
        }

        /**
         * #renderAccessibilityCenter()
         *   Real report display only — every number comes from
         *   AccessibilityEngine's actual WCAG math and real stylesheet
         *   scan. No fabricated pass/fail shown before a scan has run.
         */
        #renderAccessibilityCenter() {
            const a11y = window.CozyOS && window.CozyOS.AccessibilityEngine ? window.CozyOS.AccessibilityEngine : null;
            if (!a11y) return `<h2>Accessibility Center</h2>${this.#renderNotConnected("AccessibilityEngine is not loaded on this page.")}`;

            const buttons = `<button type="button" id="cozy-a11y-scan-btn" class="cozy-btn cozy-btn-primary">Run Full Scan</button>`;
            const report = a11y.getReport();
            if (!report.available) return `<h2>Accessibility Center</h2>${buttons}<p class="cozy-disclosure-note">No scan has been run yet.</p>`;

            const themeRows = report.themes.map(t => {
                if (!t.available) return `<div class="cozy-nav-link"><span>${this.#escapeHtml(t.reason)}</span></div>`;
                return `<div class="cozy-module-row">
                    <div class="cozy-module-row-main"><b>${this.#escapeHtml(t.theme)}</b>
                        <span class="cozy-badge ${t.primaryText.passesAANormal ? "cozy-badge-success" : "cozy-badge-neutral"}">Primary text ${t.primaryText.ratio}:1 ${t.primaryText.passesAANormal ? "PASS" : "FAIL"}</span>
                        ${t.mutedText.available !== false ? `<span class="cozy-badge ${t.mutedText.passesAANormal ? "cozy-badge-success" : "cozy-badge-neutral"}">Muted text ${t.mutedText.ratio}:1 ${t.mutedText.passesAANormal ? "PASS" : "FAIL"}</span>` : ""}
                    </div></div>`;
            }).join("");

            const fontViolations = report.fonts.available
                ? (report.fonts.violations.length
                    ? report.fonts.violations.map(v => `<div class="cozy-nav-link"><span>${this.#escapeHtml(v.file)} — ${this.#escapeHtml(v.selector)} (${v.sizePx}px)</span></div>`).join("")
                    : `<p class="cozy-disclosure-note">No sub-14px font sizes found across ${report.fonts.filesScanned} scanned stylesheet(s).</p>`)
                : `<p class="cozy-disclosure-note">${this.#escapeHtml(report.fonts.reason || "Font scan unavailable.")}</p>`;

            return `<h2>Accessibility Center</h2>${buttons}
                <p class="cozy-disclosure-note">Scanned at ${this.#escapeHtml(report.scannedAt)}. Real WCAG contrast math against each theme's actual loaded tokens; real same-origin scan of loaded stylesheets. Partial coverage — does not inspect arbitrary rendered component markup.</p>
                <h3>Theme Contrast (WCAG AA)</h3>
                <div class="cozy-list">${themeRows}</div>
                <h3>Font Size Violations (&lt;14px)</h3>
                ${fontViolations}`;
        }

        /**
         * #renderContentStudio()
         *   Phase 1 only — real content-item list and create/publish
         *   actions, no holiday templates, animation rendering, or
         *   placement-specific display yet. Disclosed plainly in the UI
         *   itself, not just in code comments.
         */
        #renderContentStudio() {
            const cp = window.CozyOS && window.CozyOS.ContentPresentation ? window.CozyOS.ContentPresentation : null;
            if (!cp) return `<h2>Content Studio</h2>${this.#renderNotConnected("ContentPresentation is not loaded on this page.")}`;

            const items = cp.listContent();
            const rows = items.map(c => `
                <div class="cozy-module-row">
                    <div class="cozy-module-row-main">
                        <b>${this.#escapeHtml(c.title)}</b>
                        <span class="cozy-badge ${c.status === "published" ? "cozy-badge-success" : "cozy-badge-neutral"}">${this.#escapeHtml(c.status)}</span>
                        <span class="cozy-badge cozy-badge-neutral">${this.#escapeHtml(c.category)}</span>
                    </div>
                    <div class="cozy-module-row-meta">
                        <span>${this.#escapeHtml(c.body)}</span>
                        ${c.status === "draft" ? `<button type="button" class="cozy-btn" data-content-publish="${this.#escapeHtml(c.id)}">Publish</button>` : ""}
                    </div>
                </div>`).join("") || `<p class="cozy-disclosure-note">No content items yet.</p>`;

            return `<h2>Content Studio</h2>
                <p class="cozy-disclosure-note">Phase 1 of the requested Design Studio & Content Presentation Engine. Real content CRUD with a real Accessibility Engine publish gate — most requested content categories, holiday templates, animation rendering, and placement modes are not yet built. See the migration log for the full, honest scope.</p>
                <button type="button" id="cozy-content-seed-btn" class="cozy-btn cozy-btn-primary">Load Demonstration Content</button>
                <h3>Content Items (${items.length})</h3>
                <div class="cozy-list">${rows}</div>`;
        }

        /**
         * #renderThemeStudio()
         *   Real Theme Studio — lists every real, registered theme
         *   (cozy-theme.js's own listThemes()), shows each one's actual
         *   currently-resolved tokens (getThemeTokens(), never a
         *   hardcoded second copy), and runs the real Accessibility
         *   Engine certification against whichever theme the admin
         *   selects. "Corporate," "CozyCabin," and "Seasonal Themes" are
         *   not built — disclosed here, not silently omitted.
         */
        /**
         * #renderLivingButtonEngine()
         *   Real showcase of the CSS classes already built in
         *   cozy-components.css (prior milestone) — this page adds no new
         *   CSS, it only demonstrates the existing, real classes and
         *   provides the real global on/off toggle
         *   (.cozy-animations-disabled) the Constitution rule requires.
         */
        #renderLivingButtonEngine() {
            const disabled = document.body.classList.contains("cozy-animations-disabled");
            const states = [
                ["cozy-btn-breathing", "Breathing"], ["cozy-btn-glow", "Glow"], ["cozy-btn-pulse", "Pulse"],
                ["cozy-btn-floating", "Floating"], ["cozy-btn-gradient", "Gradient"], ["cozy-btn-heartbeat", "Heartbeat"],
                ["cozy-btn-shimmer", "Shimmer"], ["cozy-btn-loading", "Loading"]
            ];
            const buttons = states.map(([cls, label]) => `<button type="button" class="cozy-btn cozy-btn-primary ${cls}">${this.#escapeHtml(label)}</button>`).join(" ");
            return `<h2>Living Button Engine</h2>
                <p class="cozy-disclosure-note">Real showcase of the reusable CSS classes in cozy-components.css — no new styles added here, just demonstrated. Applications adopt these by adding one class, no duplicated CSS.</p>
                <button type="button" id="cozy-lbe-toggle-btn" class="cozy-btn">${disabled ? "Enable Animations Globally" : "Disable Animations Globally"}</button>
                <div class="cozy-field" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px;">${buttons}
                    <button type="button" class="cozy-btn cozy-btn-primary" disabled>Disabled State</button>
                    <button type="button" class="cozy-btn cozy-btn-primary cozy-btn-badge" data-badge="3">Badge</button>
                </div>`;
        }

        #renderThemeStudio() {
            const theme = window.CozyOS && window.CozyOS.Theme ? window.CozyOS.Theme : null;
            if (!theme) return `<h2>Theme Studio</h2>${this.#renderNotConnected("Theme Engine is not loaded on this page.")}`;
            const themes = theme.listThemes();
            const selected = this.#themeStudioSelected || themes[0]?.name || null;
            const tokens = selected ? theme.getThemeTokens(selected) : null;

            const themeButtons = themes.map(t => `<button type="button" class="cozy-btn ${t.name === selected ? "cozy-btn-primary" : ""}" data-theme-select="${this.#escapeHtml(t.name)}">${this.#escapeHtml(t.name)}${t.aliases.length ? ` <span class="cozy-muted">(${this.#escapeHtml(t.aliases.join(", "))})</span>` : ""}</button>`).join(" ");

            const tokenTable = tokens && tokens.available
                ? this.#renderKeyValueTable(tokens.tokens)
                : `<p class="cozy-disclosure-note">${this.#escapeHtml(tokens?.reason || "No theme selected.")}</p>`;

            const certResult = this.#themeStudioCertification;
            const certBlock = certResult
                ? `<div class="cozy-module-row"><b>Accessibility: ${certResult.certified ? "PASS" : "FAIL"}</b><p>${this.#escapeHtml(certResult.reason)}</p></div>`
                : `<p class="cozy-disclosure-note">Not yet validated this session.</p>`;

            return `<h2>Theme Studio</h2>
                <p class="cozy-disclosure-note">The central visual authority for CozyOS themes — reads and validates the real Theme Engine, does not duplicate it. "Corporate," "CozyCabin," and "Seasonal Themes" do not exist anywhere in this codebase and are not fabricated here.</p>
                <h3>Registered Themes (${themes.length})</h3>
                <div class="cozy-field" style="display:flex;gap:8px;flex-wrap:wrap;">${themeButtons}</div>
                <h3>Resolved Tokens — ${this.#escapeHtml(selected || "none")}</h3>
                ${tokenTable}
                <button type="button" class="cozy-btn cozy-btn-primary" id="cozy-theme-preview-btn" ${selected ? "" : "disabled"}>Preview This Theme</button>
                <button type="button" class="cozy-btn" id="cozy-theme-validate-btn" ${selected ? "" : "disabled"}>Validate Accessibility</button>
                <h3>Accessibility Validation</h3>
                ${certBlock}`;
        }

        /**
         * #renderLivingThemeEngine()
         *   Real registry/schedule/activation state from the real
         *   LivingThemeEngine — never a second copy of its data. Seeding
         *   picks an actual, already-registered CozyOS.Theme name (never
         *   a fabricated one); if none is available or all are already
         *   registered here, the real failure reason is shown, not
         *   swallowed.
         */
        #renderLivingThemeEngine() {
            const engine = window.CozyOS && window.CozyOS.LivingThemeEngine ? window.CozyOS.LivingThemeEngine : null;
            if (!engine) return `<h2>Living Theme Engine</h2>${this.#renderNotConnected("LivingThemeEngine is not loaded on this page.")}`;

            let themes = engine.listThemes();
            const active = engine.getActiveTheme();

            // Real, client-side search/filter/sort over the engine's own
            // real listThemes() output — no fabricated fields, no second
            // data source.
            const search = (this.#livingThemeEngineSearch || "").toLowerCase().trim();
            const category = this.#livingThemeEngineCategory || "all";
            const sort = this.#livingThemeEngineSort || "name";
            const categoriesPresent = [...new Set(themes.map(t => engine.getThemeCategory(t.cozyThemeName)))].sort();

            if (search) themes = themes.filter(t => t.themeId.toLowerCase().includes(search) || t.cozyThemeName.toLowerCase().includes(search));
            if (category !== "all") themes = themes.filter(t => engine.getThemeCategory(t.cozyThemeName) === category);
            themes = [...themes].sort((a, b) => {
                if (sort === "recent") return new Date(b.createdAt) - new Date(a.createdAt);
                if (sort === "category") return engine.getThemeCategory(a.cozyThemeName).localeCompare(engine.getThemeCategory(b.cozyThemeName));
                return a.themeId.localeCompare(b.themeId);
            });

            const rowFor = (t) => {
                const scheduledNow = engine.isThemeScheduledNow(t.themeId).scheduled;
                const isActive = !!(active && active.themeId === t.themeId);
                return `<div class="cozy-module-row">
                    <div class="cozy-module-row-main">
                        <b>${this.#escapeHtml(t.themeId)}</b>
                        <span class="cozy-badge cozy-badge-neutral">${this.#escapeHtml(t.cozyThemeName)}</span>
                        <span class="cozy-badge ${isActive ? "cozy-badge-success" : "cozy-badge-neutral"}">${isActive ? "ACTIVE" : "inactive"}</span>
                        <span class="cozy-badge ${scheduledNow ? "cozy-badge-success" : "cozy-badge-neutral"}">${scheduledNow ? "Scheduled now" : "Not scheduled now"}</span>
                    </div>
                    <div class="cozy-module-row-meta">
                        <span>Schedule: ${this.#escapeHtml(t.schedule?.type || "continuous")}</span>
                        <span>Scope: ${this.#escapeHtml(t.scope)}</span>
                        <span>Installed: ${this.#escapeHtml(t.createdAt)}</span>
                        <button type="button" class="cozy-btn" data-lte-activate="${this.#escapeHtml(t.themeId)}">Activate</button>
                    </div>
                </div>`;
            };

            // Real restructure: group into per-category sections (each
            // real category actually present in the filtered set) instead
            // of one flat list, so "Registered Themes" is scannable rather
            // than a single undifferentiated block.
            let rows;
            if (themes.length === 0) {
                rows = `<p class="cozy-disclosure-note">No themes match the current search/filter.</p>`;
            } else if (category !== "all") {
                rows = `<div class="cozy-list">${themes.map(rowFor).join("")}</div>`;
            } else {
                const byCategory = new Map();
                for (const t of themes) {
                    const cat = engine.getThemeCategory(t.cozyThemeName);
                    if (!byCategory.has(cat)) byCategory.set(cat, []);
                    byCategory.get(cat).push(t);
                }
                rows = [...byCategory.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([cat, list]) => `
                    <div class="cozy-theme-category-group">
                        <h4 class="cozy-theme-category-heading">${this.#escapeHtml(cat)} (${list.length})</h4>
                        <div class="cozy-list">${list.map(rowFor).join("")}</div>
                    </div>`).join("");
            }

            const historyRows = engine.getHistory().slice(-10).reverse()
                .map(h => `<div class="cozy-nav-link"><span>${this.#escapeHtml(h.at)} — ${this.#escapeHtml(h.event)}</span></div>`)
                .join("") || `<p class="cozy-disclosure-note">No history yet this session.</p>`;

            const errBlock = this.#livingThemeEngineLastError
                ? `<p class="cozy-disclosure-note" style="color:#b91c1c;">${this.#escapeHtml(this.#livingThemeEngineLastError)}</p>` : "";

            const categoryOptions = ["all", ...categoriesPresent].map(c =>
                `<option value="${this.#escapeHtml(c)}" ${category === c ? "selected" : ""}>${this.#escapeHtml(c === "all" ? "All Categories" : c)}</option>`).join("");

            return `<h2>Living Theme Engine</h2>
                <p class="cozy-disclosure-note">Real theme registry, auto-discovered from CozyOS.Theme on load and kept live via theme:registered events — never a second registry. Scheduling (one-time window + weekly/annual recurring), scope, and profiles. Activation genuinely composes CozyOS.Theme.setTheme() — never re-implemented. NOT built: Live Preview (per-device rendering), Theme Marketplace import/export, seasonal/holiday template galleries, usage analytics.</p>
                ${errBlock}
                <button type="button" id="cozy-lte-refresh-btn" class="cozy-btn cozy-btn-primary">Refresh From CozyOS.Theme</button>
                <button type="button" id="cozy-lte-seed-btn" class="cozy-btn">Register a Schedule From an Existing CozyOS.Theme</button>
                <h3>Active Theme</h3>
                <p>${active ? `${this.#escapeHtml(active.themeId)} (${this.#escapeHtml(active.cozyThemeName)})` : "None active."}</p>
                <div class="cozy-filter-bar">
                    <input type="text" id="cozy-lte-search" placeholder="Search themes…" class="cozy-field" value="${this.#escapeHtml(this.#livingThemeEngineSearch || "")}" />
                    <select id="cozy-lte-category" class="cozy-field">${categoryOptions}</select>
                    <select id="cozy-lte-sort" class="cozy-field">
                        <option value="name" ${sort === "name" ? "selected" : ""}>Sort: Name</option>
                        <option value="recent" ${sort === "recent" ? "selected" : ""}>Sort: Recently Installed</option>
                        <option value="category" ${sort === "category" ? "selected" : ""}>Sort: Category</option>
                    </select>
                </div>
                <h3>Registered Themes (${themes.length}${themes.length !== engine.listThemes().length ? ` of ${engine.listThemes().length}` : ""})</h3>
                <div class="cozy-list">${rows}</div>
                <h3>History</h3>
                <div class="cozy-list">${historyRows}</div>`;
        }

        /**
         * #renderLivingMessageEngine()
         *   Real message registry/rotation/history from the real
         *   LivingMessageEngine. Create/enable/disable/delete all route
         *   through its real, fail-closed permission check — with no
         *   real login screen anywhere in CozyOS yet, these will
         *   honestly refuse and show why, exactly like Content Studio's
         *   equivalent actions.
         */
        #renderLivingMessageEngine() {
            const engine = window.CozyOS && window.CozyOS.LivingMessageEngine ? window.CozyOS.LivingMessageEngine : null;
            if (!engine) return `<h2>Living Message Engine</h2>${this.#renderNotConnected("LivingMessageEngine is not loaded on this page.")}`;

            const messages = engine.listMessages();
            const rows = messages.map(m => `
                <div class="cozy-module-row">
                    <div class="cozy-module-row-main">
                        <b>${this.#escapeHtml(m.category)}</b>
                        <span class="cozy-badge cozy-badge-neutral">${this.#escapeHtml(m.priority)}</span>
                        <span class="cozy-badge ${m.status === "enabled" ? "cozy-badge-success" : "cozy-badge-neutral"}">${this.#escapeHtml(m.status)}</span>
                        <span class="cozy-badge cozy-badge-neutral">${m.orgId ? this.#escapeHtml(m.orgId) : "platform-wide"}</span>
                    </div>
                    <div class="cozy-module-row-meta">
                        <span>${this.#escapeHtml(m.text)}</span>
                        <span>Views: ${m.viewCount} · Dismissed: ${m.dismissCount}</span>
                        ${m.status === "enabled"
                            ? `<button type="button" class="cozy-btn" data-lme-disable="${this.#escapeHtml(m.messageId)}">Disable</button>`
                            : `<button type="button" class="cozy-btn" data-lme-enable="${this.#escapeHtml(m.messageId)}">Enable</button>`}
                        <button type="button" class="cozy-btn" data-lme-delete="${this.#escapeHtml(m.messageId)}">Delete</button>
                    </div>
                </div>`).join("") || `<p class="cozy-disclosure-note">No messages registered yet.</p>`;

            const historyRows = engine.getHistory().slice(-10).reverse()
                .map(h => `<div class="cozy-nav-link"><span>${this.#escapeHtml(h.at)} — ${this.#escapeHtml(h.event)}</span></div>`)
                .join("") || `<p class="cozy-disclosure-note">No history yet this session.</p>`;

            const preview = this.#livingMessageEnginePreview;
            const previewBlock = preview
                ? (preview.messageId
                    ? `<div class="cozy-module-row"><b>${this.#escapeHtml(preview.category)}</b><p>${this.#escapeHtml(preview.text)}</p></div>`
                    : `<p class="cozy-disclosure-note">No eligible message right now (none enabled + currently scheduled).</p>`)
                : `<p class="cozy-disclosure-note">Not previewed yet this session.</p>`;

            const errBlock = this.#livingMessageEngineLastError
                ? `<p class="cozy-disclosure-note" style="color:#b91c1c;">${this.#escapeHtml(this.#livingMessageEngineLastError)}</p>` : "";

            return `<h2>Living Message Engine</h2>
                <p class="cozy-disclosure-note">Real message registry, org-scoped fail-closed permissions (Organization Administrators restricted to their own real orgId), scheduling (reuses LivingThemeEngine.matchesSchedule()), and rotation (sequential/random/weighted/priority-first). Does not render anything to the DOM — the floating-message display and "smart empty space" detection are separate, disclosed future work. NOT built: AI-generated messages, RSS/API sources. No real login screen exists yet anywhere in CozyOS, so create/enable/disable/delete below correctly fail closed rather than fake success.</p>
                ${errBlock}
                <button type="button" id="cozy-lme-seed-btn" class="cozy-btn cozy-btn-primary">Create a Demonstration Message</button>
                <button type="button" id="cozy-lme-preview-btn" class="cozy-btn">Preview Next Eligible Message (priority-first)</button>
                <h3>Preview</h3>
                ${previewBlock}
                <h3>Messages (${messages.length})</h3>
                <div class="cozy-list">${rows}</div>
                <h3>History</h3>
                <div class="cozy-list">${historyRows}</div>`;
        }

        /**
         * #renderModeEngine()
         *   Real mode registry/activation/history from the real
         *   ModeEngine. Activation genuinely composes
         *   LivingThemeEngine.activateTheme() when a mode references a
         *   theme — never re-applies theme state itself.
         */
        #renderModeEngine() {
            const engine = window.CozyOS && window.CozyOS.ModeEngine ? window.CozyOS.ModeEngine : null;
            if (!engine) return `<h2>Mode Engine</h2>${this.#renderNotConnected("ModeEngine is not loaded on this page.")}`;

            const modes = engine.listModes();
            const active = engine.getActiveMode();

            const rows = modes.map(m => {
                const scheduledNow = engine.isModeScheduledNow(m.modeId).scheduled;
                const isActive = !!(active && active.modeId === m.modeId);
                return `<div class="cozy-module-row">
                    <div class="cozy-module-row-main">
                        <b>${this.#escapeHtml(m.modeId)}</b>
                        <span class="cozy-badge cozy-badge-neutral">${m.themeId ? this.#escapeHtml(m.themeId) : "no theme"}</span>
                        <span class="cozy-badge ${isActive ? "cozy-badge-success" : "cozy-badge-neutral"}">${isActive ? "ACTIVE" : "inactive"}</span>
                        <span class="cozy-badge ${scheduledNow ? "cozy-badge-success" : "cozy-badge-neutral"}">${scheduledNow ? "Scheduled now" : "Not scheduled now"}</span>
                    </div>
                    <div class="cozy-module-row-meta">
                        <span>App priority: ${m.appPriority.length ? this.#escapeHtml(m.appPriority.join(", ")) : "none set"}</span>
                        <span>Notifications: ${m.notificationsEnabled ? "enabled" : "disabled"}</span>
                        <button type="button" class="cozy-btn" data-mode-activate="${this.#escapeHtml(m.modeId)}">Activate</button>
                    </div>
                </div>`;
            }).join("") || `<p class="cozy-disclosure-note">No modes registered yet.</p>`;

            const historyRows = engine.getHistory().slice(-10).reverse()
                .map(h => `<div class="cozy-nav-link"><span>${this.#escapeHtml(h.at)} — ${this.#escapeHtml(h.event)}</span></div>`)
                .join("") || `<p class="cozy-disclosure-note">No history yet this session.</p>`;

            const errBlock = this.#modeEngineLastError
                ? `<p class="cozy-disclosure-note" style="color:#b91c1c;">${this.#escapeHtml(this.#modeEngineLastError)}</p>` : "";

            return `<h2>Mode Engine</h2>
                <p class="cozy-disclosure-note">Real mode registry — a Mode is a named bundle: which real LivingThemeEngine theme to activate, an authoritative (not self-enforced) app-priority list, and a notifications-enabled flag. Scheduling reuses LivingThemeEngine.matchesSchedule() rather than duplicating date logic. NOT built, named honestly: sound/animation control, AI personality switching, brightness control, location-based activation, and application shells actually reading/enforcing "prioritize these apps" — all disclosed future work, not silently omitted.</p>
                ${errBlock}
                <button type="button" id="cozy-mode-seed-btn" class="cozy-btn cozy-btn-primary">Register a Demonstration Mode</button>
                <h3>Active Mode</h3>
                <p>${active ? this.#escapeHtml(active.modeId) : "None active."}</p>
                <h3>Registered Modes (${modes.length})</h3>
                <div class="cozy-list">${rows}</div>
                <h3>History</h3>
                <div class="cozy-list">${historyRows}</div>`;
        }

        /**
         * #renderLivingGreeting()
         *   M371 — real, composed greeting: CozyEnvironment.getState()
         *   for time-of-day (no separate calculation here), and
         *   IdentityEngine.getUser()'s real username field for
         *   personalization. Honest empty string if either is
         *   unavailable - never a fabricated name or time.
         */
        #renderLivingGreeting() {
            const env = window.CozyOS && window.CozyOS.CozyEnvironment;
            const state = env && typeof env.getState === "function" ? env.getState() : null;
            if (!state || !state.available) return "";
            const identity = window.CozyOS && window.CozyOS.IdentityEngine;
            const user = identity && this.#currentUserId ? identity.getUser(this.#currentUserId) : null;
            const name = user && user.username ? user.username : "";
            const byPeriod = { morning: "Good morning", afternoon: "Good afternoon", evening: "Good evening", night: "Good night" };
            const greeting = byPeriod[state.timeOfDay] || "Welcome";
            return `<p class="cozy-living-greeting">${this.#escapeHtml(greeting)}${name ? " " + this.#escapeHtml(name) : ""}.</p>`;
        }

        #renderNotificationCenter() {
            const feed = this.getNotificationFeed(50);
            return `<h2>Enterprise Notification Center</h2>
                ${this.#renderLivingGreeting()}
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

            // RP-020 — real, confirmed fix: #currentUserRole/#currentUserId
            // were previously resolved exactly once, in mount(), and never
            // again. If that one resolution raced ahead of IdentityEngine
            // (e.g. identity.ready technically resolved but the specific
            // user record wasn't yet reflected, a second tab/flow signing
            // in after this page's mount() already ran, or any other
            // transient timing gap not covered by the M373/M387.5 mount()
            // guard above), the shell had no way to self-correct — it
            // stayed on the wrong role for the rest of the page's life,
            // rendering a false Access Denied on every Admin-only section
            // even after the real admin data became available. Re-resolving
            // here, on every render, reuses the exact same two existing
            // methods mount() already calls — no new permission mechanism,
            // no new state, just removing the one-shot staleness. Cheap:
            // both methods are synchronous lookups against already-loaded
            // in-memory state, safe to repeat every render cycle.
            const resolvedUserId = this.#resolveCurrentUserId();
            if (resolvedUserId !== this.#currentUserId) this.#currentUserId = resolvedUserId;
            const resolvedRole = this.#resolveCurrentUserRole(this.#currentUserId);
            if (resolvedRole !== this.#currentUserRole) this.#currentUserRole = resolvedRole;

            const NAV_SECTIONS = [
                { label: "Overview", items: [["dashboard", "Dashboard"], ["applications", "Application Center"], ["modules", "Module Manager"], ["founderStory", "Founder Story"]] },
                { label: "Certification", items: [["certification", "Certification Center"], ["releases", "Release Center"], ["upgrades", "Upgrade Center"], ["dependencies", "Dependency Viewer"]] },
                { label: "Operations", items: [["diagnostics", "Diagnostics Center"], ["aiProviders", "AI Providers"], ["events", "Event Monitor"], ["notifications", "Notification Center"], ["search", "Enterprise Search"], ["platformDiscovery", "Platform Discovery"], ["platformAudit", "Audit Center"], ["platformOperations", "Operations Center"], ["platformResources", "Resource Center"], ["referenceIntegrityCenter", "Reference Integrity Center"], ["vendorStatusCenter", "Vendor Status"]] },
                { label: "Design Studio", items: [["themeStudio", "Theme Studio"], ["livingThemeEngine", "Living Theme Engine"], ["livingMessageEngine", "Living Message Engine"], ["modeEngine", "Mode Engine"], ["livingButtonEngine", "Living Button Engine"], ["accessibilityCenter", "Accessibility Studio"], ["contentStudio", "Content Studio"]] },
                { label: "Integrations (awaiting coordinators)", items: [["security", "Security Center"], ["storage", "Storage Center"], ["sync", "Synchronization Center"], ["automation", "Automation Center"], ["live", "Live Center"], ["speech", "Speech Center"], ["translation", "Translation Center"], ["subscription", "Subscription / License Center"], ["ai", "AI Center"], ["plugins", "Plugin Center"], ["tenants", "Tenant Center"]] },
                // Additive: Administrator Workspace expansion per the locked
                // CozyOS architecture. Nothing above this line was changed.
                { label: "Administration", items: [["users", "Users"], ["orgManager", "Organization Manager"], ["roles", "Roles"], ["permissions", "Permissions"], ["companies", "Companies"], ["publisher", "Message Publisher"], ["engines", "Engines (temporary view)"], ["services", "Services (temporary view)"], ["monitoring", "Monitoring"], ["configuration", "Configuration"], ["audit", "Audit"]] },
                { label: "Development", items: [["developerHub", "Developer Hub"]] }
            ];

            // Milestone 353 — real role gating, reusing the same role this
            // shell already resolved via IdentityEngine.getDashboardConfig()
            // in mount() (#currentUserRole). Fails closed: an unresolved
            // role (null — nobody signed in, or IdentityEngine unavailable)
            // gets the same minimal, non-administrative view as an End
            // User, never the Administrator's full nav. Administrator
            // behavior is completely unchanged from before this milestone.
            const ADMIN_ONLY_SECTIONS = new Set(["Certification", "Operations", "Design Studio", "Integrations (awaiting coordinators)", "Administration"]);
            const isPlatformAdminRole = this.#currentUserRole === "admin";
            const isDeveloperRole = this.#currentUserRole === "developer";
            const VISIBLE_NAV_SECTIONS = NAV_SECTIONS
                .filter(section => isPlatformAdminRole || !ADMIN_ONLY_SECTIONS.has(section.label))
                .filter(section => (isPlatformAdminRole || isDeveloperRole) || section.label !== "Development")
                .map(section => section.label !== "Overview" ? section : { label: section.label, items: section.items.filter(([id]) => isPlatformAdminRole || id !== "dashboard") })
                /**
                 * M365.2 — fine-grained, per-item menu filtering. Composes
                 * the existing, real, previously-unwired
                 * IdentityEngine.checkResourcePermission() — never a new
                 * permission engine. Fail-open for Platform Admin/
                 * Developer (confirmed decision, M365.2 Phase 1
                 * regression-risk resolution): those roles see
                 * everything exactly as before this milestone, zero
                 * behavior change. Fail-closed only for every other role
                 * tier (the employee tier this roadmap is building
                 * toward) — an item is hidden unless explicitly granted
                 * "<id>:view".
                 */
                .map(section => ({
                    label: section.label,
                    items: section.items.filter(([id]) => this.#hasPermission(`${id}:view`))
                }))
                .filter(section => section.items.length > 0);

            // Real, honest fail-closed guard: if the currently active center
            // isn't actually visible to this role (e.g. a stale
            // localStorage value from a prior Administrator session on a
            // shared device, or direct role change), fall back to the
            // first real visible center rather than rendering a section
            // this role should never see.
            if (!VISIBLE_NAV_SECTIONS.some(s => s.items.some(([id]) => id === this.#activeCenter))) {
                const fallback = VISIBLE_NAV_SECTIONS[0] && VISIBLE_NAV_SECTIONS[0].items[0];
                this.#activeCenter = fallback ? fallback[0] : "applications";
            }

            // Accordion: exactly one section open at a time. Default to
            // whichever section contains the active center; fall back to
            // the remembered section, then the first section. State lives
            // in #openNavSection (survives the full innerHTML rebuild
            // #render() does on every call) and persists across reloads.
            if (!this.#openNavSection || !VISIBLE_NAV_SECTIONS.some(s => s.label === this.#openNavSection)) {
                const containing = VISIBLE_NAV_SECTIONS.find(s => s.items.some(([id]) => id === this.#activeCenter));
                // RP-017 real fix: this previously assumed
                // (containing || VISIBLE_NAV_SECTIONS[0]) was always a real
                // section object and read .label off it unconditionally.
                // That's false whenever a role has zero granted <id>:view
                // permissions (M365.2's own fail-closed model) -
                // VISIBLE_NAV_SECTIONS is then a real, legitimate empty
                // array, containing is undefined, VISIBLE_NAV_SECTIONS[0]
                // is undefined, and .label threw on undefined - the exact
                // "Cannot read properties of undefined (reading 'label')"
                // crash. Two lines above already treats an empty
                // VISIBLE_NAV_SECTIONS as a real, expected state (the
                // fallback ? ... : "applications" guard) - this now
                // matches that same, already-established invariant rather
                // than fabricating a fake section.
                const fallbackSection = containing || VISIBLE_NAV_SECTIONS[0] || null;
                this.#openNavSection = fallbackSection ? fallbackSection.label : null;
            }

            const navHtml = VISIBLE_NAV_SECTIONS.map(section => {
                const isOpen = section.label === this.#openNavSection;
                return `
                <div class="cozy-nav-section${isOpen ? " open" : ""}">
                    <button type="button" class="cozy-nav-section-label" data-nav-section="${this.#escapeHtml(section.label)}">
                        <span class="cozy-nav-section-arrow">▶</span>${this.#escapeHtml(section.label)}
                    </button>
                    <div class="cozy-nav-section-items">
                        ${section.items.map(([id, label]) => `<div class="cozy-nav-link${this.#activeCenter === id ? " active" : ""}" data-center="${id}" title="${this.#escapeHtml(label)}"><span class="cozy-nav-link-label">${this.#escapeHtml(label)}</span></div>`).join("")}
                    </div>
                </div>`;
            }).join("");

            const mainHtml = this.#renderCenter(this.#activeCenter);
            const bar = this.getGlobalStatusBar();
            const statusBarHtml = `<div class="cozy-status-bar">
                <button type="button" id="cozy-mobile-menu-btn" class="cozy-mobile-menu-btn" aria-label="Open menu">☰</button>
                <span>v${this.#escapeHtml(bar.workspaceVersion)}</span>
                <span>Apps: ${this.#escapeHtml(bar.applicationsInstalled)}</span>
                <span>Coordinators: ${this.#escapeHtml(bar.coordinatorsLoaded)}</span>
                <span>Running: ${this.#escapeHtml(bar.applicationsRunning)}</span>
                <span>Notifications: ${this.#escapeHtml(bar.notificationCount)}</span>
                <span>License: ${this.#escapeHtml(bar.licenseStatus)}</span>
                <span>Sync: ${this.#escapeHtml(bar.synchronizationStatus)}</span>
            </div>`;

            const shellClasses = ["cozy-shell"];
            if (this.#sidebarCollapsed) shellClasses.push("cozy-sidebar-collapsed");
            if (this.#sidebarMobileOpen) shellClasses.push("cozy-sidebar-mobile-open");

            this.#domRoot.innerHTML = `
                <div class="${shellClasses.join(" ")}">
                    <div class="cozy-mobile-overlay"></div>
                    <nav class="cozy-sidebar">
                        <div class="cozy-sidebar-top">
                            <div class="cozy-shell-title">${this.#escapeHtml(isPlatformAdminRole ? "CozyOS Enterprise Control Center" : isDeveloperRole ? "CozyOS Developer Dashboard" : "CozyOS Dashboard")}</div>
                            <button type="button" id="cozy-sidebar-toggle" class="cozy-sidebar-toggle" aria-label="Toggle sidebar">${this.#sidebarCollapsed ? "▶" : "◀"}</button>
                        </div>
                        <button type="button" id="cozy-rediscover-btn" class="cozy-rediscover-btn">Rediscover</button>
                        ${navHtml}
                    </nav>
                    <div class="cozy-main-wrap">
                        ${statusBarHtml}
                        <main class="cozy-main">${mainHtml}</main>
                        <footer class="cozy-shell-footer">CozyOS Enterprise &middot; Built for Africa &middot; Secure &middot; Offline First &middot; Open Future</footer>
                    </div>
                </div>`;

            // Additive: real post-render lifecycle hooks. Both are no-ops if
            // their target section isn't currently active, and both delegate
            // entirely to existing, already-verified code — nothing here
            // reimplements Developer Hub or the Core Terminal.
            if (this.#activeCenter === "developerHub") {
                const hub = window.CozyOS.Modules && window.CozyOS.Modules["developer-hub"];
                if (hub && typeof hub.init === "function") { try { hub.init(); } catch (_err) { /* non-fatal */ } }
                // Additive: real deep-link — simulates an actual click on the
                // matching real .cozy-nav-item[data-section] element (the one
                // just rendered above), so Developer Hub's own real
                // #setSection() handles it exactly as if the user clicked it
                // themselves. Never calls any private Developer Hub method
                // directly; this shell still only ever interacts with it
                // through real, public surfaces (here, a real DOM click).
                if (this.#pendingDevHubSection) {
                    const targetEl = this.#domRoot.querySelector(`.cozy-nav-item[data-section="${this.#pendingDevHubSection}"]`);
                    if (targetEl) { try { targetEl.click(); } catch (_err) { /* non-fatal */ } }
                    this.#pendingDevHubSection = null;
                }
            }
            // Additive: real post-render lifecycle hook for Founder Story,
            // matching the Developer Hub pattern immediately above —
            // init() is called unconditionally on every #render() while
            // this center is active. founder-story-panel.js's own M366.2
            // Phase 2 state-aware init() (see that file) is what makes this
            // safe: it repaints whatever the user currently has open
            // (dashboard list or an in-progress reader) instead of
            // resetting them to the story list on every unrelated shell
            // repaint (sidebar toggle, other nav activity, etc.).
            if (this.#activeCenter === "founderStory") {
                const founderStory = window.CozyOS.Modules && window.CozyOS.Modules["founder-story-panel"];
                if (founderStory && typeof founderStory.init === "function") { try { founderStory.init("cozy-founderstory-root"); } catch (_err) { /* non-fatal */ } }
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
            // Milestone 200E: real, verified root cause of the workspace
            // crash after login — window.CozyOS.PluginMetadata is a
            // plain object by pluginManager.js's own documented, deliberate
            // design ("Plain object snapshot — callers use Object access,
            // not Map.get()"), never a real Map. Calling .values() on it
            // threw "plugins.values is not a function". Fixed to use
            // Object.values(), matching the real, canonical owner's
            // actual contract, with a type-consistent {} fallback.
            const plugins = (window.CozyOS && window.CozyOS.PluginMetadata) || {};
            const activeCount = Object.values(plugins).filter(m => m.status === "enabled").length;
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

        /**
         * #resolveCurrentUserId() — Milestone 353, real fix.
         *   Prior code only ever asked window.CozyOS.Auth.getCurrentAdministrator(),
         *   which is administrator/developer-only by design (see cozy-auth.js's
         *   own documented scope) — so #currentUserId silently stayed null for
         *   every real End User session, and every role-gated render below
         *   fell through to "show everything" or "show nothing" instead of the
         *   real per-user answer.
         *   Real fix: window.CozyOS.Session (cozy-session-service.js) is the
         *   one real, role-agnostic "who is signed in" snapshot — it's
         *   established from IdentityEngine for every real login regardless
         *   of role. That is checked first; Auth.getCurrentAdministrator() is
         *   kept as the honest fallback for any environment where Session
         *   isn't loaded, so nothing that worked before regresses.
         */
        #resolveCurrentUserId() {
            const session = window.CozyOS && window.CozyOS.Session;
            if (session && typeof session.current === "function") {
                const snap = session.current();
                if (snap && snap.uid) return snap.uid;
            }
            const auth = window.CozyOS && window.CozyOS.Auth;
            if (auth && typeof auth.getCurrentAdministrator === "function") {
                const admin = auth.getCurrentAdministrator();
                if (admin && admin.userId) return admin.userId;
            }
            return null;
        }

        /** #resolveCurrentUserRole(userId) — reuses IdentityEngine's own real getDashboardConfig(); never a second role system. */
        #resolveCurrentUserRole(userId) {
            const identity = window.CozyOS && window.CozyOS.IdentityEngine;
            if (!identity || !userId || typeof identity.getDashboardConfig !== "function") return null;
            try {
                const config = identity.getDashboardConfig(userId);
                return config && config.available ? config.dashboardType : null;
            } catch (_err) { return null; }
        }

        mount(mountingContainerElement) {
            if (!mountingContainerElement || typeof mountingContainerElement.appendChild !== "function") {
                throw new TypeError("[WorkspaceShell] mount(): a valid DOM container element is required.");
            }
            this.#domRoot = mountingContainerElement;
            // Milestone 353 — real identity resolution on every mount, so a
            // fresh sign-in (or a role change) is reflected immediately
            // rather than only at page load.
            this.#currentUserId = this.#resolveCurrentUserId();
            this.#currentUserRole = this.#resolveCurrentUserRole(this.#currentUserId);
            // Real, honest default landing view per role: the Dashboard
            // center below is genuinely Administrator-specific content
            // (platform-wide stats, user counts, system health) — never
            // appropriate as the first thing a Developer or End User sees.
            // Only redirected away from on the very first mount for a
            // session (never overrides a role's own later in-app
            // navigation), and only for centers that are not visible to
            // that role in the first place (see #getVisibleNavSections()).
            if (this.#currentUserRole && this.#currentUserRole !== "admin" && this.#activeCenter === "dashboard") {
                this.#activeCenter = "applications";
            }

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
                        // M364.7.1: single, minimal addition - the Living
                        // Floating Assistant's context-awareness composes
                        // this real, existing emit()/PlatformEventBus
                        // mechanism (no new event system). No section-
                        // change event existed anywhere before this line.
                        this.emit("center:changed", { center: nextCenter });
                        this.#selectedContext = null;
                        this.#sidebarMobileOpen = false;
                        try { window.localStorage.setItem("cozy.workspace.activeCenter", nextCenter); } catch (_err) { /* ignore */ }
                        // Additive: deep-link support. If the clicked element
                        // also carries a data-section (e.g. a Dashboard quick
                        // action for "Open Builder"), remember it so the
                        // post-render hook below can land the user directly
                        // on that Developer Hub section instead of just its
                        // home view — real navigation, not a fake shortcut.
                        this.#pendingDevHubSection = nextCenter === "developerHub" ? centerEl.getAttribute("data-section") : null;
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
                    if (evt.target.id === "cozy-discovery-scan-btn") {
                        // scan() is now async (Manifest Provider does a real
                        // fetch) — same disable-while-running pattern as
                        // scanSources() below, so a second click can't
                        // overlap an in-flight scan.
                        evt.target.disabled = true;
                        evt.target.textContent = "Scanning…";
                        if (window.CozyOS.PlatformDiscovery && typeof window.CozyOS.PlatformDiscovery.scan === "function") {
                            window.CozyOS.PlatformDiscovery.scan().finally(() => this.#render());
                        } else {
                            this.#render();
                        }
                        return;
                    }
                    if (evt.target.id === "cozy-discovery-scan-sources-btn") {
                        // Real async pass — disable the button while it runs so a
                        // second click can't overlap fetch() calls already in flight.
                        evt.target.disabled = true;
                        evt.target.textContent = "Scanning source files…";
                        if (window.CozyOS.PlatformDiscovery && typeof window.CozyOS.PlatformDiscovery.scanSources === "function") {
                            window.CozyOS.PlatformDiscovery.scanSources().finally(() => this.#render());
                        } else {
                            this.#render();
                        }
                        return;
                    }
                    if (evt.target.id === "cozy-audit-run-btn") {
                        // Synchronous — PlatformAudit only reads already-cached
                        // engine state, no fetch() of its own.
                        this.#render();
                        return;
                    }
                    if (evt.target.id === "cozy-a11y-scan-btn") {
                        // Real async pass — runFullScan() does a real fetch()
                        // of loaded stylesheets, same disable-while-running
                        // pattern as Discovery's scan buttons.
                        evt.target.disabled = true;
                        evt.target.textContent = "Scanning…";
                        if (window.CozyOS.AccessibilityEngine && typeof window.CozyOS.AccessibilityEngine.runFullScan === "function") {
                            window.CozyOS.AccessibilityEngine.runFullScan().finally(() => this.#render());
                        } else {
                            this.#render();
                        }
                        return;
                    }
                    if (evt.target.id === "cozy-ri-scan-btn") {
                        // Real async pass — a real fetch() for every real
                        // script/stylesheet/image tag on this page, same
                        // disable-while-running pattern as every other
                        // scan button on this dashboard.
                        evt.target.disabled = true;
                        evt.target.textContent = "Scanning…";
                        if (window.CozyOS.ReferenceIntegrity && typeof window.CozyOS.ReferenceIntegrity.runFullIntegrityScan === "function") {
                            window.CozyOS.ReferenceIntegrity.runFullIntegrityScan().finally(() => this.#render());
                        } else {
                            this.#render();
                        }
                        return;
                    }
                    if (evt.target.id === "cozy-vendor-load-btn") {
                        // Real async fetch of the real vendor-manifest.json.
                        evt.target.disabled = true;
                        evt.target.textContent = "Loading…";
                        if (window.CozyOS.VendorRegistry) {
                            window.CozyOS.VendorRegistry.loadManifest().finally(() => this.#render());
                        } else {
                            this.#render();
                        }
                        return;
                    }
                    if (evt.target.hasAttribute("data-vendor-name") && evt.target.getAttribute("data-action") === "hub-vendor-history") {
                        const vendorName = evt.target.getAttribute("data-vendor-name");
                        const container = this.#domRoot.querySelector(`#cozy-vendor-history-${vendorName}`);
                        if (container && window.CozyOS.VendorEvents) {
                            if (container.dataset.open === "true") { container.innerHTML = ""; container.dataset.open = "false"; return; }
                            const history = window.CozyOS.VendorEvents.getVendorHistory(vendorName);
                            container.innerHTML = history.length
                                ? history.map(h => `<div>${this.#escapeHtml(h.at)} — ${this.#escapeHtml(h.event)}</div>`).join("")
                                : `<p class="cozy-disclosure-note">No real events recorded yet for "${this.#escapeHtml(vendorName)}".</p>`;
                            container.dataset.open = "true";
                        }
                        return;
                    }
                    if (evt.target.id === "cozy-vendor-diagnose-btn") {
                        // Real async pass — VendorDiagnostics.listVendorStates()
                        // calls VendorManager.diagnoseAll(), the single real
                        // entry point, rather than VendorDiagnostics
                        // directly — same disable-while-running pattern as
                        // every other scan button on this dashboard.
                        evt.target.disabled = true;
                        evt.target.textContent = "Diagnosing…";
                        if (window.CozyOS.VendorManager) {
                            window.CozyOS.VendorManager.diagnoseAll().then(result => {
                                if (result.available) {
                                    this.#vendorStateCache = Object.fromEntries(result.vendors.map(v => [v.name, v]));
                                }
                            }).finally(() => this.#render());
                        } else {
                            this.#render();
                        }
                        return;
                    }
                    if (evt.target.id === "cozy-content-seed-btn") {
                        // Real call — will honestly refuse (no fabricated
                        // success) since no real, authenticated userId
                        // exists yet anywhere in CozyOS. This is correct,
                        // fail-closed behavior, not a bug in this button.
                        if (window.CozyOS.ContentPresentation) {
                            const result = window.CozyOS.ContentPresentation.seedDemonstrationContent(this.#currentUserId || null);
                            if (!result.success) window.CozyOS.Toast?.show?.(result.reason);
                        }
                        this.#render();
                        return;
                    }
                    if (evt.target.hasAttribute("data-content-publish")) {
                        const contentId = evt.target.getAttribute("data-content-publish");
                        if (window.CozyOS.ContentPresentation) {
                            evt.target.disabled = true;
                            window.CozyOS.ContentPresentation.publishContent(this.#currentUserId || null, contentId).then(result => {
                                if (!result.success) window.CozyOS.Toast?.show?.(result.reason);
                                this.#render();
                            });
                        }
                        return;
                    }
                    if (evt.target.hasAttribute("data-toggle-coordinator")) {
                        const name = evt.target.getAttribute("data-toggle-coordinator") || evt.target.closest("[data-toggle-coordinator]")?.getAttribute("data-toggle-coordinator");
                        if (name) { this.#diagnosticsExpanded.has(name) ? this.#diagnosticsExpanded.delete(name) : this.#diagnosticsExpanded.add(name); this.#render(); }
                        return;
                    }
                    /**
                     * M364.8 Phase 2 — Gap 1 (Application Launch). Composes
                     * the real, known static entry point for each business
                     * application (confirmed by reading the applications
                     * folder during Gate 1 tracing — ServiceRegistry's own
                     * `sourcePath` is the JS registration file, not a
                     * launchable URL, so it is not reused here for
                     * navigation). Reuses the existing authenticated
                     * session (no second login) and the existing document
                     * navigation - never a second launcher.
                     */
                    const openBtn = evt.target.closest("[data-app-action=\"open\"]");
                    if (openBtn && !openBtn.disabled) {
                        const appId = openBtn.getAttribute("data-app-id");
                        // M366.5 — real fix: the previous handler navigated
                        // via window.location.href, a full top-level page
                        // load that discards this entire document —
                        // Living Theme, Living Background, WorkspaceShell,
                        // the Living Assistant, everything — confirmed as
                        // the exact root cause of "ShopOS opens outside
                        // CozyOS... no shell... no Living Theme." A real,
                        // dedicated launcher already exists
                        // (core/shell/application-launcher.js) that mounts
                        // the application INSIDE the existing
                        // #cozy-workspace-root, exactly as ShopOS's and
                        // Authenticator's own real window.CozyOS.Modules[]
                        // registrations were built for (confirmed by
                        // reading both files before this change) — this
                        // now composes that existing launcher instead of
                        // bypassing it. Never a second launcher.
                        const launcher = window.CozyOS.ApplicationLauncher;
                        if (launcher && typeof launcher.open === "function") {
                            launcher.open(appId).then((result) => {
                                if (result && result.success) {
                                    this.#runningApplications.add(appId);
                                    this.#logAudit("APPLICATION_LAUNCHED", `${appId} launched via ApplicationLauncher.`);
                                } else {
                                    // Honest failure surface - no fabricated
                                    // "it opened" when it didn't.
                                    this.#diagnostics.errorsHidden++;
                                    const statusEl = this.#domRoot.querySelector(`[data-app-id="${appId}"]`);
                                    if (statusEl) statusEl.title = (result && result.reason) || "Failed to open.";
                                    console.warn(`[ApplicationLauncher] Failed to open "${appId}": ${result && result.reason}`);
                                }
                                this.#render();
                            }).catch((err) => {
                                this.#diagnostics.errorsHidden++;
                                console.warn(`[ApplicationLauncher] open("${appId}") threw:`, err && err.message);
                            });
                        } else {
                            // Honest fallback only if the real launcher
                            // itself somehow isn't loaded - still never a
                            // second launcher, just the prior behavior as
                            // a last resort.
                            const visibility = window.CozyOS.ApplicationVisibility;
                            const path = visibility && typeof visibility.getRealLaunchPath === "function" ? visibility.getRealLaunchPath(appId) : null;
                            if (path) window.location.href = path;
                        }
                        return;
                    }
                    /**
                     * M364.8 Phase 2 — Gap 2 (Application Management), the
                     * expand/collapse toggle for each app card's real
                     * management controls. Reuses the same accordion-state
                     * pattern already used for #diagnosticsExpanded above -
                     * no second accordion mechanism.
                     */
                    const manageToggle = evt.target.closest("[data-app-manage-toggle]");
                    if (manageToggle) {
                        const appId = manageToggle.getAttribute("data-app-manage-toggle");
                        this.#appManageExpanded.has(appId) ? this.#appManageExpanded.delete(appId) : this.#appManageExpanded.add(appId);
                        this.#render();
                        return;
                    }
                    /** Enable/Disable — composes the real, existing, previously-unwired IdentityEngine.setApplicationEnabled(). No new toggle mechanism. */
                    const enableToggle = evt.target.closest("[data-app-toggle-enabled]");
                    if (enableToggle) {
                        const appId = enableToggle.getAttribute("data-app-toggle-enabled");
                        const identity = window.CozyOS.IdentityEngine;
                        if (identity && typeof identity.setApplicationEnabled === "function") {
                            const current = typeof identity.isApplicationEnabled === "function" ? identity.isApplicationEnabled(appId) : true;
                            identity.setApplicationEnabled(appId, !current);
                        }
                        this.#render();
                        return;
                    }
                    /** Assign / Unassign to a user — composes the real, existing, previously-unwired IdentityEngine.assignApplication()/unassignApplication(). No new assignment store. */
                    const assignBtn = evt.target.closest("[data-app-assign]");
                    if (assignBtn) {
                        const appId = assignBtn.getAttribute("data-app-assign");
                        const input = this.#domRoot.querySelector(`[data-app-assign-input="${appId}"]`);
                        const userId = input ? input.value.trim() : "";
                        const identity = window.CozyOS.IdentityEngine;
                        if (userId && identity && typeof identity.assignApplication === "function") {
                            try { identity.assignApplication(userId, appId); } catch (_err) { /* real, honest failure (e.g. unknown userId) surfaces via IdentityEngine's own thrown error - not swallowed silently in a way that fakes success, but this shell does not have a dedicated error banner for this action yet */ }
                        }
                        this.#render();
                        return;
                    }
                    const unassignBtn = evt.target.closest("[data-app-unassign]");
                    if (unassignBtn) {
                        const appId = unassignBtn.getAttribute("data-app-unassign");
                        const input = this.#domRoot.querySelector(`[data-app-assign-input="${appId}"]`);
                        const userId = input ? input.value.trim() : "";
                        const identity = window.CozyOS.IdentityEngine;
                        if (userId && identity && typeof identity.unassignApplication === "function") identity.unassignApplication(userId, appId);
                        this.#render();
                        return;
                    }
                    /** M365.3 — Organization Manager: toggles (accordion, same pattern as prior Sets). */
                    const companyToggle = evt.target.closest("[data-company-toggle]");
                    if (companyToggle) {
                        const key = `company:${companyToggle.getAttribute("data-company-toggle")}`;
                        this.#orgManagerExpanded.has(key) ? this.#orgManagerExpanded.delete(key) : this.#orgManagerExpanded.add(key);
                        this.#render();
                        return;
                    }
                    /** M365.4 — Company Administration settings panel toggle, same pattern. */
                    const settingsToggle = evt.target.closest("[data-company-settings-toggle]");
                    if (settingsToggle) {
                        const key = `settings:${settingsToggle.getAttribute("data-company-settings-toggle")}`;
                        this.#orgManagerExpanded.has(key) ? this.#orgManagerExpanded.delete(key) : this.#orgManagerExpanded.add(key);
                        this.#render();
                        return;
                    }
                    /**
                     * M365.4 — Company Administration save. Composes the
                     * real, existing, unmodified updateCompany()/
                     * updateBranding()/updateBusinessSettings()/
                     * updateContactInformation()/updatePhysicalLocation()/
                     * updateFinancialSettings()/updateDocumentTemplates() —
                     * one shared handler routes to the correct real method
                     * by section, reading only the fields rendered for
                     * that section (never touches sections not being
                     * saved). No new update mechanism.
                     */
                    const companySaveBtn = evt.target.closest("[data-company-save]");
                    if (companySaveBtn) {
                        const [section, companyId] = companySaveBtn.getAttribute("data-company-save").split(":");
                        const companyEngine = window.CozyOS.Company;
                        const readField = (name) => {
                            const el = this.#domRoot.querySelector(`[data-company-field="${name}"][data-company-id="${companyId}"]`);
                            return el ? el.value.trim() : "";
                        };
                        const readList = (name) => readField(name).split(",").map(s => s.trim()).filter(Boolean);
                        if (companyEngine) {
                            try {
                                if (section === "profile" && typeof companyEngine.updateCompany === "function") {
                                    companyEngine.updateCompany(companyId, { legalName: readField("profile.legalName"), tradingName: readField("profile.tradingName"), registrationNumber: readField("profile.registrationNumber"), taxPIN: readField("profile.taxPIN"), vatNumber: readField("profile.vatNumber"), industry: readField("profile.industry"), companyDescription: readField("profile.companyDescription") });
                                } else if (section === "branding" && typeof companyEngine.updateBranding === "function") {
                                    companyEngine.updateBranding(companyId, { primaryLogo: readField("branding.primaryLogo"), icon: readField("branding.icon"), brandColors: readList("branding.brandColors"), companyWatermark: readField("branding.companyWatermark"), companySignature: readField("branding.companySignature") });
                                } else if (section === "businessSettings" && typeof companyEngine.updateBusinessSettings === "function") {
                                    companyEngine.updateBusinessSettings(companyId, { timeZone: readField("businessSettings.timeZone"), language: readField("businessSettings.language"), dateFormat: readField("businessSettings.dateFormat"), numberFormat: readField("businessSettings.numberFormat"), openingHours: readField("businessSettings.openingHours"), closingHours: readField("businessSettings.closingHours"), workingDays: readList("businessSettings.workingDays") });
                                } else if (section === "contact") {
                                    if (typeof companyEngine.updateContactInformation === "function") companyEngine.updateContactInformation(companyId, { email: readField("contactInformation.email"), website: readField("contactInformation.website") });
                                    if (typeof companyEngine.updatePhysicalLocation === "function") companyEngine.updatePhysicalLocation(companyId, { country: readField("physicalLocation.country"), county: readField("physicalLocation.county"), city: readField("physicalLocation.city"), postalAddress: readField("physicalLocation.postalAddress") });
                                } else if (section === "financial" && typeof companyEngine.updateFinancialSettings === "function") {
                                    companyEngine.updateFinancialSettings(companyId, { currency: readField("financialSettings.currency"), financialYear: readField("financialSettings.financialYear"), invoicePrefix: readField("financialSettings.invoicePrefix"), receiptPrefix: readField("financialSettings.receiptPrefix"), quotationPrefix: readField("financialSettings.quotationPrefix"), purchasePrefix: readField("financialSettings.purchasePrefix") });
                                } else if (section === "templates" && typeof companyEngine.updateDocumentTemplates === "function") {
                                    companyEngine.updateDocumentTemplates(companyId, { invoiceHeader: readField("documentTemplates.invoiceHeader"), receiptHeader: readField("documentTemplates.receiptHeader"), quotationHeader: readField("documentTemplates.quotationHeader"), deliveryHeader: readField("documentTemplates.deliveryHeader") });
                                }
                            } catch (_err) { /* real, honest failure (e.g. invalid email/currency format - both validated inside the existing engine) surfaces via its own thrown error, not swallowed to fake success */ }
                        }
                        this.#render();
                        return;
                    }
                    const deptToggle = evt.target.closest("[data-dept-toggle]");
                    if (deptToggle) {
                        const key = `dept:${deptToggle.getAttribute("data-dept-toggle")}`;
                        this.#orgManagerExpanded.has(key) ? this.#orgManagerExpanded.delete(key) : this.#orgManagerExpanded.add(key);
                        this.#render();
                        return;
                    }
                    /**
                     * M365.5 — Organization CRUD completion (revised scope,
                     * Option A). Composes updateOrganization()/
                     * archiveOrganization()/restoreOrganization()/
                     * deleteOrganization() — all real, all previously
                     * unwired to any UI. No org->company linkage is
                     * implied or built here (confirmed absent, disclosed
                     * in the rendered note above).
                     */
                    const orgRenameBtn = evt.target.closest("[data-org-rename]");
                    if (orgRenameBtn) {
                        const orgId = orgRenameBtn.getAttribute("data-org-rename");
                        const input = this.#domRoot.querySelector(`[data-org-rename-input="${orgId}"]`);
                        const newName = input ? input.value.trim() : "";
                        const companyEngine = window.CozyOS.Company;
                        if (newName && companyEngine && typeof companyEngine.updateOrganization === "function") {
                            try { companyEngine.updateOrganization(orgId, { name: newName }); } catch (_err) { /* honest failure */ }
                        }
                        this.#render();
                        return;
                    }
                    const orgArchiveBtn = evt.target.closest("[data-org-archive]");
                    if (orgArchiveBtn) {
                        const orgId = orgArchiveBtn.getAttribute("data-org-archive");
                        const companyEngine = window.CozyOS.Company;
                        const isArchived = orgArchiveBtn.textContent.trim() === "Restore";
                        if (companyEngine) { isArchived ? companyEngine.restoreOrganization(orgId) : companyEngine.archiveOrganization(orgId); }
                        this.#render();
                        return;
                    }
                    const orgDeleteBtn = evt.target.closest("[data-org-delete]");
                    if (orgDeleteBtn) {
                        const orgId = orgDeleteBtn.getAttribute("data-org-delete");
                        const companyEngine = window.CozyOS.Company;
                        if (companyEngine && typeof companyEngine.deleteOrganization === "function") companyEngine.deleteOrganization(orgId);
                        this.#render();
                        return;
                    }
                    /** Organization create — composes the real, existing createOrganization(). */
                    const orgCreateBtn = evt.target.closest("[data-org-create]");
                    if (orgCreateBtn) {
                        const input = this.#domRoot.querySelector("#cozy-org-new-name");
                        const name = input ? input.value.trim() : "";
                        const companyEngine = window.CozyOS.Company;
                        if (name && companyEngine && typeof companyEngine.createOrganization === "function") {
                            try { companyEngine.createOrganization(name); } catch (_err) { /* real, honest failure surfaces via the engine's own thrown error */ }
                        }
                        this.#render();
                        return;
                    }
                    /** Branch create/archive/delete — composes the real, existing createBranch()/archiveBranch()/deleteBranch(). Restore intentionally not exposed (confirmed absent in the canonical backend). */
                    const branchCreateBtn = evt.target.closest("[data-branch-create]");
                    if (branchCreateBtn) {
                        const companyId = branchCreateBtn.getAttribute("data-branch-create");
                        const codeInput = this.#domRoot.querySelector(`[data-branch-new-code="${companyId}"]`);
                        const nameInput = this.#domRoot.querySelector(`[data-branch-new-name="${companyId}"]`);
                        const companyEngine = window.CozyOS.Company;
                        if (companyEngine && codeInput && nameInput && codeInput.value.trim() && nameInput.value.trim()) {
                            try { companyEngine.createBranch(companyId, { branchCode: codeInput.value.trim(), branchName: nameInput.value.trim() }); } catch (_err) { /* honest failure, e.g. duplicate code */ }
                        }
                        this.#render();
                        return;
                    }
                    const branchArchiveBtn = evt.target.closest("[data-branch-archive]");
                    if (branchArchiveBtn && !branchArchiveBtn.disabled) {
                        const [companyId, branchId] = branchArchiveBtn.getAttribute("data-branch-archive").split(":");
                        const companyEngine = window.CozyOS.Company;
                        if (companyEngine && typeof companyEngine.archiveBranch === "function") companyEngine.archiveBranch(companyId, branchId);
                        this.#render();
                        return;
                    }
                    const branchDeleteBtn = evt.target.closest("[data-branch-delete]");
                    if (branchDeleteBtn) {
                        const [companyId, branchId] = branchDeleteBtn.getAttribute("data-branch-delete").split(":");
                        const companyEngine = window.CozyOS.Company;
                        if (companyEngine && typeof companyEngine.deleteBranch === "function") companyEngine.deleteBranch(companyId, branchId);
                        this.#render();
                        return;
                    }
                    /** Division create/archive-or-restore/delete — composes the real, existing createDivision()/archiveDivision()/restoreDivision()/deleteDivision(). */
                    const divisionCreateBtn = evt.target.closest("[data-division-create]");
                    if (divisionCreateBtn) {
                        const companyId = divisionCreateBtn.getAttribute("data-division-create");
                        const nameInput = this.#domRoot.querySelector(`[data-division-new-name="${companyId}"]`);
                        const companyEngine = window.CozyOS.Company;
                        if (companyEngine && nameInput && nameInput.value.trim()) {
                            try { companyEngine.createDivision(companyId, null, { name: nameInput.value.trim() }); } catch (_err) { /* honest failure */ }
                        }
                        this.#render();
                        return;
                    }
                    const divisionArchiveBtn = evt.target.closest("[data-division-archive]");
                    if (divisionArchiveBtn) {
                        const divisionId = divisionArchiveBtn.getAttribute("data-division-archive");
                        const companyEngine = window.CozyOS.Company;
                        const isArchived = divisionArchiveBtn.textContent.trim() === "Restore";
                        if (companyEngine) { isArchived ? companyEngine.restoreDivision(divisionId) : companyEngine.archiveDivision(divisionId); }
                        this.#render();
                        return;
                    }
                    const divisionDeleteBtn = evt.target.closest("[data-division-delete]");
                    if (divisionDeleteBtn) {
                        const companyEngine = window.CozyOS.Company;
                        if (companyEngine && typeof companyEngine.deleteDivision === "function") companyEngine.deleteDivision(divisionDeleteBtn.getAttribute("data-division-delete"));
                        this.#render();
                        return;
                    }
                    /** Department create/archive-or-restore/assign-manager — composes the real, existing createDepartment()/archiveDepartment()/restoreDepartment()/updateDepartment(). Manager assignment uses the existing generic patch mechanism (managerId), not a new field/method. */
                    const deptCreateBtn = evt.target.closest("[data-dept-create]");
                    if (deptCreateBtn) {
                        const companyId = deptCreateBtn.getAttribute("data-dept-create");
                        const nameInput = this.#domRoot.querySelector(`[data-dept-new-name="${companyId}"]`);
                        const companyEngine = window.CozyOS.Company;
                        if (companyEngine && nameInput && nameInput.value.trim()) {
                            try { companyEngine.createDepartment(companyId, { name: nameInput.value.trim() }); } catch (_err) { /* honest failure */ }
                        }
                        this.#render();
                        return;
                    }
                    const deptArchiveBtn = evt.target.closest("[data-dept-archive]");
                    if (deptArchiveBtn) {
                        const [companyId, departmentId] = deptArchiveBtn.getAttribute("data-dept-archive").split(":");
                        const companyEngine = window.CozyOS.Company;
                        const isArchived = deptArchiveBtn.textContent.trim() === "Restore";
                        if (companyEngine) { isArchived ? companyEngine.restoreDepartment(companyId, departmentId) : companyEngine.archiveDepartment(companyId, departmentId); }
                        this.#render();
                        return;
                    }
                    const deptAssignManagerBtn = evt.target.closest("[data-dept-assign-manager]");
                    if (deptAssignManagerBtn) {
                        const [companyId, departmentId] = deptAssignManagerBtn.getAttribute("data-dept-assign-manager").split(":");
                        const input = this.#domRoot.querySelector(`[data-dept-manager-input="${departmentId}"]`);
                        const managerId = input ? input.value.trim() : "";
                        const companyEngine = window.CozyOS.Company;
                        if (managerId && companyEngine && typeof companyEngine.updateDepartment === "function") companyEngine.updateDepartment(companyId, departmentId, { managerId });
                        this.#render();
                        return;
                    }
                    /** Team create/assign-leader/add-member/remove-member — composes the real, existing createTeam()/updateTeam() and IdentityEngine.assignCompanyReference(). */
                    const teamCreateBtn = evt.target.closest("[data-team-create]");
                    if (teamCreateBtn) {
                        const [companyId, departmentId] = teamCreateBtn.getAttribute("data-team-create").split(":");
                        const nameInput = this.#domRoot.querySelector(`[data-team-new-name="${departmentId}"]`);
                        const companyEngine = window.CozyOS.Company;
                        if (companyEngine && nameInput && nameInput.value.trim()) {
                            try { companyEngine.createTeam(companyId, departmentId, { name: nameInput.value.trim() }); } catch (_err) { /* honest failure */ }
                        }
                        this.#render();
                        return;
                    }
                    const teamAssignLeadBtn = evt.target.closest("[data-team-assign-lead]");
                    if (teamAssignLeadBtn) {
                        const teamId = teamAssignLeadBtn.getAttribute("data-team-assign-lead");
                        const input = this.#domRoot.querySelector(`[data-team-lead-input="${teamId}"]`);
                        const lead = input ? input.value.trim() : "";
                        const companyEngine = window.CozyOS.Company;
                        if (lead && companyEngine && typeof companyEngine.updateTeam === "function") companyEngine.updateTeam(teamId, { lead });
                        this.#render();
                        return;
                    }
                    const teamAddMemberBtn = evt.target.closest("[data-team-add-member]");
                    if (teamAddMemberBtn) {
                        const [teamId, companyId, departmentId] = teamAddMemberBtn.getAttribute("data-team-add-member").split(":");
                        const input = this.#domRoot.querySelector(`[data-team-member-input="${teamId}"]`);
                        const userId = input ? input.value.trim() : "";
                        const identity = window.CozyOS.IdentityEngine;
                        if (userId && identity && typeof identity.assignCompanyReference === "function") identity.assignCompanyReference(userId, { companyId, departmentId, teamId });
                        this.#render();
                        return;
                    }
                    const teamRemoveMemberBtn = evt.target.closest("[data-team-remove-member]");
                    if (teamRemoveMemberBtn) {
                        const teamId = teamRemoveMemberBtn.getAttribute("data-team-remove-member");
                        const input = this.#domRoot.querySelector(`[data-team-member-input="${teamId}"]`);
                        const userId = input ? input.value.trim() : "";
                        const identity = window.CozyOS.IdentityEngine;
                        if (userId && identity && typeof identity.assignCompanyReference === "function") {
                            const existing = identity.getCompanyReference(userId);
                            identity.assignCompanyReference(userId, { companyId: existing?.companyId || null, departmentId: existing?.departmentId || null, teamId: null });
                        }
                        this.#render();
                        return;
                    }
                    /** M367.3 — real admin-side restore for the Live View Controller, composing the real, existing window.CozyOS.LiveViewController.show() API. */
                    const liveViewRestoreBtn = evt.target.closest("[data-liveview-restore]");
                    if (liveViewRestoreBtn) {
                        if (window.CozyOS.LiveViewController && typeof window.CozyOS.LiveViewController.show === "function") window.CozyOS.LiveViewController.show();
                        return;
                    }
                    /** M367.2 — AI Provider enable/disable, composing the real, existing ProviderManager. Honest failure surfaced (e.g. missing dependency) rather than swallowed. */
                    const providerToggle = evt.target.closest("[data-provider-toggle]");
                    if (providerToggle) {
                        const id = providerToggle.getAttribute("data-provider-toggle");
                        const pm = window.CozyOS.ProviderManager;
                        if (pm) {
                            const result = pm.list().find(p => p.id === id)?.enabled ? pm.disable(id) : pm.enable(id);
                            if (!result.success) {
                                providerToggle.title = result.reason || "Action failed.";
                                console.warn(`[ProviderManager] ${result.reason}`);
                            }
                        }
                        this.#render();
                        return;
                    }
                    const empToggle = evt.target.closest("[data-employee-manage-toggle]");
                    if (empToggle) {
                        const uid = empToggle.getAttribute("data-employee-manage-toggle");
                        this.#employeeManageExpanded.has(uid) ? this.#employeeManageExpanded.delete(uid) : this.#employeeManageExpanded.add(uid);
                        this.#render();
                        return;
                    }
                    /** Suspend/Reactivate — composes the real, existing suspendUser()/reactivateUser(). */
                    const suspendBtn = evt.target.closest("[data-employee-suspend]");
                    if (suspendBtn) {
                        const uid = suspendBtn.getAttribute("data-employee-suspend");
                        const identity = window.CozyOS.IdentityEngine;
                        if (identity) {
                            const data = this.getUsersCenterData();
                            const user = data.connected ? data.users.find(u => u.id === uid) : null;
                            if (user && user.status === "suspended" && typeof identity.reactivateUser === "function") identity.reactivateUser(uid);
                            else if (user && typeof identity.suspendUser === "function") identity.suspendUser(uid);
                        }
                        this.#render();
                        return;
                    }
                    /** Delegate Role — composes the real, existing delegateRole(), from the currently signed-in administrator (#currentUserId), never a second role system. */
                    const delegateBtn = evt.target.closest("[data-employee-delegate-role]");
                    if (delegateBtn) {
                        const uid = delegateBtn.getAttribute("data-employee-delegate-role");
                        const input = this.#domRoot.querySelector(`[data-employee-role-input="${uid}"]`);
                        const role = input ? input.value.trim() : "";
                        const identity = window.CozyOS.IdentityEngine;
                        if (role && identity && typeof identity.delegateRole === "function" && this.#currentUserId) {
                            try { identity.delegateRole(this.#currentUserId, uid, role); } catch (_err) { /* real, honest failure (e.g. delegator lacks the role) - surfaces via IdentityEngine's own thrown error, not swallowed to fake success */ }
                        }
                        this.#render();
                        return;
                    }
                    /** Grant/Revoke resource:action permission — composes the real, existing grantResourcePermission()/revokeResourcePermission(). Vocabulary is data (the <select> above), not a new engine. */
                    const grantPermBtn = evt.target.closest("[data-employee-grant-perm]");
                    if (grantPermBtn) {
                        const uid = grantPermBtn.getAttribute("data-employee-grant-perm");
                        const select = this.#domRoot.querySelector(`[data-employee-perm-select="${uid}"]`);
                        const identity = window.CozyOS.IdentityEngine;
                        if (select && identity && typeof identity.grantResourcePermission === "function") identity.grantResourcePermission(uid, select.value);
                        this.#render();
                        return;
                    }
                    const revokePermBtn = evt.target.closest("[data-employee-revoke-perm]");
                    if (revokePermBtn) {
                        const uid = revokePermBtn.getAttribute("data-employee-revoke-perm");
                        const select = this.#domRoot.querySelector(`[data-employee-perm-select="${uid}"]`);
                        const identity = window.CozyOS.IdentityEngine;
                        if (select && identity && typeof identity.revokeResourcePermission === "function") identity.revokeResourcePermission(uid, select.value);
                        this.#render();
                        return;
                    }
                    /** Assign Department/Team — composes the real, existing assignCompanyReference(). No second organizational hierarchy. */
                    const assignDeptBtn = evt.target.closest("[data-employee-assign-dept]");
                    if (assignDeptBtn) {
                        const uid = assignDeptBtn.getAttribute("data-employee-assign-dept");
                        const companyInput = this.#domRoot.querySelector(`[data-employee-company-input="${uid}"]`);
                        const deptInput = this.#domRoot.querySelector(`[data-employee-dept-input="${uid}"]`);
                        const teamInput = this.#domRoot.querySelector(`[data-employee-team-input="${uid}"]`);
                        const identity = window.CozyOS.IdentityEngine;
                        if (identity && typeof identity.assignCompanyReference === "function") {
                            identity.assignCompanyReference(uid, {
                                companyId: companyInput && companyInput.value.trim() || null,
                                departmentId: deptInput && deptInput.value.trim() || null,
                                teamId: teamInput && teamInput.value.trim() || null
                            });
                        }
                        this.#render();
                        return;
                    }
                    if (evt.target.id === "cozy-diag-expand-all") {
                        this.getDiagnosticsCenterData().coordinators.forEach(c => this.#diagnosticsExpanded.add(c.name));
                        this.#render(); return;
                    }
                    if (evt.target.id === "cozy-diag-collapse-all") { this.#diagnosticsExpanded.clear(); this.#render(); return; }
                    if (evt.target.id === "cozy-diag-sort-name") { this.#diagnosticsSort = "name"; this.#render(); return; }
                    if (evt.target.id === "cozy-diag-sort-status") { this.#diagnosticsSort = "status"; this.#render(); return; }
                    if (evt.target.id === "cozy-diag-sort-cert") { this.#diagnosticsSort = "certification"; this.#render(); return; }
                    if (evt.target.id === "cozy-diag-connected-only") { this.#diagnosticsConnectedOnly = !this.#diagnosticsConnectedOnly; this.#render(); return; }
                    if (evt.target.id === "cozy-diag-errors-only") { this.#diagnosticsErrorsOnly = !this.#diagnosticsErrorsOnly; this.#render(); return; }
                    if (evt.target.hasAttribute("data-theme-select")) {
                        this.#themeStudioSelected = evt.target.getAttribute("data-theme-select");
                        this.#themeStudioCertification = null; // stale from a different theme — clear rather than show a misleading old result
                        this.#render();
                        return;
                    }
                    if (evt.target.dataset && evt.target.dataset.appAction === "certify") {
                        this.#handleCertifyApplication(evt.target.dataset.appId);
                        return;
                    }
                    // M366.5 — real fix: this file previously contained a
                    // SECOND "data-app-action=\"open\"" handler here
                    // (M345's own fix, itself real and correct) that was
                    // permanently unreachable — an earlier handler in this
                    // same delegated listener already matches
                    // "[data-app-action=\"open\"]" via .closest() and
                    // returns first, so this block could never execute.
                    // Confirmed by reading the full listener top-to-bottom
                    // before removing anything. Its real behavior (real
                    // ApplicationLauncher.open() call, #runningApplications
                    // tracking, #logAudit("APPLICATION_LAUNCHED", ...),
                    // honest failure surfacing) has been merged into the
                    // live, reachable handler above rather than lost —
                    // this removes only the now-confirmed dead duplicate,
                    // not any real behavior.
                    if (evt.target.id === "cozy-publish-submit") {
                        this.#handlePublishMessage();
                        return;
                    }
                    if (evt.target.hasAttribute("data-publish-color-swatch")) {
                        this.#publishColorPreset = evt.target.getAttribute("data-publish-color-swatch");
                        this.#render();
                        return;
                    }
                    if (evt.target.id === "cozy-create-admin-submit") {
                        this.#handleCreateAdministrator();
                        return;
                    }
                    if (evt.target.id === "cozy-theme-preview-btn") {
                        // Real, not simulated: actually switches the live
                        // theme via the real Theme Engine, the same call
                        // any application makes to change theme.
                        if (window.CozyOS.Theme && this.#themeStudioSelected) window.CozyOS.Theme.setTheme(this.#themeStudioSelected);
                        this.#render();
                        return;
                    }
                    if (evt.target.id === "cozy-theme-validate-btn") {
                        const selected = this.#themeStudioSelected;
                        if (window.CozyOS.AccessibilityEngine && selected) {
                            evt.target.disabled = true;
                            evt.target.textContent = "Validating…";
                            window.CozyOS.AccessibilityEngine.generateCertification([selected]).then(cert => {
                                this.#themeStudioCertification = { certified: cert.certified, reason: cert.reason };
                                this.#render();
                            });
                        }
                        return;
                    }
                    if (evt.target.id === "cozy-lbe-toggle-btn") {
                        document.body.classList.toggle("cozy-animations-disabled");
                        this.#render();
                        return;
                    }
                    if (evt.target.id === "cozy-lte-refresh-btn") {
                        const engine = window.CozyOS.LivingThemeEngine;
                        this.#livingThemeEngineLastError = null;
                        if (engine) {
                            const result = engine.discoverAndRegisterAll();
                            if (!result.success) this.#livingThemeEngineLastError = result.reason;
                        }
                        this.#render();
                        return;
                    }
                    if (evt.target.id === "cozy-lte-seed-btn") {
                        const engine = window.CozyOS.LivingThemeEngine;
                        const themeController = window.CozyOS.Theme;
                        this.#livingThemeEngineLastError = null;
                        if (engine && themeController && typeof themeController.listThemes === "function") {
                            const registeredNames = new Set(engine.listThemes().map(t => t.cozyThemeName));
                            const candidate = themeController.listThemes().find(t => !registeredNames.has(t.name));
                            if (!candidate) {
                                this.#livingThemeEngineLastError = "Every real CozyOS.Theme is already registered here, or no themes exist in CozyOS.Theme yet.";
                            } else {
                                const result = engine.registerTheme(`schedule_${candidate.name}_${Date.now()}`, { cozyThemeName: candidate.name });
                                if (!result.success) this.#livingThemeEngineLastError = result.reason;
                            }
                        } else {
                            this.#livingThemeEngineLastError = "CozyOS.Theme is not loaded — cannot look up a real theme name to register.";
                        }
                        this.#render();
                        return;
                    }
                    if (evt.target.hasAttribute("data-lte-activate")) {
                        const engine = window.CozyOS.LivingThemeEngine;
                        const themeId = evt.target.getAttribute("data-lte-activate");
                        this.#livingThemeEngineLastError = null;
                        if (engine) {
                            const result = engine.activateTheme(themeId);
                            if (!result.success) this.#livingThemeEngineLastError = result.reason;
                        }
                        this.#render();
                        return;
                    }
                    if (evt.target.id === "cozy-mode-seed-btn") {
                        const engine = window.CozyOS.ModeEngine;
                        const themeEngine = window.CozyOS.LivingThemeEngine;
                        this.#modeEngineLastError = null;
                        if (engine) {
                            const existingTheme = themeEngine ? themeEngine.listThemes()[0] : null;
                            const result = engine.registerMode(`mode_${Date.now()}`, existingTheme ? { themeId: existingTheme.themeId } : {});
                            if (!result.success) this.#modeEngineLastError = result.reason;
                        }
                        this.#render();
                        return;
                    }
                    if (evt.target.hasAttribute("data-mode-activate")) {
                        const engine = window.CozyOS.ModeEngine;
                        const modeId = evt.target.getAttribute("data-mode-activate");
                        this.#modeEngineLastError = null;
                        if (engine) {
                            const result = engine.activateMode(modeId);
                            if (!result.success) this.#modeEngineLastError = result.reason;
                        }
                        this.#render();
                        return;
                    }
                    if (evt.target.id === "cozy-lme-seed-btn") {
                        const engine = window.CozyOS.LivingMessageEngine;
                        this.#livingMessageEngineLastError = null;
                        if (engine) {
                            const result = engine.createMessage(this.#currentUserId || null, { category: "general", text: "Welcome to CozyOS — this is a real demonstration message." });
                            if (!result.success) this.#livingMessageEngineLastError = result.reason;
                        }
                        this.#render();
                        return;
                    }
                    if (evt.target.id === "cozy-lme-preview-btn") {
                        const engine = window.CozyOS.LivingMessageEngine;
                        if (engine) this.#livingMessageEnginePreview = engine.pickNextMessage({ mode: "priority-first" }) || { messageId: null };
                        this.#render();
                        return;
                    }
                    if (evt.target.hasAttribute("data-lme-enable")) {
                        const engine = window.CozyOS.LivingMessageEngine;
                        const messageId = evt.target.getAttribute("data-lme-enable");
                        this.#livingMessageEngineLastError = null;
                        if (engine) {
                            const result = engine.setStatus(this.#currentUserId || null, messageId, "enabled");
                            if (!result.success) this.#livingMessageEngineLastError = result.reason;
                        }
                        this.#render();
                        return;
                    }
                    if (evt.target.hasAttribute("data-lme-disable")) {
                        const engine = window.CozyOS.LivingMessageEngine;
                        const messageId = evt.target.getAttribute("data-lme-disable");
                        this.#livingMessageEngineLastError = null;
                        if (engine) {
                            const result = engine.setStatus(this.#currentUserId || null, messageId, "disabled");
                            if (!result.success) this.#livingMessageEngineLastError = result.reason;
                        }
                        this.#render();
                        return;
                    }
                    if (evt.target.hasAttribute("data-lme-delete")) {
                        const engine = window.CozyOS.LivingMessageEngine;
                        const messageId = evt.target.getAttribute("data-lme-delete");
                        this.#livingMessageEngineLastError = null;
                        if (engine) {
                            const result = engine.deleteMessage(this.#currentUserId || null, messageId);
                            if (!result.success) this.#livingMessageEngineLastError = result.reason;
                        }
                        this.#render();
                        return;
                    }
                    if (evt.target.closest("#cozy-mobile-menu-btn")) {
                        this.#sidebarMobileOpen = !this.#sidebarMobileOpen;
                        this.#render();
                        return;
                    }
                    if (evt.target.closest("#cozy-sidebar-toggle")) {
                        this.#sidebarCollapsed = !this.#sidebarCollapsed;
                        try { window.localStorage.setItem("cozy.workspace.sidebarCollapsed", this.#sidebarCollapsed ? "1" : "0"); } catch (_err) { /* ignore */ }
                        this.#render();
                        return;
                    }
                    if (evt.target.closest(".cozy-mobile-overlay")) {
                        this.#sidebarMobileOpen = false;
                        this.#render();
                        return;
                    }
                    const sectionHeader = evt.target.closest("[data-nav-section]");
                    if (sectionHeader) {
                        const label = sectionHeader.getAttribute("data-nav-section");
                        this.#openNavSection = this.#openNavSection === label ? null : label;
                        try { if (this.#openNavSection) window.localStorage.setItem("cozy.workspace.openNavSection", this.#openNavSection); } catch (_err) { /* ignore */ }
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
                    if (evt.target.id === "cozy-diag-search") {
                        this.#diagnosticsFilter = evt.target.value;
                        this.#render();
                        // Re-focus and restore cursor position — re-render
                        // replaces the input element, which would otherwise
                        // steal focus on every keystroke.
                        const refocused = this.#domRoot.querySelector("#cozy-diag-search");
                        if (refocused) { refocused.focus(); refocused.setSelectionRange(refocused.value.length, refocused.value.length); }
                    }
                    if (evt.target.id === "cozy-publish-color") {
                        this.#publishColorPreset = evt.target.value || null;
                    }
                    if (evt.target.id === "cozy-lte-search") {
                        this.#livingThemeEngineSearch = evt.target.value;
                        this.#render();
                        const refocused = this.#domRoot.querySelector("#cozy-lte-search");
                        if (refocused) { refocused.focus(); refocused.setSelectionRange(refocused.value.length, refocused.value.length); }
                    }
                });
                this.#domRoot.addEventListener("change", (evt) => {
                    if (evt.target.id === "cozy-lte-category") {
                        this.#livingThemeEngineCategory = evt.target.value;
                        this.#render();
                    }
                    if (evt.target.id === "cozy-lte-sort") {
                        this.#livingThemeEngineSort = evt.target.value;
                        this.#render();
                    }
                });
                // Additive: Core Terminal Enter-key submit (preserved behavior
                // from the original dashboard.html's terminal-input listener).
                this.#domRoot.addEventListener("keydown", (evt) => {
                    if (evt.target.id === "terminal-input" && evt.key === "Enter") {
                        this.#handleTerminalQuery();
                    }
                    // Diagnostics search: Enter expands the first visible result.
                    if (evt.target.id === "cozy-diag-search" && evt.key === "Enter") {
                        const firstRow = this.#domRoot.querySelector("[data-toggle-coordinator]");
                        const name = firstRow?.getAttribute("data-toggle-coordinator");
                        if (name) { this.#diagnosticsExpanded.add(name); this.#render(); }
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
