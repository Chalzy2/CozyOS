# Domain 4I Dependency #1 — Application/Action-Launch Intent — Checkpoint Report

## 1. Quick Reader
Confirmed the canonical, already-existing application registry:
`window.CozyOS.listApplications()` (`core/registry/cozy-registry.js`'s
`ServiceRegistry`) — the exact same source
`cozy-knowledge-registry.js`'s `listApplicationsFact()` already reads
for the "list-apps" intent. QuarryOS is a real, registered application
(`id: "quarryos", name: "QuarryOS"` in `module-registry.js`).

## 2. Quick Scanner
Ran every required test phrase against the real classifier before
touching code. Result: registration/what-is-cozyos/generic-help all
correctly classified (unaffected, Domain 4D's fix intact); app-launch
phrasing (all 6 required EN+SW variants) fell to `unsupported` in both
languages — a genuine, consistent gap, not a language asymmetry.

## 3. First application/action dependency (evidence-driven)
**No application/action-launch intent rule existed at all.** Not a
registry problem (the registry is real and complete), not a
language-asymmetry problem (both EN and SW were equally unsupported) —
purely a missing intent-classification rule plus the missing
resolution step against the existing registry.

## 4. Implementation
- **New intent rule** `app-launch` (`rule-based-conversational-provider.js`):
  matches `open|launch|start <name>` (EN) and any `fungua`/`kufungua`/
  `nifungulie`-stem + `<name>` (SW). Positioned *after* every specific
  `nav-*` rule (dashboard/notifications/recent/search/aiproviders/
  diagnostics) and *after* `how-to-register` (which owns "fungua
  akaunti"), so those more specific, already-real targets keep winning
  — confirmed by regression test.
- **`extractAppLaunchCandidate()`** + **`resolveApplicationByName()`**:
  extracts the candidate name, resolves it against the real
  `window.CozyOS.listApplications()` registry (case-insensitive exact
  match, then whole-word substring fallback). Returns `null` — never a
  guess — when nothing matches or the registry isn't loaded.
- **`composeReply()`** case + real EN/SW/FR/AR/SO templates: honestly
  reports the resolved application name *without* claiming it was
  opened, or honestly asks for the exact name when unresolved.
- **`think()`**: adds `application` and `requiresAuthorization` fields
  to the result, **only** for the `app-launch` intent (no unnecessary
  fields for any other intent — confirmed by test).
- **No new registry, no new authorization mechanism, no navigation
  performed anywhere in this change.**

## 5. Kiswahili results
| Phrase | Intent | Application |
|---|---|---|
| "Nifungulie QuarryOS." | `app-launch` | `{id:"quarryos", name:"QuarryOS"}` |
| "Nataka kufungua QuarryOS." | `app-launch` | `{id:"quarryos", name:"QuarryOS"}` |
| "Fungua QuarryOS." | `app-launch` | `{id:"quarryos", name:"QuarryOS"}` |

## 6. English results
| Phrase | Intent | Application |
|---|---|---|
| "Open QuarryOS." | `app-launch` | `{id:"quarryos", name:"QuarryOS"}` |
| "I want to open QuarryOS." | `app-launch` | `{id:"quarryos", name:"QuarryOS"}` |
| "Launch QuarryOS." | `app-launch` | `{id:"quarryos", name:"QuarryOS"}` |

## 7. Negative/ambiguous results
- "QuarryOS ni nini?" / "Je, QuarryOS ipo?" / "Naweza kutumia QuarryOS?"
  — **none** classify as `app-launch` (no action verb present) —
  confirmed correct exclusion of informational questions.
- "Fungua programu yangu." (open my app, no name given) — correctly
  classifies as `app-launch` **with `application: null`** and an honest
  "couldn't find" reply — never invents a target.
- A genuinely nonexistent application name — resolves to `null`, never
  a fabricated match.

## 8. Authorization boundary
Every resolved `app-launch` result carries `requiresAuthorization: true`
and the reply text explicitly states authorization still needs to be
checked — confirmed no reply ever claims the app "has been opened" or
similar. No navigation, no session/permission check, and no action
execution happens anywhere in this classifier — it only recognizes and
resolves. This matches the domain's own required
`USER REQUEST → INTENT RECOGNITION → APPLICATION RESOLUTION →
AUTHORIZATION/POLICY → ACTION EXECUTION` separation; only the first two
stages exist here.

## 9. Continuous-learning implication (recorded, not built)
Not required by this dependency. Recorded for the architectural record:
a future controlled learning mechanism could treat a user's correction
after an unresolved `app-launch` reply (naming the actual intended app)
as authorized evidence for improving future name matching — no such
mechanism exists yet, and none was built here.

## 10. Regression counts
| Suite | Result |
|---|---|
| New: `rule-based-conversational-provider-domain4i-app-launch.test.js` | 16/16 pass |
| Updated: `rule-based-conversational-provider-domain4d-intent.test.js` (2 stale assertions corrected to reflect the real, improved behavior) | 10/10 pass |
| Existing: rule-based-conversational-provider (6 pre-existing suites) | pass, no regressions |
| Domain 4A dependency-linked | pass |
| Domain 4B dependency-linked | pass |
| Domain 4C real-path + Gemini adapter | pass |
| **Combined this verification** | **75/75 pass** |
| living-assistant (checkpoint-K, reply) re-check | 2/2 pass |

Two Domain 4D test assertions were updated (not silently ignored) because
the underlying behavior genuinely, correctly improved: "Fungua QuarryOS."
now correctly resolves to `app-launch` instead of remaining
`unsupported`, and "Fungua mipangilio yangu." (settings) is now honestly
recognized as an unresolved action request rather than a bare
"unsupported" — both are real improvements, documented inline in the
updated test file.

## 11. Status
First application/action-launch dependency built, tested, and verified
in both reference languages. Broader Application Awareness (full app
directory browsing, category filtering, actual navigation execution,
authorization enforcement) remains future work — this is explicitly
only the first dependency, not full Domain 4I.

## 12. Checkpoint
Repository files changed — checkpoint created and verified below.

## 13. Next dependency (exactly one)
**Real authorization/action-execution wiring does not exist** — even
though `app-launch` now correctly resolves an application ID, nothing
in this codebase yet connects that structured result to a real
authorization check (e.g., is this user actually permitted to open
QuarryOS?) and a real navigation action (e.g., `WorkspaceShell`'s own
existing app-launch mechanism). This is the next concrete gap: wiring
`{intent:"app-launch", application, requiresAuthorization:true}` into
an existing, real action-execution layer that performs the actual
authorization check before navigating — never let the classifier or
any AI component make that decision itself.
