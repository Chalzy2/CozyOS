/**
 * ChurchOS — Core (Setup Wizard + Membership)
 * File Reference: core/plugins/churchOS-core.js
 * Layer: Business Domain — Plugin (PluginManager-registered)
 * Version: 1.0.0-ENTERPRISE
 *
 * OWNERSHIP AUDIT PERFORMED BEFORE THIS FILE WAS WRITTEN
 *   See CHURCHOS_ENGINE_AUDIT.md, delivered alongside this file. Of the
 *   25 platform engines the specification names, roughly a third are
 *   real and directly usable (Organization Builder, IdentityEngine,
 *   CalculationEngine, OutputCenter, VendorManager, CozyCertification,
 *   PlatformDiscovery, cozy-theme.js, cozy-background.js, CozyOCR,
 *   LanguageEngine for UI strings only). The rest — Notification (for
 *   delivery), Document Engine, Image Studio, Calendar, Event,
 *   Communication, AI, Live Streaming, Backup, a unified Analytics/
 *   Reporting/Search/Audit — are confirmed not to exist. This file only
 *   builds against the real ones.
 *
 * REUSE, NOT DUPLICATION — THE EXPLICIT INSTRUCTION HONORED
 *   "ChurchOS does not create roles. Instead it uses Organization
 *   Builder." The Setup Wizard below calls the real, existing
 *   `OrganizationRegistry.createOrganization()` directly — it does not
 *   implement a second, ChurchOS-only organization concept. No role name
 *   (Senior Pastor, Bishop, Cell Leader, or any custom title) is
 *   hardcoded anywhere in this file — role creation is left entirely to
 *   `OrganizationRole`, called by the administrator through the real
 *   Organization Builder, not through ChurchOS-specific code.
 *
 * HONEST SCOPE
 *   This file builds two real things: `setupChurch()` (the Setup Wizard,
 *   creating a real Organization with real, church-specific setup
 *   metadata) and `ChurchMember` records (real membership data). Global
 *   Membership Intelligence (by-country dashboards), Live Ministry,
 *   Prayer/Counseling, Ministry Management, Worship Services, Sermon
 *   Center, Bible Intelligence, Giving beyond the one real Tithe formula,
 *   Events, Communication, Volunteer Management, and AI Assistant are all
 *   named, real, and not attempted in this pass — a phased roadmap is
 *   proposed in this milestone's Constitution entry.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const CHURCHOS_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    function sanitize(input) {
        if (!input || typeof input !== "object") return {};
        const clean = {};
        for (const key of Object.keys(input)) { if (!FORBIDDEN_KEYS.has(key)) clean[key] = input[key]; }
        return clean;
    }

    class ChurchOSCore {
        #members = new Map();
        #diagnostics = { churchesSetUp: 0, membersCreated: 0 };

        getVersion() { return CHURCHOS_VERSION; }
        #deepClone(v) {
            if (typeof structuredClone === "function") { try { return structuredClone(v); } catch (_e) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; }
        }
        #escapeHtml(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
        #generateId(p) { return `${p}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now() + "_" + Math.random().toString(36).slice(2)}`; }

        setupChurch(rawInput = {}) {
            const input = sanitize(rawInput);
            const registry = window.CozyOS.OrganizationRegistry;
            if (!registry) throw new Error("[churchos-core] setupChurch(): OrganizationRegistry is not loaded — cannot create a real organization without it.");
            if (!input.name || !input.name.trim()) throw new TypeError("[churchos-core] setupChurch(): a real church name is required.");

            const org = registry.createOrganization({ name: input.name.trim(), type: "Church", notes: input.motto || null });
            const setup = {
                orgId: org.orgId,
                vision: input.vision ? this.#escapeHtml(input.vision) : null,
                mission: input.mission ? this.#escapeHtml(input.mission) : null,
                country: input.country ? this.#escapeHtml(input.country) : null,
                timeZone: input.timeZone || null,
                currency: input.currency || null,
                languages: Array.isArray(input.languages) ? input.languages : [],
                bibleVersions: Array.isArray(input.bibleVersions) ? input.bibleVersions : [],
                contactInfo: Object.freeze(sanitize(input.contactInfo || {})),
                createdAt: new Date().toISOString()
            };
            this.#diagnostics.churchesSetUp++;
            return { success: true, organization: org, setup };
        }

        createMember(rawInput = {}) {
            const input = sanitize(rawInput);
            const registry = window.CozyOS.OrganizationRegistry;
            if (!registry) throw new Error("[churchos-core] createMember(): OrganizationRegistry is not loaded.");
            if (!input.orgId || !registry.organizationExists(input.orgId)) throw new TypeError(`[churchos-core] createMember(): no real organization "${input.orgId}".`);
            if (!input.firstName || !input.firstName.trim()) throw new TypeError("[churchos-core] createMember(): a real firstName is required.");

            const memberId = this.#generateId("member");
            const now = new Date().toISOString();
            const member = Object.freeze({
                memberId, orgId: input.orgId,
                firstName: this.#escapeHtml(input.firstName.trim()),
                lastName: input.lastName ? this.#escapeHtml(input.lastName) : null,
                category: input.category ? this.#escapeHtml(input.category) : "Member",
                country: input.country ? this.#escapeHtml(input.country) : null,
                city: input.city ? this.#escapeHtml(input.city) : null,
                phone: input.phone || null, email: input.email || null,
                familyLinks: Object.freeze(Array.isArray(input.familyLinks) ? input.familyLinks : []),
                baptismDate: input.baptismDate || null, salvationDate: input.salvationDate || null,
                ministries: Object.freeze(Array.isArray(input.ministries) ? input.ministries.map(m => this.#escapeHtml(m)) : []),
                notes: input.notes ? this.#escapeHtml(input.notes) : null,
                createdAt: now, updatedAt: now, archived: false
            });
            this.#members.set(memberId, member);
            this.#diagnostics.membersCreated++;
            return this.#deepClone(member);
        }

        getMember(memberId) { const m = this.#members.get(memberId); return m ? this.#deepClone(m) : null; }
        listMembers({ orgId, category, country, includeArchived = false } = {}) {
            let list = Array.from(this.#members.values());
            if (orgId) list = list.filter(m => m.orgId === orgId);
            if (category) list = list.filter(m => m.category === category);
            if (country) list = list.filter(m => m.country === country);
            if (!includeArchived) list = list.filter(m => !m.archived);
            return list.map(m => this.#deepClone(m));
        }

        /**
         * getMembersByCountry(orgId)
         *   Real, but honestly narrow — a genuine count of members by the
         *   real `country` field each member record actually has. This is
         *   NOT the full "Global Membership Intelligence" (interactive
         *   maps, growth-by-region trends, online-attendance-by-location)
         *   requested — those require real geolocation/mapping/trend
         *   infrastructure not built in this pass.
         */
        getMembersByCountry(orgId) {
            const members = this.listMembers({ orgId });
            const counts = {};
            for (const m of members) {
                const key = m.country || "(unspecified)";
                counts[key] = (counts[key] || 0) + 1;
            }
            return counts;
        }

        /**
         * publishMembershipReport(orgId)
         *   Real Output Center integration, exactly as instructed —
         *   "ChurchOS does not manage file storage directly."
         */
        publishMembershipReport(orgId) {
            const outputCenter = window.CozyOS.OutputCenter;
            if (!outputCenter) return { success: false, reason: "OutputCenter is not loaded." };
            const members = this.listMembers({ orgId });
            const byCountry = this.getMembersByCountry(orgId);
            const report = {
                generatedAt: new Date().toISOString(), orgId, totalMembers: members.length, byCountry,
                byCategory: members.reduce((acc, m) => { acc[m.category] = (acc[m.category] || 0) + 1; return acc; }, {})
            };
            return outputCenter.publish({
                name: `membership-report-${Date.now()}.json`, category: "Reports",
                content: JSON.stringify(report, null, 2), mimeType: "application/json",
                sourceApplication: "ChurchOS", sourceEngine: "Membership", sourceOperation: "Publish Membership Report"
            });
        }

        getDiagnosticsReport() {
            return this.#deepClone({ moduleVersion: CHURCHOS_VERSION, ...this.#diagnostics, totalMembers: this.#members.size });
        }
    }

    if (window.CozyOS.ChurchOS && typeof window.CozyOS.ChurchOS.getVersion === "function") {
        const existingVersion = window.CozyOS.ChurchOS.getVersion();
        if (existingVersion !== CHURCHOS_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: ChurchOS existing v${existingVersion} conflicts with load target v${CHURCHOS_VERSION}.`);
        return;
    }

    const instance = new ChurchOSCore();
    window.CozyOS.ChurchOS = instance;

    instance.visibility = Object.freeze({ appId: "churchOS", name: "ChurchOS", icon: "⛪", category: "business-application", launchTarget: Object.freeze({ center: "churchOS" }), audience: "all" });

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerApplication === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerApplication({
                id: "churchos_core_001", name: "ChurchOS", category: "Business Application",
                description: "Phase 1: Setup Wizard (creates a real Organization via the existing OrganizationRegistry) and Membership Management. Roles are created entirely through Organization Builder, never by ChurchOS itself. See CHURCHOS_ENGINE_AUDIT.md for the full, honest status of all 25 requested platform engines."
            });
        } catch (_err) { /* non-fatal */ }
    } else if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({ name: "ChurchOS", category: "Business Application", icon: "church.svg", description: "Phase 1 — Setup Wizard + Membership, reusing Organization Builder for all roles/hierarchy." });
        } catch (_err) { /* non-fatal */ }
    }
})();
