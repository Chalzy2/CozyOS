/**
 * CozyOS Enterprise Framework - Local Offline Engine & Synchronizer
 * File Reference: /core/connectivity/offline.js
 * Architectural Standard for Local Workspace Persistence and Link Interception
 * v2.4.1 — Production Alignment Stabilization Pass (Route-Based Contracts)
 */

(function () {
    'use strict';

    class OfflineCoordinator {
        constructor(kernelReference, moduleConfig = {}) {
            this.kernel = {
                router: kernelReference?.router || window.CozyOS?.Router || null,
                cache: kernelReference?.cache || window.CozyOS?.Cache || null,
                queue: kernelReference?.queue || window.CozyOS?.Queue || null,
                diagnostics: kernelReference?.diagnostics || window.CozyOS?.Diagnostics || null
            };

            this.config = {
                airGapMode: !!moduleConfig.airGapMode,
                heartbeatInterval: moduleConfig.heartbeatInterval || 30000,
                defaultCacheTtl: moduleConfig.defaultCacheTtl || 300000
            };

            this._isOnline = true;
            this._listenersAttached = false;
        }

        /**
         * Core Application Lifecycle Bootstrapper
         */
        init() {
            this._evaluateInitialHardwareState();
            this._bindHardwareNetworkListeners();
        }

        /**
         * Evaluates WAN Connectivity using defensive diagnostic layer checks
         */
        hasWanLink() {
            if (this.config.airGapMode) return false;
            
            // Defensive validation of framework diagnostics availability
            if (this.kernel.diagnostics && typeof this.kernel.diagnostics.isNetworkAvailable === 'function') {
                return !!this.kernel.diagnostics.isNetworkAvailable();
            }
            
            // Sensible baseline fallback cascade
            return typeof navigator !== 'undefined' ? navigator.onLine : true;
        }

        /**
         * Central Traffic Interceptor Protocol (Aligned with the v2.4.1 Route Engine Contract)
         */
        async interceptAndQueue(transactionEnvelope) {
            // Defensive null check validation on incoming frame
            if (!transactionEnvelope || typeof transactionEnvelope !== 'object') {
                return this._normalizeOfflineResponse(false, "Malformed transaction envelope rejected by network layer.");
            }

            const { route, authContext, payload } = transactionEnvelope;

            if (!route || typeof route !== 'string') {
                return this._normalizeOfflineResponse(false, "Contract Violation: Route identifier absent inside message frame.");
            }

            // Step 1: Resolve current connectivity perimeter status
            this._isOnline = this.hasWanLink();

            // Step 2: Extract operation classification via route-based semantic detection
            const isReadOperation = this._isRouteReadAction(route);

            // Step 3: Handle execution branches based on state conditions
            if (this._isOnline) {
                try {
                    // Safe execution through kernel router instance
                    if (this.kernel.router && typeof this.kernel.router.dispatch === 'function') {
                        const directResponse = await this.kernel.router.dispatch({ route, authContext, payload });
                        
                        // Update cache buffers transparently for read payloads
                        if (isReadOperation && directResponse?.success) {
                            await this._updateLocalCacheMemory(route, directResponse.data);
                        }
                        return directResponse;
                    }
                } catch (remoteError) {
                    this._logSystemNotice(`Primary route execution failed for [${route}]. Forcing local loop fallback down-shift.`, remoteError);
                    return await this._executeFailbackPipeline(route, authContext, payload, isReadOperation);
                }
            }

            // Step 4: Native air-gapped or offline processing loop
            return await this._executeFailbackPipeline(route, authContext, payload, isReadOperation);
        }

        /**
         * Segregated local failback execution channel
         */
        async _executeFailbackPipeline(route, authContext, payload, isReadOperation) {
            if (isReadOperation) {
                // Read Branch -> Read Cache -> Read Local Disk File Fallback
                this._logSystemNotice(`Sourcing dataset locally from fallback disk maps for route [${route}].`);
                const cachedData = await this._readFromLocalCacheMemory(route);
                if (cachedData !== null) {
                    return this._normalizeOfflineResponse(true, "Data resolved smoothly from offline cache registers.", cachedData, true);
                }
                
                const diskData = await this._readFromLocalStorageDisk(route);
                if (diskData !== null) {
                    return this._normalizeOfflineResponse(true, "Data resolved smoothly from offline persistent storage logs.", diskData, true);
                }

                return this._normalizeOfflineResponse(false, `Requested route data [${route}] unavailable while operating offline.`, null, true);
            } else {
                // Write Branch -> Write Queue Frame
                this._logSystemNotice(`Network link unestablished. Staging mutation transaction [${route}] into write queue buffer.`);
                return await this._stageTransactionInWriteQueue(route, authContext, payload);
            }
        }

        /**
         * Classifies transactions based entirely on the route string signature
         */
        _isRouteReadAction(routeString) {
            const normalized = String(routeString).toLowerCase();
            return normalized.startsWith('get_') || 
                   normalized.startsWith('fetch_') || 
                   normalized.startsWith('read_') || 
                   normalized.startsWith('query_');
        }

        /**
         * Defensive management of cache subsystems
         */
        async _updateLocalCacheMemory(route, dataPayload) {
            if (this.kernel.cache && typeof this.kernel.cache.set === 'function') {
                try {
                    await this.kernel.cache.set(route, dataPayload, this.config.defaultCacheTtl);
                } catch (e) {
                    this._logSystemNotice("Local cache register update skipped.", e);
                }
            }
            
            // Mirrors data changes synchronously back onto disk storage layers
            await this._writeToLocalStorageDisk(route, dataPayload);
        }

        async _readFromLocalCacheMemory(route) {
            if (this.kernel.cache && typeof this.kernel.cache.get === 'function') {
                try {
                    return await this.kernel.cache.get(route);
                } catch (e) {
                    this._logSystemNotice("Local cache read error encountered.", e);
                }
            }
            return null;
        }

        /**
         * Interacts cleanly with standard platform persistent storage engines
         */
        async _writeToLocalStorageDisk(route, dataPayload) {
            const storageEngine = window.CozyOS?.Storage;
            if (storageEngine && typeof storageEngine.saveModuleData === 'function') {
                try {
                    await storageEngine.saveModuleData(`offline_cache_${route}`, dataPayload);
                    return true;
                } catch (e) {
                    this._logSystemNotice("Local disk array persistence update skipped.", e);
                }
            }
            return false;
        }

        async _readFromLocalStorageDisk(route) {
            const storageEngine = window.CozyOS?.Storage;
            if (storageEngine && typeof storageEngine.loadModuleData === 'function') {
                try {
                    return await storageEngine.loadModuleData(`offline_cache_${route}`);
                } catch (e) {
                    this._logSystemNotice("Local disk array transaction retrieval failed.", e);
                }
            }
            return null;
        }

        /**
         * Pushes mutation actions safely into transactional log stacks
         */
        async _stageTransactionInWriteQueue(route, authContext, payload) {
            const standardizedQueueItem = {
                id: `TX-QUEUE-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                route,
                authContext: authContext || null,
                payload: payload || {},
                timestamp: new Date().toISOString()
            };

            if (this.kernel.queue && typeof this.kernel.queue.push === 'function') {
                try {
                    await this.kernel.queue.push(standardizedQueueItem);
                    return this._normalizeOfflineResponse(true, "Transaction payload staged into memory queue queues safely.", { queued: true, id: standardizedQueueItem.id }, true);
                } catch (queueError) {
                    this._logSystemNotice("Framework memory tracking queue failed, falling back to local storage structures.", queueError);
                }
            }

            // Fallback transaction queue replication to persistent disk
            const existingQueue = await this._readFromLocalStorageDisk("global_offline_queue") || [];
            existingQueue.push(standardizedQueueItem);
            await this._writeToLocalStorageDisk("global_offline_queue", existingQueue);

            return this._normalizeOfflineResponse(true, "Transaction successfully secured inside offline storage database layers.", { queued: true, id: standardizedQueueItem.id }, true);
        }

        /**
         * Forces downstream link reconnection flushes when hardware interface links return
         */
        async triggerImmediateFailback() {
            this._logSystemNotice("Network hardware state recovery caught. Initiating offline buffer reconciliation processing.");
            
            if (this.kernel.queue && typeof this.kernel.queue.flushAll === 'function') {
                try {
                    await this.kernel.queue.flushAll();
                    return true;
                } catch (e) {
                    this._logSystemNotice("Reconciliation processing chain aborted.", e);
                }
            }

            // Alternate fallback local storage queue execution flow
            const pendingQueue = await this._readFromLocalStorageDisk("global_offline_queue");
            if (pendingQueue && pendingQueue.length > 0 && this.kernel.router && typeof this.kernel.router.dispatch === 'function') {
                try {
                    for (const transaction of pendingQueue) {
                        await this.kernel.router.dispatch({
                            route: transaction.route,
                            authContext: transaction.authContext,
                            payload: transaction.payload
                        });
                    }
                    await this._writeToLocalStorageDisk("global_offline_queue", []);
                } catch (dispatchLoopError) {
                    this._logSystemNotice("Automated background transaction resolution halted.", dispatchLoopError);
                    return false;
                }
            }
            return true;
        }

        /**
         * Normalizes all pipeline responses to guarantee semantic predictability
         */
        _normalizeOfflineResponse(success, message, data = null, isOfflinePayload = false) {
            return {
                success: !!success,
                message: String(message),
                data: data,
                offline: !!isOfflinePayload,
                timestamp: new Date().toISOString()
            };
        }

        _evaluateInitialHardwareState() {
            this._isOnline = this.hasWanLink();
        }

        _bindHardwareNetworkListeners() {
            if (this._listenersAttached || typeof window === 'undefined') return;

            window.addEventListener('online', () => {
                this._isOnline = true;
                this.triggerImmediateFailback();
            });

            window.addEventListener('offline', () => {
                this._isOnline = false;
                this._logSystemNotice("Hardware interface reports standard off-grid status. System shifted to offline operations.");
            });

            this._listenersAttached = true;
        }

        _logSystemNotice(logContextText, structuralError = null) {
            const formattedMessage = `[CozyOS Offline Engine]: ${logContextText}`;
            if (structuralError) {
                console.warn(formattedMessage, structuralError);
            } else {
                console.log(formattedMessage);
            }
        }
    }

    // Bind seamlessly into global framework scope namespaces
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.OfflineCoordinator = OfflineCoordinator;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = OfflineCoordinator;
    }

})();
