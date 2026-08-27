# Builder Rules — Addendum: Delivery Metadata

Extends `05-release-manifest-rule.md` (Rule 60) and
`11-repository-completeness-rule.md` (Rule 66). Cumulative per Rule 15;
replaces nothing.

## Rule 67 — Delivery Metadata Rule

**Problem this rule closes:** Rule 66 already named the narrow category of
packaging metadata allowed to live outside the repository (so a package
never has to describe its own final bytes — Rule 60's original
self-reference problem, generalized). It didn't specify what that
delivery output should actually contain, or in what shape, so it risked
being reconstructed slightly differently each session. This rule fixes
the exact contents and format, and adds a second, related purpose Rule 66
didn't cover: giving a Builder (and the person reading its output) a fast
way to see whether the repository and package are growing or shrinking
release over release, without needing to open every file to check.

### 1. What must always live inside the repository (never only in chat)

Everything Rule 66 already requires, restated here for a single clear
list at delivery time:
- `docs/builder/rules/*` (including this rule and its index)
- `LATEST.md`, `HANDOFF.md`, `RELEASES.md`
- The Repair Queue (`docs/builder/knowledge/repair-queue.md`)
- Every finding-class registry (`RP`, `RG`, `MD`, `SF`, `PF`, `AA`, `DI`, `DC`)
- Compose reports, Implementation reports, Verification reports,
  Improvement reports, Continuation reports
- Milestone history (`docs/history/MNNN*.md`)
- Engine Lifecycle Status blocks (Rule 65)

A new Builder must be able to reconstruct all of the above from the
repository alone. Chat is a delivery channel for these, never their home.

### 2. What must never be written into the repository

These are per-delivery packaging artifacts — they describe the specific
ZIP being handed over right now, not the durable state of the project, and
re-embedding any of them inside the repository recreates Rule 60's
self-reference problem (a file that must describe bytes that don't exist
until after it's written):
- The generated ZIP file itself
- ZIP size
- Repository size (as a delivery/tracking figure — see §4)
- Final Package SHA-256

**Not included in this exclusion — stays in the repository, per Rule
60:** Repository SHA-256. It is computable *before* packaging (it excludes
`RELEASES.md` itself, per Rule 60 §2), so it belongs in `RELEASES.md` as
usual. It is *also* restated in the delivery message (§3) purely for the
recipient's convenience — that restatement doesn't move its authoritative
home out of the repository.

### 3. Delivery message format (mandatory shape, every delivery)

Every delivery to the person must end with a block in exactly this shape:

```
Delivery

ZIP:
<filename>.zip

ZIP Size:
<size>
(<delta from previous package, if known>)

Repository Size:
<size>
(<delta from previous package, if known>)

Package SHA-256:
<hash>

Repository SHA-256:
<hash>
```

- **ZIP Size** and **Repository Size** deltas are computed against the
  immediately preceding delivery's figures. If no prior figure exists
  (first delivery, or the prior session didn't record one — itself a Rule
  66 gap in that prior session), state that plainly (`no prior figure
  recorded`) rather than fabricating a delta.
- **Repository Size** uses the same file scope as the Repository SHA-256
  (Rule 60 §2: every repository file except `RELEASES.md`) so the two
  figures describe the same thing and stay comparable release over
  release.
- **Package SHA-256** always matches `RELEASES.md`'s placeholder line for
  this release (`Generated after packaging — see delivery message`) — this
  delivery message is that promised location.
- This block is the *only* place ZIP filename, ZIP size, repository size,
  and package hash are stated as this release's current values. Nothing
  above should also be hardcoded into `LATEST.md`/`HANDOFF.md`/`RELEASES.md`
  as this release's live figures (only as historical `Confirms:` lines
  next round, per Rule 60 §3, once the package hash is already known).

### 4. Tracking growth/shrinkage over time

Because ZIP size and Repository size are never embedded in the
repository, a Builder cannot look them up from files alone — they must be
recomputed each delivery (§3) and their deltas judged only against the
previous delivery message. If no previous delivery message is available
(true first delivery, or a gap in a prior session's compliance), the
Builder states that honestly rather than inventing a comparison point.

## Relationship to Rule 60 and Rule 66

Rule 60 solved the specific package-hash self-reference problem. Rule 66
generalized "don't leave things only in chat" to every finding, while
naming (but not fully specifying) the same narrow packaging-metadata
exception. Rule 67 closes the loop: it fixes the exact delivery-message
contents and format so every future Builder produces the same shape, and
gives the person a consistent, low-effort way to monitor repository growth
release over release without any of that tracking data ever needing to
live inside the package it describes.

## Next Builder MUST (added to the existing Rule 59/61/62/65/66 lists)

1. Never write ZIP filename, ZIP size, repository size, or package
   SHA-256 into any repository file as this release's live value — only
   into the delivery message (§3), and only into next round's `RELEASES.md`
   `Confirms:` line once historical (Rule 60 §3).
2. Always end a delivery with the exact block shape in §3, including size
   deltas against the previous delivery when known.
3. Continue writing Repository SHA-256 into `RELEASES.md` as before (Rule
   60) — this rule does not move that value out of the repository, only
   restates it in the delivery message for convenience.
