import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SourceRegistry,
  createHealthStore,
  embedmasterAdapter,
  mockAdapter,
  modeOf,
  playerJsDriver,
  requestFromParams,
  score,
  urlAdapter,
  STRICT_SANDBOX,
  type SourceAdapter,
  type SourceStats
} from "@titan/sources";

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};
const stats = (s: Partial<SourceStats> = {}): SourceStats => ({ ok: 0, fail: 0, ttff: [], popups: 0, redirects: 0, lastFail: 0, ...s });
const provider = (over: Partial<SourceAdapter> = {}): SourceAdapter => ({
  id: "p",
  name: "P",
  kind: "provider",
  capabilities: ["commands", "events", "tmdb"],
  rank: 1,
  origins: ["https://p.example"],
  sandbox: { sandbox: STRICT_SANDBOX, allow: "autoplay", referrerPolicy: "origin", reason: "test" },
  supports: () => true,
  resolve: () => ({ kind: "provider", url: "https://p.example/x" }),
  driver: (post) => playerJsDriver(post, { eventSource: "p", commandSource: "pc", volumeScale: 100 }),
  ...over
});

describe("source registry", () => {
  const reg = () => new SourceRegistry(createHealthStore(mem()));

  it("rejects unsafe or malformed adapters", () => {
    expect(() => reg().register(provider({ id: "Bad Id" }))).toThrow(/id/);
    expect(() => reg().register(provider({ origins: [] }))).toThrow(/origins/);
    expect(() => reg().register(provider({ origins: ["http://p.example"] }))).toThrow(/https/);
    expect(() => reg().register(provider({ origins: ["https://p.example/path"] }))).toThrow(/origin/);
    for (const flag of ["allow-popups", "allow-top-navigation", "allow-modals", "allow-forms", "allow-popups-to-escape-sandbox"])
      expect(() =>
        reg().register(provider({ sandbox: { sandbox: `allow-scripts ${flag}`, allow: "", referrerPolicy: "origin", reason: "" } }))
      ).toThrow(/sandbox/);
    // a provider that refuses a sandbox must be driven, so its frame can stay inert
    expect(() =>
      reg().register(
        provider({
          capabilities: ["theme"],
          driver: undefined,
          sandbox: { sandbox: null, allow: "", referrerPolicy: "origin", reason: "" }
        })
      )
    ).toThrow(/commands and events/);
    expect(() => reg().register(provider({ driver: undefined }))).toThrow(/driver/);
    const r = reg().register(provider());
    expect(() => r.register(provider())).toThrow(/already/);
  });

  it("orders candidates by preference, filters and health", () => {
    const r = reg()
      .register(provider({ id: "a", rank: 1 }))
      .register(provider({ id: "b", rank: 2 }))
      .register(provider({ id: "c", rank: 3, capabilities: ["commands", "events", "tmdb", "rate"] }));
    const ids = (req: Parameters<SourceRegistry["candidates"]>[0]) => r.candidates(req).map((a) => a.id);
    expect(ids({ kind: "movie", tmdb: "1" })).toEqual(["a", "b", "c"]);
    expect(ids({ kind: "movie", tmdb: "1", preferred: "c" })).toEqual(["c", "a", "b"]);
    expect(ids({ kind: "movie", tmdb: "1", only: ["b", "c"] })).toEqual(["b", "c"]);
    expect(ids({ kind: "movie", tmdb: "1", need: ["rate"] })).toEqual(["c"]);
    // a failure pushes a source behind healthier ones; popups weigh heavily
    r.recordFailure("a");
    expect(ids({ kind: "movie", tmdb: "1" })).toEqual(["b", "c", "a"]);
    r.recordPopup("b");
    expect(ids({ kind: "movie", tmdb: "1" })[0]).toBe("c");
  });

  it("reports driven vs themed mode", () => {
    expect(modeOf(urlAdapter)).toBe("driven");
    expect(modeOf(embedmasterAdapter)).toBe("driven");
    expect(modeOf(mockAdapter({ origin: "http://127.0.0.1:4174", themed: true }))).toBe("themed");
  });

  it("registers every production adapter", () => {
    const r = reg().register(urlAdapter).register(embedmasterAdapter);
    expect(r.list().map((a) => a.id)).toEqual(["direct", "embedmaster"]);
  });
});

