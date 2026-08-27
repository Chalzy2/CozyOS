/**
 * CozyOS — Community Contribution-Type Picker (DOM layer)
 * File Reference: core/modules/intelligence/knowledge/teach/ui/cozy-knowledge-contribution-type-picker-ui.js
 * Repair: Dashboard Prompt 2 §7
 *
 * OWNERSHIP: rendering/event-wiring only. All real type data comes from
 * window.CozyOS.CozyKnowledgeContributionTypePicker (pure logic, composes
 * the real, unmodified CozyTeachCozyAIRouting). Selecting a type never
 * submits anything itself — it only calls the supplied onSelect(type)
 * callback, so the caller (dashboard shell, or the standalone teach page)
 * decides what happens next (route to the real, existing "Teach CozyAI"
 * form, already pre-set to that type).
 *
 * MOBILE-FIRST (spec section 6): large tappable cards (not a <select>),
 * visible focus/selected state, no nested modal, reuses
 * core/ui/cozy-tokens.css + cozy-components.css so it matches the rest
 * of the CozyOS dashboard rather than a generic component library.
 */
(function () {
    "use strict";
    if (typeof window === "undefined") return;

    function picker() { return window.CozyOS && window.CozyOS.CozyKnowledgeContributionTypePicker; }

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

    /**
     * init(rootEl, options)
     *   options.onSelect(realKnowledgeType) — called only with a real,
     *   engine-verified value (never a fabricated/invented type).
     *   options.initialType — optional, pre-highlights a real type.
     */
    function init(rootEl, options) {
        const opts = options || {};
        const p = picker();
        rootEl.innerHTML = "";

        if (!p) {
            rootEl.appendChild(el("div", { class: "cozy-empty-state", text: "The contribution-type picker is not connected on this page yet." }));
            return null;
        }

        const state = p.getPickerOptions();
        if (!state.available) {
            rootEl.appendChild(el("div", { class: "cozy-empty-state", text: "Contribution types are not available right now." }));
            return null;
        }

        const card = el("div", { class: "cozy-card contribution-type-picker" });
        rootEl.appendChild(card);

        card.appendChild(el("h2", { class: "cozy-section-title", text: "What would you like to teach?" }));
        card.appendChild(el("p", { class: "contribution-hint", text: "Choose the kind of knowledge you want to share with CozyAI. It will be reviewed by the community before it's trusted." }));

        const grid = el("div", { class: "contribution-type-picker-grid", role: "radiogroup", "aria-label": "What would you like to teach?" });
        card.appendChild(grid);

        let selected = opts.initialType && p.isRealContributionType(opts.initialType) ? opts.initialType : null;

        function renderGrid() {
            grid.innerHTML = "";
            state.options.forEach((opt) => {
                const isSelected = selected === opt.value;
                const btn = el("button", {
                    type: "button",
                    class: "cozy-btn contribution-type-picker-option" + (isSelected ? " contribution-type-picker-option-selected" : ""),
                    role: "radio",
                    "aria-checked": isSelected ? "true" : "false",
                    "data-value": opt.value,
                    onclick: () => {
                        const result = p.selectContributionType(opt.value);
                        if (!result.selected) return; // fails closed, never routes an unknown type
                        selected = opt.value;
                        renderGrid();
                        if (typeof opts.onSelect === "function") opts.onSelect(opt.value, result.formDescriptor);
                    },
                    onkeydown: (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            btn.click();
                        }
                    }
                }, [
                    el("span", { class: "contribution-type-picker-label", text: opt.label }),
                    opt.hint ? el("span", { class: "contribution-type-picker-hint", text: opt.hint }) : null
                ]);
                grid.appendChild(btn);
            });
        }

        renderGrid();
        return { render: renderGrid, getSelected: () => selected };
    }

    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    window.CozyOS.CozyKnowledgeContributionTypePickerUI = Object.freeze({ init });
    window.CozyOS.Modules["cozy-knowledge-contribution-type-picker-ui"] = Object.freeze({
        version: "1.0.0",
        description: "Dashboard Prompt 2 \u00a77 \u2014 mobile-first Community contribution-type picker DOM layer. Large touch-target cards over the real CozyKnowledgeContributionTypePicker options; never submits directly \u2014 only reports a real, verified selection via onSelect()."
    });
})();
