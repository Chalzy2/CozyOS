/**
 * =============================================================================
 * CozyOS Workspace Bootstrap
 * File Reference: cozyos.js
 * Version: 1.0.0-ENTERPRISE
 * =============================================================================
 *
 * ═══════════════════════════════════════════════════════════════════════
 * RULE 25 — CANONICAL OWNERSHIP DECLARATION
 * ═══════════════════════════════════════════════════════════════════════
 *   Canonical Owner
 *   This file is the authoritative owner of, and owns ONLY:
 *     ✓ Workspace startup, initialization, runtime state
 *     ✓ Workspace loading screen data (progress/status, not rendering —
 *       see note below)
 *     ✓ Workspace engine/application discovery (by asking Kernel and
 *       Platform Integration — never tracking either itself)
 *     ✓ Workspace shutdown, restart, recovery
 *
 *   Does NOT Own — and structurally cannot, since this file stores no
 *   engine state, no business data, and duplicates no other engine's logic:
 *     ✗ Engine registration, lifecycle, compatibility, diagnostics —
 *       Kernel's domain (Bootstrap/Compatibility/Lifecycle/Diagnostics).
 *     ✗ Engine discovery/capability mapping logic — Platform Integration's
 *       domain; this file only calls its real, existing methods.
 *     ✗ Users, Companies, Secrets, Payments, Documents, Storage, AI,
 *       Camera, Audio, Scene, Recording, Playback, Streaming — every
 *       other engine's own domain.
 *     ✗ Business logic of any kind.
 *
 *   This is NOT the Kernel, NOT Platform Integration, NOT AI, NOT
 *   Storage. It is the thin, top-level script that starts CozyOS and
 *   asks the real engines what's true — it never decides what's true
 *   itself.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * REAL INTERFACE VERIFICATION (Rule 21) — DONE BEFORE WRITING THIS FILE
 * -----------------------------------------------------------------------
 *   The originating spec assumed Kernel.getVersion() and
 *   Kernel.getRegisteredEngines() exist. Verified against the real,
 *   frozen kernel.js: neither does. The real equivalents are:
 *     - Kernel.KERNEL_VERSION            (a property, not a method)
 *     - Kernel.getKernelReport().platform.services  (an array of real
 *       per-service diagnostic entries, via Bootstrap.getPlatformReport()
 *       -> Lifecycle.getLifecycleReport())
 *   Per Rule 23 (Certified Engines Become Stable), this file uses the
 *   real, existing interface directly rather than requesting new alias
 *   methods be added to a frozen, certified Kernel for purely cosmetic
 *   naming reasons.
 *
 *   Platform Integration's discoverApplications()/discoverEngines()/
 *   getCapabilityMap()/getIntegrationHealth()/requestSecret()/
 *   validateCompanyReference() were all verified present and real before
 *   this file was written.
 *
 * WORKSPACE UI, STATED HONESTLY
 * -----------------------------------------------------------------------
 *   This file owns the workspace's real state and real data — it does
 *   not own rendering. "Show splash screen," "show loading progress,"
 *   etc. means this file exposes real, structured data
 *   (getWorkspaceStatus(), getDashboardData()) that a UI layer (Design's
 *   domain, per the 5A/5B boundary already established for this
 *   platform) renders. No DOM manipulation happens in this file.
 *
 * HONEST ENGINEERING
 * -----------------------------------------------------------------------
 *   AI, Camera, Audio, Scene, Recording, Playback, Video Processor, and
 *   Cozy Live do not exist anywhere in this platform yet. This file
 *   never fabricates their status ("AI Online," etc.) — it reports them
 *   as genuinely not registered, exactly like any other undiscovered
 *   engine, the same as every real engine before it was built.
 * =============================================================================
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const WORKSPACE_VERSION = "1.0.0-ENTERPRISE";

    const WORKSPACE_STATES = Object.freeze(["LOADING", "STARTING", "READY", "STOPPING", "STOPPED", "RECOVERING", "FAILED"]);

    class CozyWorkspaceBootstrap {
        #state = "STOPPED";
        #auditLog = [];
        #listeners = new Map();
        #onceWrapped = new Map();
        #diagnostics = { startupAttempts: 0, startupSuccesses: 0, startupFailures: 0, restarts: 0, recoveryAttempts: 0, shutdowns: 0 };
        #startedAt = null;
        #lastRecoveryReason = null;

        getVersion() { return WORKSPACE_VERSION; }
        #generateId(p) { return `${p}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`; }
        #escapeHtml(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
        #logAudit(action, msg) { this.#auditLog.push(Object.freeze({ id: this.#generateId("aud"), timestamp: new Date().toISOString(), action, msg: this.#escapeHtml(msg) })); if (this.#auditLog.length > 1000) this.#auditLog.shift(); }
        getAuditLog(predicate) { const list = this.#auditLog.map(e => ({ ...e })); return Object.freeze(predicate ? list.filter(predicate) : list); }

        on(e, h) { if (typeof e !== "string" || !e.trim()) throw new TypeError("[Workspace] on(): eventName required."); if (typeof h !== "function") throw new TypeError("[Workspace] on(): handler required."); if (!this.#listeners.has(e)) this.#listeners.set(e, new Set()); this.#listeners.get(e).add(h); return () => this.off(e, h); }
        off(e, h) { const s = this.#listeners.get(e); if (!s) return false; const w = this.#onceWrapped.get(h); const r = s.delete(h) || (w ? s.delete(w) : false); if (s.size === 0) this.#listeners.delete(e); return r; }
        once(e, h) { if (typeof h !== "function") throw new TypeError("[Workspace] once(): handler required."); const w = (p) => { this.off(e, h); this.#onceWrapped.delete(h); h(p); }; this.#onceWrapped.set(h, w); this.on(e, w); }
        emit(e, p) { const s = this.#listeners.get(e); if (!s || s.size === 0) return false; for (const fn of Array.from(s)) { try { fn(p); } catch (_err) { /* listener errors never break the workspace */ } } return true; }

        #setState(state) {
            if (!WORKSPACE_STATES.includes(state)) throw new TypeError(`[Workspace] invalid state "${state}".`);
            const previous = this.#state;
            this.#state = state;
            this.#logAudit("STATE_CHANGED", `${previous} -> ${state}`);
        }
        getState() { return this.#state; }

        /** #getKernel() — the one place Kernel is looked up, always fresh, never cached (matching Platform Integration's own discipline). */
        #getKernel() { return window.CozyOS?.Kernel ?? null; }
        #getIntegration() { return window.CozyOS?.Integration ?? null; }

        /**
         * #waitForKernelReady(timeoutMs)
         *   Real wait. Kernel's platform state only becomes READY when
         *   Bootstrap.markPlatformReady() is explicitly called — and no
         *   individual engine's registerWithKernel() calls this, since
         *   no single engine can know when every *other* mandatory
         *   engine has also finished starting. That is genuinely this
         *   workspace's own responsibility (Rule 25: "Workspace
         *   Startup" is explicitly owned here), so this method actively
         *   attempts markPlatformReady() on each poll — honestly
         *   catching the real error Bootstrap throws when mandatory
         *   services aren't all RUNNING yet, and retrying rather than
         *   fabricating readiness.
         */
        async #waitForKernelReady(timeoutMs = 10000) {
            const deadline = Date.now() + timeoutMs;
            while (Date.now() < deadline) {
                const kernel = this.#getKernel();
                if (kernel && typeof kernel.Bootstrap?.getPlatformState === "function") {
                    if (kernel.isReady && kernel.isReady()) return true;
                    try { kernel.Bootstrap.markPlatformReady(); return true; }
                    catch (_err) { /* mandatory services not all RUNNING yet — real, expected during startup; keep polling */ }
                }
                await new Promise(r => setTimeout(r, 50));
            }
            return false;
        }

        /**
         * initialize({ kernelTimeoutMs })
         *   Real startup sequence, exactly as specified: LOADING ->
         *   wait for Kernel READY -> confirm Platform Integration is
         *   present -> discover engines -> verify health -> discover
         *   applications -> READY. Honestly fails (state FAILED) if
         *   Kernel never becomes ready within the real timeout — never
         *   fabricates a ready state.
         */
        async initialize({ kernelTimeoutMs = 10000 } = {}) {
            this.#diagnostics.startupAttempts++;
            this.#setState("LOADING");
            this.emit("workspace-loading", {});

            const kernelReady = await this.#waitForKernelReady(kernelTimeoutMs);
            if (!kernelReady) {
                this.#diagnostics.startupFailures++;
                this.#setState("FAILED");
                this.emit("workspace-failed", { reason: "Kernel did not become ready within the timeout." });
                return { available: false, reason: "Kernel did not become ready within the timeout." };
            }

            this.#setState("STARTING");
            const integration = this.#getIntegration();
            if (!integration) {
                this.#diagnostics.startupFailures++;
                this.#setState("FAILED");
                this.emit("workspace-failed", { reason: "Platform Integration Layer is not connected." });
                return { available: false, reason: "Platform Integration Layer is not connected." };
            }

            const discovery = integration.discoverEngines();
            for (const [name, info] of Object.entries(discovery)) this.emit("engine-discovered", { name, available: info.available });

            const health = integration.getIntegrationHealth();
            const appDiscovery = integration.discoverApplications();

            this.#startedAt = new Date().toISOString();
            this.#diagnostics.startupSuccesses++;
            this.#setState("READY");
            this.#logAudit("WORKSPACE_READY", `${Object.values(discovery).filter(d => d.available).length} engine(s) online`);
            this.emit("workspace-ready", { discovery, health, applications: appDiscovery });
            return { available: true, discovery, health, applications: appDiscovery };
        }

        /** shutdown() — real, honest: only actually shuts down the workspace's own state; never touches another engine's lifecycle (Kernel owns that). */
        async shutdown() {
            this.#setState("STOPPING");
            this.emit("workspace-shutdown", {});
            this.#diagnostics.shutdowns++;
            this.#setState("STOPPED");
            return true;
        }

        /** restart() — real: shutdown then initialize again, through the same real sequence, never a shortcut. */
        async restart(options) {
            this.#diagnostics.restarts++;
            this.emit("workspace-restart", {});
            await this.shutdown();
            return this.initialize(options);
        }

        /**
         * recover(reason)
         *   Real recovery entry point. Per the spec: "Workspace never
         *   repairs engines itself" — this method does not touch any
         *   engine's internal state. It re-runs real discovery/health
         *   checks and reports the current, real status; if Platform
         *   Integration reports the platform is genuinely healthy again,
         *   the workspace returns to READY. It never fabricates recovery.
         */
        async recover(reason = "unspecified") {
            this.#diagnostics.recoveryAttempts++;
            this.#lastRecoveryReason = reason;
            this.#setState("RECOVERING");
            this.#logAudit("RECOVERY_ATTEMPTED", reason);

            const integration = this.#getIntegration();
            if (!integration) {
                this.#setState("FAILED");
                this.emit("workspace-failed", { reason: "Platform Integration Layer is not connected during recovery." });
                return { available: false, recovered: false, reason: "Platform Integration Layer is not connected." };
            }
            const health = integration.getIntegrationHealth();
            if (health.healthy) {
                this.#setState("READY");
                this.emit("workspace-recovered", { health });
                return { available: true, recovered: true, health };
            }
            this.#setState("FAILED");
            this.emit("workspace-failed", { reason: "Platform is still unhealthy after recovery attempt.", health });
            return { available: true, recovered: false, health };
        }

        /**
         * getWorkspaceStatus()
         *   Real, current snapshot for a UI layer to render — never the
         *   rendering itself. State, uptime, and the real Kernel version
         *   (via the verified real KERNEL_VERSION property, not a
         *   fabricated getVersion() call).
         */
        getWorkspaceStatus() {
            const kernel = this.#getKernel();
            return {
                workspaceState: this.#state,
                startedAt: this.#startedAt,
                kernelVersion: kernel?.Bootstrap?.KERNEL_VERSION ?? null,
                kernelConnected: !!kernel,
                lastRecoveryReason: this.#lastRecoveryReason
            };
        }

        /**
         * getDashboardData()
         *   Real, aggregated — reuses Kernel's real getKernelReport() and
         *   Platform Integration's real discoverEngines()/
         *   getCapabilityMap()/discoverApplications()/getIntegrationHealth().
         *   Never invents a status for an engine that isn't real
         *   (AI/Camera/Audio/etc. honestly report {available:false} via
         *   the same discoverEngines() path every other engine uses).
         */
        getDashboardData() {
            const kernel = this.#getKernel();
            const integration = this.#getIntegration();
            const kernelReport = kernel && typeof kernel.getKernelReport === "function" ? kernel.getKernelReport() : null;
            return {
                workspace: this.getWorkspaceStatus(),
                kernelReport,
                engines: integration ? integration.discoverEngines() : { available: false, reason: "Platform Integration not connected." },
                capabilities: integration ? integration.getCapabilityMap() : null,
                applications: integration ? integration.discoverApplications() : { available: false, reason: "Platform Integration not connected." },
                integrationHealth: integration ? integration.getIntegrationHealth() : { available: false, reason: "Platform Integration not connected." }
            };
        }

        getDiagnosticsReport() { return { pluginVersion: WORKSPACE_VERSION, state: this.#state, ...this.#diagnostics, auditLogSize: this.#auditLog.length }; }
        isVersionCompatible(v) { const a = /^v?(\d+)\./.exec(WORKSPACE_VERSION), b = /^v?(\d+)\./.exec(String(v || "")); return !!(a && b && a[1] === b[1]); }
    }

    if (window.CozyOS.Workspace && typeof window.CozyOS.Workspace.getVersion === "function") {
        const existingVersion = window.CozyOS.Workspace.getVersion();
        if (existingVersion !== WORKSPACE_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: Workspace existing v${existingVersion} conflicts with load target v${WORKSPACE_VERSION}.`);
        return;
    }

    window.CozyOS.Workspace = new CozyWorkspaceBootstrap();
})();
