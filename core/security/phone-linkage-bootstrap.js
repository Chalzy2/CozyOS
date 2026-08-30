/**
 * CozyOS Phone Linkage Bootstrap
 * File Reference: core/security/phone-linkage-bootstrap.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Milestone: Prompt 9B (Persistent Phone Linkage)
 * Version: 1.0.0-ENTERPRISE
 *
 * WHY THIS FILE EXISTS
 *   core/modules/identity/auth-coordinator.js already reads
 *   window.CozyOS.PhoneAccountLinkage, but nothing in the repository
 *   ever assigned it (confirmed by direct search — Prompt 9B
 *   discovery). Every real dependency CozyPhoneAccountLinkage needs
 *   now genuinely exists and self-registers on script load:
 *   window.CozyOS.PhoneChallengeService (phone-provider.js),
 *   window.CozyOS.DeliveryBackendRegistry (delivery-backend-registry.js),
 *   window.CozyOS.IdentityStorage (identity-storage.js), and
 *   window.CozyOS.PhoneLinkageStoreAdapter (this milestone). This file
 *   is the smallest additive seam that composes them into the one
 *   authoritative production CozyPhoneAccountLinkage instance —
 *   it constructs nothing new, verifies nothing itself, and stores
 *   nothing itself.
 *
 * WHY dashboard.html, NOT core/bootstrap/bootstrap.js
 *   Milestone 131d/132a (recorded in dashboard.html itself) already
 *   established dashboard.html as the one canonical production entry
 *   point and the one real Login Gate; core/bootstrap/bootstrap.js
 *   only replays dashboard.html's own real <script> sequence for
 *   index.html at runtime, it is not a second source of truth for
 *   what that sequence contains. This file is loaded as a normal
 *   <script> in that same real sequence, so index.html inherits it
 *   automatically without any bootstrap.js change.
 *
 * FAIL-CLOSED ASSIGNMENT
 *   window.CozyOS.PhoneAccountLinkage is intentionally left
 *   UNASSIGNED until hydration genuinely completes. AuthCoordinator's
 *   existing `window.CozyOS && window.CozyOS.PhoneAccountLinkage`
 *   check already treats "not present" as "unavailable" — exactly
 *   the correct behavior while the adapter is mid-hydration, so this
 *   file does not need to (and must not) publish a half-ready
 *   instance just to make the global exist earlier.
 *
 * ONE AUTHORITATIVE INSTANCE
 *   Guarded the same way every other real CozyOS singleton in this
 *   repo guards itself (auth-factor-snapshot.js, identity-storage.js,
 *   etc.) — running this script twice never constructs a second
 *   adapter/linkage pair.
 *
 * HONEST SCOPE
 *   Real IndexedDB hydration is unverified by execution in this
 *   sandbox (no browser/indexedDB global exists here) — this file's
 *   own logic was exercised via a real node:test harness with a
 *   window-shaped fixture standing in for the DOM globals; the
 *   underlying IndexedDB calls inherit identity-storage.js's own
 *   already-disclosed "unverified by execution" limitation. Genuine
 *   browser verification is still required before this is relied on
 *   in production.
 */
(function () {
    "use strict";
    if (typeof window === "undefined") return; // browser-only wiring, matches this repo's own convention for bootstrap seams
    window.CozyOS = window.CozyOS || {};

    if (window.CozyOS._phoneLinkageBootstrapStarted) return; // one authoritative instance per runtime
    window.CozyOS._phoneLinkageBootstrapStarted = true;

    const challengeService = window.CozyOS.PhoneChallengeService;
    const deliveryRegistry = window.CozyOS.DeliveryBackendRegistry || null;
    const identityStorage = window.CozyOS.IdentityStorage;
    const AdapterModule = window.CozyOS.PhoneLinkageStoreAdapter;
    const LinkageModule = window.CozyOS.PhoneAccountLinkageModule; // see phone-account-linkage.js UMD note below

    if (!challengeService || !identityStorage || !AdapterModule || !LinkageModule) {
        if (typeof console !== "undefined") {
            console.warn("[PhoneLinkageBootstrap] One or more real dependencies are missing (PhoneChallengeService/IdentityStorage/PhoneLinkageStoreAdapter/PhoneAccountLinkageModule) — window.CozyOS.PhoneAccountLinkage will remain unassigned, and AuthCoordinator will correctly treat phone as unavailable rather than falsely enabling it.");
        }
        return;
    }

    const adapter = new AdapterModule.PhoneLinkageStoreAdapter({ identityStorage });

    adapter.initialize().then(() => {
        window.CozyOS.PhoneAccountLinkage = new LinkageModule.CozyPhoneAccountLinkage({ challengeService, store: adapter, deliveryRegistry });
        if (typeof window.CozyOS.PlatformEventBus !== "undefined" && window.CozyOS.PlatformEventBus && typeof window.CozyOS.PlatformEventBus.emit === "function") {
            try { window.CozyOS.PlatformEventBus.emit("phoneLinkage:ready", {}); } catch (_err) { /* non-fatal */ }
        }
    }).catch((err) => {
        if (typeof console !== "undefined") {
            console.warn("[PhoneLinkageBootstrap] Adapter hydration failed — window.CozyOS.PhoneAccountLinkage stays unassigned (fail closed): " + (err && err.message ? err.message : err));
        }
    });
})();
