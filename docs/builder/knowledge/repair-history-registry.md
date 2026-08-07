# Cozy Builder — Repair History Registry (RP)

First entry filed under M374 (Layer 4 — Learning Engine, first pass).
Distinct in scope from `regression-registry.md` (RG): RG tracks a
previously-working capability that broke; RP tracks a confirmed defect
that Builder repaired, with enough detail that a future Builder session
— on a different account, or a different underlying model — can verify
the repair without repeating the investigation.

An entry closes only when `node --check` (or the equivalent for
non-JS files) and a runtime smoke test were actually run in that
session and their real output is recorded below — never asserted from
memory or from a prior session's summary.

---

## RP-001 — `modules/quarry/quarry-contants.js` — duplicate content / dangling object literal

**Problem:** `node --check` failed at line 341 (`Unexpected token ':'`).

**Root cause:** the file contained the entire `Actions`/`QuarryConstants`
block duplicated in full, plus an orphaned fragment of route properties
left dangling outside any object literal after a `window.*` assignment
statement — not a typo, a merge/paste artifact.

**Repair:** removed the duplicate block and the orphaned fragment;
kept the original, more complete first definition (the duplicate was
also missing one field, `Collections.DASHBOARD_METRICS`, confirming
the first copy was authoritative).

**Confidence:** High — root cause fully explained by evidence in the
file itself; no inference required.

**Regression result:** `node --check` → PASS. Runtime smoke test (Node,
simulated `window` global) → `Routes`, `Actions`, `Collections` all
resolve correctly; `window.CozyOS.Quarry.Constants === window.QuarryConstants`
→ `true`. No regression.

**Compatibility:** Full — public shape (`Routes`, `Actions`, `Roles`,
`Events`, `Collections`, `Languages`, `StoneTypes`, `Business`,
`Shifts`, `Version`) unchanged from the (now-deduplicated) original.

**Affected modules:** Quarry ERP screens referencing `QuarryConstants`.

**Milestone introduced:** Unknown — confirmed present in every
snapshot searched, M173 through M373 (see RP-002 search note; same
exhaustive search covered this file).

**Milestone repaired:** M373 (session work), recorded M374.

**Reusable pattern:** *Before assuming a syntax error is a typo, check
whether the file contains its own content twice* — `grep -n "^const "`
or similar for repeated top-level declarations is a fast tell.

---

## RP-002 — `core/ai/cozy-ai-memory.js`, `core/connectivity/compression.js`, `core/connectivity/bandwidth.js` — incomplete source (missing header/class/constructor)

**Problem:** All 3 files fail `node --check` at their first
surviving line — each opens mid-method-body with no enclosing class.

**Root cause:** Not a syntax typo. Exhaustive search (see below)
confirms these files have been missing their header, class
declaration, and constructor in **every available snapshot**,
including the earliest one supplied (M173). This is the file's
earliest known state, not a regression from a prior complete version.

**Search performed (exhaustive, per Rule 56/57 precondition):**
- `_archive/` (Layer3 workspace) — not found
- Byte-for-byte duplicate-path search across the whole tree — not found
- `CozyOS-main-M372-Layer2.zip` — **byte-identical MD5** to Layer3 (not an earlier complete version, a repackaging of the same state)
- 12 historical milestone packages, M173 → M373 — **byte-identical MD5 across all of them** for all 3 files
- Cross-reference search for symbols referenced inside the files (`codecIdentifier`, `ESTIMATED_SAVINGS_RATIO`, `_immutableHeaderKeys`, `Categories`, `Importance`, `Profiles`) — none defined anywhere else in the repo

**Repair:** Reconstructed only the missing structural scaffolding
(header comment, class declaration, constructor, minimal state
required for the surviving methods to run) per the 7-phase
reconstruction protocol. Every surviving line of original logic was
preserved unchanged and unmoved. Class names recovered where possible
from actual call sites (`BinaryCompressor` from `sync.js`'s
`import`/`new`); inferred from internal log tags where no call site
exists (`BandwidthShaper`, from `cozy-ai-memory.js`'s own tail
(`CozyAIBusinessMemory`) is a direct recovery, not an inference).

