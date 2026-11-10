import type { ProviderDriver, ProviderEvent, SourceAdapter } from "./types";

export interface ProviderHooks {
  /** First frame reached (ms since load). */
  firstFrame?(ms: number): void;
  /** The provider document loaded again after the first load (a redirect inside the iframe). */
  redirect?(): void;
  /** The provider tried to take focus, open a window or navigate; it was blocked. */
  blocked?(kind: "focus" | "navigation"): void;
  /** Put focus back on Titan's overlay. */
  refocus?(): void;
}

const MEDIA_ERR_SRC_NOT_SUPPORTED = 4;

/** `TimeRanges` stand-in: one range from 0 to the reported position. */
class Ranges {
  constructor(private readonly end_: () => number) {}
  get length() {
    return this.end_() > 0 ? 1 : 0;
  }
  start(): number {
    return 0;
  }
  end(): number {
    return this.end_();
  }
}

/**
 * A provider iframe that looks like an `HTMLVideoElement` to Titan's engine, so the same state machine, resume,
 * markers, captions and both player UIs drive a provider that supports commands and events.
 *
 * Isolation: the iframe sits full-bleed under Titan's overlay with `inert`, `tabindex=-1`, `aria-hidden` and
 * `pointer-events: none`; it never receives a click, tap, key or focus, so it never gets a user activation and
 * cannot open popups or navigate the page. Messages are accepted only from the iframe's own window and an origin
 * the adapter lists, and commands are posted to that exact origin, never `*`.
 */
/** How long a provider may stay frozen after the buffering signal before the source is failed over. */
const STALL_FAIL_MS = 8000;

export class ProviderMedia extends EventTarget {
  readonly el: HTMLDivElement;
  readonly isProvider = true;
  /** Capabilities the engine and UIs read (`canSetRate`, picture-in-picture). */
  readonly titanCaps: { rate: boolean; pip: boolean };

  // HTMLMediaElement surface used by the engine
  playsInline = true;
  preload = "auto";
  crossOrigin: string | null = null;
  readyState = 0;
  paused = true;
  ended = false;
  error: { code: number; message: string } | null = null;
  videoWidth = 1920;
  videoHeight = 1080;
  readonly textTracks = { length: 0 } as unknown as TextTrackList;
  readonly buffered = new Ranges(() => this.pos) as unknown as TimeRanges;
  currentSrc = "";

  private srcUrl = "";
  private frame: HTMLIFrameElement | null = null;
  private driver: ProviderDriver | null = null;
  private origin = "";
  private pos = 0;
  private dur = NaN;
  private vol = 1;
  private mute = false;
  private rate = 1;
  private ready = false;
  private loads = 0;
  private loadAt = 0;
  private gotFrame = false;
  private wantPlay = false;
  private seekTimer: ReturnType<typeof setTimeout> | null = null;
  private seeking = false;
  private watchdog: ReturnType<typeof setTimeout> | null = null;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private lastTimeAt = 0;
  private playWaiters: ((ok: boolean) => void)[] = [];
  private readonly onMessage = (e: MessageEvent) => this.message(e);
  private readonly onBlur = () => this.checkFocus();

  constructor(
    readonly adapter: SourceAdapter,
    private readonly hooks: ProviderHooks = {}
  ) {
    super();
    this.titanCaps = { rate: adapter.capabilities.includes("rate"), pip: false };
    this.el = document.createElement("div");
    this.el.className = "t-provider";
    this.el.setAttribute("aria-hidden", "true");
  }

  /* ---------- properties ---------- */

  get src() {
    return this.srcUrl;
  }
  set src(url: string) {
    this.srcUrl = url;
  }
  get currentTime() {
    return this.pos;
  }
  set currentTime(t: number) {
    if (!Number.isFinite(t) || t < 0) return;
    this.pos = t;
    if (!this.ready) return; // applied when the provider reports ready (start positions)
    this.seeking = true;
    this.fire("seeking");
    this.driver?.seek(t);
    if (this.seekTimer) clearTimeout(this.seekTimer);
    this.seekTimer = setTimeout(() => this.finishSeek(), 1500);
  }
  get duration() {
    return this.dur;
  }
  get volume() {
    return this.vol;
  }
  set volume(v: number) {
    const nv = Math.min(1, Math.max(0, v));
    if (nv === this.vol) return;
    this.vol = nv;
    if (this.ready) this.driver?.setVolume(nv);
    this.fire("volumechange");
  }
  get muted() {
    return this.mute;
  }
  set muted(m: boolean) {
    if (m === this.mute) return;
    this.mute = m;
    if (this.ready) this.driver?.setMuted(m);
    this.fire("volumechange");
  }
  get playbackRate() {
    return this.rate;
  }
  set playbackRate(r: number) {
    if (!this.titanCaps.rate || !this.driver?.setRate || r === this.rate) return;
    this.rate = r;
    if (this.ready) this.driver.setRate(r);
    this.fire("ratechange");
  }
  get disablePictureInPicture() {
    return true;
  }
  set disablePictureInPicture(_v: boolean) {
    /* providers can't enter picture-in-picture from the outside */
  }

