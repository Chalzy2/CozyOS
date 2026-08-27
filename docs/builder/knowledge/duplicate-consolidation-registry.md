# Cozy Builder — Duplicate Consolidation Registry (DC)

Per the Anti-Duplication Directive: duplicates are recorded here with
evidence and a recommendation. **Nothing is removed automatically** —
consolidation requires explicit approval per Production Rule 3.

---

## DC-001 — `CozyQuarryManager` (pre-existing, BASELINE-disclosed)

| | Path | Lines | Loaded by an HTML entrypoint? |
|---|---|---|---|
| Authoritative | `core/modules/QuarryOS/quarry-index.js` | 2279 | Yes — `applications/QuarryOS/quarry.html` |
| Superseded | `modules/quarry/index.js` | 2236 | No reference found anywhere |

**Evidence:** `diff` shows `core/modules/QuarryOS/quarry-index.js` is a
strict superset of `modules/quarry/index.js` — same 45 routes, same
`roleMatrix`/`_checkPermission` model, same finance/storage/AI-advisor
primitives, plus: corrected permission routes for Manager/Supervisor/
Machine Operator (`log_crusher_production`, `ask_ai_advisor`), and a real
`ServiceRegistry.registerApplication()` + Application Visibility
self-registration block that the older file doesn't have. The older
file's own header still claims a path (`core/modules/quarry/index.js`)
that doesn't match its actual location — a further sign it predates the
current tree and was never updated.

**Recommendation:** `core/modules/QuarryOS/quarry-index.js` is
authoritative. `modules/quarry/index.js` is a safe removal candidate
once someone confirms nothing outside this workspace's own HTML/JS
references it (search performed here found none) — **not removed by
this pass**, only recommended.

**Known, disclosed, still-open bug in the authoritative copy** (found
while comparing, not fixed here — out of scope for the observation
pass): `roleMatrix`'s permitted-route strings were already out of sync
with the file's real `case` names before this analysis (e.g.
`log_attendance` in the matrix vs. the real `track_attendance` case) —
the authoritative file's own comments disclose this as pre-existing,
narrowly patched for two real UI-driven routes, not fully audited.

---

## DC-002 — `InternalEventBus` (pre-existing, BASELINE-disclosed)

| | Path | Lines (whole file) | Loaded by an HTML entrypoint? |
|---|---|---|---|
| Authoritative | `modules/live/cozy-live.js` | 4341 | Yes — `dashboard.html`, `core/modules/developer/developer-hub.html`, `core/cozy-shell.html`, `core/shell/cozy-shell.html` |
| Orphaned | `core/modules/identity/cozy-identity.js` | 2571 | **No script tag found in any HTML file, in any dashboard variant** |

**Evidence:** Both files declare a behaviorally-identical
`InternalEventBus` class (same handler-map/error-isolation logic, minor
formatting differences only). `core/modules/identity/cozy-identity.js`
is not referenced by any `<script src>` in `dashboard.html`, `login.html`,
`index.html`, `ldce-verification-harness.html`, or `Chalzydashboard.html`
— every identity-related script tag in this repository points to
`core/modules/identity/identity-engine.js`, `platform-identity-bridge.js`,
`identity-storage.js`, `admin-recovery-policy.js`, `auth-coordinator.js`,
or the unrelated `core/identity/*` developer-profile files, never
`cozy-identity.js`. Two other files' own comments independently confirm
this: `core/modules/bugfixer/cozy-bugfixer.js` and
`core/shell/cozy-workspace.js` both list `cozy-identity.js` only in a
filename-recognition blocklist, and `core/ui/cozy-ui.js`'s own header
states plainly: *"no IdentityEngine/cozy-identity.js coordinator loaded
(true today...)"*.

**This is a broader finding than the InternalEventBus duplicate alone**
— the entire 2571-line file appears orphaned, the same category of
issue as the previously-disclosed orphaned Kernel layer, just not
previously named in `BASELINE.md`. Flagging this explicitly rather than
only fixing the narrower duplicate-class question, per the directive's
instruction to compare "behavior, responsibility, ownership, and
dependencies" before concluding.

**Recommendation:** `modules/live/cozy-live.js`'s `InternalEventBus` is
authoritative (it's the one actually running). Whether
`core/modules/identity/cozy-identity.js` as a *whole file* should be
wired in, retired, or partially merged is a decision bigger than the
duplicate-bus question alone — it likely holds identity-domain logic
beyond just the event bus that no other file currently provides.

**Decision (logged, following the full investigation in
`reports/cozy-identity-investigation.md`): Archive — not integrate, not
delete.** Every capability that overlaps the live stack (Identity/Org/
Role/Device/Session/Auth, and this file's `InternalEventBus`) is
superseded by an already-wired, richer implementation. Three groups —
Groups, Privacy/Consent, Access-Level ranking — are genuinely unique but
require their own separate design review before any new implementation;
none is integrated as a byproduct of this decision. Archiving means: an
archive banner is prepended to the file's header (see
`knowledge/cozy-identity-archive-banner.js` for the exact text),
the file itself is otherwise left byte-identical, and it is not deleted
— per Rule 3 (never remove without explicit approval) and Rule 15
(CozyOS is cumulative). Applying the banner requires the actual current
`core/modules/identity/cozy-identity.js` file, not yet supplied to
Builder for this pass.

**Outstanding, separate action:** `core/identity/developer-profile.js`
(live, loaded) still names CozyIdentity as the active identity
subsystem in its own header — stale as of this decision. Correcting it
requires that file's current header text, not yet supplied. Not
resolved here.

---

## DC-003 — Self-audit: `core/modules/builder/observation-engine.js` (new, this pass)

Checked against the required duplicate-detection categories before
writing it:

- **Modules/engines/services/APIs:** no new file/dependency/analysis
  engine created — composes `UnderstandingEngine.analyzeRepository()`/
  `analyzeCode()` (existing code analysis) and `OwnershipScanner.scan()`
  (existing collision detection) rather than re-parsing source or
  re-implementing collision logic.
- **Event bus:** uses the same local `on/emit` listener pattern every
  other Builder coordinator (`cozy-builder.js`, `architecture-engine.js`)
  already uses — not a new bus, not `InternalEventBus` reused out of
  context (it isn't a pub/sub relay to other subsystems, so composing
  `InternalEventBus` would misrepresent its scope).
- **Storage:** no new persistence layer — composes `CozyStorage`
  (`registerObject`/`listObjects`/`createStorageSpace`) if connected;
  honestly reports unavailability otherwise rather than inventing
  `localStorage` calls or a parallel store.
- **Utilities/constants/config:** reuses the existing `FORBIDDEN_KEYS`
  guard, deep-clone, and audit/timeline logging conventions already
  established in `cozy-builder.js` — same pattern, not a new one,
  because these are per-class private fields/methods (no shared,
  extractable "utility engine" exists yet in this project to compose
  instead — same situation every other Builder file is already in).
- **Business logic:** none introduced — this module only reads and
  reports, never touches Quarry/ShopOS/MpesaOS/ChurchOS domain logic.

No new duplicate was introduced by this pass.
