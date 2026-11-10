/**
 * Remote and keyboard key normalisation for Android TV / Google TV, Fire TV, Samsung Tizen, LG webOS and desktop
 * keyboards. Media keys are separate from navigation keys because they act immediately even while controls are hidden.
 */
export type Key =
  | "left"
  | "right"
  | "up"
  | "down"
  | "enter"
  | "back"
  | "play"
  | "pause"
  | "playpause"
  | "stop"
  | "next"
  | "prev"
  | "ff"
  | "rw"
  | "captions"
  | "info"
  | "mute"
  | "volup"
  | "voldown"
  | "fullscreen"
  | "space"
  | null;

const BY_KEY: Record<string, Exclude<Key, null>> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
  Left: "left",
  Right: "right",
  Up: "up",
  Down: "down",
  Enter: "enter",
  Accept: "enter",
  Select: "enter",
  Escape: "back",
  Esc: "back",
  GoBack: "back",
  BrowserBack: "back",
  XF86Back: "back",
  MediaPlayPause: "playpause",
  MediaPlay: "play",
  MediaPause: "pause",
  MediaStop: "stop",
  MediaTrackNext: "next",
  MediaNextTrack: "next",
  MediaTrackPrevious: "prev",
  MediaPreviousTrack: "prev",
  MediaFastForward: "ff",
  FastFwd: "ff",
  MediaRewind: "rw",
  Subtitle: "captions",
  ClosedCaptionToggle: "captions",
  Info: "info",
  AudioVolumeMute: "mute",
  VolumeMute: "mute",
  " ": "space"
};

const BY_CODE: Record<number, Exclude<Key, null>> = {
  37: "left",
  38: "up",
  39: "right",
  40: "down",
  13: "enter",
  23: "enter", // Android DPAD_CENTER reported as keyCode on some WebViews
  27: "back",
  461: "back", // LG webOS Back
  10009: "back", // Samsung Tizen Return
  166: "back", // BrowserBack
  4: "back", // Android KEYCODE_BACK on some WebViews
  415: "play", // webOS / Tizen / HbbTV Play
  19: "pause", // webOS Pause
  10252: "playpause", // Tizen MediaPlayPause
  179: "playpause",
  413: "stop",
  417: "ff",
  412: "rw",
  176: "next",
  177: "prev",
  425: "next",
  424: "prev",
  460: "captions", // webOS subtitle
  10221: "captions", // Tizen caption
  457: "info",
  173: "mute",
  32: "space"
};

const DESKTOP: Record<string, Exclude<Key, null>> = { k: "playpause", m: "mute", f: "fullscreen", c: "captions", j: "rw", l: "ff" };

export function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}

export function normalizeKey(e: Pick<KeyboardEvent, "key" | "keyCode" | "target" | "ctrlKey" | "metaKey" | "altKey">): Key {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (isTyping(e.target)) return e.key === "Escape" ? "back" : null;
  if (e.key === "Backspace") return "back";
  const byKey = BY_KEY[e.key];
  if (byKey) return byKey;
  const lower = typeof e.key === "string" && e.key.length === 1 ? e.key.toLowerCase() : "";
  if (DESKTOP[lower]) return DESKTOP[lower]!;
  return BY_CODE[e.keyCode] ?? null;
}

export const MEDIA_KEYS: ReadonlySet<Key> = new Set<Key>(["play", "pause", "playpause", "stop", "next", "prev", "ff", "rw", "mute", "captions"]);
export const isMediaKey = (k: Key) => MEDIA_KEYS.has(k);

/** Accumulating seek step while a direction is held or pressed in a burst: 10 → 20 → 30 → 60 s. */
export function seekStep(repeats: number): number {
  return repeats < 4 ? 10 : repeats < 10 ? 20 : repeats < 18 ? 30 : 60;
}
