/**
 * core/modules/intelligence/knowledge/culture/kiswahili-proverbs.js
 * CozyOS — Kiswahili Semantic Knowledge Layer — Proverbs (Methali)
 *
 * NEW, ADDITIVE FILE. Structured records for common Kiswahili methali
 * (proverbs), sourced from the project's own supplied cultural
 * knowledge document ("CozyOS Kiswahili Semantic Knowledge Layer").
 * DISCLOSURE: this is a curated starter set (10 proverbs), not an
 * exhaustive collection of Kiswahili proverbs — see getCounts() for
 * the exact number.
 */
(function (root) {
    "use strict";
    const w = root.window || root;
    w.CozyOS = w.CozyOS || {};
    w.CozyOS.Modules = w.CozyOS.Modules || {};
    if (w.CozyOS.Modules["kiswahili-proverbs"]) return;

    const VERSION = "1.0.0-culture-phase1";

    function proverb(expression, opts) {
        opts = opts || {};
        return Object.freeze({
            id: expression.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, ""),
            type: "proverb",
            expression: expression,
            literalMeaning: opts.literalMeaning,
            figurativeMeaning: opts.figurativeMeaning,
            usage: opts.usage || null,
            exampleSentence: opts.exampleSentence || null,
            englishExplanation: opts.englishExplanation || null,
            semanticFamilies: Object.freeze(opts.semanticFamilies || []),
            regionalScope: opts.regionalScope || "Broadly East African",
            language: "sw"
        });
    }

    const PROVERBS = Object.freeze([
        proverb("Haraka haraka haina baraka", {
            literalMeaning: "Haste, haste has no blessing.",
            figurativeMeaning: "Rushing through tasks leads to mistakes or poor outcomes; patience yields better results.",
            usage: "When warning someone who is rushing or encouraging careful execution.",
            exampleSentence: "Usikimbie kumaliza kazi hiyo; kumbuka kwamba haraka haraka haina baraka.",
            englishExplanation: "Haste makes waste.",
            semanticFamilies: ["patience", "decision-making", "wisdom"]
        }),
        proverb("Haba na haba hujaza kibaba", {
            literalMeaning: "Little by little fills the small measuring container (kibaba).",
            figurativeMeaning: "Small, consistent efforts accumulate into significant results over time.",
            usage: "To encourage saving money, incremental learning, or steady progress.",
            exampleSentence: "Weka akiba kidogo kila siku, kwani haba na haba hujaza kibaba.",
            englishExplanation: "Little drops of water make a mighty ocean.",
            semanticFamilies: ["patience", "perseverance", "money"]
        }),
        proverb("Umoja ni nguvu, utengano ni udhaifu", {
            literalMeaning: "Unity is strength, division is weakness.",
            figurativeMeaning: "People achieving goals together are far more powerful than individuals acting alone.",
            usage: "During community mobilization, cooperative projects, or team-building contexts.",
            exampleSentence: "Tunapaswa kushirikiana kujenga shule hii kwa sababu umoja ni nguvu, utengano ni udhaifu.",
            englishExplanation: "United we stand, divided we fall.",
            semanticFamilies: ["community", "cooperation"]
        }),
        proverb("Asiyesikia la mkuu huvunjika guu", {
            literalMeaning: "He who does not listen to the elder breaks his leg.",
            figurativeMeaning: "Disobeying wise counsel or authority leads to misfortune or severe consequences.",
            usage: "To caution youths or juniors against ignoring advice from experienced elders.",
            exampleSentence: "Mkubwa wako amekuonya dhidi ya safari hiyo; kumbuka kuwa asiyesikia la mkuu huvunjika guu.",
            englishExplanation: "He who will not be ruled by the rudder will be ruled by the rock.",
            semanticFamilies: ["respect", "wisdom", "consequences"]
        }),
        proverb("Mtaka cha mvunguni sharti ainame", {
            literalMeaning: "He who wants what is under the bed must bend down.",
            figurativeMeaning: "Achieving something worthwhile requires effort, humility, or sacrifice.",
            usage: "To encourage someone facing hard work or discomfort to achieve a goal.",
            exampleSentence: "Usiogope kufanya kazi ngumu; mtaka cha mvunguni sharti ainame.",
            englishExplanation: "No pain, no gain.",
            semanticFamilies: ["effort", "sacrifice"]
        }),
        proverb("Mchagua jembe si mkulima", {
            literalMeaning: "One who chooses a hoe is not a farmer.",
            figurativeMeaning: "A person who is overly picky about tools or conditions is not serious about doing the work.",
            usage: "To criticize someone who makes excuses based on minor inconveniences.",
            exampleSentence: "Anakataa kufanya kazi kwa sababu vifaa si vya kisasa, lakini mchagua jembe si mkulima.",
            englishExplanation: "A bad workman blames his tools.",
            semanticFamilies: ["work", "excuses"]
        }),
        proverb("Penye nia pana njia", {
            literalMeaning: "Where there is an intention, there is a path.",
            figurativeMeaning: "Determination and resolve will find a way to overcome obstacles.",
            usage: "To motivate someone who feels an objective is impossible.",
            exampleSentence: "Usikate tamaa ya kusoma; penye nia pana njia.",
            englishExplanation: "Where there's a will, there's a way.",
            semanticFamilies: ["determination", "perseverance"]
        }),
        proverb("Samaki mkunje angali mbichi", {
            literalMeaning: "Bend the fish while it is still raw/fresh.",
            figurativeMeaning: "Correct bad behavior or guide children when they are young and pliable.",
            usage: "In parenting or mentoring discussions.",
            exampleSentence: "Tunapaswa kuwafundisha maadili mema vijana wetu mapema, maana samaki mkunje angali mbichi.",
            englishExplanation: "As the twig is bent, so grows the tree.",
            semanticFamilies: ["parenting", "education"]
        }),
        proverb("Akili ni nywele, kila mtu ana zake", {
            literalMeaning: "Intelligence/mind is hair; everyone has their own.",
            figurativeMeaning: "People have different perspectives, ideas, and ways of thinking; diversity of thought is natural.",
            usage: "When people disagree or take different approaches to solving a problem.",
            exampleSentence: "Usishangae uamuzi wake; kumbuka akili ni nywele, kila mtu ana zake.",
            englishExplanation: "Everyone to their own opinion.",
            semanticFamilies: ["individuality", "opinion"]
        }),
        proverb("Usione vyaelea vimeundwa", {
            literalMeaning: "Do not see things floating and think they were not crafted.",
            figurativeMeaning: "Success or luxury that looks effortless is actually the result of hidden hard work and preparation.",
            usage: "To remind people not to envy others' success without understanding their struggles.",
            exampleSentence: "Anavyoishi kwa raha sasa hivi usidhani ni rahisi; usione vyaelea vimeundwa.",
            englishExplanation: "Rome wasn't built in a day.",
            semanticFamilies: ["diligence", "success"]
        })
    ]);

    function findByExpression(expr) {
        if (typeof expr !== "string") return null;
        const key = expr.trim().toLowerCase();
        return PROVERBS.find((p) => p.expression.toLowerCase() === key) || null;
    }

    const api = Object.freeze({
        VERSION,
        proverbs: PROVERBS,
        count: PROVERBS.length,
        findByExpression
    });

    w.CozyOS.CozyKiswahiliProverbs = api;
    w.CozyOS.Modules["kiswahili-proverbs"] = Object.freeze({
        version: VERSION,
        description: "New, additive structured data: 10 curated Kiswahili methali (proverbs) with literal/figurative meaning, usage, example, and semantic-family tags. Disclosed starter set, not exhaustive. Does not modify any existing file."
    });
})(typeof window !== "undefined" ? { window: window } : { window: (global.window = global.window || {}) });