**Confidence:** Partial, by file:
- `cozy-ai-memory.js`: Medium-High — class name and constructor arg directly recovered; only enum *values* (Categories/Importance) are inferred (empty).
- `compression.js`: Medium — class name, export style, and constructor call shape directly recovered from `sync.js`; the Branch-1 guard condition and `codecIdentifier`/`ESTIMATED_SAVINGS_RATIO` values are inferred.
- `bandwidth.js`: **Lowest** — no external call site exists anywhere in the repo; class name is inferred from an internal log string, not confirmed usage. `_immutableHeaderKeys` is inferred **empty**, which is a real functional gap (see Engineering Review flag below), not just a placeholder.

**Regression result:** `node --check` → PASS on all 3. Runtime smoke
tests → each class instantiates and every public method was called
with minimal safe input and produced no uncaught exception (full
output recorded in session; not reproduced here to avoid duplicating
the transcript — see M374 handoff for the verification log location
if this file is split out later).

Full-repo sweep after all 4 repairs: `find . -name "*.js" | xargs node --check` → **zero failures**.

**Compatibility:** Structural only — public method signatures
preserved as written in the surviving code. **Not** verified compatible
with any caller's assumptions about `Profiles` string values,
`_immutableHeaderKeys` contents, `Categories`/`Importance` taxonomies,
or `codecIdentifier`, because those were never recoverable. Treat as
open until a human with access to the original source (if it exists
outside this repository) confirms or replaces the inferred values.

**Engineering Review Required — flagged, not resolved:**
`bandwidth.js`'s `_immutableHeaderKeys = []` means **no fields are
currently protected from CRITICAL_LOW shedding**. This was a
deliberate honest default (empty, not a guessed list) rather than
fabricating plausible-sounding key names, but it is a real behavioral
gap if this module reaches production on a constrained connection
before a human supplies the real list.

**Milestone introduced:** Unknown — pre-dates M173, the earliest
snapshot available.

**Milestone repaired:** M373 (session work), recorded M374.

**Reusable pattern:** *When 12 independent-looking milestone packages
share an identical MD5 for the same file, they are not independent
evidence* — check hashes before treating "found in an earlier
milestone" as confirmation of a complete source.

---

## RP-003 — `core/modules/identity/identity-engine.js` — password-bypass via unauthenticated OTP completion

**Problem:** `completeLoginWithOtp(pendingUserId, code)` accepted a raw userId, no password re-check.
**Repair:** Signed, random, single-use challenge token minted only after real password verification.
**Verification:** Node, isolated process. Bypass with raw userId → rejected. Legit flow → session created. Token reuse → rejected.
**Milestone repaired:** M373.1

---

## RP-004 — `login.html`, `index.html` — `identity-storage.js`/`otp-provider.js` never loaded

**Problem:** MFA gate and Remember Me silently inert on real entry pages; Node tests masked this by manually loading deps.
**Repair:** Added missing script tags, correct load order (`identity-storage.js` before `identity-engine.js`).
**Verification:** Re-ran MFA test using scripts extracted from real HTML in real order. Gate activates.
**Milestone repaired:** M374

---

## RP-005 — `core/security/otp-provider.js` — secrets unencrypted at rest, no rate limit, no replay protection

**Problem:** Plaintext secrets in IndexedDB; unlimited OTP attempts; codes reusable within window.
**Repair:** AES-256-GCM device-bound encryption; 5/30s, 10/5min lockout; last-used-counter replay check; constant-time comparison.
**Verification:** Node, 11-case suite. Encryption confirmed absent from persisted record. Lockout fires at attempt 5. Replay rejected.
**Milestone repaired:** M373.1

---

## RP-006 — `core/identity/developer-profile.js` — stale header, wrong subsystem named

**Problem:** Header comment named `core/modules/identity/` as `(CozyIdentity)`. Per DC-002, `cozy-identity.js` is archived/superseded, not live.
**Root cause:** Documentation drift — comment never updated after DC-002's archive decision.
**Repair:** Corrected to name the real, live subsystem (IdentityEngine, AuthCoordinator, IdentityStorage). Comment-only change.
**Evidence:** `diff` confirms comment-only change. SHA-256 (post-repair): `38a12afb6969e1614c258529165448ac66d54a23c2e84b749e14d66c90f89eaa`
**Verification:** `node --check` PASS. Runtime smoke test: `window.CozyOS._DeveloperIdentityParts.profile` resolves identically before/after.
**Confidence:** High — root cause and correct target both directly confirmed in DC-002.
**Regression risk:** None — comment-only, no code path touched.
**Milestone repaired:** M379
**Related:** `knowledge/missing-dependency-registry.md` MD-003 (closed by this repair), `knowledge/duplicate-consolidation-registry.md` DC-002

