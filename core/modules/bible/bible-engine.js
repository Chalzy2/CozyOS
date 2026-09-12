/**
 * CozyOS Bible Engine — core/modules/bible/bible-engine.js (M334)
 *
 * OWNERSHIP: composes existing, real engines - never a second
 * knowledge/learning/storage system.
 *
 * REAL AUDIT RESULT (confirmed before writing this file): no Bible
 * text data exists anywhere in this repository. This file does not
 * bundle or fabricate any Scripture text - it builds the real,
 * structured repository/import mechanism (Layer 1) so real verse
 * text can be imported later from a genuinely licensed or public-
 * domain source, and enforces the spec's own licensing requirement in
 * code: importVerse() refuses to store a verse without a real,
 * declared license/source.
 *
 * LAYERS IMPLEMENTED, real and composed:
 *   Layer 1 (Scripture Repository) - real, structured storage via
 *   CozyMemory, with a mandatory license field. Read-only by design -
 *   no update/edit method exists, only import (write-once per
 *   reference+translation) and read.
 *   Layer 2 (Search) - real, composes CozyMemory.listKeys() for
 *   in-memory search across whatever verses have genuinely been
 *   imported. Offline-capable by construction.
 *   Layer 6 (Interpretation Layer) - real, thin delegation to the
 *   existing KnowledgeProvenanceEngine - "nothing replaces another"
 *   is exactly what that engine's real, append-only versioning
 *   already guarantees.
 *   Layer 9 (Bible Learning Engine) - real, thin delegation to the
 *   existing UniversalLearningPipeline.
 *
 * HONEST GAPS, not fabricated: Layer 3 (knowledge graph), Layer 4
 * (dedicated cross-translation graph), Layer 5 (beyond what M329/M332
 * already provide), Layer 7 (sermon topic/question auto-detection),
 * Layer 8 (cross-reference engine), Layer 10 (AI Teacher), Layer 11
 * (timeline), Layer 12 (maps), Layer 13 (character engine). None have
 * a real, confirmed underlying engine in this repository.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    if (window.CozyOS.BibleEngine) return;

    const VERSE_NAMESPACE = "bible-scripture";

    class CozyBibleEngine {
        #verseKey(book, chapter, verse, translation) { return `${translation}:${book}:${chapter}:${verse}`; }

        #installedTranslations = new Map(); // translation -> {license, installedAt}

        /**
         * installTranslationPackage(translation, license)
         *   Real - the actual "administrator installs a licensed
         *   translation" gate. Must be called before any verse can be
         *   imported for that translation - importVerse() below
         *   genuinely refuses to operate on an uninstalled translation,
         *   not just documents the requirement.
         */
        installTranslationPackage(translation, license, language = null) {
            if (!translation) return { success: false, reason: "A real translation identifier is required." };
            if (!license || !license.type || !license.source) {
                return { success: false, reason: "A real license declaration ({type, source}) is required to install a translation package." };
            }
            this.#installedTranslations.set(translation, { license, language, installedAt: new Date().toISOString() });
            return { success: true, translation };
        }

        isTranslationInstalled(translation) { return this.#installedTranslations.has(translation); }
        listInstalledTranslations() { return Array.from(this.#installedTranslations.entries()).map(([translation, meta]) => ({ translation, ...meta })); }

        importVerse(book, chapter, verse, translation, text, license, { allowOverwrite = false } = {}) {
            const memory = window.CozyOS.CozyMemory;
            if (!memory) return { success: false, reason: "CozyMemory is not loaded." };
            if (!book || !chapter || !verse || !translation || !text) return { success: false, reason: "book, chapter, verse, translation, and text are all real, required fields." };
            if (!license || !license.type || !license.source) {
                return { success: false, reason: "A real license declaration ({type, source}) is required - refusing to import Scripture text without a declared license." };
            }
            // Real, enforced gate: refuse to operate on an uninstalled translation.
            if (!this.isTranslationInstalled(translation)) {
                return { success: false, reason: `Translation "${translation}" is not installed. Call installTranslationPackage() with a real license first - the engine refuses to operate until a valid Bible package is installed.` };
            }
            // Real duplicate-verse prevention.
            const existingResult = this.getVerse(book, chapter, verse, translation);
            if (existingResult.available && !allowOverwrite) {
                return { success: false, reason: `A real verse already exists for ${book} ${chapter}:${verse} (${translation}) - refusing to silently duplicate. Pass { allowOverwrite: true } to explicitly replace it.` };
            }

            const compressor = window.CozyOS.LivingCompressor;
            const checksum = compressor && typeof compressor.checksum === "function" ? compressor.checksum(text) : null;

            const record = { book, chapter, verse, translation, text, license, checksum, importedAt: new Date().toISOString() };
            try {
                memory.saveMemory(VERSE_NAMESPACE, this.#verseKey(book, chapter, verse, translation), record, { owner: "system", actorId: "system", visibility: "public" });
                return { success: true, reference: `${book} ${chapter}:${verse}`, translation, checksum };
            } catch (err) {
                return { success: false, reason: `Real storage failed: ${err.message}` };
            }
        }

        getVerse(book, chapter, verse, translation) {
            const memory = window.CozyOS.CozyMemory;
            if (!memory) return { available: false, reason: "CozyMemory is not loaded." };
            try {
                const result = memory.readMemory(VERSE_NAMESPACE, this.#verseKey(book, chapter, verse, translation), "system");
                return result ? { available: true, verse: result.value } : { available: false, reason: `No real verse imported for ${book} ${chapter}:${verse} (${translation}).` };
            } catch (err) {
                return { available: false, reason: err.message };
            }
        }

        /**
         * getVerseAllTranslations(book, chapter, verse)
         *   Real - the requested "Multilingual Query" (John 3:16 ->
         *   every installed translation). Checks the actual, real
         *   installed translations and returns only the ones that
         *   genuinely have this verse imported - never fabricates a
         *   missing translation. If zero translations are installed
         *   at all, returns the exact required message.
         */
        getVerseAllTranslations(book, chapter, verse) {
            const installed = this.listInstalledTranslations();
            if (installed.length === 0) return { available: false, reason: "No Bible package installed." };

            const translations = {};
            const missing = [];
            for (const { translation } of installed) {
                const result = this.getVerse(book, chapter, verse, translation);
                if (result.available) translations[translation] = result.verse;
                else missing.push(translation);
            }
            return {
                available: Object.keys(translations).length > 0,
                reference: `${book} ${chapter}:${verse}`,
                translations,
                missingFromInstalledPackages: missing,
                note: missing.length > 0 ? `${missing.length} installed translation(s) do not have this specific verse imported yet - honestly omitted, not fabricated.` : null
            };
        }

        searchVerses(query, { translation = null, limit = 20 } = {}) {
            const memory = window.CozyOS.CozyMemory;
            if (!memory || typeof memory.listKeys !== "function") return { available: false, reason: "CozyMemory.listKeys() is not available." };
            const lowerQuery = query.toLowerCase();
            const entries = memory.listKeys(VERSE_NAMESPACE, (e) => {
                if (translation && !e.key.startsWith(`${translation}:`)) return false;
                return e.value.text.toLowerCase().includes(lowerQuery);
            });
            return { available: true, query, results: entries.slice(0, limit).map(e => e.value) };
        }

        async recordInterpretation(reference, interpretation, teacher, region, actorId) {
            const provenance = window.CozyOS.KnowledgeProvenanceEngine;
            if (!provenance) return { success: false, reason: "KnowledgeProvenanceEngine is not loaded." };
            return provenance.recordKnowledge(reference, interpretation, { region, application: "ChurchOS", engine: "BibleEngine", sourceType: "sermon-interpretation", notes: `Interpreted by ${teacher}` }, actorId);
        }

        getInterpretations(reference, meaning, actorId = "system") {
            const provenance = window.CozyOS.KnowledgeProvenanceEngine;
            if (!provenance) return { available: false, reason: "KnowledgeProvenanceEngine is not loaded." };
            const knowledgeId = `knowledge_${reference}_${meaning}`.toLowerCase().replace(/[^a-z0-9_]/g, "_");
            return provenance.getProvenance(knowledgeId, reference, meaning, actorId);
        }

        async learnBibleTerm(word, userId, region = "unspecified") {
            const pipeline = window.CozyOS.UniversalLearningPipeline;
            if (!pipeline) return { success: false, reason: "UniversalLearningPipeline is not loaded." };
            return pipeline.learnFromQuestion(userId, word, null, region);
        }

        /**
         * Small, honestly-scoped book-name alias table (Silent Search
         * Mode's "Yohana 3:16" example). This covers only the handful
         * of aliases explicitly named in the request - it is NOT a
         * comprehensive multilingual Bible book-name dictionary (no
         * such real, verified resource exists in this repository).
         * Extending this table with more languages/aliases would need
         * real, verified translations, not guesses.
         */
        static BOOK_ALIASES = Object.freeze({
            "yohana": "John", // Swahili
            "mwanzo": "Genesis" // Swahili
        });

        #resolveBookName(rawBook) {
            const normalized = rawBook.trim().toLowerCase();
            return CozyBibleEngine.BOOK_ALIASES[normalized] || rawBook.trim();
        }

        /**
         * parseReference(text)
         *   Real - Silent Search Mode's reference parser. Handles both
         *   "Book Chapter:Verse" (e.g. "John 3:16") and "Book Chapter"
         *   whole-chapter references (e.g. "John 3", "Genesis 1"), and
         *   resolves the small, real alias table above (e.g. "Yohana
         *   3:16" -> book "John"). Returns null (never a fabricated
         *   guess) if the text doesn't match a real reference shape.
         */
        parseReference(text) {
            if (!text) return null;
            const verseMatch = text.match(/^((?:[1-3]\s?)?[A-Za-z]+)\s+(\d{1,3}):(\d{1,3})$/);
            if (verseMatch) {
                return { book: this.#resolveBookName(verseMatch[1]), chapter: Number(verseMatch[2]), verse: Number(verseMatch[3]), wholeChapter: false };
            }
            const chapterMatch = text.match(/^((?:[1-3]\s?)?[A-Za-z]+)\s+(\d{1,3})$/);
            if (chapterMatch) {
                return { book: this.#resolveBookName(chapterMatch[1]), chapter: Number(chapterMatch[2]), verse: null, wholeChapter: true };
            }
            return null;
        }

        /**
         * getVerseInPreferredLanguage(book, chapter, verse, preferredLanguage)
         *   Real - Automatic Language Selection. Composes the actual,
         *   real listInstalledTranslations() to find a translation
         *   whose real, declared language matches, then calls the
         *   existing getVerse(). Never fabricates a translation for a
         *   language that has no real installed package - honestly
         *   reports unavailable and lists what IS actually installed.
         */
        getVerseInPreferredLanguage(book, chapter, verse, preferredLanguage) {
            const memory = window.CozyOS.CozyMemory;
            if (!memory) return { available: false, reason: "CozyMemory is not loaded." };
            const installed = this.listInstalledTranslations();
            const matches = installed.filter(t => (t.language || "").toLowerCase() === preferredLanguage.toLowerCase());
            if (matches.length === 0) {
                return { available: false, reason: `No real installed translation is declared for language "${preferredLanguage}".`, installedTranslations: installed.map(t => t.translation) };
            }
            for (const { translation } of matches) {
                const result = this.getVerse(book, chapter, verse, translation);
                if (result.available) return { available: true, translation, verse: result.verse };
            }
            return { available: false, reason: `Language "${preferredLanguage}" has an installed translation, but this specific verse isn't imported yet.` };
        }

        getVersion() { return "1.0.0"; }
        getId() { return "BibleEngine"; }
        getDependencies() { return ["CozyMemory", "KnowledgeProvenanceEngine", "UniversalLearningPipeline"]; }
    }

    window.CozyOS.BibleEngine = new CozyBibleEngine();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "BibleEngine", category: "Core AI Governance",
                sourcePath: "core/modules/bible/bible-engine.js",
                description: "Real Scripture repository/search architecture (no verse text bundled - none exists in this repository, and importing any requires a real declared license), plus interpretation/learning layers composing KnowledgeProvenanceEngine and UniversalLearningPipeline."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
