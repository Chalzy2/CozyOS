# CHECKPOINT A — Dashboard Milestone Trusted Baseline

**This is a checkpoint, not an implementation.** No dashboard feature code
was written to produce this checkpoint. Its only purpose is to record,
verify, and freeze the trusted starting state before Prompt 1 begins.

---

## 1. Source of this baseline

This checkpoint is built directly on top of the previously verified and
merged tree:

- Base: `COS-STEP4D-LIVE-UI-CHECKPOINT-G.zip` (trusted, 1420 files)
- Merged: the 5-file Part H patch (`ldce-live-media-coordinator.js` +
  test, `cozy-live-host-console.html`, `cozy-live-join-console.html`,
  `cozy-live-join-console-controller.js`)
- Delivered as `COS-STEP4D-LIVE-UI-PART-H-INTEGRATED.zip`

Whole-archive SHA-256 of that trusted delivered zip:

```
cd0fa2d3a74042ee08c20a3f5d465ddf5ab11af2537591edd0801a87a9e90241  COS-STEP4D-LIVE-UI-PART-H-INTEGRATED.zip
```

This checkpoint does **not** re-audit Parts A–H. That work is trusted
baseline evidence, not something re-derived here.

---

## 2. Dashboard-relevant seam files — hashed, confirmed real, unmodified

Every file below was opened and read (not assumed from a filename) before
being recorded. Per-file SHA-256 is in
`dashboard-baseline-reference/DASHBOARD-SEAM-HASHES.txt`.

| File | Real role confirmed |
|---|---|
| `core/shell/user-dashboard.js` | The real, composed end-user dashboard (M365.0). Single-surface today — **no Home/Community/AI/Apps/Settings navigation exists yet**. Renders Applications, Quick Actions, Recent Activity, Tasks (honestly disclosed as "not connected — no task engine exists"), Messages. |
| `core/shell/dashboard-data-provider.js` | Real, stateless composition layer over `ApplicationHealthMonitor`, `IdentityEngine`, `Living`, `ModuleRegistry`, `PlatformEventBus`. No cache, no fabricated resource-usage numbers (explicitly disclosed as unavailable). |
| `core/shell/cozy-navigation.js` | Real, but narrow — only builds a single app tile (`createTile`) for the *admin* app-launcher grid. **Not** a Home/Community/AI/Apps/Settings tab bar. Do not confuse this with the navigation Prompt 1 needs to build. |
| `core/modules/module-registry.js` | Real, authoritative application registry. Its own header discloses: **only `developer-hub`, `shopos`, `mpesaos` are genuinely registered today.** ChurchOS/CozyAI/Translation/Learning/Documents are *not* registered applications — confirmed, not assumed. Do not add fake entries to make Apps look fuller. |
| `core/platform/application-visibility.js` | Real. `listVisibleApplications(userId)` and `getRealLaunchPath(appId)` are the two methods `user-dashboard.js` already composes. This is the correct seam for the Apps tab — do not duplicate it. |
| `core/modules/identity/identity-engine.js` | Real. `getDashboardConfig(userId)` (admin/developer/user tiers), `getUser(userId)`, `getLanguagePreference`/`setLanguagePreference(userId, code)`. These are the real seams for Home's identity greeting and Settings' language control — no fabricated user fields exist beyond what `getUser()` actually returns. |
| `core/modules/intelligence/knowledge/cozy-knowledge-registry.js`, `cozy-knowledge-community.js`, `cozy-knowledge-review.js`, `cozy-knowledge-ingestion.js`, `cozy-public-knowledge-source.js` | Real, already-built candidate→review→verification knowledge pipeline (`CANDIDATE`/`CONFIRMED`/`COMMUNITY_VERIFIED`/`REJECTED` states genuinely implemented, confirmed by direct read). This is Milestone 3's engine — not to be rebuilt, not to be fully wired in Milestone 1. |
| `core/modules/intelligence/knowledge/ui/cozy-knowledge-contribution-ui.js` + `-core.js` + `contribution-form.html` | Real, existing user-facing submission UI for the knowledge pipeline. Candidate real seam for a Milestone-1 Community *entry point* — full integration stays in Milestone 3. |
| `core/modules/intelligence/language/cozy-language-registry.js`, `cozy-language-templates.js` | Real language infrastructure CozyAI's language-aware behavior will need in Milestone 4. Not touched this checkpoint. |
| `core/living/cozy-living-assistant.js` | Real, already-mounted floating assistant with a genuine public API: `mount()`, `open()`, `close()`, `toggle()`. This is the correct seam for the AI tab's entry point — never build a second assistant. |
| `core/living/living-tts.js`, `core/modules/speech/voice-manager.js`, `core/modules/speech/voice-settings-panel.js` | Real voice-safety architecture. Confirmed: default/per-context voice assignment is owned by `VoiceManager` and is explicitly separate from any cloning path. **Not to be redesigned** — this matches the standing voice rule (learn language, never copy identity; use the approved default CozyOS voice for synthesis unless an explicit authorized voice exists). |
| `core/security/session-manager.js`, `core/modules/security/authentication-settings-module.js` | Real session/auth-settings seams for later Settings work. Confirmed to exist; not wired into the dashboard yet. |
| `core/shell/cozy-workspace.js`, `startup-orchestrator.js`, `launch-sequence.js` | Real shell/launch machinery `index.html` already depends on. Confirmed present and unmodified — Prompt 1 must not disturb the launch-sequence-complete gating these files implement. |
| `index.html`, `dashboard.html`, `Chalzydashboard.html` | Real entry points. `index.html` is confirmed as the actual mount point for `UserDashboard.render()` today, gated behind the real `cozy:launch-sequence-complete` event and real `AuthCoordinator` session check — no fabricated auth bypass exists. |

