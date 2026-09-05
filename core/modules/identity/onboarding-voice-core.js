/**
 * CozyOS — Onboarding Voice Core (Owner Voice Rule)
 * File Reference: core/modules/identity/onboarding-voice-core.js
 *
 * CLASSIFICATION: pure logic, no DOM, no network calls — follows the
 * repository's established "-core.js" convention (see
 * core/shell/admin-gate-core.js, core/shell/post-login-routing-core.js):
 * attaches to window.CozyOS so it loads as a plain <script>, and is
 * Node-testable by stubbing global.window before require().
 *
 * WHY THIS FILE EXISTS
 *   The requirement: the FIRST user to ever register a CozyOS account,
 *   if sound is enabled, must hear the Owner Voice ("Charles (Official
 *   CozyOS Voice)" — core/modules/speech/providers/charles-voice-
 *   provider.js — the platform's existing, unconditional default voice
 *   provider; no separate "Owner Voice" provider exists or is being
 *   invented here) rather than any other/future/random voice. This
 *   module is the one, pure, testable place that decision is made, so
 *   it can never be satisfied by "well, Charles happens to be the
 *   default anyway" — a future feature that changes the default or adds
 *   provider selection cannot silently break this specific first-user
 *   guarantee, because this function is the one thing anything wiring
 *   first-user onboarding must consult and its own tests pin the
 *   behavior directly.
 *
 * WHAT "isFirstUser" MEANS HERE
 *   Must be the real, authoritative signal already used by
 *   IdentityEngine.register() itself for its own security-critical
 *   admin-bootstrap decision (`this.#users.size === 0`, computed before
 *   the new user is added) — exposed on register()'s own return value
 *   as `isFirstUser`. This module never re-derives "first user" from a
 *   URL, username, query string, hash, or any client-supplied value; it
 *   only ever accepts a boolean the caller must have obtained from that
 *   authoritative source.
 *
 * FAIL-SAFE DEFAULTS
 *   Any shape other than isFirstUser === true and soundEnabled === true
 *   (strict booleans, no truthy coercion) resolves to useOwnerVoice:false
 *   — never forces voice playback, matching "sound off -> do not force
 *   voice playback, do not block registration" and "do not randomly
 *   select a voice" from the spec. If ownerVoiceAvailable is explicitly
 *   passed as false (the existing architecture's own signal that
 *   Charles's provider isn't actually installed/working), this also
 *   resolves to useOwnerVoice:false with a distinct reason — the caller
 *   is expected to honor the "sound failure must never stop the Login
 *   Gate / never block registration" rule itself, not this module.
 */
(function () {
    'use strict';
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};

    const VERSION = '1.0.0';
    const OWNER_VOICE_PROVIDER_ID = 'charles';

    /**
     * decideOnboardingVoice({ isFirstUser, soundEnabled, ownerVoiceAvailable }) -> { useOwnerVoice, providerId, reason }
     *
     * @param {object} input
     * @param {boolean} input.isFirstUser - from IdentityEngine.register()'s
     *   own real `isFirstUser` field. Strict === true required.
     * @param {boolean} input.soundEnabled - the existing app-level sound/
     *   voice toggle (e.g. StartupOrchestrator's persisted `audioEnabled`
     *   config, the same one launch-sequence.js already reads). Strict
     *   === true required.
     * @param {boolean} [input.ownerVoiceAvailable=true] - whether the
     *   existing voice architecture actually has a real, installed
     *   provider for the Owner Voice right now (e.g.
     *   VoiceManager.getProvider('charles')?.status === 'installed').
     *   Defaults to true (the common case) so callers that haven't
     *   wired this check yet still get the correct behavior; explicit
     *   false is honored as a real unavailability signal.
     */
    function decideOnboardingVoice(input) {
        const isFirstUser = !!(input && input.isFirstUser === true);
        const soundEnabled = !!(input && input.soundEnabled === true);
        const ownerVoiceAvailable = !(input && input.ownerVoiceAvailable === false);

        if (!isFirstUser) {
            return { useOwnerVoice: false, providerId: null, reason: 'not_first_user' };
        }
        if (!soundEnabled) {
            return { useOwnerVoice: false, providerId: null, reason: 'sound_disabled' };
        }
        if (!ownerVoiceAvailable) {
            return { useOwnerVoice: false, providerId: null, reason: 'owner_voice_unavailable' };
        }
        return { useOwnerVoice: true, providerId: OWNER_VOICE_PROVIDER_ID, reason: 'first_user_sound_enabled' };
    }

    window.CozyOS.OnboardingVoiceCore = Object.freeze({
        decideOnboardingVoice,
        OWNER_VOICE_PROVIDER_ID,
        version: VERSION,
    });
    window.CozyOS.Modules['onboarding-voice-core'] = Object.freeze({
        version: VERSION,
        description: 'Pure logic, no DOM, no network. Decides whether the first-ever CozyOS user should hear the Owner Voice (the existing "charles" provider) during onboarding — never a random/future/browser-default voice — gated on the real IdentityEngine.register() isFirstUser signal and the existing sound-enabled setting only.',
    });
})();
