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
```

The command emits deterministic JSON and exits with:

- `0` when the input passes the implemented checks;
- `1` when the input produces conformance diagnostics; or
- `2` for invalid command usage or an internal report-serialization error.

The runner performs no network requests and needs no provider SDK, model credentials,
Python, Node, or Bun. It is bootstrap tooling for a working draft, not a certification
utility.
