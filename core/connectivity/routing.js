/**
 * CozyOS UNIVERSAL CONNECTIVITY KERNEL ── SMART ROUTER ENGINE
 * FILE: core/connectivity/routing.js
 * VERSION: 1.0.0-CORE
 */

"use strict";

import { TransportRegistry } from "./transport.js";

export class SmartRouter {
    constructor(kernel) {
        this.kernel = kernel;
        this.transports = new TransportRegistry(this.kernel);
        
        // Routing priority matrix tailored for African networking profiles
        this.routingPriorityOrder = [
            "LOCAL_MEMORY",
            "LOCAL_DB",
            "NEARBY_DEVICE",
            "BLUETOOTH",
            "USB",
            "LAN",
            "WIFI",
            "MOBILE_DATA",
            "SATELLITE",
            "CLOUD"
        ];
    }

    async route(payload) {
        const targetTransportKey = await this.resolveBestAvailableTransport(payload.priority || "NORMAL");
        const interfaceDriver = this.transports.getDriver(targetTransportKey);

        if (!interfaceDriver) {
            throw new Error(`[ROUTING ERROR] Critical transport driver instance absent for key: [${targetTransportKey}]`);
        }

        console.log(`🔀 [SMART ROUTER] Dispatched data transaction [${payload.id}] via interface driver layer: [${targetTransportKey}]`);
        return await interfaceDriver.execute(payload);
    }

    async resolveBestAvailableTransport(priority) {
        const currentPolicy = this.kernel.policy.evaluateDynamicConstraints();
        const networkMetrics = this.kernel.diagnostics.getNetworkTopology();

        // Check local caching layers before processing networking stacks
        if (currentPolicy.allowCacheLookup) {
            return "LOCAL_MEMORY";
        }

        // Loop through the optimized physical routing matrix hierarchy
        if (networkMetrics.lanConnected) return "LAN";
        if (networkMetrics.wifiConnected && !currentPolicy.restrictWifi) return "WIFI";
        if (networkMetrics.cellularConnected && currentPolicy.allowCellularTraffic) return "MOBILE_DATA";
        if (networkMetrics.satelliteConnected) return "SATELLITE";

        return "LOCAL_DB"; // Default baseline storage fallback path
    }

    async triggerImmediateFailback() {
        console.log("🔀 [SMART ROUTER] Uplink recovery verified. Dispatching sync process pipeline updates.");
        await this.kernel.sync.triggerBackgroundSync();
    }
}
