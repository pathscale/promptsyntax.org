# PromptSyntax conformance corpus

This directory contains the canonical, language-independent PromptSyntax conformance
corpus and its repository-owned stable-Rust runner. The specification and expected vectors
are the oracle. Implementations consume the corpus but do not define its expected outcomes.

## Current status

Version `0.1.0-rc.1` is a candidate suite against the specification draft at commit
`7456634817f4eb68c8909a58b476505e6fd7c063`. It executes 34 document and producer cases
across four Trace families and covers all 22 requirements in its named candidate profile.
It is not a released conformance suite and must not be used for an unqualified claim.

The cases freeze provisional v0.3 decisions for review without pretending those decisions
are already normative. The machine-readable inventory retains blocked, proposed, and open
entries so unresolved specification gaps remain visible rather than being silently omitted.

## Ownership

- `promptsyntax.org` owns specifications, schemas, requirements, vectors, the stable-Rust
  runner, and published reports so the complete suite is versioned atomically.
- `PromptSyntax-rs` and `PromptSyntax-ts` are implementations under test, not sources of
  expected answers.
- Each implementation exposes a thin adapter that contains no expected answers.

The normative runner does not require Python, Node, Bun, a provider SDK, a network
connection, or model credentials. The TypeScript implementation may be invoked separately
with Bun when producing cross-language evidence.

Run the repository-owned checker from the repository root:

```bash
cargo run --manifest-path conformance/runner/Cargo.toml -- \
  check-requirements conformance/requirements.json

cargo run --manifest-path conformance/runner/Cargo.toml -- run-suite .
```

The command emits the deterministic report stored in
`conformance/reports/0.1.0-rc.1.json`. CI regenerates it and requires a byte-for-byte match.

## Layout

- `profiles/` freezes the named scope and candidate semantic decisions.
- `families/` contains language-independent cases and expected diagnostics.
- `fixtures/` contains reusable Trace and deterministic transcript inputs.
- `cases/core-parser.json` is the single Core fixture consumed by both parser adapters.
- `reports/` contains deterministic, machine-readable evidence snapshots.
- `runner/` contains the independent stable-Rust checker.
- `adapters/` defines the implementation boundary and forbids embedded expected answers.

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
