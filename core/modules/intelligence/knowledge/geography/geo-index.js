/**
 * core/modules/intelligence/knowledge/geography/geo-index.js
 * CozyOS — Kiswahili Geographical Semantic Intelligence — Phase 1
 *
 * NEW, ADDITIVE FILE. Aggregates the 4 modular geography data files
 * (kenya-counties.js, tanzania-regions.js, east-africa-hub.js,
 * continental-framework.js — all of which must already be loaded)
 * into ONE lookup surface, and provides compositional Kiswahili
 * geographic query resolution (section 9/10 of the project brief):
 * multi-entity extraction, travel origin/destination, proximity,
 * and location-question intents, built from real regex constructions
 * over the aggregated gazetteer — NOT hard-coded example sentences.
 *
 * This file does not create a second AI, a second semantic engine, or
 * a second Live Window. It is consumed BY the existing rule-based-
 * conversational-provider.js as an additive, defensively-guarded
 * fallback signal source (see that file's small, additive hook).
 *
 * HONESTY DISCLOSURE:
 *  - Entity recognition is substring/alias matching against the
 *    aggregated gazetteer below — real, but not a full NLP named-
 *    entity recognizer. An unfamiliar place name is reported as
 *    `unknownLocation: true`, never silently guessed.
 *  - "same-language" preservation: this module never changes the
 *    detected input language to "en" merely because a place name is
 *    unrecognized (see resolveQuery()'s `language` field, always the
 *    language the caller passed in).
 */
