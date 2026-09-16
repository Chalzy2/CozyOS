/**
 * CozyOS — Knowledge Registry (Fact Evidence Gatherer)
 * File Reference: core/modules/intelligence/knowledge/cozy-knowledge-registry.js
 * Repair: RP-027 — CozyOS Conversational Knowledge + Multilingual
 *         Response Expansion
 *
 * OWNERSHIP
 *   New, additive, standalone file. Reads ONLY already-existing public
 *   APIs of other real modules, at call time — never at load time, so
 *   load order relative to this file is not load-bearing (confirmed
 *   safe on both dashboard.html, which loads DeveloperIdentity/
 *   ProviderManager/ServiceRegistry, and index.html, which loads
 *   neither — both paths are exercised honestly below, never assumed
 *   present). Modifies no other file.
 *
 * REAL EVIDENCE SOURCES THIS FILE READS (confirmed present in this
 * repository before writing this file):
 *   - window.CozyOS.DeveloperIdentity (core/identity/cozyai-identity.js,
 *     Milestone 180) — .query('founder') / .answerWhoCreatedYou()
 *   - window.CozyOS.listApplications() / window.CozyOS.ServiceRegistry
 *     .listApplications() (core/registry/cozy-registry.js)
 *   - window.CozyOS.ProviderManager.healthReport() / .health(id)
 *     (core/shell/provider-manager.js, M367/M367.2)
 *   - window.CozyOS.LivingAI.getActiveProvider() (core/living/
 *     cozy-living-ai.js)
 *
 * FACT SAFETY RULE (RP-027 §3) — every method below returns an object
 * carrying an explicit `evidence` field, one of:
 *   "VERIFIED"           — directly backed by a live/real repository source
 *   "PARTIALLY_VERIFIED"  — part of the answer is backed, part is not
 *   "NOT_FOUND"           — no authoritative source available right now
 *   "NOT_A_CAPABILITY"    — CozyOS does not implement the requested thing
 * Nothing in this file ever upgrades an absence of evidence into a
 * positive claim — every live call is wrapped so a missing/throwing
 * dependency degrades to NOT_FOUND, never to a fabricated VERIFIED
 * answer.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["cozy-knowledge-registry"]) return;

    const VERSION = "1.0.0";

    function safeCall(fn) {
        try {
            return fn();
        } catch (_err) {
            return null; // honest: a throwing dependency is treated as absent, never surfaced as fact
        }
    }

    /**
     * getFounderFact()
     *   VERIFIED via window.CozyOS.DeveloperIdentity.answerWhoCreatedYou()
     *   when that module loaded successfully (it fail-closes itself if
     *   its own three required parts didn't load — see cozyai-
     *   identity.js's own header). NOT_FOUND otherwise — never guesses.
     */
    function getFounderFact(lang) {
        const identity = window.CozyOS && window.CozyOS.DeveloperIdentity;
        if (identity && typeof identity.answerWhoCreatedYou === "function") {
            const result = safeCall(() => identity.answerWhoCreatedYou(lang));
            if (result && result.known && typeof result.answer === "string" && result.answer.length > 0) {
                return { evidence: "VERIFIED", answer: result.answer, source: "window.CozyOS.DeveloperIdentity" };
            }
        }
        return { evidence: "NOT_FOUND", answer: null, source: null };
    }

    /**
     * listApplicationsFact()
     *   VERIFIED via the real, already-existing ServiceRegistry. Reads
     *   name (falling back to id) for every registered application.
     *   NOT_FOUND (registry unavailable) rather than ever falling back
     *   to a hardcoded/remembered application list — a remembered list
     *   would go stale exactly when the real registry is what changed.
     */
    function listApplicationsFact() {
        const lister =
            (window.CozyOS && typeof window.CozyOS.listApplications === "function" && window.CozyOS.listApplications) ||
            (window.CozyOS && window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.listApplications === "function" && (() => window.CozyOS.ServiceRegistry.listApplications()));
        if (!lister) return { evidence: "NOT_FOUND", applications: null, source: null };
        const list = safeCall(() => lister());
        if (!Array.isArray(list)) return { evidence: "NOT_FOUND", applications: null, source: null };
        const names = list
            .map((app) => (app && (app.name || app.id)) || null)
            .filter((name) => typeof name === "string" && name.length > 0);
        if (names.length === 0) return { evidence: "NOT_FOUND", applications: null, source: null };
        return { evidence: "VERIFIED", applications: names, source: "window.CozyOS.ServiceRegistry" };
    }

    /**
     * listProvidersFact()
     *   VERIFIED via ProviderManager.healthReport() — a real, already-
     *   existing aggregation of every registered provider's own
     *   getHealth(). Never fabricates a health value; this file only
     *   formats whatever healthReport() honestly returns.
     */
    function listProvidersFact() {
        const pm = window.CozyOS && window.CozyOS.ProviderManager;
        if (!pm || typeof pm.healthReport !== "function") return { evidence: "NOT_FOUND", entries: null, source: null };
        const report = safeCall(() => pm.healthReport());
        if (!report || typeof report !== "object") return { evidence: "NOT_FOUND", entries: null, source: null };
        const ids = Object.keys(report);
        if (ids.length === 0) return { evidence: "NOT_FOUND", entries: null, source: null };
        const entries = ids.map((id) => {
            const entry = report[id] || {};
            return `${id}: ${entry.health || "UNKNOWN"}`;
        });
        return { evidence: "VERIFIED", entries, source: "window.CozyOS.ProviderManager" };
    }

    /**
     * activeProviderFact()
     *   VERIFIED via LivingAI.getActiveProvider() — which conversational
     *   provider is currently answering, right now. Used by the
     *   'provider-status'/'identity' composition path, not a separate
     *   user-facing intent of its own this pass.
     */
    function activeProviderFact() {
        const ai = window.CozyOS && window.CozyOS.LivingAI;
        if (!ai || typeof ai.getActiveProvider !== "function") return { evidence: "NOT_FOUND", providerId: null };
        const active = safeCall(() => ai.getActiveProvider());
        if (!active) return { evidence: "NOT_FOUND", providerId: null };
        const id = typeof active === "string" ? active : active.id || active.name || null;
        if (!id) return { evidence: "NOT_FOUND", providerId: null };
        return { evidence: "VERIFIED", providerId: id };
    }

    /**
     * accountStateVocabulary()
     *   PARTIALLY_VERIFIED, always — "ACTIVE" and "PENDING" are
     *   directly grep-confirmed literal state strings in this
     *   repository's own security/identity modules (session-manager.js,
     *   auth-coordinator.js) before this file was written; the
     *   additional intermediate state NAMES this provider surfaces
     *   (registration-pending, authentication-incomplete, phone-
     *   verification-incomplete, trusted-device-required) describe real
     *   documented steps in the registration/authentication flow but
     *   are not each independently confirmed as a single literal
     *   enum-value string repository-wide — hence PARTIALLY_VERIFIED,
     *   not VERIFIED, and never claimed as a live read of any specific
     *   person's account.
     */
    function accountStateVocabulary() {
        return {
            evidence: "PARTIALLY_VERIFIED",
            confirmedStates: ["ACTIVE", "PENDING"],
            describedSteps: ["registration-pending", "authentication-incomplete", "phone-verification-incomplete", "trusted-device-required"],
            source: "core/security/session-manager.js, core/security/auth-coordinator.js"
        };
    }

    /**
     * safeCallAsync(fn)
     *   Same fail-closed discipline as safeCall(), for the async
     *   FounderStory.getPublicStory() read path below. A throwing or
     *   rejecting dependency is treated as absent, never surfaced as
     *   fact.
     */
    async function safeCallAsync(fn) {
        try {
            return await fn();
        } catch (_err) {
            return null;
        }
    }

    /**
     * getProjectKnowledgeFact(topicTag)
     *   CozyAI Project Knowledge & Public Story Integration milestone.
     *   The single, shared implementation behind all five new project-
     *   knowledge fact-getters below — composes
     *   window.CozyOS.FounderStory.getPublicStory(topicTag) only (the
     *   one narrow, viewerId-free, public+published-only read path
     *   added to that engine this milestone). Never reads the private
     *   Founder Story Vault directly, never accepts or forwards a
     *   viewerId, never upgrades an absent/private/draft result into a
     *   positive claim.
     *
     *   Evidence mapping:
     *     - FounderStory not loaded, or getPublicStory() throws/returns
     *       something that isn't a real {title, body} object → NOT_FOUND
     *       (same "missing dependency degrades to NOT_FOUND" convention
     *       getFounderFact() above already established — this is not a
     *       "CozyOS doesn't implement this" case, the capability exists,
     *       there is simply no published content yet).
     *     - A real public+published chapter body → VERIFIED.
     */
    async function getProjectKnowledgeFact(topicTag) {
        const founderStory = window.CozyOS && window.CozyOS.FounderStory;
        if (!founderStory || typeof founderStory.getPublicStory !== "function") {
            return { evidence: "NOT_FOUND", answer: null, source: null };
        }
        const result = await safeCallAsync(() => founderStory.getPublicStory(topicTag));
        if (result && typeof result.body === "string" && result.body.length > 0) {
            return { evidence: "VERIFIED", answer: result.body, source: "window.CozyOS.FounderStory" };
        }
        return { evidence: "NOT_FOUND", answer: null, source: null };
    }

    function getProjectOriginFact() { return getProjectKnowledgeFact("project-origin"); }

    /**
     * getPublicStoryFact()
     *   COZYAI-PUBLIC-STORY-MULTILINGUAL dependency. getProjectKnowledgeFact
     *   ("public-story") still tries FounderStory.getPublicStory() first,
     *   unchanged — if a real editor ever publishes a public+published
     *   "public-story" chapter there, that remains the answer. Today
     *   nothing has been published through that path (an honest,
     *   disclosed, pre-existing gap — confirmed by repository-wide
     *   search before this fallback was added), so this previously
     *   dead-ended at NOT_FOUND for every caller, including
     *   rule-based-conversational-provider.js's "public-story" intent.
     *
     *   The fallback below reads the SAME single, already-existing,
     *   already-public Origin Story source every other caller in this
     *   repository already treats as canonical —
     *   window.CozyOS.DeveloperIdentity.answerWhyCreated(), itself
     *   composed from core/identity/project-history.js's committed
     *   "background" text (never founder-story-seed.js, which this
     *   function never reads, imports, or references). This is not a
     *   second Public Story and not new prose — it is the identical
     *   text cozyos-identity-faq-router.js's COZYOS_ORIGIN intent
     *   already serves, read here through its one real accessor so
     *   this fact-getter's callers get the same honest answer instead
     *   of a dead NOT_FOUND.
     */
    async function getPublicStoryFact() {
        const viaFounderStory = await getProjectKnowledgeFact("public-story");
        if (viaFounderStory.evidence === "VERIFIED") return viaFounderStory;

        const identity = window.CozyOS && window.CozyOS.DeveloperIdentity;
        if (!identity || typeof identity.answerWhyCreated !== "function") {
            return { evidence: "NOT_FOUND", answer: null, source: null };
        }
        const result = safeCall(() => identity.answerWhyCreated());
        if (result && result.known && typeof result.answer === "string" && result.answer.length > 0) {
            return { evidence: "VERIFIED", answer: result.answer, source: "window.CozyOS.DeveloperIdentity (public profile, project-history.js)" };
        }
        return { evidence: "NOT_FOUND", answer: null, source: null };
    }

    function getVisionFact() { return getProjectKnowledgeFact("vision"); }
    function getMissionFact() { return getProjectKnowledgeFact("mission"); }
    function getProjectHistoryFact() { return getProjectKnowledgeFact("project-history"); }

    /**
     * getWhyUseCozyOSFact() / getDifferentiationFact() /
     * getLanguageSupportListFact()
     *   COZYAI-PUBLIC-VISION-KNOWLEDGE — thin, additive wrappers
     *   around window.CozyOS.CozyPublicKnowledge (new, standalone
     *   file: cozy-public-knowledge-source.js), which itself draws
     *   exclusively from the owner-approved
     *   docs/builder/knowledge/cozyos-public-vision-and-language-
     *   policy.md — never from the private founder-story-seed.js.
     *   Same fail-closed discipline as every other getter in this
     *   file: a missing/throwing dependency degrades to an honest
     *   NOT_FOUND, never a fabricated answer. This file adds no new
     *   evidence of its own here — CozyPublicKnowledge already
     *   carries and grades every fact; these wrappers exist only so
     *   composeReply() has one consistent CozyKnowledge surface to
     *   call, matching every other intent in this repository.
     */
    function getWhyUseCozyOSFact() {
        const pub = window.CozyOS && window.CozyOS.CozyPublicKnowledge;
        if (!pub || typeof pub.getWhyUseCozyOSFact !== "function") return { evidence: "NOT_FOUND", answer: null, source: null };
        const result = safeCall(() => pub.getWhyUseCozyOSFact());
        if (result && result.evidence === "VERIFIED" && typeof result.answer === "string" && result.answer.length > 0) return result;
        return { evidence: "NOT_FOUND", answer: null, source: null };
    }

    function getDifferentiationFact() {
        const pub = window.CozyOS && window.CozyOS.CozyPublicKnowledge;
        if (!pub || typeof pub.getDifferentiationFact !== "function") return { evidence: "NOT_FOUND", answer: null, source: null };
        const result = safeCall(() => pub.getDifferentiationFact());
        if (result && result.evidence === "VERIFIED" && typeof result.answer === "string" && result.answer.length > 0) return result;
        return { evidence: "NOT_FOUND", answer: null, source: null };
    }

    function getLanguageSupportListFact() {
        const pub = window.CozyOS && window.CozyOS.CozyPublicKnowledge;
        if (!pub || typeof pub.getLanguageSupportListFact !== "function") return { evidence: "NOT_FOUND", targetLanguages: null, availableLanguages: null, notReadyLanguages: null, source: null };
        const result = safeCall(() => pub.getLanguageSupportListFact());
        if (result && Array.isArray(result.targetLanguages) && result.targetLanguages.length > 0) return result;
        return { evidence: "NOT_FOUND", targetLanguages: null, availableLanguages: null, notReadyLanguages: null, source: null };
    }

    /**
     * getRegistrationFlowFact() — REGISTRATION/AUTH milestone
     *   VERIFIED, sourced exclusively from real, committed, directly-
     *   audited implementation files — not a live runtime read (there
     *   is no "registration in progress" object to poll), and not an
     *   inferred guess from function/file naming. Same evidence KIND
     *   as cozy-public-knowledge-source.js's committed-document facts
     *   (see that file's own header): "VERIFIED" here means "backed by
     *   real, named, committed source code a reviewer can open and
     *   check line-for-line," named explicitly in `source` below.
     *
     *   Extracted by direct inspection of:
     *     - core/modules/identity/identity-engine.js — register()
     *       (field validation, password-policy check, duplicate
     *       checks, record creation; confirms NO email/SMS
     *       verification step is required to complete registration,
     *       and confirms registration + auto-login happen as one
     *       flow, not two separate stages).
     *     - core/shell/cozy-login-gate.js — the actual, only public
     *       registration form and its submit handler (confirms the
     *       exact field list a user fills in, and confirms the
     *       automatic-login-after-register behavior from the caller
     *       side).
     *
     *   Deliberately NOT included here (fail-closed, not fabricated):
     *     - Optional profile fields (photo/company/employee number/
     *       timezone/language) are explicitly deferred/not built per
     *       that code's own comments — omitted rather than guessed.
     *     - Administrator self-registration exists in the backend
     *       logic only, with no public UI entry point — omitted from
     *       this public-facing fact since it isn't a real user step.
     *     - No claim about rate-limiting/CAPTCHA is made — genuinely
     *       NOT_FOUND in the audit, so simply absent from this fact
     *       rather than asserted either way.
     */
    /**
     * lookupLexiconTermFact(term, sourceLanguage)
     *   Kiswahili World Knowledge Lexicon (Pack 01) integration — real,
     *   live lookup against window.CozyOS.CozyLexiconEnSw (a real,
     *   additive vocabulary dataset transcribed from the source PDF,
     *   confirmed loaded at call time only, same discipline as every
     *   other fact-getter in this file). VERIFIED when at least one
     *   real record matches; NOT_FOUND when the term is genuinely
     *   absent from the dataset or the module itself isn't loaded —
     *   never a guessed/fabricated translation.
     */
    function lookupLexiconTermFact(term, sourceLanguage) {
        const lexicon = window.CozyOS && window.CozyOS.CozyLexiconEnSw;
        if (!lexicon || typeof lexicon.lookupTerm !== "function") {
            return { evidence: "NOT_FOUND", records: [], source: null };
        }
        const records = safeCall(() => lexicon.lookupTerm(term, sourceLanguage)) || [];
        if (records.length > 0) {
            return { evidence: "VERIFIED", records, source: "window.CozyOS.CozyLexiconEnSw (" + lexicon.getSourceFile() + ")" };
        }
        return { evidence: "NOT_FOUND", records: [], source: null };
    }

    /**
     * getApplicationFact(name)
     *   VERIFIED when the requested application exists in the real,
     *   live ServiceRegistry (the same authoritative source
     *   listApplicationsFact() already reads — no second inventory).
     *   Matches by exact, case-insensitive name (falling back to id)
     *   only — never a loose/substring match, so "Quarry" never
     *   accidentally resolves to "QuarryOS" and never returns a
     *   different application's data. NOT_FOUND for any name not
     *   present in the real registry — never fabricates an
     *   application. Only exposes non-sensitive, genuinely registered
     *   fields (name, category, enabled, version) — never launcher/
     *   entryPoint/sourcePath (internal routing, not conversational
     *   knowledge) and never any credential/token/secret field, which
     *   this registration shape does not carry in the first place.
     */
    /**
     * APPLICATION_HUMAN_PURPOSE_DATA
     *   ChurchOS human-purpose/importance dependency — a small,
     *   additive, real DATA structure (never a second AI/knowledge
     *   engine). Only ChurchOS has a real entry today; every other
     *   application honestly returns NOT_FOUND from
     *   getApplicationHumanPurposeFact() below rather than a guessed
     *   purpose. This is committed, human-authored knowledge (the
     *   ChurchOS human-purpose direction established for this
     *   dependency), not inferred from the application's name or code
     *   alone.
     *
     *   visionCapabilities are explicitly labeled and must NEVER be
     *   read as already implemented — currentVerifiedCapabilities is
     *   the only field backed by directly-tested code
     *   (core/plugins/churchOS-core.js).
     *
     *   visionSourceNote records, honestly, that the source comment in
     *   churchOS-core.js cites a companion document
     *   (CHURCHOS_ENGINE_AUDIT.md) that could not be located in this
     *   repository during the corrected audit — its contents are
     *   never fabricated here.
     */
    const LIVE_OS_ENTRY = Object.freeze({
        humanPurpose: "There is no single \"LiveOS\" application in CozyOS. What exists are three real, separate, registered Live capabilities: Live Camera Capture (real camera preview/photo/recording, capture only, no image enhancement), Live Session (a bounded peer live session composing camera capture, clarity, connectivity, and identity - unlimited one-to-many broadcast is not implemented), and Live/Connectivity (real offline queue, local device discovery, and pairing). Together they let two or more CozyOS users see and connect with each other directly, honestly disclosing what real-time video/connectivity is and is not possible today.",
        humanPurposeSw: "Hakuna programu moja ya \"LiveOS\" katika CozyOS. Kilichopo ni uwezo halisi, tofauti, tatu vilivyosajiliwa chini ya mwavuli wa Live: Live Camera Capture (mwoneko halisi wa kamera/picha/kurekodi, kunasa tu, hakuna uboreshaji wa picha), Live Session (kipindi cha moja kwa moja kilichofungwa kati ya watu kikijumuisha kunasa kamera, uwazi, muunganisho, na utambulisho - matangazo yasiyo na kikomo ya mtu mmoja kwenda wengi hayajatekelezwa), na Live/Connectivity (foleni halisi ya nje ya mtandao, ugunduzi wa vifaa vya karibu, na uunganishaji). Kwa pamoja huwawezesha watumiaji wawili au zaidi wa CozyOS kuonana na kuunganika moja kwa moja, wakieleza kwa uwazi ni nini hasa kinachowezekana leo katika video/muunganisho wa moja kwa moja.",
        realLifeProblems: Object.freeze([
            "no honest, single place explaining what real-time video/connectivity actually works in CozyOS today versus what is planned",
            "needing to see or reach another CozyOS user directly without a separate, third-party video app"
        ]),
        realLifeProblemsSw: Object.freeze([
            "hakuna mahali pamoja pa uwazi panapoeleza ni nini kweli kinachofanya kazi katika video/muunganisho wa moja kwa moja wa CozyOS leo dhidi ya kilichopangwa",
            "kuhitaji kuona au kufikia mtumiaji mwingine wa CozyOS moja kwa moja bila programu tofauti ya video ya nje"
        ]),
        whoBenefits: Object.freeze(["two CozyOS users who want to see/connect with each other directly", "any application that needs real camera capture or offline-aware connectivity"]),
        whoBenefitsSw: Object.freeze(["watumiaji wawili wa CozyOS wanaotaka kuonana/kuunganika moja kwa moja", "programu yoyote inayohitaji kunasa kamera halisi au muunganisho unaotambua hali ya nje ya mtandao"]),
        humanBenefits: Object.freeze([
            "real camera capture without needing a separate app",
            "a bounded, honest peer live session rather than a claimed unlimited broadcast capability",
            "real offline queueing and local pairing instead of a connection that just fails with no explanation"
        ]),
        humanBenefitsSw: Object.freeze([
            "kunasa kamera halisi bila kuhitaji programu tofauti",
            "kipindi cha moja kwa moja cha watu kilichofungwa na cha uwazi badala ya uwezo wa matangazo usio na kikomo uliodaiwa",
            "foleni halisi ya nje ya mtandao na uunganishaji wa karibu badala ya muunganisho unaoshindwa tu bila maelezo"
        ]),
        currentVerifiedCapabilities: Object.freeze([
            "Live Camera Capture: real camera preview/photo/recording capture (capture only, no enhancement)",
            "Live Session: bounded peer live session composing capture + clarity + connectivity + identity",
            "Live/Connectivity: real offline queue, local device discovery, and pairing"
        ]),
        currentVerifiedCapabilitiesSw: Object.freeze([
            "Live Camera Capture: kunasa halisi kwa mwoneko wa kamera/picha/kurekodi (kunasa tu, hakuna uboreshaji)",
            "Live Session: kipindi cha moja kwa moja cha watu kilichofungwa kikijumuisha kunasa + uwazi + muunganisho + utambulisho",
            "Live/Connectivity: foleni halisi ya nje ya mtandao, ugunduzi wa vifaa vya karibu, na uunganishaji"
        ]),
        visionCapabilities: Object.freeze([
            "unlimited one-to-many broadcast (SFU/CDN) - explicitly documented as CAPABILITY_UNAVAILABLE, not implemented anywhere in this repository"
        ]),
        visionCapabilitiesSw: Object.freeze([
            "matangazo yasiyo na kikomo ya mtu mmoja kwenda wengi (SFU/CDN) - yameainishwa waziwazi kama CAPABILITY_UNAVAILABLE, hayajatekelezwa popote katika hazina hii"
        ]),
        visionSourceNote: "Drawn directly from three real, separate registerApplication() calls and file headers: core/engines/video/ui/cozy-live-camera-capture-app.js, core/shell/live/cozy-live-session.js, and core/connectivity/ui/cozy-live-connectivity-app.js. No single 'LiveOS' application exists - this entry honestly discloses that rather than fabricating one."
    });

    const APPLICATION_HUMAN_PURPOSE_DATA = Object.freeze({
        pharmacyos: Object.freeze({
            humanPurpose: "PharmacyOS exists to give a pharmacy a real, structured record of its organization and medicine catalog, with controlled substances genuinely gated behind real authorization — so ordinary medicines are easy to record and find, while controlled substances are never accessible to someone without a real, granted permission.",
            humanPurposeSw: "PharmacyOS ipo ili kuipa duka la dawa rekodi halisi na iliyopangwa ya shirika lake na orodha ya dawa, huku dawa za kudhibitiwa zikiwa zimefungwa kweli nyuma ya idhini halisi — ili dawa za kawaida ziwe rahisi kurekodi na kuzipata, huku dawa za kudhibitiwa zisipatikane kamwe kwa mtu asiye na ruhusa halisi iliyotolewa.",
            realLifeProblems: Object.freeze([
                "no structured record of what medicines a pharmacy actually stocks",
                "controlled substances accessible to anyone with no real permission check"
            ]),
            realLifeProblemsSw: Object.freeze([
                "kutokuwa na rekodi iliyopangwa ya dawa ambazo duka la dawa linazo hasa",
                "dawa za kudhibitiwa kupatikana kwa mtu yeyote bila ukaguzi halisi wa ruhusa"
            ]),
            whoBenefits: Object.freeze(["pharmacy owners/administrators", "authorized pharmacy staff"]),
            whoBenefitsSw: Object.freeze(["wamiliki/wasimamizi wa maduka ya dawa", "wafanyakazi wa duka la dawa walioidhinishwa"]),
            humanBenefits: Object.freeze([
                "a real, auditable medicine catalog instead of informal records",
                "confidence that controlled-substance records are only ever seen or changed by someone with real, granted authorization"
            ]),
            humanBenefitsSw: Object.freeze([
                "orodha halisi ya dawa inayoweza kukaguliwa badala ya rekodi zisizo rasmi",
                "uhakika kwamba rekodi za dawa za kudhibitiwa zinaonekana au kubadilishwa tu na mtu mwenye idhini halisi iliyotolewa"
            ]),
            currentVerifiedCapabilities: Object.freeze([
                "real application registration through ServiceRegistry",
                "real pharmacy setup (setupPharmacy()) reusing the existing OrganizationRegistry - no second organization system",
                "a real medicine catalog: create, retrieve, list, and update a medicine record",
                "controlled-substance access delegated entirely to the existing IdentityEngine.checkPermission() - fails closed, never fabricates authorization",
                "real audit logging of every mutation"
            ]),
            currentVerifiedCapabilitiesSw: Object.freeze([
                "usajili halisi wa programu kupitia ServiceRegistry",
                "uanzishaji halisi wa duka la dawa (setupPharmacy()) ukitumia tena OrganizationRegistry iliyopo - hakuna mfumo wa pili wa shirika",
                "orodha halisi ya dawa: kuunda, kupata, kuorodhesha, na kusasisha rekodi ya dawa",
                "ufikiaji wa dawa za kudhibitiwa umekabidhiwa kikamilifu kwa IdentityEngine.checkPermission() iliyopo - hufunga wazi, haujawahi kubuni idhini",
                "urekodi halisi wa ukaguzi kwa kila mabadiliko"
            ]),
            visionCapabilities: Object.freeze([
                "prescription dispensing/verification",
                "patient records",
                "expiry/batch tracking",
                "stock-quantity/reorder logic",
                "clinical decision support",
                "payment processing"
            ]),
            visionCapabilitiesSw: Object.freeze([
                "utoaji/uthibitishaji wa dawa kwa agizo la daktari",
                "rekodi za wagonjwa",
                "ufuatiliaji wa muda wa kuisha/kundi la dawa",
                "mantiki ya kiasi cha hisa/kuagiza upya",
                "usaidizi wa maamuzi ya kimatibabu",
                "uchakataji wa malipo"
            ]),
            visionSourceNote: "PharmacyOS Phase 1 replaces a prior stub (core/plugins/pharmacyOS.js, core/ai/pharmacyHandler.js) that returned hardcoded, fabricated healthcare responses regardless of real input. This entry describes only the genuine Phase 1 implementation - none of the listed VISION items exist in code today, and none of the removed stub's fake claims are preserved here."
        }),
        wholesaleos: Object.freeze({
            humanPurpose: "WholesaleOS exists to let a wholesale buyer or seller see the real, wholesale-priced version of ShopOS's own product catalog — without a second, separate product list that could drift out of sync with what the shop actually sells.",
            humanPurposeSw: "WholesaleOS ipo ili kumwezesha mnunuzi au muuzaji wa jumla kuona toleo halisi lenye bei ya jumla la orodha ya bidhaa ya ShopOS yenyewe — bila orodha ya pili, tofauti ya bidhaa ambayo inaweza kutofautiana na kile duka linachouza hasa.",
            realLifeProblems: Object.freeze([
                "a wholesale price list kept separately from the shop's real product catalog, which can go out of date or disagree with the shop's own records",
                "no easy way to check whether a specific product actually has a wholesale price set at all"
            ]),
            realLifeProblemsSw: Object.freeze([
                "orodha ya bei za jumla inayowekwa kando na orodha halisi ya bidhaa za duka, ambayo inaweza kuwa ya zamani au kutokubaliana na rekodi za duka lenyewe",
                "hakuna njia rahisi ya kuangalia kama bidhaa fulani ina bei ya jumla iliyowekwa kabisa"
            ]),
            whoBenefits: Object.freeze(["wholesale buyers", "wholesale sellers using ShopOS's product catalog"]),
            whoBenefitsSw: Object.freeze(["wanunuzi wa jumla", "wauzaji wa jumla wanaotumia orodha ya bidhaa ya ShopOS"]),
            humanBenefits: Object.freeze([
                "a wholesale price list that can never disagree with the shop's own real product records, because it reads the same real data",
                "an honest answer (not a guess) when a specific product has no wholesale price set"
            ]),
            humanBenefitsSw: Object.freeze([
                "orodha ya bei za jumla ambayo haiwezi kamwe kutokubaliana na rekodi halisi za bidhaa za duka, kwa sababu inasoma data ile ile halisi",
                "jibu la kweli (si la kubahatisha) wakati bidhaa fulani haina bei ya jumla iliyowekwa"
            ]),
            currentVerifiedCapabilities: Object.freeze([
                "real application registration (a genuine, discoverable CozyOS application)",
                "a real shared catalog view (getSharedCatalog()) that reads ShopOS's own real product records (via ShopProduct.listProducts()) and surfaces each product's real wholesalePrice - never a second, duplicated catalog",
                "real single-product wholesale lookup (getProductForWholesale()) that honestly reports when a product has no wholesale price set, rather than inventing one"
            ]),
            currentVerifiedCapabilitiesSw: Object.freeze([
                "usajili halisi wa programu (programu halisi ya CozyOS inayoweza kutambulika)",
                "mwonekano halisi wa orodha inayoshirikiwa (getSharedCatalog()) unaosoma rekodi halisi za bidhaa za ShopOS yenyewe (kupitia ShopProduct.listProducts()) na kuonyesha bei halisi ya jumla ya kila bidhaa - kamwe si orodha ya pili, nakala",
                "utafutaji halisi wa bidhaa moja kwa jumla (getProductForWholesale()) unaoripoti kwa uaminifu wakati bidhaa haina bei ya jumla iliyowekwa, badala ya kubuni moja"
            ]),
            visionCapabilities: Object.freeze([
                "wholesaler directory",
                "chat/community features",
                "offline receipts",
                "debt reminders",
                "customer management",
                "phone book",
                "notes",
                "goals",
                "budgets",
                "planning",
                "integration with ShopOS/RetailOS/HawkerOS beyond the current shared-catalog read"
            ]),
            visionCapabilitiesSw: Object.freeze([
                "orodha ya wauzaji wa jumla",
                "vipengele vya mazungumzo/jamii",
                "risiti za nje ya mtandao",
                "vikumbusho vya madeni",
                "usimamizi wa wateja",
                "kitabu cha simu",
                "maelezo",
                "malengo",
                "bajeti",
                "upangaji",
                "muunganiko na ShopOS/RetailOS/HawkerOS zaidi ya usomaji wa sasa wa orodha inayoshirikiwa"
            ]),
            visionSourceNote: "This entry is drawn directly from wholesaleOS-core.js's own header, which explicitly documents itself as Phase 1 of a twelve-feature request and names the ten remaining, unbuilt features verbatim as a proposed phased roadmap (its own \"Constitution addendum\"). Wholesale ordering, inventory management, payment processing, supplier management, bulk purchasing, invoicing, and delivery/logistics were checked directly and are absent from both the implementation and this named roadmap - they are not listed as VISION here because no explicit evidence supports them as a planned direction, not merely because they are unbuilt."
        }),
        shopos: Object.freeze({
            humanPurpose: "ShopOS exists to give a retail shop a real, structured record of its branches and its products — a shared catalog it can trust, rather than product details scattered across memory, paper, or informal notes — so shop staff always know what a product actually is, what it costs, and whether it's still in stock or discontinued.",
            humanPurposeSw: "ShopOS ipo ili kulipa duka la rejareja rekodi halisi na iliyopangwa ya matawi yake na bidhaa zake — orodha inayoshirikiwa ambayo linaweza kuiamini, badala ya maelezo ya bidhaa yaliyotawanyika kwenye kumbukumbu, karatasi, au maelezo yasiyo rasmi — ili wafanyakazi wa duka wajue kila wakati bidhaa fulani ni nini hasa, inagharimu kiasi gani, na kama bado ipo dukani au imesitishwa.",
            realLifeProblems: Object.freeze([
                "inconsistent or duplicated product information across a shop's staff",
                "no reliable way to look a product up by barcode or SKU at the point of need",
                "products that are out of stock, archived, or discontinued still being treated as available",
                "no real branch-level structure to organize where products and staff belong"
            ]),
            realLifeProblemsSw: Object.freeze([
                "taarifa za bidhaa zisizo sawa au zinazorudiwa miongoni mwa wafanyakazi wa duka",
                "hakuna njia ya kuaminika ya kutafuta bidhaa kwa msimbo pau (barcode) au SKU wakati wa uhitaji",
                "bidhaa ambazo hazipo dukani, zimehifadhiwa, au zimesitishwa bado zikitendewa kama zinapatikana",
                "hakuna muundo halisi wa kiwango cha tawi wa kupanga mahali bidhaa na wafanyakazi wanapohusika"
            ]),
            whoBenefits: Object.freeze(["shop owners/administrators", "shop staff", "other CozyOS applications that need to read shop product data (e.g. WholesaleOS)"]),
            whoBenefitsSw: Object.freeze(["wamiliki/wasimamizi wa duka", "wafanyakazi wa duka", "programu nyingine za CozyOS zinazohitaji kusoma data ya bidhaa za duka (mfano WholesaleOS)"]),
            humanBenefits: Object.freeze([
                "a real, single source of truth for what products exist and their current status",
                "fast, reliable product lookup by barcode or SKU",
                "confidence that an archived or discontinued product won't be mistakenly treated as available",
                "real branch-level organization instead of an undifferentiated single shop record"
            ]),
            humanBenefitsSw: Object.freeze([
                "chanzo halisi kimoja cha ukweli kuhusu bidhaa zilizopo na hali yake ya sasa",
                "utafutaji wa haraka na wa kuaminika wa bidhaa kwa barcode au SKU",
                "uhakika kwamba bidhaa iliyohifadhiwa au iliyositishwa haitatendewa kimakosa kama inapatikana",
                "upangaji halisi wa kiwango cha tawi badala ya rekodi moja isiyobainishwa ya duka"
            ]),
            currentVerifiedCapabilities: Object.freeze([
                "branch registration and listing (registerBranch()/listBranches())",
                "real login delegated entirely to the existing IdentityEngine - no separate/duplicate authentication logic",
                "real permission checking delegated entirely to the existing IdentityEngine (checkPermission())",
                "a real product catalog: create, retrieve, find by barcode, find by SKU, list (filterable by category/status), update, archive, and discontinue a product",
                "a real wholesalePrice field on each product, which WholesaleOS's own real getProductForWholesale() reads directly - confirmed as the shared, single product source, not a duplicate",
                "catalog export/import snapshot support",
                "real audit logging of these actions"
            ]),
            currentVerifiedCapabilitiesSw: Object.freeze([
                "usajili na uorodheshaji wa matawi (registerBranch()/listBranches())",
                "kuingia kwa mfumo halisi kumekabidhiwa kikamilifu kwa IdentityEngine iliyopo - hakuna mantiki tofauti/nakala ya uthibitishaji",
                "ukaguzi halisi wa ruhusa umekabidhiwa kikamilifu kwa IdentityEngine iliyopo (checkPermission())",
                "orodha halisi ya bidhaa: kuunda, kupata, kutafuta kwa barcode, kutafuta kwa SKU, kuorodhesha (kuchuja kwa kategoria/hali), kusasisha, kuhifadhi, na kusitisha bidhaa",
                "sehemu halisi ya wholesalePrice kwenye kila bidhaa, ambayo getProductForWholesale() halisi ya WholesaleOS husoma moja kwa moja - imethibitishwa kuwa chanzo kimoja kinachoshirikiwa cha bidhaa, si nakala",
                "uwezo wa kuhamisha/kuingiza picha ya orodha",
                "urekodi halisi wa ukaguzi wa vitendo hivi"
            ]),
            visionCapabilities: Object.freeze([
                "sales/checkout/point-of-sale processing - no such capability exists anywhere in the current ShopOS implementation",
                "customer-facing order management - not present today",
                "payment processing - not present today (MpesaOS's real transaction processing is a separate, unconnected system)",
                "inventory quantity/stock-level tracking beyond a product's status field - no quantity-on-hand concept exists today"
            ]),
            visionCapabilitiesSw: Object.freeze([
                "uchakataji wa mauzo/malipo dukani (point-of-sale) - uwezo huu haupo popote katika utekelezaji wa sasa wa ShopOS",
                "usimamizi wa oda unaomwelekea mteja - haupo kwa sasa",
                "uchakataji wa malipo - haupo kwa sasa (uchakataji halisi wa miamala wa MpesaOS ni mfumo tofauti, usiounganishwa)",
                "ufuatiliaji wa kiasi/hisa cha bidhaa zaidi ya sehemu ya hali ya bidhaa - hakuna dhana ya kiasi kilichopo kwa sasa"
            ]),
            visionSourceNote: "Confirmed by direct inspection of core/plugins/shopOS-core.js and shopOS-product.js: ShopOS today is a real branch + product-catalog system only. No sales, checkout, payment, or stock-quantity capability exists in the current implementation, despite the application's retail-sounding name."
        }),
        mpesaos: Object.freeze({
            humanPurpose: "MpesaOS exists to let a business process mobile-money transactions correctly and honestly — charging the right fee, recording the right commission, and keeping a real, tamper-evident record of every transaction — so business owners and their customers can trust that money moving through the system is calculated and recorded accurately.",
            humanPurposeSw: "MpesaOS ipo ili kuiwezesha biashara kuchakata miamala ya pesa za simu kwa usahihi na kwa uaminifu — kutoza ada sahihi, kurekodi kamisheni sahihi, na kutunza rekodi halisi, isiyoweza kubadilishwa bila kujulikana, ya kila muamala — ili wamiliki wa biashara na wateja wao waweze kuamini kwamba pesa zinazopita kwenye mfumo zinahesabiwa na kurekodiwa kwa usahihi.",
            realLifeProblems: Object.freeze([
                "incorrect or inconsistent fee/commission charged to customers",
                "no real, verifiable record of what happened in a transaction",
                "processing transactions for a company/branch or payment channel that isn't actually valid or registered",
                "duplicate or conflicting concurrent transaction processing",
                "manually re-entering a returning customer's details for every transaction"
            ]),
            realLifeProblemsSw: Object.freeze([
                "ada/kamisheni isiyo sahihi au isiyo thabiti inayotozwa kwa wateja",
                "hakuna rekodi halisi, inayoweza kuthibitishwa ya kilichotokea kwenye muamala",
                "kuchakata miamala kwa kampuni/tawi au njia ya malipo ambayo si halali au haijasajiliwa hasa",
                "uchakataji wa miamala inayorudiwa au inayogongana kwa wakati mmoja",
                "kuingiza tena kwa mkono maelezo ya mteja anayerudi kwa kila muamala"
            ]),
            whoBenefits: Object.freeze(["business owners/administrators using MpesaOS", "their customers making mobile-money payments", "auditors or anyone needing to verify a transaction later"]),
            whoBenefitsSw: Object.freeze(["wamiliki/wasimamizi wa biashara wanaotumia MpesaOS", "wateja wao wanaofanya malipo ya pesa za simu", "wakaguzi au mtu yeyote anayehitaji kuthibitisha muamala baadaye"]),
            humanBenefits: Object.freeze([
                "correct, consistent fee/commission calculation on every transaction",
                "a tamper-evident (SHA-256) audit record of each transaction",
                "protection against processing transactions under an unregistered or archived company/branch",
                "protection against an invalid payment channel being used",
                "faster service for returning customers via real customer lookup instead of re-entry"
            ]),
            humanBenefitsSw: Object.freeze([
                "uhesabuji sahihi na thabiti wa ada/kamisheni kwa kila muamala",
                "rekodi ya ukaguzi isiyoweza kubadilishwa bila kujulikana (SHA-256) ya kila muamala",
                "ulinzi dhidi ya kuchakata miamala chini ya kampuni/tawi lisilosajiliwa au lililohifadhiwa",
                "ulinzi dhidi ya matumizi ya njia ya malipo isiyo halali",
                "huduma ya haraka zaidi kwa wateja wanaorudi kupitia utafutaji halisi wa mteja badala ya kuingiza tena"
            ]),
            currentVerifiedCapabilities: Object.freeze([
                "real tiered tariff lookup and fee/commission calculation (calculateCharges())",
                "real transaction-type validation limited to an explicit supported set (Deposit, Withdrawal, Till Payment, Paybill Payment, Customer Payment, Business Collection)",
                "real Company/Branch validation reusing the existing Company coordinator - refuses an unknown or archived company/branch rather than proceeding",
                "real payment-channel validation reusing the existing PaymentChannel coordinator",
                "real customer resolution reusing the existing Customer coordinator (lookup by phone, or creates a new real customer record)",
                "real concurrency locking around transaction processing (_acquireLock/_releaseLock)",
                "a real, genuine SHA-256 audit hash computed over each recorded transaction block (calculateAuditHash()), not a placeholder"
            ]),
            currentVerifiedCapabilitiesSw: Object.freeze([
                "utafutaji halisi wa viwango vya ngazi na uhesabuji wa ada/kamisheni (calculateCharges())",
                "uthibitishaji halisi wa aina ya muamala uliozuiliwa kwenye orodha maalum inayotambulika (Deposit, Withdrawal, Till Payment, Paybill Payment, Customer Payment, Business Collection)",
                "uthibitishaji halisi wa Kampuni/Tawi ukitumia tena Company coordinator iliyopo - hukataa kampuni/tawi lisilojulikana au lililohifadhiwa badala ya kuendelea",
                "uthibitishaji halisi wa njia ya malipo ukitumia tena PaymentChannel coordinator iliyopo",
                "utambuzi halisi wa mteja ukitumia tena Customer coordinator iliyopo (kutafuta kwa namba ya simu, au kuunda rekodi mpya halisi ya mteja)",
                "ufungaji halisi wa muda mmoja kuzunguka uchakataji wa muamala (_acquireLock/_releaseLock)",
                "hashi halisi ya ukaguzi ya SHA-256 inayohesabiwa juu ya kila kizuizi cha muamala kilichorekodiwa (calculateAuditHash()), si nafasi tupu"
            ]),
            visionCapabilities: Object.freeze([
                "real customer identity/KYC scanning - scanIntake() currently returns hardcoded demonstration values (a fixed name, ID number, phone, and confidence score) regardless of real input, and is not a genuine identity-verification capability today",
                "payment conflict/reconciliation support (comparing a customer's stated payment against the authoritative ledger) - confirmed absent from the current implementation during an earlier architectural discovery pass",
                "an external, safe command interface so other CozyOS surfaces (e.g. natural-language record capture) could reach MpesaOS's real transaction processing - none exists today"
            ]),
            visionCapabilitiesSw: Object.freeze([
                "uchunguzi halisi wa utambulisho/KYC wa mteja - scanIntake() kwa sasa hurejesha thamani za maonyesho zilizowekwa (jina, namba ya kitambulisho, simu, na alama ya uhakika) bila kujali data halisi, na si uwezo halisi wa uthibitishaji wa utambulisho kwa sasa",
                "usaidizi wa mgongano/upatanisho wa malipo (kulinganisha malipo aliyosema mteja na daftari lenye mamlaka) - imethibitishwa kutokuwepo katika utekelezaji wa sasa wakati wa uchunguzi wa awali wa muundo",
                "kiolesura salama cha nje cha amri ili nyuso nyingine za CozyOS (mfano, unukuzi wa lugha asilia) ziweze kufikia uchakataji halisi wa miamala wa MpesaOS - hakuna kilichopo kwa sasa"
            ]),
            visionSourceNote: "Corrected against direct source inspection of core/plugins/mpesaOS-engine.js: scanIntake() is a real function but returns fixed, hardcoded values regardless of input — it does not perform genuine identity verification today, and is recorded here as VISION, not current capability."
        }),
        quarryos: Object.freeze({
            humanPurpose: "QuarryOS exists to give a quarry/mining business a real, working record of its people, money, and equipment — so owners and staff can trust the numbers they use to pay workers, bill customers, and catch problems (fuel theft, machine inefficiency, unpaid debts) before they become bigger losses.",
            humanPurposeSw: "QuarryOS ipo ili kuipa biashara ya machimbo/madini rekodi halisi na inayofanya kazi ya watu wake, fedha zake, na vifaa vyake — ili wamiliki na wafanyakazi waweze kuamini namba wanazotumia kulipa wafanyakazi, kutoza ankara wateja, na kubaini matatizo (wizi wa mafuta, ufanisi mdogo wa mashine, madeni yasiyolipwa) kabla hayajawa hasara kubwa zaidi.",
            realLifeProblems: Object.freeze([
                "manual, error-prone payroll and loan tracking for a physically distributed workforce",
                "difficulty tracking which trucks/drivers delivered what, and when",
                "fuel purchases and issues that are hard to reconcile, enabling undetected theft",
                "customer debt and sales records kept informally or inconsistently",
                "land-owner royalty obligations that are hard to calculate and prove fairly",
                "no easy way to see which machines or drivers are underperforming"
            ]),
            realLifeProblemsSw: Object.freeze([
                "uhesabuji wa mishahara na mikopo wa mkono, wenye makosa, kwa wafanyakazi waliotawanyika kimwili",
                "ugumu wa kufuatilia ni malori/madereva gani waliopeleka nini, na lini",
                "manunuzi na matumizi ya mafuta ambayo ni magumu kupatanisha, hivyo kuruhusu wizi usiobainika",
                "madeni ya wateja na rekodi za mauzo zinazotunzwa bila mpangilio rasmi au kwa kutofautiana",
                "wajibu wa mrabaha kwa wamiliki wa ardhi ambao ni mgumu kuhesabu na kuthibitisha kwa haki",
                "hakuna njia rahisi ya kuona ni mashine au madereva gani wenye utendaji dhaifu"
            ]),
            whoBenefits: Object.freeze(["quarry owners/administrators", "accountants", "sales staff", "drivers and supervisors", "land owners owed royalties", "customers"]),
            whoBenefitsSw: Object.freeze(["wamiliki/wasimamizi wa machimbo", "wahasibu", "wafanyakazi wa mauzo", "madereva na wasimamizi", "wamiliki wa ardhi wanaostahili mrabaha", "wateja"]),
            humanBenefits: Object.freeze([
                "accurate, auditable payroll including loan deductions",
                "a real record of deliveries, fuel use, and machine hours instead of memory or paper",
                "earlier detection of fuel theft, excessive machine downtime, or repeated worker absences",
                "fair, calculable royalty statements for land owners",
                "a real sales/invoicing/receipt trail with customers",
                "data-driven answers to real operational questions instead of guesswork"
            ]),
            humanBenefitsSw: Object.freeze([
                "mishahara sahihi, inayoweza kukaguliwa ikiwa ni pamoja na makato ya mikopo",
                "rekodi halisi ya usafirishaji, matumizi ya mafuta, na masaa ya mashine badala ya kumbukumbu au karatasi",
                "ubaini wa mapema wa wizi wa mafuta, muda mrefu wa mashine kutofanya kazi, au utoro wa mara kwa mara wa wafanyakazi",
                "taarifa za mrabaha za haki, zinazoweza kuhesabiwa kwa wamiliki wa ardhi",
                "mfuatano halisi wa mauzo/ankara/risiti na wateja",
                "majibu yanayotokana na data kwa maswali halisi ya uendeshaji badala ya kubahatisha"
            ]),
            currentVerifiedCapabilities: Object.freeze([
                "employee registry: register, update, suspend, terminate, transfer",
                "a real role-based permission matrix (roleMatrix/_checkPermission) governing which role can perform which action",
                "loans and salary advances with repayment tracking and balance lookup",
                "customer registration and updates",
                "quotations, sales orders, invoicing, and receipts",
                "real payroll calculation: gross = daily rate + bonus − penalty − loan deduction, with automatic loan-installment deduction",
                "truck dispatch: assignment, departure/arrival logging, delivery confirmation (executeDispatchEvent)",
                "driver registration, updates, and violation logging",
                "fuel purchase and issue logging, with explicit theft flagging",
                "machine-hours and crusher-production logging",
                "generic stock-level adjustment and lookup",
                "land-owner royalty: rate setting, accrual logging, statement generation, and settlement",
                "expense logging and report generation",
                "several genuinely data-driven AI-advisor analyses (least-efficient machine, driver delay, excess fuel use, repeated absences, top debtor) that honestly report insufficient data when none exists"
            ]),
            currentVerifiedCapabilitiesSw: Object.freeze([
                "orodha ya wafanyakazi: kusajili, kusasisha, kusimamisha, kufukuza, kuhamisha",
                "jedwali halisi la ruhusa kulingana na wadhifa (roleMatrix/_checkPermission) linaloamua ni wadhifa gani unaoweza kufanya tendo gani",
                "mikopo na malipo ya awali ya mshahara yenye ufuatiliaji wa marejesho na utafutaji wa salio",
                "usajili na usasishaji wa wateja",
                "nukuu za bei, oda za mauzo, ankara, na risiti",
                "uhesabuji halisi wa mshahara: jumla = kiwango cha kila siku + bonasi − adhabu − makato ya mkopo, ikiwa na makato ya awamu ya mkopo kiotomatiki",
                "usafirishaji wa malori: mgao, urekodi wa kuondoka/kuwasili, uthibitisho wa uwasilishaji (executeDispatchEvent)",
                "usajili wa madereva, usasishaji, na urekodi wa makosa",
                "urekodi wa manunuzi na matumizi ya mafuta, ukiwa na alama wazi ya wizi",
                "urekodi wa masaa ya mashine na uzalishaji wa mashine ya kusaga",
                "urekebishaji na utafutaji wa jumla wa kiwango cha hisa",
                "mrabaha wa mwenye ardhi: uwekaji wa kiwango, urekodi wa mkusanyiko, uzalishaji wa taarifa, na malipo",
                "urekodi wa matumizi na uzalishaji wa ripoti",
                "uchambuzi kadhaa wa kweli, unaotegemea data wa mshauri wa AI (mashine yenye ufanisi mdogo zaidi, ucheleweshaji wa dereva, matumizi makubwa ya mafuta, utoro wa mara kwa mara, mdaiwa mkubwa zaidi) unaoripoti kwa uaminifu data isiyotosha pale isipokuwepo"
            ]),
            visionCapabilities: Object.freeze([
                "a dedicated company-setup flow (no register/setup-company action currently exists, unlike ChurchOS's real setupChurch())",
                "a dedicated weighbridge capability (no weighbridge-related code currently exists anywhere in QuarryOS)",
                "a dedicated stone-product catalog distinct from generic stock tracking (no product/catalog-specific code currently exists)",
                "a dedicated loading-bay capability (only a loadingTime field exists inside another payload today, not a standalone action)",
                "fixing the one AI-advisor query pattern (\"profit\") that currently returns a hardcoded demonstration string rather than a genuine calculation",
                "an external, safe command interface so other CozyOS surfaces (e.g. natural-language record capture) could reach QuarryOS's real actions - none exists today"
            ]),
            visionCapabilitiesSw: Object.freeze([
                "mchakato maalum wa uanzishaji wa kampuni (hakuna tendo la register/setup-company lililopo kwa sasa, tofauti na setupChurch() halisi ya ChurchOS)",
                "uwezo maalum wa mzani wa kupimia (weighbridge) (hakuna msimbo unaohusiana na mzani wa kupimia uliopo popote katika QuarryOS)",
                "orodha maalum ya bidhaa za mawe tofauti na ufuatiliaji wa jumla wa hisa (hakuna msimbo maalum wa bidhaa/orodha uliopo)",
                "uwezo maalum wa eneo la upakiaji (sehemu ya loadingTime pekee ndiyo iliyopo ndani ya kizuizi kingine cha data leo, si tendo linalojitegemea)",
                "kurekebisha muundo mmoja wa maswali ya mshauri wa AI (\"faida\") ambao kwa sasa hurejesha maandishi ya maonyesho yaliyowekwa badala ya uhesabuji halisi",
                "kiolesura salama cha nje cha amri ili nyuso nyingine za CozyOS (mfano, unukuzi wa lugha asilia) ziweze kufikia matendo halisi ya QuarryOS - hakuna kilichopo kwa sasa"
            ]),
            visionSourceNote: "Corrected against direct source inspection of core/modules/QuarryOS/quarry-index.js: several commonly-assumed QuarryOS capabilities (dedicated company setup, weighbridge, a distinct stone-product catalog, and a standalone loading action) do not exist in the current implementation and are recorded here as VISION, not current capability, even though they are sometimes assumed to already exist."
        }),
        churchos: Object.freeze({
            humanPurpose: "ChurchOS exists to give churches and faith communities a digital foundation that helps them organize their work, serve people, preserve church knowledge, communicate, participate across languages and locations, and progressively use CozyOS intelligence to reduce unnecessary administrative burden — so church workers can spend less time on fragmented administration and more time serving people and the community.",
            humanPurposeSw: "ChurchOS ipo ili kuzipa makanisa na jumuiya za kiimani msingi wa kidijitali unaowasaidia kupanga kazi zao, kuwahudumia watu, kuhifadhi maarifa ya kanisa, kuwasiliana, kushiriki katika lugha na maeneo mbalimbali, na kutumia hatua kwa hatua akili ya CozyOS kupunguza mzigo usio wa lazima wa kiutawala — ili wafanyakazi wa kanisa watumie muda mchache kwenye utawala uliogawanyika na muda mwingi zaidi kuwahudumia watu na jamii.",
            realLifeProblems: Object.freeze([
                "fragmented church/member information",
                "difficult access to church records",
                "administrative workload",
                "communication difficulties",
                "language barriers",
                "difficulty preserving sermons, testimonies, and church knowledge",
                "difficulty connecting congregations across countries",
                "difficulty providing useful information to leaders",
                "difficulty organizing events and church activities",
                "difficulty preserving church history",
                "accessibility barriers",
                "difficulty turning live church activity into useful searchable knowledge",
                "difficulty separating information intended for physical attendees from public/online audiences",
                "lack of unified digital assistance for church administration"
            ]),
            realLifeProblemsSw: Object.freeze([
                "taarifa za kanisa/wanachama zilizogawanyika",
                "ugumu wa kufikia rekodi za kanisa",
                "mzigo wa kiutawala",
                "ugumu wa mawasiliano",
                "vikwazo vya lugha",
                "ugumu wa kuhifadhi mahubiri, ushuhuda, na maarifa ya kanisa",
                "ugumu wa kuunganisha makanisa katika nchi mbalimbali",
                "ugumu wa kutoa taarifa muhimu kwa viongozi",
                "ugumu wa kupanga matukio na shughuli za kanisa",
                "ugumu wa kuhifadhi historia ya kanisa",
                "vikwazo vya ufikivu",
                "ugumu wa kubadilisha shughuli za moja kwa moja za kanisa kuwa maarifa muhimu yanayoweza kutafutwa",
                "ugumu wa kutenganisha taarifa zilizokusudiwa kwa waliohudhuria kimwili na hadhira ya umma/mtandaoni",
                "kukosekana kwa msaada wa kidijitali ulioungana kwa utawala wa kanisa"
            ]),
            whoBenefits: Object.freeze([
                "church administrators", "pastors", "church leaders", "ministry teams",
                "church workers", "members", "families", "congregations",
                "congregations across countries", "people participating remotely",
                "people who need language/accessibility assistance"
            ]),
            whoBenefitsSw: Object.freeze([
                "wasimamizi wa kanisa",
                "wachungaji",
                "viongozi wa kanisa",
                "timu za huduma",
                "wafanyakazi wa kanisa",
                "wanachama",
                "familia",
                "makutaniko",
                "makutaniko katika nchi mbalimbali",
                "watu wanaoshiriki kwa mbali",
                "watu wanaohitaji msaada wa lugha/ufikivu"
            ]),
            humanBenefits: Object.freeze([
                "easier church administration", "easier access to authorized church information",
                "less repetitive administrative work", "better organization", "better communication",
                "multilingual participation", "improved understanding of sermons and church content",
                "preservation of church knowledge", "preservation and retrieval of testimonies",
                "preservation of church history", "better visibility into attendance and relevant church information",
                "better coordination of church activities", "improved accessibility",
                "ability to connect people across countries",
                "better use of church information for legitimate decision support",
                "continuity between live church activity and preserved/searchable knowledge"
            ]),
            humanBenefitsSw: Object.freeze([
                "utawala rahisi zaidi wa kanisa",
                "ufikiaji rahisi zaidi wa taarifa za kanisa zilizoidhinishwa",
                "kupungua kwa kazi za kiutawala zinazorudiwa",
                "mpangilio bora",
                "mawasiliano bora",
                "ushiriki wa lugha nyingi",
                "uelewa bora wa mahubiri na maudhui ya kanisa",
                "uhifadhi wa maarifa ya kanisa",
                "uhifadhi na upatikanaji wa ushuhuda",
                "uhifadhi wa historia ya kanisa",
                "mwonekano bora wa mahudhurio na taarifa muhimu za kanisa",
                "uratibu bora wa shughuli za kanisa",
                "ufikivu ulioboreshwa",
                "uwezo wa kuunganisha watu katika nchi mbalimbali",
                "matumizi bora ya taarifa za kanisa kusaidia maamuzi halali",
                "mwendelezo kati ya shughuli za moja kwa moja za kanisa na maarifa yaliyohifadhiwa/yanayoweza kutafutwa"
            ]),
            currentVerifiedCapabilities: Object.freeze([
                "setupChurch() — reuses the real, existing OrganizationRegistry, no second organization system",
                "member creation, retrieval, and listing",
                "country-filtered member listing",
                "membership reporting (publishMembershipReport())"
            ]),
            // DEEP APPLICATION CAPABILITY AUDIT (repository-verified,
            // not assumed) — the 3-way distinction the architecture
            // correction requires: an underlying capability existing
            // elsewhere in CozyOS is NOT the same as it being connected
            // to ChurchOS, and neither is the same as an idea that has
            // no real implementation anywhere yet.
            implementedAwaitingConnection: Object.freeze([
                "Testimony/media search by person name: core/modules/intelligence/media/cozy-media-intelligence.js's real, working searchByPersonReference() (deterministic keyword matching, NOT face/voice recognition - see its own file header) exists and is fully functional today, but churchOS-core.js contains zero reference to it - no code currently lets a church search testimony media through ChurchOS. Connecting the two is a real, achievable integration (Media Intelligence already accepts a person-reference string), not new invention.",
                "Kiswahili<->English live translation: core/modules/translate/translation-service.js's real NLLB-based translation engine exists and is functional, as does a real per-user language preference in identity-engine.js, but neither is referenced anywhere in core/shell/live/cozy-live-session.js or churchOS-core.js - no code currently applies translation to any church live-session content."
            ]),
            implementedAwaitingConnectionSw: Object.freeze([
                "Utafutaji wa ushuhuda/media kwa jina la mtu: kazi halisi na inayofanya kazi ya searchByPersonReference() katika core/modules/intelligence/media/cozy-media-intelligence.js (ulinganishaji wa maneno muhimu ulio wazi, SIYO utambuzi wa uso/sauti - angalia kichwa cha faili yenyewe) ipo na inafanya kazi leo, lakini churchOS-core.js haina rejeleo lolote kwake - hakuna msimbo unaomruhusu kanisa kutafuta maudhui ya ushuhuda kupitia ChurchOS kwa sasa. Kuunganisha hizo mbili ni uunganishaji halisi, unaowezekana (Media Intelligence tayari inakubali maandishi ya rejeleo la mtu), si uvumbuzi mpya.",
                "Tafsiri ya moja kwa moja Kiswahili<->Kiingereza: injini halisi ya tafsiri inayotegemea NLLB katika core/modules/translate/translation-service.js ipo na inafanya kazi, vilevile mapendeleo halisi ya lugha ya kila mtumiaji katika identity-engine.js, lakini hakuna inayorejelewa popote katika core/shell/live/cozy-live-session.js au churchOS-core.js - hakuna msimbo unaotumia tafsiri kwa maudhui yoyote ya kikao cha moja kwa moja cha kanisa kwa sasa."
            ]),
            partiallyImplemented: Object.freeze([
                "\"Same person\" automatic testimony matching: the searchByPersonReference() connection above could let a church search by a person's NAME, but the desired behavior of automatically recognizing/matching a specific person's FACE or VOICE across video (\"scan and produce the same person in seconds\") requires face/voice recognition, which this repository's Media Intelligence explicitly does not implement anywhere (\"NO FABRICATION\" section, cozy-media-intelligence.js) - only the name-based search half of this idea has a real implementation to connect to."
            ]),
            partiallyImplementedSw: Object.freeze([
                "Ulinganishaji wa kiotomatiki wa \"mtu yuleyule\" katika ushuhuda: muunganiko wa searchByPersonReference() hapo juu unaweza kuruhusu kanisa kutafuta kwa JINA la mtu, lakini tabia inayotakiwa ya kutambua/kulinganisha kiotomatiki USO au SAUTI ya mtu fulani katika video (\"kuchanganua na kutoa mtu yuleyule kwa sekunde\") inahitaji utambuzi wa uso/sauti, ambao Media Intelligence ya hazina hii haitekelezi popote waziwazi (sehemu ya \"NO FABRICATION\", cozy-media-intelligence.js) - ni nusu ya wazo hili inayotegemea jina pekee ndiyo ina utekelezaji halisi wa kuunganisha."
            ]),
            currentVerifiedCapabilitiesSw: Object.freeze([
                "setupChurch() — hutumia tena OrganizationRegistry halisi iliyopo, hakuna mfumo wa pili wa shirika",
                "uundaji, upatikanaji, na uorodheshaji wa wanachama",
                "uorodheshaji wa wanachama uliochujwa kwa nchi",
                "uripoti wa uanachama (publishMembershipReport())"
            ]),
            visionCapabilities: Object.freeze([
                "sermon/testimony knowledge preservation and search",
                "prayer/ministry organization",
                "member care and follow-up",
                "church history preservation",
                "multilingual participation, including Kiswahili-first live translation for sermons",
                "accessibility improvements",
                "global congregation connection",
                "administrative simplification via notification/document/calendar/event/communication tooling",
                "knowledge discovery over church content",
                "church analytics",
                "continuity between live church activity and preserved, searchable knowledge",
                "human decision support for church leaders",
                "privacy-aware separation of physical-attendee-only content from public/online audiences",
                "private, selective-audience audio during a live session (e.g. a pastor speaking to only present members while online viewers do not hear it) - no multi-participant/selective-audio-channel architecture exists in core/shell/live/cozy-live-session.js today (it supports one bounded peer connection, not audience-scoped audio routing)",
                "private real-time leadership/security communication during an ongoing live session - no messaging/private-channel system exists anywhere in this repository (the only related module, living-message-engine.js, is a single-field UI text display, not a communication channel)",
                "one-to-many live video broadcast to all joined members - core/shell/live/cozy-live-session.js supports one bounded peer connection only; unlimited one-to-many broadcast (SFU/CDN) is explicitly documented elsewhere in this codebase as CAPABILITY_UNAVAILABLE and not implemented anywhere in this repository"
            ]),
            visionCapabilitiesSw: Object.freeze([
                "uhifadhi na utafutaji wa maarifa ya mahubiri/ushuhuda",
                "upangaji wa maombi/huduma",
                "utunzaji na ufuatiliaji wa wanachama",
                "uhifadhi wa historia ya kanisa",
                "ushiriki wa lugha nyingi, ikiwa ni pamoja na tafsiri ya moja kwa moja yenye kipaumbele cha Kiswahili kwa mahubiri",
                "maboresho ya ufikivu",
                "muunganiko wa kimataifa wa makutaniko",
                "urahisishaji wa kiutawala kupitia zana za arifa/hati/kalenda/tukio/mawasiliano",
                "ugunduzi wa maarifa kutoka kwa maudhui ya kanisa",
                "uchambuzi wa data wa kanisa",
                "mwendelezo kati ya shughuli za moja kwa moja za kanisa na maarifa yaliyohifadhiwa, yanayoweza kutafutwa",
                "usaidizi wa maamuzi ya kibinadamu kwa viongozi wa kanisa",
                "utenganishaji unaozingatia faragha wa maudhui yaliyokusudiwa kwa waliohudhuria kimwili pekee dhidi ya hadhira ya umma/mtandaoni"
            ]),
            visionSourceNote: "Broader engine vision is referenced by existing source documentation (core/plugins/churchOS-core.js's own header cites a companion CHURCHOS_ENGINE_AUDIT.md), but that referenced document was not available for direct inspection in this repository — its exact contents are not fabricated here."
        }),
        interestos: Object.freeze({
            humanPurpose: "InterestOS exists to be the user's own directive, planning, teaching, and personal-work coordination space inside CozyOS — a place to tell CozyOS what to do, teach it what you know, track your goals, keep real reminders, run real calculations, and keep hold of your own documents, all without losing them to a phone gallery, a paper pile, or a past conversation you can no longer find.",
            humanPurposeSw: "InterestOS ipo kuwa nafasi ya mtumiaji mwenyewe ya maagizo, mipango, ufundishaji, na uratibu wa kazi binafsi ndani ya CozyOS — mahali pa kuiambia CozyOS ifanye nini, kuifundisha unachokijua, kufuatilia malengo yako, kuweka vikumbusho halisi, kufanya uhesabuji halisi, na kutunza hati zako mwenyewe, yote bila kuzipoteza kwenye picha za simu, rundo la karatasi, au mazungumzo ya zamani usiyoweza tena kuyapata.",
            realLifeProblems: Object.freeze([
                "losing important paperwork (a receipt, a contract, a delivery note) or having no safe place to keep it",
                "forgetting what you told CozyOS to remind you about, with no single place to check what's still coming up",
                "a completed reminder leaving its directive stuck showing as still active",
                "having no simple way to give CozyOS a personal directive, teach it something, or track a goal outside of a single application"
            ]),
            realLifeProblemsSw: Object.freeze([
                "kupoteza hati muhimu (risiti, mkataba, noti ya uwasilishaji) au kutokuwa na mahali salama pa kuzitunza",
                "kusahau ulichomwomba CozyOS akukumbushe, bila mahali pamoja pa kuangalia yale bado yanayokuja",
                "kikumbusho kilichokamilika kuacha agizo lake likionekana bado hai",
                "kutokuwa na njia rahisi ya kumpa CozyOS agizo la kibinafsi, kumfundisha kitu, au kufuatilia lengo nje ya programu moja"
            ]),
            whoBenefits: Object.freeze(["individual users", "small-business owners"]),
            whoBenefitsSw: Object.freeze(["watumiaji binafsi", "wamiliki wa biashara ndogo"]),
            humanBenefits: Object.freeze([
                "one place to find a document again when it's needed, kept privately and only accessible to its real owner",
                "a quick, honest answer to what you've asked CozyOS to remind you about, with a real way to close the loop once it's handled",
                "confirm-before-persist directives, so an imperfect guess at what you meant is corrected by you before anything is saved",
                "honestly labeled, user-taught knowledge (Teach Cozy) instead of an assumption presented as fact"
            ]),
            humanBenefitsSw: Object.freeze([
                "mahali pamoja pa kuipata tena hati inapohitajika, ikitunzwa kwa faragha na kufikiwa tu na mmiliki wake halisi",
                "jibu la haraka na la kweli kuhusu ulichomwomba CozyOS akukumbushe, na njia halisi ya kukamilisha jambo hilo baada ya kulishughulikia",
                "maagizo yanayothibitishwa kabla ya kuhifadhiwa, ili dhana isiyo kamili ya ulichomaanisha irekebishwe na wewe kabla ya kitu chochote kuhifadhiwa",
                "maarifa yaliyofundishwa na mtumiaji (Teach Cozy) yaliyowekwa alama kwa uaminifu badala ya dhana inayowasilishwa kama ukweli"
            ]),
            currentVerifiedCapabilities: Object.freeze([
                "user directives with a confirm-before-persist draft step, backed by CozyMemory",
                "Teach Cozy — user-taught knowledge saved with honest provenance, not claimed as system-verified",
                "My Goals — a real, direct passthrough to the existing Goals engine, no separate goals system",
                "one-time reminders, now persisted across a page reload via real IndexedDB storage (previously tab-lifetime only)",
                "My Reminders — a real, owner-isolated list read from the same records scheduleOneTimeReminder() writes, with a real 'Mark done' action",
                "real business/construction/church Calculations, a pure passthrough to the existing FormulaRegistry/CalculationEngine",
                "My Documents — real, durable, owner-isolated document list/save/search/upload/download via InterestOSDocumentsClient, personal for individual users and organization-scoped for company users",
                "document attachment from three real, verified sources: Camera, Photos, and Files"
            ]),
            currentVerifiedCapabilitiesSw: Object.freeze([
                "maagizo ya mtumiaji yenye hatua ya rasimu inayothibitishwa kabla ya kuhifadhiwa, yakitegemea CozyMemory",
                "Teach Cozy — maarifa yaliyofundishwa na mtumiaji yakihifadhiwa na chanzo cha uaminifu, bila kudai kuwa yamethibitishwa na mfumo",
                "My Goals — muunganiko halisi wa moja kwa moja kwenye injini ya Goals iliyopo, hakuna mfumo tofauti wa malengo",
                "vikumbusho vya mara moja, sasa vinavyodumu baada ya kupakia upya ukurasa kupitia hifadhi halisi ya IndexedDB (hapo awali vilikuwepo tu wakati kichupo kikiwa wazi)",
                "My Reminders — orodha halisi, iliyotengwa kwa mmiliki, inayosomwa kutoka rekodi zilezile scheduleOneTimeReminder() huandika, ikiwa na tendo halisi la 'Mark done'",
                "uhesabuji halisi wa biashara/ujenzi/kanisa, muunganiko safi kwenye FormulaRegistry/CalculationEngine iliyopo",
                "My Documents — orodha halisi, ya kudumu, iliyotengwa kwa mmiliki ya hati za kuorodhesha/kuhifadhi/kutafuta/kupakia/kupakua kupitia InterestOSDocumentsClient, ya binafsi kwa watumiaji binafsi na ya shirika kwa watumiaji wa kampuni",
                "kuambatanisha hati kutoka vyanzo vitatu halisi, vilivyothibitishwa: Kamera, Picha, na Faili"
            ]),
            visionCapabilities: Object.freeze([
                "PDF generation, OCR, sharing, and printing for documents",
                "Scanner and Plugins as attachment sources - evaluated, not offered, because no existing CozyOS capability wires into document attachment yet",
                "Daily Balance and cross-application aggregation",
                "editing, deleting, or voice-based reminders from the My Reminders view",
                "real AI interpretation of directives, beyond today's disclosed keyword/regex heuristic"
            ]),
            visionCapabilitiesSw: Object.freeze([
                "uzalishaji wa PDF, OCR, kushiriki, na kuchapisha kwa hati",
                "Scanner na Plugins kama vyanzo vya kuambatanisha - vimechunguzwa, havijatolewa, kwa sababu hakuna uwezo uliopo wa CozyOS unaounganishwa na uambatanishaji wa hati bado",
                "Daily Balance na muhtasari unaovuka programu mbalimbali",
                "kuhariri, kufuta, au vikumbusho vya sauti kutoka mwonekano wa My Reminders",
                "tafsiri halisi ya AI ya maagizo, zaidi ya mbinu ya sasa iliyofichuliwa ya maneno muhimu/regex"
            ]),
            visionSourceNote: "Drawn directly from InterestOS's own real, committed manifest/description text in core/plugins/interestOS-core.js (registerApplication() call and file header) — not inferred from the application's name."
        }),

        // Real, grounded in core/modules/Cozy-Authenticator/authenticator.js —
        // the file's own header ("Never fabricates a status: every badge
        // reflects an engine's actual loaded/real state") and its real,
        // implemented auth-factor display names (Face Unlock, Fingerprint,
        // Voice, Passkey/security-key, RFC6238 TOTP OTP).
        authenticator: Object.freeze({
            humanPurpose: "Authenticator exists to give a CozyOS user one real, honest place to see and manage how they prove who they are — Face Unlock, Fingerprint, Voice, Passkey, or a standards-based (RFC6238) one-time code — rather than scattering that decision across every application separately, and to show only what is actually enrolled and working, never a fabricated status badge.",
            humanPurposeSw: "Authenticator ipo ili kumpa mtumiaji wa CozyOS mahali pamoja halisi pa kuona na kusimamia jinsi anavyothibitisha ni nani — Kufungua kwa Uso, Alama ya Kidole, Sauti, Passkey, au msimbo wa mara moja unaotegemea kiwango (RFC6238) — badala ya uamuzi huo kutawanywa kwenye kila programu kando kando, na kuonyesha tu kile kilichosajiliwa na kinachofanya kazi kikweli, kamwe si alama ya hali iliyobuniwa.",
            realLifeProblems: Object.freeze([
                "having to set up and remember a different sign-in method for every separate CozyOS application",
                "not knowing whether a security method (fingerprint, passkey, OTP) is actually enrolled and working versus just displayed",
                "losing access when a single authentication method fails, with no other real enrolled option to fall back on"
            ]),
            realLifeProblemsSw: Object.freeze([
                "kulazimika kusanidi na kukumbuka njia tofauti ya kuingia kwa kila programu tofauti ya CozyOS",
                "kutokujua kama njia ya usalama (alama ya kidole, passkey, OTP) kweli imesajiliwa na inafanya kazi badala ya kuonyeshwa tu",
                "kupoteza ufikiaji wakati njia moja ya uthibitishaji imeshindwa, bila chaguo lingine halisi lililosajiliwa la kurudi"
            ]),
            whoBenefits: Object.freeze(["any CozyOS user managing sign-in security", "administrators relying on real (not assumed) authentication status"]),
            whoBenefitsSw: Object.freeze(["mtumiaji yeyote wa CozyOS anayesimamia usalama wa kuingia", "wasimamizi wanaotegemea hali halisi (si iliyodhaniwa) ya uthibitishaji"]),
            humanBenefits: Object.freeze([
                "one real, honest dashboard for every enrolled sign-in method",
                "several real methods available (Face Unlock, Fingerprint, Voice, Passkey, TOTP) instead of being locked into one",
                "no fabricated status — a badge only shows a method as active when it genuinely is"
            ]),
            humanBenefitsSw: Object.freeze([
                "dashibodi moja halisi na ya kuaminika kwa kila njia iliyosajiliwa ya kuingia",
                "njia kadhaa halisi zinazopatikana (Kufungua kwa Uso, Alama ya Kidole, Sauti, Passkey, TOTP) badala ya kufungiwa kwenye moja",
                "hakuna hali iliyobuniwa — alama inaonyesha njia kuwa hai tu pale ambapo kweli iko hivyo"
            ]),
            currentVerifiedCapabilities: Object.freeze([
                "real display of enrolled auth factors composing the existing AuthFactorRegistry (Face Unlock, Fingerprint, Voice, Passkey/security-key, OTP)",
                "real RFC6238 TOTP status display via the existing OtpProvider",
                "delegates entirely to the platform's already-loaded IdentityEngine/AuthCoordinator/AuthorizationCoordinator - no duplicate authentication logic"
            ]),
            currentVerifiedCapabilitiesSw: Object.freeze([
                "onyesho halisi la njia za uthibitishaji zilizosajiliwa likitumia AuthFactorRegistry iliyopo (Kufungua kwa Uso, Alama ya Kidole, Sauti, Passkey, OTP)",
                "onyesho halisi la hali ya RFC6238 TOTP kupitia OtpProvider iliyopo",
                "hukabidhi kikamilifu kwa IdentityEngine/AuthCoordinator/AuthorizationCoordinator ya jukwaa iliyopakiwa tayari - hakuna mantiki ya nakala ya uthibitishaji"
            ]),
            visionCapabilities: Object.freeze([]),
            visionCapabilitiesSw: Object.freeze([]),
            visionSourceNote: "Drawn directly from core/modules/Cozy-Authenticator/authenticator.js's own file header and its real, displayed auth-factor list — not inferred from the application's name. No unimplemented/vision capability is documented in that file to report here."
        }),

        // HONEST FINDING: no single "LiveOS" application is registered
        // anywhere in this repository. What actually exists are THREE
        // separate, real, registered applications under the Live
        // umbrella - each drawn directly from its own registerApplication()
        // call and file header (see LIVE_OS_ENTRY above). "liveos" and
        // "livevideo" both resolve to the SAME real entry - not two
        // separately-maintained copies - so a user asking about either
        // honestly gets the real picture rather than a fabricated
        // single-app description.
        liveos: LIVE_OS_ENTRY,
        livevideo: LIVE_OS_ENTRY,

        // Real, discovered via repository-wide registerApplication()
        // inventory (not previously in this table) - grounded in
        // core/modules/intelligence/media/cozy-media-intelligence.js's
        // own file header and its real, disclosed keyword-matching
        // implementation (explicitly NOT face recognition/ASR/OCR/
        // embeddings/semantic NLU - the file's own "NO FABRICATION"
        // section).
        mediaintelligence: Object.freeze({
            humanPurpose: "Media Intelligence exists to let an authorized person search indexed testimony/evidence media by person reference, research type, or language, using real, disclosed keyword matching against already-indexed content — not to guess or generate an answer when nothing indexed actually matches.",
            humanPurposeSw: "Media Intelligence ipo ili kumwezesha mtu mwenye ruhusa kutafuta maudhui ya ushahidi/utambuzi yaliyoorodheshwa kwa kutumia rejeleo la mtu, aina ya utafiti, au lugha, akitumia ulinganishaji halisi na wa wazi wa maneno dhidi ya maudhui yaliyokwisha orodheshwa — si kubashiri au kutengeneza jibu wakati hakuna kilichoorodheshwa kinacholingana kikweli.",
            realLifeProblems: Object.freeze([
                "no fast way to find which indexed media/testimony actually mentions a specific person, topic, or language",
                "risk of a search tool guessing or fabricating a match when nothing indexed genuinely corresponds"
            ]),
            realLifeProblemsSw: Object.freeze([
                "hakuna njia ya haraka ya kupata ni maudhui gani ya ushahidi/utambuzi yaliyoorodheshwa yanayomtaja mtu, mada, au lugha fulani",
                "hatari ya zana ya utafutaji kubashiri au kutengeneza mlinganisho wakati hakuna kilichoorodheshwa kinacholingana kikweli"
            ]),
            whoBenefits: Object.freeze(["authorized researchers/administrators searching indexed media", "anyone needing to confirm whether specific testimony/evidence exists before relying on it"]),
            whoBenefitsSw: Object.freeze(["watafiti/wasimamizi wenye ruhusa wanaotafuta maudhui yaliyoorodheshwa", "yeyote anayehitaji kuthibitisha kama ushahidi/utambuzi fulani upo kabla ya kuutegemea"]),
            humanBenefits: Object.freeze([
                "real search by person reference, research type, or language over already-indexed content",
                "an honest \"NOT_AVAILABLE\" result when no indexed evidence matches, instead of a guessed answer"
            ]),
            humanBenefitsSw: Object.freeze([
                "utafutaji halisi kwa rejeleo la mtu, aina ya utafiti, au lugha juu ya maudhui yaliyokwisha orodheshwa",
                "matokeo ya uwazi ya \"NOT_AVAILABLE\" wakati hakuna ushahidi ulioorodheshwa unaolingana, badala ya jibu la kubashiri"
            ]),
            currentVerifiedCapabilities: Object.freeze([
                "search by person reference, research type, and language over indexed media (composes the existing CozyResearchSearch/CozyResearchIntelligence/CozyMediaEvidence engines only)",
                "real, disclosed deterministic keyword matching - not semantic/LLM understanding"
            ]),
            currentVerifiedCapabilitiesSw: Object.freeze([
                "utafutaji kwa rejeleo la mtu, aina ya utafiti, na lugha juu ya maudhui yaliyoorodheshwa (hutumia injini zilizopo za CozyResearchSearch/CozyResearchIntelligence/CozyMediaEvidence tu)",
                "ulinganishaji halisi, wa wazi wa maneno muhimu - si uelewa wa kisemantiki/LLM"
            ]),
            visionCapabilities: Object.freeze([
                "face recognition, automatic speech recognition (ASR), OCR, embeddings, or semantic NLU - explicitly none of these is implemented or claimed anywhere in this application today"
            ]),
            visionCapabilitiesSw: Object.freeze([
                "utambuzi wa uso, utambuzi wa hotuba kiotomatiki (ASR), OCR, embeddings, au uelewa wa kisemantiki (NLU) - hakuna hata mojawapo ya haya iliyotekelezwa au kudaiwa mahali popote katika programu hii leo"
            ]),
            visionSourceNote: "Drawn directly from core/modules/intelligence/media/cozy-media-intelligence.js's own file header, including its explicit 'NO FABRICATION' section."
        }),

        // DEEP APPLICATION AUDIT (2026-09-15) — HONEST FINDING:
        // HospitalOS and SchoolOS are NOT part of the ServiceRegistry/
        // registerApplication() architecture every other entry in this
        // table is drawn from. They exist only as keyword-triggered
        // MOCK/PLACEHOLDER handlers in a separate, older plugin
        // subsystem (window.CozyOS.PluginManager/KernelPlugins -
        // core/plugins/hospitalOS.js, core/ai/schoolHandler.js). Their
        // own source code explicitly labels its sample data as mock
        // ("MOCK_DATA_STRING", "sandbox_test_tenant", a hardcoded fake
        // attendance percentage) - there is no real patient record
        // system, no real triage logic, no real school administration,
        // no real attendance tracking anywhere behind these handlers.
        // Recording this honestly here (rather than either omitting
        // them or fabricating real capabilities for them) is the
        // correct application of the "do not fabricate" rule to a
        // capability that is genuinely closer to a demo stub than to
        // any of VERIFIED_END_TO_END / IMPLEMENTED_AWAITING_CONNECTION
        // / PARTIALLY_IMPLEMENTED / PLANNED_NOT_IMPLEMENTED - it is
        // real CODE, but the capability itself does not exist.
        hospitalos: Object.freeze({
            humanPurpose: "There is no real, functional HospitalOS in CozyOS today. What exists is a keyword-triggered mock/placeholder handler (core/plugins/hospitalOS.js) that returns canned text for words like \"triage\"/\"emergency\"/\"encrypt\" and writes an explicitly-labeled mock chart record - it does not implement real patient records, real triage logic, or real medical data encryption.",
            humanPurposeSw: "Hakuna HospitalOS halisi, inayofanya kazi katika CozyOS leo. Kilichopo ni kishikilizi cha maneno muhimu (core/plugins/hospitalOS.js) kinachotoa maandishi yaliyotayarishwa kwa maneno kama \"triage\"/\"emergency\"/\"encrypt\" na kuandika rekodi ya chati iliyoainishwa waziwazi kuwa ni mfano - hakitekelezi rekodi halisi za wagonjwa, mantiki halisi ya triage, au usimbaji halisi wa data ya kitabibu.",
            realLifeProblems: Object.freeze([]),
            realLifeProblemsSw: Object.freeze([]),
            whoBenefits: Object.freeze([]),
            whoBenefitsSw: Object.freeze([]),
            humanBenefits: Object.freeze([]),
            humanBenefitsSw: Object.freeze([]),
            currentVerifiedCapabilities: Object.freeze([]),
            currentVerifiedCapabilitiesSw: Object.freeze([]),
            visionCapabilities: Object.freeze([
                "real patient records, triage workflows, and medical data handling - none of this exists today; the current module is a mock/demo stub only, registered through a separate plugin subsystem (PluginManager/KernelPlugins), not the main ServiceRegistry every other real CozyOS application uses"
            ]),
            visionCapabilitiesSw: Object.freeze([
                "rekodi halisi za wagonjwa, taratibu za triage, na usimamizi wa data ya kitabibu - hakuna kati ya hizi kilichopo leo; moduli ya sasa ni kishikilizi cha mfano/onyesho tu, kilichosajiliwa kupitia mfumo tofauti wa plugin (PluginManager/KernelPlugins), si ServiceRegistry kuu inayotumiwa na kila programu halisi nyingine ya CozyOS"
            ]),
            visionSourceNote: "Drawn directly from core/plugins/hospitalOS.js's own source, which explicitly labels its own sample data as mock (\"MOCK_DATA_STRING\", \"sandbox_test_tenant\")."
        }),

        schoolos: Object.freeze({
            humanPurpose: "There is no real, functional SchoolOS in CozyOS today. What exists is a keyword-triggered mock/placeholder handler (core/ai/schoolHandler.js) that returns canned wellbeing/study-habit text and a hardcoded, fabricated attendance percentage - it does not implement real student records, real attendance tracking, or real school administration.",
            humanPurposeSw: "Hakuna SchoolOS halisi, inayofanya kazi katika CozyOS leo. Kilichopo ni kishikilizi cha maneno muhimu (core/ai/schoolHandler.js) kinachotoa maandishi yaliyotayarishwa kuhusu ustawi/tabia za masomo na asilimia ya mahudhurio iliyowekwa moja kwa moja katika msimbo (siyo ya kweli) - hakitekelezi rekodi halisi za wanafunzi, ufuatiliaji halisi wa mahudhurio, au usimamizi halisi wa shule.",
            realLifeProblems: Object.freeze([]),
            realLifeProblemsSw: Object.freeze([]),
            whoBenefits: Object.freeze([]),
            whoBenefitsSw: Object.freeze([]),
            humanBenefits: Object.freeze([]),
            humanBenefitsSw: Object.freeze([]),
            currentVerifiedCapabilities: Object.freeze([]),
            currentVerifiedCapabilitiesSw: Object.freeze([]),
            visionCapabilities: Object.freeze([
                "real student records, real attendance tracking, real school administration and fee/payment handling - none of this exists today; the current module returns a hardcoded, non-live attendance percentage and generic canned wellbeing text, registered through a separate mechanism from the main ServiceRegistry every other real CozyOS application uses"
            ]),
            visionCapabilitiesSw: Object.freeze([
                "rekodi halisi za wanafunzi, ufuatiliaji halisi wa mahudhurio, usimamizi halisi wa shule na malipo/ada - hakuna kati ya hizi kilichopo leo; moduli ya sasa inarudisha asilimia ya mahudhurio iliyowekwa moja kwa moja (siyo ya wakati halisi) na maandishi ya jumla ya ustawi, iliyosajiliwa kupitia njia tofauti na ServiceRegistry kuu inayotumiwa na kila programu halisi nyingine ya CozyOS"
            ]),
            visionSourceNote: "Drawn directly from core/ai/schoolHandler.js's own source, which returns a hardcoded attendance figure (\"94.2%\") rather than any real, live data source."
        }),
    });

    /**
     * getApplicationHumanPurposeFact(name)
     *   VERIFIED only when a real, committed human-purpose record
     *   exists for the named application (currently: ChurchOS only).
     *   NOT_FOUND for every other application — never guesses a
     *   purpose from a name or category. Distinct from
     *   getApplicationFact() (technical identity/category/enabled) —
     *   this answers "why does this matter to people", not "what is
     *   this technically". currentVerifiedCapabilities and
     *   visionCapabilities are kept as separate fields so a caller (or
     *   template) can never accidentally present one as the other.
     */
    /**
     * CAPABILITY_HUMAN_PURPOSE_DATA
     *   Human-purpose knowledge for CozyOS CAPABILITIES (not tied to
     *   one application), reusing the exact same fact-getter shape as
     *   APPLICATION_HUMAN_PURPOSE_DATA above — no second knowledge
     *   mechanism. First entry: the current-organization-context
     *   resolver for Natural Human Record Capture.
     */
    const CAPABILITY_HUMAN_PURPOSE_DATA = Object.freeze({
        "biometric-login": Object.freeze({
            humanPurpose: "CozyOS lets you sign in using your device's own fingerprint or face verification, without typing a password. Your device or browser performs the actual biometric check — CozyOS never sees or stores your fingerprint or face itself, only a verified cryptographic result confirming your device approved the sign-in.",
            realLifeProblems: Object.freeze([
                "remembering and typing passwords",
                "password reuse and weak passwords",
                "slow, friction-heavy sign-in on trusted personal devices"
            ]),
            whoBenefits: Object.freeze(["platform administrators", "any user signing in from a device with a fingerprint/face/Windows Hello sensor"]),
            humanBenefits: Object.freeze([
                "faster, passwordless sign-in",
                "using a fingerprint/face check that already exists on the person's own device, with nothing new to remember",
                "the biometric itself is never seen, transmitted, or stored by CozyOS"
            ]),
            currentVerifiedCapabilities: Object.freeze([
                "real, server-authoritative WebAuthn passkey registration and login (AuthCoordinator.registerServerPasskey()/loginWithServerPasskey())",
                "on real hardware, the passkey ceremony is a fingerprint/Face ID/Windows Hello prompt performed entirely by the device/OS",
                "a successful passkey login establishes the same real Session used by every other CozyOS login path",
                "the Enterprise Control Center's Fingerprint panel now links directly to real passkey setup"
            ]),
            visionCapabilities: Object.freeze([
                "a standalone CozyOS-native fingerprint/face matching backend, independent of WebAuthn (FingerprintProvider.registerBackend()/FaceProvider.registerBackend() remain real, unbacked interfaces for this)",
                "a dedicated Face Recognition panel with the same real passkey connection the Fingerprint panel now has"
            ]),
            visionSourceNote: "FingerprintProvider and FaceProvider (core/security/fingerprint-provider.js, face-provider.js) remain real interfaces with no registered backend — this capability does not change that. It connects the existing UI honestly to the separate, real WebAuthn passkey path instead."
        }),
        "natural-record-capture": Object.freeze({
            humanPurpose: "CozyOS can understand information you tell it naturally and help turn it into the right record in the right place, so you don't always have to find and fill in a form yourself. It figures out which organization the record belongs to from who you really are and what you're already authorized to do — it never guesses, and it never records anything under the wrong organization.",
            realLifeProblems: Object.freeze([
                "having to manually navigate complex application menus just to record simple information",
                "not knowing which organization a record should belong to when a person works with more than one",
                "risk of a record being silently created under the wrong organization"
            ]),
            whoBenefits: Object.freeze(["church workers", "business staff", "anyone speaking or typing naturally to CozyOS instead of using a form"]),
            humanBenefits: Object.freeze([
                "less time spent navigating menus",
                "confidence that a record only ever goes to an organization you are actually, currently authorized for",
                "a clear question instead of a silent mistake when the right organization isn't obvious"
            ]),
            currentVerifiedCapabilities: Object.freeze([
                "resolves the current organization from a real, active session identity and real OrganizationMembership records — never guessed",
                "supports an explicit organization override when one is already known",
                "asks for clarification, rather than picking one, when a person genuinely belongs to more than one active organization",
                "asks for clarification, rather than fabricating a record, when no organization can be resolved at all",
                "currently wired into one real record type: ChurchOS member creation"
            ]),
            visionCapabilities: Object.freeze([
                "the same resolver reused for other record types and other applications (ShopOS, MpesaOS, QuarryOS, WholesaleOS)",
                "richer natural-language entity extraction beyond names",
                "offline-first record capture with later synchronization"
            ]),
            visionSourceNote: "This capability-level entry describes the current-organization-context resolver dependency. It extends, and does not replace, the application-specific human-purpose entries above (e.g. ChurchOS)."
        }),
        "conversation-correction": Object.freeze({
            humanPurpose: "People correct themselves mid-conversation all the time — they name the wrong thing, then immediately fix it. CozyOS's rule-based conversational composer can now recognize a small, disclosed correction pattern (\"Actually, ShopOS, not QuarryOS.\") and update what it remembers you meant, in both English and Kiswahili, so the correction actually sticks for the next thing you say — instead of forcing you to repeat the whole request from scratch.",
            humanPurposeSw: "Watu mara nyingi hujirekebisha wakati wa mazungumzo — wanataja kitu kibaya kisha kukirekebisha mara moja. Sasa muundaji wa majibu wa CozyOS unaotegemea sheria unaweza kutambua mtindo mahususi, ulioelezwa wa kurekebisha (\"Kwa kweli ShopOS, si QuarryOS.\"), kwa Kiingereza na Kiswahili, na kusasisha kile alichokusudia mtumiaji — ili urekebishaji huo ubaki kwa jambo linalofuata unalosema, badala ya kukulazimu kurudia ombi lote tangu mwanzo.",
            realLifeProblems: Object.freeze([
                "saying the wrong application name by mistake and having to start the whole request over",
                "a correction being silently ignored so the system keeps acting on the first, wrong thing said",
                "having no way to fix a misunderstanding without repeating yourself in full"
            ]),
            whoBenefits: Object.freeze(["anyone speaking or typing naturally to CozyOS, in English or Kiswahili", "people who misspeak or change their mind mid-conversation"]),
            humanBenefits: Object.freeze([
                "a quick, natural correction is understood without repeating the full original request",
                "the corrected choice — not the original mistake — is what a follow-up like \"open it\"/\"ifungue\" resolves to",
                "a correction with nothing real to correct is honestly left unresolved, never guessed"
            ]),
            currentVerifiedCapabilities: Object.freeze([
                "recognizes a small, closed set of correction phrasings referring back to a previously named, resolved application (\"Actually, X, not Y.\", \"Not Y — X.\", Kiswahili \"Kwa kweli X, si Y.\")",
                "replaces the remembered application only when the corrected name resolves against the real application registry",
                "leaves the conversation state untouched — never fabricates a reference — when there is no real prior application to correct",
                "an explicit new application named in an ordinary utterance still always wins over any correction handling"
            ]),
            visionCapabilities: Object.freeze([
                "broader correction phrasing coverage beyond the current closed pattern set",
                "correction handling for referents other than an application name"
            ]),
            visionSourceNote: "This capability-level entry describes the RP-037 conversationState correction-handling dependency in rule-based-conversational-provider.js. It extends, and does not replace, the bare-reference-followup entry that conversationState propagation already covers."
        })
    });

    /**
     * getCapabilityHumanPurposeFact(capabilityName)
     *   Same VERIFIED/NOT_FOUND convention as every other fact-getter
     *   in this file, scoped to a named CAPABILITY rather than a named
     *   application. Never fabricates a purpose for an unregistered
     *   capability name.
     */
    function getCapabilityHumanPurposeFact(capabilityName) {
        const needle = (typeof capabilityName === "string" ? capabilityName : "").trim().toLowerCase();
        const data = needle && CAPABILITY_HUMAN_PURPOSE_DATA[needle];
        if (!data) return { evidence: "NOT_FOUND", purpose: null, source: null };
        return { evidence: "VERIFIED", purpose: data, source: "cozy-knowledge-registry.js (committed capability human-purpose data)" };
    }

    /**
     * SUBSTANCE_FIELDS
     *   The human-purpose fields that carry per-language SUBSTANCE (as
     *   opposed to visionSourceNote, an audit/provenance note kept in
     *   English only for this increment). Each has a sibling "<field>Sw"
     *   key on records that have genuine, human-authored Kiswahili
     *   content — never a machine translation, and never assembled at
     *   call time.
     */
    const SUBSTANCE_FIELDS = Object.freeze([
        "humanPurpose", "realLifeProblems", "whoBenefits", "humanBenefits",
        "currentVerifiedCapabilities", "visionCapabilities"
    ]);

    /**
     * resolvePurposeForLanguage(data, lang)
     *   Real payload/frame separation, kept at the KNOWLEDGE layer (not
     *   the language-template layer): given a committed record that may
     *   carry English + Kiswahili substance, returns a purpose object
     *   already resolved to the requested language, under the SAME
     *   field names every caller/template already expects
     *   (humanPurpose, realLifeProblems, ...). This is why
     *   cozy-language-templates.js's "sw" frame needed no change - it
     *   already just interpolates whatever `p.humanPurpose` etc. it is
     *   handed.
     *
     *   lang === "sw": every one of SUBSTANCE_FIELDS must have a real,
     *   non-empty "<field>Sw" sibling on the record, or this returns
     *   null - a genuine "no Kiswahili payload yet" signal. This is the
     *   fail-closed rule that prevents ever silently substituting the
     *   English payload when Kiswahili was actually requested (RP-027
     *   extension, this dependency).
     *
     *   Any other lang (including "en", or no lang at all): returns the
     *   record's English fields untouched - identical shape/behavior to
     *   before this dependency, so existing English callers/tests are
     *   unaffected.
     */
    function resolvePurposeForLanguage(data, lang) {
        if (lang !== "sw") {
            const englishOnly = {};
            SUBSTANCE_FIELDS.forEach((field) => { englishOnly[field] = data[field]; });
            englishOnly.visionSourceNote = data.visionSourceNote;
            return englishOnly;
        }
        const swResolved = {};
        for (const field of SUBSTANCE_FIELDS) {
            const swKey = field + "Sw";
            const swValue = data[swKey];
            const hasRealSwValue = Array.isArray(swValue)
                ? swValue.length > 0
                : (typeof swValue === "string" && swValue.length > 0);
            if (!hasRealSwValue) return null; // fail-closed: no fabricated/English fallback
            swResolved[field] = swValue;
        }
        swResolved.visionSourceNote = data.visionSourceNote; // audit note: English only, this increment
        return swResolved;
    }

    /**
     * getApplicationDetailedInfo(name, lang)
     *   DEEP APPLICATION CAPABILITY AUDIT — composes a structured,
     *   multi-section explanation from the SAME real data
     *   getApplicationHumanPurposeFact()/searchApplicationsByCapability()
     *   already read - no duplicate knowledge, no new registry.
     *   Explicitly separates VERIFIED_END_TO_END (currentVerified-
     *   Capabilities) from IMPLEMENTED_AWAITING_CONNECTION
     *   (implementedAwaitingConnection - real code exists elsewhere,
     *   just not wired to this application) from PARTIALLY_IMPLEMENTED
     *   (partiallyImplemented - part of an idea is real, part is not)
     *   from PLANNED_NOT_IMPLEMENTED (visionCapabilities) - never
     *   collapsing these into one bucket. Real-life examples are drawn
     *   directly from realLifeProblems (already-verified data), capped
     *   at 2 per the requested "give 2 concrete examples" behavior -
     *   never invented beyond what that array already contains.
     */
    /**
     * compareApplicationsFact(nameA, nameB, lang)
     *   APPLICATION_COMPARISON — real, generic comparison built entirely
     *   from the SAME two applications' own real getApplicationDetailedInfo()
     *   data. Never makes an unsupported "X is better" claim - only
     *   states each application's own real purpose and current
     *   capabilities side by side, so the person can judge fit
     *   themselves. Honestly reports when one or both names aren't
     *   registered, rather than guessing.
     */
    function compareApplicationsFact(nameA, nameB, lang) {
        const a = getApplicationDetailedInfo(nameA, lang);
        const b = getApplicationDetailedInfo(nameB, lang);
        if (a.evidence !== "VERIFIED" || b.evidence !== "VERIFIED") return { evidence: "NOT_FOUND", answer: null };
        const isSw = lang === "sw";
        const describe = (key, detail) => {
            const capLabel = isSw ? "Uwezo ulioidhinishwa" : "Verified capabilities";
            const caps = detail.currentVerifiedCapabilities.length > 0 ? `${capLabel}: ${detail.currentVerifiedCapabilities.join("; ")}.` : "";
            return [`${key}`, detail.humanPurpose, caps].filter(Boolean).join("\n");
        };
        const intro = isSw
            ? `Hapa kuna tofauti halisi kati ya ${a.detail.application} na ${b.detail.application}, kulingana na uwezo uliothibitishwa wa kila moja - si dai la "bora zaidi".`
            : `Here is the real difference between ${a.detail.application} and ${b.detail.application}, based on each one's own verified purpose and capabilities - not an unsupported "better" claim.`;
        return { evidence: "VERIFIED", answer: [intro, describe(a.detail.application, a.detail), describe(b.detail.application, b.detail)].join("\n\n") };
    }

    function getApplicationDetailedInfo(name, lang) {
        const key = String(name || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
        const data = APPLICATION_HUMAN_PURPOSE_DATA[key];
        if (!data) return { evidence: "NOT_FOUND", detail: null };
        const resolved = resolvePurposeForLanguage(data, lang);
        if (!resolved) return { evidence: "NOT_FOUND", detail: null };
        const isSw = lang === "sw";
        const pick = (base) => (isSw && Array.isArray(data[base + "Sw"]) && data[base + "Sw"].length > 0) ? data[base + "Sw"] : (Array.isArray(data[base]) ? data[base] : []);
        return {
            evidence: "VERIFIED",
            detail: {
                application: key,
                humanPurpose: resolved.humanPurpose,
                whoBenefits: resolved.whoBenefits || [],
                realLifeExamples: (resolved.realLifeProblems || []).slice(0, 2),
                currentVerifiedCapabilities: resolved.currentVerifiedCapabilities || [],
                implementedAwaitingConnection: pick("implementedAwaitingConnection"),
                partiallyImplemented: pick("partiallyImplemented"),
                visionCapabilities: resolved.visionCapabilities || []
            }
        };
    }

    /**
     * getApplicationDetailedInfoFact(name, lang)
     *   Turns the structured object above into one real, plain-language
     *   answer string, same "VERIFIED"/"NOT_FOUND" evidence contract as
     *   the other fact functions - the conversational provider composes
     *   the final template around this text, it does not build the
     *   structure itself.
     */
    function getApplicationDetailedInfoFact(name, lang) {
        const result = getApplicationDetailedInfo(name, lang);
        if (result.evidence !== "VERIFIED") return { evidence: "NOT_FOUND", answer: null };
        const d = result.detail;
        const isSw = lang === "sw";
        const sections = [];
        sections.push(d.humanPurpose);
        if (d.realLifeExamples.length > 0) {
            const label = isSw ? "Mifano halisi ya matumizi" : "Real-life examples";
            sections.push(`${label}: ${d.realLifeExamples.join("; ")}.`);
        }
        if (d.currentVerifiedCapabilities.length > 0) {
            const label = isSw ? "Uwezo ulioidhinishwa leo" : "Verified today";
            sections.push(`${label}: ${d.currentVerifiedCapabilities.join("; ")}.`);
        }
        if (d.implementedAwaitingConnection.length > 0) {
            const label = isSw ? "Zipo lakini hazijaunganishwa bado" : "Already implemented but not yet connected";
            sections.push(`${label}: ${d.implementedAwaitingConnection.join(" | ")}`);
        }
        if (d.partiallyImplemented.length > 0) {
            const label = isSw ? "Zimetekelezwa kwa sehemu" : "Partially implemented";
            sections.push(`${label}: ${d.partiallyImplemented.join(" | ")}`);
        }
        if (d.visionCapabilities.length > 0) {
            const label = isSw ? "Vision/yajayo (bado hayajatekelezwa)" : "Vision/planned (not implemented yet)";
            sections.push(`${label}: ${d.visionCapabilities.join("; ")}.`);
        }
        return { evidence: "VERIFIED", answer: sections.join("\n\n") };
    }

    /**
     * getAllApplicationsDetailedFact(lang)
     *   ALL_APPLICATIONS_DETAILED — real, generic "what do all the
     *   applications do" overview. Loops the SAME real
     *   APPLICATION_HUMAN_PURPOSE_DATA table every other function in
     *   this file reads (no second registry, no per-application
     *   handler) and composes ONE combined answer: for every real
     *   entry, a one-line purpose plus up to 2 real-life examples drawn
     *   directly from realLifeProblems - never invented to force a
     *   "two examples" count. An application with zero real
     *   realLifeProblems entries (e.g. the honest HospitalOS/SchoolOS
     *   mock-stub disclosures) still appears, with its real, honest
     *   humanPurpose text standing in for the missing examples rather
     *   than a fabricated pair.
     */
    function getAllApplicationsDetailedFact(lang) {
        const keys = Object.keys(APPLICATION_HUMAN_PURPOSE_DATA).sort();
        if (keys.length === 0) return { evidence: "NOT_FOUND", answer: null };
        const blocks = keys.map((key) => {
            const resolved = resolvePurposeForLanguage(APPLICATION_HUMAN_PURPOSE_DATA[key], lang);
            if (!resolved) return null;
            const examples = (resolved.realLifeProblems || []).slice(0, 2);
            const lines = [`${key}`];
            lines.push(resolved.humanPurpose);
            if (examples.length > 0) {
                examples.forEach((ex, i) => lines.push(`  ${i + 1}. ${ex}`));
            }
            return lines.join("\n");
        }).filter(Boolean);
        if (blocks.length === 0) return { evidence: "NOT_FOUND", answer: null };
        return { evidence: "VERIFIED", answer: blocks.join("\n\n") };
    }

    /**
     * getApplicationHumanPurposeFact(name, lang)
     *   lang is optional for backward compatibility ("en" behavior when
     *   omitted - unchanged from before this dependency). When
     *   lang === "sw" and the named application genuinely has no
     *   authored Kiswahili substance yet, this honestly returns
     *   NOT_FOUND rather than silently handing back English content
     *   under a Kiswahili request.
     */
    /**
     * UNIVERSAL HUMAN-IMPORTANCE ARCHITECTURE — cross-application
     * capability search.
     *
     * Reuses APPLICATION_HUMAN_PURPOSE_DATA (the SAME table
     * getApplicationHumanPurposeFact() below already reads) as the
     * real, existing "Capability Registry -> Human Importance" layer —
     * no second registry, no per-app hardcoded routing. Answers "which
     * CozyOS application can help me do X?" by real keyword-overlap
     * search over each app's own already-VERIFIED humanPurpose/
     * realLifeProblems/humanBenefits text, in the requested language.
     * A new application automatically becomes discoverable the moment
     * a real entry for it exists in that one table — no new question
     * patterns required per app, matching the architecture requirement
     * that new applications should not need "another manual collection
     * of special question patterns."
     *
     * Returns real, evidence-carrying matches only. An empty
     * `matches` array is the honest result when no registered
     * application's verified data mentions the concept - this
     * function never invents a plausible-sounding match.
     */
    function searchApplicationsByCapability(query, lang) {
        const q = (typeof query === "string" ? query : "").toLowerCase();
        const words = Array.from(new Set((q.match(/[a-z]+/g) || []).filter((w) => w.length >= 4)));
        if (words.length === 0) return { evidence: "NOT_FOUND", matches: [] };

        const results = [];
        for (const appKey of Object.keys(APPLICATION_HUMAN_PURPOSE_DATA)) {
            const data = APPLICATION_HUMAN_PURPOSE_DATA[appKey];
            const resolved = resolvePurposeForLanguage(data, lang);
            if (!resolved) continue;
            // UNIVERSAL USER QUESTION UNDERSTANDING — Kiswahili-first
            // requirement: a Kiswahili query word (e.g. "kanisa") must
            // be able to match this data even when the RESOLVED display
            // language for this particular request is English (or vice
            // versa) - the search haystack therefore includes BOTH the
            // resolved language's real fields AND the raw Sw-suffixed
            // fields directly from `data` when they exist, rather than
            // only whichever single language resolvePurposeForLanguage()
            // picked for rendering. This only ever ADDS candidate text
            // to search against - it never changes what is actually
            // rendered back to the user (still resolved/lang-appropriate),
            // and never invents a translation that doesn't already
            // exist in the real, verified data.
            const haystackParts = [resolved.humanPurpose]
                .concat(Array.isArray(resolved.realLifeProblems) ? resolved.realLifeProblems : [])
                .concat(Array.isArray(resolved.humanBenefits) ? resolved.humanBenefits : [])
                .concat(Array.isArray(resolved.currentVerifiedCapabilities) ? resolved.currentVerifiedCapabilities : [])
                .concat(data.humanPurposeSw ? [data.humanPurposeSw] : [])
                .concat(Array.isArray(data.realLifeProblemsSw) ? data.realLifeProblemsSw : [])
                .concat(Array.isArray(data.humanBenefitsSw) ? data.humanBenefitsSw : [])
                .concat(Array.isArray(data.currentVerifiedCapabilitiesSw) ? data.currentVerifiedCapabilitiesSw : []);
            const haystack = haystackParts.join(" ").toLowerCase();
            const hits = words.filter((w) => haystack.includes(w) || (w.endsWith("s") && w.length > 4 && haystack.includes(w.slice(0, -1))));
            if (hits.length === 0) continue;
            // Pull the single most relevant real sentence/phrase as
            // disclosed evidence, rather than dumping the entire entry.
            // Prefer a match from the RESOLVED (display) language's own
            // text when one exists, so the evidence shown matches the
            // response language; fall back to whichever real text
            // actually matched otherwise.
            const evidenceSnippet = haystackParts.find((part) => hits.some((w) => part.toLowerCase().includes(w))) || resolved.humanPurpose;
            results.push({
                application: appKey,
                matchedKeywords: hits,
                score: hits.length,
                evidenceSnippet,
                verified: true
            });
        }
        results.sort((a, b) => b.score - a.score);
        return { evidence: results.length > 0 ? "VERIFIED" : "NOT_FOUND", matches: results };
    }

    function getApplicationHumanPurposeFact(name, lang) {
        // M363.1 real-device fix — normalize away spacing/case
        // variation ("Church OS", "church os", "ChurchOS", "churchos")
        // AND a leading/trailing filler word a real speaker naturally
        // adds ("programu ya ChurchOS", "progmu ya ChurchOS" — a real,
        // observed typo, "app ya ChurchOS", "ChurchOS app") to the same
        // lookup key. The data table itself is unchanged; this only
        // corrects how a caller's raw text is matched against it,
        // mirroring the identical fix applied to getApplicationFact()
        // and resolveApplicationByName() below/elsewhere for the same
        // real gap.
        const needle = (typeof name === "string" ? name : "").trim().toLowerCase()
            .replace(/^(?:pro\w*|application|app)\s+(?:ya\s+)?/i, "")
            .replace(/\s+app$/i, "")
            .replace(/\s+/g, "");
        const data = needle && APPLICATION_HUMAN_PURPOSE_DATA[needle];
        if (!data) return { evidence: "NOT_FOUND", purpose: null, source: null };
        const resolved = resolvePurposeForLanguage(data, lang);
        if (!resolved) {
            return {
                evidence: "NOT_FOUND",
                purpose: null,
                source: null,
                reason: "no-kiswahili-human-purpose-payload-yet"
            };
        }
        return {
            evidence: "VERIFIED",
            purpose: resolved,
            source: "core/plugins/" + needle + "-core.js (committed human-purpose data, this dependency)" + (lang === "sw" ? " [sw substance]" : "")
        };
    }

    function getApplicationFact(name) {
        const lister =
            (window.CozyOS && typeof window.CozyOS.listApplications === "function" && window.CozyOS.listApplications) ||
            (window.CozyOS && window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.listApplications === "function" && (() => window.CozyOS.ServiceRegistry.listApplications()));
        if (!lister) return { evidence: "NOT_FOUND", application: null, source: null };
        const needle = (typeof name === "string" ? name : "").trim().toLowerCase()
            .replace(/^(?:pro\w*|application|app)\s+(?:ya\s+)?/i, "")
            .replace(/\s+app$/i, "")
            .replace(/\s+/g, "");
        if (!needle) return { evidence: "NOT_FOUND", application: null, source: null };
        const list = safeCall(() => lister());
        if (!Array.isArray(list)) return { evidence: "NOT_FOUND", application: null, source: null };
        // M363.1 real-device fix — same space/case normalization as
        // getApplicationHumanPurposeFact() above, applied to both sides
        // of the comparison so "Church OS" matches a real registered
        // "ChurchOS" entry.
        const match = list.find((app) => app && (
            (typeof app.name === "string" && app.name.trim().toLowerCase().replace(/\s+/g, "") === needle) ||
            (typeof app.id === "string" && app.id.trim().toLowerCase().replace(/\s+/g, "") === needle)
        ));
        if (!match) return { evidence: "NOT_FOUND", application: null, source: null };
        return {
            evidence: "VERIFIED",
            application: {
                name: match.name || match.id,
                category: match.category || null,
                enabled: typeof match.enabled === "boolean" ? match.enabled : null,
                version: match.version || null
            },
            source: "window.CozyOS.ServiceRegistry"
        };
    }

    function getRegistrationFlowFact() {
        return {
            evidence: "VERIFIED",
            // English (second priority) and stepsSw (Kiswahili, FIRST
            // priority) are both fixed, committed, human-authored 1:1
            // translations of the same three audited steps — stepsSw
            // is NOT a runtime/auto translation of `steps`, so
            // cozy-language-templates.js never has to machine-translate
            // this evidence at call time.
            steps: [
                "Open the CozyOS login screen and choose \"Create an Account\"",
                "Fill in your First Name, Last Name, Username, Email, Phone, Password, and Confirm Password, and accept the Terms",
                "Submit the form — CozyOS validates the details, creates the account, and signs you in automatically"
            ],
            stepsSw: [
                "Fungua skrini ya kuingia ya CozyOS kisha uchague \"Create an Account\" (Tengeneza Akaunti)",
                "Jaza Jina la Kwanza, Jina la Mwisho, Jina la Mtumiaji, Barua Pepe, Simu, Nenosiri, na Uthibitishe Nenosiri, kisha ukubali Masharti",
                "Wasilisha fomu — CozyOS itathibitisha taarifa zako, kuunda akaunti, na kukuingiza moja kwa moja"
            ],
            passwordRequirement: "at least 8 characters, including an uppercase letter, a lowercase letter, a number, and a symbol",
            verificationRequired: false,
            autoLoginAfterRegister: true,
            source: "core/modules/identity/identity-engine.js (register()), core/shell/cozy-login-gate.js (registration form + submit handler)"
        };
    }

    window.CozyOS.CozyKnowledge = Object.freeze({
        getVersion() { return VERSION; },
        getFounderFact,
        listApplicationsFact,
        listProvidersFact,
        activeProviderFact,
        accountStateVocabulary,
        getProjectOriginFact,
        getPublicStoryFact,
        getVisionFact,
        getMissionFact,
        getProjectHistoryFact,
        getWhyUseCozyOSFact,
        getDifferentiationFact,
        getLanguageSupportListFact,
        getRegistrationFlowFact,
        lookupLexiconTermFact,
        getApplicationFact,
        getApplicationHumanPurposeFact,
        getApplicationDetailedInfo,
        getApplicationDetailedInfoFact,
        getAllApplicationsDetailedFact,
        compareApplicationsFact,
        searchApplicationsByCapability,
        getCapabilityHumanPurposeFact
    });

    window.CozyOS.Modules["cozy-knowledge-registry"] = Object.freeze({
        version: VERSION,
        description: "RP-027 + COZYAI-PUBLIC-VISION-KNOWLEDGE + REGISTRATION/AUTH — Knowledge/fact evidence gatherer. Reads DeveloperIdentity, ServiceRegistry, ProviderManager, LivingAI, FounderStory.getPublicStory(), CozyPublicKnowledge's already-existing public APIs at call time only (never at load time, so load order is not load-bearing) and returns an explicit evidence state (VERIFIED / PARTIALLY_VERIFIED / NOT_FOUND / NOT_A_CAPABILITY) alongside every fact, per RP-027's Fact Safety Rule. A missing or throwing dependency always degrades to an honest NOT_FOUND — never a fabricated answer. The five project-knowledge fact-getters (origin/public-story/vision/mission/history) never read the private Founder Story Vault directly and never accept a viewerId. The three public-vision fact-getters (why-use/differentiation/language-support-list) compose only the owner-approved cozy-public-knowledge-source.js — never founder-story-seed.js. getRegistrationFlowFact() (REGISTRATION/AUTH milestone) is VERIFIED from real, committed, directly-audited registration source code (identity-engine.js register(), cozy-login-gate.js registration form) — never inferred from naming, never claims a verification/OTP step that the audited code does not actually require. Consumed by rule-based-conversational-provider.js; does not itself compose or translate any user-facing text (that is cozy-language-templates.js's job)."
    });
})();
