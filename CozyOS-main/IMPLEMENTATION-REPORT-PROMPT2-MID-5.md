# CozyOS Dashboard — Prompt 2 §8 — Implementation Report
**Checkpoint: COS-DASHBOARD-PROMPT2-MID-5.zip**
**Baseline: COS-DASHBOARD-PROMPT2-MID-4.zip (trusted, not re-audited)**

## Objective addressed
Prompt 2 §8: "AI Context Settings-Awareness + Real User Dashboard Knowledge."
Cozy AI must understand the user's real dashboard context (applications,
language, Community state, current surface, honestly-gated administrator
tools) and be able to explain the current surface without hallucinating —
without exposing secrets or unnecessary personal data.

## What was actually built

### 1. `core/shell/dashboard-navigation-core.js` (extended, not replaced)
- `buildAIContext(userId)` gained a new, additive, namespaced shape
  (`identity`, `applications`, `community`, `settings`, `administration`)
  alongside every pre-existing flat field. Nothing pre-existing was
  removed, renamed, or restructured.
  - `applications.launchable` — real subset of `applications.available`
    that `ApplicationVisibility.getRealLaunchPath()` resolves a path for
    right now. Distinguishes "visible to you" from "you can open it this
    second," per §8's own vocabulary.
  - `identity.displayName` — `IdentityEngine.getUser(userId).username`
    ONLY. The rest of that record (roles, companyId, orgId, branchId,
    departmentId, teamId, country) is never read into this file.
  - `community.availableActions` — `["contribute-knowledge"]` only when
    the real `CozyTeachCozyAIRouting.TEACH_KNOWLEDGE_TYPES` array is
    actually loaded; otherwise honestly empty.
  - `settings.relevantPreferences` — reshapes the same real,
    already-computed language-resolution result; no second read.
  - `administration.available` / `.tools` — composes the exact same
    real, fail-closed `IdentityEngine.getDashboardConfig(userId).
    isPlatformAdmin` boolean that `DashboardSettingsAdminBoundaryCore`
    already gates the Settings surface's admin section on. `tools` is
    built only from fields the real `getDashboardConfig()` response
    actually contained for this user (`users` → `"user-directory"`,
    `applicationStates` → `"application-oversight"`) — never a
    fabricated capability.
- New method `explainSurface(surfaceName, userId)` — the honest,
  template-generated text layer behind §9/§14's "AI can answer 'what
  can I do here?' without hallucinating." Every sentence is assembled
  from `buildAIContext()`'s real fields at call time; there is no
  static, hardcoded capability claim for any surface. Refuses (does not
  guess) for an unrecognized surface name.

### 2. `core/shell/user-dashboard.js` (`#renderAiSurface()` extended)
- Added a real current-context indicator (active surface, available vs.
  launchable application counts).
- Added "Ask about a surface" buttons (one per real dashboard surface)
  that call `explainSurface()` and render its real, honest text into a
  response area — client-side template composition, never presented as
  a live model response.
- Kept "Open Cozy AI" (the real, existing `LivingAssistant.open()`
  entry point) as the one real live conversational surface, visually
  distinct from the honest explanation panel.
- **Disclosed limitation, not hidden:** `LivingAssistant` still exposes
  only `open()`/`close()`/`toggle()` — no real message-send or
  conversational-execution method exists anywhere in this repository
  (confirmed by reading `core/living/cozy-living-assistant.js` before
  writing this). This dashboard tab does not fake one. See "Genuine
  missing dependency" below.

### 3. `core/shell/tests/dashboard-navigation-core.test.js` (extended)
Added 14 new Node-executed tests (all real, no mocks of loaded engines),
covering exactly the Prompt 2 §19 checklist items this milestone
addresses:
- `applications.launchable` is a genuine, narrower real subset, never
  inferred.
- `identity.displayName` never leaks `roles`/`companyId`/`orgId`.
- `community.availableActions` is honestly empty vs. populated based on
  whether the real `CozyTeachCozyAIRouting` engine is actually loaded.
- `settings.relevantPreferences` mirrors real, already-resolved language
  state.
- `administration.available` is `false` for a non-admin, `false` for an
  arbitrary client-supplied role string (`"administrator"`, `"root"`,
  `"superuser"`), `false` for an application-specific role string
  (e.g. a ChurchOS-shaped `"church-pastor"`), and `true` — with the
  correct, non-fabricated tool labels — only for a real platform-admin
  user created and checked end-to-end through the real `IdentityEngine`.
