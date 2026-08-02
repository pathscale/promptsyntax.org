# Implementation adapters

The suite owns expected answers. An implementation adapter only converts a canonical case
into an implementation call and converts the result into the language-neutral adapter
result shape. Adapters must not contain alternate expectations or silently skip cases.

The Rust and TypeScript Core adapters consume the same 101 specification-owned cases in
`conformance/cases/core-parser.json`. Each adapter checks round-trip text, data-plane text,
directive kinds, and diagnostic codes against the canonical expectations. It also emits a
normalized record containing the complete segment tree, directive AST, UTF-8 byte spans,
source slices, and parser diagnostics.

The repository-owned runner compares those normalized records case by case. A mismatch is
a differential finding even when both implementations satisfy the coarser expected fields.
Agreement between two implementations is compatibility evidence, not a substitute for the
specification-owned expectations and not an independent certification claim.

Adapters report canonical UTF-8 byte offsets. The TypeScript adapter converts its native
UTF-16 editor offsets at the boundary, while the Rust parser already exposes byte offsets.
Adapter code contains normalization only. Expected answers remain in the standard corpus.

For the generated differential lane, adapters accept cases that intentionally omit expected
answers and emit one normalized result per JSON line. The repository-owned generator uses
32 syntax families, seed `20270803`, and an exact 100,000-case inventory. The streaming
runner compares one result pair at a time and rejects missing, reordered, duplicated, or
extra generated case IDs.

A Trace producer adapter receives deterministic execution facts and emits a Prompt Trace.
The repository-owned runner separately evaluates it against an independent transcript.
Provider APIs and live model calls are outside the normative adapter protocol because they
are not deterministic.

The current adapter corpus has ten cases. Six valid cases cover kept, authored fallback,
best-effort substitution, refusal, failed boundary calls, and successful boundary calls.
Four negative cases require typed rejection of strict substitution, multiple filled
attempts, missing refusal facts, and a refusal that conflicts with a filled attempt.

The implementation command receives only `trace-producer-input.schema.json` facts. The
runner separately loads `transcript.schema.json` evidence, validates the emitted Trace
structurally and semantically, and checks exact request bytes, actual bound entity, routing
outcome, and boundary outcome. This separation prevents an adapter from copying expected
answers into its output.
