/**
 * Namespaced storage. Inside a sandboxed iframe without allow-same-origin, or with storage blocked,
 * localStorage throws; the player then keeps values in memory for the session.
 */
const memory = new Map<string, string>();
let ls: Storage | null = null;
try {
  ls = typeof localStorage !== "undefined" ? localStorage : null;
  ls?.setItem("titan:probe", "1");
  ls?.removeItem("titan:probe");
} catch {
  ls = null;
}

const NS = "titan:v1:";

export function read<T>(key: string, fallback: T): T {
  try {
    const raw = ls ? ls.getItem(NS + key) : (memory.get(NS + key) ?? null);
    if (raw === null) return fallback;
    const v = JSON.parse(raw) as unknown;
    return (v ?? fallback) as T;
  } catch {
    return fallback;
  }
}

export function write(key: string, value: unknown) {
  const raw = JSON.stringify(value);
  try {
    if (ls) ls.setItem(NS + key, raw);
    else memory.set(NS + key, raw);
  } catch {
    memory.set(NS + key, raw);
  }
}

export function remove(key: string) {
  try {
    ls?.removeItem(NS + key);
  } catch {
    /* ignore */
  }
  memory.delete(NS + key);
}

/** A short stable hash for storage keys (FNV-1a). */
export function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export interface Prefs {
  volume: number;
  muted: boolean;
  rate: number;
  subtitleLang: string | null;
  quality: string;
  captionSize: "s" | "m" | "l" | "xl";
  captionColor: "white" | "yellow" | "cyan" | "green";
  captionBg: "none" | "dim" | "box";
  captionEdge: "shadow" | "outline" | "none";
  autoSkip: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  volume: 1,
  muted: false,
  rate: 1,
  subtitleLang: null,
  quality: "auto",
  captionSize: "m",
  captionColor: "white",
  captionBg: "none",
  captionEdge: "shadow",
  autoSkip: false
};

export function readPrefs(): Prefs {
  const v = read<Partial<Prefs>>("prefs", {});
  const p: Prefs = { ...DEFAULT_PREFS };
  if (typeof v.volume === "number" && v.volume >= 0 && v.volume <= 1) p.volume = v.volume;
  if (typeof v.muted === "boolean") p.muted = v.muted;
  if (typeof v.rate === "number" && v.rate >= 0.25 && v.rate <= 3) p.rate = v.rate;
  if (typeof v.subtitleLang === "string" || v.subtitleLang === null) p.subtitleLang = v.subtitleLang ?? null;
  if (typeof v.quality === "string" && /^[a-z0-9-]{1,16}$/.test(v.quality)) p.quality = v.quality;
  if (v.captionSize && ["s", "m", "l", "xl"].includes(v.captionSize)) p.captionSize = v.captionSize;
  if (v.captionColor && ["white", "yellow", "cyan", "green"].includes(v.captionColor)) p.captionColor = v.captionColor;
  if (v.captionBg && ["none", "dim", "box"].includes(v.captionBg)) p.captionBg = v.captionBg;
  if (v.captionEdge && ["shadow", "outline", "none"].includes(v.captionEdge)) p.captionEdge = v.captionEdge;
  if (typeof v.autoSkip === "boolean") p.autoSkip = v.autoSkip;
  return p;
}

export function savePrefs(patch: Partial<Prefs>) {
  write("prefs", { ...readPrefs(), ...patch });
}

interface ResumeEntry {
  t: number;
  d: number;
  at: number;
}
const RESUME_MAX = 200;

export function readResume(key: string): ResumeEntry | null {
  const all = read<Record<string, ResumeEntry>>("resume", {});
  const e = Object.prototype.hasOwnProperty.call(all, key) ? all[key] : undefined;
  return e && typeof e.t === "number" && typeof e.d === "number" ? e : null;
}

export function saveResume(key: string, t: number, d: number, now = Date.now()) {
  const all = read<Record<string, ResumeEntry>>("resume", {});
  const map: Record<string, ResumeEntry> = Object.create(null);
  for (const [k, v] of Object.entries(all)) if (v && typeof v === "object") map[k] = v;
  map[key] = { t: Math.round(t), d: Math.round(d), at: now };
  const keep = Object.entries(map)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, RESUME_MAX);
  write("resume", Object.fromEntries(keep));
}

export function clearResume(key: string) {
  const all = read<Record<string, ResumeEntry>>("resume", {});
  if (Object.prototype.hasOwnProperty.call(all, key)) {
    delete all[key];
    write("resume", all);
  }
}
