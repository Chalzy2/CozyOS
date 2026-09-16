/**
 * core/modules/intelligence/language-packs/storage/cozy-storage-provider.js
 * RP-035 COS-LANG-PM-001 — Portable Language-Pack Storage Provider Abstraction
 *
 * MISSION
 *   Give the language-pack engine ONE capability-honest surface for "where
 *   can a language pack physically live" — internal browser storage today,
 *   a user-picked external folder where the real File System Access API
 *   supports it, and an explicit, un-fabricated placeholder for direct
 *   Android SD-card access, which this application context does NOT have.
 *
 * OWNERSHIP / COMPOSITION (Rule 29 — read real APIs before writing)
 *   This file creates NO new low-level storage engine. It composes two
 *   already-real, already-tested engines found in this repository:
 *     - window.CozyOS.UniversalFileEngine (core/engines/files/
 *       universal-file-engine.js, Milestone M285) — the ONLY real
 *       filesystem-adjacent engine in CozyOS. Its "local-filesystem"
 *       provider is the actual File System Access API
 *       (showDirectoryPicker/getFileHandle/createWritable). This is also
 *       the ONLY honest path by which a USB/SD volume the OS has already
 *       mounted as a folder could ever be reached from this app — and
 *       ONLY where the browser exposes window.showDirectoryPicker, which
 *       it confirms rather than assumes.
 *     - window.CozyStorage / window.CozyOS.Storage (core/storage.js) —
 *       the ONLY component allowed to touch IndexedDB, reached the same
 *       way cozy-language-pack-persistence.js already reaches it.
 *   Neither engine is modified, subclassed-and-replaced, or duplicated.
 *
 * WHY A DIRECT "SD_CARD" PROVIDER DOES NOT EXIST HERE
 *   The user's real device is a Realme Android phone with a prepared SD
 *   card, accessed today through this PWA/browser chat surface. Android
 *   Chrome (and Android WebViews generally, as of this repository's last
 *   verification) does NOT implement window.showDirectoryPicker. That is
 *   confirmed at runtime by UniversalFileEngine's own capabilities() call,
 *   not assumed here. Consequently:
 *     - There is no browser API in this environment that can open an
 *       arbitrary Android SD-card path.
 *     - This file NEVER reports SD_CARD_DIRECT as AVAILABLE from inside
 *       the browser/PWA. It always reports STORAGE_UNAVAILABLE with an
 *       explicit note pointing to the Termux bridge tool
 *       (tools/termux/cozy-pack.js), which runs as a real Node.js process
 *       with real fs access and is documented separately.
 *     - Termux's filesystem access is a DIFFERENT process with DIFFERENT
 *       capabilities than this in-app engine. This file never conflates
 *       the two, per the milestone's most important rule (Part 25).
 *
 * HONESTY CONTRACT
 *   Every capability is one of: AVAILABLE, UNAVAILABLE, PERMISSION_REQUIRED,
 *   NOT_IMPLEMENTED, UNKNOWN. NOT_IMPLEMENTED is never silently reported as
 *   AVAILABLE. UNKNOWN is used (never a guessed number) when a real value
 *   cannot be obtained from the platform.
 */
