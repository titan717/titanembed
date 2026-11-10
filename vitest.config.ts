import { defineConfig } from "vitest/config";
import { alias } from "./vite.shared";
export default defineConfig({
  resolve: { alias },
  define: { __TITAN_VERSION__: JSON.stringify("test") },
  test: { environment: "happy-dom", include: ["tests/unit/**/*.test.ts"] }
});
