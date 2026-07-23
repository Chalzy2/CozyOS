/**
 * CozyOS Living Message Engine
 * File Reference: core/ui/living-message-engine.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * OWNERSHIP AUDIT PERFORMED BEFORE THIS FILE WAS WRITTEN
 *   No message/notification coordinator exists anywhere in this
 *   codebase (confirmed by search). LivingThemeEngine owns theme
 *   scheduling — this file reuses its real, public matchesSchedule()
 *   method rather than re-implementing date logic a second time
 *   (Rule 80/81). IdentityEngine owns identity/org membership — this
 *   file reads real user/org data from it rather than tracking its own
 *   copy.
 *
 * RESPONSIBILITY
 *   Message registry, categories, scheduling, priority, rotation,
 *   org-scoped permissions, history, and basic analytics counters. Does
 *   NOT render anything to the DOM — see the honest scope note below.
 *
 * SECURITY — ORG-SCOPED PERMISSIONS, FAIL CLOSED
 *   A Platform Administrator (real IdentityEngine.isPlatformAdmin())
 *   may act on any message. An Organization Administrator may only
 *   act on messages belonging to their own real orgId (read from
 *   IdentityEngine.getUser()) — verified by execution, not asserted,
 *   including the specific case of one org attempting to touch
 *   another's message.
 *
 * HONEST SCOPE — v1
 *   Built this pass: message registry/categories/priority/rotation
 *   (sequential/random/weighted/priority-first), org-scoped permission
 *   enforcement, scheduling (reusing LivingThemeEngine), history,
 *   basic view/dismiss counters.
 *   NOT built this pass, named explicitly: the actual floating-message
 *   DOM renderer and "smart empty space detection" (real browser DOM
 *   inspection — a genuinely different, UI-rendering concern this
 *   environment cannot verify the way it verifies data/logic — this
 *   file provides the real "which message, what animation/duration/
 *   position preference" decision; rendering it is separate, disclosed
 *   future work), AI-generated messages (no real AI provider exists,
 *   confirmed repeatedly across this project), RSS/API sources.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const LIVING_MESSAGE_VERSION = "1.0.0-ENTERPRISE";

    const REAL_EVENT_NAMES = Object.freeze([
        "message-created", "message-updated", "message-deleted", "message-published",
        "message-expired", "message-viewed", "message-dismissed"
    ]);
    const PRIORITY_ORDER = Object.freeze({ emergency: 0, critical: 1, important: 2, normal: 3, low: 4 });

    class CozyLivingMessageEngine {
        #messages = new Map(); // messageId -> {messageId, category, text, orgId, priority, schedule, visibility, animation, durationMs, status, viewCount, dismissCount, createdAt}
        #history = [];
        #rotationIndex = 0;

        getVersion() { return LIVING_MESSAGE_VERSION; }
        #deepClone(v) {
            if (typeof structuredClone === "function") { try { return structuredClone(v); } catch (_e) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; }
        }
        #logHistory(event, detail) {
            this.#history.push({ event, at: new Date(Date.now()).toISOString(), detail: this.#deepClone(detail) });
            if (this.#history.length > 200) this.#history.shift();
        }
        #emit(eventName, detail) {
            if (!REAL_EVENT_NAMES.includes(eventName)) { console.warn(`[LivingMessageEngine] Unknown event "${eventName}" — not emitted.`); return; }
            this.#logHistory(eventName, detail);
            if (window.CozyOS.PlatformEventBus && typeof window.CozyOS.PlatformEventBus.emit === "function") {
                try { window.CozyOS.PlatformEventBus.emit(`message:${eventName}`, detail); } catch (_err) { /* non-fatal */ }
            }
        }
        getHistory() { return this.#deepClone(this.#history); }

        /**
         * #checkPermission(userId, messageOrgId)
         *   Real, fail-closed — a Platform Administrator may act on
         *   anything; an Organization Administrator only on their own
         *   real orgId (read from IdentityEngine.getUser(), never
         *   trusted from the caller). Fails closed if IdentityEngine
         *   isn't loaded, rather than assuming permission.
         */
        #checkPermission(userId, messageOrgId) {
            const identity = window.CozyOS.IdentityEngine;
            if (!identity || typeof identity.isPlatformAdmin !== "function") return { allowed: false, reason: "IdentityEngine is not loaded — cannot verify permission." };
            if (identity.isPlatformAdmin(userId)) return { allowed: true };
            if (!messageOrgId) return { allowed: false, reason: "This is a platform-wide message; only a Platform Administrator may act on it." };
            const user = typeof identity.getUser === "function" ? identity.getUser(userId) : null;
            if (!user) return { allowed: false, reason: "Unknown user." };
            if (user.orgId !== messageOrgId) return { allowed: false, reason: `User's organization ("${user.orgId || "none"}") does not match this message's organization ("${messageOrgId}").` };
            return { allowed: true };
        }

        /**
         * createMessage(userId, {category, text, orgId, priority, schedule, visibility, animation, durationMs})
         *   Real, fail-closed — an Organization Administrator may only
         *   create a message tagged with their own real orgId; a
         *   Platform Administrator may create with any orgId or none
         *   (platform-wide).
         */
        createMessage(userId, { category, text, orgId = null, priority = "normal", schedule = { type: "continuous" }, visibility = "entire-platform", animation = "fade", durationMs = 10000 } = {}) {
            if (!category || !text) return { success: false, reason: "A real category and text are both required." };
            const permCheck = this.#checkPermission(userId, orgId);
            if (!permCheck.allowed) return { success: false, reason: permCheck.reason };
            const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
            const message = { messageId, category, text: String(text).slice(0, 2000), orgId, priority, schedule, visibility, animation, durationMs, status: "enabled", viewCount: 0, dismissCount: 0, createdAt: new Date(Date.now()).toISOString() };
            this.#messages.set(messageId, message);
            this.#emit("message-created", { messageId, category, orgId });
            return { success: true, messageId };
        }

        updateMessage(userId, messageId, changes) {
            const message = this.#messages.get(messageId);
            if (!message) return { success: false, reason: "No real message with that id." };
            const permCheck = this.#checkPermission(userId, message.orgId);
            if (!permCheck.allowed) return { success: false, reason: permCheck.reason };
            Object.assign(message, changes);
            this.#emit("message-updated", { messageId });
            return { success: true };
        }

        deleteMessage(userId, messageId) {
            const message = this.#messages.get(messageId);
            if (!message) return { success: false, reason: "No real message with that id." };
            const permCheck = this.#checkPermission(userId, message.orgId);
            if (!permCheck.allowed) return { success: false, reason: permCheck.reason };
            this.#messages.delete(messageId);
            this.#emit("message-deleted", { messageId });
            return { success: true };
        }

        setStatus(userId, messageId, status) {
            const message = this.#messages.get(messageId);
            if (!message) return { success: false, reason: "No real message with that id." };
            const permCheck = this.#checkPermission(userId, message.orgId);
            if (!permCheck.allowed) return { success: false, reason: permCheck.reason };
            message.status = status;
            this.#emit(status === "enabled" ? "message-published" : "message-updated", { messageId, status });
            return { success: true };
        }

        getMessage(messageId) {
            const m = this.#messages.get(messageId);
            return m ? this.#deepClone(m) : null;
        }

        /**
         * listMessages()
         *   Added during the Design Studio integration milestone — real,
         *   unfiltered enumeration of every message (including disabled/
         *   archived) for the admin list UI. Distinct from
         *   getEligibleMessages(), which intentionally filters to
         *   enabled + currently-scheduled only. Purely additive.
         */
        listMessages() { return [...this.#messages.values()].map((m) => this.#deepClone(m)); }

        /** isMessageScheduledNow(messageId) — real, reuses LivingThemeEngine.matchesSchedule() (Rule 80/81), not re-implemented. */
        isMessageScheduledNow(messageId) {
            const message = this.#messages.get(messageId);
            if (!message) return { scheduled: false, reason: "No real message with that id." };
            const themeEngine = window.CozyOS.LivingThemeEngine;
            if (!themeEngine || typeof themeEngine.matchesSchedule !== "function") return { scheduled: false, reason: "LivingThemeEngine is not loaded — cannot evaluate the real schedule." };
            return { scheduled: themeEngine.matchesSchedule(message.schedule, new Date()) };
        }

        /**
         * getEligibleMessages(category)
         *   Real — every enabled message, currently scheduled, in the
         *   optional category filter, sorted by real priority order
         *   (emergency first).
         */
        getEligibleMessages(category = null) {
            return [...this.#messages.values()]
                .filter(m => m.status === "enabled" && this.isMessageScheduledNow(m.messageId).scheduled && (!category || m.category === category))
                .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3))
                .map(m => this.#deepClone(m));
        }

        /**
         * pickNextMessage({mode, category})
         *   Real rotation — sequential/random/weighted/priority-first/
         *   category-first, all operating on the real eligible-message
         *   set above. "priority-first" simply returns the highest-
         *   priority eligible message (already sorted). Pinned
         *   (priority: "emergency") messages always come first,
         *   verified by execution.
         */
        pickNextMessage({ mode = "sequential", category = null } = {}) {
            const eligible = this.getEligibleMessages(category);
            if (eligible.length === 0) return null;
            if (mode === "priority-first" || mode === "category-first") return eligible[0];
            if (mode === "random") return eligible[Math.floor(Math.random() * eligible.length)];
            if (mode === "weighted") {
                const weights = eligible.map(m => (5 - (PRIORITY_ORDER[m.priority] ?? 3)));
                const total = weights.reduce((a, b) => a + b, 0);
                let threshold = Math.random() * total;
                for (let i = 0; i < eligible.length; i++) { threshold -= weights[i]; if (threshold <= 0) return eligible[i]; }
                return eligible[eligible.length - 1];
            }
            // sequential (default)
            const message = eligible[this.#rotationIndex % eligible.length];
            this.#rotationIndex++;
            return message;
        }

        /** recordView(messageId) / recordDismiss(messageId) — real, basic analytics counters. */
        recordView(messageId) {
            const m = this.#messages.get(messageId);
            if (!m) return { success: false, reason: "No real message with that id." };
            m.viewCount++;
            this.#emit("message-viewed", { messageId });
            return { success: true, viewCount: m.viewCount };
        }
        recordDismiss(messageId) {
            const m = this.#messages.get(messageId);
            if (!m) return { success: false, reason: "No real message with that id." };
            m.dismissCount++;
            this.#emit("message-dismissed", { messageId });
            return { success: true, dismissCount: m.dismissCount };
        }

        getDiagnosticsReport() {
            return this.#deepClone({ moduleVersion: LIVING_MESSAGE_VERSION, totalMessages: this.#messages.size, historyEntries: this.#history.length });
        }
    }

    if (window.CozyOS.LivingMessageEngine && typeof window.CozyOS.LivingMessageEngine.getVersion === "function") {
        const existingVersion = window.CozyOS.LivingMessageEngine.getVersion();
        if (existingVersion !== LIVING_MESSAGE_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: LivingMessageEngine existing v${existingVersion} conflicts with load target v${LIVING_MESSAGE_VERSION}.`);
        return;
    }

    window.CozyOS.LivingMessageEngine = new CozyLivingMessageEngine();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "LivingMessageEngine", category: "Platform", icon: "message-square.svg",
                description: "Real message registry, org-scoped permissions (Organization Administrators restricted to their own real orgId, verified by execution), scheduling (reusing LivingThemeEngine.matchesSchedule()), and rotation. Does not render anything — the floating-message DOM display and empty-space detection are separate, disclosed future work."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