---

## RP-007 — `core/modules/developer/developer-hub.css` — doubled `core/core/` `@import` paths

**Problem:** all 5 `@import` lines resolved to `core/core/ui/...` / `core/core/shell/...` (2 `../` from `core/modules/developer/` reaches `core/`, then the lines redundantly prepended `core/` again) — 404s, cascading into every theme being rejected on `dashboard.html`.
**Root cause:** path written as if the file lived one directory shallower than it does.
**Repair:** corrected all 5 `@import url(...)` paths to `../../ui/...` / `../../shell/...`.
**Verification:** real-Chromium (Playwright) re-run, 3 rounds — 0 requests to any `core/core/...` path, 0 "Theme ... rejected" warnings on `dashboard.html`.
**Confidence:** High — path arithmetic directly confirmed from the file's own location plus a CDP request-initiator trace.
**Regression risk:** None — CSS-only, no logic touched.
**Milestone repaired:** M387.5 (Finding 1)

---

## RP-008 — `core/modules/speech/cozy-speech.js`, `core/modules/vision/cozy-vision.js` — colliding global `SESSION_STATE`

**Problem:** both files declare an identical bare top-level `const SESSION_STATE`, loaded as 2 classic `<script>` tags on the same page — `SyntaxError: Identifier 'SESSION_STATE' has already been declared`, aborting whichever file loaded second.
**Root cause:** neither file was IIFE-wrapped, unlike the documented near-universal convention ("IIFE modules register onto a single `window.CozyOS` global namespace" — `02-architecture-rules.md`).
**Repair:** wrapped each file's entire body in `(function () { ... })();`.
**Verification:** real-Chromium re-run, 3 rounds — 0 "already been declared" errors; confirmed both engines still register their public globals afterward.
**Confidence:** High — collision directly reproduced and both declarations confirmed identical by source inspection.
**Regression risk:** Low — no public API changed, only where internal declarations live; confirmed via `window.CozyOS` enumeration before/after.
**Milestone repaired:** M387.5 (Finding 2)

---

## RP-009 — `core/pluginManager.js` — `SEMVER_RE` rejects real semver pre-release versions

**Problem:** `SEMVER_RE = /^\d+\.\d+\.\d+$/` rejected the `X.Y.Z-ENTERPRISE` pre-release convention used by 17 plugin files, throwing `[PluginManager] Invalid manifest.version` for all of them.
**Root cause:** regex was stricter than real semver (which allows an optional `-prerelease` suffix).
**Repair:** widened `SEMVER_RE` to `/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/`; updated `_compareVersions()` to strip everything from `-` onward before splitting/`Number()`-ing parts, so the fix doesn't reintroduce the exact `NaN`-comparison bug `SEMVER_RE`'s strictness (`[R-2]`) existed to prevent.
**Verification:** real-Chromium re-run — 0 "Invalid manifest.version" errors.
**Confidence:** High — regex and comparison-function interaction directly traced and both fixed together.
**Regression risk:** Low — comparison behavior for bare `X.Y.Z` versions (no suffix) is byte-identical to before, since `split("-")[0]` is a no-op when there's no `-`.
**Milestone repaired:** M387.5 (Finding 3). **Follow-on discovery, not a regression:** fixing this let execution reach `register()`'s next validation step for the same 17 plugins, surfacing RP-010/MD-related Finding 6 below.

---

## RP-010 — `core/pluginManager.js` + 15 `core/plugins/*.js` files — `register()` handler-type mismatch

