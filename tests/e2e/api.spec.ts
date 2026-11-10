import { expect, test, type Page } from "@playwright/test";
import { embedUrl } from "./helpers";

// The host page runs on another origin (127.0.0.1:4174 / localhost:4174) than the embed (localhost:4173),
// so the frame is cross-origin exactly as in production.
const HOST = "http://127.0.0.1:4174";
const OTHER = "http://localhost:4174";

async function host(page: Page, origin: string, params: Record<string, string>) {
  const src = "http://localhost:4173" + embedUrl(params);
  await page.goto(`${origin}/host.html?embed=${encodeURIComponent(src)}`);
}

const events = (page: Page) =>
  page.evaluate(() => (window as unknown as { msgs: { data: { type: string; event?: string; id?: string } }[] }).msgs.map((m) => m.data));

test.describe("postMessage API", () => {
  test("allowlisted host receives ready and can command the player", async ({ page }) => {
    await host(page, HOST, { origins: HOST, player: "tv", t: "20" });
    await expect.poll(async () => (await events(page)).some((m) => m.event === "ready"), { timeout: 20000 }).toBe(true);
    await page.evaluate(() =>
      (window as unknown as { send: (c: string, a?: unknown, id?: string) => void }).send("pause", undefined, "p1")
    );
    await expect.poll(async () => (await events(page)).find((m) => m.type === "response" && m.id === "p1")).toMatchObject({ ok: true });
    await page.evaluate(() =>
      (window as unknown as { send: (c: string, a?: unknown, id?: string) => void }).send("getState", undefined, "s1")
    );
    await expect.poll(async () => (await events(page)).find((m) => m.id === "s1")).toMatchObject({ ok: true, data: { state: "paused" } });
  });

  test("invalid commands get a typed error reply", async ({ page }) => {
    await host(page, HOST, { origins: HOST, player: "tv" });
    await expect.poll(async () => (await events(page)).some((m) => m.event === "ready"), { timeout: 20000 }).toBe(true);
    await page.evaluate(() => (window as unknown as { send: (c: string, a?: unknown, id?: string) => void }).send("seek", -5, "bad"));
    await expect.poll(async () => (await events(page)).find((m) => m.id === "bad")).toMatchObject({ ok: false });
    await page.evaluate(() =>
      (window as unknown as { send: (c: string, a?: unknown, id?: string) => void }).send("eval", "alert(1)", "bad2")
    );
    await expect.poll(async () => (await events(page)).find((m) => m.id === "bad2")).toMatchObject({ ok: false });
  });

  test("a host outside the allowlist sees E_NOT_ALLOWED_HERE and gets no events", async ({ page }) => {
    await host(page, OTHER, { origins: HOST, player: "tv" });
    const frame = page.frameLocator("#f");
    await expect(frame.getByText(/isn't enabled for this website/i)).toBeVisible({ timeout: 15000 });
    await page.evaluate(() =>
      (window as unknown as { send: (c: string, a?: unknown, id?: string) => void }).send("getState", undefined, "x")
    );
    await page.waitForTimeout(800);
    expect(await events(page)).toEqual([]);
  });

  test("rate limiting rejects floods", async ({ page }) => {
    await host(page, HOST, { origins: HOST, player: "tv" });
    await expect.poll(async () => (await events(page)).some((m) => m.event === "ready"), { timeout: 20000 }).toBe(true);
    await page.evaluate(() => {
      const w = window as unknown as { send: (c: string, a?: unknown, id?: string) => void };
      for (let i = 0; i < 200; i++) w.send("getTime", undefined, "r" + i);
    });
    await expect
      .poll(
        async () => (await events(page)).filter((m) => m.type === "response" && (m as { error?: string }).error === "rate limited").length
      )
      .toBeGreaterThan(100);
  });

  test("hostile descriptor values are shown as text, never executed", async ({ page }) => {
    let dialog = false;
    page.on("dialog", (d) => {
      dialog = true;
      void d.dismiss();
    });
    await page.goto(embedUrl({ player: "tv", title: '<img src=x onerror="alert(1)">', poster: "javascript:alert(2)" }));
    await expect(page.locator(".tv-title-main")).toHaveText('<img src=x onerror="alert(1)">');
    expect(await page.locator(".titan img[src='x']").count()).toBe(0);
    await page.waitForTimeout(500);
    expect(dialog).toBe(false);
  });

  test("javascript: sources are rejected with a descriptor error", async ({ page }) => {
    await page.goto("/embed/?src=javascript:alert(1)&player=tv");
    await expect(page.getByText(/descriptor|nothing to play|playable/i).first()).toBeVisible();
  });
});
