/**
 * CozyOS Delivery Backend Registry
 * File Reference: core/security/delivery-backend-registry.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Milestone: Prompt 6 Step C (Recovery Delivery Architecture)
 * Version: 1.0.0-ENTERPRISE
 *
 * WHY THIS FILE EXISTS (repo search performed first, per Prompt 6 §3)
 *   Searched the entire tree again this session for: SMTP, email, mail,
 *   transactional email, notification, SMS, Twilio, Firebase (Auth),
 *   phone verification, OTP delivery, messaging, provider adapters,
 *   server endpoints, API clients, deployment adapters, environment
 *   configuration, existing external-service abstractions. Result is
 *   unchanged from the MID-2 checkpoint: no real email transport
 *   (no nodemailer/SES/SendGrid/Mailgun/SMTP) and no real SMS transport
 *   (no Twilio or equivalent) exist anywhere in this repository.
 *
 *   Both password-reset-service.js (email channel) and the new
 *   phone-provider.js (sms channel) independently hit the exact same
 *   real gap: "I have a secret that must reach the user out-of-band,
 *   and no transport exists yet." Building that channel-dispatch
 *   boundary twice would be a duplicate engine (forbidden by §20).
 *   This file is the one real, shared DELIVERY PROVIDER INTERFACE both
 *   compose instead.
 *
 * HONEST SCOPE
 *   DELIVERY PROVIDER INTERFACE: real — registerBackend()/
 *     unregisterBackend()/dispatch()/getState() all genuinely work and
 *     are exercised by delivery-backend-registry.test.js against real
 *     async dispatch, not a mock.
 *   PROVIDER IMPLEMENTATION: none shipped by this file. This registry
 *     never fabricates a transport — it is the empty, real socket a
 *     genuine future email/SMS backend plugs into via registerBackend().
 *   CONFIGURED: false for every channel until a real backend registers.
 *   LOCALLY VERIFIED: the registry mechanics themselves (register,
 *     dispatch, unregister, honest no-op when nothing is registered).
 *   INTERNET VERIFIED / PRODUCTION VERIFIED: NOT VERIFIED — there is no
 *     real transport for either channel in this build. Never claim
 *     otherwise from this file.
 *
 * STATE VOCABULARY (per channel, honestly reported by getState())
 *   "NONE"                — no backend ever registered for this channel.
 *   "DEV_ONLY"             — a backend is registered but the backend
 *                            itself self-identifies as devOnly:true
 *                            (e.g. a console-log stand-in). Never a real
 *                            delivery path to an end user.
 *   "CONFIGURED_UNVERIFIED"— a non-dev backend is registered but has not
 *                            reported a successful dispatch yet.
 *   "LOCALLY_VERIFIED"     — at least one dispatch through this backend
 *                            has resolved { delivered: true } inside
 *                            this process (still not proof a real
 *                            message left this device).
 *   "PRODUCTION_VERIFIED"  — never set automatically by this file. A
 *                            real backend may explicitly pass
 *                            productionVerified:true on a successful
 *                            dispatch result once it has genuine,
 *                            externally-confirmed delivery evidence
 *                            (e.g. a provider webhook). This registry
 *                            never infers that on its own.
 *
 * OWNERSHIP
 *   Owns: per-channel backend registration, dispatch routing, delivery
 *   state tracking, and its own bounded audit history.
 *   Does NOT own: token/code generation or hashing (password-reset-
 *   service.js, phone-provider.js), account/session state
 *   (IdentityEngine), or the actual sending of a message (a real
 *   backend, once one exists).
 */
