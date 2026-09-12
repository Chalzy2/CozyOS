# Domain 4I Dependency #3 — Authorized Application Launch: Real Navigation — Checkpoint Report

## 1. Quick Reader
Read core/shell/cozy-workspace.js's real app-card click handler and
discovered a real, disclosed dead-code finding in the process:
WorkspaceShell.registerLauncher()/.launch() (a #launchers Map) is
never actually populated by anything in the codebase (confirmed by that
file's own M345 comment: "this.#launchers is only ever populated by
registerLauncher(), which nothing in the codebase calls"). The REAL,
live launch mechanism is window.CozyOS.ApplicationLauncher.open(appId)
(core/shell/application-launcher.js), which mounts the application
inside the existing workspace shell using only a canonical appId —
confirmed by reading the exact click-handler code that calls it in
production.

## 2. Quick Scanner
Confirmed ApplicationLauncher.open(appId) is the sole real navigation
entry point, already public on window.CozyOS, already resolves the
application through the real, trusted registry/module system — never an
AI-supplied URL. resolveApplicationByName() (Domain 4I dependency #1)
already returns {id, name} from this exact same registry, so
application.id is already the correct canonical key this launcher
expects.

## 3. Existing canonical launcher
window.CozyOS.ApplicationLauncher.open(applicationId) —
core/shell/application-launcher.js. Not modified. Not duplicated.

## 4. First real dependency
Nothing anywhere consumed AUTHORIZATION_GRANTED at all — the
authorization decision (Domain 4I dependency #2) was computed and
reported in text, but no code path ever called the real launcher with
it. Pure missing wiring (category A: existing mechanism, not connected).

## 5. Implementation
- cozy-living-assistant.js: extracted a new, small, pure
  shouldLaunchApplication(result) function (same testability
  precedent as the existing renderAdvisorReply()/
  isNonEmptyReplyText() exports) — the exact, sole gate: returns a
  real applicationId only when intent === "app-launch" AND
  authorizationState === "AUTHORIZATION_GRANTED" AND a real
  application.id exists; null in every other case. #send() calls
  this function and, only on a non-null result, calls
  window.CozyOS.ApplicationLauncher.open(applicationId) — the exact
  canonical launcher, passing only the real registry id, never AI text,
  never a URL, never a DOM selector. Honest failure logging on a
  real launch failure; the already-sent reply text is never retracted
  or contradicted (it never claimed execution in the first place).
- No new launcher, no new registry, no new authorization system, no
  change to cozy-workspace.js or application-launcher.js.

## 6. Authorized Kiswahili launch
"Nifungulie QuarryOS." (authorized ordinary user) -> real provider
returns authorizationState: "AUTHORIZATION_GRANTED",
application: {id: "quarryos", ...} -> shouldLaunchApplication()
returns "quarryos" -> ApplicationLauncher.open("quarryos") would be
called. Verified via the real, unmodified provider's real output.

## 7. Authorized English launch
"Open QuarryOS." (authorized ordinary user) -> identical outcome,
shouldLaunchApplication() returns "quarryos".

## 8. Unauthorized result
"Open Developer Hub." (ordinary user, the real registered
admin/developer-tier application) -> authorizationState:
"AUTHORIZATION_DENIED" -> shouldLaunchApplication() returns null —
confirmed no navigation would occur. The same request from an
authorized admin user -> "AUTHORIZATION_GRANTED" -> "developer-hub" —
confirmed the real function, not a shortcut, drives this distinction
(Domain 4I dependency #2's own IdentityEngine.canAccessApplication()
call, unchanged).

## 9. Informational negative tests
"QuarryOS ni nini?", "What is QuarryOS?", "Tell me about QuarryOS.",
"Which applications are available?", "Nataka kujua kuhusu QuarryOS." —
none classify as app-launch at all (pre-existing, Domain 4I
dependency #1 behavior), so shouldLaunchApplication() correctly
returns null for every one, confirmed by test.

## 10. Security result
- The navigation call only ever receives the value
  shouldLaunchApplication() returns — a real registry id or null —
  confirmed by a direct source-code test that no ApplicationLauncher.open(replyText)
  or equivalent AI-text-driven call exists anywhere in the file.
- AUTHORIZATION_DENIED, AUTHORIZATION_REQUIRED, and an unresolved
  application all produce null from the gate — confirmed exhaustively
  by test, including a defensive test proving a stray/malformed
  authorizationState on an unrelated intent still can't pass the gate.
- No roles:["platform-admin"] or equivalent is created anywhere in
  this change (this domain introduces no new authority path at all —
  it only calls the pre-existing, unmodified authorization function
  from Domain 4I dependency #2).
- cozy-workspace.js confirmed byte-for-byte unchanged (SHA-256
  verified identical before and after this domain); its own protected
  workspace-shell-platform-admin-handoff.test.js (7/7) and
  identity-routing-real-composition.test.js (5/5) re-confirmed green.

## 11. Continuous-learning implication (recorded, not built)
Not required by this dependency. Recorded: a real launch's success or
failure (from ApplicationLauncher.open()'s own honest result) could
become authorized outcome evidence for a future controlled learning
system — but authorization itself remains, and must always remain,
independently re-checked via IdentityEngine.canAccessApplication()
on every single request, never inferred from prior successful launches
(this is architecturally guaranteed here: shouldLaunchApplication()
only ever reads the current request's fresh authorizationState, never
any stored/learned history).

## 12. Test counts
| Suite | Result |
|---|---|
| New: cozy-living-assistant-domain4i-navigation.test.js | 15/15 pass |
| Existing: living-assistant (checkpoint-K, reply, Domain 4B fallback) | 10/10 pass |
| Existing: Domain 4I authorization + app-launch suites | pass |
| Existing: rule-based-conversational-provider (base + Domain 4D) | pass |
| Domain 4A/4C dependency-linked | pass |
| Combined this verification | 92/92 pass |
| workspace-shell-platform-admin-handoff.test.js + identity-routing-real-composition.test.js (cozy-workspace.js re-check, file confirmed unchanged) | 12/12 pass |

0 regressions.

## 13. Checkpoint
Repository files changed — checkpoint created and verified below.

## 14. Next dependency (exactly one)
Real, live-browser confirmation remains outstanding. Every piece up
to and including the exact call to ApplicationLauncher.open() is now
proven with real, unmodified components — but #send() itself only
truly executes in a browser (an already-disclosed, pre-existing
limitation this sandbox's own Playwright/browser tests independently
confirm cannot run here — selector timeouts, no real display). The next
concrete step, when a working browser environment is available: a real
Playwright test driving the actual mounted LivingAssistant UI,
submitting "Open QuarryOS." as an authorized user, and asserting
ApplicationLauncher.open was genuinely invoked with "quarryos" and
the application actually mounted — closing the one honest gap between
"the real logic is proven correct" and "it was watched happen in a
browser."
