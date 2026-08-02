use std::collections::{BTreeSet, HashSet};
use std::fs;
use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::trace::{ProducerTranscript, validate_trace};
use crate::{Diagnostic, check_requirements_json, check_schema_json, validate_instance_json};

const FORMAT_VERSION: &str = "0.1-draft";

#[derive(Debug, Serialize)]
pub struct SuiteReport {
    pub format_version: String,
    pub suite: VersionedIdentity,
    pub spec: ReportSpec,
    pub profile: VersionedIdentity,
    pub conformant: bool,
    pub summary: SuiteSummary,
    pub coverage: CoverageReport,
    pub families: Vec<FamilyReport>,
    pub diagnostics: Vec<Diagnostic>,
}

#[derive(Debug, Serialize)]
pub struct VersionedIdentity {
    pub id: String,
    pub version: String,
    pub status: String,
}

#[derive(Debug, Serialize)]
pub struct ReportSpec {
    pub commit: String,
    pub declared_version: String,
}

#[derive(Debug, Default, Serialize)]
pub struct SuiteSummary {
    pub families: usize,
    pub cases: usize,
    pub passed: usize,
    pub failed: usize,
    pub requirements_required: usize,
    pub requirements_covered: usize,
}

#[derive(Debug, Default, Serialize)]
pub struct CoverageReport {
    pub required: Vec<String>,
    pub covered: Vec<String>,
    pub missing: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct FamilyReport {
    pub id: String,
    pub target: String,
    pub status: String,
    pub cases: Vec<CaseReport>,
}

#[derive(Debug, Serialize)]
pub struct CaseReport {
    pub id: String,
    pub passed: bool,
    pub expected_conformant: bool,
    pub actual_conformant: bool,
    pub expected_diagnostics: Vec<String>,
    pub actual_diagnostics: Vec<String>,
    pub requirements: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct Manifest {
    format_version: String,
    suite: SuiteMetadata,
    spec: ManifestSpec,
    files: ManifestFiles,
    families: Vec<ManifestFamily>,
    claims: Vec<ManifestClaim>,
}

#[derive(Debug, Deserialize)]
struct SuiteMetadata {
    id: String,
    version: String,
    status: String,
}

#[derive(Debug, Deserialize)]
struct ManifestSpec {
    path: String,
    commit: String,
    declared_version: String,
    baseline_status: String,
}

#[derive(Debug, Deserialize)]
struct ManifestFiles {
    requirements: String,
    requirements_schema: String,
    diagnostics: String,
    diagnostics_schema: String,
    trace_schema: String,
    family_schema: String,
    transcript_schema: String,
    profile: String,
    profile_schema: String,
    report_schema: String,
    core_cases: String,
    core_cases_schema: String,
    adapter_result_schema: String,
    implementations_lock: String,
    implementations_schema: String,
    candidate_report: String,
}

#[derive(Debug, Deserialize)]
struct ManifestFamily {
    id: String,
    layer: String,
    target: String,
    version: String,
    path: String,
    status: String,
}

#[derive(Debug, Deserialize)]
struct ManifestClaim {
    profile: String,
    families: Vec<String>,
    status: String,
}

#[derive(Debug, Deserialize)]
struct Profile {
    id: String,
    version: String,
    status: String,
    requirements: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct CaseFamily {
    format_version: String,
    id: String,
    version: String,
    status: String,
    profile: String,
    target: String,
    cases: Vec<Case>,
}

#[derive(Debug, Deserialize)]
struct Case {
    id: String,
    requirements: Vec<String>,
    trace: String,
    #[serde(default)]
    patch: Vec<PatchOperation>,
    transcript: Option<String>,
    #[serde(default)]
    transcript_patch: Vec<PatchOperation>,
    expected: Expected,
}

#[derive(Debug, Deserialize)]
struct Expected {
    conformant: bool,
    diagnostics: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct PatchOperation {
    op: String,
    path: String,
    value: Option<Value>,
}

#[must_use]
pub fn run_suite(root: &Path) -> SuiteReport {
    match run_suite_inner(root) {
        Ok(report) => report,
        Err(diagnostic) => failure_report(diagnostic),
    }
}

#[allow(clippy::too_many_lines)]
fn run_suite_inner(root: &Path) -> Result<SuiteReport, Diagnostic> {
    let manifest_value = read_json(root, "conformance/manifest.json")?;
    let manifest_schema = read_json(root, "conformance/manifest.schema.json")?;
    ensure_schema(&manifest_schema, "/conformance/manifest.schema.json")?;
    ensure_instance(
        &manifest_schema,
        &manifest_value,
        "/conformance/manifest.json",
    )?;
    let manifest: Manifest = deserialize_value(manifest_value, "/conformance/manifest.json")?;

    let mut suite_diagnostics = Vec::new();
    if manifest.format_version != FORMAT_VERSION {
        push(
            &mut suite_diagnostics,
            "SUITE_FORMAT_UNSUPPORTED",
            "/format_version",
            format!("suite format must be {FORMAT_VERSION}"),
        );
    }
    if manifest.spec.baseline_status == "frozen" && manifest.suite.status != "released" {
        push(
            &mut suite_diagnostics,
            "SUITE_BASELINE_STATUS_INVALID",
            "/spec/baseline_status",
            "a frozen baseline requires a released suite status",
        );
    }
    if !is_safe_relative_path(&manifest.spec.path) {
        push(
            &mut suite_diagnostics,
            "SUITE_PATH_INVALID",
            "/spec/path",
            "specification path is not a safe repository-relative path",
        );
    }

    let requirements_schema = checked_schema(root, &manifest.files.requirements_schema)?;
    let requirements_value = read_json(root, &manifest.files.requirements)?;
    append_validation(
        &mut suite_diagnostics,
        validate_value(&requirements_schema, &requirements_value),
        &manifest.files.requirements,
    );
    let requirements_bytes = serde_json::to_vec(&requirements_value).map_err(|error| {
        diagnostic(
            "SUITE_JSON_INVALID",
            &manifest.files.requirements,
            error.to_string(),
        )
    })?;
    suite_diagnostics.extend(check_requirements_json(&requirements_bytes).diagnostics);
    let requirement_ids = requirements_value
        .get("requirements")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|item| item.get("id").and_then(Value::as_str))
        .map(str::to_owned)
        .collect::<HashSet<_>>();

