#![forbid(unsafe_code)]

use std::env;
use std::fs;
use std::io::{self, Write as _};
use std::process::ExitCode;

use promptsyntax_conformance::{
    CheckReport, CoreDifferentialReport, ValidationReport, check_requirements_json,
    check_schema_json, compare_core_adapter_streams, compare_core_adapters_json,
    run_adversarial_benchmark, run_suite, run_trace_producer_adapter, validate_instance_json,
    validate_trace_producer_json, write_generated_core_cases,
};
use serde::Serialize;

#[allow(clippy::too_many_lines)]
fn main() -> ExitCode {
    let mut args = env::args_os();
    let _program = args.next();
    let Some(command) = args.next() else {
        return usage();
    };
    match command.to_str() {
        Some("generate-core-differential") => {
            let Some(case_count) = args
                .next()
                .and_then(|value| value.into_string().ok())
                .and_then(|value| value.parse::<usize>().ok())
            else {
                return usage();
            };
            let Some(seed) = args
                .next()
                .and_then(|value| value.into_string().ok())
                .and_then(|value| value.parse::<u64>().ok())
            else {
                return usage();
            };
            if args.next().is_some() || !(1..=1_000_000).contains(&case_count) {
                return usage();
            }
            let stdout = io::stdout();
            let mut output = stdout.lock();
            if let Err(error) = write_generated_core_cases(&mut output, case_count, seed) {
                eprintln!("failed to generate Core differential inputs: {error}");
                return ExitCode::from(2);
            }
            if let Err(error) = writeln!(output) {
                eprintln!("failed to finish Core differential output: {error}");
                return ExitCode::from(2);
            }
            ExitCode::SUCCESS
        }
        Some("check-requirements") => {
            let Some(path) = args.next() else {
                return usage();
            };
            if args.next().is_some() {
                return usage();
            }
            let report = match fs::read(&path) {
                Ok(input) => check_requirements_json(&input),
                Err(error) => CheckReport::invalid_input("CORPUS_READ_FAILED", error.to_string()),
            };
            emit_report(&report, report.conformant)
        }
        Some("check-schema") => {
            let Some(path) = args.next() else {
                return usage();
            };
            if args.next().is_some() {
                return usage();
            }
            let report = match fs::read(&path) {
                Ok(input) => check_schema_json(&input),
                Err(error) => ValidationReport::invalid_input(
                    "schema",
                    "SCHEMA_READ_FAILED",
                    error.to_string(),
                ),
            };
            emit_report(&report, report.conformant)
        }
        Some("validate-instance") => {
            let Some(schema_path) = args.next() else {
                return usage();
            };
            let Some(instance_path) = args.next() else {
                return usage();
            };
            if args.next().is_some() {
                return usage();
            }
            let schema = match fs::read(&schema_path) {
                Ok(input) => input,
                Err(error) => {
                    let report = ValidationReport::invalid_input(
                        "instance",
                        "SCHEMA_READ_FAILED",
                        error.to_string(),
                    );
                    return emit_report(&report, false);
                }
            };
            let instance = match fs::read(&instance_path) {
                Ok(input) => input,
                Err(error) => {
                    let report = ValidationReport::invalid_input(
                        "instance",
                        "INSTANCE_READ_FAILED",
                        error.to_string(),
                    );
                    return emit_report(&report, false);
                }
            };
            let report = validate_instance_json(&schema, &instance);
            emit_report(&report, report.conformant)
        }
        Some("validate-trace-producer") => {
            let Some(trace_schema_path) = args.next() else {
                return usage();
            };
            let Some(trace_path) = args.next() else {
                return usage();
            };
            let Some(transcript_schema_path) = args.next() else {
                return usage();
            };
            let Some(transcript_path) = args.next() else {
                return usage();
            };
            if args.next().is_some() {
                return usage();
            }
            let trace_schema = match fs::read(&trace_schema_path) {
                Ok(input) => input,
                Err(error) => {
                    let report = ValidationReport::invalid_input(
                        "trace-producer",
                        "SCHEMA_READ_FAILED",
                        error.to_string(),
                    );
                    return emit_report(&report, false);
                }
            };
            let trace = match fs::read(&trace_path) {
                Ok(input) => input,
                Err(error) => {
                    let report = ValidationReport::invalid_input(
                        "trace-producer",
                        "INSTANCE_READ_FAILED",
                        error.to_string(),
                    );
                    return emit_report(&report, false);
                }
            };
            let transcript_schema = match fs::read(&transcript_schema_path) {
                Ok(input) => input,
                Err(error) => {
                    let report = ValidationReport::invalid_input(
                        "trace-producer",
                        "SCHEMA_READ_FAILED",
                        error.to_string(),
                    );
                    return emit_report(&report, false);
                }
            };
            let transcript = match fs::read(&transcript_path) {
                Ok(input) => input,
                Err(error) => {
                    let report = ValidationReport::invalid_input(
                        "trace-producer",
                        "INSTANCE_READ_FAILED",
                        error.to_string(),
                    );
                    return emit_report(&report, false);
                }
            };
            let report = validate_trace_producer_json(
                &trace_schema,
                &trace,
                &transcript_schema,
                &transcript,
            );
            emit_report(&report, report.conformant)
        }
        Some("run-suite") => {
            let Some(root) = args.next() else {
                return usage();
            };
            if args.next().is_some() {
                return usage();
            }
            let report = run_suite(std::path::Path::new(&root));
            emit_report(&report, report.conformant)
        }
        Some("run-adversarial-benchmark") => {
            let Some(root) = args.next() else {
                return usage();
            };
            if args.next().is_some() {
                return usage();
            }
            let report = run_adversarial_benchmark(std::path::Path::new(&root));
            emit_report(&report, report.conformant)
        }
        Some("run-trace-producer-adapter") => {
            let Some(root) = args.next() else {
                return usage();
            };
            let Some(implementation_id) = args.next().and_then(|value| value.into_string().ok())
            else {
                return usage();
            };
            let Some(implementation_version) =
                args.next().and_then(|value| value.into_string().ok())
            else {
                return usage();
            };
            let Some(implementation_commit) =
                args.next().and_then(|value| value.into_string().ok())
            else {
                return usage();
            };
            let command = args.collect::<Vec<_>>();
            let report = match run_trace_producer_adapter(
                std::path::Path::new(&root),
                implementation_id,
                implementation_version,
                implementation_commit,
                &command,
            ) {
                Ok(report) => report,
                Err(error) => {
                    eprintln!("failed to run Trace producer adapter: {error}");
                    return ExitCode::from(2);
                }
            };
            let conformant = report.conformant();
            emit_report(&report, conformant)
        }
        Some("compare-core-adapters") => {
            let Some(cases_path) = args.next() else {
                return usage();
            };
            let Some(left_path) = args.next() else {
                return usage();
            };
            let Some(right_path) = args.next() else {
                return usage();
            };
            if args.next().is_some() {
                return usage();
            }
            let cases = match fs::read(&cases_path) {
                Ok(input) => input,
                Err(error) => {
                    let report = CoreDifferentialReport::invalid_input(
                        "CORE_CASES_READ_FAILED",
                        error.to_string(),
                    );
                    return emit_report(&report, false);
                }
            };
            let left = match fs::read(&left_path) {
                Ok(input) => input,
                Err(error) => {
                    let report = CoreDifferentialReport::invalid_input(
                        "LEFT_ADAPTER_READ_FAILED",
                        error.to_string(),
                    );
                    return emit_report(&report, false);
                }
            };
            let right = match fs::read(&right_path) {
                Ok(input) => input,
                Err(error) => {
                    let report = CoreDifferentialReport::invalid_input(
                        "RIGHT_ADAPTER_READ_FAILED",
                        error.to_string(),
                    );
                    return emit_report(&report, false);
                }
            };
            let report = compare_core_adapters_json(&cases, &left, &right);
            emit_report(&report, report.compatible)
        }
        Some("compare-core-streams") => {
            let Some(case_count) = args
                .next()
                .and_then(|value| value.into_string().ok())
                .and_then(|value| value.parse::<usize>().ok())
            else {
                return usage();
            };
            let Some(seed) = args
                .next()
                .and_then(|value| value.into_string().ok())
                .and_then(|value| value.parse::<u64>().ok())
            else {
                return usage();
            };
            let Some(left_path) = args.next() else {
                return usage();
            };
            let Some(right_path) = args.next() else {
                return usage();
            };
            if args.next().is_some() || !(1..=1_000_000).contains(&case_count) {
                return usage();
            }
            let report = compare_core_adapter_streams(
                case_count,
                seed,
                std::path::Path::new(&left_path),
                std::path::Path::new(&right_path),
            );
            emit_report(&report, report.compatible)
        }
        _ => usage(),
    }
}

