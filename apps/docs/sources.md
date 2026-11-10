---
title: Sources
---

# Sources

Besides direct media URLs, the player can play a catalogue title by its TMDB or IMDb id. A source registry picks a
source, falls back automatically when one fails or stalls (keeping the playback position), and lets you choose.

## Embed URL

```html
<iframe
  src="https://titanembed.vercel.app/embed/?tmdb=550&type=movie&title=Fight%20Club"
  allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
  allowfullscreen
></iframe>
```

| Parameter       | Meaning                                            |
| --------------- | -------------------------------------------------- |
| `tmdb` / `imdb` | TMDB id (digits) or IMDb id (`tt…`).               |
| `type`          | `movie` (default) or `tv`.                         |
| `s`, `e`        | Season and episode for `type=tv`.                  |
| `source`        | Source id to try first, for example `embedmaster`. |
| `sources`       | Comma-separated ids: only these sources.           |
| `t`             | Start time in seconds.                             |

Do not put a `sandbox` attribute on the iframe for catalogue titles: some providers refuse to run sandboxed. The
player itself isolates every provider (see below). Direct media embeds still work sandboxed.

## SDK

```js
const player = TitanEmbed.createPlayer("#player", {
  source: { tmdb: "1399", type: "tv", season: 1, episode: 1, title: "Episode 1" },
  preferredSource: "embedmaster"
});
player.on("sourcechange", (e) => console.log("playing from", e.name, e.mode));
player.on("sourcefail", (e) => console.log(e.id, "failed, trying", e.next));
await player.setSource("embedmaster");
const { active, sources } = await player.getSources();
```

`loadSource(spec)` plays another title in the same player. See [SDK](sdk.html) and [API](api.html) for every option,
command and event.

## Available sources

| Id            | Kind           | Mode                  | Notes                                                                                   |
| ------------- | -------------- | --------------------- | --------------------------------------------------------------------------------------- |
| `direct`      | Media URL      | Titan player          | HLS, MP4 and WebM played in Titan's own video element.                                  |
| `embedmaster` | TMDB / IMDb id | Titan player (driven) | [EmbedMaster](https://embedmaster.com/documentation/) documented embed and message API. |

Only sources with public embed documentation are adapted. The Source button in the player settings (TV and mobile)
lists the candidates for the current title.

## Ranking and fallback

Sources are ordered by a static rank plus health measured in the viewer's own browser: failure rate, time to the first
frame, and any blocked attempt to open a window or redirect. The numbers stay in the embed origin's `localStorage`
and are never sent anywhere. A source that errors, freezes for about 15 seconds or shows no first frame in time is
replaced by the next one at the same position.

## Driven and themed

- Driven: when a source accepts commands, Titan's TV or mobile player UI runs on top and the provider frame never
  receives a click, key or focus.
- Themed: a source without commands keeps its own controls, styled with your accent where it allows; Titan adds only
  Back, Source and Report an Issue.

## Isolation

Provider frames are full-bleed under the player overlay with pointer events and focus disabled, every message is
checked against the provider's exact origin, and each provider gets the strictest sandbox it can play in (no popups, top
navigation or dialogs). Automated tests fail the build if a click, tap or key press on the player opens a popup or new
tab, navigates away or reaches the provider frame.
