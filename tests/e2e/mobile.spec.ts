import { expect, test, type Page } from "@playwright/test";
import { embedUrl, waitPlaying, videoTime } from "./helpers";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const tap = (page: Page, x: number, y: number) => page.touchscreen.tap(x, y);

test.describe("Player B (mobile)", () => {
  test("auto-selects the mobile player on a phone and plays", async ({ page }) => {
    await page.goto(embedUrl());
    await expect(page.locator(".titan.is-mobile")).toBeVisible();
    await waitPlaying(page);
  });

  test("single tap toggles the controls", async ({ page }) => {
    await page.goto(embedUrl({ t: "20" }));
    await waitPlaying(page);
    const root = page.locator(".titan");
    const vp = page.viewportSize()!;
    const was = /is-controls/.test((await root.getAttribute("class")) ?? "");
    // tap between the play button and the top bar so the tap lands on the video, not a control
    await tap(page, vp.width / 2, vp.height * 0.35);
    await expect(root).toHaveClass(was ? /^(?!.*is-controls).*$/ : /is-controls/);
    await page.waitForTimeout(400);
    await tap(page, vp.width / 2, vp.height * 0.35);
    await expect(root).toHaveClass(was ? /is-controls/ : /^(?!.*is-controls).*$/);
  });

  test("double tap on the right seeks forward 10 s, on the left back", async ({ page }) => {
    await page.goto(embedUrl({ t: "20" }));
    await waitPlaying(page);
    const vp = page.viewportSize()!;
    const t0 = await videoTime(page);
    await tap(page, vp.width * 0.85, vp.height / 2);
    await tap(page, vp.width * 0.85, vp.height / 2);
    await expect.poll(() => videoTime(page)).toBeGreaterThan(t0 + 8);
    const t1 = await videoTime(page);
    await page.waitForTimeout(900);
    await tap(page, vp.width * 0.15, vp.height / 2);
    await tap(page, vp.width * 0.15, vp.height / 2);
    await expect.poll(() => videoTime(page)).toBeLessThan(t1 - 5);
  });

  test("Audio & Subtitles opens as a bottom sheet and closes", async ({ page }) => {
    await page.goto(embedUrl({ t: "20" }));
    await waitPlaying(page);
    const vp = page.viewportSize()!;
    if (!/is-controls/.test((await page.locator(".titan").getAttribute("class")) ?? "")) await tap(page, vp.width / 2, vp.height * 0.35);
    await page.getByRole("button", { name: "Audio & Subtitles" }).tap();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText("Español").first()).toBeVisible();
    await sheet.getByRole("button", { name: "Close" }).tap();
    await expect(sheet).toBeHidden();
  });

  test("dragging a sheet's title bar down dismisses it", async ({ page }) => {
    await page.goto(embedUrl({ t: "20" }));
    await waitPlaying(page);
    const vp = page.viewportSize()!;
    if (!/is-controls/.test((await page.locator(".titan").getAttribute("class")) ?? "")) await tap(page, vp.width / 2, vp.height * 0.35);
    await page.getByRole("button", { name: "Settings" }).tap();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    await page.waitForTimeout(300);
    const box = (await sheet.locator(".m-sheet-title").boundingBox())!;
    await page.mouse.move(box.x + 10, box.y + box.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + 10, box.y + box.height / 2 + i * 40);
    await page.mouse.up();
    await expect(sheet).toBeHidden();
  });

  test("play button pauses and resumes", async ({ page }) => {
    await page.goto(embedUrl({ t: "20" }));
    await waitPlaying(page);
    const vp = page.viewportSize()!;
    if (!/is-controls/.test((await page.locator(".titan").getAttribute("class")) ?? "")) await tap(page, vp.width / 2, vp.height * 0.35);
    await page.locator(".m-play").tap();
    await expect.poll(() => page.evaluate(() => document.querySelector("video")!.paused)).toBe(true);
    await page.locator(".m-play").tap();
    await expect.poll(() => page.evaluate(() => document.querySelector("video")!.paused)).toBe(false);
  });

  test("Skip Intro is a real button during the intro", async ({ page }) => {
    await page.goto(embedUrl({ t: "5" }));
    await waitPlaying(page);
    await page.getByRole("button", { name: /skip intro/i }).tap();
    await expect.poll(() => videoTime(page)).toBeGreaterThanOrEqual(13.5);
  });
});

test.describe("Player B landscape", () => {
  test.use({ viewport: { width: 844, height: 390 } });
  test("uses the mobile player in phone landscape", async ({ page }) => {
    await page.goto(embedUrl());
    await expect(page.locator(".titan.is-mobile")).toBeVisible();
  });
});
