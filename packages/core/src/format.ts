/** 83 → "1:23", 3723 → "1:02:03". Negative or invalid input gives "0:00". */
export function clock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec % 60);
  const m = Math.floor((sec / 60) % 60);
  const h = Math.floor(sec / 3600);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** The TV PLAYER blueprint shows remaining time as HH:MM:SS (p7 "01:44:40", p19 "01:44:02"). */
export function hms(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec % 60);
  const m = Math.floor((sec / 60) % 60);
  const h = Math.floor(sec / 3600);
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

/** Signed delta for seek bubbles: +30 → "+0:30", -90 → "−1:30". */
export function delta(sec: number): string {
  const sign = sec < 0 ? "\u2212" : "+";
  return sign + clock(Math.abs(sec));
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