**Problem:** `register(manifest, executionHandler)` requires a callable `(query, kernelContext)` intent handler (confirmed from its real use inside `execute()`), but 15 plugin files (ShopOS ×10, MpesaOS ×4, ShopOS-search) passed their real engine class instance directly — `[PluginManager] executionHandler must be a function, got 'object'.` ×16 occurrences (some files register more than one manifest). Masked entirely by RP-009's predecessor bug until that was fixed.
**Root cause:** these 15 files conflated the plugin's real engine instance (correctly stored separately, e.g. `window.CozyOS.ShopCore`) with the distinct, simpler "intent handler" function `register()` actually requires — a pattern 4 other files in the same directory (`pharmacyOS.js`, `hospitalOS.js`, both `mpesaOS*.js` "engine" files) already implement correctly via a small named `xxxExecutionCore(query, kernelContext)` function.
**Repair:** added one shared `PluginManager.createMinimalIntentHandler(engineInstance, pluginLabel)` helper (Rule 6 — compose once, not 15 copies) that wraps any engine instance in a valid, honest, minimal intent handler — it discloses plainly that it's minimal (no fabricated business-logic routing) and surfaces the engine's own real, already-existing `getDiagnosticsReport()`. Updated all 15 call sites to pass `PluginManager.createMinimalIntentHandler(engineInstance, "<manifest name>")` instead of `engineInstance` directly.
**Verification:** `node --check` clean on all 16 touched files; real-Chromium re-run — 0 "executionHandler must be a function" errors; confirmed all 15 plugins now mount (`[PluginManager] Mounted: ... `) and their real engine instances (`window.CozyOS.ShopCore`, etc.) are unchanged and still directly callable exactly as before.
**Confidence:** High — root cause confirmed against `register()`'s own source and one concrete call site; fix pattern matches the 4 already-working files in the same directory.
**Regression risk:** Low — no engine class was modified; only the second argument passed to `register()` changed, and the engine instance itself is still registered under `window.CozyOS` exactly as before.
**Milestone repaired:** M387.5 (Finding 6)

---

## RP-011 — `index.html` — never linked the theme-token stylesheet

