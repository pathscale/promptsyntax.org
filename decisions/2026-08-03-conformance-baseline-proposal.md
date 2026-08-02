# Decision proposal: conformance baseline and execution-receipt outcomes

- **Date:** 2026-08-03
- **Status:** Proposed for v0.3; exercised by candidate suite `0.1.0-rc.1`
- **Spec locations:** §4, §8, §10.5, §12, §16 OQ14 and OQ15
- **Decision requested:** How PromptSyntax freezes a test oracle and represents exact
  binding, fallback, substitution, and refusal without conflating them.

## Context

PromptSyntax has two behavior-compatible parser implementations and a small shared Core
fixture set, but it does not yet have a specification-owned conformance corpus. The Trace
schema describes the intended turn-level receipt while leaving several normative behaviors
to prose. A conformance runner written before those behaviors are reconciled would make the
first implementation, rather than the specification, the accidental oracle.

The most consequential ambiguity concerns the paper's central example. The existing schema
can record `requested`, `applied`, and `bound`, but its generic fill status cannot
unambiguously distinguish:

1. the requested model was kept;
2. a user-declared fallback step ran;
3. the venue substituted a different model outside the declared route; or
4. the request was refused before execution.

Those are different outcomes for reliance, authorization, and conformance. A user-declared
fallback is not a silent substitution. A strict request cannot be successfully substituted.

The audit also found mechanical mismatches. Section 10.5 requires `SAFETY_BLOCKED`, but the
failure-code registry and schema omit it. User-initiated traces normatively require compiled
prompt segments and a resolution report, but the schema makes both optional. R1 requires a
byte-exact comparison without defining the independent execution bytes against which the
trace is checked.

## Proposed decision

### 1. Freeze one baseline before normative vectors

Consolidate settled v0.2 and v0.2.1 material into a clean v0.3 baseline. Proposed §13.2
standing authoring surfaces remain outside the first v0.3 conformance profile until their
capability and trace shapes are settled.

Every normative rule receives a stable identifier. Tests cite the identifier and immutable
specification commit. Section numbers remain explanatory and may change editorially.

The specification is the oracle. A vector may expose an ambiguity but may not resolve one.
When independent implementations disagree and the prose does not decide the result, the
specification is amended before an expected answer is added.

### 2. Name three different conformance targets

1. **Corpus conformance:** the suite metadata, requirement links, artifacts, hashes, and
   expectations are internally valid.
2. **Trace document conformance:** a supplied trace and its external artifacts satisfy the
   structural and semantic contract.
3. **Trace producer conformance:** given an independent deterministic execution transcript,
   an implementation emits a conforming trace that agrees with the transcript.

Document conformance cannot prove what actually crossed a provider boundary. Producer
conformance supplies those facts independently to the trace producer. Neither target proves
that a self-reporting venue was truthful in deployment.

### 3. Make entity outcomes explicit

Replace the generic interpretation of entity fill entries with a discriminated entity
outcome whose status is exactly one of:

- `kept`: the applied canonical entity equals the requested canonical entity;
- `fallback`: a different entity was applied through an explicit step in the authored route;
- `substituted`: a different entity was applied outside the authored route under a policy
  that permits venue discretion; or
- `refused`: no entity invocation occurred.

Every entity outcome records the requested canonical entity or route, the applied canonical
entity when one ran, the deciding fulfillment policy, and the relevant attempts. `fallback`
identifies the authored route step. `substituted` records a typed reason and deciding
authority. `refused` records a typed failure code and recourse when one exists.

An exact entity request is strict by default. It therefore permits only `kept` or `refused`.
`substituted` under strict policy is non-conformant. An explicit authored fallback can
produce `fallback` without weakening strict binding of each individual step.

Parameter, budget, and action fill entries retain their own status vocabularies rather than
sharing every entity outcome value.

### 4. Extend the typed reason registry

Add at least:

- `ENTITY_UNAVAILABLE`: the canonical entity resolved but could not be invoked because of
  capacity or availability;
- `ENTITY_SUBSTITUTED`: a different entity was applied outside the authored route; and
- `SAFETY_BLOCKED`: a safety envelope refused the request.

`ENTITY_NOT_FOUND` remains a resolution failure and must not stand in for temporary
availability. `FALLBACK_EXHAUSTED` remains the terminal outcome after all legal route steps
fail. An explicit fallback attempt carries the reason its preceding step failed; it does not
carry `ENTITY_SUBSTITUTED` merely because the final entity differs from the first step.

The registry covers both failures and disclosed degradations, so the specification should
rename it from "failure codes" to "outcome reason codes."

