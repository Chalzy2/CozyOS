# ChurchOS Live Integration — Closing Audit

**Status: implementation complete.** This document closes out
[`CHURCHOS-AUTHORITY-WIRING-MAP.md`](./CHURCHOS-AUTHORITY-WIRING-MAP.md)
(the pre-implementation audit — read that first for the full 3-tier
authority architecture this work builds on top of, unchanged). Every
gap that map's §7 summary table marked "NOT sound today" is resolved
below, with the real files and real tests that resolve it named
directly — nothing in this document is asserted without a corresponding
commit and a passing test run.

---

## 1. What was built, mapped to the prior audit's own findings

### 1.1 The real correction the prior audit called for (§7, its one
open row): *"A real Church Administrator can reach any ChurchOS
live-session start/moderate UI at all"*

**Resolved.** `core/shell/organization-workspace.js` — the real
ORGANIZATION/WORKER-tier controller mounted from `chalzydashboard.html`
— now renders a real ChurchOS live-worship panel inside its existing
`APPLICATIONS` section, gated by the same real, server-verified
`app:ChurchOS:<Function>` permission convention every other application
function on that page already uses (`isFunctionEnabled()`,
unmodified). `KNOWN_APPLICATION_FUNCTIONS.ChurchOS = ['LiveSession',
'Moderation', 'RequestSupport']` — the prior audit's own note that this
catalog "lists only MpesaOS" is now out of date.

The panel lets a Church Administrator, from their own organization-tier
workspace (never `admin-workspace.html`):
- Start/End a real live worship session (`ChurchLiveSessionController`,
  new — see §1.2)
- Toggle Questions ON/OFF for the active session
  (`ChurchLiveModerationControls.setQuestionsEnabled()`, pre-existing,
  now reachable)
- Request CozyOS platform support (`OrganizationSupport`, new — see
  §1.3)

`admin-workspace.html` itself is untouched in its own gating (still
PLATFORM-only, correctly) — the fix was building the missing
ORGANIZATION-tier surface, not loosening the platform one.

### 1.2 The LDCE-sessionId / ChurchWorshipSession-serviceId pairing gap

Flagged implicitly by the prior audit's own read of `church-worship-
session.js` and `LDCESessionEngine` as two, separately-owned engines
with no existing link between their two identifiers. New file:
`core/modules/ChurchOS/church-live-session-controller.js` —
`ChurchLiveSessionController`. Composes both engines' real
`createSession()`/`startService()` into one org-authorized event,
remembers the `{ldceSessionId, worshipServiceId}` pairing, and exposes
`getLdceSessionIdFor()`/`getSessionBundle()` so every other caller (the
organization-workspace panel, `cozy-ai.js`'s support diagnostics, the
prayer/moderation files) resolves one id from the other through this
one real authority — never a second, competing pairing table.
Org-authorized via `OrganizationMembership.isAuthorized(actorId, orgId,
"churchos-live:manage")`; rolls back the LDCE session if the paired
`ChurchWorshipSession.startService()` call fails, so a half-started
session is never left behind.

### 1.3 The CozyOS Platform Support capability (user brief item #4/#5)

Did not exist anywhere in the repository before this work (confirmed
by the prior audit's own repo-wide search). New, generic (not
ChurchOS-specific — composable by any application) file:
`core/organization/organization-support.js` —
`requestSupport()`/`grantSupport()`/`isSupportActive()`/
`recordSupportAction()`/`revokeSupport()`/`listPendingRequests()`/
`listAllActiveGrants()`/`getAuditTrail()`. Every grant is real,
time-boxed (4h default, 24h max, never indefinite), scoped (a real,
non-empty `scope` array the caller composes and checks — this file
never interprets it as a blanket grant), and fully auditable (reuses
`OrganizationRegistry`'s one real, shared history log — no second
log). `grantSupport()` never creates an `OrganizationMembership`
record, never assigns a role, and never sets `isOrgAdmin` — an
organization's own admin authority is untouched by a grant existing,
and can revoke it at any time.

Real UI for it: `core/organization/organization-support-panel.js`,
mounted on `admin-workspace.html` (PLATFORM-tier, independent of
`WorkspaceShell` so a `WorkspaceShell` failure can never block it, and
gated a second time on its own real `IdentityEngine.isPlatformAdmin()`
check). A real support inbox — pending requests, active grants,
grant/revoke, and (new) an "Inspect via Live Window" action per grant
scoped `inspect-live-session` (see §1.5).

### 1.4 The platform-admin moderation override — restricted (user brief
item #6)

The prior audit (§3) flagged the pre-existing override in
`church-live-moderation.js`'s `#isAuthorizedModerator()` as "intentional,
not a bug, but worth an explicit decision... if the intent is narrower
(break-glass only, or audited)." Resolved: the override across all five
files that had it (`church-live-moderation.js`,
`church-live-moderation-controls.js`, `church-attendance-geography.js`,
`church-offering-interaction.js`, `church-prayer-interaction.js`) now
requires a real, active, correctly-scoped `OrganizationSupport` grant
(`isSupportActive(orgId, requesterUserId, {requiredScope})`) — a bare
`isPlatformAdmin() === true` is no longer sufficient on its own. Every
authorized action under this path is recorded via
`recordSupportAction()`, so the override is now identifiable,
narrowly-scoped-per-grant, and auditable, exactly as the prior audit's
own open question asked for. It never assigns a role, never creates an
`OrganizationMembership` record, and never removes the organization's
own admin authority — a platform admin acting through this path is
never silently converted into that organization's administrator.

