import type { Cue, CueSpan, ThumbnailCue } from "./types";
import { safeUrl } from "./descriptor";

/**
 * Safe WebVTT / SRT parsing (SECURITY.md T-4). Cue text never becomes HTML: tags other than <i>, <b>, <u> are
 * removed, those three become span flags, and the five common entities are decoded into plain text. Limits
 * keep a hostile file from freezing the page.
 */
export const SUB_LIMITS = { bytes: 2 * 1024 * 1024, cues: 20000, lineChars: 400, linesPerCue: 6 };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0", lrm: "\u200e", rlm: "\u200f" };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,6});/gi, (m, e: string) => {
    if (e[0] === "#") {
      const cp = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return cp > 31 && cp < 0x110000 && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : "";
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });

/** "00:01:02.500", "01:02.5", "00:01:02,500" (SRT) → seconds. */
export function timestamp(s: string): number | null {
  const m = /^(?:(\d{1,3}):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?$/.exec(s.trim());
  if (!m) return null;
  const v = Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number((m[4] ?? "0").padEnd(3, "0")) / 1000;
  return Number.isFinite(v) ? v : null;
}

/** Splits a cue line into styled spans. Only <i>, <b>, <u> (and their closers) carry meaning. */
export function spans(line: string): CueSpan[] {
  const out: CueSpan[] = [];
  const st = { i: 0, b: 0, u: 0 };
  const re = /<\s*(\/?)\s*([a-z0-9.]*)[^>]*>/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  const push = (raw: string) => {
    // a stray "<" without a closing ">" is dropped too, so no fragment can look like markup later
    const text = decode(raw.replace(/[<>]/g, ""));
    if (!text) return;
    const s: CueSpan = { text };
    if (st.i) s.i = true;
    if (st.b) s.b = true;
    if (st.u) s.u = true;
    const prev = out[out.length - 1];
    if (prev && !!prev.i === !!s.i && !!prev.b === !!s.b && !!prev.u === !!s.u) prev.text += text;
    else out.push(s);
  };
  while ((m = re.exec(line))) {
    push(line.slice(last, m.index));
    last = re.lastIndex;
    const tag = (m[2] ?? "").split(".")[0]!.toLowerCase() as "i" | "b" | "u";
    if (tag === "i" || tag === "b" || tag === "u") st[tag] = Math.max(0, st[tag] + (m[1] ? -1 : 1));
  }
  push(line.slice(last));
  // SRT {\an8}-style override blocks are not text
  for (const s of out) s.text = s.text.replace(/\{\\[^}]*\}/g, "");
  return out.filter((s) => s.text.length > 0);
}

/** Parses WebVTT or SRT text into sorted cues. */
export function parseSubtitles(input: string): Cue[] {
  if (typeof input !== "string") return [];
  const text = (input.length > SUB_LIMITS.bytes ? input.slice(0, SUB_LIMITS.bytes) : input).replace(/^\ufeff/, "").replace(/\r\n?/g, "\n");
  const out: Cue[] = [];
  for (const block of text.split(/\n{2,}/)) {
    if (out.length >= SUB_LIMITS.cues) break;
    const lines = block.split("\n");
    const at = lines.findIndex((l) => l.includes("-->"));
    if (at < 0) continue;
    const head = lines[0]!.trim();
    if (/^(NOTE|STYLE|REGION)\b/.test(head) && at !== 0) continue;
    const [a = "", b = ""] = lines[at]!.split("-->");
    const start = timestamp(a);
    const end = timestamp(b.trim().split(/\s+/)[0] ?? "");
    if (start === null || end === null || end <= start) continue;
    const body = lines
      .slice(at + 1, at + 1 + SUB_LIMITS.linesPerCue)
      .map((l) => spans(l.slice(0, SUB_LIMITS.lineChars)))
      .filter((l) => l.length > 0);
    if (body.length) out.push({ start, end, lines: body });
  }
  return out.sort((x, y) => x.start - y.start || x.end - y.end);
}

/** Cues active at `t` (binary search for the first cue that could be active, then a short scan). */
export function activeCues(cues: Cue[], t: number): Cue[] {
  let lo = 0;
  let hi = cues.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid]!.start <= t) lo = mid + 1;
    else hi = mid;
  }
  const out: Cue[] = [];
  for (let i = lo - 1; i >= 0 && out.length < 4; i--) {
    const c = cues[i]!;
    if (c.end > t) out.unshift(c);
    if (t - c.start > 600) break;
  }
  return out;
}

/** WebVTT thumbnails track: each cue text is an image URL, optionally with #xywh=x,y,w,h. */
export function parseThumbnails(input: string, baseUrl: string): ThumbnailCue[] {
  const out: ThumbnailCue[] = [];
  const text = input.slice(0, SUB_LIMITS.bytes).replace(/\r\n?/g, "\n");
  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split("\n");
    const at = lines.findIndex((l) => l.includes("-->"));
    if (at < 0 || !lines[at + 1]) continue;
    const [a = "", b = ""] = lines[at]!.split("-->");
    const start = timestamp(a);
    const end = timestamp(b.trim().split(/\s+/)[0] ?? "");
    if (start === null || end === null) continue;
    const ref = lines[at + 1]!.trim();
    const [path = "", frag] = ref.split("#");
    let abs: string | undefined;
    try {
      abs = safeUrl(new URL(path, baseUrl).href);
    } catch {
      abs = undefined;
    }
    if (!abs) continue;
    const cue: ThumbnailCue = { start, end, url: abs };
    const xm = frag && /^xywh=(\d+),(\d+),(\d+),(\d+)$/.exec(frag);
    if (xm) cue.xywh = [Number(xm[1]), Number(xm[2]), Number(xm[3]), Number(xm[4])];
    out.push(cue);
    if (out.length > 5000) break;
  }
  return out;
}

/** Plain text of a cue (for screen readers and tests). */
export const cueText = (c: Cue) => c.lines.map((l) => l.map((s) => s.text).join("")).join("\n");