### 5. Supply independent evidence for R1

Trace document validation can check segment structure, hashes, and internally materialized
content. Byte-exact producer conformance additionally receives the actual UTF-8 request
bytes from the deterministic execution transcript. The runner reconstructs bytes from the
trace and compares them with that independent value.

The v0.3 baseline must define:

- UTF-8 as the comparison encoding;
- no implicit Unicode normalization or line-ending conversion after compilation;
- byte lengths, not character counts;
- artifact digest and resolution behavior; and
- the tier-specific comparison value for withheld content.

Without independent request bytes, an internally self-consistent trace can satisfy document
validation but cannot claim R1 producer conformance.

### 6. Make schema and semantic validation boundaries explicit

JSON Schema enforces local structure. The Rust semantic validator enforces cross-field,
graph, ordering, content, policy, and coverage invariants. Requirements that cannot be
expressed faithfully in JSON Schema remain normative and are not weakened to fit the schema.

At minimum, v0.3 schema reconciliation must address:

- conditional requirements for user-initiated segments and resolution reports;
- failed or blocked routing records for which no `bound` model exists;
- unique event, segment, and step identifiers;
- contiguous ordered segment indices;
- step and parent resolution within the correct inference;
- external digest syntax and non-negative byte lengths;
- materialized content requirements;
- exact extension and unknown-field policy;
- boundary calls that fail without receiving content;
- refusal authority, trigger provenance, and recourse;
- oversight retention, residency, sequence, and gap records; and
- legal combinations of policy, status, applied value, and reason code.

### 7. Scope the first paper profile narrowly and honestly

The minimum paper profile is:

```text
PS/Core 0.3 + PS/Trace 0.3
(user tier, routing complete, named assembly coverage)
```

It includes all settled user-tier `MUST` and `MUST NOT` requirements, R1 through R6,
requested-to-applied entity outcomes, explicit fallback, strict refusal, tool boundary
events, and deterministic producer replay.

Developer, operator, and oversight cases may be published alongside it but cannot be
included in the headline conformance claim until each named profile is complete. Proposed
standing-authoring-surface behavior remains an extension candidate rather than silently
entering Core conformance.

## Alternatives considered

### Let the Rust reference implementation define ambiguous behavior

Rejected. This creates implementation compatibility, not specification conformance, and
makes independent implementation evidence circular.

### Treat every requested/applied mismatch as substitution

Rejected. It falsely classifies a user-authored fallback as venue discretion and erases the
authorization information carried by the route.

### Infer substitution from string inequality without an explicit outcome

Rejected. It cannot distinguish aliases, declared fallbacks, normalization, or a dishonest
`filled` label, and it gives user interfaces no stable semantic field to present.

### Use only JSON Schema

Rejected. JSON Schema does not establish graph acyclicity, byte-exact reconstruction,
cross-event completeness, or fulfillment-policy consistency.

### Exercise live provider APIs in normative tests

Rejected. Provider behavior, availability, pricing, and model aliases are unstable. Live
experiments may test venue profiles but cannot define deterministic core conformance.

### Copy Prompty's runners

Rejected. PromptSyntax borrows the specification-owned vector architecture but implements a
typed Rust runner against PromptSyntax requirements. No Prompty runtime is required.

## Consequences

- The existing v0.2 Trace schema must change before a normative v0.3 suite can be released.
- Some currently schema-valid documents will become invalid because outcome states and
  required fields become explicit.
- A trace can pass document validation while lacking producer evidence for R1. Reports must
  name the target they passed.
- The paper can evaluate kept versus substituted outcomes without mislabeling explicit
  fallback.
- Two author-controlled implementations demonstrate specification precision, not
  independent certification.

## Questions for PR review

Candidate `0.1.0-rc.1` uses the recommended answers below so executable review can proceed.
They remain provisional until this decision is accepted: substitution is legal only under
an explicitly selected best-effort policy; capacity substitution names
`venue-operations`; R1 producer checks compare independent UTF-8 request bytes without
normalization; and unknown fields are rejected outside namespaced `extensions` objects.

1. Should `substituted` ever be legal under an explicitly selected `best-effort` entity
   policy, or should entity substitution always require pre-execution confirmation?
2. Should the user-tier receipt expose the deciding authority for capacity substitution as
   `venue`, `operator`, or another explicit authority value?
3. At a tier where content is withheld, should R1 compare the original compiled bytes using
   oversight-only evidence, or compare a canonical typed placeholder visible at that tier?
4. Should unknown JSON fields be rejected by default with namespaced extension objects, or
   preserved for forward compatibility?
