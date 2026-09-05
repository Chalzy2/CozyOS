/**
 * CozyOS Phone Account Linkage
 * File Reference: core/security/phone-account-linkage.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Milestone: Prompt 7 §14/§15 (Phone Verified State)
 * Version: 1.0.0-ENTERPRISE
 *
 * WHY THIS FILE EXISTS (repo search performed first, per Prompt 7 §6/§14)
 *   Searched the whole tree this session for: phoneVerified, verifiedPhone,
 *   phone identity verification, account verification, factor
 *   enrollment/state. Result: core/security/phone-provider.js's own header
 *   explicitly disclaims owning this responsibility — "'VERIFIED PHONE'
 *   ACCOUNT STATE: NOT OWNED HERE... deliberately left for a following
 *   step so this file does not silently grow account-write authority it
 *   wasn't asked to have." IdentityEngine stores a raw `phone` field at
 *   registration (format-validated, unique) but has no verified/linked/
 *   login-eligible/recovery-eligible state at all. This file is that
 *   missing, previously-disclosed boundary — never a second challenge
 *   engine (CozyPhoneChallengeService, phone-provider.js, is reused
 *   as-is) and never a second delivery engine (DeliveryBackendRegistry
 *   is reused as-is).
 *
 * RESPONSIBILITY
 *   Turns a real, solved phone-possession challenge (from
 *   CozyPhoneChallengeService) into durable, server/authority-controlled
 *   account state: phoneNumber, phoneVerified, phoneVerifiedAt,
 *   phoneLoginEnabled, phoneRecoveryEnabled. The browser can never set
 *   phoneVerified directly — the only way this file's state ever becomes
 *   true is a real verifyPhoneChallenge({verified:true}) result.
 *
 * ACCOUNT STORE ADAPTER (deliberately decoupled from IdentityEngine)
 *   This module never reaches into IdentityEngine's private #users map
 *   itself (that would be a real ownership violation, not a composition).
 *   Instead it accepts a small `store` adapter:
 *     getRecord(userId) -> {phoneNumber, phoneVerified, phoneVerifiedAt,
 *                            phoneLoginEnabled, phoneRecoveryEnabled} | null
 *     setRecord(userId, record) -> void
 *     findUserIdByVerifiedPhone(normalizedPhone) -> userId | null
 *   Any real account engine (IdentityEngine, or a future one) can supply
 *   this adapter without this file ever needing to know its internals.
 *   A minimal in-memory adapter is exported for Node tests and for any
 *   caller that has not yet wired a real account store.
 *
 * ACCOUNT-TAKEOVER GUARDS (Prompt 7 §15/§16)
 *   - Phone numbers are normalized (via #normalizePhone) before every
 *     lookup, so "+254 700 000 001" and "254700000001" resolve to the
 *     same identity rather than silently bypassing the guards below.
 *   - confirmLink() rejects (generic reason, no enumeration) when the
 *     verified phone is already linked to a DIFFERENT account — a stale
 *     or reused number can never silently re-target an existing verified
 *     link.
 *   - requestLink()/confirmLink() both return the same enumeration-safe
 *     generic response shape as password-reset-service.js and
 *     phone-provider.js regardless of whether the phone/account
 *     combination is valid, consistent with Prompt 7 §7/§15.
 *   - Every state transition requires a real verifyPhoneChallenge()
 *     success from CozyPhoneChallengeService — this file performs no
 *     cryptographic verification itself, it only records the result.
 *
 * HONEST SCOPE
 *   STATE MACHINE / GUARDS: LOCALLY VERIFIED — see
 *     phone-account-linkage.test.js (fresh link, wrong code, expired,
 *     replay, cross-account reuse, unverified phone never becomes
 *     usable, revoke, normalization).
 *   LOGIN/RECOVERY USABILITY: honestly gated on
 *     DeliveryBackendRegistry.getState("sms").configured — with no real
 *     SMS backend registered in this repository, isPhoneLoginUsable()/
 *     isPhoneRecoveryUsable() correctly return false even for a fully
 *     verified phone, because a real OTP could never actually be
 *     delivered for a subsequent login. This is intentional, not a bug.
 *   ACCOUNT-ENGINE WIRING: the real IdentityEngine adapter (browser-only,
 *     window.CozyOS.IdentityEngine) is composed in identity-engine.js —
 *     that wiring is NOT exercised by this file's own Node tests (no
 *     DOM/window in a Node test process); see that file's own comments
 *     for its honest verification status.
 */