**Explicit finding:** `core/shell/cozy-navigation.js` is a false-friend
filename — it is not the Home/Community/AI/Apps/Settings navigation
infrastructure. That navigation does not exist anywhere in the repository
yet. Prompt 1 is building genuinely new (but properly composed) UI, not
"finding" a hidden nav bar.

---

## 3. Protected-file confirmation

Full-tree manifest: `dashboard-baseline-reference/FULL-TREE-HASHES-CHECKPOINT-A.txt`
— SHA-256 for all **1166** files in the trusted tree, recorded before any
dashboard work begins.

This manifest is the rollback reference. After Prompt 1, only the files
Prompt 1 legitimately touches should differ from this list — everything
else, including SessionAuthority, Firebase identity, LDCE/live internals,
relay server, security engines, and every other OS module, must remain
byte-identical to this checkpoint.

---

## 4. Existing tests relevant to this milestone — run and recorded, not assumed

```
node --test core/modules/intelligence/knowledge/tests/*.test.js \
             core/modules/intelligence/knowledge/ui/tests/*core*.test.js \
             core/modules/intelligence/language/tests/*.test.js
```

Result: **9 suite files, 9/9 pass, 0 fail, 0 skipped.**

**Honest gap, disclosed rather than skipped over:** there is currently
**no test file at all** for `user-dashboard.js`, `dashboard-data-provider.js`,
`module-registry.js`, `application-visibility.js`, or `cozy-navigation.js`.
Prompt 1 is not "running existing dashboard/navigation regression tests" —
none exist yet. Prompt 1's own new tests will be the first ones. This is
recorded now so nobody later assumes a pre-existing suite was silently
skipped.

---

## 5. Gemini-style HTML / prior audit — status reaffirmed

- The Gemini-style dashboard HTML (`Home / Church / AI / More` nav,
  static overlay content) is **visual reference only**. It is not part of
  this trusted baseline, is not merged, and none of its markup, IDs, or
  overlay logic should be reused verbatim.
- The prior Claude audit is the current **architectural finding**
  (which seams are real, which claims in the Gemini report were
  fabricated) — not proof that any dashboard feature is implemented.
- Required navigation for this milestone, restated for the record:
  `Home → Community → AI → Apps → Settings`, Community immediately after
  Home. The Gemini nav order (`Home → Church → AI → More`) is rejected.

---

## 6. Administrator-authority rule — restated as a hard constraint for Prompt 1

- Normal users may use available applications and personalize permitted
  items (e.g. the existing pin/unpin mechanism in `user-dashboard.js`).
- Normal users may **not** add, remove, enable, or disable applications
  in `module-registry.js` or override `ApplicationVisibility`.
- Any administrator-facing control must be authorized through
  `IdentityEngine`'s real `isPlatformAdmin()`/`getDashboardConfig()` tier
  resolution — never a client-side `isAdmin = true` flag.
- Prompt 1 does not implement admin extension management. It must not
  create any code path that lets a normal user mutate the registry.

---

## 7. What Checkpoint A explicitly does NOT do

- Does not add navigation tabs.
- Does not modify `user-dashboard.js` or any other seam file.
- Does not register fake applications.
- Does not wire Community, AI, or Settings to anything.
- Does not re-audit Parts A–H.
- Does not redesign live/ChurchOS/voice/knowledge engines.

---

## 8. Next build starting point

**PROMPT 1 — Real Dashboard Foundation + Primary Navigation**
(`Home → Community → AI → Apps → Settings`), built by extending
`core/shell/user-dashboard.js` in place, composing the real seams listed
in §2, with new tests covering nav existence/order/behavior and an
explicit assertion that Apps data comes from `ApplicationVisibility`
rather than a hardcoded array.

Do not begin Prompt 1 until this checkpoint has been reviewed.
