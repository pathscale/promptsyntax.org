use std::collections::{BTreeSet, HashMap, HashSet};
use std::path::Path;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::suite::{
    CaseReport, MaterializedCase, checked_schema, materialize_cases, read_json, validate_value,
};
use crate::{Diagnostic, SuiteReport, run_suite};

const FORMAT_VERSION: &str = "0.1-draft";

#[derive(Debug, Serialize)]
pub struct AdversarialReport {
    pub format_version: String,
    pub benchmark: VersionedIdentity,
    pub suite: VersionedIdentity,
    pub profile: VersionedIdentity,
    pub conformant: bool,
    pub summary: AdversarialSummary,
    pub rates: AdversarialRates,
    pub coverage: AdversarialCoverage,
    pub controls: Vec<ControlReport>,
    pub threat_classes: Vec<ThreatClassReport>,
    pub mutations: Vec<MutationReport>,
    pub diagnostics: Vec<Diagnostic>,
}

#[derive(Debug, Serialize)]
pub struct VersionedIdentity {
    pub id: String,
    pub version: String,
    pub status: String,
}

#[derive(Debug, Default, Serialize)]
pub struct AdversarialSummary {
    pub threat_classes: usize,
    pub unique_controls: usize,
    pub controls_accepted: usize,
    pub mutations: usize,
    pub controlled_mutations: usize,
    pub exactly_detected: usize,
    pub rejected_with_unexpected_diagnostics: usize,
    pub escaped: usize,
    pub invalid_controls: usize,
    pub missing_mutations: usize,
}

#[derive(Debug, Default, Serialize)]
pub struct AdversarialRates {
    pub control_acceptance: Ratio,
    pub exact_mutation_detection: Ratio,
}

#[derive(Debug, Default, Serialize)]
pub struct Ratio {
    pub numerator: usize,
    pub denominator: usize,
}

