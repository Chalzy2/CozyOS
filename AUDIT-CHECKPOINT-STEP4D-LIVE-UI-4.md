# AUDIT CHECKPOINT — STEP 4D LIVE UI — PATCH #4 (PART D)

BASELINE:
COS-STEP4D-LIVE-UI-PATCH-3.zip

BASELINE SHA-256:
61e6a306519bbf9f3589850ec53784396bb91abfc5259e0e6ed1c17af3e70b32
(re-confirmed on this session's upload — unzip -t clean)

PARENT:
COS-STEP4D-LIVE-UI-PATCH-2.zip
SHA-256: b4f204194fff00fa5df1596654da9a49c1d72590f4f20d1627fb7c90aecf225e

## PART D STATUS: BLOCKED / AUDIT-ONLY

## SAFE EXISTING VIEWER ADAPTER: NO

## OBJECTIVE

Determine whether the result of `LiveEntryPoint.joinLive()` can be
handed to the existing `living-worship-player.js` viewer surface
without inventing a second session model or changing LDCE ownership.

## TARGETED INSPECTION PERFORMED (scoped, not a repository-wide audit)

### A. Part B/C join console — what joinLive() returns

`core/shell/live/ui/cozy-live-join-console-controller.js` calls
`LiveEntryPoint.joinLive({ transportMode: 'mesh-only', sessionId })`
(this console's `TRANSPORT_MODE` is a fixed constant — never
caller-selectable). Confirmed in `core/shell/live/live-entry-point.js`
(`joinLive()`, mesh-only branch, line 241-243): on success this
returns exactly:

```
{ success: true, sessionId, uid, role: joinResult.role, relay: null }
```

No `MediaStream`, no video/audio object, no track reference of any
kind is present in this return value. `relay` is explicitly `null` in
mesh-only mode — only the `"relay"` transportMode branch (unused by
this console) would ever populate a `relay` object via the
composition bridge, and this console deliberately never selects that
path (Task 2-F from Part C, preserved unchanged).

### B. Existing viewer surface — living-worship-player.js input boundary

Inspected its full public API surface (`mount()`, `bindToService()`,
`getDiagnosticsReport()` — no other public methods exist). The only
method capable of receiving external session/stream data is:

```
bindToService(serviceId)   // line 162
```

This is not a session-handoff seam. It is a `MediaStream` lookup key,
composing exactly two sources, confirmed by direct inspection of both:

- `LiveCaptureEngine.getPreviewStream(captureId)`
  (`core/engines/media/live-capture-engine.js` line 224-225) — "the
  real, live MediaStream for a `<video>` element to bind to
  (`element.srcObject = stream`)".
- `LiveHotspotEngine.getRemoteStreams(connectionId)`
  (`core/engines/collaboration/live-hotspot-engine.js` line 270-271)
  — "real MediaStreams accumulated from this connection's own
  ontrack events."

Both are keyed by an ID type (`captureId` / `connectionId`) that
belongs entirely to CozyOS's own WebRTC capture/hotspot mesh
subsystem — a different, unrelated ownership domain from
`LDCESessionEngine`'s session/roster/language object model. There is
no existing mapping, alias, or shared identifier space between an
LDCE `sessionId` and a `captureId`/`connectionId`.

### C. dashboard.html load relationship (confirmed only, not re-audited)

`living-worship-player.js` is loaded once via `<script>` tag
(`dashboard.html` line 1349) with no instantiation arguments, no
change from the Part C/earlier finding. This was not re-audited
beyond confirming the single load site still exists.

## REASON (two independent blockers, either one alone is sufficient)

1. **No shared identifier space.** `bindToService()` expects a
   `captureId`/`connectionId` from CozyOS's capture/hotspot mesh
   subsystem. `joinLive()` produces an LDCE `sessionId`. Converting
   one into the other has no existing semantic basis — it would be
   exactly the "make the strings look compatible" anti-pattern Part
   D's own ownership rule (Section 6) forbids, and the earlier Part C
   audit already forbade converting `serviceId` into an LDCE
   `sessionId` for the identical reason in the opposite direction.

2. **No stream exists to hand off, independent of (1).** This join
   console's `joinLive()` call is permanently `mesh-only`
   (Part C's Task 2-F requirement, unchanged) and mesh-only mode's
   own return value contains no `MediaStream`/track of any kind
   (`relay: null`). Even if a valid `sessionId` → `captureId`
   mapping existed, `bindToService()` would still have nothing real
   to bind — it would either silently do nothing (dishonest UI) or
   require inventing relay activation, which Section 3/12 of this
   patch's own instructions forbid ("no automatic relay activation").

Attempting an adapter here would require either (a) fabricating an
identifier translation with no existing ownership basis, or (b)
silently switching this console from mesh-only to relay to produce a
stream in the first place — both are explicit Rule-86 stop
conditions ("LDCE sessionId would have to become a different session
identifier"; "relay would be silently activated").

## MISSING DEPENDENCY

A real product decision establishing how (or whether) an LDCE
mesh-only joined session's audio/video should ever reach a `<video>`
element — e.g., a genuinely new LDCE-native media consumption path,
or an explicit decision to always relay-activate direct-join viewers
(with its own UI/consent implications) — is required before any
viewer-surface integration is possible. This is a product/architecture
decision, not something a builder session should invent.

## WHAT WAS CHECKED (exhaustive, per scope — Section 2 only)

- `cozy-live-join-console-controller.js` — full file, confirmed
  transportMode is fixed `mesh-only` and confirmed joinLive()'s
  return shape reaching the console.
- `live-entry-point.js` — `joinLive()`, mesh-only branch, confirmed
  exact return value.
- `living-worship-player.js` — full public API surface (`mount()`,
  `bindToService()`, `getDiagnosticsReport()`); confirmed
  `bindToService()`'s two composed sources and their ID semantics.
- `live-capture-engine.js` — `getPreviewStream()` signature/contract
  (comment + signature only, not modified).
- `live-hotspot-engine.js` — `getRemoteStreams()` signature/contract
  (comment + signature only, not modified).
- `dashboard.html` — confirmed single, unchanged load site (line
  1349), no instantiation arguments.

## IMPLEMENTED

None. Zero production files touched. Zero new files except this
audit report. No tests added — per this patch's own instruction
("If no safe adapter exists, do not write fake tests to justify
one").

## VERIFIED

- Baseline SHA-256 re-confirmed on the actual Part C zip:
  61e6a306519bbf9f3589850ec53784396bb91abfc5259e0e6ed1c17af3e70b32
  — unzip -t clean.
- Whole-tree diff against the Part C working tree: zero differences
  (confirmed via `diff -rq` before any file was added) — the
  inspection touched no file.
- Protected files re-checked byte-identical (`cmp`) against the Part
  C baseline: `living-worship-player.js`, `ldce-session-engine.js`,
  `live-relay-composition-bridge.js`, `session-authority.js`,
  `cozy-live-session.js`, `cozy-live-join-console-controller.js`,
  `live-entry-point.js`.
- All existing Part B/C/host-console/viewer test suites were left
  entirely unrun-against-changes since no source file changed; no
  regression is possible from this patch by construction (whole-tree
  diff is empty except for this report's addition).

## NOT VERIFIED

N/A — a negative finding (no safe adapter exists) is the deliverable,
identical in kind to the Part-C-audit checkpoint's own precedent.

## LIMITATIONS

This check was scoped exactly as instructed: the join console's
actual `joinLive()` return shape, `living-worship-player.js`'s
existing public input boundary, and the two stream sources that
boundary composes. No broader architecture audit was performed.

## NEXT BUILD MUST START WITH

A product decision (not code) on how a direct-join mesh-only LDCE
viewer should ever receive real media — before any Part D
implementation is possible. Two non-exhaustive options for that
future decision (not this builder's call, and neither is authorized
here):

1. Extend `LDCESessionEngine`/a new LDCE-native media path to expose
   its own `MediaStream`(s) directly, with `living-worship-player.js`
   (or a new, explicitly-scoped viewer) consuming that new, real LDCE
   media API — not `bindToService()`.
2. Make the join console's transport choice a real, explicit,
   user-facing decision (mesh vs. relay) rather than the current
   fixed `mesh-only`, and only then evaluate whether relay's own
   established transport-provider path can feed a viewer surface —
   which would itself need its own scoped audit.

No further code should be written until that decision is made.

## RULE-86 STOP CONDITIONS OBSERVED

Triggered: "LDCE sessionId would have to become a different session
identifier" AND "relay would be silently activated" (either one
independently sufficient). No adapter was built. No sessionId field
was added. `bindToService()` was not modified. No translation between
session models was invented. No new viewer implementation was
created. No discovery, invite, or QR infrastructure was added.
