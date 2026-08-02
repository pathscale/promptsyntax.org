# Candidate Trace profile

`trace-user-0-3-draft.json` is the frozen candidate scope for suite `0.1.0-rc.1`. It is
pinned to the PR #4 specification commit and is intentionally narrower than full
PromptSyntax conformance.

## R1 through R6 interpretation

- **R1:** segment indices are contiguous and ordered. Trace producer conformance also
  compares their reconstructed bytes with independently supplied request bytes encoded as
  UTF-8. Compilation performs no implicit Unicode normalization or line-ending conversion.
  External bytes come from a digest-checked transcript artifact; missing bytes cannot pass
  producer conformance.
- **R2:** every segment provenance pointer resolves to a step in the same inference.
- **R3:** every step parent resolves in the same inference and every parent chain is
  acyclic.
- **R4:** the user-tier inline threshold is at least 4096 bytes and inline content cannot
  exceed the declared threshold.
- **R5:** an oversight trace declaring `content_mode: materialized` embeds every external
  value and contains no withheld content. The embedded bytes must match declared digest and
  length metadata.
- **R6:** routing coverage is complete, user-initiated assembly is present, internal
  omissions are typed, and every claim names a profile and case families.

## Entity outcomes

- `kept` means the requested, applied, successfully attempted, and routing-bound canonical
  entities agree.
- `fallback` names the first successful step in an explicitly authored route after prior
  fill failures.
- `substituted` is permitted only by an explicitly selected best-effort policy and records
  `ENTITY_SUBSTITUTED` with `venue-operations` authority.
- `refused` records no applied entity and includes typed reason, authority, and recourse.

## Exclusions

The candidate profile excludes proposed standing authoring surfaces, live provider calls,
claims about whether a self-reporting venue is truthful, and released oversight or
integrity-profile conformance. The R5 cases test the materialization rule as an informative
cross-tier requirement, not a complete oversight profile.
