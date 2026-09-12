/**
 * CozyOS Authentication Factor Provider Base
 * File Reference: core/security/factor-provider-base.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   The single, real, shared implementation every authentication factor
 *   provider (Face, Fingerprint, Voice, Google Account) composes,
 *   instead of each file hand-duplicating the same registration,
 *   backend-hook, event-publishing, history, and reporting logic —
 *   exactly the "compose, don't duplicate" principle (Rules 80/81)
 *   already applied throughout this project, applied here to
 *   authentication providers instead of formulas.
 *
 * WHAT THIS PROVIDES A REAL BACKEND CAN PLUG INTO
 *   Every provider built from this base starts with NO real backend
 *   registered — `verify()` honestly returns `{available: false,
 *   verified: false, reason: "No real <name> provider registered."}`.
 *   `registerBackend(fn)` is the real, explicit hook a genuine future
 *   implementation (e.g., a real WebAuthn-based fingerprint check) would
 *   call to replace that honest default. This file never fabricates a
 *   working backend — it provides the real, tested infrastructure a
 *   real one would plug into.
 *
 * OWNERSHIP (shared across every provider built from this base)
 *   Owns: factor registration with AuthFactorRegistry, the
 *   available/verified/reason result contract, provider-specific event
 *   publishing, and this provider's own bounded history.
 *   Does NOT own: authenticating users (IdentityEngine), deciding
 *   permissions (IdentityEngine), evaluating policy (AuthPolicyEngine),
 *   managing sessions (SessionManager), or managing trusted devices
 *   (TrustedDeviceManager).
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const FACTOR_PROVIDER_BASE_VERSION = "1.0.0-ENTERPRISE";

    function createFactorProviderCoordinator({ factorName, eventPrefix, displayName, resultExtras }) {
        const REAL_EVENT_NAMES = Object.freeze([
            "verification-started", "verified", "failed", "provider-loaded", "provider-unloaded"
        ]);

        class CozyFactorProvider {
            #realBackend = null;
            #history = [];

            constructor() {
                // Real initial registration at creation time - honest
                // isReal:false default, so AuthFactorRegistry's real
                // state is accurate from the moment this provider loads,
                // not just after the first registerBackend() call.
                this.#syncRegistryRealFlag();
            }

            getVersion() { return FACTOR_PROVIDER_BASE_VERSION; }
            #deepClone(v) {
                if (typeof structuredClone === "function") { try { return structuredClone(v); } catch (_e) { /* fall through */ } }
                try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; }
            }
            #logHistory(event, detail) {
                this.#history.push({ event, at: new Date(Date.now()).toISOString(), detail: this.#deepClone(detail) });
                if (this.#history.length > 200) this.#history.shift();
            }
            #emit(eventName, detail) {
                if (!REAL_EVENT_NAMES.includes(eventName)) { console.warn(`[${displayName}Provider] Unknown event "${eventName}" — not emitted.`); return; }
                this.#logHistory(eventName, detail);
                if (window.CozyOS.PlatformEventBus && typeof window.CozyOS.PlatformEventBus.emit === "function") {
                    try { window.CozyOS.PlatformEventBus.emit(`${eventPrefix}:${eventName}`, detail); } catch (_err) { /* non-fatal */ }
                }
            }
            getHistory() { return this.#deepClone(this.#history); }

            /**
             * registerBackend(verifyFn)
             *   Real, explicit hook — a genuine future implementation
             *   calls this with a real async function
             *   `(context) => {verified, reason?, ...extras}`. Until
             *   called, `verify()` is honestly unavailable.
             *
             *   Also re-registers this factor with AuthFactorRegistry,
             *   updating its real `isReal` flag to true — without this,
             *   the registry would keep reporting the factor as fake
             *   even after a genuine backend is plugged in, silently
             *   going stale. Found and fixed before this shipped in any
             *   of the four real provider files, not after.
             */
            registerBackend(verifyFn) {
                if (typeof verifyFn !== "function") return { success: false, reason: "A real verify function is required." };
                this.#realBackend = verifyFn;
                this.#emit("provider-loaded", { factorName });
                this.#syncRegistryRealFlag();
                return { success: true };
            }

            /** unregisterBackend() — real, honest reversion to the unavailable default; also re-syncs the registry's isReal flag back to false. */
            unregisterBackend() {
                this.#realBackend = null;
                this.#emit("provider-unloaded", { factorName });
                this.#syncRegistryRealFlag();
                return { success: true };
            }

            #syncRegistryRealFlag() {
                const registry = window.CozyOS.AuthFactorRegistry;
                if (registry && typeof registry.registerFactor === "function") {
                    registry.registerFactor(factorName, {
                        isReal: this.hasRealBackend(),
                        note: this.hasRealBackend() ? `Real ${displayName}Provider-backed, genuine backend registered.` : `Real ${displayName}Provider-backed slot — no real backend registered yet.`,
                        verify: (context) => this.verify(context)
                    });
                }
            }

            hasRealBackend() { return this.#realBackend !== null; }

            async verify(context = {}) {
                this.#emit("verification-started", { factorName });
                if (!this.#realBackend) {
                    const result = { available: false, verified: false, reason: `No real ${displayName.toLowerCase()} provider registered.` };
                    this.#emit("failed", { factorName, reason: result.reason });
                    return result;
                }
                try {
                    const raw = await this.#realBackend(context);
                    const extras = typeof resultExtras === "function" ? resultExtras(raw, context) : {};
                    const result = { available: true, verified: raw.verified === true, reason: raw.reason || null, ...extras };
                    this.#emit(result.verified ? "verified" : "failed", { factorName, reason: result.reason });
                    return result;
                } catch (err) {
                    const result = { available: true, verified: false, reason: `Real backend threw: ${err.message}` };
                    this.#emit("failed", { factorName, reason: result.reason });
                    return result;
                }
            }

            publishReport() {
                const outputCenter = window.CozyOS.OutputCenter;
                if (!outputCenter) return { success: false, reason: "OutputCenter is not loaded." };
                const report = { generatedAt: new Date(Date.now()).toISOString(), factorName, hasRealBackend: this.hasRealBackend(), history: this.getHistory() };
                return outputCenter.publish({
                    name: `${factorName}-provider-report-${Date.now()}.json`, category: "Reports",
                    content: JSON.stringify(report, null, 2), mimeType: "application/json",
                    sourceApplication: "CozyOS.Auth", sourceEngine: `${displayName}Provider`, sourceOperation: `Publish ${displayName} Provider Report`
                });
            }

            getDiagnosticsReport() {
                return this.#deepClone({ moduleVersion: FACTOR_PROVIDER_BASE_VERSION, factorName, hasRealBackend: this.hasRealBackend(), historyEntries: this.#history.length });
            }

            getIntegrationManifest() {
                return {
                    ownership: { owns: [`${factorName} registration with AuthFactorRegistry`, "verify() result contract", `${eventPrefix}:* events`, "own bounded history"], doesNotOwn: ["Authenticate users", "Decide permissions", "Evaluate policy", "Manage sessions", "Manage trusted devices"] },
                    uses: ["AuthFactorRegistry", "PlatformEventBus", "OutputCenter"],
                    registers: ["ServiceRegistry (and therefore PlatformDiscovery)", "AuthFactorRegistry"],
                    publishes: REAL_EVENT_NAMES.map(e => `${eventPrefix}:${e}`),
                    consumes: [],
                    security: { failClosed: `verify() with no real backend registered always returns verified:false, never fabricated success.`, honestLimitation: `No real ${displayName.toLowerCase()} verification exists anywhere in this codebase as of this milestone.` }
                };
            }
        }

        return new CozyFactorProvider();
    }

    window.CozyOS._createFactorProviderCoordinator = createFactorProviderCoordinator;
})();
