import type { SourceAdapter, SourceRequest } from "../types";
import { playerJsDriver } from "./playerjs";

const ORIGIN = "https://embedmaster.link";
const TMDB = /^\d{1,9}$/;
const IMDB = /^tt\d{5,10}$/;

function idOf(req: SourceRequest): string | null {
  if (req.tmdb && TMDB.test(req.tmdb)) return req.tmdb;
  if (req.imdb && IMDB.test(req.imdb)) return req.imdb;
  return null;
}

const posInt = (n: unknown) => typeof n === "number" && Number.isInteger(n) && n >= 0 && n < 10000;

/**
 * EmbedMaster (https://embedmaster.com/documentation/): documented iframe embed by TMDB or IMDb id, with a
 * postMessage API for play, pause, seek, mute, unmute and volume and PlayerJS events. Documented constraints that
 * shape this adapter (see docs/SOURCES.md):
 * - "Sandbox attribute on our iframe is not allowed", so the profile has no sandbox; in exchange the iframe is
 *   always inert under Titan's own UI and never receives a click, key or focus.
 * - There is no documented controls-off option; `welcome_page=off` and `autoplay=on` remove the start screen, and
 *   because the iframe never gets pointer input its own controls stay hidden.
 * - Host subtitles are rendered by Titan over the iframe (time events drive the cues), not passed as `sub_url[]`.
 */
export const embedmasterAdapter: SourceAdapter = {
  id: "embedmaster",
  name: "EmbedMaster",
  kind: "provider",
  capabilities: ["commands", "events", "subtitles", "tmdb", "imdb", "tv"],
  rank: 2,
  docs: "https://embedmaster.com/documentation/",
  origins: [ORIGIN],
  sandbox: {
    sandbox: null,
    allow: "autoplay *; fullscreen *; picture-in-picture *; encrypted-media *",
    referrerPolicy: "origin",
    reason:
      "EmbedMaster documents that a sandbox attribute stops its player and recommends exactly this allow list (https://embedmaster.com/documentation/)."
  },
  timeout: 30,
  supports(req) {
    if (!idOf(req)) return false;
    return req.kind === "movie" || (req.kind === "tv" && posInt(req.season) && posInt(req.episode));
  },
  resolve(req) {
    const id = idOf(req);
    if (!id) throw new Error("EmbedMaster needs a TMDB or IMDb id");
    const path = req.kind === "tv" ? `/tv/${id}/${req.season}/${req.episode}` : `/movie/${id}`;
    const u = new URL(path, ORIGIN);
    u.searchParams.set("autoplay", "on");
    u.searchParams.set("welcome_page", "off");
    u.searchParams.set("skin", "onyx");
    return { kind: "provider", url: u.toString() };
  },
  driver: (post) =>
    playerJsDriver(post, { eventSource: "embedmaster_player", commandSource: "embedmaster_player_command", volumeScale: 100 })
};