fn emit_report(report: &impl Serialize, conformant: bool) -> ExitCode {
    match serde_json::to_string_pretty(report) {
        Ok(json) => println!("{json}"),
        Err(error) => {
            eprintln!("failed to serialize conformance report: {error}");
            return ExitCode::from(2);
        }
    }

    if conformant {
        ExitCode::SUCCESS
    } else {
        ExitCode::from(1)
    }
}

fn usage() -> ExitCode {
    eprintln!(
        "usage:\n  ps-conformance generate-core-differential <case-count> <seed>\n  ps-conformance check-requirements <requirements.json>\n  ps-conformance check-schema <schema.json>\n  ps-conformance validate-instance <schema.json> <instance.json>\n  ps-conformance validate-trace-producer <trace-schema.json> <trace.json> <transcript-schema.json> <transcript.json>\n  ps-conformance run-suite <repository-root>\n  ps-conformance run-adversarial-benchmark <repository-root>\n  ps-conformance run-trace-producer-adapter <repository-root> <implementation-id> <version> <commit> <command> [args...]\n  ps-conformance compare-core-adapters <core-cases.json> <left.json> <right.json>\n  ps-conformance compare-core-streams <case-count> <seed> <left.jsonl> <right.jsonl>"
    );
    ExitCode::from(2)
}
