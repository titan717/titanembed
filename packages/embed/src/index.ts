import {
  NS,
  PROTOCOL_VERSION,
  RateLimiter,
  TitanCore,
  applyTheme,
  descriptorFromParams,
  detectPlayerClass,
  normalizeKey,
  parseCommand,
  parseOrigins,
  resolveTheme,
  setPageOrigin,
  validateDescriptor,
  validateMarkers,
  validateTheme,
  type CommandMessage,
  type EventName,
  type MediaDescriptor,
  type PlayerClass,
  type ThemeInput
} from "@titan/core";
import {
  SourceRegistry,
  embedmasterAdapter,
  mockAdapter,
  modeOf,
  requestFromParams,
  urlAdapter,
  type SourceAdapter,
  type SourceRequest
} from "@titan/sources";
import type { ProviderMedia } from "@titan/sources/provider";

/** Provider iframes are only needed for catalogue sources, so their code loads on demand. */
const loadProvider = () => import("@titan/sources/provider");
const isProvider = (m: HTMLVideoElement | ProviderMedia): m is ProviderMedia => !(m instanceof HTMLVideoElement);
import { h, icon, setLanguage, t, type SourceMenu } from "@titan/ui-common";

declare const __TITAN_VERSION__: string;
export const VERSION = typeof __TITAN_VERSION__ === "string" ? __TITAN_VERSION__ : "0.0.0";

interface Ui {
  destroy(): void;
}

/** Throttled events (per second). Everything else is sent as it happens. */
const THROTTLE: Partial<Record<EventName, number>> = { timeupdate: 4, progress: 2 };

const FORWARD: EventName[] = [
  "loadedmetadata",
  "play",
  "pause",
  "seeking",
  "seeked",
  "timeupdate",
  "progress",
  "volumechange",
  "ratechange",
  "qualitychange",
  "tracks",
  "markers",
  "skip",
  "nextepisode",
  "episode",
  "ended",
  "enterpip",
  "leavepip",
  "fullscreenchange",
  "error",
  "statechange"
];

const LOOPBACK = /^(localhost|127\.0\.0\.1)$/;

/** Production registry: direct streams and EmbedMaster. Test mocks only on loopback pages (docs/SOURCES.md). */
export function createRegistry(params: URLSearchParams): SourceRegistry {
  const reg = new SourceRegistry();
  reg.register(urlAdapter).register(embedmasterAdapter);
  const mock = params.get("mock");
  if (mock && LOOPBACK.test(location.hostname)) {
    // mockcfg=id.mode.flags,… flags: u = refuses a sandbox, t = themed (no commands)
    const items = (params.get("mockcfg") ?? "mock.ok").split(",").slice(0, 5);
    items.forEach((item, i) => {
      const [id = `mock${i}`, mode = "ok", flags = ""] = item.split(".");
      try {
        reg.register(
          mockAdapter({ origin: mock, id, mode, themed: flags.includes("t"), unsandboxed: flags.includes("u"), rank: 1 + i * 0.1 })
        );
      } catch {
        /* invalid test config is ignored */
      }
    });
  }
  return reg;
}

/**
 * The embed page: reads the URL, enforces the origin allowlist, resolves the title through the source registry,
 * mounts Player A (TV) or Player B (mobile) and runs the postMessage bridge (docs: apps/docs/api.md).
 */
