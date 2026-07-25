/**
 * ── CozyOS WORKFLOW ENGINE (RUNTIME) ──
 * FILE: core/modules/automation/cozy-workflow-runtime.js
 * VERSION: 1.0.0-ENTERPRISE
 * MILESTONE: 152
 *
 * This is not BPM software. This is the internal automation runtime for
 * CozyOS: execution, queueing, state, variables, history, and a local-only
 * scheduler tick, built on top of definitions that already have a canonical
 * owner (see Ownership Review below). It does not implement the actions it
 * dispatches — those are registry slots a real integration fills in.
 *
 * RULE 00/0 — REPOSITORY VERSION & VERIFICATION
 *   This file requires window.CozyOS.CozyAutomation (core/modules/automation/
 *   cozy-automation.js) to already be loaded. It reads that engine's
 *   getVersion() at init and refuses to attach if the dependency is missing
 *   — fail closed, no parallel definition store is created as a fallback.
 *
 * OWNERSHIP REVIEW (performed before writing this file)
 *   Canonical owner found for workflow/trigger/action/condition/schedule
 *   DEFINITIONS: window.CozyOS.CozyAutomation. It already exposes
 *   `.workflow`, `.trigger`, `.action`, `.condition`, `.schedule` CRUD
 *   registries (create/read/update/delete/list/get/has/count) plus its own
 *   session lifecycle (CREATED/ACTIVE/PAUSED/STOPPED/ENDED/ARCHIVED — an
 *   *automation session* concept, not a single workflow run). This file
 *   NEVER re-registers workflow/trigger/action/condition/schedule
 *   definitions — it only reads them via CozyAutomation's own registry
 *   interface and adds what did not exist anywhere in the repository:
 *   real execution, a real queue, per-run state, per-run variables,
 *   history, and a local scheduler tick.
 *
 *   core/scheduler.js was checked and is already documented elsewhere in
 *   this codebase (core/platform/content-presentation-engine.js) as a
 *   dormant, unused ES-module utility — not extended here, since wiring an
 *   unused module in as a side effect of this milestone is out of scope;
 *   noted as a Known Gap below instead.
 *
 * WHAT THIS FILE DOES NOT OWN (Zero Duplication Rule)
 *   Identity, Authentication, AI, Speech, Translation, Notifications,
 *   Media, Vision, Firebase — all consumed by reference, never
 *   implemented here.
 *
 * ACTION DISPATCH — ZERO FABRICATION RULE
 *   registerActionHandler() is the only way an action type actually does
 *   anything. Exactly one default handler ships wired in: "call_ai",
 *   because window.CozyOS.AI.platform (Milestone 151) is a real, already-
 *   built dependency. Every other action type (run_module,
 *   send_notification, update_data, execute_service, execute_script,
 *   call_adapter) ships with NO handler and fails closed with
 *   "no_handler_registered" — this file makes no network calls, sends no
 *   real notifications, and executes no scripts itself, ever. This mirrors
 *   core/modules/aimode/cozy-ai-mode.js's own provider-adapter convention.
 *
 * RUNTIME RULES
 *   Fail closed. No fabricated schedulers — startScheduler() runs a real
 *   local setInterval tick only; it does not persist across reload, run
 *   when the tab is closed, or claim to be a cloud/cron scheduler anywhere
 *   in its naming or docs. The queue reports real status only — an
 *   execution is never marked "completed" unless every dispatched action
 *   actually returned (successfully or with a recorded failure).
 */

