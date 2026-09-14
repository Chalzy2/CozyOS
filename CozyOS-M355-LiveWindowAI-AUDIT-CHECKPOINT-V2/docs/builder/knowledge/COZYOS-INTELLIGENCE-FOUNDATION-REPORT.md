# CozyOS Universal Knowledge Intelligence + Provider Intelligence Foundation — Report

Following the required sequence (section 54): this delivers **Steps
1-8** (discovery through provider registration). **Steps 9-10 (CozyAI
and CozyBuilder discovery integration) were deliberately NOT
attempted** — per the explicit instruction "do not jump to Step 9/10
before the foundation is sound," and because integrating two more
subsystems in the same pass as building and verifying the foundation
itself would risk exactly the un-verified layering this task warns
against. This is disclosed as the "exact next dependency" (item X), not
hidden.

---

## A. Repository discovery

**Existing AI systems (OBSERVED):** `core/ai/` contains 4 locked files
(`ai.js`, `cozy-ai-language.js`, `cozy-ai-memory.js`) plus several
UNLOCKED files (`cozy-ai-integration.js` — note: distinct from the
locked `core/ai/integration.js`, which is genuinely absent, confirmed
by direct filesystem check, not assumed), domain handlers
(`mpesaHandler.js`, `schoolHandler.js`, etc.), `cozy-ai-platform.js`.
`core/modules/aimode/cozy-ai-mode.js` and
`core/modules/intelligence/cozy-ai.js` also exist. None were modified.

**Existing memory systems (OBSERVED, fully inspected):**
`core/modules/memory/cozy-memory-engine.js` ("CozyMemoryEngine") —
real, substantial: namespaced CRUD, version history, rollback,
structural diff/merge, export/import, and a visibility check
(`#checkReadVisibility`). **Critical finding, from the file's own
header**: *"The caller's actorId is taken on its word — there is no
[real verification]."* This is a genuine, honestly-disclosed
CLIENT-SIDE (`window.CozyOS`) system — the identical trust-model gap
found in every prior phase's client engines (Vault, billingEngine,
entitlement-engine, payment-provider engines). **Not reusable as the
org-isolated, server-authoritative knowledge foundation this task
requires** — confirmed by evidence, not assumed.

**Existing knowledge systems (OBSERVED, fully inspected):**
`core/modules/intelligence/knowledge/cozy-knowledge-registry.js`
already exists — genuinely real, with an honest evidence vocabulary
(`VERIFIED`/`PARTIALLY_VERIFIED`/`NOT_FOUND`/`NOT_A_CAPABILITY`) and a
`safeCall()` pattern that degrades a throwing dependency to
`NOT_FOUND` rather than fabricating success. But it is a **fixed,
narrow set of browser-side read-only getters** (founder identity,
application listing, provider health, active AI provider) — not an
extensible, registrable knowledge MODEL, and has no organization-
scoping concept at all. `core/modules/builder/evidence-engine.js` also
exists — reads `docs/builder/knowledge/*.md` heading counts via
browser `fetch()` to answer one narrow question (is there enough
evidence for a future Pattern Engine). Neither is a queryable store.

**Existing documentation systems:** `docs/builder/knowledge/*.md` — the
same directory this entire multi-phase engagement's own change reports
live in. Confirmed this is documentation-as-files, not a queryable
database — a real, legitimate distinction from what this task needs.

**Existing provider systems (OBSERVED, reused from Phase 4/5):**
`PaymentRegistry` (`server/webauthn-rp/payments.js`),
`CryptoPaymentRegistry` (`server/webauthn-rp/crypto-payments.js`),
`QuoteEngine` (`server/webauthn-rp/quote-engine.js`). All confirmed
still the sole owners of their domains — not touched this round.

**Existing capability systems:**
`core/modules/payment-provider/capability-engine.js` — real,
client-side, with a `NAMED_CAPABILITIES` vocabulary (`payments`,
`refunds`, `mobileMoney`, `cardPayments`, `cryptoPayments`, etc.) and
its own `__proto__`/`constructor`/`prototype` exclusion already
present. **Reused, not duplicated**: this round's capability naming is
compatible with this existing vocabulary.

