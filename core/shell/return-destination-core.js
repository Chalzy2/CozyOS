'use strict';
/**
 * core/shell/return-destination-core.js
 * CozyOS — Return-Destination Core
 *
 * WHY THIS FILE EXISTS
 * ---------------------
 * chalzydashboard.html's own gate correctly sends an unauthenticated
 * visitor to login.html (see admin-gate-core.js's LOGIN route), but
 * login.html itself always hard-codes its post-auth destination to
 * index.html, discarding that the visitor actually wanted
 * /chalzydashboard. index.html's own centralized routing hint (see
 * post-login-routing-core.js) is a good default for ordinary logins,
 * but is the WRONG destination specifically for this protected-route
 * deep-link case: a normal user who explicitly requested
 * /chalzydashboard must see chalzydashboard.html's own real "Access
 * Denied" state, not be silently substituted onto the ordinary User
 * Dashboard as if they'd never tried to reach the protected route.
 *
 * This module is the one, single, exact-match allowlist standing
 * between a caller-supplied "return" value and the browser's next
 * navigation. It is PURE LOGIC — no DOM, no network, no wildcard/
 * prefix/same-origin-URL parsing of any kind — following this
 * repository's established "-core.js" convention (see
 * admin-gate-core.js, post-login-routing-core.js).
 *
 * WHY EXACT-MATCH, NOT A SMARTER VALIDATOR
 * -------------------------------------------
 * A same-origin check, a "must start with /" check, or a parsed-URL
 * check can all be bypassed by known open-redirect tricks
 * (protocol-relative "//evil.example", "/\evil.example" browser
 * quirks, embedded "javascript:" after whitespace/control characters,
 * double-encoding, etc.). An exact-string membership test against a
 * tiny, fixed allowlist has none of that surface: the output is never
 * a transformed/sanitized version of the input, it is always either
 * one of the two literal strings below, or null.
 *
 * SECURITY BOUNDARY
 * -------------------
 * This module decides which URL the browser navigates to NEXT. It
 * grants nothing. Once the browser is back on /chalzydashboard,
 * chalzydashboard.html's own existing, unchanged, server-verified gate
 * (fetch("/webauthn/session") + admin-gate-core.js) independently
 * decides PLATFORM/DENIED/ERROR exactly as it always has — this module
 * has no way to influence that decision and does not try to.
 */
(function () {
    window.CozyOS = window.CozyOS || {};

    const VERSION = '1.0.0';

    // The ENTIRE allowlist. Deliberately not sourced from
    // ADMIN_CANONICAL_ROUTE/FORBIDDEN_ADMIN_ALIASES (server-side
    // constants in a different file/runtime) — duplicating two literal
    // strings here is simpler and safer than importing server-side
    // constants into a client script, and any future change to the
    // server's route set must be a deliberate edit here too, not an
    // accidental inherited one.
    const ALLOWED_DESTINATIONS = Object.freeze([
        '/chalzydashboard',
        '/chalzydashboard.html',
    ]);

    /**
     * resolveReturnDestination(rawReturnValue) -> string | null
     *   Exact membership test only. Returns the matched allowlisted
     *   string itself (never a modified/re-encoded version of the
     *   input) if rawReturnValue is a string equal to one of
     *   ALLOWED_DESTINATIONS, else null. null means "no valid return
     *   destination" — callers must fall back to their own ordinary
     *   default (e.g. index.html), never to the raw input.
     */
    function resolveReturnDestination(rawReturnValue) {
        if (typeof rawReturnValue !== 'string') return null;
        const candidate = rawReturnValue.trim();
        return ALLOWED_DESTINATIONS.includes(candidate) ? candidate : null;
    }

    window.CozyOS.ReturnDestinationCore = Object.freeze({
        resolveReturnDestination,
        ALLOWED_DESTINATIONS,
        version: VERSION,
    });
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    window.CozyOS.Modules['return-destination-core'] = Object.freeze({
        version: VERSION,
        description: 'Pure logic, no DOM, no network. Exact-match allowlist (never a sanitizer/rewriter) deciding whether a caller-supplied return-destination string is one of the protected admin routes. Not a security boundary itself — chalzydashboard.html\'s own server-verified gate remains authoritative after navigation.',
    });
})();
