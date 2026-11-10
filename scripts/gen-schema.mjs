// Writes public/schema/titan-embed-v1.json from the protocol definition (packages/core/src/protocol.ts).
// `--check` fails when the committed file is out of date (CI).
import { createServer } from "vite";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const server = await createServer({ configFile: false, logLevel: "error", server: { middlewareMode: true }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
try {
  const { protocolSchema } = await server.ssrLoadModule("/packages/core/src/protocol.ts");
  const json = JSON.stringify(protocolSchema(), null, 2) + "\n";
  const out = "public/schema/titan-embed-v1.json";
  if (process.argv.includes("--check")) {
    if (!existsSync(out) || readFileSync(out, "utf8") !== json) {
      console.error(`${out} is out of date: run npm run schema`);
      process.exitCode = 1;
    } else console.log("schema up to date");
  } else {
    mkdirSync("public/schema", { recursive: true });
    writeFileSync(out, json);
    console.log(`wrote ${out}`);
  }
} finally {
  await server.close();
}
