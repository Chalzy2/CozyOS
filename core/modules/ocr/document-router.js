/**
 * ── CozyOS UNIVERSAL COGNITIVE CORE ── DOCUMENT ROUTER SUBSURFACE
 * FILE: core/modules/ocr/document-router.js
 * VERSION: 1.1.0-ENTERPRISE-FROZEN
 * TARGET PLATFORM: CozyOS Kernel v2.1+
 * * ARCHITECTURAL PASS: Upgraded with multi-stage interceptor chains, capability 
 * metadata inspection matrices, broadcast topologies, and deep microkernel mapping hooks.
 */

"use strict";

if (!window.CozyOS) window.CozyOS = {};

class CozyDocumentRouter {
    constructor() {
        this.metadata = Object.freeze({
            moduleId: "cozy_document_router",
            certificationId: "CERT-COZYROUTER-110-2026",
            build: "2026.07.02.RELEASE",
            apiVersion: "1.1.0",
            freezeLevel: 3,
            compatibility: "CozyOCR Core >=1.1.0 | CozyOS.Kernel.v2.1+"
        });

        this.EVENTS = Object.freeze({
            DOCUMENT_ROUTED: "DOCUMENT_ROUTED",
            DOCUMENT_ROUTE_FAILED: "DOCUMENT_ROUTE_FAILED",
            DOCUMENT_HANDLER_REGISTERED: "DOCUMENT_HANDLER_REGISTERED",
            DOCUMENT_HANDLER_REMOVED: "DOCUMENT_HANDLER_REMOVED",
            DOCUMENT_UNKNOWN: "DOCUMENT_UNKNOWN"
        });

        this._initialized = false;

        // Map<documentType, Map<handlerId, { priority, instance, metadata, registeredAt }>>
        this._handlers = new Map();

        // Interceptor Chain Matrix Arrays
        this._interceptors = {
            before: [], // Callbacks executed sequentially before handler routing
            after: []   // Callbacks executed sequentially after successful handler routing
        };

        // Bounded holding frames
        this._unknownQueue = [];
        this._MAX_UNKNOWN_QUEUE_SIZE = 1000;

        this._routingHistory = [];
        this._MAX_ROUTING_HISTORY = 500;

        this._ROUTE_HANDLER_TIMEOUT_MS = 15000;
        this._EMPTY_FROZEN_OBJECT = Object.freeze({});
    }

    /**
     * Runtime Bootstrap Protocol
     */
    async initialize() {
        if (this._initialized) return;
        this._initialized = true;

        // Auto-Register into Microkernel Framework Stack if exposed
        if (window.CozyOS.Kernel?.registerBusinessModule) {
            window.CozyOS.Kernel.registerBusinessModule("002", "Document Router Core", this);
        }

        this._dispatchSystemEvent("ROUTER_INITIALIZED", { timestamp: Date.now() });
    }

    /**
     * Graceful Unload/Shutdown Interface Sequence
     */
    async shutdown() {
        if (!this._initialized) return;
        this._initialized = false;
        this._handlers.clear();
        this._interceptors.before = [];
        this._interceptors.after = [];
        this._unknownQueue = [];
        this._routingHistory = [];
        this._dispatchSystemEvent("ROUTER_SHUTDOWN", { timestamp: Date.now() });
    }

    /**
     * Extended Plugin Subsystem: Register a downstream execution handler.
     * Handlers provide a structural identity config containing priority, implementation reference, and capability manifests.
     */
    registerHandler(documentType, handlerId, handlerInstance, priority = 50, capabilityMetadata = null) {
        this._assertInitialized();

        if (!documentType || typeof documentType !== "string") {
            throw new Error("❌ [ROUTER REGISTRATION FAULT] documentType must be a non-empty string.");
        }
        if (!handlerId || typeof handlerId !== "string") {
            throw new Error("❌ [ROUTER REGISTRATION FAULT] handlerId must be a non-empty string.");
        }
        if (!handlerInstance || typeof handlerInstance.handle !== "function") {
            throw new Error("❌ [ROUTER REGISTRATION FAULT] handlerInstance must expose a callable .handle(cozyOcrResult) method.");
        }

        if (!this._handlers.has(documentType)) {
            this._handlers.set(documentType, new Map());
        }

        // Standardized Capability Metadata Shape Fallback
        const normalizedMeta = this._deepFreeze({
            id: handlerId,
            version: capabilityMetadata?.version || "1.0.0",
            module: capabilityMetadata?.module || "GenericEnterpriseModule",
            capabilities: Array.isArray(capabilityMetadata?.capabilities) ? [...capabilityMetadata.capabilities] : [documentType],
            broadcast: !!capabilityMetadata?.broadcast
        });

        this._handlers.get(documentType).set(handlerId, {
            priority: Number(priority) || 50,
            instance: handlerInstance,
            metadata: normalizedMeta,
            registeredAt: Date.now()
        });

        this._dispatchSystemEvent(this.EVENTS.DOCUMENT_HANDLER_REGISTERED, {
            documentType, handlerId, priority: Number(priority) || 50, metadata: normalizedMeta, timestamp: Date.now()
        });

        return true;
    }