(function (root) {
    "use strict";
    const w = root.window || root;
    w.CozyOS = w.CozyOS || {};
    w.CozyOS.Modules = w.CozyOS.Modules || {};
    if (w.CozyOS.Modules["geo-index"]) return;

    const VERSION = "1.0.0-geo-phase1";

    function getMods() {
        return {
            kenya: w.CozyOS.GeoKenyaCounties || null,
            tanzania: w.CozyOS.GeoTanzaniaRegions || null,
            uganda: w.CozyOS.GeoUgandaDistricts || null,
            eastAfrica: w.CozyOS.GeoEastAfricaHub || null,
            continental: w.CozyOS.GeoContinentalFramework || null
        };
    }

    // ---------------------------------------------------------------
    // Unified lookup across all loaded geography sub-modules.
    // ---------------------------------------------------------------
    function findEntity(nameOrAlias) {
        if (typeof nameOrAlias !== "string" || !nameOrAlias.trim()) return null;
        const mods = getMods();

        if (mods.kenya) {
            const c = mods.kenya.getCounty(nameOrAlias);
            if (c) return Object.assign({ source: "geo-kenya-counties" }, c);
        }
        if (mods.tanzania) {
            const r = mods.tanzania.getRegion(nameOrAlias);
            if (r) return Object.assign({ source: "geo-tanzania-regions" }, r);
        }
        if (mods.uganda) {
            const u = mods.uganda.getDistrict(nameOrAlias);
            if (u) return Object.assign({ source: "geo-uganda-districts" }, u);
        }
        if (mods.eastAfrica) {
            const n = mods.eastAfrica.getCountry(nameOrAlias);
            if (n) return Object.assign({ source: "geo-east-africa-hub" }, n);
        }
        if (mods.continental) {
            const f = mods.continental.findFeature(nameOrAlias);
            if (f) return Object.assign({ source: "geo-continental-framework" }, f);
            const cc = mods.continental.findCountry(nameOrAlias);
            if (cc) return Object.assign({ source: "geo-continental-framework" }, cc);
        }
        return null;
    }

    // Resolve an entity's country relationship (for "same-country"
    // style questions). Counties/regions carry `.country` already;
    // countries/features return their own name/country list.
    function countryOf(entity) {
        if (!entity) return null;
        if (entity.type === "county" || entity.type === "region" || entity.type === "district") return entity.country;
        if (entity.type === "country") return entity.name;
        if (entity.type === "river" || entity.type === "mountain" || entity.type === "lake") {
            return Array.isArray(entity.countries) && entity.countries.length ? entity.countries : null;
        }
        return null;
    }

    function getCoverageCounts() {
        const mods = getMods();
        return Object.freeze({
            kenyaCounties: mods.kenya ? mods.kenya.count : 0,
            tanzaniaRegions: mods.tanzania ? mods.tanzania.count : 0,
            ugandaDistricts: mods.uganda ? mods.uganda.count : 0,
            eastAfricaCountries: mods.eastAfrica ? mods.eastAfrica.count : 0,
            continentalFeatures: mods.continental ? (mods.continental.getCounts().rivers + mods.continental.getCounts().mountains + mods.continental.getCounts().lakes) : 0,
            additionalAfricanCountries: mods.continental ? mods.continental.getCounts().additionalCountries : 0
        });
    }

    // ---------------------------------------------------------------
    // Compositional Kiswahili geographic query resolution.
    // ---------------------------------------------------------------

    // Real Kiswahili geographic-construction patterns from the project
    // brief (section 9), used to find CANDIDATE location spans in the
    // raw text — not to hard-code specific sentences.
    const FROM_TO_PATTERN = /\bkutoka\s+([a-zA-ZÀ-ÿ' ]+?)\s+(?:hadi|mpaka)\s+([a-zA-ZÀ-ÿ' ]+?)(?:[.?!,]|$)/i;
    const TO_PATTERN = /\b(?:kwenda|kuelekea)\s+([a-zA-ZÀ-ÿ' ]+?)(?:[.?!,]|$)/i;
    const FROM_PATTERN = /\b(?:ninatoka|anatoka|natoka|kutoka|toka)\s+([a-zA-ZÀ-ÿ' ]+?)(?:\s+(?:lakini|na|kwenda)\b|[.?!,]|$)/i;
    const NEAR_PATTERN = /\bkaribu\s+na\s+([a-zA-ZÀ-ÿ' ]+?)(?:[.?!,]|$)/i;
    const LOCATION_QUESTION_PATTERN = /\b([a-zA-ZÀ-ÿ' ]+?)\s+(?:iko|ipo)\s+(?:katika\s+)?(?:eneo|mkoa|kaunti)\s+gani\b/i;
    const WHICH_CITIES_PATTERN = /\bmiji\s+(?:gani\s+)?mikubwa\s+([a-zA-ZÀ-ÿ' ]+?)(?:[.?!,]|$)/i;
    // NOTE: deliberately NOT \b-anchored at the start of the root — real
    // Kiswahili verbs carry subject/tense prefixes fused onto the root
    // (tuna-safiri, ali-safiri, wana-tembelea), so a leading word
    // boundary would miss every conjugated form and only match bare
    // infinitives. Anchored only at the end to avoid matching mid-word
    // continuations. Disclosed limitation: short roots ("fika", "kaa")
    // can still substring-match inside unrelated longer words; this is
    // acceptable ONLY as the last-resort fallback signal (after every
    // more specific construction above has already failed to match).
    const TRAVEL_VERB = /(safiri|tembelea|rudi|ondoka|fika|kaa|ishi)\b/i;

    function tryResolveEntity(rawName) {
        if (!rawName) return { unknownLocation: true, raw: rawName || null };
        const clean = rawName.trim().replace(/\s+/g, " ");
        const entity = findEntity(clean);
        if (entity) return { unknownLocation: false, raw: clean, entity };
        return { unknownLocation: true, raw: clean, entity: null };
    }

    /**
     * resolveQuery(text, language)
     *   Compositional (not memorized) Kiswahili geographic semantic
     *   query resolution. `language` should be the language already
     *   detected upstream by this codebase's real language-resolution
     *   path (RP-036 detectLanguageHeuristic / CozyLanguageRegistry) —
     *   this function never re-decides language, per the brief's
     *   "Kiswahili language preservation" requirement.
     */
    function resolveQuery(text, language) {
        if (typeof text !== "string" || !text.trim()) return null;
        const lang = language || "sw";
        let m;

        if ((m = FROM_TO_PATTERN.exec(text))) {
            const origin = tryResolveEntity(m[1]);
            const destination = tryResolveEntity(m[2]);
            return Object.freeze({
                language: lang,
                intent: "travel",
                construction: "kutoka...hadi/mpaka",
                origin,
                destination,
                relation: relationOf(origin, destination)
            });
        }

        if (NEAR_PATTERN.test(text)) {
            m = NEAR_PATTERN.exec(text);
            const reference = tryResolveEntity(m[1]);
            // The subject of "karibu na X" (what is near X) is usually
            // the first recognized entity mentioned earlier in the
            // sentence; scan the aggregated gazetteer for one.
            const subject = scanFirstKnownEntity(text.slice(0, m.index));
            return Object.freeze({
                language: lang,
                intent: "proximity",
                construction: "karibu na",
                subject: subject || { unknownLocation: true, raw: null },
                reference,
                relation: relationOf(subject, reference)
            });
        }

        if (LOCATION_QUESTION_PATTERN.test(text)) {
            m = LOCATION_QUESTION_PATTERN.exec(text);
            const subject = tryResolveEntity(m[1]);
            return Object.freeze({
                language: lang,
                intent: "location_question",
                construction: "X iko/ipo eneo/mkoa/kaunti gani",
                subject
            });
        }

        if (WHICH_CITIES_PATTERN.test(text)) {
            m = WHICH_CITIES_PATTERN.exec(text);
            const countryEntity = tryResolveEntity(m[1]);
            return Object.freeze({
                language: lang,
                intent: "list_query",
                construction: "miji mikubwa <nchi>",
                country: countryEntity,
                items: listMajorPlacesFor(countryEntity)
            });
        }

        if ((m = TO_PATTERN.exec(text))) {
            const destination = tryResolveEntity(m[1]);
            const origin = scanFirstKnownEntity(text.slice(0, m.index));
            return Object.freeze({
                language: lang,
                intent: "travel",
                construction: "kwenda/kuelekea",
                origin: origin || { unknownLocation: true, raw: null },
                destination,
                relation: relationOf(origin, destination)
            });
        }

        if ((m = FROM_PATTERN.exec(text))) {
            const origin = tryResolveEntity(m[1]);
            const destination = scanFirstKnownEntity(text.slice(m.index + m[0].length));
            if (!origin.unknownLocation || destination) {
                return Object.freeze({
                    language: lang,
                    intent: "travel",
                    construction: "kutoka/toka",
                    origin,
                    destination: destination || { unknownLocation: true, raw: null },
                    relation: relationOf(origin, destination)
                });
            }
        }

        // A recognized travel verb with no matched construction above,
        // but at least one recognized place in the sentence: report the
        // entities found, honestly, without inventing origin/destination
        // roles the sentence didn't structurally provide.
        if (TRAVEL_VERB.test(text)) {
            const entities = scanAllKnownEntities(text);
            if (entities.length) {
                return Object.freeze({
                    language: lang,
                    intent: "travel_mention",
                    construction: "travel-verb + entity mention",
                    entities
                });
            }
        }

        return null;
    }

    function relationOf(a, b) {
        const aEntity = a && a.entity;
        const bEntity = b && b.entity;
        if (!aEntity || !bEntity) return Object.freeze({ comparable: false });
        const aCountry = countryOf(aEntity);
        const bCountry = countryOf(bEntity);
        const aList = Array.isArray(aCountry) ? aCountry : (aCountry ? [aCountry] : []);
        const bList = Array.isArray(bCountry) ? bCountry : (bCountry ? [bCountry] : []);
        const sameCountry = aList.some((x) => bList.indexOf(x) !== -1);
        return Object.freeze({ comparable: aList.length > 0 && bList.length > 0, originCountry: aList, destinationCountry: bList, sameCountry });
    }

    // Build ordered candidate name-spans from a span of text: every
    // single capitalized word, PLUS every adjacent 2-word capitalized
    // pair (to catch multi-word names like "Homa Bay"), tried
    // pair-first at each position so a genuine two-word place name
    // isn't shadowed by matching only its first word.
    function candidateSpans(textSpan) {
        const words = textSpan.match(/[A-ZÀ-Ý][a-zà-ÿ'-]+/g) || [];
        const spans = [];
        for (let i = 0; i < words.length; i++) {
            if (i + 1 < words.length) spans.push(words[i] + " " + words[i + 1]);
            spans.push(words[i]);
        }
        return spans;
    }

    // Scan a span of text for the first alias hit against the whole
    // aggregated gazetteer (used to recover an implicit subject/origin
    // that a regex capture group didn't directly capture).
    function scanFirstKnownEntity(textSpan) {
        if (!textSpan) return null;
        for (const span of candidateSpans(textSpan)) {
            const entity = findEntity(span);
            if (entity) return { unknownLocation: false, raw: span, entity };
        }
        return null;
    }

    function scanAllKnownEntities(text) {
        const seen = new Set();
        const out = [];
        for (const span of candidateSpans(text)) {
            const entity = findEntity(span);
            if (entity && !seen.has(entity.id)) {
                seen.add(entity.id);
                out.push({ unknownLocation: false, raw: span, entity });
            }
        }
        return out;
    }

    function listMajorPlacesFor(countryEntity) {
        if (!countryEntity || !countryEntity.entity) return Object.freeze([]);
        const name = countryEntity.entity.name;
        const mods = getMods();
        if (name === "Kenya" && mods.kenya) {
            return Object.freeze(mods.kenya.counties.map((c) => c.headquarters));
        }
        if (name === "Tanzania" && mods.tanzania) {
            return Object.freeze(mods.tanzania.regions.map((r) => r.capital));
        }
        return Object.freeze([]);
    }

    const api = Object.freeze({
        VERSION,
        findEntity,
        countryOf,
        resolveQuery,
        getCoverageCounts
    });

    w.CozyOS.CozyGeographyIndex = api;
    w.CozyOS.Modules["geo-index"] = Object.freeze({
        version: VERSION,
        description: "New, additive geography aggregator + compositional Kiswahili geographic query resolver (travel origin/destination, proximity, location questions, country-level list queries). Composes kenya-counties.js/tanzania-regions.js/east-africa-hub.js/continental-framework.js read-only; consumed defensively by rule-based-conversational-provider.js. Does not modify any existing file."
    });
})(typeof window !== "undefined" ? { window: window } : { window: (global.window = global.window || {}) });