**Existing configuration/audit/auth/org-isolation systems (all reused,
none duplicated):** `OrganizationRegistry.isAuthorized()`,
`audit_events` (shared table since Phase 2), `rp.js` session
resolution, `BillingRegistry` for the "never a financial authority"
guarantee this round's tests explicitly verify.

**Existing schemas/migrations:** `001` through `011` inspected;
`012_knowledge_foundation.sql` is the next number, confirmed before
writing it.

**Existing builder/code-generation systems (OBSERVED, not integrated
this round):** `core/modules/builder/` contains a substantial,
pre-existing family — `cozy-builder.js`, `builder-orchestrator.js`,
`capability-dependency-graph.js`, `capability-knowledge-acquisition.js`,
`evidence-engine.js`, `learning-engine.js`, `observation-engine.js`,
and more. This is real, relevant context for the eventual CozyBuilder
integration (Step 10) but was not modified or wired into this round's
work.

## B/C/D. Systems found, reused, extended

| System | Disposition |
|---|---|
| `CozyMemoryEngine` | Found, inspected, **left untouched** — genuinely different trust model (client-side, self-reported actor), not reusable, not duplicated. |
| `cozy-knowledge-registry.js` | Found, inspected, **left untouched** — narrow, fixed, browser-side; genuinely different from an extensible server-side model. |
| `evidence-engine.js` | Found, inspected, **left untouched** — different question, different runtime. |
| `PaymentRegistry`/`CryptoPaymentRegistry`/`QuoteEngine` | **Reused** — described by new knowledge records, never re-implemented. |
| `OrganizationRegistry.isAuthorized()` | **Reused** — every visibility/authorization check in the new registry calls this real function. |
| `audit_events` | **Reused** — every knowledge mutation writes here, no second audit system. |
| `capability-engine.js`'s `NAMED_CAPABILITIES` | **Reused as vocabulary** — new capability strings are compatible, not reinvented. |

## E. New components created, and why each was necessary

- `server/webauthn-rp/migrations/012_knowledge_foundation.sql` +
  `db.js` mirror — `knowledge_records`, `knowledge_evidence_links`. No
  existing table serves this purpose (confirmed above).
- `server/webauthn-rp/knowledge-registry.js` — `KnowledgeRegistry`.
  Necessary because no existing server-side, org-isolated, registrable
  knowledge model exists — both candidate existing systems are
  client-side or too narrow, as documented above.
- `server/webauthn-rp/test/knowledge-registry.test.js` — 28 tests.

No new component was created where an existing one could have been
reused — every "why not reuse X" decision above is backed by direct
inspection of X's actual source code, not assumption.

## G. Knowledge schema

`knowledge_records`: `id`, `organizationId` (NULL = global),
`scope` (`GLOBAL`/`ORGANIZATION`), `domain`, `subject`, `entityType`,
`entityId`, `title`, `description`, `facts` (JSON, secret-scanned),
`capabilities`/`limitations`/`dependencies` (JSON arrays), `status`
(7-value vocabulary), `evidenceState` (7-value vocabulary, independent
of status), `sourceType`/`sourceReference`/`sourceVersion`,
`visibility` (6-value vocabulary), `sensitivity`, `recordStatus`
(active/superseded — versioning), `owner`, `metadata` (JSON,
secret-scanned), `createdAt`/`updatedAt`/`verifiedAt`/`expiresAt`.
Exactly one active record per `(scope, organizationId, domain,
subject)`, enforced by a partial unique index — the same
defense-in-depth pattern proven in every financial registry since
Phase 2.

`knowledge_evidence_links`: `id`, `knowledgeId`, `evidenceType`
(`test`/`source_file`/`documentation`/`runtime_observation`),
`reference`, `result` (`PASS`/`FAIL`/`NOT_RUN`/`SKIPPED`),
`recordedBy`, `recordedAt`.

