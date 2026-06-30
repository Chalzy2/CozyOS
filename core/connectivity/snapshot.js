/**
 * CozyOS UNIVERSAL CONNECTIVITY KERNEL ── STATE CHECKPOINTING ENGINE
 * FILE: core/connectivity/snapshot.js
 * VERSION: 1.1.0-CORE
 */

"use strict";

// Snapshot payload format version, embedded in every committed snapshot
const SNAPSHOT_VERSION = "1.1.0-CORE";

export class StateSnapshotEngine {
    constructor(kernel) {
        this.kernel = kernel;

        // Runtime statistics
        this.totalCheckpointAttempts = 0;
        this.totalSuccessfulCheckpoints = 0;
        this.totalFailedCheckpoints = 0;
        this.lastCheckpointTime = null;
        this.lastSnapshot = null;
        this.lastError = null;

        // Boot diagnostics
        this.lastBootSuccess = null;
        this.lastBootFailure = null;
    }

    /**
     * Commits a checkpoint of current connectivity state to storage.
     * Public method, signature unchanged. Existing storage-resolution and
     * save flow preserved exactly; this version adds defensive guards
     * around storage/queue/metrics availability, runtime statistics, an
     * immutable versioned snapshot payload, and symmetric support for
     * storage.saveModuleData() (mirroring RecoveryEngine's read-side
     * loadModuleData()) when the storage implementation provides it.
     * Never throws.
     */
    async forceAtomicCheckpointCommit() {
        this.totalCheckpointAttempts++;
        this.lastCheckpointTime = Date.now();

        try {
            const storage = (typeof window !== "undefined" && window.CozyOS?.Storage) || (typeof window !== "undefined" && window.CozyStorage);
            if (!storage || (typeof storage.save !== "function" && typeof storage.saveModuleData !== "function")) {
                this.totalFailedCheckpoints++;
                this.lastError = "storage_unavailable";
                return Object.freeze({ success: false, error: this.lastError, snapshot: null });
            }

            const tasks = (this.kernel?.queue && this.kernel.queue.tasksMemoryMap !== undefined)
                ? this.kernel.queue.tasksMemoryMap
                : null;

            const statistics = (this.kernel?.metrics && typeof this.kernel.metrics.exportTelemetryBlock === "function")
                ? this.kernel.metrics.exportTelemetryBlock()
                : null;

            const structuralSnapshot = Object.freeze({
                LocalID: "cuck_state_vector",
                timestamp: this.lastCheckpointTime,
                version: SNAPSHOT_VERSION,
                tasks,
                statistics
            });

            if (typeof storage.saveModuleData === "function") {
                await storage.saveModuleData("system_connectivity_state", structuralSnapshot, "system");
            } else {
                await storage.save("system_connectivity_state", structuralSnapshot, "system");
            }

            this.totalSuccessfulCheckpoints++;
            this.lastSnapshot = structuralSnapshot;
            this.lastError = null;

            return Object.freeze({ success: true, error: null, snapshot: structuralSnapshot });
        } catch (e) {
            this.totalFailedCheckpoints++;
            this.lastError = (e && e.message) ? e.message : "unknown_error";
            console.error("[SNAPSHOT SERIALIZATION FAILURE]", this.lastError);
            return Object.freeze({ success: false, error: this.lastError, snapshot: null });
        }
    }

    /**
     * Records successful boot diagnostics metadata. Storage only —
     * does not affect kernel behavior.
     */
    recordBootSuccess(metadata) {
        this.lastBootSuccess = Object.freeze({
            metadata: (metadata !== undefined) ? metadata : null,
            recordedAt: Date.now()
        });
    }

    /**
     * Records failed boot diagnostics metadata. Storage only —
     * does not affect kernel behavior.
     */
    recordBootFailure(metadata) {
        this.lastBootFailure = Object.freeze({
            metadata: (metadata !== undefined) ? metadata : null,
            recordedAt: Date.now()
        });
    }

    /**
     * Returns a frozen snapshot of checkpoint runtime diagnostics.
     */
    getCheckpointStatus() {
        return Object.freeze({
            totalCheckpointAttempts: this.totalCheckpointAttempts,
            totalSuccessfulCheckpoints: this.totalSuccessfulCheckpoints,
            totalFailedCheckpoints: this.totalFailedCheckpoints,
            lastCheckpointTime: this.lastCheckpointTime,
            lastSnapshot: this.lastSnapshot,
            lastError: this.lastError,
            lastBootSuccess: this.lastBootSuccess,
            lastBootFailure: this.lastBootFailure
        });
    }
}
