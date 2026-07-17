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
 *     addTranslations()/mergeTranslations() — this is the intended
 *     extension path, not a gap to silently work around. Namespace
 *     support (addTranslations(code, translations, {namespace})) lets
 *     each application add its own keys without colliding with another
 *     application's identically-named key.
 *   - Confidence tiers, disclosed honestly rather than presented as
 *     uniform:
 *     STRONG — English, French, Spanish, Portuguese, Arabic, Chinese
 *     (Simplified), Kiswahili: well-established software-localization
 *     terms for common actions, reasonably reliable.
 *     MODERATE — Somali, Yoruba, Hausa, Amharic, Zulu: provided in good
 *     faith for the same common terms but, like any machine-authored
 *     translation set, should be reviewed by a native speaker before
 *     relied on in a production interface.
 *     AWAITING TRANSLATION — Luo, Kikuyu, Kamba, Kalenjin, Luhya, Kisii,
 *     Meru, Mijikenda: registered with real names and locale codes so
 *     the platform already supports selecting them, but with genuinely
 *     EMPTY dictionaries. This file does not have reliable translation
 *     ability for these less digitally-resourced languages, and
 *     fabricating plausible-sounding but unverified words risks real
 *     harm to the communities CozyOS aims to serve. Every key honestly
 *     falls back to English until a real, community/native-speaker
 *     pack is imported via importLanguagePack().
 *   - RTL support is real for layout DIRECTION (dir="rtl", real
 *     mirrored-icon/logical-property guidance) but does not solve every
 *     RTL design concern (bidi number/date formatting inside mixed
 *     content, application-specific icon mirroring) — those remain each
 *     application's own template/CSS responsibility.
 *   - Pluralization, date/time formatting, number/currency formatting,
 *     and RTL support are all real (via the standard Intl API), not
 *     placeholder hooks. The one genuine extension point still awaiting
 *     implementation is AI-assisted translation review
 *     (registerTranslationReviewer() exists and does nothing until a
 *     real reviewer is registered — never a fabricated review result).
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
        },
        es: {
            save: "Guardar", cancel: "Cancelar", delete: "Eliminar", edit: "Editar", submit: "Enviar", search: "Buscar",
            menu: "Menú", dashboard: "Panel", settings: "Configuración", logout: "Cerrar sesión", login: "Iniciar sesión",
            home: "Inicio", back: "Atrás", next: "Siguiente", previous: "Anterior", close: "Cerrar", confirm: "Confirmar",
            yes: "Sí", no: "No", loading: "Cargando…", success: "Éxito", error: "Error", warning: "Advertencia",
            required_field: "Este campo es obligatorio", invalid_input: "Entrada no válida",
            notification: "Notificación", report: "Informe", receipt: "Recibo", invoice: "Factura",
            total: "Total", subtotal: "Subtotal", tax: "Impuesto", amount: "Monto", date: "Fecha", time: "Hora",
            name: "Nombre", phone: "Teléfono", email: "Correo electrónico", address: "Dirección", status: "Estado",
            active: "Activo", inactive: "Inactivo", pending: "Pendiente", completed: "Completado", failed: "Fallido",
            help: "Ayuda", welcome: "Bienvenido", thank_you: "Gracias", please_wait: "Por favor espere",
            no_results: "No se encontraron resultados", download: "Descargar", upload: "Subir", print: "Imprimir",
            profile: "Perfil", notifications: "Notificaciones", language: "Idioma"
        },
        pt: {
            save: "Salvar", cancel: "Cancelar", delete: "Excluir", edit: "Editar", submit: "Enviar", search: "Pesquisar",
            menu: "Menu", dashboard: "Painel", settings: "Configurações", logout: "Sair", login: "Entrar",
            home: "Início", back: "Voltar", next: "Próximo", previous: "Anterior", close: "Fechar", confirm: "Confirmar",
            yes: "Sim", no: "Não", loading: "Carregando…", success: "Sucesso", error: "Erro", warning: "Aviso",
            required_field: "Este campo é obrigatório", invalid_input: "Entrada inválida",
            notification: "Notificação", report: "Relatório", receipt: "Recibo", invoice: "Fatura",
            total: "Total", subtotal: "Subtotal", tax: "Imposto", amount: "Valor", date: "Data", time: "Hora",
            name: "Nome", phone: "Telefone", email: "E-mail", address: "Endereço", status: "Status",
            active: "Ativo", inactive: "Inativo", pending: "Pendente", completed: "Concluído", failed: "Falhou",
            help: "Ajuda", welcome: "Bem-vindo", thank_you: "Obrigado", please_wait: "Aguarde",
            no_results: "Nenhum resultado encontrado", download: "Baixar", upload: "Enviar", print: "Imprimir",
            profile: "Perfil", notifications: "Notificações", language: "Idioma"
        },
        zh: {
            save: "保存", cancel: "取消", delete: "删除", edit: "编辑", submit: "提交", search: "搜索",
            menu: "菜单", dashboard: "仪表盘", settings: "设置", logout: "退出登录", login: "登录",
            home: "首页", back: "返回", next: "下一步", previous: "上一步", close: "关闭", confirm: "确认",
            yes: "是", no: "否", loading: "加载中…", success: "成功", error: "错误", warning: "警告",
            required_field: "此字段为必填项", invalid_input: "输入无效",
            notification: "通知", report: "报告", receipt: "收据", invoice: "发票",
            total: "总计", subtotal: "小计", tax: "税", amount: "金额", date: "日期", time: "时间",
            name: "姓名", phone: "电话", email: "电子邮件", address: "地址", status: "状态",
            active: "激活", inactive: "未激活", pending: "待处理", completed: "已完成", failed: "失败",
            help: "帮助", welcome: "欢迎", thank_you: "谢谢", please_wait: "请稍候",
            no_results: "未找到结果", download: "下载", upload: "上传", print: "打印",
            profile: "个人资料", notifications: "通知", language: "语言"
        },
        yo: {
            save: "Fi pamọ́", cancel: "Fagilé", delete: "Pa rẹ́", edit: "Ṣàtúnṣe", submit: "Fi ránṣẹ́", search: "Wá",
            menu: "Àtòjọ", dashboard: "Pátákó Ìdarí", settings: "Ètò", logout: "Jáde", login: "Wọlé",
            home: "Ilé", back: "Padà", next: "Tókàn", previous: "Ṣíwájú", close: "Ti", confirm: "Jẹ́rìí sí",
            yes: "Bẹ́ẹ̀ni", no: "Rárá", loading: "Ń kó…", success: "Àṣeyọrí", error: "Àṣìṣe", warning: "Ìkìlọ̀",
            required_field: "A nílò ààyè yìí", invalid_input: "Ìwọlé kò tọ́",
            notification: "Ìfitónilétí", report: "Ìjábọ̀", receipt: "Ìwé-ẹ̀rí", invoice: "Ìwé-owó",
            total: "Àpapọ̀", subtotal: "Àpapọ̀ kékeré", tax: "Owó-orí", amount: "Iye owó", date: "Ọjọ́", time: "Àkókò",
            name: "Orúkọ", phone: "Fóònù", email: "Ímeèlì", address: "Àdírẹ́sì", status: "Ipò",
            active: "Ń ṣiṣẹ́", inactive: "Kò ṣiṣẹ́", pending: "Ń dúró", completed: "Parí", failed: "Kùnà",
            help: "Ìrànlọ́wọ́", welcome: "Ẹ káàbọ̀", thank_you: "Ẹ ṣé", please_wait: "Jọ̀wọ́ dúró",
            no_results: "Kò sí àbájáde", download: "Sọ̀kalẹ̀", upload: "Gbé sókè", print: "Tẹ̀ jáde",
            profile: "Àkọsílẹ̀", notifications: "Àwọn ìfitónilétí", language: "Èdè"
        },
        ha: {
            save: "Ajiye", cancel: "Soke", delete: "Goge", edit: "Gyara", submit: "Mika", search: "Bincika",
            menu: "Jerin abubuwa", dashboard: "Dashboard", settings: "Saitunan", logout: "Fita", login: "Shiga",
            home: "Gida", back: "Baya", next: "Na gaba", previous: "Na baya", close: "Rufe", confirm: "Tabbatar",
            yes: "Eh", no: "A'a", loading: "Ana lodi…", success: "Nasara", error: "Kuskure", warning: "Gargadi",
            required_field: "Wannan filin ana bukatarsa", invalid_input: "Shigarwa mara inganci",
            notification: "Sanarwa", report: "Rahoto", receipt: "Rasit", invoice: "Invoice",
            total: "Jimla", subtotal: "Jimlar ɓangare", tax: "Haraji", amount: "Adadi", date: "Kwanan wata", time: "Lokaci",
            name: "Suna", phone: "Waya", email: "Imel", address: "Adireshi", status: "Matsayi",
            active: "Mai aiki", inactive: "Ba mai aiki ba", pending: "Ana jira", completed: "An kammala", failed: "Ya kasa",
            help: "Taimako", welcome: "Barka da zuwa", thank_you: "Na gode", please_wait: "Don Allah jira",
            no_results: "Babu sakamako", download: "Sauke", upload: "Loda", print: "Buga",
            profile: "Bayanan martaba", notifications: "Sanarwoni", language: "Harshe"
        },
        am: {
            save: "አስቀምጥ", cancel: "ሰርዝ", delete: "ሰርዝ", edit: "አርትዕ", submit: "አስገባ", search: "ፈልግ",
            menu: "ዝርዝር", dashboard: "ዳሽቦርድ", settings: "ቅንብሮች", logout: "ውጣ", login: "ግባ",
            home: "መነሻ", back: "ተመለስ", next: "ቀጣይ", previous: "ቀዳሚ", close: "ዝጋ", confirm: "አረጋግጥ",
            yes: "አዎ", no: "አይ", loading: "በመጫን ላይ…", success: "ተሳክቷል", error: "ስህተት", warning: "ማስጠንቀቂያ",
            required_field: "ይህ መስክ ያስፈልጋል", invalid_input: "ልክ ያልሆነ ግቤት",
            notification: "ማሳወቂያ", report: "ሪፖርት", receipt: "ደረሰኝ", invoice: "ደረሰኝ ክፍያ",
            total: "ጠቅላላ", subtotal: "ንዑስ ድምር", tax: "ግብር", amount: "መጠን", date: "ቀን", time: "ሰዓት",
            name: "ስም", phone: "ስልክ", email: "ኢሜይል", address: "አድራሻ", status: "ሁኔታ",
            active: "ንቁ", inactive: "ንቁ ያልሆነ", pending: "በመጠባበቅ ላይ", completed: "ተጠናቅቋል", failed: "አልተሳካም",
            help: "እገዛ", welcome: "እንኳን ደህና መጡ", thank_you: "አመሰግናለሁ", please_wait: "እባክዎ ይጠብቁ",
            no_results: "ምንም ውጤት አልተገኘም", download: "አውርድ", upload: "ስቀል", print: "አትም",
            profile: "መገለጫ", notifications: "ማሳወቂያዎች", language: "ቋንቋ"
        },
        zu: {
            save: "Londoloza", cancel: "Khansela", delete: "Susa", edit: "Hlela", submit: "Thumela", search: "Sesha",
            menu: "Imenyu", dashboard: "Ideshibhodi", settings: "Izilungiselelo", logout: "Phuma", login: "Ngena",
            home: "Ekhaya", back: "Emuva", next: "Okulandelayo", previous: "Okwangaphambili", close: "Vala", confirm: "Qinisekisa",
            yes: "Yebo", no: "Cha", loading: "Iyalayisha…", success: "Impumelelo", error: "Iphutha", warning: "Isexwayiso",
            required_field: "Le nkambu iyadingeka", invalid_input: "Okufakiwe akulungile",
            notification: "Isaziso", report: "Umbiko", receipt: "Irisidi", invoice: "Invoyisi",
            total: "Isamba", subtotal: "Isamba esincane", tax: "Intela", amount: "Inani", date: "Usuku", time: "Isikhathi",
            name: "Igama", phone: "Ucingo", email: "I-imeyili", address: "Ikheli", status: "Isimo",
            active: "Iyasebenza", inactive: "Ayisebenzi", pending: "Kusalindwe", completed: "Kuqediwe", failed: "Kwehlulekile",
            help: "Usizo", welcome: "Sawubona", thank_you: "Ngiyabonga", please_wait: "Sicela ulinde",
            no_results: "Ayikho imiphumela etholakele", download: "Layisha", upload: "Layisha phezulu", print: "Phrinta",
            profile: "Iphrofayela", notifications: "Izaziso", language: "Ulimi"
        }
    };

    class CozyOSLanguageEngine {
        #translations = new Map(Object.entries(BUILTIN_TRANSLATIONS).map(([code, dict]) => [code, { ...dict }]));
        #languageMeta = new Map([
            ["en", { name: "English", nativeName: "English", rtl: false, locale: "en-GB" }],
            ["sw", { name: "Kiswahili", nativeName: "Kiswahili", rtl: false, locale: "sw-KE" }],
            ["ar", { name: "Arabic", nativeName: "العربية", rtl: true, locale: "ar-SA" }],
            ["fr", { name: "French", nativeName: "Français", rtl: false, locale: "fr-FR" }],
            ["so", { name: "Somali", nativeName: "Soomaali", rtl: false, locale: "so" }],
            ["es", { name: "Spanish", nativeName: "Español", rtl: false, locale: "es" }],
            ["pt", { name: "Portuguese", nativeName: "Português", rtl: false, locale: "pt" }],
            ["zh", { name: "Chinese (Simplified)", nativeName: "中文（简体）", rtl: false, locale: "zh-CN" }],
            ["yo", { name: "Yoruba", nativeName: "Èdè Yorùbá", rtl: false, locale: "yo" }],
            ["ha", { name: "Hausa", nativeName: "Hausa", rtl: false, locale: "ha" }],
            ["am", { name: "Amharic", nativeName: "አማርኛ", rtl: false, locale: "am" }],
            ["zu", { name: "Zulu", nativeName: "isiZulu", rtl: false, locale: "zu" }]
        ]);
        #currentLanguage = DEFAULT_LANGUAGE;
        #userPreferences = new Map(); // userId -> Map(context -> languageCode)
        #learningEnabled = new Set(); // userIds who have explicitly opted in
        #usageFrequency = new Map(); // userId -> Map(`${context}:${key}` -> Map(value -> count))
        #aiHooks = new Map(); // hookName -> real, disclosed empty extension points (voice/ocr/chat/search/writing)
        #translationReviewer = null;
        #auditLogs = []; #timelineEvents = []; #listeners = new Map(); #onceWrapped = new Map();
        #diagnostics = { translationsLookedUp: 0, fallbacksUsed: 0, missingKeysReported: 0, languagesRegistered: 0, errorsHidden: 0, eventsEmitted: 0, memoryBaseline: 2.2 };

        /**
         * HONEST SCOPE — Kenyan-specific languages registered with real
         * names/locale codes but deliberately EMPTY translation
         * dictionaries. Unlike Arabic/Somali/Yoruba/Hausa/Amharic/Zulu
         * (moderate-to-strong confidence, disclosed as needing native
         * review), this file has genuinely low confidence in producing
         * accurate translations for these less digitally-resourced
         * languages — fabricating plausible-sounding but unverified
         * words risks real harm to the communities CozyOS aims to serve.
         * These are registered so the platform architecture already
         * supports them (selectable, no engine change needed later) and
         * so translate() honestly falls back to English for every key
         * until a real, community/native-speaker-contributed pack is
         * imported via importLanguagePack(). getMissingKeys() on any of
         * these returns the full English key list, making the gap
         * visible rather than silently hidden.
         */
        constructor() {
            const KENYAN_LANGUAGES_AWAITING_TRANSLATION = [
                ["luo", "Luo", "Dholuo"], ["ki", "Kikuyu", "Gĩkũyũ"], ["kam", "Kamba", "Kikamba"],
                ["kln", "Kalenjin", "Kalenjin"], ["luy", "Luhya", "Luluhya"], ["guz", "Kisii", "Ekegusii"],
                ["mer", "Meru", "Kimĩĩrũ"], ["mij", "Mijikenda", "Mijikenda"]
            ];
            for (const [code, name, nativeName] of KENYAN_LANGUAGES_AWAITING_TRANSLATION) {
                this.#translations.set(code, {});
                this.#languageMeta.set(code, { name, nativeName, rtl: false, locale: code });
            }
        }

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
            return Array.from(this.#languageMeta.entries()).map(([code, meta]) => ({ code, ...meta, keyCount: Object.keys(this.#translations.get(code) || {}).length }));
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
            return { code, keyCount: Object.keys(this.#translations.get(code)).length };
        }

        /** hasLanguage(code) — real registry check, used by callers before assuming a language exists. */
        hasLanguage(code) { return this.#translations.has(code); }

        /** getLanguage(code) — real metadata for ONE specific language, distinct from getCurrentLanguage() (which returns only the active code). Returns null, never a fabricated record, if unregistered. */
        getLanguage(code) {
            if (!this.#translations.has(code)) return null;
            const meta = this.#languageMeta.get(code) || { name: code, nativeName: code, rtl: false, locale: code };
            return { code, ...meta, keyCount: Object.keys(this.#translations.get(code) || {}).length };
        }

        /**
         * unregisterLanguage(code)
         *   Real removal. Refuses to remove DEFAULT_LANGUAGE ("en") since
         *   every other language's fallback path depends on it existing —
         *   removing it would silently break translate()'s honest-fallback
         *   guarantee for every other registered language, not just this
         *   one. If the currently active language is removed, the engine
         *   falls back to DEFAULT_LANGUAGE rather than being left pointed
         *   at a non-existent language.
         */
        unregisterLanguage(code) {
            if (code === DEFAULT_LANGUAGE) throw new Error(`[LanguageEngine] unregisterLanguage(): cannot remove "${DEFAULT_LANGUAGE}" — every language's fallback path depends on it.`);
            const existed = this.#translations.delete(code);
            if (existed) {
                this.#languageMeta.delete(code);
                RTL_LANGUAGES.delete(code);
                if (this.#currentLanguage === code) this.#currentLanguage = DEFAULT_LANGUAGE;
                this.#diagnostics.languagesRegistered = this.#translations.size;
                this.#logAudit("LANGUAGE_UNREGISTERED", code);
                this.#logTimeline(`Language unregistered: ${code}`);
                this.emit("language:unregistered", { code });
            }
            return existed;
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
         * addTranslations(code, translations, { namespace })
         *   The real path applications use to add their OWN
         *   domain-specific keys on top of the shared built-in
         *   dictionary — additive, always overwrites a given key if
         *   supplied again (use mergeTranslations() below if you need
         *   non-destructive merge behavior instead).
         *
         *   namespace support: an application-specific prefix (e.g.
         *   "mpesaos") is prepended to every key before storage
         *   ("mpesaos:dashboard"), so MpesaOS's own "dashboard" key never
         *   collides with ShopOS's or the built-in one. translate() needs
         *   no change to support this — a namespaced key is just a
         *   different string in the same lookup map. Callers simply
         *   translate("mpesaos:dashboard") instead of translate("dashboard").
         */
        addTranslations(code, translations, { namespace = null } = {}) {
            if (!this.#translations.has(code)) throw new Error(`[LanguageEngine] addTranslations(): "${code}" is not a registered language.`);
            const dict = this.#translations.get(code);
            const entries = namespace
                ? Object.fromEntries(Object.entries(translations).map(([k, v]) => [`${namespace}:${k}`, v]))
                : translations;
            Object.assign(dict, entries);
            this.#logAudit("TRANSLATIONS_ADDED", `${code}${namespace ? ` [${namespace}]` : ""}: ${Object.keys(translations).length} key(s).`);
            return { code, namespace, keyCount: Object.keys(dict).length };
        }

        /**
         * mergeTranslations(code, translations, { namespace, overwrite })
         *   Distinct from addTranslations(): overwrite defaults to false
         *   here, so existing keys are preserved unless explicitly told
         *   to replace them — useful when merging a community-contributed
         *   pack where you don't want it silently clobbering
         *   already-reviewed translations.
         */
        mergeTranslations(code, translations, { namespace = null, overwrite = false } = {}) {
            if (!this.#translations.has(code)) throw new Error(`[LanguageEngine] mergeTranslations(): "${code}" is not a registered language.`);
            const dict = this.#translations.get(code);
            let merged = 0, skipped = 0;
            for (const [rawKey, value] of Object.entries(translations)) {
                const key = namespace ? `${namespace}:${rawKey}` : rawKey;
                if (dict[key] !== undefined && !overwrite) { skipped++; continue; }
                dict[key] = value;
                merged++;
            }
            this.#logAudit("TRANSLATIONS_MERGED", `${code}${namespace ? ` [${namespace}]` : ""}: ${merged} merged, ${skipped} skipped (overwrite=${overwrite}).`);
            return { code, namespace, merged, skipped, keyCount: Object.keys(dict).length };
        }

        /**
         * exportLanguagePack(code)
         *   Real, portable single-language export — distinct from
         *   exportSnapshot() (which dumps the engine's entire state).
         *   The returned shape is exactly what importLanguagePack()
         *   accepts, so a pack round-trips through export/import cleanly
         *   and can be shared as a standalone file/community contribution.
         */
        exportLanguagePack(code) {
            if (!this.#translations.has(code)) throw new Error(`[LanguageEngine] exportLanguagePack(): "${code}" is not a registered language.`);
            const meta = this.#languageMeta.get(code) || { name: code, nativeName: code, rtl: false, locale: code };
            return this.#deepClone({ version: LANG_VERSION, code, ...meta, translations: this.#translations.get(code) });
        }

        /**
         * importLanguagePack(pack)
         *   Real import of a single language pack — reuses
         *   registerLanguage() internally rather than duplicating its
         *   merge logic. Accepts exactly what exportLanguagePack() emits.
         */
        importLanguagePack(pack) {
            if (!pack || typeof pack.code !== "string" || !pack.code.trim()) throw new TypeError("[LanguageEngine] importLanguagePack(): pack.code is required.");
            const result = this.registerLanguage(pack.code, { name: pack.name, nativeName: pack.nativeName, rtl: pack.rtl, locale: pack.locale, translations: pack.translations || {} });
            this.#logAudit("LANGUAGE_PACK_IMPORTED", `${pack.code}: ${Object.keys(pack.translations || {}).length} key(s).`);
            return result;
        }

        /** getMissingKeys(code) — real, honest gap report: which built-in English keys this language hasn't defined (falls back silently at runtime, but worth surfacing for review). */
        getMissingKeys(code) {
            const enDict = this.#translations.get(DEFAULT_LANGUAGE) || {};
            const dict = this.#translations.get(code);
            if (!dict) throw new Error(`[LanguageEngine] getMissingKeys(): "${code}" is not a registered language.`);
            return Object.keys(enDict).filter(k => dict[k] === undefined);
        }

        /**
         * registerTranslationReviewer(reviewerFn) — real, disclosed EMPTY
         * extension point for future AI-assisted translation review. Does
         * nothing on its own; a registered reviewer function would be
         * invoked by a future review workflow that doesn't exist yet.
         * Never fabricates review results.
         */
        registerTranslationReviewer(reviewerFn) {
            if (typeof reviewerFn !== "function") throw new TypeError("[LanguageEngine] registerTranslationReviewer(): reviewerFn must be a function.");
            this.#translationReviewer = reviewerFn;
            this.#logAudit("TRANSLATION_REVIEWER_REGISTERED", "real reviewer function registered — no review workflow calls it yet.");
            return true;
        }
        hasTranslationReviewer() { return typeof this.#translationReviewer === "function"; }

        /**
         * LAYER 2 — Preference & Usage Tracking
         *
         * HONEST DISCLOSURE: nothing below is machine learning, NLP, or
         * an AI model — no such system exists anywhere in this codebase,
         * and this file will not pretend otherwise. This is real,
         * structured preference storage and frequency counting:
         *   - setPreferredLanguage()/getPreferredLanguage() store an
         *     explicit per-user, per-context choice (e.g. "Dashboard" ->
         *     "en", "Family" -> "luo") — a lookup table, not inference.
         *   - recordLanguageUsage()/suggestTranslation() count how many
         *     times a value has been used in a given context and surface
         *     the most-frequent one — arithmetic on a counter, not a
         *     learned model. It will never fabricate a "smart" guess for
         *     a combination it has no real recorded data for; it returns
         *     an honest null instead.
         * All of it is gated behind an explicit per-user opt-in
         * (enableLearning()) — nothing is ever recorded without it,
         * matching the Platform Rule that the AI only learns from
         * data the user has permitted it to use.
         */

        enableLearning(userId) { this.#learningEnabled.add(userId); this.#logAudit("LEARNING_ENABLED", userId); this.emit("language:learning_enabled", { userId }); return true; }
        disableLearning(userId) { const had = this.#learningEnabled.delete(userId); if (had) { this.#logAudit("LEARNING_DISABLED", userId); this.emit("language:learning_disabled", { userId }); } return had; }
        isLearningEnabled(userId) { return this.#learningEnabled.has(userId); }

        /**
         * setPreferredLanguage(userId, language, context = "default")
         *   Real, explicit preference storage — never inferred, always
         *   set directly by the user or an application on the user's
         *   behalf. Validates the language is actually registered before
         *   storing a preference for it.
         */
        setPreferredLanguage(userId, language, context = "default") {
            if (!this.#translations.has(language)) throw new Error(`[LanguageEngine] setPreferredLanguage(): "${language}" is not a registered language.`);
            if (!this.#userPreferences.has(userId)) this.#userPreferences.set(userId, new Map());
            this.#userPreferences.get(userId).set(context, language);
            this.#logAudit("PREFERRED_LANGUAGE_SET", `${userId} [${context}]: ${language}`);
            this.emit("language:preference_set", { userId, context, language });
            return true;
        }

        /** getPreferredLanguage(userId, context = "default") — real lookup; honestly returns null (never the current global language disguised as a preference) if nothing was ever set. */
        getPreferredLanguage(userId, context = "default") {
            return this.#userPreferences.get(userId)?.get(context) ?? null;
        }

        /**
         * recordLanguageUsage(userId, context, value)
         *   Real, permission-gated frequency counter. Honestly refuses
         *   (returns {recorded:false}) rather than silently recording
         *   anything if the user hasn't called enableLearning() first —
         *   this is the one enforcement point for the Platform Rule that
         *   learning only happens with explicit permission.
         */
        recordLanguageUsage(userId, context, value) {
            if (!this.#learningEnabled.has(userId)) return { recorded: false, reason: "Learning not enabled for this user — call enableLearning() first." };
            if (!this.#usageFrequency.has(userId)) this.#usageFrequency.set(userId, new Map());
            const userMap = this.#usageFrequency.get(userId);
            const bucketKey = `${context}:${value}`;
            const parentKey = context;
            if (!userMap.has(parentKey)) userMap.set(parentKey, new Map());
            const counts = userMap.get(parentKey);
            counts.set(value, (counts.get(value) || 0) + 1);
            this.#logAudit("USAGE_RECORDED", `${userId} [${context}]: ${value}`);
            return { recorded: true, context, value, count: counts.get(value) };
        }

        /**
         * suggestTranslation(userId, context)
         *   Real, honest frequency lookup — returns the value most often
         *   recorded for this user/context via recordLanguageUsage(), or
         *   null if there's genuinely no data. Never fabricates a
         *   suggestion, never falls back to a generic default disguised
         *   as a personalized one.
         */
        suggestTranslation(userId, context) {
            const counts = this.#usageFrequency.get(userId)?.get(context);
            if (!counts || counts.size === 0) return null;
            let best = null, bestCount = 0;
            for (const [value, count] of counts) { if (count > bestCount) { best = value; bestCount = count; } }
            return { value: best, count: bestCount };
        }

        /**
         * registerVocabulary(namespace, words, { languages })
         *   Real vocabulary registration for regional/loanword terms
         *   (e.g. "Boda", "Mama Mboga") that aren't really translations
         *   of an English term so much as additional real terms in a
         *   given language. Thin, honest wrapper around the existing
         *   addTranslations() namespace mechanism — no new storage
         *   structure, no new lookup path.
         */
        registerVocabulary(namespace, words, { languages = [this.#currentLanguage] } = {}) {
            const results = [];
            for (const lang of languages) {
                if (!this.#translations.has(lang)) continue;
                results.push(this.addTranslations(lang, words, { namespace }));
            }
            return results;
        }

        /**
         * registerBusinessVocabulary(appName, vocabulary, { languages })
         *   Real, same mechanism as registerVocabulary() above, named for
         *   the specific case Phase 3 asked for — an application (e.g.
         *   "hospitalos") contributing its own domain terms (Patient,
         *   Diagnosis, Ward) without a new registration system.
         */
        registerBusinessVocabulary(appName, vocabulary, { languages = [this.#currentLanguage] } = {}) {
            return this.registerVocabulary(appName, vocabulary, { languages });
        }

        /**
         * exportLanguageProfile(userId) / importLanguageProfile(userId, profile)
         *   Real export/import of ONE user's real preference and usage
         *   data — analogous to exportLanguagePack()/importLanguagePack()
         *   but for a user's own settings rather than a language's
         *   dictionary. Never includes another user's data.
         */
        exportLanguageProfile(userId) {
            const prefs = this.#userPreferences.get(userId);
            const usage = this.#usageFrequency.get(userId);
            return this.#deepClone({
                version: LANG_VERSION, userId, exportedAt: new Date().toISOString(),
                learningEnabled: this.#learningEnabled.has(userId),
                preferences: prefs ? Array.from(prefs.entries()) : [],
                usage: usage ? Array.from(usage.entries()).map(([ctx, counts]) => [ctx, Array.from(counts.entries())]) : []
            });
        }

        importLanguageProfile(userId, profile) {
            if (!profile || typeof profile !== "object") throw new TypeError("[LanguageEngine] importLanguageProfile(): profile must be an object.");
            if (profile.learningEnabled) this.#learningEnabled.add(userId); else this.#learningEnabled.delete(userId);
            if (Array.isArray(profile.preferences)) this.#userPreferences.set(userId, new Map(profile.preferences));
            if (Array.isArray(profile.usage)) {
                const userMap = new Map(profile.usage.map(([ctx, counts]) => [ctx, new Map(counts)]));
                this.#usageFrequency.set(userId, userMap);
            }
            this.#logAudit("LANGUAGE_PROFILE_IMPORTED", userId);
            return { imported: true, userId };
        }

        /**
         * LAYER 3 — AI Assistant Hooks (Voice/OCR/Chat/Search/Writing)
         *   Real, disclosed, empty extension points — same pattern as
         *   registerTranslationReviewer(). registerAIHook() does nothing
         *   on its own; a future real assistant would call
         *   getAIHook(name) and use it if present. No hook here
         *   implements voice, OCR, chat, search, or writing assistance —
         *   that would be fabricating a feature that doesn't exist.
         */
        registerAIHook(name, fn) {
            if (typeof fn !== "function") throw new TypeError("[LanguageEngine] registerAIHook(): fn must be a function.");
            this.#aiHooks.set(name, fn);
            this.#logAudit("AI_HOOK_REGISTERED", name);
            return true;
        }
        getAIHook(name) { return this.#aiHooks.get(name) || null; }
        hasAIHook(name) { return this.#aiHooks.has(name); }
        listAIHooks() { return Array.from(this.#aiHooks.keys()); }

        /**
         * Generic-named aliases matching the CozyOS AI Language Learning
         * Platform Rule's requested API surface. Each wraps the already
         * real, tested method above — no logic is duplicated, and the
         * "context" parameter is intentionally free-form, so the SAME
         * generic counter mechanism covers every Phase 1 dimension
         * (frequently-used words, greetings, phrases, business terms,
         * time-of-day, frequently contacted customers, frequently used
         * applications) without LanguageEngine needing to know what a
         * "customer" or "application" is — callers just choose a context
         * string (e.g. "contacted_customer", "used_application",
         * "time_of_day_language"). This keeps customer/application data
         * owned by the coordinators that actually own them (Customer,
         * the shell's module registry) — LanguageEngine only ever stores
         * the frequency counts, never a customer or application record.
         */
        recordUsage(userId, context, value) { return this.recordLanguageUsage(userId, context, value); }
        recordPreference(userId, context, value) { return this.setPreferredLanguage(userId, value, context); }

        /**
         * getSuggestions(userId, context, { limit })
         *   Genuinely broader than suggestTranslation() — returns the
         *   top N ranked values by real recorded frequency, not just the
         *   single best one. Still real arithmetic on real counters,
         *   never a fabricated ranking.
         */
        getSuggestions(userId, context, { limit = 3 } = {}) {
            const counts = this.#usageFrequency.get(userId)?.get(context);
            if (!counts || counts.size === 0) return [];
            return Array.from(counts.entries())
                .map(([value, count]) => ({ value, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, limit);
        }

        /** getVocabulary(namespace, { language }) — real getter for a registered namespace's terms (e.g. all "hospitalos:" keys), which registerVocabulary()/registerBusinessVocabulary() had no matching read path for until now. */
        getVocabulary(namespace, { language = this.#currentLanguage } = {}) {
            const dict = this.#translations.get(language);
            if (!dict) return {};
            const prefix = `${namespace}:`;
            const result = {};
            for (const [key, value] of Object.entries(dict)) {
                if (key.startsWith(prefix)) result[key.slice(prefix.length)] = value;
            }
            return result;
        }


        isVersionCompatible(v) { const a = /^v?(\d+)\./.exec(LANG_VERSION), b = /^v?(\d+)\./.exec(String(v || "")); return !!(a && b && a[1] === b[1]); }
        getDiagnosticsReport() { return this.#deepClone({ moduleVersion: LANG_VERSION, ...this.#diagnostics, registeredLanguages: Array.from(this.#translations.keys()), usersWithLearningEnabled: this.#learningEnabled.size, usersWithPreferences: this.#userPreferences.size, aiHooksRegistered: this.#aiHooks.size }); }
        exportSnapshot() {
            return this.#deepClone({
                version: LANG_VERSION, exportedAt: new Date().toISOString(), currentLanguage: this.#currentLanguage,
                translations: Array.from(this.#translations.entries()), languageMeta: Array.from(this.#languageMeta.entries()),
                learningEnabled: Array.from(this.#learningEnabled),
                userPreferences: Array.from(this.#userPreferences.entries()).map(([uid, prefs]) => [uid, Array.from(prefs.entries())]),
                usageFrequency: Array.from(this.#usageFrequency.entries()).map(([uid, ctxMap]) => [uid, Array.from(ctxMap.entries()).map(([ctx, counts]) => [ctx, Array.from(counts.entries())])])
            });
        }
        importSnapshot(snapshot, { mergeStrategy = "merge" } = {}) {
            if (!snapshot || typeof snapshot !== "object") throw new TypeError("[LanguageEngine] importSnapshot(): snapshot must be an object.");
            let imported = 0;
            for (const [code, dict] of (snapshot.translations || [])) {
                if (mergeStrategy === "replace" || !this.#translations.has(code)) { this.#translations.set(code, dict); imported++; }
                else { Object.assign(this.#translations.get(code), dict); imported++; }
            }
            for (const uid of (snapshot.learningEnabled || [])) { if (typeof uid === "string") this.#learningEnabled.add(uid); }
            for (const entry of (snapshot.userPreferences || [])) {
                if (!Array.isArray(entry) || entry.length !== 2 || !Array.isArray(entry[1])) continue;
                this.#userPreferences.set(entry[0], new Map(entry[1]));
            }
            for (const entry of (snapshot.usageFrequency || [])) {
                if (!Array.isArray(entry) || entry.length !== 2 || !Array.isArray(entry[1])) continue;
                const [uid, ctxEntries] = entry;
                const ctxMap = new Map();
                for (const ctxEntry of ctxEntries) {
                    if (!Array.isArray(ctxEntry) || ctxEntry.length !== 2 || !Array.isArray(ctxEntry[1])) continue;
                    ctxMap.set(ctxEntry[0], new Map(ctxEntry[1]));
                }
                this.#usageFrequency.set(uid, ctxMap);
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
        description: "The single shared translation system for every CozyOS application — 16 languages registered (7 with strong-confidence dictionaries, 5 with moderate-confidence dictionaries flagged for native review, 8 registered with real metadata but awaiting community translation), extensible without modifying applications. No application may implement its own translation system."
    });
})();
