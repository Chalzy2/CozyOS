# STEP 4D / LIVE UI — CHECKPOINT G — IMPLEMENTATION & VERIFICATION REPORT
Type: RECOVERY CHECKPOINT (not an audit stop). Captures the current
working tree exactly as it exists, with Part G's fix already applied and
already verified, before any further implementation begins.

## BASELINE
Archive: `COS-STEP4D-LIVE-UI-PATCH-6.zip`
SHA-256: `b4a1cdd378d7a90830782cbfd3c0275351b3c1069b5c018adc7c8fabe75f841d`
`unzip -t`: No errors detected in compressed data.

## WHAT PART G CHANGED (unchanged since the prior report — re-stated here for a self-contained checkpoint)
Exactly one production file and its own test file, nothing else:
- `core/shell/live/ldce-live-media-coordinator.js`
- `core/shell/live/tests/ldce-live-media-coordinator.test.js`

Two real gaps were fixed, both inside this file's own existing
composition of `LDCESessionEngine`'s public methods — no new files, no
LDCESessionEngine/LDCEMediaSessionEngine internals touched, no
controller/HTML files touched:
1. A viewer's Join → Leave → Join cycle against a still-live host was
   wrongly serviced as an illegitimate second viewer. Fixed: the
   `participant-joined` handler now distinguishes "the already-accepted
   viewer reconnecting" from "a genuinely different second viewer".
2. The viewer's "Leave" action never reached the session roster (no
   `LDCESessionEngine.leaveSession()` call), so the host never learned
   the viewer left, the one-viewer slot never freed, and the host-side
   peer connection went stale. Fixed: `leaveViewerMedia()` now calls the
   existing, already-tested `leaveSession()`; `startHostMedia()` now also
   listens for the existing `"participant-left"` event to free the slot
   and tear down the stale connection.
3. `stopHostMedia()` hardened to unsubscribe both listeners and to be
   safe to call even when `startHostMedia()` was never called for that
   session (host closing before a viewer connects).

## FILES CHANGED — VERIFIED
Full recursive `diff -rq` of this checkpoint's working tree against a
pristine extraction of `COS-STEP4D-LIVE-UI-PATCH-6.zip`:

```
Files pristine/.../core/shell/live/ldce-live-media-coordinator.js and
      checkpoint-g/.../core/shell/live/ldce-live-media-coordinator.js differ
Files pristine/.../core/shell/live/tests/ldce-live-media-coordinator.test.js and
      checkpoint-g/.../core/shell/live/tests/ldce-live-media-coordinator.test.js differ
```

**No other output.** Confirms exactly these two files changed and every
other file in the archive — every controller, every HTML file, every
other engine, every other test suite, every asset — is byte-identical to
the Patch 6 baseline. See `CHANGED-FILE-HASHES-CHECKPOINT-G.txt` for the
per-file SHA-256 pairs (baseline vs. current) and
`BYTE-DIFF-CHECKPOINT-G-coordinator.txt` / `BYTE-DIFF-CHECKPOINT-G-tests.txt`
for the full unified diffs.

## PROTECTED FILES — RECHECKED AGAINST PATCH 6
Spot-recheck of the files Part F/G explicitly disclosed as never touched,
each hashed against its Patch 6 baseline counterpart and found identical:
- `core/modules/communication/ldce-media-session-engine.js` — unchanged
- `core/modules/communication/ldce-session-engine.js` — unchanged
- `core/shell/live/ui/cozy-live-host-console-controller.js` — unchanged
- `core/shell/live/ui/cozy-live-host-console.html` — unchanged
- `core/shell/live/ui/cozy-live-join-console-controller.js` — unchanged
- `core/shell/live/ui/cozy-live-join-console.html` — unchanged
- `core/shell/live/live-relay-composition-bridge.js` — unchanged
- `core/shell/live/cozy-live-session.js` — unchanged

(These are the same eight paths the recursive diff above already proves
are unchanged, listed individually here per the explicit "recheck
protected files" instruction — not a second, different check.)

## REGRESSION — REAL `node --test`, RUN FROM THIS WORKING TREE BEFORE PACKAGING
| Suite | Result |
|---|---|
| `ldce-live-media-coordinator.test.js` (A–T Part F + U–AC Part G) | 29/29 pass |
| `live-entry-point.test.js` | 15/15 pass |
| `live-host-console-controller.test.js` | 9/9 pass |
| `live-join-console-controller.test.js` | 14/14 pass |
| `live-relay-composition-bridge.test.js` | 18/18 pass |
| `cozy-live-session.test.js` | 1/1 pass |

**86/86 executable (non-browser) tests pass. Zero failures.**

## NOT VERIFIED
Real browser/device execution (`getUserMedia()`, real `RTCPeerConnection`
negotiation/ICE, real video rendering) — not performed. No display, no
Chromium binary, no `playwright` module available in this environment.
Recorded honestly as not verified, not simulated.

## ZIP / FRESH-EXTRACTION VERIFICATION
See the final response for the concrete SHA-256 values and pass/fail
results of: double SHA-256 of the packaged ZIP (reproducibility check),
`unzip -t`, a completely fresh extraction into a separate directory,
manifest verification from that fresh extraction, and a full test re-run
from that same fresh extraction.

## VERDICT
No architectural blocker. This is a clean recovery checkpoint of already-
verified Part G state — implementation should resume from this exact
checkpoint for the next phase, not restart discovery or re-audit Parts
A–G.