(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        factory(root);
    }
})(typeof window !== "undefined" ? window : globalThis, function (root) {
    "use strict";

    const DELIVERY_BACKEND_REGISTRY_VERSION = "1.0.0-ENTERPRISE";
    const REAL_CHANNELS = Object.freeze(["email", "sms"]);
    const MAX_HISTORY = 200;

    function deepClone(v) {
        if (typeof structuredClone === "function") { try { return structuredClone(v); } catch (_e) { /* fall through */ } }
        try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; }
    }

    class CozyDeliveryBackendRegistry {
        // channel -> Map(name -> { handler, devOnly, registeredAt })
        #backends = new Map(REAL_CHANNELS.map(c => [c, new Map()]));
        // channel -> { locallyVerified: bool, productionVerified: bool, lastDispatchAt: string|null }
        #channelState = new Map(REAL_CHANNELS.map(c => [c, { locallyVerified: false, productionVerified: false, lastDispatchAt: null }]));
        #history = [];

        getVersion() { return DELIVERY_BACKEND_REGISTRY_VERSION; }

        #assertChannel(channel) {
            if (!REAL_CHANNELS.includes(channel)) {
                throw new Error(`[DeliveryBackendRegistry] Unknown channel "${channel}". Real channels are: ${REAL_CHANNELS.join(", ")}.`);
            }
        }

        #logHistory(entry) {
            this.#history.push({ at: new Date(Date.now()).toISOString(), ...deepClone(entry) });
            if (this.#history.length > MAX_HISTORY) this.#history.shift();
        }

        getHistory() { return deepClone(this.#history); }

        /**
         * registerBackend(channel, name, handlerFn, { devOnly = false } = {})
         *   Real, explicit hook. handlerFn receives (payload) and must
         *   return/resolve { delivered: boolean, reason?, productionVerified?: boolean }.
         *   devOnly backends (e.g. a console-warn stand-in used only for
         *   local testing in an environment with no real transport) are
         *   honestly excluded from ever moving a channel's state past
         *   "DEV_ONLY" — they must never be mistaken for real delivery.
         */
        registerBackend(channel, name, handlerFn, { devOnly = false } = {}) {
            this.#assertChannel(channel);
            if (!name || typeof name !== "string") return { success: false, reason: "A backend name is required." };
            if (typeof handlerFn !== "function") return { success: false, reason: "A real handler function is required." };
            this.#backends.get(channel).set(name, { handler: handlerFn, devOnly: !!devOnly, registeredAt: new Date().toISOString() });
            this.#logHistory({ event: "backend-registered", channel, name, devOnly: !!devOnly });
            return { success: true };
        }

        unregisterBackend(channel, name) {
            this.#assertChannel(channel);
            const existed = this.#backends.get(channel).delete(name);
            if (existed) this.#logHistory({ event: "backend-unregistered", channel, name });
            return { success: existed };
        }

        listBackends(channel) {
            this.#assertChannel(channel);
            return Array.from(this.#backends.get(channel).entries()).map(([name, b]) => ({ name, devOnly: b.devOnly, registeredAt: b.registeredAt }));
        }

        /**
         * dispatch(channel, payload)
         *   Real. Tries every registered backend for the channel in
         *   registration order until one honestly reports
         *   { delivered: true }, or all have been tried. With zero
         *   backends registered this is a real, honest no-op — it never
         *   pretends delivery happened.
         */
        async dispatch(channel, payload) {
            this.#assertChannel(channel);
            const backends = this.#backends.get(channel);
            if (backends.size === 0) {
                this.#logHistory({ event: "dispatch-no-backend", channel });
                return { delivered: false, reason: `No delivery backend registered for channel "${channel}".` };
            }
            const attempts = [];
            for (const [name, backend] of backends.entries()) {
                try {
                    const raw = await backend.handler(deepClone(payload));
                    const delivered = raw && raw.delivered === true;
                    attempts.push({ name, devOnly: backend.devOnly, delivered, reason: raw && raw.reason });
                    if (delivered) {
                        const state = this.#channelState.get(channel);
                        state.lastDispatchAt = new Date().toISOString();
                        if (!backend.devOnly) {
                            state.locallyVerified = true;
                            if (raw.productionVerified === true) state.productionVerified = true;
                        }
                        this.#logHistory({ event: "dispatch-delivered", channel, name, devOnly: backend.devOnly });
                        return { delivered: true, backend: name, devOnly: backend.devOnly };
                    }
                } catch (err) {
                    attempts.push({ name, devOnly: backend.devOnly, delivered: false, reason: `Backend threw: ${err.message}` });
                }
            }
            this.#logHistory({ event: "dispatch-all-failed", channel, attempts });
            return { delivered: false, reason: "No registered backend for this channel reported successful delivery.", attempts };
        }

        /**
         * getState(channel) — honest per-channel status per the state
         * vocabulary documented at the top of this file. Never reports
         * PRODUCTION_VERIFIED unless a real backend explicitly proved it
         * on a successful dispatch.
         */
        getState(channel) {
            this.#assertChannel(channel);
            const backends = this.#backends.get(channel);
            const state = this.#channelState.get(channel);
            if (backends.size === 0) return { channel, state: "NONE", configured: false };
            const hasNonDev = Array.from(backends.values()).some(b => !b.devOnly);
            if (state.productionVerified) return { channel, state: "PRODUCTION_VERIFIED", configured: true };
            if (state.locallyVerified) return { channel, state: "LOCALLY_VERIFIED", configured: true };
            if (hasNonDev) return { channel, state: "CONFIGURED_UNVERIFIED", configured: true };
            return { channel, state: "DEV_ONLY", configured: false };
        }

        getDiagnosticsReport() {
            return {
                moduleVersion: DELIVERY_BACKEND_REGISTRY_VERSION,
                channels: REAL_CHANNELS.map(c => ({ ...this.getState(c), backends: this.listBackends(c).length }))
            };
        }
    }

    if (typeof window !== "undefined") {
        window.CozyOS = window.CozyOS || {};
        if (window.CozyOS.DeliveryBackendRegistry && typeof window.CozyOS.DeliveryBackendRegistry.getVersion === "function") {
            if (window.CozyOS.DeliveryBackendRegistry.getVersion() !== DELIVERY_BACKEND_REGISTRY_VERSION) {
                throw new Error("[CozyOS Framework Execution Error] VERSION_CONFLICT: DeliveryBackendRegistry.");
            }
        } else {
            window.CozyOS.DeliveryBackendRegistry = new CozyDeliveryBackendRegistry();
            if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
                try {
                    window.CozyOS.ServiceRegistry.registerCoordinator({ sourcePath: "core/security/delivery-backend-registry.js",
                        name: "DeliveryBackendRegistry", category: "Platform", icon: "send.svg",
                        description: "Real, shared channel-dispatch boundary (email + sms) composed by password-reset-service.js and phone-provider.js. No real transport shipped — registerBackend() is the genuine hook a real email/SMS provider would use. Every channel honestly reports NONE/DEV_ONLY/CONFIGURED_UNVERIFIED/LOCALLY_VERIFIED/PRODUCTION_VERIFIED, never fabricated."
                    });
                } catch (_err) { /* non-fatal */ }
            }
        }
    }

    return { CozyDeliveryBackendRegistry, DELIVERY_BACKEND_REGISTRY_VERSION, REAL_CHANNELS };
});
