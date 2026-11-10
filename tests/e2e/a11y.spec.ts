import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { embedUrl, waitPlaying } from "./helpers";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function audit(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  expect(summary, summary.join("\n")).toEqual([]);
}

test.describe("accessibility (axe, WCAG 2.2 AA)", () => {
  test("TV player with controls and the Audio & Subtitles panel", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(embedUrl({ player: "tv", t: "20" }));
    await waitPlaying(page);
    await page.keyboard.press("ArrowUp");
    await audit(page);
    await page.getByRole("button", { name: "Audio & Subtitles" }).click();
    await expect(page.getByRole("dialog", { name: "Audio & Subtitles" })).toBeVisible();
    await audit(page);
  });

  test("mobile player with controls and a sheet", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await page.goto(embedUrl({ t: "20" }));
    await waitPlaying(page);
    if (!/is-controls/.test((await page.locator(".titan").getAttribute("class")) ?? "")) await page.touchscreen.tap(195, 300);
    await audit(page);
    // the audit can outlast the auto-hide timer; bring the controls back before tapping
    if (!/is-controls/.test((await page.locator(".titan").getAttribute("class")) ?? "")) await page.touchscreen.tap(195, 300);
    await page.getByRole("button", { name: "Settings" }).tap();
    await expect(page.getByRole("dialog")).toBeVisible();
    await audit(page);
    await ctx.close();
  });

  test("demo page", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(1500);
    await audit(page);
  });

  test("docs pages", async ({ page }) => {
    for (const p of ["/docs/", "/docs/api.html", "/docs/players.html"]) {
      await page.goto(p);
      await audit(page);
    }
  });
});
