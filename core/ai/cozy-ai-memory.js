
    // ─────────────────────────────────────────────────────────────────────────
    // § 9. MEMORY STATISTICS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Returns a structured statistics report across all collections for a tenant.
     * Supports the AI memory dashboard.
     *
     * @param {string} tenantId
     * @returns {Promise<object>} Statistics payload
     */
    async getStatistics(tenantId) {
        const now = Date.now();
        const stats = {
            tenantId,
            generatedAt:        new Date().toISOString(),
            totalMemories:      0,
            activeMemories:     0,
            archivedMemories:   0,
            expiredMemories:    0,
            pendingSync:        0,
            conflictedMemories: 0,
            byCategory:         {},
            byCollection:       {},
            aiLearningMemories: 0,
            customerMemories:   0,
            storageEstimateBytes: 0,
        };

        // Initialise category counters
        for (const cat of Object.values(this.Categories)) {
            stats.byCategory[cat] = 0;
        }

        for (const col of this._allCollections) {
            let records = [];
            try {
                records = await this._getCollectionWorkspaceDataset(col, tenantId);
            } catch (_) { records = []; }

            stats.byCollection[col] = { total: 0, active: 0, archived: 0, expired: 0 };

            for (const item of records) {
                stats.totalMemories++;
                stats.byCollection[col].total++;

                const isExpired = item.ExpiresAt && item.ExpiresAt <= now && item.Status !== "purged";

                if (item.Status === "active" && !isExpired) {
                    stats.activeMemories++;
                    stats.byCollection[col].active++;
                } else if (item.Status === "archived") {
                    stats.archivedMemories++;
                    stats.byCollection[col].archived++;
                } else if (isExpired || item.Status === "purged") {
                    stats.expiredMemories++;
                    stats.byCollection[col].expired++;
                }

                if (item.SyncStatus === "pending") stats.pendingSync++;
                if (item.ConflictState === "conflict") stats.conflictedMemories++;

                // Category tallying
                const cat = item.Category || this.Categories.BUSINESS;
                if (stats.byCategory[cat] !== undefined) stats.byCategory[cat]++;

                if (col === "learning_memory")  stats.aiLearningMemories++;
                if (col === "customer_memory")  stats.customerMemories++;

                // Rough storage estimate — JSON byte length
                try {
                    stats.storageEstimateBytes += JSON.stringify(item).length;
                } catch (_) {}
            }
        }

        return stats;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // § 10. SCHEDULED MAINTENANCE
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Start background maintenance scheduler.
     * Runs cleanupExpired, optimizeCache, and flushPendingSync on the given interval.
     *
     * @param {number} intervalMs
     */
    _startMaintenanceScheduler(intervalMs) {
        if (this._maintenanceTimer) return; // already running
        this._maintenanceTimer = setInterval(async () => {
            const tenantId = window.CozyOS?.ActiveTenantId || "tenant_01";
            try {
                await this.cleanupExpired(tenantId);
                await this.optimizeCache();
                await this.flushPendingSync(tenantId);
            } catch (err) {
                console.warn("[AI Memory] Scheduled maintenance error:", err.message);
            }
        }, intervalMs);
    }

    /**
     * Purge expired memory records for a given tenant.
     * Safe to call manually or from the scheduler.
     *
     * @param {string} tenantId
     */
    async cleanupExpired(tenantId) {
        await this._housekeepExpiredMemories(tenantId);
        this._emit("memory.expired", { tenantId, timestamp: new Date().toISOString() });
    }

    /**
     * Evict stale cache entries that have exceeded the TTL.
     * Does not touch persistent storage.
     */
    async optimizeCache() {
        const now = Date.now();
        for (const [key, entry] of this._cache.entries()) {
            if (now - entry.timestamp > this._cacheTTL) {
                this._cache.delete(key);
            }
        }
    }

    /**
     * Mark pending-sync memory records as synced.
     * Dispatches to CozyOS sync subsystem if available.
     *
     * @param {string} tenantId
     */
    async flushPendingSync(tenantId) {
        const storage = this._getStorage();
        for (const col of this._allCollections) {
            let records = [];
            try {
                records = await this._getCollectionWorkspaceDataset(col, tenantId);
            } catch (_) { continue; }

            for (const item of records) {
                if (item.SyncStatus !== "pending" || item.Status === "purged") continue;
                try {
                    const syncService = window.CozyOS?.Sync;
                    if (syncService && typeof syncService.push === "function") {
                        await syncService.push(col, item, tenantId);
                    }
                    item.SyncStatus  = "synced";
                    item.LastSyncTime = new Date().toISOString();
                    await storage.save(col, item, tenantId);
                    this._updateCache(col, item);
                } catch (err) {
                    console.warn(`[AI Memory] Sync flush failed for ${item.LocalID}:`, err.message);
                }
            }
        }
    }

    /**
     * Graceful teardown — cancels the maintenance timer.
     * Call from kernel shutdown / hot reload.
     */
    destroy() {
        if (this._maintenanceTimer) {
            clearInterval(this._maintenanceTimer);
            this._maintenanceTimer = null;
        }
        this._cache.clear();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // § 11. EVENT NOTIFICATION SYSTEM
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Emit a named memory lifecycle event to the CozyOS event bus.
     * Other modules subscribe via CozyOS.Events.subscribe(eventName, handler).
     *
     * Supported events:
     *   memory.created · memory.updated · memory.deleted ·
     *   memory.expired · memory.restored
     *
     * @param {string} eventName
     * @param {object} payload
     */
    _emit(eventName, payload) {
        try {
            const bus = window.CozyOS?.Events;
            if (bus && typeof bus.publish === "function") {
                bus.publish(eventName, {
                    source:    this.moduleId,
                    version:   this.version,
                    timestamp: new Date().toISOString(),
                    ...payload,
                });
            }
        } catch (err) {
            // Event emission is non-critical — log and continue
            console.warn(`[AI Memory] Event emit failed for "${eventName}":`, err.message);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // § 12. ENCRYPTION BOUNDARY GATEWAY
    // ─────────────────────────────────────────────────────────────────────────

    _processEncryptionBoundaries(collection, contentObject, direction = "encrypt") {
        const sensitiveCollections = [
            "supplier_memory", "employee_memory", "customer_memory", "business_memory"
        ];
        if (!sensitiveCollections.includes(collection)) return contentObject;

        const cryptoProvider = window.CozyOS?.Security || window.CozyCrypto;
        if (!cryptoProvider || typeof cryptoProvider.cipher !== "function") {
            return contentObject; // Safe fallback — air-gapped single-node context
        }

        const targets = ["payroll", "phone", "loan", "bankAccount", "nationalId", "salary"];
        const output  = Object.assign({}, contentObject);

        for (const key of Object.keys(output)) {
            if (targets.includes(key)) {
                try {
                    output[key] = direction === "encrypt"
                        ? cryptoProvider.cipher(String(output[key]))
                        : cryptoProvider.decipher(String(output[key]));
                } catch (err) {
                    console.warn(`[AI Memory] Encryption boundary error on key "${key}":`, err.message);
                }
            }
        }
        return output;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // § 13. TTL HOUSEKEEPING
    // ─────────────────────────────────────────────────────────────────────────

    async _housekeepExpiredMemories(tenantId) {
        const collections = ["temporary_memory", "conversation_memory", "business_memory"];
        const now         = Date.now();
        const storage     = this._getStorage();

        for (const col of collections) {
            const dataset = await this._getCollectionWorkspaceDataset(col, tenantId);
            for (const item of dataset) {
                // Evict ONLY if expired AND below critical importance
                if (item.ExpiresAt && item.ExpiresAt <= now && item.Importance < this.Importance.CRITICAL) {
                    item.Status    = "purged";
                    item.UpdatedAt = new Date().toISOString();
                    await storage.save(col, item, tenantId);
                    this._evictCache(col, item.LocalID);
                    this._emit("memory.expired", { localId: item.LocalID, collection: col });
                }
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // § 14. COSINE SIMILARITY
    // ─────────────────────────────────────────────────────────────────────────

    _calculateCosineSimilarity(vecA, vecB) {
        if (!Array.isArray(vecA) || !Array.isArray(vecB) || vecA.length !== vecB.length || vecA.length === 0) return 0;
        let dotProduct = 0, normA = 0, normB = 0;
        for (let i = 0; i < vecA.length; i++) {
            dotProduct += vecA[i] * vecB[i];
            normA      += vecA[i] * vecA[i];
            normB      += vecB[i] * vecB[i];
        }
        return normA === 0 || normB === 0 ? 0 : dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // § 15. INFRASTRUCTURE UTILITIES
    // ─────────────────────────────────────────────────────────────────────────

    _getStorage() {
        return window.CozyOS?.Storage || window.CozyStorage || { save: async () => {}, find: async () => [] };
    }

    _verifyPermission(auth, permit) {
        if (
            window.CozyOS?.Auth?.checkCapability &&
            !window.CozyOS.Auth.checkCapability(auth, permit)
        ) {
            throw new Error("🔒 [AI Memory] Security Exception: insufficient permission.");
        }
    }

    async _auditLog(auth, type, msg) {
        try {
            if (window.CozyOS?.AuditTrail?.log) {
                await window.CozyOS.AuditTrail.log(auth, type, `[AI MEMORY] ${sanitiseStr(msg, 512)}`);
            }
        } catch (_) {}
    }

    _generateKeywords(obj) {
        return String(typeof obj === "object" ? Object.values(obj).join(" ") : obj)
            .toLowerCase()
            .replace(/[^\w\s\-]/g, "")
            .split(/\s+/)
            .filter(t => t.length > 2);
    }

    async _detectDuplicate(rec) {
        const ds = await this._getCollectionWorkspaceDataset(rec.Collection, rec.WorkspaceID);
        const newContent = JSON.stringify(rec.Content);
        return ds.find(i => i.Status === "active" && JSON.stringify(i.Content) === newContent) || null;
    }

    async _findRecordByLocalID(localId) {
        const tenantId = window.CozyOS?.ActiveTenantId || "tenant_01";
        for (const col of this._allCollections) {
            const cacheKey = `${tenantId}:${col}`;
            if (this._cache.has(cacheKey)) {
                const m = this._cache.get(cacheKey).data.find(i => i.LocalID === localId);
                if (m) return m;
            }
        }
        // Cache miss — query storage directly
        const storage = this._getStorage();
        if (typeof storage.find !== "function") return null;
        for (const col of this._allCollections) {
            try {
                const results = await storage.find(col, { LocalID: localId, WorkspaceID: tenantId });
                if (Array.isArray(results) && results.length > 0) return results[0];
            } catch (_) {}
        }
        return null;
    }

    async _getCollectionWorkspaceDataset(collection, tenantId) {
        const cacheKey = `${tenantId}:${collection}`;
        if (
            this._cache.has(cacheKey) &&
            Date.now() - this._cache.get(cacheKey).timestamp < this._cacheTTL
        ) {
            return this._cache.get(cacheKey).data;
        }
        const records = await this._getStorage().find(collection, { WorkspaceID: tenantId }).catch(() => []) || [];
        this._cache.set(cacheKey, { data: records, timestamp: Date.now() });
        return records;
    }

    _updateCache(col, rec) {
        const k = `${rec.WorkspaceID}:${col}`;
        if (this._cache.has(k)) {
            const arr = this._cache.get(k).data;
            const idx = arr.findIndex(i => i.LocalID === rec.LocalID);
            if (idx > -1) arr[idx] = rec;
            else arr.push(rec);
        }
    }

    _evictCache(col, id) {
        const k = `${window.CozyOS?.ActiveTenantId || "tenant_01"}:${col}`;
        if (this._cache.has(k)) {
            const arr = this._cache.get(k).data;
            const idx = arr.findIndex(i => i.LocalID === id);
            if (idx > -1) arr.splice(idx, 1);
        }
    }
}

// ── GLOBAL INITIALIZATION ─────────────────────────────────────────────────────
if (!window.CozyOS) window.CozyOS = {};
if (window.CozyOS.AI) {
    window.CozyOS.AIMemory = new CozyAIBusinessMemory(window.CozyOS.AI);
          }
