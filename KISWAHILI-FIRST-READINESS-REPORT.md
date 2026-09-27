# Kiswahili-First Readiness Report

**Status: AUDIT + EVIDENCE ONLY. No commit, no push. Stopped at the commit gate per explicit instruction.**

**Acceptance rule under audit:** Kiswahili user input → Kiswahili response, except proper entities/product names/established technical names (CozyOS, ChurchOS, InterestOS, QuarryOS, people's names, product names, place names). English is not "done" while Kiswahili is incomplete — Kiswahili is a first-class, intentional primary language of CozyOS.

**Method:** Real Kiswahili phrases driven through the actual, unmodified Live Window (`dashboard.html`, real headless Chromium, real DOM — the same harness as every other real-browser suite in this repository), reproducing your exact test phrases and question categories, combined with direct source tracing of every stage the answer actually passes through. No sample "translation" tests — every probe below is the literal phrase, its literal output, and the exact file/line that produced it.

---

## 0. Summary verdict

**Kiswahili is NOT yet a fully first-class language throughout CozyAI's user-facing lifecycle.** It is strong and genuinely native in several real, tested paths (named-application questions, several platform-identity questions, the business-data metric classifier), but it silently degrades to English in at least two concrete, reproduced, root-caused places, and several categories were found to be honestly-but-incompletely handled (disclosed, not hidden) rather than fully native.

**Nothing found in this audit requires a new AI, language engine, knowledge database, learning system, or TTS system.** Every gap found has an existing seam to extend. **No external dependency is required to fix the code-level gaps** (see §5). The one genuine external dependency in this whole area — real Kiswahili voice/recognition packs actually installed on a user's device — already has correct, honest, fail-closed handling in code; it cannot be verified further from this sandboxed environment (see §5.1).

---

## 1. Question-category enumeration and native-vs-translated status

| Category | Real capability today | Native or translated/gap |
|---|---|---|
| General CozyOS questions ("CozyOS ni nini?") | Partially native — real Kiswahili founder-story paragraph, but appends an honestly-labeled English block for content with no confirmed Kiswahili translation yet | **Partial** — see §2.3 |
| General CozyOS questions ("CozyOS inahusu nini?", "Naweza kufanya nini na CozyOS?") | Falls to the rule-based provider's Kiswahili clarification message | **GAP** — plausibly answerable, currently declined (§2.6) |
| Application questions (named app, "X inafanya nini?") | Fully native — real SA-1..SA-5 pipeline, real Kiswahili evidence, entity-named intro (Wave 7 fixes) | **Native**, confirmed working |
| Business questions / InterestOS (revenue, profit, stock, savings) | Real, disclosed EN+SW keyword classifier (`cozy-business-data-intent.js`), correctly matches "mauzo"/"faida"/"stock" including inside implicit statements | **Native** for the classifier stage; **UNVERIFIED beyond the anonymous-decline path** (§2.4 — no authenticated test session available in this environment) |
| ChurchOS/QuarryOS/ShopOS specific | Fully native via the same SA pipeline as above | **Native** |
| Users/customers/products/orders/sales/stock/revenue/expenses/profit/savings | Covered by the business-data-intent classifier's metric table where the metric word is present; genuinely untested beyond keyword matching (no live business data in this session) | **Partial / UNVERIFIED** |
| Reports | Not independently probed — no dedicated Kiswahili "report" trigger found in the business-data-intent table | **UNVERIFIED / likely GAP** |
| Recommendations (which app helps my business/church) | Reaches `listApplicationsFact()` (English-keyed route, matched here only because the Kiswahili query happened to contain the English loanword "application") → renders a hard-coded English list, honestly wrapped with a "no confirmed Kiswahili translation" disclaimer | **GAP, honestly disclosed** (§2.5) |
| Explanations | Same native SA pipeline for named-entity explanations; generic "explain this" tested via clarification path | **Native for named entities; GAP for generic** |
| Clarification | Real, correctly-Kiswahili clarification message reused consistently | **Native** |
| Follow-ups ("Na hii je?") | Hits the SAME clarification fallback rather than resolving the deictic reference | **GAP** (§2.7) |
| Implicit requests ("Biashara yangu haileti faida.") | Correctly classified by the business-data-intent keyword table (real, in Kiswahili) as a PROFIT-metric question, honestly declines for lack of a login session, in Kiswahili | **Native for classification**; genuine troubleshooting/advice interpretation not attempted (§2.4) |
| Mixed Kiswahili/English (Kenyan conversational) | The business-data classifier correctly matched mixed input; the overall reply still fell through to the generic English-app-list branch for part of a mixed request | **Partial** (§2.8) |
| Calculations | Delegated to `InterestOSBusinessWorkspace`'s real math, language-independent; not separately probed beyond the metric classifier | **UNVERIFIED (data layer), likely fine (compute layer)** |
| Troubleshooting/advice | No dedicated advice/troubleshooting Kiswahili path found; `cozy-advisor.js` (the file that actually owns "advice") has **zero** Kiswahili-specific handling anywhere in its source | **GAP** (§2.9) |
| Comparisons ("ChurchOS ina tofauti gani na ShopOS?") | Returns ChurchOS's own detail page again, not an actual A-vs-B comparison | **GAP — but language-independent** (reproduced in Kiswahili only this pass; not yet re-tested in English to confirm scope, see §6 UNVERIFIED) |
| Contextual/deictic ("Na hii je?") | Same as follow-ups above — falls to clarification instead of resolving "hii" | **GAP** |
| Future learning/knowledge questions (Teach Cozy) | Not probed this pass — out of time budget; `cozy-teach-flow.js` was previously audited (MULTILINGUAL-INTELLIGENCE-AUDIT.md §2) as EN+SW-aware for the teaching-intent detector itself | **UNVERIFIED this pass — carry forward the prior audit's finding** |

---

## 2. Concrete evidence — every root cause traced to exact file/line

### 2.1 ROOT CAUSE A — hard-coded English "no evidence" fallback (silent leak, highest-impact)

**Reproduced:** `"Nina duka."` → `"I don't have verified information to answer that yet. Please rephrase, or this may not be something CozyOS has documented/verified."` (real browser, fresh session). Same for `"Unaweza kunisaidia?"`.

**Exact source:** `core/modules/intelligence/answer/cozy-answer-engine.js:646-652`:
```js
if (ctxResults.length === 0) {
    return {
        answer: "I don't have verified information to answer that yet. Please rephrase, or this may not be something CozyOS has documented/verified.",
        intent: "UNKNOWN", responseMode: "INSUFFICIENT_EVIDENCE",
        ...
    };
}
```
The function already has a real, computed `language`/`effLang` value in scope (used two lines later at line 656 for the very next branch) — this specific return path never consults it. This is not a content gap; it is a code path that never even tries.

### 2.2 ROOT CAUSE B — `CozyAI.getContext()`'s routing tables are 100% English-keyed

**Confirmed unchanged from the pre-existing `MULTILINGUAL-INTELLIGENCE-AUDIT.md` finding** (§2 of that document, produced before this session's Wave 1-7 work): `cozy-ai.js:239-309`'s `CONTEXT_STORY_ROUTES`/`CONTEXT_KNOWLEDGE_ROUTES` contain zero Kiswahili keywords — `vision`, `mission`, `why/start/started/origin/founded`, `history/background`, `story`, `architecture/application/app/module/system`, `provider`, `founder/creator`, `benefit/gain/useful`, `problem/solve`, `help`, `important/importance` — every single stem is English. Any Kiswahili phrase that reaches this fallback layer (i.e., isn't caught by the FAQ router or SA-3's named-entity path) can only ever match by accident (an English loanword literally present, as happened with "application" in §2.5), and this is exactly the layer that feeds `ROOT CAUSE A` above (`ctxResults.length === 0` when nothing matches).

### 2.3 Founder-story content: real Kiswahili, honestly incomplete

**Reproduced:** `"CozyOS ni nini?"` → a correct, real Kiswahili paragraph (Charles Owuor's founding story, genuinely in Kiswahili, not translated at request-time), immediately followed by: `"Kwa Kiingereza (bado hatuna tafsiri iliyothibitishwa ya maandishi haya kwa Kiswahili): CozyOS exists to solve practical, everyday problems..."`.

**Exact source of the honest-disclosure mechanism:** `cozy-answer-engine.js:200-224`, `joinPiecesForLanguage()` / the `"content:english-only-notice"` template (`cozy-language-templates.js`). This is a real, deliberate, ALREADY-CORRECT pattern — it never silently presents untranslated English as if it were native Kiswahili. It is listed here as a genuine content gap (the underlying founder-story fact has real Kiswahili for one part and none for another), not a code defect — the code's own behavior around the gap is exactly what the "do not hide incomplete capability" principle asks for.

### 2.4 Business-data-intent classifier: genuinely bilingual, but semantic-shape gaps remain

**Reproduced:** `"Nataka kufuatilia mauzo yangu."`, `"Nimekwama na stock, naweza tumia gani?"`, and `"Biashara yangu haileti faida."` **all** correctly matched a real metric (REVENUE/STOCK/PROFIT respectively) via `core/modules/intelligence/business-data/cozy-business-data-intent.js`'s `METRIC_KEYWORDS` table (confirmed real EN+SW pairs at lines 69-77, word-boundary matched at line 112-115) and **all** honestly declined in Kiswahili (`"Unahitaji kuingia katika akaunti yako ili kuona taarifa za biashara yako."` — "You need to log in to see your business information") because this test session is anonymous. This is correct behavior for the classification stage.

**Genuine gap found:** `"Nimekwama na stock, naweza tumia gani?"` ("I'm stuck with stock, what can I use?") is a **recommendation/help request**, not a "how much stock do I have" question — but the classifier matches it to the `STOCK` metric via the literal word "stock" and would (for a logged-in user) attempt a stock-quantity answer instead of recognizing the actual ask. This is a semantic-shape/intent-classification gap, not language-specific (the same literal-keyword risk exists in English), but it is one of your explicitly required Kiswahili test cases and is recorded here as a real finding.

**Could not verify beyond the classifier stage:** no authenticated InterestOS business-owner session exists in this sandboxed environment, so the actual Kiswahili-language rendering of a real computed answer (`computeSummary()`'s real numbers, realized in Kiswahili) was not exercised this pass. Recorded as **UNVERIFIED**, not assumed working.

### 2.5 Application-recommendation: hard-coded English app list, honestly wrapped

**Reproduced:** `"Ni application gani inaweza kusaidia kanisa?"` and `"Ni application gani inaweza kusaidia duka langu?"` both → the same, verbatim, hard-coded English sentence (`"CozyOS currently includes these applications: ChurchOS, ShopOS, MpesaOS..."`), prefixed with the same honest "no confirmed Kiswahili translation" disclaimer as §2.3.

**Exact source:** `cozy-answer-engine.js:124`, `renderResultContent()`:
```js
return `CozyOS currently includes these applications: ${raw.applications.join(", ")}.`;
```
No Kiswahili branch exists. It was reached only because the query contained the literal English loanword "application" (matching `CONTEXT_KNOWLEDGE_ROUTES`'s `"application"` keyword by accident) — a genuinely Kiswahili phrasing without that loanword ("Ni programu gani inaweza kusaidia kanisa?") would very likely produce ROOT CAUSE A's silent English fallback instead, since `getContext()` has no other route to `listApplicationsFact()`.

Also: neither of these two real, distinct questions ("which app helps a church" vs. "which app helps my shop") received a different answer — both got the full, undifferentiated 12-item app list, never narrowed to ChurchOS/ShopOS specifically. This is a real-recommendation-quality gap independent of language.

### 2.6 Generic "what is CozyOS about" questions decline instead of answering

**Reproduced:** `"CozyOS inahusu nini?"` and `"Naweza kufanya nini na CozyOS?"` both → the rule-based provider's honest clarification message (`"Bado sina jibu la kanuni kwa hilo..."`), in correct Kiswahili, but these read as legitimate, answerable questions (the platform-identity FAQ router presumably has a triggerable "what is CozyOS" answer, given `"CozyOS ni nini?"` worked) that this phrasing simply didn't trigger. Recorded as a genuine intent-coverage gap. Not yet confirmed whether the English equivalents ("What is CozyOS about?", "What can I do with CozyOS?") fare any better — if they do, this is Kiswahili-specific; if they don't, it's a general phrasing-coverage gap. **UNVERIFIED which.**

### 2.7 Deictic follow-up ("Na hii je?") does not resolve

**Reproduced:** after `"ShopOS inafanya nini?"` correctly answers about ShopOS, `"Na hii je?"` ("And what about this?") gets the generic clarification fallback instead of re-answering about ShopOS (the entity a human would obviously understand "hii" to mean). This is the deictic-resolution gap the user explicitly asked to be tested — confirmed present. `"hii"` is a real, registered marker in both language-detection lists (so this is not a language-*detection* failure) — the gap is in the conversational provider's own follow-up/reference resolution for this specific phrasing, not language detection.

### 2.8 Code-switching (Kenyan conversational)

**Reproduced:** `"Nataka app ya kusaidia biashara yangu, especially stock na sales."` → a compound answer: the business-data classifier's correct Kiswahili login-required decline, **followed by** the same hard-coded, honestly-wrapped English app list from §2.5 (triggered by "app"/matching an English route). The system did not get confused or crash, and nothing was silently mislabeled — but the response is a visibly two-language stitched answer for a single mixed-language question, not a single coherent Kiswahili-dominant reply. `"Nimekwama na stock, naweza tumia gani?"` alone (repeated in this session) correctly stayed 100% Kiswahili.

### 2.9 Advice/troubleshooting: no Kiswahili path found

`core/modules/intelligence/advisor/cozy-advisor.js` (the file the prior `MULTILINGUAL-INTELLIGENCE-AUDIT.md` already flagged as one of 3 competing, unreconciled response-mode vocabularies) contains **zero** matches for `"sw"` anywhere in its source. Not independently real-browser tested this pass (no reliable trigger phrase found within the time budget) — recorded as a probable **GAP**, not confirmed by reproduction, and should be the first thing tested in the next pass.

### 2.10 Language-detection root cause — two independent, closed, hand-curated marker lists

Two separate functions decide whether a turn is treated as Kiswahili, and both are closed word lists that silently default to English when nothing matches:

- `core/modules/intelligence/providers/rule-based-conversational-provider.js:877-960`, `detectLanguageHeuristic()` — ~70 hand-picked Kiswahili words, returns `null` (undetected) if none match or the word doesn't end in `-je`.
- `core/living/cozy-ai-semantic-intent.js:173-179,299-308`, `detectLanguages()` — a **separate** ~45-word list; explicitly comments `// honest default, matches existing repo-wide convention` when defaulting to `"en"` on zero matches (line 306).

Both lists are missing "duka" (shop) — directly explaining the `"Nina duka."` reproduction in §2.1. The two lists also disagree with each other in places (e.g., `"kunisaidia"` is on the SemanticIntentEngine list but not on the rule-based-provider list), which is itself a real, disclosed-nowhere inconsistency between two systems that are each supposed to answer the same question ("what language is this turn in?").

**This is a real, structural, closed-vocabulary limitation** — by construction, any genuinely novel Kiswahili sentence using words neither list happens to contain will misdetect as English (or, for SemanticIntentEngine specifically, silently default to English). It is not an external dependency; it is addressable by extending the existing lists (as this repo's own commit history already does repeatedly, per the extensive comments documenting each prior "found missing after a live test" addition) or, more durably, by reconciling the two lists into one (closing the disclosed duplication).

---

## 3. What already works — do not regress this

- Named-application questions ("X inafanya nini?", "X inasaidiaje mtu?", "X ina umuhimu gani?") — fully native, real Kiswahili evidence, correct entity naming, verified in this pass and in the prior Wave 6/7 checkpoint.
- The SA-1..SA-6 semantic-answer construction pipeline itself has no English-intermediary step anywhere in its real, traced code path — every Kiswahili claim comes from real, committed Kiswahili evidence (`cozy-answer-engine-semantic-construction.test.js` Test D, still passing, unmodified).
- `cozy-business-data-intent.js`'s EN+SW metric/time-range keyword tables are real, tested, and correctly triggered by natural Kiswahili phrasing including agglutinated/implicit forms (the word-boundary "faida"-vs-"inafaida" fix already documented in that file's own header).
- STT: real BCP-47 `sw-KE` locale qualification already wired (`cozy-speech.js:2071-2089`, "Kiswahili Capability Dependency #1"), fail-closed on genuinely unregistered languages.
- TTS: never fabricates a Kiswahili voice; honestly reports whether a dedicated one is installed on the device (`cozy-tts-browser-adapter.js:107-120`).
- The `"content:english-only-notice"` disclosure pattern (§2.3/§2.5) is the correct architectural response to a real content gap — extend its coverage, don't replace its mechanism.
- Clarification and honest-decline messages, where they DO have Kiswahili coverage, are natural, not word-for-word translated ("Bado sina jibu la kanuni kwa hilo — kwa sasa uelewa wangu wa mazungumzo unahusisha tu salamu, maombi ya msaada, shukrani, na maswali yaliyowekwa wazi kuhusu CozyOS yenyewe.").

---

## 4. Gap classification (required taxonomy)

| Finding | Classification |
|---|---|
| §2.1 hard-coded English "no evidence" fallback | **IMPLEMENTATION_DEFECT** — code path ignores an already-available language value |
| §2.2 `getContext()` English-only routing tables | **IMPLEMENTATION_DEFECT** (pre-existing, re-confirmed) — closed English vocabulary, not a missing capability |
| §2.3 founder-story partial Kiswahili content | **KISWAHILI KNOWLEDGE GAP** (content, not code) — code's own handling is correct |
| §2.4 stock/advice-request misclassified as a metric lookup | **SEMANTIC GAP** — language-independent shape confusion, happens to be demonstrated in Kiswahili |
| §2.5 hard-coded English app list + undifferentiated recommendation | **IMPLEMENTATION_DEFECT** (hard-coded string) + **APPLICATION-DATA GAP** (no per-app-need matching logic exists at all, in any language) |
| §2.6 generic "what is CozyOS about" declining | **UNVERIFIED** — could be a **KISWAHILI VOCABULARY GAP** (this exact phrasing) or a general **SEMANTIC GAP**; needs an English-equivalent control test |
| §2.7 deictic follow-up not resolved | **GRAMMAR/CONSTRUCTION-ADJACENT SEMANTIC GAP** — not a language-detection failure (the marker "hii" IS recognized); a conversational-state/reference-resolution gap |
| §2.8 mixed-language stitched answer | **IMPLEMENTATION_DEFECT** (same root cause as §2.5) manifesting as a coherence problem under code-switching |
| §2.9 `cozy-advisor.js` no Kiswahili handling | **GAP, not yet reproduced** — flagged, not confirmed by browser test this pass |
| §2.10 closed-vocabulary language detection | **KISWAHILI VOCABULARY GAP**, structural — by construction, will always have edge misses; the fix is extend+reconcile, not "complete" in any finite pass |
| Comparison-question gap (§1, "ChurchOS ina tofauti gani na ShopOS?") | **IMPLEMENTATION_DEFECT**, likely language-independent — **UNVERIFIED** in English this pass |
| STT real-device recognition accuracy | **BLOCKED_ENVIRONMENT** — cannot be verified without a real microphone and a real device; the code-level wiring is correct and already disclosed as such |
| TTS real Kiswahili voice availability | **BLOCKED_DEPENDENCY (external, device-level)** — not a CozyOS code gap; see §5.1 |
| Report/troubleshooting/calculation categories | **UNVERIFIED** — not reached within this pass's time budget |

No test was deleted or weakened to produce any of the findings above. No pre-existing failure is treated as acceptable because it predates this audit — every GAP and IMPLEMENTATION_DEFECT above is recorded as open.

---

## 5. Dependency analysis

**No external dependency is required to fix any of the IMPLEMENTATION_DEFECT or in-repo GAP findings above (§2.1, §2.2, §2.5, §2.6, §2.7, §2.8, §2.9, §2.10).** Every one of them is addressable by extending existing, already-real seams already used elsewhere in this exact repository for the exact same purpose:
- `cozy-language-realize.js`/`cozy-language-templates.js` — the existing universal realization seam, already used for the entity-aware intro fix (Cluster 7) and the `"content:english-only-notice"` pattern. The hard-coded strings in §2.1/§2.5 belong here, as new template keys, not new logic.
- `cozy-business-data-intent.js`'s own `METRIC_KEYWORDS`/`FOLLOWUP_MARKERS` pattern — the template for extending §2.2's routing tables with a parallel Kiswahili keyword set, exactly as this file already does for its own domain.
- `detectLanguageHeuristic()`/`detectLanguages()` (§2.10) — extend the existing marker lists (the repository's own established, repeatedly-used pattern, visible in that function's own multi-paragraph revision history) or reconcile the two into one shared list (closing a disclosed duplication, per the standing Architecture Guardian principle).

### 5.1 The one genuine external dependency — explicitly not faked

**Exact dependency:** a real, installed Kiswahili (`sw-KE`) text-to-speech voice and/or speech-recognition language pack on the actual device/browser a user is running CozyOS from.

**Why it is required:** CozyOS's TTS (`cozy-tts-browser-adapter.js`) and STT (`speech-recognition-adapter.js`) both correctly delegate to the browser's own Web Speech API rather than shipping a private voice/recognition engine (per the "no second TTS/voice system" rule) — this is the CORRECT architecture, not a gap to fix in code.

**Where it belongs:** entirely outside this repository — it is an OS/browser-level resource (e.g., Chrome/Android's own installed TTS voices, or a Kiswahili language pack for the platform's speech-recognition service).

**Whether an existing CozyOS component can provide it:** No — and it should not try to; doing so would mean bundling a private voice/recognition engine, which directly violates the "no second TTS/voice system" rule you set.

**Whether an external model/data/resource is required:** Yes, but it is a standard OS/browser capability, not a CozyOS-specific model.

**Exact files/data/model/configuration needed:** None on the CozyOS side — the code already correctly detects and reports voice/recognition availability (`dedicatedVoiceMatched`, `"language-not-supported"` fail-closed error).

**What I need from you, if anything:** Nothing is blocking further CODE work. If you want the STT/TTS *accuracy* (not just the wiring) verified with real Kiswahili speech, that requires testing on a real device with a real microphone and real installed Kiswahili voice/recognition support — this sandboxed, headless-Chromium environment cannot produce that evidence no matter what is fixed in code. That is the only genuine stop-and-ask dependency found in this entire audit.

**How it would be verified once available:** a real-device manual test (or a device-lab automation this environment doesn't have) speaking real Kiswahili sentences into STT and listening to real TTS output, compared against the same already-passing text-level Kiswahili test matrix in this report.

---

## 6. 12-wave mapping

Per instruction: this states which wave each finding belongs to and where its immediate failure lives — it does not declare any wave complete.

| Finding | Immediate failure location | Wave(s) |
|---|---|---|
| §2.1 hard-coded English fallback | `cozy-answer-engine.js:648` (W7's own response-construction layer) | **W4** (a hidden English default, not merely an intermediary translation step, but the same class of violation), **W7** (Response Construction & Validation — the exact function that constructs the final answer) |
| §2.2 English-only `getContext()` routing | `cozy-ai.js:239-309` | **W5** (Universal Language-Aware Knowledge — this is the retrieval-routing layer over knowledge), **W4** |
| §2.3 founder-story partial content | `cozy-knowledge-registry.js`/founder-story data | **W5** (content gap in the language-aware knowledge layer) |
| §2.4 stock/advice misclassification | `cozy-business-data-intent.js` METRIC_KEYWORDS matching | **W2** (Universal Semantic Foundation — an intent/goal-shape confusion, not a language problem) |
| §2.5 hard-coded app list + no per-need matching | `cozy-answer-engine.js:124` | **W4**, **W5**, and **W8** (Universal Application Integration — the missing "which app fits my need" capability graph is squarely W8's scope, not yet built for any language) |
| §2.6 generic CozyOS questions declining | `rule-based-conversational-provider.js` intent/trigger coverage | **W3** (Native Multilingual Understanding) — pending the English-control check named in §2.6 |
| §2.7 deictic follow-up not resolved | conversational provider's reference/follow-up handling | **W2**, **W3** |
| §2.8 code-switching stitched answer | same as §2.5, compounded by real code-switching input | **W3**, **W4** |
| §2.9 `cozy-advisor.js` no Kiswahili | `cozy-advisor.js` (entire file) | **W3**, **W7** — not yet reproduced, so not yet fully located |
| §2.10 closed-vocabulary language detection | `rule-based-conversational-provider.js:877-960`, `cozy-ai-semantic-intent.js:299-308` | **W3** (this is literally the "native multilingual understanding" entry point — a detection miss here cascades into every later wave) |
| Comparison-question gap | wherever comparison intent is resolved (not yet located precisely) | **W7** — **UNVERIFIED** whether W3-specific |
| STT/TTS device dependency | N/A (external) | **W11** (Real-World Multilingual/Voice Acceptance) — this is exactly what W11 exists to verify, and exactly why it cannot be claimed done from this environment |

**Explicitly NOT claimed by this audit:** no wave is being marked complete. W3 in particular — the wave whose name most closely matches "is Kiswahili native" — is **not** satisfied merely because named-application questions work; §2.1/§2.2/§2.6/§2.7/§2.10 are all real, reproduced, native-understanding gaps that remain open under W3's own name. W11 cannot be claimed at all without real-device voice testing (§5.1). W12 (Full-System Verification) is definitionally blocked by every open item above.

---

## 7. Real-browser evidence log

All probes below were run in this pass, real headless Chromium, real DOM, `dashboard.html`, via `window.CozyOS.LivingAssistant.open()` → real text entry → real Enter keypress → real rendered message read-back (identical harness to every other real-browser suite in this repository). Full raw transcript available on request; representative excerpts are quoted inline in §2 above. Sessions run: general CozyOS (3 turns), business onboarding/implicit (3 turns), business data questions (3 turns), help/clarification generic (3 turns), deictic follow-up (2 turns), code-switching (2 turns), EN→SW→EN terminology persistence (3 turns), SW→EN→SW terminology persistence (3 turns), application recommendation (2 turns), unknown/unavailable/security probes (3 turns), comparison/why (2 turns). **29 real Kiswahili/mixed turns total this pass**, across 11 independent fresh Live Window sessions plus 2 multi-turn continuity sessions.

**EN→SW→EN and SW→EN→SW terminology persistence: PASS.** ShopOS asked EN→SW→EN and ChurchOS asked SW→EN→SW both produced correct, entity-named, language-matched answers on every turn with no drift (this reconfirms the Wave 6/7 checkpoint's own continuity fix under a wider phrase set).

---

## 8. Repairs made this pass

**None.** Per your explicit instruction ("First establish the complete evidence... Stop at the commit gate"), this pass is audit-and-report only. No production file was modified. `git status` is unchanged from the last authorized commit (`8a91ffa`) plus this report file itself.

## 9. Tests added this pass

**None** (see §8) — the real-browser evidence in §7 was gathered via a disposable scratch script (not committed, not left in the repository), consistent with "audit only, no implementation."

---

## 10. Files changed

**None.** `git status --short` shows only pre-existing untracked artifacts (`MULTILINGUAL-INTELLIGENCE-AUDIT.md`, `cozy-taskbar-cdp-diagnostic-*/`, both already flagged as unrelated in the prior checkpoint) plus this new report file.

---

## 11. What I recommend as the next authorized step (not yet authorized)

In priority order, if you want implementation to proceed:
1. **§2.1** — add a Kiswahili (and audit any other missing-language) variant of the "no verified information" fallback via the existing `cozy-language-realize.js` seam; make the return at `cozy-answer-engine.js:648` actually consult `effLang`/`language`. Smallest, highest-impact fix in this report.
2. **§2.10** — extend `detectLanguageHeuristic()`'s and `detectLanguages()`'s marker lists with the words this pass's own reproductions proved missing ("duka" at minimum), and flag the two-list inconsistency for reconciliation.
3. **§2.2/§2.5** — extend `CONTEXT_STORY_ROUTES`/`CONTEXT_KNOWLEDGE_ROUTES` with a parallel Kiswahili keyword set, same pattern as `cozy-business-data-intent.js` already proves out in this same repository.
4. **§2.9** — reproduce (or rule out) an `cozy-advisor.js` Kiswahili gap with real trigger phrases before treating it as confirmed.
5. **§2.6/comparison-gap** — run the English-equivalent control questions to determine whether these are Kiswahili-specific or general coverage gaps, before deciding which wave truly owns them.

**Stopped here. Awaiting your review against the 12-wave roadmap and explicit authorization before any implementation begins.**
