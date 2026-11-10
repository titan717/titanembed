import { Emitter } from "./emitter";
import { StateMachine } from "./state";
import { activeCues, parseSubtitles, parseThumbnails } from "./subtitles";
import { hash, readPrefs, readResume, saveResume, clearResume, savePrefs, type Prefs } from "./storage";
import { clamp } from "./format";
import type {
  AudioTrack,
  Cue,
  EpisodeInput,
  Marker,
  MediaDescriptor,
  MediaSource,
  PlayerError,
  PlayerState,
  Quality,
  TextTrack,
  ThumbnailCue
} from "./types";
import type Hls from "hls.js";
import type { ErrorData, Level, MediaPlaylist } from "hls.js";

export interface CoreEvents extends Record<string, unknown> {
  statechange: { state: PlayerState; prev: PlayerState };
  ready: { duration: number };
  loadedmetadata: { duration: number; width: number; height: number };
  play: undefined;
  pause: undefined;
  seeking: { time: number };
  seeked: { time: number };
  timeupdate: { time: number; duration: number };
  progress: { buffered: number };
  volumechange: { volume: number; muted: boolean };
  ratechange: { rate: number };
  qualitychange: { active: string; qualities: Quality[]; height?: number };
  tracks: { audio: AudioTrack[]; subtitles: TextTrack[]; activeAudio: string | null; activeSubtitle: string | null };
  cues: { cues: Cue[] };
  markers: { markers: Marker[]; active: Marker | null };
  skip: { type: Marker["type"]; to: number };
  nextup: { next: EpisodeInput; remaining: number };
  nextepisode: { id: string; auto: boolean };
  episode: { id: string };
  ended: undefined;
  enterpip: undefined;
  leavepip: undefined;
  fullscreenchange: { fullscreen: boolean };
  error: PlayerError;
  waiting: { stalled: boolean };
  autoplaymuted: undefined;
  resumeprompt: { time: number; duration: number };
  load: { media: MediaDescriptor };
  sleep: { at: number | null };
  thumbnails: { cues: ThumbnailCue[] };
}

export interface CoreOptions {
  /** Called to create the hls.js constructor lazily (the default dynamic import keeps hls.js out of the entry chunk). */
  loadHls?: () => Promise<typeof Hls>;
  /** "prompt" (default) asks the viewer, "auto" resumes silently, "off" always starts at 0 or `start`. */
  resume?: "prompt" | "auto" | "off";
  /** Persist volume, mute, rate and caption choices (default true). */
  persist?: boolean;
  /** Seconds after which a stalled buffer triggers recovery (default 10). */
  stallTimeout?: number;
  /** Retry delays for network errors in ms (default 1000, 2000, 4000, 8000). */
  backoff?: number[];
}

const QUALITY_TIERS: { min: number; id: string; label: string; note: string }[] = [
  { min: 2000, id: "2160", label: "4K", note: "Up to 2160p" },
  { min: 1000, id: "1080", label: "Full HD", note: "Up to 1080p" },
  { min: 700, id: "720", label: "HD", note: "Up to 720p" },
  { min: 0, id: "480", label: "SD", note: "Up to 480p" }
];

const tierFor = (h: number) => QUALITY_TIERS.find((t) => h >= t.min) ?? QUALITY_TIERS[QUALITY_TIERS.length - 1]!;

type WebkitVideo = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
  webkitSupportsPresentationMode?: (m: string) => boolean;
  webkitSetPresentationMode?: (m: string) => void;
  webkitPresentationMode?: string;
  audioTracks?: { length: number; [i: number]: { id: string; language: string; label: string; enabled: boolean } } & EventTarget;
};

/**
 * The playback core: a typed state machine around one HTMLVideoElement. It owns source selection (native HLS,
 * lazily loaded hls.js, progressive MP4/WebM), qualities, audio and text tracks, the caption clock, markers,
 * resume, stall recovery with backoff, Media Session, wake lock, fullscreen and picture-in-picture.
 */
export class TitanCore extends Emitter<CoreEvents> {
  readonly video: WebkitVideo;
  private sm: StateMachine;
  private opts: Required<Omit<CoreOptions, "loadHls">> & Pick<CoreOptions, "loadHls">;
  private hls: Hls | null = null;
  private HlsCtor: typeof Hls | null = null;
  private media: MediaDescriptor | null = null;
  private sourceIndex = 0;
  private loadToken = 0;
  private retries = 0;
  private mediaRecoveries = 0;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private stallTimer: ReturnType<typeof setTimeout> | null = null;
  private saveAt = 0;
  private prefs: Prefs;
  private disposers: (() => void)[] = [];
  private wakeLock: { release(): Promise<void> } | null = null;
  private policyMuted = false;
  private wantPlay = false;
  private destroyed = false;
  private resumeKey = "";
  private pendingStart: number | null = null;
  private seekTarget: number | null = null;

  private externalTracks: (TextTrack & { url: string; format?: "vtt" | "srt" })[] = [];
  private streamTracks: TextTrack[] = [];
  private cueStore = new Map<string, Cue[]>();
  private activeText: string | null = null;
  private lastCueKey = "";
  private offset = 0;
  private nativeTextTracks = new Map<string, globalThis.TextTrack>();

  private qualityList: Quality[] = [];
  private activeQuality = "auto";
  private audioList: AudioTrack[] = [];
  private activeAudio: string | null = null;

  private markerList: Marker[] = [];
  private activeMarkerRef: Marker | null = null;
  private nextAnnounced = false;
  private sleepAt: number | null = null;
  private sleepEpisode = false;
  private thumbCues: ThumbnailCue[] = [];

  constructor(video: HTMLVideoElement, options: CoreOptions = {}) {
    super();
    this.video = video as WebkitVideo;
    this.opts = {
      resume: options.resume ?? "prompt",
      persist: options.persist ?? true,
      stallTimeout: options.stallTimeout ?? 10,
      backoff: options.backoff ?? [1000, 2000, 4000, 8000],
      loadHls: options.loadHls
    };
    this.prefs = readPrefs();
    this.sm = new StateMachine((state, prev) => {
      this.emit("statechange", { state, prev });
      this.updateMediaSession();
      this.updateWakeLock();
    });
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.preload = "auto";
    video.crossOrigin = "anonymous";
    video.disablePictureInPicture = false;
    video.volume = this.prefs.volume;
    video.muted = this.prefs.muted;
    this.bindVideo();
    this.bindWindow();
  }

