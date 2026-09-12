# CozyOS Migration Log

## Milestone 172 — Repository Reconciliation (v1.2.0 + Platform Expansion → v1.3.0)

**Objective:** reconcile two diverged branches into one verified baseline. No new features, no refactors, no architectural changes — ownership-driven file merge only.

### Step 1 — Ownership Review (evidence-based, not "newest file wins")

| Domain | Owner | Evidence |
|---|---|---|
| Authentication (`core/security/*`, `core/modules/identity/auth-coordinator.js`) | **Branch A** | Branch B's `dashboard.html` never loads `AuthorizationCoordinator`, `AuthFactorRegistry`, `OtpProvider`, or any recovery manager — only 4 identity scripts. Branch A has the full, verified, browser-tested chain. |
| Dashboard (`dashboard.html`) | **Branch A** (base) | Same reason — A's is materially more complete for the shell's actual security wiring. Branch B's 2 real Speech-domain script tags were re-added on top (see below) since Speech ← B. |
| CozyAuthenticator (`core/modules/Cozy-Authenticator/`) | **Branch A** | Only branch with it integrated into `dashboard.html`'s module loader; Branch B still had it as an unremoved standalone shell (`applications/Cozy-Authenticator/`) with none of the platform engines loaded. Standalone shell removed. |
| Conversation, Interpretation, Reasoning, Intelligence, Sense, Hearing | **Branch B** | Branch A has zero files in any of these — pure additions, no conflict. |
| Workflow Runtime (`cozy-workflow-runtime.js`) | **Branch B** | Branch A doesn't have this file; `cozy-automation.js` (present in both) was byte-identical, no conflict. |
| AI (`core/ai/`) | **Branch B** | 12 of 13 files byte-identical between branches; `cozy-ai-platform.js` exists only in B — pure addition. |
| Speech (`core/modules/speech/`) | **Branch B** | `cozy-speech.js` differs (B: v2.2.0-ENTERPRISE, 2053 lines vs A: v2.1.0-ENTERPRISE, 1629 lines — a real version increase); B has 14 adapter files A doesn't. |
| Policy (`core/modules/policy/`) | **Branch B** | `policy-engine.js` byte-identical; `policy-decision-engine.js` exists only in B — pure addition. |
| Firebase | **Branch B** | A's single `firebase.js` was superseded by B's real 8-file split (`firebase-app.js`, `firebase-auth.js`, `firebase-config.js`, `firebase-firestore.js`, `firebase-provider.js`, `firebase-session.js`, `firebase-storage.js`, `firebase-bootstrap.js`). |
| Integration / Bridge (`core/bridge/`) | **Branch B** | `engine-bridge-bootstrap.js` differs — B's version is a pure superset of A's (adds a Milestone-158 audio/hearing provider registration block); everything else in the folder is byte-identical. `core/bridge/tests/` (A) and `core/bridge/test/` (B) hold the same file content under a renamed folder — no loss, B's folder name kept. |

### Step 2 — Merge

Base tree: **Branch B** (all-inclusive, since it's a superset for every non-auth domain). Overlaid on top, from **Branch A**: `core/security/*`, `core/modules/identity/auth-coordinator.js`, `core/modules/Cozy-Authenticator/*`, `dashboard.html`. Removed: `applications/Cozy-Authenticator/` (Branch B's stale standalone shell). Added back into A's dashboard.html: Branch B's 2 real, already-wired Speech adapter scripts (`speech-translation-adapter.js`, `speech-translation-provider.js`) — the only Speech scripts either branch actually loads; the other 12 real adapter files exist in the tree but are unwired in both source branches, so reconciliation carries the files without inventing new wiring.

### Step 3 — Repository Review (re-run against merged tree)

- **Static:** every `.js` file syntax-checked (385 files). 4 pre-existing syntax errors found (`modules/quarry/quarry-contants.js`, `core/ai/cozy-ai-memory.js`, `core/connectivity/compression.js`, `core/connectivity/bandwidth.js`) — confirmed present in Branch B's original tree already, untouched by this merge, not introduced by reconciliation.
- **Runtime (headless Chromium, file:// load):** `AuthCoordinator` ✅, `AuthorizationCoordinator` ✅, `CozyOS.Auth` ✅, `OtpProvider` ✅ (real), CozyAuthenticator module ✅ registered and mountable, live enrollment produces a real RFC 6238 code, Speech translation scripts load. Console errors: 19 — identical to the pre-existing baseline in both source branches individually. Zero CDN requests. Zero new errors introduced by the merge.
- **Known, disclosed, not fixed this milestone (reconciliation-only scope):** `engine-bridge-bootstrap.js`'s new audio-provider import path (`../engines/audio/provider-browser.js`) doesn't exist in Branch B — the file only has `audio-manager.js`. The bootstrap already fails closed/non-fatally (catches and warns) for this, so it doesn't break anything, but it's a real gap in Branch B, not something reconciliation introduced or should silently paper over.

### Step 4

v1.3.0 is ready for Rule 00 verification as the starting point for Milestone 171 (or whatever's next) — with the caveat that none of Branch B's new platform engines (Hearing, Sense, Intelligence, Reasoning, Interpretation, Conversation, AI Platform) are wired into `dashboard.html` in either source branch. Reconciliation carried the files; it did not wire them in, per this milestone's own "no new features" rule.
