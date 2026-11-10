/** UI strings. Every visible string goes through t() so translations and RTL can be added per language. */
const en = {
  player: "Video player",
  play: "Play",
  pause: "Pause",
  back: "Back",
  close: "Close",
  quality: "Quality",
  qualityAuto: "Auto",
  audioSubtitles: "Audio & Subtitles",
  audio: "Audio",
  subtitles: "Subtitles",
  off: "Off",
  original: "Original",
  watchNext: "Watch Next",
  episodes: "Episodes",
  settings: "Settings",
  speed: "Playback speed",
  normal: "Normal",
  sleepTimer: "Sleep timer",
  sleepOff: "Off",
  sleepEpisode: "End of episode",
  sleepMinutes: "{n} minutes",
  sleepSet: "Sleep timer: {v}",
  skipBehaviour: "Skip intro and recap",
  skipAsk: "Show a Skip button",
  skipAuto: "Skip automatically",
  captionStyle: "Caption style",
  captionSize: "Size",
  captionColor: "Colour",
  captionBackground: "Background",
  captionEdge: "Edge",
  sizeS: "Small",
  sizeM: "Medium",
  sizeL: "Large",
  sizeXL: "Extra large",
  colorWhite: "White",
  colorYellow: "Yellow",
  colorCyan: "Cyan",
  colorGreen: "Green",
  bgNone: "None",
  bgDim: "Translucent",
  bgBox: "Solid box",
  edgeShadow: "Shadow",
  edgeOutline: "Outline",
  edgeNone: "None",
  captionPreview: "Captions look like this",
  timing: "Timing",
  earlier: "Earlier",
  later: "Later",
  offsetNone: "In sync",
  offsetValue: "{v} s",
  reportIssue: "Report an Issue",
  reportSent: "Thanks. The issue was sent to the site you're watching on.",
  reportTitle: "What went wrong?",
  reportVideo: "Video doesn't play",
  reportAudio: "Audio problem",
  reportSubs: "Subtitles out of sync or wrong",
  reportQuality: "Poor picture quality",
  skipIntro: "Skip Intro",
  skipRecap: "Skip Recap",
  skipCredits: "Skip Credits",
  nextEpisode: "Next Episode",
  upNext: "Up Next",
  playNow: "Play Now",
  cancel: "Cancel",
  nextIn: "Starts in {n}",
  resumeFrom: "Resume from {t}",
  startOver: "Start over",
  resumeTitle: "Continue watching?",
  retry: "Retry",
  tryAnother: "Try another source",
  errorTitle: "This video can't be played",
  offlineTitle: "You're offline",
  offlineBody: "Playback continues when the connection is back.",
  replay: "Watch again",
  ended: "Finished",
  remaining: "{t} remaining",
  elapsed: "{t} elapsed",
  seekBar: "Seek",
  tapToUnmute: "Tap to unmute",
  pressToUnmute: "Press OK to unmute",
  loading: "Loading",
  buffering: "Buffering",
  lock: "Lock controls",
  unlock: "Unlock",
  locked: "Controls locked",
  pip: "Picture in picture",
  fullscreen: "Full screen",
  exitFullscreen: "Exit full screen",
  rotate: "Rotate",
  fill: "Fill screen",
  fitScreen: "Fit to screen",
  volume: "Volume",
  mute: "Mute",
  unmute: "Unmute",
  brightness: "Brightness",
  season: "Season {n}",
  episodeShort: "E{n}",
  watched: "Watched",
  left: "{t} left",
  noEpisodes: "No other episodes for this title.",
  speed2x: "2× speed",
  forward: "Forward 10 seconds",
  rewind: "Back 10 seconds",
  seconds: "{n} seconds",
  notAllowed: "This player isn't enabled for this website.",
  stillThere: "Paused",
  dataSaver: "Data Saver",
  upTo: "Up to {p}"
};

export type StringKey = keyof typeof en;
const tables: Record<string, Partial<Record<StringKey, string>>> = { en };
let active: Partial<Record<StringKey, string>> = en;
let dir: "ltr" | "rtl" = "ltr";

export function setLanguage(lang: string | null | undefined, extra?: Partial<Record<StringKey, string>>) {
  const base = (lang ?? "en").toLowerCase().split("-")[0]!;
  active = { ...en, ...(tables[base] ?? {}), ...(extra ?? {}) };
  dir = ["ar", "he", "fa", "ur"].includes(base) ? "rtl" : "ltr";
}

export function registerLanguage(lang: string, table: Partial<Record<StringKey, string>>) {
  tables[lang.toLowerCase()] = table;
}

export const textDir = () => dir;

export function t(key: StringKey, vars?: Record<string, string | number>): string {
  let s = active[key] ?? en[key];
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}