    let diagnostics_schema = checked_schema(root, &manifest.files.diagnostics_schema)?;
    let diagnostics_value = read_json(root, &manifest.files.diagnostics)?;
    append_validation(
        &mut suite_diagnostics,
        validate_value(&diagnostics_schema, &diagnostics_value),
        &manifest.files.diagnostics,
    );
    let diagnostic_codes = registry_codes(&diagnostics_value, &mut suite_diagnostics);

    let trace_schema = checked_schema(root, &manifest.files.trace_schema)?;
    let family_schema = checked_schema(root, &manifest.files.family_schema)?;
    let transcript_schema = checked_schema(root, &manifest.files.transcript_schema)?;
    let profile_schema = checked_schema(root, &manifest.files.profile_schema)?;
    let report_schema = checked_schema(root, &manifest.files.report_schema)?;
    let core_cases_schema = checked_schema(root, &manifest.files.core_cases_schema)?;
    let _adapter_result_schema = checked_schema(root, &manifest.files.adapter_result_schema)?;

    let core_cases = read_json(root, &manifest.files.core_cases)?;
    append_validation(
        &mut suite_diagnostics,
        validate_value(&core_cases_schema, &core_cases),
        &manifest.files.core_cases,
    );
    let implementations_schema = checked_schema(root, &manifest.files.implementations_schema)?;
    let implementations_lock = read_json(root, &manifest.files.implementations_lock)?;
    append_validation(
        &mut suite_diagnostics,
        validate_value(&implementations_schema, &implementations_lock),
        &manifest.files.implementations_lock,
    );
    let candidate_report = read_json(root, &manifest.files.candidate_report)?;
    append_validation(
        &mut suite_diagnostics,
        validate_value(&report_schema, &candidate_report),
        &manifest.files.candidate_report,
    );

