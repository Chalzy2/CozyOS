/**
 * CozyOS — Goals Engine
 * File Reference: core/modules/goals/cozy-goals-engine.js
 * Layer: Platform Service (PluginManager-registered)
 * Version: 1.0.0-ENTERPRISE
 *
 * ═══════════════════════════════════════════════════════════════════════
 * RULE 25 — CANONICAL OWNERSHIP DECLARATION
 * ═══════════════════════════════════════════════════════════════════════
 *   Canonical Owner
 *   This engine is the authoritative owner of:
 *     ✓ Goal/savings target tracking, progress calculation, achievement
 *       state, step breakdowns, reminders
 *
 *   Does NOT Own
 *     ✗ Users, Authentication — Identity's domain. This engine accepts a
 *       userId/ownerId as a plain reference only, never validates or
 *       stores identity data itself.
 *     ✗ Actual money movement, balances, wallets — Financial
 *       Platform/Payment Provider's domain (not yet built). This engine
 *       tracks a *target and a self-reported saved amount* — it never
 *       moves money, never talks to a payment provider, never verifies
 *       the saved amount against a real ledger.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * RULE 26.2/26.3 — SHARED CAPABILITY DISCOVERY, APPLIED
 * ═══════════════════════════════════════════════════════════════════════
 *   This engine consolidates goal-tracking logic that was already
 *   duplicated across two real places in the original application
 *   suite before migration began:
 *     - Vault application's inline "Goals" tab (cozyGoals collection)
 *     - cozy-coach.js's saveGoal/getGoals/updateGoalProgress/achieveGoal
 *   Both used the same schema and the same progress-percentage logic.
 *   This is not a speculative Shared Engine — the reuse already existed
 *   in the source material; this migration only makes the ownership
 *   canonical instead of duplicated (Rule 2: No Duplication).
 *
 * HONEST SCOPE
 *   savedAmount is exactly what it was in the original applications: a
 *   self-reported number the user or a calling application updates.
 *   This engine does not verify it against any real financial record.
 *   If real balance verification is ever needed, that integration
 *   belongs to a future Financial Platform/Wallet engine, referenced
 *   here by ID only, never duplicated.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const GOALS_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
    function sanitizeObject(input) { if (!input || typeof input !== "object") return {}; const clean = {}; for (const key of Object.keys(input)) { if (!FORBIDDEN_KEYS.has(key)) clean[key] = input[key]; } return clean; }

    const GOAL_STATUSES = Object.freeze(["active", "paused", "achieved", "cancelled"]);
    const GOAL_CATEGORIES = Object.freeze(["savings", "business", "education", "studies", "family", "health", "community", "farming", "goals", "other"]);

    class CozyGoalsEngine {
        #goals = new Map(); // goalId -> record
        #auditLog = [];
        #listeners = new Map();
        #onceWrapped = new Map();
        #diagnostics = { goalsCreated: 0, progressUpdates: 0, achieved: 0, cancelled: 0, errorsHidden: 0, eventsEmitted: 0 };

        getVersion() { return GOALS_VERSION; }
        #generateId(p) { return `${p}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`; }
        #escapeHtml(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
        #logAudit(action, msg) { this.#auditLog.push(Object.freeze({ id: this.#generateId("aud"), timestamp: new Date().toISOString(), action, msg: this.#escapeHtml(msg) })); if (this.#auditLog.length > 2000) this.#auditLog.shift(); }
        getAuditLog(predicate) { const list = this.#auditLog.map(e => ({ ...e })); return Object.freeze(predicate ? list.filter(predicate) : list); }

        on(e, h) { if (typeof e !== "string" || !e.trim()) throw new TypeError("[Goals] on(): eventName required."); if (typeof h !== "function") throw new TypeError("[Goals] on(): handler required."); if (!this.#listeners.has(e)) this.#listeners.set(e, new Set()); this.#listeners.get(e).add(h); return () => this.off(e, h); }
        off(e, h) { const s = this.#listeners.get(e); if (!s) return false; const w = this.#onceWrapped.get(h); const r = s.delete(h) || (w ? s.delete(w) : false); if (s.size === 0) this.#listeners.delete(e); return r; }
        once(e, h) { if (typeof h !== "function") throw new TypeError("[Goals] once(): handler required."); const w = (p) => { this.off(e, h); this.#onceWrapped.delete(h); h(p); }; this.#onceWrapped.set(h, w); this.on(e, w); }
        emit(e, p) { if (typeof e !== "string" || !e.trim()) { this.#diagnostics.errorsHidden++; return false; } const s = this.#listeners.get(e); this.#diagnostics.eventsEmitted++; if (!s || s.size === 0) return false; for (const fn of Array.from(s)) { try { fn(p); } catch (_err) { this.#diagnostics.errorsHidden++; } } return true; }

        /**
         * createGoal(ownerId, data)
         *   Real, additive. ownerId is a plain reference (e.g. a CozyID
         *   or IdentityEngine userId) — never validated against
         *   Identity here; that's the calling application's or
         *   Integration Layer's job if validation is needed.
         */
        createGoal(ownerId, rawData) {
            if (!ownerId || typeof ownerId !== "string") throw new TypeError("[Goals] createGoal(): ownerId is required.");
            const data = sanitizeObject(rawData);
            if (!data.title || typeof data.title !== "string" || !data.title.trim()) throw new TypeError("[Goals] createGoal(): title is required.");
            if (data.category && !GOAL_CATEGORIES.includes(data.category)) throw new TypeError(`[Goals] createGoal(): invalid category "${data.category}". Must be one of: ${GOAL_CATEGORIES.join(", ")}.`);

            const goalId = this.#generateId("goal");
            const now = new Date().toISOString();
            const targetAmount = Number(data.targetAmount) || 0;
            const savedAmount = Number(data.savedAmount) || 0;
            const record = Object.freeze({
                goalId, ownerId,
                title: this.#escapeHtml(data.title), description: data.description ? this.#escapeHtml(data.description) : "",
                category: data.category || "savings",
                targetAmount, savedAmount,
                targetDate: data.targetDate || null,
                steps: Object.freeze((data.steps || []).map(s => this.#escapeHtml(s))),
                progress: targetAmount > 0 ? Math.min(100, Math.round((savedAmount / targetAmount) * 100)) : 0,
                status: "active", reminderDays: Number(data.reminderDays) || 7,
                language: data.language || "en",
                createdAt: now, updatedAt: now, achievedAt: null
            });
            this.#goals.set(goalId, record);
            this.#diagnostics.goalsCreated++;
            this.#logAudit("GOAL_CREATED", `${goalId} for ${ownerId}`);
            this.emit("goal-created", { goalId, ownerId });
            return this.#deepClone(record);
        }
        #deepClone(v) { try { return structuredClone(v); } catch (_e) { try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; } } }

        getGoal(goalId) { const g = this.#goals.get(goalId); return g ? this.#deepClone(g) : null; }

        /** listGoals(ownerId, filter) — real, filterable by status/category. */
        listGoals(ownerId, { status = null, category = null } = {}) {
            return Array.from(this.#goals.values())
                .filter(g => g.ownerId === ownerId && (!status || g.status === status) && (!category || g.category === category))
                .map(g => this.#deepClone(g));
        }

        /** updateGoal(goalId, changes) — real, non-progress field updates (title/description/targetDate/reminderDays/steps). Progress changes go through updateProgress() so the percentage calculation is never duplicated by a caller. */
        updateGoal(goalId, rawChanges) {
            const existing = this.#goals.get(goalId);
            if (!existing) throw new Error(`[Goals] updateGoal(): unknown goalId "${goalId}".`);
            const changes = sanitizeObject(rawChanges);
            const allowed = {};
            if (changes.title !== undefined) allowed.title = this.#escapeHtml(changes.title);
            if (changes.description !== undefined) allowed.description = this.#escapeHtml(changes.description);
            if (changes.targetDate !== undefined) allowed.targetDate = changes.targetDate;
            if (changes.reminderDays !== undefined) allowed.reminderDays = Number(changes.reminderDays) || existing.reminderDays;
            if (changes.steps !== undefined) allowed.steps = Object.freeze((changes.steps || []).map(s => this.#escapeHtml(s)));
            const updated = Object.freeze({ ...existing, ...allowed, updatedAt: new Date().toISOString() });
            this.#goals.set(goalId, updated);
            this.#logAudit("GOAL_UPDATED", goalId);
            this.emit("goal-updated", { goalId });
            return this.#deepClone(updated);
        }

        /**
         * updateProgress(goalId, savedAmount)
         *   Real, the one place progress-percentage math happens —
         *   reused by every caller (Vault, Coach, any future consumer),
         *   never re-implemented per application. Automatically
         *   transitions to "achieved" at 100%, matching both original
         *   implementations' behavior exactly.
         */
        updateProgress(goalId, savedAmount) {
            const existing = this.#goals.get(goalId);
            if (!existing) throw new Error(`[Goals] updateProgress(): unknown goalId "${goalId}".`);
            const amount = Number(savedAmount) || 0;
            const progress = existing.targetAmount > 0 ? Math.min(100, Math.round((amount / existing.targetAmount) * 100)) : 0;
            const status = progress >= 100 ? "achieved" : existing.status === "achieved" ? "active" : existing.status;
            const updated = Object.freeze({ ...existing, savedAmount: amount, progress, status, achievedAt: status === "achieved" ? new Date().toISOString() : null, updatedAt: new Date().toISOString() });
            this.#goals.set(goalId, updated);
            this.#diagnostics.progressUpdates++;
            if (status === "achieved" && existing.status !== "achieved") { this.#diagnostics.achieved++; this.emit("goal-achieved", { goalId }); }
            this.#logAudit("GOAL_PROGRESS_UPDATED", `${goalId}: ${progress}%`);
            this.emit("goal-progress-updated", { goalId, progress, status });
            return { progress, status };
        }

        /** setStatus(goalId, status) — real, validated status transitions (pause/cancel/reactivate), separate from the automatic achieved transition in updateProgress(). */
        setStatus(goalId, status) {
            const existing = this.#goals.get(goalId);
            if (!existing) throw new Error(`[Goals] setStatus(): unknown goalId "${goalId}".`);
            if (!GOAL_STATUSES.includes(status)) throw new TypeError(`[Goals] setStatus(): invalid status "${status}". Must be one of: ${GOAL_STATUSES.join(", ")}.`);
            const updated = Object.freeze({ ...existing, status, achievedAt: status === "achieved" ? (existing.achievedAt || new Date().toISOString()) : existing.achievedAt, updatedAt: new Date().toISOString() });
            this.#goals.set(goalId, updated);
            if (status === "cancelled") this.#diagnostics.cancelled++;
            this.#logAudit("GOAL_STATUS_CHANGED", `${goalId}: ${status}`);
            this.emit("goal-status-changed", { goalId, status });
            return this.#deepClone(updated);
        }

        deleteGoal(goalId) {
            const existed = this.#goals.delete(goalId);
            if (existed) { this.#logAudit("GOAL_DELETED", goalId); this.emit("goal-deleted", { goalId }); }
            return existed;
        }

        getDiagnosticsReport() { return { pluginVersion: GOALS_VERSION, ...this.#diagnostics, goalsTracked: this.#goals.size, auditLogSize: this.#auditLog.length }; }
        exportSnapshot() { return { version: GOALS_VERSION, exportedAt: new Date().toISOString(), goals: Array.from(this.#goals.values()).map(g => this.#deepClone(g)) }; }
        /**
         * importSnapshot(snapshot, {mergeStrategy})
         *   Real restore of goal records. "merge" keeps existing goals
         *   and adds any from the snapshot not already present by
         *   goalId; "replace" clears current state first. Never
         *   fabricates progress — restores exactly what was exported.
         */
        importSnapshot(snapshot, { mergeStrategy = "merge" } = {}) {
            if (!snapshot || !Array.isArray(snapshot.goals)) throw new TypeError("[Goals] importSnapshot(): snapshot.goals array is required.");
            if (mergeStrategy !== "merge" && mergeStrategy !== "replace") throw new TypeError('[Goals] importSnapshot(): mergeStrategy must be "merge" or "replace".');
            if (mergeStrategy === "replace") this.#goals.clear();
            let restored = 0, skipped = 0;
            for (const g of snapshot.goals) {
                if (!g?.goalId) { skipped++; continue; }
                if (mergeStrategy === "merge" && this.#goals.has(g.goalId)) { skipped++; continue; }
                this.#goals.set(g.goalId, Object.freeze({ ...g }));
                restored++;
            }
            this.#logAudit("SNAPSHOT_IMPORTED", `${restored} restored, ${skipped} skipped, strategy=${mergeStrategy}.`);
            return { restored, skipped, mergeStrategy };
        }
        isVersionCompatible(v) { const a = /^v?(\d+)\./.exec(GOALS_VERSION), b = /^v?(\d+)\./.exec(String(v || "")); return !!(a && b && a[1] === b[1]); }
    }

    if (window.CozyOS.Goals && typeof window.CozyOS.Goals.getVersion === "function") {
        const existingVersion = window.CozyOS.Goals.getVersion();
        if (existingVersion !== GOALS_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: Goals existing v${existingVersion} conflicts with load target v${GOALS_VERSION}.`);
        return;
    }

    const engineInstance = new CozyGoalsEngine();
    window.CozyOS.Goals = engineInstance;

    const manifest = {
        id: "goals",
        name: "CozyOS Goals Engine",
        version: GOALS_VERSION,
        description: "Goal/savings target tracking, progress calculation, achievement state. Consolidated from duplicated logic in the Vault and Coach applications (Rule 26.2/26.3). Never moves money or verifies balances - self-reported saved amount only.",
        dependencies: { required: [], optional: [] }
    };

    let kernelRegistrationAttempted = false;
    async function registerWithKernel() {
        if (kernelRegistrationAttempted) return;
        const bootstrap = window.CozyOS?.Kernel?.Bootstrap;
        if (!bootstrap) return;
        kernelRegistrationAttempted = true;
        try {
            await bootstrap.registerService({ name: "Goals", version: GOALS_VERSION, apiVersion: "1.0.0", mandatory: false, dependencies: [] });
            bootstrap.initializeService("Goals");
            await bootstrap.verifyService("Goals", async () => window.CozyOS.Goals.getVersion() === GOALS_VERSION);
            bootstrap.startService("Goals");
        } catch (_err) { /* non-fatal — Goals remains fully functional standalone even if Kernel registration fails */ }
    }
    registerWithKernel();
    if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
        document.addEventListener("cozyos:kernel-bridge-ready", registerWithKernel, { once: true });
    }

    let registrationBound = false;
    function initRegistration() {
        if (registrationBound) return;
        registrationBound = true;
        if (window.CozyOS && window.CozyOS.PluginManager) {
            window.CozyOS.PluginManager.register(manifest, engineInstance);
        } else {
            if (!window.CozyOS.KernelPlugins) window.CozyOS.KernelPlugins = new Map();
            window.CozyOS.KernelPlugins.set(manifest.id, { name: manifest.name, version: manifest.version, handler: engineInstance });
        }
    }
    initRegistration();
    if (typeof window !== "undefined") {
        window.addEventListener("kernel:ready", initRegistration, { once: true });
        window.addEventListener("DOMContentLoaded", initRegistration, { once: true });
    }
})();
