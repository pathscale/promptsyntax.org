import { defineConfig } from "@rsbuild/core";
import { pluginBabel } from "@rsbuild/plugin-babel";
import CompressionPlugin from "compression-webpack-plugin";
import ForkTsCheckerWebpackPlugin from "fork-ts-checker-webpack-plugin";
import { pluginSolid2LayoutsApplication } from "rsbuild-plugin-solid-layouts";

const isProd = process.env.NODE_ENV === "production";

export default defineConfig({
  plugins: [
    // `@rsbuild/plugin-solid` is deliberately not used: it pins
    // `babel-preset-solid@^1.9.12`, the Solid 1 compiler, which emits helpers
    // (`use`) and a runtime specifier (`solid-js/web`) that Solid 2 dropped.
    // Driving the Solid 2 preset through Babel directly compiles JSX against
    // the runtime that actually exists.
    pluginBabel({
      include: /\.(?:jsx|tsx|ts)$/,
      babelLoaderOptions: (config) => {
        config.presets ??= [];
        config.presets.push(["babel-preset-solid", {}]);
      },
    }),
    // Compiles `@pathscale/ui`'s layout recipes and resolves `solid-layouts`
    // to its Solid 2 backend, which lives behind a `/solid-2` subpath while
    // the default entry stays on Solid 1.
    pluginSolid2LayoutsApplication({
      layouts: ["@pathscale/ui"],
    }),
  ],
  resolve: {
    alias: {
      "~": "./src",
      // Belt and braces alongside the plugin above: `solid-layouts`'s default
      // entry is the Solid 1 build, whose renderer imports `solid-js/web`.
      // Pin every specifier to the Solid 2 backend so nothing reaches it.
      "solid-layouts/recipe": "solid-layouts/solid-2/recipe",
      "solid-layouts/cx": "solid-layouts/solid-2/cx",
      "solid-layouts/application-boundary": "solid-layouts/solid-2/application-boundary",
      "solid-layouts$": "solid-layouts/solid-2",
    },
  },
  source: {
    define: {
      "import.meta.env.VERSION": JSON.stringify(
        process.env.GITHUB_RUN_NUMBER || "0.0.1",
      ),
    },
  },
  html: {
    meta: {
      // Object form emits a real `<meta charset>` declaration; the string form
      // would emit a useless `<meta name="charset">` and mojibake the page.
      charset: { charset: "utf-8" },
      viewport: "width=device-width, initial-scale=1",
      "theme-color": "#0d1117",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
      description:
        "PromptSyntax (PS) is a vendor-neutral specification for controlling and verifying what an AI system does with your prompt: which model runs, what context is sent, what was silently changed.",
    },
    title: "PromptSyntax: every prompt deserves a receipt",
    mountId: "root",
  },
  dev: {
    hmr: true,
    liveReload: true,
  },
  server: {
    port: 3000,
  },
  tools: {
    // rsbuild's own SWC pass also transforms JSX, and it defaults to Solid 1's
    // `solid-js/web`. Babel has already produced the Solid 2 output by then, so
    // point SWC at the same runtime rather than letting it re-emit the old one.
    swc: {
      jsc: {
        transform: {
          react: {
            runtime: "automatic",
            importSource: "@solidjs/web",
          },
        },
      },
    },
    rspack: {
      // `solid-layouts` supports both Solid majors from one file by feature
      // detecting on a namespace import (`"omit" in solid ? solid.omit :
      // solid.splitProps`). Only one branch can resolve on a given major, and
      // the dead one is never evaluated, but the bundler still checks both and
      // hard-errors on the missing export. Downgrade that to a warning.
      ignoreWarnings: [/export '(splitProps|omit)' .* was not found in 'solid-js'/],
      module: {
        parser: {
          javascript: {
            exportsPresence: "warn",
          },
        },
        rules: [
          {
            resourceQuery: /raw/,
            type: "asset/source",
          },
        ],
      },
      optimization: {
        splitChunks: false,
        runtimeChunk: false,
      },
      plugins: [
        new ForkTsCheckerWebpackPlugin({
          typescript: {
            configFile: "./tsconfig.json",
          },
        }),
        ...(isProd
          ? [
              new CompressionPlugin({
                algorithm: "brotliCompress",
                filename: "[path][base].br",
                test: /\.(js|mjs|css)$/,
                exclude: /\/async\//,
                compressionOptions: { level: 11 },
                threshold: 0,
                minRatio: 1,
              }),
            ]
          : []),
      ],
    },
  },
  output: {
    inlineStyles: false,
    legalComments: "none",
  },
});