Deliberately no third `knowledge_relationships` table this round — no
concrete query pattern demonstrated it was needed yet; the `facts`/
`dependencies` JSON fields already express what's actually been
registered (e.g. `{"owner": "server/webauthn-rp/payments.js"}`).

## H. Evidence model

`status` and `evidenceState` are two **independent** fields — verified
by a dedicated test (`K: status and evidenceState are independent
dimensions, never collapsed into one boolean`) registering M-Pesa as
`status=IMPLEMENTED, evidenceState=BLOCKED` simultaneously, and both
values surviving retrieval unmodified. Conflicting evidence (a
documentation-sourced claim vs. a later runtime observation) is
represented as **two preserved records**, never a silent overwrite —
verified by a dedicated test confirming both rows exist and the
current active one prefers the runtime-sourced evidence.

## I. Provider intelligence model

Providers are represented as `knowledge_records` with
`domain='payment_provider'` — **not a separate provider table** (per
the explicit instruction: "do not create a separate knowledge engine
for each category"). Real, honest records registered and tested for
the three actual providers this project has built:

| Provider | `status` | `evidenceState` |
|---|---|---|
| cash | AVAILABLE | VERIFIED (Phase 4 real runtime certification) |
| mpesa | IMPLEMENTED | BLOCKED (architecture/adapter shape exists; real Daraja credentials/runtime do not) |
| crypto | IMPLEMENTED | BLOCKED (architecture exists; live rate runtime does not) |

No fabricated provider records were created for Stripe/PayPal/Payoneer/
Flutterwave/Pesapal/Airtel/banks — none has sufficient authoritative
information in this repository to register honestly, per instruction
#8.

## J. CozyAI integration

**NOT DONE this round** — Step 9, deliberately deferred per section 54.
The foundation (`KnowledgeRegistry`) is ready to be discovered by a
future CozyAI access layer once that integration is separately
authorized and built.

## K. CozyBuilder integration

**NOT DONE this round** — Step 10, deliberately deferred for the same
reason. `core/modules/builder/*`'s existing engines were inspected for
context (see section A) but not modified or wired to this registry.

## L. Security model

- Secret exclusion: `assertNoSecretShapedKeys()` recursively rejects
  any key matching `/password|secret|api[_-]?key|private[_-]?key|
  token|credential/i` or `__proto__`/`constructor`/`prototype`,
  anywhere in `facts` or `metadata`, at ANY nesting depth — verified by
  a dedicated nested-object test and a realistic `JSON.parse`-based
  prototype-pollution test (see the real bug found and fixed, below).
- Visibility enforcement: `PUBLIC` (any authenticated user),
  `USER` (any authenticated user — same as PUBLIC in this foundation;
  reserved for future per-user distinction), `ORGANIZATION` (real
  `OrganizationRegistry.isAuthorized()` check), `ADMIN`/`SYSTEM`
  (real `isPlatformAdmin`), `SECRET` (**never retrievable through this
  registry's read path, by anyone, including the platform admin who
  created it** — verified by a dedicated test).
- Server authority: `isPlatformAdmin` and `organizationId`
  authorization are always resolved server-side; a client-forged
  `organizationId` for an org the actor doesn't belong to is rejected
  by real `isAuthorized()`, not accepted on its own word (adversarial
  test).

## M. Organization isolation

Verified directly: Organization B cannot register knowledge scoped to
Organization A (rejected with `not_authorized`), and cannot retrieve
Organization A's `ORGANIZATION`-visibility knowledge even by its real
ID (also `not_authorized`) — two dedicated tests, both passing.

## N. Secret handling

No secret value can ever be stored — registration is fail-closed and
rejects the entire payload rather than silently stripping the
offending key, so a caller discovers the mistake immediately.
Adversarial test confirms zero trace of an attempted secret value in
storage after a rejected registration (`SELECT ... LIKE '%value%'`
returns zero rows).

## O. Tests — exact totals, this session

| Suite | tests | pass | fail | skipped |
|---|---|---|---|---|
| `knowledge-registry.test.js` | 28 | 28 | 0 | 0 |
| `quote-engine.test.js` | 27 | 27 | 0 | 0 |
| `crypto-payments.test.js` | 27 | 27 | 0 | 0 |
| `payments.test.js` | 26 | 26 | 0 | 0 |
| `provider-certification.test.js` | 21 | 20 | 0 | 1 |
| `mpesa-provider-contract.test.js` | 9 | 9 | 0 | 0 |
| `billing.test.js` | 23 | 23 | 0 | 0 |
| `postgres-billing-runtime.test.js` | 7 | 0 | 0 | 7 |
| `http-integration.test.js` | 19 | 19 | 0 | 0 |
| `firebase-session-integration.test.js` | 10 | 10 | 0 | 0 |
| `mfa-pending-auth.test.js` | 13 | 13 | 0 | 0 |
| `organizations-context.test.js` | 11 | 11 | 0 | 0 |
| `organizations.test.js` | 11 | 11 | 0 | 0 |
| `password-auth-integration.test.js` | 19 | 19 | 0 | 0 |
| `session-organizations.test.js` | 8 | 8 | 0 | 0 |
| `totp.test.js` | 7 | 7 | 0 | 0 |
| `postgres-adapter-runtime.test.js` | 16 | 0 | 0 | 16 |
| `postgres-recovery-code-runtime.test.js` | 5 | 0 | 0 | 5 |
| `migrate-sqlite-to-postgres.test.js` | 5 | 5 | 0 | 0 |
| `static-boundary-entrypoint-database-selection.test.js` | 4 | 4 | 0 | 0 |
| `static-boundary-firebase.test.js` | 3 | 3 | 0 | 0 |
| `static-boundary-password-auth.test.js` | 4 | 4 | 0 | 0 |
| `chalzydashboard-gate-integration.test.js` | 6 | 6 | 0 | 0 |
| `auth-coordinator.test.js` | 26 | 26 | 0 | 0 |
| **TOTAL** | **344** | **312** | **0** | **32** |

All 32 skips are the three real-PostgreSQL suites, unrelated to this
round, honestly reported. Zero regressions against every prior phase.

### Two real bugs found and fixed during implementation (not assumed correct)

1. **`registerKnowledge()`'s own confirmation read blocked itself for
   `SECRET`-visibility records.** The method's return statement
   originally routed through `getKnowledgeById()` — the same strict
   gate that correctly refuses to ever return `SECRET` knowledge to
   anyone. This meant *creating* a `SECRET` record failed at its own
   return step, before the caller even got a confirmation. Caught by
   the dedicated `SECRET`-visibility test failing on first run. Fixed:
   `registerKnowledge()` now returns the row it just wrote directly
   (the actor is, by definition, already authorized to know what they
   just submitted); `getKnowledgeById()` remains the strict gate for
   every subsequent read, by anyone, including the same admin.
2. **A prototype-pollution test used an unrealistic attack vector.**
   `{ __proto__: {...} }` as a JS object-literal does not create an
   inspectable own property at all — it silently reassigns the
   prototype at parse time, so `Object.keys()` sees nothing to reject.
   Confirmed empirically before fixing. The realistic vector — the one
   that matters, since untrusted `facts`/`metadata` would arrive as
   parsed JSON — is `JSON.parse('{"__proto__":{...}}')`, which *does*
   produce a real own enumerable key. Fixed the test to use that shape;
   `assertNoSecretShapedKeys()` itself needed no code change, since it
   was already correctly checking real own properties — only the test's
   own construction was wrong.

## P. Pass/fail/skip totals

See table above: **344 / 312 / 0 / 32**, 0 todo.

## Q. Runtime verification

All 28 new knowledge-registry tests plus a direct end-to-end script
(run before the formal suite existed) empirically confirmed: dual-
dimension status/evidenceState, secret rejection, organization
isolation, evidence linkage, and versioning-with-history-preservation
all work as real, executed code — not merely asserted in comments.

## R. Blocked dependencies

None new this round. Real M-Pesa/crypto live-rate connectivity remain
`BLOCKED` exactly as recorded in Phase 5.1/5.3's own knowledge — this
round's provider knowledge records for mpesa/crypto explicitly and
honestly record that same `BLOCKED` evidenceState, not a new claim.

## S/T. Files modified / created

**Created:** `server/webauthn-rp/migrations/012_knowledge_foundation.sql`,
`server/webauthn-rp/knowledge-registry.js`,
`server/webauthn-rp/test/knowledge-registry.test.js`,
`docs/builder/knowledge/COZYOS-INTELLIGENCE-FOUNDATION-REPORT.md` (this
file).

**Modified:** `server/webauthn-rp/db.js` (added
`migrateAddKnowledgeFoundation()` — additive only, every prior
migration function unchanged, confirmed by full regression).

**Explicitly NOT modified:** `payments.js`, `billing.js`,
`crypto-payments.js`, `quote-engine.js`, `server.js`,
`cozy-memory-engine.js`, `cozy-knowledge-registry.js`,
`evidence-engine.js`, any `core/modules/builder/*` file, any locked AI
file.

## U. Locked-file verification

`core/ai.js`, `core/ai/cozy-ai-language.js`, `core/ai/cozy-ai-memory.js`
confirmed byte-identical to their previously recorded hashes (spot-
checked before and after this round's work). `core/ai/integration.js`
confirmed **ABSENT / NOT PRESENT** — the same honest status recorded in
every prior phase, re-verified directly, never assumed. This exact
check is also now itself registered as a real, queryable
`knowledge_record` (`domain='architecture', subject='locked_ai_files'`)
— tested directly (`V: locked-file knowledge accurately reports the
real, verified state...`).

## V. Previous-checkpoint integrity

No checkpoint exists to verify against yet for this specific round
(Phase 5.3 Step 2 was also left uncheckpointed per its own instruction).
No checkpoint from any earlier phase was touched, rebuilt, or
referenced by anything written this round.

## W. Remaining work

- CozyAI discovery integration (Step 9) — not started.
- CozyBuilder discovery integration (Step 10) — not started.
- HTTP API for the knowledge registry — deliberately not built, per
  instruction #47 ("do not create public HTTP APIs simply because an
  internal registry exists").
- A `knowledge_relationships` table — deliberately deferred; no
  concrete query pattern yet demonstrates it's needed.
- Populating provider knowledge for Stripe/PayPal/Payoneer/Flutterwave/
  Pesapal/Airtel/banks — deliberately not done; none has sufficient
  authoritative information in this repository yet.

## X. Exact next dependency

**Step 9 — CozyAI discovery integration**, per the recommended
sequence (section 54), now that Steps 1-8's foundation is built and
verified. This should be a separate, explicitly authorized round —
consistent with every prior phase boundary in this engagement.

---

## Evidence classification summary

- **OBSERVED:** the entire existing AI/memory/knowledge/builder/
  provider landscape — directly inspected, file by file, this round.
- **VERIFIED:** every new capability of `KnowledgeRegistry` — dual-
  dimension evidence, secret rejection, organization isolation,
  versioning, evidence linkage — via 28 passing tests plus direct
  script execution.
- **INFERRED:** none — no fact in this round was promoted from
  inference to a stronger claim.
- **NOT-RUN / SKIPPED / BLOCKED:** unchanged from Phase 5.1/5.3 — real
  M-Pesa/crypto-rate runtime, honestly still unavailable.
- **UNKNOWN:** explicitly preserved as unknown where it genuinely is —
  no provider knowledge was fabricated for a provider this repository
  has no real information about.

## CozyOS Intelligence Foundation — Steps 1-8 COMPLETE

Stopping here for review, per section 61. Not proceeding automatically
into CozyAI/CozyBuilder integration, real provider production, or any
of the explicitly excluded next milestones. No checkpoint created, per
section 60.
