import type {
  AudioTrackInput,
  EpisodeInput,
  Marker,
  MarkerType,
  MediaDescriptor,
  MediaSource,
  SourceType,
  SubtitleTrackInput,
  ThemeInput
} from "./types";

/**
 * Media descriptor validation (the input contract, ROADMAP v0.1.0 / SECURITY.md T-1).
 *
 * Everything a host sends passes through `validateDescriptor`. Unknown keys are dropped, every string is
 * cleaned and length-limited, every URL must be https:, blob:, or same-origin with the embed page, and every
 * list is capped. Text is only ever rendered with textContent, so cleaning is defence in depth, not the only line.
 */

export const LIMITS = {
  text: 300,
  longText: 600,
  url: 2048,
  id: 128,
  sources: 12,
  subtitles: 40,
  audio: 24,
  markers: 24,
  episodes: 500,
  encoded: 64 * 1024,
  maxTime: 60 * 60 * 24
} as const;

export interface ValidationResult<T> {
  ok: boolean;
  value?: T;
  errors: string[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

// C0/C1 controls and bidi overrides (U+202A–202E, U+2066–2069) are removed; newlines become spaces.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g;

/** Cleans untrusted display text. Returns undefined for non-strings and empty results. */
export function cleanText(v: unknown, max: number = LIMITS.text): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.replace(/[\r\n\t]+/g, " ").replace(CONTROL, "").replace(/\s{2,}/g, " ").trim();
  if (!t) return undefined;
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "\u2026" : t;
}

let pageOrigin: string | null = null;
/** Lets the embed page declare its own origin (tests set it explicitly). */
export function setPageOrigin(origin: string | null) {
  pageOrigin = origin;
}
function currentOrigin(): string | null {
  if (pageOrigin) return pageOrigin;
  try {
    return typeof location !== "undefined" && /^https?:$/.test(location.protocol) ? location.origin : null;
  } catch {
    return null;
  }
}

/**
 * URL allowlist: https: anywhere, blob: (local files and tests), or a URL on the embed page's own origin
 * (which also covers relative paths). javascript:, data:, file:, http: to other hosts and everything else is refused.
 */
export function safeUrl(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const raw = v.trim();
  if (!raw || raw.length > LIMITS.url) return undefined;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\s]/.test(raw)) return undefined;
  const base = currentOrigin();
  let u: URL;
  try {
    u = base ? new URL(raw, base) : new URL(raw);
  } catch {
    return undefined;
  }
  if (u.protocol === "https:") return u.href;
  if (u.protocol === "blob:") return raw;
  if (base && u.origin === base) return u.href;
  return undefined;
}

const num = (v: unknown, lo: number, hi: number): number | undefined => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= lo && n <= hi ? n : undefined;
};
const bool = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined);
const id = (v: unknown) => (typeof v === "string" || typeof v === "number" ? cleanText(String(v), LIMITS.id) : undefined);
const LANG = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,3}$/;
const lang = (v: unknown) => (typeof v === "string" && LANG.test(v.trim()) ? v.trim() : undefined);