    let profile_value = read_json(root, &manifest.files.profile)?;
    append_validation(
        &mut suite_diagnostics,
        validate_value(&profile_schema, &profile_value),
        &manifest.files.profile,
    );
    let profile: Profile = deserialize_value(profile_value, &manifest.files.profile)?;
    let profile_requirements = profile
        .requirements
        .iter()
        .cloned()
        .collect::<BTreeSet<_>>();
    for requirement in &profile_requirements {
        if !requirement_ids.contains(requirement) {
            push(
                &mut suite_diagnostics,
                "SUITE_PROFILE_REQUIREMENT_UNKNOWN",
                &manifest.files.profile,
                format!("profile requirement {requirement} is absent from the inventory"),
            );
        }
    }

    validate_claims(&manifest, &profile, &mut suite_diagnostics);

    let mut case_ids = HashSet::new();
    let mut covered_requirements = BTreeSet::new();
    let mut family_reports = Vec::new();

    for family_entry in &manifest.families {
        let family_value = read_json(root, &family_entry.path)?;
        let family_validation = validate_value(&family_schema, &family_value);
        append_validation(
            &mut suite_diagnostics,
            family_validation.clone(),
            &family_entry.path,
        );
        if !family_validation.conformant {
            continue;
        }
        let family: CaseFamily = deserialize_value(family_value, &family_entry.path)?;
        validate_family_metadata(family_entry, &family, &profile, &mut suite_diagnostics);

        let mut case_reports = Vec::new();
        for case in &family.cases {
            if !case_ids.insert(case.id.clone()) {
                push(
                    &mut suite_diagnostics,
                    "SUITE_CASE_ID_DUPLICATE",
                    &family_entry.path,
                    format!("case id {} occurs more than once", case.id),
                );
            }
            validate_case_requirements(
                case,
                &requirement_ids,
                &profile_requirements,
                &family_entry.path,
                &mut suite_diagnostics,
            );
            let report = run_case(
                root,
                &family,
                case,
                &trace_schema,
                &transcript_schema,
                &diagnostic_codes,
                &family_entry.path,
                &mut suite_diagnostics,
            );
            if report.passed {
                covered_requirements.extend(report.requirements.iter().cloned());
            }
            case_reports.push(report);
        }
        case_reports.sort_by(|left, right| left.id.cmp(&right.id));
        family_reports.push(FamilyReport {
            id: family.id,
            target: family.target,
            status: family.status,
            cases: case_reports,
        });
    }
    family_reports.sort_by(|left, right| left.id.cmp(&right.id));

    let missing_requirements = profile_requirements
        .difference(&covered_requirements)
        .cloned()
        .collect::<Vec<_>>();
    for requirement in &missing_requirements {
        push(
            &mut suite_diagnostics,
            "SUITE_PROFILE_COVERAGE_MISSING",
            "/coverage/missing",
            format!("profile requirement {requirement} has no passing case"),
        );
    }

    suite_diagnostics.sort_by(|left, right| {
        left.pointer
            .cmp(&right.pointer)
            .then_with(|| left.code.cmp(&right.code))
            .then_with(|| left.message.cmp(&right.message))
    });
    let cases = family_reports
        .iter()
        .map(|family| family.cases.len())
        .sum::<usize>();
    let passed = family_reports
        .iter()
        .flat_map(|family| &family.cases)
        .filter(|case| case.passed)
        .count();
    let failed = cases.saturating_sub(passed);
    let conformant = failed == 0 && missing_requirements.is_empty() && suite_diagnostics.is_empty();
    let required = profile_requirements.iter().cloned().collect::<Vec<_>>();
    let covered = covered_requirements
        .intersection(&profile_requirements)
        .cloned()
        .collect::<Vec<_>>();

