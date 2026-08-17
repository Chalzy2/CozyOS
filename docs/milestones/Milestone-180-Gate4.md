# Milestone 180 — Gate 4 — Known Limitations

Only verified limitations. No speculation.

- **CozyAI is not actually wired to this module.** `core/ai.js` does not
  call `window.CozyOS.DeveloperIdentity` anywhere — confirmed unchanged
  by `md5sum` against the M179 baseline. If a user asks CozyAI directly
  "who created you," CozyAI's existing routing engine will not
  automatically consult this module unless a separate, reviewed
  integration is built in a future milestone. The data and Q&A contract
  exist and are verified; the live connection does not yet.
- **Load order in `dashboard.html` is load-bearing.** `cozyai-identity.js`
  must load after all three of `developer-profile.js`,
  `project-history.js`, and `african-knowledge-initiative.js`. The
  current script order enforces this, and the fail-closed behavior
  (Gate 3, Scenario 2) means a future accidental reordering would
  silently *not* register `DeveloperIdentity` (with a console warning)
  rather than crash or fabricate partial data — but it would still be a
  regression worth catching in CI, which this repository does not have.
- **`query(topic)` only resolves 3 canonical topics by exact key.** Any
  other phrasing of a question (e.g. free-text natural language) is not
  parsed or matched — it falls through to the honest "I don't have that
  information" response. Natural-language question matching is not
  implemented in this milestone.
- **Browser Runtime Verified: NOT PERFORMED.** No browser is available
  in this environment (see Gate 3).
- **No secure/administered private-profile mechanism exists.** The spec
  allows private fields to be "explicitly added in future through a
  dedicated secure profile" — no such mechanism (storage, access
  control, or admin UI) exists anywhere in this repository. This
  milestone does not build one; it only guarantees the current public
  API never exposes those fields.
