/**
 * CozyOS — Live / Connectivity Application
 * File Reference: core/connectivity/ui/cozy-live-connectivity-app.js
 * Repair: RP-035 Section 13
 *
 * Baseline: CozyOS-main-RP-035-Phase5.zip
 * SHA-256 0fd8fad385a77b03f40f7b4e08ec2b094a08d15100e46f7277e35a059d070fd1
 *
 * OWNERSHIP / COMPOSITION — no duplicated engine
 *   CozyLivingConnectivity (RP-033 Gate 1) — sole capability-detection
 *     and connectivity-state-machine authority; this file only calls
 *     its real detectCapabilities()/createConnectivitySession().
 *   CozyConnectivityTransport (RP-033 Gate 2) — sole pairing/transport/
 *     offline-queue authority; this file only reads its real
 *     queue.list()/getGateStatus() and calls its real
 *     createPairingSession()/attemptBluetoothPairing().
 *   CozyConnect — sole physical-transport provider registry; read via
 *     getDevices() only, never re-implemented.
 *   ServiceRegistry.registerApplication() — sole application-registry
 *     mechanism.
 *
 * VISIBILITY DECISION (explicit, not silent)
 *   Unlike Media Intelligence (Phase 5), this application is NOT
 *   registered as BUILT_IN here. The specification for Section 13
 *   does not instruct core/always-visible status, so this file
 *   registers the application through ServiceRegistry only —
 *   visibility remains an explicit administrator decision
 *   (assignApplication()/registerCoreApplication()), never assumed.
 *
 * NO FABRICATION
 *   Every capability surfaced here is read directly from
 *   CozyLivingConnectivity's real, honest CAPABILITY_STATUS values
 *   (AVAILABLE/PARTIAL/UNAVAILABLE/CAPABILITY_UNAVAILABLE/
 *   REQUIRES_USER_ACTION/REQUIRES_NATIVE_COMPANION). This file never
 *   upgrades ENGINE_EXISTS to AVAILABLE, or AVAILABLE to CONNECTED,
 *   on its own — a CONNECTED-equivalent state only ever appears if
 *   the underlying real session/queue state says so.
 *
 * RULE 82
 *   Not applicable to this domain (no language pack promotion logic
 *   anywhere in this file). No promote/forceAvailable/approvePack/
 *   setStatus mutator exists here.
 */
