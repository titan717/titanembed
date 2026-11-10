/**
 * Live source health, measured in the viewer's browser and kept in localStorage on the embed origin (no network,
 * no analytics). The registry ranks cleaner and faster sources first from these numbers.
 */
export interface SourceStats {
  /** Plays that reached a first frame. */
  ok: number;
  /** Attempts that errored, stalled or timed out. */
  fail: number;
  /** Recent time-to-first-frame samples in milliseconds (last 10). */
  ttff: number[];
  /** Blocked attempts by the provider to open windows, navigate the page or steal focus. */
  popups: number;
  /** Extra document loads inside the provider iframe (redirects). */
  redirects: number;
  /** Time of the last failure (ms since epoch). */
  lastFail: number;
}

const KEY = "titan.sources.v1";

export interface HealthStore {
  get(id: string): SourceStats;
  update(id: string, fn: (s: SourceStats) => void): void;
  all(): Record<string, SourceStats>;
}

const empty = (): SourceStats => ({ ok: 0, fail: 0, ttff: [], popups: 0, redirects: 0, lastFail: 0 });

function sane(v: unknown): SourceStats {
  const s = empty();
  if (!v || typeof v !== "object") return s;
  const o = v as Record<string, unknown>;
  const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? Math.min(x, 1e9) : 0);
  s.ok = n(o.ok);
  s.fail = n(o.fail);
  s.popups = n(o.popups);
  s.redirects = n(o.redirects);
  s.lastFail = n(o.lastFail);
  s.ttff = Array.isArray(o.ttff) ? o.ttff.map(n).slice(-10) : [];
  return s;
}

/** localStorage-backed store; falls back to memory when storage is blocked (sandboxed or partitioned frames). */
export function createHealthStore(storage: Pick<Storage, "getItem" | "setItem"> | null = safeStorage()): HealthStore {
  let mem: Record<string, SourceStats> = {};
  try {
    const raw = storage?.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      for (const [k, v] of Object.entries(parsed).slice(0, 50)) if (/^[a-z0-9-]{1,32}$/.test(k)) mem[k] = sane(v);
    }
  } catch {
    mem = {};
  }
  const save = () => {
    try {
      storage?.setItem(KEY, JSON.stringify(mem));
    } catch {
      /* quota or blocked */
    }
  };
  return {
    get: (id) => mem[id] ?? empty(),
    update(id, fn) {
      const s = mem[id] ?? empty();
      fn(s);
      s.ttff = s.ttff.slice(-10);
      mem[id] = s;
      save();
    },
    all: () => ({ ...mem })
  };
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/**
 * Score for ranking (lower is better): static rank, then failure rate, first-frame time, popup and redirect
 * attempts, and a penalty for a failure in the last 10 minutes.
 */
export function score(rank: number, s: SourceStats, now = Date.now()): number {
  const tries = s.ok + s.fail;
  const failRate = tries ? s.fail / tries : 0;
  const ttff = median(s.ttff) / 1000;
  const recent = s.lastFail && now - s.lastFail < 10 * 60 * 1000 ? 20 : 0;
  return rank + failRate * 10 + ttff / 5 + s.popups * 5 + s.redirects * 2 + recent;
}
