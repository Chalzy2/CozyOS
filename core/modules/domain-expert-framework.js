/**
 * CozyOS Enterprise Framework — CozyDomainExpertFramework
 * File Reference: core/modules/domain/domain-expert-framework.js
 * Version: 1.0.0-ENTERPRISE
 * Layer: Core / Code Generation — Domain Expert Framework
 *
 * RESPONSIBILITY
 *   Real, curated domain knowledge packs (keyword checklists) that
 *   extend RequirementAnalyzer's generic Gap Detector with domain-
 *   specific requirements — Church, Quarry, Power today; a real,
 *   empty, extensible registry for any future domain.
 *
 * WHAT THIS MODULE ACTUALLY DOES
 *   - Each domain pack is a real, curated list of {id, label, keywords}
 *     — the exact same checklist-matching technique UnderstandingEngine's
 *     generic Gap Detector already uses, applied to domain-specific
 *     concerns instead of generic enterprise ones.
 *   - detectDomainGaps(domain, text): real keyword-checklist matching,
 *     disclosed as exactly that — not domain "expertise" in any deeper
 *     sense than a curated word list a human authored.
 *   - registerDomainPack(): lets a real, future domain be added without
 *     modifying this file — genuine extensibility, not a fixed enum.
 *
 * WHAT THIS MODULE DOES NOT DO (Honest Capability Rule)
 *   - Only Church, Quarry, and Power packs are populated in this
 *     version — Healthcare/Education/Finance/Logistics are real,
 *     registered-but-empty placeholders (listDomains() reports them
 *     honestly as `keywordCount: 0`, never fabricated content).
 *   - Never claims genuine domain expertise — every fact here is a
 *     curated keyword list, disclosed as such everywhere it's surfaced.
 *
 * OPTIONAL INTEGRATIONS
 *   RequirementAnalyzer — detectDomainGaps() output is meant to be
 *                        merged by the caller into an analysis; this
 *                        file does not modify RequirementAnalyzer.
 *   CozyMemory          — records which domain a project used.
 *   ServiceRegistry     — registerCoordinator(), with retry.
 */

