COZYOS REPAIR — SINGLE-PATH REPAIR PROMPT

You are continuing an existing CozyOS engineering repair.

IMPORTANT:
This repair may run across multiple Builder sessions/accounts. Do NOT
spend the session writing a design document when the repair scope is
already known. Do NOT create multiple solution paths. Do NOT ask the
user to choose between implementation approaches unless a genuine
repository ambiguity blocks implementation. Do NOT modify unrelated
files.

Your entire workflow is:

FIND → FIX → RECORD → TEST → PACKAGE

==================================================
0. BASELINE FIRST
==================================================

Use the latest verified CozyOS ZIP as the ONLY repair baseline (the
RP-026-repaired ZIP, not any earlier one).

Before changing anything:

- inspect the ZIP;
- read LATEST.md;
- read HANDOFF.md (its CONTINUATION POINT names "expanding RP-026's
  own intent set" as open, unstarted future work — this repair is
  that work, scoped and expanded by the repository owner);
- read docs/builder/knowledge/repair-queue.md and
  repair-history-registry.md (RP-026's full record — read it, do not
  re-derive it);
- read core/modules/intelligence/providers/rule-based-conversational-provider.js
  in full before changing anything in it;
- read core/modules/intelligence/providers/tests/rule-based-conversational-provider.test.js
  in full;
- verify repository integrity (SHA-256, per the repository's own
  canonical method — note DI-005's `-print0`/`-z`/`-0` filename-with-spaces
  fix before trusting any hash).

Do not assume RP-026's design decisions were wrong. They were not —
the registration/activation/composition-around-CognitiveCoordinator
pattern is confirmed correct and stays as-is. This repair extends
INTENT_RULES/composeReply(), it does not replace the architecture.

==================================================
1. OBJECTIVE
==================================================

Repair and extend the existing RP-026 rule-based conversational
provider so the CozyOS Assistant can answer a substantially broader
set of questions about CozyOS itself, while remaining completely
honest about information that is not actually present in the
repository.

The Assistant must understand questions such as:

Who created you? / Who created CozyOS? / Who is the founder? / Who
owns CozyOS? / What is CozyOS? / What can CozyOS do? / What apps are
available? / How do I register? / How do I log in? / Why is my
account not active? / Why is authentication failing? / What happens
during authentication? / Why is my phone not verified? / How does
phone verification work? / Why did my verification fail? / What
happens after registration? / How do I activate an account? / What is
the Control Center? / What are AI Providers? / What does NOT_READY
mean? / Why is an AI provider disabled? / What does ONLINE mean? /
What does ACTIVE mean? / What apps/services are installed? / How do I
find an app? / What does a particular CozyOS feature do? / What is
CozyOS Enterprise? / What is the difference between an app, provider,
engine, module, and service?

Plus: help, greetings, thanks, identity, founder/creator, ownership,
registration, authentication, account status, applications,
providers, features, diagnostics, and general CozyOS navigation
questions.

The existing RP-026 behavior (greeting-morning/afternoon/evening/
generic, thanks, identity, help — English) must remain intact and
regression-tested.

==================================================
2. FIND
==================================================

Inspect the latest verified CozyOS ZIP/baseline first. Read:

- LATEST.md, HANDOFF.md, RELEASES.md
- docs/builder/knowledge/repair-queue.md,
  repair-history-registry.md
- docs/builder/rules (Builder rules currently in force)
- RP-026's implementation and tests (named above)
- existing CozyOS identity/founder/ownership information, wherever it
  actually lives in the repository (e.g. cozy-ai-identity.js, README,
  founder/ownership records)