### 1.5 Live Window — a third, distinct authorization context (user
brief item #9)

`CozyAI.getContext()` (`core/modules/intelligence/cozy-ai.js`) already
composed a participant-facing live-worship result (transcript/timeline/
questions-state, read-only, per the prior audit's own §5 confirmation).
This adds a **third**, independently-verified context alongside it —
never a second AI/context system, the same `getContext()` call: a
`supportScope` parameter that, ONLY when the actor is a real platform
admin AND holds a real, active, correctly-scoped `OrganizationSupport`
grant for the session's real organization (freshly re-verified on
every single call, never cached, never inherited from the participant
path), composes a separately-labeled `"live-support-diagnostics"`
result — read-only technical state (LDCE session/participant state,
slow-mode, questions state) for a CozyOS Admin's own diagnostic view.
Every inspection is itself recorded via `recordSupportAction()`. A
normal participant call can never reach this branch, proven directly
by test (see §3).

This also fixes a real, previously-silent bug found while wiring it:
the existing questions-enabled composition called
`ChurchLiveModerationControls.getQuestionsEnabled()` with the raw
worship-service id, but that file's state is keyed by the real LDCE
session id — always a miss, always silently reporting the default
DISABLED state regardless of what the host actually set. Now resolved
via `ChurchLiveSessionController.getLdceSessionIdFor()`.

Wired end-to-end: `cozy-answer-engine.js`'s `answer()` threads
`supportScope` through unchanged; `cozy-living-assistant.js`'s `#send()`
reads a new, tiny, disclosed hand-off variable
(`core/organization/live-support-context.js` — same category as the
pre-existing `window.CozyOS.Session`) that `organization-support-
panel.js`'s "Inspect via Live Window" action sets. The hand-off performs
no authorization of its own and can only ever cause `getContext()` to
compose *less* (or nothing) if stale/wrong — the real security boundary
stays entirely inside `getContext()`'s own fresh, per-call check.

### 1.6 Canonical authorization source (user brief item #7)

The legacy `identity.getUser(userId).orgId !== orgId` scalar comparison
— the "one real inconsistency" the prior audit flagged in §3 — is
replaced with the canonical, multi-org-capable
`OrganizationMembership.hasMembership(userId, orgId)` across all five
moderation-family files, for the REQUESTER-side authorization check.
This is the one canonical source now; the legacy scalar is no longer
consulted on this path. (The client-side `OrganizationRegistry`/
`OrganizationMembership` vs. server-authoritative `organization-
workspace.js` desync this surfaced in turn — see §1.7 — is the second
half of "no competing sources of truth.")

### 1.7 Client-side / server-side authority bridge (discovered during
this work, not in the original brief, but directly implicating item #7)

