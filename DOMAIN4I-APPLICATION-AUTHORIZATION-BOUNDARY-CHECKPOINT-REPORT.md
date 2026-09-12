# Domain 4I Dependency #2 — Application Action Authorization + Execution Boundary — Checkpoint Report

## 1. Quick Reader
Confirmed the canonical, real, already-existing authorization function:
`IdentityEngine.canAccessApplication(userId, appName)` — its own header
explicitly documents it as "the exact method the shell should call
first" and it already combines account status, admin/developer
override, global application toggle, and per-user assignment into one
real decision. `core/shell/cozy-workspace.js` already calls this exact
function to filter the application list shown to a user.

## 2. Quick Scanner
Traced the real gap precisely: `rule-based-conversational-provider.js`'s
`think(text, options)` never received a `userId`/`actorId` at all —
`cozy-living-assistant.js`'s `ai.think(text, {...})` call (distinct from
its later `CozyAnswerEngine.answer(text, {actorId})` call) never passed
one. So even though the real authorization function existed and the
app-launch intent could resolve an application, there was no user
context to authorize against — a pure wiring gap (category D/A: the
authorization mechanism exists, but the app-launch intent result was
never connected to it).

## 3. Existing authorization/navigation mechanism
`IdentityEngine.canAccessApplication()` (identity/permission decision) +
`core/shell/cozy-workspace.js` (real navigation/launch mechanism,
untouched). Neither was modified — this domain only connects the
already-resolved `app-launch` intent to the first of these two.

## 4. First real dependency
The missing `actorId` passthrough from `cozy-living-assistant.js` into
`ai.think()`, and the missing call from the provider's `app-launch` case
into `IdentityEngine.canAccessApplication()`.

## 5. Implementation
- **`cozy-living-assistant.js`**: `ai.think()` now receives
  `actorId: this.#resolveActorId()` — the exact same real actor
  resolution already used for the identity/knowledge chain. One-line,
  additive change.
- **`rule-based-conversational-provider.js`**: when `app-launch`
  resolves a real application, calls
  `IdentityEngine.canAccessApplication(actorId, application.name)` and
  sets `authorizationState` to one of `AUTHORIZATION_GRANTED` /
  `AUTHORIZATION_DENIED` / `AUTHORIZATION_REQUIRED` (no actorId, actorId
  is the generic `"system"` non-user, or `IdentityEngine` not loaded —
  all honestly degrade to `REQUIRED`, never a silent grant). The reply
  text reflects the real outcome; no state ever claims the application
  was opened.
- **`cozy-language-templates.js`**: three new real EN/SW/FR/AR/SO
  template sets for the three outcomes.
- **No new authorization system, no new registry, no navigation code
  added anywhere** — `IdentityEngine.canAccessApplication()` itself is
  completely unmodified (confirmed: `identity-engine.test.js`, 14/14
  pass, untouched).

## 6. Kiswahili result
"Fungua QuarryOS." (authorized ordinary user) → `AUTHORIZATION_GRANTED`,
honest Kiswahili reply. "Nifungulie Developer Hub." (unauthorized
ordinary user) → `AUTHORIZATION_DENIED`. Both verified via the real
function call, not a mock of the decision itself.

## 7. English result
"Open QuarryOS." (authorized) → `AUTHORIZATION_GRANTED`. "Open Developer
Hub." (unauthorized ordinary user) → `AUTHORIZATION_DENIED`, never
elevated.

## 8. Authorized execution result
`AUTHORIZATION_GRANTED` reply: *"I found 'QuarryOS' and you're
authorized to use it. I haven't opened it myself — that's a separate
step."* Confirmed by test: no reply in any state ever contains
"has been opened"/"opening now"/"launched successfully"/"navigating".

## 9. Unauthorized execution result
`AUTHORIZATION_DENIED` reply: *"I found 'Developer Hub', but your
account doesn't currently have access to it."* No navigation attempted,
no elevation, confirmed via the admin-example test using the real,
registered admin/developer-tier application ("Developer Hub" — the
closest real, registered equivalent to "administrator workspace," which
is not itself a registered application in this registry but a separate
server-authoritative flow per Domains 1–3).

## 10. Security boundary
- Real per-call authorization: confirmed the real function is called on
  **every** request (test: 3 identical requests → 3 real calls, "no
  cached/learned grant" proven directly).
- No actor → real function never even called (`AUTHORIZATION_REQUIRED`,
  0 calls confirmed) — never defaults to granted.
- `IdentityEngine` not loaded → honest degrade to `AUTHORIZATION_REQUIRED`,
  never a silent grant.
- No `roles:["platform-admin"]` or equivalent ever appears anywhere in
  a result (confirmed by direct string search in the admin-example
  test) — this domain introduces no new authority-elevation path,
  consistent with Domain 3's established invariant.

## 11. Continuous-learning implication (recorded, not built)
Not required by this dependency — no learning system exists or was
built here. Recorded: a future controlled mechanism could treat a
denied-then-corrected request, or a confirmed successful open, as
authorized evidence for improving name resolution — but explicitly
**never** as evidence that could itself grant authorization; this
domain's own test (`LEARNING BOUNDARY`) proves the real function is
re-checked every single time, with no caching or shortcut of any kind.

## 12. Test counts
| Suite | Result |
|---|---|
| New: rule-based-conversational-provider-domain4i-authorization.test.js | 14/14 pass |
| Updated: rule-based-conversational-provider-domain4i-app-launch.test.js (1 assertion corrected for the real, improved authorization behavior) | 16/16 pass |
| Existing: rule-based-conversational-provider (6 pre-existing + Domain 4D suite) | pass, no regressions |
| Domain 4A/4B/4C dependency-linked | pass |
| Combined this verification | 89/89 pass |
| identity-engine.test.js (the real authorization function, untouched) | 14/14 pass |
| living-assistant (checkpoint-K, reply) re-check | 2/2 pass |

## 13. Checkpoint
Repository files changed — checkpoint created and verified below.

## 14. Next dependency (exactly one)
Real navigation/action execution still does not exist. Even with a
AUTHORIZATION_GRANTED result now available, nothing connects it to
cozy-workspace.js's actual application-launch mechanism — the
conversational layer still only ever reports the authorization decision
in text. The next concrete gap: a real, separate action-execution
consumer (in the living-assistant UI layer, not the classifier itself)
that, upon seeing authorizationState === "AUTHORIZATION_GRANTED",
calls the existing, real navigation mechanism to actually open the
application — with the classifier's role ending exactly where it does
today.
