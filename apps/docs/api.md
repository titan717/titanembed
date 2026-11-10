---
title: postMessage API
---

# postMessage API

Every message is an object with `ns: "titan"` and `v: 1`. The machine-readable schema is at [/schema/titan-embed-v1.json](/schema/titan-embed-v1.json).

## Who can talk to the player

- Commands are accepted only from origins listed in `origins=` (exact `https://host[:port]` matches) and only from the parent window. Without `origins`, the player ignores commands.
- Events are posted only to the allowlisted origins, or, without an allowlist, to the embedding page's own origin.
- When `origins` is set and the embedding page is not on the list, the player shows "This video can't be played here" (`E_NOT_ALLOWED_HERE`).
- Commands are rate-limited to 30 per second with bursts of 60.

## Commands

```js
iframe.contentWindow.postMessage({ ns: "titan", v: 1, type: "command", id: "42", cmd: "seek", args: 90 }, "https://titanembed.vercel.app");
```

Responses: `{ ns, v, type: "response", id, ok, data?, error? }`.

| Command                                           | args                                                                                                  | Returns                                                                                               |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `load`                                            | `{ media, autoplay? }`                                                                                | `{ warnings }`                                                                                        |
| `play` / `pause`                                  | —                                                                                                     | —                                                                                                     |
| `seek`                                            | seconds                                                                                               | —                                                                                                     |
| `setVolume`                                       | 0–1                                                                                                   | —                                                                                                     |
| `setMuted`                                        | boolean                                                                                               | —                                                                                                     |
| `setRate`                                         | 0.25–3                                                                                                | —                                                                                                     |
| `setAudioTrack`                                   | track id                                                                                              | —                                                                                                     |
| `setSubtitleTrack`                                | track id or `null`                                                                                    | —                                                                                                     |
| `setQuality`                                      | `"auto"`, `"data-saver"`, `"1080"`, …                                                                 | —                                                                                                     |
| `setTheme`                                        | theme object                                                                                          | `{ warnings }`                                                                                        |
| `setMarkers`                                      | `{ markers }`                                                                                         | `{ markers }`                                                                                         |
| `enterFullscreen` / `exitFullscreen` / `enterPip` | —                                                                                                     | — (need a user gesture in most browsers)                                                              |
| `next` / `previous`                               | —                                                                                                     | —                                                                                                     |
| `destroy`                                         | —                                                                                                     | `true`                                                                                                |
| `getState`                                        | —                                                                                                     | `{ state, playerClass, version }`                                                                     |
| `getTime` / `getDuration`                         | —                                                                                                     | seconds                                                                                               |
| `getTracks`                                       | —                                                                                                     | `{ audio, subtitles, activeAudio, activeSubtitle }`                                                   |
| `getQualities`                                    | —                                                                                                     | `{ qualities, active }`                                                                               |
| `loadSource`                                      | `{ tmdb? \| imdb?, type?, season?, episode?, title?, subtitle?, poster?, start?, source?, sources? }` | `{ active, sources }` — plays a catalogue title through the source registry ([Sources](sources.html)) |
| `setSource`                                       | source id                                                                                             | `{ active }` — switches source, keeping the position                                                  |
| `getSources`                                      | —                                                                                                     | `{ active, sources }` with each source's mode and measured health                                     |

## Events

`{ ns, v, type: "event", event, data }`

| Event                                            | data                                                                                                                          |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `ready`                                          | `{ duration, version, playerClass, protocol }`                                                                                |
| `loadedmetadata`                                 | `{ duration }`                                                                                                                |
| `play`, `pause`, `ended`, `enterpip`, `leavepip` | —                                                                                                                             |
| `seeking`, `seeked`                              | `{ time }`                                                                                                                    |
| `timeupdate`                                     | `{ time, duration }` (up to 4 per second)                                                                                     |
| `progress`                                       | `{ buffered }` (up to 2 per second)                                                                                           |
| `volumechange`                                   | `{ volume, muted }`                                                                                                           |
| `ratechange`                                     | `{ rate }`                                                                                                                    |
| `qualitychange`                                  | `{ id, auto, height? }`                                                                                                       |
| `tracks`                                         | `{ audio, subtitles }`                                                                                                        |
| `markers`                                        | `{ markers }`                                                                                                                 |
| `skip`                                           | `{ type, from, to, auto }`                                                                                                    |
| `nextepisode`                                    | `{ id?, title, auto }` — when the episode has no sources, the host should load it                                             |
| `episode`                                        | `{ id?, title }`                                                                                                              |
| `fullscreenchange`                               | `{ fullscreen }`                                                                                                              |
| `statechange`                                    | `{ state, from }`                                                                                                             |
| `playerclass`                                    | `{ playerClass, forced }`                                                                                                     |
| `exit`                                           | `{ time }` — TV Back with controls hidden, or the mobile back button                                                          |
| `report`                                         | `{ kind, time, state, source }` — the viewer used Report an Issue                                                             |
| `error`                                          | `{ code, message, recoverable }`                                                                                              |
| `sources`                                        | `{ active, sources }` — the candidates for a catalogue title, best first                                                      |
| `sourcechange`                                   | `{ id, name, mode, reason }` — `mode` is `driven` (Titan's UI) or `themed`; `reason` is `start`, `fallback`, `user` or `host` |
| `sourcefail`                                     | `{ id, reason, time, next }` — a source failed or stalled; `next` is the one tried next at `time`                             |

## Error codes

| Code                   | Meaning                                                      |
| ---------------------- | ------------------------------------------------------------ |
| `E_DESCRIPTOR_INVALID` | The media descriptor failed validation.                      |
| `E_NO_SOURCES`         | Nothing to play.                                             |
| `E_SOURCE_UNSUPPORTED` | No source this browser can play.                             |
| `E_NETWORK`            | The media could not be loaded after retries.                 |
| `E_DECODE`             | The media is corrupt or uses an unsupported codec.           |
| `E_HLS_UNAVAILABLE`    | HLS needs Media Source Extensions, which this browser lacks. |
| `E_OFFLINE`            | The device went offline.                                     |
| `E_NOT_ALLOWED_HERE`   | The embedding page is not in `origins`.                      |
| `E_UNKNOWN`            | Anything else.                                               |

## Media descriptor

```ts
interface MediaDescriptor {
  id?: string; // key for resume
  title: string;
  subtitle?: string;
  poster?: string;
  backdrop?: string;
  logo?: string;
  sources: { url: string; type?: "hls" | "mp4" | "webm"; label?: string; height?: number }[];
  subtitles?: { url: string; lang: string; label: string; sdh?: boolean; default?: boolean; format?: "vtt" | "srt" }[];
  audio?: { lang: string; label: string; channels?: string; original?: boolean }[];
  start?: number;
  markers?: { type: "intro" | "recap" | "credits"; start: number; end: number }[];
  rating?: string;
  advisory?: string;
  genres?: string;
  thumbnails?: string; // WebVTT with image URLs and #xywh= sprite fragments
  episodes?: EpisodeInput[];
  next?: EpisodeInput;
  theme?: ThemeInput;
}
```

URLs must be `https:` (or `blob:` / same-origin paths). `javascript:`, `data:` and other schemes are dropped, text is stripped of control characters and capped (titles 300 characters), and lists are capped (12 sources, 40 subtitle tracks, 24 markers, 500 episodes). Text is always inserted as text, never as HTML.
