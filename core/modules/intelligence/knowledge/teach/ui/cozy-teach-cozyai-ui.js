/**
 * CozyOS — Teach CozyAI: Full Knowledge Vocabulary Form (DOM Layer)
 * File Reference: core/modules/intelligence/knowledge/teach/ui/cozy-teach-cozyai-ui.js
 * Repair: RP-031 Phase 2A
 *
 * OWNERSHIP: rendering/event-wiring only. Every state change goes
 * through window.CozyOS.CozyTeachCozyAIRouting's real functions, which
 * themselves only compose RP-029-C's real contribution core and RP-030's
 * real language-pack registry (see cozy-teach-cozyai-routing-core.js).
 *
 * STYLING: reuses core/ui/cozy-tokens.css + core/ui/cozy-components.css,
 * same convention as the existing Phase 2 dashboard/contribution form.
 */
(function () {
    "use strict";
    if (typeof window === "undefined") return;

    function teach() { return window.CozyOS && window.CozyOS.CozyTeachCozyAIRouting; }
    function contributionCore() { return window.CozyOS && window.CozyOS.CozyKnowledgeContributionCore; }

    function el(tag, attrs, children) {
        const node = document.createElement(tag);
        Object.keys(attrs || {}).forEach((k) => {
            if (k === "text") node.textContent = attrs[k];
            else if (k === "class") node.className = attrs[k];
            else if (k.indexOf("on") === 0 && typeof attrs[k] === "function") node.addEventListener(k.slice(2), attrs[k]);
            else node.setAttribute(k, attrs[k]);
        });
        (children || []).forEach((c) => { if (c) node.appendChild(c); });
        return node;
    }

    function field(labelText, inputEl, hint) {
        const wrap = el("div", { class: "contribution-field" });
        const id = "tc_" + Math.random().toString(36).slice(2);
        inputEl.setAttribute("id", id);
        wrap.appendChild(el("label", { for: id, class: "cozy-text-label", text: labelText }));
        wrap.appendChild(inputEl);
        if (hint) wrap.appendChild(el("div", { class: "contribution-hint", text: hint }));
        return wrap;
    }

    function init(rootEl, options) {
        const opts = options || {};
        const t = teach();
        const cc = contributionCore();
        if (!t || !cc) {
            rootEl.appendChild(el("div", { class: "cozy-empty-state", text: "Required module is not loaded (CozyTeachCozyAIRouting / CozyKnowledgeContributionCore)." }));
            return null;
        }

        // Dashboard Prompt 2 §7: if the caller (the real, existing
        // contribution-type picker) already collected a real,
        // engine-verified knowledgeType, honor it as the initial
        // selection — never invents/accepts one the real routing
        // module doesn't itself recognize.
        const initialType = (opts.initialKnowledgeType && t.TEACH_KNOWLEDGE_TYPES.indexOf(opts.initialKnowledgeType) !== -1)
            ? opts.initialKnowledgeType
            : "WORD";

        const state = {
            fields: { knowledgeType: initialType, privacyLevel: "PRIVATE", consent: { acknowledged: false } },
            errors: [],
            lastResult: null
        };

        rootEl.innerHTML = "";
        const card = el("div", { class: "cozy-card contribution-form" });
        rootEl.appendChild(card);

        function patch(p) { Object.assign(state.fields, p); render(); }

        function render() {
            card.innerHTML = "";
            if (state.lastResult && state.lastResult.status === "SUBMITTED") {
                renderThankYou(card, state.lastResult, t);
                return;
            }
            card.appendChild(el("h2", { class: "cozy-section-title", text: "Teach CozyAI" }));
            card.appendChild(el("p", { class: "contribution-hint", text: "African/community knowledge, in your own words. Nothing here is treated as verified until independent community confirmation and review happen." }));
            renderForm(card);
        }

        function textInput(name, placeholder) {
            return el("input", { class: "cozy-input", type: "text", value: state.fields[name] || "", placeholder: placeholder || "", oninput: (e) => patch({ [name]: e.target.value }) });
        }
        function textArea(name, placeholder) {
            return el("textarea", { class: "cozy-input", rows: "2", placeholder: placeholder || "", oninput: (e) => patch({ [name]: e.target.value }) }, [document.createTextNode(state.fields[name] || "")]);
        }

        function renderForm(card) {
            const typeSelect = el("select", { class: "cozy-input", "aria-label": "Knowledge type", onchange: (e) => patch({ knowledgeType: e.target.value }) },
                t.TEACH_KNOWLEDGE_TYPES.map((k) => el("option", { value: k, text: k, ...(state.fields.knowledgeType === k ? { selected: "selected" } : {}) })));
            card.appendChild(field("What kind of knowledge is this?", typeSelect));

            const form = t.describeContributionForm(state.fields.knowledgeType);
            const isOral = t.ORAL_KNOWLEDGE_TYPES.indexOf(state.fields.knowledgeType) !== -1;
            const isDomain = t.DOMAIN_TYPES.indexOf(state.fields.knowledgeType) !== -1;

            const langInfo = cc.listLanguageOptions();
            const langSelect = el("select", { class: "cozy-input", "aria-label": "Language", onchange: (e) => patch({ language: e.target.value || null }) },
                [el("option", { value: "", text: "Select language\u2026" })].concat(
                    langInfo.options.map((o) => el("option", { value: o.code || "", text: `${o.name} (${o.status})`, ...(state.fields.language === o.code ? { selected: "selected" } : {}) }))
                ));
            card.appendChild(field("Language", langSelect));
            card.appendChild(field("Country", textInput("country"), "This is where it is used."));
            card.appendChild(field("Region", textInput("region")));
            card.appendChild(field("Community", textInput("community"), "A word can mean something different from one community to the next \u2014 even in the same region."));
            card.appendChild(field("Dialect", textInput("dialect"), "This is how it differs in our area."));

            if (!isOral && !isDomain) {
                card.appendChild(field("This is what we call it.", textInput("expression")));
            } else if (isOral) {
                card.appendChild(field("This is what we call it. (optional \u2014 spelling is never required)", textInput("expression")));
                card.appendChild(field("This is how we pronounce it.", textInput("phonetic"), "At least one of expression, audio reference, or phonetic is required."));
                card.appendChild(field("Audio reference (permitted only)", textInput("audioReference")));
            }

            if (isDomain) {
                card.appendChild(field("Domain knowledge", textArea("domainKnowledge"), "Agricultural, education, business, church/community, or other local knowledge. This is recorded as community-reported, not professional advice."));
            }

            card.appendChild(field("This is what it means.", textArea("meaning")));
            if (form.required.indexOf("literalMeaning") !== -1 || state.fields.knowledgeType === "LITERAL_MEANING") {
                card.appendChild(field("Literal meaning", textInput("literalMeaning")));
            }
            if (form.required.indexOf("contextualMeaning") !== -1 || state.fields.knowledgeType === "CONTEXTUAL_MEANING") {
                card.appendChild(field("Contextual meaning", textInput("contextualMeaning")));
            }
            card.appendChild(field("Context / how it's used", textArea("context")));
            if (state.fields.knowledgeType === "EXAMPLE_USAGE") {
                card.appendChild(field("Example usage", textArea("exampleUsage")));
            }
            if (state.fields.knowledgeType === "TRANSLATION") {
                card.appendChild(field("Translation", textInput("translation")));
            }
            card.appendChild(field("Cultural / context notes", textArea("culturalNotes")));
            card.appendChild(field("Source / license (if any)", textInput("source")));

            const privacyWrap = el("fieldset", { class: "contribution-privacy" }, [
                el("legend", { class: "cozy-text-label", text: "Privacy" })
            ].concat(cc.PRIVACY_LEVELS.map((p) => el("label", { class: "review-dashboard-toggle" }, [
                el("input", { type: "radio", name: "teachPrivacyLevel", value: p, ...(state.fields.privacyLevel === p ? { checked: "checked" } : {}), onchange: () => patch({ privacyLevel: p }) }),
                document.createTextNode(" " + p)
            ]))));
            card.appendChild(privacyWrap);

            const consentLabel = el("label", { class: "review-dashboard-toggle" }, [
                el("input", { type: "checkbox", "aria-label": "Consent acknowledged", ...(state.fields.consent && state.fields.consent.acknowledged ? { checked: "checked" } : {}),
                    onchange: (e) => patch({ consent: { acknowledged: e.target.checked } }) }),
                document.createTextNode(" I understand how this may be used and that it will be reviewed before becoming CozyAI knowledge.")
            ]);
            card.appendChild(consentLabel);

            if (state.errors.length > 0) {
                card.appendChild(el("ul", { class: "contribution-errors", role: "alert" }, state.errors.map((e) => el("li", { text: e }))));
            }

            const submitBtn = el("button", {
                class: "cozy-btn cozy-btn-primary", type: "button", text: "Teach CozyAI",
                onclick: () => {
                    const result = t.submitTeachingContribution(Object.assign({ contributorId: opts.contributorId || null }, state.fields));
                    if (result.status !== "SUBMITTED") {
                        state.errors = result.errors || [result.reason || (result.reviewPipeline && result.reviewPipeline.userMessage) || result.status];
                        render();
                        return;
                    }
                    state.lastResult = result;
                    render();
                }
            });
            card.appendChild(submitBtn);
        }

        function renderThankYou(card, result) {
            card.appendChild(el("h2", { class: "cozy-section-title", text: "Thank you." }));
            card.appendChild(el("p", { text: "This is now a knowledge candidate. Other community members can help confirm it before it becomes validated CozyAI knowledge." }));
            card.appendChild(el("p", { class: "review-dashboard-candidate-meta", text: "Review pipeline: " + result.reviewPipeline.status + (result.reviewPipeline.candidateId ? " (candidate " + result.reviewPipeline.candidateId + ")" : "") }));
            card.appendChild(el("p", { class: "review-dashboard-candidate-meta", text: "Language-pack routing: " + result.languagePackRouting.status + (result.languagePackRouting.recordId ? " (record " + result.languagePackRouting.recordId + ", evidence: " + (result.languagePackRouting.evidenceBand || "n/a") + ")" : "") }));
            if (result.evidenceStatus) {
                card.appendChild(el("p", { class: "contribution-hint", text: "Evidence status: " + result.evidenceStatus + " \u2014 this is community knowledge, not professional advice." }));
            }
            const again = el("button", {
                class: "cozy-btn", type: "button", text: "Teach another word",
                onclick: () => { state.lastResult = null; state.errors = []; render(); }
            });
            card.appendChild(again);
        }

        render();
        return { render };
    }

    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    window.CozyOS.CozyTeachCozyAIUI = Object.freeze({ init });
    window.CozyOS.Modules["cozy-teach-cozyai-ui"] = Object.freeze({
        version: "1.0.0",
        description: "RP-031 Phase 2A — full Teach CozyAI contribution form DOM layer (word/phrase/sentence/definition/literal+contextual meaning/pronunciation/dialect/region/community/example usage/translation/cultural notes/domain knowledge). Oral-language-first, dynamic language list from the real registry, explicit consent gate, and honest dual-status display (review-pipeline candidate + language-pack routing record) on submission."
    });
})();
