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

    const VERSION = "1.0.0";
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
        "unsupported": Object.freeze({
            en: "I don't have a rule-based answer for that yet — right now my conversational understanding only covers greetings, help requests, thanks, and a set of disclosed questions about CozyOS itself. That's a real, disclosed limit, not an error.",
            sw: "Bado sina jibu la kanuni (rule-based) kwa hilo — kwa sasa uelewa wangu wa mazungumzo unahusisha tu salamu, maombi ya msaada, shukrani, na seti ya maswali yaliyowekwa wazi kuhusu CozyOS yenyewe. Hii ni kikomo halisi, kilichowekwa wazi, si hitilafu.",
            fr: "Je n'ai pas encore de réponse basée sur des règles pour cela — pour l'instant, ma compréhension conversationnelle couvre uniquement les salutations, les demandes d'aide, les remerciements, et un ensemble de questions déclarées sur CozyOS lui-même. C'est une limite réelle et déclarée, pas une erreur.",
            ar: "ليس لدي بعد إجابة قائمة على القواعد لذلك — حاليًا فهمي الحواري يغطي فقط التحيات، وطلبات المساعدة، والشكر، ومجموعة من الأسئلة المُعلنة حول CozyOS نفسه. هذا حد حقيقي ومُعلن، وليس خطأً.",
            so: "Wali ma haysto jawaab ku salaysan xeerar taas — hadda fahamkayga wadahadalka wuxuu koobayaa oo kaliya salaanta, codsiyada caawimada, mahadnaqa, iyo su'aalo la sheegay oo ku saabsan CozyOS lafteeda. Taasi waa xad dhab ah oo la sheegay, mana aha khalad."
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

        "how-to-register": Object.freeze({
            en: "To register on CozyOS, you'd normally go through the platform's registration flow, which collects the basic identity details CozyOS needs and then walks you through activation and verification steps (such as phone verification) before the account becomes fully ACTIVE.",
            sw: "Ili kujisajili kwenye CozyOS, kwa kawaida utapitia mchakato wa usajili wa jukwaa, unaokusanya taarifa za msingi za utambulisho anazohitaji CozyOS kisha unakuongoza kupitia hatua za uamilishaji na uthibitishaji (kama uthibitishaji wa simu) kabla akaunti kuwa ACTIVE kikamilifu.",
            fr: "Pour vous inscrire sur CozyOS, vous passez normalement par le parcours d'inscription de la plateforme, qui recueille les informations d'identité de base dont CozyOS a besoin, puis vous guide à travers les étapes d'activation et de vérification (comme la vérification du téléphone) avant que le compte ne devienne pleinement ACTIVE.",
            ar: "للتسجيل في CozyOS، عادةً ما تمر بمسار التسجيل الخاص بالمنصة، الذي يجمع تفاصيل الهوية الأساسية التي يحتاجها CozyOS، ثم يرشدك عبر خطوات التفعيل والتحقق (مثل التحقق من الهاتف) قبل أن يصبح الحساب ACTIVE بالكامل.",
            so: "Si aad ugu diiwaangashato CozyOS, caadi ahaan waxaad marayaa habka diiwaangelinta ee madasha, kaas oo ururiya macluumaadka aasaasiga ah ee aqoonsiga ee CozyOS u baahan yahay, ka dibna kugu hagaya tallaabooyinka kulmiska iyo xaqiijinta (sida xaqiijinta taleefanka) ka hor inta akoonku uu noqon ACTIVE si buuxda."
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
        description: "RP-027 — Verified response templates for the 5 default CozyOS languages (en/sw/fr/ar/so), covering RP-026's original 7 intents plus RP-027's new CozyOS-identity/apps/registration/authentication/account/provider/architecture intents. Fixed-text intents map directly to a per-language string; evidence-backed intents (founder, list-apps, list-providers) map to a fixed per-language sentence FRAME that only interpolates live repository/runtime data, never generates new language at runtime. No extended-language (luo/ki/kam/zu/lg/ig) entries exist here yet — an honest, disclosed gap, not an omission."
    });
})();
