# promptsyntax.org Review: Full

**Date:** 2026-07-27
**Scope:** entire repository except `node_modules/`, `bun.lock` internals and the binary PDFs' page
content. Read in full: `src/**` (11 tsx/ts + 1 js + 3 css), `spec/*.md`, `schemas/`, `examples/`,
`.github/workflows/pipeline.yml`, `rsbuild.config.ts`, `biome.json`, `tsconfig.json`,
`package.json`, `.claude/**`, and every `*.md` at the root plus `docs/`, `decisions/`, `profiles/`,
`paper/`.
**Commit:** `b44ab8b`
**Reviewer slice:** full (sole reviewer for this repo; no sibling slices)

## Summary

- The SolidJS app itself is small, tidy and idiomatic. `bun run typecheck` is clean. There are no
  secrets in the tree or anywhere in git history, and none of the confirmed cross-repo footguns
  (`encodePassword`, localStorage-role guards, third-party log sinks, aes-siv storage) exist here.
  I checked each explicitly.
- **The headline problem is the deploy artifact, not the app.** After `bun run build`,
  `dist/static/js/app.mjs` is not JavaScript. It contains raw brotli bytes, referenced from
  `index.html` as a plain `<script src>`. It only renders because BunnyCDN adds a
  `Content-Encoding: br` header that is configured out of band and documented nowhere in the repo.
  Any local static server, including the repo's own `bun run preview`, serves a blank page. That is
  precisely the recurring "local preview and deployed behaviour diverge" pain. I verified this by
  running `cleanup.js` against a copy of `dist/` (finding 1).
- **The second problem is that the spec is not the source of the site.** `spec/SPEC.md` is not
  imported, read, or referenced by any build step. `src/content/spec.html` is a hand-committed
  pandoc dump with a hand-prepended banner. `?raw` is real, but it imports the *derived HTML*, not
  the markdown. Renaming or editing a spec file changes nothing on the site and nothing complains.
  There are three independent drift channels (finding 2).
- Content is not sanitized, but it also is not user-controlled: `innerHTML` receives a
  compile-time-inlined string constant. That is genuinely safe today. The `biome-ignore` comment
  guarding it, however, suppresses a React-only rule and Biome reports it as having no effect, so
  there is no lint guard if someone later makes that prop dynamic (finding 8).
- All 66 KB of spec HTML rides in the initial JS payload for every homepage visitor, and code
  splitting is disabled at three separate layers, so it cannot be fixed by adding `lazy()` alone
  (finding 3).
- `bun run lint` is red at `HEAD`, and `bun run format`, listed as a validation command in two docs,
  would reflow the normative `schemas/prompt-trace.schema.json` (finding 5).

**Top three things to do:** stop shipping brotli under a `.mjs` extension so preview equals prod;
make `spec/*.md` the single source with a build-time markdown step; move the spec HTML out of the
initial bundle.

## Findings

### [SEV-1] Built JS and CSS are brotli streams disguised as `.mjs`/`.mcss`, so local preview is broken and prod depends on undocumented CDN config

- **ID:** `promptsyntax-full-01`
- **Severity:** High
- **Category:** Design / Correctness / Docs
- **Confidence:** High for the artifact contents (verified by execution); Medium for the exact
  BunnyCDN-side mechanism, which I cannot inspect from here.
- **Location:** `src/scripts/cleanup.js:10-45` and `:64-78`; `rsbuild.config.ts:71-83`;
  `package.json:13,15`; `.github/workflows/pipeline.yml:64-105`
- **What:** In a production build, `CompressionPlugin` emits `index.<hash>.js.br` alongside the
  plain bundle. `cleanup.js:19-24` then renames the **`.br` file** to `static/js/app.mjs` and
  deletes the real JavaScript. `cleanup.js:36-43` does the same for CSS into `app.mcss`. Line 69
  rewrites `index.html` to point a normal `<script src>` at that path. I copied the committed
  `dist/` into a scratch root and ran `cleanup.js` against it. Result:

  ```
  dist/static/js/app.mjs:   data          # `file` does not recognise it as text
  00000000: 5bac 7152 c08d 7106 dd01 ...  # brotli stream, not JS
  <script defer src="/static/js/app.mjs?v=1.0.1">
  <link href="/static/css/app.mcss?v=1.0.1" rel="stylesheet">
  ```

  Nothing in the repo sets `Content-Encoding`. The workflow uploads with a plain
  `curl -T` to BunnyCDN Storage (`pipeline.yml:77-81`), which does not add that header either. The
  site can therefore only work if the pull zone has an edge rule mapping `*.mjs`/`*.mcss` to
  `Content-Encoding: br`. The invented extensions are strong evidence that such a rule exists, but
  it is configured in the BunnyCDN dashboard and is recorded in no file here.
- **Why it matters:** This is the divergence, and it is total rather than subtle. `bun run preview`,
  `python3 -m http.server`, `npx serve`, a colleague's nginx, a PR preview environment: all of them
  serve those bytes with `Content-Type: text/javascript` and no encoding header, the browser fails
  to parse, and the page is blank with a console `SyntaxError`. Prod works. A new contributor
  cannot reproduce prod locally and has no way to discover why, because the one artifact that
  explains it lives in a web console. It also means the deploy has an undocumented single point of
  failure: if that edge rule is ever cleared or the site is moved behind a different CDN, the
  production site goes blank and the repo contains no hint as to the cause. Secondary cost: the
  content-hashed filenames rsbuild produced (`index.27f17134.js`), which are safely
  `immutable`-cacheable forever, are thrown away for a mutable fixed path plus a `?v=` query
  string. BunnyCDN pull zones commonly run with "Ignore Query String" enabled, in which case `?v=`
  busts nothing, which is exactly why the pipeline needs the fragile DELETE-then-PUT and purge
  dance in findings 4 and 7.
- **Fix:** Preferred, and it deletes code rather than adding it: drop `CompressionPlugin` from
  `rsbuild.config.ts:71-83` and delete steps 1 and 2 of `cleanup.js` entirely. Let rsbuild's
  content-hashed filenames through untouched and enable Brotli compression on the BunnyCDN pull
  zone, which BunnyCDN does on the fly. `dist/` then contains real JS and CSS at immutable hashed
  paths, `bun run preview` behaves exactly like production, and the stale-asset DELETE list becomes
  unnecessary because hashed names never collide.

  If pre-compression must be kept for cost reasons, then: keep the true extension (`app.js`), and in
  `pipeline.yml` upload it with an explicit header so the artifact is self-describing:

  ```sh
  curl -sS -X PUT -H "AccessKey: $STORAGE_API_KEY" \
       -H "Content-Encoding: br" -T "$file" "$url"
  ```

  and add a `preview` script that serves `dist/` with the same header, so local and remote agree.
  Either way, write the required CDN configuration into `README.md` next to the existing deploy
  sentence at `README.md:97-98`.
- **Effort:** S for the preferred fix (deleting two config blocks and ~35 lines of `cleanup.js`),
  plus one BunnyCDN setting. M if the pre-compression path is kept.
- **Blast radius:** `rsbuild.config.ts`, `src/scripts/cleanup.js`, `.github/workflows/pipeline.yml`,
  and one out-of-repo CDN setting. No application source changes. Not a breaking API change, but the
  first deploy after the change must be watched, since the asset paths change shape.

