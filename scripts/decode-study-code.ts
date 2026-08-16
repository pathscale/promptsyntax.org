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

process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
