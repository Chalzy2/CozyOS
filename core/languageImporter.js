/**
 * ── COZYOS UNIVERSAL LANGUAGE PACK IMPORTER ──
 * FILE: core/languageImporter.js
 * DEPENDENCY: core/storage.js (Must be initialized via CozyStorage.init())
 */

const CozyLanguageImporter = {
    // 1. Central Registry Layout of Multi-Lingual Context Packs
    packs: {
        // 🇨🇳 CHINESE (SIMPLIFIED)
        "lang_zh_cn": {
            locale: "zh-CN",
            name: "Chinese (Simplified)",
            version: "1.0.0",
            dictionary: {
                dashboard: "仪表盘",
                execute_audit: "执行系统审计",
                payment_bridge: "支付网关桥",
                inventory_check: "库存盘点",
                status_passed: "通过 ✔",
                status_failed: "失败 ✘"
            }
        },

        // 🇸🇦 ARABIC
        "lang_ar": {
            locale: "ar",
            name: "Arabic (العربية)",
            version: "1.0.0",
            dictionary: {
                dashboard: "لوحة القيادة",
                execute_audit: "تنفيذ تدقيق النظام",
                payment_bridge: "جسر المعاملات",
                inventory_check: "فحص المخزون",
                status_passed: "ناجح ✔",
                status_failed: "فاشل ✘"
            }
        },

        // 🇰🇪 SWAHILI
        "lang_sw": {
            locale: "sw",
            name: "Swahili (Kiswahili)",
            version: "1.0.0",
            dictionary: {
                dashboard: "Dashibodi",
                execute_audit: "Tekeleza Ukaguzi wa Mfumo",
                payment_bridge: "Daraja la Malipo ya M-Pesa",
                inventory_check: "Angalia Bidhaa Zilizopo",
                status_passed: "Imefaulu ✔",
                status_failed: "Imefeli ✘"
            }
        },

        // 🇫🇷 FRENCH (WEST / CENTRAL AFRICA)
        "lang_fr": {
            locale: "fr",
            name: "French (Français)",
            version: "1.0.0",
            dictionary: {
                dashboard: "Tableau de bord",
                execute_audit: "Exécuter l'audit du système",
                payment_bridge: "Passerelle de paiement",
                inventory_check: "Vérification des stocks",
                status_passed: "Réussi ✔",
                status_failed: "Échoué ✘"
            }
        },

        // 🇳🇬 YORUBA
        "lang_yo": {
            locale: "yo",
            name: "Yoruba (Èdè Yorùbá)",
            version: "1.0.0",
            dictionary: {
                dashboard: "Ojúlé Alábòójútó",
                execute_audit: "Ṣiṣẹ Ayẹwo Mẹta",
                payment_bridge: "Afárá Sisanwó",
                inventory_check: "Ayẹwo Ọjà",
                status_passed: "Yorí Sírere ✔",
                status_failed: "Kùnà ✘"
            }
        }
    },

    /**
     * Loops through registry array nodes and commits keys natively to core/storage.js
     */
    async seedAllLanguages(tenantId = "default_tenant") {
        if (!window.CozyStorage) {
            console.error("Storage Exception: core/storage.js is not loaded in current window space context.");
            return false;
        }

        console.log("[ULIE Engine] Beginning batch storage localization injection...");
        
        for (const [packId, languagePayload] of Object.entries(this.packs)) {
            // Structure record format explicitly matching ULIE constraints
            const record = {
                id: packId, // Forces static, reproducible key lookups
                ...languagePayload,
                injectedTimestamp: Date.now()
            };

            try {
                // Route directly through the exclusive gateway API
                await window.CozyStorage.save("language_packs", record, tenantId);
                console.log(`[ULIE] Loaded and cached offline pack: ${languagePayload.name} (${languagePayload.locale})`);
            } catch (err) {
                console.error(`[ULIE Seed Error] Failed injecting ${packId}:`, err);
            }
        }
        return true;
    }
};

// Expose safely to global environment contexts
window.CozyLanguageImporter = CozyLanguageImporter;
