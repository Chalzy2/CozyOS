/**
 * CozyOS — Founder Story Seed (initial content)
 * File Reference: core/modules/founder-story/founder-story-seed.js
 * Layer: Core / Platform Module — Bootstrap Data
 * Version: 1.0.0-ENTERPRISE
 * Milestone: 361 — Founder Story Vault (Foundation), Stage 1
 *
 * WHAT THIS FILE IS
 *   The Founder's real autobiography, Part 1 — not placeholder or demo
 *   data. This file does not implement any storage or encryption of its
 *   own: it calls window.CozyOS.FounderStory.createStory()/addChapter(),
 *   the same real, public API any other caller would use. Encryption
 *   (Vault, AES-GCM), the audit trail, and fail-closed visibility all
 *   come from founder-story-engine.js — this file only supplies content.
 *
 *   Content revision history: v1.0.0 shipped English/Kiswahili/French.
 *   v1.1.0 replaced that text with the Founder's revised draft (added
 *   the passage on his mother's passing, light wording edits for flow)
 *   and added Arabic — supplied directly by the Founder as a
 *   native-quality version, not a literal machine translation, so the
 *   original "add Arabic later after native-quality review" note no
 *   longer applies; this is that review.
 *
 * WHY THIS RUNS ON EVERY LOAD, NOT ONCE
 *   founder-story-engine.js is an honest, disclosed in-memory reference
 *   store (same "not durable across reload" precedent already
 *   established for the Vault/Document Storage Provider elsewhere in
 *   this codebase). There is no persistent database in this milestone.
 *   So this seed re-creates the Founder's story on each session
 *   bootstrap, idempotently (seedIfMissing() below checks first) —
 *   this is a disclosed limitation, not a hidden one, and it means the
 *   real encrypt/decrypt/audit code paths run for real every time,
 *   rather than shipping a static pre-encrypted blob that would go
 *   stale the moment the Vault's in-memory key rotates.
 *
 * OWNERSHIP OF THE FOUNDER IDENTITY USED HERE
 *   core/identity/developer-profile.js already declares the real
 *   Founder (Charles Owuor / "Chalz Cozy", Founder of CozyOS, Kenya) as
 *   window.CozyOS.DeveloperIdentity — but that module is explicitly
 *   scoped to the *public* profile only, and documents itself as
 *   unrelated to user/session identity (CozyIdentity). No
 *   IdentityEngine-issued userId exists yet for a not-yet-logged-in
 *   Founder, so this file uses a stable, readable constant
 *   (FOUNDER_OWNER_ID below) rather than fabricating one. When the
 *   Founder's real login identity exists, transferring ownership is a
 *   one-line change (re-run createStory under the real userId, or add
 *   a transferOwnership() method) — not a redesign. Not addressed in
 *   this milestone; noted honestly rather than guessed at.
 *
 * SCOPE
 *   Chapter 1 only ("My Story — Part 1"), covering the content
 *   provided for this milestone. Default visibility is 🔒 Only Me
 *   (the engine's own default — never overridden here). Status is
 *   "draft". Nothing here publishes, exports, or exposes this content
 *   publicly. Future parts arrive as additional addChapter() calls in
 *   later milestones — this file changes only by appending a new
 *   seedChapterN() call, never by editing Chapter 1's stored content.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const MODULE_VERSION = "1.1.0";

    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["founder-story-seed"] && window.CozyOS.Modules["founder-story-seed"].version) return;

    const FOUNDER_OWNER_ID = "founder-charles-owuor"; // see OWNERSHIP note above — not an IdentityEngine session userId

    // Chapter 1 content — preserved exactly as provided by the Founder.
    // Each language is the SAME story, not a separate one; all three
    // live inside this one chapter, under the one Founder Story.
    const CHAPTER_1 = Object.freeze({

        en: Object.freeze({
            heading: "English – My Story (Part 1)",
            text:
"I was born and raised in a family that lived in extreme poverty. Life was difficult from the very beginning.\n" +
"When I was only 12 years old, I became my mother's helper. Every day we sold charcoal together because that was the only way we could put food on the table for our family. As the third-born child, my mother chose me to stand beside her in that struggle.\n" +
"When I was twelve years old, my life changed forever. In 2004, my beloved mother, Jane Achieng, passed away. During her final days, I remember hearing her pray for our family every night. Those prayers left a mark on my heart that time can never erase. They became one of the first reasons I truly believed that God is real.\n" +
"When she died, I felt completely alone. I almost gave in to bitterness and questioned everything, but I realized that life had to move forward. My mother was gone forever, and I had already grown up without truly knowing my father. After her death, my stepmother became the person responsible for raising us, but the care and love I longed for never fully came. Even today, the memory of my mother's prayers continues to strengthen my faith and reminds me never to lose hope.\n" +
"I never truly knew my father. He left when I was only six months old. I have been told who he was, but I never had the chance to know him. Even today, at the age of 28, I still do not know where he is.\n" +
"Growing up with a stepmother brought many hardships into my life. Those painful experiences did not destroy me—they made me stronger. They taught me to fight for my future and never depend on circumstances.\n" +
"Despite many challenges, I completed both primary and secondary school. There were times when I missed several weeks of classes because we could not afford school fees. Many people thought my education would end there, but God remained faithful. Through His grace, I completed my studies. After finishing high school, I continued my education with the support of a bursary.\n" +
"After school, I met someone who taught me the art of selling. That opportunity became the foundation of my entrepreneurial journey. I started selling products from door to door and from office to office.\n" +
"The journey was never easy.\n" +
"One day, while selling products to staff members in the Kenyan Parliament, I was arrested and taken to the police cells inside Parliament because hawking was not allowed there. It was one of the lowest moments of my life.\n" +
"But even inside the cell, I refused to lose hope.\n" +
"I began praying and singing to God. Eventually, one police officer was moved by what he saw. After contacting my employer, they decided to release me.\n" +
"That experience strengthened my faith even more.\n" +
"After that, I focused on selling in areas where hawking was permitted. I kept walking from one place to another, meeting different people every day.\n" +
"During those journeys, I noticed something important.\n" +
"People were wasting a lot of time because they relied on slow, outdated ways of working and communicating.\n" +
"At the same time, I saw my pastor and my mother facing language barriers in ministry. They struggled to reach people who spoke different languages.\n" +
"That challenge planted a vision in my heart.\n" +
"I believed that God had a purpose for my life.\n" +
"I began dreaming of creating technology that could remove language barriers, save time, and make communication easier for everyone.\n" +
"That dream eventually became the beginning of CozyOS.\n" +
"Today, I continue designing, learning, and building that vision.\n" +
"I believe that when this work is complete, it will not only transform lives in Kenya but will also benefit millions of people across Africa and, one day, the entire world.\n" +
"To be continued..."
        }),
        sw: Object.freeze({
            heading: "Kiswahili – Hadithi Yangu (Sehemu ya 1)",
            text:
"Nilizaliwa na kukulia katika familia iliyokuwa ikiishi katika umaskini mkubwa. Maisha yalikuwa magumu tangu mwanzo.\n" +
"Nilipokuwa na umri wa miaka 12, nilianza kumsaidia mama yangu kuuza makaa. Hiyo ndiyo ilikuwa njia pekee ya kupata chakula cha familia yetu kila siku. Kwa kuwa nilikuwa mtoto wa tatu katika familia, mama alinichagua kuwa msaidizi wake katika mapambano hayo.\n" +
"Nilipokuwa na miaka kumi na miwili, maisha yangu yalibadilika kabisa. Mwaka 2004, mama yangu mpendwa, Jane Achieng, alifariki dunia. Katika siku zake za mwisho, nakumbuka nikimsikia akiombea familia yetu kila usiku. Maombi hayo yaliacha alama moyoni mwangu ambayo haitafutika kamwe. Ndiyo yaliyokuwa sababu mojawapo ya kwanza iliyonifanya kuamini kwa dhati kwamba Mungu yupo. Alipofariki, nilihisi nimebaki peke yangu duniani. Karibu nikate tamaa na kuhoji kila kitu, lakini nikagundua kwamba maisha yalipaswa kuendelea. Mama alikuwa ameondoka milele, na nilikuwa tayari nimekua bila kumjua baba yangu. Baada ya kifo chake, mama wa kambo alibeba jukumu la kutulea, lakini upendo na malezi niliyoyatamani sikuyapata kikamilifu. Hata leo, kumbukumbu ya maombi ya mama yangu inaendelea kuimarisha imani yangu na kunikumbusha kutokata tamaa.\n" +
"Sikumjua baba yangu. Nilikuwa na miezi sita tu alipotuacha. Nimekuwa nikisimuliwa kuhusu yeye, lakini sikuwahi kupata nafasi ya kumfahamu. Hata leo, nikiwa na miaka 28, bado sijui alipo.\n" +
"Kukua na mama wa kambo kulinifanya nipitie changamoto nyingi. Badala ya kunivunja moyo, changamoto hizo zilinifanya kuwa imara na kunifundisha kupigania maisha yangu bila kutegemea mazingira.\n" +
"Licha ya matatizo mengi, nilimaliza elimu ya msingi na sekondari. Mara nyingi nilikosa masomo kwa wiki kadhaa kutokana na ukosefu wa ada. Watu wengi walidhani elimu yangu ingeishia hapo, lakini Mungu alibaki mwaminifu. Kwa neema yake nilifaulu kumaliza masomo yangu, na baada ya shule ya sekondari nilipata ufadhili kupitia bursary.\n" +
"Baada ya shule nilikutana na mtu aliyenifundisha sanaa ya kuuza bidhaa. Hapo ndipo safari yangu ya ujasiriamali ilipoanza. Nilianza kuuza bidhaa nyumba kwa nyumba na ofisi kwa ofisi.\n" +
"Safari haikuwa rahisi.\n" +
"Siku moja nilikamatwa nilipokuwa nikiuza bidhaa kwa wafanyakazi wa Bunge la Kenya. Polisi walinifunga katika selo za Bunge kwa sababu biashara hiyo haikuruhusiwa.\n" +
"Lakini hata nikiwa gerezani sikukata tamaa.\n" +
"Nilianza kuomba na kuimba nyimbo za kumsifu Mungu. Baadaye askari mmoja aliguswa na hali yangu. Baada ya kuwasiliana na mwajiri wangu, waliniachia huru.\n" +
"Tangu siku hiyo imani yangu kwa Mungu iliongezeka zaidi.\n" +
"Niliendelea kuuza bidhaa katika maeneo ambayo wafanyabiashara waliruhusiwa kufanya kazi. Nilitembea sehemu nyingi na kukutana na watu wa aina mbalimbali.\n" +
"Ndipo niligundua jambo moja muhimu.\n" +
"Watu wengi walikuwa wanapoteza muda kwa kutumia njia za zamani katika mawasiliano na kazi.\n" +
"Wakati huo huo niliona mchungaji wangu pamoja na mama yangu wakikumbana na changamoto za lugha katika huduma yao. Walikuwa wakipata ugumu kuwafikia watu waliozungumza lugha tofauti.\n" +
"Changamoto hiyo ilinipa maono.\n" +
"Niliamini Mungu alikuwa na kusudi maalumu kwa maisha yangu.\n" +
"Nikaanza kuota ndoto ya kutengeneza teknolojia ambayo ingeondoa vikwazo vya lugha, kuokoa muda na kurahisisha mawasiliano kwa kila mtu.\n" +
"Ndiyo mwanzo wa wazo la CozyOS.\n" +
"Leo bado ninaendelea kubuni, kujifunza na kujenga ndoto hiyo.\n" +
"Ninaamini kuwa ikikamilika, haitawanufaisha Wakenya pekee bali Waafrika wote, na siku moja dunia nzima.\n" +
"Itaendelea..."
        }),
        fr: Object.freeze({
            heading: "Français – Mon Histoire (Partie 1)",
            text:
"Je suis né et j'ai grandi dans une famille vivant dans une pauvreté extrême. La vie était très difficile dès le début.\n" +
"À l'âge de douze ans, je suis devenu l'assistant de ma mère. Chaque jour, nous vendions du charbon de bois afin de pouvoir nourrir notre famille. En tant que troisième enfant, ma mère m'a choisi pour l'aider dans ce combat quotidien.\n" +
"Lorsque j'avais douze ans, ma vie a changé pour toujours. En 2004, ma mère bien-aimée, Jane Achieng, est décédée. Pendant ses derniers jours, je me souviens de l'entendre prier chaque soir pour notre famille. Ces prières ont laissé une empreinte dans mon cœur qui ne s'effacera jamais. Elles ont été l'une des premières raisons qui m'ont convaincu que Dieu existe réellement. À sa mort, je me suis senti totalement seul. J'ai failli sombrer dans l'amertume et remettre toute chose en question, mais j'ai compris que la vie devait continuer. Ma mère était partie pour toujours, et j'avais déjà grandi sans vraiment connaître mon père. Après son décès, ma belle-mère est devenue responsable de notre éducation, mais je n'ai jamais reçu tout l'amour et l'affection dont j'avais besoin. Aujourd'hui encore, le souvenir des prières de ma mère fortifie ma foi et me rappelle de ne jamais perdre espoir.\n" +
"Je n'ai jamais vraiment connu mon père. Il est parti lorsque je n'avais que six mois. On m'a parlé de lui, mais je n'ai jamais eu la chance de le connaître. Aujourd'hui encore, à l'âge de 28 ans, je ne sais pas où il se trouve.\n" +
"Grandir avec une belle-mère a apporté de nombreuses épreuves dans ma vie. Mais ces difficultés ne m'ont pas détruit. Elles m'ont rendu plus fort et m'ont appris à me battre pour mon avenir sans dépendre des circonstances.\n" +
"Malgré les obstacles, j'ai terminé mes études primaires et secondaires. J'ai souvent manqué les cours à cause du manque de frais scolaires. Beaucoup pensaient que mes études s'arrêteraient là, mais Dieu est resté fidèle. Par Sa grâce, j'ai obtenu mon diplôme et j'ai poursuivi mes études grâce à une bourse.\n" +
"Après le lycée, j'ai rencontré une personne qui m'a appris l'art de la vente. C'est ainsi qu'a commencé mon parcours d'entrepreneur. J'ai commencé à vendre de porte en porte et de bureau en bureau.\n" +
"Le chemin n'a jamais été facile.\n" +
"Un jour, alors que je vendais à des employés du Parlement du Kenya, j'ai été arrêté et placé dans une cellule de police parce que le commerce ambulant y était interdit.\n" +
"Pourtant, même dans cette cellule, je n'ai jamais perdu espoir.\n" +
"J'ai commencé à prier et à chanter pour Dieu. Finalement, un policier a été touché par ce qu'il voyait. Après avoir contacté mon employeur, ils ont décidé de me libérer.\n" +
"Cette expérience a encore renforcé ma foi.\n" +
"Par la suite, j'ai continué à vendre dans les zones où le commerce ambulant était autorisé. Je marchais d'un endroit à l'autre et rencontrais chaque jour de nouvelles personnes.\n" +
"Au fil de ces rencontres, j'ai remarqué une chose importante.\n" +
"Beaucoup de personnes perdaient un temps précieux à cause de méthodes de travail anciennes et de barrières linguistiques.\n" +
"En voyant également mon pasteur et ma mère confrontés aux difficultés de langue dans leur ministère, une vision est née dans mon cœur.\n" +
"Je croyais que Dieu avait un plan pour ma vie.\n" +
"J'ai commencé à rêver de créer une technologie capable d'éliminer les barrières linguistiques, de faire gagner du temps et de faciliter la communication pour tous.\n" +
"C'est ainsi qu'est né le rêve appelé CozyOS.\n" +
"Aujourd'hui, je continue à apprendre, concevoir et construire cette vision.\n" +
"Je suis convaincu qu'une fois achevé, ce projet bénéficiera non seulement au Kenya, mais aussi à toute l'Afrique et, un jour, au monde entier.\n" +
"À suivre..."
        }),
        ar: Object.freeze({
            heading: "العربية – قصتي (الجزء الأول)",
            text:
"وُلدت ونشأت في أسرة كانت تعيش في فقرٍ شديد، وكانت الحياة صعبة منذ البداية.\n" +
"عندما بلغت الثانية عشرة من عمري، أصبحت أساعد والدتي. كنا نبيع الفحم كل يوم لأنه كان الوسيلة الوحيدة لتوفير الطعام لعائلتنا. وبصفتي الابن الثالث، اختارتني والدتي لأقف إلى جانبها في تلك المعاناة.\n" +
"عندما كنت في الثانية عشرة من عمري، تغيّرت حياتي إلى الأبد. ففي عام 2004 توفيت والدتي العزيزة جين أتشينغ. وخلال أيامها الأخيرة، كنت أسمعها كل ليلة تدعو الله من أجل عائلتنا. تركت تلك الصلوات أثراً عميقاً في قلبي لن يمحوه الزمن أبداً. وكانت من أوائل الأسباب التي جعلتني أؤمن يقيناً بأن الله موجود. بعد وفاتها شعرت بأنني أصبحت وحيداً تماماً. كدت أستسلم لليأس وأتساءل عن معنى كل شيء، لكنني أدركت أن الحياة يجب أن تستمر. رحلت والدتي إلى الأبد، وكنت قد نشأت أصلاً دون أن أعرف والدي حق المعرفة. وبعد وفاتها أصبحت زوجة أبي مسؤولة عن تربيتنا، لكنني لم أجد الحب والرعاية اللذين كنت أحتاج إليهما. وحتى اليوم، ما زالت ذكرى صلوات والدتي تقوي إيماني وتذكرني بألا أفقد الأمل أبداً.\n" +
"لم أعرف والدي حقاً. فقد غادر عندما كان عمري ستة أشهر فقط. سمعت عنه من الآخرين، لكنني لم أحصل أبداً على فرصة للتعرف إليه. وحتى اليوم، وأنا في الثامنة والعشرين من عمري، لا أعرف أين هو.\n" +
"لقد واجهت تحديات كثيرة أثناء نشأتي مع زوجة أبي، لكنها لم تحطم إرادتي، بل جعلتني أقوى، وعلمتني أن أكافح من أجل مستقبلي وألا أستسلم للظروف.\n" +
"ورغم الصعوبات، أكملت دراستي الابتدائية والثانوية. وفي كثير من الأحيان تغيبت عن المدرسة لأسابيع بسبب عدم قدرتنا على دفع الرسوم الدراسية. ظن كثيرون أن تعليمي سينتهي عند ذلك الحد، لكن الله ظل أميناً. وبنعمته تمكنت من إكمال دراستي، ثم واصلت تعليمي من خلال منحة دراسية.\n" +
"بعد انتهاء المدرسة، التقيت بشخص علمني فن البيع. ومن هناك بدأت رحلتي في عالم ريادة الأعمال، حيث كنت أبيع المنتجات من منزل إلى منزل ومن مكتب إلى آخر.\n" +
"لم تكن الرحلة سهلة أبداً.\n" +
"في أحد الأيام، بينما كنت أبيع للموظفين في البرلمان الكيني، ألقي القبض عليّ ووُضعت في زنزانة داخل البرلمان لأن البيع الجائل كان ممنوعاً هناك.\n" +
"لكن حتى داخل الزنزانة، لم أفقد الأمل.\n" +
"بدأت أصلي وأرنم لله، وفي النهاية تأثر أحد رجال الشرطة بما رآه. وبعد أن تواصل مع صاحب عملي، تقرر إطلاق سراحي.\n" +
"زادت تلك التجربة إيماني بالله.\n" +
"واصلت بعدها البيع في الأماكن المسموح فيها بالبيع الجائل، وكنت أتنقل من مكان إلى آخر وألتقي بأشخاص مختلفين كل يوم.\n" +
"وخلال تلك الرحلات، أدركت حقيقة مهمة.\n" +
"كان كثير من الناس يهدرون وقتهم بسبب اعتمادهم على أساليب عمل قديمة وحواجز لغوية.\n" +
"وفي الوقت نفسه، رأيت راعي كنيستي ووالدتي يواجهان صعوبة في خدمة الناس بسبب اختلاف اللغات.\n" +
"ومن هنا وُلدت رؤية في قلبي.\n" +
"آمنت أن الله لديه قصد لحياتي.\n" +
"بدأت أحلم بابتكار تقنية تزيل الحواجز اللغوية، وتوفر الوقت، وتجعل التواصل أسهل للجميع.\n" +
"ومن ذلك الحلم بدأت فكرة CozyOS.\n" +
"واليوم ما زلت أتعلم وأصمم وأبني هذه الرؤية.\n" +
"وأؤمن أنه عندما يكتمل هذا العمل، فلن يغير حياة الناس في كينيا فحسب، بل سيفيد ملايين الأشخاص في أفريقيا، ثم العالم أجمع.\n" +
"يتبع..."
        })
    });

    /**
     * seedIfMissing() — idempotent. If the Founder already has a story
     * (e.g. a prior seed call in this same session), does nothing and
     * returns its id. Never creates a second story, never touches an
     * existing one.
     */
    async function seedIfMissing() {
        const engine = window.CozyOS.FounderStory;
        if (!engine || typeof engine.createStory !== "function") {
            console.warn("[FounderStorySeed] FounderStoryEngine is not available — seed skipped.");
            return null;
        }
        const existing = engine.listStoriesForOwner(FOUNDER_OWNER_ID);
        if (existing.length > 0) return existing[0].storyId;

        // createStory() defaults: status "draft", visibility "only-me" —
        // never overridden here, matching the spec exactly.
        const story = await engine.createStory(FOUNDER_OWNER_ID, {
            title: "My Story",
            subtitle: "The Founder's Autobiography",
            language: "en",
            category: "Autobiography"
        });

        await engine.addChapter(story.storyId, FOUNDER_OWNER_ID, {
            title: "My Story — Part 1",
            body: CHAPTER_1, // multilingual: { en: {...}, sw: {...}, fr: {...} } — same story, not separate ones
            timelineDate: null,
            media: {}
        });

        return story.storyId;
    }

    window.CozyOS.Modules["founder-story-seed"] = Object.freeze({
        version: MODULE_VERSION,
        description: "Founder Story initial content (Chapter 1, multilingual EN/SW/FR). Calls only the real, public FounderStoryEngine API (createStory/addChapter) — implements no storage or encryption of its own.",
        seedIfMissing
    });

    // Run once the engine is present. If script load order ever changes
    // and the engine isn't ready yet, this fails loudly to console
    // rather than silently losing the seed — no retry/polling loop
    // invented here.
    seedIfMissing().catch(err => console.error("[FounderStorySeed] seeding failed:", err));
})();
