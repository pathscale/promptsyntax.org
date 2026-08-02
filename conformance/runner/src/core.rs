use std::collections::BTreeMap;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{Diagnostic, GeneratorMetadata};

const SUPPORTED_FORMAT: &str = "0.1-draft";

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct CoreDifferentialReport {
    pub format_version: String,
    pub target: String,
    pub generator: Option<GeneratorMetadata>,
    pub compatible: bool,
    pub left: Option<Implementation>,
    pub right: Option<Implementation>,
    pub case_count: usize,
    pub matched_case_count: usize,
    pub diagnostics: Vec<Diagnostic>,
}

impl CoreDifferentialReport {
    #[must_use]
    pub fn invalid_input(code: &str, message: impl Into<String>) -> Self {
        Self {
            format_version: SUPPORTED_FORMAT.to_owned(),
            target: "core-parser-differential".to_owned(),
            generator: None,
            compatible: false,
            left: None,
            right: None,
            case_count: 0,
            matched_case_count: 0,
            diagnostics: vec![Diagnostic {
                code: code.to_owned(),
                pointer: String::new(),
                message: message.into(),
            }],
        }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Implementation {
    pub id: String,
    pub version: String,
    pub commit: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct AdapterResult {
    format_version: String,
    target: String,
    implementation: Implementation,
    results: Vec<CaseResult>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct AdapterStreamHeader {
    format_version: String,
    target: String,
    implementation: Implementation,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct CaseResult {
    case_id: String,
    conformant: bool,
    diagnostics: Vec<String>,
    output: Value,
}

#[derive(Debug, Deserialize)]
struct CanonicalCase {
    id: String,
}

#[must_use]
#[allow(clippy::too_many_lines)]
pub fn compare_core_adapters_json(
    cases_input: &[u8],
    left_input: &[u8],
    right_input: &[u8],
) -> CoreDifferentialReport {
    let cases = match serde_json::from_slice::<Vec<CanonicalCase>>(cases_input) {
        Ok(cases) => cases,
        Err(error) => {
            return CoreDifferentialReport::invalid_input(
                "CORE_CASES_JSON_INVALID",
                error.to_string(),
            );
        }
    };
    let left = match serde_json::from_slice::<AdapterResult>(left_input) {
        Ok(result) => result,
        Err(error) => {
            return CoreDifferentialReport::invalid_input(
                "LEFT_ADAPTER_JSON_INVALID",
                error.to_string(),
            );
        }
    };
    let right = match serde_json::from_slice::<AdapterResult>(right_input) {
        Ok(result) => result,
        Err(error) => {
            return CoreDifferentialReport::invalid_input(
                "RIGHT_ADAPTER_JSON_INVALID",
                error.to_string(),
            );
        }
    };

    let left_implementation = left.implementation.clone();
    let right_implementation = right.implementation.clone();
    let mut diagnostics = Vec::new();
    let canonical_ids = index_canonical_cases(cases, &mut diagnostics);
    check_envelope(&left, "left", &mut diagnostics);
    check_envelope(&right, "right", &mut diagnostics);
    if left.implementation == right.implementation {
        diagnostics.push(Diagnostic {
            code: "CORE_ADAPTER_IMPLEMENTATIONS_IDENTICAL".to_owned(),
            pointer: "/implementation".to_owned(),
            message: "differential comparison requires two distinct implementations".to_owned(),
        });
    }

    let left_results = index_results(left.results, "left", &mut diagnostics);
    let right_results = index_results(right.results, "right", &mut diagnostics);
    let mut matched_case_count = 0;

    for case_id in &canonical_ids {
        let pointer = format!("/results/{case_id}");
        let left_case = left_results.get(case_id);
        let right_case = right_results.get(case_id);
        if left_case.is_none() {
            diagnostics.push(Diagnostic {
                code: "CORE_CASE_MISSING_LEFT".to_owned(),
                pointer: pointer.clone(),
                message: format!("canonical case {case_id} is absent from the left adapter output"),
            });
        }
        if right_case.is_none() {
            diagnostics.push(Diagnostic {
                code: "CORE_CASE_MISSING_RIGHT".to_owned(),
                pointer: pointer.clone(),
                message: format!(
                    "canonical case {case_id} is absent from the right adapter output"
                ),
            });
        }
        let (Some(left_case), Some(right_case)) = (left_case, right_case) else {
            continue;
        };
        if !left_case.conformant {
            diagnostics.push(Diagnostic {
                code: "CORE_CASE_NONCONFORMANT_LEFT".to_owned(),
                pointer: pointer.clone(),
                message: format!(
                    "left adapter rejected {case_id}: {}",
                    left_case.diagnostics.join(", ")
                ),
            });
        }
        if !right_case.conformant {
            diagnostics.push(Diagnostic {
                code: "CORE_CASE_NONCONFORMANT_RIGHT".to_owned(),
                pointer: pointer.clone(),
                message: format!(
                    "right adapter rejected {case_id}: {}",
                    right_case.diagnostics.join(", ")
                ),
            });
        }
        if left_case.output != right_case.output {
            diagnostics.push(Diagnostic {
                code: "CORE_OUTPUT_DIFFERENTIAL".to_owned(),
                pointer,
                message: format!("normalized parser outputs differ for case {case_id}"),
            });
            continue;
        }
        matched_case_count += 1;
    }

    for case_id in left_results.keys() {
        if !canonical_ids.contains(case_id) {
            diagnostics.push(Diagnostic {
                code: "CORE_CASE_UNEXPECTED_LEFT".to_owned(),
                pointer: format!("/results/{case_id}"),
                message: format!("left adapter emitted non-canonical case {case_id}"),
            });
        }
    }
    for case_id in right_results.keys() {
        if !canonical_ids.contains(case_id) {
            diagnostics.push(Diagnostic {
                code: "CORE_CASE_UNEXPECTED_RIGHT".to_owned(),
                pointer: format!("/results/{case_id}"),
                message: format!("right adapter emitted non-canonical case {case_id}"),
            });
        }
    }

    let case_count = canonical_ids.len();
    CoreDifferentialReport {
        format_version: SUPPORTED_FORMAT.to_owned(),
        target: "core-parser-differential".to_owned(),
        generator: None,
        compatible: diagnostics.is_empty(),
        left: Some(left_implementation),
        right: Some(right_implementation),
        case_count,
        matched_case_count,
        diagnostics,
    }
}

/// Compare two normalized JSON Lines adapter streams in bounded memory.
///
/// # Errors
///
/// File and JSON errors are represented in the returned non-compatible report rather than
/// returned separately.
#[must_use]
pub fn compare_core_adapter_streams(
    expected_case_count: usize,
    seed: u64,
    left_path: &Path,
    right_path: &Path,
) -> CoreDifferentialReport {
    let left = match File::open(left_path) {
        Ok(file) => BufReader::new(file),
        Err(error) => {
            return invalid_generated(
                expected_case_count,
                seed,
                "LEFT_ADAPTER_READ_FAILED",
                error.to_string(),
            );
        }
    };
    let right = match File::open(right_path) {
        Ok(file) => BufReader::new(file),
        Err(error) => {
            return invalid_generated(
                expected_case_count,
                seed,
                "RIGHT_ADAPTER_READ_FAILED",
                error.to_string(),
            );
        }
    };
    compare_core_adapter_readers(expected_case_count, seed, left, right)
}

#[allow(clippy::too_many_lines)]
fn compare_core_adapter_readers(
    expected_case_count: usize,
    seed: u64,
    mut left: impl BufRead,
    mut right: impl BufRead,
) -> CoreDifferentialReport {
    let left_header = match read_json_line::<AdapterStreamHeader>(&mut left) {
        Ok(Some(header)) => header,
        Ok(None) => {
            return invalid_generated(
                expected_case_count,
                seed,
                "LEFT_ADAPTER_JSON_INVALID",
                "left adapter stream has no header",
            );
        }
        Err(error) => {
            return invalid_generated(
                expected_case_count,
                seed,
                "LEFT_ADAPTER_JSON_INVALID",
                error,
            );
        }
    };
    let right_header = match read_json_line::<AdapterStreamHeader>(&mut right) {
        Ok(Some(header)) => header,
        Ok(None) => {
            return invalid_generated(
                expected_case_count,
                seed,
                "RIGHT_ADAPTER_JSON_INVALID",
                "right adapter stream has no header",
            );
        }
        Err(error) => {
            return invalid_generated(
                expected_case_count,
                seed,
                "RIGHT_ADAPTER_JSON_INVALID",
                error,
            );
        }
    };
    let mut diagnostics = Vec::new();
    check_stream_header(&left_header, "left", &mut diagnostics);
    check_stream_header(&right_header, "right", &mut diagnostics);
    if left_header.implementation == right_header.implementation {
        diagnostics.push(Diagnostic {
            code: "CORE_ADAPTER_IMPLEMENTATIONS_IDENTICAL".to_owned(),
            pointer: "/implementation".to_owned(),
            message: "differential comparison requires two distinct implementations".to_owned(),
        });
    }

    let mut matched_case_count = 0;
    for index in 0..expected_case_count {
        let case_id = format!("core-generated-{index:06}");
        let left_case = match read_json_line::<CaseResult>(&mut left) {
            Ok(Some(case)) => Some(case),
            Ok(None) => {
                diagnostics.push(Diagnostic {
                    code: "CORE_CASE_MISSING_LEFT".to_owned(),
                    pointer: format!("/results/{case_id}"),
                    message: format!("left adapter stream ended before {case_id}"),
                });
                None
            }
            Err(error) => {
                diagnostics.push(Diagnostic {
                    code: "LEFT_ADAPTER_JSON_INVALID".to_owned(),
                    pointer: format!("/results/{case_id}"),
                    message: error,
                });
                None
            }
        };
        let right_case = match read_json_line::<CaseResult>(&mut right) {
            Ok(Some(case)) => Some(case),
            Ok(None) => {
                diagnostics.push(Diagnostic {
                    code: "CORE_CASE_MISSING_RIGHT".to_owned(),
                    pointer: format!("/results/{case_id}"),
                    message: format!("right adapter stream ended before {case_id}"),
                });
                None
            }
            Err(error) => {
                diagnostics.push(Diagnostic {
                    code: "RIGHT_ADAPTER_JSON_INVALID".to_owned(),
                    pointer: format!("/results/{case_id}"),
                    message: error,
                });
                None
            }
        };
        let (Some(left_case), Some(right_case)) = (left_case, right_case) else {
            break;
        };
        let pointer = format!("/results/{case_id}");
        let mut inventory_matches = true;
        if left_case.case_id != case_id {
            diagnostics.push(Diagnostic {
                code: "CORE_CASE_UNEXPECTED_LEFT".to_owned(),
                pointer: pointer.clone(),
                message: format!(
                    "left adapter emitted {} where {case_id} was required",
                    left_case.case_id
                ),
            });
            inventory_matches = false;
        }
        if right_case.case_id != case_id {
            diagnostics.push(Diagnostic {
                code: "CORE_CASE_UNEXPECTED_RIGHT".to_owned(),
                pointer: pointer.clone(),
                message: format!(
                    "right adapter emitted {} where {case_id} was required",
                    right_case.case_id
                ),
            });
            inventory_matches = false;
        }
        if !left_case.conformant {
            diagnostics.push(Diagnostic {
                code: "CORE_CASE_NONCONFORMANT_LEFT".to_owned(),
                pointer: pointer.clone(),
                message: format!(
                    "left adapter rejected {case_id}: {}",
                    left_case.diagnostics.join(", ")
                ),
            });
        }
        if !right_case.conformant {
            diagnostics.push(Diagnostic {
                code: "CORE_CASE_NONCONFORMANT_RIGHT".to_owned(),
                pointer: pointer.clone(),
                message: format!(
                    "right adapter rejected {case_id}: {}",
                    right_case.diagnostics.join(", ")
                ),
            });
        }
        if left_case.output != right_case.output {
            diagnostics.push(Diagnostic {
                code: "CORE_OUTPUT_DIFFERENTIAL".to_owned(),
                pointer,
                message: format!("normalized parser outputs differ for case {case_id}"),
            });
        } else if inventory_matches {
            matched_case_count += 1;
        }
    }

    check_no_extra_line(&mut left, "left", &mut diagnostics);
    check_no_extra_line(&mut right, "right", &mut diagnostics);
    CoreDifferentialReport {
        format_version: SUPPORTED_FORMAT.to_owned(),
        target: "core-parser-differential".to_owned(),
        generator: Some(GeneratorMetadata::core(seed)),
        compatible: diagnostics.is_empty(),
        left: Some(left_header.implementation),
        right: Some(right_header.implementation),
        case_count: expected_case_count,
        matched_case_count,
        diagnostics,
    }
}

fn invalid_generated(
    expected_case_count: usize,
    seed: u64,
    code: &str,
    message: impl Into<String>,
) -> CoreDifferentialReport {
    CoreDifferentialReport {
        format_version: SUPPORTED_FORMAT.to_owned(),
        target: "core-parser-differential".to_owned(),
        generator: Some(GeneratorMetadata::core(seed)),
        compatible: false,
        left: None,
        right: None,
        case_count: expected_case_count,
        matched_case_count: 0,
        diagnostics: vec![Diagnostic {
            code: code.to_owned(),
            pointer: String::new(),
            message: message.into(),
        }],
    }
}

fn read_json_line<T: for<'de> Deserialize<'de>>(
    input: &mut impl BufRead,
) -> Result<Option<T>, String> {
    let mut line = String::new();
    let count = input
        .read_line(&mut line)
        .map_err(|error| error.to_string())?;
    if count == 0 {
        return Ok(None);
    }
    while matches!(line.as_bytes().last(), Some(b'\n' | b'\r')) {
        line.pop();
    }
    serde_json::from_str(&line)
        .map(Some)
        .map_err(|error| error.to_string())
}

fn check_stream_header(
    header: &AdapterStreamHeader,
    side: &str,
    diagnostics: &mut Vec<Diagnostic>,
) {
    if header.format_version != SUPPORTED_FORMAT {
        diagnostics.push(Diagnostic {
            code: "CORE_ADAPTER_FORMAT_UNSUPPORTED".to_owned(),
            pointer: format!("/{side}/format_version"),
            message: format!("{side} adapter format must be {SUPPORTED_FORMAT}"),
        });
    }
    if header.target != "core-parser" {
        diagnostics.push(Diagnostic {
            code: "CORE_ADAPTER_TARGET_INVALID".to_owned(),
            pointer: format!("/{side}/target"),
            message: format!("{side} adapter target must be core-parser"),
        });
    }
    if header.implementation.id.is_empty()
        || header.implementation.version.is_empty()
        || !is_commit(&header.implementation.commit)
    {
        diagnostics.push(Diagnostic {
            code: "CORE_ADAPTER_IMPLEMENTATION_INVALID".to_owned(),
            pointer: format!("/{side}/implementation"),
            message: format!("{side} adapter implementation metadata is invalid"),
        });
    }
}

fn check_no_extra_line(input: &mut impl BufRead, side: &str, diagnostics: &mut Vec<Diagnostic>) {
    match read_json_line::<Value>(input) {
        Ok(None) => {}
        Ok(Some(_)) => diagnostics.push(Diagnostic {
            code: format!("CORE_CASE_UNEXPECTED_{}", side.to_ascii_uppercase()),
            pointer: format!("/{side}/results"),
            message: format!("{side} adapter emitted more cases than the generated inventory"),
        }),
        Err(error) => diagnostics.push(Diagnostic {
            code: format!("{}_ADAPTER_JSON_INVALID", side.to_ascii_uppercase()),
            pointer: format!("/{side}/results"),
            message: error,
        }),
    }
}

fn index_canonical_cases(
    cases: Vec<CanonicalCase>,
    diagnostics: &mut Vec<Diagnostic>,
) -> std::collections::BTreeSet<String> {
    let mut ids = std::collections::BTreeSet::new();
    for case in cases {
        if !ids.insert(case.id.clone()) {
            diagnostics.push(Diagnostic {
                code: "CORE_CASES_ID_DUPLICATE".to_owned(),
                pointer: format!("/cases/{}", case.id),
                message: format!("canonical corpus repeats case id {}", case.id),
            });
        }
    }
    ids
}

fn check_envelope(result: &AdapterResult, side: &str, diagnostics: &mut Vec<Diagnostic>) {
    if result.format_version != SUPPORTED_FORMAT {
        diagnostics.push(Diagnostic {
            code: "CORE_ADAPTER_FORMAT_UNSUPPORTED".to_owned(),
            pointer: format!("/{side}/format_version"),
            message: format!("{side} adapter format must be {SUPPORTED_FORMAT}"),
        });
    }
    if result.target != "core-parser" {
        diagnostics.push(Diagnostic {
            code: "CORE_ADAPTER_TARGET_INVALID".to_owned(),
            pointer: format!("/{side}/target"),
            message: format!("{side} adapter target must be core-parser"),
        });
    }
    if result.implementation.id.is_empty()
        || result.implementation.version.is_empty()
        || !is_commit(&result.implementation.commit)
    {
        diagnostics.push(Diagnostic {
            code: "CORE_ADAPTER_IMPLEMENTATION_INVALID".to_owned(),
            pointer: format!("/{side}/implementation"),
            message: format!("{side} adapter implementation metadata is invalid"),
        });
    }
}

fn index_results(
    results: Vec<CaseResult>,
    side: &str,
    diagnostics: &mut Vec<Diagnostic>,
) -> BTreeMap<String, CaseResult> {
    let mut indexed = BTreeMap::new();
    for result in results {
        let case_id = result.case_id.clone();
        if indexed.insert(case_id.clone(), result).is_some() {
            diagnostics.push(Diagnostic {
                code: "CORE_CASE_ID_DUPLICATE".to_owned(),
                pointer: format!("/{side}/results/{case_id}"),
                message: format!("{side} adapter repeats case id {case_id}"),
            });
        }
    }
    indexed
}

fn is_commit(value: &str) -> bool {
    value.len() == 40 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

#[cfg(test)]
mod tests {
    use std::io::Cursor;

    use serde_json::json;

    use super::{compare_core_adapter_readers, compare_core_adapters_json};

    fn cases(ids: &[&str]) -> Vec<u8> {
        serde_json::to_vec(&ids.iter().map(|id| json!({ "id": id })).collect::<Vec<_>>())
            .expect("cases JSON")
    }

    #[allow(clippy::needless_pass_by_value)]
    fn adapter(id: &str, results: serde_json::Value) -> Vec<u8> {
        serde_json::to_vec(&json!({
            "format_version": "0.1-draft",
            "target": "core-parser",
            "implementation": {
                "id": id,
                "version": "0.1.0",
                "commit": "0123456789abcdef0123456789abcdef01234567"
            },
            "results": results
        }))
        .expect("adapter JSON")
    }

    #[allow(clippy::needless_pass_by_value)]
    fn case(id: &str, output: serde_json::Value) -> serde_json::Value {
        json!({
            "case_id": id,
            "conformant": true,
            "diagnostics": [],
            "output": output
        })
    }

    fn stream(id: &str, cases: &[serde_json::Value]) -> Cursor<Vec<u8>> {
        let mut lines = vec![json!({
            "format_version": "0.1-draft",
            "target": "core-parser",
            "implementation": {
                "id": id,
                "version": "0.1.0",
                "commit": "0123456789abcdef0123456789abcdef01234567"
            }
        })];
        lines.extend_from_slice(cases);
        let text = lines
            .into_iter()
            .map(|line| serde_json::to_string(&line).expect("stream line"))
            .collect::<Vec<_>>()
            .join("\n")
            + "\n";
        Cursor::new(text.into_bytes())
    }

    #[test]
    fn matching_outputs_are_compatible() {
        let left = adapter("rust", json!([case("one", json!({"kind": "text"}))]));
        let right = adapter("typescript", json!([case("one", json!({"kind": "text"}))]));
        let report = compare_core_adapters_json(&cases(&["one"]), &left, &right);
        assert!(report.compatible);
        assert_eq!(report.case_count, 1);
        assert_eq!(report.matched_case_count, 1);
    }

    #[test]
    fn mismatched_outputs_are_reported() {
        let left = adapter("rust", json!([case("one", json!({"kind": "text"}))]));
        let right = adapter(
            "typescript",
            json!([case("one", json!({"kind": "directive"}))]),
        );
        let report = compare_core_adapters_json(&cases(&["one"]), &left, &right);
        assert!(!report.compatible);
        assert_eq!(report.matched_case_count, 0);
        assert_eq!(report.diagnostics[0].code, "CORE_OUTPUT_DIFFERENTIAL");
    }

    #[test]
    fn missing_and_duplicate_cases_are_reported() {
        let left = adapter(
            "rust",
            json!([case("one", json!(1)), case("one", json!(1))]),
        );
        let right = adapter("typescript", json!([case("two", json!(2))]));
        let report = compare_core_adapters_json(&cases(&["one", "two"]), &left, &right);
        assert!(!report.compatible);
        assert!(
            report
                .diagnostics
                .iter()
                .any(|diagnostic| diagnostic.code == "CORE_CASE_ID_DUPLICATE")
        );
        assert!(
            report
                .diagnostics
                .iter()
                .any(|diagnostic| diagnostic.code == "CORE_CASE_MISSING_LEFT")
        );
        assert!(
            report
                .diagnostics
                .iter()
                .any(|diagnostic| diagnostic.code == "CORE_CASE_MISSING_RIGHT")
        );
    }

    #[test]
    fn both_adapters_cannot_skip_the_same_canonical_case() {
        let left = adapter("rust", json!([]));
        let right = adapter("typescript", json!([]));
        let report = compare_core_adapters_json(&cases(&["one"]), &left, &right);
        assert!(!report.compatible);
        assert_eq!(report.case_count, 1);
        assert!(
            report
                .diagnostics
                .iter()
                .any(|diagnostic| diagnostic.code == "CORE_CASE_MISSING_LEFT")
        );
        assert!(
            report
                .diagnostics
                .iter()
                .any(|diagnostic| diagnostic.code == "CORE_CASE_MISSING_RIGHT")
        );
    }

    #[test]
    fn generated_streams_match_in_bounded_memory() {
        let cases = [
            case("core-generated-000000", json!({"kind": "text"})),
            case("core-generated-000001", json!({"kind": "reference"})),
        ];
        let report = compare_core_adapter_readers(
            2,
            20_270_803,
            stream("rust", &cases),
            stream("typescript", &cases),
        );
        assert!(report.compatible);
        assert_eq!(report.case_count, 2);
        assert_eq!(report.matched_case_count, 2);
        assert_eq!(
            report.generator.as_ref().map(|generator| &generator.seed),
            Some(&"20270803".to_owned())
        );
    }
}