export function startEmbed(container: HTMLElement, params: URLSearchParams) {
  setPageOrigin(location.origin);
  setLanguage(params.get("lang") ?? navigator.language);

  const origins = parseOrigins(params.get("origins"));
  const parentOrigin = detectParentOrigin();
  const framed = window.parent !== window;
  // Event targets: the allowlist when given; otherwise only the embedding page's own origin.
  const targets = origins.length ? origins.filter((o) => !parentOrigin || o === parentOrigin) : parentOrigin ? [parentOrigin] : [];
  const notAllowed = framed && origins.length > 0 && !!parentOrigin && !origins.includes(parentOrigin);

  const forced = params.get("player");
  let playerClass: PlayerClass = detectPlayerClass(forced);
  const root = document.createElement("div");
  root.tabIndex = -1;
  container.appendChild(root);

  const resumeParam = params.get("resume");
  const autoplay = params.get("autoplay") !== "0";
  const registry = createRegistry(params);
  const limiter = new RateLimiter(30, 60);
  let themeInput: ThemeInput | undefined = validateTheme(themeFromParams(params));
  let destroyed = false;

  /* ---------- host messaging ---------- */

  const post = (event: EventName, data?: unknown) => {
    if (!framed || destroyed) return;
    for (const o of targets) {
      try {
        window.parent.postMessage({ ns: NS, v: PROTOCOL_VERSION, type: "event", event, data }, o);
      } catch {
        /* the parent navigated away */
      }
    }
  };
  const lastSent: Partial<Record<EventName, number>> = {};
  const emit = (event: EventName, data?: unknown) => {
    const rate = THROTTLE[event];
    if (rate) {
      const now = performance.now();
      if (now - (lastSent[event] ?? 0) < 1000 / rate) return;
      lastSent[event] = now;
    }
    post(event, data);
  };

  /* ---------- core + UI ---------- */

  let media: HTMLVideoElement | ProviderMedia = makeVideo();
  let core = makeCore(media);
  let ui: Ui | null = null;
  let mounting: Promise<void> = Promise.resolve();

  function makeVideo(): HTMLVideoElement {
    const v = document.createElement("video");
    v.className = "t-video";
    v.setAttribute("aria-hidden", "true");
    v.tabIndex = -1;
    return v;
  }
  const mediaNode = () => (isProvider(media) ? media.el : media);

  function makeCore(el: HTMLVideoElement | ProviderMedia): TitanCore {
    const c = new TitanCore(el as HTMLVideoElement, {
      loadHls: () => import("hls.js").then((m) => m.default),
      resume: resumeParam === "auto" || resumeParam === "off" ? resumeParam : "prompt"
    });
    for (const ev of FORWARD) c.on(ev as never, ((data: unknown) => emit(ev, data)) as never);
    c.on("ready", (d) => post("ready", { ...d, version: VERSION, playerClass, protocol: PROTOCOL_VERSION, source: active?.id ?? null }));
    c.on("load", ({ media: m }) => {
      if (!themeInput && m.theme) applyTheme(root, resolveTheme(m.theme, playerClass));
    });
    c.on("timeupdate", ({ time }) => {
      if (time > 0) lastTime = time;
    });
    c.on("error", (e) => (lastError = e.message));
    c.on("statechange", ({ state }) => onState(c, state));
    return c;
  }

  const sourceMenu: SourceMenu = {
    list: () =>
      candidates.map((a) => ({
        id: a.id,
        label: a.name,
        note: modeOf(a) === "themed" ? t("source") : undefined,
        selected: a === active
      })),
    pick: (id) => switchTo(id, "user")
  };

  const mount = (cls: PlayerClass): Promise<void> => {
    mounting = mounting.then(async () => {
      if (destroyed || themed) return;
      ui?.destroy();
      ui = null;
      root.className = "";
      const common = {
        onExit: () => post("exit", { time: core.time }),
        onReport: (kind: string) => post("report", { kind, time: Math.round(core.time), state: core.state, source: active?.id ?? null }),
        sources: sourceMenu
      };
      if (cls === "tv") {
        const { mountTv } = await import("@titan/ui-tv");
        if (destroyed || themed) return;
        ui = mountTv(root, core, common);
      } else {
        const { mountMobile } = await import("@titan/ui-mobile");
        if (destroyed || themed) return;
        ui = mountMobile(root, core, { ...common, showBack: params.get("back") === "1" });
      }
      root.insertBefore(mediaNode(), root.firstChild);
      applyTheme(root, resolveTheme(themeInput ?? core.current?.theme, cls));
      root.dataset.player = cls;
      post("playerclass", { playerClass: cls, forced: forced === "tv" || forced === "mobile" });
    });
    return mounting;
  };

  /** Swaps the media element (own <video> or a provider iframe) and remounts the player UI on the new core. */
  async function useMedia(next: HTMLVideoElement | ProviderMedia | null) {
    if (!next && !isProvider(media) && !themed) return;
    removeThemed();
    ui?.destroy();
    ui = null;
    core.destroy();
    if (isProvider(media)) media.destroy();
    else media.remove();
    media = next ?? makeVideo();
    core = makeCore(media);
    await mount(playerClass);
  }

  /* ---------- source session ---------- */

  let request: SourceRequest | null = null;
  let candidates: SourceAdapter[] = [];
  let active: SourceAdapter | null = null;
  let attemptAt = 0;
  let started = false;
  let exhausted = false;
  let lastTime = 0;
  let lastError = "";
  let themed: { frame: HTMLIFrameElement; bar: HTMLElement; off: () => void } | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  const hooks = {
    redirect: () => active && registry.recordRedirect(active.id),
    blocked: () => active && registry.recordPopup(active.id),
    refocus: () => {
      const a = document.activeElement;
      if (!a || a === document.body || a.tagName === "IFRAME") root.focus({ preventScroll: true });
    }
  };

  function startSession(req: SourceRequest) {
    request = req;
    candidates = registry.candidates(req);
    exhausted = false;
    lastTime = 0;
    post("sources", sourcesInfo());
    if (!candidates.length) {
      exhausted = true;
      core.reportError({ code: "E_NO_SOURCES", message: t("sourceNone"), recoverable: false });
      return;
    }
    return attempt(0, req.start, "start");
  }

  async function attempt(i: number, start: number | undefined, reason: string) {
    const a = candidates[i];
    if (!a || !request) return;
    active = a;
    started = false;
    attemptAt = performance.now();
    let plan;
    try {
      plan = a.resolve({ ...request, ...(start !== undefined ? { start } : {}) });
    } catch (err) {
      return fail(a, err instanceof Error ? err.message : String(err));
    }
    post("sourcechange", { id: a.id, name: a.name, mode: modeOf(a), reason });
    if (plan.kind === "media") {
      await useMedia(null);
      if (active !== a) return;
      const m = start !== undefined && start > 0 ? { ...plan.media, start } : plan.media;
      await core.load(m, { autoplay });
    } else if (modeOf(a) === "driven") {
      const { ProviderMedia } = await loadProvider();
      if (active !== a) return;
      await useMedia(new ProviderMedia(a, hooks));
      if (active !== a) return;
      await core.load(providerDescriptor(request, plan.url, start), { autoplay });
    } else {
      const { themedFrame } = await loadProvider();
      if (active !== a) return;
      showThemed(a, plan.url, themedFrame);
    }
  }

  function onState(c: TitanCore, state: string) {
    if (c !== core || !active) return;
    if (state === "playing" && !started) {
      started = true;
      registry.recordSuccess(active.id, performance.now() - attemptAt);
    } else if (state === "error" && !exhausted && request) {
      const a = active;
      // the error event follows the state change; read its message on the next tick
      setTimeout(() => c === core && core.state === "error" && !exhausted && fail(a, lastError || "error"), 0);
    }
  }

  function fail(a: SourceAdapter, reason: string) {
    if (a !== active) return;
    registry.recordFailure(a.id);
    const i = candidates.indexOf(a);
    const next = candidates[i + 1];
    post("sourcefail", { id: a.id, reason: reason.slice(0, 200), time: Math.round(lastTime), next: next?.id ?? null });
    if (!next) {
      exhausted = true;
      if (core.state !== "error") core.reportError({ code: "E_NO_SOURCES", message: t("sourceNone"), recoverable: true });
      return;
    }
    toast(t("sourceSwitch", { name: next.name }));
    void attempt(i + 1, lastTime > 0 ? lastTime : request?.start, "fallback");
  }

  function switchTo(id: string, reason: string): boolean {
    const i = candidates.findIndex((a) => a.id === id);
    if (i < 0) return false;
    if (candidates[i] === active && core.state !== "error") return true;
    exhausted = false;
    const at = !themed && core.time > 0 ? core.time : lastTime;
    void attempt(i, at > 0 ? at : request?.start, reason);
    return true;
  }

  function sourcesInfo() {
    const list = request ? candidates : registry.list();
    return { active: active?.id ?? null, sources: list.map((a) => registry.info(a)) };
  }

  function toast(msg: string) {
    root.querySelector(".t-src-toast")?.remove();
    if (toastTimer) clearTimeout(toastTimer);
    const el = h("div", { class: "t-src-toast", role: "status" }, msg);
    root.appendChild(el);
    toastTimer = setTimeout(() => el.remove(), 3000);
  }

  /* ---------- themed providers: their controls, our Back / Source / Report overlay ---------- */

  function showThemed(a: SourceAdapter, url: string, themedFrame: typeof import("@titan/sources/provider").themedFrame) {
    removeThemed();
    ui?.destroy();
    ui = null;
    core.pause();
    mediaNode().remove();
    let frame: HTMLIFrameElement;
    try {
      frame = themedFrame(a, url, hooks);
    } catch (err) {
      return fail(a, err instanceof Error ? err.message : String(err));
    }
    frame.addEventListener("load", () => {
      if (!started && active === a) {
        started = true;
        registry.recordSuccess(a.id, performance.now() - attemptAt);
      }
    });
    root.className = "titan t-themed";
    root.dataset.player = playerClass;
    applyTheme(root, resolveTheme(themeInput, playerClass));
    const btn = (label: string, ic: Parameters<typeof icon>[0] | null, onClick: () => void, extra: Record<string, string> = {}) => {
      const b = h("button", { type: "button", class: "t-src-btn", ...extra }, ic ? icon(ic) : null, h("span", null, label));
      b.addEventListener("click", onClick);
      return b;
    };
    const exit = () => post("exit", { time: 0 });
    let menu: HTMLElement | null = null;
    const closeMenu = () => {
      menu?.remove();
      menu = null;
      srcBtn?.setAttribute("aria-expanded", "false");
    };
    const srcBtn =
      candidates.length > 1
        ? btn(
            t("source"),
            "settings",
            () => {
              if (menu) return closeMenu();
              menu = h(
                "ul",
                { class: "t-src-menu", role: "menu", "aria-label": t("source") },
                ...candidates.map((c) => {
                  const item = h("button", { type: "button", role: "menuitemradio", "aria-checked": String(c === active) }, c.name);
                  item.addEventListener("click", () => {
                    closeMenu();
                    switchTo(c.id, "user");
                  });
                  return h("li", { role: "none" }, item);
                })
              );
              root.appendChild(menu);
              srcBtn!.setAttribute("aria-expanded", "true");
              menu.querySelector("button")?.focus();
            },
            { "aria-haspopup": "menu", "aria-expanded": "false" }
          )
        : null;
    const bar = h(
      "div",
      { class: "t-src-bar" },
      h("div", { class: "t-src-group" }, params.get("back") === "1" || playerClass === "tv" ? btn(t("back"), "back", exit) : null),
      h(
        "div",
        { class: "t-src-group" },
        srcBtn,
        btn(t("reportIssue"), "alert", () => post("report", { kind: "source", time: 0, state: "provider", source: a.id }))
      )
    );
    const onKey = (e: KeyboardEvent) => {
      if (normalizeKey(e) !== "back") return;
      e.preventDefault();
      if (menu) closeMenu();
      else exit();
    };
    window.addEventListener("keydown", onKey);
    root.append(frame, bar);
    themed = { frame, bar, off: () => window.removeEventListener("keydown", onKey) };
  }

  function removeThemed() {
    if (!themed) return;
    themed.off();
    themed.frame.src = "about:blank";
    themed.frame.remove();
    themed.bar.remove();
    root.querySelector(".t-src-menu")?.remove();
    themed = null;
    root.className = "";
  }

  /* ---------- start ---------- */

  void mount(playerClass).then(() => {
    if (notAllowed) {
      core.reportError({ code: "E_NOT_ALLOWED_HERE", message: t("notAllowed"), recoverable: false });
      exhausted = true;
      return;
    }
    const req = requestFromParams(params);
    if (req) return startSession(req);
    const raw = descriptorFromParams(params);
    if (raw !== undefined) {
      const r = validateDescriptor(raw);
      if (r.ok && r.value) return startSession({ kind: "movie", media: r.value, preferred: "direct" });
      core.reportError({ code: "E_DESCRIPTOR_INVALID", message: r.errors[0] ?? "The media descriptor is not valid.", recoverable: false });
    } else if (!framed || !targets.length) {
      core.reportError({
        code: "E_NO_SOURCES",
        message: "There's nothing to play. Add ?src=https://… or ?tmdb=… or load media with the SDK.",
        recoverable: false
      });
    } else {
      core.idle();
    }
  });

  // re-pick the player when the frame changes class (desktop frames resized across 960×540), unless forced
  if (forced !== "tv" && forced !== "mobile") {
    let rt: ReturnType<typeof setTimeout> | null = null;
    window.addEventListener("resize", () => {
      if (rt) clearTimeout(rt);
      rt = setTimeout(() => {
        const next = detectPlayerClass(null);
        if (next !== playerClass && !destroyed) {
          playerClass = next;
          void mount(next);
        }
      }, 250);
    });
  }

  // host → player commands
  window.addEventListener("message", (e: MessageEvent) => {
    if (destroyed || e.source !== window.parent || !framed) return;
    if (!origins.includes(e.origin)) return;
    if (notAllowed) return;
    const cmd = parseCommand(e.data);
    if (typeof cmd === "string") {
      if (e.data && typeof e.data === "object" && (e.data as { ns?: unknown }).ns === NS)
        reply(e.origin, (e.data as { id?: string }).id, false, undefined, cmd);
      return;
    }
    if (!limiter.take()) return reply(e.origin, cmd.id, false, undefined, "rate limited");
    void run(cmd).then(
      (data) => reply(e.origin, cmd.id, true, data),
      (err: unknown) => reply(e.origin, cmd.id, false, undefined, err instanceof Error ? err.message : String(err))
    );
  });

  function reply(origin: string, id: string | undefined, ok: boolean, data?: unknown, error?: string) {
    if (!id) return;
    try {
      window.parent.postMessage({ ns: NS, v: PROTOCOL_VERSION, type: "response", id, ok, data, error }, origin);
    } catch {
      /* ignore */
    }
  }

  async function run(cmd: CommandMessage): Promise<unknown> {
    const a = cmd.args as never;
    await mounting;
    switch (cmd.cmd) {
      case "load": {
        const args = cmd.args as { media?: unknown; autoplay?: boolean };
        const r = validateDescriptor(args.media);
        if (!r.ok || !r.value) throw new Error(r.errors[0] ?? "invalid media");
        if (themed || isProvider(media)) await useMedia(null);
        request = { kind: "movie", media: r.value as MediaDescriptor, preferred: "direct" };
        candidates = registry.candidates(request);
        active = urlAdapter;
        started = false;
        exhausted = false;
        attemptAt = performance.now();
        await core.load(r.value as MediaDescriptor, { autoplay: args.autoplay !== false });
        return { warnings: r.errors };
      }
      case "loadSource": {
        const req = requestFromArgs(cmd.args as Record<string, unknown>);
        if (!req) throw new Error("loadSource needs a tmdb id (digits) or an imdb id (tt…)");
        await startSession(req);
        return sourcesInfo();
      }
      case "setSource":
        if (!switchTo(cmd.args as string, "host")) throw new Error(`unknown source ${String(cmd.args).slice(0, 40)}`);
        return { active: cmd.args };
      case "getSources":
        return sourcesInfo();
      case "play":
        return core.play();
      case "pause":
        return core.pause();
      case "seek":
        return core.seek(a);
      case "setVolume":
        return core.setVolume(a);
      case "setMuted":
        return core.setMuted(a);
      case "setRate":
        if (!core.canSetRate) throw new Error("this source doesn't support playback speed");
        return core.setRate(a);
      case "setAudioTrack":
        return core.setAudioTrack(a);
      case "setSubtitleTrack":
        return core.setSubtitleTrack(a);
      case "setQuality":
        return core.setQuality(a, false);
      case "setTheme": {
        themeInput = validateTheme(cmd.args);
        const resolved = resolveTheme(themeInput, playerClass);
        applyTheme(root, resolved);
        return { warnings: resolved.warnings };
      }
      case "setMarkers": {
        const m = validateMarkers((cmd.args as { markers?: unknown }).markers);
        core.setMarkers(m);
        return { markers: m };
      }
      case "enterFullscreen":
        return core.enterFullscreen(root);
      case "exitFullscreen":
        return core.exitFullscreen();
      case "enterPip":
        return core.enterPip();
      case "next":
        return core.next(false);
      case "previous":
        return core.previous();
      case "destroy":
        destroyed = true;
        removeThemed();
        ui?.destroy();
        core.destroy();
        if (isProvider(media)) media.destroy();
        root.remove();
        return true;
      case "getState":
        return { state: themed ? "provider" : core.state, playerClass, version: VERSION, source: active?.id ?? null };
      case "getTime":
        return core.time;
      case "getDuration":
        return core.duration;
      case "getTracks":
        return {
          audio: core.audioTracks,
          subtitles: core.subtitleTracks,
          activeAudio: core.audioTrack,
          activeSubtitle: core.subtitleTrack
        };
      case "getQualities":
        return { qualities: core.qualities, active: core.quality };
    }
  }

  return {
    get core() {
      return core;
    },
    registry,
    get playerClass() {
      return playerClass;
    }
  };
}

