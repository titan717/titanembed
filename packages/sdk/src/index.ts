import { NS, PROTOCOL_VERSION, type CommandName, type EventName } from "../../core/src/protocol";
import type {
  AudioTrack,
  Marker,
  MediaDescriptor,
  PlayerClass,
  PlayerError,
  PlayerState,
  Quality,
  TextTrack,
  ThemeInput
} from "../../core/src/types";

export type { AudioTrack, Marker, MediaDescriptor, PlayerClass, PlayerError, PlayerState, Quality, TextTrack, ThemeInput, EventName, CommandName };

declare const __TITAN_VERSION__: string;
export const VERSION: string = typeof __TITAN_VERSION__ === "string" ? __TITAN_VERSION__ : "0.0.0";

/** The hosted embed page. Self-hosters pass `embedUrl`. */
export const DEFAULT_EMBED_URL = "https://titanembed.vercel.app/embed/";

export interface PlayerOptions {
  /** Media to play. Can also be loaded later with `player.load()`. */
  media?: MediaDescriptor;
  /** Force a player: "tv" (10-foot, D-pad) or "mobile" (touch). Default: auto-detect inside the frame. */
  player?: PlayerClass | "auto";
  /** Start playing as soon as possible (muted when the browser requires it). Default true. */
  autoplay?: boolean;
  /** Theme: accent colour, logo, corner radius, font, controls opacity. */
  theme?: ThemeInput;
  /** UI language (BCP 47). Default: the browser language. */
  lang?: string;
  /** Resume behaviour for saved progress. Default "prompt". */
  resume?: "prompt" | "auto" | "off";
  /** Show a back button on the mobile player (emits "exit"). */
  back?: boolean;
  /** URL of the embed page. Default: the hosted Titan Embed page. */
  embedUrl?: string;
  /** Keep a small floating player when the frame scrolls out of view (mobile pages). Default false. */
  stickyMini?: boolean;
  /** Accessible name of the iframe. Default "Video player". */
  title?: string;
  /** Command timeout in milliseconds. Default 8000. */
  timeout?: number;
}

export interface EventMap {
  ready: { duration: number; version: string; playerClass: PlayerClass; protocol: number };
  loadedmetadata: { duration: number };
  play: undefined;
  pause: undefined;
  seeking: { time: number };
  seeked: { time: number };
  timeupdate: { time: number; duration: number };
  progress: { buffered: number };
  volumechange: { volume: number; muted: boolean };
  ratechange: { rate: number };
  qualitychange: { id: string; auto: boolean; height?: number };
  tracks: { audio: AudioTrack[]; subtitles: TextTrack[] };
  markers: { markers: Marker[] };
  skip: { type: Marker["type"]; from: number; to: number; auto: boolean };
  nextepisode: { id?: string; title: string; auto: boolean };
  episode: { id?: string; title: string };
  ended: undefined;
  enterpip: undefined;
  leavepip: undefined;
  fullscreenchange: { fullscreen: boolean };
  error: PlayerError;
  playerclass: { playerClass: PlayerClass; forced: boolean };
  statechange: { state: PlayerState; from: PlayerState };
  exit: { time: number };
  report: { kind: string; time: number; state: PlayerState; source: string | null };
}

type Handler<E extends EventName> = (data: E extends keyof EventMap ? EventMap[E] : unknown) => void;

export interface TitanPlayer {
  readonly iframe: HTMLIFrameElement;
  readonly ready: Promise<EventMap["ready"]>;
  load(media: MediaDescriptor, opts?: { autoplay?: boolean }): Promise<{ warnings: string[] }>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(seconds: number): Promise<void>;
  setVolume(volume: number): Promise<void>;
  setMuted(muted: boolean): Promise<void>;
  setRate(rate: number): Promise<void>;
  setAudioTrack(id: string): Promise<void>;
  setSubtitleTrack(id: string | null): Promise<void>;
  setQuality(id: string): Promise<void>;
  setTheme(theme: ThemeInput): Promise<{ warnings: string[] }>;
  setMarkers(markers: Marker[]): Promise<{ markers: Marker[] }>;
  enterFullscreen(): Promise<void>;
  exitFullscreen(): Promise<void>;
  enterPip(): Promise<boolean>;
  next(): Promise<void>;
  previous(): Promise<void>;
  getState(): Promise<{ state: PlayerState; playerClass: PlayerClass; version: string }>;
  getTime(): Promise<number>;
  getDuration(): Promise<number>;
  getTracks(): Promise<{ audio: AudioTrack[]; subtitles: TextTrack[]; activeAudio: string | null; activeSubtitle: string | null }>;
  getQualities(): Promise<{ qualities: Quality[]; active: string }>;
  on<E extends EventName>(event: E | "*", handler: Handler<E>): () => void;
  off<E extends EventName>(event: E | "*", handler: Handler<E>): void;
  destroy(): void;
}

