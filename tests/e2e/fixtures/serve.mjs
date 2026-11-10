// Tiny static server for the cross-origin host page used by the postMessage tests (port 4174).
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
const page = readFileSync(new URL("./host.html", import.meta.url));
createServer((req, res) => {
  if (req.url?.startsWith("/host.html")) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(page);
  } else {
    res.writeHead(404).end("not found");
  }
}).listen(4174, "0.0.0.0");
