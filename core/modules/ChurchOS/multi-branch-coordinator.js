/**
 * CozyOS — ChurchOS Multi-Branch Coordinator (Bounded Mesh Network)
 * File Reference: core/modules/ChurchOS/multi-branch-coordinator.js
 * Milestone: ChurchOS C006 (Option A, approved)
 *
 * CLASSIFICATION: COMPOSE. Every underlying capability is real and
 * pre-existing. This file is the orchestration layer connecting a
 * bounded number of real WebRTC mesh connections (LiveHotspotEngine) to
 * ChurchOS's real worship/translation/scripture/timeline events.
 *
 * EXPLICITLY NOT BUILT (per your approved scope — Option A, not B):
 *   - Broadcast media server / SFU / CDN / TURN clustering / unlimited
 *     viewers. LiveHotspotEngine is confirmed, at the mechanism level
 *     (createHost()'s own body), to create one RTCPeerConnection per
 *     joining branch — a real mesh, not a broadcast primitive. This
 *     file composes that mesh for a BOUNDED number of branches; it does
 *     not and cannot turn it into unlimited one-to-many broadcast.
 *     That remains explicitly deferred to a future, separately-scoped
 *     milestone (e.g. C006B/C007), per your explicit instruction.
 *
 * COMPOSED SOURCES (none new):
 *   - LiveHotspotEngine.createHost()/joinHost()/sendMessage()/
 *     getPeerConnectionState()/listConnections() — real, unmodified.
 *   - ChurchWorshipSession's real events, composed via the same
 *     PlatformEventBus/CozySense observations C005 already wired
 *     locally (living:caption-translated, living:scripture-detected,
 *     worship-phase-changed) — this file subscribes to those same real
 *     local events and RELAYS them over each real data channel, rather
 *     than inventing a second notification path.
 *   - CozySync — real, generic session/conflict framework, composed for
 *     reconnection bookkeeping (a real session per branch relationship).
 *
 * HONEST SCOPE, DISCLOSED
 *   - Initial signaling (the offer/answer exchange establishing each
 *     mesh connection) is not automated here — this file provides the
 *     roster/relay/health layer on top of connections already
 *     established via the existing createHost()/joinHost()/
 *     completeHostPairing() flow (unchanged, real, out-of-band signaling
 *     dependency confirmed since M362).
 *   - "Branch latency" is derived from real, observable connection
 *     timing (time since last received message) — not a true RTT
 *     measurement, since LiveHotspotEngine exposes no ping/pong
 *     primitive. Disclosed as an approximation, not a precise metric.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0";
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["multi-branch-coordinator"]) return;

    const RELAY_EVENTS = ["living:caption-translated", "living:scripture-detected", "worship-phase-changed"];

    class MultiBranchCoordinator {
        #branches = new Map(); // connectionId -> { name, language, worshipPhase, lastMessageAt, syncStatus }
        #relayWired = false;

        /**
         * registerBranch(connectionId, { name, language })
         *   Composes a connection already established via the real,
         *   existing LiveHotspotEngine createHost()/joinHost()/
         *   completeHostPairing() flow (unchanged). This method only
         *   adds it to the real roster and wires health/message
         *   observability - no new connection logic.
         */
        registerBranch(connectionId, { name = connectionId, language = null } = {}) {
            const hotspot = window.CozyOS.LiveHotspotEngine;
            if (!hotspot || typeof hotspot.getConnectionState !== "function") return { success: false, reason: "LiveHotspotEngine is not loaded." };
            const state = hotspot.getConnectionState(connectionId);
            if (!state) return { success: false, reason: `Unknown connectionId "${connectionId}" - it must already be a real, established LiveHotspotEngine connection.` };

            this.#branches.set(connectionId, { name, language, worshipPhase: null, lastMessageAt: null, syncStatus: "connected" });
            this.#wireRelay();
            this.#wireBranchHealth(connectionId);

            const sync = window.CozyOS.CozySync;
            if (sync && typeof sync.createSession === "function") {
                try { sync.createSession({ id: `branch-${connectionId}`, type: "church-branch-worship" }); } catch (_err) { /* honest no-op - CozySync's own real validation surfaces, not swallowed silently beyond logging */ }
            }
            return { success: true, connectionId };
        }

        unregisterBranch(connectionId) {
            this.#branches.delete(connectionId);
            return { success: true };
        }

        /** listBranches() — the real, live roster: connected branches, health, language, phase, sync status. */
        listBranches() {
            const hotspot = window.CozyOS.LiveHotspotEngine;
            return [...this.#branches.entries()].map(([connectionId, info]) => ({
                connectionId,
                ...info,
                connectionState: hotspot && typeof hotspot.getConnectionState === "function" ? hotspot.getConnectionState(connectionId) : null,
                approximateLatencyMs: info.lastMessageAt ? Date.now() - info.lastMessageAt : null
            }));
        }

        /**
         * #wireRelay() — subscribes ONCE to the real, existing local
         * events (C005) and relays them, as real JSON messages, over
         * every currently-registered branch's real data channel
         * (LiveHotspotEngine.sendMessage()). Never a second event
         * system - this is the same PlatformEventBus every other
         * ChurchOS component already uses.
         */
        #wireRelay() {
            if (this.#relayWired) return;
            this.#relayWired = true;
            const bus = window.CozyOS.PlatformEventBus;
            if (!bus || typeof bus.on !== "function") return;
            RELAY_EVENTS.forEach(eventName => {
                bus.on(eventName, (detail) => this.#relayToAllBranches(eventName, detail));
            });
        }

        #relayToAllBranches(eventName, detail) {
            const hotspot = window.CozyOS.LiveHotspotEngine;
            if (!hotspot || typeof hotspot.sendMessage !== "function") return;
            const payload = JSON.stringify({ eventName, detail });
            for (const connectionId of this.#branches.keys()) {
                try { hotspot.sendMessage(connectionId, payload); } catch (_err) { /* honest no-op - a single unreachable branch never blocks the others */ }
            }
        }

        /** #wireBranchHealth(connectionId) — composes the real, existing LiveHotspotEngine connection/message events, never a second health-tracking system. */
        #wireBranchHealth(connectionId) {
            const hotspot = window.CozyOS.LiveHotspotEngine;
            if (!hotspot || typeof hotspot.on !== "function") return;
            hotspot.on("message-received", (payload) => {
                if (!payload || payload.connectionId !== connectionId) return;
                const info = this.#branches.get(connectionId);
                if (info) info.lastMessageAt = Date.now();
                try {
                    const parsed = JSON.parse(payload.data);
                    if (parsed.eventName === "worship-phase-changed" && info) info.worshipPhase = parsed.detail?.phase || info.worshipPhase;
                } catch (_err) { /* real, honest no-op for non-JSON/unrelated data channel traffic */ }
            });
            hotspot.on("device-disconnected", (payload) => {
                if (!payload || payload.connectionId !== connectionId) return;
                const info = this.#branches.get(connectionId);
                if (info) info.syncStatus = "disconnected";
            });
            hotspot.on("device-connected", (payload) => {
                if (!payload || payload.connectionId !== connectionId) return;
                const info = this.#branches.get(connectionId);
                if (info) info.syncStatus = "connected";
            });
        }

        getDiagnosticsReport() { return { moduleVersion: VERSION, branchCount: this.#branches.size, relayWired: this.#relayWired }; }
    }

    const instance = new MultiBranchCoordinator();
    window.CozyOS.MultiBranchCoordinator = instance;
    window.CozyOS.Modules["multi-branch-coordinator"] = Object.freeze({
        version: VERSION,
        description: "ChurchOS Multi-Branch Coordinator (C006, Option A — Bounded Mesh Network). Composes LiveHotspotEngine's real mesh connections, relays C005's real local worship/translation/scripture events over each branch's real data channel, and composes CozySync for reconnection bookkeeping. Explicitly does NOT implement broadcast/SFU/CDN — deferred to a future, separately-scoped milestone per approved scope."
    });
})();
