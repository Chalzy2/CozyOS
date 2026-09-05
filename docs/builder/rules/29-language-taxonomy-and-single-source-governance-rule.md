# Rule 84 — Language Taxonomy & Single-Source Governance

**Adopted:** this pass, at the owner's explicit direction, supplied as
eight structural additions to make **before the next language
implementation** — specifically to stop future Builders from
introducing inconsistencies as the registry grows from 5 languages,
to 13 target languages, to the larger Language Expansion Roadmap
already recorded in `docs/builder/knowledge/repair-queue.md`'s "Not
Yet Composed" section.

**Extends:** Rule 82 (`27-language-availability-verification-rule.md`
— the `NOT_READY` → `AVAILABLE` verification gate) and Rule 83
(`28-universal-builder-and-public-knowledge-governance-rule.md` — the
13-language target list and public-knowledge scope). This rule does
not weaken either — it adds structure Rule 82/83 did not yet specify,
and states one principle that governs all of it.

**Status: policy only.** Nothing in this rule changes
`cozy-language-registry.js`, `cozy-language-templates.js`, or any
other file this pass. Per Rule 69 (Repository Authority) and the same
discipline Rule 83 used for its own §15 resolution, a target list or
policy document is not itself an implementation — these eight items
are binding requirements for whichever future session actually
extends the registry schema, not a description of work already done.

## 1. Three permanent, independent states

Every language must carry three separate fields, never collapsed into
one:

- **Target** — the owner wants this language eventually (roadmap
  membership only; carries no readiness).
- **Registered** — the language exists in the runtime registry, in
  some state (`NOT_READY` / `PARTIAL` / `AVAILABLE` per Rule 82).
- **Available** — fully verified under Rule 82's five conditions.

Permitted path:

```
TARGET → REGISTERED (NOT_READY) → REGISTERED (AVAILABLE)
```

Forbidden:

```
TARGET → AVAILABLE
```

skipping Registered entirely, or treating Target-list membership as
itself Registered or Available (Rule 82 already forbids the second
half of this; this section names the first half explicitly so
"on the roadmap" and "in the registry" are never conflated either).

## 2. Country/region mapping, not country = language

Store which countries/communities a language is useful in, as
metadata separate from the language entry itself — a many-to-many
relationship, not a lookup that implies one country has one language.
Examples the owner supplied, to seed this mapping when it is built:

Hausa → Nigeria, Niger, Ghana; Yorùbá → Nigeria, Benin, Togo; Amharic
→ Ethiopia; Oromo → Ethiopia, Kenya; Somali → Somalia, Ethiopia,
Kenya, Djibouti; Zulu → South Africa; Luo → Kenya, Tanzania; Kikuyu →
Kenya; Kikamba → Kenya; Luganda → Uganda; Igbo → Nigeria; Russian →
Russia and Russian-speaking communities; Mandarin → China and global
Chinese-speaking communities.