    /**
     * Plugin Subsystem: De-register a targeted destination pipeline handler
     */
    unregisterHandler(documentType, handlerId) {
        this._assertInitialized();

        const bucket = this._handlers.get(documentType);
        if (!bucket || !bucket.has(handlerId)) {
            return false;
        }
        bucket.delete(handlerId);
        if (bucket.size === 0) {
            this._handlers.delete(documentType);
        }

        this._dispatchSystemEvent(this.EVENTS.DOCUMENT_HANDLER_REMOVED, {
            documentType, handlerId, timestamp: Date.now()
        });

        return true;
    }

    /**
     * Interceptor Pipeline Subsystem: Registers pre- or post-route listeners
     */
    registerInterceptor(stage, interceptorFn) {
        this._assertInitialized();
        if (stage !== "before" && stage !== "after") {
            throw new Error("❌ [ROUTER INTERCEPTOR FAULT] Invalid stage parameter target specified.");
        }
        if (typeof interceptorFn !== "function") {
            throw new Error("❌ [ROUTER INTERCEPTOR FAULT] Interceptor target descriptor must be a functional execution block.");
        }
        this._interceptors[stage].push(interceptorFn);
    }

    /**
     * Returns the active primary or array context targeting structural handlers matching document specifications
     */
    getHandler(documentType) {
        const bucket = this._handlers.get(documentType);
        if (!bucket || bucket.size === 0) return null;

        let best = null;
        let bestId = null;
        for (const id of Object.keys(Object.fromEntries(bucket))) {
            const entry = bucket.get(id);
            if (best === null || entry.priority > best.priority) {
                best = entry;
                bestId = id;
            }
        }
        return this._deepFreeze({
            documentType,
            handlerId: bestId,
            priority: best.priority,
            metadata: best.metadata,
            registeredAt: best.registeredAt
        });
    }

    /**
     * Returns matching metrics listing elements active across current running profiles
     */
    listHandlers(documentType = null) {
        const out = [];
        const types = documentType ? [documentType] : [...this._handlers.keys()];

        for (const type of types) {
            const bucket = this._handlers.get(type);
            if (!bucket) continue;
            for (const id of Object.keys(Object.fromEntries(bucket))) {
                const entry = bucket.get(id);
                out.push({
                    documentType: type,
                    handlerId: id,
                    priority: entry.priority,
                    metadata: entry.metadata,
                    registeredAt: entry.registeredAt
                });
            }
        }
        return this._deepFreeze(out.sort((a, b) => b.priority - a.priority));
    }

