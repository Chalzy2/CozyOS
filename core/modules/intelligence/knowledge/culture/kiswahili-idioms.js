/**
 * core/modules/intelligence/knowledge/culture/kiswahili-idioms.js
 * CozyOS — Kiswahili Semantic Knowledge Layer — Idioms (Misemo)
 *
 * NEW, ADDITIVE FILE. Structured records for common Kiswahili misemo
 * (idiomatic expressions), sourced from the project's own supplied
 * cultural knowledge document. DISCLOSURE: curated starter set (9
 * idioms) — see getCounts() for the exact number, not exhaustive.
 */
(function (root) {
    "use strict";
    const w = root.window || root;
    w.CozyOS = w.CozyOS || {};
    w.CozyOS.Modules = w.CozyOS.Modules || {};
    if (w.CozyOS.Modules["kiswahili-idioms"]) return;

    const VERSION = "1.0.0-culture-phase1";

    function idiom(expression, opts) {
        opts = opts || {};
        return Object.freeze({
            id: expression.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, ""),
            type: "idiom",
            expression: expression,
            literalInterpretation: opts.literalInterpretation,
            figurativeInterpretation: opts.figurativeInterpretation,
            semanticCategory: opts.semanticCategory || null,
            usageContext: opts.usageContext || null,
            exampleSentence: opts.exampleSentence || null,
            englishMeaning: opts.englishMeaning || null,
            regionalNotes: opts.regionalNotes || null,
            language: "sw"
        });
    }

    const IDIOMS = Object.freeze([
        idiom("Piga moyo konde", {
            literalInterpretation: "To beat the heart with a fist/kernel.",
            figurativeInterpretation: "To muster courage, endure hardship stoically, or resolve to face a difficult situation.",
            semanticCategory: "emotions-patience-hardship",
            usageContext: "Said to someone facing a painful trial or difficult decision.",
            exampleSentence: "Ingawa mtihani ulikuwa mgumu, alipiga moyo konde na kuendelea.",
            englishMeaning: "To take heart / to bite the bullet.",
            regionalNotes: "Common across Kenya and Tanzania."
        }),
        idiom("Kula chumvi nyingi", {
            literalInterpretation: "To eat a lot of salt.",
            figurativeInterpretation: "To have lived for a long time and gained deep life experience.",
            semanticCategory: "wisdom-age-respect",
            usageContext: "Referring to elders or experienced individuals.",
            exampleSentence: "Mzee huyu amekula chumvi nyingi; sikiliza ushauri wake.",
            englishMeaning: "To have lived long / to have gray hair (experience).",
            regionalNotes: "Widespread in East African coastal and inland speech."
        }),
        idiom("Weka pamba masikioni", {
            literalInterpretation: "To put cotton in one's ears.",
            figurativeInterpretation: "To ignore gossip, advice, or warnings deliberately.",
            semanticCategory: "conflict-wisdom-behavior",
            usageContext: "Describing someone who refuses to listen to corrective feedback.",
            exampleSentence: "Nilimwonya kuhusu biashara hiyo lakini aliweka pamba masikioni.",
            englishMeaning: "To turn a deaf ear.",
            regionalNotes: "Commonly documented in general Swahili discourse."
        }),
        idiom("Shika ukuta", {
            literalInterpretation: "To hold the wall.",
            figurativeInterpretation: "To be stunned, shocked, or rendered speechless by unexpected news.",
            semanticCategory: "emotions-humor-surprise",
            usageContext: "Informally when hearing shocking pricing or surprising events.",
            exampleSentence: "Bei ya bidhaa hiyo ilipopanda, ilibidi nishike ukuta.",
            englishMeaning: "To be flabbergasted.",
            regionalNotes: "Popular urban colloquial expression in Kenya and Tanzania."
        }),
        idiom("Panda dau", {
            literalInterpretation: "To raise the dhow/boat.",
            figurativeInterpretation: "To raise prices, increase demands, or elevate expectations/status.",
            semanticCategory: "business-money-success",
            usageContext: "In commerce or negotiations when sellers increase costs.",
            exampleSentence: "Baada ya bidhaa kuisha sokoni, wafanyabiashara walipanda dau.",
            englishMeaning: "To raise the stakes / to increase prices.",
            regionalNotes: "Coastal maritime origin, now widely understood inland."
        }),
        idiom("Kaa kwenye jiko", {
            literalInterpretation: "To sit on the stove/fire.",
            figurativeInterpretation: "To be in a highly precarious, stressful, or dangerous position.",
            semanticCategory: "hardship-conflict-risk",
            usageContext: "Describing someone facing intense pressure or scrutiny.",
            exampleSentence: "Kutokana na makosa kazini, sasa yuko kwenye jiko.",
            englishMeaning: "To be in the hot seat.",
            regionalNotes: "Common East African idiomatic phrase."
        }),
        idiom("Fanya mchezo", {
            literalInterpretation: "To play a game.",
            figurativeInterpretation: "To underestimate something serious or treat a situation lightly.",
            semanticCategory: "work-success-failure",
            usageContext: "Warning someone not to take a task casually.",
            exampleSentence: "Mtihani huu ni mgumu, usifanye mchezo nao.",
            englishMeaning: "To play with fire / to take lightly.",
            regionalNotes: "Widely used across East Africa."
        }),
        idiom("Toa macho", {
            literalInterpretation: "To take out/widen the eyes.",
            figurativeInterpretation: "To stare in amazement, greed, or disbelief.",
            semanticCategory: "emotions-humor-surprise",
            usageContext: "When someone looks at something expensive, desirable, or shocking.",
            exampleSentence: "Alitoa macho alipoona gari mpya ya rafiki yake.",
            englishMeaning: "To pop one's eyes out.",
            regionalNotes: "General East African usage."
        }),
        idiom("Kula njama", {
            literalInterpretation: "To eat conspiracies.",
            figurativeInterpretation: "To plot or scheme secretly against someone.",
            semanticCategory: "conflict-work-politics",
            usageContext: "Describing hidden meetings or betrayal plans.",
            exampleSentence: "Wafanyakazi walikuwa wakila njama ya kugoma.",
            englishMeaning: "To plot / to conspire.",
            regionalNotes: "Standard and conversational Swahili."
        })
    ]);

    function findByExpression(expr) {
        if (typeof expr !== "string") return null;
        const key = expr.trim().toLowerCase();
        return IDIOMS.find((i) => i.expression.toLowerCase() === key) || null;
    }

    const api = Object.freeze({
        VERSION,
        idioms: IDIOMS,
        count: IDIOMS.length,
        findByExpression
    });

    w.CozyOS.CozyKiswahiliIdioms = api;
    w.CozyOS.Modules["kiswahili-idioms"] = Object.freeze({
        version: VERSION,
        description: "New, additive structured data: 9 curated Kiswahili misemo (idioms) with literal/figurative interpretation, semantic category, usage, and example. Disclosed starter set, not exhaustive. Does not modify any existing file."
    });
})(typeof window !== "undefined" ? { window: window } : { window: (global.window = global.window || {}) });
