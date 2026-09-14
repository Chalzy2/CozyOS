# STEP 4D / LIVE PRODUCT ENTRY POINT — Patch #1

**BASELINE:** COS-STEP4D-B-PATCH-7
**SHA-256:** 7ca47a62a5e476bcc95ae442bcde683e9537c662280579b88d21f39d20a92bdd
**Baseline re-verified this patch:** `unzip -t` clean, hash matches, 1130 files.

Previous architecture audits (Phase 5, Firebase identity, transport
reconciliation, Patch #6 bridge construction, Patch #7's seam search)
were **not** repeated, per instruction.

## 0. Short seam inspection (per instruction — not a new audit)

**A. Existing UI surface:** Re-confirmed Patch #7's finding by direct
inspection: `living-worship-player.js` exposes only viewer controls
(`data-player-action`: `expand`/`mini`/`pip`/`restore-mini`/`add-language`;
`data-lv-action`: `hide`/`minimize`/`open`) — no host action anywhere.
`worship-mode-coordinator.js`'s `startWorshipMode()` has zero callers
and targets a different system (`ChurchWorshipSession`/`serviceId`, not
LDCE). No admin/host console HTML exists in the repository. **No
existing shipped file has legitimate ownership of Go Live/Join Live**,
confirming Section 3's own instruction to prefer a new small file.

**B. LDCE API confirmed by reading the actual source** (not assumed
from names): `createSession(hostId, {type, title, language, metadata})`
returns `{success, sessionId, conversationId}`; `joinSession(sessionId,
userId, {language, muted, cameraOn})` returns `{success, role,
language}`; both fail closed with a `reason` string. `getSession()`
requires an already-known `sessionId` — **there is no list/enumerate
method**, confirming Section 5's viewer-discovery gap is real, not
assumed.

**C. Firebase identity path confirmed:** `firebase-session-bridge.js`
calls `CozyOS.Session.establishFromExternalAuth({uid: firebaseUser.uid,
...})` on Firebase's own `onAuthStateChanged`. `CozyOS.Session.current()`
therefore returns the real Firebase uid. This patch reads only that
value — no second identity mechanism.

**D. Composition bridge API confirmed by reading the actual source:**
`establishRelaySession(opts)` requires `relayHttpUrl`, `relayWsUrl`,
`sessionId`, `deviceManager`; accepts `registerAsHost`, `onEvent`,
`transportSelector`, and test-injection seams. Returns `{success,
transportProvider?, participationController?, userId?, role?,
reason?}`. Used exactly as documented — nothing redesigned.

## 1. IMPLEMENTED

One new file, `core/shell/live/live-entry-point.js` — a small
production orchestration module exposing exactly two actions:

- **`goLive(opts)`** (host path): reads the authenticated uid from
  `CozyOS.Session.current()` → calls
  `LDCESessionEngine.createSession(uid, {...})` → on
  `transportMode: "relay"`, forwards the resulting `sessionId` to
  `LiveRelayCompositionBridge.establishRelaySession({..., registerAsHost:
  true})`. On `transportMode: "mesh-only"`, stops after LDCE session
  creation — the bridge is never invoked.
- **`joinLive(opts)`** (viewer path): requires a caller-supplied
  `sessionId` (no discovery — see Missing Dependencies) → reads the
  authenticated uid → calls `LDCESessionEngine.joinSession(sessionId,
  uid, {...})` → on `transportMode: "relay"`, forwards to the bridge
  with `registerAsHost: false`. Same mesh-only short-circuit.

Both fail closed (return `{success: false, reason}`, never throw) for:
missing/unrecognized `transportMode`, no authenticated user, LDCE
create/join failure, and (relay mode only) bridge failure. Identity is
read only from `CozyOS.Session.current().uid` — any caller-supplied
`uid`/`userId` option key is silently ignored by design (not a
recognized parameter), verified by tests F and K.

A second new file, `core/shell/live/tests/live-entry-point.test.js`,
covers the exact test list from the handoff (A–N) plus one boundary
test verifying the composition bridge's call shape is used unchanged.

## 2. Ownership boundaries preserved (verified, not assumed)

- `live-entry-point.js` contains **zero** references to `speaking` or
  `SessionAuthority` in executable code (test L asserts this against
  the file's actual source with comments stripped, so doc-comment
  prose explaining what the file does *not* do can't produce a false
  pass).
- `transportMode` has no default — both functions require it exactly
  as `"relay"` or `"mesh-only"` (test N). `"mesh-only"` never invokes
  the bridge (test M), so LDCE's existing mesh path is structurally
  untouched by this patch.
- `LDCESessionEngine`, `live-relay-composition-bridge.js`,
  `cozy-session-service.js`, and every protected file are unmodified
  (byte-identical — see Section 4).

## 3. Tests run

```
node --test live-entry-point.test.js live-relay-composition-bridge.test.js cozy-live-session.test.js
  (run from core/shell/live/tests/, correct cwd for relative imports)
# tests 34
# pass 34
# fail 0
```
- `live-entry-point.test.js`: 15/15 (Host A–F, Viewer G–K, Boundary
  L–N, plus one bridge-call-shape check)
- `live-relay-composition-bridge.test.js` (Patch #6, re-run
  unmodified): 18/18
- `cozy-live-session.test.js` (adjacent existing suite, unrelated to
  this change, re-run as regression): 1/1

**Full repository-wide regression** (`node --test` across all 136
`*.test.js` files from the repo root) was attempted and did **not**
complete cleanly — but for reasons unrelated to this patch: several
pre-existing suites fail to resolve relative imports when invoked from
the repo root instead of their own directory (e.g.
`core/engines/scene/tests/scene-manager.test.js`), and the Playwright
browser-harness suites (e.g. the Clarity capability-status dashboard
test) time out waiting for a real browser/display, which this sandbox
does not have. Both are pre-existing environment limitations, not
introduced by this patch — verified by confirming the same failures
occur when the identical batch command is run against the unmodified
Patch #7 baseline tree. The directly relevant regression scope (this
patch's own tests + Patch #6's bridge + the adjacent live-session
suite) is 34/34 clean.

