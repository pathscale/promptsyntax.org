# Exhibit: cross-vendor agent onboarding to a declared authoring surface (Codex/GPT-5.6)

**Date:** 2026-08-02
**Actors:** AgencyZero (host) and Codex (OpenAI GPT-5.6-Sol) as guest agent, being ported
to the same PS-governed reverse channel previously exercised by Claude-family agents.
**Context:** follows the 2026-08-01 exhibit (inert-rule bug, standing promotion) and the
v0.2.2 spec change. The maintainer's instruction to the agent: "the #1 start is for you
to understand PS and get it working for you." Screenshots archived by the maintainer.
**Status:** author-controlled host, single session; frame as a case observation, not a
generalizable evaluation. De-identify for double-blind use.

## What happened

1. **Cold-read comprehension across vendors.** Given the spec and AgencyZero's docs, the
   Codex agent correctly mapped the reverse channel as three distinct contracts, not one
   generic task syntax: the Task Manager's delimited JSONL block (its own authoring
   surface with its own verb validity), project items via the declared PS surface with
   stable item IDs, and pull-request linkage mixing harvested URLs with PS directives
   (`items.state(..., pr: 66)`, `pr.link(...)`). It also identified which verbs it must
   never set itself (`finished`, `canceled`), i.e., authority-differentiated verbs,
   unprompted.

2. **A framing failure that the inert rule handled correctly.** The agent emitted prose
   and a directive as adjacent streamed chunks; the host concatenated consecutive
   commentary messages without a newline, producing `prose.<ps @agency:items.add(...)>`
   on one line. The directive stayed inert and displayed literally. The agent's own
   diagnosis after re-reading the spec: "The failure was not the directive's meaning; it
   was framing... PS-shaped text is inert unless it occupies the declared segment
   exactly." This is the designed failure mode: a mis-framed directive degrades to
   visible content, never to accidental execution, and the visible literal text is
   itself the signal that something mis-fired.

3. **The receipt as the agent's own verification instrument.** After correcting its
   framing rule ("each directive inside the same commentary response, explicit newlines
   before and after, never quoted, fenced, or attached to prose"), the agent confirmed
   success by reading the receipt: "The latest receipt proves the corrected framing
   works: AgencyZero parsed my standalone directive and moved item-869382d3 to active
   instead of displaying it literally." The receipt's consumer here is the agent
   itself, a machine principal using the fill report to verify its own conformance.
   The stakeholder list (user, developer, enterprise, regulator) gains a fifth member.

4. **Host-side integration bugs found by working the contract.** Four, none requiring
   code changes to diagnose: commentary message boundaries concatenated without
   newlines; live PS parsing incorrectly gated on the presence of a checkbox (standalone
   directives waited for the end-of-turn pass); the injected prompt naming
   `items.inject` and `pr.link` without demonstrating their arguments; and the Task
   Manager writer skipping an existing matching title instead of updating its status.
   Plus stale docs still teaching the pre-PS title-based completion contract. The
   agent's discipline, quoted because it mirrors the project's own ethos: "I will not
   call it shipped merely because I understand the documentation; it needs to work
   through AgencyZero end to end."

## Why this matters as evidence

- **Portable intent, cross-vendor, on the reverse channel.** The same declared surface
  was authored against by agents from two different model vendors, with comprehension
  acquired from the specification text alone. This is the "portable expression of
  intent" claim exercised where it is hardest, by machine principals.
- **The inert rule's failure mode is the safe one.** The first exhibit showed the rule
  catching an unsafe parse; this one shows the complementary case, an intended directive
  failing closed into visible content. Together they bracket the design: no accidental
  execution, no invisible failure.
- **Framing obligations are real and belong somewhere.** The episode surfaces two
  obligation sets the spec does not yet name: agent-side authoring rules for standing
  surfaces (directive occupies the segment exactly; never quoted, fenced, or
  concatenated into prose) and host-side integrity rules (preserve message boundaries;
  parse declared segments independently of unrelated gating; end-of-turn backstop).
  Candidate non-normative authoring guidance under 13.2, or profile material; add to
  OQ#16's scope.

## Candidate uses

- Paper: systems evidence (cross-vendor comprehension of the spec) and the receipt
  section (machine principal as receipt consumer). De-identified: "agents built on two
  different vendors' models."
- Spec: OQ#16 addendum (authoring and host framing obligations for standing surfaces).
- FAccT companion: the fifth stakeholder observation.
