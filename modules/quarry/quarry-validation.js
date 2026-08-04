/**
 * CozyOS Quarry Manager — Shared Validation Helpers
 * Reusable, dependency-free validators used to check payloads before
 * they are written to storage or routed to Finance. Purely additive:
 * existing routes keep working unmodified if this file is absent.
 * Attaches to window.CozyOS.Shared.QuarryValidation.
 *
 * ARCHITECTURE INVARIANTS (do not violate when extending this file):
 *  - Every function here is pure: same input -> same output, no I/O.
 *  - Never touches storage, Connectivity.dispatch(), engine.handle(),
 *    routing, the DOM, audit logs, stock, royalties, revenue, or profit.
 *  - Validation only. Business/transaction logic lives elsewhere.
 *
 * v1.1.1 — Production hardening pass (additive only):
 *  - All original exports (requireFields, requireNumber, requireEnum,
 *    requireHeaderKeys) retain identical names, signatures, and throwing
 *    behavior for full backward compatibility.
 *  - Added domain-specific validators for quarry production entries
 *    (machine/operator/parcel IDs, stone type, quantity, price, date,
 *    shift) built on shared internal helpers to eliminate duplication.
 *  - Added a non-throwing, standardized-result entry point
 *    (validateProductionEntry) for callers that prefer a result object
 *    over try/catch.
 *  - Added a pure, stateless duplicate-submission check that compares a
 *    candidate payload against a caller-supplied list of recent entries
 *    (no internal state is stored by this module).
 *  - Magic values consolidated into named constants.
 */
"use strict";