describe("source health", () => {
  it("scores failures, slow starts, popups and recent failures", () => {
    const now = 1_000_000_000;
    expect(score(1, stats(), now)).toBe(1);
    expect(score(1, stats({ ok: 1, fail: 1 }), now)).toBe(6);
    expect(score(1, stats({ ok: 3, ttff: [1000, 5000, 3000] }), now)).toBeCloseTo(1.6);
    expect(score(0, stats({ popups: 1, redirects: 1 }), now)).toBe(7);
    expect(score(0, stats({ lastFail: now - 60_000 }), now)).toBe(20);
    expect(score(0, stats({ lastFail: now - 11 * 60_000 }), now)).toBe(0);
  });

  it("persists sanitised stats and survives junk storage", () => {
    const s = mem();
    const h = createHealthStore(s);
    h.update("a", (x) => {
      x.ok++;
      for (let i = 0; i < 15; i++) x.ttff.push(i);
    });
    expect(createHealthStore(s).get("a").ttff).toHaveLength(10);
    s.setItem("titan.sources.v1", JSON.stringify({ a: { ok: -5, fail: "x", ttff: [1, "y", 1e12] }, "Bad Key": {} }));
    const j = createHealthStore(s);
    expect(j.get("a")).toEqual(stats({ ttff: [1, 0, 1e9] }));
    expect(Object.keys(j.all())).toEqual(["a"]);
    s.setItem("titan.sources.v1", "{not json");
    expect(createHealthStore(s).get("a")).toEqual(stats());
    expect(createHealthStore(null).get("z")).toEqual(stats());
  });
});

describe("source requests", () => {
  const req = (q: string) => requestFromParams(new URLSearchParams(q));
  it("reads movies, episodes and options", () => {
    expect(req("src=/a.mp4")).toBeNull();
    expect(req("tmdb=abc")).toBeNull();
    expect(req("tmdb=550&t=30&source=embedmaster&sources=embedmaster,direct,BAD&accent=ff0000")).toMatchObject({
      kind: "movie",
      tmdb: "550",
      start: 30,
      preferred: "embedmaster",
      only: ["embedmaster", "direct"],
      accent: "#ff0000"
    });
    expect(req("tmdb=1399&type=tv")).toMatchObject({ kind: "tv", season: 1, episode: 1 });
    expect(req("imdb=tt0944947&s=2&e=5")).toMatchObject({ kind: "tv", imdb: "tt0944947", season: 2, episode: 5 });
    expect(req("tmdb=1&t=-4")?.start).toBeUndefined();
    expect(req("tmdb=1&sub=javascript:x|en|X&sub=https://x.example/a.vtt|en|English")?.subtitles).toEqual([
      { url: "https://x.example/a.vtt", lang: "en", label: "English" }
    ]);
  });
});

describe("EmbedMaster adapter", () => {
  it("builds the documented URLs", () => {
    expect(embedmasterAdapter.resolve({ kind: "movie", tmdb: "550" })).toEqual({
      kind: "provider",
      url: "https://embedmaster.link/movie/550?autoplay=on&welcome_page=off&skin=onyx"
    });
    const tv = embedmasterAdapter.resolve({ kind: "tv", imdb: "tt0944947", season: 1, episode: 2 });
    expect(tv.kind === "provider" && tv.url).toBe("https://embedmaster.link/tv/tt0944947/1/2?autoplay=on&welcome_page=off&skin=onyx");
    expect(embedmasterAdapter.supports({ kind: "movie", tmdb: "x1" })).toBe(false);
    expect(embedmasterAdapter.supports({ kind: "tv", tmdb: "1399" })).toBe(false);
    expect(() => embedmasterAdapter.resolve({ kind: "movie" })).toThrow();
  });

  it("is allowed by the production CSP", () => {
    const cfg = JSON.parse(readFileSync("vercel.json", "utf8")) as {
      headers: { source: string; headers: { key: string; value: string }[] }[];
    };
    const embed = cfg.headers.find((h) => h.source.startsWith("/embed"))!;
    const csp = embed.headers.find((h) => h.key === "Content-Security-Policy")!.value;
    const frameSrc = csp.split(";").find((d) => d.trim().startsWith("frame-src"))!;
    for (const a of [embedmasterAdapter]) for (const o of a.origins!) expect(frameSrc).toContain(o);
  });
});