    /**
     * Core Ingestion Flow Core: Evaluates interceptor sequences, processes standard and broadcast 
     * channel logic, and ensures absolute data pipeline delivery containment.
     */
    async route(cozyOcrResult) {
        this._assertInitialized();
        const startTime = this._getHighResolutionTime();

        // 1. Structural Validation Filters
        const validationError = this._validateRouteInput(cozyOcrResult);
        if (validationError) {
            const failureFrame = this._generateFailureFrame(cozyOcrResult, validationError, startTime);
            this._dispatchSystemEvent(this.EVENTS.DOCUMENT_ROUTE_FAILED, failureFrame);
            this._writeRoutingHistory(failureFrame);
            return failureFrame;
        }

        const documentType = cozyOcrResult.documentType;
        const bucket = this._handlers.get(documentType);

        // 2. Interceptor Lifecycle Chain Execution: Before Route Flow Pass
        let contextualPayload = this._deepFreeze({ ...cozyOcrResult });
        try {
            for (const interceptor of this._interceptors.before) {
                const interceptedResult = await Promise.resolve(interceptor(contextualPayload));
                if (interceptedResult === false) {
                    throw new Error("Routing thread terminated by an active security or operational pre-route interceptor.");
                }
                if (interceptedResult && typeof interceptedResult === "object") {
                    contextualPayload = this._deepFreeze(interceptedResult);
                }
            }
        } catch (interceptFault) {
            const failureFrame = this._generateFailureFrame(cozyOcrResult, `PRE_ROUTE_INTERCEPTOR_REJECTION: ${interceptFault.message}`, startTime);
            this._dispatchSystemEvent(this.EVENTS.DOCUMENT_ROUTE_FAILED, failureFrame);
            this._writeRoutingHistory(failureFrame);
            return failureFrame;
        }

        // 3. Fallback Deferred Verification Checks
        if (!bucket || bucket.size === 0) {
            const deferredFrame = this._generateUnknownFrame(contextualPayload, documentType, startTime);
            this._enqueueUnknown(contextualPayload, documentType);
            this._dispatchSystemEvent(this.EVENTS.DOCUMENT_UNKNOWN, deferredFrame);
            this._writeRoutingHistory(deferredFrame);
            return deferredFrame;
        }

        // 4. Operational Disambiguation: Identify Target Nodes and Broadcast Statuses
        const executionQueue = [];
        const activeHandlersList = [];
        
        for (const id of Object.keys(Object.fromEntries(bucket))) {
            const entry = bucket.get(id);
            if (entry.metadata.broadcast) {
                executionQueue.push({ id, entry });
                activeHandlersList.push({ handlerId: id, priority: entry.priority, broadcast: true });
            }
        }

        // If zero broadcast nodes matched, fall back cleanly to traditional high-priority determination behavior
        if (executionQueue.length === 0) {
            const primaryMatch = this.getHandler(documentType);
            if (primaryMatch) {
                executionQueue.push({ id: primaryMatch.handlerId, entry: bucket.get(primaryMatch.handlerId) });
                activeHandlersList.push({ handlerId: primaryMatch.handlerId, priority: primaryMatch.priority, broadcast: false });
            }
        }

        // 5. Execution Pipeline Strategy Resolvers
        try {
            const operationalResults = [];

            for (const dispatchUnit of executionQueue) {
                const stepPromise = Promise.race([
                    Promise.resolve(dispatchUnit.entry.instance.handle(contextualPayload)),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error(`ROUTE_HANDLER_TIMEOUT_EXCEEDED: ${dispatchUnit.id}`)), this._ROUTE_HANDLER_TIMEOUT_MS)
                    )
                ]);
                operationalResults.push(stepPromise.catch(err => ({ error: true, msg: err.message || String(err) })));
            }

            const rawResolutionBlock = await Promise.all(operationalResults);
            
            let routedFrame = this._deepFreeze({
                success: true,
                status: "ROUTED",
                documentType: documentType,
                routedTargets: activeHandlersList,
                handlerResults: rawResolutionBlock,
                warnings: contextualPayload.warnings || [],
                errors: [],
                timestamp: Date.now(),
                routingTime: +(this._getHighResolutionTime() - startTime).toFixed(2)
            });

            // 6. Interceptor Lifecycle Chain Execution: After Route Flow Pass
            for (const postInterceptor of this._interceptors.after) {
                const fineResult = await Promise.resolve(postInterceptor(routedFrame));
                if (fineResult && typeof fineResult === "object") {
                    routedFrame = this._deepFreeze(fineResult);
                }
            }

            this._dispatchSystemEvent(this.EVENTS.DOCUMENT_ROUTED, routedFrame);
            this._writeRoutingHistory(routedFrame);
            return routedFrame;

        } catch (fault) {
            const failureFrame = this._generateFailureFrame(contextualPayload, `EXECUTION_PIPELINE_FAULT: ${fault.message || String(fault)}`, startTime);
            this._dispatchSystemEvent(this.EVENTS.DOCUMENT_ROUTE_FAILED, failureFrame);
            this._writeRoutingHistory(failureFrame);
            return failureFrame;
        }
    }

    getUnknownQueue() { return this._deepFreeze([...this._unknownQueue]); }
    clearUnknownQueue() { this._unknownQueue = []; return true; }
    getRoutingHistory() { return this._deepFreeze([...this._routingHistory]); }
    exportRoutingHistory() { return JSON.stringify(this.getRoutingHistory()); }

    /**
     * Platform Monitoring System Introspection Endpoint
     */
    getHealthStatus() {
        let documentTypesCovered = 0;
        let handlersRegistered = 0;
        for (const bucket of this._handlers.values()) {
            documentTypesCovered += 1;
            handlersRegistered += bucket.size;
        }

        return this._deepFreeze({
            initialized: this._initialized,
            version: this.metadata.apiVersion,
            freezeLevel: this.metadata.freezeLevel,
            requiredCozyOCRVersion: this.metadata.compatibility,
            documentTypesCovered: documentTypesCovered,
            handlersRegistered: handlersRegistered,
            interceptorsConfigured: this._interceptors.before.length + this._interceptors.after.length,
            unknownQueueSize: this._unknownQueue.length,
            routingHistorySize: this._routingHistory.length,
            timestamp: Date.now()
        });
    }

    getVersion() { return this.metadata.apiVersion; }

    /* ── PRIVATE REUSABLE INTERNAL PROCESSING CORE FUNCTIONS ── */

    _assertInitialized() {
        if (!this._initialized) throw new Error("❌ [CRITICAL COZYOS CORE FAULT] Document Router requested before initialization routine.");
    }

    _getHighResolutionTime() {
        return (typeof performance !== "undefined" && typeof performance.now === "function") ? performance.now() : Date.now();
    }

    _validateRouteInput(result) {
        if (!result || typeof result !== "object") return "INVALID_INPUT: cozyOcrResult must be an object.";
        if (typeof result.documentType !== "string" || result.documentType.trim().length === 0) {
            return "INVALID_INPUT: cozyOcrResult.documentType must be a non-empty string.";
        }
        return null;
    }

    _generateFailureFrame(cozyOcrResult, reason, startTime) {
        return this._deepFreeze({
            success: false,
            status: "ROUTE_FAILED",
            documentType: (cozyOcrResult && typeof cozyOcrResult.documentType === "string") ? cozyOcrResult.documentType : null,
            routedTargets: [],
            handlerResults: [],
            warnings: [],
            errors: [{ code: "ROUTE_FAILED", message: reason }],
            timestamp: Date.now(),
            routingTime: +(this._getHighResolutionTime() - startTime).toFixed(2)
        });
    }

    _generateUnknownFrame(cozyOcrResult, documentType, startTime) {
        return this._deepFreeze({
            success: false,
            status: "DEFERRED",
            documentType: documentType,
            routedTargets: [],
            handlerResults: [],
            reason: `No handler registered for documentType '${documentType}'. Routed to Unknown Queue.`,
            warnings: (cozyOcrResult && cozyOcrResult.warnings) || [],
            errors: [],
            timestamp: Date.now(),
            routingTime: +(this._getHighResolutionTime() - startTime).toFixed(2)
        });
    }

    _enqueueUnknown(cozyOcrResult, documentType) {
        if (this._unknownQueue.length >= this._MAX_UNKNOWN_QUEUE_SIZE) {
            this._unknownQueue.shift(); 
        }
        this._unknownQueue.push(this._deepFreeze({
            documentType: documentType,
            confidence: (cozyOcrResult && cozyOcrResult.confidence !== undefined) ? cozyOcrResult.confidence : null,
            rawText: (cozyOcrResult && typeof cozyOcrResult.rawText === "string") ? cozyOcrResult.rawText : null,
            structuredData: (cozyOcrResult && cozyOcrResult.structuredData) ? cozyOcrResult.structuredData : this._EMPTY_FROZEN_OBJECT,
            queuedAt: Date.now()
        }));
    }

    _writeRoutingHistory(entry) {
        this._routingHistory.push(entry); 
        if (this._routingHistory.length > this._MAX_ROUTING_HISTORY) this._routingHistory.shift();
    }

    _dispatchSystemEvent(eventName, payload) {
        if (typeof document !== "undefined" && document.dispatchEvent) {
            const systemEvt = new CustomEvent(eventName, { detail: this._deepFreeze(payload) });
            document.dispatchEvent(systemEvt);
        }
    }
}

// Global Core Namespace Attachment Isolation
window.CozyOS.DocumentRouter = new CozyDocumentRouter();
