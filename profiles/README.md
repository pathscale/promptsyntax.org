# Profiles (externalized mappings)

The core spec defines interfaces + semantics; stakeholder-specific mappings live here and
version independently ("the externalization pattern"):

- `vendor/`, parameter normalization profiles (e.g. vendor-profile/anthropic-2026-07)
- `oversight/`, jurisdiction/framework profiles mapping the evidence substrate
  (e.g. an EU-AI-Act Art. 12 profile), PLACEHOLDER, governance TBD (spec OQ#9)
- `policy/`, PDP bindings (OPA/Rego, Cedar), PLACEHOLDER (spec OQ#10)
- `transport/`, wire encodings of the normative JSON trace model, PROPOSED
  (first profile: TOON, `transport/toon.md`; decision record 2026-08-23)
