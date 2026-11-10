// Tiny static server for cross-origin test pages (port 4174): the host page used by the postMessage tests and
// the mock provider used by the source and isolation tests.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
const pages = {
  "/host.html": readFileSync(new URL("./host.html", import.meta.url)),
  "/mock-provider.html": readFileSync(new URL("./mock-provider.html", import.meta.url))
};
createServer((req, res) => {
  const path = (req.url ?? "/").split("?")[0];
  const page = pages[path];
  if (page) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    res.end(page);
  } else {
    res.writeHead(404).end("not found");
  }
}).listen(4174, "0.0.0.0");