(function (root) {
    "use strict";
    const w = root.window || root;
    w.CozyOS = w.CozyOS || {};
    w.CozyOS.Modules = w.CozyOS.Modules || {};
    if (w.CozyOS.Modules["cozy-storage-provider"]) return;

    const VERSION = "1.0.0";

    const CAPABILITY_STATES = Object.freeze([
        "AVAILABLE", "UNAVAILABLE", "PERMISSION_REQUIRED", "NOT_IMPLEMENTED", "UNKNOWN"
    ]);

    const PROVIDER_TYPES = Object.freeze([
        "INTERNAL_INDEXEDDB",      // window.CozyStorage — always the fallback
        "EXTERNAL_DIRECTORY",      // window.CozyOS.UniversalFileEngine local-filesystem
        "SD_CARD_DIRECT",          // never real from this app context — see header
        "ANDROID_NATIVE_BRIDGE"    // only if a real CozyOS native bridge exists
    ]);

    function fileEngine() {
        return (w.CozyOS && w.CozyOS.UniversalFileEngine) || null;
    }

    function storageGateway() {
        return (w.CozyOS && w.CozyOS.Storage) || w.CozyStorage || null;
    }

    /**
     * detectAndroidNativeBridge()
     *   Rule 29: search for an existing bridge before assuming one exists.
     *   As of this milestone, no CozyOS native bridge global was found
     *   anywhere in the repository (confirmed by search of the baseline
     *   tree). This function therefore always returns null today. It is
     *   left as a real detection point (not a stub that fakes success) so
     *   that if a genuine native bridge is added later, this file adopts
     *   it automatically without a rewrite — see Part 6C of the milestone.
     */
    function detectAndroidNativeBridge() {
        if (w.CozyOS && w.CozyOS.NativeStorageBridge &&
            typeof w.CozyOS.NativeStorageBridge.isAvailable === "function") {
            return w.CozyOS.NativeStorageBridge;
        }
        return null;
    }

    // -----------------------------------------------------------------
    // INTERNAL_INDEXEDDB provider — wraps window.CozyStorage
    // -----------------------------------------------------------------

    const internalProvider = {
        type: "INTERNAL_INDEXEDDB",

        getCapabilities() {
            const g = storageGateway();
            const available = !!(g && typeof g.save === "function" && typeof g.get === "function");
            return {
                read: available ? "AVAILABLE" : "UNAVAILABLE",
                write: available ? "AVAILABLE" : "UNAVAILABLE",
                delete: available ? "AVAILABLE" : "UNAVAILABLE",
                list: available ? "AVAILABLE" : "UNAVAILABLE",
                copy: "NOT_IMPLEMENTED",
                move: "NOT_IMPLEMENTED",
                mkdir: "NOT_IMPLEMENTED",
                freeSpace: "NOT_IMPLEMENTED",
                totalSpace: "NOT_IMPLEMENTED",
                packExport: available ? "AVAILABLE" : "UNAVAILABLE",
                packImport: available ? "AVAILABLE" : "UNAVAILABLE",
                note: available
                    ? "Real IndexedDB gateway (window.CozyStorage) present. Data persists in-browser only; freeSpace/totalSpace are not exposed by IndexedDB and are honestly NOT_IMPLEMENTED rather than estimated."
                    : "No real window.CozyStorage/window.CozyOS.Storage gateway found in this context."
            };
        },

        async getStatus() {
            const g = storageGateway();
            if (!g) return { status: "STORAGE_UNAVAILABLE", reason: "NO_REAL_GATEWAY" };
            try {
                const health = typeof g.health === "function" ? await g.health() : null;
                return {
                    status: health && health.databaseConnected ? "READY" : "STORAGE_PERMISSION_REQUIRED",
                    detail: health || null
                };
            } catch (err) {
                return { status: "STORAGE_UNAVAILABLE", reason: String(err && err.message || err) };
            }
        },

        getRoot() { return "indexeddb://CozyOS_Storage_Cluster/language_packs"; },

        async getFreeSpace() { return { bytes: null, state: "NOT_IMPLEMENTED" }; },
        async getTotalSpace() { return { bytes: null, state: "NOT_IMPLEMENTED" }; }
    };

    // -----------------------------------------------------------------
    // EXTERNAL_DIRECTORY provider — wraps window.CozyOS.UniversalFileEngine
    // -----------------------------------------------------------------

    const externalDirectoryProvider = {
        type: "EXTERNAL_DIRECTORY",
        _connectionId: null,

        getCapabilities() {
            const engine = fileEngine();
            if (!engine) {
                return {
                    read: "UNAVAILABLE", write: "UNAVAILABLE", delete: "UNAVAILABLE",
                    list: "UNAVAILABLE", copy: "NOT_IMPLEMENTED", move: "NOT_IMPLEMENTED",
                    mkdir: "NOT_IMPLEMENTED", freeSpace: "UNKNOWN", totalSpace: "UNKNOWN",
                    packExport: "UNAVAILABLE", packImport: "UNAVAILABLE",
                    note: "window.CozyOS.UniversalFileEngine is not present in this context."
                };
            }
            const supported = engine.capabilities()["local-filesystem"] === true;
            const state = supported
                ? (this._connectionId ? "AVAILABLE" : "PERMISSION_REQUIRED")
                : "UNAVAILABLE";
            return {
                read: state, write: state, delete: state, list: state,
                copy: "NOT_IMPLEMENTED", move: "NOT_IMPLEMENTED", mkdir: "NOT_IMPLEMENTED",
                freeSpace: supported ? "AVAILABLE" : "UNKNOWN",
                totalSpace: "NOT_IMPLEMENTED",
                packExport: state, packImport: state,
                note: supported
                    ? (this._connectionId
                        ? "File System Access API is supported and a folder is connected."
                        : "File System Access API is supported in this browser but no folder has been picked yet (requires a real user gesture via connect()).")
                    : "File System Access API (window.showDirectoryPicker) is not available in this browser/runtime — confirmed via UniversalFileEngine, not assumed. This is the expected result in most Android WebView/Chrome contexts today."
            };
        },

        async getStatus() {
            const engine = fileEngine();
            if (!engine) return { status: "STORAGE_UNAVAILABLE", reason: "NO_UNIVERSAL_FILE_ENGINE" };
            const supported = engine.capabilities()["local-filesystem"] === true;
            if (!supported) return { status: "STORAGE_UNAVAILABLE", reason: "FILE_SYSTEM_ACCESS_API_NOT_SUPPORTED" };
            if (!this._connectionId) return { status: "STORAGE_PERMISSION_REQUIRED", reason: "NO_FOLDER_CONNECTED" };
            return { status: "READY", connectionId: this._connectionId };
        },

        /** connect() — requires a real user gesture; never auto-invoked. */
        async connect() {
            const engine = fileEngine();
            if (!engine) return { ok: false, reason: "NO_UNIVERSAL_FILE_ENGINE" };
            const result = await engine.connectDevice("local-filesystem");
            if (result.success) {
                this._connectionId = result.id;
                return { ok: true, connectionId: result.id, name: result.name };
            }
            return { ok: false, reason: result.reason };
        },

        getRoot() { return this._connectionId ? `external-directory://${this._connectionId}` : null; },

        async list() {
            const engine = fileEngine();
            if (!engine || !this._connectionId) return { ok: false, reason: "NOT_CONNECTED" };
            const result = await engine.listFiles(this._connectionId);
            return result.success ? { ok: true, entries: result.entries } : { ok: false, reason: result.reason };
        },

        async read(filename) {
            const engine = fileEngine();
            if (!engine || !this._connectionId) return { ok: false, reason: "NOT_CONNECTED" };
            const result = await engine.readFile(this._connectionId, filename);
            return result.success ? { ok: true, content: result.content, size: result.size } : { ok: false, reason: result.reason };
        },

        async write(filename, content) {
            const engine = fileEngine();
            if (!engine || !this._connectionId) return { ok: false, reason: "NOT_CONNECTED" };
            const result = await engine.writeFile(this._connectionId, filename, content);
            return result.success ? { ok: true } : { ok: false, reason: result.reason };
        },

        async delete(filename) {
            const engine = fileEngine();
            if (!engine || !this._connectionId) return { ok: false, reason: "NOT_CONNECTED" };
            const result = await engine.deleteFile(this._connectionId, filename);
            return result.success ? { ok: true } : { ok: false, reason: result.reason };
        },

        async getFreeSpace() {
            const engine = fileEngine();
            if (!engine) return { bytes: null, state: "UNKNOWN" };
            const est = await engine.getStorageInfo();
            if (!est.available) return { bytes: null, state: "UNKNOWN", reason: est.reason };
            const free = (typeof est.quota === "number" && typeof est.usage === "number") ? (est.quota - est.usage) : null;
            return { bytes: free, state: free == null ? "UNKNOWN" : "AVAILABLE" };
        },
        async getTotalSpace() {
            const engine = fileEngine();
            if (!engine) return { bytes: null, state: "UNKNOWN" };
            const est = await engine.getStorageInfo();
            if (!est.available) return { bytes: null, state: "UNKNOWN", reason: est.reason };
            return { bytes: typeof est.quota === "number" ? est.quota : null, state: typeof est.quota === "number" ? "AVAILABLE" : "UNKNOWN" };
        }
    };

    // -----------------------------------------------------------------
    // SD_CARD_DIRECT — always honestly unavailable from this app context
    // -----------------------------------------------------------------

    const sdCardDirectProvider = {
        type: "SD_CARD_DIRECT",

        getCapabilities() {
            return {
                read: "UNAVAILABLE", write: "UNAVAILABLE", delete: "UNAVAILABLE",
                list: "UNAVAILABLE", copy: "UNAVAILABLE", move: "UNAVAILABLE",
                mkdir: "UNAVAILABLE", freeSpace: "UNAVAILABLE", totalSpace: "UNAVAILABLE",
                packExport: "UNAVAILABLE", packImport: "UNAVAILABLE",
                note: "Direct Android SD-card path access from browser/PWA JavaScript does not exist in this or any browser. This is not a missing permission that can be granted in-app — it is not an API browsers expose. The verified real path to the SD card is the Termux CLI bridge (tools/termux/cozy-pack.js), a separate Node.js process with real fs access, documented in tools/termux/README.md. This app context never claims otherwise."
            };
        },
        async getStatus() {
            return { status: "STORAGE_UNAVAILABLE", reason: "NO_BROWSER_API_FOR_ANDROID_SD_PATHS", bridge: "tools/termux/cozy-pack.js" };
        },
        getRoot() { return null; },
        async getFreeSpace() { return { bytes: null, state: "UNAVAILABLE" }; },
        async getTotalSpace() { return { bytes: null, state: "UNAVAILABLE" }; }
    };

    // -----------------------------------------------------------------
    // ANDROID_NATIVE_BRIDGE — only real if detectAndroidNativeBridge() finds one
    // -----------------------------------------------------------------

    function androidNativeBridgeProvider() {
        const bridge = detectAndroidNativeBridge();
        if (!bridge) {
            return {
                type: "ANDROID_NATIVE_BRIDGE",
                getCapabilities() {
                    return {
                        read: "NOT_IMPLEMENTED", write: "NOT_IMPLEMENTED", delete: "NOT_IMPLEMENTED",
                        list: "NOT_IMPLEMENTED", copy: "NOT_IMPLEMENTED", move: "NOT_IMPLEMENTED",
                        mkdir: "NOT_IMPLEMENTED", freeSpace: "NOT_IMPLEMENTED", totalSpace: "NOT_IMPLEMENTED",
                        packExport: "NOT_IMPLEMENTED", packImport: "NOT_IMPLEMENTED",
                        note: "No CozyOS native storage bridge exists in this repository (confirmed by search, not assumed absent). This provider slot exists so a real future bridge can register without any rewrite here."
                    };
                },
                async getStatus() { return { status: "STORAGE_UNAVAILABLE", reason: "NO_NATIVE_BRIDGE_REGISTERED" }; },
                getRoot() { return null; }
            };
        }
        // A real bridge was detected; delegate directly rather than wrapping/guessing its shape.
        return bridge;
    }

    // -----------------------------------------------------------------
    // Aggregate registry
    // -----------------------------------------------------------------

    const providers = {
        INTERNAL_INDEXEDDB: internalProvider,
        EXTERNAL_DIRECTORY: externalDirectoryProvider,
        SD_CARD_DIRECT: sdCardDirectProvider,
        get ANDROID_NATIVE_BRIDGE() { return androidNativeBridgeProvider(); }
    };

    function getProvider(type) {
        if (!PROVIDER_TYPES.includes(type)) return null;
        return providers[type];
    }

    async function getAllCapabilities() {
        const report = {};
        for (const type of PROVIDER_TYPES) {
            const p = getProvider(type);
            report[type] = p.getCapabilities();
        }
        return report;
    }

    async function getAllStatus() {
        const report = {};
        for (const type of PROVIDER_TYPES) {
            const p = getProvider(type);
            report[type] = await p.getStatus();
        }
        return report;
    }

    /**
     * choosePreferredProvider()
     *   Real, ordered preference: an already-connected EXTERNAL_DIRECTORY
     *   (a real user-picked folder — the honest stand-in for "portable
     *   storage" until Termux/native bridge exists) beats INTERNAL_INDEXEDDB
     *   for portability, but INTERNAL_INDEXEDDB is the only one guaranteed
     *   available and is therefore the default. Never selects SD_CARD_DIRECT
     *   (never real here) or an unregistered ANDROID_NATIVE_BRIDGE.
     */
    async function choosePreferredProvider() {
        const extStatus = await externalDirectoryProvider.getStatus();
        if (extStatus.status === "READY") return "EXTERNAL_DIRECTORY";
        return "INTERNAL_INDEXEDDB";
    }

    const api = Object.freeze({
        VERSION,
        CAPABILITY_STATES,
        PROVIDER_TYPES,
        getProvider,
        getAllCapabilities,
        getAllStatus,
        choosePreferredProvider,
        detectAndroidNativeBridge
    });

    w.CozyOS.CozyStorageProvider = api;
    w.CozyOS.Modules["cozy-storage-provider"] = Object.freeze({
        version: VERSION,
        api,
        description: "RP-035 COS-LANG-PM-001 — Capability-honest storage-provider abstraction for portable language-pack storage. Composes window.CozyOS.UniversalFileEngine (real File System Access API) and window.CozyStorage (real IndexedDB gateway); never fabricates direct Android SD-card access from the browser/PWA context, which has no such API. Direct SD access is delegated honestly to the separate Termux CLI bridge (tools/termux/cozy-pack.js)."
    });
})(typeof window !== "undefined" ? { window: window } : { window: (global.window = global.window || {}) });