  /* ---------- element API used by the engine ---------- */

  setAttribute(): void {}
  removeAttribute(name: string): void {
    if (name === "src") this.srcUrl = "";
  }
  canPlayType(): CanPlayTypeResult {
    return "maybe";
  }

  load(): void {
    this.unmount();
    if (!this.srcUrl) return;
    let url: URL;
    try {
      url = new URL(this.srcUrl);
    } catch {
      return this.failLoad("The source address is not valid.");
    }
    if (!this.adapter.origins?.includes(url.origin)) return this.failLoad("The source address is not on the provider's origin.");
    this.origin = url.origin;
    this.currentSrc = url.toString();
    const sb = this.adapter.sandbox!;
    const f = document.createElement("iframe");
    f.className = "t-provider-frame";
    if (sb.sandbox !== null) f.setAttribute("sandbox", sb.sandbox);
    f.allow = sb.allow;
    f.referrerPolicy = sb.referrerPolicy;
    f.setAttribute("allowfullscreen", "");
    f.setAttribute("inert", "");
    f.setAttribute("aria-hidden", "true");
    f.tabIndex = -1;
    f.title = this.adapter.name;
    f.addEventListener("load", () => {
      this.loads++;
      if (this.loads > 1) this.hooks.redirect?.();
      this.hooks.refocus?.();
    });
    this.frame = f;
    this.driver = this.adapter.driver?.((m) => this.post(m)) ?? null;
    this.readyState = 0;
    this.ready = false;
    this.gotFrame = false;
    this.loads = 0;
    this.loadAt = performance.now();
    this.ended = false;
    this.error = null;
    window.addEventListener("message", this.onMessage);
    window.addEventListener("blur", this.onBlur);
    f.src = url.toString();
    this.el.appendChild(f);
    this.fire("loadstart");
    const secs = this.adapter.timeout ?? 25;
    this.timeout = setTimeout(() => {
      if (!this.gotFrame) this.failLoad(`${this.adapter.name} didn't start within ${secs} seconds.`);
    }, secs * 1000);
  }

