/**
 * CozyOS Enterprise Framework - Base UI Orchestration Engine
 * File Reference: /core/ui/cozy-base-linker.js
 * Architectural Standard for all CozyOS Modules (Quarry, Hotel, School, Pharmacy, etc.)
 * v2.4.1 — Single source of truth. route/authContext/payload engine contract only.
 * Identity via CozyOS.Auth.getCurrentIdentity(); tenant/language context cached;
 * Router-aware redirectToLogin(); SystemRoutes fallback pattern for shared
 * system routes (queue sync, exception logging).
 */

class CozyBaseLinker {
    constructor(moduleName, actionsConfig, eventsConfig) {
        if (this.constructor === CozyBaseLinker) {
            throw new TypeError("Cannot instantiate abstract class CozyBaseLinker directly.");
        }

        this.moduleName = moduleName;
        this.ACTIONS = actionsConfig;
        this.EVENTS = {
            DATA_CHANGED: "COZY_ENTERPRISE_DATA_CHANGED",
            NOTIFICATION: "COZY_NOTIFICATION_SHOW",
            NETWORK_ONLINE: "COZY_NETWORK_ONLINE",
            ...eventsConfig
        };

        this.DOM = {};
        this.refreshTimer = null;
        this.autosaveTimers = new Map();
        this._boundListeners = [];
        this.engine = window.CozyOS?.Modules?.[this.moduleName] || null;

        // Context cache — populated in evaluateSecurityContext()
        this.currentIdentity = null;
        this.currentTenant = null;
        this.currentLanguage = null;
    }

    /**
     * Core Application Lifecycle Bootstrapper
     */
    init() {
        window.addEventListener('DOMContentLoaded', async () => {
            if (!this.engine) {
                this.handleSystemError("Core Backend Module Interface Absent", new Error(`Module ${this.moduleName} not mounted.`));
                return;
            }

            this.DOM = this.buildDomCache();
            this.bindCoreGlobalEventListeners();
            this.bindModuleInterfaceEvents();

            try {
                await this.evaluateSecurityContext();
                this.initializeNavigationRouting();
                this.startTelemetryHeartbeat();
                this.onModuleReady();
            } catch (error) {
                this.handleSystemError("Initialization Process Blocked", error);
            }
        });
    }

    /**
     * DOM Cache Factory - Overridden by children to inject context elements
     */
    buildDomCache() {
        return {
            navItems: document.querySelectorAll('[data-view]'),
            rolePill: document.querySelector('.role-pill'),
            syncBadge: document.querySelector('.sync-badge')
        };
    }

    /**
     * Helper to pull identity cleanly from the native CozyOS Auth Module
     */
    getCurrentIdentity() {
        return window.CozyOS?.Auth?.getCurrentIdentity?.() || null;
    }

    /**
     * Security & Context Mapping Pipeline
     * Identity comes exclusively from CozyOS.Auth.getCurrentIdentity().
     * Tenant and language context are cached alongside identity for use
     * by child linkers. View gating reads identity.permissions (falling
     * back to identity.allowedViews for compatibility with either
     * Auth-layer shape) — an empty/absent list means "no restriction".
     */
    async evaluateSecurityContext() {
        const identity = this.getCurrentIdentity();

        if (!identity) {
            this.redirectToLogin();
            return;
        }

        this.currentIdentity = identity;
        this.currentTenant = identity.tenantId || window.CozyOS?.ActiveTenantId || null;
        this.currentLanguage = window.CozyOS?.Language?.getCurrentLanguage?.() || "en";

        if (this.DOM.rolePill) {
            this.DOM.rolePill.innerText = identity.role || "Guest";
        }

        const allowedViews = identity.permissions || identity.allowedViews;
        if (Array.isArray(allowedViews)) {
            this.applyUIVisibilityRules(allowedViews);
        }
    }

    /**
     * Routes to the login view via CozyOS.Router when available, falling
     * back to a hard navigation only if the Router service isn't mounted.
     */
    redirectToLogin() {
        const redirect = String(this.moduleName).toLowerCase();
        if (window.CozyOS?.Router?.navigate) {
            window.CozyOS.Router.navigate("login", { redirect });
        } else {
            window.location.href = `/login?redirect=${redirect}`;
        }
    }

