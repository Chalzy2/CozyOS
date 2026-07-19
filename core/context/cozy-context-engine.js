/**
 * CozyOS Context Engine
 * File Reference: core/context/cozy-context-engine.js
 * Layer: Core / Shared Shell Service — Application Context & Personality
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   Per the CozyOS Universal Architecture Directive (Section 12): every
 *   application has a "personality" — welcome messages, daily content,
 *   reminders, widgets — that changes the CONTENT shown, never the
 *   platform. This engine is the single, shell-owned place that content
 *   lives, so the Shared Shell (cozy-shell.html) can show it without any
 *   application building its own dashboard/widget system.
 *
 * ARCHITECTURE SPLIT (per the CozyOS Universal Architecture Directive)
 *   This engine is a PLATFORM engine, not a content engine. Its
 *   responsibility is to discover, load, schedule/rotate, expose, and
 *   notify — never to author or own application content itself. Real
 *   Context Packs live as separate files under core/context/packs/ (e.g.
 *   church-context.js, school-context.js), one per application, each
 *   self-registering via registerContextPack() when its own <script> tag
 *   loads — the same self-registration convention every other CozyOS
 *   coordinator already uses (Certification, CozyMemory, ServiceRegistry,
 *   etc.). "Discovery" in CozyOS therefore means "whichever pack scripts
 *   are actually loaded register themselves" — there is no directory-
 *   scanning mechanism, because a static offline platform has no server-side
 *   directory listing to scan, and inventing one to discover nothing would
 *   itself violate the Zero Fabrication Rule below.
 *
 * ZERO FABRICATION RULE
 *   This engine ships with NO application content of any kind — no Bible
 *   verses, no math facts, no health tips, nothing. It is real, working
 *   infrastructure with zero registered packs until an application
 *   actually registers one via registerContextPack(). Every read honestly
 *   reports "no context pack registered" for an app that hasn't, rather
 *   than inventing plausible-sounding content — the same Honest Capability
 *   convention already used throughout CozyOS (e.g. CozyMemory's
 *   semanticSearch(), CozyOCR's missing-provider handling).
 *
 * WHAT A CONTEXT PACK IS
 *   A plain object an application registers once, containing whatever
 *   subset of these an app wants to provide (all optional):
 *     welcomeMessage, dailyContent: [{ type, text }], widgets: [{ id,
 *     title, render }], reminders: [{ id, text, cadence }], shortcuts:
 *     [{ label, action }]
 *   "render" fields, if present, are plain HTML strings the caller
 *   supplies — this engine never executes or evaluates anything; it only
 *   stores and returns what it's given, same Zero Logic Rule as
 *   CozyCertification.
 */
