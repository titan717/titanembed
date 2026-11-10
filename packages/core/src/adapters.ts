import type { MediaDescriptor } from "./types";
import { validateDescriptor, safeUrl } from "./descriptor";

/**
 * Source adapters (ROADMAP v0.7.0). An adapter turns a host request into either a media descriptor Titan plays
 * itself, or an embed instruction for a provider's own documented embed player. Adapters must only use APIs whose
 * terms allow it; they never read pages, reverse-engineer providers or bypass protections.
 */
export interface AdapterRequest {
  /** Adapter-specific identifier, e.g. a URL or a catalogue id. */
  id: string;
  kind?: "movie" | "episode" | "clip";
  season?: number;
  episode?: number;
  start?: number;
}

export interface EmbedInstruction {
  kind: "embed";
  /** https URL of the provider's documented embed player. */
  url: string;
  /** Origin that provider events come from, for event mapping. */
  origin: string;
  title?: string;
}

export interface AdapterCapabilities {
  /** Titan's own controls can drive playback (descriptor results always can). */
  controls: boolean;
  subtitles: boolean;
  qualities: boolean;
  events: boolean;
}

export interface SourceAdapter {
  readonly name: string;
  readonly capabilities: AdapterCapabilities;
  resolve(req: AdapterRequest, signal?: AbortSignal): Promise<{ kind: "media"; media: MediaDescriptor } | EmbedInstruction>;
  /** Cheap reachability check; resolves true when the adapter can currently serve requests. */
  health?(signal?: AbortSignal): Promise<boolean>;
  /** Maps a provider's postMessage event to a Titan event name, or null to ignore it. */
  mapEvent?(data: unknown): { event: string; data?: unknown } | null;
}

/** Reference adapter 1: plain media URLs (HLS, MP4, WebM). */
export const urlAdapter: SourceAdapter = {
  name: "url",
  capabilities: { controls: true, subtitles: true, qualities: true, events: true },
  async resolve(req) {
    const r = validateDescriptor({ title: req.id.split("/").pop() || "Video", sources: [{ url: req.id }], start: req.start });
    if (!r.ok || !r.value) throw new Error(r.errors.join("; "));
    return { kind: "media", media: r.value };
  },
  async health() {
    return true;
  }
};

/**
 * Reference adapter 2: wraps a provider's documented embed URL template, with outbound (provider → Titan) events
 * only. The template and event names come from the provider's public documentation and are supplied by the host;
 * nothing is hard-coded here.
 */
export function documentedEmbedAdapter(cfg: {
  name: string;
  /** e.g. "https://player.example.com/embed/{id}?start={start}" */
  template: string;
  /** Event names in the provider's messages mapped to Titan events. */
  events?: Record<string, string>;
  /** Reads the provider event name out of a message. */
  eventName?: (data: unknown) => string | undefined;
}): SourceAdapter {
  const origin = new URL(cfg.template.replace(/\{[a-z]+\}/g, "x")).origin;
  if (!origin.startsWith("https://")) throw new Error("documentedEmbedAdapter: the template must be an https URL");
  return {
    name: cfg.name,
    capabilities: { controls: false, subtitles: false, qualities: false, events: !!cfg.events },
    async resolve(req) {
      const url = cfg.template
        .replace("{id}", encodeURIComponent(req.id))
        .replace("{season}", String(req.season ?? ""))
        .replace("{episode}", String(req.episode ?? ""))
        .replace("{start}", String(Math.floor(req.start ?? 0)));
      const safe = safeUrl(url);
      if (!safe) throw new Error("documentedEmbedAdapter produced an unsafe URL");
      return { kind: "embed", url: safe, origin };
    },
    mapEvent(data) {
      const name = cfg.eventName?.(data);
      const mapped = name ? cfg.events?.[name] : undefined;
      return mapped ? { event: mapped } : null;
    }
  };
}
