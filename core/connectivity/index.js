/**
 * CozyOS UNIVERSAL CONNECTIVITY KERNEL ── KERNEL EXPORT INTEGRATION FACADE
 * FILE: core/connectivity/index.js
 * VERSION: 1.0.0-CORE
 * ARCHITECTURAL INVARIANT: Primary interface point for application modules.
 * Restricts absolute direct access to raw transport sockets.
 */

"use strict";

import { CozyConnectivityKernel } from "./connectivity.js";
import { SmartRouter } from "./routing.js";
import { UniversalQueue } from "./queue.js";
import { SmartCache } from "./cache.js";
import { SyncEngine } from "./sync.js";

if (!window.CozyOS) {
    window.CozyOS = {};
}

// Instantiate Kernel Core if absent from globally exported window namespace
if (!window.CozyOS.Connectivity) {
    const kernelInstance = new CozyConnectivityKernel();
    window.CozyOS.Connectivity = kernelInstance;
}

export const Connectivity = window.CozyOS.Connectivity;
export { SmartRouter, UniversalQueue, SmartCache, SyncEngine };
export default Connectivity;
