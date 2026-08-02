use std::io::Write;

use serde::Serialize;
use serde::ser::{SerializeSeq, Serializer as _};

const FORMAT_VERSION: &str = "0.1-draft";
const GENERATOR_ID: &str = "promptsyntax-core-grammar";

#[derive(Debug, Serialize)]
struct GeneratedCase {
    id: String,
    name: String,
    source: String,
    options: Options,
}

#[derive(Debug, Default, Serialize)]
struct Options {
    #[serde(skip_serializing_if = "Vec::is_empty")]
    entities: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    actions: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    authoring_namespaces: Vec<String>,
}

/// Metadata embedded in generated-differential reports.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct GeneratorMetadata {
    pub id: String,
    pub version: String,
    pub seed: String,
}

impl GeneratorMetadata {
    #[must_use]
    pub fn core(seed: u64) -> Self {
        Self {
            id: GENERATOR_ID.to_owned(),
            version: FORMAT_VERSION.to_owned(),
            seed: seed.to_string(),
        }
    }
}

/// Write deterministic grammar-generated Core inputs as one JSON array.
///
/// The generator supplies syntax and capability environments, but deliberately supplies no
/// expected parser answer. Differential comparison therefore cannot inherit Rust parser
/// behavior as an oracle.
///
/// # Errors
///
/// Returns an error if serialization or writing fails.
pub fn write_generated_core_cases(
    output: impl Write,
    case_count: usize,
    seed: u64,
) -> Result<(), String> {
    let mut serializer = serde_json::Serializer::new(output);
    let mut sequence = serializer
        .serialize_seq(Some(case_count))
        .map_err(|error| error.to_string())?;
    let mut random = SplitMix64::new(seed);
    for index in 0..case_count {
        sequence
            .serialize_element(&generate_case(index, &mut random))
            .map_err(|error| error.to_string())?;
    }
    sequence.end().map_err(|error| error.to_string())
}

