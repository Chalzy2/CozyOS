/**
 * CozyOS — Business-Data Intent (InterestOS Full Completion, Phase 2:
 * CozyAI + Live Window Business-Data Q&A)
 * File Reference: core/modules/intelligence/business-data/cozy-business-data-intent.js
 *
 * WHAT THIS IS
 *   A single, disclosed, rule-based classifier + orchestrator that lets
 *   the ONE existing Live Window / CozyAI answer natural-language
 *   questions about the user's OWN InterestOS business records
 *   ("How much did I sell today?", "Faida yangu wiki hii ni kiasi
 *   gani?"). This file adds NO new AI, NO new conversational engine, NO
 *   new calculation engine, and NO new business database:
 *
 *     - Classification here is a fixed, small, EN+SW keyword table
 *       (METRIC_KEYWORDS / TIME_RANGE_KEYWORDS below) — the exact same
 *       "not semantic, disclosed as such" discipline cozy-ai.js's own
 *       CONTEXT_KNOWLEDGE_ROUTES and rule-based-conversational-
 *       provider.js's INTENT_RULES already use, not a new paradigm.
 *     - Every real number in every answer comes from ONE authoritative
 *       source: window.CozyOS.InterestOSBusinessWorkspace's existing,
 *       real, already-tested computeSummary()/listTables()/
 *       periodRange() (Full Completion Phase 1). This file computes
 *       nothing itself beyond which calendar reference date "yesterday"/
 *       "last week"/"last month" point to — the actual period-boundary
 *       math still lives entirely in periodRange().
 *     - This file is owned by CozyAI's own namespace (window.CozyOS.
 *       CozyBusinessDataIntent), not core/plugins/interestOS-*, because
 *       "understanding the user's question" is CozyAI's job; InterestOS
 *       remains purely the authoritative data/calculation source (see
 *       this repository's own Phase 2 architecture rule: InterestOS =
 *       application + data, CozyAI = universal intelligence).
 *
 * AUTHORIZATION
 *   Every real read goes through InterestOSBusinessWorkspace.listTables()/
 *   computeSummary() with the REAL, caller-supplied actorId — the exact
 *   same CozyMemory owner/visibility enforcement (private by default,
 *   confirmed by reading cozy-memory-engine.js's own saveMemory()
 *   default) every other business-workspace consumer already relies on.
 *   This file invents no second authorization path and accepts no
 *   caller-supplied "owner" — the actor asking IS the owner being
 *   queried, always actorId === owner.
 *
 * HONESTY DISCIPLINE
 *   - A genuinely ambiguous metric ("How much did I make?") is never
 *     guessed — a real clarifying question is returned instead.
 *   - Multiple business tables for the same actor are never silently
 *     collapsed into one — a real clarifying question names them.
 *   - "Stock" only ever reports InterestOSBusinessWorkspace's real,
 *     existing stockMovement (recorded quantity within a period) — this
 *     data model has NO current-on-hand-inventory concept at all
 *     (confirmed by reading computeSummary()'s own source), so this
 *     file never fabricates a "you have N units left" figure; it
 *     discloses the real limitation instead.
 *   - No currency symbol is invented: the business-workspace data model
 *     carries no currency field, so every amount is reported as a plain
 *     number, honestly, rather than guessing "KSh"/"KES".
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    const VERSION = "1.0.0-PHASE2";
    if (window.CozyOS.Modules["cozy-business-data-intent"]) return;

    // ── METRIC keywords — small, disclosed, EN+SW. Substring-matched
    // against the lower-cased question, same discipline as cozy-ai.js's
    // own matchRoutes(). Order matters: checked in this order, first
    // match wins, so more specific words are listed before broader ones.
    const METRIC_KEYWORDS = [
        { metric: "PRODUCT_PERFORMANCE", words: ["sold most", "sold the most", "best-selling", "best selling", "which product", "what product sold", "imeuza zaidi", "bidhaa gani"] },
        { metric: "STOCK", words: ["stock", "low in stock", "bidhaa zilizobaki", "bidhaa zimebaki"] },
        { metric: "SAVINGS", words: ["saved", "savings", "save up", "akiba"] },
        { metric: "CASH_BALANCE", words: ["cash balance", "how much cash", "cash do i have", "salio", "cash kiasi"] },
        { metric: "PROFIT", words: ["profit", "faida"] },
        { metric: "EXPENSES", words: ["spend", "spent", "expense", "expenses", "tumia pesa", "nimetumia", "gharama"] },
        { metric: "REVENUE", words: ["sold", "sell", "sale", "sales", "revenue", "mauzo", "niliuza"] },
    ];
    // Ambiguous verbs that name no specific metric on their own ("How
    // much did I make?") — only consulted when NO word above matched.
    const AMBIGUOUS_METRIC_MARKERS = ["how much did i make", "how much have i made", "what did i make", "nilipata kiasi gani", "nimepata kiasi gani"];

    const TIME_RANGE_KEYWORDS = [
        { range: "YESTERDAY", words: ["yesterday", "jana"] },
        { range: "LAST_WEEK", words: ["last week", "wiki iliyopita"] },
        { range: "LAST_MONTH", words: ["last month", "mwezi uliopita"] },
        { range: "THIS_WEEK", words: ["this week", "wiki hii"] },
        { range: "THIS_MONTH", words: ["this month", "mwezi huu"] },
        { range: "THIS_YEAR", words: ["this year", "mwaka huu"] },
        { range: "TODAY", words: ["today", "leo"] },
    ];

    // Follow-up markers ("And yesterday?", "What about profit?") — a
    // real question still, just missing one or both of metric/time-
    // range, carried forward from #conversationState instead of guessed
    // from nothing. Real, disclosed, small set, EN+SW.
    const FOLLOWUP_MARKERS = ["and ", "what about", "how about", "na ", "vipi kuhusu"];

    function _norm(text) {
        return String(text || "").toLowerCase();
    }

    // Word/phrase-boundary matching (not plain substring) — a real,
    // confirmed false positive this file's own regression run found:
    // "Cozyos inafaida gani kwetu" (a genuine, pre-existing CozyOS
    // benefit/purpose question) contains the bare substring "faida"
    // embedded inside the single Kiswahili word "inafaida" ("it
    // benefits"), which plain .includes() cannot tell apart from the
    // real, standalone word "faida" in "Faida yangu leo ni kiasi
    // gani?" (an actual business-data question). \b correctly
    // distinguishes an agglutinated Kiswahili word from the same
    // syllables appearing as their own separate word.
    function _wordBoundaryIncludes(text, phrase) {
        const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(`\\b${escaped}\\b`, "i").test(text);
    }

    function _matchMetric(q) {
        for (const entry of METRIC_KEYWORDS) {
            if (entry.words.some((w) => _wordBoundaryIncludes(q, w))) return entry.metric;
        }
        return null;
    }

    function _matchTimeRange(q) {
        for (const entry of TIME_RANGE_KEYWORDS) {
            if (entry.words.some((w) => _wordBoundaryIncludes(q, w))) return entry.range;
        }
        return null;
    }

    function _looksLikeFollowup(q) {
        return FOLLOWUP_MARKERS.some((m) => q.trim().startsWith(m));
    }

    /**
     * parse(question, { conversationState })
     *   Returns null when the question carries no business-data signal
     *   at all (never a false positive against a plain application-
     *   information question — see this file's own test coverage).
     *   Otherwise returns { metric, metricAmbiguous, timeRange } —
     *   timeRange is null when genuinely unstated (caller decides the
     *   honest default, see answerBusinessDataQuestion() below).
     */
    function parse(question, { conversationState = null } = {}) {
        const q = _norm(question);
        let metric = _matchMetric(q);
        let metricAmbiguous = false;
        if (!metric) {
            if (AMBIGUOUS_METRIC_MARKERS.some((m) => q.includes(m))) {
                metricAmbiguous = true;
            } else if (_looksLikeFollowup(q) && conversationState && conversationState.lastBusinessMetric) {
                // A bare "And yesterday?" follow-up restates no metric of
                // its own — carry the real, previous turn's metric
                // forward, exactly as this repository's existing
                // #conversationState.lastDiscussedApplication pattern
                // already carries a named application forward.
                metric = conversationState.lastBusinessMetric;
            } else {
                return null; // no business-data signal at all
            }
        }
        let timeRange = _matchTimeRange(q);
        if (!timeRange && _looksLikeFollowup(q) && conversationState && conversationState.lastBusinessTimeRange) {
            timeRange = conversationState.lastBusinessTimeRange;
        }
        return { metric, metricAmbiguous, timeRange };
    }

    /**
     * _resolveTimeRange(timeRange, now)
     *   Only computes WHICH reference date "yesterday"/"last week"/
     *   "last month" point to — the real calendar-boundary math (Monday-
     *   start ISO weeks, month/year boundaries) still lives entirely in
     *   InterestOSBusinessWorkspace.periodRange(), never duplicated here.
     */
    function _resolveTimeRange(timeRange, now) {
        const ref = new Date(now.getTime());
        switch (timeRange) {
            case "YESTERDAY": ref.setDate(ref.getDate() - 1); return { period: "daily", referenceDate: ref.toISOString() };
            case "TODAY": return { period: "daily", referenceDate: ref.toISOString() };
            case "LAST_WEEK": ref.setDate(ref.getDate() - 7); return { period: "weekly", referenceDate: ref.toISOString() };
            case "THIS_WEEK": return { period: "weekly", referenceDate: ref.toISOString() };
            case "LAST_MONTH": ref.setMonth(ref.getMonth() - 1); return { period: "monthly", referenceDate: ref.toISOString() };
            case "THIS_MONTH": return { period: "monthly", referenceDate: ref.toISOString() };
            case "THIS_YEAR": return { period: "yearly", referenceDate: ref.toISOString() };
            default: return { period: "daily", referenceDate: ref.toISOString() }; // honest default: "today", never a wider range guessed
        }
    }

    const METRIC_LABEL = {
        REVENUE: { en: "revenue", sw: "mauzo" },
        PROFIT: { en: "profit", sw: "faida" },
        EXPENSES: { en: "expenses", sw: "matumizi" },
        CASH_BALANCE: { en: "cash balance", sw: "salio la fedha taslimu" },
        SAVINGS: { en: "savings", sw: "akiba" },
    };
    const RANGE_LABEL = {
        TODAY: { en: "today", sw: "leo" },
        YESTERDAY: { en: "yesterday", sw: "jana" },
        THIS_WEEK: { en: "this week", sw: "wiki hii" },
        LAST_WEEK: { en: "last week", sw: "wiki iliyopita" },
        THIS_MONTH: { en: "this month", sw: "mwezi huu" },
        LAST_MONTH: { en: "last month", sw: "mwezi uliopita" },
        THIS_YEAR: { en: "this year", sw: "mwaka huu" },
    };

    // PHASE 4 — Universal Language Capability. Every composer below now
    // calls the real, generic CozyLanguageRealize.realize() seam first
    // (composing the real, existing CozyLanguageTemplates table under
    // the "business:*" keys these exact strings were migrated to). Each
    // keeps its own prior en/sw ternary as the ONLY fallback, used
    // solely when the templates module isn't loaded at all — byte-
    // identical text either way for en/sw. METRIC_LABEL/RANGE_LABEL
    // above are small vocabulary lookup tables, not sentence templates,
    // and remain here unchanged (see this file's own Phase 4 comment).
    function _realize() {
        const c = window.CozyOS;
        return c && c.CozyLanguageRealize;
    }

    function _composeMetricAnswer(metric, timeRangeLabelKey, summary, lang) {
        const isSw = lang === "sw";
        const r = _realize();
        const rangeText = RANGE_LABEL[timeRangeLabelKey] ? (isSw ? RANGE_LABEL[timeRangeLabelKey].sw : RANGE_LABEL[timeRangeLabelKey].en) : (isSw ? "kipindi hiki" : "this period");
        if (summary.rowsInPeriod === 0) {
            return (r && r.realize("business:metric-no-records", lang, rangeText)) || (isSw
                ? `Hakuna rekodi za biashara zilizopatikana kwa ${rangeText}.`
                : `No business records were found for ${rangeText}.`);
        }
        const metricLabel = METRIC_LABEL[metric] ? (isSw ? METRIC_LABEL[metric].sw : METRIC_LABEL[metric].en) : metric;
        const value = summary[metric === "REVENUE" ? "revenue" : metric === "PROFIT" ? "profit" : metric === "EXPENSES" ? "expenses" : metric === "CASH_BALANCE" ? "cashBalance" : "savings"];
        return (r && r.realize("business:metric-answer", lang, metricLabel, rangeText, value)) || (isSw
            ? `${metricLabel.charAt(0).toUpperCase() + metricLabel.slice(1)} yako iliyorekodiwa kwa ${rangeText} ni ${value}.`
            : `Your recorded ${metricLabel} for ${rangeText} was ${value}.`);
    }

    function _composeStockAnswer(summary, timeRangeLabelKey, lang) {
        const isSw = lang === "sw";
        const r = _realize();
        const rangeText = RANGE_LABEL[timeRangeLabelKey] ? (isSw ? RANGE_LABEL[timeRangeLabelKey].sw : RANGE_LABEL[timeRangeLabelKey].en) : (isSw ? "kipindi hiki" : "this period");
        if (!summary.rolesUsed.productCol || !summary.rolesUsed.qtyCol) {
            return (r && r.realize("business:stock-no-columns", lang)) || (isSw
                ? "Jedwali lako la biashara halina safu za bidhaa/wingi zilizowekwa alama, kwa hivyo taarifa za hisa haziwezi kuhesabiwa."
                : "Your business table has no product/quantity columns tagged yet, so stock information can't be computed.");
        }
        if (summary.stockMovement.length === 0) {
            return (r && r.realize("business:stock-no-movement", lang, rangeText)) || (isSw
                ? `Hakuna mzunguko wa hisa uliorekodiwa kwa ${rangeText}.`
                : `No stock movement was recorded for ${rangeText}.`);
        }
        const lines = summary.stockMovement.map((s) => `${s.product}: ${s.quantity}`).join(", ");
        const realized = r && r.realize("business:stock-answer", lang, rangeText, lines);
        if (realized) return realized;
        const note = isSw
            ? "(Hii ni wingi uliorekodiwa kutoka mauzo/miamala, si kiwango cha sasa cha hisa iliyobaki — InterestOS haifuatilii hisa iliyobaki kwa sasa.)"
            : "(This is recorded movement from sales/transactions, not a current on-hand stock level — InterestOS does not track remaining inventory today.)";
        return isSw
            ? `Mzunguko wa hisa uliorekodiwa kwa ${rangeText}: ${lines}. ${note}`
            : `Recorded stock movement for ${rangeText}: ${lines}. ${note}`;
    }

    function _composeProductPerformanceAnswer(summary, timeRangeLabelKey, lang) {
        const isSw = lang === "sw";
        const r = _realize();
        const rangeText = RANGE_LABEL[timeRangeLabelKey] ? (isSw ? RANGE_LABEL[timeRangeLabelKey].sw : RANGE_LABEL[timeRangeLabelKey].en) : (isSw ? "kipindi hiki" : "this period");
        if (!summary.rolesUsed.productCol || !summary.rolesUsed.qtyCol || summary.stockMovement.length === 0) {
            return (r && r.realize("business:product-performance-no-data", lang)) || (isSw
                ? "Hakuna data ya kutosha ya bidhaa/wingi kuamua bidhaa iliyouza zaidi."
                : "There isn't enough product/quantity data recorded to determine the best-selling product.");
        }
        const best = summary.stockMovement.reduce((a, b) => (b.quantity > a.quantity ? b : a));
        return (r && r.realize("business:product-performance-answer", lang, rangeText, best.product, best.quantity)) || (isSw
            ? `Bidhaa iliyouza zaidi kwa ${rangeText} ni ${best.product} (${best.quantity} zilizouzwa).`
            : `The best-selling product for ${rangeText} was ${best.product} (${best.quantity} sold).`);
    }

    /**
     * answerBusinessDataQuestion(question, { actorId, language, conversationState })
     *   The one real orchestration entry point cozy-ai.js's getContext()
     *   composes (see that file's own comment). Returns null when the
     *   question carries no business-data signal at all — a true no-op,
     *   letting every other existing route try instead. Otherwise
     *   returns a real, disclosed result:
     *     { matched: true, content, updatedConversationState }
     *   updatedConversationState is null when nothing should be carried
     *   forward (e.g. a clarification was asked — the NEXT turn should
     *   still be free to restate, not silently inherit an unresolved
     *   guess).
     */
    function answerBusinessDataQuestion(question, { actorId = null, language = null, conversationState = null } = {}) {
        const parsed = parse(question, { conversationState });
        if (!parsed) return null;

        // PHASE 4 — relaxed collapse (was `language === "sw" ? "sw" : "en"`,
        // which silently discarded any language other than Kiswahili
        // before it ever reached the realize() seam below — the one
        // straggler collapse site in this file, found while proving the
        // "a new VERIFIED+AVAILABLE language reaches every already-
        // migrated call site automatically" property for InterestOS's
        // own business-data answer path). Same relaxed pattern already
        // used by cozy-teach-flow.js/cozy-living-assistant.js/
        // cozy-learn.js: pass the real requested language through
        // untouched, defaulting to "en" only when none was supplied.
        // isSw below (used only for this function's own literal-fallback
        // ternaries when realize() itself returns null) is unaffected —
        // en/sw output stays byte-identical either way.
        const lang = (typeof language === "string" && language.trim()) ? language.trim().toLowerCase() : "en";
        const workspace = window.CozyOS.InterestOSBusinessWorkspace;
        if (!workspace) return null; // honest fall-through — this file invents no second workspace

        const r = _realize();

        if (!actorId || actorId === "anonymous") {
            return {
                matched: true,
                content: (r && r.realize("business:sign-in-required", lang)) || (lang === "sw"
                    ? "Unahitaji kuingia katika akaunti yako ili kuona taarifa za biashara yako."
                    : "You need to be signed in to see your business information."),
                updatedConversationState: null
            };
        }

        let tables = [];
        try { tables = workspace.listTables(actorId, actorId) || []; } catch (_err) { tables = []; }

        if (tables.length === 0) {
            return {
                matched: true,
                content: (r && r.realize("business:no-tables", lang)) || (lang === "sw"
                    ? "Bado hujarekodi taarifa zozote za biashara katika InterestOS."
                    : "You haven't recorded any business information in InterestOS yet."),
                updatedConversationState: null
            };
        }

        let tableId = (conversationState && conversationState.lastBusinessTableId && tables.some((t) => t.key === conversationState.lastBusinessTableId))
            ? conversationState.lastBusinessTableId
            : null;
        if (!tableId) {
            if (tables.length > 1) {
                const names = tables.map((t) => t.name).join(", ");
                return {
                    matched: true,
                    content: (r && r.realize("business:ambiguous-table", lang, names)) || (lang === "sw"
                        ? `Una majedwali kadhaa ya biashara (${names}). Unamaanisha jedwali gani?`
                        : `You have more than one business table (${names}). Which one do you mean?`),
                    updatedConversationState: null
                };
            }
            tableId = tables[0].key;
        }

        if (parsed.metricAmbiguous) {
            return {
                matched: true,
                content: (r && r.realize("business:ambiguous-metric", lang)) || (lang === "sw"
                    ? "Je, unamaanisha mauzo/mapato, faida, salio la fedha taslimu, au akiba?"
                    : "Do you mean sales/revenue, profit, cash balance, or savings?"),
                updatedConversationState: { lastBusinessTableId: tableId, lastBusinessMetric: null, lastBusinessTimeRange: parsed.timeRange || null }
            };
        }

        const timeRange = parsed.timeRange || "TODAY"; // honest, narrow default — never a wider range guessed
        const { period, referenceDate } = _resolveTimeRange(timeRange, new Date());

        let summary = { available: false };
        try { summary = workspace.computeSummary(tableId, { period, referenceDate }, actorId); } catch (_err) { summary = { available: false }; }
        if (!summary.available) {
            return {
                matched: true,
                content: (r && r.realize("business:summary-unavailable", lang)) || (lang === "sw"
                    ? "Taarifa za biashara hazipatikani kwa ombi hili kwa sasa."
                    : "Business information is not available for this request right now."),
                updatedConversationState: null
            };
        }

        let content;
        if (parsed.metric === "STOCK") content = _composeStockAnswer(summary, timeRange, lang);
        else if (parsed.metric === "PRODUCT_PERFORMANCE") content = _composeProductPerformanceAnswer(summary, timeRange, lang);
        else content = _composeMetricAnswer(parsed.metric, timeRange, summary, lang);

        return {
            matched: true,
            content,
            updatedConversationState: { lastBusinessTableId: tableId, lastBusinessMetric: parsed.metric, lastBusinessTimeRange: timeRange }
        };
    }

    const CozyBusinessDataIntent = Object.freeze({ parse, answerBusinessDataQuestion, getVersion: () => VERSION });
    window.CozyOS.CozyBusinessDataIntent = CozyBusinessDataIntent;

    window.CozyOS.Modules["cozy-business-data-intent"] = Object.freeze({
        version: VERSION,
        description: "Phase 2 — InterestOS Full Completion. Rule-based, disclosed business-data question classifier + orchestrator composing the existing, unmodified InterestOSBusinessWorkspace (computeSummary/listTables) as the one authoritative business-data source. No new AI, no new calculation engine, no new business database, no currency invented."
    });
})();
