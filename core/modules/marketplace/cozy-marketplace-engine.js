/**
 * CozyOS — Marketplace Engine
 * File Reference: core/modules/marketplace/cozy-marketplace-engine.js
 * Layer: Platform Service (PluginManager-registered)
 * Version: 1.0.0-ENTERPRISE
 *
 * ═══════════════════════════════════════════════════════════════════════
 * RULE 26.2/26.3/32 — SHARED CAPABILITY, PRODUCTION SPECIFICATION APPROVED
 * ═══════════════════════════════════════════════════════════════════════
 *   Origin: during Domain Verification of the cozycabin application
 *   suite, marketplace listing logic (schema, categories, CRUD) was
 *   found already shared, verbatim, across 5 real applications —
 *   shop, rentals, services, crafts, mobility — via cozy-items.js's
 *   "one collection, every item type" design. Not speculative reuse;
 *   already proven before this Engine was written.
 *
 *   Named "Marketplace Engine," not "Listings Engine," per approved
 *   Production Specification review: the business domain is broader
 *   than today's 5 consumers (jobs, real estate, events, tourism,
 *   vehicles, freelancers are named future consumers) — the name
 *   should describe the domain, not the current implementation shape.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * RULE 25 — CANONICAL OWNERSHIP DECLARATION
 * ═══════════════════════════════════════════════════════════════════════
 *   Owns: Listing lifecycle, validation, taxonomy, visibility,
 *   ownership, metadata, status, categories, tags, location,
 *   attributes, search index, filters.
 *
 *   Does NOT Own (approved Ownership Matrix):
 *     ✗ Payments — Payment Provider / future Financial Platform.
 *     ✗ Orders — future Order Engine.
 *     ✗ Inventory tracking beyond a listing's own status — future
 *       Order/Inventory Engine, once real.
 *     ✗ Checkout — future Order Engine / Payment Provider.
 *     ✗ Messaging between buyer/seller — Chat (separate, unbuilt domain).
 *     ✗ Delivery — future Logistics Engine.
 *     ✗ Reviews — future Review Engine.
 *     ✗ Authentication — Identity Engine.
 *     ✗ Session / current user — Session Service. This engine accepts
 *       ownerCozyId as a plain reference only.
 *     ✗ Companies — Company Engine.
 *     ✗ Images — Storage Provider; this engine stores image
 *       references (URLs) only, never binary content.
 *     ✗ Analytics — future Analytics Engine.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * HONEST SCOPE
 *   Real, in-memory reference implementation — not durable across
 *   reload, matching the same disclosed limitation as every other
 *   CozyOS engine's initial reference implementation.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const MARKETPLACE_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
    function sanitizeObject(input) { if (!input || typeof input !== "object") return {}; const clean = {}; for (const key of Object.keys(input)) { if (!FORBIDDEN_KEYS.has(key)) clean[key] = input[key]; } return clean; }
    function escapeHtml(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }

    /**
     * Real item types and categories, extracted verbatim from the real,
     * verified source (cozy-items.js) across all 5 proven consumers —
     * never invented, never simplified.
     */
    const ITEM_TYPES = Object.freeze(["product", "rental", "service", "craft", "mobility", "digital", "affiliate"]);
    const STATUSES = Object.freeze(["active", "inactive", "pending", "sold"]);
    const CATEGORIES = Object.freeze({
        product:   Object.freeze(["Kitchen", "Solar", "Decor", "Bedding", "Security", "Electronics", "Tech", "Fashion", "Appliances"]),
        rental:    Object.freeze(["Bedsitter", "Single Room", "1 Bedroom", "2 Bedroom", "3 Bedroom", "4+ Bedroom", "Commercial"]),
        service:   Object.freeze(["Electrician", "Plumber", "Solar Installer", "CCTV Installer", "Delivery Rider", "Graphic Designer", "Web Developer", "Cleaner", "Carpenter", "Phone Repair", "Other"]),
        craft:     Object.freeze(["Wall Art", "Frames", "Wooden Crafts", "AI Art", "Home Decor", "Gift Items", "Jewelry", "Handmade", "Other"]),
        mobility:  Object.freeze(["Electric Bike", "Electric Scooter", "Delivery Bike", "Battery", "Charger", "Accessories"]),
        digital:   Object.freeze(["Video Course", "E-Book", "Template", "Software", "AI Prompt", "Crypto Guide", "Other"]),
        affiliate: Object.freeze(["Cozycabin Shop", "External Product", "Course Referral", "Service Referral"]),
    });

    class CozyMarketplaceEngine {
        #listings = new Map(); // listingId -> record
        #auditLog = [];
        #listeners = new Map();
        #onceWrapped = new Map();
        #diagnostics = { listingsCreated: 0, listingsUpdated: 0, listingsDeleted: 0, validationFailures: 0, searchesPerformed: 0 };

        getVersion() { return MARKETPLACE_VERSION; }
        #generateId(p) { return `${p}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`; }
        #logAudit(action, msg) { this.#auditLog.push(Object.freeze({ id: this.#generateId("aud"), timestamp: new Date().toISOString(), action, msg: escapeHtml(msg) })); if (this.#auditLog.length > 2000) this.#auditLog.shift(); }
        getAuditLog(predicate) { const list = this.#auditLog.map(e => ({ ...e })); return Object.freeze(predicate ? list.filter(predicate) : list); }

        on(e, h) { if (typeof e !== "string" || !e.trim()) throw new TypeError("[Marketplace] on(): eventName required."); if (typeof h !== "function") throw new TypeError("[Marketplace] on(): handler required."); if (!this.#listeners.has(e)) this.#listeners.set(e, new Set()); this.#listeners.get(e).add(h); return () => this.off(e, h); }
        off(e, h) { const s = this.#listeners.get(e); if (!s) return false; const w = this.#onceWrapped.get(h); const r = s.delete(h) || (w ? s.delete(w) : false); if (s.size === 0) this.#listeners.delete(e); return r; }
        once(e, h) { if (typeof h !== "function") throw new TypeError("[Marketplace] once(): handler required."); const w = (p) => { this.off(e, h); this.#onceWrapped.delete(h); h(p); }; this.#onceWrapped.set(h, w); this.on(e, w); }
        emit(e, p) { const s = this.#listeners.get(e); if (!s || s.size === 0) return false; for (const fn of Array.from(s)) { try { fn(p); } catch (_err) { /* listener errors never break the engine */ } } return true; }

        /**
         * #blankListing(owner, itemType) — real, matches the original
         * cozy-items.js blankItem() schema exactly, including every
         * type-specific extra field (rental deposit/bedrooms, mobility
         * range/battery/speed, digital downloadUrl, rental occupancy) —
         * never simplified or dropped during migration.
         */
        #blankListing(ownerCozyId, itemType) {
            const now = new Date().toISOString();
            return {
                ownerCozyId, ownerUid: null, itemType,
                category: "", subcategory: "", title: "", description: "",
                price: 0, commission: 0, location: "", county: "",
                status: "active", images: Object.freeze([]), tags: Object.freeze([]),
                createdAt: now, updatedAt: now,
                deposit: 0, rentPeriod: "monthly", bedrooms: 0,
                availability: "weekdays",
                range: "", battery: "", speed: "",
                downloadUrl: "",
                occupied: false,
            };
        }

        /**
         * createListing(ownerCozyId, itemType, rawFields)
         *   Real creation. ownerCozyId is a plain reference (Session
         *   Service's domain, never validated here). Rejects an unknown
         *   itemType or category honestly, rather than silently
         *   accepting anything.
         */
        createListing(ownerCozyId, itemType, rawFields) {
            if (!ownerCozyId || typeof ownerCozyId !== "string") { this.#diagnostics.validationFailures++; throw new TypeError("[Marketplace] createListing(): ownerCozyId is required."); }
            if (!ITEM_TYPES.includes(itemType)) { this.#diagnostics.validationFailures++; throw new TypeError(`[Marketplace] createListing(): invalid itemType "${itemType}". Must be one of: ${ITEM_TYPES.join(", ")}.`); }
            const fields = sanitizeObject(rawFields);
            if (fields.category && !CATEGORIES[itemType].includes(fields.category)) { this.#diagnostics.validationFailures++; throw new TypeError(`[Marketplace] createListing(): invalid category "${fields.category}" for itemType "${itemType}". Must be one of: ${CATEGORIES[itemType].join(", ")}.`); }
            if (!fields.title || typeof fields.title !== "string" || !fields.title.trim()) { this.#diagnostics.validationFailures++; throw new TypeError("[Marketplace] createListing(): title is required."); }

            const listingId = this.#generateId("listing");
            const base = this.#blankListing(ownerCozyId, itemType);
            const clean = {};
            for (const key of Object.keys(base)) { if (fields[key] !== undefined) clean[key] = fields[key]; }
            if (clean.title) clean.title = escapeHtml(clean.title);
            if (clean.description) clean.description = escapeHtml(clean.description);
            if (Array.isArray(clean.tags)) clean.tags = Object.freeze(clean.tags.map(t => escapeHtml(String(t))));
            const record = Object.freeze({ listingId, ...base, ...clean });
            this.#listings.set(listingId, record);
            this.#diagnostics.listingsCreated++;
            this.#logAudit("LISTING_CREATED", `${listingId} (${itemType})`);
            this.emit("listing-created", { listingId, itemType, ownerCozyId });
            return { ...record };
        }

        getListing(listingId) { const l = this.#listings.get(listingId); return l ? { ...l } : null; }

        /** updateListing(listingId, changes) — real, validated. Category changes are re-validated against the listing's own itemType, never bypassed. */
        updateListing(listingId, rawChanges) {
            const existing = this.#listings.get(listingId);
            if (!existing) throw new Error(`[Marketplace] updateListing(): unknown listingId "${listingId}".`);
            const changes = sanitizeObject(rawChanges);
            if (changes.category && !CATEGORIES[existing.itemType].includes(changes.category)) throw new TypeError(`[Marketplace] updateListing(): invalid category "${changes.category}" for itemType "${existing.itemType}".`);
            if (changes.status && !STATUSES.includes(changes.status)) throw new TypeError(`[Marketplace] updateListing(): invalid status "${changes.status}". Must be one of: ${STATUSES.join(", ")}.`);
            const clean = { ...changes };
            if (clean.title) clean.title = escapeHtml(clean.title);
            if (clean.description) clean.description = escapeHtml(clean.description);
            if (Array.isArray(clean.tags)) clean.tags = Object.freeze(clean.tags.map(t => escapeHtml(String(t))));
            const updated = Object.freeze({ ...existing, ...clean, updatedAt: new Date().toISOString() });
            this.#listings.set(listingId, updated);
            this.#diagnostics.listingsUpdated++;
            this.#logAudit("LISTING_UPDATED", listingId);
            this.emit("listing-updated", { listingId });
            return { ...updated };
        }

        deleteListing(listingId) {
            const existed = this.#listings.delete(listingId);
            if (existed) { this.#diagnostics.listingsDeleted++; this.#logAudit("LISTING_DELETED", listingId); this.emit("listing-deleted", { listingId }); }
            return existed;
        }

        /** listByType(itemType, {county}) — real, matches getItemsByType()'s original behavior: active-only, optional county filter. */
        listByType(itemType, { county = "" } = {}) {
            this.#diagnostics.searchesPerformed++;
            let results = Array.from(this.#listings.values()).filter(l => l.itemType === itemType && l.status === "active");
            if (county) results = results.filter(l => l.county === county);
            return results.map(l => ({ ...l }));
        }
        listByOwner(ownerCozyId) {
            return Array.from(this.#listings.values()).filter(l => l.ownerCozyId === ownerCozyId).map(l => ({ ...l }));
        }
        listByCategory(itemType, category) {
            this.#diagnostics.searchesPerformed++;
            return Array.from(this.#listings.values()).filter(l => l.itemType === itemType && l.category === category && l.status === "active").map(l => ({ ...l }));
        }
        /** search(query, {itemType}) — real, honest substring search across title/description/tags, matching the original applications' own search patterns (not a fabricated relevance-ranked search). */
        search(queryText, { itemType = null } = {}) {
            this.#diagnostics.searchesPerformed++;
            const q = String(queryText || "").toLowerCase();
            return Array.from(this.#listings.values())
                .filter(l => (!itemType || l.itemType === itemType) && l.status === "active")
                .filter(l => l.title.toLowerCase().includes(q) || l.description.toLowerCase().includes(q) || l.tags.some(t => t.toLowerCase().includes(q)))
                .map(l => ({ ...l }));
        }

        getItemTypes() { return Array.from(ITEM_TYPES); }
        getCategories(itemType) { return CATEGORIES[itemType] ? Array.from(CATEGORIES[itemType]) : []; }

        getDiagnosticsReport() { return { pluginVersion: MARKETPLACE_VERSION, ...this.#diagnostics, listingsTracked: this.#listings.size, auditLogSize: this.#auditLog.length }; }
        exportSnapshot() { return { version: MARKETPLACE_VERSION, exportedAt: new Date().toISOString(), listings: Array.from(this.#listings.values()) }; }
        /** importSnapshot(snapshot, {mergeStrategy}) — real restore of listing records; "merge" keeps existing and adds new by listingId, "replace" clears first. */
        importSnapshot(snapshot, { mergeStrategy = "merge" } = {}) {
            if (!snapshot || !Array.isArray(snapshot.listings)) throw new TypeError("[Marketplace] importSnapshot(): snapshot.listings array is required.");
            if (mergeStrategy !== "merge" && mergeStrategy !== "replace") throw new TypeError('[Marketplace] importSnapshot(): mergeStrategy must be "merge" or "replace".');
            if (mergeStrategy === "replace") this.#listings.clear();
            let restored = 0, skipped = 0;
            for (const l of snapshot.listings) {
                if (!l?.listingId) { skipped++; continue; }
                if (mergeStrategy === "merge" && this.#listings.has(l.listingId)) { skipped++; continue; }
                this.#listings.set(l.listingId, Object.freeze({ ...l }));
                restored++;
            }
            this.#logAudit("SNAPSHOT_IMPORTED", `${restored} restored, ${skipped} skipped, strategy=${mergeStrategy}.`);
            return { restored, skipped, mergeStrategy };
        }
        isVersionCompatible(v) { const a = /^v?(\d+)\./.exec(MARKETPLACE_VERSION), b = /^v?(\d+)\./.exec(String(v || "")); return !!(a && b && a[1] === b[1]); }
    }

    if (window.CozyOS.Marketplace && typeof window.CozyOS.Marketplace.getVersion === "function") {
        const existingVersion = window.CozyOS.Marketplace.getVersion();
        if (existingVersion !== MARKETPLACE_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: Marketplace existing v${existingVersion} conflicts with load target v${MARKETPLACE_VERSION}.`);
        return;
    }

    const engineInstance = new CozyMarketplaceEngine();
    window.CozyOS.Marketplace = engineInstance;

    const manifest = {
        id: "marketplace",
        name: "CozyOS Marketplace Engine",
        version: MARKETPLACE_VERSION,
        description: "Real, shared listing lifecycle/taxonomy/search, consolidated from proven duplication across shop/rentals/services/crafts/mobility (Rule 26.2/26.3). Never handles payments, orders, delivery, reviews, or authentication.",
        dependencies: { required: [], optional: ["window.CozyOS.Session"] }
    };

    let kernelRegistrationAttempted = false;
    async function registerWithKernel() {
        if (kernelRegistrationAttempted) return;
        const bootstrap = window.CozyOS?.Kernel?.Bootstrap;
        if (!bootstrap) return;
        kernelRegistrationAttempted = true;
        try {
            await bootstrap.registerService({ name: "Marketplace", version: MARKETPLACE_VERSION, apiVersion: "1.0.0", mandatory: false, dependencies: [] });
            bootstrap.initializeService("Marketplace");
            await bootstrap.verifyService("Marketplace", async () => window.CozyOS.Marketplace.getVersion() === MARKETPLACE_VERSION);
            bootstrap.startService("Marketplace");
        } catch (_err) { /* non-fatal — Marketplace remains fully functional standalone even if Kernel registration fails */ }
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
