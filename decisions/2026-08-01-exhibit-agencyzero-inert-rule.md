# Exhibit: spec-guided review finds a live capability-escalation bug (AgencyZero)

**Date:** 2026-08-01
**Actors:** AgencyZero (host application, Rust, owns the task store; "az-gui") and Claude Code
(claude-opus-5, guest agent spawned as a subprocess). The guest agent was given the PS repo
at ~/code/promptsyntax.org mid-task and asked, cold, whether any of it helped.
**Source:** 93-turn working session; key exchange archived verbatim below the summary.
Maintainer holds the full transcript and screenshots.
**Status of the codebase:** author-controlled. Frame accordingly: this is a spec-guided
review of the author's own application by an LLM agent, a single case, not third-party
assurance. For double-blind use, refer to the app as "an agentic task-management
application" and do not name the repo.

## What happened

The agent had just shipped a feature (#45) extending a reply-parsing syntax,
`(@project name)`, from current-project scope to any project in the store. On reading the
PS spec it identified, verified, and reported that the application's `items_from_reply`
violates the inert-content rule (spec section 13; decision record at SPEC.md line 510):
it scans every line of model-generated replies for directive-shaped text with no notion
of provenance, including inside fenced code.

Verified reproduction: a reply that merely quotes a README task list inside a markdown
fence yielded two parsed "directives", one carrying `status: "deleted"` (a real verb: the
row is deleted from the store) and one targeting another project. The agent's phrasing:
"An agent pasting a README with a task list is not an attack, it is Tuesday." And on its
own feature: "I widened a capability-escalation surface without noticing it was one.
PS names this exact failure in one sentence."

The same application contains the rule done right in one place: the task manager's
harvest requires a marked block, with a test named `json_outside_a_marked_block_is_ignored`.
Same app, two contracts; the surface obeying the inert rule is safe, the bare scan is the
injection surface. The agent's disposition on #45: fold the authoring segment in before
merging, because "shipping cross-project reach before the inert rule is precisely the
wrong order."

## Why this matters as evidence

1. **The inert rule caught a real bug, predictively.** The security-critical decision in
   section 13 (provenance-typed parsing; "without it, PS would be a prompt-injection and
   capability-escalation surface") functioned as a review criterion against a real
   codebase and identified exactly the vulnerability class it predicts, before wider
   shipment. The spec's criteria side did work that the application's own tests had not.
2. **Independent convergence on PS mechanisms.** The application's `resolve_project`
   refuses partial matches: the ENTITY_AMBIGUOUS instinct arrived at by accident. Its
   `(@name)` syntax squats on PS's reserved `@`; spelled `@project:ui` under a vendor-ext
   namespace it would stop being a private dialect and become a PS profile.
3. **A fill-semantics violation in the wild.** The app emits a partial receipt
   ("N item(s) placed, M deleted") but reports an unresolved project name only to the
   log: a silent drop under the rule that every requested thing ends in exactly one
   recorded state. Cheap to close, and a natural worked example.

## The gap the exhibit exposes (spec work, not just evidence)

PS governs the forward channel, principal to venue. The reverse channel, the application
acting on model output, is covered today by one word (inert) plus a promotion operation
illustrated only as user-in-the-loop reification acceptance. Agentic applications live
almost entirely on the reverse channel, and a per-event human click is not available.

Missing construct, as stated by the reviewing agent: a **standing promotion**. The
application declares once, with authority, that a named segment grammar produced by its
own agent is an authoring surface, bounded by declared verbs and capabilities, recorded
once in the trace rather than per event. The application's current implementation of
that gap is "parse everything and hope."

See the companion proposal (spec-proposal-standing-promotion.md) for candidate
normative text and open questions.

## Verbatim key exchange

> [Agent, on the host/guest distinction:] "I am Claude Code, a subprocess AgencyZero
> spawned... AgencyZero has project_item open read-write and can insert any row it likes
> at any time, and the code I have been editing all along is AgencyZero's own code, not
> mine... So the constraint was never 'the row cannot be written'. It was 'this agent
> has no way to ask for it', and the fix is a word AgencyZero understands."

> [Maintainer:] "ok.. so we're going down a rat hole, but you have plenty of context..
> so welcome to PromptSyntax - a research project of mine. please look in
> ~/code/promptsyntax.org and tell me after a deep think if any of that helps you"

> [Agent:] "Read the spec and the syntax reference. It helps, and the first thing it did
> was find a live bug in AgencyZero that I made worse an hour ago... PS section 10, and
> the decision record at SPEC.md:510: only designated authoring segments parse as
> directives. Model-generated text is typed inert... AgencyZero breaks that rule.
> items_from_reply scans every line of the agent's reply with no notion of provenance,
> including inside fenced code... Both lines were inside a markdown fence, introduced as
> 'here is what the README says'. deleted is a real verb... The fix is also PS's:
> designate the authoring segment... the marked block is the authoring segment, the bare
> checkbox scan is the injection surface. Routing should only be legal inside the
> segment."

> [Agent, on the gap:] "PS governs principal to venue: the request. My problem is the
> reverse channel, the app acting on model output, and PS's answer there is a single
> word, inert, plus a promotion that v0.2 illustrates only as user-in-the-loop
> reification acceptance. Agentic apps live entirely on that channel: every row written,
> PR opened, file edited is the app acting on model text. A per-event human click is not
> available. What is missing is a standing promotion: the application declares once,
> with authority, that a named segment grammar from its own agent is an authoring
> surface, bounded by declared verbs and capabilities, recorded once in the trace rather
> than per event. AgencyZero is a live instance of that gap, currently implemented as
> 'parse everything and hope'."

## Resolution record

Fixed in an isolated commit, `7662cda` (2026-08-01), CI green on the branch (frontend
pass; Rust pass; 122 Rust tests, 7 net new). Independently verified against the public
commit (PR #45, pathscale/agencyzero, commit 7662cda89f271be2f7a7ee1a1e734d321693e33f):
one file changed (`apps/gui/src/projects.rs`, +36/-5); `segment_open()` moved from
byte-exact matching to `eq_ignore_ascii_case()` with proper verb/argument splitting via
`split_once('(')`; alias-fold asymmetry implemented as described; regression test added:
`a_capitalized_verb_is_an_alias_and_a_confusable_is_not()`. (This commit is the alias
fix; the authoring-segment/inert-rule fix and injection-proof test are the companion
isolated commits on the same PR.) Note for paper use: the repo is public, so the
de-identification guidance above matters for the double-blind submission; cite the PR
only in the camera-ready or the companion paper. The fix implements the PS shape: items
parse only from a designated authoring segment with a domain-qualified canonical verb
(`@agency:items.inject`, lowercase, colon namespace, dotted name per section 6.1);
everything outside the segment is inert, and the injection reproduction became a
permanent test.

Alias handling shipped with a deliberate, security-motivated asymmetry worth preserving
in the record: verbs fold ASCII (capitalized casual input compiles to canonical; a verb
spelled with a Cyrillic homoglyph folds to nothing and stays inert, refusing the
confusable rather than binding it), while project names fold Unicode. The agent's
rationale: a verb is an identifier with a canonical form, a project name is prose. For a
small closed verb set, ASCII-restricted canonical identifiers are a simpler and stronger
confusable defense than skeleton detection.

Honest status, in the agent's own words: AgencyZero today is **PS-shaped, not a PS
profile**. It has the spelling plus two hand-rolled behaviors that agree with the spec
(ASCII-fold confusable refusal, never-guess resolution), but no registry, no capability
envelope, and no trace, so it gets none of the envelope machinery "for free," and by
PS's own named-coverage rule it can claim nothing unqualified. The open item that would
put a real PS/Trace-layer claim within reach: every requested thing ending in exactly
one reported outcome, including the unresolved project name that currently reaches only
the log.

## Candidate uses

- Paper section 5 (security posture) or the discussion: one paragraph, honestly framed
  (author-controlled codebase, single case, LLM-agent reviewer).
- The FAccT/AIES companion: the reverse-channel governance question.
- Spec: new open question and a proposed 13.x construct (see companion proposal).
- Website "in practice" material after de-identification is no longer needed.