    let mut report = SuiteReport {
        format_version: FORMAT_VERSION.to_owned(),
        suite: VersionedIdentity {
            id: manifest.suite.id,
            version: manifest.suite.version,
            status: manifest.suite.status,
        },
        spec: ReportSpec {
            commit: manifest.spec.commit,
            declared_version: manifest.spec.declared_version,
        },
        profile: VersionedIdentity {
            id: profile.id,
            version: profile.version,
            status: profile.status,
        },
        conformant,
        summary: SuiteSummary {
            families: family_reports.len(),
            cases,
            passed,
            failed,
            requirements_required: required.len(),
            requirements_covered: covered.len(),
        },
        coverage: CoverageReport {
            required,
            covered,
            missing: missing_requirements,
        },
        families: family_reports,
        diagnostics: suite_diagnostics,
    };

    let report_value = serde_json::to_value(&report).map_err(|error| {
        diagnostic(
            "SUITE_REPORT_INVALID",
            &manifest.files.report_schema,
            error.to_string(),
        )
    })?;
    let report_validation = validate_value(&report_schema, &report_value);
    if !report_validation.conformant {
        report.conformant = false;
        report.diagnostics.push(diagnostic(
            "SUITE_REPORT_INVALID",
            &manifest.files.report_schema,
            "generated report does not satisfy its schema",
        ));
    }
    Ok(report)
}

#[allow(clippy::too_many_arguments)]
fn run_case(
    root: &Path,
    family: &CaseFamily,
    case: &Case,
    trace_schema: &Value,
    transcript_schema: &Value,
    diagnostic_codes: &HashSet<String>,
    family_path: &str,
    suite_diagnostics: &mut Vec<Diagnostic>,
) -> CaseReport {
    let mut actual_diagnostics = Vec::new();
    let trace_result = read_json(root, &case.trace).and_then(|mut value| {
        apply_patch(&mut value, &case.patch).map_err(|message| {
            diagnostic(
                "CASE_PATCH_INVALID",
                family_path,
                format!("case {} trace patch failed: {message}", case.id),
            )
        })?;
        Ok(value)
    });

    if let Ok(trace) = trace_result {
        let structural = validate_value(trace_schema, &trace);
        actual_diagnostics.extend(structural.diagnostics);
        if structural.conformant {
            let transcript = load_transcript(
                root,
                family,
                case,
                transcript_schema,
                &mut actual_diagnostics,
            );
            if family.target != "trace-producer" || transcript.is_some() {
                actual_diagnostics.extend(validate_trace(&trace, transcript.as_ref()));
            }
        }
    } else if let Err(error) = trace_result {
        actual_diagnostics.push(error);
    }

    let actual_codes = actual_diagnostics
        .iter()
        .map(|item| item.code.clone())
        .collect::<BTreeSet<_>>();
    let mut expected_codes = case.expected.diagnostics.clone();
    expected_codes.sort();
    expected_codes.dedup();
    let actual_codes = actual_codes.into_iter().collect::<Vec<_>>();
    let actual_conformant = actual_codes.is_empty();
    let passed = actual_conformant == case.expected.conformant && actual_codes == expected_codes;

    for code in expected_codes.iter().chain(&actual_codes) {
        if !diagnostic_codes.contains(code) {
            push(
                suite_diagnostics,
                "SUITE_DIAGNOSTIC_UNREGISTERED",
                family_path,
                format!("case {} uses unregistered diagnostic {code}", case.id),
            );
        }
    }

    let mut requirements = case.requirements.clone();
    requirements.sort();
    requirements.dedup();
    CaseReport {
        id: case.id.clone(),
        passed,
        expected_conformant: case.expected.conformant,
        actual_conformant,
        expected_diagnostics: expected_codes,
        actual_diagnostics: actual_codes,
        requirements,
    }
}

fn load_transcript(
    root: &Path,
    family: &CaseFamily,
    case: &Case,
    transcript_schema: &Value,
    diagnostics: &mut Vec<Diagnostic>,
) -> Option<ProducerTranscript> {
    if family.target != "trace-producer" {
        return None;
    }
    let Some(path) = &case.transcript else {
        diagnostics.push(diagnostic(
            "SUITE_PRODUCER_TRANSCRIPT_REQUIRED",
            &case.id,
            "trace-producer case has no deterministic transcript",
        ));
        return None;
    };
    let mut value = match read_json(root, path) {
        Ok(value) => value,
        Err(error) => {
            diagnostics.push(error);
            return None;
        }
    };
    if let Err(message) = apply_patch(&mut value, &case.transcript_patch) {
        diagnostics.push(diagnostic(
            "CASE_PATCH_INVALID",
            path,
            format!("case {} transcript patch failed: {message}", case.id),
        ));
        return None;
    }
    let validation = validate_value(transcript_schema, &value);
    diagnostics.extend(validation.diagnostics);
    if !validation.conformant {
        return None;
    }
    match serde_json::from_value(value) {
        Ok(transcript) => Some(transcript),
        Err(error) => {
            diagnostics.push(diagnostic("INSTANCE_JSON_INVALID", path, error.to_string()));
            None
        }
    }
}

fn validate_family_metadata(
    entry: &ManifestFamily,
    family: &CaseFamily,
    profile: &Profile,
    diagnostics: &mut Vec<Diagnostic>,
) {
    let matches = family.format_version == FORMAT_VERSION
        && entry.id == family.id
        && entry.layer == "trace"
        && entry.target == family.target
        && entry.version == family.version
        && entry.status == family.status
        && family.profile == profile.id;
    if !matches {
        push(
            diagnostics,
            "SUITE_FAMILY_METADATA_MISMATCH",
            &entry.path,
            "manifest family metadata disagrees with the family document or active profile",
        );
    }
}

fn validate_case_requirements(
    case: &Case,
    requirement_ids: &HashSet<String>,
    profile_requirements: &BTreeSet<String>,
    family_path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) {
    for requirement in &case.requirements {
        if !requirement_ids.contains(requirement) {
            push(
                diagnostics,
                "SUITE_CASE_REQUIREMENT_UNKNOWN",
                family_path,
                format!("case {} cites unknown requirement {requirement}", case.id),
            );
        } else if !profile_requirements.contains(requirement) {
            push(
                diagnostics,
                "SUITE_CASE_REQUIREMENT_OUTSIDE_PROFILE",
                family_path,
                format!(
                    "case {} cites requirement {requirement} outside the active profile",
                    case.id
                ),
            );
        }
    }
}

fn validate_claims(manifest: &Manifest, profile: &Profile, diagnostics: &mut Vec<Diagnostic>) {
    let family_ids = manifest
        .families
        .iter()
        .map(|family| family.id.as_str())
        .collect::<HashSet<_>>();
    for (claim_index, claim) in manifest.claims.iter().enumerate() {
        if claim.profile != profile.id || claim.status != profile.status {
            push(
                diagnostics,
                "SUITE_CLAIM_PROFILE_MISMATCH",
                format!("/claims/{claim_index}"),
                "claim profile or status disagrees with the profile document",
            );
        }
        for family in &claim.families {
            if !family_ids.contains(family.as_str()) {
                push(
                    diagnostics,
                    "SUITE_CLAIM_FAMILY_UNKNOWN",
                    format!("/claims/{claim_index}/families"),
                    format!("claim cites unknown family {family}"),
                );
            }
        }
    }
}

fn registry_codes(value: &Value, diagnostics: &mut Vec<Diagnostic>) -> HashSet<String> {
    let mut codes = HashSet::new();
    for (index, item) in value
        .get("diagnostics")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .enumerate()
    {
        if let Some(code) = item.get("code").and_then(Value::as_str) {
            if !codes.insert(code.to_owned()) {
                push(
                    diagnostics,
                    "SUITE_DIAGNOSTIC_DUPLICATE",
                    format!("/diagnostics/{index}/code"),
                    format!("diagnostic code {code} occurs more than once"),
                );
            }
        }
    }
    codes
}

fn checked_schema(root: &Path, relative: &str) -> Result<Value, Diagnostic> {
    let schema = read_json(root, relative)?;
    ensure_schema(&schema, relative)?;
    Ok(schema)
}

fn ensure_schema(schema: &Value, pointer: &str) -> Result<(), Diagnostic> {
    let bytes = serde_json::to_vec(schema)
        .map_err(|error| diagnostic("SCHEMA_JSON_INVALID", pointer, error.to_string()))?;
    let report = check_schema_json(&bytes);
    if report.conformant {
        Ok(())
    } else {
        Err(diagnostic(
            "SCHEMA_META_INVALID",
            pointer,
            report
                .diagnostics
                .first()
                .map_or("schema meta-validation failed", |item| {
                    item.message.as_str()
                }),
        ))
    }
}

fn ensure_instance(schema: &Value, instance: &Value, pointer: &str) -> Result<(), Diagnostic> {
    let report = validate_value(schema, instance);
    if report.conformant {
        Ok(())
    } else {
        Err(diagnostic(
            "SCHEMA_INSTANCE_INVALID",
            pointer,
            report
                .diagnostics
                .first()
                .map_or("instance validation failed", |item| item.message.as_str()),
        ))
    }
}

fn validate_value(schema: &Value, instance: &Value) -> crate::ValidationReport {
    let schema_bytes = serde_json::to_vec(schema).unwrap_or_default();
    let instance_bytes = serde_json::to_vec(instance).unwrap_or_default();
    validate_instance_json(&schema_bytes, &instance_bytes)
}

fn append_validation(
    diagnostics: &mut Vec<Diagnostic>,
    report: crate::ValidationReport,
    artifact: &str,
) {
    diagnostics.extend(report.diagnostics.into_iter().map(|mut item| {
        item.pointer = format!("{artifact}{}", item.pointer);
        item
    }));
}

fn deserialize_value<T: for<'de> Deserialize<'de>>(
    value: Value,
    pointer: &str,
) -> Result<T, Diagnostic> {
    serde_json::from_value(value)
        .map_err(|error| diagnostic("SUITE_JSON_INVALID", pointer, error.to_string()))
}

fn read_json(root: &Path, relative: &str) -> Result<Value, Diagnostic> {
    let path = resolve_path(root, relative)?;
    let bytes = fs::read(&path)
        .map_err(|error| diagnostic("SUITE_FILE_READ_FAILED", relative, error.to_string()))?;
    serde_json::from_slice(&bytes)
        .map_err(|error| diagnostic("SUITE_JSON_INVALID", relative, error.to_string()))
}

fn resolve_path(root: &Path, relative: &str) -> Result<PathBuf, Diagnostic> {
    if !is_safe_relative_path(relative) {
        return Err(diagnostic(
            "SUITE_PATH_INVALID",
            relative,
            "path must be repository-relative without parent traversal",
        ));
    }
    let canonical_root = root
        .canonicalize()
        .map_err(|error| diagnostic("SUITE_FILE_READ_FAILED", relative, error.to_string()))?;
    let joined = canonical_root.join(relative);
    let canonical_path = joined
        .canonicalize()
        .map_err(|error| diagnostic("SUITE_FILE_READ_FAILED", relative, error.to_string()))?;
    if !canonical_path.starts_with(&canonical_root) {
        return Err(diagnostic(
            "SUITE_PATH_INVALID",
            relative,
            "path resolves outside the repository root",
        ));
    }
    Ok(canonical_path)
}

fn is_safe_relative_path(value: &str) -> bool {
    let path = Path::new(value);
    !value.is_empty()
        && !path.is_absolute()
        && path
            .components()
            .all(|component| matches!(component, Component::Normal(_) | Component::CurDir))
}

fn apply_patch(document: &mut Value, operations: &[PatchOperation]) -> Result<(), String> {
    for operation in operations {
        apply_operation(document, operation)?;
    }
    Ok(())
}

fn apply_operation(document: &mut Value, operation: &PatchOperation) -> Result<(), String> {
    let (parent_pointer, token) = split_pointer(&operation.path)?;
    let parent = document
        .pointer_mut(&parent_pointer)
        .ok_or_else(|| format!("patch parent {parent_pointer} does not exist"))?;
    match (operation.op.as_str(), parent) {
        ("add", Value::Object(object)) => {
            let value = operation
                .value
                .clone()
                .ok_or_else(|| "add operation requires value".to_owned())?;
            object.insert(token, value);
            Ok(())
        }
        ("replace", Value::Object(object)) => {
            if !object.contains_key(&token) {
                return Err(format!("replace target {} does not exist", operation.path));
            }
            let value = operation
                .value
                .clone()
                .ok_or_else(|| "replace operation requires value".to_owned())?;
            object.insert(token, value);
            Ok(())
        }
        ("remove", Value::Object(object)) => object
            .remove(&token)
            .map(|_| ())
            .ok_or_else(|| format!("remove target {} does not exist", operation.path)),
        ("add", Value::Array(array)) => {
            let value = operation
                .value
                .clone()
                .ok_or_else(|| "add operation requires value".to_owned())?;
            if token == "-" {
                array.push(value);
                return Ok(());
            }
            let index = parse_index(&token, operation)?;
            if index > array.len() {
                return Err(format!("add index {index} is out of bounds"));
            }
            array.insert(index, value);
            Ok(())
        }
        ("replace", Value::Array(array)) => {
            let index = parse_index(&token, operation)?;
            let target = array
                .get_mut(index)
                .ok_or_else(|| format!("replace index {index} is out of bounds"))?;
            *target = operation
                .value
                .clone()
                .ok_or_else(|| "replace operation requires value".to_owned())?;
            Ok(())
        }
        ("remove", Value::Array(array)) => {
            let index = parse_index(&token, operation)?;
            if index >= array.len() {
                return Err(format!("remove index {index} is out of bounds"));
            }
            array.remove(index);
            Ok(())
        }
        (op, _) => Err(format!("operation {op} cannot target {}", operation.path)),
    }
}

fn split_pointer(pointer: &str) -> Result<(String, String), String> {
    let Some(index) = pointer.rfind('/') else {
        return Err("patch path must be a JSON Pointer".to_owned());
    };
    let parent = pointer[..index].to_owned();
    let token = pointer[index + 1..].replace("~1", "/").replace("~0", "~");
    if token.is_empty() {
        return Err("patch path token must not be empty".to_owned());
    }
    Ok((parent, token))
}

fn parse_index(token: &str, operation: &PatchOperation) -> Result<usize, String> {
    token
        .parse()
        .map_err(|_| format!("array token {token} in {} is not an index", operation.path))
}

fn failure_report(diagnostic: Diagnostic) -> SuiteReport {
    SuiteReport {
        format_version: FORMAT_VERSION.to_owned(),
        suite: VersionedIdentity {
            id: "promptsyntax-conformance".to_owned(),
            version: "unknown".to_owned(),
            status: "invalid".to_owned(),
        },
        spec: ReportSpec {
            commit: "0000000000000000000000000000000000000000".to_owned(),
            declared_version: "unknown".to_owned(),
        },
        profile: VersionedIdentity {
            id: "unknown".to_owned(),
            version: "unknown".to_owned(),
            status: "invalid".to_owned(),
        },
        conformant: false,
        summary: SuiteSummary::default(),
        coverage: CoverageReport::default(),
        families: Vec::new(),
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
    use serde_json::json;

    #[test]
    fn patch_supports_object_and_array_operations() {
        let mut value = json!({"items": [1], "name": "before"});
        let operations = vec![
            PatchOperation {
                op: "add".to_owned(),
                path: "/items/-".to_owned(),
                value: Some(json!(2)),
            },
            PatchOperation {
                op: "replace".to_owned(),
                path: "/name".to_owned(),
                value: Some(json!("after")),
            },
        ];
        apply_patch(&mut value, &operations).expect("patch succeeds");
        assert_eq!(value, json!({"items": [1, 2], "name": "after"}));
    }

    #[test]
    fn repository_suite_matches_all_expected_results() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        let report = run_suite(&root);
        assert!(report.conformant, "{:#?}", report.diagnostics);
        assert_eq!(report.summary.failed, 0);
        assert!(report.summary.cases > 0);
    }
}
