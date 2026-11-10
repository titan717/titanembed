// Renders apps/docs/*.md into site/docs/*.html (Vite then bundles them). Docs content is our own, but marked
// output is still built from escaped text: raw HTML in markdown is not allowed.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { marked } from "marked";

const SRC = "apps/docs";
const OUT = "site/docs";
const ORDER = ["index", "players", "api", "sdk", "theming", "security", "self-hosting", "assets"];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slug = (s) => s.toLowerCase().replace(/<[^>]+>/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

marked.use({
  renderer: {
    html: ({ text }) => esc(text),
    heading({ tokens, depth }) {
      const inner = this.parser.parseInline(tokens);
      return `<h${depth} id="${slug(inner)}">${inner}</h${depth}>\n`;
    }
  }
});

const pages = readdirSync(SRC)
  .filter((f) => f.endsWith(".md"))
  .map((f) => {
    const raw = readFileSync(`${SRC}/${f}`, "utf8");
    const m = /^---\ntitle: (.+)\n---\n/.exec(raw);
    return { name: f.replace(/\.md$/, ""), title: m ? m[1] : f, body: m ? raw.slice(m[0].length) : raw };
  })
  .sort((a, b) => ORDER.indexOf(a.name) - ORDER.indexOf(b.name));

for (const p of pages) {
  const nav = pages
    .map((q) => `<a href="${q.name}.html"${q.name === p.name ? ' aria-current="page"' : ""}>${esc(q.title)}</a>`)
    .join("");
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark" />
    <title>${esc(p.title)} — Titan Embed docs</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="./docs.css" />
  </head>
  <body>
    <a class="skip" href="#content">Skip to content</a>
    <header class="bar"><a class="brand" href="/">Titan Embed</a><span class="sep">/</span><a href="index.html">Docs</a></header>
    <div class="layout">
      <nav class="side" aria-label="Documentation">${nav}<a href="https://github.com/titan717/titanembed">GitHub</a></nav>
      <main id="content" class="prose">
${String(marked.parse(p.body)).replaceAll("<pre>", "<pre tabindex=\"0\">")}
      </main>
    </div>
  </body>
</html>
`;
  writeFileSync(`${OUT}/${p.name}.html`, html);
}
writeFileSync(`${OUT}/docs.css`, readFileSync("scripts/docs.css", "utf8"));
console.log(`docs: ${pages.length} pages`);
