# Cozy Builder — Documentation Integrity Registry (DI)

Cases where a real, live file's own documentation (header comments,
inline claims) no longer matches the actual live architecture. Distinct
from a bug — the code isn't necessarily broken, but a developer reading
that file's comments would be misled about system ownership.

---

## DI-001 — `core/identity/developer-profile.js` header claims CozyIdentity is the active identity subsystem

**Status:** Open — blocked on MD-003 (file not supplied)

**Finding (from `reports/cozy-identity-investigation.md` §3):** this real, live, loaded file's own header states that user/trust identity "remains `core/modules/identity/` (CozyIdentity), an unrelated subsystem" — but CozyIdentity was archived (see the Duplicate Consolidation Registry DC-002 and `reports/cozy-identity-archive-certification.md`) in favor of `IdentityEngine`/`AuthCoordinator`/`TrustedDeviceManager`/`SessionService`.

**Risk if left uncorrected:** a developer reading `developer-profile.js`'s own header would be pointed at an archived, non-executing subsystem as if it were authoritative — a real, if small, misdirection risk independent of any code defect.

**Resolution:** correct the header to name the actual live identity subsystem. Requires the real file (MD-003) — cannot be applied from the paraphrased quote alone, per Rule 49 (never modify what hasn't been inspected).

**Closure criteria:** close once the real file's header has been read, the exact stale line identified, and corrected — with the before/after text recorded here.

---

## DI-002 — `session-handoff.md` under-discloses this session's own payload

**Status:** Open — non-blocking, recorded during production integration

**Finding:** the delivered `docs/builder/reports/session-handoff.md` states "Mode: Report/Learn throughout — no production code implemented, nothing generated" and does not mention `core/modules/builder/observation-engine.js` or the `dashboard.html` script-tag addition anywhere in its 9 sections — even though both are real, and both are honestly and fully disclosed in this same package's own `docs/builder/CHANGELOG.md`.

**Risk if left uncorrected:** a future reader relying on the handoff document alone (rather than the CHANGELOG) would incorrectly believe this session shipped zero runtime code, understating the actual scope of what was delivered.

**Resolution:** update `session-handoff.md` in a later documentation pass to reflect the `observation-engine.js` addition and the `dashboard.html` wiring, consistent with the CHANGELOG's account. Not a code change — does not block production integration, since the underlying code was independently verified (syntax check, load-order check, global-collision check) rather than taken on the handoff document's word.

**Closure criteria:** close once `session-handoff.md` is revised to include the `observation-engine.js`/`dashboard.html` changes in its file-delta and "completed this session" sections.

---

## DI-003 — `CHANGELOG.md` references a report that does not exist in the package

**Status:** Open — non-blocking, recorded during production integration

**Finding:** `docs/builder/CHANGELOG.md`'s "Builder Storage & Observation Engine milestone" entry states "See `reports/builder-implementation-M372.md` for the full gap analysis and validation record behind this entry" — no such file exists anywhere in the delivered package or the verified production workspace.

**Risk if left uncorrected:** a developer following that citation to review the gap analysis behind `observation-engine.js` will hit a dead reference with no record of whether the file was never produced, produced and not included, or lost in transit.

**Resolution:** either produce and add `reports/builder-implementation-M372.md`, or remove the dangling citation from the CHANGELOG entry, in a future documentation-correction pass.

**Closure criteria:** close once the CHANGELOG either links to a real, present file or no longer cites one.

---

## DI-004 — `core/language.js:32` references a global (`window.CozyLanguage`) that is never assigned anywhere in the repository

**Status:** Open — non-blocking, discovered during M388 Engine 2 Phase 0 repository-wide search (unrelated to M388's own scope)

**Finding:** `core/language.js`'s `setLanguage()` reads
`window.CozyLanguage?.LANGUAGES` as its source of valid locale keys
("Safe validation fallback array checking exported CozyLanguage
dictionary"). A repository-wide search for `window.CozyLanguage =`
(or any equivalent assignment) found none — the two real globals in this
naming family are `window.CozyLanguageImporter`
(`core/languageImporter.js`) and `window.CozyOS.CozyLanguageEngine`
(`core/modules/language/language-engine.js`), neither named
`window.CozyLanguage`. The optional-chaining (`?.`) means this always
silently evaluates to `undefined`, so `setLanguage()` always falls
through to its hardcoded 8-locale fallback object — not a crash, not an
active defect, but the comment's claim of an "exported CozyLanguage
dictionary" is not real.

**Risk if left uncorrected:** a developer reading this file's comment
would believe `window.CozyLanguage` is a live, populated registry
elsewhere in the codebase and could build against it, silently getting
`undefined` at runtime with no error.

**Resolution:** either point this at one of the two real globals
(`CozyLanguageImporter`/`CozyLanguageEngine` — whichever's locale list
was actually intended) or remove the dead optional-chain and comment, in
a future documentation/code-correction pass. Not fixed this pass — out
of M388 Engine 2's explicit Compose-only scope for this session.

**Closure criteria:** close once `core/language.js:32` either references
a real, assigned global or the dead reference is removed.

---

## DI-005 — Documented repository-hashing method silently mis-splits filenames containing spaces

**Status:** Resolved (procedure corrected) — discovered and fixed during M388 Engine 2 Phase 3/4 (unrelated to Engine 2's own build; a repository-tooling finding)

**Finding:** the repository hashing method documented across `RELEASES.md`/`LATEST.md`/`HANDOFF.md` (`find . -type f ! -path './_archive/*' ! -name 'RELEASES.md' | sort | xargs sha256sum | sha256sum`) mis-splits any filename containing a space when piped through plain `xargs` — this repository has three such files: `modules/quarry/ quarry.html\`` (pre-existing, unrelated to any M388 engine), `core/bridge/test/media integration test.js`, and `core/docs/CERTIFICATION REPORT md`. This made the resulting hash depend on incidental argv/buffer-splitting behavior rather than being a reproducible function of the repository's actual contents — the real root cause of the Round 10/11/12 hash discrepancies previously logged as an open, unresolved finding (see `RELEASES.md` Round 11/12 entries), which earlier rounds correctly declined to guess at rather than silently pick a value.

**Risk if left uncorrected:** every future round would keep reproducing a different, non-reproducible hash for byte-identical repository content, permanently blocking hash-based integrity verification between accounts (the entire purpose of Rule 60/67's hashing requirement).

**Resolution:** re-ran the identical logical method with NUL-delimited output (`find ... -print0 | sort -z | xargs -0 sha256sum | sha256sum`) — reproduced Round 12's own recorded hash (`58213b8b46069450bc661ab7220c7e402fe61339d63bd7ae33e859abb15579cf`) exactly, confirming Round 12's repository state and recorded value were correct all along. Canonical method updated in `LATEST.md`/`HANDOFF.md` this pass to include `-print0`/`-z`/`-0`. The three space-containing filenames themselves were **not** renamed this pass — that is a separate, low-priority cleanup (one of them, `core/docs/CERTIFICATION REPORT md`, is also missing its `.md` extension, a second, smaller irregularity) unrelated to Engine 2's own scope.

**Closure criteria:** met — canonical hashing procedure now reproducible; documented and adopted in `LATEST.md`/`HANDOFF.md`. (Optional follow-up, not required for closure: rename the three affected files to remove embedded spaces, as its own small dedicated pass.)