    applyUIVisibilityRules(allowedViews) {
        document.querySelectorAll('[data-view]').forEach(item => {
            const targetView = item.getAttribute('data-view');
            if (allowedViews.length > 0 && !allowedViews.includes(targetView)) {
                item.style.display = 'none';
            }
        });
    }

    /**
     * Centralized Native Event Bus Binding Framework
     */
    bindCoreGlobalEventListeners() {
        // Automatically handle data changes across views
        const onDataChangedHandler = () => this.onDataChanged();
        window.addEventListener(this.EVENTS.DATA_CHANGED, onDataChangedHandler);
        this._boundListeners.push({ target: window, type: this.EVENTS.DATA_CHANGED, handler: onDataChangedHandler });

        // Offline Reconnect Synchronization Kernel Hooks
        const onNetworkOnlineHandler = async () => {
            this.showToastNotification("Network connection re-established. Synchronizing local database engines...", "info");
            try {
                const syncResponse = await this.engine.handle({
                    route: window.CozyOS?.SystemRoutes?.EXECUTE_LOCAL_QUEUE_SYNC || "execute_local_queue_sync",
                    authContext: this.currentIdentity,
                    payload: {}
                });
                if (syncResponse && syncResponse.success) {
                    this.showToastNotification("Synchronization completed successfully. Ledger state current.", "success");
                    this.triggerDataChangedSync();
                }
            } catch (err) {
                this.handleSystemError("Background Synchronization Blocked", err);
            }
        };
        window.addEventListener(this.EVENTS.NETWORK_ONLINE, onNetworkOnlineHandler);
        this._boundListeners.push({ target: window, type: this.EVENTS.NETWORK_ONLINE, handler: onNetworkOnlineHandler });
    }

    /**
     * Intercept presentation layer navigation attributes and route through central service
     */
    initializeNavigationRouting() {
        const navElements = document.querySelectorAll('[data-view]');
        navElements.forEach(el => {
            const handler = (e) => {
                const targetViewId = e.currentTarget.getAttribute('data-view');
                if (window.CozyOS?.Router?.navigate) {
                    window.CozyOS.Router.navigate(targetViewId);
                    this.updateActiveNavigationUI(el);
                } else if (window.CozyOS?.UI?.navigate) {
                    // Fallback for pages that haven't loaded router.js yet.
                    window.CozyOS.UI.navigate(targetViewId);
                    this.updateActiveNavigationUI(el);
                } else {
                    console.warn("CozyOS Navigation Service unmounted. Standard routing bypassed.");
                }
            };
            el.addEventListener('click', handler);
            this._boundListeners.push({ target: el, type: 'click', handler });
        });
    }

    updateActiveNavigationUI(activeElement) {
        document.querySelectorAll('[data-view]').forEach(item => item.classList.remove('active'));
        activeElement.classList.add('active');
    }

    /**
     * Automatic Telemetry Synchronization Cycle (30-60 second polling heartbeat)
     */
    startTelemetryHeartbeat() {
        if (this.refreshTimer) clearInterval(this.refreshTimer);
        this.refreshTimer = setInterval(() => {
            this.triggerDataChangedSync();
        }, 45000); // Optimized 45-second core baseline
    }

    triggerDataChangedSync() {
        const event = new CustomEvent(this.EVENTS.DATA_CHANGED, { bubbles: true });
        window.dispatchEvent(event);
    }

    /**
     * Generic KPI Registry — modules call this.updateKPI("revenue", "KSh 1,200")
     * instead of caching/touching individual [data-kpi] DOM nodes themselves.
     * Delegates to CozyOS.Widgets.KpiCard when loaded.
     */
    updateKPI(name, value) {
        if (window.CozyOS?.Widgets?.KpiCard?.update) {
            return window.CozyOS.Widgets.KpiCard.update(name, value);
        }
        const el = this.DOM[`kpi${name.charAt(0).toUpperCase()}${name.slice(1)}`]
            || document.querySelector(`[data-kpi="${name}"]`);
        if (el) el.innerText = value;
        return !!el;
    }

