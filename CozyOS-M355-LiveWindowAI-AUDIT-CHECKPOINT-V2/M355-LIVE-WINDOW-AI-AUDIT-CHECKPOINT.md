# M355 — Live Window AI Knowledge Integration — AUDIT CHECKPOINT (NOT CERTIFIED, NO CODE CHANGED)

Status: IN PROGRESS — NOT COMPLETE (Rule 14). This is an audit/diagnostic
checkpoint only. Zero production files were modified this pass. Packaged so
the next session can resume without redoing the trace.

## 1. What "Live Window AI" is (confirmed)

`core/living/cozy-living-assistant.js` — the floating "Living Assistant"
panel mounted on `index.html`, `dashboard.html`, and `admin-workspace.html`.
Distinct from `core/living/cozy-living-ai.js` (`window.CozyOS.LivingAI`,
the rule-based reasoning/state-machine pipeline it composes for side
effects only — sounds/thinking-state/diagnostics, not conversational
answers).

## 2. Chain traced (Static Verified ✅)

```
cozy-living-assistant.js #send()
  -> window.CozyOS.CozyAnswerEngine.answer(question, {actorId})
       -> window.CozyOS.CozyIdentityFAQRouter.resolve()   (tried first)
            -> window.CozyOS.DeveloperIdentity             (public profile;
               core/identity/developer-profile.js + project-history.js +
               african-knowledge-initiative.js + cozyai-identity.js)
       -> window.CozyOS.CozyAI.getContext()                (falls through
            to this when the FAQ router doesn't match)
            -> core/modules/intelligence/knowledge/cozy-knowledge-registry.js
  -> window.CozyOS.CozyAdvisor.advise({question, answerResult})
  -> renderAdvisorReply(advice) -> rendered in the panel
```

Confirmed by reading the actual code (not just comments):
- `#matchDeveloperIdentityTopic()` — the old hardcoded shortcut — has
  genuinely been removed from `cozy-living-assistant.js` (grep-verified,
  only referenced in changelog comments, not in executable code).
- `cozyos-identity-faq-router.js` never imports/reads the private Founder
  Story Vault (`founder-story-seed.js`/`founder-story-engine.js`) — only
  the public `DeveloperIdentity`. This matches the M355 requirement not to
  invent or leak private facts.
- Real EN + Kiswahili trigger phrases exist for founder/origin/mission/
  vision/differentiation/values/future/community, including the literal
  "mwanzilishi wa cozyos ni nani" phrasing named in the test list.
- `COZYOS_NAME_MEANING` is honestly answered as "not documented yet" in
  both languages — a disclosed gap, not a fabricated fact. This is the
  correct behavior for "if information is not verified, say so."
- Script include order on all three shell pages (`index.html`,
  `dashboard.html`, `admin-workspace.html`) loads
  `developer-profile.js`/`project-history.js`/`african-knowledge-
  initiative.js`/`cozyai-identity.js` BEFORE `cozy-ai.js` ->
  `cozyos-identity-faq-router.js` -> `cozy-answer-engine.js` ->
  `cozy-advisor.js` -> `cozy-living-assistant.js`. No load-order defect
  found by static reading.

## 3. Real-browser test attempted (Real Chromium, Playwright, /opt/pw-browsers)

Served the repo root over `python3 -m http.server`, loaded `index.html`,
waited for the launch-sequence overlay to hide, then tried to click
`#cozy-living-assistant-btn`.

**Result: FAILED to mount.** `window.CozyOS.LivingAssistant` was
`undefined` after load + 10s of additional polling. `document.scripts`
in the live DOM showed only ~34 script tags, while the HTML source
declares 100+ by the point `cozy-living-assistant.js` is included. The
DOM was truncated somewhere after the early security/session/background
scripts and before the identity/intelligence chain — i.e. the assistant's
own script tag was never present in the live document, despite being
present in the static HTML file.

This is **not** the same as the already-disclosed, pre-existing sandbox
gaps (no backend → `/webauthn/session` 404, no internet → Firebase
gstatic CORS failure, no H.264 → video codec errors) — all three of
those did reproduce here exactly as previously documented, but they are
unrelated to why the DOM itself is short ~70 script tags.

**Root cause NOT yet found.** A targeted grep for `document.write(`
(the classic cause of a post-load DOM wipe) found no hits in production
code — only references to it inside `cozy-bugfixer.js`/
`cozy-certification.js`'s own detection rules and `cozy-workspace.js`'s
security-scan pattern list, none of which execute it themselves. The
next hypothesis to check (not yet checked): a script between the
security chain and the identity chain throwing synchronously in a way
that's specific to being served without the real backend (Firebase
init throwing before catching, for example), or a dynamic `innerHTML`
replacement of `<body>` by the launch sequence / startup orchestrator
that only takes effect after a real `DOMContentLoaded`/`load` race this
sandbox's timing exposes.

## 4. Test results (per M355 spec)

Could not be produced honestly — the panel never rendered, so none of
the five questions were actually asked in a live browser. No answers are
reported here rather than guessing what the wired chain "should" say.

## 5. Next steps for the next session

1. Bisect the script list in `index.html` to find exactly which
   `<script>` tag's execution is the last one to land in the live DOM,
   then read that file and the next one for a synchronous throw or a
   body-replacing DOM write.
2. Once the assistant panel reliably mounts in this sandbox, rerun the
   five-question test and capture real replies before touching any
   integration code — per the M355 instruction, this may turn out to
   need zero AI/knowledge-layer changes at all (the traced chain reads
   correctly) and only a mounting/loading fix.
3. Do not modify `cozy-living-assistant.js`, `cozy-answer-engine.js`,
   `cozy-advisor.js`, or `cozyos-identity-faq-router.js` until the mount
   defect is isolated — changing the knowledge chain now would be
   changing code that hasn't been proven broken.

## Certification

NOT CERTIFIED (Rule 14/16) — this is a diagnostic checkpoint, not a
milestone deliverable. No files in the production tree were edited this
pass.
