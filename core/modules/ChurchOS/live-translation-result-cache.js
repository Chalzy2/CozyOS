/**
 * CozyOS — Live Translation/TTS Result Cache
 * File Reference: core/modules/ChurchOS/live-translation-result-cache.js
 * Layer: Core / ChurchOS — Live Multilingual Distribution
 * Version: 1.0.0
 * Milestone: R040 Phase 2
 *
 * RULE 29 OWNERSHIP AUDIT
 *   Repository-wide search performed before writing this file: no cache
 *   exists anywhere that stores a translated-segment or synthesized-TTS
 *   result keyed by (session, segment, source language, target language,
 *   voice profile). core/connectivity/cache.js is a generic
 *   request/document cache for the connectivity layer (confirmed by
 *   reading it) — a different concern, not reused here because its
 *   eviction/versioning contract is not segment-aware and would require
 *   bolting live-language-specific semantics onto a shared, unrelated
 *   cache used by other subsystems. This file is a genuinely new,
 *   narrowly-scoped dependency, not a duplicate of an existing cache.
 *
 * SCOPE
 *   Two independent bounded caches:
 *     - text cache:  key -> { translatedText, providerName, isReal, storedAt }
 *     - audio cache: key -> { ttsResult, storedAt }
 *   kept separate because a text cache hit does NOT guarantee a usable
 *   audio cache hit — two viewers can share a translated sentence while
 *   requiring different synthesized voices (voiceProfile is part of the
 *   audio key, never the text key).
 *
 * KEY CONSTRUCTION
 *   Text key:  `${sessionId}:${segmentId}:${sourceLanguage}:${targetLanguage}`
 *   Audio key: `${textKey}:${voiceProfile || "default"}`
 *   sessionId/segmentId are required — this cache is never shared across
 *   unrelated sessions or re-keyed by text content alone (two different
 *   segments that happen to contain the same words are NOT merged; that
 *   would silently misattribute a translation to the wrong live moment).
 *
 * EVICTION
 *   Bounded FIFO per cache (default 2000 entries each), matching the
 *   orchestrator's own #SEGMENT_RECORD_LIMIT bounding convention (Phase 1
 *   file, read before writing this one) so memory growth is never
 *   unbounded during a long live service.
 *
 * HONESTY
 *   get() never fabricates a hit. A miss is reported as
 *   { hit: false, value: null } — callers must actually perform the
 *   translation/TTS themselves on a miss; this file never guesses.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const MODULE_VERSION = "1.0.0";
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["live-translation-result-cache"] && window.CozyOS.Modules["live-translation-result-cache"].version) return;

    function _now() {
        if (typeof performance !== "undefined" && typeof performance.now === "function") return performance.now();
        return Date.now();
    }

    class BoundedCache {
        constructor(limit) {
            this._limit = limit;
            this._map = new Map();
            this._order = [];
        }
        get(key) {
            if (!this._map.has(key)) return { hit: false, value: null };
            return { hit: true, value: this._map.get(key) };
        }
        set(key, value) {
            if (!this._map.has(key)) {
                this._order.push(key);
                if (this._order.length > this._limit) {
                    const evicted = this._order.shift();
                    this._map.delete(evicted);
                }
            }
            this._map.set(key, value);
        }
        has(key) { return this._map.has(key); }
        delete(key) { this._map.delete(key); const i = this._order.indexOf(key); if (i >= 0) this._order.splice(i, 1); }
        clear() { this._map.clear(); this._order = []; }
        get size() { return this._map.size; }
    }

    class LiveTranslationResultCache {
        #text;
        #audio;
        #TEXT_LIMIT = 2000;
        #AUDIO_LIMIT = 2000;

        constructor() {
            this.#text = new BoundedCache(this.#TEXT_LIMIT);
            this.#audio = new BoundedCache(this.#AUDIO_LIMIT);
        }

        getVersion() { return MODULE_VERSION; }

        textKey({ sessionId, segmentId, sourceLanguage, targetLanguage }) {
            if (!sessionId || !segmentId || !sourceLanguage || !targetLanguage) {
                throw new TypeError("[LiveTranslationResultCache] textKey() requires sessionId, segmentId, sourceLanguage, targetLanguage.");
            }
            return `${sessionId}:${segmentId}:${sourceLanguage}:${targetLanguage}`;
        }

        audioKey(parts, voiceProfile = null) {
            const base = typeof parts === "string" ? parts : this.textKey(parts);
            return `${base}:${voiceProfile || "default"}`;
        }

        /** getTranslation() — never fabricates a hit. */
        getTranslation(parts) {
            const key = this.textKey(parts);
            const result = this.#text.get(key);
            return { key, hit: result.hit, value: result.value };
        }

        setTranslation(parts, { translatedText, providerName = null, isReal = true } = {}) {
            const key = this.textKey(parts);
            this.#text.set(key, { translatedText, providerName, isReal, storedAt: _now() });
            return key;
        }

        getAudio(parts, voiceProfile = null) {
            const key = this.audioKey(parts, voiceProfile);
            const result = this.#audio.get(key);
            return { key, hit: result.hit, value: result.value };
        }

        setAudio(parts, voiceProfile, ttsResult) {
            const key = this.audioKey(parts, voiceProfile);
            this.#audio.set(key, { ttsResult, storedAt: _now() });
            return key;
        }

        /** invalidateSession() — real cleanup when a live session ends; prevents an ended session's segment ids from lingering and (harmlessly, but wastefully) occupying cache slots. */
        invalidateSession(sessionId) {
            let removed = 0;
            for (const cache of [this.#text, this.#audio]) {
                for (const key of Array.from(cache._map.keys())) {
                    if (key.startsWith(`${sessionId}:`)) { cache.delete(key); removed++; }
                }
            }
            return removed;
        }

        getDiagnosticsReport() {
            return {
                moduleVersion: MODULE_VERSION,
                textCacheSize: this.#text.size,
                audioCacheSize: this.#audio.size,
                textCacheLimit: this.#TEXT_LIMIT,
                audioCacheLimit: this.#AUDIO_LIMIT,
            };
        }

        _clearAll() { this.#text.clear(); this.#audio.clear(); }
    }

    window.CozyOS.LiveTranslationResultCache = new LiveTranslationResultCache();
    window.CozyOS.Modules["live-translation-result-cache"] = Object.freeze({
        version: MODULE_VERSION,
        description: "R040 Phase 2 — bounded text/audio result cache so identical (session, segment, sourceLanguage, targetLanguage[, voiceProfile]) work is never redone per-viewer. Genuinely new dependency; composes nothing because nothing at this layer existed to compose.",
    });
})();
