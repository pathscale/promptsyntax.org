# Contributing to Prompt Syntax

Prompt Syntax is a draft specification. It gets better by being attacked.

## How to help
- **Open an issue** for anything: an unclear rule, a missed attack, a vendor affordance PS can't represent, a use case that breaks the model.
- **Design proposals** should use the decision-record format: context, options considered, choice, and, importantly, rejected alternatives with reasons. See `decisions/README.md`.
- **Implementers** are especially wanted. If you build a parser, resolver, or trace emitter, tell us where the spec was ambiguous.

## What we most need input on
See the open-questions queue at the end of `spec/SPEC.md`. Current gaps include identifier
governance, budget measurement profiles, trace-privacy deployment profiles, nested-span
conflict semantics, and the conformance-vs-certification path.

## Ground rules
- Be specific. "This feels wrong" is a start; "this rule fails on input X because Y" is gold.
- Security findings about the spec itself (parser differentials, injection paths, promotion abuse) are the highest-value contributions.
