import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { alias } from "./vite.shared";
import pkg from "./packages/sdk/package.json" with { type: "json" };

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/** SDK library build. `--mode iife` produces the script-tag build (window.TitanEmbed). */
export default defineConfig(({ mode }) => ({
  resolve: { alias },
  define: { __TITAN_VERSION__: JSON.stringify(pkg.version) },
  publicDir: false,
  build: {
    outDir: r("./packages/sdk/dist"),
    emptyOutDir: mode !== "iife",
    target: "es2019",
    minify: mode === "iife",
    sourcemap: true,
    lib:
      mode === "iife"
        ? { entry: r("./packages/sdk/src/index.ts"), name: "TitanEmbed", formats: ["iife"], fileName: () => "titan-embed.min.js" }
        : { entry: { index: r("./packages/sdk/src/index.ts"), react: r("./packages/sdk/src/react.ts") }, formats: ["es"] },
    rollupOptions: { external: ["react"] }
  }
}));
