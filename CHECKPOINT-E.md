# CozyOS — Micro-Milestone E: Memory Authority — Checkpoint

Starting point: Checkpoint D (Voice/STT Authority Reconciliation),
SHA-256 09c95add492af9dedb47682d720082b4565938abb28ed8d37d81ddf29c37a512

## 1. Memory ownership audit (real findings)

Real memory implementations found:
- `core/modules/memory/cozy-memory-engine.js` — **CozyMemory**, the live,
  canonical memory engine. In-memory (per session), namespaced
  (Builder/Research/Church/Project/etc.), real CRUD + versioning +
  keyword search + owner/visibility checks. This is the real owner.
- `core/modules/memory/cozy-memory-lifecycle.js` — **MemoryLifecycle**,
  a real sidecar extension of CozyMemory (health/retention/relationship
  metadata). Does not duplicate storage; always calls back into
  CozyMemory's public API. Confirmed by reading the file — not a second
  authority.
- `core/ai/cozy-ai-memory.js` — **CozyAIBusinessMemory**, a separate,
  already-independent memory type per its own header. Its own header
  discloses it as a structural reconstruction of a truncated file —
  most fields (`Categories`, `Importance`, collection list) are empty
  placeholders. Left untouched this milestone: it doesn't own the gap
  found below, and the milestone brief says not to invent business
  logic to "fix" a file whose real logic is already disclosed unknown.

Callers of CozyMemory (confirmed via grep, not assumed): ChurchOS
membership/worship modules, Bible engine, Developer Hub, Innovation
Engine, Planning Engine, Certification, Bugfixer, remote media index,
living-runtime, living-learning. None of these call listKeys() /
searchMemory() / searchAllNamespaces() / tagSearch() with an actorId —
confirmed by grep — so the fix below is additive and backward
compatible for all of them.

Persistence: in-memory only, matches every other CozyOS coordinator
(export/import is the real persistence path — unchanged this milestone).
Organization scope: real, via IdentityEngine.getUser().orgId match —
already existed, used by `#checkReadVisibility()`.
Privacy boundary / authorization: real but partial — see gap below.

## 2. The one genuine gap

`readMemory()` and `recall()` both call the real `#checkReadVisibility()`
gate. `listKeys()`, `searchMemory()`, `searchAllNamespaces()`, and
`tagSearch()` did not — they returned every entry in a namespace
regardless of `visibility`/`owner`. Since `saveMemory()`'s real default
`visibility` is `"private"`, a private entry was already unreachable via
`readMemory(ns, key, otherActorId)` but was still fully listed and
full-text searchable by any actor via the other four methods. This is
the "missing safe retrieval boundary" gap the milestone brief calls out
by name.

## 3. Implementation (smallest safe fix)

Extended the existing real authority (`CozyMemory`) — no new engine, no
second store. All four methods now take an optional trailing `actorId`
(defaulting to `"system"`, matching the existing `readMemory()`
convention) and filter through the same `#checkReadVisibility()` gate
already used by `readMemory()`/`recall()`. Owner-only mutation
(`#checkPermission()`), export/import, encryption, and namespace
isolation are unchanged.

Because every pre-existing call site never passed an `actorId`, and
`"system"` always passes the visibility check, this is non-breaking:
confirmed by running the full existing regression suite (below) and a
grep of every call site in the repo before editing.

Files changed:
- `core/modules/memory/cozy-memory-engine.js` — the fix (also updated
  its own header doc to disclose the change, per the file's existing
  "Honest Capability Rule" style).

Files added:
- `core/modules/memory/tests/cozy-memory-visibility.test.js` — 10 focused
  tests: unchanged behavior when actorId is omitted, real enforcement
  when it's supplied, owner still sees their own entry, fail-closed on a
  private entry, scope isolation across namespaces, public entries stay
  open, and one direct readMemory()/listKeys() agreement check.

## 4. Testing

New test file: 10/10 passed.

Full existing regression suite for every test that loads CozyMemory
was run before and after the change (same command, same file):
- cozy-remote-media-search.test.js — 56/56 passed (unchanged)
- cozy-remote-media-index.test.js — 55/55 passed (unchanged)
- cozy-intelligence-privacy.test.js — 108/108 passed (unchanged)
- cozy-african-language-intelligence.test.js — 63/63 passed (unchanged)
- cozy-intelligence-offline-sync.test.js — 77/77 passed (unchanged)
- cozy-media-analysis-link.test.js — 80/80 passed (unchanged)
- cozy-rp034-integration.test.js — 86/86 passed (unchanged)
- cozy-remote-media-analysis.test.js — 63/63 passed (unchanged)
- cozy-media-evidence.test.js — 106/108 (2 pre-existing failures)
- cozy-research-search.test.js — pre-existing failures present
- cozy-media-intelligence.test.js — pre-existing failures present
- cozy-research-intelligence.test.js — pre-existing failures present

The pre-existing failures are all the same assertion — "RP-030 registry
still reports 13 defaults" (gets 17) — an unrelated language-pack
registry count. Confirmed pre-existing and unaffected by this milestone
by running the identical test against the untouched Checkpoint D source
before making any change: same 2/3 failures, same message, same numbers.
Not modified, per the milestone brief's instruction not to touch
unrelated failing tests.

`node --check` passes on both the changed file and the new test file.

## 5. Browser

No new browser-facing consumer was added — the four methods already had
browser callers (Developer Hub UI, ChurchOS UI) and none of them pass an
actorId today, so their behavior is byte-identical at runtime. No
browser verification run this milestone (none of the changed code path
is newly reachable from the browser in a way existing verification
didn't already cover).

## 6. What was deliberately not done

- Did not touch `core/ai/cozy-ai-memory.js` — separate authority, its
  own gap (if any) is a different milestone's scope.
- Did not touch Public/Private Story governance (Checkpoint B).
- Did not touch Voice/STT (Checkpoint D).
- Did not create a second memory/permission engine.
- Did not fix the pre-existing RP-030-count failures (unrelated, and the
  brief says not to modify unrelated failing tests).
