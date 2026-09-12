import { CSP_CHECK_URL, CSP_POLICY } from "./cspPolicy.js";

const retries = Number(process.env.CSP_VERIFY_RETRIES || 6);
const delayMs = Number(process.env.CSP_VERIFY_DELAY_MS || 10000);

function normalized(policy) {
  return policy
    .split(";")
    .map((directive) => directive.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .sort()
    .join("; ");
}

async function readPolicy() {
  const target = process.env.CSP_CHECK_URL || CSP_CHECK_URL;
  const url = new URL(target);
  url.searchParams.set("csp-verify", Date.now().toString());
  const response = await fetch(url, { redirect: "follow", headers: { Accept: "text/html" } });
  if (!response.ok) throw new Error(`Failed to fetch ${target} (${response.status})`);
  const policy = response.headers.get("content-security-policy");
  if (!policy) throw new Error("No Content-Security-Policy response header is enforced.");
  if (/fonts\.(?:googleapis|gstatic)\.com/i.test(policy)) throw new Error("Google Fonts is allowed by CSP.");
  return policy;
}

async function main() {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const actual = await readPolicy();
      if (normalized(actual) !== normalized(CSP_POLICY)) {
        throw new Error(`CSP differs from repository policy.\nexpected: ${CSP_POLICY}\nactual:   ${actual}`);
      }
      console.log("Live CSP matches the repository policy.");
      return;
    } catch (error) {
      console.warn(`[verifyCsp] attempt ${attempt}/${retries}: ${error instanceof Error ? error.message : error}`);
      if (attempt === retries) process.exit(1);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

main();
