import { chromium } from "@playwright/test";
const b = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
p.on("console", (m) => console.log("console:", m.text()));
await p.goto("http://localhost:4173" + process.argv[2]);
for (let i = 0; i < 6; i++) {
  await p.waitForTimeout(1500);
  console.log(await p.evaluate(() => { const v = document.querySelector("video"); return JSON.stringify({ t: v.currentTime, paused: v.paused, rs: v.readyState, err: v.error?.code, muted: v.muted, cls: document.querySelector(".titan").className }); }));
}
await b.close();
