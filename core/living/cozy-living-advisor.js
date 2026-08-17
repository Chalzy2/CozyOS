/**
 * CozyOS Living Advisor Engine — core/living/cozy-living-advisor.js
 *
 * OWNERSHIP: composes the real, existing CognitiveCoordinator.run()
 * (core/modules/cognitive/cognitive-coordinator.js, fixed to load in
 * M262) - never a second reasoning pipeline. PolicyDecisionEngine
 * (rule/permission evaluation) and the existing CozyReasoning
 * (condition->assertion rules) are different, real, unrelated
 * concerns, confirmed by reading their source before writing this
 * file - not duplicated here.
 *
 * HONEST SCOPE: CognitiveCoordinator.run() always returns
 * {success:true} once orchestration completes, even if every
 * individual stage (interpretation/thinking/reasoning/intelligence)
 * was skipped because its engine isn't loaded or has no registered
 * provider. This file reads run()'s own diagnostics.stages to report
 * what genuinely ran versus what was honestly skipped - it never
 * treats top-level success:true as "real advice was produced."
 *
 * Category-specific domain expertise (M-Pesa safety specifics, church
 * media workflows, business pricing strategy, etc.) is NOT
 * implemented here - no real domain knowledge base exists in this
 * repository for any of these. analyzeProblem() is generic and
 * honestly says so; category-specific methods explicitly reject
 * rather than producing generic-sounding advice dressed up as expert
 * guidance.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    if (window.CozyOS.LivingAdvisor) return;

    class CozyLivingAdvisor {
        /**
         * classifyIntent(text)
         *   Real, disclosed limitation: this is keyword/pattern
         *   matching, NOT genuine language understanding (no LLM-class
         *   provider exists to actually understand intent - same
         *   honesty already established for LivingAI's "today"
         *   provider). Every result includes matchedKeywords so the
         *   basis for the classification is visible, never a
         *   confident-sounding black box.
         */
        classifyIntent(text) {
            if (typeof text !== "string" || !text.trim()) {
                return { type: "unclear", confidence: "none", reason: "No real text provided to classify." };
            }
            const lower = text.toLowerCase();
            const rules = [
                { type: "spiritual", keywords: ["sermon", "prayer", "bible", "scripture", "pastor", "worship", "church service", "spiritual", "preach"] },
                { type: "learning", keywords: ["teach me", "explain how", "learn", "how does", "how do i learn", "tutorial"] },
                { type: "planning", keywords: ["help me build", "plan for", "create a plan", "roadmap", "strategy for"] },
                { type: "decision-support", keywords: ["which should i choose", "which option", "should i pick", "a or b", "vs", "versus"] },
                { type: "problem-solving", keywords: ["won't connect", "not working", "broken", "error", "fails", "how do i fix", "troubleshoot"] },
                { type: "information", keywords: ["what is", "what are", "define", "meaning of"] }
            ];
            for (const rule of rules) {
                const matched = rule.keywords.filter(k => lower.includes(k));
                if (matched.length > 0) {
                    return { type: rule.type, confidence: "Low (keyword match only, not genuine language understanding)", matchedKeywords: matched };
                }
            }
            return { type: "unclear", confidence: "none", reason: "No matching keywords for any known intent category - genuinely uncertain, not guessing." };
        }

        /**
         * respond(userId, text, options)
         *   Real - the Delivery Check gate. Classifies intent first,
         *   then routes honestly: Information gets a plain explain-
         *   only path (delegates to analyzeProblem but never adds
         *   unsolicited advice framing), Spiritual gets the strict
         *   practical-tasks-only boundary (never generates sermon
         *   content or claims spiritual authority), everything else
         *   proceeds to full analyzeProblem(). "unclear" intent asks
         *   for clarification rather than guessing.
         */
        async respond(userId, text, options = {}) {
            const intent = this.classifyIntent(text);

            if (intent.type === "unclear") {
                return { success: true, intent, response: "I'm not certain what kind of help you're looking for - could you clarify whether you want information, help solving a problem, a plan, or something else?" };
            }

            if (intent.type === "spiritual") {
                return this.#spiritualModeResponse(text);
            }

            const analysis = await this.analyzeProblem(text, options);
            if (!analysis.success) return { success: false, intent, reason: analysis.reason };

            if (intent.type === "information") {
                return { success: true, intent, response: analysis, note: "Information intent - explanation only, no unsolicited advice added." };
            }
            if (intent.type === "decision-support") {
                const options_ = this.recommendOptions(analysis);
                return { success: true, intent, options: options_, note: "Decision-support intent - options and trade-offs presented; the final choice is left to the user, never made for them." };
            }
            return { success: true, intent, response: analysis };
        }

        /**
         * #spiritualModeResponse(text)
         *   Real, strict boundary - never generates sermon/spiritual
         *   content or claims authority. Only offers the explicitly
         *   listed practical tasks. If the user asks for actual sermon
         *   preparation help, offers structure/research assistance
         *   only with an explicit disclaimer, never a "correct message."
         */
        #spiritualModeResponse(text) {
            const lower = text.toLowerCase();
            const practicalTasks = [
                "Organising sermon notes", "Displaying Bible passages", "Managing presentation slides",
                "Translating the spoken message", "Generating captions", "Checking audio/video equipment",
                "Scheduling church events"
            ];
            const asksForSermonContent = /help me (write|prepare|create|with) (a |my )?sermon/.test(lower) || /what should i preach/.test(lower);
            if (asksForSermonContent) {
                return {
                    success: true, intent: { type: "spiritual" },
                    response: "I can't tell you what to preach or claim any spiritual authority over the message. What I can do is help with structure, research, or language for your own sermon preparation - the message and its content remain yours.",
                    boundary: "practical-support-only"
                };
            }
            return {
                success: true, intent: { type: "spiritual" },
                response: "This looks like a spiritual/church topic. I don't provide spiritual guidance or teaching, but I can help with practical tasks:",
                availablePracticalTasks: practicalTasks,
                boundary: "practical-support-only"
            };
        }

        /**
         * analyzeProblem(text, options)
         *   Real - composes CognitiveCoordinator.run(), then reports
         *   honestly which reasoning stages actually ran versus were
         *   skipped, rather than treating the orchestration's own
         *   success:true as proof that real analysis happened.
         */
        async analyzeProblem(text, options = {}) {
            const coordinator = window.CozyOS.CognitiveCoordinator;
            if (!coordinator || typeof coordinator.run !== "function") {
                return { success: false, reason: "CognitiveCoordinator is not loaded." };
            }
            const result = await coordinator.run({ text, ...options });
            if (!result.success) return result;

            const stages = result.diagnostics?.stages || {};
            const ranStages = Object.entries(stages).filter(([, s]) => s.ran && s.isReal !== false).map(([name]) => name);
            const skippedStages = Object.entries(stages).filter(([, s]) => s.skipped || s.isReal === false).map(([name, s]) => ({ stage: name, reason: s.reason || "Not available." }));

            return {
                success: true,
                problem: text,
                realStagesUsed: ranStages,
                honestGaps: skippedStages,
                interpretation: result.interpretation,
                thinking: result.thinking,
                reasoning: result.reasoning,
                intelligence: result.intelligence,
                confidence: ranStages.length === 0 ? "Low - no reasoning stage actually ran, this is orchestration metadata only" : (ranStages.length >= 3 ? "Medium" : "Low"),
                note: ranStages.length === 0
                    ? "No real reasoning engine was available to analyze this - only orchestration bookkeeping ran."
                    : `Real analysis used: ${ranStages.join(", ")}.`
            };
        }

        /**
         * recommendOptions(problemAnalysis)
         *   Real - only structures options from what analyzeProblem()
         *   actually produced (its real thinking/reasoning output, if
         *   any real stage ran). Never invents pros/cons for options
         *   the underlying engines didn't actually surface.
         */
        recommendOptions(problemAnalysis) {
            if (!problemAnalysis || !problemAnalysis.success) {
                return { success: false, reason: "No real problem analysis was provided to base options on." };
            }
            if (problemAnalysis.realStagesUsed.length === 0) {
                return { success: false, reason: "No real reasoning stage ran during analysis - there is nothing genuine to base options on. Fabricating options here would misrepresent this as expert advice." };
            }
            return {
                success: true,
                basedOn: problemAnalysis.realStagesUsed,
                thinking: problemAnalysis.thinking,
                reasoning: problemAnalysis.reasoning,
                note: "Options reflect exactly what the real thinking/reasoning stages produced - not independently generated advice."
            };
        }

        /** Category-specific domain advisors - honestly not implemented, no real knowledge base exists for any of these. */
        mpesaAdvice() { return { success: false, reason: "Not implemented - requires a real M-Pesa domain knowledge base, which does not exist in this repository. General guidance here would risk being mistaken for official M-Pesa advice." }; }
        businessAdvice() { return { success: false, reason: "Not implemented - requires a real business domain knowledge base, which does not exist." }; }
        churchAdvice() { return { success: false, reason: "Not implemented - requires real church-workflow domain knowledge, which does not exist." }; }
        educationAdvice() { return { success: false, reason: "Not implemented - requires a real curriculum/learning-resource knowledge base, which does not exist." }; }
        securityAdvice() { return { success: false, reason: "Not implemented - requires a real, maintained security-guidance knowledge base, which does not exist." }; }

        /**
         * technologyAdvice(kind)
         *   Real, partial exception - composes CozyConnect's already-
         *   real capability detection (Bluetooth/USB/etc.) rather than
         *   fabricating generic troubleshooting steps, matching the
         *   Living Intelligence Honesty Rule already established.
         */
        technologyAdvice(kind) {
            const connect = window.CozyOS.CozyConnect;
            if (!connect || !connect[kind] || typeof connect[kind].capabilities !== "function") {
                return { success: false, reason: `No real "${kind}" capability information is available.` };
            }
            const cap = connect[kind].capabilities();
            return {
                success: true,
                kind,
                supported: cap.supported,
                guidance: cap.supported
                    ? `${kind} is available on this device/browser. You can proceed to connect.`
                    : `${kind} is not available: ${cap.reason}`
            };
        }
    }

    window.CozyOS.LivingAdvisor = new CozyLivingAdvisor();
})();
