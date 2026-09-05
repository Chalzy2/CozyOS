# Rule 83 — Universal Builder & Public Knowledge Governance

**Adopted:** this pass, from the owner-provided document `CozyOS —
Universal Builder, Repair & Public Knowledge Governance` (Master
Prompt + Public Vision & African Motivation Addendum), classified per
that document's own Section 8 as **GOVERNANCE**, **PUBLIC KNOWLEDGE**,
**PRODUCT VISION**, **LANGUAGE REQUIREMENT**, and **OWNER-PROVIDED
FACT**. No **PRIVATE INFORMATION** was found in it requiring exclusion
— the owner's personal/family story is explicitly marked in the source
document's own Appendix B as approved for public-story use.

**Relationship to existing rules — this rule does not replace them:**
This document substantially restates, in different words, principles
this repository had already independently adopted as binding rules
before this document arrived:
- Its "Core Builder Commandment" (§2) and "Universal Repair Path" (§4)
  match Rule 62 (Repair Queue)/Rule 69 (Repository Authority)'s own
  FIND → FIX → RECORD → TEST → PACKAGE discipline.
- Its "No-Fabrication Rule" (§6) and state vocabulary (`AVAILABLE`,
  `NOT_READY`, `PARTIALLY_VERIFIED`, `NOT_TESTED_LIVE`, etc.) match
  Rule 81's own Fact Safety language and this repository's established
  practice since RP-024.
- Its "Repair Record" (§19) and "Universal Final Report" (§22) match
  Rule 81's REPAIR ID/FIND/FIX/TEST/PACKAGE structure, already in use.
- Its "Testing & Packaging" (§20) and "Free-Account Finalization Rule"
  (§21) match Rule 25 (Builder Stop Gate) and Rule 26 (Repair Output).
- Its Rule 82 reference (§16) is this repository's own Rule 82
  (`27-language-availability-verification-rule.md`), verbatim.

Where this document adds real, new obligations not previously codified
here, they are recorded below as this rule's own additions. Where it
restates an existing rule, that existing rule remains authoritative and
is cross-referenced rather than duplicated.

## New obligations this rule adds

### 1. Document classification on intake (§8)
When supplied with a PDF, DOCX, screenshot, message, or other evidence,
a Builder must first classify the material as one or more of:
**GOVERNANCE**, **TECHNICAL REQUIREMENT**, **PUBLIC KNOWLEDGE**,
**LANGUAGE REQUIREMENT**, **REPAIR EVIDENCE**, **PRODUCT VISION**,
**FUTURE ROADMAP**, **OWNER-PROVIDED FACT**, or **PRIVATE INFORMATION**
— before acting on it. Owner-provided public information may be used
in CozyOS public answers. Private credentials, account IDs, phone
numbers, financial details, secrets, and private security information
must never become public knowledge, regardless of how it was supplied.