let seq = 0;

/** Builds the embed URL for a plain iframe (no SDK needed). */
export function embedSrc(opts: PlayerOptions & { origins?: string[] } = {}): string {
  const u = new URL(opts.embedUrl ?? DEFAULT_EMBED_URL, typeof location !== "undefined" ? location.href : undefined);
  if (opts.media) u.searchParams.set("m", encode(opts.media));
  if (opts.player && opts.player !== "auto") u.searchParams.set("player", opts.player);
  if (opts.autoplay === false) u.searchParams.set("autoplay", "0");
  if (opts.lang) u.searchParams.set("lang", opts.lang);
  if (opts.resume) u.searchParams.set("resume", opts.resume);
  if (opts.back) u.searchParams.set("back", "1");
  if (opts.origins?.length) u.searchParams.set("origins", opts.origins.join(","));
  const th = opts.theme;
  if (th?.accent) u.searchParams.set("accent", th.accent);
  if (th?.logo) u.searchParams.set("logo", th.logo);
  if (th?.radius !== undefined) u.searchParams.set("radius", String(th.radius));
  if (th?.font) u.searchParams.set("font", th.font);
  if (th?.controlsOpacity !== undefined) u.searchParams.set("controlsOpacity", String(th.controlsOpacity));
  return u.toString();
}

function encode(d: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(d));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Creates a Titan Embed player inside `container`. The player runs in a sandboxed iframe; this object talks to it
 * over the versioned postMessage protocol and only accepts messages from that iframe's window and origin.
 */
