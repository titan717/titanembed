import { expect, test, type BrowserContext, type Page } from "@playwright/test";

// Source layer and provider isolation (docs/SOURCES.md). The mock provider (fixtures/mock-provider.html on :4174)
// speaks the PlayerJS-style protocol EmbedMaster documents; `hostile` mode tries popups, redirects, links, alerts,
// focus theft and app intents on load, on a timer and on every real user gesture it receives.
const MOCK = "http://127.0.0.1:4174";

function srcUrl(mockcfg: string, extra: Record<string, string> = {}) {
  const ids = mockcfg.split(",").map((s) => s.split(".")[0]);
  const p = new URLSearchParams({ tmdb: "550", title: "Mock title", mock: MOCK, mockcfg, sources: ids.join(","), ...extra });
  return `/embed/?${p}`;
}

/** Fails the test on any popup, new page or top-level navigation away from the embed. */
function guard(ctx: BrowserContext, page: Page) {
  const opened: string[] = [];
  const navigations: string[] = [];
  ctx.on("page", (p) => p !== page && opened.push(p.url() || "about:blank"));
  page.on("popup", (p) => opened.push(p.url() || "popup"));
  page.on("framenavigated", (f) => {
    if (f === page.mainFrame() && !f.url().startsWith("http://localhost:4173/embed/")) navigations.push(f.url());
    else if (f !== page.mainFrame() && !f.url().startsWith(MOCK) && f.url() !== "about:blank") navigations.push(f.url());
  });
  return {
    assertClean() {
      expect(opened, `popups/new pages: ${opened.join(", ")}`).toEqual([]);
      expect(navigations, `navigations: ${navigations.join(", ")}`).toEqual([]);
      expect(page.url()).toContain("/embed/");
    }
  };
}

async function providerTime(page: Page): Promise<number> {
  const f = page.frames().find((fr) => fr.url().startsWith(MOCK));
  if (!f) return 0;
  try {
    return await f.evaluate(() => document.querySelector("video")!.currentTime);
  } catch {
    return 0; // the frame was swapped for the next source mid-read
  }
}

/** Our seek bar follows the provider's clock (both players), read from the embed page itself. */
const seekValue = (page: Page) =>
  page.evaluate(() => Number(document.querySelector('[role="slider"][aria-valuenow]')?.getAttribute("aria-valuenow") ?? 0));

async function waitProviderPlaying(page: Page) {
  await expect.poll(() => seekValue(page), { timeout: 20_000 }).toBeGreaterThanOrEqual(1);
  await expect(page.locator(".t-error:visible")).toHaveCount(0);
}

async function hammer(page: Page, touch = false) {
  const box = (await page.locator(".titan").boundingBox())!;
  const points = [
    [0.5, 0.5],
    [0.1, 0.1],
    [0.9, 0.1],
    [0.1, 0.9],
    [0.9, 0.9],
    [0.5, 0.2]
  ];
  for (const [x, y] of points) {
    const px = box.x + box.width * x!;
    const py = box.y + box.height * y!;
    if (touch) await page.touchscreen.tap(px, py);
    else await page.mouse.click(px, py);
    await page.waitForTimeout(80);
  }
  for (const k of ["Enter", " ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab", "Tab", "Enter", "Escape", "f", "m", "k"]) {
    await page.keyboard.press(k);
    await page.waitForTimeout(40);
  }
}

