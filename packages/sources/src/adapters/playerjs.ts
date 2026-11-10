import type { ProviderDriver, ProviderEvent } from "../types";

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 && n < 1e7 ? n : null;
};

/**
 * Driver for PlayerJS-style iframe APIs (https://playerjs.com/docs/en=api), wrapped the way EmbedMaster documents
 * it: events arrive as `{ source: <eventSource>, event, info }` and commands go out as
 * `{ source: <commandSource>, command, value }`. Unknown events are ignored.
 */
export function playerJsDriver(
  post: (message: unknown) => void,
  cfg: { eventSource: string; commandSource: string; volumeScale: number; rate?: boolean }
): ProviderDriver {
  const send = (command: string, value?: unknown) => post({ source: cfg.commandSource, command, value });
  return {
    receive(data) {
      if (!data || typeof data !== "object") return null;
      const d = data as { source?: unknown; event?: unknown; info?: unknown };
      if (d.source !== cfg.eventSource || typeof d.event !== "string") return null;
      const info = d.info;
      const out: ProviderEvent[] = [];
      switch (d.event) {
        case "init":
        case "metadata":
          out.push({ type: "ready" });
          break;
        case "start":
        case "play":
        case "userplay":
          out.push({ type: "play" });
          break;
        case "pause":
        case "userpause":
        case "stop":
          out.push({ type: "pause" });
          break;
        case "time": {
          const t = num(info);
          if (t !== null) out.push({ type: "time", time: t });
          break;
        }
        case "duration": {
          const t = num(info);
          if (t !== null && t > 0) out.push({ type: "duration", duration: t });
          break;
        }
        case "seek":
        case "userseek": {
          const t = num(info);
          if (t !== null) out.push({ type: "seeked", time: t });
          break;
        }
        case "buffering":
          out.push({ type: "waiting" });
          break;
        case "buffered":
          out.push({ type: "playing" });
          break;
        case "volume": {
          const v = num(info);
          if (v !== null) out.push({ type: "volume", volume: Math.min(1, v > 1 ? v / 100 : v) });
          break;
        }
        case "mute":
          out.push({ type: "volume", muted: true });
          break;
        case "unmute":
          out.push({ type: "volume", muted: false });
          break;
        case "end":
        case "finish":
          out.push({ type: "ended" });
          break;
        case "loaderror":
        case "error":
          out.push({ type: "error", message: typeof info === "string" ? info.slice(0, 200) : d.event });
          break;
        default:
          return null;
      }
      return out;
    },
    play: () => send("play"),
    pause: () => send("pause"),
    seek: (t) => send("seek", Math.max(0, Math.round(t * 10) / 10)),
    setVolume: (v) => send("volume", Math.round(Math.min(1, Math.max(0, v)) * cfg.volumeScale)),
    setMuted: (m) => send(m ? "mute" : "unmute"),
    ...(cfg.rate ? { setRate: (r: number) => send("speed", r) } : {})
  };
}
