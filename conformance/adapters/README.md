# Implementation adapters

The suite owns expected answers. An implementation adapter only converts a canonical case
into an implementation call and converts the result into the language-neutral adapter
result shape. Adapters must not contain alternate expectations or silently skip cases.

The current Rust and TypeScript parser tests already implement the Core adapter contract:
they consume the same fields in `conformance/cases/core-parser.json` and compare round-trip
text, data-plane text, directive kinds, and diagnostic codes. CI injects that one canonical
file into both implementation checkouts before running their native test commands.

A Trace producer adapter receives deterministic transcript facts and emits a Prompt Trace.
The repository-owned runner then evaluates the emitted trace. Provider APIs and live model
calls are outside the normative adapter protocol because they are not deterministic.
