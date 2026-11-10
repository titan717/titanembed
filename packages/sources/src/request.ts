import type { SourceRequest } from "./types";

const TMDB = /^\d{1,9}$/;
const IMDB = /^tt\d{5,10}$/;
const ID = /^[a-z0-9-]{1,32}$/;

const int = (v: string | null) => (v !== null && /^\d{1,4}$/.test(v) ? Number(v) : undefined);

/**
 * Reads a source request from embed URL parameters:
 * `tmdb=` or `imdb=`, `type=movie|tv`, `s=` and `e=` for episodes, `source=` (preferred source id),
 * `sources=a,b` (only these), plus `title`, `subtitle`, `poster`, `t` (start) and `accent`.
 * Returns null when the URL has no catalogue id (direct `src=` URLs use the media descriptor path).
 */
export function requestFromParams(p: URLSearchParams): SourceRequest | null {
  const tmdb = p.get("tmdb")?.trim() ?? "";
  const imdb = p.get("imdb")?.trim() ?? "";
  if (!TMDB.test(tmdb) && !IMDB.test(imdb)) return null;
  const season = int(p.get("s") ?? p.get("season"));
  const episode = int(p.get("e") ?? p.get("episode"));
  const kind = p.get("type") === "tv" || (season !== undefined && episode !== undefined) ? "tv" : "movie";
  const req: SourceRequest = { kind };
  if (TMDB.test(tmdb)) req.tmdb = tmdb;
  if (IMDB.test(imdb)) req.imdb = imdb;
  if (kind === "tv") {
    req.season = season ?? 1;
    req.episode = episode ?? 1;
  }
  const pref = p.get("source");
  if (pref && ID.test(pref)) req.preferred = pref;
  const only = (p.get("sources") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => ID.test(s))
    .slice(0, 10);
  if (only.length) req.only = only;
  const str = (k: string, max: number) => {
    const v = p.get(k);
    return v ? v.slice(0, max) : undefined;
  };
  const title = str("title", 200);
  if (title) req.title = title;
  const subtitle = str("subtitle", 200);
  if (subtitle) req.subtitle = subtitle;
  const poster = str("poster", 2048);
  if (poster) req.poster = poster;
  const t = Number(p.get("t"));
  if (p.get("t") !== null && Number.isFinite(t) && t >= 0 && t < 86400) req.start = t;
  const accent = p.get("accent");
  if (accent && /^#?[0-9a-f]{6}$/i.test(accent)) req.accent = accent.startsWith("#") ? accent : `#${accent}`;
  const subs = p
    .getAll("sub")
    .slice(0, 20)
    .map((s) => {
      const [url, lang, label] = s.split("|");
      return { url: url ?? "", lang: lang || "und", label: label || lang || "Subtitles" };
    })
    .filter((s) => /^https:\/\//.test(s.url) || s.url.startsWith("/"));
  if (subs.length) req.subtitles = subs;
  return req;
}