---

### [SEV-2] The spec markdown is not the source of the rendered site; three drift channels, none of them detectable

- **ID:** `promptsyntax-full-02`
- **Severity:** High
- **Category:** Design / Maintainability
- **Confidence:** High
- **Location:** `src/content/spec.html:1`, `src/content/syntax.html:1`, `src/pages/SpecPage.tsx:3`,
  `src/pages/SyntaxPage.tsx:3`, `spec/SPEC.md`, `public/SPEC.pdf` vs `spec/SPEC.pdf`,
  `README.md:88-89`
- **What:** Answering the brief's headline question directly: spec content reaches the site by
  **duplication**, not by import or by build. `?raw` is real (`rsbuild.config.ts:54-59` maps
  `resourceQuery: /raw/` to `asset/source`, typed at `src/env.d.ts:19-22`), but what it imports is
  `src/content/spec.html`, a 54 KB pandoc dump committed by hand. Nothing in the repo reads
  `spec/SPEC.md`: `rg` for it finds only prose references in `README.md:49` and
  `CONTRIBUTING.md:11`. There is no pandoc invocation, no npm script, no CI step, and no record of
  the command that produced the HTML. The only trace is a comment at `src/index.css:89`
  ("pandoc HTML"). On top of that, `src/content/spec.html:1` opens with a hand-written
  `<div class="doc-banner">` that does not exist in `spec/SPEC.md`, so it is a manual edit layered
  on generator output.

  I diffed the two representations and, credit where due, they are currently **in sync**: extracting
  every `<h2>`/`<h3>` from `spec.html` yields 37 headings matching `SPEC.md`'s 16 `##` and 21 `###`
  exactly, in order. The problem is structural, not present-tense.

  Three drift channels exist, and all three fail silently:

  1. `spec/SPEC.md` to `src/content/spec.html`. Rename or edit the markdown and the site keeps
     serving the old HTML. `typecheck`, `lint` and `build` all stay green. Nothing anywhere notices.
  2. `spec/SPEC.md` to `spec/SPEC.pdf`. No regeneration step.
  3. `spec/SPEC.pdf` to `public/SPEC.pdf`. These are byte-identical today (`md5` confirms for both
     PDF pairs) but are two independent files. Update one and `/spec`'s download link serves the
     other.

  Answering the specific failure modes asked about:
  - *Renamed spec file:* nothing breaks, nothing warns, the site silently serves stale content. This
    is the worst of the three outcomes because it is undetectable.
  - *Markdown the renderer mishandles:* nothing happens at build time, because there is no renderer
    in the build. The failure surfaces whenever a human next runs pandoc by hand, and the diff to
    review is a 930-line HTML blob with 65 KB lines, effectively unreviewable. A naive re-run also
    silently drops the hand-added banner, which is the page's "Draft v0.2.1, pre-implementation,
    this is a proposal" disclaimer. Losing that is a positioning problem, not just a cosmetic one.
  - *New spec section:* the TOC is derived at runtime from `h2[id], h3[id]`
    (`src/pages/DocPage.tsx:18`), so it self-updates once the HTML is regenerated, which is the one
    genuinely good part of this design. A whole new spec *document*, though, costs nine touchpoints:
    new md, new pdf, copy of the pdf into `public/`, new html, new page component, new `ROUTES` and
    `*_PDF` entries in `src/config/routes.ts`, new `<Route>` in `src/App.tsx:22-25`, new navbar link
    (`SiteNavbar.tsx:30-35`), new footer link (`Footer.tsx:13-18`), and a manual `public/sitemap.xml`
    row.
- **Why it matters:** For a repository whose entire product is a specification, "the website may be
  showing an old version of the spec and no tool will tell you" is the load-bearing risk. Readers,
  and eventually citers, treat the rendered page as authoritative. Two artifacts already show the
  cost: `[author]` and the version mismatch in finding 6 are both live on the site right now.