export function inferType(url: string, given?: unknown): SourceType {
  if (given === "hls" || given === "mp4" || given === "webm") return given;
  const path = url.split(/[?#]/)[0]!.toLowerCase();
  if (path.endsWith(".m3u8")) return "hls";
  if (path.endsWith(".webm")) return "webm";
  return "mp4";
}

function source(v: unknown, errors: string[], i: number): MediaSource | undefined {
  const o = typeof v === "string" ? { url: v } : v;
  if (!isObj(o)) return void errors.push(`sources[${i}] must be an object or a URL string`);
  const url = safeUrl(o.url);
  if (!url) return void errors.push(`sources[${i}].url must be an https: URL (got ${JSON.stringify(String(o.url ?? "")).slice(0, 60)})`);
  const out: MediaSource = { url, type: inferType(url, o.type) };
  const label = cleanText(o.label, 40);
  const height = num(o.height, 1, 4320);
  if (label) out.label = label;
  if (height) out.height = Math.round(height);
  return out;
}

function subtitle(v: unknown, errors: string[], i: number): SubtitleTrackInput | undefined {
  if (!isObj(v)) return void errors.push(`subtitles[${i}] must be an object`);
  const url = safeUrl(v.url);
  if (!url) return void errors.push(`subtitles[${i}].url must be an https: URL`);
  const l = lang(v.lang) ?? "und";
  const out: SubtitleTrackInput = { lang: l, label: cleanText(v.label, 60) ?? l, url };
  const tid = id(v.id);
  if (tid) out.id = tid;
  if (bool(v.sdh)) out.sdh = true;
  if (bool(v.default)) out.default = true;
  if (v.format === "srt" || v.format === "vtt") out.format = v.format;
  return out;
}

function audio(v: unknown): AudioTrackInput | undefined {
  if (!isObj(v)) return undefined;
  const l = lang(v.lang) ?? "und";
  const out: AudioTrackInput = { lang: l, label: cleanText(v.label, 60) ?? l };
  const ch = cleanText(v.channels, 8);
  if (ch && /^[0-9.]+$/.test(ch)) out.channels = ch;
  if (bool(v.original)) out.original = true;
  return out;
}

const MARKERS: MarkerType[] = ["intro", "recap", "credits"];
export function validateMarkers(v: unknown): Marker[] {
  if (!Array.isArray(v)) return [];
  const out: Marker[] = [];
  for (const m of v.slice(0, LIMITS.markers)) {
    if (!isObj(m) || !MARKERS.includes(m.type as MarkerType)) continue;
    const start = num(m.start, 0, LIMITS.maxTime);
    const end = num(m.end, 0, LIMITS.maxTime);
    if (start === undefined || end === undefined || end <= start) continue;
    out.push({ type: m.type as MarkerType, start, end });
  }
  return out.sort((a, b) => a.start - b.start);
}

function episode(v: unknown, errors: string[], i: number): EpisodeInput | undefined {
  if (!isObj(v)) return undefined;
  const eid = id(v.id);
  const title = cleanText(v.title);
  if (!eid || !title) return void errors.push(`episodes[${i}] needs an id and a title`);
  const out: EpisodeInput = { id: eid, title };
  const sub = cleanText(v.subtitle);
  const season = num(v.season, 0, 999);
  const ep = num(v.episode, 0, 9999);
  const thumb = safeUrl(v.thumbnail);
  const dur = num(v.duration, 0, LIMITS.maxTime);
  const prog = num(v.progress, 0, 1);
  const genres = cleanText(v.genres, 80);
  if (sub) out.subtitle = sub;
  if (season !== undefined) out.season = Math.round(season);
  if (ep !== undefined) out.episode = Math.round(ep);
  if (thumb) out.thumbnail = thumb;
  if (dur !== undefined) out.duration = dur;
  if (prog !== undefined) out.progress = prog;
  if (bool(v.watched)) out.watched = true;
  if (genres) out.genres = genres;
  if (Array.isArray(v.sources)) {
    const srcs = v.sources.slice(0, LIMITS.sources).map((s, k) => source(s, errors, k)).filter((s): s is MediaSource => !!s);
    if (srcs.length) out.sources = srcs;
  }
  if (Array.isArray(v.subtitles)) {
    const subs = v.subtitles.slice(0, LIMITS.subtitles).map((s, k) => subtitle(s, errors, k)).filter((s): s is SubtitleTrackInput => !!s);
    if (subs.length) out.subtitles = subs;
  }
  const mk = validateMarkers(v.markers);
  if (mk.length) out.markers = mk;
  return out;
}

const FONTS = ["inter", "system", "serif", "rounded"] as const;
export function validateTheme(v: unknown): ThemeInput | undefined {
  if (!isObj(v)) return undefined;
  const out: ThemeInput = {};
  if (typeof v.accent === "string" && /^#?[0-9a-fA-F]{6}$/.test(v.accent.trim())) out.accent = "#" + v.accent.trim().replace(/^#/, "").toLowerCase();
  const logo = safeUrl(v.logo);
  if (logo) out.logo = logo;
  const radius = num(v.radius, 0, 32);
  if (radius !== undefined) out.radius = Math.round(radius);
  if (FONTS.includes(v.font as (typeof FONTS)[number])) out.font = v.font as ThemeInput["font"];
  const op = num(v.controlsOpacity, 0.4, 1);
  if (op !== undefined) out.controlsOpacity = op;
  return Object.keys(out).length ? out : undefined;
}

/** Validates an untrusted descriptor. `ok` is false only when nothing playable is left. */
export function validateDescriptor(input: unknown): ValidationResult<MediaDescriptor> {
  const errors: string[] = [];
  if (!isObj(input)) return { ok: false, errors: ["The media descriptor must be an object."] };
  const rawSources = Array.isArray(input.sources) ? input.sources : input.src !== undefined ? [input.src] : [];
  const sources = rawSources.slice(0, LIMITS.sources).map((s, i) => source(s, errors, i)).filter((s): s is MediaSource => !!s);
  if (!sources.length) {
    errors.push("No playable source: add sources: [{ url: \"https://…/master.m3u8\" }].");
    return { ok: false, errors };
  }
  const d: MediaDescriptor = { title: cleanText(input.title) ?? "Untitled", sources };
  const did = id(input.id);
  if (did) d.id = did;
  const fields: [keyof MediaDescriptor, string | undefined][] = [
    ["subtitle", cleanText(input.subtitle)],
    ["rating", cleanText(input.rating, 24)],
    ["advisory", cleanText(input.advisory, 160)],
    ["genres", cleanText(input.genres, 120)],
    ["poster", safeUrl(input.poster)],
    ["backdrop", safeUrl(input.backdrop)],
    ["logo", safeUrl(input.logo)],
    ["thumbnails", safeUrl(input.thumbnails)]
  ];
  for (const [k, val] of fields) if (val) (d as unknown as Obj)[k] = val;
  const start = num(input.start, 0, LIMITS.maxTime);
  if (start !== undefined) d.start = start;
  if (Array.isArray(input.subtitles)) {
    const subs = input.subtitles.slice(0, LIMITS.subtitles).map((s, i) => subtitle(s, errors, i)).filter((s): s is SubtitleTrackInput => !!s);
    if (subs.length) d.subtitles = subs;
  }
  if (Array.isArray(input.audio)) {
    const a = input.audio.slice(0, LIMITS.audio).map(audio).filter((s): s is AudioTrackInput => !!s);
    if (a.length) d.audio = a;
  }
  const mk = validateMarkers(input.markers);
  if (mk.length) d.markers = mk;
  if (Array.isArray(input.episodes)) {
    const eps = input.episodes.slice(0, LIMITS.episodes).map((e, i) => episode(e, errors, i)).filter((e): e is EpisodeInput => !!e);
    if (eps.length) d.episodes = eps;
  }
  if (input.next !== undefined) {
    const n = episode(input.next, errors, -1);
    if (n) d.next = n;
  }
  const theme = validateTheme(input.theme);
  if (theme) d.theme = theme;
  return { ok: true, value: d, errors };
}

/* ---------- compact URL form: ?m=<base64url(JSON)> ---------- */

function b64urlEncode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): string {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** Encodes a descriptor for the `m` URL parameter. */
export function encodeDescriptor(d: unknown): string {
  return b64urlEncode(JSON.stringify(d));
}

/** Decodes the `m` URL parameter. Returns undefined when it is too large or not valid JSON. */
export function decodeDescriptor(m: string): unknown {
  if (!m || m.length > LIMITS.encoded || !/^[A-Za-z0-9_-]+$/.test(m)) return undefined;
  try {
    return JSON.parse(b64urlDecode(m)) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Builds a descriptor from URL parameters. `m` (the full encoded descriptor) wins; otherwise the short form is
 * used: src, title, subtitle, poster, backdrop, logo, t (start), sub=<url>|<lang>|<label> (repeatable),
 * intro=<start>-<end>, recap=…, credits=…, rating, advisory.
 */
export function descriptorFromParams(p: URLSearchParams): unknown {
  const m = p.get("m");
  if (m) return decodeDescriptor(m);
  const src = p.getAll("src");
  if (!src.length) return undefined;
  const out: Obj = { sources: src.map((url) => ({ url })) };
  for (const k of ["id", "title", "subtitle", "poster", "backdrop", "logo", "rating", "advisory", "genres", "thumbnails"]) {
    const v = p.get(k);
    if (v !== null) out[k] = v;
  }
  const t = p.get("t");
  if (t !== null) out.start = Number(t);
  const subs = p.getAll("sub").map((s) => {
    const [url, l, label] = s.split("|");
    return { url, lang: l || "und", label: label || l || "Subtitles" };
  });
  if (subs.length) out.subtitles = subs;
  const markers: Obj[] = [];
  for (const type of MARKERS) {
    const v = p.get(type);
    const mm = v && /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/.exec(v);
    if (mm) markers.push({ type, start: Number(mm[1]), end: Number(mm[2]) });
  }
  if (markers.length) out.markers = markers;
  return out;
}
