import {
  NS,
  PROTOCOL_VERSION,
  RateLimiter,
  TitanCore,
  applyTheme,
  descriptorFromParams,
  detectPlayerClass,
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
import { setLanguage, t } from "@titan/ui-common";

declare const __TITAN_VERSION__: string;
export const VERSION = typeof __TITAN_VERSION__ === "string" ? __TITAN_VERSION__ : "0.0.0";

interface Ui {
  destroy(): void;
}

/** Throttled events (per second). Everything else is sent as it happens. */
const THROTTLE: Partial<Record<EventName, number>> = { timeupdate: 4, progress: 2 };

/**
 * The embed page: reads the URL, enforces the origin allowlist, mounts Player A (TV) or Player B (mobile) and
 * runs the postMessage bridge (docs: apps/docs/api.md).
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
  container.appendChild(root);
  const video = document.createElement("video");
  video.className = "t-video";
  video.setAttribute("aria-hidden", "true");
  video.tabIndex = -1;
  root.appendChild(video);

  const resumeParam = params.get("resume");
  const core = new TitanCore(video, {
    loadHls: () => import("hls.js").then((m) => m.default),
    resume: resumeParam === "auto" || resumeParam === "off" ? resumeParam : "prompt"
  });
  const limiter = new RateLimiter(30, 60);
  let ui: Ui | null = null;
  let themeInput: ThemeInput | undefined = validateTheme(themeFromParams(params));
  let destroyed = false;

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

  const mount = async (cls: PlayerClass) => {
    ui?.destroy();
    root.className = "";
    root.appendChild(video);
    const common = {
      onExit: () => post("exit", { time: core.time }),
      onReport: (kind: string) => post("report", { kind, time: Math.round(core.time), state: core.state, source: core.current?.id ?? null })
    };
    if (cls === "tv") {
      const { mountTv } = await import("@titan/ui-tv");
      ui = mountTv(root, core, common);
    } else {
      const { mountMobile } = await import("@titan/ui-mobile");
      ui = mountMobile(root, core, { ...common, showBack: params.get("back") === "1" });
    }
    root.insertBefore(video, root.firstChild);
    applyTheme(root, resolveTheme(themeInput ?? core.current?.theme, cls));
    root.dataset.player = cls;
    post("playerclass", { playerClass: cls, forced: forced === "tv" || forced === "mobile" });
  };

  // core → host events
  const forward: EventName[] = ["loadedmetadata", "play", "pause", "seeking", "seeked", "timeupdate", "progress", "volumechange", "ratechange", "qualitychange", "tracks", "markers", "skip", "nextepisode", "episode", "ended", "enterpip", "leavepip", "fullscreenchange", "error", "statechange"];
  for (const ev of forward) core.on(ev as never, ((data: unknown) => emit(ev, data)) as never);
  core.on("ready", (d) => post("ready", { ...d, version: VERSION, playerClass, protocol: PROTOCOL_VERSION }));
  core.on("load", ({ media }) => {
    if (!themeInput && media.theme) applyTheme(root, resolveTheme(media.theme, playerClass));
  });

  void mount(playerClass).then(() => {
    if (notAllowed) {
      core.reportError({ code: "E_NOT_ALLOWED_HERE", message: t("notAllowed"), recoverable: false });
      return;
    }
    const raw = descriptorFromParams(params);
    if (raw !== undefined) {
      const r = validateDescriptor(raw);
      if (r.ok && r.value) void core.load(r.value, { autoplay: params.get("autoplay") !== "0" });
      else core.reportError({ code: "E_DESCRIPTOR_INVALID", message: r.errors[0] ?? "The media descriptor is not valid.", recoverable: false });
    } else if (!framed || !targets.length) {
      core.reportError({ code: "E_NO_SOURCES", message: "There's nothing to play. Add ?src=https://… or load media with the SDK.", recoverable: false });
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
      if (e.data && typeof e.data === "object" && (e.data as { ns?: unknown }).ns === NS) reply(e.origin, (e.data as { id?: string }).id, false, undefined, cmd);
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
    switch (cmd.cmd) {
      case "load": {
        const args = cmd.args as { media?: unknown; autoplay?: boolean };
        const r = validateDescriptor(args.media);
        if (!r.ok || !r.value) throw new Error(r.errors[0] ?? "invalid media");
        await core.load(r.value as MediaDescriptor, { autoplay: args.autoplay !== false });
        return { warnings: r.errors };
      }
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
        ui?.destroy();
        core.destroy();
        root.remove();
        return true;
      case "getState":
        return { state: core.state, playerClass, version: VERSION };
      case "getTime":
        return core.time;
      case "getDuration":
        return core.duration;
      case "getTracks":
        return { audio: core.audioTracks, subtitles: core.subtitleTracks, activeAudio: core.audioTrack, activeSubtitle: core.subtitleTrack };
      case "getQualities":
        return { qualities: core.qualities, active: core.quality };
    }
  }

  return { core, get playerClass() { return playerClass; } };
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
