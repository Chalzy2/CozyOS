# CozyOS Public Vision & Language Policy

**Source:** Owner-provided document `CozyOS — Universal Builder,
Repair & Public Knowledge Governance` (Master Prompt + Public Vision &
African Motivation Addendum), Sections 8–16 and Appendices A–B.
Classified per that document's own Section 8: **PUBLIC KNOWLEDGE**,
**PRODUCT VISION**, **LANGUAGE REQUIREMENT**, **OWNER-PROVIDED FACT**.
Governed by Rule 83
(`docs/builder/rules/28-universal-builder-and-public-knowledge-governance-rule.md`).

**Status: reference material for a future public-knowledge
implementation.** Nothing in this file has been wired into
`cozy-knowledge-registry.js` or the conversational provider yet — that
is future work, to be Composed as its own repair, following the same
VERIFIED/PARTIALLY_VERIFIED/NOT_FOUND evidence discipline RP-027
already established, never simply pasted in as unverified prose.

---

## CozyOS Public Knowledge — question scope

The CozyOS Assistant should eventually be able to answer, naturally
and accurately, in public:
- What is CozyOS? How does it work? What is its vision?
- Who created it? Who owns it? What inspired it?
- What problems does it solve? How does it benefit communities?
- What advantages does it have? Why should someone use it?
- Why is it not public yet? How can people register or contribute?
- How does authentication work? Why might an account not activate?
- How does CozyOS support African languages?

## Public Vision & Motivation — owner-provided story

CozyOS was inspired by the owner's experience as a salesperson, moving
door-to-door and meeting ordinary people and customers with different
challenges. Those experiences encouraged the owner to ask how
technology could solve practical problems in people's work and
everyday lives.

The owner's community and church experiences also influenced the idea.
People, including the owner, requested help in Church with media and
technology-related work, including situations where assistance could
sometimes have been offered freely, but existing systems did not
always allow the owner to help in the way he wanted — which led the
owner to think more about being part of the system in God's way.

This contributed to the idea of creating CozyOS as a practical
problem-solving technology platform that can make useful tools,
information, media, and services more accessible to communities.

The owner describes having three fathers in his personal spiritual
understanding: God, unseen; his spiritual father, Pastor Ezekiel, whom
he sees; and his physical father, whom he has not seen since he was
six months old. The owner had to learn how to struggle for a living
when his mother, Jane Achieng Owuor, passed away in 2004, while he was
in pre-primary school (class 3).

The teachings of Pastor Ezekiel and the owner's experiences encouraged
him to think about solving problems tied to language barriers — the
owner felt this was a reason he was created to solve: he was touched
by how people get healed and helped, and the solution he arrived at
was an idea to solve the language-barrier problem, where any community
through CozyOS can select their own language and understand what his
pastor is teaching — a way for the owner to be part of his spiritual
father's mission, making useful teachings and information more
accessible. One important inspiration was the possibility that
teachings and media could be made available through websites or
applications, delivered in people's own community languages.

The owner believes technology can improve African lives and
communities and should not be viewed only as a source of dependence or
destruction. Technology created elsewhere can be used, adapted, and
extended to solve local problems, while Africans also create their own
solutions and contribute new technology to the world.

The owner's stated motto is **"ABOVE ONLY."** The wider vision is that
Africa should participate in creating solutions that bring positive
change to African communities and, ultimately, to the entire world.

**Handling note (Rule 83 / source document Appendix B):** this
personal story is owner-approved for public-story use, strictly as
motivation and context — never expanded, inferred, or turned into
claims about other named people beyond what the owner explicitly
stated, and never presented as evidence of partnerships, endorsements,
funding, or institutional authority.

## Public Motivation for Africa-First Technology

The public story should communicate that CozyOS is motivated by
practical human problems rather than technology for technology's sake.
The goal is to help people access useful technology in ways that
respect their communities, languages, cultures, work, and everyday
realities.

- Technology should solve real community problems.
- African communities should participate in creating technology, not
  only consuming it.
- Local languages can make technology more understandable and
  accessible.
