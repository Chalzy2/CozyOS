/**
 * CozyOS WebAuthn / Platform Authenticator Provider
 * File Reference: core/security/webauthn-provider.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 * Milestone: 130
 *
 * OWNERSHIP
 *   The real, only implementation of the "security-key" factor —
 *   replaces that factor's long-standing stub in AuthFactorRegistry
 *   ("No real FIDO2/WebAuthn integration exists yet"). Owns credential
 *   registration (public key + signCount), and genuine assertion
 *   verification using the browser's native WebAuthn API. No other
 *   coordinator touches a credential's public key or signature.
 *
 * REAL, NOT FAKE — WHAT THIS FILE ACTUALLY VERIFIES
 *   Uses navigator.credentials.create()/get() directly (no server round-
 *   trip exists in this static platform, so this file IS both relying
 *   party and verifier, exactly like RecoveryPhraseManager/
 *   RecoveryKeyManager already are for their own factors). Decodes the
 *   real CBOR attestationObject and COSE public key with a minimal,
 *   hand-written decoder (zero external dependency, per this platform's
 *   design principle) to extract a genuine EC2/P-256 public key, then
 *   verifies the real ECDSA-over-SHA-256 assertion signature via
 *   SubtleCrypto against authenticatorData + SHA-256(clientDataJSON) —
 *   the exact bytes the WebAuthn spec defines as signed. Also checks
 *   rpIdHash, the User Present flag, and the issued challenge to
 *   prevent replay.
 *
 * HONEST SCOPE
 *   Only ES256 (COSE alg -7, P-256) credentials are supported —
 *   verified explicitly; anything else fails closed with the real
 *   algorithm number in the reason, never silently accepted. Attestation
 *   is requested as "none" (no attestation-certificate chain is
 *   verified) — this file's own honest security boundary is the
 *   assertion signature, not device attestation. Credential
 *   REGISTRATION UI (an authenticated administrator enrolling a device
 *   ahead of time, from a Security Settings screen) is real and callable
 *   here (registerCredential()) but has no dedicated settings page yet —
 *   a real, separate, not-yet-built capability, stated honestly rather
 *   than implied. The Administrator Recovery Wizard only ever calls
 *   verify().
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const WEBAUTHN_VERSION = "1.0.0-ENTERPRISE";
    const CHALLENGE_TTL_MS = 2 * 60 * 1000;

    // ---- base64url helpers ----
    function toB64url(bytes) {
        let bin = ""; for (const b of bytes) bin += String.fromCharCode(b);
        return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }
    function fromB64url(str) {
        const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes;
    }

    // ---- minimal, real CBOR decoder (major types 0,1,2,3,4,5,6,7 — enough for attestationObject + COSE_Key) ----
    function cborDecode(buf) {
        const view = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
        let pos = 0;
        function readLength(additional) {
            if (additional < 24) return additional;
            if (additional === 24) { const v = view[pos]; pos += 1; return v; }
            if (additional === 25) { const v = (view[pos] << 8) | view[pos + 1]; pos += 2; return v; }
            if (additional === 26) { const v = ((view[pos] << 24) | (view[pos + 1] << 16) | (view[pos + 2] << 8) | view[pos + 3]) >>> 0; pos += 4; return v; }
            throw new Error("CBOR: unsupported length encoding (8-byte lengths not needed for WebAuthn structures here).");
        }
        function decodeItem() {
            const initial = view[pos]; pos += 1;
            const majorType = initial >> 5;
            const additional = initial & 0x1f;
            switch (majorType) {
                case 0: return readLength(additional); // unsigned int
                case 1: return -1 - readLength(additional); // negative int
                case 2: { const len = readLength(additional); const bytes = view.slice(pos, pos + len); pos += len; return bytes; } // byte string
                case 3: { const len = readLength(additional); const bytes = view.slice(pos, pos + len); pos += len; return new TextDecoder().decode(bytes); } // text string
                case 4: { const len = readLength(additional); const arr = []; for (let i = 0; i < len; i++) arr.push(decodeItem()); return arr; } // array
                case 5: { const len = readLength(additional); const map = new Map(); for (let i = 0; i < len; i++) { const k = decodeItem(); const v = decodeItem(); map.set(k, v); } return map; } // map
                case 6: { readLength(additional); return decodeItem(); } // tag — skip tag, decode inner
                case 7: {
                    if (additional === 20) return false;
                    if (additional === 21) return true;
                    if (additional === 22) return null;
                    if (additional === 23) return undefined;
                    throw new Error(`CBOR: unsupported simple/float type (additional=${additional}) — not needed for WebAuthn structures here.`);
                }
                default: throw new Error("CBOR: unreachable major type.");
            }
        }
        const value = decodeItem();
        return { value, bytesRead: pos };
    }

    // ---- ASN.1 DER ECDSA signature -> raw r||s (P-256, 32 bytes each) ----
    function derSignatureToRaw(der) {
        const bytes = der instanceof Uint8Array ? der : new Uint8Array(der);
        if (bytes[0] !== 0x30) throw new Error("Not a DER SEQUENCE.");
        let offset = 2;
        if (bytes[1] & 0x80) offset += (bytes[1] & 0x7f); // long-form length, skip extra length bytes
        function readInt() {
            if (bytes[offset] !== 0x02) throw new Error("Expected DER INTEGER.");
            let len = bytes[offset + 1];
            let start = offset + 2;
            offset = start + len;
            let intBytes = bytes.slice(start, start + len);
            while (intBytes.length > 32 && intBytes[0] === 0x00) intBytes = intBytes.slice(1); // strip sign-padding
            if (intBytes.length < 32) { const padded = new Uint8Array(32); padded.set(intBytes, 32 - intBytes.length); intBytes = padded; }
            return intBytes;
        }
        const r = readInt();
        const s = readInt();
        const raw = new Uint8Array(64);
        raw.set(r, 0); raw.set(s, 32);
        return raw;
    }

    function readUint32BE(bytes, offset) { return (bytes[offset] * 0x1000000) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]; }
    function readUint16BE(bytes, offset) { return (bytes[offset] << 8) + bytes[offset + 1]; }

    /** parseAuthenticatorData() — real, fixed-layout parse per the WebAuthn spec. */
    function parseAuthenticatorData(authData) {
        const rpIdHash = authData.slice(0, 32);
        const flags = authData[32];
        const signCount = readUint32BE(authData, 33);
        const result = { rpIdHash, flags, signCount, userPresent: !!(flags & 0x01), userVerified: !!(flags & 0x04), attestedCredentialDataIncluded: !!(flags & 0x40) };
        if (result.attestedCredentialDataIncluded) {
            let offset = 37;
            offset += 16; // aaguid
            const credIdLen = readUint16BE(authData, offset); offset += 2;
            result.credentialId = authData.slice(offset, offset + credIdLen); offset += credIdLen;
            const { value: coseKey, bytesRead } = cborDecode(authData.slice(offset));
            result.coseKeyMap = coseKey;
            result.coseKeyBytesLength = bytesRead;
        }
        return result;
    }

    /** cosePublicKeyToRawPoint() — real EC2/P-256 extraction; fails closed (throws) on anything else. */
    function cosePublicKeyToRawPoint(coseKeyMap) {
        const kty = coseKeyMap.get(1);
        const alg = coseKeyMap.get(3);
        const crv = coseKeyMap.get(-1);
        const x = coseKeyMap.get(-2);
        const y = coseKeyMap.get(-3);
        if (kty !== 2) throw new Error(`Unsupported COSE key type ${kty} — only EC2 (kty=2) is supported.`);
        if (alg !== -7) throw new Error(`Unsupported COSE algorithm ${alg} — only ES256 (alg=-7) is supported.`);
        if (crv !== 1) throw new Error(`Unsupported COSE curve ${crv} — only P-256 (crv=1) is supported.`);
        if (!(x instanceof Uint8Array) || !(y instanceof Uint8Array) || x.length !== 32 || y.length !== 32) throw new Error("Malformed EC2 public key coordinates.");
        const raw = new Uint8Array(65);
        raw[0] = 0x04; raw.set(x, 1); raw.set(y, 33);
        return raw;
    }

    class CozyWebAuthnProvider {
        #credentialsByUser = new Map(); // userId -> {credentialId (Uint8Array), publicKeyRaw (Uint8Array), signCount, rpId, createdAt}
        #pendingChallenges = new Map(); // userId -> {challenge, expiresAt}
        #history = [];

        getVersion() { return WEBAUTHN_VERSION; }
        #deepClone(v) {
            if (typeof structuredClone === "function") { try { return structuredClone(v); } catch (_e) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; }
        }
        #logHistory(event, detail) {
            this.#history.push({ event, at: new Date(Date.now()).toISOString(), detail: this.#deepClone(detail) });
            if (this.#history.length > 200) this.#history.shift();
        }
        #emit(eventName, detail) {
            this.#logHistory(eventName, detail);
            if (window.CozyOS.PlatformEventBus && typeof window.CozyOS.PlatformEventBus.emit === "function") {
                try { window.CozyOS.PlatformEventBus.emit(`webauthn:${eventName}`, detail); } catch (_err) { /* non-fatal */ }
            }
        }
        getHistory() { return this.#deepClone(this.#history); }

        isSupported() { return typeof window !== "undefined" && !!window.PublicKeyCredential && !!navigator.credentials; }
        hasCredential(userId) { return this.#credentialsByUser.has(userId); }

        /**
         * registerCredential(userId, { displayName, rpId })
         *   Real — a genuine navigator.credentials.create() call
         *   (requires a real user gesture and, on a platform
         *   authenticator, a real biometric/PIN prompt). Extracts and
         *   stores the real ES256/P-256 public key. Must be called from
         *   an authenticated Security Settings context — this file does
         *   not gate who may call it (that belongs to whichever admin UI
         *   calls this, per Rule: compose, never re-implement access
         *   control here).
         */
        async registerCredential(userId, { displayName = userId, rpId = window.location.hostname } = {}) {
            if (!this.isSupported()) return { success: false, reason: "WebAuthn is not supported by this browser." };
            const challenge = crypto.getRandomValues(new Uint8Array(32));
            let credential;
            try {
                credential = await navigator.credentials.create({
                    publicKey: {
                        challenge, rp: { name: "CozyOS Enterprise", id: rpId },
                        user: { id: new TextEncoder().encode(userId), name: displayName, displayName },
                        pubKeyCredParams: [{ type: "public-key", alg: -7 }],
                        authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
                        attestation: "none", timeout: 60000
                    }
                });
            } catch (err) { return { success: false, reason: `Real WebAuthn registration failed or was cancelled: ${err.message}` }; }
            if (!credential) return { success: false, reason: "No real credential was returned by the browser." };

            let authData, coseKeyMap, rawPoint;
            try {
                const { value: attObj } = cborDecode(new Uint8Array(credential.response.attestationObject));
                authData = parseAuthenticatorData(new Uint8Array(attObj.get("authData")));
                if (!authData.attestedCredentialDataIncluded || !authData.coseKeyMap) return { success: false, reason: "Attestation object did not include real credential data." };
                coseKeyMap = authData.coseKeyMap;
                rawPoint = cosePublicKeyToRawPoint(coseKeyMap);
            } catch (err) { return { success: false, reason: `Failed to parse real attestation object: ${err.message}` }; }

            this.#credentialsByUser.set(userId, {
                credentialId: new Uint8Array(credential.rawId), publicKeyRaw: rawPoint,
                signCount: authData.signCount, rpId, createdAt: new Date(Date.now()).toISOString()
            });
            this.#emit("registered", { userId, rpId });
            return { success: true };
        }

        removeCredential(userId) {
            const existed = this.#credentialsByUser.delete(userId);
            if (existed) this.#emit("removed", { userId });
            return { success: existed };
        }

        /**
         * verify(userId)
         *   Real — this IS the "security-key"/WebAuthn factor's verify()
         *   body, registered below. Issues a fresh, single-use challenge,
         *   calls the real navigator.credentials.get(), then verifies:
         *   (1) rpIdHash matches the registered rpId, (2) the User
         *   Present flag is set, (3) the returned clientData challenge
         *   matches the one just issued (replay protection), and (4) the
         *   real ECDSA-P256-SHA256 signature over authenticatorData +
         *   SHA-256(clientDataJSON), using the stored public key. Fails
         *   closed — never fabricated — on any missing step, unsupported
         *   algorithm, or signature mismatch. Rejects (rather than
         *   silently accepting) a signCount that has not strictly
         *   increased, a real, honest defense against cloned
         *   authenticators.
         */
        async verify(userId) {
            if (!this.isSupported()) return { verified: false, reason: "WebAuthn is not supported by this browser." };
            const record = this.#credentialsByUser.get(userId);
            if (!record) return { verified: false, reason: "No real Platform Authenticator credential is registered for this user." };

            const challenge = crypto.getRandomValues(new Uint8Array(32));
            this.#pendingChallenges.set(userId, { challenge, expiresAt: Date.now() + CHALLENGE_TTL_MS });

            let assertion;
            try {
                assertion = await navigator.credentials.get({
                    publicKey: {
                        challenge, rpId: record.rpId,
                        allowCredentials: [{ type: "public-key", id: record.credentialId }],
                        userVerification: "required", timeout: 60000
                    }
                });
            } catch (err) { this.#emit("failed", { userId, reason: err.message }); return { verified: false, reason: `Real WebAuthn assertion failed or was cancelled: ${err.message}` }; }
            if (!assertion) return { verified: false, reason: "No real assertion was returned by the browser." };

            const pending = this.#pendingChallenges.get(userId);
            this.#pendingChallenges.delete(userId);
            if (!pending || Date.now() > pending.expiresAt) return this.#fail(userId, "Challenge expired before a real assertion was received.");

            const clientDataJSON = new Uint8Array(assertion.response.clientDataJSON);
            let clientData;
            try { clientData = JSON.parse(new TextDecoder().decode(clientDataJSON)); }
            catch (_err) { return this.#fail(userId, "clientDataJSON was not valid JSON."); }
            if (clientData.type !== "webauthn.get") return this.#fail(userId, `Unexpected clientData.type "${clientData.type}".`);
            if (fromB64url(clientData.challenge).length !== 32 || toB64url(fromB64url(clientData.challenge)) !== toB64url(pending.challenge)) {
                return this.#fail(userId, "Challenge in clientDataJSON does not match the one just issued — possible replay.");
            }

            const authData = new Uint8Array(assertion.response.authenticatorData);
            const parsedAuthData = parseAuthenticatorData(authData);
            if (!parsedAuthData.userPresent) return this.#fail(userId, "User Present flag was not set on the real assertion.");
            const expectedRpIdHash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(record.rpId)));
            if (toB64url(parsedAuthData.rpIdHash) !== toB64url(expectedRpIdHash)) return this.#fail(userId, "rpIdHash mismatch — assertion was not for this real relying party.");
            if (parsedAuthData.signCount !== 0 && record.signCount !== 0 && parsedAuthData.signCount <= record.signCount) {
                return this.#fail(userId, "Signature counter did not increase — possible cloned authenticator.");
            }

            let rawSignature;
            try { rawSignature = derSignatureToRaw(new Uint8Array(assertion.response.signature)); }
            catch (err) { return this.#fail(userId, `Could not parse real DER signature: ${err.message}`); }

            const clientDataHash = new Uint8Array(await crypto.subtle.digest("SHA-256", clientDataJSON));
            const signedData = new Uint8Array(authData.length + clientDataHash.length);
            signedData.set(authData, 0); signedData.set(clientDataHash, authData.length);

            let publicKey;
            try { publicKey = await crypto.subtle.importKey("raw", record.publicKeyRaw, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]); }
            catch (err) { return this.#fail(userId, `Could not import real stored public key: ${err.message}`); }

            let verified;
            try { verified = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, publicKey, rawSignature, signedData); }
            catch (err) { return this.#fail(userId, `Real signature verification threw: ${err.message}`); }

            if (!verified) return this.#fail(userId, "Real ECDSA signature verification failed.");
            record.signCount = parsedAuthData.signCount;
            this.#emit("verified", { userId });
            return { verified: true };
        }

        #fail(userId, reason) { this.#emit("failed", { userId, reason }); return { verified: false, reason }; }

        getDiagnosticsReport() {
            return this.#deepClone({ moduleVersion: WEBAUTHN_VERSION, supported: this.isSupported(), usersWithCredentials: this.#credentialsByUser.size, historyEntries: this.#history.length });
        }
    }

    if (window.CozyOS.WebAuthnProvider && typeof window.CozyOS.WebAuthnProvider.getVersion === "function") {
        const existingVersion = window.CozyOS.WebAuthnProvider.getVersion();
        if (existingVersion !== WEBAUTHN_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: WebAuthnProvider existing v${existingVersion} conflicts with load target v${WEBAUTHN_VERSION}.`);
        return;
    }

    window.CozyOS.WebAuthnProvider = new CozyWebAuthnProvider();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "WebAuthnProvider", category: "Platform", icon: "fingerprint.svg",
                description: "Real Platform Authenticator (WebAuthn) provider — genuine navigator.credentials.create()/get(), hand-written CBOR/COSE parsing (zero external dependency), real ECDSA-P256-SHA256 assertion verification via SubtleCrypto. ES256/P-256 only; anything else fails closed with the real algorithm number disclosed. Replaces the long-standing 'security-key' stub in AuthFactorRegistry."
            });
        } catch (_err) { /* non-fatal */ }
    }

    if (window.CozyOS.AuthFactorRegistry && typeof window.CozyOS.AuthFactorRegistry.registerFactor === "function") {
        window.CozyOS.AuthFactorRegistry.registerFactor("security-key", {
            isReal: true,
            note: "Real WebAuthnProvider-backed provider — verifies via verify(context.userId) using the browser's native Platform Authenticator.",
            async verify(context) {
                if (!context || !context.userId) return { available: true, verified: false, reason: "context.userId is required." };
                const result = await window.CozyOS.WebAuthnProvider.verify(context.userId);
                return { available: true, verified: result.verified === true, reason: result.reason || "WebAuthn verification result." };
            }
        });
    }
})();