test.describe("sources", () => {
  test("a driven provider plays under Player A with our controls", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(srcUrl("m1.ok", { player: "tv" }));
    await waitProviderPlaying(page);
    const frame = page.locator("iframe.t-provider-frame");
    await expect(frame).toHaveAttribute("tabindex", "-1");
    await expect(frame).toHaveAttribute("inert", "");
    await expect(frame).toHaveCSS("pointer-events", "none");
    // our overlay owns the keys: OK pauses the provider through the command channel
    await page.keyboard.press("ArrowUp");
    await page.locator(".tv-track").focus();
    await page.keyboard.press("Enter");
    // the provider's own video pauses: the command went through the provider channel
    const providerPaused = () =>
      page
        .frames()
        .find((f) => f.url().startsWith(MOCK))!
        .evaluate(() => document.querySelector("video")!.paused);
    await expect.poll(providerPaused).toBe(true);
    await page.keyboard.press("Enter");
    await expect.poll(providerPaused).toBe(false);
    const evalActive = await page.evaluate(() => document.activeElement?.tagName);
    expect(evalActive).not.toBe("IFRAME");
  });

  test("falls back to the next source when one fails and tells the host", async ({ page }) => {
    const HOST = "http://localhost:4174";
    const src = "http://localhost:4173" + srcUrl("m1.fail,m2.ok", { player: "tv", origins: HOST });
    await page.goto(`${HOST}/host.html?embed=${encodeURIComponent(src)}`);
    const events = () =>
      page.evaluate(() =>
        (window as unknown as { msgs: { data: { event?: string; data?: { id?: string } } }[] }).msgs.map(
          (m) => `${m.data.event}:${m.data.data?.id ?? ""}`
        )
      );
    await expect.poll(events, { timeout: 20_000 }).toContain("sourcefail:m1");
    await expect.poll(events, { timeout: 20_000 }).toContain("sourcechange:m2");
    await expect.poll(async () => (await events()).includes("play:"), { timeout: 20_000 }).toBe(true);
  });

  test("a stalled source falls back and keeps the playback position", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto(srcUrl("m1.stall,m2.ok", { player: "tv" }));
    await expect(page.locator("iframe.t-provider-frame")).toHaveAttribute("src", /mode=ok/, { timeout: 40_000 });
    // the new source resumes near where the stalled one stopped (about 2 s), not at 0
    await expect.poll(() => providerTime(page), { timeout: 15_000 }).toBeGreaterThan(1.5);
  });

  test("the Source row switches providers from settings", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(srcUrl("m1.ok,m2.ok", { player: "tv" }));
    await waitProviderPlaying(page);
    await page.keyboard.press("ArrowUp");
    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByRole("button", { name: /^Source/ }).click();
    await page.getByRole("radio", { name: "Mock m2" }).click();
    await expect(page.locator("iframe.t-provider-frame")).toHaveAttribute("src", /adapter=m2/);
    await waitProviderPlaying(page);
  });

  test("a themed provider gets the Back, Source and Report bar", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(srcUrl("t1.ok.t,t2.ok.t", { player: "tv" }));
    await expect(page.locator(".titan.t-themed")).toBeVisible({ timeout: 15_000 });
    const bar = page.locator(".t-src-bar");
    await expect(bar.getByRole("button", { name: "Back" })).toBeVisible();
    await expect(bar.getByRole("button", { name: "Source" })).toBeVisible();
    await expect(bar.getByRole("button", { name: /Report/ })).toBeVisible();
    await expect(page.locator("iframe")).toHaveAttribute("sandbox", "allow-scripts allow-same-origin");
    await bar.getByRole("button", { name: "Source" }).click();
    await page.getByRole("menuitemradio", { name: "Mock t2 (themed)" }).click();
    await expect(page.locator(".t-src-menu")).toHaveCount(0);
    await expect(page.locator("iframe")).toHaveAttribute("src", /adapter=t2/);
  });
});

test.describe("provider isolation (fails the build on any popup or navigation)", () => {
  for (const variant of [
    { name: "sandboxed hostile provider, TV", cfg: "h1.hostile", player: "tv", touch: false },
    { name: "sandboxed hostile provider, mobile touch", cfg: "h1.hostile", player: "mobile", touch: true },
    { name: "unsandboxed hostile provider, TV", cfg: "h1.hostile.u", player: "tv", touch: false },
    { name: "unsandboxed hostile provider, mobile touch", cfg: "h1.hostile.u", player: "mobile", touch: true }
  ]) {
    test(variant.name, async ({ browser }) => {
      const ctx = await browser.newContext({
        viewport: variant.touch ? { width: 390, height: 844 } : { width: 1280, height: 720 },
        hasTouch: variant.touch,
        isMobile: variant.touch
      });
      const page = await ctx.newPage();
      const dialogs: string[] = [];
      page.on("dialog", (d) => {
        dialogs.push(d.message());
        d.dismiss().catch(() => {});
      });
      const g = guard(ctx, page);
      await page.goto(srcUrl(variant.cfg, { player: variant.player }));
      await waitProviderPlaying(page);
      await hammer(page, variant.touch);
      await page.waitForTimeout(1500);
      const provider = page.frames().find((f) => f.url().startsWith(MOCK))!;
      expect(provider, "provider frame stays on its own origin").toBeTruthy();
      // no real click, tap or key ever reached the provider, so it never had a user gesture to open anything with
      expect(await provider.evaluate(() => (window as unknown as { __gestures?: number }).__gestures ?? 0)).toBe(0);
      const focus = await page.evaluate(() => document.activeElement?.tagName);
      expect(focus).not.toBe("IFRAME");
      // a provider without a sandbox can raise a modal by itself (docs/SECURITY.md), but never from our users' input
      expect(dialogs.filter((d) => d.includes("user-"))).toEqual([]);
      g.assertClean();
      await ctx.close();
    });
  }
});