#[derive(Debug, Default, Serialize)]
pub struct AdversarialCoverage {
    pub eligible_mutants: usize,
    pub scored_mutants: usize,
    pub missing: Vec<String>,
    pub extra: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct ControlReport {
    pub case: String,
    pub accepted: bool,
    pub actual_diagnostics: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct ThreatClassReport {
    pub id: String,
    pub description: String,
    pub mutations: usize,
    pub exactly_detected: usize,
    pub rejected_with_unexpected_diagnostics: usize,
    pub escaped: usize,
    pub invalid_controls: usize,
    pub missing_mutations: usize,
    pub exact_detection_rate: Ratio,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum MutationStatus {
    CaseMissing,
    Escaped,
    ExactDetection,
    InvalidControl,
    UnexpectedDiagnostics,
}

#[derive(Debug, Serialize)]
pub struct MutationReport {
    pub id: String,
    pub threat_class: String,
    pub operator: String,
    pub baseline_case: String,
    pub mutant_case: String,
    pub controlled_change: bool,
    pub controlled_paths: Vec<String>,
    pub observed_paths: Vec<String>,
    pub status: MutationStatus,
    pub intended_diagnostics: Vec<String>,
    pub actual_diagnostics: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct Benchmark {
    format_version: String,
    id: String,
    version: String,
    status: String,
    suite: BenchmarkSuite,
    profile: String,
    threat_classes: Vec<ThreatClass>,
    mutations: Vec<Mutation>,
}

#[derive(Debug, Deserialize)]
struct BenchmarkSuite {
    id: String,
    version: String,
}

#[derive(Debug, Deserialize)]
struct ThreatClass {
    id: String,
    description: String,
}

#[derive(Debug, Deserialize)]
struct Mutation {
    id: String,
    threat_class: String,
    operator: String,
    baseline_case: String,
    mutant_case: String,
    controlled_paths: Vec<String>,
    intended_diagnostics: Vec<String>,
}

#[derive(Default)]
struct OutcomeCounts {
    exact: usize,
    unexpected: usize,
    escaped: usize,
    invalid_control: usize,
    missing: usize,
}

#[must_use]
pub fn run_adversarial_benchmark(root: &Path) -> AdversarialReport {
    match run_adversarial_benchmark_inner(root) {
        Ok(report) => report,
        Err(diagnostic) => failure_report(diagnostic),
    }
}

#[allow(clippy::too_many_lines)]
fn run_adversarial_benchmark_inner(root: &Path) -> Result<AdversarialReport, Diagnostic> {
    let manifest = read_json(root, "conformance/manifest.json")?;
    let benchmark_path = manifest_file(&manifest, "adversarial_benchmark")?;
    let benchmark_schema_path = manifest_file(&manifest, "adversarial_benchmark_schema")?;
    let report_schema_path = manifest_file(&manifest, "adversarial_report_schema")?;

    let benchmark_schema = checked_schema(root, &benchmark_schema_path)?;
    let benchmark_value = read_json(root, &benchmark_path)?;
    let benchmark_validation = validate_value(&benchmark_schema, &benchmark_value);
    if !benchmark_validation.conformant {
        return Err(diagnostic(
            "ADVERSARIAL_BENCHMARK_INVALID",
            &benchmark_path,
            benchmark_validation
                .diagnostics
                .first()
                .map_or("benchmark schema validation failed", |item| {
                    item.message.as_str()
                }),
        ));
    }
    let benchmark: Benchmark = serde_json::from_value(benchmark_value).map_err(|error| {
        diagnostic(
            "ADVERSARIAL_BENCHMARK_INVALID",
            &benchmark_path,
            error.to_string(),
        )
    })?;

    let suite = run_suite(root);
    let mut diagnostics = Vec::new();
    if !suite.conformant {
        push(
            &mut diagnostics,
            "ADVERSARIAL_SUITE_INVALID",
            "/suite",
            "the underlying conformance suite did not pass",
        );
    }
    validate_metadata(&benchmark, &suite, &mut diagnostics);

    let mut threat_class_ids = HashSet::new();
    let mut threat_classes = Vec::new();
    for (index, threat_class) in benchmark.threat_classes.iter().enumerate() {
        if !threat_class_ids.insert(threat_class.id.as_str()) {
            push(
                &mut diagnostics,
                "ADVERSARIAL_THREAT_CLASS_DUPLICATE",
                format!("/threat_classes/{index}/id"),
                format!("threat class {} occurs more than once", threat_class.id),
            );
        }
        threat_classes.push((threat_class.id.clone(), threat_class.description.clone()));
    }

    let cases = index_cases(&suite);
    let materialized_cases = materialize_cases(root)?;
    let eligible_mutants = eligible_mutant_ids(&suite);
    let control_ids = benchmark
        .mutations
        .iter()
        .map(|mutation| mutation.baseline_case.clone())
        .collect::<BTreeSet<_>>();
    let mut missing_cases = HashSet::new();
    let controls = control_ids
        .iter()
        .map(|case_id| control_report(case_id, &cases, &mut missing_cases, &mut diagnostics))
        .collect::<Vec<_>>();
    let accepted_controls = controls.iter().filter(|control| control.accepted).count();
    let accepted_by_id = controls
        .iter()
        .map(|control| (control.case.as_str(), control.accepted))
        .collect::<HashMap<_, _>>();

    let mut mutation_ids = HashSet::new();
    let mut mutant_case_ids = HashSet::new();
    let mut mutation_reports = Vec::new();
    for (index, mutation) in benchmark.mutations.iter().enumerate() {
        if !mutation_ids.insert(mutation.id.as_str()) {
            push(
                &mut diagnostics,
                "ADVERSARIAL_MUTATION_ID_DUPLICATE",
                format!("/mutations/{index}/id"),
                format!("mutation id {} occurs more than once", mutation.id),
            );
        }
        if !mutant_case_ids.insert(mutation.mutant_case.as_str()) {
            push(
                &mut diagnostics,
                "ADVERSARIAL_MUTANT_CASE_DUPLICATE",
                format!("/mutations/{index}/mutant_case"),
                format!(
                    "mutant case {} is scored more than once",
                    mutation.mutant_case
                ),
            );
        }
        if !threat_class_ids.contains(mutation.threat_class.as_str()) {
            push(
                &mut diagnostics,
                "ADVERSARIAL_THREAT_CLASS_UNKNOWN",
                format!("/mutations/{index}/threat_class"),
                format!(
                    "mutation {} cites unknown threat class {}",
                    mutation.id, mutation.threat_class
                ),
            );
        }

        let mut intended_diagnostics = mutation.intended_diagnostics.clone();
        intended_diagnostics.sort();
        let baseline_accepted = accepted_by_id
            .get(mutation.baseline_case.as_str())
            .copied()
            .unwrap_or(false);
        let mutant = cases.get(mutation.mutant_case.as_str()).copied();
        if mutant.is_none() && missing_cases.insert(mutation.mutant_case.clone()) {
            push(
                &mut diagnostics,
                "ADVERSARIAL_CASE_MISSING",
                format!("/mutations/{index}/mutant_case"),
                format!(
                    "case {} is absent from the suite report",
                    mutation.mutant_case
                ),
            );
        }
        let actual_diagnostics =
            mutant.map_or_else(Vec::new, |case| case.actual_diagnostics.clone());
        let mut controlled_paths = mutation.controlled_paths.clone();
        controlled_paths.sort();
        let (controlled_change, observed_paths) = mutation_scope(
            &mutation.baseline_case,
            &mutation.mutant_case,
            &controlled_paths,
            &materialized_cases,
        );
        if cases.contains_key(mutation.baseline_case.as_str())
            && mutant.is_some()
            && !controlled_change
        {
            push(
                &mut diagnostics,
                "ADVERSARIAL_MUTATION_SCOPE_MISMATCH",
                format!("/mutations/{index}/controlled_paths"),
                format!(
                    "observed differences for mutation {} do not match its declared controlled paths",
                    mutation.id
                ),
            );
        }
        let status = score_mutation(
            index,
            mutation,
            baseline_accepted,
            mutant,
            &intended_diagnostics,
            &mut diagnostics,
        );
        mutation_reports.push(MutationReport {
            id: mutation.id.clone(),
            threat_class: mutation.threat_class.clone(),
            operator: mutation.operator.clone(),
            baseline_case: mutation.baseline_case.clone(),
            mutant_case: mutation.mutant_case.clone(),
            controlled_change,
            controlled_paths,
            observed_paths,
            status,
            intended_diagnostics,
            actual_diagnostics,
        });
    }

    let scored_mutants = mutation_reports
        .iter()
        .map(|mutation| mutation.mutant_case.clone())
        .collect::<BTreeSet<_>>();
    let missing_mutant_coverage = eligible_mutants
        .difference(&scored_mutants)
        .cloned()
        .collect::<Vec<_>>();
    let extra_mutant_coverage = scored_mutants
        .difference(&eligible_mutants)
        .cloned()
        .collect::<Vec<_>>();
    for mutant in &missing_mutant_coverage {
        push(
            &mut diagnostics,
            "ADVERSARIAL_MUTANT_COVERAGE_MISSING",
            "/mutations",
            format!("eligible mutant case {mutant} is not scored"),
        );
    }
    for mutant in &extra_mutant_coverage {
        push(
            &mut diagnostics,
            "ADVERSARIAL_MUTANT_COVERAGE_EXTRA",
            "/mutations",
            format!("mutant case {mutant} is outside the declared selection rule"),
        );
    }

    for (index, (id, _)) in threat_classes.iter().enumerate() {
        if !mutation_reports
            .iter()
            .any(|mutation| mutation.threat_class == *id)
        {
            push(
                &mut diagnostics,
                "ADVERSARIAL_THREAT_CLASS_EMPTY",
                format!("/threat_classes/{index}/id"),
                format!("threat class {id} has no mutation"),
            );
        }
    }

    let counts = outcome_counts(&mutation_reports);
    let threat_class_reports = threat_classes
        .into_iter()
        .map(|(id, description)| {
            let class_mutations = mutation_reports
                .iter()
                .filter(|mutation| mutation.threat_class == id)
                .collect::<Vec<_>>();
            let class_counts = outcome_counts_refs(&class_mutations);
            ThreatClassReport {
                id,
                description,
                mutations: class_mutations.len(),
                exactly_detected: class_counts.exact,
                rejected_with_unexpected_diagnostics: class_counts.unexpected,
                escaped: class_counts.escaped,
                invalid_controls: class_counts.invalid_control,
                missing_mutations: class_counts.missing,
                exact_detection_rate: Ratio {
                    numerator: class_counts.exact,
                    denominator: class_mutations.len(),
                },
            }
        })
        .collect::<Vec<_>>();

    diagnostics.sort_by(|left, right| {
        left.pointer
            .cmp(&right.pointer)
            .then_with(|| left.code.cmp(&right.code))
            .then_with(|| left.message.cmp(&right.message))
    });
    let all_exact = counts.exact == mutation_reports.len();
    let controlled_mutations = mutation_reports
        .iter()
        .filter(|mutation| mutation.controlled_change)
        .count();
    let all_controlled = controlled_mutations == mutation_reports.len();
    let all_controls_accepted = accepted_controls == controls.len();
    let mut report = AdversarialReport {
        format_version: FORMAT_VERSION.to_owned(),
        benchmark: VersionedIdentity {
            id: benchmark.id,
            version: benchmark.version,
            status: benchmark.status,
        },
        suite: VersionedIdentity {
            id: suite.suite.id,
            version: suite.suite.version,
            status: suite.suite.status,
        },
        profile: VersionedIdentity {
            id: suite.profile.id,
            version: suite.profile.version,
            status: suite.profile.status,
        },
        conformant: all_exact
            && all_controlled
            && all_controls_accepted
            && diagnostics.is_empty()
            && suite.conformant,
        summary: AdversarialSummary {
            threat_classes: threat_class_reports.len(),
            unique_controls: controls.len(),
            controls_accepted: accepted_controls,
            mutations: mutation_reports.len(),
            controlled_mutations,
            exactly_detected: counts.exact,
            rejected_with_unexpected_diagnostics: counts.unexpected,
            escaped: counts.escaped,
            invalid_controls: counts.invalid_control,
            missing_mutations: counts.missing,
        },
        rates: AdversarialRates {
            control_acceptance: Ratio {
                numerator: accepted_controls,
                denominator: controls.len(),
            },
            exact_mutation_detection: Ratio {
                numerator: counts.exact,
                denominator: mutation_reports.len(),
            },
        },
        coverage: AdversarialCoverage {
            eligible_mutants: eligible_mutants.len(),
            scored_mutants: scored_mutants.len(),
            missing: missing_mutant_coverage,
            extra: extra_mutant_coverage,
        },
        controls,
        threat_classes: threat_class_reports,
        mutations: mutation_reports,
        diagnostics,
    };

    let report_schema = checked_schema(root, &report_schema_path)?;
    let report_value = serde_json::to_value(&report).map_err(|error| {
        diagnostic(
            "ADVERSARIAL_REPORT_INVALID",
            &report_schema_path,
            error.to_string(),
        )
    })?;
    let validation = validate_value(&report_schema, &report_value);
    if !validation.conformant {
        report.conformant = false;
        report.diagnostics.push(diagnostic(
            "ADVERSARIAL_REPORT_INVALID",
            &report_schema_path,
            validation
                .diagnostics
                .first()
                .map_or("generated report does not satisfy its schema", |item| {
                    item.message.as_str()
                }),
        ));
    }
    Ok(report)
}

fn manifest_file(manifest: &serde_json::Value, name: &str) -> Result<String, Diagnostic> {
    manifest
        .pointer(&format!("/files/{name}"))
        .and_then(serde_json::Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| {
            diagnostic(
                "ADVERSARIAL_BENCHMARK_INVALID",
                format!("/files/{name}"),
                "suite manifest does not declare the required adversarial artifact",
            )
        })
}

fn validate_metadata(
    benchmark: &Benchmark,
    suite: &SuiteReport,
    diagnostics: &mut Vec<Diagnostic>,
) {
    if benchmark.format_version != FORMAT_VERSION {
        push(
            diagnostics,
            "ADVERSARIAL_FORMAT_UNSUPPORTED",
            "/format_version",
            format!("benchmark format must be {FORMAT_VERSION}"),
        );
    }
    if benchmark.suite.id != suite.suite.id
        || benchmark.suite.version != suite.suite.version
        || benchmark.version != suite.suite.version
        || benchmark.status != suite.suite.status
        || benchmark.profile != suite.profile.id
    {
        push(
            diagnostics,
            "ADVERSARIAL_METADATA_MISMATCH",
            "/",
            "benchmark identity, suite version, status, or profile disagrees with the active suite",
        );
    }
}

fn index_cases(suite: &SuiteReport) -> HashMap<&str, &CaseReport> {
    suite
        .families
        .iter()
        .flat_map(|family| family.cases.iter())
        .map(|case| (case.id.as_str(), case))
        .collect()
}

fn eligible_mutant_ids(suite: &SuiteReport) -> BTreeSet<String> {
    suite
        .families
        .iter()
        .flat_map(|family| family.cases.iter())
        .filter(|case| {
            !case.expected_conformant
                && !case.expected_diagnostics.is_empty()
                && case
                    .expected_diagnostics
                    .iter()
                    .all(|code| code.starts_with("TRACE_"))
        })
        .map(|case| case.id.clone())
        .collect()
}

fn mutation_scope(
    baseline_case: &str,
    mutant_case: &str,
    controlled_paths: &[String],
    cases: &HashMap<String, MaterializedCase>,
) -> (bool, Vec<String>) {
    let Some(baseline) = cases.get(baseline_case) else {
        return (false, Vec::new());
    };
    let Some(mutant) = cases.get(mutant_case) else {
        return (false, Vec::new());
    };
    let baseline = composite_case(baseline);
    let mutant = composite_case(mutant);
    let mut observed = Vec::new();
    diff_paths(&baseline, &mutant, "", &mut observed);
    observed.sort();
    observed.dedup();
    let all_observed_are_controlled = !observed.is_empty()
        && observed.iter().all(|path| {
            controlled_paths
                .iter()
                .any(|controlled| pointer_covers(controlled, path))
        });
    let every_controlled_path_changes = controlled_paths
        .iter()
        .all(|controlled| observed.iter().any(|path| pointer_covers(controlled, path)));
    (
        all_observed_are_controlled && every_controlled_path_changes,
        observed,
    )
}

fn composite_case(case: &MaterializedCase) -> Value {
    let mut object = serde_json::Map::new();
    object.insert("trace".to_owned(), case.trace.clone());
    object.insert(
        "transcript".to_owned(),
        case.transcript.clone().unwrap_or(Value::Null),
    );
    Value::Object(object)
}

fn diff_paths(left: &Value, right: &Value, pointer: &str, output: &mut Vec<String>) {
    if left == right {
        return;
    }
    match (left, right) {
        (Value::Object(left), Value::Object(right)) => {
            let keys = left.keys().chain(right.keys()).collect::<BTreeSet<_>>();
            for key in keys {
                let child = format!("{pointer}/{}", escape_pointer_token(key));
                match (left.get(key), right.get(key)) {
                    (Some(left), Some(right)) => diff_paths(left, right, &child, output),
                    _ => output.push(child),
                }
            }
        }
        (Value::Array(left), Value::Array(right)) => {
            for index in 0..left.len().max(right.len()) {
                let child = format!("{pointer}/{index}");
                match (left.get(index), right.get(index)) {
                    (Some(left), Some(right)) => diff_paths(left, right, &child, output),
                    _ => output.push(child),
                }
            }
        }
        _ => output.push(pointer.to_owned()),
    }
}

fn escape_pointer_token(value: &str) -> String {
    value.replace('~', "~0").replace('/', "~1")
}

fn pointer_covers(controlled: &str, observed: &str) -> bool {
    observed == controlled
        || observed
            .strip_prefix(controlled)
            .is_some_and(|suffix| suffix.starts_with('/'))
}

fn control_report(
    case_id: &str,
    cases: &HashMap<&str, &CaseReport>,
    missing_cases: &mut HashSet<String>,
    diagnostics: &mut Vec<Diagnostic>,
) -> ControlReport {
    let case = cases.get(case_id).copied();
    if case.is_none() && missing_cases.insert(case_id.to_owned()) {
        push(
            diagnostics,
            "ADVERSARIAL_CASE_MISSING",
            "/controls",
            format!("baseline case {case_id} is absent from the suite report"),
        );
    }
    ControlReport {
        case: case_id.to_owned(),
        accepted: case.is_some_and(|report| {
            report.passed
                && report.expected_conformant
                && report.actual_conformant
                && report.actual_diagnostics.is_empty()
        }),
        actual_diagnostics: case.map_or_else(Vec::new, |report| report.actual_diagnostics.clone()),
    }
}

fn score_mutation(
    index: usize,
    mutation: &Mutation,
    baseline_accepted: bool,
    mutant: Option<&CaseReport>,
    intended_diagnostics: &[String],
    diagnostics: &mut Vec<Diagnostic>,
) -> MutationStatus {
    let Some(mutant) = mutant else {
        return MutationStatus::CaseMissing;
    };
    if !baseline_accepted {
        push(
            diagnostics,
            "ADVERSARIAL_BASELINE_INVALID",
            format!("/mutations/{index}/baseline_case"),
            format!(
                "baseline case {} did not pass as conformant",
                mutation.baseline_case
            ),
        );
        return MutationStatus::InvalidControl;
    }
    if mutant.expected_conformant || mutant.expected_diagnostics != intended_diagnostics {
        push(
            diagnostics,
            "ADVERSARIAL_MUTANT_CONTRACT_INVALID",
            format!("/mutations/{index}/mutant_case"),
            format!(
                "mutant case {} does not declare the benchmark's exact expected diagnostic set",
                mutation.mutant_case
            ),
        );
        return MutationStatus::UnexpectedDiagnostics;
    }
    if mutant.actual_conformant {
        MutationStatus::Escaped
    } else if mutant.passed && mutant.actual_diagnostics == intended_diagnostics {
        MutationStatus::ExactDetection
    } else {
        MutationStatus::UnexpectedDiagnostics
    }
}

fn outcome_counts(reports: &[MutationReport]) -> OutcomeCounts {
    outcome_counts_refs(&reports.iter().collect::<Vec<_>>())
}

fn outcome_counts_refs(reports: &[&MutationReport]) -> OutcomeCounts {
    let mut counts = OutcomeCounts::default();
    for report in reports {
        match report.status {
            MutationStatus::ExactDetection => counts.exact += 1,
            MutationStatus::UnexpectedDiagnostics => counts.unexpected += 1,
            MutationStatus::Escaped => counts.escaped += 1,
            MutationStatus::InvalidControl => counts.invalid_control += 1,
            MutationStatus::CaseMissing => counts.missing += 1,
        }
    }
    counts
}

fn failure_report(diagnostic: Diagnostic) -> AdversarialReport {
    let invalid = || VersionedIdentity {
        id: "unknown".to_owned(),
        version: "unknown".to_owned(),
        status: "invalid".to_owned(),
    };
    AdversarialReport {
        format_version: FORMAT_VERSION.to_owned(),
        benchmark: invalid(),
        suite: invalid(),
        profile: invalid(),
        conformant: false,
        summary: AdversarialSummary::default(),
        rates: AdversarialRates::default(),
        coverage: AdversarialCoverage::default(),
        controls: Vec::new(),
        threat_classes: Vec::new(),
        mutations: Vec::new(),
        diagnostics: vec![diagnostic],
    }
}

fn diagnostic(code: &str, pointer: impl Into<String>, message: impl Into<String>) -> Diagnostic {
    Diagnostic {
        code: code.to_owned(),
        pointer: pointer.into(),
        message: message.into(),
    }
}

fn push(
    diagnostics: &mut Vec<Diagnostic>,
    code: &str,
    pointer: impl Into<String>,
    message: impl Into<String>,
) {
    diagnostics.push(diagnostic(code, pointer, message));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn repository_benchmark_detects_every_mutation_exactly() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        let report = run_adversarial_benchmark(&root);
        assert!(report.conformant, "{:#?}", report.diagnostics);
        assert_eq!(report.summary.mutations, 18);
        assert_eq!(report.summary.controlled_mutations, 18);
        assert_eq!(report.summary.exactly_detected, 18);
        assert_eq!(report.summary.controls_accepted, 10);
        assert_eq!(report.coverage.eligible_mutants, 18);
        assert_eq!(report.coverage.scored_mutants, 18);
        assert!(report.coverage.missing.is_empty());
        assert!(report.coverage.extra.is_empty());

        let expected = std::fs::read_to_string(
            root.join("conformance/reports/trace-adversarial-0.1.0-rc.1.json"),
        )
        .expect("frozen adversarial report");
        let actual = format!(
            "{}\n",
            serde_json::to_string_pretty(&report).expect("serializable adversarial report")
        );
        assert_eq!(actual, expected);
    }

    #[test]
    fn mutation_scoring_distinguishes_exact_detection_from_escape() {
        let mutation = Mutation {
            id: "A999".to_owned(),
            threat_class: "test".to_owned(),
            operator: "field-replacement".to_owned(),
            baseline_case: "control".to_owned(),
            mutant_case: "mutant".to_owned(),
            controlled_paths: vec!["/trace/test".to_owned()],
            intended_diagnostics: vec!["TRACE_TEST".to_owned()],
        };
        let intended = vec!["TRACE_TEST".to_owned()];
        let exact = CaseReport {
            id: "mutant".to_owned(),
            passed: true,
            expected_conformant: false,
            actual_conformant: false,
            expected_diagnostics: intended.clone(),
            actual_diagnostics: intended.clone(),
            requirements: Vec::new(),
        };
        let mut diagnostics = Vec::new();
        assert_eq!(
            score_mutation(
                0,
                &mutation,
                true,
                Some(&exact),
                &intended,
                &mut diagnostics,
            ),
            MutationStatus::ExactDetection
        );
        let escaped = CaseReport {
            passed: false,
            actual_conformant: true,
            actual_diagnostics: Vec::new(),
            ..exact
        };
        assert_eq!(
            score_mutation(
                0,
                &mutation,
                true,
                Some(&escaped),
                &intended,
                &mut diagnostics,
            ),
            MutationStatus::Escaped
        );
        assert!(diagnostics.is_empty());
    }
}
