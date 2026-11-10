import { expect, test } from "@playwright/test";

// The demo's "Play a title by TMDB ID" form, run against the loopback mock provider (never a real provider in CI).
const DEMO = "/?mock=http://127.0.0.1:4174&mockcfg=m1.fail,m2.ok";

test.describe("demo: play by TMDB ID", () => {
  test("a submitted id loads through the source registry and plays, falling back past a failing source", async ({ page }) => {
    await page.goto(DEMO);
    await expect(page.getByLabel("Season", { exact: true })).toBeHidden();
    await page.getByLabel("TMDB ID").fill("550");
    await page.getByRole("button", { name: "Play title" }).click();
    await expect(page.locator("#tmdb-msg")).toHaveText("Playing from Mock m2.", { timeout: 20_000 });
    const frame = page.locator("#frame iframe");
    await expect(frame).toHaveAttribute("src", /tmdb=550/);
    // provider sources refuse a sandbox; the SDK leaves it off and Titan isolates the provider instead
    expect(await frame.getAttribute("sandbox")).toBeNull();
    await expect(page).toHaveURL(/tmdb=550/);
    await expect(page.locator("#log")).toContainText("sourcefail");
    await expect(page.locator("#code")).toContainText("tmdb=550");
    await expect(page.locator("#code")).not.toContainText("sandbox=");
  });

  test("TV episodes ask for season and episode; bad ids are refused", async ({ page }) => {
    await page.goto(DEMO);
    await page.getByLabel("TMDB ID").fill("12ab");
    await page.getByRole("button", { name: "Play title" }).click();
    await expect(page.getByLabel("TMDB ID")).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#tmdb-msg")).toContainText("digits only");
    await page.getByLabel("TMDB ID").fill("1399");
    await page.getByLabel("Type").selectOption("tv");
    await page.getByLabel("Season", { exact: true }).fill("2");
    await page.getByLabel("Episode", { exact: true }).fill("3");
    await page.getByRole("button", { name: "Play title" }).click();
    await expect(page.locator("#frame iframe")).toHaveAttribute("src", /tmdb=1399&type=tv&s=2&e=3/);
    // choosing a sample video leaves catalogue mode and sandboxes the frame again
    await page.getByRole("button", { name: "Big Buck Bunny" }).click();
    await expect(page.locator("#frame iframe")).toHaveAttribute("sandbox", "allow-scripts allow-same-origin");
    await expect(page).not.toHaveURL(/tmdb=/);
  });
});