  /* ---------------- getters ---------------- */

  get state(): PlayerState {
    return this.sm.state;
  }
  get time(): number {
    return this.seekTarget ?? (this.video.currentTime || 0);
  }
  get duration(): number {
    const d = this.video.duration;
    return Number.isFinite(d) ? d : 0;
  }
  get buffered(): number {
    const b = this.video.buffered;
    const t = this.video.currentTime;
    for (let i = 0; i < b.length; i++) if (b.start(i) <= t + 0.5 && b.end(i) >= t) return b.end(i);
    return b.length ? b.end(b.length - 1) : 0;
  }
  get paused(): boolean {
    return this.video.paused;
  }
  get volume(): number {
    return this.video.volume;
  }
  get muted(): boolean {
    return this.video.muted;
  }
  get rate(): number {
    return this.video.playbackRate;
  }
  get current(): MediaDescriptor | null {
    return this.media;
  }
  get qualities(): Quality[] {
    return this.qualityList;
  }
  get quality(): string {
    return this.activeQuality;
  }
  get audioTracks(): AudioTrack[] {
    return this.audioList;
  }
  get audioTrack(): string | null {
    return this.activeAudio;
  }
  get subtitleTracks(): TextTrack[] {
    return [...this.externalTracks.map(({ url: _u, format: _f, ...t }) => t), ...this.streamTracks];
  }
  get subtitleTrack(): string | null {
    return this.activeText;
  }
  get subtitleOffset(): number {
    return this.offset;
  }
  get markers(): Marker[] {
    return this.markerList;
  }
  get activeMarker(): Marker | null {
    return this.activeMarkerRef;
  }
  get preferences(): Prefs {
    return this.prefs;
  }
  get mutedByPolicy(): boolean {
    return this.policyMuted;
  }
  get thumbnails(): ThumbnailCue[] {
    return this.thumbCues;
  }
  get sleepTimer(): { at: number | null; episode: boolean } {
    return { at: this.sleepAt, episode: this.sleepEpisode };
  }
  get isPip(): boolean {
    return (typeof document !== "undefined" && document.pictureInPictureElement === this.video) || this.video.webkitPresentationMode === "picture-in-picture";
  }
  get canPip(): boolean {
    return (typeof document !== "undefined" && !!document.pictureInPictureEnabled && !this.video.disablePictureInPicture) || !!this.video.webkitSupportsPresentationMode?.("picture-in-picture");
  }

  /* ---------------- loading ---------------- */

  /** Loads a validated descriptor. Call `validateDescriptor` first for untrusted input. */
  async load(media: MediaDescriptor, opts: { autoplay?: boolean } = {}): Promise<void> {
    if (this.destroyed) return;
    const token = ++this.loadToken;
    this.teardownSource();
    this.media = media;
    this.sourceIndex = 0;
    this.retries = 0;
    this.mediaRecoveries = 0;
    this.nextAnnounced = false;
    this.wantPlay = opts.autoplay ?? true;
    this.markerList = media.markers ?? [];
    this.activeMarkerRef = null;
    this.offset = 0;
    this.thumbCues = [];
    this.resumeKey = "r" + hash(media.id ?? media.sources[0]!.url);
    this.sm.reset("idle");
    this.sm.to("loading");
    this.emit("load", { media });
    this.emit("markers", { markers: this.markerList, active: null });

    // where to start: explicit start, then the saved position (prompted or automatic)
    this.pendingStart = media.start ?? null;
    if (this.pendingStart === null && this.opts.resume !== "off") {
      const saved = readResume(this.resumeKey);
      if (saved && saved.t > 30 && (!saved.d || saved.t < saved.d * 0.95)) {
        if (this.opts.resume === "auto") this.pendingStart = saved.t;
        else {
          this.wantPlay = false;
          this.emit("resumeprompt", { time: saved.t, duration: saved.d });
        }
      }
    }

    this.externalTracks = (media.subtitles ?? []).map((s, i) => ({
      id: s.id ?? `ext-${i}`,
      lang: s.lang,
      label: s.label,
      sdh: !!s.sdh,
      origin: "external" as const,
      url: s.url,
      format: s.format
    }));
    this.streamTracks = [];
    this.cueStore.clear();
    this.activeText = null;
    this.emitTracks();

    if (media.thumbnails) void this.loadThumbnails(media.thumbnails, token);
    await this.attachSource(token);
    if (token !== this.loadToken) return;

    const def = media.subtitles?.findIndex((s) => s.default) ?? -1;
    const want = this.prefs.subtitleLang
      ? this.externalTracks.find((t) => t.lang === this.prefs.subtitleLang)?.id
      : def >= 0
        ? this.externalTracks[def]?.id
        : undefined;
    if (want) void this.setSubtitleTrack(want);
  }

  /** Answer to a resume prompt: true resumes at the saved time, false starts over. */
  resume(fromSaved: boolean) {
    const saved = readResume(this.resumeKey);
    if (fromSaved && saved) this.seek(saved.t);
    else {
      clearResume(this.resumeKey);
      this.seek(0);
    }
    void this.play();
  }

  private sourceFor(i: number): MediaSource | undefined {
    const list = this.progressiveOrdered();
    return list[i];
  }

  /** Sources in play order: HLS first, then progressive sorted by the preferred quality. */
  private progressiveOrdered(): MediaSource[] {
    const all = this.media?.sources ?? [];
    const hlsList = all.filter((s) => s.type === "hls");
    const prog = all.filter((s) => s.type !== "hls" && this.canPlayProgressive(s));
    if (this.activeQuality !== "auto" && prog.length > 1) {
      const target = this.activeQuality === "data-saver" ? 0 : Number(this.activeQuality);
      prog.sort((a, b) => Math.abs((a.height ?? 0) - target) - Math.abs((b.height ?? 0) - target));
    } else {
      // "auto" for progressive: the largest that fits the screen
      const screenH = typeof screen !== "undefined" ? (screen.height || 1080) * (devicePixelRatio || 1) : 1080;
      prog.sort((a, b) => {
        const fa = (a.height ?? 720) <= screenH * 1.1 ? 1 : 0;
        const fb = (b.height ?? 720) <= screenH * 1.1 ? 1 : 0;
        return fb - fa || (b.height ?? 0) - (a.height ?? 0);
      });
    }
    return [...hlsList, ...prog];
  }

