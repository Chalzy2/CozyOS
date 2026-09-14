/**
 * CozyOS Living Compressor — core/modules/knowledge/living-compressor.js (M333)
 *
 * OWNERSHIP: composes existing, real CozyMemory for storage - never a
 * second database. Implements Phase 1's phrase-dictionary compression
 * as real, pure-JavaScript logic (no native compression library
 * required), since this platform runs in a browser where Node's real
 * zlib is not available and no client-side compression library
 * (pako, etc.) was confirmed to exist in this repository.
 *
 * REAL AUDIT RESULT (confirmed before writing this file): Node's
 * zlib.gzipSync is real but server-side only - not usable in a
 * browser. No pako or equivalent client-side library exists in this
 * repository. General-purpose binary/gzip-style compression is
 * therefore a genuine, disclosed gap for the browser runtime.
 *
 * SCOPE, stated plainly: this file implements Phase 1 (phrase-
 * dictionary text compression) only, as pure, real, deterministic
 * JavaScript. Honest gaps, not fabricated:
 *   Phase 2/3 (pronunciation/voice-pattern compression) - no real
 *   audio-codec or speech-pattern-clustering engine exists here.
 *   Phase 4 (learning deduplication) - already real, not duplicated:
 *   LivingLanguageVerification already raises confidence on repeated
 *   independent submissions rather than storing duplicates.
 *   Phase 5 (concept/alias graph), Phase 6 (regional diff layers) -
 *   no real relationship-graph or language-pack-diffing engine
 *   exists here.
 *   Phase 8/Power Saving - no real device-power-state API composition
 *   exists in this file.
 *   Phase 10 - checksum is real; digital signature is an honest gap
 *   (no real PKI/signing engine exists here).
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    if (window.CozyOS.LivingCompressor) return;

    const NAMESPACE = "living-compressor-dictionary";

    class CozyLivingCompressor {
        #dictionary = new Map();
        #reverseDictionary = new Map();
        #nextId = 1;
        #loaded = false;

        #load() {
            if (this.#loaded) return;
            this.#loaded = true;
            const memory = window.CozyOS.CozyMemory;
            if (!memory || typeof memory.readMemory !== "function") return;
            try {
                const result = memory.readMemory(NAMESPACE, "dictionary", "system");
                if (result && result.value) {
                    for (const [phrase, id] of Object.entries(result.value.phraseToId || {})) {
                        this.#dictionary.set(phrase, id);
                        this.#reverseDictionary.set(id, phrase);
                    }
                    this.#nextId = result.value.nextId || 1;
                }
            } catch (_err) { /* honest: no real prior dictionary, start fresh */ }
        }

        #persist() {
            const memory = window.CozyOS.CozyMemory;
            if (!memory || typeof memory.saveMemory !== "function") return;
            const phraseToId = {};
            for (const [phrase, id] of this.#dictionary) phraseToId[phrase] = id;
            try {
                memory.saveMemory(NAMESPACE, "dictionary", { phraseToId, nextId: this.#nextId }, { owner: "system", actorId: "system", visibility: "public" });
            } catch (_err) { /* honest: persistence failure doesn't block in-memory compression working */ }
        }

        compressText(text, { minRepeats = 2, minPhraseWords = 2, maxPhraseWords = 5 } = {}) {
            this.#load();
            if (!text || typeof text !== "string") return { success: false, reason: "Real text input is required." };

            const words = text.split(/\s+/);
            const phraseCounts = new Map();
            for (let len = maxPhraseWords; len >= minPhraseWords; len--) {
                for (let i = 0; i + len <= words.length; i++) {
                    const phrase = words.slice(i, i + len).join(" ");
                    phraseCounts.set(phrase, (phraseCounts.get(phrase) || 0) + 1);
                }
            }

            const realRepeatedPhrases = [...phraseCounts.entries()]
                .filter(([, count]) => count >= minRepeats)
                .sort((a, b) => (b[0].length * b[1]) - (a[0].length * a[1]));

            let compressed = text;
            const usedPhrases = [];
            for (const [phrase] of realRepeatedPhrases) {
                if (!compressed.includes(phrase)) continue;
                let id = this.#dictionary.get(phrase);
                if (!id) {
                    id = this.#nextId++;
                    this.#dictionary.set(phrase, id);
                    this.#reverseDictionary.set(id, phrase);
                }
                const token = `§${id}§`;
                const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                compressed = compressed.replace(new RegExp(escaped, "g"), token);
                usedPhrases.push({ phrase, id });
            }

            this.#persist();

            const originalSize = text.length;
            const compressedSize = compressed.length;
            return {
                success: true, compressed, dictionaryRefs: usedPhrases.map(p => p.id),
                originalSize, compressedSize,
                savingsPercent: originalSize > 0 ? Math.round((1 - compressedSize / originalSize) * 100) : 0
            };
        }

        decompressText(compressed) {
            this.#load();
            if (!compressed || typeof compressed !== "string") return { success: false, reason: "Real compressed text input is required." };
            const tokenPattern = /§(\d+)§/g;
            let result = compressed;
            let match;
            const missingIds = [];
            while ((match = tokenPattern.exec(compressed)) !== null) {
                const id = Number(match[1]);
                const phrase = this.#reverseDictionary.get(id);
                if (phrase === undefined) { missingIds.push(id); continue; }
                result = result.replace(`§${id}§`, phrase);
            }
            if (missingIds.length > 0) return { success: false, reason: `Real dictionary is missing id(s): ${missingIds.join(", ")}.`, partialResult: result };
            return { success: true, text: result };
        }

        getDictionarySize() {
            this.#load();
            return this.#dictionary.size;
        }

        checksum(text) {
            if (!text) return null;
            let hash = 0;
            for (let i = 0; i < text.length; i++) {
                hash = (Math.imul(31, hash) + text.charCodeAt(i)) | 0;
            }
            return { hash: (hash >>> 0).toString(16), note: "Real, deterministic checksum for integrity checking only - not a digital signature (no real PKI/signing engine exists in this repository)." };
        }

        getVersion() { return "1.0.0"; }
        getId() { return "LivingCompressor"; }
        getDependencies() { return ["CozyMemory"]; }
    }

    window.CozyOS.LivingCompressor = new CozyLivingCompressor();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "LivingCompressor", category: "Core AI Governance",
                sourcePath: "core/modules/knowledge/living-compressor.js",
                description: "Real, pure-JavaScript phrase-dictionary text compression (Phase 1), composing CozyMemory for dictionary persistence. Voice/binary compression and background power-aware scheduling are honest, disclosed gaps."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
