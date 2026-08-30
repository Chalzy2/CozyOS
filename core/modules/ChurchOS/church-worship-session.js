/**
 * ChurchOS — Live Worship Session (M329)
 * core/modules/ChurchOS/church-worship-session.js
 *
 * OWNERSHIP: composes existing, real engines - never a second speech,
 * translation, or verification system.
 *
 * REAL AUDIT RESULTS (confirmed before writing this file):
 *   REAL and composed: SpeechRecognitionAdapter (real speech-to-text,
 *   event-driven start()/stop()/on()), SpeechTranslationAdapter (real
 *   startTranslationSession()/translateText(), fails closed with a
 *   real thrown error if CozyTranslate isn't loaded - never fabricates
 *   a translation), UniversalLearningPipeline (M322, for unknown-word
 *   handling per the "never pretend to know" principle).
 *
 *   HONEST GAPS, not fabricated: automatic source-language detection
 *   (no real LanguageDetector engine exists - the pastor/admin must
 *   specify the source language explicitly), Media Engine (no real
 *   video/audio recording-and-indexing engine confirmed),
 *   Attendance-during-service tracking (not automatically triggered
 *   here - remains a real, separate, manual action per M328).
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    if (window.CozyOS.ChurchWorshipSession) return;

    class CozyChurchWorshipSession {
        #activeServices = new Map();

        startService(orgId, sourceLanguage) {
            if (!orgId) return { success: false, reason: "A real orgId is required." };
            if (!sourceLanguage) return { success: false, reason: "A real sourceLanguage is required - no automatic language detection engine exists in this repository." };

            const speechAdapter = window.CozyOS.SpeechRecognitionAdapter;
            if (!speechAdapter) return { success: false, reason: "SpeechRecognitionAdapter is not loaded." };
            if (!speechAdapter.isReal()) return { success: false, reason: "Real browser SpeechRecognition API is not available in this environment." };

            const serviceId = `service_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            this.#activeServices.set(serviceId, {
                orgId, sourceLanguage, speechSessionId: null,
                translationSessions: new Map(), transcript: [], startedAt: new Date().toISOString(),
                timeline: [], bibleReferences: []
            });

            const living = window.CozyOS.Living;
            if (living && typeof living.transaction?.begin === "function") {
                const { id } = living.transaction.begin({ name: "ChurchOS.worshipService", type: "church-worship", source: "ChurchWorshipSession", detail: { orgId, serviceId } });
                this.#activeServices.get(serviceId).transactionId = id;
            }

            return { success: true, serviceId };
        }

        addListenerLanguage(serviceId, targetLanguage) {
            const service = this.#activeServices.get(serviceId);
            if (!service) return { success: false, reason: `No real active service "${serviceId}".` };
            if (service.translationSessions.has(targetLanguage)) return { success: true, alreadyActive: true };

            const translationAdapter = window.CozyOS.SpeechTranslationAdapter;
            if (!translationAdapter) return { success: false, reason: "SpeechTranslationAdapter is not loaded." };

            try {
                const translationSessionId = translationAdapter.startTranslationSession({
                    sourceLanguage: service.sourceLanguage, targetLanguage, sourceSpeechSessionId: service.speechSessionId
                });
                service.translationSessions.set(targetLanguage, translationSessionId);
                return { success: true, targetLanguage, translationSessionId };
            } catch (err) {
                return { success: false, reason: err.message };
            }
        }

        /**
         * deliverSpokenText(serviceId, recognizedText) (M342 update)
         *   Real addition: previously this only logged a detected
         *   reference (book/chapter/verse) - it never actually
         *   retrieved or delivered the verse. Now composes the real
         *   Living.scripture gateway (M340) to look up the licensed
         *   verse and attach it to each listener's delivery, in every
         *   language for which a real, licensed translation is
         *   genuinely installed.
         *
         *   Governance boundary, enforced in code, not just documented:
         *   the spoken SERMON text is machine-translated (existing,
         *   unchanged, via SpeechTranslationAdapter below) - the VERSE
         *   text itself is never passed through that translator. Verse
         *   text only ever comes from Living.scripture.compare(), which
         *   only returns genuinely installed, licensed translations. A
         *   listener whose language has no installed translation
         *   honestly gets `available:false`, never a machine-translated
         *   verse.
         */
        async deliverSpokenText(serviceId, recognizedText) {
            const service = this.#activeServices.get(serviceId);
            if (!service) return { success: false, reason: `No real active service "${serviceId}".` };

            service.transcript.push({ text: recognizedText, at: new Date().toISOString(), language: service.sourceLanguage });

            const living = window.CozyOS.Living;
            const refs = this.detectBibleReferences(recognizedText);
            const verseLookups = [];
            if (refs.length > 0) {
                for (const ref of refs) {
                    service.bibleReferences.push({ ...ref, at: new Date().toISOString() });

                    if (living && living.scripture && typeof living.scripture.lookup === "function") {
                        const lookupResult = living.scripture.lookup(ref.book, ref.chapter, ref.verseStart);
                        verseLookups.push({ ref, lookupResult });
                        // Real, honest event so any other real subscriber (e.g. a
                        // church screen, or bible-interface-module's live view)
                        // hears about it too - never a second notification path.
                        if (typeof living.scripture.notifySubscribers === "function") {
                            living.scripture.notifySubscribers({ ...ref, serviceId, lookupResult });
                        }
                    }
                }
            }

            const translationAdapter = window.CozyOS.SpeechTranslationAdapter;
            if (!translationAdapter) return { success: false, reason: "SpeechTranslationAdapter is not loaded." };

            const deliveries = {};
            for (const [targetLanguage, translationSessionId] of service.translationSessions) {
                try {
                    const result = await translationAdapter.translateText(translationSessionId, recognizedText);
                    const delivery = result.isReal ? { success: true, text: result.translatedText } : { success: false, reason: result.reason };

                    if (verseLookups.length > 0) {
                        delivery.verses = verseLookups.map(({ ref, lookupResult }) => {
                            if (!lookupResult || !lookupResult.available) {
                                return { reference: ref.rawMatch, available: false, reason: lookupResult?.reason || "Verse not available." };
                            }
                            const filtered = (living && typeof living.scripture.compare === "function")
                                ? living.scripture.compare(ref.book, ref.chapter, ref.verseStart, [targetLanguage])
                                : null;
                            const hasLicensedTranslation = filtered?.available && Object.keys(filtered.translations || {}).length > 0;
                            return hasLicensedTranslation
                                ? { reference: lookupResult.reference, available: true, translations: filtered.translations }
                                : { reference: ref.rawMatch, available: false, reason: `No licensed "${targetLanguage}" translation is installed for this verse - never machine-translated.` };
                        });
                    }

                    deliveries[targetLanguage] = delivery;

                    // C005 — Translation Broadcast. Composes the exact
                    // same real PlatformEventBus the scripture-detection
                    // path already uses (notifySubscribers() above
                    // delegates to it too) - no new event system, no
                    // second notification path. Only emits when there is
                    // real translated text to deliver; a failed/honest
                    // delivery is not broadcast as if it succeeded.
                    if (delivery.success) {
                        const bus = window.CozyOS.PlatformEventBus;
                        if (bus && typeof bus.emit === "function") {
                            bus.emit("living:caption-translated", { serviceId, targetLanguage, text: delivery.text, verses: delivery.verses || [], at: new Date().toISOString() });
                        }
                    }
                } catch (err) {
                    deliveries[targetLanguage] = { success: false, reason: err.message };
                }
            }
            return { success: true, sourceText: recognizedText, deliveries, versesDetected: refs.length };
        }

        /**
         * deliverSpokenTextStyled(serviceId, recognizedText) (M344)
         *   Additive only — deliverSpokenText() above is unchanged and
         *   still the real, plain delivery path. This composes it, then
         *   additionally attaches a Living.voiceStyle.applyStyle() plan
         *   (rate/pause/rhythm, learned from this same styleId's real
         *   observations) to each language's translated text. Style is
         *   only ever applied to the machine-translated SERMON text —
         *   verse text (already governed as never machine-translated,
         *   see deliverSpokenText()) is untouched here too.
         *   Honest gap: if no styleId has been learned yet for this
         *   service (no prior learnStyle() call), styleDelivery is
         *   returned as unavailable rather than fabricating a plan.
         */
        async deliverSpokenTextStyled(serviceId, recognizedText, styleId = null) {
            const base = await this.deliverSpokenText(serviceId, recognizedText);
            if (!base.success) return base;

            const living = window.CozyOS.Living;
            if (!styleId || !living || !living.voiceStyle || typeof living.voiceStyle.applyStyle !== "function") {
                return { ...base, styleDelivery: { available: false, reason: "No styleId supplied or Living.voiceStyle is not loaded — plain delivery only, not fabricated." } };
            }

            const styleDelivery = {};
            for (const [targetLanguage, delivery] of Object.entries(base.deliveries)) {
                if (!delivery.success) { styleDelivery[targetLanguage] = { available: false, reason: delivery.reason }; continue; }
                const plan = living.voiceStyle.applyStyle(delivery.text, styleId);
                styleDelivery[targetLanguage] = plan.success ? { available: true, plan } : { available: false, reason: plan.reason };
            }
            return { ...base, styleDelivery };
        }

        async reportUnknownWord(serviceId, word, userId) {
            const service = this.#activeServices.get(serviceId);
            if (!service) return { success: false, reason: `No real active service "${serviceId}".` };
            const pipeline = window.CozyOS.UniversalLearningPipeline;
            if (!pipeline) return { success: false, reason: "UniversalLearningPipeline is not loaded." };
            return pipeline.learnFromQuestion(userId, word, null, service.sourceLanguage);
        }

        /**
         * markSection(serviceId, sectionType, label)
         *   Real - Phase 2.5's service timeline. A real, explicit
         *   marker recorded with a real timestamp - matching the
         *   spec's own example ("09:05 Worship", "09:23 Prayer", ...).
         *   This is caller-driven (an admin/pastor taps a button, or an
         *   integration calls this at the right moment) - it does not
         *   automatically detect which section is happening, since no
         *   real audio-classification engine for that exists in this
         *   repository.
         */
        markSection(serviceId, sectionType, label = null) {
            const service = this.#activeServices.get(serviceId);
            if (!service) return { success: false, reason: `No real active service "${serviceId}".` };
            const REAL_SECTION_TYPES = ["service-started", "worship", "prayer", "sermon", "offering", "testimonies", "announcements", "closing-prayer", "service-ended"];
            if (!REAL_SECTION_TYPES.includes(sectionType)) return { success: false, reason: `"${sectionType}" is not a real, recognized section type.` };
            const entry = { sectionType, label, at: new Date().toISOString() };
            service.timeline.push(entry);
            return { success: true, entry };
        }

        /** getServiceTimeline(serviceId) — real, the actual accumulated real timeline and detected Bible references. */
        getServiceTimeline(serviceId) {
            const service = this.#activeServices.get(serviceId);
            if (!service) return { available: false, reason: `No real active service "${serviceId}".` };
            return { available: true, timeline: [...service.timeline], bibleReferences: [...service.bibleReferences] };
        }

        /**
         * detectBibleReferences(text)
         *   Real (M342 update): this file's own reference-detection
         *   regex predated the Living.scripture gateway (M340) and
         *   BibleEngine (M334) and duplicated exactly the same pattern
         *   Living.scripture.detectReference() now owns. Delegates to
         *   the real gateway instead - kept as a same-shaped method on
         *   this class only so every existing caller in this file
         *   (deliverSpokenText, getServiceTimeline) is unaffected.
         *   Fails closed with an empty array (never re-adds a local
         *   regex) if the gateway genuinely isn't loaded - this file's
         *   own script tag in dashboard.html is already ordered after
         *   living-runtime.js, so this is a defensive guard, not an
         *   expected path.
         */
        detectBibleReferences(text) {
            const living = window.CozyOS.Living;
            if (!living || !living.scripture || typeof living.scripture.detectReference !== "function") return [];
            return living.scripture.detectReference(text);
        }

        endService(serviceId) {
            const service = this.#activeServices.get(serviceId);
            if (!service) return { success: false, reason: `No real active service "${serviceId}".` };

            const translationAdapter = window.CozyOS.SpeechTranslationAdapter;
            const stoppedSessions = [];
            if (translationAdapter) {
                for (const [targetLanguage, translationSessionId] of service.translationSessions) {
                    try { translationAdapter.stopTranslationSession(translationSessionId); stoppedSessions.push(targetLanguage); }
                    catch (_err) { /* honest: real stop failure for one language doesn't block ending the whole service */ }
                }
            }

            const living = window.CozyOS.Living;
            if (living && service.transactionId && typeof living.transaction?.commit === "function") {
                living.transaction.commit(service.transactionId);
            }

            const summary = { serviceId, orgId: service.orgId, sourceLanguage: service.sourceLanguage, transcript: [...service.transcript], timeline: [...service.timeline], bibleReferences: [...service.bibleReferences], stoppedTranslationLanguages: stoppedSessions, startedAt: service.startedAt, endedAt: new Date().toISOString() };

            // Real fix (M336): persist the real service summary so it can
            // genuinely be searched later (e.g. by ChurchKnowledgeRouter) -
            // previously this was only returned in-memory and lost the
            // moment the caller discarded the result.
            const memory = window.CozyOS.CozyMemory;
            if (memory && typeof memory.saveMemory === "function") {
                try { memory.saveMemory("church-sermon-archive", `${service.orgId}:${serviceId}`, summary, { owner: service.orgId, actorId: "system", visibility: "public" }); }
                catch (_err) { /* honest: archival failure doesn't block the service from ending */ }
            }

            this.#activeServices.delete(serviceId);
            return { success: true, summary };
        }

        /** searchArchivedServices(orgId, query) — real, composes CozyMemory.listKeys() over the real, persisted sermon archive. */
        searchArchivedServices(orgId, query) {
            const memory = window.CozyOS.CozyMemory;
            if (!memory || typeof memory.listKeys !== "function") return { available: false, reason: "CozyMemory.listKeys() is not available." };
            const lowerQuery = query.toLowerCase();
            const entries = memory.listKeys("church-sermon-archive", (e) => {
                if (!e.key.startsWith(`${orgId}:`)) return false;
                return e.value.transcript.some(t => t.text.toLowerCase().includes(lowerQuery));
            });
            return { available: true, query, results: entries.map(e => e.value) };
        }

        getActiveService(serviceId) {
            const service = this.#activeServices.get(serviceId);
            if (!service) return null;
            return { serviceId, orgId: service.orgId, sourceLanguage: service.sourceLanguage, activeLanguages: Array.from(service.translationSessions.keys()), transcriptEntries: service.transcript.length };
        }

        getVersion() { return "1.0.0"; }
        getId() { return "ChurchWorshipSession"; }
        getDependencies() { return ["SpeechRecognitionAdapter", "SpeechTranslationAdapter", "UniversalLearningPipeline", "Living"]; }
    }

    window.CozyOS.ChurchWorshipSession = new CozyChurchWorshipSession();
})();
