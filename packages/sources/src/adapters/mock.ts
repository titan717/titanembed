import { STRICT_SANDBOX, type SourceAdapter } from "../types";
import { playerJsDriver } from "./playerjs";

/**
 * Mock provider for tests (tests/e2e/fixtures/mock-provider.html). It speaks the same PlayerJS-style protocol as
 * EmbedMaster with `mock_player` sources. Only loopback origins are accepted, so it can never frame a real site.
 * Options: `themed` (no commands: the provider shows its own controls), `unsandboxed` (refuses a sandbox like
 * EmbedMaster), `mode` passed to the page (`hostile` tries popups, redirects and focus theft; `fail`; `stall`).
 */
export function mockAdapter(cfg: {
  origin: string;
  id?: string;
  themed?: boolean;
  unsandboxed?: boolean;
  mode?: string;
  rank?: number;
}): SourceAdapter {
  const u = new URL(cfg.origin);
  if (!/^(localhost|127\.0\.0\.1)$/.test(u.hostname)) throw new Error("mockAdapter only accepts loopback origins");
  const themed = !!cfg.themed;
  const id = cfg.id ?? (themed ? "mock-themed" : "mock");
  return {
    id,
    name: themed ? `Mock ${id} (themed)` : `Mock ${id}`,
    kind: "provider",
    capabilities: themed
      ? ["theme", "tmdb", "imdb", "tv", "url"]
      : ["commands", "events", "rate", "subtitles", "tmdb", "imdb", "tv", "url"],
    rank: cfg.rank ?? 1,
    origins: [u.origin],
    sandbox: {
      sandbox: cfg.unsandboxed && !themed ? null : STRICT_SANDBOX,
      allow: "autoplay; fullscreen",
      referrerPolicy: "origin",
      reason: "Test provider."
    },
    timeout: 8,
    supports: (req) => !!(req.tmdb || req.imdb || req.url),
    resolve(req) {
      const p = new URL("/mock-provider.html", u.origin);
      p.searchParams.set("id", req.tmdb ?? req.imdb ?? "url");
      p.searchParams.set("adapter", id);
      if (cfg.mode) p.searchParams.set("mode", cfg.mode);
      if (themed) p.searchParams.set("controls", "1");
      if (themed && req.accent) p.searchParams.set("color", req.accent.replace(/^#/, ""));
      return { kind: "provider", url: p.toString() };
    },
    ...(themed
      ? {}
      : {
          driver: (post: (m: unknown) => void) =>
            playerJsDriver(post, { eventSource: "mock_player", commandSource: "mock_player_command", volumeScale: 100, rate: true })
        })
  };
}