(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const CONTEXT_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    class CozyContextEngine {
        #packs = new Map(); // appId -> frozen { appId, registeredAt, updatedAt, ...pack }
        #auditLogs = [];
        #listeners = new Map();
        #onceWrapped = new Map();
        #diagnostics = { packsRegistered: 0, lookups: 0, lookupsMissed: 0, errorsHidden: 0 };

        getVersion() { return CONTEXT_VERSION; }

        #deepClone(value) {
            if (typeof structuredClone === "function") { try { return structuredClone(value); } catch (_err) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(value)); } catch (_err) { return value; }
        }

        #enforceNoForbiddenKeys(obj, path) {
            if (!obj || typeof obj !== "object") return;
            for (const key of Object.keys(obj)) {
                if (FORBIDDEN_KEYS.has(key)) {
                    throw new Error(`[ContextEngine] Prototype-pollution key "${key}" rejected at path "${path}.${key}".`);
                }
                this.#enforceNoForbiddenKeys(obj[key], `${path}.${key}`);
            }
        }

        #logAudit(action, msg) {
            this.#auditLogs.push(Object.freeze({ id: "ctx_" + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random()), timestamp: new Date().toISOString(), action, msg }));
            if (this.#auditLogs.length > 500) this.#auditLogs.shift();
        }

        getAuditLog(predicate) {
            const list = this.#auditLogs.map(e => this.#deepClone(e));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

        // ---- event bus (on/off/once/emit) — same shape as every other CozyOS coordinator ----
        on(eventName, handler) {
            if (typeof eventName !== "string" || !eventName.trim()) throw new TypeError("[ContextEngine] on(): eventName must be a non-empty string.");
            if (typeof handler !== "function") throw new TypeError("[ContextEngine] on(): handler must be a function.");
            if (!this.#listeners.has(eventName)) this.#listeners.set(eventName, new Set());
            this.#listeners.get(eventName).add(handler);
            return () => this.off(eventName, handler);
        }
        off(eventName, handler) {
            const set = this.#listeners.get(eventName);
            if (!set) return false;
            const wrapped = this.#onceWrapped.get(handler);
            const removed = set.delete(handler) || (wrapped ? set.delete(wrapped) : false);
            if (set.size === 0) this.#listeners.delete(eventName);
            return removed;
        }
        once(eventName, handler) {
            if (typeof handler !== "function") throw new TypeError("[ContextEngine] once(): handler must be a function.");
            const wrapper = (payload) => { this.off(eventName, handler); this.#onceWrapped.delete(handler); handler(payload); };
            this.#onceWrapped.set(handler, wrapper);
            this.on(eventName, wrapper);
        }
        emit(eventName, payload) {
            const set = this.#listeners.get(eventName);
            if (!set || set.size === 0) return false;
            let safePayload; try { safePayload = this.#deepClone(payload); } catch (_err) { safePayload = payload; }
            for (const fn of Array.from(set)) { try { fn(safePayload); } catch (_err) { this.#diagnostics.errorsHidden++; } }
            return true;
        }

        /**
         * registerContextPack(appId, pack)
         *   Real registration. Re-registering an existing appId UPDATES it
         *   (idempotent, same convention as ServiceRegistry.registerApplication),
         *   since an app re-announcing its context after a reload is normal.
         */
        registerContextPack(appId, pack) {
            if (typeof appId !== "string" || !appId.trim()) {
                throw new TypeError("[ContextEngine] registerContextPack(): appId is required and must be a non-empty string.");
            }
            if (!pack || typeof pack !== "object") {
                throw new TypeError("[ContextEngine] registerContextPack(): pack must be a plain object.");
            }
            this.#enforceNoForbiddenKeys(pack, "registerContextPack");
            const isUpdate = this.#packs.has(appId);
            const record = Object.freeze({
                appId,
                welcomeMessage: pack.welcomeMessage ?? null,
                dailyContent: Object.freeze((pack.dailyContent ?? []).slice()),
                widgets: Object.freeze((pack.widgets ?? []).slice()),
                reminders: Object.freeze((pack.reminders ?? []).slice()),
                shortcuts: Object.freeze((pack.shortcuts ?? []).slice()),
                registeredAt: isUpdate ? this.#packs.get(appId).registeredAt : new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
            this.#packs.set(appId, record);
            this.#diagnostics.packsRegistered++;
            this.#logAudit(isUpdate ? "PACK_UPDATED" : "PACK_REGISTERED", `${appId} context pack ${isUpdate ? "updated" : "registered"}.`);
            this.emit(isUpdate ? "context:updated" : "context:registered", { appId });
            return record;
        }

        /**
         * getContextForApp(appId)
         *   Real lookup. Returns { connected: true, ...pack } if a pack is
         *   registered, or { connected: false, appId, message } if not —
         *   never a fabricated default pack. Callers (cozy-shell.html) must
         *   render the honest "no context yet" state when connected is false.
         */
        getContextForApp(appId) {
            this.#diagnostics.lookups++;
            const record = this.#packs.get(appId);
            if (!record) {
                this.#diagnostics.lookupsMissed++;
                return { connected: false, appId, message: `No context pack registered for "${appId}" yet.` };
            }
            return this.#deepClone({ connected: true, ...record });
        }

        hasContextPack(appId) { return this.#packs.has(appId); }

        unregisterContextPack(appId) {
            const removed = this.#packs.delete(appId);
            if (removed) {
                this.#logAudit("PACK_UNREGISTERED", `${appId} context pack unregistered.`);
                this.emit("context:unregistered", { appId });
            }
            return removed;
        }

        listRegisteredApps() { return Array.from(this.#packs.keys()); }

        // =====================================================================
        // ─── ACTIVE CONTEXT TRACKING ────────────────────────────────────────
        // Real "what's the current application" state, so a consumer (e.g.
        // cozy-shell.html) can ask once and be notified on change, rather
        // than re-deriving it from the theme attribute itself every time.
        // =====================================================================
        #activeAppId = null;

        /**
         * setActiveContext(appId)
         *   Real state change + real notification. Emits "context:activeChanged"
         *   with the real pack (or honest not-connected result) for the new
         *   app — the "notify applications when context changes"
         *   responsibility. No-op (but still emits) if appId has no
         *   registered pack; the event payload's own `connected` flag
         *   discloses that, same as any other lookup here.
         */
        setActiveContext(appId) {
            this.#activeAppId = appId;
            const context = this.getContextForApp(appId);
            this.emit("context:activeChanged", context);
            return context;
        }

        getActiveContext() {
            if (!this.#activeAppId) return { connected: false, appId: null, message: "No active application set yet." };
            return this.getContextForApp(this.#activeAppId);
        }

        // =====================================================================
        // ─── ROTATION / SCHEDULING ──────────────────────────────────────────
        // Real, deterministic scheduling logic — operates generically on
        // whatever dailyContent array a real registered pack actually
        // contains. Never invents an entry; an empty or missing pack
        // honestly reports there's nothing to rotate.
        // =====================================================================

        /**
         * getTodaysContent(appId)
         *   Deterministic "pick of the day" from the app's real
         *   dailyContent array — same entry all day (keyed off day-of-year),
         *   rotating to the next entry tomorrow. Pure scheduling logic; the
         *   entries themselves are whatever the real pack provided.
         */
        getTodaysContent(appId) {
            const context = this.getContextForApp(appId);
            if (!context.connected) return { available: false, message: context.message };
            const items = context.dailyContent || [];
            if (items.length === 0) return { available: false, message: `"${appId}"'s context pack has no dailyContent entries to rotate.` };
            const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
            return { available: true, index: dayOfYear % items.length, item: items[dayOfYear % items.length] };
        }

        isVersionCompatible(v) { const a = /^v?(\d+)\./.exec(CONTEXT_VERSION), b = /^v?(\d+)\./.exec(String(v || "")); return !!(a && b && a[1] === b[1]); }
        getDiagnosticsReport() {
            return this.#deepClone({
                moduleVersion: CONTEXT_VERSION, ...this.#diagnostics,
                registeredApps: this.listRegisteredApps(), activeAppId: this.#activeAppId,
                auditLogCount: this.#auditLogs.length
            });
        }
    }

    if (window.CozyOS.ContextEngine && typeof window.CozyOS.ContextEngine.getVersion === "function") {
        const existingVersion = window.CozyOS.ContextEngine.getVersion();
        if (existingVersion !== CONTEXT_VERSION) {
            throw new Error(`[CozyOS Framework Execution Error] VERSION_CONFLICT: ContextEngine existing v${existingVersion} conflicts with load target v${CONTEXT_VERSION}.`);
        }
        return;
    }

    window.CozyOS.ContextEngine = new CozyContextEngine();

    // Auto-register with the Service Registry — same bounded-retry pattern
    // used by every other CozyOS coordinator (Certification, CozyMemory, etc.).
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
        name: "ContextEngine", category: "Foundation", icon: "context-engine.svg",
        description: "CozyOS Context Engine — shell-owned application personality (welcome messages, daily content, widgets, reminders). Ships with zero fabricated content; honestly empty until an application registers its own real context pack."
    });
})();
