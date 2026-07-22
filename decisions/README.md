# Decision Records

| # | Decision | Chosen | Rejected | Where |
|---|---|---|---|---|
| 1 | Span syntax | `<ps @ref>` single reserved namespace | Reserved words (`<model>`); attribute-only | SPEC §5.1 |
| 2 | Reference grammar | One `@` grammar at all scopes | Per-scope syntaxes; sigil multiplication (@/#) | SPEC §3 p7 |
| 3 | Fulfillment vocabulary | strict/partial/best-effort (FOK/IOC/market) | Literal trading names | SPEC §8.1 |
| 4 | Default policy | Split: strict entity / partial params | All-strict; all-best-effort | SPEC §8.1 |
| 5 | Contingency | Fallback chains on fill failure only | General conditionals | SPEC §9.2 |
| 6 | Precedence | Authority × specificity + non-escalation | Single chain (v0.1, unsafe) | SPEC §10 |
| 7 | Trace shape | Flat segments + provenance steps | Pure flat; full tree | SPEC §12.1 |
| 8 | Turn scope | Tiered + boundary rule | Initial-only; everything-MUST | SPEC §12.1 |
| 9 | Content encoding | Hybrid + materialized export | Always inline; always by-ref | SPEC §12.1 |
| 10 | Oversight | Evidence substrate + external profiles | Fixed audit tier; jurisdiction rules in core | SPEC §12.3 |
| 11 | Policy systems | PEP/PDP seam + external bindings | Policy language in core | SPEC §10.4 |

Full rationale: the spec's decision-record notes and the project's design documents.
