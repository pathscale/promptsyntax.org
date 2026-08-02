use std::collections::{HashMap, HashSet};
use std::fmt::Write as _;

use serde::Deserialize;
use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::Diagnostic;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ProducerTranscript {
    pub format_version: String,
    pub turn: String,
    pub inferences: Vec<TranscriptInference>,
    pub boundaries: Vec<TranscriptBoundary>,
    pub external_artifacts: Vec<ExternalArtifact>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct TranscriptInference {
    pub id: String,
    pub actual_request_utf8: String,
    pub routing: TranscriptRouting,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct TranscriptRouting {
    pub outcome: String,
    pub bound: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct TranscriptBoundary {
    pub id: String,
    pub outcome: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ExternalArtifact {
    pub sha256: String,
    pub length: usize,
    pub content_utf8: String,
}

struct ArtifactIndex<'a> {
    valid: HashMap<&'a str, &'a ExternalArtifact>,
    invalid: HashSet<&'a str>,
}

enum Reconstructed {
    Bytes(Vec<u8>),
    Unavailable,
    Invalid,
}

#[allow(clippy::too_many_lines)]
pub(crate) fn validate_trace(
    trace: &Value,
    transcript: Option<&ProducerTranscript>,
) -> Vec<Diagnostic> {
    let mut diagnostics = Vec::new();
    let artifacts = build_artifact_index(transcript, &mut diagnostics);

    if let Some(transcript) = transcript {
        if transcript.format_version != "0.1-draft" {
            push(
                &mut diagnostics,
                "TRACE_PRODUCER_FORMAT_UNSUPPORTED",
                "/transcript/format_version",
                "producer transcript format must be 0.1-draft",
            );
        }
        if trace.get("turn").and_then(Value::as_str) != Some(transcript.turn.as_str()) {
            push(
                &mut diagnostics,
                "TRACE_PRODUCER_TURN_MISMATCH",
                "/turn",
                "trace and producer transcript identify different turns",
            );
        }
    }

    let tier = trace
        .get("tier")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let content_mode = trace
        .get("content_mode")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let inline_threshold = trace
        .pointer("/coverage/inline_threshold_bytes")
        .and_then(Value::as_u64)
        .and_then(|value| usize::try_from(value).ok())
        .unwrap_or(0);

    if content_mode == "materialized" && tier != "oversight" {
        push(
            &mut diagnostics,
            "TRACE_R5_MODE_TIER_INVALID",
            "/content_mode",
            "materialized content mode is reserved for oversight exports",
        );
    }

    let transcript_inferences = transcript
        .map(|value| {
            value
                .inferences
                .iter()
                .map(|item| (item.id.as_str(), item))
                .collect::<HashMap<_, _>>()
        })
        .unwrap_or_default();
    let transcript_boundaries = transcript
        .map(|value| {
            value
                .boundaries
                .iter()
                .map(|item| (item.id.as_str(), item))
                .collect::<HashMap<_, _>>()
        })
        .unwrap_or_default();

    let mut seen_events = HashSet::new();
    let mut seen_transcript_inferences = HashSet::new();
    let mut seen_transcript_boundaries = HashSet::new();
    let events = trace
        .get("events")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or_default();

    for (event_index, event) in events.iter().enumerate() {
        let base = format!("/events/{event_index}");
        let event_id = event.get("id").and_then(Value::as_str).unwrap_or_default();
        if !seen_events.insert(event_id) {
            push(
                &mut diagnostics,
                "TRACE_EVENT_ID_DUPLICATE",
                format!("{base}/id"),
                format!("event id {event_id} occurs more than once"),
            );
        }

        match event.get("event").and_then(Value::as_str) {
            Some("inference") => {
                let transcript_fact = transcript_inferences.get(event_id).copied();
                if transcript.is_some() {
                    if transcript_fact.is_some() {
                        seen_transcript_inferences.insert(event_id);
                    } else {
                        push(
                            &mut diagnostics,
                            "TRACE_PRODUCER_INFERENCE_MISSING",
                            format!("{base}/id"),
                            "no independent producer fact exists for this inference",
                        );
                    }
                }
                validate_inference(
                    event,
                    &base,
                    inline_threshold,
                    content_mode,
                    &artifacts,
                    transcript_fact,
                    &mut diagnostics,
                );
            }
            Some("boundary") => {
                let transcript_fact = transcript_boundaries.get(event_id).copied();
                if transcript.is_some() {
                    if let Some(fact) = transcript_fact {
                        seen_transcript_boundaries.insert(event_id);
                        if event.get("outcome").and_then(Value::as_str)
                            != Some(fact.outcome.as_str())
                        {
                            push(
                                &mut diagnostics,
                                "TRACE_PRODUCER_BOUNDARY_MISMATCH",
                                format!("{base}/outcome"),
                                "trace boundary outcome differs from the producer transcript",
                            );
                        }
                    } else {
                        push(
                            &mut diagnostics,
                            "TRACE_PRODUCER_BOUNDARY_MISSING",
                            format!("{base}/id"),
                            "no independent producer fact exists for this boundary event",
                        );
                    }
                }
                validate_boundary(event, &base, content_mode, &artifacts, &mut diagnostics);
            }
            _ => {}
        }
    }

    if let Some(transcript) = transcript {
        for fact in &transcript.inferences {
            if !seen_transcript_inferences.contains(fact.id.as_str()) {
                push(
                    &mut diagnostics,
                    "TRACE_PRODUCER_TRACE_EVENT_MISSING",
                    "/events",
                    format!("producer inference {} is absent from the trace", fact.id),
                );
            }
        }
        for fact in &transcript.boundaries {
            if !seen_transcript_boundaries.contains(fact.id.as_str()) {
                push(
                    &mut diagnostics,
                    "TRACE_PRODUCER_TRACE_EVENT_MISSING",
                    "/events",
                    format!("producer boundary {} is absent from the trace", fact.id),
                );
            }
        }
    }

    diagnostics.sort_by(|left, right| {
        left.pointer
            .cmp(&right.pointer)
            .then_with(|| left.code.cmp(&right.code))
            .then_with(|| left.message.cmp(&right.message))
    });
    diagnostics
}

fn validate_inference(
    inference: &Value,
    base: &str,
    inline_threshold: usize,
    content_mode: &str,
    artifacts: &ArtifactIndex<'_>,
    transcript: Option<&TranscriptInference>,
    diagnostics: &mut Vec<Diagnostic>,
) {
    validate_provenance(inference, base, diagnostics);
    validate_routing(inference, base, transcript, diagnostics);

    let Some(segments) = inference.get("segments").and_then(Value::as_array) else {
        return;
    };
    let reconstructed = reconstruct_segments(
        segments,
        base,
        inline_threshold,
        content_mode,
        artifacts,
        diagnostics,
    );

    if let Some(transcript) = transcript {
        match reconstructed {
            Reconstructed::Bytes(bytes) => {
                if bytes != transcript.actual_request_utf8.as_bytes() {
                    push(
                        diagnostics,
                        "TRACE_R1_REQUEST_BYTES_MISMATCH",
                        format!("{base}/segments"),
                        "reconstructed segment bytes differ from the independently supplied request bytes",
                    );
                }
            }
            Reconstructed::Unavailable => push(
                diagnostics,
                "TRACE_R1_CONTENT_UNAVAILABLE",
                format!("{base}/segments"),
                "producer conformance cannot reconstruct all request bytes",
            ),
            Reconstructed::Invalid => {}
        }
    }
}

fn validate_provenance(inference: &Value, base: &str, diagnostics: &mut Vec<Diagnostic>) {
    let steps = inference
        .get("steps")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or_default();
    let mut parents = HashMap::new();
    for (step_index, step) in steps.iter().enumerate() {
        let Some(id) = step.get("id").and_then(Value::as_str) else {
            continue;
        };
        if parents
            .insert(id, step.get("parent").and_then(Value::as_str))
            .is_some()
        {
            push(
                diagnostics,
                "TRACE_STEP_ID_DUPLICATE",
                format!("{base}/steps/{step_index}/id"),
                format!("step id {id} occurs more than once"),
            );
        }
    }

    for (step_index, step) in steps.iter().enumerate() {
        if let Some(parent) = step.get("parent").and_then(Value::as_str) {
            if !parents.contains_key(parent) {
                push(
                    diagnostics,
                    "TRACE_R3_PARENT_NOT_FOUND",
                    format!("{base}/steps/{step_index}/parent"),
                    format!("parent step {parent} does not exist in this inference"),
                );
            }
        }
    }

    for id in parents.keys().copied() {
        let mut path = HashSet::new();
        let mut current = Some(id);
        while let Some(step_id) = current {
            if !path.insert(step_id) {
                push(
                    diagnostics,
                    "TRACE_R3_STEP_CYCLE",
                    format!("{base}/steps"),
                    format!("provenance chain containing {step_id} is cyclic"),
                );
                break;
            }
            current = parents.get(step_id).copied().flatten();
        }
    }

    if let Some(segments) = inference.get("segments").and_then(Value::as_array) {
        for (segment_index, segment) in segments.iter().enumerate() {
            if let Some(step) = segment.get("step").and_then(Value::as_str) {
                if !parents.contains_key(step) {
                    push(
                        diagnostics,
                        "TRACE_R2_STEP_NOT_FOUND",
                        format!("{base}/segments/{segment_index}/step"),
                        format!("segment provenance step {step} does not exist in this inference"),
                    );
                }
            }
        }
    }
}

fn reconstruct_segments(
    segments: &[Value],
    base: &str,
    inline_threshold: usize,
    content_mode: &str,
    artifacts: &ArtifactIndex<'_>,
    diagnostics: &mut Vec<Diagnostic>,
) -> Reconstructed {
    let mut bytes = Vec::new();
    let mut unavailable = false;
    let mut invalid = false;
    let mut segment_ids = HashSet::new();

    for (segment_index, segment) in segments.iter().enumerate() {
        let segment_base = format!("{base}/segments/{segment_index}");
        if segment.get("i").and_then(Value::as_u64) != u64::try_from(segment_index).ok() {
            push(
                diagnostics,
                "TRACE_R1_SEGMENT_INDEX_INVALID",
                format!("{segment_base}/i"),
                "segment index must equal its zero-based list position",
            );
        }
        if let Some(id) = segment.get("id").and_then(Value::as_str) {
            if !segment_ids.insert(id) {
                push(
                    diagnostics,
                    "TRACE_SEGMENT_ID_DUPLICATE",
                    format!("{segment_base}/id"),
                    format!("segment id {id} occurs more than once"),
                );
            }
        }

        let Some(content) = segment.get("content") else {
            continue;
        };
        match resolve_content(
            content,
            &format!("{segment_base}/content"),
            inline_threshold,
            content_mode,
            artifacts,
            diagnostics,
        ) {
            Reconstructed::Bytes(mut content_bytes) => bytes.append(&mut content_bytes),
            Reconstructed::Unavailable => unavailable = true,
            Reconstructed::Invalid => invalid = true,
        }
    }

    if invalid {
        Reconstructed::Invalid
    } else if unavailable {
        Reconstructed::Unavailable
    } else {
        Reconstructed::Bytes(bytes)
    }
}

fn resolve_content(
    content: &Value,
    pointer: &str,
    inline_threshold: usize,
    content_mode: &str,
    artifacts: &ArtifactIndex<'_>,
    diagnostics: &mut Vec<Diagnostic>,
) -> Reconstructed {
    match content.get("state").and_then(Value::as_str) {
        Some("inline") => {
            let text = content
                .get("text")
                .and_then(Value::as_str)
                .unwrap_or_default();
            if text.len() > inline_threshold {
                push(
                    diagnostics,
                    "TRACE_INLINE_CONTENT_EXCEEDS_THRESHOLD",
                    pointer,
                    "inline content exceeds the declared UTF-8 byte threshold",
                );
            }
            Reconstructed::Bytes(text.as_bytes().to_vec())
        }
        Some("external") => {
            let sha256 = content
                .get("sha256")
                .and_then(Value::as_str)
                .unwrap_or_default();
            let declared_length = content
                .get("length")
                .and_then(Value::as_u64)
                .and_then(|value| usize::try_from(value).ok())
                .unwrap_or(0);

            if let Some(text) = content
                .pointer("/materialized/text")
                .and_then(Value::as_str)
            {
                return validate_content_bytes(
                    text.as_bytes(),
                    sha256,
                    declared_length,
                    pointer,
                    diagnostics,
                );
            }

            if content_mode == "materialized" {
                push(
                    diagnostics,
                    "TRACE_R5_MATERIALIZATION_REQUIRED",
                    pointer,
                    "materialized export contains an unresolved external content reference",
                );
                return Reconstructed::Invalid;
            }

            if artifacts.invalid.contains(sha256) {
                return Reconstructed::Invalid;
            }
            if let Some(artifact) = artifacts.valid.get(sha256) {
                return validate_content_bytes(
                    artifact.content_utf8.as_bytes(),
                    sha256,
                    declared_length,
                    pointer,
                    diagnostics,
                );
            }
            Reconstructed::Unavailable
        }
        Some("withheld") => {
            if content_mode == "materialized" {
                push(
                    diagnostics,
                    "TRACE_R5_MATERIALIZATION_REQUIRED",
                    pointer,
                    "materialized export cannot contain withheld content",
                );
                Reconstructed::Invalid
            } else {
                Reconstructed::Unavailable
            }
        }
        _ => Reconstructed::Invalid,
    }
}

fn validate_content_bytes(
    bytes: &[u8],
    declared_sha256: &str,
    declared_length: usize,
    pointer: &str,
    diagnostics: &mut Vec<Diagnostic>,
) -> Reconstructed {
    let mut invalid = false;
    if bytes.len() != declared_length {
        push(
            diagnostics,
            "TRACE_CONTENT_LENGTH_MISMATCH",
            format!("{pointer}/length"),
            "content UTF-8 byte length differs from its declared length",
        );
        invalid = true;
    }
    if sha256_hex(bytes) != declared_sha256 {
        push(
            diagnostics,
            "TRACE_CONTENT_DIGEST_MISMATCH",
            format!("{pointer}/sha256"),
            "content bytes differ from their declared SHA-256 digest",
        );
        invalid = true;
    }

    if invalid {
        Reconstructed::Invalid
    } else {
        Reconstructed::Bytes(bytes.to_vec())
    }
}

fn validate_boundary(
    event: &Value,
    base: &str,
    content_mode: &str,
    artifacts: &ArtifactIndex<'_>,
    diagnostics: &mut Vec<Diagnostic>,
) {
    for field in ["sent", "received"] {
        if let Some(content) = event.get(field) {
            let _ = resolve_content(
                content,
                &format!("{base}/{field}"),
                usize::MAX,
                content_mode,
                artifacts,
                diagnostics,
            );
        }
    }
}

fn validate_routing(
    inference: &Value,
    base: &str,
    transcript: Option<&TranscriptInference>,
    diagnostics: &mut Vec<Diagnostic>,
) {
    let Some(routing) = inference.get("routing") else {
        return;
    };
    let outcome = routing
        .get("outcome")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let policy = routing
        .get("policy")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let bound = routing.get("bound").and_then(Value::as_str);
    let attempts = routing
        .get("attempts")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or_default();
    let filled = attempts
        .iter()
        .enumerate()
        .filter(|(_, attempt)| attempt.get("outcome").and_then(Value::as_str) == Some("filled"))
        .collect::<Vec<_>>();

    let successful_bound = if outcome == "invoked" && filled.len() == 1 {
        filled[0].1.get("bound").and_then(Value::as_str)
    } else {
        None
    };

    if (outcome == "invoked" && filled.len() != 1) || (outcome == "refused" && !filled.is_empty()) {
        push(
            diagnostics,
            "TRACE_ROUTING_ATTEMPT_INVALID",
            format!("{base}/routing/attempts"),
            "routing outcome and successful attempt count disagree",
        );
    }
    if outcome == "invoked" && bound != successful_bound {
        push(
            diagnostics,
            "TRACE_ROUTING_BOUND_MISMATCH",
            format!("{base}/routing/bound"),
            "routing bound entity differs from the successful attempt",
        );
    }

    if let Some(transcript) = transcript {
        if transcript.routing.outcome != outcome {
            push(
                diagnostics,
                "TRACE_PRODUCER_ROUTING_OUTCOME_MISMATCH",
                format!("{base}/routing/outcome"),
                "trace routing outcome differs from the producer transcript",
            );
        }
        if transcript.routing.bound.as_deref() != bound {
            push(
                diagnostics,
                "TRACE_PRODUCER_BOUND_MISMATCH",
                format!("{base}/routing/bound"),
                "trace bound entity differs from the independently observed entity",
            );
        }
    }

    if let Some(fill) = routing.get("fill").and_then(Value::as_array) {
        for (fill_index, entry) in fill.iter().enumerate() {
            if entry.get("kind").and_then(Value::as_str) != Some("entity") {
                continue;
            }
            let pointer = format!("{base}/routing/fill/{fill_index}");
            validate_entity_fill(
                entry,
                &pointer,
                policy,
                outcome,
                bound,
                attempts,
                diagnostics,
            );
        }
    }

    validate_resolution(inference, base, outcome, successful_bound, diagnostics);
}

#[allow(clippy::too_many_lines)]
fn validate_entity_fill(
    fill: &Value,
    pointer: &str,
    routing_policy: &str,
    routing_outcome: &str,
    routing_bound: Option<&str>,
    attempts: &[Value],
    diagnostics: &mut Vec<Diagnostic>,
) {
    let status = fill
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let requested = fill
        .get("requested")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let applied = fill.get("applied").and_then(Value::as_str);
    let policy = fill
        .get("policy")
        .and_then(Value::as_str)
        .unwrap_or_default();

    if policy != routing_policy {
        push(
            diagnostics,
            "TRACE_ENTITY_POLICY_MISMATCH",
            format!("{pointer}/policy"),
            "entity fill policy differs from the routing policy",
        );
    }

    match status {
        "kept" => {
            if applied != Some(requested) {
                push(
                    diagnostics,
                    "TRACE_ENTITY_KEPT_MISMATCH",
                    format!("{pointer}/applied"),
                    "kept status requires requested and applied canonical entities to match",
                );
            }
            if applied != routing_bound {
                push(
                    diagnostics,
                    "TRACE_ROUTING_FILL_MISMATCH",
                    format!("{pointer}/applied"),
                    "entity fill differs from the routing bound entity",
                );
            }
        }
        "fallback" => {
            let step = fill
                .get("route_step")
                .and_then(Value::as_u64)
                .and_then(|value| usize::try_from(value).ok());
            let step_valid = step.is_some_and(|index| {
                attempts.get(index).is_some_and(|attempt| {
                    attempt.get("outcome").and_then(Value::as_str) == Some("filled")
                        && attempt.get("bound").and_then(Value::as_str) == applied
                }) && attempts[..index].iter().all(|attempt| {
                    matches!(
                        attempt.get("outcome").and_then(Value::as_str),
                        Some("failed" | "blocked")
                    )
                })
            });
            if !step_valid {
                push(
                    diagnostics,
                    "TRACE_ENTITY_FALLBACK_STEP_INVALID",
                    format!("{pointer}/route_step"),
                    "fallback route_step does not identify the first successful legal attempt",
                );
            }
            if applied != routing_bound {
                push(
                    diagnostics,
                    "TRACE_ROUTING_FILL_MISMATCH",
                    format!("{pointer}/applied"),
                    "fallback fill differs from the routing bound entity",
                );
            }
        }
        "substituted" => {
            let authority = fill
                .get("deciding_authority")
                .and_then(Value::as_str)
                .unwrap_or_default();
            if policy != "best-effort"
                || authority != "venue-operations"
                || applied == Some(requested)
            {
                push(
                    diagnostics,
                    "TRACE_ENTITY_SUBSTITUTION_NOT_AUTHORIZED",
                    pointer,
                    "substitution requires explicit best-effort policy, a changed entity, and venue-operations authority",
                );
            }
            if applied != routing_bound {
                push(
                    diagnostics,
                    "TRACE_ROUTING_FILL_MISMATCH",
                    format!("{pointer}/applied"),
                    "substitution fill differs from the routing bound entity",
                );
            }
        }
        "refused" if routing_outcome != "refused" || applied.is_some() => push(
            diagnostics,
            "TRACE_ENTITY_REFUSAL_MISMATCH",
            pointer,
            "refused entity fill requires a refused routing outcome and no applied entity",
        ),
        _ => {}
    }
}

fn validate_resolution(
    inference: &Value,
    base: &str,
    routing_outcome: &str,
    successful_bound: Option<&str>,
    diagnostics: &mut Vec<Diagnostic>,
) {
    let bindings = inference
        .pointer("/resolution/bindings")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or_default();
    for (binding_index, binding) in bindings.iter().enumerate() {
        if let Some(bound) = binding.get("bound").and_then(Value::as_str) {
            if !is_pinned_canonical_entity(bound) {
                push(
                    diagnostics,
                    "TRACE_RESOLUTION_BINDING_UNPINNED",
                    format!("{base}/resolution/bindings/{binding_index}/bound"),
                    "resolution binding is not a canonical pinned entity identifier",
                );
            }
        }
    }

    if routing_outcome == "invoked" {
        if let Some(successful_bound) = successful_bound {
            if !bindings.iter().any(|binding| {
                binding.get("bound").and_then(Value::as_str) == Some(successful_bound)
            }) {
                push(
                    diagnostics,
                    "TRACE_RESOLUTION_BOUND_MISSING",
                    format!("{base}/resolution/bindings"),
                    "resolution report does not contain the successfully invoked entity",
                );
            }
        }
    } else if inference
        .pointer("/resolution/refusals")
        .and_then(Value::as_array)
        .is_none_or(Vec::is_empty)
    {
        push(
            diagnostics,
            "TRACE_RESOLUTION_REFUSAL_MISSING",
            format!("{base}/resolution/refusals"),
            "refused routing outcome has no typed resolution refusal",
        );
    }
}

fn build_artifact_index<'a>(
    transcript: Option<&'a ProducerTranscript>,
    diagnostics: &mut Vec<Diagnostic>,
) -> ArtifactIndex<'a> {
    let mut valid = HashMap::new();
    let mut invalid = HashSet::new();
    let Some(transcript) = transcript else {
        return ArtifactIndex { valid, invalid };
    };

    for (index, artifact) in transcript.external_artifacts.iter().enumerate() {
        let mut artifact_valid = true;
        if sha256_hex(artifact.content_utf8.as_bytes()) != artifact.sha256 {
            push(
                diagnostics,
                "TRACE_CONTENT_DIGEST_MISMATCH",
                format!("/transcript/external_artifacts/{index}/sha256"),
                "external artifact bytes differ from their declared SHA-256 digest",
            );
            artifact_valid = false;
        }
        if artifact.content_utf8.len() != artifact.length {
            push(
                diagnostics,
                "TRACE_CONTENT_LENGTH_MISMATCH",
                format!("/transcript/external_artifacts/{index}/length"),
                "external artifact UTF-8 byte length differs from its declared length",
            );
            artifact_valid = false;
        }
        if valid.contains_key(artifact.sha256.as_str())
            || invalid.contains(artifact.sha256.as_str())
        {
            push(
                diagnostics,
                "TRACE_PRODUCER_ARTIFACT_DUPLICATE",
                format!("/transcript/external_artifacts/{index}/sha256"),
                "external artifact digest occurs more than once",
            );
            artifact_valid = false;
        }

        if artifact_valid {
            valid.insert(artifact.sha256.as_str(), artifact);
        } else {
            invalid.insert(artifact.sha256.as_str());
        }
    }

    ArtifactIndex { valid, invalid }
}

fn is_pinned_canonical_entity(value: &str) -> bool {
    let Some((namespace, version)) = value.rsplit_once('@') else {
        return false;
    };
    !version.is_empty() && namespace.contains(':') && namespace.contains('/')
}

fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    let mut output = String::with_capacity(64);
    for byte in digest {
        write!(&mut output, "{byte:02x}").expect("writing to a String cannot fail");
    }
    output
}

