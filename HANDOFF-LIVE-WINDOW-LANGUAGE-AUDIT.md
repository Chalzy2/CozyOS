# HANDOFF — Live Window Language + Kiswahili Benefit-Question Repair

Everything the original task ("FIX LIVE WINDOW LANGUAGE + COZYOS BENEFIT
REGRESSION NOW") asked for is **done and verified**, including the real
Playwright/Chromium DOM-level pass against the actual `dashboard.html`.
This note exists so a different builder can pick this up with full
context if anything further comes up.

## What was actually broken (confirmed by tracing the real code path)

The real Live Window answer chain, per `cozy-living-assistant.js`'s
`#send()`: **`CozyAnswerEngine`/`CozyAdvisor` is tried first**; the
rule-based `think()` result (`rule-based-conversational-provider.js`)
is used as the visible reply **only when the answer-engine chain comes
back `UNKNOWN_REQUEST` + non-`VERIFIED`, AND the rule-based provider's
own classification is a real intent (not `"unsupported"`)**. When
neither side has a real answer, the answer-engine's own internal
fallback string ("Some related context exists...") is what the person
actually sees. So the fix had to happen at the **classification**
level in `rule-based-conversational-provider.js` — get these phrases
correctly routed to a real intent — not by patching the fallback
string itself.

## Files changed

1. **`core/modules/intelligence/knowledge/cozy-public-knowledge-source.js`**
   `TARGET_LANGUAGES` was missing Luganda/Igbo even though the registry
   and this same source document's own NOT_READY(6) line list them as
   part of "this 17-language list." Added both. Version bumped, change
   explained in an inline comment. **Disclosed, unresolved gap**: the
   source doc's own headline still says "17 languages" while only 15
   are ever named anywhere in it — that arithmetic gap predates this
   fix and was not invented an answer for.

2. **`docs/builder/knowledge/cozyos-public-vision-and-language-policy.md`**
   Added a short correction note next to the 13-language list pointing
   at the fix above, so the source-of-truth doc and the code agree.

3. **`core/modules/intelligence/language/cozy-language-templates.js`**
   Added two new template keys: `language-request:confirmed` (5
   languages) and `language-request:unrecognized` (5 languages). Both
   reuse the existing verified `greeting-generic` template for the
   actual greeting text — no new per-language prose was invented.
   Version bumped to 1.3.0.

4. **`core/modules/intelligence/providers/rule-based-conversational-provider.js`**
   (the core fix)
   - `normalizeUserText()`: added one exact fixed-table typo fix,
     `"inanisaiaje"` → `"inanisaidiaje"` (a real dropped-syllable typo
     found live-testing).
   - `why-use-cozyos` intent pattern: added three new real Kiswahili
     phrasing/word-order alternatives (each a genuine construction
     class, documented inline with why it's distinct from what already
     existed) covering: the object-infixed `-je` form
     ("inanisaidiaje"), the "nini X ina[verb] nayo" word order, and the
     "X ina faida gani (kwetu)" possessive-benefit phrasing.
   - New `SPEAKABLE_LANGUAGE_NAMES` map + `extractSpeakableLanguageCode()`
     — deliberately **separate** from the existing, intentionally
     narrower `TARGET_LANGUAGE_NAMES`/`extractTargetLanguageCode()` used
     by `translate-request` (recognizing a NOT_READY language name here
     does not imply a translation capability; do not merge these two
     maps).
   - New **`language-request` intent** (checked before
     `language-support-list`) — the actual routing fix. Handles "Do you
     speak X", "Can you talk to me in X", "Greet me in X", "Say hello
     in X", and their Kiswahili equivalents. The old, over-broad clause
     that let any single-language-name question get misrouted into the
     generic "which languages do you support" list was **moved** here
     (not duplicated) from `language-support-list`.
   - New `composeReply` case for `"language-request"`: extracts the
     requested language from the raw text (independent of whatever
     language the message itself was typed in — this is what makes
     "Greet me in French" actually reply in French rather than about
     French), resolves it through the real, existing
     `CozyLanguageRegistry.resolveLanguage()`, and replies using the
     real greeting template. Falls back honestly (with disclosure) for
     NOT_READY or unregistered languages — never fabricates a reply in
     a language that isn't verified.

5. **Tests** (all passing, see "How to re-verify" below):
   - New: `core/living/test/m365-live-window-language-routing-repair.test.js`
     (19 Node-level unit/regression tests against the real provider).
   - New DOM-level tests appended to the end of
     `core/living/tests/cozy-living-assistant-live-window-e2e.test.js`
     (3 new tests, 17 total in that file) — drives the **real
     `dashboard.html`** in a **real headless Chromium tab** via real DOM
     text entry + a real Enter keypress, reading the answer back from
     the real rendered message DOM. This is the actual browser-level
     proof the original task asked for.
   - Updated: `core/living/tests/cozy-living-assistant-domain4b-language-fallback.test.js`
     — three of its existing assertions literally encoded the OLD,
     buggy behavior ("Do you speak Kiswahili?" → `language-support-list`).
     Updated to assert the corrected `language-request` behavior, with
     the file's own header comment updated to match.
   - Also fixed one unrelated, pre-existing bug found while running the
     full suite: `core/living/tests/phase5-universal-ai-contract.test.js`
     had a hardcoded absolute path left over from a different machine/
     session (`/home/claude/cozyos/CozyOS-M355-...`). Changed to the
     same `require(CONTRACT_PATH)` pattern the rest of the file already
     uses. One-line, unrelated to this task's actual scope, but it was
     the only failure in the full sweep and trivial to fix.

## What was explicitly NOT done (by design, not oversight)

- **No Kiswahili translation of the `why-use-cozyos` answer prose was
  written.** Kiswahili callers asking a benefit/purpose question now
  correctly route to the real intent, but the answer itself is still
  honestly English-only with a disclosed note — this was already the
  case before this pass (same disclosed limit noted in the prior M364
  repair) and writing that translation was out of scope for a routing
  fix. If a future task wants a real Kiswahili translation of that
  vision/mission prose, it should go through the same evidence-backed
  process the rest of this codebase uses (see `cozy-public-knowledge-
  source.js`'s own comments on what counts as "verified").
- **No new languages were registered.** Luganda/Igbo were already
  `NOT_READY` in the registry before this pass; this fix only made the
  target-list text consistent with that existing registry state.
- **The doc's own "17 languages" vs. 15-named-languages arithmetic gap
  was not resolved** — flagged, not fabricated an answer for.

## How to re-verify from scratch

```bash
# Node-level unit/regression suite (fast, no browser)
node core/living/test/m365-live-window-language-routing-repair.test.js
node --test core/modules/intelligence/providers/tests/*.test.js \
            core/modules/intelligence/language/tests/*.test.js \
            core/modules/intelligence/knowledge/tests/*.test.js \
            core/living/test/*.test.js core/living/tests/*.test.js

# Real-browser DOM-level suite against the actual dashboard.html
# (needs a Chromium binary; this sandbox's was at
# /opt/pw-browsers/chromium-1194/chrome-linux/chrome — adjust for
# wherever you're running this, or omit the env var entirely if
# `npx playwright install chromium` has been run normally)
COZY_E2E_CHROMIUM_PATH=/path/to/chrome \
  node core/living/tests/cozy-living-assistant-live-window-e2e.test.js
```

Last run in this session: **728/729** Node-level tests passing (1
pre-existing, now-also-fixed hardcoded-path issue), **all 19** new
regression tests passing, **all 17** real-browser DOM tests passing
(including the 3 new ones for this exact bug report).

## Environment notes for whoever picks this up

- This workspace has **no `.git` directory** — it was unpacked from a
  zip, not cloned. There's also **no network egress** in this sandbox,
  so nothing here was pushed anywhere. If you're continuing this in an
  environment with an actual git remote, you'll want to `git init` (or
  just copy these changed files over your real clone) and commit from
  there — that part could not be done here.
- The zip you're reading this from was extracted with a duplicate
  nested `CozyOS-main/CozyOS-main/` copy inside it (an old, ~50-line-
  shorter snapshot of `dashboard.html`). That duplicate was audited
  (confirmed zero unique files) and removed in an earlier pass of this
  same session — the canonical root is the top level of this zip.
