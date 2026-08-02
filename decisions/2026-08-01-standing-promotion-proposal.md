# Decision proposal: bounded standing authoring surfaces

- **Date:** 2026-08-01, revised 2026-08-02
- **Status:** Proposed for v0.2.2
- **Spec location:** §13.2
- **Decision requested:** Whether PS should define a reusable, authority-checked
  promotion form for agent-produced action requests.

## Context

PS §13 types model-generated text as inert. A segment becomes eligible for directive
parsing only through an explicit, authority-checked promotion that is recorded in the
trace. v0.2.1 illustrates per-event user acceptance, but it does not specify a reusable
form for an application that routinely acts on output from a machine principal.

An author-controlled application review exposed the practical gap. One path parsed
every line of a model response for action-shaped text, including examples inside fenced
content. Another path in the same application accepted actions only from a designated
output block. The unbounded scan turned quoted content into a capability-escalation
surface; the bounded path failed closed.

The useful construct is not general trust in model output. It is a versioned declaration
that a particular principal, speaking through a particular origin-bound frame, may
request a closed set of actions. Every action remains subject to current authorization
and produces a fill outcome.

Supporting case material is archived separately. It identifies the host application,
vendors, and public commits, so it should not be required to understand or review the
normative proposal and should not be cited in a double-blind submission.

## Proposed decision

Add a proposed §13.2 defining a **declared authoring surface**. An application/developer
authority or higher may publish a standing promotion declaration. The declaration makes
segments from the named surface eligible for parsing. It never widens a capability
envelope and never lets content promote itself.

The declaration must bind all of the following:

1. **Identity and lifecycle:** declaration id and version, declaring authority, producer
   principal or class, valid scope, activation, replacement, and revocation.
2. **Origin and framing:** transport, invocation or message boundary, output field, and
   exact frame. The host parses the designated frame directly. It does not search an
   undifferentiated transcript or concatenated prose for a delimiter.
3. **Namespace and actions:** one vendor-extension namespace, a closed action set, and
   parameter schemas. Actions may be reserved to principals above the producer.
4. **Capability bound:** explicit scope, including any cross-resource reach, followed by
   a fresh authorization decision under the envelope and policy in force at execution.
5. **Fill and replay behavior:** exactly one surfaced outcome per directive-shaped
   request, typed failures for parse, binding, and authorization errors, and an explicit
   idempotency or replay rule.
6. **Trace obligations:** declaration version, declaring and producing principals,
   invocation and frame ids, provenance, authorization decision, replay disposition,
   and per-request outcomes. Segment content uses the existing tier-relative content
   encoding from §12.1.

## Required invariants

- Promotion changes provenance type only. It does not grant permission or authority.
- A model cannot create, amend, reactivate, or expand the declaration governing its own
  output.
- Content outside the origin-bound frame remains inert, even when it contains the exact
  delimiter or directive-shaped text.
- Message and invocation boundaries are part of the security contract. Concatenating
  adjacent messages and then scanning the result is non-conformant.
- Every exercise is checked against current policy. Revoked capabilities cannot survive
  through a stale standing declaration.
- An agent-authored segment cannot claim user provenance or user authority.
- Consequential actions still follow §6.4: they are fully qualified or explicitly
  confirmed.
- A declaration bounds the effects of a compromised or prompt-injected agent; it does
  not prove that the agent is correct, uncompromised, or expressing the user's intent.

## Why a delimiter is not enough

A delimiter distinguishes a candidate action block from surrounding prose, but it does
not establish who produced the block or which transport boundary it came through. A
retrieved document can contain the delimiter. Streamed messages can be concatenated.
An attacker can replay a previously valid block. A conformant surface therefore binds
producer, origin, frame, lifecycle, and replay behavior in addition to syntax.

This distinction is the difference between a structured command channel and a pattern
scan over text. The former can be authorized and audited; the latter recreates the
injection surface that provenance typing is meant to remove.

## Relationship to existing PS mechanisms

- **Per-event reification acceptance:** the user-authority cadence of promotion. A
  standing surface is the reusable application-authority cadence. Both make a segment
  parse-eligible; neither grants capability by itself.
- **Authority and non-escalation:** the declaration is authored by a higher authority,
  but it does not widen the envelope. Each action is resolved and authorized normally.
- **One reference grammar:** actions use PS references under a domain-qualified
  vendor-extension namespace, such as `@agency:items.state(...)`, rather than a private
  lookalike grammar.
- **Fill report:** every request ends in one recorded outcome. Unknown or confusable
  action names fail visibly instead of disappearing.
- **Prompt Trace:** the surface declaration is referenced from the capability document,
  and each exercise is typed in the trace using existing tier-relative content rules.
- **Adoption status:** an implementation that borrows the syntax and selected behaviors
  without meeting a named layer-and-version claim is PS-shaped only. PS-shaped is useful
  migration language, not a conformance level and not an exception to conformance.

## Confusables for closed action sets

Canonical action names should be ASCII-restricted. Implementations may accept ASCII
case-folded aliases. A name containing a non-ASCII confusable must not bind as an alias
and, once it appears inside a declared frame, must produce a typed failure rather than
becoming inert. Open namespaces continue to use the UTS #39 guidance in §13.1.

## Alternatives considered

### Parse all model output

Rejected. It promotes quoted, retrieved, and generated examples by pattern match and
makes provenance typing meaningless.

### Treat a text delimiter as the complete boundary

Rejected. It does not bind producer, transport, message boundary, lifecycle, or replay.

### Require user acceptance for every event

Rejected as the only mechanism. It remains appropriate for interactive reification but
does not cover unattended agentic applications.

### Treat standing promotion as capability-envelope widening

Rejected. That analogy conflates two controls. Promotion changes parse eligibility;
authorization determines whether an eligible request may execute.

### Standardize only tool-call APIs

Rejected as the PS-level answer. A structured tool-call field is a strong possible frame,
but vendors expose different transports. PS should standardize the declaration, action
semantics, and receipt obligations across those transports.

## Evidence limits

The motivating observations come from an author-controlled application and a small
number of agent sessions. They demonstrate that the gap is implementable and that the
failure mode exists; they do not establish prevalence, usability, or third-party
conformance. Adoption should remain proposed until the declaration and trace shapes are
machine-testable and exercised by at least two independent implementations.

## Questions for PR review

1. Is the producer best identified as a principal, a principal class, or a signed runtime
   identity?
2. Which frame kinds belong in a core interoperability profile: structured output field,
   tool-call record, delimited assistant block, or all three?
3. Does replay need a new core failure code, or should v0.2.2 permit a namespaced code?
4. Should consequential actions require fully qualified references without offering the
   confirmation alternative to unattended machine principals?
5. What minimum declaration and event fields must enter the v0.2 capability and trace
   schemas before this proposal can become settled?
