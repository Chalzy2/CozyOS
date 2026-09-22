# CozyOS Universal Native Multilingual Intelligence — Master Specification Addendum

This addendum extends the master specification audited in `MULTILINGUAL-INTELLIGENCE-AUDIT.md` and carried forward into the Wave-based Cognitive-to-Answer Contract work (see `WAVE1-COGNITIVE-TO-ANSWER-CONTRACT-REPORT.md`). It adds two new, coordinated rule sets: **Native Dynamic Response Construction** (items 57–68) and **Cozy Voice, Animation & Presentation Continuity**. Both are additive to the existing architecture — neither retires, replaces, or duplicates any existing engine, contract, or Live Window mechanism described elsewhere in this repository's documentation.

Status: specification only. No implementation in this repository currently satisfies every rule below — `PRE-EXISTING-FAILURE-REGISTER.md` §3.5 already documents one concrete, real gap (`cozy-language-templates.js`'s entity-agnostic semantic-answer intro frames) that item 58 below directly names as the kind of problem this section exists to fix. Implementation is future, separately-authorized wave work.

---

## Part A — Native Dynamic Response Construction

### 57. Native Dynamic Response Construction

Cozy must construct its own natural responses from semantic meaning, context, evidence, user goal, conversation history, language, audience, and response mode.

Responses must not depend primarily on a library of fixed, pre-written sentences for ordinary conversation.

Templates may be used where structurally appropriate — such as safety notices, system confirmations, legal requirements, standardized measurements, or highly constrained UI messages — but ordinary conversational answers must be dynamically constructed.

The system should determine:
- what needs to be communicated;
- what can be omitted;
- what should be explained;
- what should be emphasized;
- what order information should appear in;
- how much detail is appropriate;
- how formal or conversational the language should be;
- whether bullets, numbered steps, headings, highlights, examples, tables, or paragraphs are appropriate;
- and how to express the meaning naturally in the user's verified language.

The result must be a coherent, polite, natural response rather than a concatenation of predefined sentences.

### 58. Natural Sentence Construction

Cozy must be able to construct sentences from meaning, not merely select sentences from a rule table.

For example, if the user asks: *"Nina biashara lakini faida yangu iko wapi?"* — Cozy should understand the underlying situation and construct an appropriate response naturally. It should not be restricted to one predetermined response.

The same meaning may legitimately produce different natural sentences depending on: previous conversation; user language; dialect; formality; audience; requested detail; urgency explicitly expressed; available evidence; application data; previous answers.

### 59. Response Presentation Intelligence

Cozy should decide whether an answer is best communicated as: normal paragraphs; bullet points; numbered steps; headings; subheadings; highlighted points; short summaries; tables; checklists; examples; comparisons; warnings; action steps; calculations; expandable/detail sections where the interface supports them.

Do not turn every answer into a large block of text. The structure must serve comprehension.

Examples:

- **Simple question:** "CozyOS is a platform for practical digital tools. You can use it for things such as business management, community applications and multilingual assistance."
- **Planning question:** a short "An easy way to start" heading followed by numbered steps ("Record what you have. Record what you spend. Record each sale. Compare revenue with costs.") and a distinct "Next step: ..." line.
- **Complex explanation:** a "What is happening?" heading, body text, an "⭐ Important:" callout, a "🔒 Security:" callout, and a "Next step:" line.

The structure should be generated according to the response, not fixed per goal.

### 60. User-Controlled Visual Response Preferences

The Live Window should eventually allow users to personalize how Cozy's responses appear.

Possible controls:
- **Background:** light, dark, custom color, system theme.
- **Text:** text color, font size, readable/high-contrast modes, potentially font choice where technically supported.
- **Response design:** compact, comfortable, spacious, conversational, colorful, minimal, accessibility-focused.
- **Information density:** brief, normal, detailed, very detailed.

These preferences affect presentation, not the underlying truth or reasoning. A user changing colors or text size must not create another rendering system for Cozy.

### 61. Generated Response Formatting Must Be Semantic

Do not make the AI generate arbitrary HTML whenever it wants. Instead, Cozy should conceptually construct a structured response object:

```
Response
 ├── summary
 ├── sections
 ├── paragraphs
 ├── bullets
 ├── numberedSteps
 ├── highlights
 ├── warnings
 ├── examples
 ├── tables
 ├── calculations
 └── nextStep
```

Then the existing Live Window renderer can safely convert that structure into the user's chosen visual design:

```
COZY THINKS
      ↓
SEMANTIC RESPONSE STRUCTURE
      ↓
SECURITY VALIDATION
      ↓
LANGUAGE REALIZATION
      ↓
UI RENDERER
      ↓
USER'S VISUAL PREFERENCES
```

This is much safer than letting generated text directly control the page.

### 62. Security Is Part of Response Construction

Before anything reaches the user-facing renderer, Cozy must check that it never unnecessarily exposes: internal filenames; source-code paths; function names; repository structure; internal IDs; hidden architecture; internal database structure; authentication mechanisms; security implementation details; private administrator information; internal test failures; hidden governance mechanisms; secret keys/tokens; internal exception traces.

For example, if someone asks *"CozyOS inajengwaje?"*, Cozy should provide an appropriate user-level explanation of what CozyOS is and how it works without automatically dumping its repository architecture. If someone explicitly asks for developer architecture, the response can become technical according to their authorization/context.

So: **knowledge available to Cozy ≠ knowledge appropriate to expose.** That distinction must be enforced before rendering.

### 63. Security Must Not Depend on Response Wording

Security cannot simply be a rule like "don't say `core/living/foo.js`" — Cozy might construct the same sensitive information differently in different words.

Instead:

```
INTERNAL INFORMATION
       ↓
CLASSIFY
       ↓
ACCESS / PURPOSE CHECK
       ↓
ALLOWED INFORMATION
       ↓
SEMANTIC RESPONSE
       ↓
NATURAL LANGUAGE CONSTRUCTION
```

The **meaning** being exposed must be controlled, not just particular words.

### 64. Natural Language Generation Must Be Independent of the Old Rule-Based Sentence System

The existing rule-based system can remain where it provides useful deterministic behavior, fallback, safety, intent recognition, or verified functionality. But it must not become the permanent ceiling of Cozy's conversational ability.

Cozy should ultimately be able to do:

```
UNDERSTAND
   ↓
FORM MEANING
   ↓
DECIDE WHAT TO SAY
   ↓
CONSTRUCT SENTENCES
   ↓
CHECK GRAMMAR / LANGUAGE
   ↓
CHECK CULTURAL & PRAGMATIC FIT
   ↓
CHECK SECURITY
   ↓
CHOOSE PRESENTATION
   ↓
RESPOND
```

rather than:

```
INTENT
 ↓
LOOK UP RESPONSE TEMPLATE
 ↓
RETURN TEMPLATE
```

That distinction is critical.

### 65. Naturalness Must Be Language-Specific

For every verified language, sentence construction must respect that language's grammar; word order; morphology; verb system; agreement; politeness; register; dialect; idioms; conversational conventions; cultural context.

Cozy should not first construct an English sentence and then translate it. The target is:

```
SEMANTIC MEANING
       ↓
NATIVE LANGUAGE REALIZATION
```

So the same semantic answer could be expressed differently in Kiswahili, Kikuyu, Luo, Kamba, Kalenjin — without forcing all of them through English sentence structures.

### 66. Response Variety Without Loss of Consistency

Cozy should be capable of expressing the same verified information naturally in different ways. But variation must not change facts.

Same evidence + same user goal + same language → different natural wording is acceptable. Different wording → different invented facts is not.

Meaning and evidence must remain stable while linguistic expression can vary naturally.

### 67. Conversational Personality Without Losing Truth

Cozy can be warm; polite; concise; explanatory; encouraging; practical; conversational. But style must never override evidence; security; authorization; uncertainty; truthfulness.

A friendly answer must still say *"Sina taarifa iliyothibitishwa kuhusu hilo"* when Cozy genuinely lacks verified information.

### 68. The Master Response Pipeline

```
USER INPUT
     ↓
LIVE WINDOW
     ↓
LANGUAGE / DIALECT / MODALITY
     ↓
NATIVE LANGUAGE UNDERSTANDING
     ↓
SEMANTIC REPRESENTATION
     ↓
INTENT
     ↓
GOAL
     ↓
SITUATION
     ↓
CONVERSATION CONTEXT
     ↓
COGNITIVE COORDINATION
     ↓
KNOWLEDGE / MEMORY / APPLICATION DATA
     ↓
REASONING
     ↓
RESPONSE MODE
     ↓
WHAT SHOULD BE COMMUNICATED?
     ↓
RESPONSE PLAN
     ↓
SECURITY / PRIVACY / EVIDENCE VALIDATION
     ↓
NATIVE LANGUAGE SENTENCE CONSTRUCTION
     ↓
GRAMMAR / PRAGMATIC VALIDATION
     ↓
RESPONSE PRESENTATION STRUCTURE
     ↓
USER VISUAL PREFERENCES
     ↓
LIVE WINDOW RENDERER
     ↓
USER
```

**Core principle:** Cozy does not retrieve a sentence. Cozy understands meaning, decides what is useful to communicate, constructs the response naturally, validates it, and presents it appropriately. A technically correct paragraph is not necessarily a good human answer — Cozy should be able to decide how to explain something, not merely retrieve information and place it into a paragraph.

---

## Part B — Cozy Voice, Animation & Presentation Continuity

Cozy's voice, visual identity, animations, text presentation, timing, colors, and interaction behavior are one coordinated user experience. Fixes to one part must not accidentally replace, bypass, duplicate, or desynchronize the others.

### B1. Owner/default Cozy voice comes first

The existing Cozy voice is the default owner voice and must remain the initial voice experience.

Lifecycle:

```
New user
   ↓
Cozy default/owner voice
   ↓
Registration
   ↓
User profile established
   ↓
Voice customization becomes available
   ↓
User may select another verified Cozy voice
   ↓
Selected voice becomes that user's preference
```

Do not automatically replace the owner/default voice with another AI provider or random voice.

### B2. User voice customization comes later

After registration, the user may choose from the available Cozy voices — for example: young man, young woman, child, elder, different Kenyan voices, Tanzanian voice, Ugandan voice, other verified regional accents, computer/digital voice, other future Cozy-created voices.

The selected voice is a presentation preference, not a new AI:

```
ONE COZYAI
      +
ONE COGNITIVE CORE
      +
ONE LIVE WINDOW
      +
MANY VERIFIED VOICE REALIZATIONS
```

Changing the voice must never create another assistant, reasoning system, memory system, or language system.

### B3. Voice must follow the language

If Cozy answers in Kiswahili, the selected voice must use an appropriate Kiswahili realization when available. If the user switches language:

```
semantic meaning stays the same
        ↓
language changes
        ↓
voice realization changes appropriately
```

Do not force every African language through an English voice/language pipeline.

### B4. Voice must remain synchronized with the visual experience

Cozy should coordinate: spoken words; displayed text; typing/reveal animation; speaking animation; waveform/audio visualization; avatar/Live Window animation; timing; pauses; transitions; status indicators.

```
THINKING
  ↓
visual thinking state
  ↓
response constructed
  ↓
text appears
  ↓
speech begins
  ↓
speaking animation
  ↓
audio/text progression stays synchronized
  ↓
speech ends
  ↓
speaking animation ends
  ↓
idle state
```

Do not make audio, animation and text independently race each other.

### B5. Preserve existing visual identity

Any implementation must preserve existing: Cozy colors; backgrounds; typography; button styling; animations; transitions; spacing; Live Window design; responsive behavior; accessibility behavior.

Do not redesign the interface simply because a voice feature is being implemented. If a visual change is genuinely necessary, make it additive and verify that the existing visual identity remains intact.

### B6. User customization should be powerful but safe

Eventually the user should be able to customize:

- **Voice:** Cozy default, male, female, child, elder, digital, regional voices, verified accents.
- **Appearance / Background:** existing Cozy background, light, dark, custom background/color where supported.
- **Text:** size, contrast, text color, accessibility settings.
- **Response style:** compact, normal, detailed, colorful, minimal, accessibility-focused.

These are all presentation preferences. They must never change: security boundaries; authorization; factual evidence; cognitive reasoning; application permissions; privacy rules.

**Guiding principle for both Parts A and B:** improve Cozy without destroying what already makes Cozy Cozy. Preserve the original color, animation, timing, style, voice identity and interaction design; extend them rather than replacing them.
