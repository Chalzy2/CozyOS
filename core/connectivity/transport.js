/**
 * CozyOS UNIVERSAL CONNECTIVITY KERNEL ── TRANSPORTS DRIVER REGISTRY
 * FILE: core/connectivity/transport.js
 * VERSION: 1.0.0-CORE
 */

"use strict";

export class TransportRegistry {
    constructor(kernel) {
        this.kernel = kernel;
        this._drivers = new Map();
        this._initializeBuiltInDrivers();
    }

    _initializeBuiltInDrivers() {
        this.registerDriver("LOCAL_DB", {
            execute: async (payload) => {
                const storage = window.CozyOS?.Storage || window.CozyStorage;
                return await storage.save(payload.collection, payload.data, payload.partition || "user");
            }
        });

        this.registerDriver("WIFI", {
            execute: async (payload) => {
                return await this._fireNetworkFetchRequest(payload);
            }
        });

        this.registerDriver("MOBILE_DATA", {
            execute: async (payload) => {
                // Apply strict bandwidth shaper parameters before execution
                const compressedPayload = await this.kernel.sync.compressor.applyBinaryCompression(payload);
                return await this._fireNetworkFetchRequest(compressedPayload);
            }
        });
    }

    registerDriver(key, implementation) {
        if (typeof implementation.execute !== "function") {
            throw new Error(`[DRIVER FAULT] Registry driver contract verification skipped method validations on: ${key}`);
        }
        this._drivers.set(key, implementation);
    }

    getDriver(key) {
        return this._drivers.get(key);
    }

    async _fireNetworkFetchRequest(payload) {
        const response = await fetch(payload.endpoint || "/api/gateway", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Cozy-Tenant": payload.tenantId || "default" },
            body: JSON.stringify(payload.data)
        });
        if (!response.ok) throw new Error(`Gateway HTTP operational rejection status code: ${response.status}`);
        return await response.json();
    }
}