This is metadata for `suggestFromCountry()`-style advisory logic
(already advisory-only per the registry's existing header comment) —
it must never become a claim that a country speaks only one language.

## 3. Variants/dialects as metadata, not premature new languages

Do not create a separate language entry for every dialect. Record
variants as metadata on the parent language entry first. Named
examples to anticipate: Kiswahili (Kenya/Tanzania variants), Arabic
(Modern Standard Arabic + regional variants), French (regional African
French), English (Kenyan/African English considerations), Chinese
(Mandarin/Simplified Chinese initially). A variant only becomes its
own registry entry if a future session deliberately Composes that as
a real decision — not as a side effect of adding metadata.

## 4. Script and direction as first-class registry fields

The registry must eventually record, per language: `script`,
`direction` (`LTR` | `RTL`), and `locale` — not just a language code
and name. This is required so Arabic (and any future RTL language) is
never handled as English text with a translated string substituted
in; RTL rendering must be verified per Rule 82 condition 5, which
already requires checking RTL rendering explicitly where a browser/DOM
runtime is available.

## 5. Offline-resource state, separate from conversational availability

Because CozyOS is offline-first, track these as independent states,
not folded into the single `AVAILABLE` flag:

- language templates installed
- extended language pack available
- pronunciation/audio pack available
- offline knowledge pack available
- online expansion available

A language can be conversationally `AVAILABLE` (Rule 82 satisfied)
while its offline voice pack is still unavailable — that must be
representable, not forced into a single true/false state.

## 6. Voice is verified separately from text

A language must never be marked voice-capable merely because its text
templates pass Rule 82. Each language needs its own, separate
verification for:

```
Text → Speech
Speech → Text
Conversational response (voice round-trip)
```

Each of these is its own Rule-82-style claim, with its own evidence,
never inferred from the others.

## 7. Public-answer knowledge lives in one place, languages render it

The public CozyOS questions (who created it, who owns it, what
inspired it, what its vision is, how it benefits the community, why
use it, why it isn't public yet, how people can contribute — the same
set Rule 83 §9 already scopes) must be authored once, in the public
knowledge source, and rendered per language — never re-authored as
independent copies inside each language's template file.

```
one verified fact → 17 language renderings         (required)
17 independent copies of the fact                   (forbidden)
```

This is the same evidence-graded pattern
`cozy-knowledge-registry.js` (RP-027) already uses for
VERIFIED/PARTIALLY_VERIFIED/NOT_FOUND facts — this section extends
that pattern to say language templates must consume it, not restate
it.

## 8. Public Story is a distinct, bounded export of Governance knowledge

Maintain two explicitly separate bodies of knowledge:

- **CozyOS Public Story** — owner-approved, matches Rule 83's document
  classification for content safe to say to ordinary users (per Rule
  83 §1's intake classification and §10–§13's Public Vision &
  Motivation scope).
- **Internal Builder/Governance information** — repair IDs, registry
  internals, security architecture, credentials, Builder governance
  rules themselves.

The Assistant must only ever draw on the Public Story export when
answering ordinary users. This is Rule 83 §1's PRIVATE INFORMATION /
PUBLIC KNOWLEDGE classification applied specifically to what the
conversational layer is allowed to surface — not a new classification
scheme, a narrower operational boundary on an existing one.

## The governing principle (binding on all eight sections above)

**Facts have one authoritative source; languages translate/render the
fact, they do not become separate sources of truth.**

This is the same principle Rule 82 already applies to templates (no
uncontrolled machine translation standing in for a verified string)
and Rule 83 already applies to public knowledge (evidence-graded,
sourced from real repository state) — this rule states it once,
explicitly, as the permanent design constraint for the language system
as a whole, so it does not need to be independently rediscovered each
time the registry grows from 5 languages, to 13, to 17, to the full Language
Expansion Roadmap.

## What this rule forbids, explicitly

- Adding a `state` field that conflates Target, Registered, and
  Available into one value.
- Treating a country name as if it implied exactly one language, or
  vice versa.
- Creating a new top-level language entry for a dialect/variant before
  a session deliberately Composes that as its own decision.
- Shipping RTL text (or any script) without recording `script` /
  `direction` / `locale` on that language's registry entry.
- Marking a language's offline pack, voice pack, or knowledge pack
  "available" because the language itself is `AVAILABLE` under Rule
  82 — each must be independently verified.
- Marking any language voice-capable because its text templates pass
  Rule 82, without separate text→speech / speech→text / conversational
  round-trip verification.
- Hardcoding a public-answer fact (founder, vision, ownership, etc.)
  separately inside more than one language's template file, rather
  than rendering it from one authoritative source.
- Exposing internal Builder/Governance detail (repair IDs, registry
  internals, security architecture, credentials) through any
  language's public-facing conversational output.

## Recording

Any future session that begins implementing this taxonomy (schema
changes to `cozy-language-registry.js`, a new country-mapping table, a
`script`/`direction`/`locale` field, offline-pack states, voice
verification, or a public-knowledge single-source refactor) must open
it as its own Repair Queue item (Rule 62), Compose before implementing
(Rule 50/59), and record per Rule 82/83's existing evidence discipline
— never as a silent side effect of an unrelated language-availability
pass.
