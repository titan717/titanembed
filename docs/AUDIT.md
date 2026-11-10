# Audit (section 4 inspection)

Inspection date: 2026-11-10. Written before the first feature commit; updated each release.

## titan717/titanembed (starting point)

- One commit (`644bea8 Initial commit`) with an empty README. No code, CI, docs, releases or deployments.
- Public repository, default branch `main`.

## titan717/Panda.fun (read-only reference)

- Vite + React 19 (Preact compat for TV builds), TypeScript, Vitest, Playwright, Android wrapper (`android/`), 50 commits, version 1.2.7.
- The TV player is `src/tv/TvPlayerChrome.tsx` (≈560 lines) + `src/tv/tvplayer.css` (185 lines). It draws Titan-like chrome **over a third-party provider iframe** (`src/pages/Player.tsx`), with an "ad shield" layer so the iframe never receives input. Playback state is inferred, not owned: there is no `<video>` element, so quality, audio tracks, captions and seeking are limited to what each provider exposes.
- Useful, portable parts: remote key normalisation (`src/lib/keys.ts`, `remote.ts`, `remoteInput.ts`), D-pad focus (`@bbc/tv-lrud-spatial`, `focus.ts`, `nav.ts`), device detection (`device.ts`), caption styling (`captions.ts`), the TV design values in `docs/BLUEPRINT_SPEC.md` §20 and the D-101 fixes in §23–24, and the TV state-screen sizes (36 tu title / 24 tu body / 64 tu buttons).
- Not portable: anything tied to provider iframes (shield, scaling hacks, provider event sniffing) — the mission forbids reverse-engineering providers, and Titan owns its `<video>`.
- Findings that need fixing in Panda are listed in `docs/PANDA_NOTES.md` (never pushed there).

## Blueprints (Google Drive)

| #   | File       | Status                                                                                                                                     |
| --- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | TV PLAYER  | Downloaded (public link), rendered page by page. Always wins for Player A.                                                                 |
| 2   | Mobile     | Downloaded. Contains app screens, no player screens → gap G-01.                                                                            |
| 3   | TV part 1  | Downloaded.                                                                                                                                |
| 4   | TV part 2  | Downloaded.                                                                                                                                |
| 5   | Newer      | Downloaded. Identical to #6 (same bytes).                                                                                                  |
| 6   | TV         | Downloaded.                                                                                                                                |
| 7   | Another TV | Requires Google sign-in; not readable through the public link or the Drive connector at inspection time → gap G-02, retried every release. |

Measurements are in `docs/BLUEPRINT_SPEC.md`; differences and missing pieces are in `docs/BLUEPRINT_GAPS.md`.

## Accounts and tooling

- GitHub: `gh` authenticated as titan717. Actions available.
- Vercel: CLI authenticated as titan717; the token currently lacks access to the `titan717s-projects` scope, so production deploys wait for reauthorization (D-024). GitHub Pages is the documented fallback.
- npm: no publish token in this environment. The package is publish-ready (`packages/sdk`, provenance on); publishing runs from the release workflow once an `NPM_TOKEN` secret exists (D-019).