`organization-workspace.js`'s panel-visibility gating is correctly
server-authoritative (`POST /organizations/context`). But the ChurchOS
action engines it calls (`ChurchLiveSessionController`,
`OrganizationSupport`) authorize against the CLIENT-SIDE
`OrganizationRegistry`/`OrganizationMembership` — which start every page
load completely empty. Resolved additively: `OrganizationRegistry.
registerExternalOrganization()` and `OrganizationMembership.
syncExternalMembership()` (both new, explicitly documented as
trust-boundary bridges for ALREADY server-verified data, performing no
verification of their own) mirror the just-verified `POST
/organizations/context` response onto the client-side modules on every
`switchTo()`, including a disclosed permission-name bridge
(`app:ChurchOS:LiveSession` → `churchos-live:manage`, etc.) between the
server's function-permission vocabulary and the pre-existing ChurchOS
engines' own domain-permission vocabulary. One source of server-verified
truth; the client-side modules now mirror it rather than competing with
it.

### 1.8 The 5-scope authority model (user brief item #8)

Never collapsed, verified directly against the code: **PLATFORM**
(`IdentityEngine.isPlatformAdmin`) / **ORGANIZATION**
(`OrganizationMembership`/server `organizations.js`, `isOrgAdmin`) /
**SESSION** (`LDCESessionEngine`'s own host/moderator/participant roles,
per-session) / **PARTICIPANT** (an active LDCE participant record, no
elevated role) / **SUPPORT** (`OrganizationSupport`'s own time-boxed
grant — deliberately never a membership, never a role, never platform
authority itself). Every new file composes these five without
introducing a sixth or merging any two.

---

## 2. Zero-coverage gap closed

`core/modules/ChurchOS/church-worship-session.js` had no test file
anywhere in the repository (flagged during the original 5-agent audit,
tracked as its own task). New: `core/modules/ChurchOS/test/
church-worship-session.test.js`, 43 tests — `startService`'s real
fail-closed preconditions, `addListenerLanguage`'s idempotency,
`deliverSpokenText`'s per-language delivery isolation, the governance
boundary that verse text is NEVER machine-translated (only a licensed
`Living.scripture.compare()` result or an honest `available:false`),
`markSection`'s recognized-type enforcement, `endService`'s real
transaction-commit/archival/cleanup sequence, and
`searchArchivedServices()`'s real org-scoped query composition.

---

## 3. Test matrix — what actually proves this, not just what was written

