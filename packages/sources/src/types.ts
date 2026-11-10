import type { MediaDescriptor, SubtitleTrackInput } from "@titan/core";

/**
 * What a source can do. The registry filters on these, and the embed page decides how to present a source from them:
 * - `commands` + `events`: Titan drives the provider with its own player UI (the provider iframe is inert).
 * - neither: the provider runs its own controls, themed with Titan's tokens where it accepts them, and Titan's
 *   overlay only handles Back, source switching and reporting.
 */
export type Capability =
  | "media" // Titan plays the stream itself in its own <video>
  | "commands" // play / pause / seek / volume / mute by postMessage
  | "events" // play / pause / time / duration / end events by postMessage
  | "controlsOff" // a documented option hides the provider's own controls
  | "rate" // playback speed by command
  | "subtitles" // host subtitles can be passed to the source
  | "theme" // the provider accepts a colour (accent) parameter
  | "tmdb" // accepts TMDB ids
  | "imdb" // accepts IMDb ids
  | "url" // accepts direct media URLs
  | "tv"; // accepts season / episode

export interface SourceRequest {
  /** TMDB id (digits). */
  tmdb?: string;
  /** IMDb id with the tt prefix. */
  imdb?: string;
  /** Direct media URL (HLS, MP4, WebM). */
  url?: string;
  /** A full media descriptor (direct playback). */
  media?: MediaDescriptor;
  kind: "movie" | "tv";
  season?: number;
  episode?: number;
  title?: string;
  subtitle?: string;
  poster?: string;
  start?: number;
  subtitles?: SubtitleTrackInput[];
  /** Source id to try first. */
  preferred?: string;
  /** Only these source ids, in no particular order. */
  only?: string[];
  /** Capabilities the host requires. */
  need?: Capability[];
  /** Accent colour (#rrggbb) passed to providers that accept one. */
  accent?: string;
}

/**
 * The iframe attributes a provider gets. The default is the strictest profile, `allow-scripts allow-same-origin`
 * (no popups, no top navigation, no modals, no forms). It is loosened only as far as a provider documents it needs.
 * `sandbox: null` means the provider refuses to run in any sandbox; such a provider is only accepted when it supports
 * commands, so its iframe can stay inert (no pointer events, no focus) and never receive a user activation.
 */
export interface SandboxProfile {
  sandbox: string | null;
  /** Permissions delegated through the iframe `allow` attribute. */
  allow: string;
  referrerPolicy: ReferrerPolicy;
  /** Why this profile, with a link to the provider documentation. */
  reason: string;
}

export const STRICT_SANDBOX = "allow-scripts allow-same-origin";
export const DEFAULT_ALLOW = "autoplay; fullscreen; picture-in-picture; encrypted-media";

export interface MediaPlan {
  kind: "media";
  media: MediaDescriptor;
}

export interface ProviderPlan {
  kind: "provider";
  /** https URL of the provider's documented embed page. */
  url: string;
}

export type SourcePlan = MediaPlan | ProviderPlan;

/** Provider → Titan events, normalised by the adapter's driver. */
export type ProviderEvent =
  | { type: "ready" }
  | { type: "play" }
  | { type: "pause" }
  | { type: "time"; time: number }
  | { type: "duration"; duration: number }
  | { type: "seeked"; time: number }
  | { type: "waiting" }
  | { type: "playing" }
  | { type: "volume"; volume?: number; muted?: boolean }
  | { type: "ended" }
  | { type: "error"; message: string };

/** Talks to one provider iframe. Messages reaching `receive` have already passed the origin and source checks. */
export interface ProviderDriver {
  receive(data: unknown): ProviderEvent[] | null;
  play(): void;
  pause(): void;
  seek(time: number): void;
  setVolume(volume: number): void;
  setMuted(muted: boolean): void;
  setRate?(rate: number): void;
}

export interface SourceAdapter {
  /** Stable id used in URLs (`source=`), the SDK and docs/SOURCES.md. */
  readonly id: string;
  readonly name: string;
  readonly kind: "media" | "provider";
  readonly capabilities: readonly Capability[];
  /** Static rank from measured behaviour (lower is better); live health is added on top. */
  readonly rank: number;
  /** Provider documentation the adapter is built from. */
  readonly docs?: string;
  /** Origins the provider iframe and its messages may come from (provider adapters). */
  readonly origins?: readonly string[];
  readonly sandbox?: SandboxProfile;
  /** First-frame timeout in seconds before the registry falls back. Default 25. */
  readonly timeout?: number;
  supports(req: SourceRequest): boolean;
  resolve(req: SourceRequest): SourcePlan;
  /** Provider adapters with `commands` or `events` create a driver for each iframe. */
  driver?(post: (message: unknown) => void): ProviderDriver;
}
