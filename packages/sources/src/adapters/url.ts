import { validateDescriptor, type MediaDescriptor } from "@titan/core";
import type { SourceAdapter } from "../types";

/** Reference adapter: plain media URLs (HLS, MP4, WebM) or a full descriptor, played by Titan's own engine. */
export const urlAdapter: SourceAdapter = {
  id: "direct",
  name: "Direct stream",
  kind: "media",
  capabilities: ["media", "commands", "events", "controlsOff", "rate", "subtitles", "url"],
  rank: 0,
  supports: (req) => !!req.media || !!req.url,
  resolve(req) {
    const raw: Partial<MediaDescriptor> = req.media ?? {
      title: req.title || (req.url ?? "").split("/").pop()?.split("?")[0] || "Video",
      sources: [{ url: req.url! }]
    };
    const r = validateDescriptor({
      ...raw,
      ...(req.subtitle && !raw.subtitle ? { subtitle: req.subtitle } : {}),
      ...(req.poster && !raw.poster ? { poster: req.poster } : {}),
      ...(req.subtitles && !raw.subtitles ? { subtitles: req.subtitles } : {}),
      ...(req.start !== undefined ? { start: req.start } : {})
    });
    if (!r.ok || !r.value) throw new Error(r.errors[0] ?? "invalid media");
    return { kind: "media", media: r.value };
  }
};
