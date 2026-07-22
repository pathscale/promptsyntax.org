import { defineConfig } from "@rsbuild/core";
import { pluginBabel } from "@rsbuild/plugin-babel";
import { pluginSolid } from "@rsbuild/plugin-solid";
import CompressionPlugin from "compression-webpack-plugin";
import ForkTsCheckerWebpackPlugin from "fork-ts-checker-webpack-plugin";

const isProd = process.env.NODE_ENV === "production";

export default defineConfig({
  plugins: [
    pluginBabel({
      include: /\.(?:jsx|tsx|ts)$/,
    }),
    pluginSolid(),
  ],
  resolve: {
    alias: {
      "~": "./src",
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
    rspack: {
      module: {
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