  private canPlayProgressive(s: MediaSource): boolean {
    const mime = s.type === "webm" ? "video/webm" : "video/mp4";
    try {
      return this.video.canPlayType(mime) !== "";
    } catch {
      return true;
    }
  }

  private nativeHls(): boolean {
    try {
      return this.video.canPlayType("application/vnd.apple.mpegurl") !== "" && !/Android|Chrome\//.test(navigator.userAgent);
    } catch {
      return false;
    }
  }

  private async attachSource(token: number): Promise<void> {
    const src = this.sourceFor(this.sourceIndex);
    if (!src) {
      this.fail({
        code: this.media?.sources.length ? "E_SOURCE_UNSUPPORTED" : "E_NO_SOURCES",
        message: this.media?.sources.length ? "This video format can't be played on this device." : "There's nothing to play.",
        recoverable: false
      });
      return;
    }
    this.progressiveQualities();
    if (src.type === "hls" && !this.nativeHls()) {
      let Ctor: typeof Hls;
      try {
        Ctor = this.HlsCtor ?? (await (this.opts.loadHls ?? (() => import("hls.js").then((m) => m.default)))());
        this.HlsCtor = Ctor;
      } catch {
        if (token !== this.loadToken) return;
        return this.nextSource({ code: "E_HLS_UNAVAILABLE", message: "The streaming module couldn't load.", recoverable: true });
      }
      if (token !== this.loadToken) return;
      if (!Ctor.isSupported()) return this.nextSource({ code: "E_SOURCE_UNSUPPORTED", message: "Streaming isn't supported here.", recoverable: false });
      this.attachHls(Ctor, src.url, token);
    } else {
      this.video.src = src.url;
      this.video.load();
      if (this.pendingStart !== null) this.applyStartOnMetadata();
    }
  }

  private applyStartOnMetadata() {
    const start = this.pendingStart;
    if (start === null) return;
    const apply = () => {
      if (this.pendingStart === null) return;
      this.pendingStart = null;
      try {
        this.video.currentTime = Math.min(start, Math.max(0, this.duration - 1) || start);
      } catch {
        /* ignore */
      }
    };
    if (this.video.readyState >= 1) apply();
    else this.video.addEventListener("loadedmetadata", apply, { once: true });
  }

  private attachHls(Ctor: typeof Hls, url: string, token: number) {
    const hls = new Ctor({
      enableWorker: true,
      lowLatencyMode: false,
      capLevelToPlayerSize: true,
      renderTextTracksNatively: false,
      startPosition: this.pendingStart ?? -1,
      backBufferLength: 30,
      maxBufferLength: 30,
      maxMaxBufferLength: 60,
      fragLoadPolicy: {
        default: { maxTimeToFirstByteMs: 10000, maxLoadTimeMs: 120000, timeoutRetry: { maxNumRetry: 4, retryDelayMs: 0, maxRetryDelayMs: 0 }, errorRetry: { maxNumRetry: 6, retryDelayMs: 1000, maxRetryDelayMs: 8000 } }
      }
    });
    this.pendingStart = null;
    this.hls = hls;
    const E = Ctor.Events;
    hls.on(E.MANIFEST_PARSED, (_e, data: { levels: Level[] }) => {
      if (token !== this.loadToken) return;
      this.retries = 0;
      this.hlsQualities(data.levels);
      const pref = this.prefs.quality;
      if (pref !== "auto" && this.qualityList.some((q) => q.id === pref)) this.setQuality(pref, false);
    });
    hls.on(E.LEVEL_SWITCHED, (_e, data: { level: number }) => {
      const lvl = hls.levels[data.level];
      this.emit("qualitychange", { active: this.activeQuality, qualities: this.qualityList, height: lvl?.height });
    });
    hls.on(E.AUDIO_TRACKS_UPDATED, (_e, data: { audioTracks: MediaPlaylist[] }) => {
      this.audioList = data.audioTracks.map((t, i) => ({
        id: String(i),
        lang: t.lang ?? "und",
        label: t.name || t.lang || `Track ${i + 1}`,
        channels: t.channels === "6" ? "5.1" : t.channels === "8" ? "7.1" : undefined
      }));
      this.mergeAudioLabels();
      this.activeAudio = String(hls.audioTrack);
      this.emitTracks();
    });
    hls.on(E.AUDIO_TRACK_SWITCHED, (_e, data: { id: number }) => {
      this.activeAudio = String(data.id);
      this.emitTracks();
    });
    hls.on(E.NON_NATIVE_TEXT_TRACKS_FOUND, (_e, data: { tracks: { label: string; kind: string; default: boolean; subtitleTrack?: MediaPlaylist }[] }) => {
      this.streamTracks = data.tracks
        .filter((t) => t.kind === "subtitles" || t.kind === "captions")
        .map((t, i) => ({
          id: `hls-${i}`,
          lang: t.subtitleTrack?.lang ?? "und",
          label: t.label || t.subtitleTrack?.lang || `Subtitles ${i + 1}`,
          sdh: t.kind === "captions" || /\bcc\b|sdh/i.test(t.label),
          origin: "stream" as const
        }));
      this.emitTracks();
    });
    hls.on(E.CUES_PARSED, (_e, data: { track: string; cues: VTTCue[] }) => {
      // hls.js names non-native tracks "subtitles0" / "textTrack0"; map to our ids by index
      const idx = /(\d+)$/.exec(data.track)?.[1];
      const tid = idx !== undefined ? `hls-${idx}` : data.track;
      const list = this.cueStore.get(tid) ?? [];
      for (const c of data.cues) {
        const parsed = parseSubtitles(`WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n${String(c.text ?? "")}`);
        const lines = parsed[0]?.lines;
        if (lines) list.push({ start: c.startTime, end: c.endTime, lines });
      }
      list.sort((a, b) => a.start - b.start);
      this.cueStore.set(tid, list);
    });
    hls.on(E.ERROR, (_e, data: ErrorData) => this.onHlsError(Ctor, data, token));
    hls.attachMedia(this.video);
    hls.loadSource(url);
  }