(function (root) {
    "use strict";

    const VERSION = "1.0.0";
    const APP_ID = "live_connectivity_001";
    const APP_NAME = "live-connectivity";

    function cozyOS() { return root.window.CozyOS; }
    function living() { const c = cozyOS(); return (c && c.CozyLivingConnectivity) || null; }
    function transport() { const c = cozyOS(); return (c && c.CozyConnectivityTransport) || null; }
    function connect() { const c = cozyOS(); return (c && c.CozyConnect) || null; }
    function serviceRegistry() { const c = cozyOS(); return (c && c.ServiceRegistry) || null; }
    function identity() { const c = cozyOS(); return (c && c.IdentityEngine) || null; }

    // -----------------------------------------------------------------
    // 1. CAPABILITY OVERVIEW — grouped for display, values read verbatim
    //    from the real engine, never re-derived or upgraded.
    // -----------------------------------------------------------------

    // Maps this application's display groups to the real report keys
    // CozyLivingConnectivity.detectCapabilities() actually returns.
    // A group with no real key present is CAPABILITY_UNAVAILABLE,
    // never silently omitted or guessed.
    const DISPLAY_GROUPS = Object.freeze({
        internet: ["internetAvailability"],
        bluetooth: ["bluetooth"],
        wifiDirect: ["nativeWifiDirect"],
        webRTC: ["webRTC", "webRTCDataChannel", "qrManualPairing"],
        nativeHotspot: ["nativeHotspotCreation"],
        camera: ["camera"],
        microphone: ["microphone"]
    });

    function getConnectivityOverview() {
        const eng = living();
        if (!eng) return { status: "CAPABILITY_UNAVAILABLE", groups: {} };
        const report = eng.detectCapabilities();
        const groups = {};
        Object.keys(DISPLAY_GROUPS).forEach((groupName) => {
            const keys = DISPLAY_GROUPS[groupName];
            const entries = keys
                .filter((k) => report[k])
                .map((k) => ({ key: k, status: report[k].status, reason: report[k].reason, source: report[k].source }));
            groups[groupName] = entries.length ? entries : [{ key: groupName, status: "CAPABILITY_UNAVAILABLE", reason: "No real detection source for this capability.", source: null }];
        });
        return { status: "OK", groups, rawReport: report };
    }

    // -----------------------------------------------------------------
    // 2. OFFLINE SYNC / QUEUE — real Transport queue only
    // -----------------------------------------------------------------

    function getQueueStatus() {
        const t = transport();
        if (!t || !t.queue) return { status: "CAPABILITY_UNAVAILABLE", items: [] };
        return { status: "OK", items: t.queue.list() };
    }

    // -----------------------------------------------------------------
    // 3. LOCAL DEVICE DISCOVERY — real CozyConnect registry only
    // -----------------------------------------------------------------

    function getLocalDevices() {
        const c = connect();
        if (!c || typeof c.getDevices !== "function") return { status: "CAPABILITY_UNAVAILABLE", devices: [] };
        return { status: "OK", devices: c.getDevices() };
    }

    // -----------------------------------------------------------------
    // 4. CONNECTIVITY SESSION — real state machine only, never a
    //    fabricated CONNECTED transition.
    // -----------------------------------------------------------------

    function startConnectivitySession(id) {
        const eng = living();
        if (!eng) return { status: "CAPABILITY_UNAVAILABLE" };
        const session = eng.createConnectivitySession(id);
        return { status: "OK", sessionId: session.id, state: session.state };
    }

    function getConnectivitySessionState(id) {
        const eng = living();
        if (!eng) return { status: "CAPABILITY_UNAVAILABLE" };
        const session = eng.getConnectivitySession(id);
        if (!session) return { status: "NOT_FOUND" };
        return { status: "OK", sessionId: session.id, state: session.state, history: session.getHistory() };
    }

    // -----------------------------------------------------------------
    // 5. PAIRING — real Transport pairing session composition only
    // -----------------------------------------------------------------

    function createPairingSession(opts) {
        const t = transport();
        if (!t || typeof t.createPairingSession !== "function") return { status: "CAPABILITY_UNAVAILABLE" };
        try {
            const session = t.createPairingSession(opts || {});
            return { status: "OK", session };
        } catch (e) { return { status: "FAILED", reason: e.message }; }
    }

    async function attemptBluetoothPairing(opts) {
        const t = transport();
        if (!t || typeof t.attemptBluetoothPairing !== "function") return { success: false, state: "CAPABILITY_UNAVAILABLE" };
        return t.attemptBluetoothPairing(opts || {});
    }

    // -----------------------------------------------------------------
    // 6. GATE STATUS — honest composed status, never upgraded
    // -----------------------------------------------------------------

    function getGateStatus() {
        return {
            gate1: living() ? living().getGateStatus() : { status: "CAPABILITY_UNAVAILABLE" },
            gate2: transport() ? transport().getGateStatus() : { status: "CAPABILITY_UNAVAILABLE" }
        };
    }

    // -----------------------------------------------------------------
    // 7. DASHBOARD REGISTRATION — visibility stays an explicit,
    //    separate decision; this app is NOT auto-registered BUILT_IN.
    // -----------------------------------------------------------------

    function registerAsApplication() {
        const sr = serviceRegistry();
        if (!sr || typeof sr.registerApplication !== "function") return { serviceRegistry: "CAPABILITY_UNAVAILABLE" };
        try {
            sr.registerApplication({
                id: APP_ID, name: "Live / Connectivity", version: VERSION, category: "Connectivity",
                description: "RP-035 Section 13 — real, composed view of RP-033 Gate 1/2 connectivity capabilities, offline queue, local device discovery, and pairing. No new transport/sync engine; no fabricated connection state."
            });
            return { serviceRegistry: "REGISTERED" };
        } catch (e) { return { serviceRegistry: "FAILED" }; }
    }

    // -----------------------------------------------------------------
    // 8. CAPABILITY REGISTRY — truthful only
    // -----------------------------------------------------------------

    function getCapabilityStatus() {
        return {
            capabilityDetection: living() ? "AVAILABLE" : "CAPABILITY_UNAVAILABLE",
            pairingTransport: transport() ? "AVAILABLE" : "CAPABILITY_UNAVAILABLE",
            localDeviceDiscovery: connect() ? "AVAILABLE" : "CAPABILITY_UNAVAILABLE",
            offlineQueue: (transport() && transport().queue) ? "AVAILABLE" : "CAPABILITY_UNAVAILABLE",
            bluetoothGATT: "CAPABILITY_UNAVAILABLE", // Gate 2's own honest scope — detection/pairing only
            nativeWifiDirect: "REQUIRES_NATIVE_COMPANION",
            nativeHotspot: "REQUIRES_NATIVE_COMPANION",
            dashboardVisibility: (identity() && identity().isCoreApplication(APP_NAME)) ? "BUILT_IN" : "NOT_CORE"
        };
    }

    // -----------------------------------------------------------------
    // 9. PUBLIC API
    // -----------------------------------------------------------------

    const api = Object.freeze({
        getVersion: () => VERSION,
        APP_ID, APP_NAME,
        getConnectivityOverview,
        getQueueStatus,
        getLocalDevices,
        startConnectivitySession,
        getConnectivitySessionState,
        createPairingSession,
        attemptBluetoothPairing,
        getGateStatus,
        registerAsApplication,
        getCapabilityStatus
    });

    root.window.CozyOS = root.window.CozyOS || {};
    root.window.CozyOS.Modules = root.window.CozyOS.Modules || {};
    if (!root.window.CozyOS.Modules["cozy-live-connectivity-app"]) {
        root.window.CozyOS.CozyLiveConnectivityApp = api;
        root.window.CozyOS.Modules["cozy-live-connectivity-app"] = Object.freeze({
            version: VERSION,
            api,
            description: "RP-035 Section 13 — Live/Connectivity application. Composes RP-033 Gate 1/2, CozyConnect, ServiceRegistry, IdentityEngine real APIs only; no duplicated transport/sync/discovery engine."
        });
    }
    if (root.window.CozyOS.ServiceRegistry && typeof root.window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            root.window.CozyOS.ServiceRegistry.registerCoordinator({
                id: "cozy-live-connectivity-app",
                version: VERSION,
                description: "RP-035 Section 13 Live/Connectivity application coordinator."
            });
        } catch (e) { /* registry optional */ }
    }
})(typeof window !== "undefined" ? { window: window } : { window: (global.window = global.window || {}) });
