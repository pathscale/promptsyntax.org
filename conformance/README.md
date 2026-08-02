# PromptSyntax conformance corpus

This directory will contain the canonical, language-independent PromptSyntax conformance
corpus. The specification and expected vectors are the oracle. Implementations consume the
corpus but do not define its expected outcomes.

## Current status

The corpus is being bootstrapped against the specification draft at commit
`7456634817f4eb68c8909a58b476505e6fd7c063`. It is not yet a released conformance suite and
must not be used for an unqualified conformance claim.

Normative vectors are blocked until the v0.3 baseline reconciles the specification and Trace
schema. The initial machine-readable requirement inventory may contain blocked or proposed
entries so that gaps remain visible rather than being silently omitted.

## Planned ownership

- `promptsyntax.org` owns specifications, schemas, requirements, vectors, and published
  reports.
- `PromptSyntax-rs` owns the stable-Rust validator and conformance runner.
- Each implementation exposes a thin adapter that contains no expected answers.

The normative runner does not require Python, Node, Bun, a provider SDK, a network
connection, or model credentials. The TypeScript implementation may be invoked separately
with Bun when producing cross-language evidence.

## Conformance targets

1. **Corpus:** metadata, references, artifacts, hashes, and coverage are internally valid.
2. **Core parser:** source produces exact lossless segments, projections, spans, directives,
   and diagnostics.
3. **Trace document:** a trace and declared artifacts satisfy structural and semantic rules.
4. **Trace producer:** deterministic execution facts produce a trace consistent with those
   facts.

Passing document validation does not prove that a deployed venue reported execution facts
truthfully. Independent collection or attestation is a separate trust mechanism.

## Development rule

If the specification does not determine an expected result, do not add a normative vector.
Record the ambiguity, resolve it in the specification and decision log, and only then freeze
the expected outcome.