- Technology should strengthen people's ability to work, learn,
  communicate, create, and solve problems.
- African innovation can serve Africa and also contribute solutions to
  the wider world.
- CozyOS should welcome contributors, supporters, developers,
  translators, community experts, and people who want to help build
  useful technology.
- The project should remain honest about what is working, what is
  being built, and what is still unavailable.

## Public Community Benefits

- Greater access to useful digital tools.
- Support for local and community languages.
- Offline-first possibilities where appropriate.
- A platform designed around practical community needs.
- Opportunities for African developers and contributors to
  participate.
- A place where language and cultural knowledge can help shape
  technology.
- Potential applications across education, work, media, communication,
  services, and community problem-solving.
- A long-term goal of building technology that can be useful locally
  while remaining relevant globally.

## Why Someone Might Prefer CozyOS

Public answers must not claim CozyOS is automatically better than
every existing application. Its intended advantages, stated honestly:

- Community-oriented design.
- African-first perspective.
- Strong emphasis on local languages.
- Offline-first and low-connectivity thinking where technically
  supported.
- A unified environment for multiple useful applications.
- A problem-solving rather than purely entertainment-oriented
  philosophy.
- Transparent capability states instead of pretending unavailable
  technology is working.
- An opportunity for communities and contributors to help shape the
  platform.

## Why CozyOS May Not Be Public Yet

When asked why CozyOS is not public, the Assistant must describe only
verified project status — development, testing, security,
authentication, application readiness, language support, deployment
verification, and other release requirements may still be underway.
**It must never invent a launch date.**

Supporters and contributors may be discussed only when publicly
confirmed or explicitly provided by the owner for publication. Never
invent sponsors, investors, partnerships, funding, or endorsements.

## Language Policy

**Authoritative default language target list — 17 languages, resolved
by the owner after this document was first reviewed (see Rule 83 §5
for full detail):** English, Kiswahili, French, Arabic, **Somali**,
Russian, Chinese/Mandarin, Hausa, Yorùbá, Luo, Kikuyu, Kikamba,
isiZulu.

This is the original 5 already-shipped defaults (Somali included,
preserved — not dropped) plus 12 new target languages. Russian and
Chinese/Mandarin are intentional: the project's goal has expanded from
African-first to **Africa-first with broader global accessibility**,
African-first remaining the center of the vision rather than its
exclusive scope.

**The target list and the actual runtime registry state are two
separate things, by design.** Current registry state
(`cozy-language-registry.js`), unaffected by this policy resolution:
- `AVAILABLE` (5): English, Kiswahili, French, Arabic, Somali —
  verified by RP-027.
- `NOT_READY` (6): Luo, Kikuyu, Kikamba, isiZulu, Luganda, Igbo — Luo
  specifically re-confirmed unable to satisfy Rule 82 by RP-028.
- Not yet registered at all: Russian, Chinese/Mandarin, Hausa, Yorùbá
  — adding `NOT_READY` placeholder entries for these is a reasonable
  future step, not yet done.

**Rule 82 governs promotion from `NOT_READY` to `AVAILABLE`** for
every language on this 17-language list, exactly as it does for every
language on the separately-recorded Language Expansion Roadmap
(`docs/builder/knowledge/repair-queue.md`). Appearing on this list is
never itself evidence of readiness.

## Appendix A — Suggested Public Answer Style

When the public asks about CozyOS, answer like a human guide: explain
the purpose first, connect the answer to verified CozyOS capabilities,
acknowledge limitations, and explain how the project aims to serve
people and communities. When discussing the African vision, emphasize
creation, contribution, local languages, practical problem-solving,
community participation, and the belief that African innovation can
contribute to the whole world.

## Appendix B — Public Story Safety

The owner's personal motivation can be presented as part of the public
story when the owner has explicitly approved it (as this document
does). However, personal spiritual or family details should not be
expanded, inferred, or turned into claims about other people. Use the
story as motivation and context, not as evidence of partnerships,
endorsements, funding, or institutional authority.
