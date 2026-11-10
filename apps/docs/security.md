---
title: Security
---
# Security

- **No third parties.** The embed page loads only its own scripts, styles and fonts. No ads, analytics, trackers or cookies. Viewer preferences and resume points live in the embed origin's `localStorage`.
- **Headers.** Strict Content Security Policy (`script-src 'self'`, no inline scripts, no `eval`), `Permissions-Policy`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff` and HSTS.
- **Framing.** The embed is meant to be framed, so `frame-ancestors` is open by default. On a self-hosted copy, restrict who may frame it by replacing `frame-ancestors *` in the `/embed/` headers of `vercel.json` (or your server's headers), and restrict who may control it with `origins=`.
- **Sandbox.** Works inside `sandbox="allow-scripts allow-same-origin"`. The player never opens windows or navigates the top page.
- **Input.** Media descriptors, themes and markers are validated and capped; only `https:`, `blob:` and same-origin URLs are kept. Subtitles are parsed into text and a few styling tags; they are never inserted as HTML.
- **Messages.** Commands are checked against the origin allowlist and the parent window, validated against the schema and rate-limited.
- **Supply chain.** Pinned dependencies with a lockfile, `npm audit` in CI, a license report, and SDK releases published with npm provenance.

Report a vulnerability through [GitHub private advisories](https://github.com/titan717/titanembed/security/advisories/new).