- **Fix:** Make `spec/*.md` the only place spec content is edited. Concretely:

  1. Add a build-time markdown step. Either check the pandoc command into the repo as a
     `spec:build` npm script wired into `prebuild` (smallest change, keeps pandoc's output), or add
     an rsbuild rule so markdown converts during the bundle and `src/content/*.html` is deleted:

     ```ts
     // rsbuild.config.ts, alongside the existing resourceQuery rule
     { test: /\.md$/, resourceQuery: /html/, use: [{ loader: "./scripts/md-loader.mjs" }] }
     ```
     ```ts
     // SpecPage becomes: import specHtml from "~/../spec/SPEC.md?html";
     ```
     Either way, add `src/content/` to `.gitignore` or delete it, so the derived artifact stops
     being a reviewable file and can no longer drift.

  2. Collapse the two page components into one manifest plus one route. This kills
     `SpecPage.tsx` and `SyntaxPage.tsx` outright and makes a new document a one-row change:

     ```ts
     // src/content/docs.ts
     export const DOCS = [
       { slug: "spec",   md: "SPEC.md",             pdf: "/SPEC.pdf",             banner: "Draft v0.2.1: ..." },
       { slug: "syntax", md: "SYNTAX-REFERENCE.md", pdf: "/SYNTAX-REFERENCE.pdf", banner: "The full syntax on one page." },
     ];
     ```
     with `<Route path="/:slug" component={DocPage} />`, and the navbar, footer and sitemap all
     generated by iterating `DOCS`.

  3. Move the banner text into that manifest so regenerating HTML cannot drop it.

  4. Delete `spec/*.pdf` and keep only `public/*.pdf`, or vice versa with a copy step. One
     location, not two.

  With all four, adding or editing spec content is a single-file change with no code edits, which is
  what the brief asked for. Step 1 alone removes the dangerous channel; steps 2 to 4 remove the
  boilerplate.
- **Effort:** M for step 1, M for steps 2 to 4. Needs a short design decision on pandoc vs a JS
  markdown library, since pandoc gives nicer tables but adds a non-JS build dependency that CI would
  have to install.
- **Blast radius:** `src/pages/*`, `src/App.tsx`, `src/config/routes.ts`, `src/components/SiteNavbar.tsx`,
  `src/components/Footer.tsx`, `rsbuild.config.ts`, `public/sitemap.xml`, plus deleting
  `src/content/`. Internal only, no public API.

---

### [SEV-3] All 66 KB of spec HTML is in the initial bundle, and code splitting is disabled in three places at once

- **ID:** `promptsyntax-full-03`
- **Severity:** Medium
- **Category:** Performance
- **Confidence:** High
- **Location:** `src/App.tsx:8-9`, `rsbuild.config.ts:61-64`, `src/scripts/cleanup.js:47-53`,
  `.github/workflows/pipeline.yml:100`
- **What:** `SpecPage` and `SyntaxPage` are statically imported in `App.tsx`, so their `?raw` HTML
  is inlined into the main chunk. Measured:

  | file | plain | brotli |
  |---|---|---|
  | `src/content/spec.html` | 54.0 KB | 14.6 KB |
  | `src/content/syntax.html` | 11.8 KB | 4.0 KB |
  | **total spec content** | **65.8 KB** | **18.5 KB** |
  | built `index.*.js` | 160.2 KB | 44.7 KB |

  So roughly 40 percent of the JavaScript payload is specification prose that a homepage visitor
  never reads. I confirmed it is present in the built bundle (`rg -c "doc-banner" dist/static/js/*.js`
  returns 1).

  The reason this is not a one-line fix is that three separate layers actively prevent code
  splitting: `rsbuild.config.ts:62-63` sets `splitChunks: false` and `runtimeChunk: false`,
  `cleanup.js:47-53` deletes `dist/static/js/async/` after every build, and `pipeline.yml:100`
  excludes `./static/js/async/*` from upload. Adding `lazy(() => import("~/pages/SpecPage"))` today
  would produce an async chunk, have it deleted at build time, have it excluded at upload time, and
  the site would break at runtime with a chunk load error on `/spec`. That is a trap a future
  contributor will walk into.
- **Why it matters:** ~18 KB brotli of dead weight on every first paint, on a page whose hero is the
  main marketing surface. More importantly the anti-splitting scaffolding means the obvious fix is a
  broken deploy rather than a compile error, which is the expensive kind of trap.
- **Fix:** Two independent moves.
  1. Remove the three anti-splitting layers, then route-split:
     ```ts
     const SpecPage = lazy(() => import("~/pages/SpecPage"));
     ```
     Delete `splitChunks: false` / `runtimeChunk: false`, delete step 3 of `cleanup.js`, and drop
     the `! -path "./static/js/async/*"` filter from the upload `find`. This composes cleanly with
     finding 1's preferred fix, which already deletes most of `cleanup.js`.
  2. Alternatively, or additionally: stop bundling the HTML at all. Emit `spec.html` and
     `syntax.html` as static files in `dist/` and `fetch()` them in `DocPage`'s `onMount`. That takes
     the spec content out of the JS graph entirely and lets the CDN cache the prose separately from
     the app. It also makes the markdown pipeline of finding 2 simpler, because the transform writes
     a file rather than feeding a loader.

  Note that if you take fix 2, `DocPage`'s `innerHTML` sink stops receiving a compile-time constant
  and starts receiving a network response. That does not make it attacker-controlled (same origin,
  first-party content), but it does change the argument in finding 8 from "structurally impossible"
  to "depends on the CDN", so add the `Show`/error handling and revisit that reasoning.
- **Effort:** S for fix 1, M for fix 2.
- **Blast radius:** `src/App.tsx`, `rsbuild.config.ts`, `src/scripts/cleanup.js`,
  `.github/workflows/pipeline.yml`. Fix 2 additionally touches `src/pages/DocPage.tsx`.

---

### [SEV-4] BunnyCDN edge purge uses `||` where it needs `&&`, then reports success regardless

- **ID:** `promptsyntax-full-04`
- **Severity:** Medium
- **Category:** Correctness / Deploy
- **Confidence:** High
- **Location:** `.github/workflows/pipeline.yml:107-118`
- **What:**
  ```sh
  if [ -n "$ZONE_API_KEY" ] || [ -n "$ZONE_ID" ]; then
    curl -sf -X POST -H "AccessKey: $ZONE_API_KEY" \
      "https://bunnycdn.com/api/pullzone/$ZONE_ID/purgeCache" || true
    echo "Edge cache purged"
  else
    echo "Skipping purge: ... not set"
  fi
  ```
  Three compounding problems. The condition is `||`, so having only one of the two secrets enters
  the branch and issues a request with an empty key or an empty zone id. `curl -sf` then fails, and
  `|| true` swallows it. The script prints "Edge cache purged" unconditionally, so the log asserts
  success in every case, including the case where the purge definitively did not happen.
- **Why it matters:** Under finding 1's `?v=` scheme this is the only real invalidation mechanism,
  and it silently no-ops while claiming to work. A deploy that appears green can leave the edge
  serving the previous build, and the log gives an operator no way to tell. This is the class of bug
  that costs an afternoon during an incident.
- **Fix:** Mechanical:
  ```sh
  if [ -n "$ZONE_API_KEY" ] && [ -n "$ZONE_ID" ]; then
    curl -sS --fail-with-body -X POST -H "AccessKey: $ZONE_API_KEY" \
      "https://bunnycdn.com/api/pullzone/$ZONE_ID/purgeCache"
    echo "Edge cache purged"
  else
    echo "::warning::Skipping purge: BUNNYCDN_ZONE_API_KEY or BUNNYCDN_ZONE_ID not set"
  fi
  ```
  Drop the `|| true` so a failed purge fails the deploy, and use `::warning::` for the skip so it is
  visible in the run summary rather than buried in log text. Taking finding 1's preferred fix
  restores content-hashed immutable filenames, which makes purge failures far less consequential,
  but the logic bug should be fixed either way.
- **Effort:** S
- **Blast radius:** One workflow step. Will start failing deploys that were previously passing while
  silently skipping the purge, which is the point.

---

### [SEV-5] `bun run lint` is red at HEAD, and the documented `bun run format` would rewrite the normative JSON Schema

- **ID:** `promptsyntax-full-05`
- **Severity:** Medium
- **Category:** Maintainability
- **Confidence:** High
- **Location:** `biome.json:2`, `biome.json:9-43`, `biome.json:58-60`; `package.json:17-18`;
  `AGENTS.md` "Build & run"; `docs/frontend-conventions.md:42-47`
- **What:** `bun run typecheck` passes cleanly. `bun run lint` does not:
  - `biome.json:2` pins `$schema` to `2.4.15` while the resolved CLI is `2.5.5` (the devDependency
    is `^2.4.15`, and `bun.lock:121` resolves `@biomejs/biome@2.5.5`). Biome emits a version-mismatch
    diagnostic.
  - `biome.json:9` uses the `recommended` field, which 2.5.5 reports as deprecated in favour of
    `preset`.
  - Two format errors, both on spec artifacts: `schemas/prompt-trace.schema.json` and
    `examples/prompt-trace.example.json`.

  Total at HEAD: 2 errors, 4 warnings, 2 infos, exit code 1.

  The format errors are the interesting part. `biome.json:58-60` sets
  `files.includes: ["**", "!dist", "!node_modules", ...]`, which pulls `schemas/` and `examples/`
  into the formatter's scope. Both `AGENTS.md` and `docs/frontend-conventions.md:45` list
  `bun run format` as a routine validation command. Running it reflows
  `schemas/prompt-trace.schema.json`, which `README.md:51` calls the "Normative JSON Schema", from
  its deliberate compact one-line-per-property style into expanded form. A contributor following the
  documented workflow silently rewrites a normative artifact.
- **Why it matters:** A red lint gate trains everyone to ignore lint, so a real finding will be
  ignored too. And the format footgun means the repo's own instructions can produce an unrelated
  diff on the spec's most citation-sensitive file.
- **Fix:** Two independent, both mechanical:
  1. `bunx biome migrate` to sync `$schema` and replace `recommended` with `preset`. Consider
     pinning `@biomejs/biome` exactly rather than with `^`, since Biome's config surface moves
     between minors and this drift will recur.
  2. Exclude the spec artifacts from Biome:
     ```json
     "files": { "includes": ["**", "!dist", "!node_modules", "!schemas", "!examples", "!spec", "!*.config.js", "!*.config.ts", "!.claude"] }
     ```
     The schema and example are hand-authored normative documents, not code. If a formatting
     opinion is wanted for them, it should be a separate deliberate reformat, committed once.
- **Effort:** S
- **Blast radius:** `biome.json` only. No source changes.

---

### [SEV-6] An unfilled `[author]` placeholder and a version contradiction are live on the production spec page

- **ID:** `promptsyntax-full-06`
- **Severity:** Medium
- **Category:** Docs
- **Confidence:** High
- **Location:** `spec/SPEC.md:1`, `spec/SPEC.md:4-5`, `src/content/spec.html:1-5`;
  `src/pages/HomePage.tsx:12,194`; `src/components/Footer.tsx:10`
- **What:** Three related content defects, all rendered at `/spec`:
  1. `spec/SPEC.md:4` reads `**Editors:** [author], with drafting assistance`, and that literal
     `[author]` is carried through to `src/content/spec.html:5` and therefore onto the live page.
  2. `src/content/spec.html:1` prepends a banner saying "Draft v0.2.1" directly above an `<h1>` at
     line 2 reading "Prompt Syntax (PS), Specification Draft v0.2". Two different version numbers,
     adjacent, on the same screen. The document body contains numerous `(v0.2.1)` section markers,
     so the H1 and the `Last updated: 2026-07-19` line at `SPEC.md:5` are the stale ones.
  3. The version string `v0.2.1` is hardcoded in five places with no single source:
     `HomePage.tsx:12`, `HomePage.tsx:194`, `Footer.tsx:10`, the `spec.html` banner, and
     `README.md:58`.

  Separately, `spec/SPEC.md:306` places `### 10.5` before `### 10.4` at line 337. Out of order in
  the source markdown, so it renders out of order on the site too.
- **Why it matters:** For a document actively soliciting external review from operators, auditors
  and regulators (per `CONTRIBUTING.md` and the homepage copy), an unfilled `[author]` placeholder
  and a self-contradicting version number are exactly the details that cost credibility on first
  read. The five-way version hardcoding guarantees the next bump will miss one.
- **Fix:** Fill in the editor field or remove the line. Reconcile the H1 to v0.2.1 and update
  `Last updated`. Swap 10.4 and 10.5 into order. Export a single constant:
  ```ts
  // src/config/routes.ts (or a new src/config/spec.ts)
  export const SPEC_VERSION = "0.2.1";
  ```
  and consume it in `HomePage`, `Footer`, and the banner introduced by finding 2's manifest. The
  markdown's own version line stays authoritative and the site reads from it once the pipeline
  exists.
- **Effort:** S
- **Blast radius:** `spec/SPEC.md`, `src/content/spec.html` (or the generator once finding 2 lands),
  `src/pages/HomePage.tsx`, `src/components/Footer.tsx`, `src/config/`.

---

### [SEV-7] The stale-asset DELETE list names files this pipeline never produces, and nothing ever prunes removed files from CDN storage

- **ID:** `promptsyntax-full-07`
- **Severity:** Medium
- **Category:** Deploy / AI-smell
- **Confidence:** High
- **Location:** `.github/workflows/pipeline.yml:42-62`, `:96-100`
- **What:** The "Remove stale assets" step issues eight DELETEs. Cross-referencing against what
  `cleanup.js` actually emits:

  | deleted path | ever produced? |
  |---|---|
  | `index.html`, `404.html` | yes |
  | `static/js/app.mjs` | yes |
  | `static/js/app.js` | **no**, `cleanup.js` only ever writes `app.mjs` |
  | `static/js/app.js.br` | **no**, the `.br` is renamed to `app.mjs`, never kept as `.js.br` |
  | `static/css/app.mcss` | yes |
  | `static/css/app.css` | only on the non-brotli path, which prod never takes |
  | `static/css/app.css.br` | **no**, same reason as `app.js.br` |

  So three of eight are dead, and a fourth is unreachable in production. All are `|| true`, so they
  are invisible no-ops.

  The more consequential gap: the deploy uploads everything under `dist/` (`:96-100`) but never
  removes anything else from storage. If a file is deleted from `public/` or a route's asset is
  renamed, the old object stays live on the CDN indefinitely, still served at its old URL. Nothing
  reconciles storage against `dist/`.
- **Why it matters:** The dead DELETEs are harmless clutter but they misrepresent the pipeline to
  anyone reading it, which is how a future edit gets made against the wrong mental model. The
  unpruned storage is the real issue: a withdrawn spec PDF or a retired page asset remains publicly
  fetchable forever after "deletion", which for a governance-and-evidence project is a poor look.
- **Fix:** Delete the four dead lines. Then either replace the whole step with a storage list-and-
  diff (BunnyCDN Storage exposes `GET /$STORAGE_NAME/` for listing, so: list, compare against
  `find dist -type f`, DELETE the difference), or, much simpler, adopt finding 1's preferred fix so
  filenames are content-hashed and immutable, at which point stale objects are inert rather than
  wrong and a periodic manual sweep suffices.
- **Effort:** S to delete the dead lines, M for real reconciliation.
- **Blast radius:** One workflow step.

---

### [SEV-8] The `innerHTML` sink is safe today, but its lint suppression targets a rule that does not apply, so nothing guards it

- **ID:** `promptsyntax-full-08`
- **Severity:** Low
- **Category:** Security
- **Confidence:** High
- **Location:** `src/pages/DocPage.tsx:74-79`
- **What:** Answering the brief's markdown-security question: there is **no XSS exposure today**, and
  I want to be precise about why rather than leaving it at "first-party content".
  `DocPage` sets `innerHTML={props.html}`, and both call sites pass a `?raw` import
  (`SpecPage.tsx:3`, `SyntaxPage.tsx:3`) that rsbuild inlines as a string literal at compile time.
  There is no route parameter, no query string, no `fetch`, no `localStorage` and no `postMessage`
  feeding it. The value is structurally a build-time constant. I also grepped the content itself:
  `src/content/*.html` contains zero `<script>`, `<iframe>`, `<object>`, `<embed>`, `javascript:`
  URIs, or `on*` event handlers. The only `href`s are same-document `#cb<n>-<n>` anchors from
  pandoc's code-line numbering. No user or external content is rendered anywhere in this app, so
  there is nothing to escalate.

  The defect is the guard, not the sink. Line 77 carries:
  ```
  // biome-ignore lint/security/noDangerouslySetInnerHtml: static, repo-authored spec content
  ```
  Biome reports this at `DocPage.tsx:77:9` as `suppressions/unused`: "Suppression comment has no
  effect." `noDangerouslySetInnerHtml` matches React's `dangerouslySetInnerHTML` prop, not SolidJS's
  `innerHTML=`. Biome has no rule covering the Solid form, so the sink was never flagged and the
  suppression suppresses nothing.
- **Why it matters:** Low today, but the comment creates a false impression that a linter is
  watching this line. If someone later implements finding 3's fetch-based variant, or adds a
  user-supplied anchor, or renders a contributed profile document, the sink becomes dynamic and no
  tool will say a word. Given the spec's own §13 makes provenance-typed parsing a security-critical
  rule, the site rendering its own spec should not be sloppy about its one HTML sink.
- **Fix:** Delete the ineffective comment (it is one of the two lint errors from finding 5 anyway)
  and replace it with a type-level guard so the invariant is enforced rather than asserted:
  ```ts
  // Branded type: only the build-time import path can produce this.
  export type StaticHtml = string & { readonly __staticHtml: unique symbol };
  type DocPageProps = { html: StaticHtml; ... };
  ```
  Then any future dynamic string fails `bun run typecheck`, which is the repo's stated gate per
  `AGENTS.md`. If that feels heavy, at minimum replace the comment with one that states the actual
  invariant ("compile-time `?raw` import only, never a runtime value") so the next reader knows what
  they must not break.
- **Effort:** S
- **Blast radius:** `src/pages/DocPage.tsx`, `src/pages/SpecPage.tsx`, `src/pages/SyntaxPage.tsx`.

---

### [SEV-9] `tailwind-merge` and `class-variance-authority` are declared but never imported; `glob` is a runtime dependency used only at build time

- **ID:** `promptsyntax-full-09`
- **Severity:** Low
- **Category:** Maintainability / Supply chain
- **Confidence:** High
- **Location:** `package.json:22-43`
- **What:** Checking the brief's tailwind-merge claim against the code: **the dependency exists, the
  usage does not.** `package.json:27` declares `tailwind-merge@^3.6.0` and `bun.lock:799` resolves
  it, but `rg "tailwind-merge|twMerge|\bcn\(" src/` returns nothing. There is no `cn()` helper, no
  `lib/utils.ts`, no merge wrapper. `bun.lock` shows it only as a direct dependency of the root
  package, so nothing pulls it transitively either. The repo's actual class-composition pattern is
  plain `clsx` (`SiteNavbar.tsx:3,16-19`, the only conditional-class site in the codebase) and
  template literals (`Logo.tsx:4`). Notably `biome.json:36` configures `useSortedClasses` to
  recognise `clsx`, `cn`, `cva`, `tw`, of which only `clsx` is ever used.

  Same story for `class-variance-authority` (`package.json:37`, devDependency, never imported).
  Conversely `glob` (`package.json:25`) sits in `dependencies` but its only consumer is
  `src/scripts/cleanup.js:3`, a build script, so it belongs in `devDependencies`.

  Because nothing imports them, neither unused package reaches the bundle; tree-shaking handles it.
  This is `package.json` hygiene and install-time cost, not payload.
- **Why it matters:** Small but real. Unused deps are supply-chain surface for zero benefit, they
  mislead readers about the repo's conventions (a contributor reasonably infers a `cn()` pattern
  exists and writes one), and the misplaced `glob` means a production-only install would pull a
  build-only package.