(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0-ENTERPRISE";

    const EXECUTION_STATES = Object.freeze(["pending", "running", "waiting", "completed", "failed", "cancelled"]);
    const EXECUTION_TRANSITIONS = Object.freeze({
        pending:   ["running", "waiting", "cancelled"],
        running:   ["waiting", "completed", "failed", "cancelled"],
        waiting:   ["running", "cancelled", "failed"],
        completed: [],
        failed:    [],
        cancelled: [],
    });

    const WORKFLOW_TYPES = Object.freeze(["user", "system", "approval", "business", "background", "scheduled", "event"]);
    const TRIGGER_TYPES  = Object.freeze(["manual", "event", "time", "application", "ai", "security", "notification"]);
    const ACTION_TYPES   = Object.freeze(["run_module", "call_ai", "send_notification", "update_data", "execute_service", "execute_script", "call_adapter"]);
    const HEALTH_STATES  = Object.freeze(["ready", "loading", "degraded", "error", "offline"]);

    function safeId(prefix) {
        try {
            if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return `${prefix}_${crypto.randomUUID()}`;
        } catch (_) { /* fall through */ }
        return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    }

    /** Resolves "$.varName" against a variable bag; anything else is a literal. */
    function resolveOperand(operand, variables) {
        if (typeof operand === "string" && operand.startsWith("$.")) {
            return variables ? variables[operand.slice(2)] : undefined;
        }
        return operand;
    }

    function compare(left, operator, right) {
        switch (operator) {
            case "eq":       return left === right;
            case "neq":      return left !== right;
            case "gt":       return left > right;
            case "gte":      return left >= right;
            case "lt":       return left < right;
            case "lte":      return left <= right;
            case "exists":   return left !== undefined && left !== null;
            case "contains": return Array.isArray(left) ? left.includes(right) : String(left ?? "").includes(String(right));
            default:         return false;
        }
    }

    class CozyWorkflowRuntime {
        constructor(automationKernel) {
            this.automation = automationKernel; // canonical definitions owner — consumed, never duplicated
            this.version = VERSION;

            this._executions = new Map();
            this._queue = [];
            this._queueRunning = false;
            this._history = [];
            this._maxHistory = 2000;

            this._actionHandlers = new Map();
            this._schedulerTimer = null;
            this._schedulerRunning = false;

            this._listeners = new Map();
            this._health = { state: "loading", lastError: null, updatedAt: new Date().toISOString() };

            this._registerDefaultActionHandlers();
            this._setHealth("ready");
        }

        // ── Lifecycle / manifest contract (matches cozy-ai-integration.js's
        //    ENGINE_LIFECYCLE_METHODS convention, for optional bus registration) ──

        getVersion() { return this.version; }

        getManifest() {
            return { name: "workflowRuntime", version: this.version, capabilities: this.getCapabilities(), dependencies: ["CozyAutomation"], author: "CozyOS Core" };
        }

        getCapabilities() {
            return ["workflow.execution", "workflow.queue", "workflow.variables", "workflow.history", "workflow.scheduler.local"];
        }

        getHealth() { return { ...this._health }; }

        // ── RL-014 Platform Inspection Contract (Milestone 173, additive only) ──
        /** @returns {string} stable identifier — matches getManifest().name. */
        getId() { return "workflowRuntime"; }
        /** @returns {string} human-readable name — matches the ServiceRegistry catalog entry ("Cozy Workflow Engine"). */
        getName() { return "Cozy Workflow Engine"; }
        /** @returns {string[]} delegates to the existing getManifest() contract rather than duplicating dependency logic. */
        getDependencies() { return this.getManifest().dependencies; }

        _setHealth(state, error) {
            if (!HEALTH_STATES.includes(state)) return;
            this._health = { state, lastError: error ? String(error.message || error).slice(0, 256) : null, updatedAt: new Date().toISOString() };
            this._emit("health.changed", this.getHealth());
        }

        async evaluate(input) {
            const capability = input && input.capability;
            if (!capability) return { evaluated: false, reason: "no_capability_specified" };
            return { evaluated: true, capability, supported: this.getCapabilities().includes(capability) };
        }

        // ── Events ───────────────────────────────────────────────────────────────

        on(event, handler) {
            if (typeof event !== "string" || !event.trim()) throw new TypeError("[Cozy Workflow Runtime] on(): eventName required.");
            if (typeof handler !== "function") throw new TypeError("[Cozy Workflow Runtime] on(): handler required.");
            if (!this._listeners.has(event)) this._listeners.set(event, new Set());
            this._listeners.get(event).add(handler);
            return () => this.off(event, handler);
        }

        off(event, handler) {
            const set = this._listeners.get(event);
            if (!set) return false;
            const removed = set.delete(handler);
            if (set.size === 0) this._listeners.delete(event);
            return removed;
        }

        _emit(event, payload) {
            const set = this._listeners.get(event);
            if (!set || set.size === 0) return;
            for (const fn of Array.from(set)) {
                try { fn(payload); } catch (_err) { /* listener errors never break runtime state */ }
            }
        }

        // ── Definition access (delegated to CozyAutomation — never duplicated) ────

        getWorkflowDefinition(id)  { return this.automation.workflow.get(id); }
        listWorkflowDefinitions(p) { return this.automation.workflow.list(p); }
        getTriggerDefinition(id)   { return this.automation.trigger.get(id); }
        getConditionDefinition(id) { return this.automation.condition.get(id); }
        getActionDefinition(id)    { return this.automation.action.get(id); }
        getScheduleDefinition(id)  { return this.automation.schedule.get(id); }
        listSchedules(p)           { return this.automation.schedule.list(p); }

        // ── AI Action Handler Registry (registry + pluggable; fail-closed default) ──

        registerActionHandler(actionType, handlerFn) {
            if (!ACTION_TYPES.includes(actionType)) throw new TypeError(`[Cozy Workflow Runtime] registerActionHandler(): actionType must be one of ${ACTION_TYPES.join(", ")}.`);
            if (typeof handlerFn !== "function") throw new TypeError("[Cozy Workflow Runtime] registerActionHandler(): handlerFn must be a function.");
            this._actionHandlers.set(actionType, handlerFn);
            this._emit("actionHandler.registered", { actionType });
            return true;
        }

        unregisterActionHandler(actionType) { return this._actionHandlers.delete(actionType); }
        hasActionHandler(actionType) { return this._actionHandlers.has(actionType); }
        listActionHandlers() { return Array.from(this._actionHandlers.keys()); }

        _registerDefaultActionHandlers() {
            // The one real default: delegates to the already-built AI Engine
            // Platform (Milestone 151). Fails closed honestly if that platform
            // or an active provider isn't present — never fabricates a reply.
            this.registerActionHandler("call_ai", async (config = {}) => {
                const platform = window.CozyOS.AI && window.CozyOS.AI.platform;
                if (!platform || typeof platform.submitRequest !== "function") {
                    return { status: "unavailable", reason: "AI platform not loaded" };
                }
                return platform.submitRequest({ task: config.task || "workflow-call-ai", payload: config.payload || {} });
            });
            // run_module, send_notification, update_data, execute_service,
            // execute_script, call_adapter: intentionally unregistered. See the
            // "ACTION DISPATCH — ZERO FABRICATION RULE" header note.
        }

        // ── Workflow Variables ──────────────────────────────────────────────────────

        getVariables(executionId) {
            const execution = this._executions.get(executionId);
            return execution ? { ...execution.variables } : null;
        }

        setVariable(executionId, key, value) {
            const execution = this._executions.get(executionId);
            if (!execution) throw new Error(`[Cozy Workflow Runtime] setVariable(): unknown execution "${executionId}".`);
            execution.variables[key] = value;
            return { ...execution.variables };
        }

        setVariables(executionId, patch = {}) {
            const execution = this._executions.get(executionId);
            if (!execution) throw new Error(`[Cozy Workflow Runtime] setVariables(): unknown execution "${executionId}".`);
            execution.variables = { ...execution.variables, ...patch };
            return { ...execution.variables };
        }

        // ── Workflow Conditions (safe {left, operator, right} shape — no eval) ─────

        evaluateCondition(conditionId, variables = {}) {
            const def = this.getConditionDefinition(conditionId);
            if (!def) return { evaluated: false, result: false, reason: "condition_not_found" };
            const left  = resolveOperand(def.left, variables);
            const right = resolveOperand(def.right, variables);
            return { evaluated: true, result: compare(left, def.operator, right) };
        }

        // ── Execution lifecycle ─────────────────────────────────────────────────────

        /**
         * createExecution()
         *   type "approval" starts in "waiting" with awaitingApproval:true and is
         *   never auto-enqueued — approveExecution() is required to proceed,
         *   matching the "Approval Workflow" type honestly rather than treating
         *   it the same as every other run.
         */
        createExecution({ workflowId, type = "user", triggeredBy = "manual", variables = {} } = {}) {
            const def = this.getWorkflowDefinition(workflowId);
            if (!def) throw new Error(`[Cozy Workflow Runtime] createExecution(): unknown workflow definition "${workflowId}".`);
            if (!WORKFLOW_TYPES.includes(type)) throw new TypeError(`[Cozy Workflow Runtime] createExecution(): type must be one of ${WORKFLOW_TYPES.join(", ")}.`);

            const requiresApproval = type === "approval";
            const executionId = safeId("wfrun");
            const execution = {
                id: executionId,
                workflowId,
                type,
                triggeredBy,
                state: requiresApproval ? "waiting" : "pending",
                awaitingApproval: requiresApproval,
                variables: { ...variables },
                steps: [],
                createdAt: new Date().toISOString(),
                startedAt: null,
                endedAt: null,
                error: null,
            };
            this._executions.set(executionId, execution);
            this._emit("execution.created", { executionId, workflowId, type });
            return this._cloneExecution(execution);
        }

        getExecution(executionId) {
            const execution = this._executions.get(executionId);
            return execution ? this._cloneExecution(execution) : null;
        }

        listExecutions(predicate) {
            const all = Array.from(this._executions.values()).map(e => this._cloneExecution(e));
            return typeof predicate === "function" ? all.filter(predicate) : all;
        }

        _cloneExecution(execution) {
            return { ...execution, variables: { ...execution.variables }, steps: [...execution.steps] };
        }

        transitionExecutionState(executionId, targetState) {
            const execution = this._executions.get(executionId);
            if (!execution) throw new Error(`[Cozy Workflow Runtime] transitionExecutionState(): unknown execution "${executionId}".`);
            if (!EXECUTION_STATES.includes(targetState)) throw new TypeError(`[Cozy Workflow Runtime] transitionExecutionState(): invalid state "${targetState}".`);
            const allowed = EXECUTION_TRANSITIONS[execution.state] || [];
            if (!allowed.includes(targetState)) {
                throw new Error(`[Cozy Workflow Runtime] transitionExecutionState(): "${execution.state}" -> "${targetState}" is not a permitted transition.`);
            }
            execution.state = targetState;
            this._emit("execution.stateChanged", { executionId, state: targetState });
            return this._cloneExecution(execution);
        }

        cancelExecution(executionId) {
            const execution = this._executions.get(executionId);
            if (!execution) return false;
            if (!(EXECUTION_TRANSITIONS[execution.state] || []).includes("cancelled")) return false;
            execution.state = "cancelled";
            execution.endedAt = new Date().toISOString();
            this._appendHistory(execution);
            this._emit("execution.cancelled", { executionId });
            return true;
        }

        // ── Approval Workflow support ────────────────────────────────────────────────

        approveExecution(executionId) {
            const execution = this._executions.get(executionId);
            if (!execution) throw new Error(`[Cozy Workflow Runtime] approveExecution(): unknown execution "${executionId}".`);
            if (!execution.awaitingApproval) throw new Error(`[Cozy Workflow Runtime] approveExecution(): "${executionId}" is not awaiting approval.`);
            execution.awaitingApproval = false;
            execution.state = "pending";
            this._emit("execution.approved", { executionId });
            this.enqueueExecution(executionId);
            return this._cloneExecution(execution);
        }

        rejectExecution(executionId, reason = null) {
            const execution = this._executions.get(executionId);
            if (!execution) throw new Error(`[Cozy Workflow Runtime] rejectExecution(): unknown execution "${executionId}".`);
            if (!execution.awaitingApproval) throw new Error(`[Cozy Workflow Runtime] rejectExecution(): "${executionId}" is not awaiting approval.`);
            execution.awaitingApproval = false;
            execution.state = "cancelled";
            execution.error = reason ? `rejected: ${String(reason).slice(0, 256)}` : "rejected";
            execution.endedAt = new Date().toISOString();
            this._appendHistory(execution);
            this._emit("execution.rejected", { executionId, reason });
            return this._cloneExecution(execution);
        }

        // ── Workflow Queue ───────────────────────────────────────────────────────────

        enqueueExecution(executionId) {
            const execution = this._executions.get(executionId);
            if (!execution) throw new Error(`[Cozy Workflow Runtime] enqueueExecution(): unknown execution "${executionId}".`);
            if (execution.awaitingApproval) throw new Error(`[Cozy Workflow Runtime] enqueueExecution(): "${executionId}" is awaiting approval.`);
            this._queue.push(executionId);
            this._emit("queue.enqueued", { executionId, depth: this._queue.length });
            return this._processQueue();
        }

        getQueueDepth() { return this._queue.length; }

        async _processQueue() {
            if (this._queueRunning) return null;
            this._queueRunning = true;
            let lastResult = null;
            try {
                while (this._queue.length > 0) {
                    const executionId = this._queue.shift();
                    lastResult = await this._runExecution(executionId);
                }
            } finally {
                this._queueRunning = false;
            }
            return lastResult;
        }

        async _runExecution(executionId) {
            const execution = this._executions.get(executionId);
            if (!execution) return { executionId, status: "unknown_execution" };

            const def = this.getWorkflowDefinition(execution.workflowId);
            if (!def) {
                execution.state = "failed";
                execution.error = "workflow_definition_missing";
                execution.endedAt = new Date().toISOString();
                this._appendHistory(execution);
                this._setHealth("degraded");
                return { executionId, status: "failed", reason: execution.error };
            }

            execution.state = "running";
            execution.startedAt = new Date().toISOString();
            this._emit("execution.started", { executionId });

            const actionRefs = Array.isArray(def.actions) ? def.actions : [];

            try {
                for (const ref of actionRefs) {
                    if (ref.conditionId) {
                        const gate = this.evaluateCondition(ref.conditionId, execution.variables);
                        if (!gate.result) {
                            execution.steps.push({ actionId: ref.actionId, status: "skipped", reason: "condition_not_met", at: new Date().toISOString() });
                            continue;
                        }
                    }

                    const actionDef = this.getActionDefinition(ref.actionId);
                    const actionType = actionDef ? actionDef.type : ref.type;

                    if (!actionType || !ACTION_TYPES.includes(actionType)) {
                        execution.steps.push({ actionId: ref.actionId, status: "failed", reason: "unknown_action_type", at: new Date().toISOString() });
                        continue;
                    }

                    const handler = this._actionHandlers.get(actionType);
                    if (!handler) {
                        execution.steps.push({ actionId: ref.actionId, type: actionType, status: "no_handler_registered", at: new Date().toISOString() });
                        continue;
                    }

                    const config = (actionDef && actionDef.config) || ref.config || {};
                    const result = await handler(config, { executionId, variables: execution.variables });
                    execution.steps.push({ actionId: ref.actionId, type: actionType, status: "dispatched", result, at: new Date().toISOString() });
                }

                execution.state = "completed";
                execution.endedAt = new Date().toISOString();
                this._appendHistory(execution);
                this._setHealth("ready");
                this._emit("execution.completed", { executionId });
                return { executionId, status: "completed" };

            } catch (err) {
                execution.state = "failed";
                execution.error = String(err.message || err).slice(0, 256);
                execution.endedAt = new Date().toISOString();
                this._appendHistory(execution);
                this._setHealth("error", err);
                this._emit("execution.failed", { executionId, error: execution.error });
                return { executionId, status: "failed", reason: execution.error };
            }
        }

        // ── Workflow History (append-only) ──────────────────────────────────────────

        _appendHistory(execution) {
            this._history.push({
                executionId: execution.id, workflowId: execution.workflowId, type: execution.type,
                finalState: execution.state, startedAt: execution.startedAt, endedAt: execution.endedAt, error: execution.error,
            });
            if (this._history.length > this._maxHistory) this._history.shift();
        }

        getHistory(predicate) {
            return typeof predicate === "function" ? this._history.filter(predicate) : [...this._history];
        }

        // ── Triggers ─────────────────────────────────────────────────────────────────

        /** Direct convenience path for the "Manual" trigger — no trigger definition required. */
        fireManualTrigger(workflowId, variables = {}) {
            const execution = this.createExecution({ workflowId, triggeredBy: "manual", variables });
            if (!execution.awaitingApproval) this.enqueueExecution(execution.id);
            return execution;
        }

        /** Fires a registered trigger definition (event/time/application/ai/security/notification). */
        fireTrigger(triggerId, variables = {}) {
            const def = this.getTriggerDefinition(triggerId);
            if (!def) throw new Error(`[Cozy Workflow Runtime] fireTrigger(): unknown trigger definition "${triggerId}".`);
            if (!TRIGGER_TYPES.includes(def.type)) throw new TypeError(`[Cozy Workflow Runtime] fireTrigger(): trigger "${triggerId}" has invalid type "${def.type}".`);
            if (!def.workflowId) throw new Error(`[Cozy Workflow Runtime] fireTrigger(): trigger "${triggerId}" has no workflowId configured.`);
            const execution = this.createExecution({ workflowId: def.workflowId, triggeredBy: `trigger:${triggerId}`, variables });
            if (!execution.awaitingApproval) this.enqueueExecution(execution.id);
            return execution;
        }

        // ── Scheduler (LOCAL ONLY) ───────────────────────────────────────────────────

        /**
         * startScheduler()
         *   Real local setInterval tick — nothing more. Reads schedule
         *   definitions from CozyAutomation's "schedule" registry, each expected
         *   to carry { workflowId, everyMs, lastRunAt }. This is deliberately not
         *   a cron parser and does not run once the tab/process is closed —
         *   named and documented as local-only everywhere it appears.
         */
        startScheduler({ tickMs = 30000 } = {}) {
            if (this._schedulerRunning) return false;
            this._schedulerTimer = setInterval(() => this._tickScheduler(), tickMs);
            this._schedulerRunning = true;
            this._emit("scheduler.started", { tickMs });
            return true;
        }

        stopScheduler() {
            if (!this._schedulerRunning) return false;
            clearInterval(this._schedulerTimer);
            this._schedulerTimer = null;
            this._schedulerRunning = false;
            this._emit("scheduler.stopped", {});
            return true;
        }

        isSchedulerRunning() { return this._schedulerRunning; }

        _tickScheduler() {
            const now = Date.now();
            let schedules;
            try {
                schedules = this.listSchedules();
            } catch (err) {
                this._setHealth("error", err);
                return;
            }
            for (const schedule of schedules) {
                if (!schedule.workflowId || !Number.isFinite(schedule.everyMs)) continue;
                const lastRun = schedule.lastRunAt ? Date.parse(schedule.lastRunAt) : 0;
                if (now - lastRun < schedule.everyMs) continue;
                try {
                    const execution = this.createExecution({ workflowId: schedule.workflowId, type: "scheduled", triggeredBy: `schedule:${schedule.id}` });
                    this.enqueueExecution(execution.id);
                    this.automation.schedule.update(schedule.id, { lastRunAt: new Date().toISOString() });
                } catch (err) {
                    this._emit("scheduler.tickError", { scheduleId: schedule.id, error: String(err.message || err).slice(0, 256) });
                }
            }
        }
    }

    // ── GLOBAL INITIALIZATION ────────────────────────────────────────────────────
    // Extends CozyAutomation's definitions rather than creating a parallel store.
    if (window.CozyOS.CozyAutomation) {
        const runtime = new CozyWorkflowRuntime(window.CozyOS.CozyAutomation);
        window.CozyOS.WorkflowEngine = runtime;

        // Optional: register with the AI integration bus for capability
        // discovery/health polling, same convention as core/ai/cozy-ai-platform.js.
        if (window.CozyOS.AI && window.CozyOS.AI.integration && typeof window.CozyOS.AI.integration.registerEngine === "function") {
            window.CozyOS.AI.integration.registerEngine("workflowRuntime", runtime, runtime.getCapabilities(), { priority: 100 })
                .catch(err => console.warn("[Cozy Workflow Engine] registerEngine() with integration bus failed:", err.message));
        }

        // Optional: catalog entry in ServiceRegistry, same convention cozy-automation.js uses.
        try {
            if (typeof window.CozyOS.registerCoordinator === "function") {
                window.CozyOS.registerCoordinator({
                    name: "Cozy Workflow Engine",
                    key: "WorkflowEngine",
                    category: "platform",
                    description: "Internal automation runtime — execution, queue, state, variables, history, and a local scheduler tick over CozyAutomation's workflow/trigger/action/condition/schedule definitions.",
                });
            }
        } catch (_err) { /* non-fatal — cataloguing is descriptive only */ }
    } else {
        console.error("[Cozy Workflow Engine] window.CozyOS.CozyAutomation is not loaded. Runtime cannot attach — load order dependency unmet. No fallback registry was created (fail closed).");
    }
})();
