/**
 * PharmacyOS — Core (Phase 1)
 * File Reference: core/plugins/pharmacyOS-core.js
 * Layer: Business Domain — Application (ServiceRegistry-registered)
 * Version: 1.0.0
 *
 * REPLACES the prior fake, hardcoded PharmacyOS stub
 * (core/plugins/pharmacyOS.js, core/ai/pharmacyHandler.js). Those files
 * returned canned strings ("All items synchronized", "3 drug batches
 * are approaching shelf stability deadlines") regardless of real input
 * or state - never real capability. This file replaces them with a
 * genuine, minimal Phase 1: real organization setup (reusing the same
 * OrganizationRegistry pattern already proven by ChurchOS's
 * setupChurch()), and a real, in-memory medicine catalog with
 * controlled-substance-aware access delegated entirely to
 * IdentityEngine - never a second authorization system.
 *
 * WHAT THIS FILE DOES NOT DO (Phase 1 boundary, VISION not built here):
 *   - No prescription dispensing/verification.
 *   - No patient records.
 *   - No expiry/batch tracking.
 *   - No stock-quantity/reorder logic.
 *   - No clinical decision support.
 *   - No payment processing.
 * None of these are faked; asking for them honestly returns
 * "not implemented" rather than a fabricated result.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const PHARMACY_VERSION = "1.0.0";

    class PharmacyOSCore {
        #medicines = new Map();
        #auditLog = [];
        #diagnostics = { medicinesCreated: 0, controlledAccessDenied: 0, controlledAccessGranted: 0 };

        getVersion() { return PHARMACY_VERSION; }

        #deepClone(v) {
            if (typeof structuredClone === "function") { try { return structuredClone(v); } catch (_e) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; }
        }

        #generateId(prefix) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }

        #logAudit(actor, action, entity, entityId, before = null, after = null) {
            const record = Object.freeze({ id: this.#generateId("aud"), actor, action, entity, entityId, before, after, timestamp: new Date().toISOString() });
            this.#auditLog.push(record);
            if (this.#auditLog.length > 2000) this.#auditLog.shift();
        }

        getAuditLog(predicate) {
            const list = this.#auditLog.map((e) => this.#deepClone(e));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

        setupPharmacy(rawInput = {}) {
            const registry = window.CozyOS.OrganizationRegistry;
            if (!registry) throw new Error("[pharmacyOS-core] setupPharmacy(): OrganizationRegistry is not loaded — cannot create a real organization without it.");
            const name = typeof rawInput.name === "string" ? rawInput.name.trim() : "";
            if (!name) throw new TypeError("[pharmacyOS-core] setupPharmacy(): name is required.");
            const org = registry.createOrganization({ name, type: "Pharmacy", notes: rawInput.notes || null });
            this.#logAudit(rawInput.actorId || "system", "PHARMACY_SETUP", "Organization", org.orgId, null, { name });
            return org;
        }

        #hasPermission(actorId, requiredPermission) {
            const identity = window.CozyOS.IdentityEngine;
            if (!identity || typeof identity.checkPermission !== "function") return false;
            try { return !!identity.checkPermission(actorId, requiredPermission); }
            catch (_err) { return false; }
        }

        createMedicine(rawInput = {}) {
            const orgId = rawInput.orgId;
            if (!orgId) throw new TypeError("[pharmacyOS-core] createMedicine(): orgId is required.");
            const registry = window.CozyOS.OrganizationRegistry;
            if (!registry || typeof registry.organizationExists !== "function" || !registry.organizationExists(orgId)) {
                throw new Error(`[pharmacyOS-core] createMedicine(): unknown organization "${orgId}" — a real, registered pharmacy organization is required.`);
            }
            const name = typeof rawInput.name === "string" ? rawInput.name.trim() : "";
            if (!name) throw new TypeError("[pharmacyOS-core] createMedicine(): name is required.");
            const isControlledSubstance = !!rawInput.isControlledSubstance;
            const actorId = rawInput.actorId || null;

            if (isControlledSubstance) {
                if (!this.#hasPermission(actorId, "pharmacy.controlled.manage")) {
                    this.#diagnostics.controlledAccessDenied++;
                    this.#logAudit(actorId, "CONTROLLED_MEDICINE_CREATE_DENIED", "Medicine", null, null, { name });
                    throw new Error("[pharmacyOS-core] createMedicine(): controlled-substance access denied — a real, granted \"pharmacy.controlled.manage\" permission is required.");
                }
                this.#diagnostics.controlledAccessGranted++;
            }

            const medicineId = this.#generateId("med");
            const record = Object.freeze({
                medicineId, orgId, name,
                category: rawInput.category || null,
                isControlledSubstance,
                createdAt: new Date().toISOString(),
                createdBy: actorId
            });
            this.#medicines.set(medicineId, record);
            this.#diagnostics.medicinesCreated++;
            this.#logAudit(actorId, "MEDICINE_CREATED", "Medicine", medicineId, null, record);
            return record;
        }

        getMedicine(medicineId, actorId = null) {
            const record = this.#medicines.get(medicineId);
            if (!record) return null;
            if (record.isControlledSubstance && !this.#hasPermission(actorId, "pharmacy.controlled.manage")) {
                this.#diagnostics.controlledAccessDenied++;
                this.#logAudit(actorId, "CONTROLLED_MEDICINE_VIEW_DENIED", "Medicine", medicineId);
                return { available: false, reason: "Controlled-substance access denied." };
            }
            return { available: true, medicine: this.#deepClone(record) };
        }

        listMedicines({ orgId, actorId = null } = {}) {
            if (!orgId) throw new TypeError("[pharmacyOS-core] listMedicines(): orgId is required.");
            const canSeeControlled = this.#hasPermission(actorId, "pharmacy.controlled.manage");
            return Array.from(this.#medicines.values())
                .filter((m) => m.orgId === orgId)
                .filter((m) => !m.isControlledSubstance || canSeeControlled)
                .map((m) => this.#deepClone(m));
        }

        updateMedicine(medicineId, rawChanges = {}, actorId = null) {
            const existing = this.#medicines.get(medicineId);
            if (!existing) throw new Error(`[pharmacyOS-core] updateMedicine(): unknown medicineId "${medicineId}".`);
            const willBeControlled = rawChanges.isControlledSubstance !== undefined ? !!rawChanges.isControlledSubstance : existing.isControlledSubstance;
            if ((existing.isControlledSubstance || willBeControlled) && !this.#hasPermission(actorId, "pharmacy.controlled.manage")) {
                this.#diagnostics.controlledAccessDenied++;
                this.#logAudit(actorId, "CONTROLLED_MEDICINE_UPDATE_DENIED", "Medicine", medicineId);
                throw new Error("[pharmacyOS-core] updateMedicine(): controlled-substance access denied.");
            }
            const updated = Object.freeze({
                ...existing,
                name: typeof rawChanges.name === "string" && rawChanges.name.trim() ? rawChanges.name.trim() : existing.name,
                category: rawChanges.category !== undefined ? rawChanges.category : existing.category,
                isControlledSubstance: willBeControlled,
                updatedAt: new Date().toISOString(),
                updatedBy: actorId
            });
            this.#medicines.set(medicineId, updated);
            this.#logAudit(actorId, "MEDICINE_UPDATED", "Medicine", medicineId, existing, updated);
            return updated;
        }

        getDiagnosticsReport() {
            return this.#deepClone({ moduleVersion: PHARMACY_VERSION, ...this.#diagnostics, medicineCount: this.#medicines.size, auditLogSize: this.#auditLog.length });
        }
    }

    if (window.CozyOS.PharmacyOS && typeof window.CozyOS.PharmacyOS.getVersion === "function") {
        const existingVersion = window.CozyOS.PharmacyOS.getVersion();
        if (existingVersion !== PHARMACY_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: PharmacyOS existing v${existingVersion} conflicts with load target v${PHARMACY_VERSION}.`);
        return;
    }

    const instance = new PharmacyOSCore();
    window.CozyOS.PharmacyOS = instance;

    instance.visibility = Object.freeze({
        appId: "pharmacyOS", name: "PharmacyOS", icon: "💊", category: "business-application",
        launchTarget: Object.freeze({ center: "pharmacyOS" }),
        audience: "all"
    });

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerApplication === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerApplication({
                id: "pharmacyos_core_001", name: "PharmacyOS", category: "Business Application",
                version: PHARMACY_VERSION, enabled: true,
                // Real fix (Level 2B repair): this application had no
                // entryPoint at all, so ApplicationVisibility.
                // getRealLaunchPath() (the same real, single source the
                // Apps-surface tile and every other real business app
                // already use) could never resolve a destination for
                // it, even though the real Phase 1 UI already existed
                // on disk at applications/PharmacyOS/pharmacyos.html.
                // See that file's own header for the accompanying real
                // <head>-wrapper fix this destination also needed.
                entryPoint: "applications/PharmacyOS/pharmacyos.html", launcher: "core/plugins/pharmacyOS-core.js",
                description: "Phase 1: real pharmacy organization setup (reusing OrganizationRegistry) and a real medicine catalog (create/get/list/update) with controlled-substance access delegated entirely to IdentityEngine. Prescription dispensing, patient records, expiry/batch tracking, stock quantity, and clinical decision support are not yet built.",
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
