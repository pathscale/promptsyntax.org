# Conformance baseline audit

Audit date: 2026-08-03

Audited baseline: `7456634817f4eb68c8909a58b476505e6fd7c063`

This audit records issues that prevent the current working draft from serving as a
deterministic conformance oracle. It is not itself normative.

## Release blockers

| ID | Finding | Why it blocks a test oracle | Proposed disposition |
|---|---|---|---|
| A01 | The document declares v0.2 while containing settled v0.2.1 material and a proposed v0.2.2 section. | A case cannot cite one coherent behavior version. | Consolidate settled material as v0.3 and exclude proposed §13.2 from the first profile. |
| A02 | Entity fill entries cannot distinguish kept, explicit fallback, venue substitution, and refusal. | The paper's central requested-versus-applied outcome has no unambiguous machine representation. | Use a discriminated entity outcome with `kept`, `fallback`, `substituted`, and `refused`. |
| A03 | §10.5 requires `SAFETY_BLOCKED`, but §8.2 and the schema omit it. | The same document is conformant in prose and impossible in schema. | Reconcile an outcome reason registry and add missing availability, substitution, and safety reasons. |
| A04 | User-initiated `segments`, `steps`, and `resolution` are normative but optional in the schema. | A schema-valid trace can omit the compiled prompt and resolution evidence. | Add structural conditionals where practical and semantic checks for the remainder. |
| A05 | `routing.bound` is always required. | A strict request refused before invocation has no legal representation. | Use a routing outcome union or conditionally require `bound` only when an invocation occurred. |
| A06 | R1 names byte-exact reproduction without defining independent request bytes or complete external and withheld resolution semantics. | A trace can only agree with itself, not prove what was sent. | Define UTF-8 byte semantics and a producer transcript containing actual request bytes. |
| A07 | The schema permits arbitrary unknown fields and does not define an extension policy. | Independent validators may accept different dialects while claiming the same version. | Reject unknown fields by default or isolate them in a namespaced extension object. |
| A08 | Hash strings, lengths, IDs, indices, and graph relations are weakly constrained. | Malformed evidence can pass structural validation. | Define exact hash syntax, non-negative lengths, uniqueness, ordering, pointer scope, and graph rules. |
| A09 | §10.5 requires typed refusal reason, authority, trigger provenance, and recourse, while the schema only partially represents them. | Safety, policy, authorization, and availability refusals cannot be tested consistently. | Add a discriminated refusal object and define required fields by reason. |
| A10 | Oversight prose requires sequence gaps, retention, and residency metadata that the schema cannot represent. | Oversight conformance cannot be claimed from the published artifact. | Exclude oversight from the first headline profile and reconcile its schema before claiming it. |
| A11 | Boundary events always require received content. | Failed or cancelled tool calls cannot be represented honestly. | Add success and failure outcome variants without erasing what crossed the boundary. |
| A12 | The generic fill-entry status vocabulary mixes entities, parameters, budgets, and actions. | Legal status and code combinations are ambiguous. | Use discriminated fill-entry variants with type-specific status vocabularies. |
| A13 | Proposed §13.2 contains normative words but lacks capability and Trace schemas. | Including it would create untestable Core requirements. | Keep it candidate-only until two implementations and machine-testable shapes exist. |
| A14 | The example uses short strings as SHA-256 values, which the schema accepts. | It normalizes evidence that is not a valid SHA-256 digest. | Require 64 lowercase hexadecimal characters and update examples with fictional fixtures. |
| A15 | The current Core fixture is manually duplicated in Rust and TypeScript repositories. | Drift can occur without detection and the specification does not own the oracle. | Promote it into this directory and have both adapters consume one corpus. |
| A16 | No current CI validates the schema against the example or checks semantic Trace rules. | Published artifacts can drift independently. | Add Rust corpus, schema, semantic, and producer checks in separate CI lanes. |

## Non-blocking but required before stronger profiles

| ID | Finding | Required follow-up |
|---|---|---|
| A17 | The transparency floor is explicitly open. | Freeze placeholder contents before claiming full tier-relative completeness. |
| A18 | Integrity chaining lacks canonical serialization and verification procedures. | Define these in an oversight profile before making integrity a `MUST`. |
| A19 | Capability document shape is illustrative, not schema-backed. | Publish a versioned capability schema before full PS/Capabilities conformance. |
| A20 | Budget measurement profiles remain open. | Keep deterministic synthetic measurements in core producer tests and defer vendor accounting claims. |
| A21 | Default namespace search order remains open. | Core parser vectors may test declared environments, but resolver conformance waits for a settled order. |
| A22 | Nested-span conflict semantics remain open. | Exclude ambiguous conflict cases from normative Core vectors until resolved. |
| A23 | Localized keyword governance remains open. | Test canonical English keywords and settled Unicode behavior; keep localized aliases optional. |

## Safe work that can proceed before v0.3 is frozen

- Define the corpus metadata and requirement schemas.
- Inventory every settled, proposed, and open requirement.
- Promote existing Core fixtures with draft provenance and stable candidate IDs.
- Implement a Rust corpus self-checker against draft data.
- Implement adapter plumbing without expected semantic answers.
- Draft minimal valid and invalid Trace mutations, marked non-normative until their rules are
  frozen.

## Work that must wait for the oracle

- Publishing a normative suite version.
- Calling any implementation conformant to PS/Trace v0.3.
- Freezing entity substitution and refusal vectors.
- Freezing R1 vectors involving external or withheld content.
- Claiming oversight profile coverage.
