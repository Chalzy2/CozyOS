# M355 — Live Window AI Full CozyOS Integration — AUDIT CHECKPOINT v2 (NO CODE CHANGED)

Status: IN PROGRESS — NOT COMPLETE (Rule 14). Zero production files modified.
Login/chalzydashboard-gate/admin-workspace flow was NOT touched — all testing
went THROUGH the real, unmodified flow (real backend, real login.html form,
real chalzydashboard.html gate, real admin-workspace.html), per instruction.

## Real E2E method (this pass)
Real `server/webauthn-rp` backend + a minimal static/proxy front server
(same pattern as the repo's own `browser-e2e-admin-routing-fix.test.js`) +
real Chromium (Playwright). Real `/auth/register`, real `login.html` form
submit, real session cookie, real `chalzydashboard.html` → `admin-workspace.html`
gate for the admin-only checks. No shortcuts, no mocked auth, no bypassed
gate.

## Findings (Real Browser Verified ✅ unless noted)

1. **Ordinary login → index.html → Live Window AI mounts and answers
   correctly.** English ("What is CozyOS?") and Kiswahili questions —
   including phrasings BEYOND the router's exact trigger list
   ("Nani alianzisha CozyOS?", "CozyOS ilianzaje?", "Hadithi ya CozyOS ni
   ipi?", not just "mwanzilishi wa cozyos ni nani") — all resolved to the
   correct, real, non-fabricated founder/origin answer via the existing
   `CozyIdentityFAQRouter`'s word-overlap scoring (not exact-match only).
   This satisfies the "Kiswahili intent beyond exact triggers" requirement
   with the EXISTING router — no new intent engine needed.

2. **"What applications does CozyOS have?" on index.html's ordinary User
   Dashboard: honestly answered "I don't have verified information."**
   Confirmed by direct diagnostic: `ServiceRegistry.listApplications()`
   returns `[]` on that page because the ordinary User Dashboard shell
   doesn't load the application-registration scripts — not a knowledge-
   routing bug. `cozy-ai.js`'s keyword route (`application`/`app`/`module`)
   IS correctly present and does fire; there's just genuinely nothing
   registered yet on that shell. This is the system correctly refusing to
   fabricate, exactly as CozyKnowledge's own "NOT_FOUND, never a
   hardcoded fallback list" discipline requires.

3. **Same question on admin-workspace.html (reached via the real,
   unmodified chalzydashboard gate, admin-flagged test account):
   `ServiceRegistry.listApplications()` returns real registered apps**
   (ChurchOS, Authenticator, ShopOS confirmed present in this run).
   This confirms the application-knowledge path is real and reachable —
   its answer is scoped to which page's app-registration scripts have
   run, which is expected/correct, not a defect to "fix" by duplicating
   a registry.

4. **"What is verified vs planned?" was misclassified as an app-lookup**
   ("I don't have any registered application called \"verified vs
   planned\" — could you check the name?", from the real, existing
   `cozy-language-templates.js` app-not-found template — not fabricated,
   but the WRONG template for this question). This is the one genuine
   routing gap found this pass: the question never reached the
   VERIFIED-vs-PLANNED distinction CozyOS is supposed to be able to
   state — it fell into the app-name-lookup path instead. Root cause not
   yet isolated (which intent classifier in
   `rule-based-conversational-provider.js` is grabbing this phrase, and
   why) — flagged for the next session, not guessed at or patched blind.

5. Admin-workspace.html run surfaced pre-existing, already-disclosed
   sandbox-only noise (no repo code touched to produce or hide these):
   Firebase gstatic CORS/dynamic-import failures (no internet egress in
   this sandbox), a `PluginManager is not defined` reference error, and
   some 404s. These match the class of gaps already logged in prior
   canonical-merge checkpoints (real backend/real internet absent here)
   and were not investigated further this pass since they're outside
   M355's scope (Live Window AI knowledge integration) and unrelated to
   the AI/knowledge chain itself.

## What was confirmed NOT broken (no fix attempted, none needed)
- Live Window AI mounting (previous session's mount failure was a test
  artifact — no `?` auth session in that run — not a real defect; see
  checkpoint v1).
- CozyIdentityFAQRouter → DeveloperIdentity chain (public founder/story
  facts, EN+SW, natural phrasing).
- CozyAI.getContext() keyword routing to CozyKnowledge getters.
- ServiceRegistry-backed application knowledge, when the page has
  actually registered applications.
- No hardcoded answers found in `cozy-living-assistant.js` (old
  `#matchDeveloperIdentityTopic()` shortcut confirmed removed, not just
  claimed).
- Login → chalzydashboard gate → admin-workspace flow: untouched,
  exercised read-only for testing, not modified.

## Genuine remaining gap
"What is verified vs planned?" (and likely other verified/planned-style
meta questions) is being caught by an app-name-lookup intent before it
ever reaches a real verified/planned answer path. Needs tracing inside
`rule-based-conversational-provider.js`'s intent classifier next session
— not yet fixed, not yet guessed at.

## Certification
NOT CERTIFIED (Rule 14/16) — diagnostic checkpoint only, zero production
files modified this pass.
