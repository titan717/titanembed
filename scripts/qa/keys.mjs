// Usage: node scripts/qa/keys.mjs <path> <w> <h> <waitMs> key1,key2,...  — prints focus/state after each key
import { chromium } from "@playwright/test";
const [, , url, w, h, wait, keys] = process.argv;
const b = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
await p.goto("http://localhost:4173" + url);
await p.waitForTimeout(+wait);
const snap = () => p.evaluate(() => { const v = document.querySelector("video"); const a = document.activeElement; return JSON.stringify({ t: v.currentTime.toFixed(2), paused: v.paused, focus: a ? a.tagName + "." + a.className + " " + (a.textContent || "").slice(0, 30) : null, cls: document.querySelector(".titan")?.className }); });
console.log("start", await snap());
for (const k of (keys || "").split(",").filter(Boolean)) { await p.keyboard.press(k); await p.waitForTimeout(400); console.log(k, await snap()); }
await b.close();
