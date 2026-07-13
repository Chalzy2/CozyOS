/**
 * CozyOS Enterprise Framework — CozyDeploymentManager
 * File Reference: core/modules/deployment/deployment-manager.js
 * Version: 1.0.0-ENTERPRISE
 * Layer: Core / Platform Service — Deployment Manager
 *
 * RESPONSIBILITY
 *   Real deployment queue, retry, and release history — built entirely
 *   on top of CozyCertification's real lockRelease()/listReleases() and
 *   WorkspaceShell's real rollbackToBackup(). No release/rollback logic
 *   is duplicated here.
 *
 * HONEST SCOPE
 *   "Offline deployment" means this queue works without a server (it
 *   already does — everything is in-browser). There is no actual
 *   remote deployment target in CozyOS; this manages RELEASE PACKAGING
 *   and QUEUE STATE, not pushing files to a live server anywhere.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const DM_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    class CozyOSDeploymentManager {
        #queue = new Map();
        #auditLogs = []; #listeners = new Map();
        #diagnostics = { deploymentsQueued: 0, deploymentsCompleted: 0, deploymentsFailed: 0, retriesRun: 0, rollbacksRun: 0, errorsHidden: 0, eventsEmitted: 0, memoryBaseline: 2.4 };

        getVersion() { return DM_VERSION; }
        #deepClone(v) { try { return structuredClone(v); } catch (_e) { try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; } } }
        #escapeHtml(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
        #generateId(p) { return `${p}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`; }
        #logAudit(a, m) { this.#auditLogs.push(Object.freeze({ id: this.#generateId("aud"), timestamp: new Date().toISOString(), action: a, msg: m })); if (this.#auditLogs.length > 500) this.#auditLogs.shift(); }
        getAuditLog(p) { const l = this.#auditLogs.map(e => this.#deepClone(e)); return Object.freeze(p ? l.filter(p) : l); }
        on(e, h) { if (!this.#listeners.has(e)) this.#listeners.set(e, new Set()); this.#listeners.get(e).add(h); return () => this.off(e, h); }
        off(e, h) { const s = this.#listeners.get(e); if (!s) return false; const r = s.delete(h); if (s.size === 0) this.#listeners.delete(e); return r; }
        once(e, h) { const w = (p) => { this.off(e, h); h(p); }; this.on(e, w); }
        emit(e, p) { const s = this.#listeners.get(e); this.#diagnostics.eventsEmitted++; if (!s) return false; for (const fn of Array.from(s)) { try { fn(this.#deepClone(p)); } catch (_e) { this.#diagnostics.errorsHidden++; } } return true; }

        /**
         * checkDeploymentReadiness(moduleIds)
         *   Real check: every moduleId must have a real
         *   ENTERPRISE_CERTIFIED record. Never fabricates readiness.
         */
        checkDeploymentReadiness(moduleIds) {
            const cert = window.CozyOS.Certification;
            if (!cert) return { ready: false, reason: "CozyCertification is not connected." };
            const notReady = moduleIds.filter(id => {
                const h = cert.listRecords(id);
                return h.length === 0 || h[h.length - 1].verdict !== "ENTERPRISE_CERTIFIED";
            });
            return { ready: notReady.length === 0, notReady };
        }

        /**
         * queueDeployment({ name, moduleIds })
         *   Checks real readiness first; queues real, refuses to queue
         *   anything not actually certified.
         */
        queueDeployment({ name, moduleIds }) {
            const readiness = this.checkDeploymentReadiness(moduleIds);
            if (!readiness.ready) throw new Error(`[Deployment] queueDeployment(): not deployment-ready — uncertified module(s): ${readiness.notReady.join(", ")}.`);
            const id = this.#generateId("deploy");
            const deployment = { id, name: this.#escapeHtml(name), moduleIds, status: "QUEUED", attempts: 0, queuedAt: new Date().toISOString(), releaseId: null };
            this.#queue.set(id, deployment);
            this.#diagnostics.deploymentsQueued++;
            this.#logAudit("DEPLOYMENT_QUEUED", name);
            this.emit("deployment:queued", { id });
            return this.#deepClone(deployment);
        }

        /**
         * runDeployment(id)
         *   Real: locks a release via CozyCertification.lockRelease() —
         *   the ONLY place a "release" is actually created. On failure,
         *   real retry logic (up to 3 attempts) before marking FAILED.
         */
        async runDeployment(id) {
            const deployment = this.#queue.get(id);
            if (!deployment) throw new Error(`[Deployment] runDeployment(): no deployment "${id}".`);
            const cert = window.CozyOS.Certification;
            if (!cert) throw new Error("[Deployment] CozyCertification is not connected.");
            deployment.attempts++;
            deployment.status = "RUNNING";
            try {
                const release = cert.lockRelease({ name: deployment.name, moduleIds: deployment.moduleIds });
                deployment.status = "COMPLETED"; deployment.releaseId = release.releaseId; deployment.completedAt = new Date().toISOString();
                this.#diagnostics.deploymentsCompleted++;
                this.#logAudit("DEPLOYMENT_COMPLETED", `${id} -> release ${release.releaseId}`);
                this.emit("deployment:completed", { id, releaseId: release.releaseId });
            } catch (err) {
                if (deployment.attempts < 3) {
                    this.#diagnostics.retriesRun++;
                    deployment.status = "QUEUED";
                    this.#logAudit("DEPLOYMENT_RETRY", `${id}: attempt ${deployment.attempts} failed (${err.message})`);
                } else {
                    deployment.status = "FAILED"; deployment.failureReason = err.message;
                    this.#diagnostics.deploymentsFailed++;
                    this.#logAudit("DEPLOYMENT_FAILED", `${id}: ${err.message}`);
                    this.emit("deployment:failed", { id, reason: err.message });
                }
            }
            return this.#deepClone(deployment);
        }

        getDeployment(id) { const d = this.#queue.get(id); return d ? this.#deepClone(d) : null; }
        listDeployments(predicate) { const l = Array.from(this.#queue.values()).map(d => this.#deepClone(d)); return Object.freeze(predicate ? l.filter(predicate) : l); }

        /** listReleaseHistory() — pure pass-through to CozyCertification's own real release list. No duplicated storage. */
        listReleaseHistory() {
            const cert = window.CozyOS.Certification;
            return cert && typeof cert.listReleases === "function" ? cert.listReleases() : [];
        }

        /**
         * rollbackDeployment(fileId, backupId)
         *   Pure pass-through to WorkspaceShell.rollbackToBackup() — the
         *   real rollback mechanism built earlier. No duplicated logic.
         */
        async rollbackDeployment(fileId, backupId) {
            const workspace = window.CozyOS.WorkspaceShell;
            if (!workspace) throw new Error("[Deployment] WorkspaceShell is not connected — rollback needs its real backup store.");
            this.#diagnostics.rollbacksRun++;
            const result = await workspace.rollbackToBackup(fileId, backupId);
            this.#logAudit("DEPLOYMENT_ROLLED_BACK", `${fileId} -> ${backupId}`);
            this.emit("deployment:rolledBack", { fileId, backupId });
            return result;
        }

        isVersionCompatible(v) { const a = /^v?(\d+)\./.exec(DM_VERSION), b = /^v?(\d+)\./.exec(String(v || "")); return !!(a && b && a[1] === b[1]); }
        getDiagnosticsReport() { return this.#deepClone({ moduleVersion: DM_VERSION, ...this.#diagnostics, queueSize: this.#queue.size }); }
        exportSnapshot() { return this.#deepClone({ version: DM_VERSION, exportedAt: new Date().toISOString(), queue: Array.from(this.#queue.values()) }); }
        importSnapshot(s) { if (!s) throw new TypeError("[Deployment] importSnapshot(): invalid."); let n = 0; for (const d of (s.queue || [])) if (d?.id && !this.#queue.has(d.id)) { this.#queue.set(d.id, d); n++; } return { imported: n }; }
        isSnapshotCompatible(s) { return !!(s && typeof s.version === "string" && s.version.split(".")[0] === DM_VERSION.split(".")[0]); }
    }

    if (window.CozyOS.DeploymentManager?.getVersion) { if (window.CozyOS.DeploymentManager.getVersion() !== DM_VERSION) throw new Error("[CozyOS Framework Execution Error] VERSION_CONFLICT: DeploymentManager."); return; }
    window.CozyOS.DeploymentManager = new CozyOSDeploymentManager();

    (function reg(d) {
        function attempt() { if (typeof window.CozyOS.registerCoordinator !== "function") return false; try { window.CozyOS.registerCoordinator(d); } catch (_e) { /* non-fatal */ } return true; }
        if (attempt()) return;
        if (!Object.prototype.hasOwnProperty.call(window.CozyOS, "__pendingCoordinatorRegistrations")) Object.defineProperty(window.CozyOS, "__pendingCoordinatorRegistrations", { value: [], writable: true, enumerable: false, configurable: true });
        window.CozyOS.__pendingCoordinatorRegistrations.push(d);
        let n = 0; const iv = setInterval(() => { n++; if (attempt() || n >= 200) clearInterval(iv); }, 250);
    })({ name: "DeploymentManager", category: "Foundation", icon: "deployment.svg", description: "Real deployment queue + retry, built entirely on CozyCertification's lockRelease() and WorkspaceShell's rollbackToBackup() — no duplicated release/rollback logic." });
})();
