use std::ffi::OsString;
use std::fs;
use std::path::{Component, Path};
use std::process::Command;

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::validate_trace_producer_json;

const FORMAT_VERSION: &str = "0.1-draft";
const CASES_PATH: &str = "conformance/cases/trace-producer.json";
const CASES_SCHEMA_PATH: &str = "conformance/trace-producer-cases.schema.json";
const INPUT_SCHEMA_PATH: &str = "conformance/trace-producer-input.schema.json";
const TRACE_SCHEMA_PATH: &str = "schemas/prompt-trace-0.3-draft.schema.json";
const TRANSCRIPT_SCHEMA_PATH: &str = "conformance/transcript.schema.json";

#[derive(Debug, Serialize)]
pub struct TraceProducerAdapterReport {
    pub format_version: String,
    pub target: String,
    pub implementation: Implementation,
    pub results: Vec<ProducerCaseResult>,
}

impl TraceProducerAdapterReport {
    #[must_use]
    pub fn conformant(&self) -> bool {
        self.results.iter().all(|result| result.conformant)
    }
}

#[derive(Debug, Serialize)]
pub struct Implementation {
    pub id: String,
    pub version: String,
    pub commit: String,
}

#[derive(Debug, Serialize)]
pub struct ProducerCaseResult {
    pub case_id: String,
    pub conformant: bool,
    pub diagnostics: Vec<String>,
    pub output: Value,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ProducerCases {
    format_version: String,
    cases: Vec<ProducerCase>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ProducerCase {
    id: String,
    input: String,
    transcript: Option<String>,
    expected: Expected,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "outcome", rename_all = "lowercase")]
enum Expected {
    Trace {
        conformant: bool,
        diagnostics: Vec<String>,
    },
    Error {
        code: String,
    },
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ErrorEnvelope {
    format_version: String,
    error: ProducerError,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct ProducerError {
    code: String,
    pointer: String,
    message: String,
}

/// Run the canonical producer corpus against an external implementation.
///
/// # Errors
///
/// Returns an error when suite artifacts cannot be loaded, implementation
/// metadata is invalid, or the external producer process cannot be started.
pub fn run_trace_producer_adapter(
    root: &Path,
    implementation_id: String,
    implementation_version: String,
    implementation_commit: String,
    command: &[OsString],
) -> Result<TraceProducerAdapterReport, String> {
    if command.is_empty() {
        return Err("Trace producer command is empty".to_owned());
    }
    if implementation_id.is_empty() || implementation_version.is_empty() {
        return Err("implementation id and version must not be empty".to_owned());
    }
    if implementation_commit.len() != 40
        || !implementation_commit
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit())
    {
        return Err("implementation commit must be 40 hexadecimal characters".to_owned());
    }

    let cases_bytes = read(root, CASES_PATH)?;
    let cases_schema = read(root, CASES_SCHEMA_PATH)?;
    let cases_validation = crate::validate_instance_json(&cases_schema, &cases_bytes);
    if !cases_validation.conformant {
        return Err("Trace producer cases do not satisfy their schema".to_owned());
    }
    let cases: ProducerCases = serde_json::from_slice(&cases_bytes)
        .map_err(|error| format!("invalid Trace producer cases: {error}"))?;
    if cases.format_version != FORMAT_VERSION {
        return Err(format!(
            "Trace producer case format must be {FORMAT_VERSION}"
        ));
    }
    let input_schema = read(root, INPUT_SCHEMA_PATH)?;
    let trace_schema = read(root, TRACE_SCHEMA_PATH)?;
    let transcript_schema = read(root, TRANSCRIPT_SCHEMA_PATH)?;
    let mut results = Vec::with_capacity(cases.cases.len());

    for case in cases.cases {
        results.push(run_case(
            root,
            case,
            &input_schema,
            &trace_schema,
            &transcript_schema,
            command,
        ));
    }

    Ok(TraceProducerAdapterReport {
        format_version: FORMAT_VERSION.to_owned(),
        target: "trace-producer".to_owned(),
        implementation: Implementation {
            id: implementation_id,
            version: implementation_version,
            commit: implementation_commit,
        },
        results,
    })
}

#[allow(clippy::too_many_lines)]
fn run_case(
    root: &Path,
    case: ProducerCase,
    input_schema: &[u8],
    trace_schema: &[u8],
    transcript_schema: &[u8],
    command: &[OsString],
) -> ProducerCaseResult {
    let input = match read(root, &case.input) {
        Ok(input) => input,
        Err(error) => return failed_case(case.id, "TRACE_PRODUCER_INPUT_READ_FAILED", error),
    };
    let input_validation = crate::validate_instance_json(input_schema, &input);
    if !input_validation.conformant {
        return ProducerCaseResult {
            case_id: case.id,
            conformant: false,
            diagnostics: input_validation
                .diagnostics
                .into_iter()
                .map(|diagnostic| diagnostic.code)
                .collect(),
            output: json!({ "error": "producer input does not satisfy its schema" }),
        };
    }

    let input_path = root.join(&case.input);
    let output = match Command::new(&command[0])
        .args(&command[1..])
        .arg(&input_path)
        .output()
    {
        Ok(output) => output,
        Err(error) => {
            return failed_case(case.id, "TRACE_PRODUCER_PROCESS_FAILED", error.to_string());
        }
    };
    let value = match serde_json::from_slice::<Value>(&output.stdout) {
        Ok(value) => value,
        Err(error) => {
            return ProducerCaseResult {
                case_id: case.id,
                conformant: false,
                diagnostics: vec!["TRACE_PRODUCER_OUTPUT_INVALID".to_owned()],
                output: json!({
                    "status": output.status.code(),
                    "stdout": String::from_utf8_lossy(&output.stdout),
                    "stderr": String::from_utf8_lossy(&output.stderr),
                    "parse_error": error.to_string(),
                }),
            };
        }
    };

    match case.expected {
        Expected::Trace {
            conformant,
            mut diagnostics,
        } => {
            if !output.status.success() {
                return ProducerCaseResult {
                    case_id: case.id,
                    conformant: false,
                    diagnostics: vec!["TRACE_PRODUCER_PROCESS_FAILED".to_owned()],
                    output: value,
                };
            }
            let Some(transcript_path) = case.transcript else {
                return failed_case(
                    case.id,
                    "TRACE_PRODUCER_TRANSCRIPT_REQUIRED",
                    "trace case has no independent transcript",
                );
            };
            let transcript = match read(root, &transcript_path) {
                Ok(transcript) => transcript,
                Err(error) => {
                    return failed_case(case.id, "TRACE_PRODUCER_TRANSCRIPT_READ_FAILED", error);
                }
            };
            let trace_bytes =
                serde_json::to_vec(&value).expect("serializing parsed producer output cannot fail");
            let validation = validate_trace_producer_json(
                trace_schema,
                &trace_bytes,
                transcript_schema,
                &transcript,
            );
            let mut actual = validation
                .diagnostics
                .into_iter()
                .map(|diagnostic| diagnostic.code)
                .collect::<Vec<_>>();
            actual.sort();
            actual.dedup();
            diagnostics.sort();
            diagnostics.dedup();
            ProducerCaseResult {
                case_id: case.id,
                conformant: validation.conformant == conformant && actual == diagnostics,
                diagnostics: actual,
                output: value,
            }
        }
        Expected::Error { code } => {
            let envelope = serde_json::from_value::<ErrorEnvelope>(value.clone());
            let (matches, diagnostics) = match envelope {
                Ok(envelope) => (
                    output.status.code() == Some(1)
                        && envelope.format_version == FORMAT_VERSION
                        && envelope.error.code == code,
                    vec![envelope.error.code],
                ),
                Err(_) => (false, vec!["TRACE_PRODUCER_OUTPUT_INVALID".to_owned()]),
            };
            ProducerCaseResult {
                case_id: case.id,
                conformant: matches,
                diagnostics,
                output: value,
            }
        }
    }
}

fn failed_case(case_id: String, code: &str, message: impl Into<String>) -> ProducerCaseResult {
    let message = message.into();
    ProducerCaseResult {
        case_id,
        conformant: false,
        diagnostics: vec![code.to_owned()],
        output: json!({ "error": message }),
    }
}

fn read(root: &Path, relative: &str) -> Result<Vec<u8>, String> {
    let path = Path::new(relative);
    if path.is_absolute()
        || path
            .components()
            .any(|component| matches!(component, Component::ParentDir | Component::RootDir))
    {
        return Err(format!("unsafe repository-relative path: {relative}"));
    }
    fs::read(root.join(path)).map_err(|error| format!("failed to read {relative}: {error}"))
}
