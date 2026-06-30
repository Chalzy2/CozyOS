/**
 * CozyOS Quarry Manager — Shared Validation Helpers
 * Reusable, dependency-free validators used to check payloads before
 * they are written to storage or routed to Finance. Purely additive:
 * existing routes keep working unmodified if this file is absent.
 * Attaches to window.CozyOS.Shared.QuarryValidation.
 */
"use strict";

(function () {
    if (!window.CozyOS) window.CozyOS = {};
    if (!window.CozyOS.Shared) window.CozyOS.Shared = {};

    function requireFields(payload, fields) {
        const missing = (fields || []).filter(
            (f) => payload == null || payload[f] === undefined || payload[f] === null || payload[f] === ""
        );
        if (missing.length) {
            throw new Error(`Validation Error: missing required field(s): ${missing.join(", ")}`);
        }
        return true;
    }

    function requireNumber(value, label, opts) {
        const n = parseFloat(value);
        if (Number.isNaN(n)) {
            throw new Error(`Validation Error: '${label}' must be a number.`);
        }
        if (opts && opts.positive && n <= 0) {
            throw new Error(`Validation Error: '${label}' must be greater than zero.`);
        }
        if (opts && opts.min !== undefined && n < opts.min) {
            throw new Error(`Validation Error: '${label}' must be >= ${opts.min}.`);
        }
        return n;
    }

    function requireEnum(value, label, allowed, fallback) {
        if (allowed.includes(value)) return value;
        if (fallback !== undefined) return fallback;
        throw new Error(`Validation Error: '${label}' must be one of: ${allowed.join(", ")}.`);
    }

    function requireHeaderKeys(header, mandatoryKeys) {
        const headerKeys = Object.keys(header || {});
        const ok = mandatoryKeys.every((k) => headerKeys.includes(k));
        if (!ok) {
            throw new Error("[Kernel Security Panic] Transaction execution denied: Missing Seven-Key Tracking Elements.");
        }
        return true;
    }

    window.CozyOS.Shared.QuarryValidation = {
        requireFields,
        requireNumber,
        requireEnum,
        requireHeaderKeys
    };
})();
