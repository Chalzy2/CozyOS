# Domain 4D — Intent Understanding — Checkpoint Report

## 1. Quick Reader
Read `rule-based-conversational-provider.js` (the real, existing
`classifyIntent()`/`INTENT_RULES`/`composeReply()` classifier — the same
one Domain 4B already extended), `CozyAdvisor.classifyRequest()`
(ADVICE/ENCOURAGEMENT/UNKNOWN_REQUEST classification, unaffected here),
`cozy-living-assistant.js#send()` (confirmed unchanged — its existing
UNKNOWN_REQUEST fallback path already reaches this provider), and
`cozy-language-templates.js` (template convention to extend).

## 2. Quick Scanner
Ran the real classifier against every phrase in Domain 4D's own required
test list (Kiswahili + English), directly, before touching any code:

| Phrase | Before this fix |
|---|---|
| "Nataka kujisajili." / "I want to register." | `how-to-register` (correct, unaffected) |
| "CozyOS ni nini?" / "What is CozyOS?" | `what-is-cozyos` (correct, unaffected) |
| "Nataka kufungua QuarryOS." / "Open QuarryOS." | `unsupported` (honest gap, both languages consistent) |
| "Nataka kuona oda zangu." / "Show me my orders." | `unsupported` (honest gap, both languages consistent) |
| "Nataka kubadilisha lugha." / "I want to change my language." | `unsupported` (honest gap, both languages consistent) |
| "Fungua mipangilio yangu." / "Open my settings." | `unsupported` (honest gap, both languages consistent) |
| **"Nisaidie kutafsiri ujumbe huu kwa Kifaransa."** | **`help`** — wrong, via a coincidental "nisaidie" substring match |
| **"Translate this into French."** | **`unsupported`** — no rule existed at all |

## 3. First real intent dependency (evidence, not guessed)
**No "translate this" intent existed anywhere in the classifier, in
either language.** This was the one genuine classifier defect among the
tested phrases (the app-launch/orders/language-switch/settings gaps are
honest, consistent, correctly-unimplemented features — not classifier
bugs, and out of this domain's scope per its own "do not force
classification" rule). The Kiswahili case was actively wrong (silently
answered with generic help text), and — critically — neither language
could ever reach Domain 4C's real, newly-built TranslationService/Gemini
adapter, because nothing upstream ever recognized the request as
translation-shaped.

## 4. Implementation
- **`rule-based-conversational-provider.js`**: added a real
  `translate-request` intent rule (EN + SW patterns, positioned before
  the generic `help` rule so it can no longer be shadowed), a small
  disclosed `TARGET_LANGUAGE_NAMES` lookup (restricted to the 5
  languages `CozyLanguageRegistry` actually marks AVAILABLE — Luo/etc.
  deliberately excluded so recognizing a name never implies a capability
  Domain 4B never verified), and a `composeReply()` case that **only
  ever recognizes and asks for text** — it never calls
  TranslationService/Gemini itself and never fabricates translated
  content, since "this message" refers to conversation context this
  stateless classifier has no access to.
- **`cozy-language-templates.js`**: added real
  `"translate-request:target-known"`/`"target-unknown"` templates
  (EN/SW/FR/AR/SO), matching the existing template convention exactly.
- **1 new test file**, 10 tests.
- **No changes** to `CozyAnswerEngine`, `CozyIdentityFAQRouter`,
  `CozyAdvisor`, `cozy-living-assistant.js`, or any Domain 4A/4B/4C file.

## 5. Kiswahili test results
All required Kiswahili phrases produce correct, evidence-grounded
results:
- "Nisaidie kutafsiri ujumbe huu kwa Kifaransa." → `translate-request`,
  reply: *"Nimeelewa — unataka kitu kitafsiriwe kwa French. Tafadhali
  nitumie maandishi halisi unayotaka yatafsiriwe."*
- Known, disclosed minor quality gap: the target-language name shown
  ("French") is the shared `languageDisplayName()` helper's English
  name, not the Kiswahili word ("Kifaransa") — this reuses existing,
  established infrastructure rather than building a new localization
  table; noted honestly, not hidden.
- "Nataka kujisajili." / "CozyOS ni nini?" / "Nataka msaada." all
  confirmed still correct (regression-tested).
- "Nataka kufungua QuarryOS." / "Nataka kuona oda zangu." / "Nataka
  kubadilisha lugha." / "Fungua mipangilio yangu." all still honestly
  `unsupported` — correctly NOT force-classified.

## 6. English regression
All required English phrases confirmed: registration, what-is-cozyos,
and the new "Translate this into French." (`translate-request`,
correctly naming French) all pass; app-launch/orders/language-switch/
settings remain honestly `unsupported`, matching Kiswahili exactly (no
language asymmetry introduced or found).

## 7. Structured intent result
`think()`'s existing return shape already carries `{text, intent,
language, requestedLanguage, languageFallback, pipeline}` — unchanged.
No new fields were added since none were required for this fix: the
recognized target language is expressed in the reply text itself, not a
new structured field, keeping this change minimal per the domain's own
"do not add fields not actually required" rule.

## 8. Security result
`translate-request` performs no action, reads no protected data, and
calls no external service — it is a pure classification + a static
lookup + a template render. Confirmed no path to TranslationService,
Gemini, or any secret exists in this change.

## 9. Continuous-learning implication (recorded, not built)
This domain did not require building a learning system — the first real
dependency was a classifier gap, not a learning gap. Recorded for the
architectural record: a future controlled learning mechanism could
treat a person's follow-up correction after a `translate-request`
"target unknown" reply (e.g., them naming the language explicitly next)
as real, authorized evidence — but no such mechanism exists yet, and
none was built here, per the explicit "do not build unless the first
dependency requires it" instruction.

## 10. Test counts
| Suite | Result |
|---|---|
| New: `rule-based-conversational-provider-domain4d-intent.test.js` | 10/10 pass |
| Existing: rule-based-conversational-provider (all 6 existing suites) | pass, no regressions |
| Domain 4A dependency-linked | pass |
| Domain 4B dependency-linked | pass |
| Domain 4C real-path + Gemini adapter | pass |
| **Combined this verification** | **59/59 pass** |
| living-assistant (checkpoint-K, reply) re-check | 2/2 pass |

**0 regressions.**

## 11. Domain 4D status: substantially advanced, first dependency resolved
The one identified, evidenced classifier defect is fixed and tested in
both reference languages. Broader intent-understanding work (app-launch/
action routing, language-switch, settings navigation) remains honestly
unimplemented and correctly reported as such — these are separate,
future dependencies (Domain 4I/4J scope), not defects in what exists
today.

## 12. Checkpoint
Repository files changed — checkpoint created below.

## 13. Next dependency (exactly one)
**Application/action-launch intent routing does not exist at all** —
"open QuarryOS"/"fungua QuarryOS" (and any other named application) has
no intent rule and no application registry lookup anywhere in this
classifier. This is the next concrete, evidenced gap blocking Domain 4I
(Application Awareness): recognizing "open X" as an intent, resolving
"X" against the real application/module registry, and returning a
structured `{intent: "app-launch", applicationId, requiresAuthorization}`
result — never itself performing navigation, exactly like this domain's
own action-boundary rule requires.
