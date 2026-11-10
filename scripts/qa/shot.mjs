import { chromium } from "@playwright/test";
const [,, url, w, h, out, extra] = process.argv;
const b = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const ctx = await b.newContext({ viewport: { width: +w, height: +h }, hasTouch: extra === "touch", isMobile: extra === "touch" });
const p = await ctx.newPage();
const logs = [];
p.on("console", (m) => logs.push(`${m.type()}: ${m.text()}`));
p.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));
await p.goto(url);
await p.waitForTimeout(+(process.env.WAIT ?? 3000));
if (process.env.KEYS) for (const k of process.env.KEYS.split(",")) { await p.keyboard.press(k); await p.waitForTimeout(400); }
await p.screenshot({ path: out });
console.log(logs.join("\n"));
await b.close();
