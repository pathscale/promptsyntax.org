# Transport profile: TOON *(proposed)*

- **Status:** Proposed alongside the v0.3 baseline
  (`decisions/2026-08-23-toon-transport-profile-proposal.md`). Not normative. No
  conformance claim may cite this profile until it is accepted and versioned.
- **Normative model:** JSON, per `schemas/` and SPEC §12. This profile adds a wire
  encoding; it adds no fields, no statuses, and no semantics.

## Why a transport profile

The heaviest readers of execution receipts are models, not people. Routing records and
fill reports are mandatory for every venue invocation (SPEC §12.1), so in agentic loops
receipts re-enter the context window at every step, and their token cost is a per-turn
tax on exactly the consumers PS most wants to serve. TOON (Token-Oriented Object
Notation) is a compact, human-readable serialization of JSON built for LLM prompts,
with a deterministic, lossless round-trip to JSON and CSV-style tabular encoding for
uniform arrays of objects, where published benchmarks report on the order of 40% token
savings over JSON. See <https://github.com/toon-format/toon>.

The same shape argument applies to append-only receipt/event stores, whose rows are
uniform by construction.

## The three invariants

1. **JSON stays the normative information model.** A TOON trace document is conformant
   if and only if it decodes, under the TOON specification version pinned by this
   profile, to a JSON document that passes the normative Trace schema and the semantic
   validator. There are no TOON-only fields and no TOON-specific meanings. Anything
   expressible in this profile's TOON is expressible in JSON, and means the same thing.
2. **Integrity is serialization-independent.** `integrity.event_hashes`, signatures,
   and any digest over trace structure are computed over canonical JSON bytes
   (proposed: RFC 8785 JCS), never over TOON bytes. Re-encoding a trace between JSON
   and TOON MUST NOT invalidate its integrity chain. Content digests (`sha256`,
   withheld-content digests) are over content bytes and are unaffected by transport.
3. **Lossless round-trip, pinned encoder.** For the golden fixtures, encoding is
   deterministic: pinned TOON spec version, pinned delimiter, pinned indentation, and
   key order as declared in the schema. Decode(encode(J)) MUST equal J for every
   schema-valid J; independent encoders (TypeScript, Rust) MUST agree byte-wise on the
   canonical settings, which makes the transport differential-testable exactly like
   Core parsing.

## What actually encodes tabularly

TOON's tabular form applies to uniform arrays of objects; discriminated unions and
conditional fields fall back to expanded (YAML-like) encoding, which is correct and
expected. Against the 0.3-draft schema:

| Array | Tabular? | Note |
|---|---|---|
| `resolution.bindings[]` | Yes | Fixed four primitive fields |
| `integrity.event_hashes[]` | Yes | Scalar list |
| `steps[]` | Mostly | Small field set; primitive values |
| `routing.attempts[]` | Rarely | `filled` requires nested `measured`, failures require `reasons[]`; nesting forces expanded form |
| `routing.fill[]` | Partially | Discriminated by `kind`; same-kind runs with matching field usage encode as rows |
| `segments[]`, `events[]` | No | Unions with nested content objects; expanded form |

**Producers MUST NOT pad or invent fields to force uniformity.** Under the 0.3-draft
conditionals, field presence is semantic (for example, a `refused` entity fill MUST NOT
carry `applied`), so an omitted field cannot be replaced by an empty value for
compression's sake. The only uniformity lever this profile grants is ordering:
producers SHOULD keep same-kind fill entries contiguous where the specification's
ordering rules permit.

## Declaring the transport

Transport is part of the conformance-naming discipline (SPEC §4): a claim names the
layers, versions, and coverage it makes, and unqualified claims are non-conformant.
A venue emitting TOON declares it in the conformance string:

```text
PS/Trace 0.3 (user tier, routing complete, named assembly coverage; transport: toon/<pinned>)
```

Absence of a transport clause means JSON. A venue MAY emit both; the JSON and TOON
documents MUST decode to the same canonical JSON.

## Fragment (illustrative, 0.3-draft shapes)

```toon
resolution:
  bindings[2]{ref,bound,rule,ambiguity_surfaced}:
    "@opus","model:vendor/opus-4-5@2026-05-01","namespace-search",false
    "@file:q3-report.md","file:vendor-ws/q3-report.md@v3","qualified-name",false
```

The fragment is illustrative only; the golden fixtures, not this page, define exact
bytes, including quoting and delimiter rules.

## Non-goals

- Not a replacement for JSON, and never the only accepted transport.
- Not a schema change: nothing in `schemas/` moves because of this profile.
- Not for the notation itself: PS islands and the strict document form are their own
  grammar (SPEC §5, §11) and gain nothing from TOON.

## Open until accepted

Pinned TOON specification version; JSON canonicalization choice (RFC 8785 vs. a
simpler spec-owned canonical form); whether the transport clause lives in the
conformance string only or also in `coverage`; delimiter choice for the canonical
encoder settings.
