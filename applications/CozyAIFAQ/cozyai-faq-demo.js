/**
 * CozyOS — Identity FAQ Demo logic
 * File Reference: applications/CozyAIFAQ/cozyai-faq-demo.js
 *
 * Standalone test harness for cozyos-identity-faq-router.js. Calls the
 * real window.CozyOS.CozyAI.ask() facade exactly as any other CozyOS
 * application would — this file adds no cognitive logic of its own.
 */
(function () {
    "use strict";

    // "auto" = do NOT force a language; the router detects it from
    // whichever trigger list (EN or SW) the question itself matches and
    // answers in that language automatically. The toggle below is only
    // an optional override for testing, never required to get an answer.
    let currentLang = "auto";

    const SUGGESTIONS = {
        en: [
            "Who founded CozyOS?",
            "What is CozyOS's mission?",
            "What is CozyOS's vision?",
            "What makes CozyOS different?",
            "What does the name CozyOS mean?",
            "How can I contribute?"
        ],
        sw: [
            "Nani alianzisha CozyOS?",
            "Dhamira ya CozyOS ni nini?",
            "Maono ya CozyOS ni nini?",
            "Ni nini kinachofanya CozyOS kuwa tofauti?",
            "Jina CozyOS linamaanisha nini?",
            "Ninawezaje kuchangia?"
        ]
    };

    function $(sel) { return document.querySelector(sel); }

    function appendBubble(role, text, metaHtml) {
        const body = $("#faqBody");
        const div = document.createElement("div");
        div.className = "bubble " + role;
        div.textContent = text;
        if (metaHtml) {
            const meta = document.createElement("span");
            meta.className = "meta" + (metaHtml.warn ? " warn" : "");
            meta.textContent = metaHtml.text;
            div.appendChild(meta);
        }
        body.appendChild(div);
        body.scrollTop = body.scrollHeight;
    }

    function renderSuggestions() {
        const wrap = $("#faqSuggestions");
        wrap.innerHTML = "";
        // On "auto" (the default), mix EN + SW examples together so the
        // person can see both work without picking a language first.
        const list = currentLang === "auto"
            ? SUGGESTIONS.en.slice(0, 3).concat(SUGGESTIONS.sw.slice(0, 3))
            : SUGGESTIONS[currentLang];
        list.forEach((q) => {
            const btn = document.createElement("button");
            btn.textContent = q;
            btn.addEventListener("click", () => { $("#faqInput").value = q; sendMessage(); });
            wrap.appendChild(btn);
        });
    }

    function setStatus() {
        const has = {
            DeveloperIdentity: !!window.CozyOS.DeveloperIdentity,
            CozyIdentityFAQRouter: !!window.CozyOS.CozyIdentityFAQRouter,
            CozyAI: !!window.CozyOS.CozyAI,
            CognitiveCoordinator: !!window.CozyOS.CognitiveCoordinator
        };
        $("#faqStatus").innerHTML =
            `<b>DeveloperIdentity:</b> ${has.DeveloperIdentity ? "loaded" : "missing"} &nbsp;·&nbsp; ` +
            `<b>FAQ Router:</b> ${has.CozyIdentityFAQRouter ? "loaded" : "missing"} &nbsp;·&nbsp; ` +
            `<b>CozyAI:</b> ${has.CozyAI ? "loaded" : "missing"} &nbsp;·&nbsp; ` +
            `<b>CognitiveCoordinator (fallback):</b> ${has.CognitiveCoordinator ? "loaded" : "not loaded (deterministic FAQ answers still work)"}`;
    }

    async function sendMessage() {
        const input = $("#faqInput");
        const text = input.value.trim();
        if (!text) return;
        appendBubble("user", text);
        input.value = "";
        input.disabled = true;
        $("#faqSend").disabled = true;

        // Only pass an explicit language when the user forced one via the
        // toggle. Left on "auto", the router picks EN or SW itself from
        // the question's own wording — that's the real answer, not a
        // question back to the user.
        const forcedLang = currentLang === "auto" ? undefined : currentLang;

        try {
            let result;
            if (window.CozyOS.CozyAI && typeof window.CozyOS.CozyAI.ask === "function") {
                result = await window.CozyOS.CozyAI.ask(text, { language: forcedLang });
            } else if (window.CozyOS.CozyIdentityFAQRouter) {
                result = await window.CozyOS.CozyIdentityFAQRouter.resolve(text, { language: forcedLang });
            } else {
                appendBubble("ai", currentLang === "sw"
                    ? "Injini haijapakia bado — pakia developer-profile.js, project-history.js, african-knowledge-initiative.js, cozyai-identity.js, na cozyos-identity-faq-router.js kwanza."
                    : "Nothing is loaded yet — load developer-profile.js, project-history.js, african-knowledge-initiative.js, cozyai-identity.js, and cozyos-identity-faq-router.js first.");
                return;
            }

            if (result && result.matched && result.success) {
                const metaBits = [`intent: ${result.intentId}`];
                if (result.certified === false) metaBits.push("Kiswahili: not yet human-certified");
                if (result.machineTranslated) metaBits.push("machine-translated");
                if (result.fallbackReason) metaBits.push(result.fallbackReason);
                appendBubble("ai", result.answer, { text: metaBits.join(" · "), warn: !!result.fallbackReason || result.certified === false });
            } else if (result && result.matched === false) {
                appendBubble("ai", currentLang === "sw"
                    ? "Hilo halikulingana na maswali ya msingi ya utambulisho — linahitaji CognitiveCoordinator kamili kujibu."
                    : "That didn't match a canonical identity question — it would need the full CognitiveCoordinator pipeline to answer.",
                    { text: "no FAQ match" });
            } else {
                appendBubble("ai", (result && result.reason) || "No real answer available.", { text: "unavailable", warn: true });
            }
        } catch (err) {
            appendBubble("ai", "Error: " + (err && err.message), { text: "exception", warn: true });
        } finally {
            input.disabled = false;
            $("#faqSend").disabled = false;
            input.focus();
        }
    }

    function setLang(lang) {
        currentLang = lang;
        document.querySelectorAll(".lang-toggle button").forEach((b) => b.classList.toggle("active", b.dataset.lang === lang));
        renderSuggestions();
    }

    document.addEventListener("DOMContentLoaded", () => {
        setStatus();
        renderSuggestions();
        $("#faqSend").addEventListener("click", sendMessage);
        $("#faqInput").addEventListener("keydown", (e) => { if (e.key === "Enter") sendMessage(); });
        document.querySelectorAll(".lang-toggle button").forEach((b) => {
            b.addEventListener("click", () => setLang(b.dataset.lang));
        });
        appendBubble("ai", "Hi — ask me anything about CozyOS (founder, mission, vision, what makes it different...). / Habari — niulize chochote kuhusu CozyOS (mwanzilishi, dhamira, maono, tofauti yake...).");
    });
})();
