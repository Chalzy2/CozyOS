/**
 * ChurchOS — Membership Bridge (M328)
 * core/modules/ChurchOS/church-membership-bridge.js
 *
 * OWNERSHIP: genuinely new ground - confirmed by repository-wide
 * search before writing this file that no MemberRegistry/
 * AttendanceEngine/MembershipEngine exists anywhere. Composes the
 * existing, real CozyMemory (storage), OrganizationRegistry (real
 * church/org scoping and existence checks), and Living.transaction
 * (atomic record-keeping, matching M308's pattern) - never a second
 * storage or organization system.
 *
 * REAL AUDIT RESULTS (confirmed before writing this file):
 *   REAL and composed: CozyMemory.saveMemory/readMemory/deleteMemory
 *   (real, confirmed signatures - readMemory requires actorId as a
 *   real positional parameter, not an options field), OrganizationRegistry.
 *   organizationExists() (real church-scoping validation), Living.transaction.
 *   execute() (real atomic operation wrapper).
 *
 *   HONEST GAPS, not fabricated: QR/NFC/biometric attendance capture -
 *   no real reader/scanner engine confirmed to exist; only "manual"
 *   attendance recording is real here. Visitor follow-up reminder
 *   scheduling is not wired to any real reminder engine (none
 *   confirmed to exist).
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    if (window.CozyOS.ChurchMembershipBridge) return;

    const REAL_ATTENDANCE_METHODS = Object.freeze(["manual"]);
    const HONEST_GAP_METHODS = Object.freeze(["qr", "nfc", "phone", "biometric"]);

    class CozyChurchMembershipBridge {
        #requireEngines() {
            const memory = window.CozyOS.CozyMemory;
            const registry = window.CozyOS.OrganizationRegistry;
            if (!memory || !registry) return null;
            return { memory, registry };
        }

        #memberKey(orgId, memberId) { return `${orgId}:${memberId}`; }
        #visitorKey(orgId, visitorId) { return `${orgId}:${visitorId}`; }
        #attendanceKey(orgId, recordId) { return `${orgId}:${recordId}`; }

        async registerMember(orgId, profile, actorId = "system") {
            const engines = this.#requireEngines();
            if (!engines) return { success: false, reason: "CozyMemory/OrganizationRegistry must be loaded." };
            if (!engines.registry.organizationExists(orgId)) return { success: false, reason: `No real organization "${orgId}".` };
            if (!profile || !profile.name) return { success: false, reason: "A real member name is required." };

            const memberId = `member_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const record = { memberId, orgId, ...profile, registeredAt: new Date().toISOString(), status: profile.status || "active" };

            const living = window.CozyOS.Living;
            const store = async () => {
                try {
                    engines.memory.saveMemory("church-members", this.#memberKey(orgId, memberId), record, { owner: orgId, actorId, visibility: "private" });
                    return { success: true, member: record };
                } catch (err) {
                    return { success: false, reason: `Real storage failed: ${err.message}` };
                }
            };

            if (living && living.transaction && typeof living.transaction.execute === "function") {
                return living.transaction.execute({ name: "ChurchOS.registerMember", type: "church-membership", source: "ChurchMembershipBridge" }, store);
            }
            return store();
        }

        getMember(orgId, memberId, actorId = "system") {
            const engines = this.#requireEngines();
            if (!engines) return { available: false, reason: "CozyMemory/OrganizationRegistry must be loaded." };
            try {
                const result = engines.memory.readMemory("church-members", this.#memberKey(orgId, memberId), orgId);
                return result ? { available: true, member: result.value } : { available: false, reason: `No real member found with id "${memberId}".` };
            } catch (err) {
                return { available: false, reason: err.message };
            }
        }

        listMembers(orgId) {
            const engines = this.#requireEngines();
            if (!engines) return { available: false, reason: "CozyMemory/OrganizationRegistry must be loaded." };
            if (typeof engines.memory.listKeys !== "function") return { available: false, reason: "CozyMemory.listKeys() is not available." };
            const entries = engines.memory.listKeys("church-members", (e) => e.key.startsWith(`${orgId}:`));
            return { available: true, members: entries.map(e => e.value) };
        }

        async recordAttendance(orgId, memberId, { method = "manual", actorId = "system", eventDate = null } = {}) {
            const engines = this.#requireEngines();
            if (!engines) return { success: false, reason: "CozyMemory/OrganizationRegistry must be loaded." };
            if (HONEST_GAP_METHODS.includes(method)) {
                return { success: false, reason: `No real "${method}" attendance-capture engine exists in this repository - only "manual" is currently real. Not fabricated.` };
            }
            if (!REAL_ATTENDANCE_METHODS.includes(method)) return { success: false, reason: `"${method}" is not a real, recognized attendance method.` };
            if (!engines.registry.organizationExists(orgId)) return { success: false, reason: `No real organization "${orgId}".` };

            const recordId = `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const record = { recordId, orgId, memberId, method, recordedAt: new Date().toISOString(), eventDate: eventDate || new Date().toISOString().slice(0, 10) };
            try {
                engines.memory.saveMemory("church-attendance", this.#attendanceKey(orgId, recordId), record, { owner: orgId, actorId, visibility: "private" });
                return { success: true, record };
            } catch (err) {
                return { success: false, reason: `Real storage failed: ${err.message}` };
            }
        }

        listAttendance(orgId, eventDate = null) {
            const engines = this.#requireEngines();
            if (!engines) return { available: false, reason: "CozyMemory/OrganizationRegistry must be loaded." };
            if (typeof engines.memory.listKeys !== "function") return { available: false, reason: "CozyMemory.listKeys() is not available." };
            const entries = engines.memory.listKeys("church-attendance", (e) => e.key.startsWith(`${orgId}:`) && (!eventDate || e.value.eventDate === eventDate));
            return { available: true, records: entries.map(e => e.value) };
        }

        async registerVisitor(orgId, profile, actorId = "system") {
            const engines = this.#requireEngines();
            if (!engines) return { success: false, reason: "CozyMemory/OrganizationRegistry must be loaded." };
            if (!engines.registry.organizationExists(orgId)) return { success: false, reason: `No real organization "${orgId}".` };
            if (!profile || !profile.name) return { success: false, reason: "A real visitor name is required." };

            const visitorId = `visitor_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const record = { visitorId, orgId, ...profile, registeredAt: new Date().toISOString() };
            try {
                engines.memory.saveMemory("church-visitors", this.#visitorKey(orgId, visitorId), record, { owner: orgId, actorId, visibility: "private" });
                return { success: true, visitor: record };
            } catch (err) {
                return { success: false, reason: `Real storage failed: ${err.message}` };
            }
        }

        async convertVisitorToMember(orgId, visitorId, additionalProfile = {}, actorId = "system") {
            const engines = this.#requireEngines();
            if (!engines) return { success: false, reason: "CozyMemory/OrganizationRegistry must be loaded." };
            let visitorResult;
            try {
                visitorResult = engines.memory.readMemory("church-visitors", this.#visitorKey(orgId, visitorId), orgId);
            } catch (err) {
                return { success: false, reason: `Real visitor lookup failed: ${err.message}` };
            }
            if (!visitorResult) return { success: false, reason: `No real visitor found with id "${visitorId}".` };

            const { visitorId: _drop, registeredAt: _drop2, ...visitorProfile } = visitorResult.value;
            const memberResult = await this.registerMember(orgId, { ...visitorProfile, ...additionalProfile }, actorId);
            if (!memberResult.success) return memberResult;

            if (typeof engines.memory.deleteMemory === "function") {
                try { engines.memory.deleteMemory("church-visitors", this.#visitorKey(orgId, visitorId), { actorId: orgId, authorized: true }); }
                catch (_err) { /* non-fatal - member was still genuinely created */ }
            }
            return { success: true, member: memberResult.member, convertedFromVisitorId: visitorId };
        }

        getVersion() { return "1.0.0"; }
        getId() { return "ChurchMembershipBridge"; }
        getDependencies() { return ["CozyMemory", "OrganizationRegistry"]; }
    }

    window.CozyOS.ChurchMembershipBridge = new CozyChurchMembershipBridge();
})();