### 2. CozyOS Public Knowledge scope (§9)
The CozyOS Assistant's eventual public-facing knowledge should cover,
accurately and honestly: what CozyOS is, how it works, its vision, who
created/owns it, what inspired it, what problems it solves, its
community benefits, its honest advantages (never "automatically better
than every existing application" — §13), why it isn't public yet
(verified status only, never an invented launch date — §14),
registration/contribution/authentication, why an account might not
activate, and how it supports African languages. This extends, and
should eventually be implemented through, the same evidence-graded
architecture RP-027's `cozy-knowledge-registry.js` already established
(VERIFIED / PARTIALLY_VERIFIED / NOT_FOUND) — not a new, separate
knowledge system.

### 3. Public Vision & Motivation (§10–§13, Appendix A, Appendix B)
The owner's personal motivation story (door-to-door sales experience;
church/community media-help experiences; the three-fathers framing;
his mother Jane Achieng Owuor, who passed in 2004; the language-barrier
inspiration tied to Pastor Ezekiel's teaching) is **owner-approved for
public-story use**, per the source document's own Appendix B — but
strictly as motivation/context, never as evidence of partnerships,
endorsements, funding, or institutional authority, and never expanded,
inferred, or turned into claims about other named people beyond what
the owner stated. The stated motto is "ABOVE ONLY." The wider vision:
Africa participating in *creating* technology, not only consuming it,
with local languages making technology more understandable and
accessible, and African innovation able to contribute to the wider
world. Appendix A's suggested answer style — purpose first, connect to
verified capabilities, acknowledge limitations honestly, connect to the
African-first community vision — governs how the Assistant should
eventually phrase public answers on these topics.

### 4. Provider State Honesty (§18) — extends Rule 81
`REGISTERED` is not `ACTIVE`. `ACTIVE` is not `READY`. `READY` is not
`LIVE VERIFIED`. On-device AI must disclose runtime/device-capability/
model-installation/first-download/offline-after-install/quality
limitations. Cloud AI must disclose network and credential
requirements. No fake API keys, no fabricated `ONLINE` states — this
is the same discipline `cozy-knowledge-registry.js`'s evidence-state
methods and `ProviderManager.healthReport()` already apply; this
section makes it an explicit, named rule for any future provider work.

### 5. Language Policy target list (§15) — **RESOLVED by owner, this
pass: 17 default language targets, Somali preserved**
The source document's §15 listed 12 languages and, read literally,
appeared to omit Somali — which would have silently demoted an
already-`AVAILABLE`, RP-027-verified language. The owner has since
confirmed, explicitly, that this was not the intent:

**Authoritative default language target list — 17 languages:**
English, Kiswahili, French, Arabic, **Somali**, Russian,
Chinese/Mandarin, Hausa, Yorùbá, Luo, Kikuyu, Kikamba, isiZulu.

Owner's stated reasoning, recorded verbatim:
- This is 5 (already-shipped defaults, Somali included) **plus** 8
  new target languages (Russian, Chinese/Mandarin, Hausa, Yorùbá, Luo,
  Kikuyu, Kikamba, isiZulu) — not a replacement of the 5.
- Russian and Chinese/Mandarin are **intentional** additions: the
  project's goal has expanded from African-first to **Africa-first
  with broader global accessibility** — African-first remains the
  center of the vision, not the exclusive scope.
- The language *roadmap* (target list) and the actual *registry
  runtime state* must remain two separate things. A language is
  `AVAILABLE` only after it independently satisfies Rule 82 — being
  named on this 13-language target list is not itself evidence of
  readiness, exactly as Rule 82 already requires for every other
  roadmap item in this repository.

**Actual registry state, confirmed unchanged by this resolution:**
- `AVAILABLE` (5, unchanged since RP-027): English, Kiswahili, French,
  Arabic, **Somali**. RP-027 already verified Somali — this
  resolution explicitly preserves that, rather than silently
  dropping it.
- `NOT_READY` (6, unchanged since RP-027; RP-028 additionally
  confirmed Luo specifically cannot yet satisfy Rule 82): Luo, Kikuyu,
  Kikamba, isiZulu, Luganda, Igbo.
- **Not yet present in the registry at all** (new to this 13-language
  target list, no placeholder entry exists yet): Russian,
  Chinese/Mandarin, Hausa, Yorùbá. Adding `NOT_READY` placeholder
  entries for these four (mirroring how Luo/Kikuyu/Kikamba/isiZulu/
  Luganda/Igbo are already registered) is a reasonable, low-risk next
  step — it is pure registry metadata, not a promotion — but is a code
  change and was not made as part of this documentation resolution;
  it remains open for a future session to Compose explicitly.

No Builder may treat any of the 13 target-list languages as
`AVAILABLE` on the strength of this list. Each requires its own
independent Rule 82 verification pass — exactly as RP-028 already
demonstrated for Luo.


## Cross-reference

Full source text preserved for reference:
`docs/builder/knowledge/cozyos-public-vision-and-language-policy.md`
(this pass) — the public-knowledge/vision/language-policy content
(§8–§16, Appendix A, Appendix B). The builder-process content (§1–§7,
§17–§23) is governed by this rule and the existing rules it
cross-references above, not duplicated into a separate file.
