import { chromium } from "@playwright/test";
const [,, url, w, h, sel] = process.argv;
const b = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
await p.goto(url);
await p.waitForTimeout(+(process.env.WAIT ?? 3000));
console.log(await p.evaluate((s) => [...document.querySelectorAll(s)].map((e) => e.outerHTML.slice(0, 600)).join("\n---\n"), sel));
await b.close();
