/**
 * CozyOS UNIVERSAL CONNECTIVITY KERNEL ── DECENTRALIZED MODULE INCREMENTAL DEPLOYMENT INTERFACE
 * FILE: core/connectivity/updateManager.js
 * VERSION: 1.1.0-CORE
 */

"use strict";

export class BinaryPatchUpdateManager {
    constructor(kernel) {
        this.kernel = kernel;

        // Staged patch storage (in-memory only, offline-first)
        this.stagedPatches = new Map();

        // Runtime statistics
        this.totalStaged = 0;
        this.lastStageTime = null;
        this.lastError = null;
    }

    /**
     * Validates and stages an incremental binary patch fragment.
     * Storage-only operation: no installation, no networking, no execution.
     */
    async stageIncrementalBinaryPatch(payloadFragment) {
        console.log("📦 [UPDATE MANAGER] Assembling binary application patch sequence frames.");

        try {
            const validation = this._validatePatch(payloadFragment);
            if (!validation.valid) {
                this.lastError = validation.error;
                return { success: false, error: validation.error, patch: null };
            }

            const { patchId, version, targetModule, rollbackVersion, payload } = payloadFragment;

            if (this._isDuplicatePatch(patchId)) {
                this.lastError = "duplicate_patch";
                return { success: false, error: this.lastError, patch: null };
            }

            const createdAt = Date.now();

            const patch = Object.freeze({
                patchId,
                version,
                targetModule,
                checksum: this._generatePatchChecksum({ patchId, version, targetModule, payload, createdAt }),
                createdAt,
                rollbackVersion: (rollbackVersion !== undefined && rollbackVersion !== null) ? rollbackVersion : null,
                payload
            });

            this.stagedPatches.set(patchId, patch);
            this.totalStaged += 1;
            this.lastStageTime = createdAt;
            this.lastError = null;

            return { success: true, error: null, patch };
        } catch (err) {
            this.lastError = (err && err.message) ? err.message : "unknown_error";
            return { success: false, error: this.lastError, patch: null };
        }
    }

    /**
     * Removes a single staged patch from memory without installing it.
     */
    removeStagedPatch(patchId) {
        try {
            if (!patchId || typeof patchId !== "string") {
                this.lastError = "invalid_patch_id";
                return { success: false, error: this.lastError, removed: false };
            }

            const existed = this.stagedPatches.delete(patchId);
            this.lastError = null;

            return { success: true, error: null, removed: existed };
        } catch (err) {
            this.lastError = (err && err.message) ? err.message : "unknown_error";
            return { success: false, error: this.lastError, removed: false };
        }
    }

    /**
     * Clears all staged patches from memory without installing them.
     */
    clearStagedPatches() {
        try {
            const clearedCount = this.stagedPatches.size;
            this.stagedPatches.clear();
            this.lastError = null;

            return { success: true, error: null, clearedCount };
        } catch (err) {
            this.lastError = (err && err.message) ? err.message : "unknown_error";
            return { success: false, error: this.lastError, clearedCount: 0 };
        }
    }

    /**
     * Returns a frozen snapshot of current staging diagnostics.
     */
    getUpdateStatus() {
        return Object.freeze({
            stagedPatchCount: this.stagedPatches.size,
            totalStaged: this.totalStaged,
            lastStageTime: this.lastStageTime,
            lastError: this.lastError,
            stagedPatchIds: Object.freeze(Array.from(this.stagedPatches.keys()))
        });
    }

    /**
     * Defensive validation of an incoming patch payload fragment.
     * Does not mutate state.
     */
    _validatePatch(payloadFragment) {
        if (!payloadFragment || typeof payloadFragment !== "object") {
            return Object.freeze({ valid: false, error: "invalid_payload_fragment" });
        }

        if (!payloadFragment.patchId || typeof payloadFragment.patchId !== "string") {
            return Object.freeze({ valid: false, error: "missing_patch_id" });
        }

        if (!payloadFragment.version || typeof payloadFragment.version !== "string") {
            return Object.freeze({ valid: false, error: "missing_patch_version" });
        }

        if (!payloadFragment.targetModule || typeof payloadFragment.targetModule !== "string") {
            return Object.freeze({ valid: false, error: "missing_target_module" });
        }

        if (payloadFragment.payload === undefined || payloadFragment.payload === null) {
            return Object.freeze({ valid: false, error: "missing_patch_payload" });
        }

        if (
            payloadFragment.rollbackVersion !== undefined &&
            payloadFragment.rollbackVersion !== null &&
            typeof payloadFragment.rollbackVersion !== "string"
        ) {
            return Object.freeze({ valid: false, error: "invalid_rollback_version" });
        }

        // Optional alignment with standard CozyOS { route, authContext, payload } shape,
        // validated only if present — not required for staging.
        if (payloadFragment.route !== undefined && typeof payloadFragment.route !== "string") {
            return Object.freeze({ valid: false, error: "invalid_route" });
        }

        if (payloadFragment.authContext !== undefined && typeof payloadFragment.authContext !== "object") {
            return Object.freeze({ valid: false, error: "invalid_auth_context" });
        }

        return Object.freeze({ valid: true, error: null });
    }

    /**
     * Checks whether a patchId has already been staged.
     */
    _isDuplicatePatch(patchId) {
        return this.stagedPatches.has(patchId);
    }

    /**
     * Recursively normalizes an object/array so that keys are sorted,
     * ensuring equivalent objects always serialize identically regardless
     * of original key order.
     */
    _normalizeForChecksum(value) {
        if (Array.isArray(value)) {
            return value.map((item) => this._normalizeForChecksum(item));
        }

        if (value !== null && typeof value === "object") {
            const sortedKeys = Object.keys(value).sort();
            const normalized = {};
            for (const key of sortedKeys) {
                normalized[key] = this._normalizeForChecksum(value[key]);
            }
            return normalized;
        }

        return value;
    }

    /**
     * Generates a placeholder checksum for a patch, including its payload.
     * Not cryptographically secure — abstraction layer only,
     * pending integration with the production checksum/crypto module.
     */
    _generatePatchChecksum(patch) {
        const basis = JSON.stringify({
            patchId: patch.patchId,
            version: patch.version,
            targetModule: patch.targetModule,
            payload: this._normalizeForChecksum(patch.payload),
            createdAt: patch.createdAt
        });

        let hash = 0;
        for (let i = 0; i < basis.length; i++) {
            hash = (hash * 31 + basis.charCodeAt(i)) | 0;
        }

        return `cozy-checksum-${(hash >>> 0).toString(16)}`;
    }
    }
