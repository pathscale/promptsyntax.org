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
 * Exactly the fields a micro-5 run records.
 *
 * Reported rather than assumed, so a truncated code or one from an older
 * version of the flow is visible instead of being analysed as if it were
 * complete.
 */
const EXPECTED_FIELDS = [
  "consent",
  "q1_usage",
  "q2_heard_of_notation",
  "order",
  "answer_plain",
  "answer_receipt",
  "answer_preference",
  "answer_would_write",
  "ms_elapsed_total",
  "study_version",
] as const;

const record = payload as Record<string, unknown>;

process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);

if (record.study_version !== "micro-5") {
  process.stderr.write(
    `Warning: study_version is ${JSON.stringify(record.study_version)}, expected "micro-5".\n`,
  );
}

const missing = EXPECTED_FIELDS.filter((field) => !(field in record));
if (missing.length > 0) {
  process.stderr.write(`Warning: missing fields: ${missing.join(", ")}\n`);
}

const unexpected = Object.keys(record).filter(
  (key) => !EXPECTED_FIELDS.includes(key as (typeof EXPECTED_FIELDS)[number]),
);
if (unexpected.length > 0) {
  process.stderr.write(`Warning: unexpected fields: ${unexpected.join(", ")}\n`);
}
