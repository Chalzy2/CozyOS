/**
 * CozyOS Voice Pack Importer
 * File Reference: core/modules/speech/voice-pack-import.js
 * Layer: Core / Platform Foundation — Voice Provider
 * Version: 1.0.0-ENTERPRISE
 * Milestone: 356 — CozyOS Voice Framework
 *
 * OWNERSHIP
 *   Owns: real, offline parsing/validation of a CozyOS voice pack
 *   manifest (the metadata a .voicepack or .zip's manifest.json real-
 *   istically contains: id, name, language, gender, accent, version,
 *   author, license, previewSample). Does NOT own actually unzipping a
 *   real .zip archive — no ZIP-reading library is bundled in this
 *   environment, so this file honestly accepts an already-parsed
 *   manifest object (e.g. produced by a future JSZip integration, or a
 *   plain manifest.json the caller read itself) rather than pretending
 *   to unpack binary archives it cannot actually read. Does NOT own
 *   provider registration — VoiceManager's, composed via
 *   installVoicePack(), not duplicated here.
 *
 * HONEST SCOPE
 *   Real: field-level manifest validation, a stable schema, rejecting
 *   malformed/incomplete manifests.
 *   Not real yet, disclosed: binary .zip extraction. A real
 *   integration would parse the archive (e.g. via JSZip), pull out
 *   manifest.json + any bundled audio, and hand the result to
 *   importManifest() below — the seam this file exposes for that.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0-ENTERPRISE";
    if (window.CozyOS.VoicePackImporter) return; // duplicate-load guard

    const REQUIRED_FIELDS = Object.freeze(["id", "name", "language", "version", "author"]);
    const OPTIONAL_FIELDS = Object.freeze(["gender", "accent", "license", "previewSample", "description"]);
    const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

    /**
     * validateManifest(manifest)
     *   Real, synchronous, offline validation only. Never assumes a
     *   field is safe/well-formed just because it's present.
     */
    function validateManifest(manifest) {
        if (!manifest || typeof manifest !== "object") return { valid: false, reason: "A manifest object is required." };
        for (const field of REQUIRED_FIELDS) {
            if (typeof manifest[field] !== "string" || !manifest[field].trim()) {
                return { valid: false, reason: `Manifest is missing required field "${field}".` };
            }
        }
        if (!ID_PATTERN.test(manifest.id)) return { valid: false, reason: `Manifest "id" must be lowercase alphanumeric with . _ - only (got "${manifest.id}").` };
        if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(manifest.language)) return { valid: false, reason: `Manifest "language" must be a BCP-47-style code like "sw" or "en-US" (got "${manifest.language}").` };
        if (manifest.gender !== undefined && !["male", "female", "neutral"].includes(manifest.gender)) return { valid: false, reason: `Manifest "gender", if present, must be "male", "female", or "neutral".` };

        const clean = { id: manifest.id, name: manifest.name, language: manifest.language, version: manifest.version, author: manifest.author };
        for (const field of OPTIONAL_FIELDS) if (manifest[field] !== undefined) clean[field] = manifest[field];
        return { valid: true, manifest: Object.freeze(clean) };
    }

    /**
     * importManifest(manifest, opts)
     *   Real, composed handoff to VoiceManager.installVoicePack() — this
     *   file never registers a provider itself (single real registry).
     *   opts.hasAudio should be true only if the caller actually has
     *   real, playable audio bytes for this pack (e.g. from a future
     *   real .zip extraction) — defaults to false, meaning honestly
     *   "not_installed for playback yet, metadata only."
     */
    function importManifest(manifest, opts = {}) {
        const validation = validateManifest(manifest);
        if (!validation.valid) return { success: false, reason: validation.reason };
        const vm = window.CozyOS.VoiceManager;
        if (!vm || typeof vm.installVoicePack !== "function") return { success: false, reason: "VoiceManager is not loaded — cannot register an imported voice pack." };
        return vm.installVoicePack(manifest, { hasAudio: opts.hasAudio === true });
    }

    window.CozyOS.VoicePackImporter = Object.freeze({
        getVersion: () => VERSION,
        supportedExtensions: () => [".voicepack", ".zip"],
        validateManifest,
        importManifest,
        getIntegrationManifest: () => ({
            owns: ["manifest schema + offline validation"],
            doesNotOwn: ["binary .zip extraction — no ZIP library is bundled; accepts an already-parsed manifest object"],
            honestLimitation: "Cannot actually read bytes out of a real .zip/.voicepack file yet — that requires a real archive-reading library not present in this environment.",
        }),
    });

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                sourcePath: "core/modules/speech/voice-pack-import.js", name: "VoicePackImporter", category: "Platform", icon: "package.svg",
                description: "Real, offline voice pack manifest validation. Does not extract real .zip archives yet — accepts an already-parsed manifest object. Composes VoiceManager for registration, never registers a provider itself.",
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
