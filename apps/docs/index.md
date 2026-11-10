---
title: Getting started
---
# Getting started

Titan Embed is an embeddable video player with two players behind one URL:

- **Player A — TV.** A 10-foot player for remotes and D-pads (Android TV, Google TV, Fire TV, Samsung Tizen, LG webOS, desktop keyboards).
- **Player B — Mobile.** A touch-first player for phones and tablets, landscape-first with bottom sheets in portrait.

The embed page detects which one to show. You can force either with `player=tv` or `player=mobile`.

## 1. Plain iframe

```html
<iframe
  src="https://titanembed.vercel.app/embed/?src=https%3A%2F%2Ftest-streams.mux.dev%2Fx36xhzz%2Fx36xhzz.m3u8&title=Big%20Buck%20Bunny"
  title="Big Buck Bunny"
  sandbox="allow-scripts allow-same-origin"
  allow="autoplay; fullscreen; picture-in-picture; screen-wake-lock"
  allowfullscreen
  style="width:100%;aspect-ratio:16/9;border:0"
></iframe>
```

A plain iframe plays media and shows every control. To send commands or receive events, add your page's origin with `origins=` or use the SDK, which does it for you.

## 2. SDK

```sh
npm install titan-embed
```

```js
import { createPlayer } from "titan-embed";

const player = createPlayer("#player", {
  media: {
    title: "Tears of Steel",
    sources: [{ url: "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8" }],
    markers: [{ type: "credits", start: 650, end: 734 }]
  },
  theme: { accent: "#e07bd8" }
});

player.on("ended", () => console.log("finished"));
await player.ready;
player.seek(120);
```

Or with a script tag (exposes `window.TitanEmbed`):

```html
<script src="https://titanembed.vercel.app/sdk/titan-embed.min.js" integrity="sha384-…" crossorigin="anonymous"></script>
<script>
  TitanEmbed.createPlayer("#player", { media: { title: "Clip", sources: [{ url: "https://example.com/clip.mp4" }] } });
</script>
```

The SRI hash for each release is in its [GitHub Release notes](https://github.com/titan717/titanembed/releases).

## 3. React

```jsx
import { TitanEmbed } from "titan-embed/react";

<TitanEmbed media={media} player="auto" onEnded={() => next()} />;
```

## URL parameters

| Parameter | Meaning |
| --- | --- |
| `src` | Media URL (https). Repeat for fallbacks. |
| `m` | The full media descriptor as base64url JSON (wins over the short form). |
| `title`, `subtitle`, `poster`, `backdrop`, `logo`, `thumbnails` | Metadata and artwork. |
| `t` | Start position in seconds. |
| `sub` | `url\|lang\|label`, repeatable. WebVTT or SRT. |
| `intro`, `recap`, `credits` | Marker ranges, e.g. `intro=5-62`. |
| `rating`, `advisory` | Age rating and content descriptors for the start-of-playback advisory. |
| `player` | `tv`, `mobile` or `auto` (default). |
| `autoplay` | `0` turns autoplay off (default on, muted if the browser requires it). |
| `resume` | `prompt` (default), `auto` or `off`. |
| `lang` | UI language, e.g. `es`. |
| `accent`, `logo`, `radius`, `font`, `controlsOpacity` | Theme, see [Theming](theming.html). |
| `origins` | Comma-separated origins allowed to send commands and receive events. |
| `back` | `1` shows a back button on the mobile player (emits `exit`). |

Next: [Players](players.html) · [API](api.html) · [SDK](sdk.html) · [Security](security.html)