  play(): Promise<void> {
    this.wantPlay = true;
    if (this.ended) {
      this.ended = false;
      this.currentTime = 0;
    }
    if (this.ready) this.driver?.play();
    if (!this.paused) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      let done = false;
      const t = setTimeout(
        () => {
          if (done) return;
          done = true;
          this.playWaiters = this.playWaiters.filter((w) => w !== waiter);
          // no play event: the provider was probably blocked by the autoplay policy; the engine retries muted
          if (!this.mute && this.ready) reject(new DOMException("The provider didn't start playback.", "NotAllowedError"));
          else resolve();
        },
        this.ready ? 3000 : (this.adapter.timeout ?? 25) * 1000
      );
      const waiter = (ok: boolean) => {
        if (done) return;
        done = true;
        clearTimeout(t);
        if (ok) resolve();
        else reject(new DOMException("Playback was aborted.", "AbortError"));
      };
      this.playWaiters.push(waiter);
    });
  }

  pause(): void {
    this.wantPlay = false;
    if (this.ready) this.driver?.pause();
  }

  /* ---------- provider → engine ---------- */

  private post(message: unknown) {
    try {
      this.frame?.contentWindow?.postMessage(message, this.origin);
    } catch {
      /* the provider navigated to another origin; the message is dropped */
    }
  }

  private message(e: MessageEvent) {
    if (!this.frame || e.source !== this.frame.contentWindow) return;
    if (!this.adapter.origins?.includes(e.origin) || e.origin !== this.origin) return;
    const events = this.driver?.receive(e.data);
    if (!events) return;
    for (const ev of events) this.apply(ev);
  }

  private apply(ev: ProviderEvent) {
    switch (ev.type) {
      case "ready":
        this.markReady();
        break;
      case "duration":
        this.markReady();
        if (ev.duration !== this.dur) {
          this.dur = ev.duration;
          this.fire("durationchange");
        }
        break;
      case "play":
        this.markReady();
        if (this.paused) {
          this.paused = false;
          this.fire("play");
        }
        this.resolvePlay(true);
        this.armWatchdog();
        break;
      case "playing":
        if (!this.paused) this.fire("playing");
        this.armWatchdog();
        break;
      case "pause":
        if (!this.paused) {
          this.paused = true;
          this.fire("pause");
        }
        this.clearWatchdog();
        break;
      case "waiting":
        this.fire("waiting");
        break;
      case "time": {
        this.markReady();
        const wasSeeking = this.seeking;
        const moved = Math.abs(ev.time - this.pos) > 0.05 && !wasSeeking;
        this.pos = ev.time;
        this.lastTimeAt = performance.now();
        if (!this.gotFrame && ev.time > 0) this.firstFrame();
        if (this.paused && moved && !this.ended) {
          // time moving without a play event: the provider started by itself (autoplay)
          this.paused = false;
          this.fire("play");
          this.fire("playing");
          this.resolvePlay(true);
        }
        if (wasSeeking) this.finishSeek();
        this.fire("timeupdate");
        this.armWatchdog();
        break;
      }
      case "seeked":
        this.pos = ev.time;
        this.finishSeek();
        break;
      case "volume":
        if (ev.volume !== undefined) this.vol = ev.volume;
        if (ev.muted !== undefined) this.mute = ev.muted;
        this.fire("volumechange");
        break;
      case "ended":
        this.ended = true;
        this.paused = true;
        this.clearWatchdog();
        this.fire("ended");
        break;
      case "error":
        if (!this.gotFrame) this.failLoad(ev.message);
        else {
          this.error = { code: 2, message: ev.message };
          this.fire("error");
        }
        break;
    }
  }

  private markReady() {
    if (this.ready) return;
    this.ready = true;
    this.readyState = 1;
    this.fire("loadedmetadata");
    // apply what the engine set before the provider was listening
    if (this.mute) this.driver?.setMuted(true);
    if (this.vol !== 1) this.driver?.setVolume(this.vol);
    if (this.rate !== 1) this.driver?.setRate?.(this.rate);
    if (this.pos > 0) {
      this.seeking = true;
      this.driver?.seek(this.pos);
      this.seekTimer = setTimeout(() => this.finishSeek(), 1500);
    }
    this.readyState = 3;
    this.fire("canplay");
    if (this.wantPlay) this.driver?.play();
  }

  private firstFrame() {
    this.gotFrame = true;
    this.readyState = 4;
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = null;
    this.hooks.firstFrame?.(performance.now() - this.loadAt);
  }

  private finishSeek() {
    if (this.seekTimer) clearTimeout(this.seekTimer);
    this.seekTimer = null;
    if (!this.seeking) return;
    this.seeking = false;
    this.fire("seeked");
  }

  private resolvePlay(ok: boolean) {
    for (const w of this.playWaiters.splice(0)) w(ok);
  }

  /** Playing but the provider stopped reporting time: report buffering so the engine's stall recovery runs. */
  private armWatchdog() {
    this.clearWatchdog();
    this.watchdog = setTimeout(() => {
      if (this.paused || this.ended || performance.now() - this.lastTimeAt <= 6000) return;
      this.fire("waiting");
      // still frozen after the grace period: a provider can't be nudged like a decoder, so fail over to the next
      // source (the embed keeps the position, docs/SOURCES.md)
      this.watchdog = setTimeout(() => {
        if (this.paused || this.ended || performance.now() - this.lastTimeAt <= 6000) return;
        this.error = { code: 2, message: `${this.adapter.name} stopped playing.` };
        this.fire("error");
      }, STALL_FAIL_MS);
    }, 6500);
  }
  private clearWatchdog() {
    if (this.watchdog) clearTimeout(this.watchdog);
    this.watchdog = null;
  }

  private checkFocus() {
    // a blur of our window while the provider is inert means it tried to take focus; take it back
    setTimeout(() => {
      if (this.frame && document.activeElement === this.frame) {
        this.hooks.blocked?.("focus");
        this.frame.blur();
        this.hooks.refocus?.();
      }
    }, 0);
  }

  private failLoad(message: string) {
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = null;
    this.error = { code: MEDIA_ERR_SRC_NOT_SUPPORTED, message };
    this.resolvePlay(false);
    this.fire("error");
  }

  private fire(type: string) {
    this.dispatchEvent(new Event(type));
  }

  private unmount() {
    window.removeEventListener("message", this.onMessage);
    window.removeEventListener("blur", this.onBlur);
    if (this.timeout) clearTimeout(this.timeout);
    if (this.seekTimer) clearTimeout(this.seekTimer);
    this.clearWatchdog();
    this.timeout = this.seekTimer = null;
    this.resolvePlay(false);
    if (this.frame) {
      this.frame.src = "about:blank";
      this.frame.remove();
    }
    this.frame = null;
    this.driver = null;
    this.ready = false;
    this.paused = true;
    this.readyState = 0;
  }

  /** Removes the iframe and every listener. */
  destroy() {
    this.srcUrl = "";
    this.unmount();
    this.el.remove();
  }
}

/** A themed provider (no commands): its own controls, Titan's tokens passed where it accepts them, strict sandbox. */
export function themedFrame(adapter: SourceAdapter, url: string, hooks: ProviderHooks = {}): HTMLIFrameElement {
  const u = new URL(url);
  if (!adapter.origins?.includes(u.origin)) throw new Error("The source address is not on the provider's origin.");
  const sb = adapter.sandbox!;
  if (sb.sandbox === null) throw new Error("A themed provider must run sandboxed.");
  const f = document.createElement("iframe");
  f.className = "t-provider-frame is-themed";
  f.setAttribute("sandbox", sb.sandbox);
  f.allow = sb.allow;
  f.referrerPolicy = sb.referrerPolicy;
  f.setAttribute("allowfullscreen", "");
  f.title = adapter.name;
  let loads = 0;
  f.addEventListener("load", () => {
    if (++loads > 1) hooks.redirect?.();
    hooks.refocus?.();
  });
  f.src = u.toString();
  return f;
}
