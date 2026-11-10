import { expect, test } from "@playwright/test";
import { embedUrl, waitPlaying, videoTime } from "./helpers";

test.use({ viewport: { width: 1920, height: 1080 } });

test.describe("Player A (TV)", () => {
  test("auto-selects the TV player on a large landscape frame and plays", async ({ page }) => {
    await page.goto(embedUrl());
    await expect(page.locator(".titan.is-tv")).toBeVisible();
    await waitPlaying(page);
  });

  test("first key press wakes the controls with focus on the track", async ({ page }) => {
    await page.goto(embedUrl({ player: "tv" }));
    await waitPlaying(page);
    await page.waitForTimeout(500);
    await page.keyboard.press("ArrowUp");
    await expect(page.locator(".titan")).toHaveClass(/is-controls/);
    // focus is always inside the player, never lost to the page
    expect(await page.evaluate(() => !!document.activeElement?.closest(".titan"))).toBe(true);
  });

  test("Enter on the track toggles pause, Back hides the controls", async ({ page }) => {
    await page.goto(embedUrl({ player: "tv", t: "20" }));
    await waitPlaying(page);
    await page.keyboard.press("ArrowUp");
    await page.locator(".tv-track").focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => page.evaluate(() => document.querySelector("video")!.paused)).toBe(true);
    await page.keyboard.press("Enter");
    await expect.poll(() => page.evaluate(() => document.querySelector("video")!.paused)).toBe(false);
    await page.keyboard.press("Escape");
    await expect(page.locator(".titan")).not.toHaveClass(/is-controls/);
  });

  test("hidden seek accumulates and commits", async ({ page }) => {
    await page.goto(embedUrl({ player: "tv", t: "16" }));
    await waitPlaying(page);
    const before = await videoTime(page);
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(".tv-bubble")).toBeVisible();
    await expect.poll(() => videoTime(page), { timeout: 5000 }).toBeGreaterThan(before + 15);
  });

  test("D-pad reaches Audio & Subtitles and Back closes the panel", async ({ page }) => {
    await page.goto(embedUrl({ player: "tv", t: "20" }));
    await waitPlaying(page);
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    // walk right along the top row until the audio pill is focused
    for (let i = 0; i < 4; i++) {
      const label = await page.evaluate(() => document.activeElement?.textContent ?? "");
      if (/Audio/.test(label)) break;
      await page.keyboard.press("ArrowRight");
    }
    await page.keyboard.press("Enter");
    const panel = page.getByRole("dialog", { name: "Audio & Subtitles" });
    await expect(panel).toBeVisible();
    await expect(panel.getByText("Español").first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
  });

  test("Skip Intro appears inside the intro marker", async ({ page }) => {
    await page.goto(embedUrl({ player: "tv", t: "5" }));
    await waitPlaying(page);
    const skip = page.getByRole("button", { name: /skip intro/i });
    await expect(skip).toBeVisible();
    await page.keyboard.press("Enter");
    await expect.poll(() => videoTime(page)).toBeGreaterThanOrEqual(13.5);
  });

  test("captions render as text", async ({ page }) => {
    await page.goto(embedUrl({ player: "tv", t: "1" }));
    await waitPlaying(page);
    await page.keyboard.press("c");
    await expect(page.locator(".t-captions")).not.toBeEmpty({ timeout: 15000 });
  });
});