**Browser fake-device harness:** not run this patch — no host-facing
UI was built (there is still no shipped page to click through), so
there is nothing new for the browser harness to exercise yet. Same
disclosed limitation Patch #6 already carried forward for real
Firebase/network verification.

## 4. Protected-file / whole-tree audit

```
core/shell/cozy-login-gate.js                          IDENTICAL
core/modules/founder-story/founder-story-narration.js  IDENTICAL
core/modules/founder-story/founder-story-panel.js      IDENTICAL
server/live-relay/identity-assertion.js                IDENTICAL
server/live-relay/firebase-identity-issuer.js           IDENTICAL
server/live-relay/session-authority.js                  IDENTICAL
core/shell/live/live-relay-composition-bridge.js         IDENTICAL
core/modules/communication/ldce-session-engine.js        IDENTICAL
core/modules/session/cozy-session-service.js              IDENTICAL

Whole-tree diff vs Patch #7 baseline:
  Only in .../core/shell/live:        live-entry-point.js       (NEW)
  Only in .../core/shell/live/tests:  live-entry-point.test.js  (NEW)
```
No other file in the 1130-file Patch #7 tree differs. 1132 total files
in this patch.

## VERIFIED
- Baseline SHA-256 and `unzip -t` integrity re-confirmed.
- LDCE `createSession`/`joinSession` signatures, the composition
  bridge's `establishRelaySession` contract, and
  `CozyOS.Session.current()`'s real-Firebase-uid provenance — all
  confirmed from actual source, not inferred.
- No existing shipped Go Live/Join Live UI owner exists (re-confirmed
  independently of Patch #7's own finding).
- No LDCE session-discovery/enumeration method exists (confirmed from
  source — only `getSession(knownId)`).
- 34/34 directly relevant tests pass.
- Protected files and the rest of the Patch #7 tree are byte-identical;
  whole-tree diff shows exactly the two new files.

## NOT VERIFIED
- Real Firebase login, real network calls to `/identity/assertion` or
  `/session/:id/token/:sub`, real SFU/RTP — same disclosed limitation
  as every prior patch in this chain (no outbound network in this
  sandbox).
- Full 136-file repository-wide regression (see Section 3 for the
  specific pre-existing, unrelated causes).
- Browser fake-device harness (nothing new for it to click through
  yet — no UI wiring in this patch).

## MISSING DEPENDENCIES
1. **A shipped "Go Live" UI action.** `live-entry-point.js` is
   callable but not yet wired to any button — because no host-facing
   button exists anywhere in the product. Building that button is a
   UI-design task, not something this patch invented (per the stop
   condition against manufacturing a call site).
2. **Viewer session discovery.** `joinLive()` requires a
   caller-supplied `sessionId`. Nothing in this repository lets a
   viewer discover a live `sessionId` (no enumerate/list method on
   `LDCESessionEngine`, no discovery service anywhere). Per Section 5's
   own instruction, no fake discovery was introduced — this is a
   legitimate, still-open dependency.
3. **The product decision from Patch #5/#7:** which sessions should
   use `transportMode: "relay"` vs `"mesh-only"` is still not decided
   anywhere in the product. `live-entry-point.js` makes that choice
   explicit and caller-supplied rather than deciding it.

## LIMITATIONS
- This patch adds callable orchestration logic, not a clickable
  product feature. A user cannot yet "go live" by clicking anything in
  the shipped app.
- The 34/34 regression figure is real and independently re-run this
  patch (unlike Patch #6/#7's 150/150, which was read from a prior
  report because no test-runner config exists at the repo root).

## NEXT BUILD MUST START WITH
This ZIP (`COS-STEP4D-LIVE-ENTRY-PATCH-1.zip`). The next legitimate
unit of work is one of the two Missing Dependencies above — most
likely: design and build the actual host-facing "Go Live" UI (a real
product/UI decision, e.g. a new ChurchOS host console page) that calls
`LiveEntryPoint.goLive()`. Do not repeat this patch's seam search or
LDCE/bridge API inspection — both are now settled facts for the next
builder, same as this patch treated Patch #7's findings.