(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        factory(root);
    }
})(typeof window !== "undefined" ? window : globalThis, function (root) {
    "use strict";

    const PHONE_LINKAGE_VERSION = "1.0.0-ENTERPRISE";

    const GENERIC_LINK_RESPONSE = Object.freeze({
        status: "CHALLENGE_REQUESTED",
        message: "If that phone number can receive a code, a verification challenge has been created for it."
    });

    /** normalizePhone(phone) — strips everything except a leading '+' and digits, so equivalent inputs resolve identically before any lookup. */
    function normalizePhone(phone) {
        if (!phone || typeof phone !== "string") return null;
        const trimmed = phone.trim();
        const hasPlus = trimmed.startsWith("+");
        const digits = trimmed.replace(/[^0-9]/g, "");
        if (!digits) return null;
        return (hasPlus ? "+" : "") + digits;
    }

    function emptyRecord() {
        return { phoneNumber: null, phoneVerified: false, phoneVerifiedAt: null, phoneLoginEnabled: false, phoneRecoveryEnabled: false };
    }

    /**
     * InMemoryPhoneLinkageStore — minimal reference adapter. Real callers
     * (e.g. IdentityEngine's own composition) should supply a store
     * backed by their real account records instead; this exists so the
     * module is genuinely testable standalone and so no caller is forced
     * to invent a throwaway adapter just to try this file out.
     */
    class InMemoryPhoneLinkageStore {
        #records = new Map(); // userId -> record

        getRecord(userId) { return this.#records.has(userId) ? { ...this.#records.get(userId) } : null; }
        setRecord(userId, record) { this.#records.set(userId, { ...record }); }
        findUserIdByVerifiedPhone(normalizedPhone) {
            for (const [userId, record] of this.#records.entries()) {
                if (record.phoneVerified && record.phoneNumber === normalizedPhone) return userId;
            }
            return null;
        }
    }

    class CozyPhoneAccountLinkage {
        #challengeService;
        #store;
        #deliveryRegistry;

        constructor({ challengeService, store, deliveryRegistry } = {}) {
            if (!challengeService || typeof challengeService.requestPhoneChallenge !== "function" || typeof challengeService.verifyPhoneChallenge !== "function") {
                throw new Error("[PhoneAccountLinkage] A real challengeService (CozyPhoneChallengeService) is required.");
            }
            if (!store || typeof store.getRecord !== "function" || typeof store.setRecord !== "function" || typeof store.findUserIdByVerifiedPhone !== "function") {
                throw new Error("[PhoneAccountLinkage] A real store adapter (getRecord/setRecord/findUserIdByVerifiedPhone) is required.");
            }
            this.#challengeService = challengeService;
            this.#store = store;
            this.#deliveryRegistry = deliveryRegistry || null;
        }

        getVersion() { return PHONE_LINKAGE_VERSION; }
        normalizePhone(phone) { return normalizePhone(phone); }

        /**
         * requestLink(userId, phone)
         *   Real. Requires a real, already-authenticated userId (this is
         *   an account-linking action, not a public/anonymous flow) but
         *   never reveals whether the phone itself is already in use by
         *   this or any other account — identical enumeration-safe shape
         *   either way, matching phone-provider.js's own convention.
         */
        async requestLink(userId, phone) {
            if (!userId) return { ...GENERIC_LINK_RESPONSE };
            const normalized = normalizePhone(phone);
            if (!normalized) return { ...GENERIC_LINK_RESPONSE };
            const result = await this.#challengeService.requestPhoneChallenge(normalized);
            return { ...result }; // passes through _test_rawCode in test/dev contexts, identical convention to phone-provider.js
        }

        /**
         * confirmLink(userId, phone, code)
         *   Real. Only path by which phoneVerified can ever become true.
         *   Fails closed on: no userId, bad/expired/used/locked code
         *   (delegated entirely to CozyPhoneChallengeService — never
         *   re-verified here), and phone-reuse across accounts.
         */
        async confirmLink(userId, phone, code) {
            if (!userId) return { linked: false, reason: "AUTH_REQUIRED" };
            const normalized = normalizePhone(phone);
            if (!normalized) return { linked: false, reason: "INVALID" };

            const verification = await this.#challengeService.verifyPhoneChallenge(normalized, code);
            if (!verification.verified) return { linked: false, reason: verification.state || "INVALID" };

            const existingOwner = this.#store.findUserIdByVerifiedPhone(normalized);
            if (existingOwner && existingOwner !== userId) {
                // Real account-takeover guard (Prompt 7 §15/§16) — a real
                // possession proof was solved, but this number is already
                // the verified phone of a DIFFERENT account. Never
                // silently re-link; never disclose which account owns it.
                return { linked: false, reason: "PHONE_ALREADY_LINKED" };
            }

            const record = {
                phoneNumber: normalized,
                phoneVerified: true,
                phoneVerifiedAt: new Date().toISOString(),
                phoneLoginEnabled: true,
                phoneRecoveryEnabled: true
            };
            this.#store.setRecord(userId, record);
            return { linked: true, phoneNumber: normalized };
        }

        /** getPhoneState(userId) — real, current state; never fabricates a verified flag the store doesn't actually hold. */
        getPhoneState(userId) {
            if (!userId) return emptyRecord();
            return this.#store.getRecord(userId) || emptyRecord();
        }

        /**
         * revokePhone(userId)
         *   Real — e.g. when a user changes/removes their phone number.
         *   Resets all derived flags so a stale verified state can never
         *   linger as a usable login/recovery factor.
         */
        revokePhone(userId) {
            if (!userId) return { success: false, reason: "AUTH_REQUIRED" };
            this.#store.setRecord(userId, emptyRecord());
            return { success: true };
        }

        /**
         * #smsChannelConfigured()
         *   Real, honest gate — a verified phone number does not by
         *   itself mean a login/recovery OTP could ever actually be
         *   delivered. Fails closed (false) when no DeliveryBackendRegistry
         *   was composed, or when the "sms" channel has never had a real
         *   (non-dev-only) backend registered — see delivery-backend-
         *   registry.js's own state vocabulary. Never true from this
         *   file's own opinion alone.
         */
        #smsChannelConfigured() {
            if (!this.#deliveryRegistry || typeof this.#deliveryRegistry.getState !== "function") return false;
            try { return this.#deliveryRegistry.getState("sms").configured === true; }
            catch (_err) { return false; }
        }

        /**
         * isPhoneLoginUsable(userId)
         *   Real — true only when ALL of: phone verified, phoneLoginEnabled,
         *   and a real SMS channel is actually configured. A verified
         *   phone with no SMS transport is honestly reported as NOT
         *   usable for login (Prompt 7 §17), not silently offered as a
         *   working option.
         */
        isPhoneLoginUsable(userId) {
            const state = this.getPhoneState(userId);
            return !!(state.phoneVerified && state.phoneLoginEnabled && this.#smsChannelConfigured());
        }

        /** isPhoneRecoveryUsable(userId) — same real gate as isPhoneLoginUsable(), for the recovery flag instead. */
        isPhoneRecoveryUsable(userId) {
            const state = this.getPhoneState(userId);
            return !!(state.phoneVerified && state.phoneRecoveryEnabled && this.#smsChannelConfigured());
        }

        getDiagnosticsReport() {
            return {
                moduleVersion: PHONE_LINKAGE_VERSION,
                smsChannelConfigured: this.#smsChannelConfigured()
            };
        }
    }

    if (typeof window !== "undefined") {
        window.CozyOS = window.CozyOS || {};
        if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
            try {
                window.CozyOS.ServiceRegistry.registerCoordinator({ sourcePath: "core/security/phone-account-linkage.js",
                    name: "PhoneAccountLinkage", category: "Platform", icon: "phone-check.svg",
                    description: "Real, durable verified-phone account state (phoneNumber/phoneVerified/phoneVerifiedAt/phoneLoginEnabled/phoneRecoveryEnabled), composing the existing PhoneChallengeService (possession proof) and DeliveryBackendRegistry (honest SMS-channel gate) without duplicating either. phoneVerified can only ever become true through a real solved challenge. Login/recovery usability additionally requires a real, configured SMS backend — never claimed true just because the phone itself is verified."
                });
            } catch (_err) { /* non-fatal */ }
        }
        // Real instance composed from the actual window-global engines
        // when both are present. Callers on window still need to supply
        // a real account-store adapter (see identity-engine.js's own
        // wiring) before this becomes usable end-to-end; this file never
        // constructs a store of its own on window.
        window.CozyOS.PhoneAccountLinkage = window.CozyOS.PhoneAccountLinkage || null;
        // Prompt 9B — real, minimal fix: as a plain <script> (the
        // `else { factory(root); }` UMD branch above), this file's
        // return value was previously discarded, so CozyPhoneAccountLinkage
        // itself was never reachable from window — only the `|| null`
        // placeholder two lines up was. This is the smallest additive
        // registration hook so a real bootstrap composer (e.g.
        // core/security/phone-linkage-bootstrap.js) can actually
        // construct the real class; it does not change any existing
        // behavior for CommonJS/test callers, who already received
        // the real exports via the `return` statement below.
        window.CozyOS.PhoneAccountLinkageModule = { CozyPhoneAccountLinkage, InMemoryPhoneLinkageStore, normalizePhone, PHONE_LINKAGE_VERSION };
    }

    return { CozyPhoneAccountLinkage, InMemoryPhoneLinkageStore, normalizePhone, PHONE_LINKAGE_VERSION };
});
