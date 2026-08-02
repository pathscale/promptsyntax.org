# PromptSyntax conformance runner

This stable-Rust binary checks the language-independent corpus owned by this repository.
It does not depend on either PromptSyntax parser implementation and never embeds expected
answers. The specification and versioned vectors remain the oracle.

From the repository root:

```bash
cargo run --manifest-path conformance/runner/Cargo.toml -- \
  check-requirements conformance/requirements.json

cargo run --manifest-path conformance/runner/Cargo.toml -- \
  check-schema schemas/prompt-trace-0.3-draft.schema.json

cargo run --manifest-path conformance/runner/Cargo.toml -- \
  validate-instance schemas/prompt-trace-0.3-draft.schema.json \
  examples/prompt-trace-0.3-draft.example.json

cargo run --manifest-path conformance/runner/Cargo.toml -- run-suite .

cargo run --manifest-path conformance/runner/Cargo.toml -- \
  compare-core-adapters conformance/cases/core-parser.json \
  /tmp/promptsyntax-rs-core.json /tmp/promptsyntax-ts-core.json

cargo run --release --manifest-path conformance/runner/Cargo.toml -- \
  generate-core-differential 100000 20270803 > /tmp/core-generated.json

cargo run --release --manifest-path conformance/runner/Cargo.toml -- \
  compare-core-streams 100000 20270803 \
  /tmp/promptsyntax-rs-generated.jsonl /tmp/promptsyntax-ts-generated.jsonl

cargo run --manifest-path conformance/runner/Cargo.toml -- \
  run-trace-producer-adapter . promptsyntax-rs 0.1.0 <commit> \
  /path/to/ps-trace-producer
```

The command emits deterministic JSON and exits with:

- `0` when the input passes the implemented checks;
- `1` when the input produces conformance diagnostics; or
- `2` for invalid command usage or an internal report-serialization error.

`compare-core-adapters` requires two already-produced adapter result documents. It checks
that both ran every canonical case, satisfied the specification-owned expected fields, and
emitted equivalent normalized JSON values for every complete parser output. Implementation
metadata may differ. Case outputs may not.

`generate-core-differential` deterministically constructs syntax from 32 grammar families
without embedding expected parser results. `compare-core-streams` validates the exact
generated ID sequence and compares full normalized results while retaining only one result
from each implementation in memory. The report records the generator version and seed.

`run-trace-producer-adapter` executes every standard-owned producer case. It validates each
input before invoking the implementation, withholds the independent transcript from the
producer, then validates the emitted Trace against both the Trace schema and transcript.
Expected producer rejections must use the registered JSON error envelope and exit status
`1`.

The runner performs no network requests and needs no provider SDK, model credentials,
Python, Node, or Bun. Producing the TypeScript adapter document separately requires Bun.
This is bootstrap tooling for a working draft, not a certification utility.