- `explainSurface()` works for all five real surfaces, refuses an
  unknown surface honestly, and its non-admin/admin branches say the
  right thing for real users of each kind.
- A structural check that `explainSurface()` contains no hardcoded
  "is active"/"is installed"/"synchronized with the cloud"-style claim.

## Genuine missing dependency (disclosed, not built this milestone)
A real conversational execution seam — a message-send/response method
on `LivingAssistant` (or an equivalent intelligence engine) that free
text could actually be routed through — does not exist anywhere in this
repository. `explainSurface()` covers the specific, bounded "what can I
do on surface X" question set honestly via real context composition,
but it is not a general-purpose chat backend and was never built to
pretend to be one. Building a real conversational seam is a distinct,
larger dependency, out of scope for this milestone, and is the natural
next real blocker for a fuller Prompt 2 §16 AI surface.

## Application roles / organization hierarchy (§4–§11)
No application-specific organization/role engine (ChurchOS or
otherwise) was touched, duplicated, or newly modeled this milestone.
`administration.available`/`.tools` compose only the real, existing
platform-level `IdentityEngine.getDashboardConfig().isPlatformAdmin`
boundary — the same one `DashboardSettingsAdminBoundaryCore` already
used before this change. The new
`"§8 administration: an application-specific role ... never becomes
platform-admin authority"` test exists specifically to keep this
boundary honest going forward. Discovering and composing ChurchOS's
(or MPesaOS's/WholesaleOS's) own real organization/role structures per
§5–§6 was not reached this milestone and remains open.

## Tests — directly affected suites (all real, all run this session)
| Suite | Result |
|---|---|
| `core/shell/tests/dashboard-navigation-core.test.js` | 43 passed, 0 failed (29 baseline + 14 new) |
| `core/shell/tests/dashboard-community-summary-core.test.js` | 8 passed, 0 failed |
| `core/shell/tests/dashboard-settings-admin-boundary-core.test.js` | 9 passed, 0 failed |
| `core/platform/tests/application-visibility.test.js` | 7 passed, 0 failed |
| `core/modules/intelligence/knowledge/teach/ui/tests/cozy-knowledge-contribution-type-picker-core.test.js` | 15 passed, 0 failed |
| `core/modules/intelligence/knowledge/teach/tests/cozy-teach-cozyai-routing-core.test.js` | 21 passed, 0 failed |
| **Total, directly affected** | **103 passed, 0 failed** |

## Broader repository regression — honestly partial, NOT claimed complete
This repository contains 144 `*.test.js` files. A broader regression
sweep was started; it did not finish within this session's time budget
(the sweep itself timed out). 43 of 144 files were actually executed
before the sweep was cut off. Of those 43, all failures/timeouts
observed were in files unrelated to this milestone's changes (video
capture browser-harness tests, ChurchOS live-translation/attendance
tests, WholesaleOS commerce/fulfillment tests, `living-tts.test.js`) —
none of them import or exercise `dashboard-navigation-core.js`,
`user-dashboard.js`, or the dashboard test file changed this milestone.
**Full repository regression was not run and is not claimed.** The raw
per-file output captured before cutoff is included as
`full-regression-partial-raw.txt` for transparency, not as a completion
claim.

## Browser/device status
**NOT VERIFIED.** No browser/device E2E was performed this milestone.
This status is unchanged from the trusted baseline and is not claimed
otherwise anywhere in this checkpoint.

## No fake capabilities (§15 check)
Nothing in this milestone's UI or context text says a setting is
"synchronized with the cloud," that any application "is active/
installed" outside of what `ApplicationVisibility`/`IdentityEngine`
actually report, or that "your AI learned this" outside of the real,
existing, unmodified knowledge-review pipeline. `explainSurface()` was
structurally tested (see test suite above) to contain no such
hardcoded claim.

## NEXT BUILD MUST START WITH
Continue Prompt 2 from this checkpoint (COS-DASHBOARD-PROMPT2-MID-5.zip
as the new trusted baseline). Suggested next real dependency, in order:
1. A real conversational execution seam for the AI surface (the
   disclosed gap above) — OR, if deferred, continue toward
2. §4–§6: discover and compose ChurchOS's (then MPesaOS's/
   WholesaleOS's) own real, existing organization/role structures for
   application-specific role display, without inventing a second role
   engine or flattening them into platform-admin authority.
3. Complete a genuine broader-than-partial repository regression sweep
   once session/tool budget allows a longer, uninterrupted run.
Do not re-audit this checkpoint's own dashboard-navigation-core.js/
user-dashboard.js/test changes — treat them as trusted, exactly as
this session treated MID-4.