/** The descriptor Titan's engine plays for a driven provider: the provider URL as the only source. */
function providerDescriptor(req: SourceRequest, url: string, start: number | undefined): MediaDescriptor {
  const id = req.tmdb ? `tmdb-${req.tmdb}` : req.imdb ? `imdb-${req.imdb}` : "provider";
  const ep = req.kind === "tv" ? `-s${req.season}e${req.episode}` : "";
  const label = req.kind === "tv" ? `S${req.season} E${req.episode}` : "";
  const fallbackTitle = req.tmdb ? `TMDB ${req.tmdb}` : `IMDb ${req.imdb}`;
  const d: MediaDescriptor = {
    id: id + ep,
    title: req.title || fallbackTitle,
    sources: [{ url, type: "mp4" }]
  };
  const sub = req.subtitle || label;
  if (sub) d.subtitle = sub;
  if (req.poster) d.poster = req.poster;
  if (req.subtitles?.length) d.subtitles = req.subtitles;
  if (start !== undefined && start > 0) d.start = start;
  return d;
}

/** Validates `loadSource` args by passing them through the same parser as URL parameters. */
function requestFromArgs(args: Record<string, unknown>): SourceRequest | null {
  const p = new URLSearchParams();
  const map: Record<string, string> = {
    tmdb: "tmdb",
    imdb: "imdb",
    type: "type",
    season: "s",
    episode: "e",
    title: "title",
    subtitle: "subtitle",
    poster: "poster",
    source: "source",
    start: "t"
  };
  for (const [k, q] of Object.entries(map)) {
    const v = args[k];
    if (typeof v === "string" || typeof v === "number") p.set(q, String(v));
  }
  if (Array.isArray(args.sources)) p.set("sources", args.sources.filter((s) => typeof s === "string").join(","));
  return requestFromParams(p);
}

function detectParentOrigin(): string | null {
  if (window.parent === window) return null;
  const ao = (location as Location & { ancestorOrigins?: DOMStringList }).ancestorOrigins;
  if (ao && ao.length) return ao[0] ?? null;
  try {
    return document.referrer ? new URL(document.referrer).origin : null;
  } catch {
    return null;
  }
}

function themeFromParams(p: URLSearchParams): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};
  const accent = p.get("accent");
  if (accent) out.accent = accent.startsWith("#") ? accent : `#${accent}`;
  if (p.get("logo")) out.logo = p.get("logo");
  if (p.get("radius")) out.radius = Number(p.get("radius"));
  if (p.get("font")) out.font = p.get("font");
  if (p.get("controlsOpacity")) out.controlsOpacity = Number(p.get("controlsOpacity"));
  return Object.keys(out).length ? out : undefined;
}