export function createPlayer(container: HTMLElement | string, options: PlayerOptions = {}): TitanPlayer {
  const host = typeof container === "string" ? document.querySelector<HTMLElement>(container) : container;
  if (!host) throw new Error(`titan-embed: container ${String(container)} not found`);
  const src = embedSrc({ ...options, origins: [location.origin] });
  const embedOrigin = new URL(src).origin;
  const timeout = options.timeout ?? 8000;

  const frame = document.createElement("iframe");
  frame.src = src;
  frame.title = options.title ?? "Video player";
  frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
  frame.allow = "autoplay; fullscreen; picture-in-picture; encrypted-media; screen-wake-lock";
  frame.setAttribute("allowfullscreen", "");
  frame.referrerPolicy = "strict-origin-when-cross-origin";
  frame.style.border = "0";
  frame.style.width = "100%";
  frame.style.height = "100%";
  frame.style.display = "block";
  frame.style.background = "#000";

  const wrap = document.createElement("div");
  wrap.className = "titan-embed";
  wrap.style.position = "relative";
  wrap.style.width = "100%";
  wrap.style.height = "100%";
  wrap.appendChild(frame);
  host.appendChild(wrap);

  const handlers = new Map<string, Set<(d: unknown) => void>>();
  const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  let destroyed = false;
  let resolveReady!: (v: EventMap["ready"]) => void;
  const ready = new Promise<EventMap["ready"]>((r) => (resolveReady = r));
  let loaded = false;
  const queue: (() => void)[] = [];

  const fire = (event: string, data: unknown) => {
    for (const key of [event, "*"]) {
      const set = handlers.get(key);
      if (!set) continue;
      for (const fn of [...set]) {
        try {
          fn(key === "*" ? { event, data } : data);
        } catch (err) {
          setTimeout(() => {
            throw err;
          });
        }
      }
    }
  };

  const onMessage = (e: MessageEvent) => {
    if (e.source !== frame.contentWindow || e.origin !== embedOrigin) return;
    const m = e.data as { ns?: unknown; v?: unknown; type?: unknown; event?: unknown; data?: unknown; id?: unknown; ok?: unknown; error?: unknown };
    if (!m || typeof m !== "object" || m.ns !== NS || m.v !== PROTOCOL_VERSION) return;
    if (m.type === "event" && typeof m.event === "string") {
      if (m.event === "ready") resolveReady(m.data as EventMap["ready"]);
      fire(m.event, m.data);
    } else if (m.type === "response" && typeof m.id === "string") {
      const p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      clearTimeout(p.timer);
      if (m.ok) p.resolve(m.data);
      else p.reject(new Error(typeof m.error === "string" ? m.error : "command failed"));
    }
  };
  window.addEventListener("message", onMessage);
  frame.addEventListener("load", () => {
    loaded = true;
    for (const fn of queue.splice(0)) fn();
  });

  function send<T>(cmd: CommandName, args?: unknown): Promise<T> {
    if (destroyed) return Promise.reject(new Error("titan-embed: player destroyed"));
    return new Promise<T>((resolve, reject) => {
      const go = () => {
        const id = `t${++seq}`;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`titan-embed: ${cmd} timed out`));
        }, timeout);
        pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
        frame.contentWindow?.postMessage({ ns: NS, v: PROTOCOL_VERSION, type: "command", id, cmd, args }, embedOrigin);
      };
      if (loaded) go();
      else queue.push(go);
    });
  }

  // optional sticky mini player
  let io: IntersectionObserver | null = null;
  if (options.stickyMini && typeof IntersectionObserver !== "undefined") {
    let playing = false;
    handlersAdd("play", () => (playing = true));
    handlersAdd("pause", () => (playing = false));
    handlersAdd("ended", () => (playing = false));
    io = new IntersectionObserver(
      ([entry]) => {
        const mini = !!entry && !entry.isIntersecting && playing;
        wrap.classList.toggle("titan-embed--mini", mini);
        if (mini) {
          wrap.style.height = `${wrap.offsetHeight}px`;
          Object.assign(frame.style, { position: "fixed", right: "12px", bottom: "12px", width: "min(60vw, 320px)", height: "auto", aspectRatio: "16 / 9", zIndex: "2147483000", borderRadius: "8px", boxShadow: "0 8px 24px rgba(0,0,0,.4)" });
        } else {
          wrap.style.height = "100%";
          Object.assign(frame.style, { position: "", right: "", bottom: "", width: "100%", height: "100%", aspectRatio: "", zIndex: "", borderRadius: "", boxShadow: "" });
        }
      },
      { threshold: 0.25 }
    );
    io.observe(wrap);
  }

  function handlersAdd(event: string, fn: (d: unknown) => void) {
    let set = handlers.get(event);
    if (!set) handlers.set(event, (set = new Set()));
    set.add(fn);
  }

  const player: TitanPlayer = {
    iframe: frame,
    ready,
    load: (media, opts) => send("load", { media, autoplay: opts?.autoplay }),
    play: () => send("play"),
    pause: () => send("pause"),
    seek: (s) => send("seek", s),
    setVolume: (v) => send("setVolume", v),
    setMuted: (m) => send("setMuted", m),
    setRate: (r) => send("setRate", r),
    setAudioTrack: (id) => send("setAudioTrack", id),
    setSubtitleTrack: (id) => send("setSubtitleTrack", id),
    setQuality: (id) => send("setQuality", id),
    setTheme: (t) => send("setTheme", t),
    setMarkers: (markers) => send("setMarkers", { markers }),
    enterFullscreen: () => send("enterFullscreen"),
    exitFullscreen: () => send("exitFullscreen"),
    enterPip: () => send("enterPip"),
    next: () => send("next"),
    previous: () => send("previous"),
    getState: () => send("getState"),
    getTime: () => send("getTime"),
    getDuration: () => send("getDuration"),
    getTracks: () => send("getTracks"),
    getQualities: () => send("getQualities"),
    on(event, handler) {
      handlersAdd(event, handler as (d: unknown) => void);
      return () => player.off(event, handler);
    },
    off(event, handler) {
      handlers.get(event)?.delete(handler as (d: unknown) => void);
    },
    destroy() {
      if (destroyed) return;
      try {
        frame.contentWindow?.postMessage({ ns: NS, v: PROTOCOL_VERSION, type: "command", id: `t${++seq}`, cmd: "destroy" }, embedOrigin);
      } catch {
        /* ignore */
      }
      destroyed = true;
      window.removeEventListener("message", onMessage);
      io?.disconnect();
      for (const p of pending.values()) {
        clearTimeout(p.timer);
        p.reject(new Error("titan-embed: player destroyed"));
      }
      pending.clear();
      handlers.clear();
      wrap.remove();
    }
  };
  return player;
}
