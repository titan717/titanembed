---
title: Self-hosting
---
# Self-hosting

```sh
git clone https://github.com/titan717/titanembed
cd titanembed
npm ci
npm run build      # site and embed into dist/, SDK into packages/sdk/dist/
npx vite preview   # http://localhost:4173/embed/?src=…
```

`dist/` is a static site. Serve it with the headers in `vercel.json` (or deploy it to Vercel as is). Point the SDK at your copy with `embedUrl: "https://video.example.com/embed/"`.

To restrict which sites may frame the player, change `frame-ancestors *` in the `/embed/(.*)` header block of `vercel.json` to your origins, for example `frame-ancestors https://example.com https://app.example.com`.

Regenerate the bundled test media with `npm run media` (needs ffmpeg).