- **Fix:** Remove `tailwind-merge` and `class-variance-authority`; move `glob` to `devDependencies`.
  If a `cn()` helper is actually wanted (there is a reasonable case once `DocPage`'s and
  `HomePage`'s long class strings get extracted per finding 12), add it deliberately in
  `src/lib/cn.ts` and use it, rather than leaving the dependency floating. Also prune `cn`, `cva`
  and `tw` from `biome.json:36` unless they are being adopted.
- **Effort:** S
- **Blast radius:** `package.json`, `bun.lock`, `biome.json`. Requires a lockfile update, which
  interacts with finding 13.

---

### [SEV-10] The `Cache-Control` / `Pragma` / `Expires` meta tags are inert, and no HTTP cache headers are set anywhere

- **ID:** `promptsyntax-full-10`
- **Severity:** Low
- **Category:** AI-smell / Deploy
- **Confidence:** High
- **Location:** `rsbuild.config.ts:28-43`, `.github/workflows/pipeline.yml:64-105`
- **What:** `rsbuild.config.ts:35-37` sets three cache metas as bare strings. Immediately above them,
  lines 30-31 carry a comment explaining precisely why the string form is wrong:

  > Object form emits a real `<meta charset>` declaration; the string form would emit a useless
  > `<meta name="charset">` and mojibake the page.

  The lesson was applied to `charset` and not to the three tags directly below it. Verified against
  the committed build output:
  ```html
  <meta charset="utf-8">
  <meta name="Cache-Control" content="no-cache, no-store, must-revalidate">
  <meta name="Pragma" content="no-cache">
  <meta name="Expires" content="0">
  ```
  `name=` rather than `http-equiv=`, so browsers ignore them entirely. And even corrected to
  `http-equiv`, Chrome and Firefox ignore meta cache directives on HTTP-loaded documents. They are
  inert either way.

  Answering the brief's cache-header question: **no cache headers are set anywhere in this
  repository.** The workflow uploads with `curl -T` and no headers; whatever caching exists is
  BunnyCDN pull-zone defaults configured out of band, same blind spot as finding 1.
- **Why it matters:** Zero runtime impact, which is the point: three lines of config that look like
  cache policy and are not, immediately below a comment proving the author knew the distinction.
  Anyone debugging a stale-page report will read these, believe cache control is handled in-repo,
  and look in the wrong place.
- **Fix:** Delete lines 35-37. Put the real policy where it takes effect: BunnyCDN edge rules, or
  explicit `Cache-Control` headers on the storage PUTs, and record the intended policy in
  `README.md` next to the deploy note. The natural policy once finding 1's hashed filenames are
  restored is `immutable, max-age=31536000` on `/static/*` and `no-cache` on `index.html`. While
  editing that block, consider adding `<link rel="canonical">` and Open Graph / Twitter card tags,
  which are absent and matter for a spec intended to be linked and cited.
- **Effort:** S
- **Blast radius:** `rsbuild.config.ts`, plus CDN configuration.

---

### [SEV-11] 219 pandoc syntax-highlight spans render with no styling, and 260 KB of PDFs are committed twice

- **ID:** `promptsyntax-full-11`
- **Severity:** Low
- **Category:** Performance / Maintainability
- **Confidence:** High
- **Location:** `src/content/spec.html` (throughout), `src/index.css:140-165`; `spec/*.pdf` vs
  `public/*.pdf`
- **What:** Two pieces of dead weight.

  Pandoc was run with syntax highlighting enabled, producing 219 `<span class="kw">` / `"fu"` /
  `"at"` / `"st"` spans plus 31 `<span id="cb<n>-<n>">` line wrappers and 31 empty
  `<a href="#cb<n>-<n>" aria-hidden="true" tabindex="-1"></a>` line anchors in `spec.html`. The
  corresponding highlight stylesheet was never imported: `rg "sourceCode|\.kw\b"` finds nothing in
  `src/index.css` or `src/styles/`, and the built CSS bundle contains zero `sourceCode` occurrences.
  `src/index.css:159-165` styles `.doc-prose pre code` with a single flat colour, so every one of
  those spans is visually inert. Roughly 7.5 KB of the 54 KB file, about 14 percent, is markup with
  no effect. It is also 30 to 40 percent of the review burden when reading a regenerated diff.

  Separately, the four committed PDFs are two byte-identical pairs, confirmed by `md5`:
  `public/SPEC.pdf` equals `spec/SPEC.pdf` (183,939 bytes each) and `public/SYNTAX-REFERENCE.pdf`
  equals `spec/SYNTAX-REFERENCE.pdf` (76,406 bytes each). 260 KB duplicated in git, and every future
  regeneration doubles again since binaries do not delta-compress.

  Answering the brief's bundle question for the PDFs: only the `public/` copies are served. rsbuild
  copies `public/` into `dist/`, which I confirmed (`dist/SPEC.pdf`, `dist/SYNTAX-REFERENCE.pdf`).
  They are **not** in the JS bundle, they are separate static files linked from the doc sidebar
  (`DocPage.tsx:54-60`), so they cost nothing until a user clicks Download. That part is correct as
  built. The `spec/` copies are never served and exist purely as repo duplication.
- **Why it matters:** Modest. ~2 KB brotli of pointless payload and a materially harder-to-review
  generated file, plus git bloat that compounds on every spec revision.
- **Fix:** Re-run pandoc with `--no-highlight` (and drop `--number-sections`-style line anchors if
  they are not wanted), or, better, import a highlight stylesheet and actually use the markup. The
  first is right unless code highlighting in the spec is desired. For the PDFs, keep one copy and
  let the build place it, which is step 4 of finding 2's fix.
- **Effort:** S, and it folds naturally into finding 2's pipeline work.
- **Blast radius:** `src/content/spec.html`, `spec/*.pdf`, whatever generates them.

---

### [SEV-12] `docs/frontend-conventions.md` contradicts itself and describes a codebase structure that does not exist

- **ID:** `promptsyntax-full-12`
- **Severity:** Low
- **Category:** Docs / AI-smell
- **Confidence:** High
- **Location:** `docs/frontend-conventions.md:11-13`, `:30-31`, `:51-62`; `README.md:52`
- **What:** `AGENTS.md` makes this file mandatory reading before opening any implementation file, so
  its accuracy compounds across every future contributor and agent. It is largely a copy from
  another pathscale frontend and does not describe this repo.

  - Line 31 states that this repo has no backend services contract, that "there is no services JSON
    to consult", and to not look for one. Line 62 then states: "Until they exist, this file **plus
    the services JSON** is the reference." Direct self-contradiction, 31 lines apart.
  - Lines 12-13 instruct the reader to "follow the existing hooks, stores, routes, guards and
    feature structure." This repo has no hooks, no guards, no feature directories, and one
    module that could be called a store (`src/lib/theme.ts`, 33 lines). Only "routes" exists.
  - Line 23 tells the reader to classify tasks as "auth · data/hooks · feature page · routing ·
    stores · UI/styling." There is no auth and no data layer in this repo at all.
  - Lines 51-62 list four reference docs, then a `TODO` admitting none of them exist.
  - Line 17 says "this repo has no i18n system today," which is accurate, though worth noting
    `spec/SPEC.md:§13.1` proposes internationalization as a spec concern.

  One related claim I checked and can confirm as **accurate**: `README.md:52` describes
  `examples/prompt-trace.example.json` as a "Machine-validated example trace." I validated it
  against `schemas/prompt-trace.schema.json` with ajv's 2020-12 dialect and it passes. The gap is
  only that nothing in `package.json` or CI re-validates it, so a future schema edit can break the
  example silently. `package.json` has no `test` script at all.
- **Why it matters:** A mandatory-reading document that is wrong sends every contributor and agent
  hunting for hooks, stores and guards that do not exist, which is exactly the context-waste the
  file's own opening paragraph says it exists to prevent.
- **Fix:** Rewrite it to ~20 lines describing what is actually here: SolidJS with `@pathscale/ui`,
  one theme signal in `src/lib/theme.ts`, three routes in `src/config/routes.ts` and `src/App.tsx`,
  `clsx` for conditional classes, no auth, no data layer, no i18n. Delete the four-reference-doc
  section and its TODO. Delete the contradictory sentence at line 62. Separately, add
  `"test": "node scripts/validate-schema.mjs"` wired into CI so the README's validation claim stays
  true; ajv with the 2020-12 dialect is already present transitively and the script is about ten
  lines.
- **Effort:** S
- **Blast radius:** `docs/frontend-conventions.md`, plus one small script and a CI step.

---

### [SEV-13] CI installs without a frozen lockfile and pins nothing in its toolchain

- **ID:** `promptsyntax-full-13`
- **Severity:** Low
- **Category:** Supply chain
- **Confidence:** High
- **Location:** `.github/workflows/pipeline.yml:14-23`
- **What:** This is the brief's confirmed cross-repo pattern 6, and it is **present** here:
  ```yaml
  - uses: actions/checkout@v3
  - uses: oven-sh/setup-bun@v1
    with: { bun-version: latest }
  - run: bun install
  ```
  `bun install` without `--frozen-lockfile`, so CI may resolve dependency versions that differ from
  `bun.lock`. `bun-version: latest` means the toolchain floats. `actions/checkout@v3` is two majors
  behind and runs on a deprecated Node runtime.

  The severity is genuinely lower here than in the sibling repos the pattern was found in, because
  this repository has no test job at all: there is nothing that "passed on tested versions" for
  production to diverge from. The exposure is the plain one, a deploy built against unreviewed
  dependency versions.
- **Why it matters:** A caret range like `"@pathscale/ui": "^1.2.11"` lets a `1.3.0` publish land
  directly in production with nobody having run it. For a site whose main content is static HTML the
  blast radius is small, but the fix is one word.
- **Fix:** `bun install --frozen-lockfile`, bump to `actions/checkout@v4`, and pin
  `bun-version` to the version developers actually run (1.3.14 locally at time of review).
- **Effort:** S
- **Blast radius:** One workflow file. Will start failing if `bun.lock` is ever out of sync with
  `package.json`, which is the desired behaviour and interacts with finding 9's dependency removals.

---

### [SEV-14] Page scaffolding is duplicated inline; `HomePage.tsx` repeats one 180-character class string five times

- **ID:** `promptsyntax-full-14`
- **Severity:** Low
- **Category:** Design
- **Confidence:** High
- **Location:** `src/pages/HomePage.tsx:39-41,97-99,140-142,186-188` and `:146,154,159,164,170`;
  `src/components/LensTabs.tsx:114`; `src/pages/SpecPage.tsx` / `SyntaxPage.tsx`
- **What:** Three repetition shapes in a 214-line file.
  1. The section wrapper appears four times verbatim:
     ```tsx
     <section class="border-base-300 border-b">
       <div class="py-16 content-container">
         <h2 class="mb-2 font-bold text-[clamp(23px,3vw,30px)] tracking-tight">
     ```
     `LensTabs.tsx:95-97` is a fifth instance of the same shape.
  2. The arrow-bullet list item class is repeated five times in `HomePage` at lines 146, 154, 159,
     164 and 170, and a near-identical sixth in `LensTabs.tsx:114` (differing only by
     `text-[15px]` vs `text-[15.5px]` and a trailing `last:border-b-0`). That is 180 characters of
     Tailwind duplicated six times, and the two variants have already drifted, which is the tell.
  3. `SpecPage.tsx` and `SyntaxPage.tsx` are byte-for-byte identical modulo three identifiers, and
     both pass the same literal `pdfLabel="Download PDF"`, making that prop over-parameterized with
     exactly one value across all call sites.
- **Why it matters:** Modest at current size but it is already producing drift (the two bullet
  variants), and the homepage is the file most likely to be edited by a non-frontend contributor
  adjusting copy. Repeated 180-character class attributes make a one-word copy change hard to
  review.
- **Fix:** Three small extractions.
  ```tsx
  // src/components/Section.tsx
  export const Section: ParentComponent<{ title: string; lede?: string; last?: boolean }> = (p) => (
    <section class={p.last ? undefined : "border-base-300 border-b"}>
      <div class="py-16 content-container">
        <h2 class="mb-2 font-bold text-[clamp(23px,3vw,30px)] tracking-tight">{p.title}</h2>
        <Show when={p.lede}><p class="mb-7 text-base-content/60 text-sm">{p.lede}</p></Show>
        {p.children}
      </div>
    </section>
  );
  ```
  Move the bullet class into `src/index.css` as a single `.arrow-item` utility used by both
  `HomePage` and `LensTabs`, resolving the drift in the process. Drop `pdfLabel` from `DocPageProps`
  and hardcode "Download PDF" in `DocPage`, or delete both page components entirely via finding 2's
  manifest, which is the better move since it addresses the cause.
- **Effort:** S
- **Blast radius:** `src/pages/HomePage.tsx`, `src/components/LensTabs.tsx`, `src/index.css`, and the
  two doc pages. Presentational only.

---

<details>
<summary><b>Nits</b> (one line each, no action required individually)</summary>

- `.claude/hooks/ask-before-risky-commands.sh:2` describes this repo as a "pathscale backend service"; it is a static site.
- Same file, last regex branch gates `regenerate_endpoints`, a WorkTable / api.support.cafe concept with no counterpart here.
- `AGENTS.md` and `CLAUDE.md` both instruct keeping `RISKY_WORDS` and `permissions.ask` in sync; they are not. `permissions.ask` has `gh release:*` while the hook matches only `release (create|delete)`, and `docker push` is in the hook but not in `permissions.ask`.
- `src/scripts/cleanup.js:59-62` handles a literal `$GITHUB_RUN_NUMBER` string in `package.json` with a magic `"137"` fallback; `pipeline.yml:28` seds in the real value before build, so this branch is unreachable.
- `src/scripts/cleanup.js:50,52,80` trigger three `noConsole` warnings; a build script legitimately logs, so add a file-level `biome-ignore` or exclude `src/scripts/` from that rule rather than leaving standing warnings.
- `rsbuild.config.ts:56` uses `resourceQuery: /raw/`, an unanchored match, so `?rawdata` or `?draft=raw` would also hit the asset/source loader. `/(^|&)raw($|&|=)/` is tighter.
- `src/env.d.ts:19` declares `*.html?raw` but not `*.md?raw`; adding one will be required by finding 2's pipeline if the loader route is taken.
- `src/pages/DocPage.tsx:31` re-anchors the hash after a hardcoded 300 ms `setTimeout`; a `ResizeObserver` on the article, or waiting on font load, would be deterministic. The comment does honestly explain the reason.
- `src/components/Logo.tsx:4` interpolates `props.class` into a template literal, defeating Solid's fine-grained reactivity on that attribute; use `clsx` as `SiteNavbar` does.
- `src/lib/theme.ts:19-23` runs a module-level side effect setting `data-theme` at import time; it works, but the initial paint can still flash because the attribute is set only after the JS bundle parses. A tiny inline script in `index.html` would remove the flash.
- `src/lib/theme.ts:6,19,27` guards `typeof window === "undefined"` in three places for an app with no SSR path; defensive scaffolding for an impossible state.
- `public/sitemap.xml` is hand-maintained with no `<lastmod>`, and will silently go stale when a route is added; generate it from `ROUTES`.
- `src/App.tsx:25` maps `path="*"` to `HomePage`, so `/typo` renders the homepage at HTTP 200 rather than a 404 page. Combined with `pipeline.yml:36-40` mirroring `index.html` to `bunnycdn_errors/404.html`, every wrong URL is a soft 200. Intentional for an SPA, but a real 404 view would be better for a citable spec site.
- `src/styles/themes/{dark,light}.css:38-43` use raw hex for the six island colours while every other token is `oklch()`; inconsistent within the same file.
- `README.md:53` describes `decisions/` as holding "Design decision records (with rejected alternatives)"; the directory contains only a `README.md` with an 11-row summary table, no individual records. `profiles/` and `paper/` are likewise README-plus-`.gitkeep` stubs, self-labelled `PLACEHOLDER`.
- `README.md:45-55` "Repository layout" omits `src/content/`, the directory that actually feeds the website, which is part of why finding 2 is easy to miss.
- No `<link rel="canonical">`, Open Graph, or Twitter card meta on a site whose purpose is to be linked and cited (see finding 10's fix).
- `.github/workflows/pipeline.yml` uploads files serially, one `curl` per file; fine at 6 files, worth `xargs -P` if `public/` ever grows.

</details>

## Cross-cutting recommendations

**1. Make the deploy artifact honest, so preview equals production.**
Take finding 1's preferred path: delete `CompressionPlugin` and steps 1 and 2 of `cleanup.js`, turn
on BunnyCDN's own Brotli, and let content-hashed filenames survive to production. This single move
fixes the local/deployed divergence (finding 1), removes the need for the stale-asset DELETE list
(finding 7), makes the purge bug non-critical (finding 4), and restores safe `immutable` caching
(finding 10). *Plan:* change the two config files, deploy once to a staging pull zone, confirm
`curl -sI https://.../static/js/index.<hash>.js` returns `Content-Encoding: br` from the edge, then
promote. *What breaks:* asset URLs change shape on the first deploy, so the edge should be purged
manually once. Also verify the pull zone does not have an edge rule that only matches `.mjs`/`.mcss`
and would now match nothing.

**2. Give the spec a real pipeline so `spec/*.md` is the only source.**
Finding 2 in full: build-time markdown conversion, delete `src/content/` from version control,
collapse the two page components into a `DOCS` manifest plus one dynamic route, and generate the
navbar, footer and sitemap from it. This is the change that makes editing spec content a single-file
edit with no code changes, which is what the brief asked for and what the repo's premise demands.
*Plan:* pipeline first (removes the drift risk immediately), manifest second. *What breaks:* CI needs
pandoc installed if the pandoc route is chosen; a JS markdown library avoids that but will produce
slightly different table and footnote HTML, so `src/index.css`'s `.doc-prose` rules need a visual
pass. Decide pandoc vs JS before starting, since it is hard to reverse.

**3. Get the initial payload down and stop actively blocking code splitting.**
Finding 3. Removing `splitChunks: false`, the `rm -rf async` in `cleanup.js`, and the upload
exclusion is the prerequisite; route-splitting the doc pages is then two lines. Roughly 18 KB brotli
comes off first paint. Do this after recommendation 1, since both edit the same two files, and note
that the anti-splitting scaffolding is currently a trap that turns a reasonable future change into a
broken production deploy.

**4. Make the validation commands green and safe to run.**
`bun run lint` is red at HEAD and `bun run format` rewrites a normative schema (finding 5). Run
`bunx biome migrate`, exclude `schemas/`, `examples/` and `spec/` from Biome, pin the Biome version
exactly, and add the ten-line ajv script that keeps `README.md:52`'s "machine-validated" claim true.
Small, entirely mechanical, and it restores the signal value of the repo's own gates.

**5. Do one honesty pass over the human-authored documentation.**
`docs/frontend-conventions.md` is mandatory reading per `AGENTS.md` and is substantially wrong about
this codebase (finding 12); `.claude/hooks/ask-before-risky-commands.sh` claims to guard a backend
service; `README.md`'s layout table omits the directory that feeds the site; `[author]` and a
version contradiction are live in production (finding 6). None are hard, all of them cost every
subsequent reader.

## What I did not cover

- **The specification's technical content.** I read `spec/SPEC.md` and `spec/SYNTAX-REFERENCE.md`
  structurally, for heading parity, version markers and placeholders. I did not evaluate the
  language design, the security argument in §13, the trace model, or whether the schema faithfully
  encodes the spec's normative requirements. `CONTRIBUTING.md` says spec-level security findings are
  the highest-value contribution; that needs a domain reviewer, not a code reviewer.
- **PDF page content.** I compared the four PDFs by hash only and did not open them, so I cannot say
  whether their text matches the current markdown. Given finding 2's drift channel 2, that is worth
  someone's time.
- **BunnyCDN configuration.** I have no dashboard access. Findings 1, 7 and 10 all reason about
  behaviour that is configured outside this repository, and I have flagged the inference explicitly
  in each. Someone with console access should confirm the `Content-Encoding` edge rule exists before
  acting on finding 1.
- **Runtime and visual verification.** I did not start the dev server or open a browser, so I have
  not confirmed how the pandoc HTML actually renders, whether tables overflow on mobile, or whether
  the `@pathscale/ui` `Tabs` in `LensTabs` behave correctly. The 300 ms re-anchor hack at
  `DocPage.tsx:31` implies past layout trouble that I could not reproduce.
- **`@pathscale/ui` internals.** I checked which components are consumed (`Button`, `Navbar`,
  `Footer`, `Link`, `Icon`, `Tabs`) and confirmed the barrel import at `HomePage.tsx:1` etc., but did
  not audit the library or measure how much of it tree-shakes into the 160 KB bundle. Given the
  library is `^1.2.11` and unpinned, someone should check whether that barrel import is pulling more
  than the six components used.
- **Accessibility.** Beyond noting `aria-label` on `Tabs.List` and `ThemeToggle`, I did no a11y
  review: no contrast checks on the oklch tokens, no keyboard-navigation testing of the TOC or tabs.

## Quick-start for the follow-up agent

**Read in this order:**
1. `src/scripts/cleanup.js` (80 lines) plus `.github/workflows/pipeline.yml`. The whole deploy story,
   including the local/prod divergence, lives in these two files.
2. `src/pages/SpecPage.tsx` then `src/pages/DocPage.tsx` (10 and 84 lines). The entire spec-to-site
   coupling, and the one `innerHTML` sink.
3. `rsbuild.config.ts`. The `?raw` loader rule, the disabled code splitting, the compression plugin,
   and the inert cache metas are all here in 91 lines.
4. `docs/frontend-conventions.md`. Not because it is accurate, but because `AGENTS.md` makes it
   mandatory reading and you should know up front that it is not.
5. `src/pages/HomePage.tsx` (214 lines, the largest source file). All marketing copy and all the
   class-string repetition.

**Commands:**
```bash
bun install
bun run typecheck          # clean at b44ab8b
bun run lint               # RED at b44ab8b: 2 errors, 4 warnings (see finding 5)
bun run build              # typecheck + rsbuild build + cleanup
bun run dev                # :3000, works correctly
bun run preview            # serves dist/ and shows a BLANK PAGE, see finding 1
```

To reproduce finding 1 without touching the repo's `dist/`:
```bash
mkdir -p /tmp/fr && cp -R dist /tmp/fr/dist && cp package.json /tmp/fr/
mkdir -p /tmp/fr/src/scripts && cp src/scripts/cleanup.js /tmp/fr/src/scripts/
cd /tmp/fr && bun run src/scripts/cleanup.js && file dist/static/js/app.mjs
# => "data", not JavaScript
```

To re-validate the example trace (needs the repo's transitive ajv, and the 2020-12 entrypoint
specifically, since the default export is draft-07):
```js
const Ajv = require("ajv/dist/2020");   // NOT require("ajv")
```

**Surprises about the layout:**
- `spec/` looks like the source of the website. It is not. Nothing reads it. `src/content/*.html` is
  what ships, and the two are kept in sync only by hand.
- `src/ThemeToggle.tsx` sits at the `src/` root while every other component is in
  `src/components/`. Probably an oversight, harmless.
- `dist/` is committed to the working tree but gitignored, and the checked-in copy is a partial build
  (hashed filenames still present, so `cleanup` had not run). Do not read it as representative of
  what deploys.
- There is no test suite and no `test` script. `bun run typecheck` is the only real gate, per
  `AGENTS.md`.
- The four PDFs are two byte-identical pairs. Do not assume `spec/*.pdf` and `public/*.pdf` are
  different documents.

**Cross-repo pattern check (per the shared brief), all explicitly verified:**

| # | Pattern | Status here |
|---|---|---|
| 1 | `encodePassword` in `src/utils/encoders.ts` | **Absent.** No `src/utils/` at all, no auth, no password handling anywhere. |
| 2 | Role from localStorage used by a route guard | **Absent.** `localStorage` is used in exactly one place, `src/lib/theme.ts:8,29`, for the theme string. No guards, no auth, no roles. |
| 3 | Secrets or credentials reaching logs / third-party sinks | **Absent.** The only `console.*` calls are three build-script lines in `src/scripts/cleanup.js`. No HyperDX, Sentry, Datadog or any telemetry. |
| 4 | Encryption key stored beside ciphertext | **Absent.** No `@pathscale/secure-local-storage-aes-siv`, no crypto of any kind. |
| 5 | Anonymous-reachable endpoints leaking operator fields | **Not applicable.** Static site, no backend, no network calls at runtime. |
| 6 | CI installing without a frozen lockfile | **Present**, see finding 13. `pipeline.yml:23` runs bare `bun install`. Lower impact than in sibling repos because there is no test job to diverge from. |

**On the sibling repo's hardcoded deploy token:** I scanned specifically for it and found nothing.
`.github/workflows/pipeline.yml` uses `${{ secrets.BUNNYCDN_STORAGE_API_KEY }}`,
`${{ secrets.BUNNYCDN_STORAGE_NAME }}`, `${{ secrets.BUNNYCDN_ZONE_API_KEY }}` and
`${{ secrets.BUNNYCDN_ZONE_ID }}` throughout, with no literal values. I also swept the full history
(`git log --all -p` piped through patterns for `AccessKey:` with a literal, `api_key`/`secret`/`token`
assignments, `ghp_`, `github_pat_`, `AKIA`, and PEM headers) across all 12 commits: zero matches. The
workflow has only ever existed in two commits, both using `secrets.*`. No `.env` file has ever been
added to the tree. **This repo is clean on secrets.**