- application/module/provider registries (ProviderManager, LivingAI,
  application manifests under applications/*)
- authentication and registration engines (core/security/*)
- phone verification logic
- account-status logic
- relevant dashboard/control-center resources

Determine which answers are actually supported by repository
evidence. Do not invent missing facts. Create a structured knowledge
source from facts already present in CozyOS (an additive data/registry
file — do not scatter literals through the composer).

==================================================
3. FACT SAFETY RULE
==================================================

The conversational provider must distinguish four evidence states for
every CozyOS-fact answer:

**VERIFIED** — a fact directly supported by the repository.
Example: "CozyOS was created by [verified founder information from
repository]."

**PARTIALLY VERIFIED** — only part of the requested information
exists. Example: "CozyOS identifies its founder as X, but the
repository does not establish a separate legal owner."

**NOT FOUND** — the repository contains no authoritative answer.
Example: "I don't have a verified answer for the owner of CozyOS in
my current knowledge."

**NOT A CAPABILITY** — the user asks for something CozyOS does not
actually implement. Example: "That feature is not currently
implemented in this CozyOS build."

Never convert absence of evidence into a positive claim.

==================================================
4. CONVERSATIONAL INTENT EXPANSION
==================================================

Extend RP-026 with structured intent families. At minimum implement:

- Core conversation: greeting, thanks, identity, help
- CozyOS identity: who-created-assistant, who-created-cozyos, founder,
  owner, organization, what-is-cozyos, what-is-cozyos-enterprise
- Applications: list-apps, find-app, app-purpose, app-availability,
  app-installation, app-status
- Registration: how-to-register, registration-requirements,
  registration-failed, registration-pending, registration-complete,
  account-created
- Authentication: how-authentication-works, authentication-failed,
  authentication-pending, phone-verification, phone-verification-failed,
  phone-verification-pending, trusted-device, biometric-login
- Account: account-not-active, account-status, account-activation,
  account-disabled, account-pending, login-problem, logout
- Providers: what-is-provider, list-providers, provider-status,
  provider-not-ready, provider-disabled, provider-online,
  provider-active, provider-activation
- CozyOS architecture: engine, module, service, provider,
  control-center, dashboard, diagnostics, synchronization,
  offline-capability
- Feature questions: feature-availability, feature-explanation,
  how-feature-works, why-feature-unavailable
- Navigation/help: where-is-feature, how-to-use, dashboard-navigation,
  control-center-navigation

The intent matcher may use keyword/pattern matching, but must avoid
accidentally classifying unrelated questions as CozyOS facts (mirror
RP-026's existing "most specific pattern first, `unsupported` as the
honest default" discipline).

==================================================
5. RESPONSE COMPOSER
==================================================

Keep the existing RP-026 rule-based architecture (registerProvider()
into LivingAI's existing extension point, composition around
CognitiveCoordinator.run(), explicit activateExplicitly() as its own
disclosed step). Do not replace it with a fake LLM.

Each intent must map to a verified response/template. The response
may incorporate live repository/runtime state where that state is
genuinely available (e.g. real ProviderManager health, real
application registry contents).

Example:
User: "Who made you?"
Assistant: "I'm the CozyOS Assistant. I was built as part of CozyOS.
My verified founder/creator information is [repository-backed
information]."

If the repository does not contain the creator:
"I'm the CozyOS Assistant. I was built as part of CozyOS, but I don't
currently have a verified record of the individual who created me."

Never guess.

==================================================
6. APPLICATION QUESTIONS
==================================================

The Assistant must no longer respond to "I want to see the apps" with
the RP-026 generic fallback. Instead, inspect the real application
registry/resource/application center and return the applications that
are actually available.

If the application registry is unavailable: "I can help you find the
CozyOS apps, but the application registry isn't available right now."

Never fabricate an application list.

==================================================
7. ACCOUNT/AUTHENTICATION QUESTIONS
==================================================

Responses must be grounded in the actual authentication/account
engines. For example, "Why is my account not active?" should inspect
available state and explain the actual state where possible: pending,
inactive, disabled, unverified, authentication incomplete, phone
verification incomplete, trusted device required, synchronization
pending.

If the current user state cannot be accessed: "I can explain the
possible account states, but I can't see enough verified account
information to tell you exactly why this account is inactive."

Do not pretend to inspect private account state the provider cannot
actually access.

==================================================
8. FIVE DEFAULT LANGUAGES
==================================================

The default language registry must contain exactly these five
first-class languages: English (en), Kiswahili (sw), French (fr),
Arabic (ar), Somali (so).

Every supported intent must have verified responses for these five
languages before the language is marked READY.

==================================================
9. EXTENDED LANGUAGES
==================================================

Add an extended language registry containing: Luo (luo), Kikuyu (ki),
Kikamba (kam), Zulu (zu), Luganda (lg), Igbo (ig).

Extended languages must be selectable by the user. They must not be
presented as fully supported merely because a language code exists.
Use explicit states: AVAILABLE, PARTIAL, NOT_READY. Only mark a
language AVAILABLE after its responses have been verified.

==================================================
10. LANGUAGE SELECTION
==================================================

Implement a language-selection mechanism that supports:

**Automatic/default selection** — use the user's country/locale when
reliable (e.g. Kenya → Kiswahili/English, France → French, Somalia →
Somali, Arabic-speaking locale → Arabic). Country must never
permanently lock the language.

**Manual selection** — the user must be able to choose another
language from: English, Kiswahili, Français, العربية, Soomaali, Luo,
Kikuyu, Kikamba, isiZulu, Luganda, Igbo.

The user's explicit selection takes precedence over automatic country
detection.

==================================================
11. TRANSLATION HONESTY
==================================================

This is critical. Do not use an uncontrolled translation call and
assume the result is correct. Each important CozyOS response should
have a verified language template. Tests must confirm: intent is
correct, language is correct, response is non-empty, critical CozyOS
terminology is preserved, unsupported translations are not silently
invented.

For technical terms where translation would reduce accuracy, preserve
the official CozyOS term and explain it in the selected language.

==================================================
12. DEFAULT LANGUAGE FALLBACK
==================================================

If a requested language is unavailable, do not silently produce bad
machine-translated text. Return the safest available language
response and clearly identify the fallback.

Example: "I don't yet have a verified Kikamba response for this
question. I can answer it in English or Kiswahili."

==================================================
13. TESTING
==================================================

Expand the RP-026 tests. Every intent must be tested against the five
default languages. Minimum test matrix (Intent × language):

greeting, identity, creator, apps, registration, authentication,
phone verification, account status, provider status — each × EN, SW,
FR, AR, SO.

Then test the six extended languages.

Tests must explicitly detect: wrong language, empty response,
fabricated fact, incorrect intent, fallback leakage, English-only
response when another language was requested, accidental activation
of providers, regression of RP-024, regression of RP-026.

==================================================
14. NO LOCKED-FILE VIOLATION
==================================================

Do not modify: core/living/cozy-living-assistant.js,
cognitive-coordinator.js, cozy-intelligence-provider.js,
core/config.js, or any other locked file recorded by the current
repair baseline — unless the existing repair rules explicitly
authorize it. Prefer additive provider/knowledge/test files.

==================================================
15. FIND → FIX → RECORD
==================================================

When a problem is found:

**FIND** — record exact file, exact cause, evidence, affected
intent/language, whether it is a real bug, missing capability, or
honest limitation.

**FIX** — make the smallest additive repair that satisfies the
requirement.

**RECORD** — update the repository's real repair records. Do not
create loose documentation outside the repository.

==================================================
16. OUTPUT RULE
==================================================

Per Rule 81 (docs/builder/rules/26-repair-output-rule.md): standalone
outputs are only complete ZIP / .js / .html / .css — no standalone
.md files delivered outside a ZIP. Inside the ZIP, all documentation
must remain at its real repository paths: HANDOFF.md, LATEST.md,
RELEASES.md, repair history, repair queue, this repair prompt, test
reports, knowledge records.

==================================================
17. REGRESSION REQUIREMENT
==================================================

Before completion: run existing RP-024 tests; run RP-026 tests; run
all new RP-027 tests; syntax-check every changed JS/HTML file; verify
script loading order; verify no duplicate script tags; verify no
unrelated modifications; verify locked files are byte-identical;
verify ZIP contents; calculate repository/package integrity hashes.

==================================================
18. NO FABRICATION COMPLETION RULE
==================================================

The Builder must not force RP-027 to COMPLETE if a required fact or
translation cannot be honestly verified. Valid final states:

- **COMPLETE**
- **PARTIAL** — verified limitations recorded
- **BLOCKED** — required repository evidence missing

A blocked/partial result must still be packaged and recorded so the
next Builder can continue.

==================================================
19. FINAL HANDOFF
==================================================

Before stopping, update HANDOFF.md with: RP-027 status, files
changed, tests performed, test results, languages completed,
languages remaining, known limitations, exact continuation point, ZIP
name, integrity hash, next repair action. Then package the complete
repository ZIP.

Also add a new dated entry to
docs/builder/knowledge/repair-history-registry.md (do not overwrite
RP-026's entry), and update docs/builder/knowledge/repair-queue.md
(RP-027 row) and LATEST.md's top session summary, matching the
convention every prior repair entry in this repository already
follows (REPAIR / FIND / OWNER / ROOT CAUSE / FIX / FILES CHANGED /
TESTS / INTEGRITY / DEPENDENCIES / STATUS / REMAINING WORK /
CONTINUATION POINT).

**SESSION CANNOT END WITHOUT A VERIFIED, DELIVERED ZIP** (Rule 80) —
"delivered" means the person has actually received the file, not
merely that it was built on disk.

==================================================
CORE RULE FOR THIS REPAIR
==================================================

CozyOS must become better at answering questions, not better at
pretending to know answers.

The five default languages are English, Kiswahili, French, Arabic and
Somali. The extended six are Luo, Kikuyu, Kikamba, Zulu, Luganda and
Igbo. Users can select their language manually, while country/locale
may provide the initial suggestion.

==================================================
20. CURRENT REPAIR
==================================================

The current repair target is:

RP-027 — CozyOS Conversational Knowledge + Multilingual Response
Expansion

Baseline: the RP-026-repaired ZIP (this repair's own predecessor —
read its record before starting, do not redesign it).

Do not create another design phase. Do not branch. Do not stop at a
report. Start NOW with:

FIND → FIX → RECORD → TEST → PACKAGE