fn push(
    diagnostics: &mut Vec<Diagnostic>,
    code: &str,
    pointer: impl Into<String>,
    message: impl Into<String>,
) {
    diagnostics.push(Diagnostic {
        code: code.to_owned(),
        pointer: pointer.into(),
        message: message.into(),
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_kept_fixture_without_semantic_diagnostics() {
        let trace: Value =
            serde_json::from_str(include_str!("../../fixtures/trace-user-kept.json"))
                .expect("valid fixture");
        assert!(validate_trace(&trace, None).is_empty());
    }

    #[test]
    fn detects_request_byte_mismatch() {
        let trace: Value =
            serde_json::from_str(include_str!("../../fixtures/trace-user-kept.json"))
                .expect("valid fixture");
        let transcript = ProducerTranscript {
            format_version: "0.1-draft".to_owned(),
            turn: "turn-example-001".to_owned(),
            inferences: vec![TranscriptInference {
                id: "inference-001".to_owned(),
                actual_request_utf8: "different".to_owned(),
                routing: TranscriptRouting {
                    outcome: "invoked".to_owned(),
                    bound: Some("model:example/atlas-4@2026-08-01".to_owned()),
                },
            }],
            boundaries: Vec::new(),
            external_artifacts: Vec::new(),
        };
        let diagnostics = validate_trace(&trace, Some(&transcript));
        assert!(
            diagnostics
                .iter()
                .any(|item| item.code == "TRACE_R1_REQUEST_BYTES_MISMATCH")
        );
    }
}
