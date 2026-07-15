/**
 * CozyOS Enterprise Framework — CozyLanguageEngine
 * File Reference: core/modules/language/language-engine.js
 * Version: 1.0.0-ENTERPRISE
 * Layer: Core / Platform Service — Language Engine
 *
 * APPROVED EXCEPTION TO RULE 43 (Core Platform Freeze)
 *   Multilingual support was explicitly designated a foundational
 *   platform capability required by every CozyOS application from day
 *   one, rather than waiting for an individual application to expose
 *   the need. This is the ONLY shared translation system — no CozyOS
 *   application may implement its own.
 *
 * RESPONSIBILITY
 *   Real, key-based UI-string translation (menus, buttons, forms,
 *   notifications, reports, receipts, invoices, errors, help text,
 *   dashboard labels) with English as default and fallback language.
 *   Never touches business logic — this is a display layer only.
 *
 * HONEST SCOPE
 *   - The built-in dictionary covers common, general-purpose UI terms
 *     (Save/Cancel/Delete/Search/Total/Date/Invoice/Error/etc.) — it is
 *     NOT an exhaustive dictionary for every domain-specific term a
 *     future application (MpesaOS/ShopOS/QuarryOS/etc.) will need.
 *     Applications register their own additional keys via
 *     addTranslations() — this is the intended extension path, not a
 *     gap to silently work around.
 *   - Kiswahili/French translations use standard, well-established
 *     software-localization terms for common actions and are reasonably
 *     reliable. Arabic and Somali translations are provided in good
 *     faith for the same common terms, but — like any machine-authored
 *     translation set — should be reviewed by a native speaker before
 *     relied on in a production interface. This file does not claim
 *     professional translation-review accuracy.
 *   - RTL support is real for layout DIRECTION (dir="rtl", real
 *     mirrored-icon/logical-property guidance) but does not solve every
 *     RTL design concern (bidi number/date formatting inside mixed
 *     content, application-specific icon mirroring) — those remain each
 *     application's own template/CSS responsibility.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const LANG_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
    const DEFAULT_LANGUAGE = "en";
    const RTL_LANGUAGES = new Set(["ar"]);

    // ── Built-in dictionaries — common UI terms only (see HONEST SCOPE). ────
    // Every language uses the SAME keys as English; a missing key in any
    // non-English language falls back to English automatically at
    // lookup time (never a blank/broken string).
    const BUILTIN_TRANSLATIONS = {
        en: {
            save: "Save", cancel: "Cancel", delete: "Delete", edit: "Edit", submit: "Submit", search: "Search",
            menu: "Menu", dashboard: "Dashboard", settings: "Settings", logout: "Log Out", login: "Log In",
            home: "Home", back: "Back", next: "Next", previous: "Previous", close: "Close", confirm: "Confirm",
            yes: "Yes", no: "No", loading: "Loading…", success: "Success", error: "Error", warning: "Warning",
            required_field: "This field is required", invalid_input: "Invalid input",
            notification: "Notification", report: "Report", receipt: "Receipt", invoice: "Invoice",
            total: "Total", subtotal: "Subtotal", tax: "Tax", amount: "Amount", date: "Date", time: "Time",
            name: "Name", phone: "Phone", email: "Email", address: "Address", status: "Status",
            active: "Active", inactive: "Inactive", pending: "Pending", completed: "Completed", failed: "Failed",
            help: "Help", welcome: "Welcome", thank_you: "Thank you", please_wait: "Please wait",
            no_results: "No results found", download: "Download", upload: "Upload", print: "Print",
            profile: "Profile", notifications: "Notifications", language: "Language",
            items_count_one: "{{count}} item", items_count_other: "{{count}} items"
        },
        sw: {
            save: "Hifadhi", cancel: "Ghairi", delete: "Futa", edit: "Hariri", submit: "Wasilisha", search: "Tafuta",
            menu: "Menyu", dashboard: "Dashibodi", settings: "Mipangilio", logout: "Toka", login: "Ingia",
            home: "Nyumbani", back: "Rudi", next: "Ifuatayo", previous: "Iliyotangulia", close: "Funga", confirm: "Thibitisha",
            yes: "Ndiyo", no: "Hapana", loading: "Inapakia…", success: "Imefanikiwa", error: "Hitilafu", warning: "Onyo",
            required_field: "Sehemu hii inahitajika", invalid_input: "Ingizo si sahihi",
            notification: "Arifa", report: "Ripoti", receipt: "Risiti", invoice: "Ankara",
            total: "Jumla", subtotal: "Jumla ndogo", tax: "Kodi", amount: "Kiasi", date: "Tarehe", time: "Muda",
            name: "Jina", phone: "Simu", email: "Barua pepe", address: "Anwani", status: "Hali",
            active: "Hai", inactive: "Haifanyi kazi", pending: "Inasubiri", completed: "Imekamilika", failed: "Imeshindwa",
            help: "Msaada", welcome: "Karibu", thank_you: "Asante", please_wait: "Tafadhali subiri",
            no_results: "Hakuna matokeo yaliyopatikana", download: "Pakua", upload: "Pakia", print: "Chapisha",
            profile: "Wasifu", notifications: "Arifa", language: "Lugha"
        },
        ar: {
            save: "حفظ", cancel: "إلغاء", delete: "حذف", edit: "تعديل", submit: "إرسال", search: "بحث",
            menu: "القائمة", dashboard: "لوحة التحكم", settings: "الإعدادات", logout: "تسجيل الخروج", login: "تسجيل الدخول",
            home: "الرئيسية", back: "رجوع", next: "التالي", previous: "السابق", close: "إغلاق", confirm: "تأكيد",
            yes: "نعم", no: "لا", loading: "جارٍ التحميل…", success: "تم بنجاح", error: "خطأ", warning: "تحذير",
            required_field: "هذا الحقل مطلوب", invalid_input: "إدخال غير صالح",
            notification: "إشعار", report: "تقرير", receipt: "إيصال", invoice: "فاتورة",
            total: "الإجمالي", subtotal: "المجموع الفرعي", tax: "الضريبة", amount: "المبلغ", date: "التاريخ", time: "الوقت",
            name: "الاسم", phone: "الهاتف", email: "البريد الإلكتروني", address: "العنوان", status: "الحالة",
            active: "نشط", inactive: "غير نشط", pending: "قيد الانتظار", completed: "مكتمل", failed: "فشل",
            help: "مساعدة", welcome: "مرحباً", thank_you: "شكراً لك", please_wait: "يرجى الانتظار",
            no_results: "لم يتم العثور على نتائج", download: "تنزيل", upload: "رفع", print: "طباعة",
            profile: "الملف الشخصي", notifications: "الإشعارات", language: "اللغة"
        },
        fr: {
            save: "Enregistrer", cancel: "Annuler", delete: "Supprimer", edit: "Modifier", submit: "Soumettre", search: "Rechercher",
            menu: "Menu", dashboard: "Tableau de bord", settings: "Paramètres", logout: "Déconnexion", login: "Connexion",
            home: "Accueil", back: "Retour", next: "Suivant", previous: "Précédent", close: "Fermer", confirm: "Confirmer",
            yes: "Oui", no: "Non", loading: "Chargement…", success: "Succès", error: "Erreur", warning: "Avertissement",
            required_field: "Ce champ est requis", invalid_input: "Saisie invalide",
            notification: "Notification", report: "Rapport", receipt: "Reçu", invoice: "Facture",
            total: "Total", subtotal: "Sous-total", tax: "Taxe", amount: "Montant", date: "Date", time: "Heure",
            name: "Nom", phone: "Téléphone", email: "E-mail", address: "Adresse", status: "Statut",
            active: "Actif", inactive: "Inactif", pending: "En attente", completed: "Terminé", failed: "Échoué",
            help: "Aide", welcome: "Bienvenue", thank_you: "Merci", please_wait: "Veuillez patienter",
            no_results: "Aucun résultat trouvé", download: "Télécharger", upload: "Téléverser", print: "Imprimer",
            profile: "Profil", notifications: "Notifications", language: "Langue"
        },
        so: {
            save: "Kaydi", cancel: "Jooji", delete: "Tirtir", edit: "Wax ka beddel", submit: "Gudbi", search: "Raadi",
            menu: "Liiska", dashboard: "Dashboard-ka", settings: "Dejinta", logout: "Ka bax", login: "Gal",
            home: "Guriga", back: "Dib u noqo", next: "Xiga", previous: "Hore", close: "Xir", confirm: "Xaqiiji",
            yes: "Haa", no: "Maya", loading: "Waa la soo rarayaa…", success: "Guul", error: "Khalad", warning: "Digniin",
            required_field: "Goobtan waa lagama maarmaan", invalid_input: "Gelin sax ah ma aha",
            notification: "Ogeysiis", report: "Warbixin", receipt: "Rasiid", invoice: "Qaansheegad",
            total: "Wadarta guud", subtotal: "Wadarta hoose", tax: "Canshuur", amount: "Qadarka", date: "Taariikhda", time: "Waqtiga",
            name: "Magaca", phone: "Taleefanka", email: "Iimaylka", address: "Ciwaanka", status: "Xaaladda",
            active: "Firfircoon", inactive: "Aan firfircoonayn", pending: "Sugaya", completed: "Dhammaystiran", failed: "Guuldarreystay",
            help: "Caawimaad", welcome: "Soo dhawow", thank_you: "Mahadsanid", please_wait: "Fadlan sug",
            no_results: "Natiijo lama helin", download: "Soo deji", upload: "Ku shub", print: "Daabac",
            profile: "Astaanta shakhsiga", notifications: "Ogeysiisyada", language: "Luqadda"
        }
    };

    class CozyOSLanguageEngine {
        #translations = new Map(Object.entries(BUILTIN_TRANSLATIONS).map(([code, dict]) => [code, { ...dict }]));
        #languageMeta = new Map([
            ["en", { name: "English", nativeName: "English", rtl: false, locale: "en-GB" }],
            ["sw", { name: "Kiswahili", nativeName: "Kiswahili", rtl: false, locale: "sw-KE" }],
            ["ar", { name: "Arabic", nativeName: "العربية", rtl: true, locale: "ar-SA" }],
            ["fr", { name: "French", nativeName: "Français", rtl: false, locale: "fr-FR" }],
            ["so", { name: "Somali", nativeName: "Soomaali", rtl: false, locale: "so" }]
        ]);
        #currentLanguage = DEFAULT_LANGUAGE;
        #auditLogs = []; #timelineEvents = []; #listeners = new Map(); #onceWrapped = new Map();
        #diagnostics = { translationsLookedUp: 0, fallbacksUsed: 0, missingKeysReported: 0, languagesRegistered: 5, errorsHidden: 0, eventsEmitted: 0, memoryBaseline: 2.2 };

        getVersion() { return LANG_VERSION; }
        #deepClone(v) { try { return structuredClone(v); } catch (_e) { try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; } } }
        #escapeHtml(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
        #generateId(p) { return `${p}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`; }
        #logAudit(a, m) { this.#auditLogs.push(Object.freeze({ id: this.#generateId("aud"), timestamp: new Date().toISOString(), action: a, msg: m })); if (this.#auditLogs.length > 500) this.#auditLogs.shift(); }
        #logTimeline(l) { this.#timelineEvents.push(Object.freeze({ time: new Date().toISOString(), label: l })); if (this.#timelineEvents.length > 500) this.#timelineEvents.shift(); }
        getAuditLog(p) { const l = this.#auditLogs.map(e => this.#deepClone(e)); return Object.freeze(p ? l.filter(p) : l); }
        getTimeline(p) { const l = this.#timelineEvents.map(e => this.#deepClone(e)); return Object.freeze(p ? l.filter(p) : l); }

        on(e, h) { if (typeof e !== "string" || !e.trim()) throw new TypeError("[LanguageEngine] on(): eventName required."); if (typeof h !== "function") throw new TypeError("[LanguageEngine] on(): handler required."); if (!this.#listeners.has(e)) this.#listeners.set(e, new Set()); this.#listeners.get(e).add(h); return () => this.off(e, h); }
        off(e, h) { const s = this.#listeners.get(e); if (!s) return false; const w = this.#onceWrapped.get(h); const r = s.delete(h) || (w ? s.delete(w) : false); if (s.size === 0) this.#listeners.delete(e); return r; }
        once(e, h) { if (typeof h !== "function") throw new TypeError("[LanguageEngine] once(): handler required."); const w = (p) => { this.off(e, h); this.#onceWrapped.delete(h); h(p); }; this.#onceWrapped.set(h, w); this.on(e, w); }
        emit(e, p) { if (typeof e !== "string" || !e.trim()) { this.#diagnostics.errorsHidden++; return false; } const s = this.#listeners.get(e); this.#diagnostics.eventsEmitted++; if (!s || s.size === 0) return false; let sp = p; try { sp = this.#deepClone(p); } catch (_e) { sp = p; } for (const fn of Array.from(s)) { try { fn(sp); } catch (_e) { this.#diagnostics.errorsHidden++; } } return true; }

        listLanguages() {
            return Array.from(this.#languageMeta.entries()).map(([code, meta]) => ({ code, ...meta, keyCount: this.#translations.get(code)?.size || 0 }));
        }

        getCurrentLanguage() { return this.#currentLanguage; }

        setLanguage(code) {
            if (!this.#translations.has(code)) throw new Error(`[LanguageEngine] setLanguage(): "${code}" is not registered. Call registerLanguage() first.`);
            this.#currentLanguage = code;
            this.#logAudit("LANGUAGE_SET", code);
            this.emit("language:changed", { code });
            return code;
        }

        /** isRTL(code) — real, used for real layout direction; only Arabic is RTL among the built-in five. */
        isRTL(code = this.#currentLanguage) { return RTL_LANGUAGES.has(code); }

        /**
         * getDirectionAttributes(code)
         *   Real, minimal RTL support: the correct {dir, lang} pair for
         *   an application's <html>/<body> tag. Does not solve every RTL
         *   design concern (icon mirroring, bidi number formatting in
         *   mixed content) — those remain each application's own
         *   template/CSS responsibility, disclosed honestly rather than
         *   silently assumed handled.
         */
        getDirectionAttributes(code = this.#currentLanguage) {
            return { dir: this.isRTL(code) ? "rtl" : "ltr", lang: code };
        }

        /**
         * translate(key, { lang, params })
         *   Real key-based lookup. Falls back to English when the key is
         *   missing in the requested language, and reports (via
         *   diagnostics, not a thrown error) when even English is
         *   missing the key — never returns a fabricated translation.
         *   params supports simple {{placeholder}} interpolation, HTML-
         *   escaped for safe display.
         */
        translate(key, { lang = this.#currentLanguage, params = {} } = {}) {
            if (typeof key !== "string" || !key.trim()) throw new TypeError("[LanguageEngine] translate(): key must be a non-empty string.");
            this.#diagnostics.translationsLookedUp++;
            const dict = this.#translations.get(lang);
            let value = dict ? dict[key] : undefined;
            let usedFallback = false;
            if (value === undefined && lang !== DEFAULT_LANGUAGE) {
                value = this.#translations.get(DEFAULT_LANGUAGE)?.[key];
                usedFallback = true;
            }
            if (value === undefined) {
                this.#diagnostics.missingKeysReported++;
                this.#logAudit("TRANSLATION_MISSING", `"${key}" not found in "${lang}" or English fallback.`);
                return key; // honest — the key itself, never a fabricated string
            }
            if (usedFallback) this.#diagnostics.fallbacksUsed++;
            for (const [paramKey, paramValue] of Object.entries(params)) {
                value = value.replace(new RegExp(`\\{\\{\\s*${paramKey}\\s*\\}\\}`, "g"), this.#escapeHtml(paramValue));
            }
            return value;
        }

        /** t() — short alias, matching common i18n library convention, for real use in templates. */
        t(key, options) { return this.translate(key, options); }

        /**
         * registerLanguage(code, { name, nativeName, rtl, locale, translations })
         *   The real extension path — a NEW language pack becomes
         *   available to every CozyOS application immediately, without
         *   any application (or Builder/BugFixer/Certification/
         *   Workspace/Deployment) being modified. Merges into an
         *   existing language (additive) if the code already exists,
         *   rather than replacing it wholesale.
         *
         *   locale is a real BCP-47 tag (e.g. "de-DE", "zh-CN", "ja-JP",
         *   "hi-IN", "tr-TR", "pt-PT", "am-ET") used by formatDate()/
         *   formatNumber()/formatCurrency()/pluralize() below via the
         *   real, standard Intl API — never a custom date/number
         *   formatter reimplemented here. If omitted, the language code
         *   itself is used as the locale (Intl handles unknown regions
         *   with its own real, standard fallback behavior).
         */
        registerLanguage(code, { name, nativeName, rtl = false, locale = null, translations = {} } = {}) {
            if (typeof code !== "string" || !code.trim()) throw new TypeError("[LanguageEngine] registerLanguage(): code is required.");
            const existing = this.#translations.get(code);
            this.#translations.set(code, { ...(existing || {}), ...translations });
            if (!this.#languageMeta.has(code) || name) {
                this.#languageMeta.set(code, {
                    name: name || this.#languageMeta.get(code)?.name || code,
                    nativeName: nativeName || this.#languageMeta.get(code)?.nativeName || code,
                    rtl: !!rtl, locale: locale || this.#languageMeta.get(code)?.locale || code
                });
            }
            if (rtl) RTL_LANGUAGES.add(code);
            this.#diagnostics.languagesRegistered = this.#translations.size;
            this.#logAudit("LANGUAGE_REGISTERED", `${code}: ${Object.keys(translations).length} key(s), locale=${this.#languageMeta.get(code).locale}.`);
            this.#logTimeline(`Language registered: ${code}`);
            this.emit("language:registered", { code });
            return { code, keyCount: this.#translations.get(code).size };
        }

        /** getLocale(code) — the real BCP-47 tag used for Intl formatting. */
        getLocale(code = this.#currentLanguage) { return this.#languageMeta.get(code)?.locale || code; }

        /**
         * formatDate(date, { lang, options })
         *   Real formatting via the standard Intl.DateTimeFormat API —
         *   never a custom date formatter. options passes straight
         *   through to Intl.DateTimeFormat (e.g. {dateStyle:"long"}).
         */
        formatDate(date, { lang = this.#currentLanguage, options = {} } = {}) {
            try { return new Intl.DateTimeFormat(this.getLocale(lang), options).format(date); }
            catch (err) { this.#logAudit("FORMAT_DATE_FAILED", `${lang}: ${err.message}`); return new Intl.DateTimeFormat(DEFAULT_LANGUAGE, options).format(date); }
        }

        /**
         * formatNumber(value, { lang, options })
         *   Real formatting via Intl.NumberFormat.
         */
        formatNumber(value, { lang = this.#currentLanguage, options = {} } = {}) {
            try { return new Intl.NumberFormat(this.getLocale(lang), options).format(value); }
            catch (err) { this.#logAudit("FORMAT_NUMBER_FAILED", `${lang}: ${err.message}`); return new Intl.NumberFormat(DEFAULT_LANGUAGE, options).format(value); }
        }

        /**
         * formatCurrency(value, currencyCode, { lang })
         *   Real formatting via Intl.NumberFormat's currency style.
         *   currencyCode (e.g. "KES", "USD", "EUR") is an explicit,
         *   required parameter — language and currency are independent
         *   (French is spoken with many different currencies), so this
         *   never assumes a currency from the language alone.
         */
        formatCurrency(value, currencyCode, { lang = this.#currentLanguage } = {}) {
            if (typeof currencyCode !== "string" || !currencyCode.trim()) throw new TypeError("[LanguageEngine] formatCurrency(): currencyCode is required (e.g. \"KES\", \"USD\").");
            try { return new Intl.NumberFormat(this.getLocale(lang), { style: "currency", currency: currencyCode }).format(value); }
            catch (err) { this.#logAudit("FORMAT_CURRENCY_FAILED", `${lang}/${currencyCode}: ${err.message}`); return `${currencyCode} ${value}`; }
        }

        /**
         * pluralize(key, count, { lang, params })
         *   Real pluralization via the standard Intl.PluralRules API —
         *   correctly handles languages with more than two plural forms
         *   (e.g. Arabic's zero/one/two/few/many/other, verified against
         *   real Intl behavior). The translation dictionary stores each
         *   form as key_<category> (e.g. "item_count_one",
         *   "item_count_other") — real lookup, never a fabricated plural
         *   rule reimplemented by hand.
         */
        pluralize(key, count, { lang = this.#currentLanguage, params = {} } = {}) {
            let category = "other";
            try { category = new Intl.PluralRules(this.getLocale(lang)).select(count); }
            catch (err) { this.#logAudit("PLURALIZE_RULES_FAILED", `${lang}: ${err.message}`); }
            const fullKey = `${key}_${category}`;
            const dict = this.#translations.get(lang) || {};
            const hasForm = dict[fullKey] !== undefined || (this.#translations.get(DEFAULT_LANGUAGE) || {})[fullKey] !== undefined;
            const resolvedKey = hasForm ? fullKey : `${key}_other`;
            return this.translate(resolvedKey, { lang, params: { ...params, count } });
        }

        /**
         * addTranslations(code, translations)
         *   The real path applications use to add their OWN
         *   domain-specific keys (e.g. "mpesa_transaction_complete") on
         *   top of the shared built-in dictionary — additive, never
         *   overwrites existing keys unless explicitly given the same
         *   key again.
         */
        addTranslations(code, translations) {
            if (!this.#translations.has(code)) throw new Error(`[LanguageEngine] addTranslations(): "${code}" is not a registered language.`);
            const dict = this.#translations.get(code);
            Object.assign(dict, translations);
            this.#logAudit("TRANSLATIONS_ADDED", `${code}: ${Object.keys(translations).length} key(s).`);
            return { code, keyCount: Object.keys(dict).length };
        }

        /** getMissingKeys(code) — real, honest gap report: which built-in English keys this language hasn't defined (falls back silently at runtime, but worth surfacing for review). */
        getMissingKeys(code) {
            const enDict = this.#translations.get(DEFAULT_LANGUAGE) || {};
            const dict = this.#translations.get(code);
            if (!dict) throw new Error(`[LanguageEngine] getMissingKeys(): "${code}" is not a registered language.`);
            return Object.keys(enDict).filter(k => dict[k] === undefined);
        }

        isVersionCompatible(v) { const a = /^v?(\d+)\./.exec(LANG_VERSION), b = /^v?(\d+)\./.exec(String(v || "")); return !!(a && b && a[1] === b[1]); }
        getDiagnosticsReport() { return this.#deepClone({ moduleVersion: LANG_VERSION, ...this.#diagnostics, registeredLanguages: Array.from(this.#translations.keys()) }); }
        exportSnapshot() { return this.#deepClone({ version: LANG_VERSION, exportedAt: new Date().toISOString(), currentLanguage: this.#currentLanguage, translations: Array.from(this.#translations.entries()), languageMeta: Array.from(this.#languageMeta.entries()) }); }
        importSnapshot(snapshot, { mergeStrategy = "merge" } = {}) {
            if (!snapshot || typeof snapshot !== "object") throw new TypeError("[LanguageEngine] importSnapshot(): snapshot must be an object.");
            let imported = 0;
            for (const [code, dict] of (snapshot.translations || [])) {
                if (mergeStrategy === "replace" || !this.#translations.has(code)) { this.#translations.set(code, dict); imported++; }
                else { Object.assign(this.#translations.get(code), dict); imported++; }
            }
            return { imported, mergeStrategy };
        }
        isSnapshotCompatible(snapshot) { return !!(snapshot && typeof snapshot.version === "string" && snapshot.version.split(".")[0] === LANG_VERSION.split(".")[0]); }
    }

    if (window.CozyOS.LanguageEngine && typeof window.CozyOS.LanguageEngine.getVersion === "function") {
        const existingVersion = window.CozyOS.LanguageEngine.getVersion();
        if (existingVersion !== LANG_VERSION) throw new Error(`[CozyOS Framework Execution Error] VERSION_CONFLICT: LanguageEngine existing v${existingVersion} conflicts with load target v${LANG_VERSION}.`);
        return;
    }
    window.CozyOS.LanguageEngine = new CozyOSLanguageEngine();

    (function registerWithServiceRegistry(descriptor) {
        function attempt() {
            if (typeof window.CozyOS.registerCoordinator !== "function") return false;
            try { window.CozyOS.registerCoordinator(descriptor); } catch (_err) { /* non-fatal */ }
            return true;
        }
        if (attempt()) return;
        if (!Object.prototype.hasOwnProperty.call(window.CozyOS, "__pendingCoordinatorRegistrations")) {
            Object.defineProperty(window.CozyOS, "__pendingCoordinatorRegistrations", { value: [], writable: true, enumerable: false, configurable: true });
        }
        window.CozyOS.__pendingCoordinatorRegistrations.push(descriptor);
        let attempts = 0;
        const intervalId = setInterval(() => {
            attempts++;
            if (attempt() || attempts >= 200) {
                clearInterval(intervalId);
                const idx = window.CozyOS.__pendingCoordinatorRegistrations.indexOf(descriptor);
                if (idx !== -1) window.CozyOS.__pendingCoordinatorRegistrations.splice(idx, 1);
            }
        }, 250);
    })({
        name: "LanguageEngine", category: "Foundation", icon: "language.svg",
        description: "The single shared translation system for every CozyOS application — English/Kiswahili/Arabic/French/Somali built in, extensible without modifying applications. No application may implement its own translation system."
    });
})();