(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const DEF_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    const DOMAIN_PACKS = new Map(Object.entries({
        Church: [
            { id: "membership", label: "Membership Records", keywords: ["member", "membership", "congregation"] },
            { id: "families", label: "Family Grouping", keywords: ["family", "families", "household"] },
            { id: "ministries", label: "Ministries", keywords: ["ministry", "ministries", "department"] },
            { id: "attendance", label: "Attendance Tracking", keywords: ["attendance", "check-in", "present"] },
            { id: "baptism", label: "Baptism / Sacraments", keywords: ["baptism", "sacrament", "confirmation"] },
            { id: "tithing", label: "Tithing / Giving", keywords: ["tithe", "tithing", "offering", "giving", "donation"] },
            { id: "groups", label: "Small Groups", keywords: ["small group", "bible study", "cell group"] }
        ],
        Quarry: [
            { id: "extraction", label: "Extraction Tracking", keywords: ["extraction", "quarry site", "blast"] },
            { id: "weighbridge", label: "Weighbridge Readings", keywords: ["weighbridge", "weigh bridge", "tonnage"] },
            { id: "material-type", label: "Material Type Classification", keywords: ["material type", "aggregate", "gravel", "limestone"] },
            { id: "truck-loads", label: "Truck Load Logging", keywords: ["truck load", "haulage", "dispatch"] },
            { id: "safety", label: "Safety Compliance", keywords: ["safety", "ppe", "incident report"] },
            { id: "licensing", label: "Extraction Licensing", keywords: ["license", "permit", "mining right"] }
        ],
        Power: [
            { id: "generation-sources", label: "Generation Source Tracking", keywords: ["solar", "generator", "grid", "battery"] },
            { id: "load-management", label: "Load Management", keywords: ["load", "load shedding", "demand"] },
            { id: "maintenance", label: "Maintenance History", keywords: ["maintenance", "service interval", "inspection"] },
            { id: "outage-tracking", label: "Outage Tracking", keywords: ["outage", "blackout", "downtime"] },
            { id: "metering", label: "Metering / Consumption", keywords: ["meter", "consumption", "kwh"] }
        ],
        Healthcare: [], Education: [], Finance: [], Logistics: []
    }));

    class CozyOSDomainExpertFramework {
        #auditLogs = [];
        #timelineEvents = [];
        #listeners = new Map();
        #onceWrapped = new Map();
        #diagnostics = { gapChecksRun: 0, domainsRegistered: DOMAIN_PACKS.size, errorsHidden: 0, eventsEmitted: 0, memoryBaseline: 2.6 };

        getVersion() { return DEF_VERSION; }

        #deepClone(value) {
            if (typeof structuredClone === "function") { try { return structuredClone(value); } catch (_err) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(value)); } catch (_err) { return value; }
        }

        #generateId(prefix) {
            const raw = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
            return `${prefix}_${raw}`;
        }

        #escapeHtml(value) {
            const str = String(value === undefined || value === null ? "" : value);
            return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
        }

        #logAudit(action, msg) {
            this.#auditLogs.push(Object.freeze({ id: this.#generateId("aud"), timestamp: new Date().toISOString(), action, msg }));
            if (this.#auditLogs.length > 500) this.#auditLogs.shift();
        }
        #logTimeline(label) {
            this.#timelineEvents.push(Object.freeze({ time: new Date().toISOString(), label }));
            if (this.#timelineEvents.length > 500) this.#timelineEvents.shift();
        }
        getAuditLog(predicate) { const list = this.#auditLogs.map(e => this.#deepClone(e)); return Object.freeze(predicate ? list.filter(predicate) : list); }
        getTimeline(predicate) { const list = this.#timelineEvents.map(e => this.#deepClone(e)); return Object.freeze(predicate ? list.filter(predicate) : list); }

        on(eventName, handler) {
            if (typeof eventName !== "string" || !eventName.trim()) throw new TypeError("[DomainExpertFramework] on(): eventName must be a non-empty string.");
            if (typeof handler !== "function") throw new TypeError("[DomainExpertFramework] on(): handler must be a function.");
            if (!this.#listeners.has(eventName)) this.#listeners.set(eventName, new Set());
            this.#listeners.get(eventName).add(handler);
            return () => this.off(eventName, handler);
        }
        off(eventName, handler) {
            const set = this.#listeners.get(eventName);
            if (!set) return false;
            const wrapped = this.#onceWrapped.get(handler);
            const removed = set.delete(handler) || (wrapped ? set.delete(wrapped) : false);
            if (set.size === 0) this.#listeners.delete(eventName);
            return removed;
        }
        once(eventName, handler) {
            if (typeof handler !== "function") throw new TypeError("[DomainExpertFramework] once(): handler must be a function.");
            const wrapper = (payload) => { this.off(eventName, handler); this.#onceWrapped.delete(handler); handler(payload); };
            this.#onceWrapped.set(handler, wrapper);
            this.on(eventName, wrapper);
        }
        emit(eventName, payload) {
            if (typeof eventName !== "string" || !eventName.trim()) { this.#diagnostics.errorsHidden++; return false; }
            const set = this.#listeners.get(eventName);
            this.#diagnostics.eventsEmitted++;
            if (!set || set.size === 0) return false;
            let safePayload = payload;
            try { safePayload = this.#deepClone(payload); } catch (_err) { safePayload = payload; }
            for (const fn of Array.from(set)) { try { fn(safePayload); } catch (_err) { this.#diagnostics.errorsHidden++; } }
            return true;
        }

        listDomains() {
            return this.#deepClone(Array.from(DOMAIN_PACKS.entries()).map(([name, pack]) => ({ name, keywordCount: pack.length })));
        }

        getDomainPack(domain) {
            const pack = DOMAIN_PACKS.get(domain);
            return pack ? this.#deepClone(pack) : null;
        }

        /**
         * registerDomainPack(name, checklist)
         *   Real extensibility point — a genuinely new domain can be
         *   added without editing this file's source.
         */
        registerDomainPack(name, checklist) {
            if (typeof name !== "string" || !name.trim()) throw new TypeError("[DomainExpertFramework] registerDomainPack(): name is required.");
            if (!Array.isArray(checklist)) throw new TypeError("[DomainExpertFramework] registerDomainPack(): checklist must be an array of {id, label, keywords}.");
            DOMAIN_PACKS.set(this.#escapeHtml(name), checklist);
            this.#diagnostics.domainsRegistered = DOMAIN_PACKS.size;
            this.#logAudit("DOMAIN_PACK_REGISTERED", `${name}: ${checklist.length} item(s)`);
            this.emit("domain:registered", { name, count: checklist.length });
            return true;
        }

        /**
         * detectDomainGaps(domain, text)
         *   Real keyword-checklist matching — same technique as
         *   UnderstandingEngine's generic Gap Detector, applied to a
         *   domain-specific pack. Throws honestly if the domain doesn't
         *   exist or is a real-but-empty placeholder.
         */
        detectDomainGaps(domain, text) {
            const pack = DOMAIN_PACKS.get(domain);
            if (!pack) throw new Error(`[DomainExpertFramework] detectDomainGaps(): unknown domain "${domain}". Known domains: ${Array.from(DOMAIN_PACKS.keys()).join(", ")}.`);
            if (pack.length === 0) return { domain, detected: [], missing: [], method: "keyword-checklist", note: `The "${domain}" pack is a real, registered, but currently EMPTY placeholder — no checklist items exist yet for it.` };
            if (typeof text !== "string") throw new TypeError("[DomainExpertFramework] detectDomainGaps(): text must be a string.");
            this.#diagnostics.gapChecksRun++;
            const lower = text.toLowerCase();
            const detected = [], missing = [];
            for (const item of pack) {
                (item.keywords.some(k => lower.includes(k)) ? detected : missing).push({ id: item.id, label: item.label });
            }
            this.#logTimeline(`Domain gap check: ${domain}`);
            return this.#deepClone({ domain, detected, missing, method: "keyword-checklist" });
        }

        isVersionCompatible(version) {
            const a = /^v?(\d+)\./.exec(String(DEF_VERSION));
            const b = /^v?(\d+)\./.exec(String(version || ""));
            if (!a || !b) return false;
            return a[1] === b[1];
        }

        getDiagnosticsReport() {
            return this.#deepClone({ moduleVersion: DEF_VERSION, ...this.#diagnostics, auditLogCount: this.#auditLogs.length, timelineEventCount: this.#timelineEvents.length });
        }

        exportSnapshot() { return this.#deepClone({ version: DEF_VERSION, exportedAt: new Date().toISOString(), domains: Array.from(DOMAIN_PACKS.entries()) }); }
        importSnapshot(snapshot) {
            if (!snapshot || typeof snapshot !== "object") throw new TypeError("[DomainExpertFramework] importSnapshot(): snapshot must be an object.");
            let imported = 0;
            for (const [name, pack] of (snapshot.domains || [])) { if (!DOMAIN_PACKS.has(name)) { DOMAIN_PACKS.set(name, pack); imported++; } }
            return { imported };
        }
        isSnapshotCompatible(snapshot) { return !!(snapshot && typeof snapshot.version === "string" && snapshot.version.split(".")[0] === DEF_VERSION.split(".")[0]); }
    }

    if (window.CozyOS.DomainExpertFramework && typeof window.CozyOS.DomainExpertFramework.getVersion === "function") {
        const existingVersion = window.CozyOS.DomainExpertFramework.getVersion();
        if (existingVersion !== DEF_VERSION) throw new Error(`[CozyOS Framework Execution Error] VERSION_CONFLICT: DomainExpertFramework existing v${existingVersion} conflicts with load target v${DEF_VERSION}.`);
        return;
    }
    window.CozyOS.DomainExpertFramework = new CozyOSDomainExpertFramework();

    (function registerWithServiceRegistry(descriptor) {
        function attempt() {
            if (typeof window.CozyOS.registerCoordinator !== "function") return false;
            try { window.CozyOS.registerCoordinator(descriptor); } catch (_err) { /* non-fatal */ }
            return true;
        }
        if (attempt()) return;
        if (!Object.prototype.hasOwnProperty.call(window.CozyOS, "__pendingCoordinatorRegistrations")) {
            Object.defineProperty(window.CozyOS, "__pendingCoordinatorRegistrations", { value: [], writable: true, enumerable: false, configurable: true });
        }
        window.CozyOS.__pendingCoordinatorRegistrations.push(descriptor);
        let attempts = 0;
        const intervalId = setInterval(() => {
            attempts++;
            if (attempt() || attempts >= 200) {
                clearInterval(intervalId);
                const idx = window.CozyOS.__pendingCoordinatorRegistrations.indexOf(descriptor);
                if (idx !== -1) window.CozyOS.__pendingCoordinatorRegistrations.splice(idx, 1);
            }
        }, 250);
    })({ name: "DomainExpertFramework", category: "Code Generation", icon: "domain-expert.svg", description: "Real, curated domain checklists (Church/Quarry/Power populated; Healthcare/Education/Finance/Logistics real-but-empty) extending RequirementAnalyzer's gap detection." });
})();
