# Blueprints

Single source of truth for how both players look and behave. Precedence: the TV PLAYER file always wins for Player A; otherwise the newer file wins. Exact values are in `BLUEPRINT_SPEC.md`; anything missing or contradictory is in `BLUEPRINT_GAPS.md`. Drive is re-checked at every release (see the release routine in `docs/skills/release-routine.md`).

| # | Name | Link | Pages | Used for |
| --- | --- | --- | --- | --- |
| 1 | TV PLAYER | [Drive](https://drive.google.com/file/d/1_x1px6GLteBDbEI8PnhK0msPLvuNRB9H/view) | 21 photos of a TV running the reference player | Player A — every screen (authoritative) |
| 2 | Mobile | [Drive](https://drive.google.com/file/d/1DC7jJT8Ig8LczLBM7aUsTkDtKImbioo4/view) | App screens (home, details, lists) | Mobile type scale and colours; no player screens (G-01) |
| 3 | TV part 1 | [Drive](https://drive.google.com/file/d/1593CTtoHc4i3OULqk6lb4-wAUaI6Wd2-/view) | TV app screens | Focus treatment, cards, Watch Next row |
| 4 | TV part 2 | [Drive](https://drive.google.com/file/d/1AzhBs53VXLd5GoYlID8NODi69V3AomRS/view) | TV app screens | Panels, settings lists |
| 5 | Newer | [Drive](https://drive.google.com/file/d/1KaWgZ8C2gyRUTrlZn6QvNr5ENfZmz4uD/view) | Same bytes as #6 | — |
| 6 | TV | [Drive](https://drive.google.com/file/d/1yOYmIgdsiGHJMspd5GjPnkz8RsNMd3Bo/view) | TV app screens | Newer TV values (wins over #3/#4 outside the player) |
| 7 | Another TV | [Drive](https://drive.google.com/file/d/1-6SOesqem5jYlYi1MNVYy2gyHhImC_LS/view) | Not readable (sign-in wall) | G-02 |

## TV PLAYER page map

| Page | Screen | Implemented in |
| --- | --- | --- |
| p1 | Loading / title only, black | `views.ts` loading |
| p2 | Start: "Rated U/A 16+" advisory top left, audio language strip bottom centre | `views.ts` advisory, `ui-tv` `renderLangs` |
| p3–p4 | Controls: title, Quality · Auto, Audio & Subtitles pills, progress, Watch Next | `ui-tv` top/bottom bars |
| p5 | Watch Next row of cards over dimmed video | `ui-tv` watch overlay |
| p6 | Progress with remaining time | `ui-tv` track row |
| p7–p8 | Pill focus states (white border, light fill) | `tv.css` `.tv-pill.is-focus` |
| p9 | Quality panel (≈40 % width, blue gradient, check `#E07BD8`, Report an Issue pinned) | `menus.ts` qualityGroup, `.tv-panel` |
| p10 | Audio & Subtitles panel (≈74 %, two columns + divider, "English [CC]", "5.1" badge) | `.tv-panel.is-audio` |
| p11–p12 | Panel closed, focus returns to the pill | `ui-tv` closePanel |
| p13 | Seek strip with three thumbnails | `.tv-strip` |
| p14–p18 | Hidden controls during playback, controls on wake | auto-hide |
| p19–p20 | Seek strip: side thumbs 512 tu, centre 548 tu with 3 tu white border, HH:MM:SS under each, 10 s apart | `.tv-thumb` |
| p21 | Controls hidden, video only | — |