#[allow(clippy::too_many_lines)]
fn generate_case(index: usize, random: &mut SplitMix64) -> GeneratedCase {
    let nonce = random.next();
    let family = index % 32;
    let model = pick(&["atlas-4", "atlas-mini", "café", "អាត្លាស"], nonce);
    let file = pick(
        &["notes.md", "q3-report.md", "数据.csv", "របាយការណ៍.md"],
        nonce >> 3,
    );
    let prose = pick(
        &["Summarize", "សង្ខេប", "要約", "ملخص", "סיכום", "สรุป"],
        nonce >> 7,
    );
    let spacing = pick(&[" ", "\t", "\n", "  "], nonce >> 11);
    let number = nonce % 10_000;
    let (name, source, options) = match family {
        0 => (
            "plain-unicode",
            format!("{prose}{spacing}plain text {number}"),
            Options::default(),
        ),
        1 => (
            "qualified-reference",
            format!("{prose}{spacing}@model:atlas/{model}"),
            Options::default(),
        ),
        2 => (
            "file-reference",
            format!("Read{spacing}@file:{file}"),
            Options::default(),
        ),
        3 => (
            "declared-bare-entity",
            format!("@{model}{spacing}{prose}"),
            Options {
                entities: vec![model.to_owned()],
                ..Options::default()
            },
        ),
        4 => (
            "declared-action",
            format!("/{prose}(count: {number})"),
            Options {
                actions: vec![prose.to_owned()],
                ..Options::default()
            },
        ),
        5 => (
            "full-width-action",
            format!("／{prose}(enabled: true)"),
            Options {
                actions: vec![prose.to_owned()],
                ..Options::default()
            },
        ),
        6 => (
            "reference-arguments",
            format!(
                "@tool:search(query: \"{prose} {number}\", count: {}, cache: null)",
                number % 17
            ),
            Options::default(),
        ),
        7 => (
            "escaped-argument",
            format!("@tool:search(query: \"item \\\"{number}\\\", next\")"),
            Options::default(),
        ),
        8 => (
            "fallback-route",
            format!(
                "@model:atlas/atlas-4 limit(wall_time: {}ms) else @model:atlas/atlas-mini else ask",
                1 + number
            ),
            Options::default(),
        ),
        9 => (
            "strict-fail-route",
            "@model:atlas/atlas-4! else @model:atlas/atlas-mini else fail".to_owned(),
            Options::default(),
        ),
        10 => (
            "normal-span",
            format!("<ps @file:{file}>{prose} {number}</ps>"),
            Options::default(),
        ),
        11 => (
            "nested-span",
            format!("<ps @file:outer-{number}.md>Outer <ps @file:{file}>{prose}</ps> end</ps>"),
            Options::default(),
        ),
        12 => (
            "span-attributes",
            format!("<ps context=\"case-{number}\" fill='strict'>{prose}</ps>"),
            Options::default(),
        ),
        13 => (
            "authoring-segment",
            format!("<ps @agency:items.state(id: \"item-{number}\", status: \"active\")>"),
            Options {
                authoring_namespaces: vec!["agency".to_owned()],
                ..Options::default()
            },
        ),
        14 => (
            "backtick-fence",
            format!("```ps\n@model:atlas/{model}\n/{prose}\n```"),
            Options {
                actions: vec![prose.to_owned()],
                ..Options::default()
            },
        ),
        15 => (
            "tilde-fence",
            format!("~~~text\n@file:{file}\n~~~"),
            Options::default(),
        ),
        16 => (
            "escaped-sigils",
            format!("\\@model:atlas/{model}{spacing}\\/{prose}"),
            Options {
                actions: vec![prose.to_owned()],
                ..Options::default()
            },
        ),
        17 => (
            "url-email-path",
            format!(
                "https://user{number}@example.test/@model:atlas/{model} mail{number}@example.test /usr/bin"
            ),
            Options::default(),
        ),
        18 => (
            "foreign-markup",
            format!("<widget title=\"> @model:atlas/{model}\">{prose}</widget>"),
            Options::default(),
        ),
        19 => (
            "markup-comment",
            format!("<!-- > @model:atlas/{model} case {number} < -->"),
            Options::default(),
        ),
        20 => (
            "malformed-reference",
            format!("@model:{spacing}{model}"),
            Options::default(),
        ),
        21 => (
            "malformed-reference-arguments",
            format!("@tool:search(query{number})"),
            Options::default(),
        ),
        22 => (
            "malformed-declared-action",
            format!("/{prose}(value: \"{number}\""),
            Options {
                actions: vec![prose.to_owned()],
                ..Options::default()
            },
        ),
        23 => (
            "bidi-reference",
            format!("@model:atlas/atlas-4\u{2066}{number}"),
            Options::default(),
        ),
        24 => (
            "bidi-argument",
            format!("@tool:search(query: \"item {number}\u{202e}\")"),
            Options::default(),
        ),
        25 => (
            "no-spacing-boundary",
            format!("{prose}@model:atlas/{model}"),
            Options::default(),
        ),
        26 => (
            "punctuation-boundary",
            format!("({prose}: @file:{file}), case {number}."),
            Options::default(),
        ),
        27 => (
            "frontmatter-lf",
            format!("---ps\ncase: \"{number}\"\n---\n{prose}"),
            Options::default(),
        ),
        28 => (
            "frontmatter-crlf",
            format!("---ps\r\ncase: \"{number}\"\r\n---\r\n{prose}"),
            Options::default(),
        ),
        29 => (
            "unclosed-span",
            format!("Before <ps @file:{file}>{prose} {number}"),
            Options::default(),
        ),
        30 => (
            "mixed-directives",
            format!("@model:atlas/{model}{spacing}/{prose}(to: \"km\"){spacing}@file:{file}"),
            Options {
                actions: vec![prose.to_owned()],
                ..Options::default()
            },
        ),
        _ => (
            "mixed-line-endings",
            format!("{prose}\r\n@model:atlas/{model}\ncase {number}"),
            Options::default(),
        ),
    };
    GeneratedCase {
        id: format!("core-generated-{index:06}"),
        name: name.to_owned(),
        source,
        options,
    }
}

fn pick<'a>(values: &'a [&str], value: u64) -> &'a str {
    let index = usize::try_from(value % values.len() as u64).expect("small choice index");
    values[index]
}

struct SplitMix64 {
    state: u64,
}

impl SplitMix64 {
    const fn new(seed: u64) -> Self {
        Self { state: seed }
    }

    fn next(&mut self) -> u64 {
        self.state = self.state.wrapping_add(0x9e37_79b9_7f4a_7c15);
        let mut value = self.state;
        value = (value ^ (value >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
        value = (value ^ (value >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
        value ^ (value >> 31)
    }
}

#[cfg(test)]
mod tests {
    use super::write_generated_core_cases;

    #[test]
    fn generation_is_deterministic_and_contains_no_expected_answers() {
        let mut first = Vec::new();
        let mut second = Vec::new();
        write_generated_core_cases(&mut first, 64, 20_270_803).expect("first generation");
        write_generated_core_cases(&mut second, 64, 20_270_803).expect("second generation");
        assert_eq!(first, second);
        let cases: serde_json::Value = serde_json::from_slice(&first).expect("generated JSON");
        assert_eq!(cases.as_array().map(Vec::len), Some(64));
        assert!(cases[0].get("data_plane").is_none());
        assert!(cases[0].get("directives").is_none());
        assert!(cases[0].get("diagnostics").is_none());
    }
}
