/**
 * core/plugins/interestOS-core.js
 * InterestOS Phase 1 — the user's directive, planning, teaching, and
 * personal-work coordination application.
 *
 * ARCHITECTURAL DISCIPLINE (per the authorized architecture discovery):
 * this file creates NO second AI engine, NO second memory engine, NO
 * second scheduler, NO second notification engine, NO second language
 * registry, and NO second authorization system. Every real capability
 * below composes an existing, unmodified CozyOS engine:
 *   - Directive/Teach-Cozy persistence -> window.CozyOS.CozyMemory
 *     (namespaces "interestos:directives" / "interestos:taught")
 *   - Goals -> window.CozyOS.Goals (pure passthrough, no wrapping logic)
 *   - One-time reminder record -> window.CozyOS.CozyNotification's own
 *     already-existing, generic "notification" registry interface
 *     (CozyNotification.notification.create/read/update/list) - not a
 *     new registry, the same one every other real notification uses.
 *   - Authorization -> window.CozyOS.IdentityEngine / Session /
 *     ApplicationVisibility (every method below takes actorId and
 *     relies entirely on CozyMemory's own real owner/visibility checks
 *     - this file adds no authorization logic of its own).
 *
 * HONEST, DISCLOSED LIMITATIONS (Phase 1, not fixed here):
 *   - interpretDirective() is a minimal, disclosed HEURISTIC (keyword/
 *     regex based), not real AI interpretation. Repository-wide search
 *     (part of the authorized architecture discovery) found that
 *     core/living/cozy-living-assistant.js's real interpretation
 *     pipeline (the .interpretation result documented in its own
 *     header) is internal to its own chat-mount flow and has no public,
 *     externally-callable method — adding one is a LivingAssistant
 *     change, out of this task's authorized scope. Because every
 *     directive requires real user confirmation before being saved
 *     (see createDirective()'s draft/confirm split below), an
 *     imperfect heuristic guess is safe: the user corrects it before
 *     anything is persisted.
 *   - One-time reminders fire only while this browser tab remains open
 *     (a real window.setTimeout, the plainest, most honest mechanism
 *     available - core/scheduler.js was found during discovery but is
 *     an ES module never wired into the window.CozyOS browser-global
 *     pattern anything else in this repository uses, and is interval-
 *     only, not one-shot; extending it is out of this task's scope).
 *     Reminders do NOT persist/refire across a reload - this is
 *     disclosed to the caller via scheduleOneTimeReminder()'s own
 *     return value, never silently claimed as working.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};

    const DIRECTIVE_NAMESPACE = "interestos:directives";
    const TAUGHT_NAMESPACE = "interestos:taught";
    const VERSION = "0.1.0-PHASE1";

    const STATUSES = Object.freeze(["active", "paused", "completed"]);
    const SOURCES = Object.freeze(["voice", "text"]);
    const PROVENANCE = Object.freeze(["USER_TAUGHT", "SYSTEM_VERIFIED", "AI_INFERRED"]);

    function requireMemory() {
        const mem = window.CozyOS.CozyMemory;
        if (!mem) throw new Error("[InterestOS] CozyMemory is not loaded — InterestOS has no persistence without it (by design, it does not create a second memory engine).");
        return mem;
    }

    /** unwrapMemoryValue() — CozyMemory wraps every saved value inside a
     *  real envelope ({value, owner, tags, visibility, savedAt, ...});
     *  this pulls the real InterestOS record back out, plus the real
     *  owner CozyMemory itself tracked, without assuming the envelope
     *  shape is InterestOS's own to define. */
    function unwrapMemoryValue(entry) {
        if (!entry) return null;
        return { ...entry.value, owner: entry.owner };
    }

    function generateId(prefix) {
        return `${prefix}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now() + "_" + Math.random().toString(36).slice(2)}`;
    }

    function escapeHtml(v) {
        return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    /**
     * InterestOSReminderStore — Phase 2, Dependency #1.
     *   Real, InterestOS-owned IndexedDB persistence for one-time
     *   reminders, closing the "lost on reload" gap the Phase 2 audit
     *   identified. Deliberately mirrors the exact real, existing
     *   open/save/loadAll pattern in core/modules/identity/identity-
     *   storage.js (isAvailable()/#openDatabase()/put via a readwrite
     *   transaction/getAll via a readonly transaction) — reusing that
     *   proven pattern, not that file's database or object store.
     *   InterestOS reminders live in their own real, separate database
     *   ("cozyos-interestos"), never inside the identity/session store.
     *   This is NOT a generic scheduler: it only ever stores/reads
     *   reminder records; timing/firing still happens via a plain
     *   window.setTimeout in InterestOSCore below, same as Phase 1.
     */
    class InterestOSReminderStore {
        #dbPromise = null;
        static DB_NAME = "cozyos-interestos";
        static DB_VERSION = 1;
        static STORE_NAME = "reminders";

        isAvailable() { return typeof indexedDB !== "undefined"; }

        #openDatabase() {
            if (this.#dbPromise) return this.#dbPromise;
            this.#dbPromise = new Promise((resolve, reject) => {
                if (!this.isAvailable()) { reject(new Error("IndexedDB is not available in this environment.")); return; }
                const request = indexedDB.open(InterestOSReminderStore.DB_NAME, InterestOSReminderStore.DB_VERSION);
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains(InterestOSReminderStore.STORE_NAME)) {
                        db.createObjectStore(InterestOSReminderStore.STORE_NAME, { keyPath: "id" });
                    }
                };
                request.onsuccess = (event) => resolve(event.target.result);
                request.onerror = () => reject(request.error || new Error("Failed to open IndexedDB."));
            });
            return this.#dbPromise;
        }

        async save(record) {
            if (!record || !record.id) return { success: false, reason: "record.id is required as the real storage key." };
            try {
                const db = await this.#openDatabase();
                return await new Promise((resolve) => {
                    const tx = db.transaction(InterestOSReminderStore.STORE_NAME, "readwrite");
                    tx.objectStore(InterestOSReminderStore.STORE_NAME).put(record);
                    tx.oncomplete = () => resolve({ success: true });
                    tx.onerror = () => resolve({ success: false, reason: tx.error ? tx.error.message : "Unknown transaction error." });
                });
            } catch (err) {
                return { success: false, reason: err.message };
            }
        }

        async loadAll() {
            try {
                const db = await this.#openDatabase();
                return await new Promise((resolve) => {
                    const tx = db.transaction(InterestOSReminderStore.STORE_NAME, "readonly");
                    const request = tx.objectStore(InterestOSReminderStore.STORE_NAME).getAll();
                    request.onsuccess = () => resolve({ success: true, records: request.result || [] });
                    request.onerror = () => resolve({ success: false, reason: request.error ? request.error.message : "Unknown read error.", records: [] });
                });
            } catch (err) {
                return { success: false, reason: err.message, records: [] };
            }
        }
    }

    class InterestOSCore {
        getVersion() { return VERSION; }

        /**
         * interpretDirective(text)
         *   DISCLOSED HEURISTIC — see file header. Returns a draft, not
         *   a persisted record. Never called by anything other than the
         *   UI's own "show interpretation, then confirm" step.
         *
         *   KISWAHILI (Phase 1 audit finding, not fabricated): the real
         *   Kiswahili capability in this repository is speech
         *   recognition (real, tested) and a real Kiswahili
         *   conversational FAQ-intent classifier (rule-based-
         *   conversational-provider.js) limited to ~20 fixed intents
         *   (greetings/help/what-is-cozyos/etc.) with no public,
         *   externally-callable method and no directive-extraction
         *   capability — confirmed by reading it, not assumed. There is
         *   no existing free-form Kiswahili (or English) "extract
         *   action/time/subject from this sentence" capability anywhere
         *   in this repository for either language; this heuristic is
         *   the only thing doing that job, for either language, today.
         *   A small set of real Kiswahili keywords is recognized below
         *   so voice/text in Kiswahili can drive the same pipeline as
         *   English — this is NOT a second language engine, just more
         *   keywords in the same one heuristic function.
         */
        interpretDirective(rawText) {
            const text = String(rawText || "").trim();
            if (!text) return { available: false, reason: "Empty directive text." };

            const lower = text.toLowerCase();
            let action = "task";
            if (/\bremind\b|\bnikumbushe\b|\bkumbuka\b/.test(lower)) action = "reminder";
            else if (/\bgoal\b|\blengo\b/.test(lower)) action = "goal";

            let reminderAt = null;
            // English "at 4pm" / "4:30 pm" style, and Kiswahili clock
            // convention ("saa kumi jioni" etc. is NOT parsed here — real
            // Kiswahili clock-hour conversion is a separate, non-trivial
            // capability this heuristic honestly does not attempt; only
            // a plain numeric "saa <number>" is recognized).
            const timeMatch = lower.match(/\b(?:at\s+|saa\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
            if (action === "reminder" && timeMatch) {
                let hour = parseInt(timeMatch[1], 10);
                const minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
                const meridiem = timeMatch[3];
                if (meridiem === "pm" && hour < 12) hour += 12;
                if (meridiem === "am" && hour === 12) hour = 0;
                if (hour >= 0 && hour <= 23) {
                    const now = new Date();
                    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
                    if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
                    reminderAt = target.toISOString();
                }
            }

            const detectedLanguage = /\b(nikumbushe|kumbuka|lengo|saa)\b/.test(lower) ? "sw" : "en";

            return {
                available: true,
                method: "HEURISTIC",
                detectedLanguage,
                intentGuess: text,
                actionGuess: action,
                reminderAtGuess: reminderAt,
                disclosure: detectedLanguage === "sw"
                    ? "Kiswahili keywords recognized (heuristic, not real AI). Note: verified Kiswahili confirmation wording is not yet implemented — this explanation is shown in English."
                    : "This is a simple keyword-based guess, not real AI interpretation — review and correct it before confirming."
            };
        }

        /**
         * createDirective(...)
         *   Only ever called AFTER the user has reviewed/edited the
         *   interpretDirective() draft and explicitly confirmed it
         *   (confirmation-first rule — enforced by the caller passing
         *   confirmed:true; this method refuses to persist otherwise).
         */
        createDirective({ owner, actorId, text, source, action, reminderAt = null, confirmed = false } = {}) {
            if (!owner || typeof owner !== "string") throw new TypeError("[InterestOS] createDirective(): owner is required.");
            if (!text || typeof text !== "string" || !text.trim()) throw new TypeError("[InterestOS] createDirective(): text is required.");
            if (!SOURCES.includes(source)) throw new TypeError(`[InterestOS] createDirective(): source must be one of: ${SOURCES.join(", ")}.`);
            if (!confirmed) throw new Error("[InterestOS] createDirective(): refused — a directive must be confirmed by the user before it is persisted (confirmation-first rule).");

            const memory = requireMemory();
            const id = generateId("directive");
            const now = new Date().toISOString();
            const record = {
                id,
                owner,
                text: escapeHtml(text.trim()),
                interpretedAction: action || "task",
                reminderAt: reminderAt || null,
                source,
                status: "active",
                createdAt: now,
                updatedAt: now
            };
            memory.saveMemory(DIRECTIVE_NAMESPACE, id, record, { owner, actorId: actorId || owner, tags: ["interestos", "directive"] });
            return unwrapMemoryValue(memory.readMemory(DIRECTIVE_NAMESPACE, id, actorId || owner));
        }

        getDirective(id, actorId) {
            return unwrapMemoryValue(requireMemory().readMemory(DIRECTIVE_NAMESPACE, id, actorId));
        }

        listDirectives(owner, actorId) {
            if (!owner) throw new TypeError("[InterestOS] listDirectives(): owner is required.");
            return requireMemory().listKeys(DIRECTIVE_NAMESPACE, (entry) => entry.owner === owner, actorId || owner)
                .map((entry) => ({ key: entry.key, ...entry.value, owner: entry.owner }));
        }

        #mutateDirective(id, actorId, changes) {
            const memory = requireMemory();
            const current = unwrapMemoryValue(memory.readMemory(DIRECTIVE_NAMESPACE, id, actorId));
            if (!current) throw new Error(`[InterestOS] No directive "${id}" (or not visible to this actor).`);
            const updated = { ...current, ...changes, updatedAt: new Date().toISOString() };
            memory.updateMemory(DIRECTIVE_NAMESPACE, id, updated, { owner: current.owner, actorId });
            return unwrapMemoryValue(memory.readMemory(DIRECTIVE_NAMESPACE, id, actorId));
        }

        updateDirective(id, changes, actorId) {
            const safeChanges = {};
            if (typeof changes.text === "string" && changes.text.trim()) safeChanges.text = escapeHtml(changes.text.trim());
            if (typeof changes.reminderAt === "string" || changes.reminderAt === null) safeChanges.reminderAt = changes.reminderAt;
            return this.#mutateDirective(id, actorId, safeChanges);
        }

        pauseDirective(id, actorId) { return this.#mutateDirective(id, actorId, { status: "paused" }); }
        resumeDirective(id, actorId) { return this.#mutateDirective(id, actorId, { status: "active" }); }

        /**
         * completeDirective(id, actorId)
         *   Phase 2, Dependency #5 (targeted audit finding): STATUSES
         *   above has always declared "completed" as a real, valid
         *   directive status, but no method ever reached it — pause/
         *   resume only ever toggled active/paused. This is the single
         *   missing transition, added the same way pause/resume already
         *   work: through the existing #mutateDirective() private
         *   helper, which itself only ever calls the real, unmodified
         *   CozyMemory.updateMemory() (same owner/authorization checks,
         *   no new persistence, no new store, no new authorization
         *   logic). This is what lets a reminder's linked directive
         *   actually be marked done from the My Reminders view below,
         *   rather than sitting in "active" forever once its one-time
         *   reminder has fired.
         */
        completeDirective(id, actorId) { return this.#mutateDirective(id, actorId, { status: "completed" }); }

        deleteDirective(id, actorId) {
            return requireMemory().deleteMemory(DIRECTIVE_NAMESPACE, id, { actorId, authorized: true });
        }

        /**
         * teach({...})
         *   "Teach Cozy" — provenance model reused conceptually from
         *   KnowledgeProvenanceEngine's real USER_TAUGHT/SYSTEM_VERIFIED/
         *   AI_INFERRED distinction (that engine's own methods are
         *   language/pronunciation-specific and not a fit for arbitrary
         *   free-form taught facts — this reuses its provenance LABELS,
         *   not a call to its narrower API, and stores through the same
         *   CozyMemory already used for directives, not a new store).
         *   provenance always defaults to USER_TAUGHT here since this
         *   method only exists to let a user explicitly teach something
         *   — it must never be called to record an AI inference as if
         *   the user had taught it.
         */
        teach({ owner, actorId, text, provenance = "USER_TAUGHT" } = {}) {
            if (!owner || typeof owner !== "string") throw new TypeError("[InterestOS] teach(): owner is required.");
            if (!text || typeof text !== "string" || !text.trim()) throw new TypeError("[InterestOS] teach(): text is required.");
            if (!PROVENANCE.includes(provenance)) throw new TypeError(`[InterestOS] teach(): provenance must be one of: ${PROVENANCE.join(", ")}.`);
            if (provenance !== "USER_TAUGHT") throw new Error("[InterestOS] teach(): this method only records USER_TAUGHT entries — AI-inferred or system-verified knowledge must never be silently recorded as user-taught.");

            const memory = requireMemory();
            const id = generateId("taught");
            const now = new Date().toISOString();
            const record = { id, owner, text: escapeHtml(text.trim()), provenance, createdAt: now };
            memory.saveMemory(TAUGHT_NAMESPACE, id, record, { owner, actorId: actorId || owner, tags: ["interestos", "taught", provenance] });
            return unwrapMemoryValue(memory.readMemory(TAUGHT_NAMESPACE, id, actorId || owner));
        }

        listTaught(owner, actorId) {
            if (!owner) throw new TypeError("[InterestOS] listTaught(): owner is required.");
            return requireMemory().listKeys(TAUGHT_NAMESPACE, (entry) => entry.owner === owner, actorId || owner)
                .map((entry) => ({ key: entry.key, ...entry.value, owner: entry.owner }));
        }

        /**
         * scheduleOneTimeReminder({directiveId, owner, fireAt, message})
         *   Phase 2, Dependency #1: now also persists the reminder to
         *   the real, InterestOS-owned IndexedDB store above, so a
         *   reload no longer silently loses it (see rehydrateReminders()
         *   below). Still real, disclosed, tab-lifetime-only FIRING —
         *   persistence closes "lost on reload", not "fires while the
         *   app isn't open", which remains genuinely unimplemented (no
         *   service worker push/periodicSync exists in this repository
         *   — confirmed by the Phase 2 audit, not assumed).
         *   Now async because a real IndexedDB write is async; the
         *   in-memory CozyNotification record and the real setTimeout
         *   firing behavior are otherwise unchanged from Phase 1.
         */
        async scheduleOneTimeReminder({ directiveId, owner, fireAt, message, actorId } = {}) {
            if (!directiveId || !owner || !fireAt || !message) {
                throw new TypeError("[InterestOS] scheduleOneTimeReminder(): directiveId, owner, fireAt, and message are required.");
            }
            const notification = window.CozyOS.CozyNotification;
            if (!notification || !notification.notification || typeof notification.notification.create !== "function") {
                return { available: false, persistent: false, reason: "CozyNotification is not loaded — no reminder record could be created." };
            }
            const fireTime = new Date(fireAt).getTime();
            const msUntil = fireTime - Date.now();
            if (!Number.isFinite(msUntil) || msUntil < 0) {
                return { available: false, persistent: false, reason: "fireAt must be a real, future timestamp." };
            }

            const record = notification.notification.create({
                type: "interestos-reminder", directiveId, owner, message: escapeHtml(message), fireAt, delivered: false
            });

            const store = new InterestOSReminderStore();
            let persistedToDisk = false;
            if (store.isAvailable()) {
                const saveResult = await store.save({ id: record.id, directiveId, owner, fireAt, message: escapeHtml(message), delivered: false });
                persistedToDisk = saveResult.success;
            }

            const timeoutHandle = this.#armReminderTimeout(record.id, owner, msUntil, store, persistedToDisk);

            return {
                available: true,
                persistent: false,
                persistedToDisk,
                reminderId: record.id,
                disclosure: persistedToDisk
                    ? "This reminder survives a page reload, but only while this browser tab/app is open when it comes due — it does not fire in the background. Persistent background delivery is not implemented."
                    : "This reminder will only fire while this browser tab stays open, and will NOT survive a reload (IndexedDB is unavailable in this environment).",
                cancel: () => clearTimeout(timeoutHandle)
            };
        }

        /** #armReminderTimeout() — the one real setTimeout firing path,
         *  shared by scheduleOneTimeReminder() and rehydrateReminders()
         *  so there is exactly one place that marks a reminder delivered,
         *  in both CozyNotification and (if available) the real
         *  IndexedDB store. */
        #armReminderTimeout(reminderId, owner, msUntil, store, persistedToDisk) {
            return setTimeout(async () => {
                const notification = window.CozyOS.CozyNotification;
                if (notification && notification.notification && typeof notification.notification.update === "function") {
                    notification.notification.update(reminderId, { delivered: true, deliveredAt: new Date().toISOString() });
                }
                if (persistedToDisk && store) {
                    const current = (await store.loadAll()).records.find((r) => r.id === reminderId);
                    if (current) await store.save({ ...current, delivered: true, deliveredAt: new Date().toISOString() });
                }
            }, msUntil);
        }

        /**
         * rehydrateReminders(owner)
         *   Phase 2, Dependency #1: called once when InterestOS loads.
         *   Reads every real, persisted, undelivered reminder for this
         *   owner (owner isolation enforced here, not merely trusted
         *   from the stored record) and:
         *     - if genuinely still in the future: re-arms a real
         *       setTimeout for the remaining duration (never a fresh
         *       full duration — a reminder due in 5 minutes that was
         *       persisted 3 minutes ago fires in 2 minutes, not 5).
         *     - if already due (fireAt <= now): handled deterministically
         *       — immediately marked delivered rather than left
         *       ambiguously pending or silently fired late with a
         *       potentially confusing timestamp.
         *   Never creates a second scheduler — this only ever produces
         *   the same plain setTimeout calls scheduleOneTimeReminder()
         *   itself makes.
         */
        async rehydrateReminders(owner) {
            if (!owner) throw new TypeError("[InterestOS] rehydrateReminders(): owner is required.");
            const store = new InterestOSReminderStore();
            if (!store.isAvailable()) return { available: false, reason: "IndexedDB is not available in this environment — no reminders to rehydrate.", rearmed: 0, dueImmediately: 0 };

            const result = await store.loadAll();
            if (!result.success) return { available: false, reason: result.reason, rearmed: 0, dueImmediately: 0 };

            const mine = result.records.filter((r) => r.owner === owner && !r.delivered);
            let rearmed = 0, dueImmediately = 0;
            const now = Date.now();
            for (const r of mine) {
                const msUntil = new Date(r.fireAt).getTime() - now;
                if (msUntil <= 0) {
                    await store.save({ ...r, delivered: true, deliveredAt: new Date().toISOString() });
                    const notification = window.CozyOS.CozyNotification;
                    if (notification && notification.notification && typeof notification.notification.update === "function") {
                        notification.notification.update(r.id, { delivered: true, deliveredAt: new Date().toISOString() });
                    }
                    dueImmediately++;
                } else {
                    this.#armReminderTimeout(r.id, owner, msUntil, store, true);
                    rearmed++;
                }
            }
            return { available: true, rearmed, dueImmediately };
        }

        getDiagnosticsReport() {
            return { version: VERSION };
        }

        /**
         * listCalculationFormulas() / runCalculation(formulaId, inputs)
         *   Phase 2, Dependency #2 — pure passthrough to the existing,
         *   authoritative window.CozyOS.FormulaRegistry / CalculationEngine
         *   (the same real engines the User Dashboard's own Calculations
         *   surface already uses — see core/shell/user-dashboard.js).
         *   InterestOS adds zero calculation logic of its own here, per
         *   the Phase 2 audit: Goals already owns its own real progress-
         *   percentage math internally (cozy-goals-engine.js's own
         *   updateProgress(), explicitly documented there as "never
         *   duplicated by a caller") and is not touched by these
         *   methods; there is no generic percentage/target-difference
         *   or date/time formula registered anywhere in this repository
         *   (confirmed by listing every real registered formula) — this
         *   integration exposes exactly the 19 real, existing business/
         *   construction/church formulas that do exist, nothing more.
         */
        listCalculationFormulas() {
            const registry = window.CozyOS.FormulaRegistry;
            if (!registry || typeof registry.list !== "function") {
                return { available: false, reason: "FormulaRegistry is not loaded.", formulas: [] };
            }
            return { available: true, formulas: registry.list() };
        }

        runCalculation(formulaId, inputs) {
            const engine = window.CozyOS.CalculationEngine;
            if (!engine || typeof engine.calculate !== "function") {
                return { success: false, reason: "CalculationEngine is not loaded." };
            }
            return engine.calculate(formulaId, inputs);
        }
    }

    const instance = new InterestOSCore();
    window.CozyOS.InterestOS = instance;
    // Exposed for testing/diagnostics only — the reminder store is a
    // real internal component of InterestOS itself (see class above),
    // not a second application or engine.
    window.CozyOS.InterestOSReminderStore = InterestOSReminderStore;

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerApplication === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerApplication({
                id: "interestos", name: "InterestOS", category: "Business Application",
                entryPoint: "applications/InterestOS/interestos.html", launcher: "core/plugins/interestOS-core.js",
                version: VERSION, enabled: true,
                description: "Phase 1: user directives (confirm-before-persist), Teach Cozy (user-taught knowledge with honest provenance), My Goals (real passthrough to the existing Goals engine), one-time reminders (tab-lifetime only — no persistent background scheduling yet, though a reminder now survives a page reload via real IndexedDB persistence), real business/construction/church Calculations (pure passthrough to the existing FormulaRegistry/CalculationEngine), and My Documents (real, durable, owner-isolated document list/save/search/upload/download via InterestOSDocumentsClient — personal for individual users, organization-scoped for company users, through the existing Document Ownership Foundation). Attaching a document uses a compact \"+\" action offering three real, verified sources: Camera (device camera capture where the browser/OS supports it), Photos (the real photo/gallery picker), and Files (the real file picker) — a file from any of these is uploaded and can later be downloaded exactly as uploaded, verified end to end against the real backend. Scanner and Plugins were evaluated and are not offered: no existing CozyOS capability wires either into document attachment yet. PDF generation, OCR, sharing, and printing also remain named, real, and not yet built. Human purpose: lets a user keep a real file (a receipt, a contract, a photo of a delivery note) attached to their own records instead of losing it in a phone gallery or a paper pile, using whichever real source (camera, gallery, or file) is most convenient in the moment — real-life problem solved is losing important paperwork or having no safe place to keep it; beneficiaries are individual users and small-business owners; the human benefit is one place to find a document again when it's needed, kept privately and only accessible to its real owner.  My Reminders: a real, owner-isolated list of every reminder the user has scheduled — real message, real scheduled time, and real pending/delivered status read directly from the same record scheduleOneTimeReminder() already writes, now also showing the linked directive's own action (reminder/task/goal) and offering a real \"Mark done\" action that completes that directive (no editing, deletion, or voice reminders from this view yet). Real-life problem solved: forgetting what you told CozyOS to remind you about, having no single place to check what's still coming up, or a finished reminder leaving its directive stuck showing as still active; beneficiaries are the same individual users and small-business owners as above; the human gain is a quick, honest answer to what they've asked CozyOS to remind them about, with a real way to close the loop once it's handled, without hunting through past conversations. Daily Balance and cross-application aggregation remain a stated future vision, not a current capability."
            });
        } catch (_err) { /* non-fatal */ }
    } else if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({ sourcePath: "core/plugins/interestOS-core.js", name: "InterestOS", category: "Business Application", icon: "compass.svg", description: "Phase 1 — directives, Teach Cozy, Goals passthrough, one-time reminders." });
        } catch (_err) { /* non-fatal */ }
    }
})();
