---
title: SDK
---
# SDK

```sh
npm install titan-embed
```

## createPlayer(container, options)

`container` is an element or a selector. The player fills it; give it a size, for example `aspect-ratio: 16/9`.

| Option | Type | Default |
| --- | --- | --- |
| `media` | `MediaDescriptor` | — (load later with `load()`) |
| `player` | `"tv" \| "mobile" \| "auto"` | `"auto"` |
| `autoplay` | `boolean` | `true` |
| `theme` | `{ accent, logo, radius, font, controlsOpacity }` | player defaults |
| `lang` | BCP 47 tag | browser language |
| `resume` | `"prompt" \| "auto" \| "off"` | `"prompt"` |
| `back` | `boolean` | `false` |
| `stickyMini` | `boolean` — float a small player while the page scrolls past | `false` |
| `embedUrl` | URL of a self-hosted embed page | `https://titanembed.vercel.app/embed/` |
| `title` | iframe accessible name | `"Video player"` |
| `timeout` | command timeout in ms | `8000` |

The SDK creates `<iframe sandbox="allow-scripts allow-same-origin">`, passes your page's origin as the allowlist and only accepts messages from that iframe and origin.

## Methods

All methods return promises that settle with the player's response.

`load(media, { autoplay })`, `play()`, `pause()`, `seek(seconds)`, `setVolume(0..1)`, `setMuted(bool)`, `setRate(rate)`, `setAudioTrack(id)`, `setSubtitleTrack(id | null)`, `setQuality(id)`, `setTheme(theme)`, `setMarkers(markers)`, `enterFullscreen()`, `exitFullscreen()`, `enterPip()`, `next()`, `previous()`, `getState()`, `getTime()`, `getDuration()`, `getTracks()`, `getQualities()`, `destroy()`.

`player.ready` resolves with the `ready` event. `player.iframe` is the iframe element.

## Events

```js
const off = player.on("timeupdate", ({ time, duration }) => {});
player.on("*", ({ event, data }) => {});
off();
```

Event names and payloads are listed in the [API reference](api.html#events).

## React

```jsx
import { TitanEmbed } from "titan-embed/react";

function Watch({ media }) {
  const ref = useRef(null);
  return <TitanEmbed ref={ref} media={media} onEnded={() => ref.current.next()} />;
}
```

Changing `media` loads it without recreating the iframe; changing `theme` calls `setTheme`. Changing `player` or `embedUrl` creates a new iframe.

## embedSrc(options)

Builds the embed URL for a plain iframe, for server-rendered pages: `embedSrc({ media, player: "tv", origins: ["https://example.com"] })`.