    /**
     * Unified UI Feedback Framework
     */
    renderLoadingState(element, isLoading, textOverride = "") {
        if (!element) return;
        if (isLoading) {
            element.setAttribute('data-previous-state', element.innerHTML);
            element.disabled = true;
            if (element.tagName === 'BUTTON') element.innerText = textOverride || "Processing...";
        } else {
            element.disabled = false;
            const previousState = element.getAttribute('data-previous-state');
            if (previousState) element.innerHTML = previousState;
        }
    }

    /**
     * Toast dispatch delegates to CozyOS.Notification when present, falling
     * back to the original direct CustomEvent dispatch so behavior is
     * unchanged on pages that haven't loaded notification.js.
     */
    showToastNotification(message, severity = "info") {
        if (window.CozyOS?.Notification?.show) {
            window.CozyOS.Notification.show(message, severity);
            return;
        }
        const notificationEvent = new CustomEvent(this.EVENTS.NOTIFICATION, {
            detail: { message, severity }, bubbles: true
        });
        window.dispatchEvent(notificationEvent);
    }

    handleSystemError(context, nativeException) {
        this.showToastNotification(`System Warning: ${context}. Technical parameters tracked inside audit trail.`, "error");

        if (this.engine) {
            this.engine.handle({
                route: window.CozyOS?.SystemRoutes?.LOG_SYSTEM_EXCEPTION || "log_system_exception",
                authContext: this.currentIdentity,
                payload: { context, errorMessage: nativeException.message, timestamp: new Date().toISOString() }
            }).catch(() => {});
        }
    }

    /**
     * Opt-in autosave for forms (production, attendance, payroll, loans,
     * workers, etc). Call this.enableAutosave(formEl, 'quarry-production')
     * from a child's bindModuleInterfaceEvents(). Saves to localStorage
     * every 20s while the form has unsaved input, and clears the draft
     * once the form is submitted successfully.
     */
    enableAutosave(formEl, draftKey, intervalMs = 20000) {
        if (!formEl || !draftKey) return;

        // Restore any existing draft on enable.
        try {
            const saved = localStorage.getItem(`cozy_draft_${draftKey}`);
            if (saved) {
                const data = JSON.parse(saved);
                Object.entries(data).forEach(([name, value]) => {
                    const field = formEl.elements?.[name];
                    if (field) field.value = value;
                });
                this.showToastNotification("Draft restored from your last unsaved session.", "info");
            }
        } catch (e) {
            console.warn("CozyBaseLinker: failed to restore draft", e);
        }

        const timer = setInterval(() => {
            try {
                const data = {};
                Array.from(formEl.elements || []).forEach((field) => {
                    if (field.name) data[field.name] = field.value;
                });
                localStorage.setItem(`cozy_draft_${draftKey}`, JSON.stringify(data));
                this.showToastNotification("Draft saved locally…", "info");
            } catch (e) {
                console.warn("CozyBaseLinker: autosave write failed", e);
            }
        }, intervalMs);

        this.autosaveTimers.set(draftKey, timer);
    }

    clearAutosaveDraft(draftKey) {
        try {
            localStorage.removeItem(`cozy_draft_${draftKey}`);
        } catch (e) { /* ignore */ }
        const timer = this.autosaveTimers.get(draftKey);
        if (timer) {
            clearInterval(timer);
            this.autosaveTimers.delete(draftKey);
        }
    }

    /**
     * Cleanup hook so switching modules / unmounting a linker doesn't leak
     * intervals or event listeners. Child classes that add their own
     * listeners/timers should override this and call super.destroy().
     */
    destroy() {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
        }

        this.autosaveTimers.forEach((timer) => clearInterval(timer));
        this.autosaveTimers.clear();

        this._boundListeners.forEach(({ target, type, handler }) => {
            target.removeEventListener(type, handler);
        });
        this._boundListeners = [];
    }

    /* Abstract lifecycle hooks for child extensions */
    bindModuleInterfaceEvents() {}
    onModuleReady() {}
    onDataChanged() {}
}
window.CozyBaseLinker = CozyBaseLinker;
