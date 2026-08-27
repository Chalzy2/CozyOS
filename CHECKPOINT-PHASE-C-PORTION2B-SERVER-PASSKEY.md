# CHECKPOINT — Phase C Portion 2b: Server-Authoritative Passkey Ceremony

## Scope
Built ONLY the missing server-authoritative Passkey authentication method,
per the Portion 2b prompt. No UI changes. No Firebase/password/MFA/
admin/recovery/deploy changes.

## IMPLEMENTED
- `core/modules/identity/auth-coordinator.js`
  - New method `AuthCoordinator.loginWithServerPasskey(email, {rememberMe})`
    - `POST /webauthn/authenticate/begin` → real challenge/options
    - `navigator.credentials.get(...)` called with the server's own
      challenge/rpId/allowCredentials, base64url-decoded verbatim
    - Assertion serialized (credentialId, clientDataJSON,
      authenticatorData, signature) to base64url — signature relayed
      exactly as produced (DER), no local re-encoding
    - `POST /webauthn/authenticate/complete` — server response is the
      sole authority; server AuthError codes relayed verbatim, never
      reinterpreted or upgraded to success
    - On real success only: composes the existing `#finishServerLogin()`
      (same session-establishment path `loginWithServerPassword()`
      already uses)
    - Does NOT call `WebAuthnProvider.verify()` or
      `IdentityEngine.loginWithVerifiedPasskey()`
  - New local base64url helpers (`toB64url`/`fromB64url`), intentionally
    not shared with `core/security/webauthn-provider.js`
  - New diagnostics counters: `serverPasskeyLoginAttempts`,
    `serverPasskeyLoginSuccesses`, `serverPasskeyLoginFailures`
  - `COORDINATOR_VERSION` bumped 1.5.1-ENTERPRISE → 1.6.0-ENTERPRISE
- `core/modules/identity/test/auth-coordinator-server-passkey.test.js` (new)
  - 13 focused tests against controlled `fetch`/`navigator.credentials.get`
    test doubles — no real browser/authenticator claimed or required

## NOT DONE
- `login.html`'s Passkey button — untouched, still calls the old
  `loginWithPasskey()` (client-side WebAuthnProvider path)
- No wiring of the new method into any UI surface
- No changes to Firebase, password login, MFA, password reset,
  administrator routing, Security Center, recovery, GitHub, or deployment

## VERIFIED
- `node --test core/modules/identity/test/auth-coordinator-server-passkey.test.js`
  → **13/13 pass**
- `node --test core/modules/identity/test/auth-coordinator.test.js`
  → **26/26 pass** (no regressions, no rewrites needed)
- `node --test server/webauthn-rp/test/*.js`
  → **78/78 pass** (no regressions, no rewrites needed)

## NEXT PORTION
Wire the existing Passkey button in `login.html` to
`loginWithServerPasskey()` and verify that one UI connection — smaller
than this portion, deliberately deferred per the original Portion 2b
scoping.