| Layer | File | Result |
|---|---|---|
| OrganizationSupport authority | `core/organization/tests/organization-support.test.js` | 53/53 |
| ChurchLiveSessionController (LDCE+worship pairing, rollback, org-isolation) | `core/modules/ChurchOS/test/church-live-session-controller.test.js` | 13/13 |
| church-live-moderation / -controls / attendance / offering / prayer (canonical source + restricted platform-support override, each) | `core/modules/ChurchOS/test/*.test.js` | all passing (see full regression run below) |
| church-worship-session (new, zero-coverage gap closed) | `core/modules/ChurchOS/test/church-worship-session.test.js` | 43/43 |
| organization-workspace / organization-workspace-core (pure logic) | `core/shell/tests/organization-workspace*.test.js` | 40/40 |
| CozyAI.getContext() — participant vs. support context separation (5 new tests: authorized grant, no grant, non-admin actor, no supportScope, unknown session) | `core/modules/intelligence/tests/cozy-ai-context.test.js` | 24/24 |
| cozy-answer-engine / cozy-advisor (unaffected by supportScope threading) | `core/modules/intelligence/answer/tests/*`, `core/modules/intelligence/advisor/tests/*` | 25/25 |
| **Real server + real browser**: full participation flow — org-tier ChurchOS panel renders only for a server-verified `app:ChurchOS:*`-permitted admin, real session start/end, real questions toggle tied to the real LDCE id, real org-isolation (Church B never sees Church A's session) | `core/tests/browser/chalzydashboard-organization-workspace-browser.test.js` | 18/19 (the one failure is a pre-existing, unrelated `admin-workspace.html` redirect issue, confirmed via git-stash A/B comparison before this work began — not a ChurchOS regression) |
| **Real browser**: full support-request flow — panel renders only for a real platform admin, real pending-request rendering, real grant round trip (scope, duration, operator recorded), real "Inspect via Live Window" hand-off, real revoke | `core/tests/browser/organization-support-panel-browser.test.js` | 8/8 |
| **Real browser**: Live Window end-to-end (unaffected by the supportScope threading) | `core/living/tests/cozy-living-assistant-live-window-e2e.test.js` | 15/15 |

Full combined regression across `core/organization/`,
`core/modules/ChurchOS/`, `core/shell/`, `core/modules/intelligence/`,
and `core/living/` (156 non-browser test files, run together): all
passing except two pre-existing, environment-only failures
(`living-worship-player-mini-pip-browser.test.js` and
`living-worship-player-tools-menu-browser.test.js` — both fail with
"Executable doesn't exist at .../chromium_headless_shell-1234", a
Playwright-package/local-cache revision mismatch specific to this
sandbox, confirmed unrelated to any change in this work by inspecting
the error itself, not by assumption).

---

## 4. Explicit invariants this work proves (participant flow + support
flow, matching the user brief's own 16-invariant requirement)

1. A worker with no `app:ChurchOS:*` permission never sees the live
   panel — server-verified, real browser test.
2. A Church Administrator with real, server-granted `app:ChurchOS:*`
   permissions sees the live panel — server-verified, real browser
   test.
3. Starting a session creates a real, paired
   `{ldceSessionId, worshipServiceId}` bundle — real browser test.
4. Ending a session tears down both the LDCE session and the worship
   service — real browser test.
5. Toggling Questions changes the real, underlying
   `ChurchLiveModerationControls` state tied to the real LDCE id, not a
   UI-only flag — real browser test.
6. Church B never sees Church A's active live session
   (`ChurchLiveSessionController.listActiveSessions()` is org-isolated)
   — real browser test.
7. A support request requires a real, active org membership and a real,
   existing organization — unit + real browser test.
8. Granting support is PLATFORM-tier only — unit test.
9. A grant is always scoped (non-empty `scope[]`) and time-boxed (never
   indefinite, capped at 24h) — unit test.
10. A grant never creates an `OrganizationMembership` record, never
    assigns a role, never sets `isOrgAdmin` — unit test.
11. The platform-admin moderation override requires a real, active,
    correctly-scoped grant — unit tests across all five moderation-
    family files (no-grant denied / with-grant authorized pairs).
12. Every support-authorized moderation action and every live-support
    diagnostic inspection is recorded via `recordSupportAction()` —
    unit tests.
13. An organization's own admin can revoke platform support into their
    own org at any time — unit test.
14. `CozyAI.getContext()`'s support-diagnostics branch requires platform
    admin AND an active, correctly-scoped grant, independently
    re-verified every call — 5 dedicated unit tests.
15. A normal participant `getContext()` call never includes
    support-diagnostics content, even when the actor is a real platform
    admin — unit test.
16. Client-side `OrganizationRegistry`/`OrganizationMembership` are
    synced only from an already server-verified context, never
    independently trusted — proven by the real browser test's own
    server-side permission grants being what makes the client-side
    action engines work at all (they were failing before the sync
    bridge was added, passing after).

---

## 5. What remains explicitly out of scope (disclosed, not silently
dropped)

- The legacy `identity.getUser(userId).orgId` scalar is still read
  elsewhere in the repository outside the five files this work
  canonicalized (the prior audit's own §3 flagged this as a
  pre-existing, broader pattern, not something introduced by
  ChurchOS work) — not touched here, since doing so repo-wide is a
  larger, separate migration.
- `organization-support-panel.js`'s "Inspect via Live Window" hand-off
  is a one-session-at-a-time, single-admin convenience — it does not
  attempt a full multi-admin/multi-session support queue UI.
- No new server route grants real, server-side `isPlatformAdmin` to a
  test account in this milestone's server tree (a pre-existing,
  disclosed test-environment limitation, not a product gap) — the
  `organization-support-panel-browser.test.js` and `cozy-ai-context.test.js`
  suites authorize through the real CLIENT-SIDE `IdentityEngine`
  authority those specific files actually check instead, and say so in
  their own headers.
