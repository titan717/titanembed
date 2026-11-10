import { expect, test, type Page } from "@playwright/test";
import { embedUrl, waitPlaying } from "./helpers";

/** Responsive gates from the mission brief (section 9), plus the test matrix viewports. */
const GATES = [
  { w: 360, h: 640, touch: true },
  { w: 390, h: 844, touch: true },
  { w: 430, h: 932, touch: true },
  { w: 932, h: 430, touch: true },
  { w: 844, h: 390, touch: true },
  { w: 768, h: 1024, touch: true },
  { w: 820, h: 1180, touch: true },
  { w: 1180, h: 820, touch: true },
  { w: 1280, h: 720, touch: false },
  { w: 1440, h: 900, touch: false },
  { w: 1920, h: 1080, touch: false },
  { w: 3840, h: 2160, touch: false }
];

/** Visible interactive controls must sit inside the frame and never overlap each other. */
async function layoutProblems(page: Page) {
  return page.evaluate(() => {
    const W = innerWidth;
    const H = innerHeight;
    const els = [...document.querySelectorAll<HTMLElement>(".titan button, .titan [role=slider]")].filter((e) => {
      const r = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      return (
        r.width > 0 &&
        r.height > 0 &&
        cs.visibility !== "hidden" &&
        Number(cs.opacity) > 0.01 &&
        !e.closest("[aria-hidden=true], [hidden], .m-sheet:not(.is-on), .tv-panel:not(.is-on)")
      );
    });
    const name = (e: HTMLElement) => e.getAttribute("aria-label") || e.textContent?.trim() || e.className;
    const out: string[] = [];
    const rects = els.map((e) => e.getBoundingClientRect());
    rects.forEach((r, i) => {
      if (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1) out.push(`outside: ${name(els[i]!)}`);
    });
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i]!;
        const b = rects[j]!;
        if (els[i]!.contains(els[j]!) || els[j]!.contains(els[i]!)) continue;
        const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (ox > 2 && oy > 2) out.push(`overlap: ${name(els[i]!)} × ${name(els[j]!)}`);
      }
    if (document.documentElement.scrollWidth > W + 1) out.push(`horizontal scroll ${document.documentElement.scrollWidth} > ${W}`);
    return out;
  });
}

for (const g of GATES) {
  test(`embed controls fit at ${g.w}x${g.h}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: g.w, height: g.h }, hasTouch: g.touch, isMobile: g.touch });
    const page = await ctx.newPage();
    await page.goto(embedUrl({ t: "20" }));
    await waitPlaying(page);
    // show the controls the way a viewer would
    if (!/is-controls/.test((await page.locator(".titan").getAttribute("class")) ?? "")) {
      if (g.touch) await page.touchscreen.tap(g.w / 2, g.h * 0.3);
      else await page.keyboard.press("ArrowUp");
    }
    await expect(page.locator(".titan")).toHaveClass(/is-controls/);
    await page.waitForTimeout(300);
    expect(await layoutProblems(page)).toEqual([]);
    await page.screenshot({ path: test.info().outputPath(`embed-${g.w}x${g.h}.png`) });
    await ctx.close();
  });

  test(`demo page has no horizontal scroll at ${g.w}x${g.h}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: g.w, height: g.h }, hasTouch: g.touch, isMobile: g.touch });
    const page = await ctx.newPage();
    await page.goto("/");
    await page.waitForTimeout(800);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(sw).toBeLessThanOrEqual(g.w + 1);
    await ctx.close();
  });
}
