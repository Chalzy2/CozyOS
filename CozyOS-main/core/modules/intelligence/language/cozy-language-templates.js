/**
 * CozyOS — Verified Response Templates (RP-027)
 * File Reference: core/modules/intelligence/language/cozy-language-templates.js
 * Repair: RP-027 — CozyOS Conversational Knowledge + Multilingual
 *         Response Expansion
 *
 * OWNERSHIP
 *   New, additive, standalone file. rule-based-conversational-
 *   provider.js (modified this pass) reads this file's exported
 *   TEMPLATES table as a consumer — it does not duplicate any string
 *   here, and this file does not touch the provider file, LivingAI,
 *   CognitiveCoordinator, or any locked file.
 *
 * TRANSLATION HONESTY (RP-027 §11 — the core rule of this file)
 *   Every string below is a committed, reviewed template — never the
 *   output of an uncontrolled runtime translation call. Only the five
 *   RP-027 default languages (en/sw/fr/ar/so) appear here. The six
 *   extended languages (luo/ki/kam/zu/lg/ig) deliberately have NO
 *   entries in this file this pass — cozy-language-registry.js holds
 *   them at NOT_READY specifically because no verified template exists
 *   for them yet. Adding an extended language here (with matching
 *   in-language QA) and flipping its registry state to AVAILABLE is
 *   the exact, disclosed continuation point recorded in HANDOFF.md.
 *
 *   For CozyOS-specific technical terms (CozyOS, CozyAI, ONLINE,
 *   ACTIVE, PENDING, NOT_READY, Control Center, Provider Manager), the
 *   official term is preserved as-is in every language and explained
 *   in that language, rather than translated into a term the product
 *   doesn't actually use — this mirrors RP-027 §11's explicit
 *   instruction.
 *
 * STRUCTURE
 *   TEMPLATES[key][langCode] -> string, for fixed-text templates.
 *   TEMPLATES[key][langCode] -> function(data) -> string, for the
 *   templates that incorporate live repository/runtime evidence
 *   (founder identity, application list, provider health). The
 *   function form is still a verified, fixed sentence FRAME per
 *   language — only the interpolated evidence is live, never the
 *   surrounding language.
 *
 * FALLBACK_DISCLOSURE
 *   Separate small table (RP-027 §12) — the sentence shown, in the
 *   resolved (available) language, when the language the person
 *   actually asked for isn't AVAILABLE yet. Deliberately short and
 *   generic so it reads naturally appended after any intent's answer.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["cozy-language-templates"]) return;

    const VERSION = "1.2.0"; // COZYAI-PUBLIC-VISION-KNOWLEDGE: added why-use-cozyos / differentiation / language-support-list templates. REGISTRATION/AUTH: how-to-register is now evidence-backed (:verified/:not_found), Kiswahili-first with a genuine committed translation (not an English-fallback placeholder).
    const LANGS = ["en", "sw", "fr", "ar", "so"];

    const TEMPLATES = Object.freeze({
        "greeting-morning": Object.freeze({
            en: "Good morning! I'm the CozyOS Assistant — ready to help with whatever you're working on today.",
            sw: "Habari za asubuhi! Mimi ni Msaidizi wa CozyOS — niko tayari kukusaidia na chochote unachofanya leo.",
            fr: "Bonjour ! Je suis l'Assistant CozyOS — prêt à vous aider avec ce sur quoi vous travaillez aujourd'hui.",
            ar: "صباح الخير! أنا مساعد CozyOS، جاهز لمساعدتك في أي شيء تعمل عليه اليوم.",
            so: "Subax wanaagsan! Waxaan ahay Kaaliyaha CozyOS — diyaar u ah inaan kaa caawiyo wax kastoo aad maanta ka shaqaynayso."
        }),
        "greeting-afternoon": Object.freeze({
            en: "Good afternoon! I'm the CozyOS Assistant. What can I help you with?",
            sw: "Habari za mchana! Mimi ni Msaidizi wa CozyOS. Nikusaidie na nini?",
            fr: "Bon après-midi ! Je suis l'Assistant CozyOS. En quoi puis-je vous aider ?",
            ar: "مساء الخير! أنا مساعد CozyOS. كيف يمكنني مساعدتك؟",
            so: "Galab wanaagsan! Waxaan ahay Kaaliyaha CozyOS. Maxaan kaa caawin karaa?"
        }),
        "greeting-evening": Object.freeze({
            en: "Good evening! I'm the CozyOS Assistant. How can I help?",
            sw: "Habari za jioni! Mimi ni Msaidizi wa CozyOS. Naweza kukusaidiaje?",
            fr: "Bonsoir ! Je suis l'Assistant CozyOS. Comment puis-je vous aider ?",
            ar: "مساء الخير! أنا مساعد CozyOS. كيف يمكنني المساعدة؟",
            so: "Habeen wanaagsan! Waxaan ahay Kaaliyaha CozyOS. Sideen kuu caawin karaa?"
        }),
        "greeting-generic": Object.freeze({
            en: "Hello! I'm the CozyOS Assistant. How can I help you?",
            sw: "Habari! Mimi ni Msaidizi wa CozyOS. Naweza kukusaidiaje?",
            fr: "Bonjour ! Je suis l'Assistant CozyOS. Comment puis-je vous aider ?",
            ar: "مرحبًا! أنا مساعد CozyOS. كيف يمكنني مساعدتك؟",
            so: "Salaan! Waxaan ahay Kaaliyaha CozyOS. Sideen kuu caawin karaa?"
        }),
        "thanks": Object.freeze({
            en: "You're welcome! Let me know if there's anything else you need.",
            sw: "Karibu sana! Niambie kama kuna kitu kingine unachohitaji.",
            fr: "Je vous en prie ! Dites-moi si vous avez besoin d'autre chose.",
            ar: "عفوًا! أخبرني إذا كنت بحاجة إلى أي شيء آخر.",
            so: "Adaa mudan! Ii sheeg haddii aad wax kale u baahan tahay."
        }),
        "identity": Object.freeze({
            en: "I'm the CozyOS Assistant. Right now I answer using a real, rule-based conversational composer (not a language model) alongside CozyOS's real reasoning, memory, and policy pipeline.",
            sw: "Mimi ni Msaidizi wa CozyOS. Kwa sasa najibu kwa kutumia mfumo wa kanuni (rule-based), si mfano wa lugha (language model), pamoja na mfumo halisi wa CozyOS wa kufikiri, kumbukumbu, na sera.",
            fr: "Je suis l'Assistant CozyOS. Pour l'instant, je réponds grâce à un compositeur conversationnel réel basé sur des règles (pas un modèle de langage), en lien avec le vrai pipeline de raisonnement, de mémoire et de politique de CozyOS.",
            ar: "أنا مساعد CozyOS. حاليًا أُجيب باستخدام مُركِّب حواري حقيقي قائم على القواعد (rule-based)، وليس نموذج لغة، إلى جانب مسار CozyOS الحقيقي للتفكير والذاكرة والسياسات.",
            so: "Waxaan ahay Kaaliyaha CozyOS. Hadda waxaan ku jawaabaa qaab dhab ah oo ku salaysan xeerar (rule-based), ee ma ahan model luqad, oo wehliya cadaadiska dhabta ah ee CozyOS ee fikirka, xusuusta, iyo siyaasadda."
        }),
        "help": Object.freeze({
            en: "I can help with search, notifications, recent activity, and simple conversational questions about CozyOS itself — who created it, what apps and providers are available, how registration and authentication work, and what account/provider statuses mean. My understanding is rule-based, so I'll always tell you honestly when something is outside what I currently recognize.",
            sw: "Naweza kusaidia na utafutaji, arifa, shughuli za hivi karibuni, na maswali rahisi kuhusu CozyOS yenyewe — ni nani aliyeianzisha, programu na watoa huduma gani zinapatikana, usajili na uthibitishaji hufanya kazi vipi, na hali za akaunti/watoa huduma zinamaanisha nini. Uelewa wangu ni wa kanuni (rule-based), hivyo nitakuambia kwa uaminifu kila wakati jambo liko nje ya ninachotambua kwa sasa.",
            fr: "Je peux aider avec la recherche, les notifications, l'activité récente, et des questions conversationnelles simples sur CozyOS lui-même — qui l'a créé, quelles applications et quels fournisseurs sont disponibles, comment fonctionnent l'inscription et l'authentification, et ce que signifient les statuts de compte/fournisseur. Ma compréhension est basée sur des règles, donc je vous dirai toujours honnêtement quand quelque chose sort de ce que je reconnais actuellement.",
            ar: "يمكنني المساعدة في البحث، والإشعارات، والنشاط الأخير، والأسئلة الحوارية البسيطة حول CozyOS نفسه — من أنشأه، وما التطبيقات ومزوّدو الخدمة المتاحون، وكيف يعمل التسجيل والمصادقة، وماذا تعني حالات الحساب/المزوّد. فهمي قائم على القواعد، لذا سأخبرك دائمًا بصدق عندما يكون الأمر خارج ما أتعرف عليه حاليًا.",
            so: "Waan kaa caawin karaa raadinta, ogeysiisyada, dhaqdhaqaaqa dhawaan dhacay, iyo su'aalo fudud oo ku saabsan CozyOS lafteeda — cidda abuurtay, ka fiican maxay tahay app-yada iyo bixiyeyaasha (providers) ee la heli karo, sida diiwaangelinta iyo xaqiijinta u shaqeeyaan, iyo waxa ay ka dhigan tahay xaaladaha akoonka/bixiyaha. Fahamkaygu waxa uu ku salaysan yahay xeerar, sidaas darteed had iyo jeer si daacad ah ayaan kuu sheegi doonaa marka wax ka baxsan yahay waxa aan hadda aqoonsanahay."
        }),
        // M355 fix — fixed-text meta answer, same convention as
        // "identity"/"help" above: describes CozyOS's own real,
        // already-implemented VERIFIED vs PLANNED/VISION separation
        // discipline. Not sourced from a per-topic fact getter because
        // it isn't a per-topic claim — it's a statement of how this
        // system itself is built to answer, true across every intent
        // in this file. EN+SW fully authored (this pass's disclosed
        // gap was found via a Kiswahili-adjacent audit); fr/ar/so
        // deliberately left to getTemplate()'s honest en fallback.
        "meta-verified-vs-planned": Object.freeze({
            en: "CozyOS separates VERIFIED information (implemented, tested, and confirmed today) from PLANNED/VISION information (the intended direction, not yet built) in every answer I give. I never blend the two or present a plan as if it already exists. Ask me about a specific application or topic and I'll tell you which category applies.",
            sw: "CozyOS hutenganisha taarifa ZILIZOTHIBITISHWA (zilizojengwa, kujaribiwa, na kuthibitishwa leo) na taarifa za MPANGO/DIRA (mwelekeo uliokusudiwa, ambao bado haujajengwa) katika kila jibu ninalotoa. Sichanganyi hizo mbili wala kuwasilisha mpango kana kwamba tayari upo. Niulize kuhusu programu au mada mahususi nami nitakuambia kategoria inayohusika."
        }),
        // ── RP-036 navigation intents ─────────────────────────────
        // en/sw fully authored (Kiswahili support is a hard
        // requirement of RP-036). fr/ar/so deliberately have no entry
        // here yet — getTemplate() already degrades honestly to the
        // en string in that case (see getTemplate() below), exactly
        // the same disclosed, partial-coverage pattern RP-027 used for
        // its own extended languages, rather than a fabricated
        // translation.
        "nav-dashboard": Object.freeze({
            en: "Opening the dashboard for you.",
            sw: "Ninafungua dashibodi kwa ajili yako."
        }),
        "nav-notifications": Object.freeze({
            en: "Opening notifications for you.",
            sw: "Ninafungua arifa kwa ajili yako."
        }),
        "nav-recent": Object.freeze({
            en: "Here's your recent activity.",
            sw: "Hii ndiyo shughuli zako za hivi karibuni."
        }),
        "nav-search": Object.freeze({
            en: "Opening search for you.",
            sw: "Ninafungua utafutaji kwa ajili yako."
        }),
        "nav-aiproviders": Object.freeze({
            en: "Opening AI Providers for you.",
            sw: "Ninafungua sehemu ya AI Providers kwa ajili yako."
        }),
        "nav-diagnostics": Object.freeze({
            en: "Opening the Diagnostics Center for you.",
            sw: "Ninafungua Diagnostics Center kwa ajili yako."
        }),

        "unsupported": Object.freeze({
            en: "I don't have a rule-based answer for that yet — right now my conversational understanding only covers greetings, help requests, thanks, and a set of disclosed questions about CozyOS itself. That's a real, disclosed limit, not an error.",
            sw: "Bado sina jibu la kanuni (rule-based) kwa hilo — kwa sasa uelewa wangu wa mazungumzo unahusisha tu salamu, maombi ya msaada, shukrani, na seti ya maswali yaliyowekwa wazi kuhusu CozyOS yenyewe. Hii ni kikomo halisi, kilichowekwa wazi, si hitilafu.",
            fr: "Je n'ai pas encore de réponse basée sur des règles pour cela — pour l'instant, ma compréhension conversationnelle couvre uniquement les salutations, les demandes d'aide, les remerciements, et un ensemble de questions déclarées sur CozyOS lui-même. C'est une limite réelle et déclarée, pas une erreur.",
            ar: "ليس لدي بعد إجابة قائمة على القواعد لذلك — حاليًا فهمي الحواري يغطي فقط التحيات، وطلبات المساعدة، والشكر، ومجموعة من الأسئلة المُعلنة حول CozyOS نفسه. هذا حد حقيقي ومُعلن، وليس خطأً.",
            so: "Wali ma haysto jawaab ku salaysan xeerar taas — hadda fahamkayga wadahadalka wuxuu koobayaa oo kaliya salaanta, codsiyada caawimada, mahadnaqa, iyo su'aalo la sheegay oo ku saabsan CozyOS lafteeda. Taasi waa xad dhab ah oo la sheegay, mana aha khalad."
        }),
        // M360 ASK-AND-LEARN — same honest disclosure as "unsupported"
        // above, PLUS a real, natural clarifying question, per the M360
        // spec's own example phrasing ("Unamaanisha nini?"). EN+SW only
        // (human-authored, not machine-translated); see the composeReply
        // call site in rule-based-conversational-provider.js for why
        // fr/ar/so deliberately do NOT fall back to this key.
        "unsupported-clarify": Object.freeze({
            en: "I don't have a rule-based answer for that yet — my conversational understanding today only covers greetings, help requests, thanks, and a set of disclosed questions about CozyOS itself. What do you mean? Could you say it a different way?",
            sw: "Bado sina jibu la kanuni kwa hilo — kwa sasa uelewa wangu wa mazungumzo unahusisha tu salamu, maombi ya msaada, shukrani, na maswali yaliyowekwa wazi kuhusu CozyOS yenyewe. Unamaanisha nini? Unaweza kunieleza kwa njia nyingine?"
        }),

        "what-is-cozyos": Object.freeze({
            en: "CozyOS is an offline-first, modular operating system built for community settings such as churches, schools, and rural areas. It's organized as a set of coordinators and engines that register real capabilities into a shared platform, rather than one monolithic app, so it can keep working even without a reliable internet connection.",
            sw: "CozyOS ni mfumo wa uendeshaji (operating system) unaotanguliza kufanya kazi bila mtandao (offline-first), na wenye moduli, uliojengwa kwa mazingira ya jamii kama makanisa, shule, na maeneo ya vijijini. Umepangwa kama seti ya vinganganja (coordinators) na injini (engines) zinazosajili uwezo halisi kwenye jukwaa moja la pamoja, badala ya programu moja kubwa, ili kuendelea kufanya kazi hata bila mtandao wa uhakika.",
            fr: "CozyOS est un système d'exploitation modulaire, conçu d'abord pour fonctionner hors ligne, destiné à des contextes communautaires comme les églises, les écoles et les zones rurales. Il est organisé comme un ensemble de coordinateurs et de moteurs qui enregistrent de vraies capacités dans une plateforme partagée, plutôt qu'une seule application monolithique, afin de continuer à fonctionner même sans connexion internet fiable.",
            ar: "CozyOS هو نظام تشغيل معياري (modular) يعمل أولًا بلا اتصال إنترنت (offline-first)، مصمم لبيئات مجتمعية مثل الكنائس والمدارس والمناطق الريفية. وهو منظَّم كمجموعة من المنسّقات (coordinators) والمحركات (engines) التي تسجّل قدرات حقيقية داخل منصة مشتركة، بدلًا من تطبيق واحد ضخم، بحيث يستمر في العمل حتى بدون اتصال إنترنت موثوق.",
            so: "CozyOS waa nidaam hawlgal (operating system) oo modular ah, oo ugu horrayn u shaqeeya offline, loogu talagalay meelaha bulshada sida kaniisadaha, dugsiyada, iyo aagagga miyiga ah. Waxaa loo abaabulay sida shabakad iskaashi (coordinators) iyo matoorro (engines) oo diiwaangeliya awoodo dhab ah oo ku jira madal la wadaago, halkii ay ka noqon lahayd app keliya oo weyn, si ay u sii shaqeyso xitaa haddaanay jirin internet la isku halayn karo."
        }),
        "what-is-cozyos-enterprise": Object.freeze({
            en: "CozyOS Enterprise is the enterprise-tier layer built on top of the CozyOS kernel — the business and organization-facing applications (for example MpesaOS and other CozyOS Enterprise apps in this repository) that rely on CozyOS's coordinators, providers, and engines as their real foundation, rather than reimplementing that layer themselves.",
            sw: "CozyOS Enterprise ni tabaka la kiwango cha biashara (enterprise) lililojengwa juu ya msingi wa CozyOS — programu zinazolenga biashara na mashirika (kwa mfano MpesaOS na programu nyingine za CozyOS Enterprise katika hazina hii) zinazotegemea vinganganja, watoa huduma, na injini za CozyOS kama msingi wao halisi, badala ya kujenga tabaka hilo upya.",
            fr: "CozyOS Enterprise est la couche de niveau entreprise construite sur le noyau CozyOS — les applications destinées aux entreprises et organisations (par exemple MpesaOS et d'autres applications CozyOS Enterprise de ce dépôt) qui s'appuient réellement sur les coordinateurs, fournisseurs et moteurs de CozyOS comme fondation, plutôt que de la réimplémenter.",
            ar: "CozyOS Enterprise هو الطبقة على مستوى المؤسسات المبنية فوق نواة CozyOS — وهي التطبيقات الموجهة للأعمال والمؤسسات (مثل MpesaOS وتطبيقات CozyOS Enterprise الأخرى في هذا المستودع) التي تعتمد فعليًا على منسّقات ومزوّدي ومحركات CozyOS كأساس حقيقي لها، بدلًا من إعادة بنائها من الصفر.",
            so: "CozyOS Enterprise waa lakabka heerka ganacsiga (enterprise) ee lagu dul dhisay lafdhabarka CozyOS — kuwaas oo ah app-yada loogu talagalay ganacsiyada iyo hay'adaha (tusaale MpesaOS iyo app-yo kale oo CozyOS Enterprise ah oo ku jira kaydkan) ee dhab ahaan ku tiirsan iskaashiga, bixiyeyaasha, iyo matoorrada CozyOS sida aasaaskooda dhabta ah, halkii ay dib u dhisi lahaayeen lakabkaas."
        }),

        // ── REGISTRATION/AUTH milestone — how-to-register is now
        // evidence-backed (getRegistrationFlowFact(), sourced from
        // real, committed, directly-audited registration code — see
        // that fact-getter's own header). Kiswahili is written FIRST
        // and is a full, real translation (not an "English only"
        // placeholder) per this milestone's hard requirement; English
        // is second. fr/ar/so keep the previous milestone's disclosed
        // "no verified translation of THIS content yet" convention —
        // they fall back to the English frame via getTemplate()'s own
        // entry[lang] || entry.en behavior below, since no verified
        // fr/ar/so translation of these specific steps exists.
        "how-to-register:verified": Object.freeze({
            sw: (fact) => {
                const steps = (Array.isArray(fact.stepsSw) ? fact.stepsSw : fact.steps).map((s, i) => `${i + 1}. ${s}`).join("\n");
                // Fixed, committed Kiswahili translation of the password
                // policy sentence (not a runtime/auto translation of
                // fact.passwordRequirement) — kept in lockstep with the
                // English wording above by a human reviewer, same
                // discipline as every other bilingual frame in this file.
                const passwordSw = "angalau herufi 8, zikiwemo herufi kubwa, herufi ndogo, nambari, na alama";
                return `Ndiyo. Ili kujisajili CozyOS:\n${steps}\n\nNenosiri linahitaji: ${passwordSw}. Hakuna msimbo wa uthibitishaji wa barua pepe au simu unaohitajika ili kukamilisha usajili — mara tu fomu ikiwasilishwa kwa mafanikio, CozyOS inakuingiza moja kwa moja. Hii ni kulingana na utekelezaji halisi wa CozyOS; ikiwa hatua fulani haijathibitishwa kwenye mfumo, Cozy AI haitadai kuwa ipo.`;
            },
            en: (fact) => {
                const steps = fact.steps.map((s, i) => `${i + 1}. ${s}`).join("\n");
                return `To register for CozyOS:\n${steps}\n\nPassword requirement: ${fact.passwordRequirement}. No email or SMS verification code is required to complete registration — once the form is submitted successfully, CozyOS signs you in automatically. This reflects CozyOS's real, current implementation; I only provide steps that are verified by the current CozyOS registration code.`;
            }
        }),
        "how-to-register:not_found": Object.freeze({
            en: "I don't have a verified answer for how to register right now, so I won't guess at the steps — please check CozyOS's own registration screen directly.",
            sw: "Sina jibu lililothibitishwa kuhusu jinsi ya kujisajili kwa sasa, kwa hivyo sitakisia hatua — tafadhali angalia skrini halisi ya usajili ya CozyOS.",
            fr: "Je n'ai pas de réponse vérifiée sur la façon de s'inscrire pour le moment, donc je ne devinerai pas les étapes — veuillez consulter directement l'écran d'inscription de CozyOS.",
            ar: "ليس لدي إجابة موثّقة حاليًا عن كيفية التسجيل، لذا لن أخمّن الخطوات — يرجى مراجعة شاشة التسجيل الفعلية في CozyOS مباشرة.",
            so: "Hadda ma haysto jawaab la xaqiijiyay oo ku saabsan sida loo diiwaangeliyo, marka ma qiyaasi doono tallaabooyinka — fadlan eeg si toos ah shaashadda diiwaangelinta ee dhabta ah ee CozyOS."
        }),
        "how-authentication-works": Object.freeze({
            en: "CozyOS authentication is coordinated by CozyIdentity, which never authenticates you directly — it delegates the actual verification to a registered method-specific adapter (for example password, PIN, QR code, face, fingerprint, or one-time code) and then manages the resulting session.",
            sw: "Uthibitishaji wa CozyOS unaratibiwa na CozyIdentity, ambayo haithibitishi moja kwa moja — inakabidhi uthibitisho halisi kwa kibadilishi (adapter) kilichosajiliwa kwa mbinu maalum (kwa mfano nenosiri, PIN, msimbo wa QR, uso, alama ya kidole, au msimbo wa mara moja) kisha inasimamia kikao (session) kinachotokana nayo.",
            fr: "L'authentification de CozyOS est coordonnée par CozyIdentity, qui ne vous authentifie jamais directement — elle délègue la vérification réelle à un adaptateur enregistré spécifique à une méthode (par exemple mot de passe, PIN, code QR, visage, empreinte digitale, ou code à usage unique), puis gère la session qui en résulte.",
            ar: "تُنسَّق مصادقة CozyOS بواسطة CozyIdentity، التي لا تقوم بمصادقتك مباشرة أبدًا — بل تُفوِّض التحقق الفعلي إلى مهايئ (adapter) مسجَّل خاص بطريقة معينة (مثل كلمة المرور، أو رمز PIN، أو رمز QR، أو الوجه، أو بصمة الإصبع، أو رمز لمرة واحدة)، ثم تدير الجلسة الناتجة.",
            so: "Xaqiijinta CozyOS waxaa iskuduba socodsiiya CozyIdentity, kaas oo aan si toos ah kuu xaqiijin — wuxuu u wareejiyaa xaqiijinta dhabta ah adapter diiwaangashan oo u gaar ah hab gaar ah (tusaale erayga sirta ah, PIN, koodhka QR, wejiga, farta, ama koodh hal mar ah), ka dibna wuxuu maamulaa fadhiga (session) ka dhasha."
        }),
        "phone-verification": Object.freeze({
            en: "Phone verification is one of the steps CozyOS can require before an account becomes fully active. I don't have access to your specific verification result from this conversation, but if it's incomplete, the account would typically stay PENDING rather than become ACTIVE until it's completed.",
            sw: "Uthibitishaji wa simu ni mojawapo ya hatua ambazo CozyOS inaweza kuhitaji kabla akaunti kuwa hai kikamilifu. Sina ufikiaji wa matokeo yako mahususi ya uthibitishaji katika mazungumzo haya, lakini kama haujakamilika, akaunti kwa kawaida itabaki PENDING badala ya kuwa ACTIVE mpaka ikamilike.",
            fr: "La vérification du téléphone est l'une des étapes que CozyOS peut exiger avant qu'un compte ne devienne pleinement actif. Je n'ai pas accès à votre résultat de vérification spécifique dans cette conversation, mais si elle est incomplète, le compte resterait normalement PENDING plutôt que de devenir ACTIVE tant qu'elle n'est pas terminée.",
            ar: "التحقق من الهاتف هو إحدى الخطوات التي قد يتطلبها CozyOS قبل أن يصبح الحساب فعالًا بالكامل. ليس لدي إمكانية الوصول إلى نتيجة التحقق الخاصة بك في هذه المحادثة، لكن إذا كانت غير مكتملة، فسيظل الحساب عادةً PENDING بدلًا من أن يصبح ACTIVE حتى تكتمل.",
            so: "Xaqiijinta taleefanka waa mid ka mid ah tallaabooyinka CozyOS ay u baahan karto ka hor inta akoonku noqon si buuxda mid firfircoon. Ma awoodo inaan arko natiijada xaqiijintaada gaarka ah ee wadahadalkan gudihiisa, laakiin haddii aysan dhammaystirmin, akoonku caadi ahaan wuxuu sii ahaan doonaa PENDING halkii uu noqon lahaa ACTIVE ilaa la dhammaystiro."
        }),
        "account-status": Object.freeze({
            en: "I can explain the possible account states, but I can't see enough verified account information to tell you exactly why this account is inactive. CozyOS's identity system uses states such as ACTIVE and PENDING, alongside honest intermediate states like registration-pending, authentication-incomplete, phone-verification-incomplete, or trusted-device-required, depending on how far the account has progressed.",
            sw: "Naweza kueleza hali zinazowezekana za akaunti, lakini sioni taarifa za akaunti zilizothibitishwa vya kutosha kukuambia kwa nini akaunti hii haifanyi kazi. Mfumo wa utambulisho wa CozyOS hutumia hali kama ACTIVE na PENDING, pamoja na hali za katikati zilizoainishwa kwa uaminifu kama registration-pending, authentication-incomplete, phone-verification-incomplete, au trusted-device-required, kutegemea akaunti imefikia hatua gani.",
            fr: "Je peux expliquer les états possibles d'un compte, mais je ne dispose pas d'assez d'informations de compte vérifiées pour vous dire exactement pourquoi ce compte est inactif. Le système d'identité de CozyOS utilise des états comme ACTIVE et PENDING, ainsi que des états intermédiaires honnêtement nommés comme registration-pending, authentication-incomplete, phone-verification-incomplete, ou trusted-device-required, selon l'avancement du compte.",
            ar: "يمكنني شرح الحالات الممكنة للحساب، لكن لا تتوفر لدي معلومات حساب مُتحقَّق منها كافية لأخبرك بالضبط لماذا هذا الحساب غير نشط. يستخدم نظام الهوية في CozyOS حالات مثل ACTIVE وPENDING، إلى جانب حالات وسيطة صريحة مثل registration-pending وauthentication-incomplete وphone-verification-incomplete أو trusted-device-required، حسب مدى تقدّم الحساب.",
            so: "Waan sharixi karaa xaaladaha suurtagalka ah ee akoonka, laakiin ma haysto macluumaad akoon oo la xaqiijiyay oo ku filan si aan kuugu sheego sababta akoonkani u shaqeynin. Nidaamka aqoonsiga ee CozyOS wuxuu isticmaalaa xaaladaha sida ACTIVE iyo PENDING, iyo sidoo kale xaaladaha dhexdhexaadka ah ee daacadnimada leh sida registration-pending, authentication-incomplete, phone-verification-incomplete, ama trusted-device-required, iyadoo ku xiran inta uu akoonku horumaray."
        }),

        "what-is-provider": Object.freeze({
            en: "In CozyOS, a 'provider' is a registered capability with a health status that Provider Manager can track, enable, or disable — for example this conversational provider, or an on-device AI provider. It's different from an 'app' (a full application like MpesaOS) or an 'engine' (an internal coordinator implementing one specific capability).",
            sw: "Katika CozyOS, 'provider' ni uwezo uliosajiliwa wenye hali ya afya ambayo Provider Manager inaweza kufuatilia, kuwezesha, au kuzima — kwa mfano huyu mtoa huduma wa mazungumzo, au provider wa AI ya kifaani. Ni tofauti na 'app' (programu kamili kama MpesaOS) au 'engine' (kingangaja cha ndani kinachotekeleza uwezo mmoja mahususi).",
            fr: "Dans CozyOS, un « provider » (fournisseur) est une capacité enregistrée avec un état de santé que Provider Manager peut suivre, activer ou désactiver — par exemple ce fournisseur conversationnel, ou un fournisseur d'IA embarquée. C'est différent d'une « app » (une application complète comme MpesaOS) ou d'un « engine » (un coordinateur interne implémentant une capacité précise).",
            ar: "في CozyOS، يُعد \"provider\" (المزوّد) قدرة مسجَّلة لها حالة صحية يمكن لـ Provider Manager تتبعها أو تفعيلها أو تعطيلها — مثل مزوّد المحادثة هذا، أو مزوّد ذكاء اصطناعي على الجهاز. وهو يختلف عن \"app\" (تطبيق كامل مثل MpesaOS) أو \"engine\" (منسّق داخلي ينفذ قدرة محددة واحدة).",
            so: "CozyOS gudaheeda, 'provider' waa awood diiwaangashan oo leh xaalad caafimaad oo Provider Manager ay la socon karto, shaqaysiin karto, ama demin karto — tusaale bixiyahan wadahadalka, ama provider AI ah oo qalabka ku shaqeeya. Waxay ka duwan tahay 'app' (barnaamij dhamaystiran sida MpesaOS) ama 'engine' (iskaashi gudaha ah oo hirgeliya hal awood oo gaar ah)."
        }),
        "provider-not-ready": Object.freeze({
            en: "NOT_READY means a provider's own real capability check found that whatever it depends on isn't available in this environment yet — for example, CozyOS's on-device AI provider honestly reports NOT_READY when the browser doesn't expose an on-device language-model API. It's a disclosed, honest status, not necessarily an error.",
            sw: "NOT_READY inamaanisha ukaguzi halisi wa uwezo wa provider uligundua kwamba kile anachotegemea bado hakipatikani katika mazingira haya — kwa mfano, provider wa AI ya kifaani ya CozyOS huripoti NOT_READY kwa uaminifu wakati kivinjari hakitoi API ya modeli ya lugha ya kifaani. Ni hali iliyowekwa wazi, ya uaminifu, si lazima iwe hitilafu.",
            fr: "NOT_READY signifie que la vérification réelle de capacité d'un fournisseur a constaté que ce dont il dépend n'est pas encore disponible dans cet environnement — par exemple, le fournisseur d'IA embarquée de CozyOS rapporte honnêtement NOT_READY quand le navigateur n'expose pas d'API de modèle de langage embarqué. C'est un état déclaré et honnête, pas nécessairement une erreur.",
            ar: "تعني NOT_READY أن فحص القدرة الحقيقي الخاص بالمزوّد وجد أن ما يعتمد عليه غير متوفر بعد في هذه البيئة — على سبيل المثال، يُبلغ مزوّد الذكاء الاصطناعي على الجهاز في CozyOS بصدق عن NOT_READY عندما لا يوفّر المتصفح واجهة برمجة لنموذج لغة على الجهاز. هذه حالة مُعلنة وصادقة، وليست بالضرورة خطأ.",
            so: "NOT_READY macnaheedu waa in hubinta awoodda dhabta ah ee bixiyaha ay ogaatay in wixii uu ku tiirsan yahay aan weli laheyn deegaankan — tusaale, bixiyaha AI-ga qalabka ku shaqeeya ee CozyOS ayaa si daacad ah u soo sheega NOT_READY marka biraawsarku uusan bixin API model luqad oo qalabka ku shaqeeya. Waa xaalad la sheegay oo daacad ah, mana ahan wax khalad ah oo hubaal ah."
        }),
        "control-center": Object.freeze({
            en: "The Control Center / dashboard is where CozyOS surfaces provider health, application access, and account/administration tools in one place, drawing on the same real registries (Provider Manager, Service Registry, Identity) that I use to answer questions like this.",
            sw: "Control Center / dashibodi ndipo CozyOS inaonyesha afya ya watoa huduma, ufikiaji wa programu, na zana za akaunti/utawala mahali pamoja, ikitegemea rejista halisi zilezile (Provider Manager, Service Registry, Identity) ninazotumia kujibu maswali kama haya.",
            fr: "Le Control Center / tableau de bord est l'endroit où CozyOS affiche l'état des fournisseurs, l'accès aux applications, et les outils de compte/administration en un seul endroit, en s'appuyant sur les mêmes registres réels (Provider Manager, Service Registry, Identity) que j'utilise pour répondre à ce genre de questions.",
            ar: "مركز التحكم (Control Center) / لوحة التحكم هو المكان الذي يعرض فيه CozyOS حالة المزوّدين، والوصول إلى التطبيقات، وأدوات الحساب/الإدارة في مكان واحد، اعتمادًا على السجلّات الحقيقية نفسها (Provider Manager وService Registry وIdentity) التي أستخدمها للإجابة عن أسئلة كهذه.",
            so: "Control Center / dashboard-ku waa meesha CozyOS ay ku muujiso caafimaadka bixiyeyaasha, gelitaanka app-yada, iyo qalabka akoonka/maamulka meel keliya, iyadoo isticmaalaysa diiwaanadka dhabta ah ee isku mid ah (Provider Manager, Service Registry, Identity) ee aan u isticmaalo inaan ka jawaabo su'aalo sidan oo kale ah."
        }),

        // ── Dynamic frames: fixed sentence per language, live evidence interpolated ──
        "founder:verified": Object.freeze({
            en: (answer) => `I'm the CozyOS Assistant. ${answer}`,
            sw: (answer) => `Mimi ni Msaidizi wa CozyOS. ${answer}`,
            fr: (answer) => `Je suis l'Assistant CozyOS. ${answer}`,
            ar: (answer) => `أنا مساعد CozyOS. ${answer}`,
            so: (answer) => `Waxaan ahay Kaaliyaha CozyOS. ${answer}`
        }),
        "founder:not_found": Object.freeze({
            en: "I'm the CozyOS Assistant. I was built as part of CozyOS, but I don't currently have a verified record of the individual who created me.",
            sw: "Mimi ni Msaidizi wa CozyOS. Nilijengwa kama sehemu ya CozyOS, lakini kwa sasa sina rekodi iliyothibitishwa ya mtu aliyeniunda.",
            fr: "Je suis l'Assistant CozyOS. J'ai été construit dans le cadre de CozyOS, mais je n'ai actuellement pas d'enregistrement vérifié de la personne qui m'a créé.",
            ar: "أنا مساعد CozyOS. تم بنائي كجزء من CozyOS، لكن لا يتوفر لدي حاليًا سجل موثّق للشخص الذي أنشأني.",
            so: "Waxaan ahay Kaaliyaha CozyOS. Waxaa la ii dhisay qayb ka mid ah CozyOS, laakiin hadda ma haysto diiwaan la xaqiijiyay oo ku saabsan qofka i abuuray."
        }),

        "list-apps:verified": Object.freeze({
            en: (names) => `Here are the CozyOS applications I can currently see in the registry: ${names.join(", ")}.`,
            sw: (names) => `Hizi ndizo programu za CozyOS ninazoweza kuona kwa sasa kwenye rejista: ${names.join(", ")}.`,
            fr: (names) => `Voici les applications CozyOS que je peux actuellement voir dans le registre : ${names.join(", ")}.`,
            ar: (names) => `هذه هي تطبيقات CozyOS التي يمكنني رؤيتها حاليًا في السجل: ${names.join("، ")}.`,
            so: (names) => `Kuwan waa app-yada CozyOS ee aan hadda ku arki karo diiwaanka: ${names.join(", ")}.`
        }),
        // M363 real-device fix — "Kuna programu ngapi na inasaidia
        // aje?" (how many applications are there, and how do they
        // help?) needs the real COUNT stated explicitly (not just an
        // implied list) plus a short, real, per-app human-value line —
        // composed here only from getApplicationHumanPurposeFact()'s
        // already-VERIFIED data (cozy-knowledge-registry.js), never
        // invented. EN+SW only (human-authored); fr/ar/so keep using
        // the plain "list-apps:verified" template above, unchanged.
        "list-apps:verified-with-count": Object.freeze({
            en: (count, names, purposeLine) => `CozyOS currently has ${count} real, registered application${count === 1 ? "" : "s"}: ${names.join(", ")}.${purposeLine ? ` ${purposeLine}` : ""}`,
            sw: (count, names, purposeLine) => `CozyOS ina programu ${count} halisi zilizosajiliwa kwa sasa: ${names.join(", ")}.${purposeLine ? ` ${purposeLine}` : ""}`
        }),
        "list-apps:unavailable": Object.freeze({
            en: "I can help you find the CozyOS apps, but the application registry isn't available right now.",
            sw: "Naweza kukusaidia kutafuta programu za CozyOS, lakini rejista ya programu haipatikani kwa sasa.",
            fr: "Je peux vous aider à trouver les applications CozyOS, mais le registre des applications n'est pas disponible pour le moment.",
            ar: "يمكنني مساعدتك في العثور على تطبيقات CozyOS، لكن سجل التطبيقات غير متاح في الوقت الحالي.",
            so: "Waan ku caawin karaa inaad heshid app-yada CozyOS, laakiin diiwaanka app-yadu hadda ma jiro."
        }),

        "list-providers:verified": Object.freeze({
            en: (entries) => `Here is the current status of CozyOS's registered providers: ${entries.join("; ")}.`,
            sw: (entries) => `Hii ndiyo hali ya sasa ya watoa huduma waliosajiliwa wa CozyOS: ${entries.join("; ")}.`,
            fr: (entries) => `Voici l'état actuel des fournisseurs enregistrés de CozyOS : ${entries.join(" ; ")}.`,
            ar: (entries) => `فيما يلي الحالة الحالية لمزوّدي الخدمة المسجَّلين في CozyOS: ${entries.join("؛ ")}.`,
            so: (entries) => `Kani waa xaalada hadda ee bixiyeyaasha diiwaangashan ee CozyOS: ${entries.join("; ")}.`
        }),
        "list-providers:unavailable": Object.freeze({
            en: "I can explain what providers are, but I can't see the live Provider Manager status from here right now.",
            sw: "Naweza kueleza watoa huduma ni nini, lakini siwezi kuona hali ya moja kwa moja ya Provider Manager kutoka hapa kwa sasa.",
            fr: "Je peux expliquer ce que sont les fournisseurs, mais je ne peux pas voir l'état en direct de Provider Manager depuis ici pour le moment.",
            ar: "يمكنني شرح ما هي المزوّدات، لكن لا يمكنني رؤية حالة Provider Manager المباشرة من هنا حاليًا.",
            so: "Waan sharixi karaa waxa bixiyeyaashu yihiin, laakiin hadda halkan kama arki karo xaalada toos ah ee Provider Manager."
        }),

        // ── CozyAI Project Knowledge & Public Story Integration ──
        // Dynamic "verified" frames wrap the real published chapter
        // body (whatever language it was authored in) with a fixed
        // per-language lead-in, same pattern as founder:verified.
        // "not_found" frames are fixed text — shown until the Founder
        // explicitly publishes the corresponding chapter.
        "project-origin:verified": Object.freeze({
            en: (answer) => `Here's why CozyOS was started, from the published project story: ${answer}`,
            sw: (answer) => `Hii ndiyo sababu CozyOS ilianzishwa, kutoka kwa hadithi ya mradi iliyochapishwa: ${answer}`,
            fr: (answer) => `Voici pourquoi CozyOS a été créé, d'après l'histoire du projet publiée : ${answer}`,
            ar: (answer) => `إليك سبب إنشاء CozyOS، من قصة المشروع المنشورة: ${answer}`,
            so: (answer) => `Tani waa sababta CozyOS loo aasaasay, taas oo laga soo qaatay sheekada mashruuca ee la daabacay: ${answer}`
        }),
        "project-origin:not_found": Object.freeze({
            en: "The public origin story of CozyOS hasn't been published yet, so I don't have an authoritative answer to why it was started.",
            sw: "Hadithi ya asili ya CozyOS bado haijachapishwa hadharani, kwa hivyo sina jibu la kuthibitishwa kuhusu kwa nini ilianzishwa.",
            fr: "L'histoire publique des origines de CozyOS n'a pas encore été publiée, je n'ai donc pas de réponse fiable sur les raisons de sa création.",
            ar: "لم تُنشر بعد قصة نشأة CozyOS العامة، لذا ليس لدي إجابة موثوقة عن سبب إنشائه.",
            so: "Sheekada guud ee asalka CozyOS weli lama daabicin, sidaas darteed ma haysto jawaab la xaqiijiyay oo ku saabsan sababta loo aasaasay."
        }),

        "public-story:verified": Object.freeze({
            en: (answer) => `Here's the published public story of CozyOS: ${answer}`,
            sw: (answer) => `Hii ndiyo hadithi ya umma ya CozyOS iliyochapishwa: ${answer}`,
            fr: (answer) => `Voici l'histoire publique publiée de CozyOS : ${answer}`,
            ar: (answer) => `إليك القصة العامة المنشورة لـ CozyOS: ${answer}`,
            so: (answer) => `Tani waa sheekada dadweynaha ee CozyOS ee la daabacay: ${answer}`
        }),
        "public-story:not_found": Object.freeze({
            en: "CozyOS doesn't have a published public story yet, so I can't share one right now.",
            sw: "CozyOS bado haina hadithi ya umma iliyochapishwa, kwa hivyo siwezi kushiriki moja kwa sasa.",
            fr: "CozyOS n'a pas encore d'histoire publique publiée, je ne peux donc pas en partager une pour le moment.",
            ar: "ليس لدى CozyOS بعد قصة عامة منشورة، لذا لا يمكنني مشاركة واحدة الآن.",
            so: "CozyOS weli ma laha sheeko dadweyne oo la daabacay, sidaas darteed hadda ma wadaagi karo mid."
        }),

        "vision:verified": Object.freeze({
            en: (answer) => `Here's CozyOS's published vision: ${answer}`,
            sw: (answer) => `Hii ndiyo dira ya CozyOS iliyochapishwa: ${answer}`,
            fr: (answer) => `Voici la vision publiée de CozyOS : ${answer}`,
            ar: (answer) => `إليك رؤية CozyOS المنشورة: ${answer}`,
            so: (answer) => `Tani waa aragtida CozyOS ee la daabacay: ${answer}`
        }),
        "vision:not_found": Object.freeze({
            en: "CozyOS's vision statement hasn't been published yet, so I don't have an authoritative answer for what it's trying to accomplish.",
            sw: "Kauli ya dira ya CozyOS bado haijachapishwa, kwa hivyo sina jibu la kuthibitishwa kuhusu kile inachojaribu kutimiza.",
            fr: "L'énoncé de vision de CozyOS n'a pas encore été publié, je n'ai donc pas de réponse fiable sur ce qu'il cherche à accomplir.",
            ar: "لم يُنشر بعد بيان رؤية CozyOS، لذا ليس لدي إجابة موثوقة عمّا يسعى لتحقيقه.",
            so: "Bayaanka aragtida CozyOS weli lama daabicin, sidaas darteed ma haysto jawaab la xaqiijiyay oo ku saabsan waxa uu isku dayayo inuu gaaro."
        }),

        "mission:verified": Object.freeze({
            en: (answer) => `Here's CozyOS's published mission: ${answer}`,
            sw: (answer) => `Hii ndiyo dhamira ya CozyOS iliyochapishwa: ${answer}`,
            fr: (answer) => `Voici la mission publiée de CozyOS : ${answer}`,
            ar: (answer) => `إليك مهمة CozyOS المنشورة: ${answer}`,
            so: (answer) => `Tani waa hadafka CozyOS ee la daabacay: ${answer}`
        }),
        "mission:not_found": Object.freeze({
            en: "CozyOS's mission statement hasn't been published yet, so I don't have an authoritative answer for that.",
            sw: "Kauli ya dhamira ya CozyOS bado haijachapishwa, kwa hivyo sina jibu la kuthibitishwa kuhusu hilo.",
            fr: "L'énoncé de mission de CozyOS n'a pas encore été publié, je n'ai donc pas de réponse fiable à ce sujet.",
            ar: "لم يُنشر بعد بيان مهمة CozyOS، لذا ليس لدي إجابة موثوقة حول ذلك.",
            so: "Bayaanka hadafka CozyOS weli lama daabicin, sidaas darteed ma haysto jawaab la xaqiijiyay oo ku saabsan taas."
        }),

        "project-history:verified": Object.freeze({
            en: (answer) => `Here's the published history of CozyOS: ${answer}`,
            sw: (answer) => `Hii ndiyo historia ya CozyOS iliyochapishwa: ${answer}`,
            fr: (answer) => `Voici l'histoire publiée de CozyOS : ${answer}`,
            ar: (answer) => `إليك تاريخ CozyOS المنشور: ${answer}`,
            so: (answer) => `Tani waa taariikhda CozyOS ee la daabacay: ${answer}`
        }),
        "project-history:not_found": Object.freeze({
            en: "CozyOS's project history hasn't been published yet, so I don't have an authoritative account of it.",
            sw: "Historia ya mradi wa CozyOS bado haijachapishwa, kwa hivyo sina maelezo yaliyothibitishwa kuhusu hilo.",
            fr: "L'historique du projet CozyOS n'a pas encore été publié, je n'en ai donc pas de récit fiable.",
            ar: "لم يُنشر بعد تاريخ مشروع CozyOS، لذا ليس لدي سرد موثوق له.",
            so: "Taariikhda mashruuca CozyOS weli lama daabicin, sidaas darteed ma haysto sheekayn la xaqiijiyay oo ku saabsan taas."
        }),

        // ── COZYAI-PUBLIC-VISION-KNOWLEDGE — why-use / differentiation /
        // language-support-list. Source content (the interpolated
        // ${answer}) always comes from cozy-public-knowledge-source.js,
        // which is English-authored this pass — only the fixed
        // lead-in sentence around it is translated per language here,
        // same disclosed limitation the project-knowledge frames above
        // already carry for FounderStory content. en/sw fully authored
        // (Kiswahili support is a hard requirement of this repair);
        // fr/ar/so added where time allowed this pass.
        "why-use-cozyos:verified": Object.freeze({
            en: (answer) => `${answer}`,
            sw: (answer) => `Kwa Kiingereza (bado hatuna tafsiri iliyothibitishwa ya maandishi haya kwa Kiswahili): ${answer}`,
            fr: (answer) => `En anglais (aucune traduction française vérifiée de ce texte n'existe encore) : ${answer}`,
            ar: (answer) => `بالإنجليزية (لا توجد بعد ترجمة عربية موثّقة لهذا النص): ${answer}`,
            so: (answer) => `Ingiriisi ahaan (weli ma jirto turjumaad Soomaali ah oo la xaqiijiyay oo qoraalkan ah): ${answer}`
        }),
        "why-use-cozyos:not_found": Object.freeze({
            en: "I don't have a verified answer yet for why someone might want to use CozyOS.",
            sw: "Sina bado jibu lililothibitishwa kuhusu kwa nini mtu angependa kutumia CozyOS.",
            fr: "Je n'ai pas encore de réponse vérifiée sur les raisons d'utiliser CozyOS.",
            ar: "ليس لدي بعد إجابة موثّقة عن سبب رغبة أحد في استخدام CozyOS.",
            so: "Weli ma haysto jawaab la xaqiijiyay oo ku saabsan sababta qof u rabi karo inuu isticmaalo CozyOS."
        }),

        // PHASE 6C — real, honest reply for the Universal Semantic
        // Engine's PURCHASE_INTENT/PURCHASE_CONSIDERATION. EN/SW
        // human-authored (this file's own established discipline);
        // fr/ar/so intentionally omitted rather than guessed — the
        // default "unsupported" fallback covers those languages until
        // a real translation is added, exactly as this file already
        // does for "unsupported-clarify" above.
        "purchase-intent:not_found": Object.freeze({
            en: "I understand you're interested in purchasing CozyOS, but I don't have verified purchase or pricing information to share yet — and I can't start a purchase for you through this conversation.",
            sw: "Nimeelewa unavutiwa kununua CozyOS, lakini sina bado taarifa zilizothibitishwa za manunuzi au bei za kushiriki — na siwezi kuanzisha ununuzi kupitia mazungumzo haya."
        }),

        // UNIVERSAL HUMAN-IMPORTANCE ARCHITECTURE — cross-application
        // capability discovery replies. found(displayName, evidenceSnippet)
        // always cites the real, existing verified evidence text it
        // matched on, never a fabricated summary.
        "app-capability-search:found": Object.freeze({
            en: (name, evidence) => `${name} looks like the right fit — its verified purpose includes: "${evidence}"`,
            sw: (name, evidence) => `${name} inaonekana kuwa chaguo sahihi — madhumuni yake yaliyothibitishwa ni pamoja na: "${evidence}"`
        }),
        "app-capability-search:not_found": Object.freeze({
            en: "I couldn't find a currently registered CozyOS application with verified information matching that need.",
            sw: "Sikuweza kupata programu ya CozyOS iliyosajiliwa kwa sasa yenye taarifa zilizothibitishwa zinazolingana na uhitaji huo."
        }),

        "app-detailed-info:not_found": Object.freeze({
            en: "I don't have a currently registered CozyOS application with verified detailed information matching that name.",
            sw: "Sina programu ya CozyOS iliyosajiliwa kwa sasa yenye taarifa za kina zilizothibitishwa zinazolingana na jina hilo."
        }),

        "differentiation:verified": Object.freeze({
            en: (answer) => `${answer}`,
            sw: (answer) => `Kwa Kiingereza (bado hatuna tafsiri iliyothibitishwa ya maandishi haya kwa Kiswahili): ${answer}`,
            fr: (answer) => `En anglais (aucune traduction française vérifiée de ce texte n'existe encore) : ${answer}`,
            ar: (answer) => `بالإنجليزية (لا توجد بعد ترجمة عربية موثّقة لهذا النص): ${answer}`,
            so: (answer) => `Ingiriisi ahaan (weli ma jirto turjumaad Soomaali ah oo la xaqiijiyay oo qoraalkan ah): ${answer}`
        }),
        "differentiation:not_found": Object.freeze({
            en: "I don't have a verified answer yet for how CozyOS differs from other options.",
            sw: "Sina bado jibu lililothibitishwa kuhusu jinsi CozyOS inavyotofautiana na chaguo zingine.",
            fr: "Je n'ai pas encore de réponse vérifiée sur la façon dont CozyOS se différencie des autres options.",
            ar: "ليس لدي بعد إجابة موثّقة عن كيفية اختلاف CozyOS عن الخيارات الأخرى.",
            so: "Weli ma haysto jawaab la xaqiijiyay oo ku saabsan sida CozyOS uga duwan tahay ikhtiyaarrada kale."
        }),

        // Dynamic frame taking the fact object itself (not a plain
        // string) — see composeReply()'s "language-support-list" case.
        // Honestly keeps the static policy target list separate from
        // the live AVAILABLE/NOT_READY registry state, exactly as
        // cozy-public-knowledge-source.js's own fact reports them.
        "language-support-list:verified": Object.freeze({
            en: (fact) => {
                const target = fact.targetLanguages.join(", ");
                if (Array.isArray(fact.availableLanguages)) {
                    const available = fact.availableLanguages.join(", ") || "none";
                    const notReady = (fact.notReadyLanguages || []).join(", ") || "none";
                    return `CozyOS's owner-approved target language list is: ${target}. Right now, verified and available to answer in: ${available}. Registered but not yet verified (NOT_READY): ${notReady}. Being on the target list is a policy goal, not proof a language is live today.`;
                }
                return `CozyOS's owner-approved target language list is: ${target}. I can't see the live language-availability registry from here right now, so I can't confirm which of these are actually available today.`;
            },
            sw: (fact) => {
                const target = fact.targetLanguages.join(", ");
                if (Array.isArray(fact.availableLanguages)) {
                    const available = fact.availableLanguages.join(", ") || "hakuna";
                    const notReady = (fact.notReadyLanguages || []).join(", ") || "hakuna";
                    return `Orodha ya lugha zinazolengwa za CozyOS, iliyoidhinishwa na mmiliki, ni: ${target}. Kwa sasa, zilizothibitishwa na zinazopatikana kujibu ni: ${available}. Zilizosajiliwa lakini bado hazijathibitishwa (NOT_READY): ${notReady}. Kuwa kwenye orodha ya lengo ni lengo la sera, si uthibitisho kwamba lugha inapatikana leo.`;
                }
                return `Orodha ya lugha zinazolengwa za CozyOS, iliyoidhinishwa na mmiliki, ni: ${target}. Siwezi kuona rejista ya upatikanaji wa lugha ya moja kwa moja kutoka hapa kwa sasa, kwa hivyo siwezi kuthibitisha ni zipi kati ya hizi zinazopatikana leo.`;
            }
        }),
        "language-support-list:not_found": Object.freeze({
            en: "I don't have a verified answer yet for CozyOS's language support.",
            sw: "Sina bado jibu lililothibitishwa kuhusu usaidizi wa lugha wa CozyOS.",
            fr: "Je n'ai pas encore de réponse vérifiée sur la prise en charge des langues par CozyOS.",
            ar: "ليس لدي بعد إجابة موثّقة عن دعم CozyOS للغات.",
            so: "Weli ma haysto jawaab la xaqiijiyay oo ku saabsan taageerada luqadaha ee CozyOS."
        }),
        // Domain 4D (Intent Understanding) — translate-request. Real,
        // disclosed recognition-only replies: this never claims a
        // translation was performed. When a target language was
        // recognized in the person's own message, the reply names it
        // back so they know CozyOS understood correctly and asks for
        // the exact text; when no target language could be identified,
        // it asks for one. Neither variant fabricates translated
        // content — that remains Domain 4C's TranslationService/Gemini
        // adapter's job, once wired to a real conversation-context
        // source this file does not have.
        "translate-request:target-known": Object.freeze({
            en: (targetName) => `Got it — you'd like something translated into ${targetName}. Please send me the exact text you want translated.`,
            sw: (targetName) => `Nimeelewa — unataka kitu kitafsiriwe kwa ${targetName}. Tafadhali nitumie maandishi halisi unayotaka yatafsiriwe.`,
            fr: (targetName) => `Compris — vous souhaitez que quelque chose soit traduit en ${targetName}. Veuillez m'envoyer le texte exact à traduire.`,
            ar: (targetName) => `فهمت — تريد ترجمة شيء إلى ${targetName}. يرجى إرسال النص الدقيق الذي تريد ترجمته.`,
            so: (targetName) => `Waan fahmay — waxaad rabtaa in wax loo turjumo ${targetName}. Fadlan ii soo dir qoraalka saxda ah ee aad rabto in la turjumo.`
        }),
        "translate-request:target-unknown": Object.freeze({
            en: () => `I understood you'd like a translation, but I couldn't tell which language you want it in. Could you say, for example, "translate this to French"?`,
            sw: () => `Nimeelewa unataka tafsiri, lakini sikuweza kujua ni lugha gani unayotaka. Unaweza kusema, kwa mfano, "tafsiri hii kwa Kifaransa"?`,
            fr: () => `J'ai compris que vous souhaitez une traduction, mais je n'ai pas pu déterminer la langue cible. Pourriez-vous préciser, par exemple « traduis ceci en français » ?`,
            ar: () => `فهمت أنك تريد ترجمة، لكن لم أتمكن من معرفة اللغة المطلوبة. هل يمكنك التوضيح، على سبيل المثال "ترجم هذا إلى الفرنسية"؟`,
            so: () => `Waan fahmay inaad rabto turjumaad, laakiin ma aanan ogaan karin luqadda aad rabto. Fadlan sheeg, tusaale ahaan "tarjun kan Faransiiska"?`
        }),
        // Domain 4C dependency #1 — real translation was genuinely
        // executed by the real, existing TranslationService/
        // gemini-translate provider. This reply presents the actual,
        // real translatedText the provider returned — never a
        // fabricated string. Falls back to the honest
        // "couldn't complete" reply below if the real provider fails
        // or is unavailable (e.g. no live network/credential in this
        // environment) — that failure path is exercised, not hidden.
        "translate-request:translated": Object.freeze({
            en: (sourceText, translatedText, targetName) => `"${sourceText}" in ${targetName}: "${translatedText}"`,
            sw: (sourceText, translatedText, targetName) => `"${sourceText}" kwa ${targetName}: "${translatedText}"`,
            fr: (sourceText, translatedText, targetName) => `« ${sourceText} » en ${targetName} : « ${translatedText} »`,
            ar: (sourceText, translatedText, targetName) => `"${sourceText}" بـ ${targetName}: "${translatedText}"`,
            so: (sourceText, translatedText, targetName) => `"${sourceText}" ee ${targetName}: "${translatedText}"`
        }),
        "translate-request:provider-unavailable": Object.freeze({
            en: (reason) => `I couldn't complete that translation right now${reason ? ` (${reason})` : ""}. Please try again later.`,
            sw: (reason) => `Sikuweza kukamilisha tafsiri hiyo kwa sasa${reason ? ` (${reason})` : ""}. Tafadhali jaribu tena baadaye.`,
            fr: (reason) => `Je n'ai pas pu terminer cette traduction pour le moment${reason ? ` (${reason})` : ""}. Veuillez réessayer plus tard.`,
            ar: (reason) => `لم أتمكن من إكمال تلك الترجمة الآن${reason ? ` (${reason})` : ""}. يرجى المحاولة لاحقًا.`,
            so: (reason) => `Ma aanan dhammayn karin turjumaaddaas hadda${reason ? ` (${reason})` : ""}. Fadlan mar kale isku day.`
        }),
        // Kiswahili World Knowledge Lexicon dependency — real,
        // VERIFIED translation from the lexicon is interpolated
        // directly (never a guessed species); the "needs an image"
        // reply is an honest disclosure, not a canned deflection.
        "animal-identification:known": Object.freeze({
            en: (en, sw) => `In the CozyOS Kiswahili lexicon, "${en}" is "${sw}" in Kiswahili — is that the one you mean?`,
            sw: (en, sw) => `Katika kamusi ya CozyOS, "${en}" kwa Kiingereza ni "${sw}" kwa Kiswahili — je, ndiye huyo unayemzungumzia?`,
            fr: (en, sw) => `Dans le lexique CozyOS, « ${en} » se dit « ${sw} » en swahili — est-ce bien celui-là ?`,
            ar: (en, sw) => `في معجم CozyOS، "${en}" هي "${sw}" بالسواحيلية — هل هذا ما تقصده؟`,
            so: (en, sw) => `Qaamuuska CozyOS, "${en}" waxaa lagu yiraahdaa "${sw}" af-Swaxili — ma kani baa?`
        }),
        "animal-identification:needs-image": Object.freeze({
            en: () => `I can't identify an animal without seeing an image of it yet — CozyOS's Video Assist can help with that when you're ready to show me a photo.`,
            sw: () => `Siwezi kutambua mnyama bila kuona picha yake bado — Video Assist ya CozyOS inaweza kusaidia ukiwa tayari kunionyesha picha.`,
            fr: () => `Je ne peux pas encore identifier un animal sans voir une image — Video Assist de CozyOS peut aider quand vous êtes prêt à me montrer une photo.`,
            ar: () => `لا يمكنني التعرف على حيوان دون رؤية صورة له بعد — يمكن أن يساعد Video Assist في CozyOS عندما تكون مستعدًا لعرض صورة.`,
            so: () => `Weli ma aan aqoonsan karo xayawaan aan sawir arag — Video Assist ee CozyOS ayaa caawin kara marka aad diyaar u tahay inaad i tusto sawir.`
        }),
        "price-inquiry:no-source": Object.freeze({
            en: () => `I don't have pricing information for that here — the specific application you're using (like a shop or business listing) would have the real price.`,
            sw: () => `Sina taarifa za bei hapa — programu husika unayotumia (kama duka au orodha ya biashara) ndiyo yenye bei halisi.`,
            fr: () => `Je n'ai pas d'informations sur le prix ici — l'application spécifique que vous utilisez (comme une boutique) aurait le vrai prix.`,
            ar: () => `ليس لدي معلومات عن السعر هنا — التطبيق المحدد الذي تستخدمه (مثل متجر) سيكون لديه السعر الحقيقي.`,
            so: () => `Halkan ma haysto macluumaad qiimo ah — barnaamijka gaarka ah ee aad isticmaalayso (sida dukaan) ayaa haysan qiimaha dhabta ah.`
        }),
        "object-identification:needs-context": Object.freeze({
            en: () => `I'd need to see or know more about it to tell you what it is — can you describe it or show me an image?`,
            sw: () => `Ningehitaji kuona au kujua zaidi kukueleza ni nini — unaweza kunieleza zaidi au kunionyesha picha?`,
            fr: () => `J'aurais besoin d'en voir ou d'en savoir plus pour vous dire ce que c'est — pouvez-vous le décrire ou me montrer une image ?`,
            ar: () => `سأحتاج إلى رؤية أو معرفة المزيد لأخبرك ما هو — هل يمكنك وصفه أو عرض صورة؟`,
            so: () => `Waxaan u baahnahay inaan arko ama wax badan ka ogaado si aan kuu sheego waxa ay tahay — ma sharixi kartaa ama sawir i tusi kartaa?`
        }),
        // getApplicationFact() dependency — real, VERIFIED registry
        // data is interpolated directly. Never claims a feature/
        // capability the registry record does not carry.
        "app-info:known": Object.freeze({
            en: (name, category, enabled) => `${name} is a registered CozyOS application${category ? ` in the ${category} category` : ""}. It is currently ${enabled === false ? "disabled" : "enabled"}.`,
            sw: (name, category, enabled) => `${name} ni programu iliyosajiliwa katika CozyOS${category ? ` katika kategoria ya ${category}` : ""}. Kwa sasa ${enabled === false ? "haijawezeshwa" : "imewezeshwa"}.`,
            fr: (name, category, enabled) => `${name} est une application CozyOS enregistrée${category ? ` dans la catégorie ${category}` : ""}. Elle est actuellement ${enabled === false ? "désactivée" : "activée"}.`,
            ar: (name, category, enabled) => `${name} هو تطبيق CozyOS مسجّل${category ? ` في فئة ${category}` : ""}. وهو حاليًا ${enabled === false ? "معطّل" : "مفعّل"}.`,
            so: (name, category, enabled) => `${name} waa barnaamij CozyOS oo diiwaan gashan${category ? ` ee qaybta ${category}` : ""}. Waxa uu hadda yahay ${enabled === false ? "mid la damiyay" : "mid shaqeynaya"}.`
        }),
        "app-info:not-found": Object.freeze({
            en: (candidate) => `I don't have any registered application called "${candidate}" — could you check the name?`,
            sw: (candidate) => `Sina programu iliyosajiliwa inayoitwa "${candidate}" — unaweza kuangalia jina tena?`,
            fr: (candidate) => `Je n'ai aucune application enregistrée appelée « ${candidate} » — pouvez-vous vérifier le nom ?`,
            ar: (candidate) => `ليس لدي أي تطبيق مسجّل باسم "${candidate}" — هل يمكنك التحقق من الاسم؟`,
            so: (candidate) => `Ma haysto barnaamij diiwaan gashan oo la yiraahdo "${candidate}" — ma hubin kartaa magaca?`
        }),
        // ChurchOS human-purpose dependency — the reply explicitly
        // separates CURRENT VERIFIED capabilities from VISION/
        // DESTINATION capabilities, and honestly discloses the missing
        // CHURCHOS_ENGINE_AUDIT.md reference. Every list item comes
        // directly from the real, committed purpose record — never
        // invented at template time.
        "app-importance:known": Object.freeze({
            en: (name, p) => `${name} matters because: ${p.humanPurpose}\n\nReal-life problems it addresses: ${p.realLifeProblems.join(", ")}.\n\nWho benefits: ${p.whoBenefits.join(", ")}.\n\nIntended human benefits: ${p.humanBenefits.join(", ")}.\n\nCURRENTLY VERIFIED (implemented and tested today): ${p.currentVerifiedCapabilities.join("; ")}.\n\nVISION / DESTINATION (not yet implemented): ${p.visionCapabilities.join("; ")}.\n\n${p.visionSourceNote}`,
            sw: (name, p) => `${name} ni muhimu kwa sababu: ${p.humanPurpose}\n\nMatatizo ya kweli ya maisha inayoshughulikia: ${p.realLifeProblems.join(", ")}.\n\nWanaonufaika: ${p.whoBenefits.join(", ")}.\n\nManufaa yaliyokusudiwa kwa binadamu: ${p.humanBenefits.join(", ")}.\n\nZILIZOTHIBITISHWA SASA (zimejengwa na kujaribiwa leo): ${p.currentVerifiedCapabilities.join("; ")}.\n\nDIRA / MWELEKEO WA BAADAYE (bado hazijajengwa): ${p.visionCapabilities.join("; ")}.\n\n${p.visionSourceNote}`,
            fr: (name, p) => `${name} est important car : ${p.humanPurpose}\n\nProblèmes réels traités : ${p.realLifeProblems.join(", ")}.\n\nBénéficiaires : ${p.whoBenefits.join(", ")}.\n\nBénéfices humains visés : ${p.humanBenefits.join(", ")}.\n\nACTUELLEMENT VÉRIFIÉ : ${p.currentVerifiedCapabilities.join("; ")}.\n\nVISION / DESTINATION (pas encore implémenté) : ${p.visionCapabilities.join("; ")}.\n\n${p.visionSourceNote}`,
            ar: (name, p) => `${name} مهم لأن: ${p.humanPurpose}\n\nالمشاكل الواقعية التي يعالجها: ${p.realLifeProblems.join("، ")}.\n\nالمستفيدون: ${p.whoBenefits.join("، ")}.\n\nالفوائد الإنسانية المقصودة: ${p.humanBenefits.join("، ")}.\n\nموثّق حاليًا: ${p.currentVerifiedCapabilities.join("؛ ")}.\n\nالرؤية / الوجهة (لم تُنفَّذ بعد): ${p.visionCapabilities.join("؛ ")}.\n\n${p.visionSourceNote}`,
            so: (name, p) => `${name} muhiim ayuu u yahay sababtoo ah: ${p.humanPurpose}\n\nDhibaatooyinka dhabta ah ee uu wax ka qabanayo: ${p.realLifeProblems.join(", ")}.\n\nKuwa faa'iidaysta: ${p.whoBenefits.join(", ")}.\n\nFaa'iidooyinka bini'aadamka loogu talagalay: ${p.humanBenefits.join(", ")}.\n\nHADDA LA XAQIIJIYAY: ${p.currentVerifiedCapabilities.join("; ")}.\n\nARIMAHA MUSTAQBALKA (weli lama dhisin): ${p.visionCapabilities.join("; ")}.\n\n${p.visionSourceNote}`
        }),
        "app-importance:not-found": Object.freeze({
            en: (candidate) => `I don't have human-purpose information registered for ${candidate ? `"${candidate}"` : "that application"} yet.`,
            sw: (candidate) => `Sina taarifa za umuhimu wa kibinadamu zilizosajiliwa kwa ${candidate ? `"${candidate}"` : "programu hiyo"} bado.`,
            fr: (candidate) => `Je n'ai pas encore d'informations sur l'importance humaine enregistrées pour ${candidate ? `« ${candidate} »` : "cette application"}.`,
            ar: (candidate) => `ليس لدي بعد معلومات عن الأهمية الإنسانية مسجّلة لـ ${candidate ? `"${candidate}"` : "هذا التطبيق"}.`,
            so: (candidate) => `Weli ma haysto macluumaad ku saabsan muhiimadda bini'aadamka ee ${candidate ? `"${candidate}"` : "barnaamijkaas"}.`
        }),
        // Natural Human Record Capture dependency — real, honest
        // clarification/confirmation/failure templates. "created"
        // interpolates only the real, returned member record; never
        // fabricates a memberId.
        "record-church-member:needs-name": Object.freeze({
            en: () => `Who would you like to add as a member? Please tell me their name.`,
            sw: () => `Ungependa kumwongeza nani kama mwanachama? Tafadhali niambie jina lake.`,
            fr: () => `Qui souhaitez-vous ajouter comme membre ? Merci de me donner son nom.`,
            ar: () => `من الذي تريد إضافته كعضو؟ يرجى إخباري باسمه.`,
            so: () => `Yaad rabtaa inaad ku darto xubin ahaan? Fadlan ii sheeg magiciisa.`
        }),
        "record-church-member:needs-org": Object.freeze({
            en: (name) => `Which church or organization should I add ${name} to?`,
            sw: (name) => `Ni kanisa au shirika gani ninafaa kumwongeza ${name}?`,
            fr: (name) => `À quelle église ou organisation dois-je ajouter ${name} ?`,
            ar: (name) => `إلى أي كنيسة أو منظمة يجب أن أضيف ${name}؟`,
            so: (name) => `Kaniisadee ama urur kee ayaan ku daraa ${name}?`
        }),
        // Current-organization-context resolver dependency — used only
        // when a real, active session genuinely belongs to more than
        // one organization; never picks one, always asks.
        "record-church-member:needs-org-choice": Object.freeze({
            en: (name, orgIds) => `You belong to more than one organization (${orgIds.join(", ")}). Which one should I add ${name} to?`,
            sw: (name, orgIds) => `Wewe ni mwanachama wa mashirika zaidi ya moja (${orgIds.join(", ")}). Ni lipi ninafaa kumwongeza ${name}?`,
            fr: (name, orgIds) => `Vous appartenez à plusieurs organisations (${orgIds.join(", ")}). À laquelle dois-je ajouter ${name} ?`,
            ar: (name, orgIds) => `أنت تنتمي إلى أكثر من منظمة (${orgIds.join("، ")}). إلى أيها يجب أن أضيف ${name}؟`,
            so: (name, orgIds) => `Waxaad xubin ka tahay in ka badan hal urur (${orgIds.join(", ")}). Kee ayaan ku daraa ${name}?`
        }),
        "record-church-member:unavailable": Object.freeze({
            en: () => `ChurchOS isn't available right now, so I can't add that member.`,
            sw: () => `ChurchOS haipatikani kwa sasa, kwa hivyo sikuweza kumwongeza mwanachama huyo.`,
            fr: () => `ChurchOS n'est pas disponible pour le moment, je ne peux donc pas ajouter ce membre.`,
            ar: () => `ChurchOS غير متاح حاليًا، لذا لا يمكنني إضافة هذا العضو.`,
            so: () => `ChurchOS hadda lama heli karo, sidaas darteed ma dari karo xubintaas.`
        }),
        "record-church-member:created": Object.freeze({
            en: (firstName, lastName, memberId) => `Added ${firstName}${lastName ? ` ${lastName}` : ""} as a member (record ${memberId}).`,
            sw: (firstName, lastName, memberId) => `Nimemwongeza ${firstName}${lastName ? ` ${lastName}` : ""} kama mwanachama (rekodi ${memberId}).`,
            fr: (firstName, lastName, memberId) => `${firstName}${lastName ? ` ${lastName}` : ""} a été ajouté comme membre (enregistrement ${memberId}).`,
            ar: (firstName, lastName, memberId) => `تمت إضافة ${firstName}${lastName ? ` ${lastName}` : ""} كعضو (سجل ${memberId}).`,
            so: (firstName, lastName, memberId) => `${firstName}${lastName ? ` ${lastName}` : ""} waxaa loo daray xubin ahaan (diiwaanka ${memberId}).`
        }),
        "record-church-member:failed": Object.freeze({
            en: (reason) => `I couldn't add that member (${reason}).`,
            sw: (reason) => `Sikuweza kumwongeza mwanachama huyo (${reason}).`,
            fr: (reason) => `Je n'ai pas pu ajouter ce membre (${reason}).`,
            ar: (reason) => `لم أتمكن من إضافة هذا العضو (${reason}).`,
            so: (reason) => `Ma dari karin xubintaas (${reason}).`
        }),
        // Domain 4I dependency #1 — app-launch. Real, disclosed
        // recognition-only replies: NEVER claims the application was
        // opened (that requires a separate, real authorization +
        // action-execution step this classifier does not perform).
        "app-launch:resolved": Object.freeze({
            en: (name) => `I found an application called "${name}". Opening it still requires your authorization to be checked — I haven't opened it yet.`,
            sw: (name) => `Nimepata programu inayoitwa "${name}". Kuifungua bado kunahitaji ruhusa yako ithibitishwe — sijaifungua bado.`,
            fr: (name) => `J'ai trouvé une application appelée « ${name} ». L'ouvrir nécessite encore que votre autorisation soit vérifiée — je ne l'ai pas encore ouverte.`,
            ar: (name) => `وجدت تطبيقًا يسمى "${name}". فتحه لا يزال يتطلب التحقق من إذنك — لم أفتحه بعد.`,
            so: (name) => `Waxaan helay barnaamij loo yaqaan "${name}". Furitaankeedu weli wuxuu u baahan yahay in la hubiyo idanka — weli ma furin.`
        }),
        "app-launch:unresolved": Object.freeze({
            en: (candidate) => candidate ? `I couldn't find an application matching "${candidate}". Could you tell me the exact application name?` : `I couldn't find an application matching what you asked for. Could you tell me the exact application name?`,
            sw: (candidate) => candidate ? `Sikuweza kupata programu inayolingana na "${candidate}". Unaweza kuniambia jina kamili la programu?` : `Sikuweza kupata programu unayotaka. Unaweza kuniambia jina kamili la programu?`,
            fr: (candidate) => candidate ? `Je n'ai pas trouvé d'application correspondant à « ${candidate} ». Pourriez-vous me donner le nom exact de l'application ?` : `Je n'ai pas trouvé l'application demandée. Pourriez-vous me donner le nom exact ?`,
            ar: (candidate) => candidate ? `لم أجد تطبيقًا مطابقًا لـ "${candidate}". هل يمكنك إخباري بالاسم الدقيق للتطبيق؟` : `لم أجد التطبيق المطلوب. هل يمكنك إخباري بالاسم الدقيق؟`,
            so: (candidate) => candidate ? `Ma helin barnaamij la mid ah "${candidate}". Ma ii sheegi kartaa magaca saxda ah ee barnaamijka?` : `Ma helin barnaamijka aad rabto. Ma ii sheegi kartaa magaca saxda ah?`
        }),
        // Domain 4I dependency #2 (Authorization/Execution Boundary) —
        // real, disclosed authorization-outcome replies. NONE of these
        // ever claim the application was actually opened — that remains
        // a separate real navigation/action step this provider never
        // performs, exactly like the resolved-but-unauthorized template
        // above already established.
        "app-launch:authorization_required": Object.freeze({
            en: () => `I found that application, but you'll need to be signed in before I can check whether you're allowed to open it.`,
            sw: () => `Nimepata programu hiyo, lakini unahitaji kuingia kwanza ili niweze kuangalia kama una ruhusa ya kuifungua.`,
            fr: () => `J'ai trouvé cette application, mais vous devez être connecté avant que je puisse vérifier si vous êtes autorisé à l'ouvrir.`,
            ar: () => `وجدت ذلك التطبيق، لكن يجب عليك تسجيل الدخول أولاً حتى أتمكن من التحقق مما إذا كان يُسمح لك بفتحه.`,
            so: () => `Waan helay barnaamijkaas, laakiin waa inaad gasho ka hor intaanan hubin haddii lagu ogolyahay inaad furto.`
        }),
        "app-launch:authorization_granted": Object.freeze({
            en: (name) => `I found "${name}" and you're authorized to use it. I haven't opened it myself — that's a separate step.`,
            sw: (name) => `Nimepata "${name}" na una ruhusa ya kuitumia. Sijaifungua mwenyewe — hilo ni hatua nyingine.`,
            fr: (name) => `J'ai trouvé « ${name} » et vous êtes autorisé à l'utiliser. Je ne l'ai pas ouverte moi-même — c'est une étape séparée.`,
            ar: (name) => `وجدت "${name}" وأنت مصرح لك باستخدامه. لم أفتحه بنفسي — تلك خطوة منفصلة.`,
            so: (name) => `Waxaan helay "${name}" waana lagu ogolyahay inaad isticmaasho. Aniga qudhayda ma furin — taasi waa tallaabo kale.`
        }),
        "app-launch:authorization_denied": Object.freeze({
            en: (name) => `I found "${name}", but your account doesn't currently have access to it.`,
            sw: (name) => `Nimepata "${name}", lakini akaunti yako haina ruhusa ya kuitumia kwa sasa.`,
            fr: (name) => `J'ai trouvé « ${name} », mais votre compte n'y a actuellement pas accès.`,
            ar: (name) => `وجدت "${name}"، لكن حسابك ليس لديه حاليًا إمكانية الوصول إليه.`,
            so: (name) => `Waxaan helay "${name}", laakiin xisaabtaadu weli ma haysato fasax aad ku isticmaasho.`
        })
    });

    // RP-027 §12 — shown, in the resolved (AVAILABLE) language, whenever
    // the person's actually-requested language isn't AVAILABLE yet.
    const FALLBACK_DISCLOSURE = Object.freeze({
        en: (requestedName, resolvedName) => `I don't yet have verified ${requestedName} responses for this. I can answer in ${resolvedName} instead.`,
        sw: (requestedName, resolvedName) => `Bado sina majibu yaliyothibitishwa ya ${requestedName} kwa hili. Naweza kujibu kwa ${resolvedName} badala yake.`,
        fr: (requestedName, resolvedName) => `Je n'ai pas encore de réponses vérifiées en ${requestedName} pour cela. Je peux répondre en ${resolvedName} à la place.`,
        ar: (requestedName, resolvedName) => `ليس لدي بعد ردود موثّقة باللغة ${requestedName} لهذا. يمكنني الرد باللغة ${resolvedName} بدلًا من ذلك.`,
        so: (requestedName, resolvedName) => `Wali ma haysto jawaabo la xaqiijiyay oo ${requestedName} ah taas. Waxaan kuu jawaabi karaa ${resolvedName} halkeeda.`
    });

    function getTemplate(key, lang) {
        const entry = TEMPLATES[key];
        if (!entry) return null;
        return entry[lang] || entry.en || null;
    }

    window.CozyOS.CozyLanguageTemplates = Object.freeze({
        getVersion() { return VERSION; },
        LANGS,
        TEMPLATES,
        FALLBACK_DISCLOSURE,
        getTemplate
    });

    window.CozyOS.Modules["cozy-language-templates"] = Object.freeze({
        version: VERSION,
        description: "RP-027 + COZYAI-PUBLIC-VISION-KNOWLEDGE + REGISTRATION/AUTH — Verified response templates for the 5 default CozyOS languages (en/sw/fr/ar/so), covering RP-026's original 7 intents, RP-027's CozyOS-identity/apps/authentication/account/provider/architecture intents, COZYAI-PUBLIC-VISION-KNOWLEDGE's why-use-cozyos/differentiation/language-support-list, and (this repair) registration. Fixed-text intents map directly to a per-language string; evidence-backed intents (founder, list-apps, list-providers, why-use-cozyos, differentiation, language-support-list, how-to-register) map to a fixed per-language sentence FRAME that only interpolates live/committed repository data, never generates new language at runtime. The why-use/differentiation/language-support-list frames' interpolated content is English-authored only this pass (an honest, disclosed limitation, not a translation) — the lead-in sentence around it is still per-language; fr/ar/so fall back to the English frame via getTemplate()'s entry[lang]||entry.en behavior. how-to-register:verified is the one exception with a genuine, fully committed Kiswahili translation (stepsSw, passwordSw) alongside English, per this milestone's Kiswahili-first requirement — fr/ar/so still honestly fall back to English for it, since no verified fr/ar/so translation of these specific steps exists yet. No extended-language (luo/ki/kam/zu/lg/ig) entries exist here yet — an honest, disclosed gap, not an omission."
    });
})();
