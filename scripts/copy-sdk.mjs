// Publishes the script-tag SDK on the site at /sdk/ with its SRI hash (dist/sdk/sri.json).
import { createHash } from "node:crypto";
import { mkdirSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";

const file = "packages/sdk/dist/titan-embed.min.js";
const pkg = JSON.parse(readFileSync("packages/sdk/package.json", "utf8"));
mkdirSync("dist/sdk", { recursive: true });
copyFileSync(file, "dist/sdk/titan-embed.min.js");
copyFileSync(file, `dist/sdk/titan-embed-${pkg.version}.min.js`);
const sri = "sha384-" + createHash("sha384").update(readFileSync(file)).digest("base64");
writeFileSync("dist/sdk/sri.json", JSON.stringify({ version: pkg.version, file: `titan-embed-${pkg.version}.min.js`, integrity: sri }, null, 2) + "\n");
console.log(`sdk ${pkg.version} ${sri}`);
