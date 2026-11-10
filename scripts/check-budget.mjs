// Fails the build when a shipped bundle grows past its gzip budget (see docs/PERF.md).
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const dist = "dist";
const kb = (n) => (n / 1024).toFixed(1) + " kB";
const gz = (f) => gzipSync(readFileSync(f), { level: 9 }).length;

/** Each rule: label, match on file name inside dist/assets or explicit path, gzip budget in bytes. */
const rules = [
  { label: "embed entry JS", test: /^embed-.*\.js$/, max: 30 * 1024 },
  { label: "embed entry CSS", test: /^embed-.*\.css$/, max: 6 * 1024 },
  { label: "player chunk JS (each, TV or mobile)", test: /^src-.*\.js$/, max: 12 * 1024, each: true },
  { label: "player chunk CSS (each)", test: /^src-.*\.css$/, max: 8 * 1024, each: true },
  { label: "hls.js lazy chunk", test: /^hls-.*\.js$/, max: 190 * 1024 },
  { label: "shared chunks JS (base + icons)", test: /^(base|icons)-.*\.js$/, max: 14 * 1024 },
  { label: "SDK ESM", path: "packages/sdk/dist/index.js", max: 4 * 1024 },
  { label: "SDK IIFE", path: "dist/sdk/titan-embed.min.js", max: 4 * 1024 }
];

const assets = readdirSync(join(dist, "assets"));
let failed = false;
const rows = [];
for (const r of rules) {
  const files = r.path ? (existsSync(r.path) ? [r.path] : []) : assets.filter((f) => r.test.test(f)).map((f) => join(dist, "assets", f));
  if (!files.length) {
    rows.push([r.label, "missing", kb(r.max), "FAIL"]);
    failed = true;
    continue;
  }
  const sizes = files.map(gz);
  const checked = r.each ? sizes : [sizes.reduce((a, b) => a + b, 0)];
  for (const s of checked) {
    const ok = s <= r.max;
    if (!ok) failed = true;
    rows.push([r.label, kb(s), kb(r.max), ok ? "ok" : "FAIL"]);
  }
}
const w = [0, 1, 2, 3].map((i) => Math.max(...rows.map((r) => r[i].length), 8));
for (const r of rows) console.log(r.map((c, i) => c.padEnd(w[i])).join("  "));
if (failed) {
  console.error("\nPerformance budget exceeded. See docs/PERF.md.");
  process.exit(1);
}
console.log("\nAll bundles are within budget.");
