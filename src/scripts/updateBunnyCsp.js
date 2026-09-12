import { CSP_HEADER, CSP_POLICY, LEGACY_CSP_HEADER } from "./cspPolicy.js";

const API_BASE = process.env.BUNNY_API_BASE || "https://bunnycdn.com/api";

function env(name) {
  return process.env[name]?.trim() || undefined;
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const body = await response.text();
  if (!response.ok) throw new Error(`Request failed (${response.status}) at ${url}: ${body}`);
  return body ? JSON.parse(body) : {};
}

async function main() {
  const apiKey = env("ZONE_API_KEY") || env("BUNNYCDN_ZONE_API_KEY");
  const zoneId = env("ZONE_ID") || env("BUNNYCDN_ZONE_ID") || env("BUNNYCDN_DEV_ZONE_ID");
  if (!apiKey || !zoneId) throw new Error("Missing Bunny zone credentials.");

  const headers = { AccessKey: apiKey, Accept: "application/json", "Content-Type": "application/json" };
  const pullZoneUrl = `${API_BASE}/pullzone/${zoneId}`;
  const pullZone = await requestJson(pullZoneUrl, { method: "GET", headers });
  const acceptedNames = new Set([CSP_HEADER.toLowerCase(), LEGACY_CSP_HEADER.toLowerCase()]);
  const rule = (pullZone.EdgeRules || []).find((candidate) =>
    acceptedNames.has(String(candidate?.ActionParameter1 || "").toLowerCase()),
  );

  if (!rule) {
    throw new Error(
      `No existing ${CSP_HEADER} edge rule found. Create the response-header rule once in Bunny, then rerun.`,
    );
  }

  if (rule.ActionParameter1 === CSP_HEADER && rule.ActionParameter2 === CSP_POLICY) {
    console.log("Bunny CSP edge rule already matches the repository policy.");
    return;
  }

  await requestJson(`${pullZoneUrl}/edgerules/addOrUpdate`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ...rule, ActionParameter1: CSP_HEADER, ActionParameter2: CSP_POLICY }),
  });
  console.log(`Updated Bunny ${CSP_HEADER} edge rule.`);
}

main().catch((error) => {
  console.error("[updateBunnyCsp]", error instanceof Error ? error.message : error);
  process.exit(1);
});
