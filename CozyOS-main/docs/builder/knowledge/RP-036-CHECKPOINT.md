# RP-036 Checkpoint — Assistant Intent/Routing Repair (English + Kiswahili)

Status as of this checkpoint: **core repair complete and green**. This file
exists so work resumes cleanly from a fresh unzip of this same archive
instead of re-diagnosing from scratch.

---

## 1. Root cause

`core/modules/intelligence/providers/rule-based-conversational-provider.js`
is the file that generates the
`"I don't have a rule-based answer for that yet..."` fallback (confirmed by
grepping the repo for that exact string before changing anything — it also
appears as a template key in `cozy-language-templates.js`, unchanged).

Two compounding gaps, both in `classifyIntent()` / its `INTENT_RULES` table
in that file:

1. The one existing registration-related rule (id `how-to-register`) only
   matched the phrase **"how do I register"**. A bare `"Register"`, `"I
   want to register"`, `"Create an account"`, `"Sign me up"`, etc. matched
   nothing, so `classifyIntent()` returned `"unsupported"`.
2. `classifyIntent()` had **zero non-English patterns anywhere**. This is
   the deeper bug: no Kiswahili input — register-related or not — could
   ever match any intent, regardless of how
   `core/modules/intelligence/language/cozy-language-registry.js` /
   `cozy-language-templates.js` (RP-027) were configured. Those two files
   only ever controlled which language the *reply* was written in; they
   never fed back into what the *input* was understood as.

Neither gap was a missing route, a disconnected AI provider, a stale
bundle, or a disabled rule engine — `resolveConversationalReply()` →
`LivingAI.think()` → this provider's own `think()` was reachable and
working correctly; it just didn't recognize the input.

## 2. Files changed (all additive — nothing removed)

- `core/modules/intelligence/providers/rule-based-conversational-provider.js`
  - Broadened the `how-to-register` rule's pattern (same intent id, so its
    existing template/tests are unaffected) to cover the English root
    `regist(?:er|ration)`, `sign up`/`sign me up`, bare `create an
    account`, and the Kiswahili verb stem `sajili` (kujisajili, kusajili)
    plus the `fungua akaunti` / `kufungua akaunti` phrasing.
  - Added Kiswahili trigger phrases to the existing `greeting-generic`,
    `thanks`, `identity`, `help`, and `what-is-cozyos` rules (same ids).
  - Added 6 new navigation intents: `nav-dashboard`, `nav-notifications`,
    `nav-recent`, `nav-search`, `nav-aiproviders`, `nav-diagnostics` — each
    with English and Kiswahili patterns.
  - Added `detectLanguageHeuristic(text)` — a small, disclosed,
    keyword-overlap heuristic (not a language-ID model) so a Kiswahili
    message is answered in Kiswahili automatically even with no explicit
    language option passed in. Wired into `resolveLanguage()` as a
    fallback for the `requested` slot only — an explicit manual setting or
    explicit per-call requested language still always wins (precedence:
    `manual > requested > detected > country > en`, unchanged from RP-027
    except for the one new fallback source).
  - Added `RP026_ENGLISH_FALLBACK` entries + `cozy-language-templates.js`
    entries (see below) for the 6 new nav intents.
  - Deduped `describe().supportedIntents` (cosmetic; two rules can share
    one id by design now).
  - Version bumped `1.0.0` → `1.1.0` with a header comment documenting all
    of the above.

- `core/modules/intelligence/language/cozy-language-templates.js`
  - Added `en`/`sw` template text for the 6 new nav intents. `fr`/`ar`/`so`
    deliberately not authored yet — `getTemplate()` already degrades
    honestly to the `en` string when a language entry is missing (existing
    RP-027 behavior, unchanged), so this is a disclosed partial-coverage
    gap, not a bug. **Known follow-up, not yet done.**

- `core/living/cozy-living-assistant.js`
  - Added `NAV_INTENT_ACTIONS` map + a call in `#send()`: when the
    classified intent is one of the 6 new nav intents, it now actually
    executes the navigation by calling the **existing, unmodified**
    `#runQuickAction()` (the same code path the quick-action buttons
    already use — real `[data-center]` link click / real notifications
    feed / real search prompt). No new or invented route. Version bumped
    `1.0.3` → `1.0.4`.
  - `Settings`/`Profile` navigation was deliberately **not** implemented —
    no single, unambiguous existing route was found for them in this
    repository (closest candidates, `configuration` / `themeStudio`,
    weren't a confident match). Per the "do not invent routes" constraint
    these fall through to the honest `unsupported` fallback. **Open item
    if a real Settings route is later confirmed.**

- `core/modules/intelligence/providers/tests/rule-based-conversational-provider-rp036.test.js`
  (new file) — 39 tests, all passing. Covers: the exact reported bug
  (bare "Register"), 13 English register synonyms, 5 Kiswahili register
  phrasings, 6 Kiswahili greeting/help/identity phrasings, 10 navigation
  phrasings (EN+SW), explicit-language-overrides-auto-detection
  precedence, and 3 regression guards (genuinely unsupported input still
  falls through; "Good morning" isn't swallowed by the broadened register
  pattern; RP-026 "Hello" behavior is byte-for-byte unchanged).

No files deleted. No existing RP-026/RP-027/RP-035 rule, template,
security/authorization, or NLLB-related file was touched.

## 3. Test results (all run and passing at this checkpoint)

```
core/modules/intelligence/providers/tests/rule-based-conversational-provider.test.js         14 passed, 0 failed   (RP-026, pre-existing, unmodified)
core/modules/intelligence/providers/tests/rule-based-conversational-provider-rp027.test.js    66 passed, 0 failed   (RP-027, pre-existing, unmodified)
core/modules/intelligence/providers/tests/rule-based-conversational-provider-project-knowledge.test.js  48 passed, 0 failed  (pre-existing, unmodified)
core/modules/intelligence/providers/tests/rule-based-conversational-provider-rp036.test.js    39 passed, 0 failed   (NEW, this repair)
```

Run any of them with `node <path-to-file>`.

## 4. What is NOT done yet (pick up here on resume)

1. **fr/ar/so translations** for the 6 new nav-intent templates in
   `cozy-language-templates.js` (currently fall back to English — honest,
   not broken, just incomplete).
2. **Settings/Profile navigation** — intentionally unimplemented pending a
   confirmed real route (see above). Do not guess one.
3. Have not yet done a **runtime/deployment verification pass** (item 20
   of the original brief — checking for stale bundles/service workers
   actually serving this fixed code in a real deployment). This checkpoint
   only covers the source-level repair and its own test suite; there is
   no live deployment available in this environment to verify against.
4. Have not exhaustively wired every item in the brief's full test matrix
   (e.g. Login/Logout/Profile/Settings/Theme/Accessibility intents) — only
   Register + the 6 navigation targets explicitly demonstrated as reachable
   real routes in this codebase, per the brief's own "do not invent
   routes" / "smallest safe change" instructions. Extending to more
   intents should follow the exact same pattern already established here
   (add pattern(s) to `INTENT_RULES`, add template entries, add a test).

## 5. How to resume from this checkpoint

1. Unzip the checkpoint archive — it's the full `CozyOS-main` project tree
   with the RP-036 changes already applied and passing.
2. Re-run all four test files above to reconfirm the starting state (`node
   <path>` each).
3. Continue from section 4 above.
