# ChurchOS Authority / Wiring Map

**Status: audit only — no redesign performed yet.** Written in response to an explicit instruction to map existing authority boundaries before touching any more code. Produced by direct inspection of the real, current repository (root only — the nested `CozyOS-main/` duplicate tree was not consulted), not by assumption.

---

## 1. The real, existing 3-tier authority architecture

CozyOS already has exactly the separation the clarification describes. It is real, server-verified, tested, and — critically — **non-elevating by construction**: none of the three tiers can promote itself into a higher one.

| Tier | Meaning | Source of truth | Where it's decided |
|---|---|---|---|
| **PLATFORM** | CozyOS Administrator (the platform owner) | `isPlatformAdmin` column on the user's row in the real server DB (`server/webauthn-rp/db.js`); no HTTP route ever lets a client write it | `GET /webauthn/session` (server), read client-side by `IdentityEngine.isPlatformAdmin()` (client convenience only, **not** a security boundary — see below) |
| **ORGANIZATION** | Church Administrator (or any org's admin) | `OrganizationMembership`/server `organizations.js`: an ACTIVE membership whose role/permission makes `isOrgAdmin === true` for *that one organization* | `POST /organizations/context`, `GET /webauthn/session`'s `organizations[]` array (server-computed) |
| **WORKER** | An ordinary active member of an org, not its admin | same membership record, `isOrgAdmin === false` | same as above |
| **NONE / DENIED** | No active membership anywhere | — | — |

**The actual gate:** `core/shell/admin-gate-core.js` → `decideGateAction(sessionCheck)`. Pure logic, no DOM, no network, fully unit-tested. Reads only the parsed body of a real `GET /webauthn/session` call. Its own header documents a **previously real, already-fixed bug** (`CHALZYDASHBOARD-ROUTING-DEFECT`) where ORGANIZATION/WORKER sessions were incorrectly allowed to fall through into the PLATFORM workspace — the current version fixed that with an exhaustive switch (`resolveWorkspaceRoute()`) that fails closed to `ERROR` rather than ever defaulting to PLATFORM. Strict `=== true` checks throughout (no truthy coercion). Explicit code comment: *"An organization membership NEVER upgrades to PLATFORM, and a WORKER membership NEVER upgrades to ORGANIZATION."*

**The real (server-side) authorization boundary**, independent of the client gate above:
- `server/webauthn-rp/organizations.js` → `isAuthorized(userId, organizationId, capability)` — SQL-backed, deny-over-allow, reads **only the one membership row for that exact `(userId, organizationId)` pair**. A grant in Church A's org is structurally invisible when evaluating Church B. Its own header states it explicitly has "no concept of, and never grants, platform-admin — that stays IdentityEngine/rp.js's separate authority."
- Every mutating `/organizations/*` route (`invite`, `membership/suspend|reactivate|remove`, `role/assign|remove`, `application/assign|remove`, `permission/grant|revoke`) calls this and returns 403 on false.
- Client-side `core/organization/organization-membership.js` mirrors the same shape for UI convenience but is **explicitly disclosed as not a security boundary** (pure in-memory state) — this is the same category `admin-gate-core.js`'s own header calls out.

**Conclusion for §1:** the three-scope separation the clarification describes (PLATFORM / ORGANIZATION / SESSION / PARTICIPANT) is **already built, already tested, and already non-elevating** at the identity/organization layer. Nothing here needed fixing.

---

## 2. The three real workspace entry points — and a critical mismatch found

| Page | Who can ever see its content | Mechanism |
|---|---|---|
| `admin-workspace.html` | **PLATFORM tier only.** Anyone else is redirected to `chalzydashboard.html` before any of its own `<script>` tags matter. | `mountWorkspaceIfAdmin()` (admin-workspace.html's own inline script) calls the same `AdminGateCore.decideGateAction()`; only `GATE_ACTION.LOAD_ADMIN_WORKSPACE` (i.e. `GATE_SCOPE.PLATFORM`) mounts the page — everything else redirects away. |
| `chalzydashboard.html` | **The real, single entry gate for all three tiers.** For PLATFORM, it loads `admin-workspace.html`'s content inline via `Bootstrap.start()`. For ORGANIZATION and WORKER, it mounts `OrganizationWorkspace` (`core/shell/organization-workspace.js`) — **the same component for both**, which adapts its rendered sections via `organization-workspace-core.js`'s `resolveVisibleSections()`/`resolveWorkforceControls()` against the real server context. | `decideGateAction()` → `resolveWorkspaceRoute()` |
| `dashboard.html` | **Not gated by this mechanism at all.** Any authenticated (or unauthenticated, depending on the app) account holder. This is the ordinary end-user page — where a worldwide live-session participant belongs. | No `AdminGateCore`/`isPlatformAdmin` gate on the page itself; one narrow in-page Settings *section* is hidden for non-platform-admins (`dashboard-settings-admin-boundary-core.js`), but that's a sub-section visibility decision, not a page-level gate. |

### Critical finding

**`admin-workspace.html`'s own `<script>` tags are reachable by the CozyOS platform administrator alone — never by a Church Administrator.** This is proven directly by the gate code above, not inferred.

Every real ChurchOS *live* file — `church-worship-session.js`, `living-worship-player.js`, `church-live-translation-interaction.js`, `live-church-language-orchestrator.js`, the whole `LDCESessionEngine`/`LDCECaptionEngine`/`ldce-media-session-engine.js` stack, and (from this session's own Task #3) `church-live-moderation.js` + `church-live-moderation-controls.js` + `live-translation-result-cache.js` + `live-language-fanout-router.js` — is `<script>`-included **only on `admin-workspace.html`** (`church-worship-session.js`/`living-worship-player.js` are now also on `dashboard.html`, added by this session's Task #4, for the *participant*-facing panels — that part is correctly scoped).

**Consequence:** today, no real Church Administrator, pastor, or church-appointed moderator — none of whom are CozyOS platform administrators — can ever reach any UI that starts a worship service or manages its moderation, because that UI lives exclusively behind the PLATFORM-only gate. This is **not a defect introduced this session** — `church-worship-session.js`/`living-worship-player.js`/`church-live-translation-interaction.js` were already admin-workspace.html-only before this work began. This session's Task #3 (wiring `church-live-moderation.js` and its three siblings) followed that same pre-existing, incorrect placement pattern rather than correcting it, which compounded the problem rather than causing it.

**Where the correct home is instead:** the ORGANIZATION-tier surface (`chalzydashboard.html` → `OrganizationWorkspace`, i.e. `organization-workspace.js` — the same file Task #7 already extended with the invite control). Checked directly: this component's `APPLICATIONS` section already has a real, working per-application function-entitlement pattern (`resolveFunctionsForApplication(appId)` / `core.isFunctionEnabled(ctx, appId, fnId)`), but `KNOWN_APPLICATION_FUNCTIONS` today lists **only `MpesaOS`** (`['Transactions', 'Receipts', 'Reports', 'Float', 'Till', 'Paybill']`) — its own header discloses this is "a small, disclosed, hardcoded list for the one application the checkpoint's own examples name," not a real registry yet. There is **no ChurchOS entry, and no live-session start/moderate control anywhere in the ORGANIZATION-tier workspace today.** Building that is genuine new UI work (composing existing engines, but a new surface), not a one-line wiring fix — flagged here rather than started, per the instruction to map first.

---

## 3. Organization isolation in the pieces this session touched

Checked directly against source, not assumed:

- **`church-live-moderation.js` → `#isAuthorizedModerator()`** (the real authority every mutating moderation/comment/question-toggle call goes through, including this session's new `setQuestionsEnabled()`): host → LDCE-promoted moderator → `IdentityEngine.isPlatformAdmin()` → org-role. The org-role path explicitly requires `requesterUser.orgId === hostUser.orgId` before even looking at role permissions — **Church B's admin fails this check outright when the session host is Church A**, before any permission lookup happens. Confirmed by reading the code directly (`core/modules/ChurchOS/church-live-moderation.js:170`).
  - **One real inconsistency flagged, not a leak:** this org-role path reads the legacy single-scalar `IdentityEngine.getUser(userId).orgId` field, not the newer multi-org `OrganizationMembership` model this session's Task #2/#7 work composes elsewhere. A user with a real `OrganizationMembership` in Church A but no matching legacy `.orgId` scalar would be **denied** moderation there (fails closed — an availability gap, not a security hole), and the reverse (legacy `.orgId` granting access to an org they've since left via `OrganizationMembership`) is a real, separate risk worth a follow-up, not touched by this session.
  - **Platform-admin override is intentional, not a bug:** any `isPlatformAdmin() === true` account can moderate *any* church's session. This matches the clarification's own tree (PLATFORM sits above all Organizations) but is flagged explicitly here since it does mean a CozyOS platform administrator has real, standing access into every church's live moderation — worth an explicit decision, not a silent default, if the intent is narrower (e.g. break-glass only, or audited).

- **`OrganizationMembership.isAuthorized()` / server `organizations.js` `isAuthorized()`** (the real authority behind this session's Task #2 founding-owner seed and Task #7 invite control): reads only the one `(userId, organizationId)` row — structurally cannot see or grant across organizations. Confirmed by direct reading (`core/organization/organization-membership.js:418`, `server/webauthn-rp/organizations.js:167`).

- **This session's Task #5 (`liveSessionId` context in `CozyAI.getContext()`)**: re-verified directly — every code path added (`ChurchWorshipSession.getActiveService()`/`getRecentTranscript()`/`getServiceTimeline()`, `ChurchLiveModerationControls.getQuestionsEnabled()`) is **read-only**. Nothing in that addition calls `setQuestionsEnabled()`, `hideComment()`, `assignRole`, or any other mutating/authorization-granting method. A worldwide participant asking Live Window "What did the pastor just say?" or "Can I ask a question?" can only ever receive information already visible to any session participant (the transcript itself, the section marker, and a boolean questions-enabled flag) — it cannot elevate them to moderator, and it cannot leak another organization's session (the caller must already hold a real `liveSessionId`, which is only ever populated from `LivingWorshipPlayer`'s own bound session, itself only set by joining a real session through the existing authorized flow). This composition point grants no authority of its own — it is a read of already-computed state.

- **Task #2's founding-membership seed** (`churchos.html`'s setup flow → `OrganizationMembership.createMembership({..., roles: ["owner"], permissions: [MEMBERS_CREATE_PERMISSION], status: "active"})`): scoped to exactly the one `organizationId` just created by that same `setupChurch()` call. Does not touch `IdentityEngine.isPlatformAdmin`, does not touch any other organization's membership table. This grants **organization-scoped** authority only (member creation within that one church), never platform authority — confirmed by re-reading the exact code path added.

- **Task #6's `setQuestionsEnabled()`**: inherits `#isAuthorizedModerator()` verbatim (same call, same org-isolation as above) — added no new authorization logic of its own.

- **Task #7's invite control**: composes the real, already-audited server route (`POST /organizations/invite`), which requires the caller's own `(userId, organizationId)` membership to hold `org:workforce:invite` — the exact same org-isolated check. Verified end-to-end in this session's own real-browser test (`chalzydashboard-organization-workspace-browser.test.js`): a plain cashier in ORG-B cannot invite into ORG-B even by calling the endpoint directly, and the invite form is rendered/hidden based on the real `canManageWorkforce` server verdict, not a client-side assumption.

**Conclusion for §3:** every authorization-relevant piece of code this session added or touched **correctly composes the existing org-isolated / non-elevating boundaries** — it does not create a new identity, authorization, or organization system, and (Task #3's placement issue aside — a *reachability* problem, not an *authorization* leak) nothing audited grants Church A visibility or control over Church B, and nothing grants a participant, a church admin, or a moderator platform authority.

---

## 4. Requests / Invitations — scope check

- Server-authoritative invite (`server/webauthn-rp/organizations.js` → `invite()`, wired to `POST /organizations/invite`): creates a membership scoped to one `organizationId`. Requires the caller to already hold `org:workforce:invite` in *that* org. Cannot grant platform admin (confirmed: that field is never touched by any `/organizations/*` route — only internal/read paths touch `is_platform_admin`, per `admin-gate-core.js`'s own header).
- Self-service "request to join": **confirmed absent at every layer** (client and server) — this was already known from the earlier inventory pass and remains true; not something this session built or attempted.

---

## 5. Live Window / participant scope check

- Live Window's live-session composition (Task #5) is participant-facing, read-only, and mounted on `dashboard.html` (the ungated, general end-user page) — the right page for a worldwide participant.
- Joining a live session at all still goes through the existing, unmodified `LDCESessionEngine`/`LiveHotspotEngine`/`LiveCaptureEngine` join flow — this session added no new join mechanism, so whatever access policy that flow already enforces (session-level, not touched here) is unchanged.
- Submitting a question is still gated by `church-live-moderation-controls.js`'s real mute/slow-mode/(new) questions-enabled checks, all of which run through the same `#isAuthorizedModerator()`-adjacent, org-isolated authority — a worldwide viewer's ability to *ask* is a session-level permission the host/moderator controls; it never grants them moderator or org-admin status.

---

## 6. Existing tests already covering these boundaries (unmodified, still passing)

- `core/shell/tests/*` for `admin-gate-core.js`'s tier resolution (PLATFORM/ORGANIZATION/WORKER/DENIED, non-elevation).
- `core/organization/tests/organization-membership.test.js`, `core/organization/tests/identity-organization-integration.test.js` (9 specific multi-org compatibility properties).
- `server/webauthn-rp/test/organizations.test.js` + related (111/111 previously reported passing).
- `core/modules/ChurchOS/test/church-live-moderation.test.js` / `church-live-moderation-controls.test.js` (org-role isolation, host/moderator/platform-admin authorization paths) — this session added 8 new tests to the latter for `setQuestionsEnabled`/`getQuestionsEnabled`, all following the exact same org-isolation pattern already proven there.
- This session's own new real-server + real-browser test (`chalzydashboard-organization-workspace-browser.test.js`) directly proves: an org admin (James on ORG-C) can invite; a plain worker (James on ORG-B) cannot, even calling the endpoint directly; ORG-B and ORG-C data never bleed into each other on switch.

None of this session's changes altered any of the above tests' assertions about authorization (only `application-visibility.test.js`'s appId-string expectations changed, for the unrelated duplicate-tile display bug in §7 of the prior commit — not an authorization change).

---

## 7. Summary — what needs correcting vs. what's already sound

| Item | Status |
|---|---|
| PLATFORM vs ORGANIZATION vs WORKER separation exists, is server-verified, non-elevating | **Sound — pre-existing, well-tested** |
| Church A cannot moderate/administer Church B | **Sound — proven by direct code reading + existing tests** |
| Church Administrator cannot reach the CozyOS platform administrator dashboard | **Sound by construction** (the gate denies it) — but see next row |
| **A real Church Administrator can reach *any* ChurchOS live-session start/moderate UI at all** | **NOT sound today.** All such UI is `<script>`-included exclusively on `admin-workspace.html`, which only the platform administrator can ever load. Pre-existing before this session; this session's Task #3 added four more files to the same wrong location rather than the correct one. |
| Worldwide participant can join and use Live Window without becoming an org admin | **Sound** — verified directly, Task #5's addition is read-only and mounted on the ungated participant page |
| Live-session questions remain gated by existing moderation, not by Live Window itself | **Sound** — Task #5 only *reads* the questions-enabled flag; Task #6's toggle *reuses* the existing moderator authority check verbatim |
| Invitations remain organization-scoped, never grant platform authority | **Sound** — verified against the real server route and its own tests, plus this session's new end-to-end browser test |

**The one real correction needed:** ChurchOS's live-session start/moderate UI (already-existing files, this session's newly-wired four files included) needs a real home reachable by ORGANIZATION-tier (Church Administrator) sessions — most likely a new section/entry inside `organization-workspace.js`'s existing `APPLICATIONS` pattern, extending `KNOWN_APPLICATION_FUNCTIONS` (or replacing that small hardcoded list with something that can express ChurchOS's real functions) so a church admin can actually reach `church-live-moderation-controls.js`'s `setQuestionsEnabled()`, session start, etc. This is genuine new UI wiring — larger than the seven fixes already shipped — and is intentionally **not started** pending direction, per the instruction to map before redesigning.

Not touched, and not proposed for change without further instruction: the platform-admin override in `church-live-moderation.js`'s moderator check (§3), and the legacy-`.orgId`-vs-`OrganizationMembership` inconsistency in that same file (§3) — both flagged, neither a cross-organization leak.