  private onHlsError(Ctor: typeof Hls, data: ErrorData, token: number) {
    if (token !== this.loadToken || !this.hls) return;
    if (!data.fatal) return;
    const T = Ctor.ErrorTypes;
    if (data.type === T.NETWORK_ERROR) {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        this.fail({ code: "E_OFFLINE", message: "You're offline. Playback continues when the connection is back.", recoverable: true });
        return;
      }
      const delay = this.opts.backoff[this.retries];
      if (delay !== undefined) {
        this.retries++;
        this.sm.to("buffering");
        this.later(() => this.hls?.startLoad(), delay);
        return;
      }
      return this.nextSource({ code: "E_NETWORK", message: "The video stream couldn't be reached.", recoverable: true });
    }
    if (data.type === T.MEDIA_ERROR) {
      this.mediaRecoveries++;
      if (this.mediaRecoveries === 1) return this.hls.recoverMediaError();
      if (this.mediaRecoveries === 2) {
        this.hls.swapAudioCodec();
        return this.hls.recoverMediaError();
      }
      return this.nextSource({ code: "E_DECODE", message: "This video couldn't be decoded.", recoverable: false });
    }
    this.nextSource({ code: "E_UNKNOWN", message: "Playback stopped unexpectedly.", recoverable: true });
  }

  /** Moves to the next playable source at the same position, or reports the error when none is left. */
  private nextSource(err: PlayerError) {
    const t = this.video.currentTime;
    const list = this.progressiveOrdered();
    if (this.sourceIndex + 1 < list.length) {
      this.sourceIndex++;
      this.retries = 0;
      this.mediaRecoveries = 0;
      this.teardownSource();
      this.pendingStart = t > 0 ? t : this.pendingStart;
      this.sm.to("loading");
      void this.attachSource(this.loadToken);
      return;
    }
    this.fail(err);
  }

  private fail(err: PlayerError) {
    this.clearStall();
    if (!this.sm.to("error")) this.sm.reset("error");
    this.emit("error", err);
  }

  /** Shows a host-level error (bad descriptor, not allowed here) without a source attached. */
  reportError(err: PlayerError) {
    this.fail(err);
  }

  /** Waits for media from the host (no descriptor in the URL yet). */
  idle() {
    this.sm.reset("idle");
  }

  /** True when another source is left to try after an error. */
  get canTryAnother(): boolean {
    return this.sourceIndex + 1 < this.progressiveOrdered().length;
  }

  /** "Try another source" from the error state: moves to the next source at the same position. */
  tryAnother(): boolean {
    if (!this.canTryAnother) return false;
    this.sm.reset("loading");
    this.wantPlay = true;
    this.nextSource({ code: "E_UNKNOWN", message: "No other source.", recoverable: false });
    return true;
  }

  /** Updates and persists viewer preferences that the core does not apply itself (caption style, auto-skip). */
  setPreferences(patch: Partial<Prefs>) {
    this.prefs = { ...this.prefs, ...patch };
    if (this.opts.persist) savePrefs(patch);
  }

  /** Retry after an error: reloads the current descriptor at the same position. */
  retry() {
    if (!this.media) return;
    const t = this.video.currentTime || this.pendingStart || 0;
    const m = { ...this.media, start: t > 1 ? t : this.media.start };
    void this.load(m, { autoplay: true });
  }

  private hlsQualities(levels: Level[]) {
    const tiers = new Map<string, Quality>();
    for (const l of levels) {
      if (!l.height) continue;
      const t = tierFor(l.height);
      if (!tiers.has(t.id)) tiers.set(t.id, { id: t.id, label: t.label, note: t.note, height: Number(t.id) });
    }
    const list = [...tiers.values()].sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
    this.qualityList = list.length ? [{ id: "auto", label: "Auto" }, ...list, { id: "data-saver", label: "Data Saver", note: "Lowest data use" }] : [];
    this.emit("qualitychange", { active: this.activeQuality, qualities: this.qualityList });
  }

  private progressiveQualities() {
    const prog = (this.media?.sources ?? []).filter((s) => s.type !== "hls" && s.height);
    if (prog.length < 2 || (this.media?.sources ?? []).some((s) => s.type === "hls")) {
      if (!(this.media?.sources ?? []).some((s) => s.type === "hls")) this.qualityList = [];
      return;
    }
    const tiers = new Map<string, Quality>();
    for (const s of prog) {
      const t = tierFor(s.height!);
      if (!tiers.has(t.id)) tiers.set(t.id, { id: t.id, label: s.label && !/^\d+p$/.test(s.label) ? s.label : t.label, note: t.note, height: Number(t.id) });
    }
    const list = [...tiers.values()].sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
    this.qualityList = [{ id: "auto", label: "Auto" }, ...list, { id: "data-saver", label: "Data Saver", note: "Lowest data use" }];
    this.emit("qualitychange", { active: this.activeQuality, qualities: this.qualityList });
  }

  /** "auto", "data-saver" or a tier id. HLS keeps adaptive switching but caps it at the tier ("Up to 1080p"). */
  setQuality(id: string, remember = true) {
    if (!this.qualityList.some((q) => q.id === id) && id !== "auto") return;
    this.activeQuality = id;
    if (remember && this.opts.persist) savePrefs({ quality: id });
    this.prefs.quality = id;
    if (this.hls) {
      const levels = this.hls.levels;
      if (id === "auto") this.hls.autoLevelCapping = -1;
      else if (id === "data-saver") {
        let low = 0;
        levels.forEach((l, i) => {
          if ((l.bitrate ?? 0) < (levels[low]?.bitrate ?? Infinity)) low = i;
        });
        this.hls.autoLevelCapping = low;
        this.hls.nextLevel = low;
      } else {
        const cap = Number(id);
        let best = -1;
        levels.forEach((l, i) => {
          if (l.height <= cap * 1.05 && (best < 0 || l.height >= (levels[best]?.height ?? 0))) best = i;
        });
        this.hls.autoLevelCapping = best;
        if (best >= 0 && this.hls.currentLevel > best) this.hls.nextLevel = best;
      }
      this.emit("qualitychange", { active: id, qualities: this.qualityList });
      return;
    }
    // progressive: switch the file at the same position
    const t = this.video.currentTime;
    const wasPaused = this.video.paused;
    const list = this.progressiveOrdered();
    const target = list[0];
    if (target && this.video.currentSrc !== target.url) {
      this.sourceIndex = 0;
      this.video.src = target.url;
      this.video.load();
      this.pendingStart = t;
      this.applyStartOnMetadata();
      if (!wasPaused) void this.play();
    }
    this.emit("qualitychange", { active: id, qualities: this.qualityList });
  }

  private mergeAudioLabels() {
    const hints = this.media?.audio ?? [];
    for (const a of this.audioList) {
      const h = hints.find((x) => x.lang === a.lang);
      if (h) {
        a.label = h.label;
        if (h.channels) a.channels = h.channels;
        if (h.original) a.original = true;
      }
    }
  }

  setAudioTrack(id: string) {
    const i = Number(id);
    if (this.hls && Number.isInteger(i) && i >= 0 && i < this.hls.audioTracks.length) {
      this.hls.audioTrack = i;
      this.activeAudio = id;
    } else if (this.video.audioTracks && Number.isInteger(i) && i < this.video.audioTracks.length) {
      for (let k = 0; k < this.video.audioTracks.length; k++) this.video.audioTracks[k]!.enabled = k === i;
      this.activeAudio = id;
    }
    this.emitTracks();
  }

  private readNativeAudio() {
    const at = this.video.audioTracks;
    if (this.hls || !at || !at.length) return;
    this.audioList = [];
    for (let k = 0; k < at.length; k++) {
      const t = at[k]!;
      this.audioList.push({ id: String(k), lang: t.language || "und", label: t.label || t.language || `Track ${k + 1}`});
      if (t.enabled) this.activeAudio = String(k);
    }
    this.mergeAudioLabels();
    this.emitTracks();
  }

  private readNativeText() {
    if (this.hls) return;
    const list = this.video.textTracks;
    const out: TextTrack[] = [];
    this.nativeTextTracks.clear();
    for (let k = 0; k < list.length; k++) {
      const t = list[k]!;
      if (t.kind !== "subtitles" && t.kind !== "captions") continue;
      const id = `native-${k}`;
      this.nativeTextTracks.set(id, t);
      if (t.mode === "showing") t.mode = "disabled";
      out.push({ id, lang: t.language || "und", label: t.label || t.language || `Subtitles ${k + 1}`, sdh: t.kind === "captions", origin: "stream" });
    }
    this.streamTracks = out;
    this.emitTracks();
  }

  async setSubtitleTrack(id: string | null) {
    this.activeText = id;
    if (this.opts.persist) {
      const lang = id ? this.subtitleTracks.find((t) => t.id === id)?.lang ?? null : null;
      savePrefs({ subtitleLang: lang });
      this.prefs.subtitleLang = lang;
    }
    if (this.hls) this.hls.subtitleTrack = id?.startsWith("hls-") ? Number(id.slice(4)) : -1;
    if (this.hls) this.hls.subtitleDisplay = !!id?.startsWith("hls-");
    for (const [tid, t] of this.nativeTextTracks) t.mode = tid === id ? "hidden" : "disabled";
    this.emitTracks();
    const ext = this.externalTracks.find((t) => t.id === id);
    if (ext && !this.cueStore.has(ext.id)) {
      try {
        const res = await fetch(ext.url, { credentials: "omit", mode: "cors", referrerPolicy: "no-referrer" });
        if (!res.ok) throw new Error(String(res.status));
        const len = Number(res.headers.get("content-length") ?? 0);
        if (len > 4 * 1024 * 1024) throw new Error("too large");
        const text = await res.text();
        this.cueStore.set(ext.id, parseSubtitles(text));
      } catch {
        this.cueStore.set(ext.id, []);
        if (this.activeText === ext.id) this.emit("error", { code: "E_NETWORK", message: `Subtitles "${ext.label}" couldn't be loaded.`, recoverable: true });
      }
    }
    this.lastCueKey = "";
    this.tickCues();
  }

  /** Timing nudge for subtitles in seconds (positive shows captions later). */
  setSubtitleOffset(sec: number) {
    this.offset = clamp(Math.round(sec * 10) / 10, -30, 30);
    this.lastCueKey = "";
    this.tickCues();
  }

  private tickCues() {
    let cues: Cue[] = [];
    const t = this.video.currentTime - this.offset;
    if (this.activeText) {
      const native = this.nativeTextTracks.get(this.activeText);
      if (native) {
        const ac = native.activeCues;
        if (ac) {
          for (let k = 0; k < ac.length; k++) {
            const c = ac[k] as VTTCue;
            const parsed = parseSubtitles(`WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n${String(c.text ?? "")}`)[0];
            if (parsed) cues.push({ start: c.startTime, end: c.endTime, lines: parsed.lines });
          }
        }
      } else cues = activeCues(this.cueStore.get(this.activeText) ?? [], t);
    }
    const key = cues.map((c) => `${c.start}:${c.end}`).join("|");
    if (key !== this.lastCueKey) {
      this.lastCueKey = key;
      this.emit("cues", { cues });
    }
  }

  private emitTracks() {
    this.emit("tracks", { audio: this.audioList, subtitles: this.subtitleTracks, activeAudio: this.activeAudio, activeSubtitle: this.activeText });
  }

  private async loadThumbnails(url: string, token: number) {
    try {
      const res = await fetch(url, { credentials: "omit", referrerPolicy: "no-referrer" });
      if (!res.ok) return;
      const cues = parseThumbnails(await res.text(), url);
      if (token !== this.loadToken) return;
      this.thumbCues = cues;
      this.emit("thumbnails", { cues });
    } catch {
      /* optional */
    }
  }

  thumbnailAt(t: number): ThumbnailCue | null {
    const list = this.thumbCues;
    let lo = 0;
    let hi = list.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const c = list[mid]!;
      if (t < c.start) hi = mid - 1;
      else if (t >= c.end) lo = mid + 1;
      else return c;
    }
    return null;
  }

  /* ---------------- transport ---------------- */

  async play(): Promise<void> {
    if (this.destroyed || !this.media) return;
    this.wantPlay = true;
    if (this.state === "error") return this.retry();
    if (this.state === "ended") this.video.currentTime = 0;
    try {
      await this.video.play();
    } catch (err) {
      const name = (err as DOMException)?.name;
      if (name === "NotAllowedError" && !this.video.muted) {
        // autoplay policy: start muted, unmute on the first gesture (unless the viewer muted on purpose)
        this.video.muted = true;
        this.policyMuted = true;
        this.emit("autoplaymuted", undefined);
        try {
          await this.video.play();
        } catch {
          this.sm.to("paused");
        }
      } else if (name === "NotAllowedError") {
        this.sm.to("paused");
      }
    }
  }

  pause() {
    this.wantPlay = false;
    this.video.pause();
  }

  toggle() {
    if (this.video.paused || this.video.ended) void this.play();
    else this.pause();
  }

  seek(t: number) {
    const d = this.duration;
    const to = clamp(t, 0, d ? Math.max(0, d - 0.25) : t);
    if (this.video.readyState < 1) {
      this.pendingStart = to;
      if (!this.hls) this.applyStartOnMetadata();
      else this.hls.startLoad(to);
      return;
    }
    this.seekTarget = to;
    this.video.currentTime = to;
    this.nextAnnounced = to >= this.nextUpAt();
  }

  seekBy(delta: number) {
    this.seek(this.time + delta);
  }

  setVolume(v: number) {
    this.video.volume = clamp(v, 0, 1);
    if (v > 0 && this.video.muted) this.video.muted = false;
    this.policyMuted = false;
  }

  setMuted(m: boolean) {
    this.video.muted = m;
    this.policyMuted = false;
  }

  setRate(r: number) {
    this.video.playbackRate = clamp(r, 0.25, 3);
  }

  /** The UI calls this on any viewer gesture; it lifts a policy mute applied for autoplay. */
  userGesture() {
    if (this.policyMuted) {
      this.policyMuted = false;
      this.video.muted = this.prefs.muted;
    }
  }

  setMarkers(markers: Marker[]) {
    this.markerList = [...markers].sort((a, b) => a.start - b.start);
    this.activeMarkerRef = null;
    this.emit("markers", { markers: this.markerList, active: null });
    this.tickMarkers();
  }

  /** Skips the active intro / recap / credits marker. Credits with a next episode start the next episode. */
  skipMarker() {
    const m = this.activeMarkerRef;
    if (!m) return;
    this.emit("skip", { type: m.type, to: m.end });
    if (m.type === "credits" && this.media?.next) return this.next(false);
    this.seek(m.end);
  }

  private tickMarkers() {
    const t = this.time;
    const m = this.markerList.find((x) => t >= x.start && t < x.end - 0.25) ?? null;
    if (m !== this.activeMarkerRef) {
      this.activeMarkerRef = m;
      this.emit("markers", { markers: this.markerList, active: m });
      if (m && this.prefs.autoSkip && m.type !== "credits") this.skipMarker();
    }
  }

  private nextUpAt(): number {
    const credits = this.markerList.find((m) => m.type === "credits");
    const d = this.duration;
    return credits ? credits.start : d ? Math.max(0, d - 20) : Infinity;
  }

  private tickNext() {
    const next = this.media?.next;
    if (!next || this.nextAnnounced) return;
    const at = this.nextUpAt();
    if (this.time >= at && this.duration > 0) {
      this.nextAnnounced = true;
      this.emit("nextup", { next, remaining: Math.max(0, this.duration - this.time) });
    }
  }

  /** Starts the next episode: plays it directly when it has sources, otherwise asks the host. */
  next(auto = false) {
    const n = this.media?.next;
    if (!n) return;
    this.saveProgress(true);
    this.emit("nextepisode", { id: n.id, auto });
    if (n.sources?.length) this.playEpisode(n);
  }

  /** Plays an episode from the descriptor's list (or emits `episode` for the host to load it). */
  playEpisode(ep: EpisodeInput) {
    this.emit("episode", { id: ep.id });
    if (!ep.sources?.length || !this.media) return;
    const list = this.media.episodes ?? [];
    const idx = list.findIndex((e) => e.id === ep.id);
    const following = idx >= 0 ? list[idx + 1] : undefined;
    const m: MediaDescriptor = {
      ...this.media,
      id: ep.id,
      title: this.media.title,
      subtitle: ep.subtitle ?? ep.title,
      sources: ep.sources,
      subtitles: ep.subtitles ?? [],
      markers: ep.markers ?? [],
      start: undefined,
      next: following
    };
    if (ep.thumbnail) m.poster = ep.thumbnail;
    void this.load(m, { autoplay: true });
  }

  previous() {
    if (this.time > 5 || !this.media?.episodes) return this.seek(0);
    const list = this.media.episodes;
    const idx = list.findIndex((e) => e.id === this.media?.id);
    const prev = idx > 0 ? list[idx - 1] : undefined;
    if (prev) this.playEpisode(prev);
    else this.seek(0);
  }

  /** Sleep timer: minutes from now, "episode" for the end of this episode, or null to cancel. */
  setSleepTimer(v: number | "episode" | null) {
    this.sleepEpisode = v === "episode";
    this.sleepAt = typeof v === "number" ? Date.now() + v * 60000 : null;
    this.emit("sleep", { at: this.sleepAt });
  }

  /* ---------------- presentation ---------------- */

  async enterFullscreen(el: HTMLElement): Promise<void> {
    const d = document as Document & { webkitFullscreenElement?: Element };
    const e = el as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
    try {
      if (e.requestFullscreen) await e.requestFullscreen({ navigationUI: "hide" });
      else if (e.webkitRequestFullscreen) await e.webkitRequestFullscreen();
      else if (this.video.webkitEnterFullscreen) this.video.webkitEnterFullscreen();
    } catch {
      if (this.video.webkitEnterFullscreen && !d.webkitFullscreenElement) this.video.webkitEnterFullscreen();
    }
  }

  async exitFullscreen(): Promise<void> {
    const d = document as Document & { webkitExitFullscreen?: () => Promise<void>; webkitFullscreenElement?: Element };
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (d.webkitFullscreenElement) await d.webkitExitFullscreen?.();
    } catch {
      /* ignore */
    }
  }

  get isFullscreen(): boolean {
    const d = document as Document & { webkitFullscreenElement?: Element };
    return !!(document.fullscreenElement || d.webkitFullscreenElement);
  }

  async lockLandscape(): Promise<boolean> {
    const o = (screen as Screen & { orientation?: ScreenOrientation & { lock?: (o: string) => Promise<void> } }).orientation;
    try {
      await o?.lock?.("landscape");
      return true;
    } catch {
      return false;
    }
  }

  unlockOrientation() {
    try {
      (screen.orientation as ScreenOrientation & { unlock?: () => void })?.unlock?.();
    } catch {
      /* ignore */
    }
  }

  async enterPip(): Promise<boolean> {
    try {
      if (document.pictureInPictureEnabled && this.video.requestPictureInPicture) {
        await this.video.requestPictureInPicture();
        return true;
      }
      if (this.video.webkitSupportsPresentationMode?.("picture-in-picture")) {
        this.video.webkitSetPresentationMode?.("picture-in-picture");
        return true;
      }
    } catch {
      /* not allowed here */
    }
    return false;
  }

  async exitPip(): Promise<void> {
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else if (this.video.webkitPresentationMode === "picture-in-picture") this.video.webkitSetPresentationMode?.("inline");
    } catch {
      /* ignore */
    }
  }

  /* ---------------- video and window events ---------------- */

  private listen<K extends keyof HTMLVideoElementEventMap>(type: K, fn: (e: HTMLVideoElementEventMap[K]) => void) {
    this.video.addEventListener(type, fn);
    this.disposers.push(() => this.video.removeEventListener(type, fn));
  }

  private bindVideo() {
    const v = this.video;
    this.listen("loadedmetadata", () => {
      this.emit("loadedmetadata", { duration: this.duration, width: v.videoWidth, height: v.videoHeight });
      this.readNativeAudio();
      this.readNativeText();
    });
    this.listen("canplay", () => {
      if (this.state === "loading") {
        this.sm.to("ready");
        this.emit("ready", { duration: this.duration });
        if (this.wantPlay) void this.play();
      } else if (this.state === "buffering" && v.paused) this.sm.to("paused");
    });
    this.listen("play", () => this.emit("play", undefined));
    this.listen("playing", () => {
      this.clearStall();
      this.retries = 0;
      this.sm.to("playing");
    });
    this.listen("pause", () => {
      if (v.ended || this.state === "loading" || this.state === "idle") return;
      this.clearStall();
      this.sm.to("paused");
      this.emit("pause", undefined);
      this.saveProgress(true);
    });
    this.listen("waiting", () => {
      if ((v.paused && this.state !== "seeking") || this.state === "loading") return;
      this.sm.to("buffering");
      this.emit("waiting", { stalled: false });
      this.armStall();
    });
    this.listen("stalled", () => {
      if (!v.paused) this.armStall();
    });
    this.listen("seeking", () => {
      this.sm.to("seeking");
      this.emit("seeking", { time: v.currentTime });
    });
    this.listen("seeked", () => {
      this.seekTarget = null;
      this.emit("seeked", { time: v.currentTime });
      this.lastCueKey = "";
      this.tickCues();
      this.tickMarkers();
      if (v.paused) this.sm.to("paused");
      else if (v.readyState >= 3) this.sm.to("playing");
      else this.sm.to("buffering");
    });
    this.listen("timeupdate", () => {
      const t = v.currentTime;
      this.emit("timeupdate", { time: t, duration: this.duration });
      this.tickCues();
      this.tickMarkers();
      this.tickNext();
      this.tickSleep();
      if (Date.now() - this.saveAt > 5000) this.saveProgress();
      this.updatePosition();
    });
    this.listen("progress", () => this.emit("progress", { buffered: this.buffered }));
    this.listen("volumechange", () => {
      this.emit("volumechange", { volume: v.volume, muted: v.muted });
      if (this.opts.persist && !this.policyMuted) {
        savePrefs({ volume: v.volume, muted: v.muted });
        this.prefs.volume = v.volume;
        this.prefs.muted = v.muted;
      }
    });
    this.listen("ratechange", () => {
      this.emit("ratechange", { rate: v.playbackRate });
      if (this.opts.persist) {
        savePrefs({ rate: v.playbackRate });
        this.prefs.rate = v.playbackRate;
      }
      this.updatePosition();
    });
    this.listen("ended", () => {
      this.clearStall();
      this.sm.to("ended");
      this.emit("ended", undefined);
      clearResume(this.resumeKey);
      if (this.sleepEpisode) {
        this.sleepEpisode = false;
        this.emit("sleep", { at: null });
      }
    });
    this.listen("error", () => {
      if (this.hls) return; // hls.js reports its own errors
      const code = v.error?.code;
      if (code === 2 /* MEDIA_ERR_NETWORK */) {
        const delay = this.opts.backoff[this.retries];
        if (delay !== undefined) {
          this.retries++;
          const t = v.currentTime;
          this.sm.to("buffering");
          this.later(() => {
            this.pendingStart = t;
            v.load();
            this.applyStartOnMetadata();
            if (this.wantPlay) void this.play();
          }, delay);
          return;
        }
        return this.nextSource({ code: "E_NETWORK", message: "The video couldn't be reached.", recoverable: true });
      }
      if (code === 3) return this.nextSource({ code: "E_DECODE", message: "This video couldn't be decoded.", recoverable: false });
      if (code === 4) return this.nextSource({ code: "E_SOURCE_UNSUPPORTED", message: "This video format can't be played on this device.", recoverable: false });
    });
    this.listen("enterpictureinpicture", () => this.emit("enterpip", undefined));
    this.listen("leavepictureinpicture", () => this.emit("leavepip", undefined));
    // restore remembered rate after each load
    this.listen("loadstart", () => {
      if (this.prefs.rate !== 1) v.playbackRate = this.prefs.rate;
    });
  }

  private bindWindow() {
    if (typeof window === "undefined") return;
    const onFs = () => this.emit("fullscreenchange", { fullscreen: this.isFullscreen });
    const onOnline = () => {
      if (this.state === "error") this.retry();
    };
    const onOffline = () => {
      if (this.state === "playing" || this.state === "buffering") this.emit("waiting", { stalled: true });
    };
    const onVis = () => {
      if (document.visibilityState === "visible") this.updateWakeLock();
      else this.saveProgress(true);
    };
    const onHide = () => this.saveProgress(true);
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("webkitfullscreenchange", onFs);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onHide);
    this.disposers.push(() => {
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("webkitfullscreenchange", onFs);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onHide);
    });
  }

  private armStall() {
    if (this.stallTimer) return;
    this.stallTimer = setTimeout(() => {
      this.stallTimer = null;
      if (this.state !== "buffering" || this.video.paused) return;
      this.emit("waiting", { stalled: true });
      // recovery: hls.js reloads from the current position; progressive nudges the decoder by re-seeking
      const t = this.video.currentTime;
      if (this.hls) this.hls.startLoad(t);
      else {
        this.retries++;
        if (this.retries > this.opts.backoff.length) return this.nextSource({ code: "E_NETWORK", message: "Playback stalled.", recoverable: true });
        this.video.currentTime = t + 0.01;
      }
      this.armStall();
    }, this.opts.stallTimeout * 1000);
  }

  private clearStall() {
    if (this.stallTimer) clearTimeout(this.stallTimer);
    this.stallTimer = null;
  }

  private tickSleep() {
    if (this.sleepAt && Date.now() >= this.sleepAt) {
      this.sleepAt = null;
      this.pause();
      this.emit("sleep", { at: null });
    }
  }

  private later(fn: () => void, ms: number) {
    const id = setTimeout(() => {
      this.timers.delete(id);
      if (!this.destroyed) fn();
    }, ms);
    this.timers.add(id);
  }

  private saveProgress(force = false) {
    if (!this.media || !this.opts.persist) return;
    const t = this.video.currentTime;
    const d = this.duration;
    if (!force && Date.now() - this.saveAt < 5000) return;
    this.saveAt = Date.now();
    if (t > 30 && d && t < d * 0.95) saveResume(this.resumeKey, t, d);
  }

  /* ---------------- Media Session and wake lock ---------------- */

  private updateMediaSession() {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator) || !this.media) return;
    const ms = navigator.mediaSession;
    try {
      if (typeof MediaMetadata !== "undefined") {
        const art = this.media.poster ?? this.media.backdrop;
        const meta = new MediaMetadata({ title: this.media.title, artist: this.media.subtitle ?? "", artwork: art ? [{ src: art, sizes: "512x512" }] : [] });
        if (ms.metadata?.title !== meta.title || ms.metadata?.artist !== meta.artist) ms.metadata = meta;
      }
      ms.playbackState = this.state === "playing" ? "playing" : this.state === "paused" || this.state === "ended" ? "paused" : ms.playbackState;
      const set = (a: MediaSessionAction, fn: MediaSessionActionHandler | null) => {
        try {
          ms.setActionHandler(a, fn);
        } catch {
          /* unsupported action */
        }
      };
      set("play", () => void this.play());
      set("pause", () => this.pause());
      set("seekbackward", (d) => this.seekBy(-(d.seekOffset ?? 10)));
      set("seekforward", (d) => this.seekBy(d.seekOffset ?? 10));
      set("seekto", (d) => d.seekTime !== undefined && this.seek(d.seekTime));
      set("nexttrack", this.media.next ? () => this.next(false) : null);
      set("previoustrack", this.media.episodes?.length ? () => this.previous() : null);
    } catch {
      /* Media Session unavailable in this frame */
    }
  }

  private updatePosition() {
    try {
      if (!("mediaSession" in navigator) || !navigator.mediaSession.setPositionState || !this.duration) return;
      navigator.mediaSession.setPositionState({ duration: this.duration, playbackRate: this.video.playbackRate || 1, position: Math.min(this.video.currentTime, this.duration) });
    } catch {
      /* ignore */
    }
  }

  private updateWakeLock() {
    const wl = (navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<{ release(): Promise<void> }> } }).wakeLock;
    if (!wl) return;
    if (this.state === "playing" && document.visibilityState === "visible") {
      if (!this.wakeLock)
        wl.request("screen")
          .then((l) => {
            if (this.destroyed || this.state !== "playing") void l.release();
            else this.wakeLock = l;
          })
          .catch(() => undefined);
    } else if (this.wakeLock && this.state !== "buffering" && this.state !== "seeking") {
      void this.wakeLock.release().catch(() => undefined);
      this.wakeLock = null;
    }
  }

  /* ---------------- teardown ---------------- */

  private teardownSource() {
    this.clearStall();
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    if (this.hls) {
      try {
        this.hls.destroy();
      } catch {
        /* ignore */
      }
      this.hls = null;
    }
    this.qualityList = [];
    this.audioList = [];
    this.activeAudio = null;
    this.nativeTextTracks.clear();
    this.seekTarget = null;
    try {
      this.video.removeAttribute("src");
      this.video.load();
    } catch {
      /* ignore */
    }
  }

  destroy() {
    if (this.destroyed) return;
    this.saveProgress(true);
    this.destroyed = true;
    this.loadToken++;
    this.teardownSource();
    for (const d of this.disposers) d();
    this.disposers = [];
    if (this.wakeLock) void this.wakeLock.release().catch(() => undefined);
    this.wakeLock = null;
    try {
      if ("mediaSession" in navigator) {
        for (const a of ["play", "pause", "seekbackward", "seekforward", "seekto", "nexttrack", "previoustrack"] as MediaSessionAction[]) {
          try {
            navigator.mediaSession.setActionHandler(a, null);
          } catch {
            /* ignore */
          }
        }
        navigator.mediaSession.metadata = null;
      }
    } catch {
      /* ignore */
    }
    this.cueStore.clear();
    this.sm.reset("idle");
    this.clear();
  }
}
