/**
 * Decode a completion code produced by the /study flow.
 *
 * Usage:
 *   bun run scripts/decode-study-code.ts <completion-code>
 *
 * Prints the payload as pretty JSON on stdout. Exits nonzero with a message on
 * stderr when the argument is missing, is not valid base64, or does not decode
 * to a JSON object.
 */

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const code = process.argv[2];
if (!code) fail("Missing completion code. Usage: bun run scripts/decode-study-code.ts <code>");

let json: string;
try {
  json = Buffer.from(code, "base64").toString("utf8");
} catch {
  fail("Malformed completion code: not valid base64.");
}

// Buffer.from is lenient with base64, so a bad code usually surfaces here.
let payload: unknown;
try {
  payload = JSON.parse(json);
} catch {
  fail("Malformed completion code: does not decode to JSON.");
}

if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
  fail("Malformed completion code: decoded value is not a JSON object.");
}

/**
 * The fields a micro-4 run records. Listed so a truncated or older code is
 * reported rather than silently analysed as if it were complete: a missing
 * field here means the run did not finish the flow this decoder expects.
 */
const EXPECTED_FIELDS = [
  "consent",
  "q1_usage",
  "q2_heard_of_notation",
  "a_order",
  "a_conventional_answer",
  "a_receipt_answer",
  "b_achieved",
  "b_attempts",
  "b_ms_elapsed",
  "dropdown_final",
  "force_toggle_final",
  "b_q1_answer",
  "b_q2_answer",
  "canonical_form",
  "ms_elapsed_total",
  "study_version",
] as const;

const record = payload as Record<string, unknown>;
const missing = EXPECTED_FIELDS.filter((field) => !(field in record));

process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);

if (record.study_version !== "micro-4") {
  process.stderr.write(
    `Warning: study_version is ${JSON.stringify(record.study_version)}, expected "micro-4".\n`,
  );
}

if (missing.length > 0) {
  process.stderr.write(`Warning: missing fields: ${missing.join(", ")}\n`);
}

// A pass is only meaningful with the record that earned it, so a code claiming
// one without a canonical form is reported rather than counted.
if (record.b_achieved === true && !record.canonical_form) {
  process.stderr.write("Warning: b_achieved is true but canonical_form is empty.\n");
}