(function () {
    if (!window.CozyOS) window.CozyOS = {};
    if (!window.CozyOS.Shared) window.CozyOS.Shared = {};

    // ── Constants ──────────────────────────────────────────────────────
    // Centralized so validation thresholds/enums aren't duplicated or
    // drift across individual validator functions.

    const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/; // generic safe identifier shape (machine/operator/parcel)

    const VALID_SHIFTS = Object.freeze(["DAY", "NIGHT", "MORNING", "AFTERNOON", "EVENING"]);

    const QUANTITY_LIMITS = Object.freeze({ min: 0.01, max: 1000000 });
    const PRICE_LIMITS = Object.freeze({ min: 0, max: 10000000 });

    const PRODUCTION_REQUIRED_FIELDS = Object.freeze([
        "date", "shift", "machineId", "operator", "parcel", "stoneType", "quantity", "price"
    ]);

    const DUPLICATE_MATCH_FIELDS = Object.freeze([
        "date", "shift", "machineId", "operator", "parcel", "stoneType", "quantity"
    ]);

    // ── Original public API (unchanged names, signatures, behavior) ────

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

    // ── Internal helpers (not exported — used to de-duplicate the new
    //    domain validators below) ───────────────────────────────────────

    /**
     * Shared identifier shape check, used by validateMachineId,
     * validateOperatorId, and validateParcelId so the pattern and error
     * format are defined once instead of three times.
     */
    function requireIdentifier(value, label) {
        if (typeof value !== "string" || !ID_PATTERN.test(value)) {
            throw new Error(`Validation Error: '${label}' must be a non-empty alphanumeric identifier (letters, digits, '_' or '-', max 64 chars).`);
        }
        return value;
    }

    /**
     * Shared non-empty-string check for free-text-ish fields (e.g. stone
     * type) that don't fit a fixed enum but must still be present and
     * reasonably bounded.
     */
    function requireNonEmptyString(value, label, maxLength) {
        if (typeof value !== "string" || value.trim().length === 0) {
            throw new Error(`Validation Error: '${label}' must be a non-empty string.`);
        }
        if (maxLength && value.length > maxLength) {
            throw new Error(`Validation Error: '${label}' must not exceed ${maxLength} characters.`);
        }
        return value;
    }

    /**
     * Shared ISO-ish date check (YYYY-MM-DD or any string parseable by
     * Date). Kept intentionally permissive since upstream forms may send
     * either a date-only string or a full ISO timestamp.
     */
    function requireValidDate(value, label) {
        if (!value || Number.isNaN(Date.parse(value))) {
            throw new Error(`Validation Error: '${label}' must be a valid date.`);
        }
        return value;
    }

    // ── New domain-specific validators (additive) ───────────────────────
    // Each throws Error on failure, matching the existing requireX
    // convention, and returns the validated/normalized value on success.

    function validateMachineId(value) {
        return requireIdentifier(value, "machineId");
    }

    function validateOperatorId(value) {
        return requireIdentifier(value, "operator");
    }

    function validateParcelId(value) {
        return requireIdentifier(value, "parcel");
    }

    function validateStoneType(value) {
        return requireNonEmptyString(value, "stoneType", 64);
    }

    function validateQuantity(value) {
        const n = requireNumber(value, "quantity", { positive: true, min: QUANTITY_LIMITS.min });
        if (n > QUANTITY_LIMITS.max) {
            throw new Error(`Validation Error: 'quantity' must not exceed ${QUANTITY_LIMITS.max}.`);
        }
        return n;
    }

    function validatePrice(value) {
        const n = requireNumber(value, "price", { min: PRICE_LIMITS.min });
        if (n > PRICE_LIMITS.max) {
            throw new Error(`Validation Error: 'price' must not exceed ${PRICE_LIMITS.max}.`);
        }
        return n;
    }

    function validateShift(value) {
        return requireEnum(value, "shift", VALID_SHIFTS);
    }

    function validateDate(value) {
        return requireValidDate(value, "date");
    }

    /**
     * Pure, stateless duplicate-submission check. This module never reads
     * or writes storage itself — callers (e.g. QuarryHandler) are
     * responsible for supplying the set of recent entries to compare
     * against. Two entries are considered duplicates if every field in
     * DUPLICATE_MATCH_FIELDS matches exactly.
     *
     * @param {object} candidate - the payload being validated
     * @param {object[]} recentEntries - recent production entries to compare against
     * @returns {boolean} true if a duplicate is found
     */
    function isDuplicateSubmission(candidate, recentEntries) {
        if (!candidate || !Array.isArray(recentEntries) || recentEntries.length === 0) return false;
        return recentEntries.some((entry) =>
            entry && DUPLICATE_MATCH_FIELDS.every((field) => String(entry[field]) === String(candidate[field]))
        );
    }

    /**
     * Composite, non-throwing validator for a full production entry
     * payload. Returns a standardized result object instead of throwing,
     * for callers that prefer to branch on a result rather than catch
     * exceptions. Internally reuses the same throwing validators above so
     * there is exactly one source of truth per field rule.
     *
     * @param {object} payload
     * @param {object[]} [recentEntries] - optional, enables duplicate detection
     * @returns {{ valid: boolean, errors: string[], normalized: object|null }}
     */
    function validateProductionEntry(payload, recentEntries) {
        const errors = [];
        const normalized = {};

        try {
            requireFields(payload, PRODUCTION_REQUIRED_FIELDS);
        } catch (e) {
            errors.push(e.message);
        }

        const checks = [
            ["date", () => validateDate(payload && payload.date)],
            ["shift", () => validateShift(payload && payload.shift)],
            ["machineId", () => validateMachineId(payload && payload.machineId)],
            ["operator", () => validateOperatorId(payload && payload.operator)],
            ["parcel", () => validateParcelId(payload && payload.parcel)],
            ["stoneType", () => validateStoneType(payload && payload.stoneType)],
            ["quantity", () => validateQuantity(payload && payload.quantity)],
            ["price", () => validatePrice(payload && payload.price)],
        ];

        for (const [key, check] of checks) {
            try {
                normalized[key] = check();
            } catch (e) {
                errors.push(e.message);
            }
        }

        if (errors.length === 0 && Array.isArray(recentEntries) && isDuplicateSubmission(payload, recentEntries)) {
            errors.push("Validation Error: this production entry appears to be a duplicate of a recent submission.");
        }

        return {
            valid: errors.length === 0,
            errors,
            normalized: errors.length === 0 ? normalized : null
        };
    }

    window.CozyOS.Shared.QuarryValidation = {
        // Original API — unchanged
        requireFields,
        requireNumber,
        requireEnum,
        requireHeaderKeys,
        // New, additive API
        validateMachineId,
        validateOperatorId,
        validateParcelId,
        validateStoneType,
        validateQuantity,
        validatePrice,
        validateShift,
        validateDate,
        isDuplicateSubmission,
        validateProductionEntry
    };
})();
