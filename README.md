<h1 align="center">Prompt Syntax (PS)</h1>
<p align="center"><em>Every prompt deserves a receipt.</em></p>
<p align="center">
  <a href="https://promptsyntax.org">promptsyntax.org</a> ·
  <a href="./spec/SPEC.md">Specification</a> ·
  <a href="./spec/SYNTAX-REFERENCE.md">Syntax reference</a> ·
  <a href="./schemas/prompt-trace.schema.json">Trace schema</a>
</p>

---

When you use an AI assistant today, you cannot see what your prompt becomes before it
reaches a model, you cannot guarantee which model or tools actually run, and when the
system quietly swaps a cheaper model or drops a setting you asked for, nothing tells you.
The same `@` you type means three different things across three products. This is not a
minor inconvenience. As AI moves into higher-stakes work — and increasingly runs while
no one is watching — an interface layer that is merely opaque today becomes
infrastructure-grade opacity tomorrow.

**Prompt Syntax is a proposal that the chat box should be a designed language, not an
accidental one.**

## What it is

PS is a **vendor-neutral specification** for expressing *authorized prompt-execution
intent*, together with a conformance protocol — the **Prompt Trace**, or *execution
receipt* — reporting how that intent was resolved and fulfilled.

Prompts stay natural language. Optional **syntax islands** add control that degrades
gracefully:

```text
@opus!(temperature: 0.2) limit(wall_time: 5s) else @haiku
Summarize @file:q3-report.md /concise
```

A novice reads that as a sentence. It also carries a strict model binding, a latency
budget, a fallback route, a deterministic file inclusion, and a skill invocation — each
optional, each honored or reported.

Every request returns a receipt: per requirement, **requested → applied**, with typed
reasons for anything that changed. No silent substitution. No silent drop. No silent
anything.

## Repository layout

| Path | Contents |
|---|---|
| [`spec/SPEC.md`](./spec/SPEC.md) | The specification (four layers: Core / Capabilities / Execution / Trace) |
| [`spec/SYNTAX-REFERENCE.md`](./spec/SYNTAX-REFERENCE.md) | The full syntax on a few pages |
| [`schemas/`](./schemas/) | Normative JSON Schema for the Prompt Trace |
| [`examples/`](./examples/) | Machine-validated example trace |
| [`decisions/`](./decisions/) | Design decision records (with rejected alternatives) |
| [`profiles/`](./profiles/) | Externalized mappings: vendor, oversight, policy bindings |

## Status

**Draft v0.2.1 — pre-implementation. Not yet stable.** A reference implementation and a
formative multi-stakeholder study are in progress; an academic paper is in preparation.
This is a proposal seeking scrutiny, not a finished standard.

## Design principles

Graceful degradation · familiarity borrowing · progressive disclosure · content safety ·
contract-not-presentation · minimal reserved surface · one reference grammar ·
non-escalation · intent portability (not execution portability) · security by provenance,
not by escaping.

## Conformance

Per-layer, versioned, and named — e.g. `PS/Core 0.2 + PS/Trace 0.2 (user tier,
routing-complete/assembly-partial)`. **Unqualified conformance claims are
non-conformant:** an implementation must state what it covers.

## Contributing

This is a draft seeking exactly the scrutiny that hardens a specification. Feedback is
welcome — especially from platform operators, enterprise administrators, compliance
practitioners, and anyone who has been silently rerouted and wanted to know why. Open an
issue; substantive design proposals should follow the decision-record format (context,
options, chosen, rejected-with-reasons). See [`decisions/`](./decisions/) for the
pattern.

## Website

This repository is also the source of [promptsyntax.org](https://promptsyntax.org) — a
SolidJS + Rsbuild single-page app (`src/`, styled with Tailwind CSS 4 and
[@pathscale/ui](https://github.com/pathscale/ui)). The `/spec` and `/syntax` pages render
the same documents that live in [`spec/`](./spec/).

```sh
bun install
bun run dev     # dev server on :3000
bun run build   # typecheck + production build into dist/
```

Pushes to `master` build and deploy to BunnyCDN via
[`.github/workflows/pipeline.yml`](./.github/workflows/pipeline.yml).

## License

Specification text and schemas: [CC BY 4.0](./LICENSE) (proposed — confirm before
relying on it). The intent is maximal openness: PS is only useful if anyone can
implement it.
