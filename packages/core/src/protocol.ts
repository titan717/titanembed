/**
 * The postMessage protocol (docs: apps/docs/api.md, schema: public/schema/titan-embed-v1.json).
 * Every message is `{ ns: "titan", v: 1, ... }`. Commands carry an `id` so a response can be matched.
 */
export const NS = "titan";
export const PROTOCOL_VERSION = 1;

type ArgSpec = "none" | "number" | "boolean" | "string" | "string|null" | "object";

/** Command name → argument shape and limits. Anything not listed here is ignored. */
export const COMMANDS = {
  load: { args: "object", doc: "Load a new media descriptor. args: { media, autoplay? }" },
  play: { args: "none", doc: "Start or resume playback." },
  pause: { args: "none", doc: "Pause playback." },
  seek: { args: "number", min: 0, max: 86400, doc: "Seek to an absolute time in seconds." },
  setVolume: { args: "number", min: 0, max: 1, doc: "Volume from 0 to 1." },
  setMuted: { args: "boolean", doc: "Mute or unmute." },
  setRate: { args: "number", min: 0.25, max: 3, doc: "Playback rate from 0.25 to 3." },
  setAudioTrack: { args: "string", doc: "Audio track id from getTracks()." },
  setSubtitleTrack: { args: "string|null", doc: "Subtitle track id, or null for Off." },
  setQuality: { args: "string", doc: 'Quality id from getQualities() ("auto", "1080", "data-saver", …).' },
  setTheme: { args: "object", doc: "Theme overrides: { accent, logo, radius, font, controlsOpacity }." },
  setMarkers: { args: "object", doc: "{ markers: [{ type: intro|recap|credits, start, end }] }" },
  enterFullscreen: { args: "none", doc: "Enter fullscreen (needs a user gesture in most browsers)." },
  exitFullscreen: { args: "none", doc: "Leave fullscreen." },
  enterPip: { args: "none", doc: "Enter picture-in-picture (needs a user gesture in most browsers)." },
  next: { args: "none", doc: "Start the next episode." },
  previous: { args: "none", doc: "Restart, or go to the previous episode within the first 5 seconds." },
  destroy: { args: "none", doc: "Stop playback and release every resource." },
  getState: { args: "none", doc: "Returns the playback state." },
  getTime: { args: "none", doc: "Returns the current time in seconds." },
  getDuration: { args: "none", doc: "Returns the duration in seconds." },
  getTracks: { args: "none", doc: "Returns { audio, subtitles, activeAudio, activeSubtitle }." },
  getQualities: { args: "none", doc: "Returns { qualities, active }." }
} as const satisfies Record<string, { args: ArgSpec; min?: number; max?: number; doc: string }>;

export type CommandName = keyof typeof COMMANDS;

export const EVENTS = [
  "ready",
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
  "playerclass",
  "statechange",
  "exit",
  "report"
] as const;
export type EventName = (typeof EVENTS)[number];

export interface CommandMessage {
  ns: typeof NS;
  v: number;
  type: "command";
  id?: string;
  cmd: CommandName;
  args?: unknown;
}
export interface EventMessage {
  ns: typeof NS;
  v: number;
  type: "event";
  event: EventName;
  data?: unknown;
}
export interface ResponseMessage {
  ns: typeof NS;
  v: number;
  type: "response";
  id: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}
export type TitanMessage = CommandMessage | EventMessage | ResponseMessage;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Validates an incoming command. Returns the command or a reason string. */
export function parseCommand(data: unknown): CommandMessage | string {
  if (!isObj(data) || data.ns !== NS) return "not a titan message";
  if (data.v !== PROTOCOL_VERSION) return `unsupported protocol version ${String(data.v)}`;
  if (data.type !== "command") return "not a command";
  const cmd = data.cmd;
  if (typeof cmd !== "string" || !Object.prototype.hasOwnProperty.call(COMMANDS, cmd)) return `unknown command ${String(cmd).slice(0, 40)}`;
  if (data.id !== undefined && (typeof data.id !== "string" || data.id.length > 64)) return "bad id";
  const spec = COMMANDS[cmd as CommandName] as { args: ArgSpec; min?: number; max?: number };
  const a = data.args;
  switch (spec.args) {
    case "none":
      break;
    case "number":
      if (
        typeof a !== "number" ||
        !Number.isFinite(a) ||
        (spec.min !== undefined && a < spec.min) ||
        (spec.max !== undefined && a > spec.max)
      )
        return `${cmd} needs a number between ${spec.min} and ${spec.max}`;
      break;
    case "boolean":
      if (typeof a !== "boolean") return `${cmd} needs true or false`;
      break;
    case "string":
      if (typeof a !== "string" || a.length > 64) return `${cmd} needs a string id`;
      break;
    case "string|null":
      if (a !== null && (typeof a !== "string" || a.length > 64)) return `${cmd} needs a string id or null`;
      break;
    case "object":
      if (!isObj(a)) return `${cmd} needs an object`;
      try {
        if (JSON.stringify(a).length > 256 * 1024) return `${cmd} payload too large`;
      } catch {
        return `${cmd} payload is not serialisable`;
      }
      break;
  }
  const out: CommandMessage = { ns: NS, v: PROTOCOL_VERSION, type: "command", cmd: cmd as CommandName, args: a };
  if (typeof data.id === "string") out.id = data.id;
  return out;
}

export function isEvent(data: unknown): data is EventMessage {
  return isObj(data) && data.ns === NS && data.v === PROTOCOL_VERSION && data.type === "event" && typeof data.event === "string";
}
export function isResponse(data: unknown): data is ResponseMessage {
  return isObj(data) && data.ns === NS && data.v === PROTOCOL_VERSION && data.type === "response" && typeof data.id === "string";
}

/** Parses `origins=https://a.com,https://b.example` into normalised origins. Wildcards are not allowed. */
export function parseOrigins(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const part of raw.split(",").slice(0, 20)) {
    try {
      const u = new URL(part.trim());
      if (
        (u.protocol === "https:" || (u.protocol === "http:" && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname))) &&
        u.origin !== "null"
      )
        out.push(u.origin);
    } catch {
      /* skip */
    }
  }
  return [...new Set(out)];
}

/** Token bucket: `rate` commands per second with bursts up to `burst`. */
export class RateLimiter {
  private tokens: number;
  private last: number;
  constructor(
    private readonly rate = 30,
    private readonly burst = 60,
    private readonly now: () => number = () => Date.now()
  ) {
    this.tokens = burst;
    this.last = now();
  }
  take(): boolean {
    const t = this.now();
    this.tokens = Math.min(this.burst, this.tokens + ((t - this.last) / 1000) * this.rate);
    this.last = t;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

/** A machine-readable description of the protocol, served at /schema/titan-embed-v1.json. */
export function protocolSchema() {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "Titan Embed postMessage protocol",
    version: PROTOCOL_VERSION,
    namespace: NS,
    envelope: { ns: NS, v: PROTOCOL_VERSION, type: ["command", "event", "response"], id: "string ≤ 64 chars (commands and responses)" },
    commands: COMMANDS,
    events: EVENTS
  };
}
