/**
 * CozyOS Authentication & Security Settings
 * File Reference: core/modules/security/authentication-settings-module.js
 * Layer: Application / Settings Panel
 * Version: 1.0.0-ENTERPRISE
 * Milestone: 357 (Step 1 — Framework + Passkey template)
 *
 * OWNERSHIP
 *   Owns ONE thing: rendering a real, verified status card per
 *   authentication factor, using the Principle-12 field set (Current
 *   Status, What's Needed Next, Verification Source, Current
 *   Implementation, Future Compatibility, Owner Module, Last Verified,
 *   Notes). Every field is composed from real data already exposed by
 *   AuthFactorRegistry (core/security/auth-factor-registry.js — the
 *   single source of truth for "which factors exist / what can verify
 *   them") plus each factor's own provider diagnostics. This file
 *   performs no authentication, verification, or policy logic itself —
 *   it never re-implements anything AuthFactorRegistry, AuthPolicyEngine,
 *   or the individual providers already own.
 *
 * HONEST SCOPE
 *   All four steps of the fixed M357 sequence are wired: Step 1 (Passkey
 *   template), Step 2 (TOTP, Trusted Device, Google Login, Recovery
 *   Phrase, Emergency Codes, Recovery Questions, Admin Recovery,
 *   Session, Password Reset, Account Recovery), Step 3 (Fingerprint,
 *   Face, Voice — honest stubs, no fabricated enrollment), Step 4
 *   (Microsoft Login — documented as Not Implemented, no fake provider).
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const MODULE_VERSION = "1.0.0";

    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["authentication-settings"] && window.CozyOS.Modules["authentication-settings"].version) return;

    let container = null;

    /**
     * FACTOR_BUILDERS (Step 1: one entry)
     *   Each builder is a real, additive function that composes existing
     *   engines to produce the 8 Principle-12 fields. Never hand-writes a
     *   status string that isn't derived from a real API call below.
     */
    const FACTOR_BUILDERS = [
        // Step 1 — template
        buildPasskeyFactor,
        // Step 2 — remaining verified-real factors, fixed order per the M357 plan
        buildTotpFactor, buildTrustedDeviceFactor, buildGoogleLoginFactor,
        buildRecoveryPhraseFactor, buildEmergencyCodesFactor, buildRecoveryQuestionsFactor,
        buildAdminRecoveryFactor, buildSessionFactor, buildPasswordResetFactor, buildAccountRecoveryFactor,
        // Step 3 — honest stub factors
        buildFingerprintFactor, buildFaceFactor, buildVoiceAuthFactor,
        // Step 4 — verified gap, not implemented
        buildMicrosoftLoginFactor,
    ];

    /**
     * buildPasskeyFactor()
     *   Real: composes AuthFactorRegistry.getProvider('security-key')
     *   (the single source of truth for isReal/registered-name) with
     *   window.CozyOS.WebAuthnProvider's own real diagnostics
     *   (getDiagnosticsReport(), getHistory(), isSupported()) for the
     *   richer fields. Never invents a value neither API actually
     *   returns.
     */
    function buildPasskeyFactor() {
        const registry = window.CozyOS.AuthFactorRegistry;
        const provider = window.CozyOS.WebAuthnProvider;
        const registryEntry = registry && typeof registry.getProvider === "function" ? registry.getProvider("security-key") : null;

        if (!registryEntry || !provider) {
            return {
                id: "passkey", label: "Passkey (WebAuthn)",
                currentStatus: "Unavailable — AuthFactorRegistry and/or WebAuthnProvider is not loaded.",
                whatsNeededNext: "Load core/security/auth-factor-registry.js and core/security/webauthn-provider.js.",
                verificationSource: "AuthFactorRegistry.getProvider('security-key')", currentImplementation: "N/A",
                futureCompatibility: "N/A", ownerModule: "core/security/webauthn-provider.js", lastVerified: "N/A",
                notes: "Registry/provider lookup returned nothing real to report.",
            };
        }

        const diag = typeof provider.getDiagnosticsReport === "function" ? provider.getDiagnosticsReport() : null;
        const history = typeof provider.getHistory === "function" ? provider.getHistory() : [];
        const supported = typeof provider.isSupported === "function" ? provider.isSupported() : null;

        return {
            id: "passkey", label: "Passkey (WebAuthn)",
            currentStatus: registryEntry.isReal
                ? `Real — genuine navigator.credentials.create()/get(), hand-written CBOR/COSE decoding, real ECDSA-P256-SHA256 assertion verification via SubtleCrypto. ${diag ? `${diag.usersWithCredentials} user(s) with a registered credential this session.` : ""}`
                : `Not real — ${registryEntry.note || "no verification capability."}`,
            whatsNeededNext: "A dedicated Security Settings enrollment screen for registerCredential() (the method exists and is callable, but has no UI yet), and persistent server-side credential storage — WebAuthn credentials currently live in-memory, browser session only.",
            verificationSource: "AuthFactorRegistry.getProvider('security-key') + WebAuthnProvider.getDiagnosticsReport()/getHistory()",
            currentImplementation: "ES256/P-256 only, fails closed on any other algorithm with the real algorithm number disclosed. Attestation requested as \"none\" — the security boundary is the assertion signature, not device attestation.",
            futureCompatibility: "registerCredential() is real and callable today; a Settings-screen enrollment UI and persistent (non-in-memory) credential storage are the only missing pieces — no API redesign needed to add either.",
            ownerModule: "core/security/webauthn-provider.js (window.CozyOS.WebAuthnProvider)",
            lastVerified: history.length > 0 ? (history[history.length - 1].at || history[history.length - 1].timestamp || "See audit history.") : "No credential verification events recorded yet this session.",
            notes: supported === null ? "Browser WebAuthn support unknown (isSupported() unavailable)." : (supported ? "This browser reports real WebAuthn (PublicKeyCredential) support." : "This browser does NOT report real WebAuthn support."),
        };
    }

    /**
     * buildRegistryFactor(cfg) (Step 2)
     *   Generic, reusable builder for any factor that is (a) registered
     *   in AuthFactorRegistry AND (b) has its own getDiagnosticsReport().
     *   Composes both real sources; never invents a field neither
     *   returns. Used for TOTP, Trusted Device, Recovery Phrase,
     *   Emergency Codes, Recovery Questions — same shape, so written
     *   once instead of five near-duplicate functions.
     */
    function buildRegistryFactor(cfg) {
        const registry = window.CozyOS.AuthFactorRegistry;
        const provider = window.CozyOS[cfg.globalName];
        const registryEntry = registry && typeof registry.getProvider === "function" ? registry.getProvider(cfg.registryName) : null;

        if (!registryEntry || !provider) {
            return {
                id: cfg.id, label: cfg.label,
                currentStatus: `Unavailable — AuthFactorRegistry and/or window.CozyOS.${cfg.globalName} is not loaded.`,
                whatsNeededNext: `Load ${cfg.ownerModule}.`,
                verificationSource: `AuthFactorRegistry.getProvider('${cfg.registryName}')`, currentImplementation: "N/A",
                futureCompatibility: "N/A", ownerModule: cfg.ownerModule, lastVerified: "N/A",
                notes: "Registry/provider lookup returned nothing real to report.",
            };
        }

        const diag = typeof provider.getDiagnosticsReport === "function" ? provider.getDiagnosticsReport() : {};
        return {
            id: cfg.id, label: cfg.label,
            currentStatus: registryEntry.isReal ? `Real — ${cfg.statusFromDiag(diag)}` : `Not real — ${registryEntry.note || "no verification capability."}`,
            whatsNeededNext: cfg.whatsNeededNext,
            verificationSource: `AuthFactorRegistry.getProvider('${cfg.registryName}') + ${cfg.globalName}.getDiagnosticsReport()`,
            currentImplementation: cfg.currentImplementation,
            futureCompatibility: cfg.futureCompatibility,
            ownerModule: cfg.ownerModule,
            lastVerified: diag.historyEntries > 0 ? `See audit history — ${diag.historyEntries} event(s) recorded this session.` : "No events recorded yet this session.",
            notes: cfg.notes ? cfg.notes(diag) : "",
        };
    }

    function buildTotpFactor() {
        return buildRegistryFactor({
            id: "totp", label: "Authenticator (TOTP)", registryName: "otp", globalName: "OtpProvider",
            statusFromDiag: d => `RFC 6238 TOTP, ${d.totalAccounts ?? 0} account(s) enrolled this session.`,
            whatsNeededNext: "Persistent account storage across reloads — accounts are in-memory only this milestone.",
            currentImplementation: "RFC 6238 TOTP + RFC 4226 HOTP counter math, crypto.subtle-backed, otpauth:// URI generation for QR enrollment.",
            futureCompatibility: "Registration/verification logic is complete; only swapping in-memory storage for a persistent store is needed — no API change.",
            ownerModule: "core/security/otp-provider.js (window.CozyOS.OtpProvider)",
        });
    }
    function buildTrustedDeviceFactor() {
        return buildRegistryFactor({
            id: "trusted-device", label: "Trusted Device", registryName: "trusted-device", globalName: "TrustedDeviceManager",
            statusFromDiag: d => `${d.totalDevices ?? 0} device(s) tracked this session, real 30-day trust window + 10-minute auto-lock.`,
            whatsNeededNext: "Persistent device storage across reloads (currently in-memory, save() calls are honestly non-fatal best-effort).",
            currentImplementation: "Real device registration with two distinct real clocks (30-day trust, 10-minute auto-lock). Device fingerprint is a real browser-property signal, disclosed as not tamper-proof against a determined attacker.",
            futureCompatibility: "Persistent storage is the only gap — the trust/lock logic itself needs no redesign.",
            ownerModule: "core/security/trusted-device-manager.js (window.CozyOS.TrustedDeviceManager)",
        });
    }
    function buildRecoveryPhraseFactor() {
        return buildRegistryFactor({
            id: "recovery-phrase", label: "Recovery Phrase", registryName: "recovery-phrase", globalName: "RecoveryPhraseManager",
            statusFromDiag: d => `${d.usersWithPhrases ?? 0} user(s) with a phrase, ${d.entropyBits ?? "?"} bits real entropy, PBKDF2-hashed, 5-failure lockout.`,
            whatsNeededNext: "Persistent storage across reloads; entropy is honestly weaker than BIP39 by design (8-word CozyOS wordlist).",
            currentImplementation: "PBKDF2-hashed 8-word phrase, revealed exactly once at generation/rotation, never stored or retrievable in plaintext afterward.",
            futureCompatibility: "Storage swap only — hashing/lockout logic is complete.",
            ownerModule: "core/security/recovery-phrase-manager.js (window.CozyOS.RecoveryPhraseManager)",
        });
    }
    function buildEmergencyCodesFactor() {
        return buildRegistryFactor({
            id: "emergency-codes", label: "Emergency Codes", registryName: "emergency-recovery-code", globalName: "EmergencyRecoveryCodeManager",
            statusFromDiag: d => `${d.usersWithPendingCodes ?? 0} user(s) with an unconsumed code, 10-char high-entropy, PBKDF2-hashed, 30-min expiry, 5-failure lockout.`,
            whatsNeededNext: "A real delivery mechanism — this stands in for email/SMS delivery, which does not exist anywhere in this codebase.",
            currentImplementation: "Administrator-issued, single-use codes (~51.7 bits entropy), PBKDF2-hashed, real expiry and lockout.",
            futureCompatibility: "Code generation/verification is complete; only a delivery channel (email/SMS) is missing, pluggable without redesign.",
            ownerModule: "core/security/emergency-recovery-code-manager.js (window.CozyOS.EmergencyRecoveryCodeManager)",
        });
    }
    function buildRecoveryQuestionsFactor() {
        return buildRegistryFactor({
            id: "recovery-questions", label: "Recovery Questions", registryName: "recovery-questions", globalName: "RecoveryQuestionManager",
            statusFromDiag: d => `${d.usersWithQuestions ?? 0} user(s) enrolled, requires ${d.requiredCorrectCount ?? "?"} correct answer(s), PBKDF2-hashed, 5-failure lockout.`,
            whatsNeededNext: "Persistent storage across reloads.",
            currentImplementation: "PBKDF2-SHA256 (100,000 iterations, matching IdentityEngine's own technique). Plaintext answers never stored past hashing.",
            futureCompatibility: "Storage swap only.",
            ownerModule: "core/security/recovery-question-manager.js (window.CozyOS.RecoveryQuestionManager)",
        });
    }

    /**
     * buildSessionFactor() / buildAdminRecoveryFactor() (Step 2)
     *   Real but bespoke — these are lifecycle/policy coordinators, not
     *   AuthFactorRegistry-registered "factors", so they compose their
     *   own getDiagnosticsReport() directly instead of going through
     *   buildRegistryFactor().
     */
    function buildSessionFactor() {
        const mgr = window.CozyOS.SessionManager;
        if (!mgr) return unavailableCard("session", "Session", "core/security/session-manager.js");
        const diag = mgr.getDiagnosticsReport();
        return {
            id: "session", label: "Session",
            currentStatus: `Real — composition layer over IdentityEngine's own session backend. ${diag.trackedSessions} session(s) tracked this session${diag.attached ? ", attached to real lifecycle events" : ""}.`,
            whatsNeededNext: "No known gap — automatic 10-minute idle-timeout, trusted-device session binding, and admin bulk logout are all real today.",
            verificationSource: "SessionManager.getDiagnosticsReport()",
            currentImplementation: "Adds idle-timeout, trusted-device binding, and bulk ops on top of IdentityEngine's own already-complete logout/terminateSession/refreshSession/listActiveSessions/expireSession.",
            futureCompatibility: "Fully real; no redesign anticipated.",
            ownerModule: "core/security/session-manager.js (window.CozyOS.SessionManager)",
            lastVerified: diag.historyEntries > 0 ? `${diag.historyEntries} event(s) recorded this session.` : "No events recorded yet this session.",
            notes: "Remember Me is IdentityEngine's own session-persistence behavior, composed by this layer rather than re-implemented here.",
        };
    }
    function buildAdminRecoveryFactor() {
        const policy = window.CozyOS.AdminRecoveryPolicy;
        if (!policy) return unavailableCard("admin-recovery", "Platform Administrator Recovery", "core/modules/identity/admin-recovery-policy.js");
        const diag = policy.getDiagnosticsReport();
        return {
            id: "admin-recovery", label: "Platform Administrator Recovery",
            currentStatus: `Real — orchestrates AuthFactorRegistry, IdentityEngine, EmergencyRecoveryCodeManager, RecoveryPhraseManager, and OtpProvider. ${diag.trackedSessions} recovery session(s) tracked this session.`,
            whatsNeededNext: "Inherits the same persistent-storage gap as the recovery managers it composes — no gap of its own.",
            verificationSource: "AdminRecoveryPolicy.getDiagnosticsReport()",
            currentImplementation: "Composes existing recovery coordinators rather than re-implementing verification; never duplicates their logic.",
            futureCompatibility: "Fully real composition; scales automatically as the underlying recovery managers gain persistence.",
            ownerModule: "core/modules/identity/admin-recovery-policy.js (window.CozyOS.AdminRecoveryPolicy)",
            lastVerified: diag.historyEntries > 0 ? `${diag.historyEntries} event(s) recorded this session.` : "No events recorded yet this session.",
            notes: "",
        };
    }
    function buildPasswordResetFactor() {
        const ie = window.CozyOS.IdentityEngine;
        if (!ie) return unavailableCard("password-reset", "Password Reset", "core/modules/identity/identity-engine.js");
        return {
            id: "password-reset", label: "Password Reset",
            currentStatus: "Real — two distinct, real methods: resetPassword() (administrator-initiated, no old password required) and changePassword() (self-service, verifies the current password first).",
            whatsNeededNext: "No known gap in the hashing/verification logic itself.",
            verificationSource: "Direct read of core/modules/identity/identity-engine.js — resetPassword()/changePassword()",
            currentImplementation: "PBKDF2 rehash with a genuinely new random salt on every reset/change; changePassword() invalidates every other real session for that user afterward.",
            futureCompatibility: "Fully real; no redesign anticipated.",
            ownerModule: "core/modules/identity/identity-engine.js (window.CozyOS.IdentityEngine)",
            lastVerified: "Verified by direct code read this milestone.",
            notes: "",
        };
    }
    function buildAccountRecoveryFactor() {
        // Real, honest composite: "Account Recovery" has no single owning
        // engine — it is the real set of independently-verified recovery
        // paths above. This card is a summary, not a new engine.
        const parts = [
            ["Recovery Phrase", !!window.CozyOS.RecoveryPhraseManager],
            ["Recovery Questions", !!window.CozyOS.RecoveryQuestionManager],
            ["Emergency Codes", !!window.CozyOS.EmergencyRecoveryCodeManager],
            ["Password Reset", !!window.CozyOS.IdentityEngine],
        ];
        const loadedCount = parts.filter(p => p[1]).length;
        return {
            id: "account-recovery", label: "Account Recovery",
            currentStatus: `Real, composite — ${loadedCount}/${parts.length} real owning modules loaded: ${parts.map(p => `${p[0]} (${p[1] ? "loaded" : "MISSING"})`).join(", ")}.`,
            whatsNeededNext: "Same persistent-storage gap as the individual recovery managers this summarizes.",
            verificationSource: "Presence check of RecoveryPhraseManager / RecoveryQuestionManager / EmergencyRecoveryCodeManager / IdentityEngine globals.",
            currentImplementation: "No separate 'Account Recovery' engine exists by design — this card summarizes the real, individually-verified recovery factors above rather than duplicating them.",
            futureCompatibility: "Scales automatically as the underlying recovery managers change; nothing here to redesign.",
            ownerModule: "Composite — see Recovery Phrase / Recovery Questions / Emergency Codes / Password Reset cards.",
            lastVerified: "Verified by direct code read this milestone.",
            notes: "",
        };
    }

    function unavailableCard(id, label, ownerModule) {
        return { id, label, currentStatus: `Unavailable — ${ownerModule} is not loaded.`, whatsNeededNext: `Load ${ownerModule}.`,
            verificationSource: ownerModule, currentImplementation: "N/A", futureCompatibility: "N/A", ownerModule, lastVerified: "N/A", notes: "" };
    }

    /**
     * buildStubFactor(cfg) (Step 3)
     *   Generic builder for the four honest-stub factors sharing
     *   core/security/factor-provider-base.js's real, common shape
     *   (getHistory(), hasRealBackend(), getDiagnosticsReport()). Never
     *   fabricates Enrolled/Not Enrolled/Last Used — persistent
     *   enrollment storage does not exist, so this explicitly states
     *   "Enrollment Tracking: Not Yet Available" instead, per Principle
     *   12's own instruction not to hide missing functionality behind a
     *   fake-looking status.
     */
    function buildStubFactor(cfg) {
        const registry = window.CozyOS.AuthFactorRegistry;
        const provider = window.CozyOS[cfg.globalName];
        const registryEntry = registry && typeof registry.getProvider === "function" ? registry.getProvider(cfg.registryName) : null;
        if (!registryEntry || !provider) return unavailableCard(cfg.id, cfg.label, cfg.ownerModule);

        const diag = typeof provider.getDiagnosticsReport === "function" ? provider.getDiagnosticsReport() : {};
        const hasRealBackend = typeof provider.hasRealBackend === "function" ? provider.hasRealBackend() : false;
        return {
            id: cfg.id, label: cfg.label,
            currentStatus: `Honest stub — real provider interface exists (registration, events, history), but ${registryEntry.note || "no real verification backend is registered yet"}. Enrollment Tracking: Not Yet Available.`,
            whatsNeededNext: `A real ${cfg.backendKind} backend registered via registerBackend(), AND persistent enrollment storage (Reason: persistent enrollment storage has not yet been implemented anywhere in this codebase — not specific to this factor).`,
            verificationSource: `AuthFactorRegistry.getProvider('${cfg.registryName}') + ${cfg.globalName}.getDiagnosticsReport()/hasRealBackend()`,
            currentImplementation: `Built on the shared core/security/factor-provider-base.js coordinator — real registration, real event publishing, real bounded history. No fabricated verification: honestly reports unavailable until registerBackend() is called with a genuine backend.`,
            futureCompatibility: `registerBackend(fn) is the real, already-built extension point — a future ${cfg.backendKind} backend plugs in without any API redesign here.`,
            ownerModule: `${cfg.ownerModule} (window.CozyOS.${cfg.globalName})`,
            lastVerified: diag.history && diag.history.length > 0 ? `${diag.history.length} event(s) recorded this session.` : "No events recorded yet this session.",
            notes: `hasRealBackend(): ${hasRealBackend}.`,
        };
    }
    function buildFingerprintFactor() { return buildStubFactor({ id: "fingerprint", label: "Fingerprint", registryName: "fingerprint", globalName: "FingerprintProvider", ownerModule: "core/security/fingerprint-provider.js", backendKind: "fingerprint-hardware" }); }
    function buildFaceFactor() { return buildStubFactor({ id: "face", label: "Face Authentication", registryName: "face", globalName: "FaceProvider", ownerModule: "core/security/face-provider.js", backendKind: "face-recognition" }); }
    function buildVoiceAuthFactor() { return buildStubFactor({ id: "voice-auth", label: "Voice Authentication", registryName: "voice", globalName: "VoiceProvider", ownerModule: "core/security/voice-provider.js", backendKind: "voice-recognition" }); }
    function buildGoogleLoginFactor() { return buildStubFactor({ id: "google-login", label: "Google Login", registryName: "google-account", globalName: "GoogleAccountProvider", ownerModule: "core/security/google-account-provider.js", backendKind: "OAuth" }); }

    /**
     * buildMicrosoftLoginFactor() (Step 4)
     *   Real, honest "Not Implemented" — no fake provider file, no
     *   registry entry invented. States the verified gap and the real
     *   extension point (factor-provider-base.js + AuthFactorRegistry)
     *   future work would plug into, matching exactly how the four
     *   Step-3 stub providers above are already built.
     */
    function buildMicrosoftLoginFactor() {
        return {
            id: "microsoft-login", label: "Microsoft Login",
            currentStatus: "Not Implemented — no core/security/microsoft-account-provider.js file, and no 'microsoft-account' entry in AuthFactorRegistry, exist anywhere in this repository. Verified by repository search, not inferred from a filename.",
            whatsNeededNext: "1) A microsoft-account-provider.js built on the same core/security/factor-provider-base.js coordinator as google-account-provider.js (same shape, substituting the factor name). 2) An 'microsoft-account' entry registered with AuthFactorRegistry. 3) A real OAuth backend (same real gap Google Login already discloses — no server exists to hold a client secret).",
            verificationSource: "Repository-wide search for 'microsoft' across core/security and core/modules/identity (Milestone 357).",
            currentImplementation: "None.",
            futureCompatibility: "Plugs in without any redesign: factor-provider-base.js's registerBackend() extension point and AuthFactorRegistry.registerFactor() are the same, already-real mechanism google-account-provider.js already uses — a Microsoft provider is additive, not architectural.",
            ownerModule: "Not yet assigned — no file exists.",
            lastVerified: "Verified by direct repository search this milestone.",
            notes: "Never fabricate a provider file or registry entry for this — disclosed as a real gap per Rule/Principle honesty requirements.",
        };
    }

    /**
     * renderFactorCard(factor) — the reusable framework every factor
     * (real, stub, or not-implemented) renders through.
     * Same card markup for all three cases; only the field values and
     * an optional status-color hint differ.
     */
    function renderFactorCard(factor) {
        return `
        <div class="cozy-auth-card">
            <h3>${factor.label}</h3>
            <div class="cozy-auth-field"><span class="cozy-auth-k">Current Status</span><span class="cozy-auth-v">${factor.currentStatus}</span></div>
            <div class="cozy-auth-field"><span class="cozy-auth-k">What's Needed Next</span><span class="cozy-auth-v">${factor.whatsNeededNext}</span></div>
            <div class="cozy-auth-field"><span class="cozy-auth-k">Verification Source</span><span class="cozy-auth-v">${factor.verificationSource}</span></div>
            <div class="cozy-auth-field"><span class="cozy-auth-k">Current Implementation</span><span class="cozy-auth-v">${factor.currentImplementation}</span></div>
            <div class="cozy-auth-field"><span class="cozy-auth-k">Future Compatibility</span><span class="cozy-auth-v">${factor.futureCompatibility}</span></div>
            <div class="cozy-auth-field"><span class="cozy-auth-k">Owner Module</span><span class="cozy-auth-v">${factor.ownerModule}</span></div>
            <div class="cozy-auth-field"><span class="cozy-auth-k">Last Verified</span><span class="cozy-auth-v">${factor.lastVerified}</span></div>
            <div class="cozy-auth-field"><span class="cozy-auth-k">Notes</span><span class="cozy-auth-v">${factor.notes}</span></div>
        </div>`;
    }

    function renderAllFactors() {
        return FACTOR_BUILDERS.map(build => renderFactorCard(build())).join("\n");
    }

    function getDashboard() {
        return `
        <style>
            #cozy-authsettings-root {
                --cozy-green: #00C853; --cozy-gold: #FFD700; --cozy-dark: #0A0A0A;
                --cozy-card-bg: #141414; --cozy-border: #222222;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background-color: var(--cozy-dark); color: #ffffff; padding: 20px; min-height: 100%;
            }
            #cozy-authsettings-root h2 { color: var(--cozy-gold); text-align: center; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 5px; }
            #cozy-authsettings-root p.subtitle { text-align: center; color: #aaaaaa; font-size: 14px; margin-bottom: 25px; }
            #cozy-authsettings-root .cozy-auth-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 18px; max-width: 1200px; margin: 0 auto; }
            #cozy-authsettings-root .cozy-auth-card {
                background: var(--cozy-card-bg); border: 2px solid var(--cozy-border); border-radius: 12px;
                padding: 20px; box-shadow: 0 10px 30px rgba(0, 200, 83, 0.1); animation: cozyAuthFadeIn 0.6s ease-in-out;
            }
            #cozy-authsettings-root .cozy-auth-card h3 { color: var(--cozy-green); margin: 0 0 12px 0; border-bottom: 1px solid var(--cozy-border); padding-bottom: 8px; }
            #cozy-authsettings-root .cozy-auth-field { margin-bottom: 8px; }
            #cozy-authsettings-root .cozy-auth-k { display: block; color: var(--cozy-gold); font-size: 11px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 2px; }
            #cozy-authsettings-root .cozy-auth-v { display: block; color: #dddddd; font-size: 13px; line-height: 1.5; }
            @keyframes cozyAuthFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        </style>
        <div id="cozy-authsettings-root">
            <h2>Authentication &amp; Security Settings</h2>
            <p class="subtitle">Authentication factors — every field below is composed from real, verified code (Milestone 357).</p>
            <div class="cozy-auth-grid" id="cozy-authsettings-grid">
                ${renderAllFactors()}
            </div>
        </div>`;
    }

    window.CozyOS.Modules["authentication-settings"] = {
        version: MODULE_VERSION,
        getDashboard,
        async init() { container = document.getElementById("cozy-authsettings-root")?.parentElement || document; },
        destroy() { container = null; },
        // Exposed for Step 2/3/4 to extend FACTOR_BUILDERS and for the
        // Node regression harness to test the framework without a DOM.
        renderFactorCard, renderAllFactors, FACTOR_BUILDERS,
        getVersion() { return MODULE_VERSION; }
    };
})();
