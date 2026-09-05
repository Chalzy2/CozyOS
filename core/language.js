/**
 * ── COZYOS CORE MICRO-MODULE: LOCALIZATION RUNTIME LAYER ──
 * VERSION: 14.0.0 (Production-Ready State Localization Manager)
 * DOMAIN: core/language.js
 */

import Storage from './storage.js';
import Events from './events.js';

export default {
    _activeLocale: "sw",

    async initLanguageState() {
        try {
            const savedState = await Storage.readLocal("cozy_settings", "system_locale");
            if (savedState && savedState.value) {
                this._activeLocale = savedState.value;
            } else {
                this._activeLocale = "sw"; // Default cleanly to Kiswahili for African heritage prioritizing
            }
        } catch (e) {
            this._activeLocale = "sw";
        }
    },

    getCurrentLanguage() {
        return this._activeLocale;
    },

    async setLanguage(localeKey) {
        // Safe validation fallback array checking exported CozyLanguage dictionary
        const validLocales = window.CozyLanguage?.LANGUAGES || { sw: {}, en: {}, luo: {}, kik: {}, kam: {}, kal: {}, ar: {}, other: {} };
        if (!validLocales[localeKey]) return false;

        this._activeLocale = localeKey;
        await Storage.writeLocal("cozy_settings", { key: "system_locale", value: localeKey, updated: new Date().toISOString() });
        
        Events.publish("language:changed", { locale: localeKey });
        return true;
    }
};
