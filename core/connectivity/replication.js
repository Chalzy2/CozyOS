/**
 * CozyOS UNIVERSAL CONNECTIVITY KERNEL ── DATA REPLICATION SERVICE
 * FILE: core/connectivity/replication.js
 * VERSION: 1.1.1-CORE — Fixes whitespace inconsistencies in rejection payloads.
 */

"use strict";

export class DataReplicator {
    constructor(kernel) {
        this.kernel = kernel;

        // Runtime statistics
        this.totalReplicationAttempts = 0;
        this.totalSuccessfulStages = 0;
        this.totalFailedStages = 0;
        this.lastReplicationTime = null;
        this.lastPeerId = null;
        this.lastError = null;
    }

    /**
     * Stages a replication transaction for a peer node.
     * Staging only — does not perform actual networking, transport,
     * or peer communication. Never throws.
     */
    async stageReplicationToPeerNode(peerId, transactionalBlock) {
        this.totalReplicationAttempts++;
        this.lastReplicationTime = Date.now();

        const normalizedPeerId = (typeof peerId === "string") ? peerId.trim() : null;
        this.lastPeerId = normalizedPeerId !== null ? normalizedPeerId : this.lastPeerId;

        try {
            const validation = this._validateReplicationRequest(peerId, transactionalBlock);
            if (!validation.valid) {
                this.totalFailedStages++;
                this.lastError = validation.error;
                console.log(`📡 [REPLICATION MODULE] Rejected replication request for destination terminal node: [${normalizedPeerId}] — ${validation.error}`);

                return Object.freeze({
                    success: false,
                    error: validation.error,
                    peerId: normalizedPeerId,
                    stagedAt: this.lastReplicationTime,
                    transactionId: null,
                    replicated: false
                });
            }

            console.log(`📡 [REPLICATION MODULE] Replicating block record down to destination terminal node: [${normalizedPeerId}]`);
            // Peer networking driver orchestration hooks mapping

            const transactionId = this._generateTransactionId(normalizedPeerId, this.lastReplicationTime);

            this.totalSuccessfulStages++;
            this.lastError = null;

            return Object.freeze({
                success: true,
                peerId: normalizedPeerId,
                stagedAt: this.lastReplicationTime,
                transactionId,
                replicated: false
            });
        } catch (err) {
            this.totalFailedStages++;
            this.lastError = (err && err.message) ? err.message : "unknown_error";

            return Object.freeze({
                success: false,
                error: this.lastError,
                peerId: normalizedPeerId,
                stagedAt: this.lastReplicationTime,
                transactionId: null,
                replicated: false
            });
        }
    }

    /**
     * Returns a frozen snapshot of replication runtime diagnostics.
     */
    getReplicationStatus() {
        return Object.freeze({
            totalReplicationAttempts: this.totalReplicationAttempts,
            totalSuccessfulStages: this.totalSuccessfulStages,
            totalFailedStages: this.totalFailedStages,
            lastReplicationTime: this.lastReplicationTime,
            lastPeerId: this.lastPeerId,
            lastError: this.lastError
        });
    }

    // ── Internal helpers ─────────────────────────────────────────────────

    /**
     * Defensive validation of an incoming replication request.
     * Does not mutate state.
     */
    _validateReplicationRequest(peerId, transactionalBlock) {
        if (typeof peerId !== "string" || peerId.trim().length === 0) {
            return Object.freeze({ valid: false, error: "missing_or_invalid_peer_id" });
        }

        if (!transactionalBlock || typeof transactionalBlock !== "object") {
            return Object.freeze({ valid: false, error: "missing_or_invalid_transactional_block" });
        }

        return Object.freeze({ valid: true, error: null });
    }

    /**
     * Generates a placeholder transaction identifier for a staged replication.
     * Not cryptographically secure — abstraction layer only.
     */
    _generateTransactionId(peerId, stagedAt) {
        const basis = `${peerId}:${stagedAt}:${this.totalReplicationAttempts}`;
        let hash = 0;
        for (let i = 0; i < basis.length; i++) {
            hash = (hash * 31 + basis.charCodeAt(i)) | 0;
        }
        return `repl-${(hash >>> 0).toString(16)}`;
    }
    }
