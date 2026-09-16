# RP-037 — Conversation State Propagation + Reference Resolution

## Audit
Searched core/modules/conversation, core/modules/intelligence, core/context
for any existing mechanism carrying information between turns of
`rule-based-conversational-provider.js`'s `think(text, options)`. Found
none: every call is stateless (fresh classification, fresh reply, nothing
returned that a caller could feed into the next call). This is the
concrete missing dependency behind every fluency gap listed in the task
(reference resolution, correction handling, clarification, etc.) — none
of them are possible without it.

## Implementation (one increment)
- `think(text, options)` now accepts an opaque `options.conversationState`
  and returns an updated `result.conversationState` every call.
- When the current utterance is one of a small, disclosed set of bare
  anaphoric follow-ups ("open it"/"open that", Kiswahili "ifungue"/"fungua
  hiyo"/"fungua ile") AND the previous state recorded a resolved
  application from an app-launch turn, the follow-up resolves to that same
  application (`result.contextResolved = true`).
- Never overrides an utterance that names its own application.
- Clears the remembered application the instant the topic changes (no
  indefinite stale reference).
- No existing intent, pattern, or reply text changed; behavior is
  identical for any caller that doesn't pass `conversationState`.

## Files changed
- core/modules/intelligence/providers/rule-based-conversational-provider.js (modified)
- core/modules/intelligence/providers/tests/rule-based-conversational-provider-rp037-context-followup.test.js (new)

No other file touched — see RP037-BYTE-DIFF.diff and RP037-CHANGED-FILE-HASHES.txt.

## Human importance
Right now, a person who says "Fungua QuarryOS" and then "ifungue" gets
treated as if the second message came out of nowhere — a real,
disclosed conversational assistant has to survive at least the most basic
follow-up without asking the person to repeat themselves. Kiswahili
speakers are treated identically to English speakers here, first-class,
not as an afterthought. This is small and honest: it resolves one
specific referent (a just-named application), not general pronouns, and
it is documented in cozy-knowledge (see existing kiswahili-human-purpose
test suite) rather than inventing a second explanation system.
