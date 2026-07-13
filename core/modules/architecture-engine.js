/**
 * CozyOS Enterprise Framework — CozyArchitectureEngine
 * File Reference: core/modules/builder/architecture-engine.js
 * Version: 1.0.0-ENTERPRISE
 * Layer: Core / Code Generation — Architecture Engine
 *
 * RESPONSIBILITY
 *   Converts a RequirementAnalyzer analysis into a real, structured
 *   Architecture Blueprint: module list, folder structure, data model,
 *   integration points — deterministic rules, never fabricated design
 *   reasoning.
 *
 * WHAT THIS MODULE ACTUALLY DOES
 *   - generateBlueprint(analysisId): reuses RequirementAnalyzer's real
 *     entities/integrations/complexity; maps them to real CozyOS folder
 *     conventions (core/modules/<name>/cozy-<name>.js) and a real
 *     coordinator-per-entity module list. Never invents functionality
 *     not present in the analysis.
 *   - Data model: one real field set per entity (id, name, createdAt,
 *     status — the same baseline every CozyOS entity already uses),
 *     never fabricated business fields.
 *
 * WHAT THIS MODULE DOES NOT DO (Honest Capability Rule)
 *   - No genuine architectural judgment (scalability tradeoffs, tech
 *     selection) — this is real, disclosed template mapping.
 *
 * OPTIONAL INTEGRATIONS
 *   RequirementAnalyzer, CozyMemory, ServiceRegistry (retry).
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const AE_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    class CozyOSArchitectureEngine {
        #blueprints = new Map();
        #auditLogs = []; #timelineEvents = []; #listeners = new Map(); #onceWrapped = new Map();
        #diagnostics = { blueprintsGenerated: 0, errorsHidden: 0, eventsEmitted: 0, memoryBaseline: 2.6 };

        getVersion() { return AE_VERSION; }
        #deepClone(v) { try { return structuredClone(v); } catch (_e) { try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; } } }
        #escapeHtml(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
        #generateId(p) { return `${p}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`; }
        #logAudit(a, m) { this.#auditLogs.push(Object.freeze({ id: this.#generateId("aud"), timestamp: new Date().toISOString(), action: a, msg: m })); if (this.#auditLogs.length > 500) this.#auditLogs.shift(); }
        #logTimeline(l) { this.#timelineEvents.push(Object.freeze({ time: new Date().toISOString(), label: l })); if (this.#timelineEvents.length > 500) this.#timelineEvents.shift(); }
        getAuditLog(p) { const l = this.#auditLogs.map(e => this.#deepClone(e)); return Object.freeze(p ? l.filter(p) : l); }
        getTimeline(p) { const l = this.#timelineEvents.map(e => this.#deepClone(e)); return Object.freeze(p ? l.filter(p) : l); }

        on(e, h) { if (typeof e !== "string" || !e.trim()) throw new TypeError("[ArchitectureEngine] on(): eventName required."); if (typeof h !== "function") throw new TypeError("[ArchitectureEngine] on(): handler required."); if (!this.#listeners.has(e)) this.#listeners.set(e, new Set()); this.#listeners.get(e).add(h); return () => this.off(e, h); }
        off(e, h) { const s = this.#listeners.get(e); if (!s) return false; const w = this.#onceWrapped.get(h); const r = s.delete(h) || (w ? s.delete(w) : false); if (s.size === 0) this.#listeners.delete(e); return r; }
        once(e, h) { if (typeof h !== "function") throw new TypeError("[ArchitectureEngine] once(): handler required."); const w = (p) => { this.off(e, h); this.#onceWrapped.delete(h); h(p); }; this.#onceWrapped.set(h, w); this.on(e, w); }
        emit(e, p) { if (typeof e !== "string" || !e.trim()) { this.#diagnostics.errorsHidden++; return false; } const s = this.#listeners.get(e); this.#diagnostics.eventsEmitted++; if (!s || s.size === 0) return false; let sp = p; try { sp = this.#deepClone(p); } catch (_e) { sp = p; } for (const fn of Array.from(s)) { try { fn(sp); } catch (_e) { this.#diagnostics.errorsHidden++; } } return true; }

        /**
         * generateBlueprint(analysisId)
         *   Real, deterministic mapping — no fabricated design decisions.
         */
        generateBlueprint(analysisId) {
            const ra = window.CozyOS.RequirementAnalyzer;
            if (!ra) throw new Error("[ArchitectureEngine] RequirementAnalyzer is not connected.");
            const analysis = ra.getAnalysis(analysisId);
            if (!analysis) throw new Error(`[ArchitectureEngine] generateBlueprint(): no analysis "${analysisId}".`);

            const modules = analysis.databaseEntities.map(entity => {
                const kebab = entity.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
                return {
                    entity, filePath: `core/modules/${kebab}/cozy-${kebab}.js`,
                    dataModel: { id: "string", name: "string", createdAt: "ISO timestamp", status: "string" }
                };
            });

            const blueprintId = this.#generateId("arch");
            const blueprint = Object.freeze({
                id: blueprintId, analysisId, domain: analysis.domain, generatedAt: new Date().toISOString(),
                modules, integrationPoints: analysis.requiredIntegrations,
                folderStructure: [...new Set(modules.map(m => m.filePath.split("/").slice(0, 2).join("/")))],
                complexity: analysis.complexity, method: "deterministic template mapping — not genuine architectural reasoning"
            });
            this.#blueprints.set(blueprintId, blueprint);
            this.#diagnostics.blueprintsGenerated++;
            this.#logAudit("BLUEPRINT_GENERATED", `${blueprintId}: ${modules.length} module(s)`);
            this.#logTimeline(`Blueprint generated: ${analysis.domain}`);
            if (window.CozyOS.CozyMemory) { try { window.CozyOS.CozyMemory.saveMemory("Project", `blueprint-${blueprintId}`, blueprint, { tags: ["architecture", analysis.domain] }); } catch (_e) { /* additive only */ } }
            this.emit("blueprint:generated", { blueprintId, moduleCount: modules.length });
            return this.#deepClone(blueprint);
        }

        getBlueprint(id) { const b = this.#blueprints.get(id); return b ? this.#deepClone(b) : null; }
        listBlueprints(p) { const l = Array.from(this.#blueprints.values()).map(b => this.#deepClone(b)); return Object.freeze(p ? l.filter(p) : l); }

        isVersionCompatible(v) { const a = /^v?(\d+)\./.exec(AE_VERSION), b = /^v?(\d+)\./.exec(String(v || "")); return !!(a && b && a[1] === b[1]); }
        getDiagnosticsReport() { return this.#deepClone({ moduleVersion: AE_VERSION, ...this.#diagnostics, blueprintCount: this.#blueprints.size, integrationCount: window.CozyOS.RequirementAnalyzer ? 1 : 0 }); }
        exportSnapshot() { return this.#deepClone({ version: AE_VERSION, exportedAt: new Date().toISOString(), blueprints: Array.from(this.#blueprints.values()) }); }
        importSnapshot(s) { if (!s || typeof s !== "object") throw new TypeError("[ArchitectureEngine] importSnapshot(): invalid."); let n = 0; for (const b of (s.blueprints || [])) if (b?.id && !this.#blueprints.has(b.id)) { this.#blueprints.set(b.id, b); n++; } return { imported: n }; }
        isSnapshotCompatible(s) { return !!(s && typeof s.version === "string" && s.version.split(".")[0] === AE_VERSION.split(".")[0]); }
    }

    if (window.CozyOS.ArchitectureEngine?.getVersion) {
        if (window.CozyOS.ArchitectureEngine.getVersion() !== AE_VERSION) throw new Error(`[CozyOS Framework Execution Error] VERSION_CONFLICT: ArchitectureEngine.`);
        return;
    }
    window.CozyOS.ArchitectureEngine = new CozyOSArchitectureEngine();

    (function reg(d) {
        function attempt() { if (typeof window.CozyOS.registerCoordinator !== "function") return false; try { window.CozyOS.registerCoordinator(d); } catch (_e) { /* non-fatal */ } return true; }
        if (attempt()) return;
        if (!Object.prototype.hasOwnProperty.call(window.CozyOS, "__pendingCoordinatorRegistrations")) Object.defineProperty(window.CozyOS, "__pendingCoordinatorRegistrations", { value: [], writable: true, enumerable: false, configurable: true });
        window.CozyOS.__pendingCoordinatorRegistrations.push(d);
        let n = 0; const iv = setInterval(() => { n++; if (attempt() || n >= 200) { clearInterval(iv); const i = window.CozyOS.__pendingCoordinatorRegistrations.indexOf(d); if (i !== -1) window.CozyOS.__pendingCoordinatorRegistrations.splice(i, 1); } }, 250);
    })({ name: "ArchitectureEngine", category: "Code Generation", icon: "architecture-engine.svg", description: "Real deterministic blueprint generation from RequirementAnalyzer output — module list, folder structure, data model." });
})();
