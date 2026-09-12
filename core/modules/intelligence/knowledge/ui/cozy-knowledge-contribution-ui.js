/**
 * CozyOS — Community Contribution Interface: DOM Layer
 * File Reference: core/modules/intelligence/knowledge/ui/cozy-knowledge-contribution-ui.js
 * Repair: RP-029-C Phase 3
 *
 * OWNERSHIP: rendering/event-wiring only. Every state change goes
 * through cozy-knowledge-contribution-core.js's real functions, which
 * themselves only compose RP-029-B/Phase 1/RP-027/Phase 2's real APIs.
 *
 * STYLING: reuses core/ui/cozy-tokens.css + core/ui/cozy-components.css
 * (.cozy-card/.cozy-btn/.cozy-input/.cozy-badge/.cozy-empty-state),
 * same convention as Phase 2's dashboard. contribution-form.css (same
 * directory) adds only the additional layout this form needs.
 */
(function () {
    "use strict";
    if (typeof window === "undefined") return;

    function core() { return window.CozyOS && window.CozyOS.CozyKnowledgeContributionCore; }
    function reviewDashboard() { return window.CozyOS && window.CozyOS.CozyKnowledgeReviewDashboard; }

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
        const id = "cf_" + Math.random().toString(36).slice(2);
        inputEl.setAttribute("id", id);
        wrap.appendChild(el("label", { for: id, class: "cozy-text-label", text: labelText }));
        wrap.appendChild(inputEl);
        if (hint) wrap.appendChild(el("div", { class: "contribution-hint", text: hint }));
        return wrap;
    }

    function init(rootEl, options) {
        const opts = options || {};
        const c = core();
        if (!c) {
            rootEl.appendChild(el("div", { class: "cozy-empty-state", text: "Required module is not loaded (CozyKnowledgeContributionCore)." }));
            return null;
        }

        const draft = c.createDraft({ contributorId: opts.contributorId || null });
        const state = { errors: [], lastResult: null };

        rootEl.innerHTML = "";
        const card = el("div", { class: "cozy-card contribution-form" });
        rootEl.appendChild(card);

        function render() {
            card.innerHTML = "";
            if (state.lastResult && state.lastResult.status === "SUBMITTED") {
                renderThankYou(card, state.lastResult, c);
                return;
            }
            card.appendChild(el("h2", { class: "cozy-section-title", text: "Teach CozyAI a word or expression" }));
            renderForm(card, draft, state, c, render);
        }

        render();
        return { render, draft };
    }

    function renderForm(card, draft, state, c, render) {
        const current = c.getDraft(draft.id) || draft;
        const oral = ["AUDIO_REFERENCE", "PRONUNCIATION", "DIALECT_VARIANT"].indexOf(current.contributionType) !== -1;

        const typeSelect = el("select", { class: "cozy-input", "aria-label": "Contribution type", onchange: (e) => patch({ contributionType: e.target.value }) },
            [el("option", { value: "", text: "Select type\u2026" })].concat(
                c.CONTRIBUTION_TYPES.map((t) => el("option", { value: t, text: t, ...(current.contributionType === t ? { selected: "selected" } : {}) }))
            ));

        const langInfo = c.listLanguageOptions();
        const langSelect = el("select", { class: "cozy-input", "aria-label": "Language", onchange: (e) => patch({ language: e.target.value || null }) },
            [el("option", { value: "", text: "Select language\u2026" })].concat(
                langInfo.options.map((o) => el("option", { value: o.code || "", text: `${o.name} (${o.status})`, ...(current.language === o.code ? { selected: "selected" } : {}) }))
            ));
        const langStatus = current.language ? c.languageStatus(current.language) : null;
        const langNote = langStatus === "NOT_READY"
            ? "I can receive knowledge for this language, but my verified knowledge is currently limited."
            : (langStatus === "AVAILABLE" ? null : (current.language ? null : null));

        function textInput(name, placeholder) {
            return el("input", { class: "cozy-input", type: "text", value: current[name] || "", placeholder: placeholder || "", oninput: (e) => patch({ [name]: e.target.value }) });
        }
        function textArea(name, placeholder) {
            return el("textarea", { class: "cozy-input", rows: "2", placeholder: placeholder || "", oninput: (e) => patch({ [name]: e.target.value }) }, [document.createTextNode(current[name] || "")]);
        }

        function patch(p) {
            const result = c.updateDraft(draft.id, p);
            state.errors = result.errors || [];
            render();
        }

        card.appendChild(field("Contribution type", typeSelect));
        card.appendChild(field("Language", langSelect, langNote));
        card.appendChild(field("Dialect / community", textInput("dialect")));
        card.appendChild(field("Region", textInput("region")));

        if (!oral) {
            card.appendChild(field("Expression / word", textInput("expression")));
        } else {
            card.appendChild(field("Expression / word (optional \u2014 spelling is never required)", textInput("expression")));
            card.appendChild(field("Pronunciation / phonetic representation", textInput("phonetic"), "At least one of expression, audio reference, or phonetic is required for oral evidence."));
            card.appendChild(field("Audio reference (permitted only)", textInput("audioReference")));
        }

        card.appendChild(field("What does it mean?", textArea("meaning")));
        card.appendChild(field("Literal meaning (if different)", textInput("literalMeaning")));
        card.appendChild(field("How is it used? (context)", textArea("context")));
        card.appendChild(field("Example sentence", textInput("exampleUsage")));
        card.appendChild(field("Translation (if applicable)", textInput("translation")));
        card.appendChild(field("Source / license", textInput("source")));
        card.appendChild(field("Notes", textArea("notes")));

        const privacyWrap = el("fieldset", { class: "contribution-privacy" }, [
            el("legend", { class: "cozy-text-label", text: "Privacy" })
        ].concat(c.PRIVACY_LEVELS.map((p) => el("label", { class: "review-dashboard-toggle" }, [
            el("input", { type: "radio", name: "privacyLevel", value: p, ...(current.privacyLevel === p ? { checked: "checked" } : {}), onchange: () => patch({ privacyLevel: p }) }),
            document.createTextNode(" " + p)
        ]))));
        card.appendChild(privacyWrap);

        const consentLabel = el("label", { class: "review-dashboard-toggle" }, [
            el("input", { type: "checkbox", "aria-label": "Consent acknowledged", ...(current.consent && current.consent.acknowledged ? { checked: "checked" } : {}),
                onchange: (e) => patch({ consent: { acknowledged: e.target.checked } }) }),
            document.createTextNode(" I understand what I'm submitting, how it may be used, and that it can be reviewed by the community before becoming CozyAI knowledge.")
        ]);
        card.appendChild(consentLabel);

        if (state.errors.length > 0) {
            card.appendChild(el("ul", { class: "contribution-errors", role: "alert" }, state.errors.map((e) => el("li", { text: e }))));
        }

        const submitBtn = el("button", {
            class: "cozy-btn cozy-btn-primary", type: "button", text: "Submit contribution",
            onclick: () => {
                const result = c.submitDraft(draft.id);
                if (result.status !== "SUBMITTED") {
                    state.errors = result.errors || [result.reason || result.status];
                    render();
                    return;
                }
                state.lastResult = result;
                render();
            }
        });
        card.appendChild(submitBtn);
    }

    function renderThankYou(card, result, c) {
        card.appendChild(el("h2", { class: "cozy-section-title", text: "Thank you." }));
        card.appendChild(el("p", { text: "This is now a knowledge candidate. Other community members can help verify it." }));
        card.appendChild(el("p", { class: "review-dashboard-candidate-meta", text: "Timeline state: " + c.timelineState(result.candidateId) }));

        const bridge = window.CozyOS && window.CozyOS.CozyKnowledgeReviewHotspotBridge;
        if (bridge) {
            const feedback = el("div", { class: "review-dashboard-action-feedback", role: "status", "aria-live": "polite" });
            const shareBtn = el("button", {
                class: "cozy-btn", type: "button", text: "Share via Cozy Offline Hotspot",
                onclick: () => {
                    const share = c.shareOffline(result.record);
                    feedback.textContent = "Offline share: " + share.status + (share.reason ? " \u2014 " + share.reason : "");
                }
            });
            card.appendChild(shareBtn);
            card.appendChild(feedback);
        }

        if (reviewDashboard()) {
            card.appendChild(el("p", { class: "contribution-hint", text: "Open the Review Dashboard to see confirmations and review activity for this candidate." }));
        }
    }

    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    window.CozyOS.CozyKnowledgeContribution = Object.freeze({ init });
    window.CozyOS.Modules["cozy-knowledge-contribution-ui"] = Object.freeze({
        version: "1.0.0",
        description: "RP-029-C Phase 3 — Contribution form DOM layer. Oral-language-first (never requires spelling), dynamic language list from the real registry, explicit consent gate before submission, honest per-language NOT_READY disclosure, and an honest offline-share action composing Phase 2's real Cozy Offline Hotspot bridge."
    });
})();
