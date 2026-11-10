# titan-embed

SDK for [Titan Embed](https://github.com/titan717/titanembed), an ad-free embeddable video player with a 10-foot TV player and a touch-first mobile player.

```sh
npm install titan-embed
```

```js
import { createPlayer } from "titan-embed";

const player = createPlayer("#player", {
  media: { title: "Big Buck Bunny", sources: [{ url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" }] },
  player: "auto" // or "tv" / "mobile"
});
player.on("timeupdate", ({ time }) => console.log(time));
await player.ready;
await player.seek(60);
```

React:

```jsx
import { TitanEmbed } from "titan-embed/react";
<TitanEmbed media={media} onEnded={() => {}} />;
```

Script tag: `https://titanembed.vercel.app/sdk/titan-embed.min.js` (global `TitanEmbed`).

Full reference: https://titanembed.vercel.app/docs/sdk.html · MIT
