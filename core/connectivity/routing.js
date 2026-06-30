/**
 * CozyOS Enterprise Framework - Central Connectivity Router
 * File Reference: /core/connectivity/routing.js
 * Architectural Standard for Framework Route Resolution and Transaction Dispatch
 * v2.4.3 — Added unified .route() alias for frozen Connectivity Kernel parity.
 */

(function () {
    'use strict';

    class CozyOSConnectivityRouter {
        constructor() {
            this._routes = new Map();
            this._interceptors = [];
        }

        /**
         * 1. Register a single or batch profile of execution routes
         */
        register(routeName, handlerReference, metadata = {}) {
            if (!routeName || typeof routeName !== 'string') {
                throw new TypeError("[CozyOS Router] Registration rejected: Route path designation must be a non-empty string.");
            }
            
            const normalizedRoute = routeName.trim();
            if (this._routes.has(normalizedRoute)) {
                throw new Error(`[CozyOS Router] Collision detection: Route '${normalizedRoute}' is already allocated inside the registry.`);
            }

            if (!handlerReference) {
                throw new TypeError(`[CozyOS Router] Registration rejected: Endpoint target for route '${normalizedRoute}' cannot be null or undefined.`);
            }

            this._routes.set(normalizedRoute, {
                handler: handlerReference,
                metadata: { ...metadata, registeredAt: new Date().toISOString() }
            });

            return true;
        }

        /**
         * 2. Unregister or tear-down a runtime execution route dynamically
         */
        unregister(routeName) {
            if (!routeName || typeof routeName !== 'string') return false;
            return this._routes.delete(routeName.trim());
        }

        /**
         * 3. Check for structural existence of an endpoint within the active routing mesh
         */
        exists(routeName) {
            if (!routeName || typeof routeName !== 'string') return false;
            return this._routes.has(routeName.trim());
        }

        /**
         * 4. Resolve a route payload definition configuration state
         */
        resolve(routeName) {
            if (!routeName || typeof routeName !== 'string') return null;
            return this._routes.get(routeName.trim()) || null;
        }

        /**
         * 5. Dispatch Requests utilizing the modern v2.4.1 uniform payload contract
         * Enforces strict delivery matching: { route, authContext, payload }
         */
        async dispatch(transactionEnvelope) {
            if (!transactionEnvelope || typeof transactionEnvelope !== 'object') {
                throw new TypeError("[CozyOS Router] Dispatch failed: Transaction envelope must be a valid configuration object.");
            }

            const { route, authContext, payload } = transactionEnvelope;

            if (!route || typeof route !== 'string') {
                throw new Error("[CozyOS Router] Contract Violation: Missing string parameter 'route' within message frame.");
            }

            const normalizedRoute = route.trim();
            const targetedRoute = this._routes.get(normalizedRoute);

            if (!targetedRoute) {
                throw new ReferenceError(`[CozyOS Router] Route Execution Fault: Target destination '${normalizedRoute}' is not registered within this cluster.`);
            }

            const standardizedEnvelope = {
                route: normalizedRoute,
                authContext: authContext || null,
                payload: payload || {}
            };

            for (const interceptor of this._interceptors) {
                await interceptor(standardizedEnvelope);
            }

            const endpoint = targetedRoute.handler;

            if (typeof endpoint === 'function') {
                return await endpoint(standardizedEnvelope);
            } else if (endpoint && typeof endpoint.handle === 'function') {
                return await endpoint.handle(standardizedEnvelope);
            }

            throw new TypeError(`[CozyOS Router] Engine Invocation Error: Handler bound to route '${normalizedRoute}' missing structural invocation point (.handle or executable function).`);
        }

        /**
         * 6. Operational Alias for Connectivity Kernel Parity
         * Maps .route() requests cleanly into the uniform v2.4.1 transaction pipeline.
         */
        async route(transactionEnvelope) {
            return await this.dispatch(transactionEnvelope);
        }

        /**
         * Pipeline hook enabling non-invasive tracing across the transaction plane
         */
        use(interceptorFn) {
            if (typeof interceptorFn === 'function') {
                this._interceptors.push(interceptorFn);
            }
        }

        /**
         * Flushes the routing table during complete framework runtime recycles
         */
        flush() {
            this._routes.clear();
            this._interceptors = [];
        }
    }

    // Initialize global namespace layers safely
    window.CozyOS = window.CozyOS || {};
    
    if (!window.CozyOS.Router) {
        window.CozyOS.Router = new CozyOSConnectivityRouter();
    }

    // Export consistent referencing pointers across modular execution contexts
    window.CozyOS.SmartRouter = window.CozyOS.Router;

})();
