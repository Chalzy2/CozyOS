/**
 * CozyOS Quarry Manager — Shared Audit Logger
 * Standardized audit-trail writer for financial/administrative actions.
 * Records: userId, deviceId, timestamp, previousValue, newValue, reason.
 * Writes to the existing storage-backed collection layer (no new data
 * path) and never throws — a failed audit write is logged to console
 * and swallowed so it can never block the business operation it is
 * describing. Attaches to window.CozyOS.Shared.QuarryAudit.
 */
"use strict";

(function () {
    if (!window.CozyOS) window.CozyOS = {};
    if (!window.CozyOS.Shared) window.CozyOS.Shared = {};

    async function record({ collection, action, header, previousValue, newValue, reason, userId, deviceId }) {
        const storage = window.CozyOS?.Storage;
        const identity = window.CozyOS?.Auth?.getCurrentIdentity?.();

        const entry = {
            auditId: "AUD-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
            action,
            collection: collection || null,
            userId: userId || identity?.userId || header?.EmployeeID || "UNKNOWN",
            deviceId: deviceId || header?.DeviceID || "UNKNOWN",
            timestamp: new Date().toISOString(),
            previousValue: previousValue ?? null,
            newValue: newValue ?? null,
            reason: reason || "Not provided"
        };

        if (storage && typeof storage.insert === "function") {
            try {
                await storage.insert("quarry_audit_log", entry);
            } catch (e) {
                console.warn("⚠️ [Quarry Audit] Failed to persist audit entry:", e.message);
            }
        } else {
            console.log("📝 [Quarry Audit - offline]", entry);
        }

        return entry;
    }

    window.CozyOS.Shared.QuarryAudit = { record };
})();
