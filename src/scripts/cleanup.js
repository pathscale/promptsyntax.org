import { existsSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { glob } from "glob";

const ROOT = path.resolve(process.cwd(), ".");

const dist = path.join(ROOT, "dist");
const htmlPath = path.join(dist, "index.html");

// --- 1. Rename main JS bundle to app.mjs ---
const mainJsFiles = glob.sync(path.join(dist, "static/js/index.*.js"));
if (mainJsFiles.length > 0) {
  const mainJsFile = mainJsFiles[0];
  const brFile = `${mainJsFile}.br`;
  const appMjsPath = path.join(dist, "static/js/app.mjs");

  if (existsSync(appMjsPath)) unlinkSync(appMjsPath);

  if (existsSync(brFile)) {
    renameSync(brFile, appMjsPath);
    unlinkSync(mainJsFile);
  } else {
    renameSync(mainJsFile, appMjsPath);
  }
}

// --- 2. Rename main CSS bundle to app.mcss (brotli) or app.css (plain) ---
const mainCssFiles = glob.sync(path.join(dist, "static/css/index.*.css"));
let appCssName = "app.css";
if (mainCssFiles.length > 0) {
  const mainCssFile = mainCssFiles[0];
  const brFile = `${mainCssFile}.br`;

  if (existsSync(brFile)) {
    appCssName = "app.mcss";
    const appMcssPath = path.join(dist, "static/css/app.mcss");
    if (existsSync(appMcssPath)) unlinkSync(appMcssPath);
    renameSync(brFile, appMcssPath);
    unlinkSync(mainCssFile);
  } else {
    const appCssPath = path.join(dist, "static/css/app.css");
    if (existsSync(appCssPath)) unlinkSync(appCssPath);
    renameSync(mainCssFile, appCssPath);
  }
}

// --- 3. Remove async chunk folder ---
try {
  rmSync(path.join(dist, "static/js/async"), { recursive: true, force: true });
  console.info("Removed async chunks directory after build");
} catch {
  console.warn("No async folder found, skipping async cleanup");
}

// --- 4. Update HTML references with version ---
const packageJson = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
let version = packageJson.version;

if (version.includes("$GITHUB_RUN_NUMBER")) {
  const buildNumber = process.env.GITHUB_RUN_NUMBER || "137";
  version = version.replace("$GITHUB_RUN_NUMBER", buildNumber);
}

if (existsSync(htmlPath)) {
  let html = readFileSync(htmlPath, "utf8");

  if (mainJsFiles.length > 0) {
    const mainJsFileShort = path.basename(mainJsFiles[0]);
    html = html.replace(new RegExp(mainJsFileShort, "g"), `app.mjs?v=${version}`);
  }

  if (mainCssFiles.length > 0) {
    const mainCssFileShort = path.basename(mainCssFiles[0]);
    html = html.replace(new RegExp(mainCssFileShort, "g"), `${appCssName}?v=${version}`);
  }

  writeFileSync(htmlPath, html);
}

console.info(`Cleanup completed. Version: ${version}`);