describe("PlayerJS driver", () => {
  it("maps events and refuses foreign or malformed messages", () => {
    const sent: unknown[] = [];
    const d = playerJsDriver((m) => sent.push(m), {
      eventSource: "embedmaster_player",
      commandSource: "embedmaster_player_command",
      volumeScale: 100
    });
    expect(d.receive({ source: "other", event: "play" })).toBeNull();
    expect(d.receive("play")).toBeNull();
    expect(d.receive({ source: "embedmaster_player", event: "eval" })).toBeNull();
    expect(d.receive({ source: "embedmaster_player", event: "time", info: "12.5" })).toEqual([{ type: "time", time: 12.5 }]);
    expect(d.receive({ source: "embedmaster_player", event: "time", info: "NaN" })).toEqual([]);
    expect(d.receive({ source: "embedmaster_player", event: "volume", info: 50 })).toEqual([{ type: "volume", volume: 0.5 }]);
    expect(d.receive({ source: "embedmaster_player", event: "loaderror", info: "x".repeat(500) })![0]).toMatchObject({ type: "error" });
    d.seek(12.345);
    d.setVolume(0.42);
    d.setMuted(true);
    expect(sent).toEqual([
      { source: "embedmaster_player_command", command: "seek", value: 12.3 },
      { source: "embedmaster_player_command", command: "volume", value: 42 },
      { source: "embedmaster_player_command", command: "mute", value: undefined }
    ]);
    expect(d.setRate).toBeUndefined();
  });

  it("mock adapter only accepts loopback origins", () => {
    expect(() => mockAdapter({ origin: "https://evil.example" })).toThrow(/loopback/);
  });
});

describe("SDK source options", async () => {
  const { embedSrc, createPlayer } = await import("../../packages/sdk/src/index");
  it("encodes a catalogue title into the embed URL", () => {
    const u = new URL(
      embedSrc({
        embedUrl: "https://titan.example/embed/",
        source: { imdb: "tt0944947", type: "tv", season: 2, episode: 3, start: 90 },
        preferredSource: "embedmaster",
        sources: ["embedmaster", "direct"]
      })
    );
    expect(Object.fromEntries(u.searchParams)).toMatchObject({
      imdb: "tt0944947",
      type: "tv",
      s: "2",
      e: "3",
      t: "90",
      source: "embedmaster",
      sources: "embedmaster,direct"
    });
  });
  it("sandboxes media frames and leaves provider frames unsandboxed unless asked", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const a = createPlayer(el, {
      embedUrl: "https://titan.example/embed/",
      media: { title: "x", sources: [{ url: "https://titan.example/a.mp4" }] }
    });
    expect(a.iframe.getAttribute("sandbox")).toBe("allow-scripts allow-same-origin");
    const b = createPlayer(el, { embedUrl: "https://titan.example/embed/", source: { tmdb: 550 } });
    expect(b.iframe.hasAttribute("sandbox")).toBe(false);
    const c = createPlayer(el, { embedUrl: "https://titan.example/embed/", source: { tmdb: 550 }, sandbox: true });
    expect(c.iframe.getAttribute("sandbox")).toBe("allow-scripts allow-same-origin");
    for (const p of [a, b, c]) p.destroy();
  });
});
