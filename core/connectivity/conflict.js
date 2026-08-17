/**
 * ── CozyOS UNIVERSAL CONNECTIVITY KERNEL ── RESOLUTION & DATA INTEGRITY MANAGEMENT
 * FILE: core/connectivity/conflict.js
 * VERSION: 1.2.0-FINAL-FREEZE
 * * Enforces transactional safety over concurrent offline mutations. Dynamically 
 * reconciles state variances across any business unit asset metric (tonnes, pieces, 
 * litres, hours) by operating on a generalized, configurable quantity field mapping.
 */

"use strict";

export class ConflictResolver {
    constructor(kernel) {
        this.kernel = kernel;

        // Runtime Statistics & Telemetry Engine (Frozen Introspection Standard)
        this._stats = {
            totalConflictsResolved: 0,
            lastConflictTime: null,
            lastStrategy: "NONE",
            lastTaskId: "NONE",
            lastError: "NONE",
            lastResolutionStatus: "IDLE"
        };
    }

    /**
     * Entrypoint for out-of-band server data synchronization divergence.
     * Evaluates anomalies defensively to ensure malformed tasks never panic the microkernel.
     */
    async handleMergeAnomaly(localTask, serverState) {
        const currentTime = new Date().toISOString();
        
        // Defensive Validation Verification Pipeline Guard
        if (!localTask || !localTask.taskId) {
            this._recordFailure("MISSING_OR_MALFORMED_TASK", "INVALID_TASK_OBJECT", currentTime);
            return "UNKNOWN_STRATEGY";
        }

        this._stats.lastTaskId = localTask.taskId;
        this._stats.lastConflictTime = currentTime;

        if (!localTask.payload || !localTask.payload.data) {
            this._recordFailure("MALFORMED_PAYLOAD_STRUCTURE", "CRITICAL_PAYLOAD_DATA_MISSING", currentTime);
            localTask.status = "REJECTED";
            return "UNKNOWN_STRATEGY";
        }

        console.warn(`⚠️ [CONFLICT ANOMALY DETECTED] Reconciling state variance on Task ID: ${localTask.taskId}`);
        
        try {
            const runtimeStrategy = this._evaluateResolutionContext(localTask);
            this._stats.lastStrategy = runtimeStrategy;

            if (runtimeStrategy === "LAST_WRITE_WINS") {
                await this._applyLastWriteWinsStrategy(localTask);
                this._recordSuccess("LAST_WRITE_WINS", "RESOLVED_SUCCESSFULLY", currentTime);
                return "LAST_WRITE_WINS";
            } 
            
            if (runtimeStrategy === "FIELD_MERGE") {
                await this._applyTransactionalFieldMerge(localTask, serverState);
                this._recordSuccess("FIELD_MERGE", "RESOLVED_SUCCESSFULLY", currentTime);
                return "FIELD_MERGE";
            }

            // Unknown strategy fallback sequence (Defensive Assertion Trap)
            this._recordFailure("UNKNOWN_STRATEGY", `Divergent strategy string detected: ${runtimeStrategy}`, currentTime);
            localTask.status = "FAILED";
            return "UNKNOWN_STRATEGY";

        } catch (error) {
            const exceptionMsg = error instanceof Error ? error.message : String(error);
            this._recordFailure(this._stats.lastStrategy, exceptionMsg, currentTime);
            localTask.status = "FAILED";
            throw error;
        }
    }

    /**
     * Defensive Context Analysis Loop
     * Determines whether state overrides or structural numeric delta transformations are required.
     */
    _evaluateResolutionContext(task) {
        const collection = task?.payload?.collection;
        if (!collection) {
            return "LAST_WRITE_WINS"; // Graceful fallback behavior
        }

        // Financial matrices and physical asset reserves drop into advanced field merge vectors
        if (
            collection === "financial_ledger" || 
            collection === "mpesa_transactions" ||
            collection.startsWith("quarry_") // Automatically captures all quarry business metrics
        ) {
            return "FIELD_MERGE";
        }

        return "LAST_WRITE_WINS";
    }

    /**
     * Clones client payload, forces current time tracking stamps, and resets 
     * operational queue task priorities back into ready states.
     */
    async _applyLastWriteWinsStrategy(task) {
        task.payload.data.timestamp = Date.now();
        task.retryCount = 0; 
        task.status = "QUEUED";
        this._triggerSchedulerGuard();
    }

    /**
     * Advanced Cross-Module Delta Preservation Framework
     * Generalized to resolve simultaneous depletions across multiple configurable physical field types.
     * (e.g. Loader A updates stockTonnes by -30, Loader B updates stonePieces by -500, Fuel Dispenser C updates fuelLitres by -120)
     */
    async _applyTransactionalFieldMerge(task, serverState) {
        const clientData = task.payload.data;
        const targetServer = serverState || {};

        // 1. Identify the Configurable Quantity Field Target (Falls back gracefully if not specified)
        const targetField = clientData.targetField || "currentTonnes";

        // 2. Look for generalized metric variations (numericDelta or legacy tonnesDelta)
        const rawDelta = typeof clientData.numericDelta === "number" ? clientData.numericDelta : clientData.tonnesDelta;

        // 3. Operational Check: If tracking a raw numeric field subtraction/addition
        if (typeof rawDelta === "number") {
            // Reapply original volumetric offset directly against current server state value mapping
            const currentServerValue = typeof targetServer[targetField] === "number" ? targetServer[targetField] : 0;
            targetServer[targetField] = +(currentServerValue + rawDelta).toFixed(2);
            
            task.payload.data = { ...clientData, ...targetServer };
        } else {
            // Standard historical fallback: Deep Object Field Mutation Layer Merge
            const clientState = clientData.currentState || {};
            task.payload.data.currentState = { ...targetServer, ...clientState };
        }

        task.retryCount = 0;
        task.status = "QUEUED";
        this._triggerSchedulerGuard();
    }

    /**
     * Defensive Scheduler Guard
     */
    _triggerSchedulerGuard() {
        if (
            this.kernel?.scheduler &&
            typeof this.kernel.scheduler.flagDirtyState === "function"
        ) {
            this.kernel.scheduler.flagDirtyState();
        }
    }

    _recordSuccess(strategy, statusText, timeStamp) {
        this._stats.totalConflictsResolved += 1;
        this._stats.lastResolutionStatus = statusText;
        this._stats.lastConflictTime = timeStamp;
        this._stats.lastError = "NONE";
    }

    _recordFailure(strategy, errorText, timeStamp) {
        this._stats.lastStrategy = strategy;
        this._stats.lastResolutionStatus = "FAILED";
        this._stats.lastError = errorText;
        this._stats.lastConflictTime = timeStamp;
    }

    /**
     * Status API: Immutable Telemetry Diagnostic Introspection Surface
     */
    getConflictStatus() {
        return Object.freeze({
            ...this._stats
        });
    }
            }
