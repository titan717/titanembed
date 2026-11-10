import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { readdirSync, existsSync } from "node:fs";
import { alias } from "./vite.shared";
import pkg from "./packages/sdk/package.json" with { type: "json" };

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const docsDir = r("./site/docs");
const docPages = existsSync(docsDir)
  ? Object.fromEntries(readdirSync(docsDir).filter((f) => f.endsWith(".html")).map((f) => [`docs-${f.replace(/\.html$/, "")}`, `${docsDir}/${f}`]))
  : {};

/** Site build: live demo (/), embed page (/embed/), docs (/docs/). The SDK has its own config. */
export default defineConfig({
  root: r("./site"),
  publicDir: r("./public"),
  resolve: { alias },
  define: { __TITAN_VERSION__: JSON.stringify(pkg.version) },
  build: {
    outDir: r("./dist"),
    emptyOutDir: true,
    target: ["es2019", "chrome80", "safari13"],
    cssTarget: ["chrome80", "safari13"],
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
    reportCompressedSize: false,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      input: { demo: r("./site/index.html"), embed: r("./site/embed/index.html"), ...docPages }
    }
  },
  server: { port: 5173, fs: { allow: [r(".")] } },
  preview: { port: 4173 }
});
