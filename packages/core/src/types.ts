/** Public data types shared by the core, the UIs, the embed page and the SDK. */

export type SourceType = "hls" | "mp4" | "webm";

export interface MediaSource {
  url: string;
  /** Inferred from the URL when omitted (.m3u8 → hls, .webm → webm, otherwise mp4). */
  type?: SourceType;
  /** Shown in the Quality panel for progressive sources, e.g. "1080p". */
  label?: string;
  /** Vertical resolution in pixels for progressive sources. */
  height?: number;
}

export interface SubtitleTrackInput {
  id?: string;
  /** BCP 47 language tag, e.g. "en" or "pt-BR". */
  lang: string;
  label: string;
  url: string;
  /** Captions for the deaf and hard of hearing ([CC] in the panel). */
  sdh?: boolean;
  default?: boolean;
  format?: "vtt" | "srt";
}

export interface AudioTrackInput {
  lang: string;
  label: string;
  /** e.g. "5.1" — shown as a badge next to the label (TV PLAYER blueprint p10). */
  channels?: string;
  original?: boolean;
}

export type MarkerType = "intro" | "recap" | "credits";
export interface Marker {
  type: MarkerType;
  start: number;
  end: number;
}

export interface EpisodeInput {
  id: string;
  title: string;
  subtitle?: string;
  season?: number;
  episode?: number;
  thumbnail?: string;
  duration?: number;
  /** 0..1 watched fraction. */
  progress?: number;
  watched?: boolean;
  genres?: string;
  /** When present the player can start this episode itself; otherwise it emits an event for the host. */
  sources?: MediaSource[];
  subtitles?: SubtitleTrackInput[];
  markers?: Marker[];
}

export interface ThemeInput {
  accent?: string;
  logo?: string;
  radius?: number;
  font?: "inter" | "system" | "serif" | "rounded";
  controlsOpacity?: number;
}

export interface MediaDescriptor {
  id?: string;
  title: string;
  /** e.g. "S1 E3 · Episode title". */
  subtitle?: string;
  poster?: string;
  backdrop?: string;
  logo?: string;
  sources: MediaSource[];
  subtitles?: SubtitleTrackInput[];
  audio?: AudioTrackInput[];
  /** Start position in seconds; overrides the saved resume position. */
  start?: number;
  markers?: Marker[];
  /** Age rating shown in the start-of-playback advisory, e.g. "U/A 16+". */
  rating?: string;
  /** Content descriptors under the rating, e.g. "Violence, Coarse Language". */
  advisory?: string;
  genres?: string;
  /** WebVTT thumbnails track (image URLs with optional #xywh= sprite fragments). */
  thumbnails?: string;
  episodes?: EpisodeInput[];
  next?: EpisodeInput;
  theme?: ThemeInput;
}

export type PlayerState = "idle" | "loading" | "ready" | "playing" | "paused" | "buffering" | "seeking" | "ended" | "error";

export type ErrorCode =
  | "E_DESCRIPTOR_INVALID"
  | "E_NO_SOURCES"
  | "E_SOURCE_UNSUPPORTED"
  | "E_NETWORK"
  | "E_DECODE"
  | "E_HLS_UNAVAILABLE"
  | "E_OFFLINE"
  | "E_NOT_ALLOWED_HERE"
  | "E_UNKNOWN";

export interface PlayerError {
  code: ErrorCode;
  message: string;
  /** True when the player can try again by itself or with Retry. */
  recoverable: boolean;
}

export interface Quality {
  /** "auto", "data-saver", or a tier id such as "2160", "1080", "720", "480". */
  id: string;
  label: string;
  /** Secondary text, e.g. "Up to 1080p". */
  note?: string;
  height?: number;
}

export interface AudioTrack {
  id: string;
  lang: string;
  label: string;
  channels?: string;
  original?: boolean;
}

export interface TextTrack {
  id: string;
  lang: string;
  label: string;
  sdh: boolean;
  origin: "external" | "stream";
}

export interface Cue {
  start: number;
  end: number;
  /** Plain-text lines. Inline styling is carried as spans, never as HTML. */
  lines: CueSpan[][];
}

export interface CueSpan {
  text: string;
  i?: boolean;
  b?: boolean;
  u?: boolean;
}

export interface ThumbnailCue {
  start: number;
  end: number;
  url: string;
  /** Sprite fragment, when the image is a sprite sheet. */
  xywh?: [number, number, number, number];
}

export type PlayerClass = "tv" | "mobile";
