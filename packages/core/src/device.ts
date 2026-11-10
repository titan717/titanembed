import type { PlayerClass } from "./types";

/**
 * Device-class detection (DECISIONS D-7). Order:
 * 1. explicit override (`player=tv|mobile`),
 * 2. TV user agents (Android TV, Google TV, Fire TV, Tizen, webOS, …) → tv,
 * 3. touch-only devices (coarse pointer, no fine pointer, no hover) → mobile,
 * 4. desktop: a frame of at least 960×540 in landscape → tv (keyboard + mouse variant), smaller → mobile.
 */
export const TV_UA =
  /(SmartTV|SMART-TV|Android TV|AndroidTV|Leanback|GoogleTV|Google TV|CrKey|AFT[A-Z0-9]{1,6}\b|Fire TV|BRAVIA|Web0S|webOS|NetCast|Tizen|HbbTV|Roku|Viera|AQUOSBrowser|PhilipsTV|Hisense|VIDAA|TV Safari|DTV|Opera TV|SonyDTV|Xbox|PlayStation)/i;

export interface DeviceHints {
  ua: string;
  width: number;
  height: number;
  coarse: boolean;
  fine: boolean;
  hover: boolean;
  touchPoints: number;
}

export function readHints(): DeviceHints {
  const mm = (q: string) => (typeof matchMedia === "function" ? matchMedia(q).matches : false);
  return {
    ua: typeof navigator !== "undefined" ? navigator.userAgent : "",
    width: typeof innerWidth === "number" ? innerWidth : 1280,
    height: typeof innerHeight === "number" ? innerHeight : 720,
    coarse: mm("(pointer: coarse)"),
    fine: mm("(any-pointer: fine)"),
    hover: mm("(any-hover: hover)"),
    touchPoints: typeof navigator !== "undefined" ? (navigator.maxTouchPoints ?? 0) : 0
  };
}

export type DeviceKind = "tv" | "phone" | "tablet" | "desktop";

export function deviceKind(h: DeviceHints): DeviceKind {
  if (TV_UA.test(h.ua)) return "tv";
  const mobileUa = /Android|iPhone|iPod|iPad|Mobile|Silk/i.test(h.ua) || (/Macintosh/.test(h.ua) && h.touchPoints > 1);
  const touchOnly = (h.coarse && !h.fine) || (mobileUa && h.touchPoints > 0 && !h.fine);
  if (touchOnly || mobileUa) {
    const short = Math.min(h.width, h.height);
    return short >= 600 ? "tablet" : "phone";
  }
  return "desktop";
}

export function detectPlayerClass(override: string | null | undefined, h: DeviceHints = readHints()): PlayerClass {
  if (override === "tv" || override === "mobile") return override;
  const kind = deviceKind(h);
  if (kind === "tv") return "tv";
  if (kind === "phone" || kind === "tablet") return "mobile";
  return h.width >= 960 && h.height >= 540 && h.width >= h.height ? "tv" : "mobile";
}