**Problem:** `index.html` linked only `cozy-animations.css`, `launch-sequence.css`, and `cozy-living.css` — never any file defining the `--cozy-*` tokens `CozyTheme` validates — so every theme was rejected on this page (a distinct root cause from RP-007/Finding 1, which was `dashboard.html`-only).
**Root cause:** the `<link>` tag was simply never added when this page was built, unlike `dashboard.html` (which gets tokens indirectly via `developer-hub.css`'s `@import` chain) and `core/shell/cozy-shell.html` (which links `core/ui/cozy-tokens.css` directly).
**Repair:** confirmed authoritative token source per Rule 51 before touching anything — grepped `core/ui/cozy-tokens.css` (defines all 8 `REQUIRED_TOKENS` for all 10 themes), `core/shell/cozy-tokens.css` (same 8 tokens but only 9 themes — a stale duplicate), and `core/shell/cozy-theme.css` (defines none of these tokens at all). Added `<link rel="stylesheet" href="core/ui/cozy-tokens.css">` to `index.html`.
**Verification:** real-Chromium re-run — 0 "Theme ... rejected" warnings on `index.html`.
**Confidence:** High — token presence directly grepped per candidate file before choosing.
**Regression risk:** None — additive `<link>` only, no existing tag removed or changed.
**Milestone repaired:** M387.5 (Finding 7)

---

## RP-012 — `core/bridge/engine-bridge-bootstrap.js` — Node-only `playback-engine.js` wired into browser bridge

**Problem:** `core/engines/playback/playback-engine.js` imports `fs` and reads recorded session frames off real disk (`fs.existsSync`/`readFileSync`/`readdirSync`/`statSync`) — a genuine Node.js-only module — but was registered in this browser-only dashboard bootstrap alongside 4 real browser engines (camera, audio, scene, media), producing `Failed to resolve module specifier "fs"` on every dashboard load.
**Root cause:** apparent copy-paste of the registration pattern for a file that was never browser-portable to begin with.
**Repair:** removed the `'playback'` entry from `REGISTRATIONS` in `engine-bridge-bootstrap.js` (did not touch `playback-engine.js` itself — porting it to a browser storage API would be new-feature-scale work, out of scope for a verification pass). Confirmed via grep that the only other reference to `PlaybackEngine` (`live-video-capture-engine.js`) already lists it in an honest `NOT_CONNECTED_ENGINES` disclosure array, so nothing else expected this global to exist.
**Verification:** real-Chromium re-run — 0 `"fs"` resolution errors; `[EngineBridge] boot finished with N engine(s) unavailable` no longer lists `playback`.
**Confidence:** High — Node-only nature of the file confirmed directly (imports `fs`, reads real disk paths), and the only other consumer already treats it as not-connected.
**Regression risk:** None — the file itself is untouched; only removed a registration that could never have succeeded in a browser.
**Milestone repaired:** M387.5 (Finding 9)

---

## RP-013 — `core/bridge/engine-bridge-bootstrap.js`, `core/engines/media/live-capture-engine.js`, `core/modules/hearing/cozy-hearing.js` — `AA-004` closed: `window.CozyOS.AudioEngine` naming collision

**Problem:** `core/engines/audio/cozy-audio-engine.js` and the ES-module bridge's `audio-manager.js` both claimed `window.CozyOS.AudioEngine` — `[EngineBridge] "audio" unavailable: ... already occupied by a different object`, present in every browser round since M387.5 Round 2.
**Root cause:** confirmed by reading every real call site against both engines' actual APIs — `cozy-hearing.js` (4 call sites) needs `registerInputAdapter`/`startListening`/`stopListening`, which only `cozy-audio-engine.js` implements; `live-capture-engine.js` (1 call site) plus the bridge's own `wireBrowserAudioProvider()` need `registerProvider`, which only `audio-manager.js` implements. Two genuinely different, both-real, both-needed engines wanted the same name — `cozy-audio-engine.js`'s own pre-existing header already correctly documented this distinction; the bridge's later naming choice was the actual defect.
**Repair:** renamed the bridge's `audio-manager.js` target from `AudioEngine` to `AudioManager` (matching the file's own self-declared identity) in `core/bridge/engine-bridge-bootstrap.js` (registration entry, `wireBrowserAudioProvider()`, and header comments); updated `live-capture-engine.js`'s 1 real call site and its loose comment references; corrected `cozy-hearing.js`'s outdated header comment (previously misattributed its dependency to `audio-manager.js`); left `cozy-audio-engine.js` completely untouched (already correct); kept the Node-side unit test (`engine-bridge.test.js`) in sync.
**Verification:** `node --check` (plus `--input-type=module` for the ES-module bridge file) PASS on all 4 touched files. Real-Chromium re-run: 0 "already occupied" warnings; `window.CozyOS.AudioEngine` and `window.CozyOS.AudioManager` both present simultaneously (confirmed via global enumeration, 279 globals, up from 277). Regression: Living Engine chain (`LivingSecurityCoordinator` → `LivingDecisionEngine`) confirmed unchanged, no duplicates, no missing dependency.
**Follow-on discovery, not a regression:** fixing this let `wireBrowserAudioProvider()` execute for the first time (previously never reached, since the naming conflict made `"audio"`'s registration fail before reaching it) — which surfaced a separate, genuine missing dependency, `core/engines/audio/provider-browser.js`, confirmed absent repository-wide. Logged as `MD-005` rather than built (real feature-scale work, out of scope for this repair).
**Confidence:** High — root cause confirmed by direct method-call comparison against both engines' real, implemented APIs, not by preference or load order.
**Regression risk:** Low — `cozy-audio-engine.js` (the file `cozy-hearing.js` actually depends on) was not modified at all; only the bridge's own registration name and its 1 real consumer changed.
**Milestone repaired:** M387.5b (`AA-004`)

---

## RP-014 — `core/modules/identity/auth-coordinator.js` — premature auto-triggered `restoreSession()` wipes a valid "Remember Me" pointer on every real reload

**Status:** 🟢 Fixed (M387.5c)

**Discovered In:**
- Milestone: M387.5c (Verification Completion — Interactive Authentication Verification)
- Date: 2026-08-06
- Builder: current session

**Location:**
- File(s): `core/modules/identity/auth-coordinator.js` (defect); `index.html` (the correct, unaffected caller); `core/modules/identity/identity-engine.js` (the engine whose async completion is not waited for)
- Function(s): `AuthCoordinator`'s bottom-of-file auto-trigger (`tryRestore()`, calling `restoreSession()`); `IdentityEngine.restorePersistedUsers()`; `AuthCoordinator.restoreSession()`; `AuthCoordinator.restoreSessionForTrustedPointer()` fallback path (via `IdentityEngine`)
- Engine(s): Identity Engine, Auth Coordinator, Session

**Symptoms:**
A real, registered, logged-in user with "Remember Me" checked is signed out on the very next real browser reload of `index.html` — `AuthCoordinator.isAuthenticated()` returns `false` after reload, even though registration/login succeeded moments earlier with 0 console errors.

**Evidence:**
- Registration → auto-login → redirect to `index.html` confirmed working: `isAuthenticated() === true` immediately after.
- `localStorage['cozyos.authCoordinator.session']` confirmed present and correct immediately post-login (real `{source, sessionId, userId, since}` pointer).
- User confirmed genuinely persisted in IndexedDB (`cozyos-identity`, `users` store) before reload — read back directly via `indexedDB.open(...).transaction('users').getAll()`.
- Control test performed first, to rule out a test-harness artifact: plain `localStorage.setItem`/reload in this exact environment persists correctly (`before: "hello", after: "hello"`).
- After a real `page.reload()`: `localStorage` is empty; direct call to `AuthCoordinator.restoreSession()` returns `{"restored":false,"reason":"No persisted session pointer."}` — the pointer is gone, not merely rejected.
- **Definitive timeline, captured via a `Proxy` installed on `window.CozyOS` (before any page script ran) that logged every `window.CozyOS.*` assignment and wrapped `IdentityEngine.restorePersistedUsers`/`validateSession`/`restoreSessionForTrustedPointer` and `AuthCoordinator.restoreSession`:**
  ```
  +30ms  restorePersistedUsers() CALLED           (module-load auto-call, IdentityEngine.ready)
  +40ms  AuthCoordinator.restoreSession() CALLED   (auth-coordinator.js's own auto-trigger — NOT index.html's bootstrap)
  +40ms  validateSession(session_...) -> {"valid":false,"reason":"Session not found."}
  +40ms  restoreSessionForTrustedPointer(user_...) -> {"available":false,"reason":"No real user found with id \"user_...\" — pointer is stale."}
  +42ms  AuthCoordinator.restoreSession() RESOLVED {"restored":false,"reason":"Session not found."}   <- POINTER WIPED HERE
  +62ms  restorePersistedUsers() RESOLVED {"restored":1}    <- user genuinely available only NOW, 20ms too late
  +64ms  AuthCoordinator.restoreSession() CALLED   (index.html's own correctly-sequenced bootstrap call)
  +64ms  AuthCoordinator.restoreSession() RESOLVED {"restored":false,"reason":"No persisted session pointer."}   <- moot, already wiped
  ```
- Hashes/tests: no code changed yet for this finding, so no new SHA-256s; reproduction script preserved at `/home/claude/verify/interactive5.js` (session-local, not part of the repository).

**Investigation:**
- Checked: `#persistPointer`/`#readPointer` storage mechanism (plain `localStorage`/`sessionStorage`, `STORAGE_KEY`-based) — confirmed correctly implemented in isolation.
- Checked: `restoreSession()`'s own logic — confirmed internally correct *given its inputs*; the fallback-to-wipe branch (`if (!validation.valid) { this.#persistPointer(null); ... }`) is a reasonable design for a genuinely stale pointer, but has no way to distinguish "genuinely stale" from "user data hasn't finished loading yet."
- Checked: whether this was a Playwright/test-harness artifact — ruled out via the plain-`localStorage` control test above.
- Checked: `index.html`'s own `resolveAuthState()` — confirmed it *does* correctly `await identity.restorePersistedUsers()` before calling `auth.restoreSession()`; this caller is not the defect.
- Found: a second, separate, unguarded caller — `auth-coordinator.js`'s own bottom-of-file `tryRestore()` — which polls only for `window.CozyOS.IdentityEngine`/`window.CozyOS.Session` to *exist* (both are assigned synchronously, near-instantly on script load) and then calls `restoreSession()` immediately, with no gate on `IdentityEngine.restorePersistedUsers()` (or its `.ready` promise) having actually finished.
- Remaining unknown: whether this defect also affects `login.html` (which the trace didn't directly re-test) or only pages where `auth-coordinator.js` loads standalone; whether other real callers of `restoreSession()` (`login-experience-orchestrator.js`, `cozy-login-gate.js`) have their own timing assumptions that would also need re-checking after a fix; whether the 15-attempt/200ms polling loop was ever intended to also wait on `IdentityEngine.ready` and simply omitted it, or never considered this case at all.

**Root Cause:**
**Confirmed.** `core/modules/identity/auth-coordinator.js`'s auto-trigger calls `restoreSession()` as soon as `window.CozyOS.IdentityEngine` and `window.CozyOS.Session` *exist* as objects — not once `IdentityEngine.restorePersistedUsers()` has actually finished repopulating `#users` from IndexedDB. On a real reload, `#users` is empty in that early window, so the trusted-pointer fallback reports the user "not found," and `restoreSession()`'s existing (otherwise reasonable) stale-pointer cleanup logic deletes a pointer that was genuinely valid — just checked too early. `index.html`'s own, separately-written, correctly-sequenced call to `restoreSession()` never gets a chance to succeed, because the pointer is already gone by the time it runs.

**Impact:**
- "Remember Me" and session restore across a real reload do not work for any user, on any page that loads `auth-coordinator.js`, today. This is a core-functionality break for the M381–M387 Living Security chain's very premise (device/session/trust continuity), even though every individual engine's own logic is otherwise correctly implemented.
- Blocks the remaining M387.5c interactive-verification items that assume a restored session: OTP login on a restored session, trusted-device recognition after reload, and "device recognition after reload" specifically — all would fail the same way, for this same reason, not their own separate defects.
- Blocks M387.5's Rule 63 "Browser/device verification passes" condition until repaired and re-verified.

**Dependencies:**
- `core/modules/identity/auth-coordinator.js` (the fix)
- `core/modules/identity/identity-engine.js` (`.ready` promise / `restorePersistedUsers()` — the async completion signal to actually wait for)
- `index.html`, `login.html`, `dashboard.html` (all load `auth-coordinator.js`; all are affected consumers, none are the defect)
- `core/modules/session/cozy-session-service.js` (`Session` — one of the two objects the auto-trigger currently gates on)

**Repair Plan (drafted at Compose/Plan stage — see "as implemented" below for what actually happened):**
1. Change the auto-trigger's gate from "does `IdentityEngine`/`Session` exist" to "has `IdentityEngine.ready` (or an equivalent explicit promise) resolved" — e.g. `if (identity && identity.ready) { await identity.ready; }` before calling `restoreSession()`, in addition to (not instead of) the existing existence check, since `Session` still needs to exist too.
2. Keep the existing 200ms/15-attempt polling as the fallback for the "objects don't exist yet at all" case — only add the `.ready` await once they do exist.
3. Re-check the same fix doesn't reintroduce a hang if `.ready` is ever missing/undefined on `IdentityEngine` (defensive `typeof identity.ready?.then === "function"` guard, matching this codebase's established honest-fallback style).
4. Do not touch `index.html`'s own `resolveAuthState()` — it's already correct and should be left alone (Rule 5).
5. Re-check `login-experience-orchestrator.js` and `cozy-login-gate.js`'s own `restoreSession()` calls against the same timing assumption before closing this finding, since Investigation flagged them as unconfirmed.

**Verification Plan (drafted at Compose/Plan stage — see "as executed" below for real results):**
1. Syntax: `node --check` on `auth-coordinator.js`.
2. Browser: re-run the exact `Proxy`-based tracer reproduction above; confirm the corrected timeline shows `restorePersistedUsers() RESOLVED` before any `restoreSession() CALLED`, and that the pointer survives.
3. Functional: repeat the full register → reload flow; confirm `isAuthenticated()` is `true` after reload, not just that the pointer string is unchanged.
4. Regression: re-run the existing full Playwright harness (`index.html`/`login.html`/`dashboard.html`) to confirm 0 new console errors; confirm `login-experience-orchestrator.js`/`cozy-login-gate.js`'s own `restoreSession()` calls still behave correctly once the gate changes.
5. Integration: confirm engine startup order and duplicate-registration scan are unaffected (this fix doesn't touch registration, only call timing).

**Regression Risk (assessed at Compose/Plan stage — see confirmed outcome below):**

**Repair Plan (as implemented):**
1. Changed the auto-trigger's gate: once `IdentityEngine`/`Session` exist (unchanged 200ms/15-attempt polling for that), also `await identity.ready` — the exact same promise `IdentityEngine` itself already exposes at module load (`IdentityEngine.ready = IdentityEngine.restorePersistedUsers()`) — before calling `restoreSession()`. No new signal invented; reused the real, already-existing one.
2. Kept the existing polling as the fallback for "objects don't exist yet at all."
3. Guarded with `identity.ready && typeof identity.ready.then === "function"` so a future `IdentityEngine` without a `.ready` promise still falls through safely (fails closed, doesn't hang).
4. Did not touch `index.html`'s own `resolveAuthState()` — confirmed still correct, left alone.
5. Re-checked `login-experience-orchestrator.js`'s and `cozy-login-gate.js`'s own `restoreSession()` calls — both already `await` their own dependencies before calling it (confirmed by re-reading), so neither depended on the old race; unaffected by this fix.

**Verification Plan (as executed):**
1. **Syntax:** `node --check core/modules/identity/auth-coordinator.js` — PASS.
2. **Browser (exact reproduction re-run):** re-ran the identical `Proxy`-based tracer from the Compose stage. New timeline: `restorePersistedUsers() RESOLVED {"restored":1}` at +36ms, `AuthCoordinator.restoreSession() CALLED` at +50ms (now correctly *after*), `restoreSessionForTrustedPointer(...)` → `{"available":true,...}`, `validateSession(...)` → `{"valid":true}`, `restoreSession() RESOLVED {"restored":true,"source":"identity","userId":"..."}`.
3. **Functional:** repeated the full register → reload flow independently (2 separate runs, 2 separate usernames): `isAuthenticated()` is `true` immediately after login AND after a real reload, in both runs.
4. **Regression:** full 3-page Playwright harness re-run — `index.html`/`login.html` 0 errors/0 failed requests; `dashboard.html` unchanged (1 environment-limited error, 5 documented failed requests — `MD-004`/`MD-005`/Firebase, none new). Engine chain intact (279 globals, no duplicates). Fresh unauthenticated `login.html` load re-checked separately: 0 errors, `isAuthenticated()` correctly `false` (no false positive introduced).
5. **Integration:** confirmed `login-experience-orchestrator.js`/`cozy-login-gate.js` unaffected (per Repair Plan step 5).

**Regression Risk:** Realized risk was low, as predicted — the two other real `restoreSession()` callers already awaited their own dependencies and needed no change.

**Outcome:** 🟢 **Fixed.** All four Verify checks (syntax, browser, functional, regression) passed. Confidence: High — root cause was confirmed by direct runtime evidence before the fix, and the fix's effect was confirmed by re-running the exact same tracer, not merely inferred from the absence of the original symptom.

**History:** `RELEASES.md` (M387.5c entries), `docs/builder/knowledge/repair-queue.md` (`RP-014` → Fixed), `docs/history/M387.5.md` (Round 7). SHA-256 of fixed file: `1b3d8ff455fdd36a004187251516d9d7a0e7ec4b24bf657ad2e7f05b653aa465`.

---

## RP-015 — `restoreSession()`'s trusted-pointer fallback always re-persists with `rememberMe=true`, silently upgrading "Remember Me: off" sessions

**Status:** 🟢 Fixed (M387.5c)

**Discovered In:** Milestone M387.5c, Remember-Me-OFF interactive test.

**Symptoms:** logging in with "Remember Me" unchecked still leaves a persistent `localStorage` pointer after navigating to `index.html` — session survives even after the browser context is effectively restarted, contrary to the unchecked box.

**Evidence:** login with box unchecked confirmed (`checked === false` at submit) → pointer correctly written to `sessionStorage` only at that moment → but after the post-login navigation to `index.html`, `localStorage['cozyos.authCoordinator.session']` is populated anyway.

**Root Cause (confirmed):** `restoreSession()`'s trusted-pointer fallback branch (fires on every fresh page load/navigation, since `IdentityEngine`'s in-memory `#sessions` never survives one) calls `this.#persistPointer({...})` with no second argument — defaulting to `rememberMe = true` — regardless of which storage the original pointer actually came from.

**Repair:** `#readPointer()` now also returns which storage matched (`_rememberMe: true` for `localStorage`, `false` for `sessionStorage`); `restoreSession()`'s fallback re-persist now passes that through instead of the implicit default.

**Verification:** `node --check` PASS. Real-browser re-run: Remember-Me-OFF login → pointer in `sessionStorage` only after landing on `index.html`, `localStorage` empty. Remember-Me-ON path re-confirmed unaffected. Full regression: 0 new errors.

**Regression Risk:** Low — only changes which storage a re-persist targets, not whether restoration succeeds.

**History:** `docs/history/M387.5.md` Round 8; `docs/builder/knowledge/repair-queue.md`.
