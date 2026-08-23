# Decision proposal: transport profiles and a TOON encoding for PS/Trace

- **Date:** 2026-08-23
- **Status:** Proposed for v0.3, alongside the conformance-baseline proposal
  (2026-08-03); profile text at `profiles/transport/toon.md`
- **Spec locations:** §4 (layering), §12 (Trace), §12.1 R1/R2/R3, conformance naming
- **Decision requested:** Whether the Prompt Trace is a JSON format or a JSON
  *information model* with named transport encodings, and where integrity hashing
  binds if the latter.

## Context

The Trace schema is JSON, and every conformance rule is currently phrased against the
JSON document. But the trace's primary consumers increasingly sit inside model context
windows: routing records and fill reports are mandatory for every venue invocation, so
an agent running a loop re-reads receipts each step, and receipt token cost becomes a
recurring tax on the reverse channel, the surface where receipt cost lands hardest in
agentic use. Compact LLM-oriented serializations now exist; the most established,
TOON (Token-Oriented Object Notation), offers a deterministic, lossless round-trip
with JSON and tabular encoding of uniform object arrays, with published benchmarks on
the order of 40% token savings. The question is not whether someone will emit traces
in such a format; it is whether the specification defines what that means before
implementations improvise it.

There is also an unforced ambiguity today: the draft does not pin a JSON
canonicalization for `integrity.event_hashes`, so even pure-JSON producers can hash
differently-serialized but identical documents. Introducing a second transport forces
that question, which is a reason to answer it now rather than a cost of this proposal.

## Proposed decision

1. **Declare JSON the normative information model, not merely the format.** The
   schemas and the semantic validator remain the single source of truth. A trace *is*
   its canonical JSON; everything else is an encoding of it.
2. **Introduce transport profiles as externalized mappings** under
   `profiles/transport/`, following the same externalization pattern as vendor,
   oversight, and policy profiles: versioned independently, adopted explicitly.
3. **Adopt TOON as the first transport profile**, defined by decode-then-validate: a
   TOON trace conforms iff it decodes, under the profile's pinned TOON version, to a
   schema-valid, semantically valid JSON trace. No TOON-only fields or semantics.
4. **Bind integrity to canonical JSON bytes** (proposed: RFC 8785 JCS), never to
   transport bytes. Re-encoding MUST NOT invalidate signatures or hash chains. This
   rule is worth accepting even if the TOON profile itself is rejected.
5. **Pin everything the goldens need:** TOON spec version, delimiter, indentation, and
   schema-declared key order, so TypeScript and Rust encoders are byte-comparable and
   the transport is differential-testable like Core parsing.
6. **Carry transport in the conformance string**
   (`...; transport: toon/<pinned>`), consistent with the conformance-naming rule
   (SPEC §4) that unqualified claims are non-conformant. Absence of the clause means
   JSON.

Producers MUST NOT alter document shape for compression: under the 0.3-draft
conditional requirements, field presence is semantic, so padding optional fields to
make arrays uniform is a semantic change, not an optimization. Ordering same-kind fill
entries contiguously is the only sanctioned uniformity lever.

## Alternatives considered

### Make TOON the normative trace format

Rejected. TOON is young and its specification still moves; JSON Schema tooling,
validators, and the existing conformance runner are the ecosystem the trace depends
on. An audit artifact's normative form should be the boring one.

### Design a bespoke compact PS trace encoding

Rejected. A second spec-owned grammar to version, test, and govern, for savings an
existing format already delivers, contradicts the minimal-reserved-surface principle
and multiplies the conformance surface.

### Hash the transported bytes

Rejected. Integrity would break on any re-serialization, making transport choice
load-bearing for evidence, exactly backwards: evidence should survive re-encoding.

### Change the schema to maximize tabular uniformity

Rejected. The 2026-08-03 proposal deliberately made field presence semantic
(discriminated entity outcomes, conditional requirements). Flattening or padding for
compression would undo that audit's central fix.

### Apply TOON to the notation itself

Rejected as out of scope. PS islands and the strict document form are their own
grammar; TOON serializes JSON data, and the notation is not JSON data.

## Consequences

- The specification gains a JSON canonicalization dependency (RFC 8785 or a
  spec-owned equivalent), which §12 needs anyway for `event_hashes`.
- The conformance suite gains a transport target: golden TOON fixtures for existing
  vectors plus an encoder differential (TS vs. Rust, byte-wise, canonical settings).
- Both reference implementations need a TOON encode/decode path before the profile
  can leave proposed status; until then no conformance string may name it.
- Schemas do not change. Pure-JSON producers are unaffected.
- The savings accrue mostly to agent-consumed receipts and event stores; user-tier
  rendered receipts are presentation-layer and unaffected.

## Questions for PR review

1. Pin which TOON specification version, and what is the policy when TOON revs?
2. RFC 8785 JCS, or a smaller spec-owned canonical-JSON rule (sorted keys, UTF-8,
   no insignificant whitespace)?
3. Should the transport declaration also appear machine-readably in `coverage`
   (e.g. `coverage.transport`), or is the conformance string enough?
4. Canonical encoder delimiter: comma (TOON default) or tab (better tokenization in
   some tokenizers)? The goldens need exactly one.
