/**
 * ── COZYOS CRYPTOGRAPHIC VERIFICATION ENGINE ──
 * FILE: core/security/verify.js
 */
export const CryptoVerifier = {
    /**
     * Verifies the authenticity of an incoming plugin using web crypto primitives
     * @param {Object} manifest - Capability Manifest containing the signature
     * @param {string} pluginCodeString - Raw executable string of the handler
     * @param {CryptoKey} marketplacePublicKey - Root signature authority key
     */
    async verifySignature(manifest, pluginCodeString, marketplacePublicKey) {
        if (!manifest.signature) {
            throw new Error("Security Violation: Missing mandatory digital signature block.");
        }

        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(pluginCodeString + JSON.stringify({ ...manifest, signature: undefined }));
        const signatureBuffer = Uint8Array.from(atob(manifest.signature), c => c.charCodeAt(0));

        const isValid = await crypto.subtle.verify(
            "RSASSA-PKCS1-v1_5",
            marketplacePublicKey,
            signatureBuffer,
            dataBuffer
        );

        if (!isValid) {
            throw new Error(`Critical Fault: Cryptographic verification failed for plugin [${manifest.id}]. Asset payload may be corrupted or tampered with.`);
        }
        
        return true;
    }
};
